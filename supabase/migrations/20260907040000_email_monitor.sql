-- Phase 8 Email Operations — automatic email monitoring: durable
-- run-state/lock + "considered, no alert needed" tracking.
--
-- NOT YET APPLIED — written for review, per explicit instruction not to
-- apply/deploy without approval (same status as every other pending
-- Phase 5-7 migration in this directory).
--
-- Why two new tables and not more: Phase 8's own audit (see the Phase 8A
-- report) found exactly one real gap in Phase 7's design — a message
-- correctly analyzed as "no alert needed" has no durable record anywhere,
-- so an unattended recurring scan would re-analyze it forever. That gap
-- needs one small table (email_monitor_considered). Concurrency (8E) and
-- run observability (8I) are two views of the SAME concern — "is a scan
-- of this mailbox running right now, and what happened last time" — so
-- they share one table (email_monitor_state), reusing email_sync_state's
-- own proven shape (one row per mailbox, a status column, timestamps,
-- consecutive_failures) rather than inventing a new idiom.
--
-- Both tables follow email_sync_state's own precedent exactly: written
-- ONLY by the email-monitor Edge Function via the service-role client
-- (which has no auth.uid()/current_organization_id() to default from —
-- every insert/update supplies organization_id explicitly), read-only to
-- authenticated users via RLS. See email-monitor/index.ts for the actual
-- writer.

-- ── email_monitor_state ──────────────────────────────────────────────
-- One row per mailbox (UNIQUE email_account_id, same as email_sync_state).
-- Doubles as:
--   (a) the concurrency lock (8E) — locked_until is a lease: a run may
--       claim this row only when locked_until is null or already past,
--       via a single conditional UPDATE (see CONCURRENCY note below) —
--       the smallest mechanism that is still reliable under two
--       near-simultaneous invocations, because Postgres itself
--       serializes two concurrent UPDATEs against the same row (the
--       second one's WHERE clause is re-evaluated against the first's
--       already-committed result, so at most one can ever match).
--   (b) the run-observability record (8I) — last_run_* columns are
--       overwritten at the end of every run (success or failure), so
--       "what happened last time" never needs a separate log table.
create table public.email_monitor_state (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  email_account_id uuid not null references public.email_accounts(id) on delete cascade,
  -- CONCURRENCY: a run claims this mailbox with
  --   update email_monitor_state
  --   set status='running', locked_at=now(), locked_until=now()+interval '5 minutes', run_id=gen_random_uuid()
  --   where email_account_id = $1 and (locked_until is null or locked_until < now())
  --   returning run_id;
  -- Zero rows back means another run already holds the lock (or claimed
  -- it a moment ago) — skip this mailbox this invocation, try again next
  -- schedule tick. If a run crashes mid-processing (platform kill, an
  -- unhandled exception outside the code's own try/catch), it never
  -- clears the lock explicitly, but locked_until's lease expires on its
  -- own — the NEXT invocation can reclaim and retry once now() passes
  -- locked_until. This is the "recover safely from a crashed invocation
  -- and stale lock" requirement: no manual intervention, no separate
  -- cleanup job, just a lease that expires.
  status text not null default 'idle' check (status in ('idle', 'running', 'failed')),
  run_id uuid,
  locked_at timestamptz,
  locked_until timestamptz,
  last_run_started_at timestamptz,
  last_run_finished_at timestamptz,
  last_run_status text check (last_run_status in ('success', 'partial', 'failed')),
  last_run_messages_considered integer,
  last_run_messages_analyzed integer,
  last_run_alerts_created integer,
  last_run_messages_marked_no_alert integer,
  last_run_failures integer,
  last_error text,
  -- Same idiom as email_sync_state.consecutive_failures — a mailbox that
  -- keeps failing is visible here without a separate alert mechanism;
  -- nothing currently auto-disables a mailbox from this count alone
  -- (that would be a scope-expanding decision, not this phase's).
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_monitor_state_account_key unique (email_account_id)
);

create index idx_email_monitor_state_org on public.email_monitor_state (organization_id);

comment on table public.email_monitor_state is
  'Phase 8 — one row per mailbox: doubles as the concurrency lock (locked_until lease) for the email-monitor Edge Function and the durable last-run observability record. Written only by that function via the service-role client.';

create trigger trg_email_monitor_state_updated_at
before update on public.email_monitor_state
for each row
execute function public.set_updated_at_timestamp();

alter table public.email_monitor_state enable row level security;

-- Read-only to authenticated users, same shape/permission as
-- email_sync_state_select — no INSERT/UPDATE/DELETE policy at all,
-- because (same precedent as email_sync_state) this table is written
-- exclusively by an Edge Function's service-role client, which bypasses
-- RLS entirely and needs no policy to do so.
create policy email_monitor_state_select on public.email_monitor_state
for select
using (has_permission('email', 'view') and organization_id = current_organization_id());

-- ── email_monitor_considered ─────────────────────────────────────────
-- The missing "durable verdict" for a message that was analyzed and
-- correctly found to need NO alert. Mirrors email_operational_alerts'
-- own unique-constraint-as-idempotency-mechanism design exactly, just
-- for the opposite outcome — together the two tables give every
-- analyzed message exactly one of three durable states:
--   1. row in email_operational_alerts  -> alert created
--   2. row in email_monitor_considered  -> analyzed, no alert needed
--   3. row in neither                   -> not yet successfully
--      analyzed (never attempted, or analysis failed) -> eligible for
--      the next run to retry
-- email_operational_alerts is deliberately NOT reused for outcome 2 (a
-- "no_alert_needed" sentinel row there would conflate a real alert
-- table with a non-alert bookkeeping concern, and risks confusing the
-- Alerts tab UI, which lists every row in that table as something to
-- act on).
create table public.email_monitor_considered (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  email_message_id uuid not null references public.email_messages(id) on delete cascade,
  -- Denormalized, same reasoning as email_operational_alerts.email_account_id
  -- (mailbox-scoped queries without a join; a message never moves mailboxes).
  email_account_id uuid not null references public.email_accounts(id) on delete cascade,
  -- One legal value today — deliberately narrow rather than a free-form
  -- reason enum, since "analyzed, no alert warranted" is the only
  -- outcome this table exists to record (an alert-worthy outcome lives
  -- in email_operational_alerts instead). Extend this check constraint
  -- if a genuinely distinct no-alert outcome is ever needed.
  outcome text not null default 'no_alert_needed' check (outcome in ('no_alert_needed')),
  summary text,
  run_id uuid,
  considered_at timestamptz not null default now(),
  constraint email_monitor_considered_message_unique unique (email_message_id)
);

create index idx_email_monitor_considered_account on public.email_monitor_considered (email_account_id);

comment on table public.email_monitor_considered is
  'Phase 8 — one row per email_message_id that the email-monitor Edge Function analyzed and correctly determined needs no operational alert. The UNIQUE constraint on email_message_id is what stops a recurring scan from re-analyzing the same non-alerting message forever; a message with no row here AND no row in email_operational_alerts has not yet been successfully analyzed and remains eligible for the next run.';

alter table public.email_monitor_considered enable row level security;

create policy email_monitor_considered_select on public.email_monitor_considered
for select
using (has_permission('email', 'view') and organization_id = current_organization_id());

-- ── Eligibility selection (8C) ───────────────────────────────────────
-- The provably-non-skipping message selector. Deliberately NOT a
-- synced_at/created_at watermark comparison: a watermark ("only rows
-- newer than the last cursor") cannot be proven safe against equal
-- timestamps, multiple messages sharing one timestamp, or a message
-- that syncs late with an earlier timestamp than one already processed
-- — any of those can silently skip a message under a watermark design.
-- This instead filters on each message's own durable per-message state
-- (exists in email_operational_alerts? exists in
-- email_monitor_considered?), which cannot be skipped by a timing
-- coincidence: a message is eligible for exactly as long as neither
-- durable outcome exists for it, full stop, regardless of what order or
-- when it was synced.
--
-- The NOT EXISTS filters run BEFORE "order by ... limit" — this is what
-- makes the limit safe even for a mailbox with a large already-resolved
-- backlog: the limit only ever truncates the already-eligible set, it
-- can never hide an eligible row behind a wall of resolved ones (which
-- a client-side "fetch top N, then filter" approach could do if the
-- resolved backlog exceeds N). Ordered oldest-first (created_at asc) so
-- a conservative per-run batch size still drains the backlog to zero
-- over successive runs instead of the same newest messages winning
-- forever.
--
-- Plain SQL, no SECURITY DEFINER: called only via the service-role
-- client (which already bypasses RLS regardless), and revoked from
-- PUBLIC below so it cannot become an incidental RPC surface for
-- authenticated frontend users. If it ever were called by an
-- authenticated user directly, SECURITY INVOKER means it would still run
-- under that user's own RLS on email_messages/email_operational_alerts/
-- email_monitor_considered — no cross-org leak either way, revoking
-- PUBLIC access is defense in depth, not the only safeguard.
create or replace function public.email_monitor_find_eligible_messages(
  p_email_account_id uuid,
  p_limit integer default 10
)
returns table (
  id uuid,
  subject text,
  from_address text,
  from_name text,
  sent_at timestamptz,
  created_at timestamptz
)
language sql
stable
as $$
  select m.id, m.subject, m.from_address, m.from_name, m.sent_at, m.created_at
  from public.email_messages m
  where m.email_account_id = p_email_account_id
    and not exists (
      select 1 from public.email_operational_alerts a where a.email_message_id = m.id
    )
    and not exists (
      select 1 from public.email_monitor_considered c where c.email_message_id = m.id
    )
  order by m.created_at asc, m.id asc
  limit greatest(p_limit, 0);
$$;

-- Live-verified need (Phase 8 staged validation): `revoke all ... from
-- public` alone does NOT close this off on a Supabase project — new
-- functions in the public schema get EXECUTE granted directly to
-- anon/authenticated (Supabase's own default-privilege baseline, set up
-- independently of the PUBLIC pseudo-role), so revoking only from
-- PUBLIC leaves both of those roles still able to call this function
-- directly. SECURITY INVOKER (no `security definer` above) means that
-- exposure was never a cross-org leak or RLS bypass — a direct call
-- from either role still runs under ITS OWN RLS on email_messages/
-- email_operational_alerts/email_monitor_considered — but it wasn't the
-- narrow scope this was written to have, so both roles are revoked
-- explicitly here too.
revoke all on function public.email_monitor_find_eligible_messages(uuid, integer) from public;
revoke execute on function public.email_monitor_find_eligible_messages(uuid, integer) from anon, authenticated;
grant execute on function public.email_monitor_find_eligible_messages(uuid, integer) to service_role;

comment on function public.email_monitor_find_eligible_messages is
  'Phase 8 — returns messages for one mailbox that have neither an email_operational_alerts row nor an email_monitor_considered row, oldest first. The sole authoritative eligibility check for the email-monitor Edge Function; never a synced_at/timestamp watermark (see this migration''s own header comment for why).';

-- ── email_operational_alerts.created_by must allow NULL ──────────────
-- Phase 7 assumed every alert insert has a real logged-in human behind
-- it (created_by uuid not null default auth.uid()) — true for the
-- interactive Agent scan, never true for this unattended monitor, which
-- has no user session and therefore no auth.uid() at all. An
-- automatically-created alert genuinely has no human creator; relaxing
-- this column to nullable records that accurately instead of requiring
-- a fabricated "system user" id that doesn't correspond to any real
-- account. Zero UI/type impact: created_by is write-only today — not
-- selected by ALERT_COLUMNS in emailAlertsApi.ts, not read by
-- EmailCenter.tsx, not part of the EmailOperationalAlert type. The
-- default of auth.uid() is kept as-is (still correct for the existing
-- interactive Agent path, which never sets this column explicitly and
-- relies entirely on that default) — only the NOT NULL is dropped, so
-- the monitor's own insert can explicitly pass created_by: null.
alter table public.email_operational_alerts alter column created_by drop not null;

comment on column public.email_operational_alerts.created_by is
  'The authenticated user whose Agent session recorded this alert, or NULL for one created by the unattended Phase 8 email-monitor (which has no user session).';
