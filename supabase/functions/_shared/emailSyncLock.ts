// Phase 9B — per-mailbox sync lock + the multi-mailbox scan loop,
// deliberately split out of emailSyncCore.ts into their own file with
// NO adapter imports (googleAdapter.ts/imapSmtpAdapter.ts/etc. pull in
// "npm:" specifiers that only resolve under Deno). That is what makes
// this file importable and testable under a plain Node/tsx runtime (see
// emailSyncLock.test.ts) — the same reason runner.ts was split out of
// email-monitor/index.ts in Phase 8. email-sync-scan/index.ts and
// email-sync/index.ts both import from here.

export const LOCK_LEASE_MS = 5 * 60_000; // same 5-minute lease shape as
// email-monitor's own lock — comfortably longer than one mailbox's own
// SYNC_WALL_CLOCK_BUDGET_MS (25s) plus attachment handling should ever
// take; a crash mid-sync self-heals once this lease expires. Shared by
// both callers (email-sync/index.ts and email-sync-scan/index.ts) so
// there is one definition of "how long a sync lock lasts," not two.

export async function ensureSyncStateRow(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  accountId: string,
  organizationId: string,
): Promise<void> {
  await serviceClient
    .from("email_sync_state")
    .upsert(
      { email_account_id: accountId, organization_id: organizationId },
      { onConflict: "email_account_id", ignoreDuplicates: true },
    );
}

// CONCURRENCY (same pattern as email-monitor's claimMailboxLock) —
// atomic conditional UPDATE on email_sync_state.locked_until. Callers
// must call ensureSyncStateRow first (safe under concurrency via
// ignoreDuplicates) since a never-before-synced mailbox has no row yet.
export async function claimSyncLock(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  accountId: string,
  leaseMs: number,
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const lockedUntil = new Date(Date.now() + leaseMs).toISOString();
  const { data: claimed, error } = await serviceClient
    .from("email_sync_state")
    .update({ status: "syncing", locked_until: lockedUntil })
    .eq("email_account_id", accountId)
    .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!claimed;
}

// Releases the lease without disturbing whatever status syncOneMailbox
// itself already settled on ('idle' or 'failed') — called by the caller
// after syncOneMailbox resolves either way. Kept as a tiny separate
// update rather than folding into syncOneMailbox's own writes so that
// function's existing, carefully-hardened body stays untouched.
export async function releaseSyncLock(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  accountId: string,
): Promise<void> {
  await serviceClient.from("email_sync_state").update({ locked_until: null }).eq("email_account_id", accountId);
}

// Defect fix (Phase 9B Step 5 live validation): syncOneMailbox already
// sets status='failed' for failures inside its OWN body (e.g. a
// listMessages error), but a failure that happens BEFORE syncOneMailbox
// is ever reached — the credential-decrypt step in email-sync-scan's own
// syncOne callback, live-verified to leave this exact gap — previously
// left status stuck at whatever claimSyncLock set it to ('syncing')
// forever, since only locked_until (not status) was ever cleared for
// that path. Marking it here, at scanMailboxes' own outer catch, closes
// the gap for every current and future failure inside syncOne uniformly,
// rather than requiring each one to remember to set it itself. Never
// touches locked_until (releaseSyncLock's own job, unchanged) or
// email_accounts.status (decryptAccountCredentials' own job, unchanged).
async function markSyncStateFailed(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  accountId: string,
  message: string,
): Promise<void> {
  await serviceClient.from("email_sync_state").update({ status: "failed", last_error: message }).eq("email_account_id", accountId);
}

export interface ScanAccount {
  id: string;
  organization_id: string;
}

export interface ScanResultEntry {
  emailAccountId: string;
  status: "success" | "locked" | "failed" | "error";
  newMessages?: number;
  partial?: boolean;
  error?: string;
}

export interface ScanSummary {
  processedMailboxes: number;
  skippedForBudget: number;
  results: ScanResultEntry[];
}

/** The multi-mailbox scan loop itself, parameterized by the actual
 * per-mailbox sync function so this file needs no adapter import (see
 * this file's own header) — email-sync-scan/index.ts supplies the real
 * decrypt-then-syncOneMailbox callback; tests supply a mock. Mirrors
 * email-monitor/index.ts's own mailbox loop shape (ensure row -> claim
 * -> try/catch/isolate -> release), plus the overall wall-clock budget
 * that loop didn't need (email-monitor has no per-account external I/O
 * as expensive as a full provider sync). */
export async function scanMailboxes<A extends ScanAccount>(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  accounts: A[],
  overallBudgetMs: number,
  syncOne: (account: A) => Promise<{ newMessages: number; partial: boolean }>,
): Promise<ScanSummary> {
  const results: ScanResultEntry[] = [];
  const overallDeadline = Date.now() + overallBudgetMs;
  let skippedForBudget = 0;

  for (const account of accounts) {
    if (Date.now() > overallDeadline) {
      // Stop starting new mailboxes — everything remaining is left
      // completely untouched (no lock attempted, no status written) so
      // the next scheduled tick picks them up exactly as if this run
      // had never seen them. Never counted or marked as a failure.
      skippedForBudget++;
      continue;
    }

    await ensureSyncStateRow(serviceClient, account.id, account.organization_id);

    let claimed: boolean;
    try {
      claimed = await claimSyncLock(serviceClient, account.id, LOCK_LEASE_MS);
    } catch (err) {
      results.push({
        emailAccountId: account.id,
        status: "error",
        error: err instanceof Error ? err.message : "Could not claim mailbox lock.",
      });
      continue; // one mailbox's DB error must not block the others
    }
    if (!claimed) {
      results.push({ emailAccountId: account.id, status: "locked" });
      continue;
    }

    try {
      const syncResult = await syncOne(account);
      results.push({
        emailAccountId: account.id,
        status: "success",
        newMessages: syncResult.newMessages,
        partial: syncResult.partial,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed.";
      await markSyncStateFailed(serviceClient, account.id, message);
      results.push({ emailAccountId: account.id, status: "failed", error: message });
    } finally {
      await releaseSyncLock(serviceClient, account.id);
    }
  }

  return { processedMailboxes: results.length, skippedForBudget, results };
}
