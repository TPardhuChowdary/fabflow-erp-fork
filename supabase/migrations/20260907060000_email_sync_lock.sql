-- Phase 9B Email Operations — per-mailbox lease lock for email_sync_state.
--
-- NOT YET APPLIED — written for review, per explicit instruction not to
-- apply/deploy without approval (same status as every other pending
-- migration in this directory).
--
-- Why this table and not a new one: the Phase 9A audit found email_sync
-- already has everything a lock needs except the lease timestamp itself
-- — one row per mailbox (UNIQUE email_account_id), and a status column
-- that already means 'syncing' while a sync is in flight. What was
-- missing was purely the ability to tell an ACTIVE 'syncing' status
-- apart from a STALE one left behind by a crash — that distinction is
-- exactly what a lease timestamp buys, the same shape as
-- email_monitor_state.locked_until, reused conceptually rather than
-- inventing a second lock idiom.
--
-- CONCURRENCY: a sync claims a mailbox with the same atomic
-- conditional-UPDATE pattern as email-monitor's own lock (see
-- _shared/emailSyncCore.ts's claimSyncLock):
--   update email_sync_state
--   set status='syncing', locked_until=now()+interval '5 minutes'
--   where email_account_id = $1 and (locked_until is null or locked_until < now())
--   returning id;
-- Zero rows back means another sync (a human's "Sync now" click, the
-- automatic scheduler, or a second overlapping scheduler tick) already
-- holds this mailbox right now — the caller skips it this invocation.
-- A crashed sync never explicitly releases the lease, but it expires on
-- its own, so the very next attempt (manual or scheduled) can reclaim
-- and retry — no manual intervention, no cleanup job.
--
-- Nullable, no default: existing rows simply start unlocked (NULL means
-- "no active lease"), identical in effect to email_monitor_state's own
-- locked_until column semantics.
alter table public.email_sync_state add column locked_until timestamptz;

comment on column public.email_sync_state.locked_until is
  'Phase 9B — lease expiry for the per-mailbox sync lock. NULL or in the past means claimable; a future value means another sync (manual or automatic) currently holds this mailbox. Same semantics as email_monitor_state.locked_until.';
