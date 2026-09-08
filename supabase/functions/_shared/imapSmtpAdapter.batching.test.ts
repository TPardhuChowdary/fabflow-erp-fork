// Phase 9G — bounded-batching + genuine-abort regression tests.
//
// Root cause (see the investigation reports): pass 2 of imapListMessages
// used to be all-or-nothing — a real mailbox with many pending messages
// could exceed the 25s outer budget partway through, and everything
// already fetched+parsed was discarded when the outer withHardTimeout
// rejected (itself a pure, non-cancelling race: the real work kept
// running in the background afterward, confirmed live).
//
// These tests exercise the fix directly against a mocked ImapFlow-shaped
// client (no real socket, no real mailbox) via the exported
// imapListMessages/withHardTimeout — the same functions the real adapter
// calls, just with a fake transport standing in for the real one.
//
// Run with:
//   deno test --allow-net --allow-env --node-modules-dir=auto supabase/functions/_shared/imapSmtpAdapter.batching.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { ListMessagesOptions } from "./emailAdapter.ts";
import { imapListMessages, withHardTimeout } from "./imapSmtpAdapter.ts";

interface MockMessage {
  uid: number;
  fetchDelayMs?: number;
}

// A minimal ImapFlow-shaped mock: only the surface imapListMessages
// actually calls (connect, getMailboxLock, fetch, close). Pass-1 fetch
// (envelope/flags/bodyStructure) and pass-2 fetch (source) are
// distinguished by the `source` option, matching the real adapter's own
// two distinct client.fetch() call shapes.
function makeMockClient(messages: MockMessage[]) {
  let closeCalls = 0;
  let closed = false;
  // deno-lint-ignore no-explicit-any
  const client: any = {
    async connect() {},
    async getMailboxLock(_box: string) {
      return { release() {} };
    },
    fetch(criteria: { uid?: string }, fetchOpts: { source?: boolean }) {
      const matching = criteria.uid
        ? messages.filter((m) => String(m.uid) === criteria.uid)
        : messages;
      return {
        [Symbol.asyncIterator]() {
          let i = 0;
          return {
            async next() {
              if (closed || i >= matching.length) {
                return { done: true, value: undefined };
              }
              const m = matching[i++];
              // Delays only apply to the real (source) fetch — matching
              // the real adapter, where pass 1's metadata scan is cheap
              // and fast, and pass 2's full-source fetch is the slow part
              // this whole fix bounds.
              if (fetchOpts.source && m.fetchDelayMs) {
                await new Promise((r) => setTimeout(r, m.fetchDelayMs));
              }
              if (fetchOpts.source) {
                return {
                  done: false,
                  value: {
                    uid: m.uid,
                    source: new TextEncoder().encode(
                      "Content-Type: text/plain\r\n\r\nbody",
                    ),
                  },
                };
              }
              return {
                done: false,
                value: {
                  uid: m.uid,
                  envelope: { from: [{ address: "a@example.com" }] },
                  flags: new Set<string>(),
                  bodyStructure: undefined,
                },
              };
            },
          };
        },
      };
    },
    close() {
      closed = true;
      closeCalls++;
    },
  };
  return { client, getCloseCalls: () => closeCalls };
}

const baseOpts: ListMessagesOptions = { limit: 100 };

// mailparser's dynamic import (see imapSmtpAdapter.ts's own header
// comment) resolves near-instantly once Deno's module cache has it, but
// costs real, sometimes-large wall-clock time on the FIRST resolution in
// a fresh process — large enough to swallow the small test deadlines
// below entirely before any real loop logic runs. Warming the cache once,
// up front, with a generous deadline keeps every timing-sensitive test
// after this one deterministic (measuring only the loop's own behavior,
// not one-time module-resolution cost — the same cache-hit behavior a
// real warm Edge Function isolate already gets in production).
Deno.test("(setup) warm the mailparser dynamic-import cache for the timing-sensitive tests below", async () => {
  const { client } = makeMockClient([{ uid: 1 }]);
  await imapListMessages(client, { ...baseOpts, fetchDeadlineMs: 10_000 });
});

Deno.test("bounded batching: pass 2 stops once the deadline passes, without discarding messages already fetched", async () => {
  // 5 messages, each taking 50ms to fetch — a 120ms deadline should let
  // roughly 2 complete before the loop stops itself.
  const { client } = makeMockClient([
    { uid: 101, fetchDelayMs: 50 },
    { uid: 102, fetchDelayMs: 50 },
    { uid: 103, fetchDelayMs: 50 },
    { uid: 104, fetchDelayMs: 50 },
    { uid: 105, fetchDelayMs: 50 },
  ]);
  const result = await imapListMessages(client, {
    ...baseOpts,
    fetchDeadlineMs: 120,
  });
  assertEquals(result.partial, true);
  assertEquals(result.messages.length < 5, true);
  assertEquals(result.messages.length > 0, true);
  // Every message actually returned really was processed — no gaps, no
  // fabricated entries.
  const returnedUids = result.messages.map((m) => Number(m.providerMessageId));
  assertEquals(
    returnedUids,
    [101, 102, 103, 104, 105].slice(0, returnedUids.length),
  );
});

Deno.test("bounded batching: nextCursor is capped to the last message actually completed, not the highest UID seen", async () => {
  const { client } = makeMockClient([
    { uid: 201, fetchDelayMs: 40 },
    { uid: 202, fetchDelayMs: 40 },
    { uid: 999, fetchDelayMs: 40 }, // pass 1 sees this UID even though pass 2 never reaches it
  ]);
  const result = await imapListMessages(client, {
    ...baseOpts,
    fetchDeadlineMs: 70,
  });
  assertEquals(result.partial, true);
  // Must NOT be "999" (pass 1's highest seen) — that would permanently
  // skip whichever messages pass 2 never got to.
  assertEquals(result.nextCursor === "999", false);
  assertEquals(
    result.messages.some((m) => m.providerMessageId === "999"),
    false,
  );
});

Deno.test("a full batch that finishes within budget is not marked partial, and nextCursor is the true highest UID", async () => {
  const { client } = makeMockClient([{ uid: 301 }, { uid: 302 }, { uid: 303 }]);
  const result = await imapListMessages(client, {
    ...baseOpts,
    fetchDeadlineMs: 5_000,
  });
  assertEquals(result.partial, false);
  assertEquals(result.messages.length, 3);
  assertEquals(result.nextCursor, "303");
});

Deno.test("a retry with the resumed cursor never re-processes already-completed messages (idempotent resume)", async () => {
  const { client: client1 } = makeMockClient([
    { uid: 401, fetchDelayMs: 40 },
    { uid: 402, fetchDelayMs: 40 },
    { uid: 403, fetchDelayMs: 40 },
  ]);
  // Deadline shorter than one message's own delay: the check runs BEFORE
  // each fetch, so message 1 always starts (elapsed ~0 < deadline), but
  // by the time message 2's turn comes elapsed (~40ms) already exceeds
  // this deliberately tiny 20ms deadline — reliably exactly one message.
  const first = await imapListMessages(client1, {
    ...baseOpts,
    fetchDeadlineMs: 20,
  });
  assertEquals(first.partial, true);
  assertEquals(first.messages.length, 1);
  assertEquals(first.messages[0].providerMessageId, "401");

  // The resumed call only asks for UID > first.nextCursor — the mock's
  // own `uid` search criteria filtering isn't exercised here since this
  // mock's fetch(criteria) with no `uid` field returns everything
  // (matching the real adapter's own `since`-vs-`uid` branch), so this
  // test instead proves the CONTRACT: a caller resuming from
  // first.nextCursor would only ever ask for UIDs after it — verified by
  // asserting nextCursor itself is exactly "401", not "402" or "403".
  assertEquals(first.nextCursor, "401");
});

Deno.test("withHardTimeout: genuinely aborts by calling client.close() when the timeout fires", async () => {
  const { client, getCloseCalls } = makeMockClient([{ uid: 1 }]);
  const neverSettles = new Promise(() => {}); // simulates a hung operation
  let threw = false;
  let message = "";
  try {
    await withHardTimeout(
      client,
      new AbortController(),
      neverSettles as Promise<unknown>,
      20,
    );
  } catch (err) {
    threw = true;
    message = err instanceof Error ? err.message : String(err);
  }
  assertEquals(threw, true);
  assertEquals(/timed out/i.test(message), true);
  assertEquals(getCloseCalls(), 1);
});

Deno.test("withHardTimeout: never calls client.close() when the work settles before the timeout (no double-teardown race)", async () => {
  const { client, getCloseCalls } = makeMockClient([{ uid: 1 }]);
  const fastWork = Promise.resolve("done");
  const result = await withHardTimeout(
    client,
    new AbortController(),
    fastWork,
    5_000,
  );
  assertEquals(result, "done");
  assertEquals(getCloseCalls(), 0);
});

Deno.test("withHardTimeout: aborts the shared AbortController when the timeout fires", async () => {
  const { client } = makeMockClient([{ uid: 1 }]);
  const controller = new AbortController();
  const neverSettles = new Promise(() => {});
  try {
    await withHardTimeout(
      client,
      controller,
      neverSettles as Promise<unknown>,
      20,
    );
  } catch {
    // expected
  }
  assertEquals(controller.signal.aborted, true);
});

Deno.test("end-to-end: withHardTimeout wrapping imapListMessages resolves with already-processed messages instead of rejecting and discarding them", async () => {
  // The core fix, tested as a whole: this is what a real listMessages()
  // call actually does — a real imapListMessages() run wrapped by the
  // real withHardTimeout(), where the OUTER timeout fires while messages
  // are still being fetched. A plain race (the original bug) would
  // reject the instant its timer fired, discarding every message already
  // fetched+parsed. The two-tier design (abort now, hard-reject only
  // after a grace period) gives imapListMessages' own graceful,
  // non-throwing partial return a real chance to win that race.
  const { client, getCloseCalls } = makeMockClient([
    { uid: 601, fetchDelayMs: 5 },
    { uid: 602, fetchDelayMs: 5 },
    { uid: 603, fetchDelayMs: 200 }, // still in flight when the outer timeout fires
    { uid: 604, fetchDelayMs: 5 },
  ]);
  const controller = new AbortController();
  const result = await withHardTimeout(
    client,
    controller,
    imapListMessages(client, { limit: 100 }, controller.signal),
    30, // fires while message 603 is mid-fetch
  );
  assertEquals(result.partial, true);
  const returnedUids = result.messages.map((m) => Number(m.providerMessageId));
  assertEquals(returnedUids.includes(601), true);
  assertEquals(returnedUids.includes(602), true);
  assertEquals(returnedUids.includes(603), false);
  assertEquals(returnedUids.includes(604), false);
  // close() is called both by the abort handler and by imapListMessages'
  // own finally-block cleanup (idempotent either way) — the exact count
  // isn't the point here (see the dedicated "genuinely aborts" test
  // above for that); just confirm the connection really was torn down.
  assertEquals(getCloseCalls() >= 1, true);
});

Deno.test("live-discovered bug fix: an abort mid-message stops the loop instead of letting later messages appear to succeed on the dead connection", async () => {
  // Reproduces exactly what was observed live: the outer timeout fires
  // while message N is being fetched/parsed; that message's own
  // try/catch swallows the resulting error (by design, so one bad
  // message never aborts a whole sync) — without the abort-signal check,
  // the loop would carry on to message N+1 and beyond, and (as observed
  // live) those later fetches could appear to "succeed" with empty
  // bodies on the now-closed connection, silently corrupting which
  // messages are considered done.
  const { client } = makeMockClient([
    { uid: 501, fetchDelayMs: 5 },
    { uid: 502, fetchDelayMs: 30 }, // this one is in flight when the abort fires
    { uid: 503, fetchDelayMs: 5 },
    { uid: 504, fetchDelayMs: 5 },
  ]);
  const controller = new AbortController();
  // Abort partway through message 502's own fetch delay — simulating the
  // outer hard timeout firing mid-message, exactly as observed live.
  setTimeout(() => controller.abort(), 20);
  const result = await imapListMessages(
    client,
    { limit: 100 },
    controller.signal,
  );
  assertEquals(result.partial, true);
  const returnedUids = result.messages.map((m) => Number(m.providerMessageId));
  // 502 (in flight during the abort) and everything after it must be
  // absent — not silently marked done on a dead connection.
  assertEquals(returnedUids.includes(502), false);
  assertEquals(returnedUids.includes(503), false);
  assertEquals(returnedUids.includes(504), false);
  assertEquals(result.nextCursor === "502", false);
  assertEquals(result.nextCursor === "503", false);
  assertEquals(result.nextCursor === "504", false);
});

Deno.test("withHardTimeout: a late settlement after timeout is ignored, not double-resolved/rejected", async () => {
  const { client } = makeMockClient([{ uid: 1 }]);
  let resolveLate: (v: string) => void = () => {};
  const lateWork = new Promise<string>((resolve) => {
    resolveLate = resolve;
  });
  let threw = false;
  try {
    await withHardTimeout(client, new AbortController(), lateWork, 10);
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
  // The abandoned work eventually "completes" — this must not throw an
  // unhandled rejection or otherwise crash; it's simply a no-op against
  // an already-settled outer promise.
  resolveLate("too late");
  await new Promise((r) => setTimeout(r, 10));
});
