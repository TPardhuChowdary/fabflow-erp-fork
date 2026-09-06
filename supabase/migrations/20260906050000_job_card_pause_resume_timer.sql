-- Job Card live production timer (Start/Pause/Resume/Complete) — see chat.
-- NOT YET APPLIED — written for review per explicit instruction not to
-- apply without approval.
--
-- Architecture decisions this migration encodes (see chat report for the
-- full reasoning):
--
-- 1. job_cards.status already has exactly the four values this workflow
--    needs (NotStarted/InProgress/Completed/OnHold — confirmed via the
--    existing job_cards_status_check constraint) and "OnHold" already
--    exists in the type/UI vocabulary (JobCardStatus, JobCards.tsx,
--    MyJobs.tsx) but is currently dormant — no code path anywhere sets
--    it. It is reused as "Paused" rather than inventing a new status
--    value or a parallel timer_state column.
--
-- 2. job_cards.start_time / end_time are reused as the actual
--    start/completion timestamps (exactly the role they already play in
--    the existing handleStart/handleComplete flows) — not duplicated.
--    job_cards.actual_time_spent_minutes is a pre-existing GENERATED
--    column (end_time - start_time) that already feeds
--    EmployeeDetail.tsx's "Time Efficiency" performance metric. It is
--    left completely untouched by this migration/feature — it will
--    continue to include paused time exactly as it always has, since
--    changing its meaning would silently change an existing performance
--    calculation this feature was not asked to touch. The new
--    pause-aware "active_seconds" below is a separate, additional,
--    more accurate figure used only by the new timer UI.
--
-- 3. Two new columns hold the minimum authoritative state needed to
--    compute pause-aware working duration without persisting a
--    continuously-incrementing counter:
--      - active_seconds: accumulated working time from all CLOSED run
--        segments (i.e. not counting whatever segment is currently
--        open). Only ever written by the trigger below.
--      - current_run_started_at: when the currently-open run segment
--        began (set on Start/Resume, cleared on Pause/Complete). The UI
--        computes "current active duration" as
--        active_seconds + (now() - current_run_started_at when running)
--        client-side, refreshing every second — never written to the
--        database every second.
--
-- 4. All four transitions (Start/Pause/Resume/Complete) are validated
--    and time-stamped by ONE new BEFORE UPDATE trigger, not by new RPC
--    functions. This deliberately keeps working through the *existing*
--    updateJobCardRemote() full-row update path both JobCards.tsx (admin)
--    and MyJobs.tsx (worker) already use for Start/Complete today, and
--    covers even a raw direct-API PATCH attempt (not just button clicks)
--    — Postgres's normal row-level locking during UPDATE already
--    serializes concurrent transitions on the same row, so this needs no
--    extra SELECT-FOR-UPDATE/RPC wrapper to be race-safe.
--
--    The trigger only intervenes when status actually changes; every
--    other field edit (notes, quantities, employee reassignment, manual
--    historical start/end time backfill via the admin's existing
--    Add/Edit dialog) passes through completely unchanged, exactly as
--    before this feature existed. Server-authoritative timestamps are
--    only forced when the incoming value is unchanged from before (i.e.
--    the action-button code sent a minimal {status: ...} payload) — if
--    an admin explicitly types a different start/end time in the
--    existing manual edit form, that explicit value is respected, not
--    overridden.
--
--    One real, intentional behavior change: once a job card's status is
--    'Completed', this trigger blocks ANY further status change
--    (including via the admin's existing free-form status dropdown) —
--    this is what "Double Complete blocked", "Resume after Completed
--    blocked", and "Pause after Completed blocked" require. Every other
--    status combination not part of the five-step workflow (e.g.
--    NotStarted->OnHold, InProgress->NotStarted) is left exactly as
--    permissive as it is today - not part of this feature, not
--    restricted by it.
--
--    Pause (InProgress->OnHold) additionally requires job_cards.approve
--    — an existing permission (already used, unmodified, to gate
--    approving/rejecting job_card_exceptions; canApprove() already
--    exists in permissions.ts) reused here rather than inventing a new
--    permission. Start/Resume/Complete only require job_cards.edit,
--    already the sole gate on the whole existing job_cards UPDATE RLS
--    policy — unchanged.
--
--    This composes correctly with the pre-existing
--    trg_enforce_job_card_evidence_required trigger (already blocks any
--    transition into 'Completed' server-side when a required evidence
--    photo is missing, via company_settings.evidence_requirements +
--    asset_photos) without any change to that trigger: if it raises, the
--    whole UPDATE (including this trigger's stamping) rolls back
--    atomically, so a rejected completion leaves status/current_run_
--    started_at exactly as they were — the timer keeps running, per the
--    explicit requirement.
--
-- 5. job_card_time_events is a new, append-only audit table (one row per
--    Start/Pause/Resume/Complete) recording who/when/from-status/
--    to-status. performed_by is resolved server-side from auth.uid() via
--    profiles.username (not trusted from the client) — a stronger
--    guarantee than add_project_activity's existing pattern of trusting
--    a client-supplied display name, chosen here because this is a
--    security-relevant audit trail. No client-facing INSERT/UPDATE/
--    DELETE policy exists on this table at all — the SECURITY DEFINER
--    trigger function is the only writer, so a client cannot fabricate
--    or tamper with the timer history via a direct API call.
--
-- 6. Existing data: only 3 real job_cards rows exist today (2
--    InProgress, 1 NotStarted, 0 Completed, 0 OnHold - confirmed live).
--    The 2 existing InProgress rows are backfilled with
--    current_run_started_at = start_time (the most reasonable
--    interpretation available: their run has been open, uninterrupted,
--    since their existing start_time) so the new timer displays a
--    sensible value for them immediately rather than erroring on a null.

alter table public.job_cards
  add column active_seconds integer not null default 0,
  add column current_run_started_at timestamptz null;

update public.job_cards
set current_run_started_at = coalesce(start_time, now())
where status = 'InProgress';

create table public.job_card_time_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id(),
  job_card_id uuid not null references public.job_cards(id) on delete cascade,
  event_type text not null check (event_type in ('started', 'paused', 'resumed', 'completed')),
  from_status text not null,
  to_status text not null,
  performed_by uuid,
  performed_by_name text,
  created_at timestamptz not null default now()
);

create index job_card_time_events_job_card_id_idx
  on public.job_card_time_events (job_card_id, created_at);

alter table public.job_card_time_events enable row level security;

create policy job_card_time_events_select
  on public.job_card_time_events
  for select
  using (
    has_permission('job_cards', 'view')
    and organization_id = current_organization_id()
  );
-- Deliberately no insert/update/delete policy for the authenticated role:
-- the trigger function below is SECURITY DEFINER and is the only writer.

create or replace function public.enforce_job_card_timer_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_elapsed integer;
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_event_type text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if old.status = 'Completed' then
    raise exception 'Job card % is already completed; status cannot be changed', old.job_no;
  end if;

  v_event_type := null;

  if old.status = 'NotStarted' and new.status = 'InProgress' then
    if new.start_time is not distinct from old.start_time then
      new.start_time := now();
    end if;
    new.current_run_started_at := now();
    v_event_type := 'started';

  elsif old.status = 'InProgress' and new.status = 'OnHold' then
    if not has_permission('job_cards', 'approve') then
      raise exception 'permission denied: pausing a job card requires job_cards.approve';
    end if;
    v_elapsed := greatest(floor(extract(epoch from (now() - coalesce(old.current_run_started_at, now()))))::integer, 0);
    new.active_seconds := old.active_seconds + v_elapsed;
    new.current_run_started_at := null;
    v_event_type := 'paused';

  elsif old.status = 'OnHold' and new.status = 'InProgress' then
    new.current_run_started_at := now();
    v_event_type := 'resumed';

  elsif old.status = 'InProgress' and new.status = 'Completed' then
    v_elapsed := greatest(floor(extract(epoch from (now() - coalesce(old.current_run_started_at, now()))))::integer, 0);
    new.active_seconds := old.active_seconds + v_elapsed;
    new.current_run_started_at := null;
    if new.end_time is not distinct from old.end_time then
      new.end_time := now();
    end if;
    v_event_type := 'completed';

  elsif old.status = 'OnHold' and new.status = 'Completed' then
    new.current_run_started_at := null;
    if new.end_time is not distinct from old.end_time then
      new.end_time := now();
    end if;
    v_event_type := 'completed';
  end if;

  -- Any other combination (NotStarted->OnHold, NotStarted->Completed,
  -- InProgress->NotStarted, OnHold->NotStarted, etc.) is not part of this
  -- workflow and passes through unchanged, exactly as permissive as the
  -- admin's existing free-form status editor already is today.
  if v_event_type is not null then
    select username into v_actor_name from public.profiles where id = v_actor;
    insert into public.job_card_time_events
      (job_card_id, organization_id, event_type, from_status, to_status, performed_by, performed_by_name)
    values
      (new.id, new.organization_id, v_event_type, old.status, new.status, v_actor, coalesce(v_actor_name, 'Unknown user'));
  end if;

  return new;
end;
$$;

create trigger trg_enforce_job_card_timer_transition
before update on public.job_cards
for each row
execute function public.enforce_job_card_timer_transition();
