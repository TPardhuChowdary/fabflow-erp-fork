// Universal Email Integration (see chat) — the Generic IMAP/SMTP adapter.
// Covers any standards-compliant provider: Hostinger, cPanel mail, Zoho
// (where generic access is permitted), and technically Gmail/Microsoft
// too via an app password, though those two have their own native OAuth
// adapters (googleAdapter.ts/microsoftAdapter.ts) as the preferred path.
//
// Uses ImapFlow, Nodemailer, and mailparser via Deno's native `npm:`
// specifier support (confirmed working — this adapter has been exercised
// against a real Hostinger mailbox, see the Phase 1B deployment report)
// rather than hand-rolling the IMAP/SMTP/MIME wire protocols from scratch —
// these are the standard, battle-tested Node libraries for exactly this
// job; a bespoke IMAP/MIME client here would be strictly worse engineering
// (more code, less tested, more edge cases silently wrong) for zero real
// benefit.

// Phase 9G cold-start fix: these three were static top-level value imports
// (real network/compile work done during isolate BOOT, before Deno.serve
// even starts listening). Live evidence (natural pg_cron ticks vs manual
// invocations — see the Phase 9G investigation report) points at a
// cold-isolate crash during ImapFlow's first real connection, severe
// enough to bypass this file's own try/catch entirely; converting to
// dynamic imports (below, at each actual use site) moves that cost into
// the per-REQUEST budget instead of the isolate's boot budget. Only the
// TYPE is still imported statically — `import type` is fully erased at
// compile time, zero runtime cost, so this changes nothing about typing.
import type { ImapFlow } from "npm:imapflow@1";
import type { ParsedMail } from "npm:mailparser@3";
import type {
  EmailAdapterMessage,
  EmailProviderAdapter,
  EmailProviderCredentials,
  ListMessagesOptions,
  ListMessagesResult,
  SendMessageInput,
} from "./emailAdapter.ts";

export interface ImapSmtpCredentials extends EmailProviderCredentials {
  imapHost: string;
  imapPort: number;
  imapEncryption: "ssl" | "starttls" | "none";
  smtpHost: string;
  smtpPort: number;
  smtpEncryption: "ssl" | "starttls" | "none";
  username: string;
  password: string;
}

function isImapSmtpCreds(
  creds: EmailProviderCredentials,
): creds is ImapSmtpCredentials {
  return (
    typeof creds.imapHost === "string" && typeof creds.password === "string"
  );
}

// Live-verified need (see the Phase 1B deployment report): a stalled read
// on a real IMAP connection — a single slow/large message, a network path
// hiccup — can block `for await` indefinitely, since a deadline counter
// inside the loop only gets a chance to check anything BETWEEN
// already-yielded items. This wraps the whole operation so MY code stops
// waiting after `ms` regardless — now genuinely, not just from this file's
// own point of view.
//
// Phase 9G fix: this used to be a pure race — on timeout, only the
// RETURNED promise rejected; `work` itself (the real IMAP connection,
// in-flight fetch, and pending parse) kept running in the background,
// unbounded, forever. Live evidence confirmed this directly: a
// diagnostic checkpoint from an abandoned attempt was observed landing
// in the database well AFTER this exact timeout had already fired and
// been reported to the caller (see the Phase 9G investigation reports).
// client.close() is ImapFlow's own real, public, SYNCHRONOUS API
// (verified against the installed imapflow@1.7.8 source: it immediately
// rejects the in-flight command via requestTagMap and tears down the
// socket — see lib/imap-flow.js's own close()) — calling it here makes
// this a genuine abort, not just an abandonment.
//
// Known residual risk, disclosed rather than hidden: this reintroduces
// the general SHAPE of a pattern openImapClient's own comment already
// flagged as historically dangerous — an external close() call racing
// with ImapFlow's internal cleanup once caused an uncaught "Already
// logged out" exception from deep inside the library, invisible to any
// try/catch here. That trace pointed specifically at automatic IDLE/
// session-keepalive machinery re-authenticating after logout(), which
// disableAutoIdle (already set in openImapClient) is believed to fully
// prevent — this file's `settled` guard also ensures this close() can
// never fire after `work` has already settled normally, closing the
// other half of the original race. Still: if an uncaught
// "Already logged out"-style exception or isolate crash reappears, this
// is the first place to look.
// Live-verified gap (this pass): calling client.close() alone was not
// enough. imapListMessages's own per-message loop wraps EACH message's
// fetch in a try/catch specifically so one bad message never aborts the
// whole sync — but that same catch also silently swallowed the
// rejection this close() caused, and the loop just moved on to the NEXT
// message on the now-dead connection. Live evidence: checkpoints for
// messages AFTER the one in flight when the timeout fired were still
// recorded, with empty bodies, as if they'd been legitimately processed.
// An explicit AbortSignal — checked at the TOP of every loop iteration,
// not inferred from whatever exception a dead socket happens to produce —
// is what actually stops the loop, regardless of how a closed ImapFlow
// client behaves for a fetch issued after close().
// Live-verified need (this pass, second finding): a plain race that
// rejects the INSTANT the timer fires can never satisfy "already-
// processed messages survive a timeout" on its own — `work`'s own
// graceful, non-throwing partial-result return (see imapListMessages'
// pass2StoppedEarly logic) only happens on ITS next microtask
// continuation, strictly AFTER this timer's synchronous callback has
// already rejected. The two-step design below fixes that ordering: firing
// the timer only ABORTS (signals + closes the socket) rather than
// rejecting outright, giving `work` a brief grace window to notice the
// abort and resolve normally with whatever it already has. Only if
// `work` still hasn't settled after that grace window does this reject —
// a genuine last-resort backstop for an abort that somehow didn't
// actually stop the operation, not the primary signal for the common case.
const ABORT_GRACE_MS = 3_000;

export function withHardTimeout<T>(
  client: ImapFlow,
  controller: AbortController,
  work: Promise<T>,
  ms: number,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let hardKillTimer: ReturnType<typeof setTimeout> | undefined;
    const abortTimer = setTimeout(() => {
      if (settled) return;
      controller.abort();
      try {
        client.close();
      } catch {
        // already closed / never fully opened
      }
      hardKillTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`IMAP operation timed out after ${ms}ms`));
      }, ABORT_GRACE_MS);
    }, ms);
    work.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(abortTimer);
        clearTimeout(hardKillTimer);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(abortTimer);
        clearTimeout(hardKillTimer);
        reject(err);
      },
    );
  });
}

async function openImapClient(creds: ImapSmtpCredentials): Promise<ImapFlow> {
  const { ImapFlow } = await import("npm:imapflow@1");
  return new ImapFlow({
    host: creds.imapHost,
    port: creds.imapPort,
    secure: creds.imapEncryption === "ssl",
    auth: { user: creds.username, pass: creds.password },
    logger: false,
    // Live-verified fix (see the Phase 1B deployment report): bounding a
    // slow operation by externally calling client.close() from OUTSIDE
    // ImapFlow's own control flow (this file's earlier withHardTimeout
    // approach) raced with ImapFlow's own internal cleanup and threw an
    // UNCAUGHT "Already logged out" exception from deep inside the
    // library — invisible to any try/catch or Promise.race in this file,
    // since it isn't a rejection on any promise being awaited here. Using
    // ImapFlow's OWN timeout options instead lets it fail its operations
    // gracefully, as a normal rejected promise this code can actually
    // catch.
    socketTimeout: 20_000,
    greetingTimeout: 15_000,
    // Live-verified fix (see the Phase 1B deployment report): the
    // "Already logged out" crash (authenticate() called from
    // startSession(), unprompted by any call this file makes) recurred
    // even after the socketTimeout fix above — its trace points to
    // ImapFlow's own automatic IDLE/session-keepalive machinery trying to
    // re-authenticate internally sometime after this code has already
    // called logout(). This adapter is polling-based by design
    // (capabilities.push is false — nothing here ever needs IMAP IDLE),
    // so disabling it entirely removes the actual trigger rather than
    // continuing to chase its symptom. Previously only applied when
    // imapEncryption === "none" (conflated with an unrelated STARTTLS
    // concern) — always on now, since IDLE is never wanted here
    // regardless of encryption mode.
    disableAutoIdle: true,
    // Phase 9G diagnostic fix (see the investigation report): the natural
    // pg_cron/pg_net invocation path has been VERIFIED to crash the whole
    // isolate specifically inside ImapFlow's own client.connect() call —
    // Node's real tls.connect()/net.connect(), running through Deno's
    // Node-compat shim, not fetch() (already proven working fine under
    // the identical pg_net path via a separate diagnostic). `tls` here is
    // spread directly into the options object ImapFlow hands to that
    // underlying connect() call (confirmed by reading imapflow@1.7.8's
    // own source), so `family: 4` forces IPv4 resolution — a standard
    // mitigation for dual-stack DNS/IPv6 connect issues in Node-compat
    // socket shims. `as any` because @types/imapflow's own `tls?`
    // declaration is narrower (Node's tls.ConnectionOptions) than what
    // ImapFlow actually forwards to net.connect()/tls.connect() at
    // runtime — `family` is a real, valid option on both, just not
    // reflected in the shipped .d.ts. Hypothesis under live test, not yet
    // confirmed; safe to remove (revert this one field) if it doesn't
    // change the outcome.
    // deno-lint-ignore no-explicit-any
    tls: { family: 4 } as any,
  });
}

// Phase 1 IMAP sync hardening (see the deployment report): a message's
// declared bodyStructure size — the sum of every leaf part's own `size`
// field — is available WITHOUT downloading anything. Used as the gate
// between pass 1 (always safe, metadata-only) and pass 2 (source fetch,
// skipped for anything over MAX_BODY_SOURCE_BYTES).
function estimateBodyStructureBytes(part: {
  size?: number;
  childNodes?: unknown[];
} | undefined): number {
  if (!part) return 0;
  let total = typeof part.size === "number" ? part.size : 0;
  for (const child of (part.childNodes as typeof part[]) ?? []) {
    total += estimateBodyStructureBytes(child);
  }
  return total;
}

const MAX_BODY_SOURCE_BYTES = 5 * 1024 * 1024; // 5MB — see the two-pass
// comment below for why this exists.

interface MessageMetadata {
  uid: number;
  envelope: {
    from?: Array<{ address?: string; name?: string }>;
    to?: Array<{ address?: string }>;
    cc?: Array<{ address?: string }>;
    subject?: string;
    date?: string | Date;
    messageId?: string;
  } | undefined;
  flags: Set<string> | undefined;
  attachments: EmailAdapterMessage["attachments"];
  estimatedBytes: number;
}

// ImapFlow's bodyStructure walk for attachment parts — only parts with a
// real filename (disposition/name) are treated as attachments; inline
// text/html parts are the message body, handled separately via pass 2's
// source fetch below.
function walkAttachments(
  part: {
    dispositionParameters?: Record<string, string>;
    parameters?: Record<string, string>;
    type?: string;
    subtype?: string;
    size?: number;
    part?: string;
    childNodes?: unknown[];
  },
  attachments: EmailAdapterMessage["attachments"],
) {
  const filename =
    part.dispositionParameters?.filename ?? part.parameters?.name;
  if (filename) {
    attachments.push({
      id: part.part ?? filename,
      filename,
      mimeType: part.type && part.subtype
        ? `${part.type}/${part.subtype}`
        : undefined,
      sizeBytes: part.size,
    });
  }
  for (const child of (part.childNodes as typeof part[]) ?? []) {
    walkAttachments(child, attachments);
  }
}

// The actual listMessages implementation — factored out of the adapter
// object so `listMessages()` itself can stay a thin `withHardTimeout(...)`
// wrapper around it (see that method below).
//
// Two-pass fetch (Phase 1 IMAP sync hardening — see the deployment
// report): a real large message pulled through the OLD single-fetch
// `source: true` design crashed the whole Edge Function isolate (memory
// pressure, no catchable error). The fix is to never fetch a message's
// raw MIME source before knowing it's safe to:
//   PASS 1 — one batched, cheap fetch: envelope + flags + uid +
//     bodyStructure for every matched message. bodyStructure alone gives
//     both the attachment list AND a real size estimate (sum of every
//     leaf part's own size field) — zero bytes of actual content
//     downloaded, so this pass is safe regardless of any message's real
//     size.
//   PASS 2 — sequential, one UID at a time, only for messages whose
//     estimated size clears MAX_BODY_SOURCE_BYTES: a second, separate
//     `client.fetch()` call for just that UID's `source`, parsed via
//     mailparser. Kept as a fully separate loop from pass 1 (not
//     interleaved with pass 1's own async iterator) — IMAP does not
//     guarantee a connection can safely handle a second FETCH command
//     issued while an earlier one's response stream is still being
//     consumed.
// A message over the cap, or whose pass-2 fetch itself fails, still gets
// its metadata + attachments recorded — it just keeps bodyText/bodyHtml
// empty, the same graceful-degradation shape already used for a
// mailparser parse failure. This is what satisfies "one oversized message
// must not prevent later messages from syncing."
export async function imapListMessages(
  client: ImapFlow,
  opts: ListMessagesOptions,
  // Checked at the top of every pass-2 loop iteration (see
  // withHardTimeout's own comment) — set once the OUTER hard timeout has
  // already fired and torn the connection down, so the loop stops
  // immediately instead of mistaking a dead-connection fetch for "this
  // one message failed, try the next."
  signal?: AbortSignal,
): Promise<ListMessagesResult> {
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      // cursor (when present) is the last-seen UID — IMAP UIDs are
      // strictly increasing per mailbox, so "UID > cursor" is a correct,
      // cheap incremental-sync filter. Falls back to a SINCE-date scan
      // for the very first sync (no cursor yet).
      const searchCriteria: Record<string, unknown> = opts.cursor
        ? { uid: `${Number(opts.cursor) + 1}:*` }
        : { since: opts.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
      let highestUid = opts.cursor ? Number(opts.cursor) : 0;
      let count = 0;
      // Live-verified need (see the Phase 1B deployment report): a real
      // mailbox's SINCE/UID search can match far more messages than
      // MAX_MESSAGES_PER_SYNC expects, and fetching+MIME-parsing each one
      // is genuinely slow. Without a wall-clock budget here, one sync
      // call can run past the Edge Function platform's own execution
      // limit and get killed mid-loop — no error, no partial write, the
      // browser just sees an opaque network failure and email_sync_state
      // is stuck at "syncing" forever. Breaking out early instead means:
      // whatever was collected up to the deadline is still returned (and
      // written by email-sync/index.ts) with a correctly-advanced cursor,
      // so the next "Sync now" click picks up exactly where this one
      // stopped — graceful partial progress, never a silent hang. (The
      // outer withHardTimeout() below is still the real backstop, since
      // this check only runs BETWEEN already-yielded messages.) Applied
      // to BOTH passes below.
      const deadline = Date.now() + (opts.fetchDeadlineMs ?? 20_000);

      // PASS 1 — cheap, batched, metadata-only. No `source` requested.
      const metadata: MessageMetadata[] = [];
      for await (const msg of client.fetch(searchCriteria, {
        envelope: true,
        flags: true,
        uid: true,
        bodyStructure: true,
      })) {
        if (opts.limit && count >= opts.limit) break;
        if (Date.now() > deadline) break;
        count++;
        highestUid = Math.max(highestUid, msg.uid);
        const attachments: EmailAdapterMessage["attachments"] = [];
        if (msg.bodyStructure) {
          walkAttachments(
            msg.bodyStructure as unknown as Parameters<typeof walkAttachments>[0],
            attachments,
          );
        }
        metadata.push({
          uid: msg.uid,
          envelope: msg.envelope,
          flags: msg.flags,
          attachments,
          estimatedBytes: estimateBodyStructureBytes(
            msg.bodyStructure as unknown as Parameters<typeof estimateBodyStructureBytes>[0],
          ),
        });
      }

      // PASS 2 — sequential, one UID at a time, gated by size. Body text
      // extracted via mailparser — a real MIME parser rather than a
      // hand-rolled multipart scanner, for the same "don't hand-roll what
      // a battle-tested library already solves" reasoning as
      // ImapFlow/Nodemailer themselves. Imported dynamically (once, here)
      // rather than at module top-level — see this file's header comment
      // on the Phase 9G cold-start fix; a repeat dynamic import of the
      // same specifier resolves from Deno's module cache, so hoisting it
      // outside the loop below just avoids redundant per-message calls.
      // Explicit cast (rather than letting the dynamic import() expression's
      // type infer on its own) — mailparser's simpleParser is overloaded
      // (callback vs Promise-returning); TS resolves that overload set
      // correctly through a static `import {...}` but collapses it to an
      // unusable intersection type when resolved through a dynamic
      // import()'s module namespace. Asserting the exact 1-argument,
      // Promise-returning overload this file always calls sidesteps that
      // resolution difference entirely, using the real (type-only,
      // zero-runtime-cost) ParsedMail type rather than a hand-rolled shape.
      const { simpleParser } = (await import("npm:mailparser@3")) as unknown as {
        simpleParser: (source: Uint8Array) => Promise<ParsedMail>;
      };
      const messages: EmailAdapterMessage[] = [];
      // Phase 9G fix: this deadline check used to only gate whether to
      // ATTEMPT a message's body fetch — once the deadline passed, every
      // REMAINING message in `metadata` was still pushed to `messages`
      // (with an empty body) and still counted toward `nextCursor` (via
      // pass 1's own `highestUid`, computed independently of pass 2's
      // real progress). That meant a message whose body fetch was
      // skipped for running out of time had its body PERMANENTLY
      // skipped — the cursor would already be past it, so it could never
      // be re-fetched on a later sync. Live evidence (see the Phase 9G
      // investigation reports) also showed 7 real messages fully
      // fetched+parsed in one attempt before the OUTER 25s timeout fired
      // — proving the work itself isn't stuck, there just isn't a
      // reliable enough per-batch bound here to stay under that outer
      // budget for a mailbox with many pending messages.
      //
      // Now: the loop actually STOPS once the deadline passes (mirroring
      // pass 1's own `break`, and the exact "stop, don't discard, don't
      // skip" invariant emailSyncCore.ts's own write-loop already
      // enforces one layer up), `nextCursor` is capped to the last
      // message this pass genuinely finished (not pass 1's independent
      // `highestUid`), and `partial: true` tells the caller more remains
      // — so the NEXT natural tick continues exactly where this one
      // stopped, in a new, equally time-boxed attempt, rather than this
      // one either silently losing message bodies or risking the outer
      // hard-timeout/abort path at all under normal conditions.
      let pass2StoppedEarly = false;
      let lastCompletedUid = 0;
      for (const rec of metadata) {
        if (Date.now() > deadline || signal?.aborted) {
          pass2StoppedEarly = true;
          break;
        }
        let bodyText: string | undefined;
        let bodyHtml: string | undefined;
        if (rec.estimatedBytes <= MAX_BODY_SOURCE_BYTES) {
          try {
            for await (const full of client.fetch(
              { uid: String(rec.uid) },
              { source: true },
            )) {
              if (full.source) {
                try {
                  const parsed = await simpleParser(full.source as Uint8Array);
                  bodyText = parsed.text || undefined;
                  bodyHtml =
                    typeof parsed.html === "string" ? parsed.html : undefined;
                } catch {
                  // unparseable body — metadata/attachments still recorded
                }
              }
            }
          } catch {
            // this one message's source fetch failed/timed out — leave
            // its body empty and continue; never aborts the whole sync
          }
        }

        // Live-verified need (this pass): the abort could have landed
        // WHILE this exact message's fetch/parse was in flight — its own
        // try/catch above already swallowed whatever error that caused
        // (by design, so one bad message never aborts a sync), so the
        // top-of-loop check alone would let this message through with an
        // uncertain, possibly-truncated body and incorrectly advance the
        // cursor past it. Checking again here, immediately after that
        // attempt, means an aborted-mid-message is treated the same as
        // never having been attempted — never counted as done, so a
        // retry correctly re-fetches it in full rather than leaving it
        // permanently bodyless.
        if (signal?.aborted) {
          pass2StoppedEarly = true;
          break;
        }

        const envelope = rec.envelope;
        messages.push({
          providerMessageId: String(rec.uid),
          providerThreadId: undefined, // see capabilities.threads note
          // Phase 5 Email Operations — ENVELOPE's messageId is the real
          // RFC822 Message-ID header, a standard part of the IMAP
          // ENVELOPE structure already fetched above at no extra
          // round-trip cost. Distinct from providerMessageId (the UID,
          // used for sync cursor/dedup, never valid as an In-Reply-To
          // value for other mail clients).
          internetMessageId: envelope?.messageId ?? undefined,
          fromAddress: envelope?.from?.[0]?.address ?? "unknown@unknown",
          fromName: envelope?.from?.[0]?.name ?? undefined,
          toAddresses: (envelope?.to ?? [])
            .map((a: { address?: string }) => a.address)
            .filter((a): a is string => Boolean(a)),
          ccAddresses: (envelope?.cc ?? [])
            .map((a: { address?: string }) => a.address)
            .filter((a): a is string => Boolean(a)),
          subject: envelope?.subject ?? undefined,
          bodyText,
          bodyHtml,
          sentAt: envelope?.date ? new Date(envelope.date).toISOString() : undefined,
          isRead: (rec.flags ?? new Set()).has("\\Seen"),
          folder: "inbox",
          attachments: rec.attachments,
        });
        lastCompletedUid = rec.uid;
      }

      return {
        messages,
        nextCursor: pass2StoppedEarly
          ? lastCompletedUid > 0
            ? String(lastCompletedUid)
            : (opts.cursor ?? null)
          : highestUid > 0
            ? String(highestUid)
            : (opts.cursor ?? null),
        partial: pass2StoppedEarly,
      };
    } finally {
      lock.release();
    }
  } finally {
    try {
      // Phase 1 lifecycle fix — see testConnection's identical comment
      // above for the full reasoning (logout()'s response round-trip is
      // the window for the "Already logged out" crash; close() skips it).
      await client.close();
    } catch {
      // connection already gone
    }
  }
}

// A handful of common business-document MIME types — anything else is
// still stored (see database/phase-50: processing_status supports
// 'skipped_unsupported_type' for a future stricter policy, but this pass
// stores whatever the mailbox actually contains rather than silently
// dropping a real attachment the user would expect to see).
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25MB — matches every major
// provider's own outbound limit; nothing legitimate exceeds this.

export const imapSmtpAdapter: EmailProviderAdapter = {
  capabilities: {
    oauth: false,
    push: false,
    imap: true,
    smtp: true,
    labels: false,
    threads: false, // generic IMAP has no native thread concept; a later
    // pass can approximate threading from References/In-Reply-To headers
    // if needed — never fabricated here.
  },

  async testConnection(creds) {
    if (!isImapSmtpCreds(creds)) {
      return { ok: false, error: "Missing IMAP connection details." };
    }
    const client = await openImapClient(creds);
    try {
      await client.connect();
      await client.mailboxOpen("INBOX");
      return { ok: true };
    } catch (err) {
      // Diagnostic fix: ImapFlow throws the same generic "Command failed"
      // Error.message for every tagged NO/BAD IMAP response regardless of
      // the real reason, but separately attaches the server's own actual
      // response text (RFC 3501 tagged-response TEXT — standard protocol
      // text, never the submitted credentials) to err.responseText.
      // Preferring it here is what turns a useless "Command failed" into
      // the provider's real reason (e.g. "IMAP access is disabled").
      return {
        ok: false,
        error: err instanceof Error ? ((err as { responseText?: string }).responseText || err.message) : "IMAP connection failed.",
      };
    } finally {
      try {
        // Phase 1 lifecycle fix (see the investigation report): logout()
        // waits for the server's own LOGOUT response round-trip — the
        // exact window in which a stray/late response can hit ImapFlow's
        // unguarded initialOK() handler and re-enter startSession() on an
        // already-closed client, throwing "Already logged out" as an
        // uncaught exception outside anything this file can catch.
        // close() tears the connection down immediately without waiting
        // for that round-trip, removing the window entirely. Documented
        // public API (imapflow.com), not an internal — see
        // github.com/postalsys/imapflow/issues/28 for the same
        // logout()-vs-close() lesson independently reached by another
        // user hitting a related logout-time race.
        await client.close();
      } catch {
        // already closed / never fully opened — nothing to clean up
      }
    }
  },

  async listMessages(creds, opts: ListMessagesOptions): Promise<ListMessagesResult> {
    if (!isImapSmtpCreds(creds)) {
      throw new Error("Missing IMAP connection details.");
    }
    const client = await openImapClient(creds);
    const controller = new AbortController();
    return withHardTimeout(
      client,
      controller,
      imapListMessages(client, opts, controller.signal),
      25_000,
    );
  },

  async getAttachment(creds, providerMessageId, attachmentId) {
    if (!isImapSmtpCreds(creds)) {
      throw new Error("Missing IMAP connection details.");
    }
    const client = await openImapClient(creds);
    const doDownload = async (): Promise<Uint8Array> => {
      try {
        await client.connect();
        const lock = await client.getMailboxLock("INBOX");
        try {
          const uid = Number(providerMessageId);
          const download = await client.download(uid, attachmentId, { uid: true });
          const chunks: Uint8Array[] = [];
          let total = 0;
          for await (const chunk of download.content) {
            total += chunk.length;
            if (total > MAX_ATTACHMENT_BYTES) {
              throw new Error(
                `Attachment exceeds the ${MAX_ATTACHMENT_BYTES / (1024 * 1024)}MB limit.`,
              );
            }
            chunks.push(chunk);
          }
          const combined = new Uint8Array(total);
          let offset = 0;
          for (const chunk of chunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
          }
          return combined;
        } finally {
          lock.release();
        }
      } finally {
        try {
          // Phase 1 lifecycle fix — see testConnection's identical comment
          // for the full reasoning.
          await client.close();
        } catch {
          // connection already gone
        }
      }
    };
    return withHardTimeout(client, new AbortController(), doDownload(), 25_000);
  },

  async sendMessage(creds, message: SendMessageInput) {
    if (!isImapSmtpCreds(creds)) {
      throw new Error("Missing SMTP connection details.");
    }
    const { default: nodemailer } = await import("npm:nodemailer@6");
    const transporter = nodemailer.createTransport({
      host: creds.smtpHost,
      port: creds.smtpPort,
      secure: creds.smtpEncryption === "ssl",
      auth: { user: creds.username, pass: creds.password },
    });
    const info = await transporter.sendMail({
      from: creds.username, // always the connected account's own
      // credentials — never anything caller-supplied, so From can never
      // be spoofed to a different address than the mailbox actually
      // authenticated as (Phase 5 multi-mailbox rule).
      to: message.to.join(", "),
      cc: message.cc?.join(", "),
      subject: message.subject,
      text: message.bodyText,
      html: message.bodyHtml,
      inReplyTo: message.inReplyToInternetMessageId,
      references: message.references?.join(" "),
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        contentType: a.mimeType,
        content: a.content,
      })),
    });
    return { providerMessageId: info.messageId };
  },
};
