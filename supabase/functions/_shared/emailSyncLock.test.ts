// Phase 9B — runnable check for emailSyncLock.ts (ponytail: non-trivial
// orchestration/branching logic gets one runnable check). Run with:
//   deno test supabase/functions/_shared/emailSyncLock.test.ts
// (Deno was not available in the environment this was written in — see
// the Phase 9B report's TESTING section for how this exact logic was
// instead exercised via a Node/tsx script importing this same source.)

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { claimSyncLock, ensureSyncStateRow, releaseSyncLock, scanMailboxes } from "./emailSyncLock.ts";

// deno-lint-ignore no-explicit-any
function makeMockDb() {
  // deno-lint-ignore no-explicit-any
  const table = new Map<string, any>();
  const client = {
    from(tableName: string) {
      if (tableName !== "email_sync_state") throw new Error(`unexpected table ${tableName}`);
      // deno-lint-ignore no-explicit-any
      const filters: Array<[string, any]> = [];
      // deno-lint-ignore no-explicit-any
      let updateValues: any = null;
      let hasOrGuard = false;
      let settled = false;
      const applyPlainUpdate = () => {
        const accountId = filters.find((f) => f[0] === "email_account_id")?.[1];
        const existing = table.get(accountId) ?? { locked_until: null, status: "idle" };
        table.set(accountId, { ...existing, ...updateValues });
        return { data: null, error: null };
      };
      const builder = {
        select() { return builder; },
        // deno-lint-ignore no-explicit-any
        eq(col: string, val: any) { filters.push([col, val]); return builder; },
        or(_expr: string) { hasOrGuard = true; return builder; },
        // deno-lint-ignore no-explicit-any
        update(values: any) { updateValues = values; return builder; },
        // deno-lint-ignore no-explicit-any
        upsert(row: any, opts?: { ignoreDuplicates?: boolean }) {
          const id = row.email_account_id;
          if (opts?.ignoreDuplicates && table.has(id)) return Promise.resolve({ data: null, error: null });
          if (!table.has(id)) table.set(id, { locked_until: null, status: "idle" });
          return Promise.resolve({ data: null, error: null });
        },
        maybeSingle() {
          settled = true;
          const accountId = filters.find((f) => f[0] === "email_account_id")?.[1];
          const existing = table.get(accountId) ?? { locked_until: null, status: "idle" };
          if (!updateValues) return Promise.resolve({ data: existing, error: null });
          if (hasOrGuard) {
            const nowIso = new Date().toISOString();
            const lockFree = existing.locked_until === null || existing.locked_until < nowIso;
            if (!lockFree) return Promise.resolve({ data: null, error: null });
          }
          table.set(accountId, { ...existing, ...updateValues });
          return Promise.resolve({ data: { id: accountId }, error: null });
        },
        // deno-lint-ignore no-explicit-any
        then(resolve: (v: any) => void) {
          if (!settled && updateValues) {
            settled = true;
            resolve(applyPlainUpdate());
          } else {
            resolve({ data: null, error: null });
          }
        },
      };
      return builder;
    },
  };
  return { client, table };
}

Deno.test("lock acquisition succeeds for a fresh mailbox", async () => {
  const { client } = makeMockDb();
  await ensureSyncStateRow(client, "acct-1", "org-1");
  assertEquals(await claimSyncLock(client, "acct-1", 5 * 60_000), true);
});

Deno.test("exactly one of two concurrent claims for the same mailbox succeeds", async () => {
  const { client } = makeMockDb();
  await ensureSyncStateRow(client, "acct-2", "org-1");
  const [a, b] = await Promise.all([
    claimSyncLock(client, "acct-2", 5 * 60_000),
    claimSyncLock(client, "acct-2", 5 * 60_000),
  ]);
  assertNotEquals(a, b);
});

Deno.test("a stale (crashed) lock is reclaimable after its lease expires", async () => {
  const { client, table } = makeMockDb();
  await ensureSyncStateRow(client, "acct-3", "org-1");
  await claimSyncLock(client, "acct-3", 5 * 60_000);
  const row = table.get("acct-3");
  table.set("acct-3", { ...row, locked_until: new Date(Date.now() - 1000).toISOString() });
  assertEquals(await claimSyncLock(client, "acct-3", 5 * 60_000), true);
});

Deno.test("lock is released and immediately reclaimable after release", async () => {
  const { client, table } = makeMockDb();
  await ensureSyncStateRow(client, "acct-4", "org-1");
  await claimSyncLock(client, "acct-4", 5 * 60_000);
  await releaseSyncLock(client, "acct-4");
  assertEquals(table.get("acct-4").locked_until, null);
  assertEquals(await claimSyncLock(client, "acct-4", 5 * 60_000), true);
});

Deno.test("a failed sync releases its lock and is reported as failed", async () => {
  const { client, table } = makeMockDb();
  const accounts = [{ id: "acct-5", organization_id: "org-1" }];
  const summary = await scanMailboxes(client, accounts, 60_000, () => {
    throw new Error("simulated sync failure");
  });
  assertEquals(summary.results[0].status, "failed");
  assertEquals(table.get("acct-5").locked_until, null);
  // Regression check for the live-discovered defect: status must never
  // be left stuck at 'syncing' after a failure.
  assertEquals(table.get("acct-5").status, "failed");
});

Deno.test("a failure BEFORE syncOneMailbox is reached (decrypt-style) still clears status, not just the lock", async () => {
  // Live-discovered defect (Phase 9B Step 5): email-sync-scan's own
  // decrypt-then-sync callback can throw before syncOneMailbox is ever
  // called, meaning no email_sync_state write happens inside the
  // callback at all — this used to leave status stuck at 'syncing'
  // forever, since only locked_until (not status) was ever cleared for
  // that path. This test reproduces exactly that shape.
  const { client, table } = makeMockDb();
  const accounts = [{ id: "acct-5e", organization_id: "org-1" }];
  const summary = await scanMailboxes(client, accounts, 60_000, () => {
    throw new Error("Could not decrypt stored credentials.");
  });
  assertEquals(summary.results[0].status, "failed");
  assertEquals(table.get("acct-5e").locked_until, null);
  assertNotEquals(table.get("acct-5e").status, "syncing");
  assertEquals(table.get("acct-5e").status, "failed");
});

Deno.test("a mailbox marked 'failed' by the fix remains retryable and can succeed", async () => {
  const { client, table } = makeMockDb();
  const accounts = [{ id: "acct-5i", organization_id: "org-1" }];
  await scanMailboxes(client, accounts, 60_000, () => {
    throw new Error("Could not decrypt stored credentials.");
  });
  const retrySummary = await scanMailboxes(client, accounts, 60_000, () => Promise.resolve({ newMessages: 2, partial: false }));
  assertEquals(retrySummary.results[0].status, "success");
  assertEquals(table.get("acct-5i").locked_until, null);
});

Deno.test("one broken mailbox does not prevent the others from succeeding", async () => {
  const { client } = makeMockDb();
  const accounts = [
    { id: "acct-6a", organization_id: "org-1" },
    { id: "acct-6b", organization_id: "org-1" },
    { id: "acct-6c", organization_id: "org-1" },
  ];
  const summary = await scanMailboxes(client, accounts, 60_000, (account) => {
    if (account.id === "acct-6b") throw new Error("this one is broken");
    return Promise.resolve({ newMessages: 1, partial: false });
  });
  const byId = Object.fromEntries(summary.results.map((r) => [r.emailAccountId, r.status]));
  assertEquals(byId["acct-6a"], "success");
  assertEquals(byId["acct-6b"], "failed");
  assertEquals(byId["acct-6c"], "success");
});

Deno.test("mailboxes beyond the overall budget are skipped, not marked failed", async () => {
  const { client } = makeMockDb();
  const accounts = [
    { id: "acct-7a", organization_id: "org-1" },
    { id: "acct-7b", organization_id: "org-1" },
    { id: "acct-7c", organization_id: "org-1" },
  ];
  const summary = await scanMailboxes(client, accounts, 40, async () => {
    await new Promise((r) => setTimeout(r, 50));
    return { newMessages: 1, partial: false };
  });
  assertEquals(
    summary.results.every((r) => r.status !== "failed"),
    true,
  );
  assertEquals(summary.skippedForBudget >= 1, true);
});
