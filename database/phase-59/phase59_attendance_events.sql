-- Phase 59 (Master Monster Prompt, Phases 13/14) — Event-based
-- attendance + biometric-ready, provider-neutral architecture.
--
-- Confirmed via live audit: public.attendance_records (Phase 2) is a
-- thin DAILY SUMMARY (employee_id, date, status) - one row per
-- employee per day, no timestamps, no IN/OUT, no verification method.
-- It is left completely untouched here (existing rows, RLS, and every
-- current reader keep working exactly as today) and gains new nullable
-- derived-metric columns; the real gap this migration closes is that
-- there was no EVENT log underneath it at all.
--
-- attendance_events is that event log - one row per raw IN/OUT
-- swipe/tap/click, ever. attendance_records.status and the new derived
-- columns below are computed FROM these events by application logic
-- (using the company's own attendance policy from company_settings,
-- Phase 60) - never the other way around. This is what makes the
-- architecture biometric-ready without committing to a vendor: any
-- future biometric device or app integration is just another writer of
-- attendance_events rows with verification_method set appropriately;
-- nothing about attendance_records or downstream performance logic has
-- to change.
--
-- Deliberately stores only external_biometric_ref (an opaque reference
-- id from whatever provider verified the event) and device_id, never a
-- fingerprint/face template or other raw biometric data - matches the
-- Master Monster Prompt's explicit instruction ("do not store
-- unnecessary biometric data") and this codebase's existing signed-URL-
-- only, never-raw-secret handling convention elsewhere.
--
-- Same permission module as attendance_records itself ('employees'),
-- same org-scoped RLS shape as every other table in this codebase.

begin;

create table if not exists public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id()
    references public.organizations(id),
  employee_id uuid not null references public.employees(id) on delete cascade,
  event_at timestamptz not null default now(),
  direction text not null check (direction in ('in', 'out')),
  verification_method text not null default 'manual'
    check (verification_method in (
      'manual',
      'biometric_fingerprint',
      'biometric_face',
      'card',
      'mobile_app',
      'other'
    )),
  -- Opaque reference from the verifying device/provider - never raw
  -- biometric data. Nullable: a manual entry has no device.
  device_id text,
  external_biometric_ref text,
  location text,
  result text not null default 'success'
    check (result in ('success', 'failed', 'flagged')),
  -- Who entered this, for a manual/admin-corrected entry. Null for a
  -- genuine device/app-originated event, matching security_audit_log's
  -- own nullable actor convention elsewhere in this schema.
  recorded_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_attendance_events_employee_date
  on public.attendance_events(employee_id, event_at);
create index if not exists idx_attendance_events_org_id
  on public.attendance_events(organization_id);

alter table public.attendance_events enable row level security;

drop policy if exists attendance_events_select on public.attendance_events;
create policy attendance_events_select on public.attendance_events
  for select using (
    has_permission('employees', 'view')
    and organization_id = current_organization_id()
  );
drop policy if exists attendance_events_insert on public.attendance_events;
create policy attendance_events_insert on public.attendance_events
  for insert with check (
    has_permission('employees', 'edit')
    and organization_id = current_organization_id()
  );
-- Deliberately no update policy: an attendance event is what was
-- recorded at the time. A wrong event is corrected by inserting a new
-- event with a note, not by editing history - same tamper-evidence
-- reasoning as job_card_exceptions' report-then-approve split (Phase
-- 58) and asset_usage_events' existing insert-only design (Phase 51).
drop policy if exists attendance_events_delete on public.attendance_events;
create policy attendance_events_delete on public.attendance_events
  for delete using (
    has_permission('employees', 'delete')
    and organization_id = current_organization_id()
  );

-- ── Derived daily metrics on the existing summary row. All nullable -
--    populated by application logic once a day's events + the
--    company's attendance policy (Phase 60) are processed; nothing
--    downstream is forced to have a value before that's run. ──────────

alter table public.attendance_records
  add column if not exists first_in_at timestamptz;
alter table public.attendance_records
  add column if not exists last_out_at timestamptz;
alter table public.attendance_records
  add column if not exists late_minutes integer;
alter table public.attendance_records
  add column if not exists early_departure_minutes integer;
alter table public.attendance_records
  add column if not exists overtime_minutes integer;
alter table public.attendance_records
  add column if not exists break_minutes integer;

insert into public.schema_migrations (version, description, checksum)
values (
  '20260903_059_phase59_attendance_events',
  'Master Monster Prompt Phases 13/14: new attendance_events table (one row per raw IN/OUT event, verification_method + device_id + external_biometric_ref for a provider-neutral biometric-ready design that never stores raw biometric templates, insert-only RLS - no update policy, corrections are new events not edits). Adds nullable derived-metric columns (first_in_at, last_out_at, late_minutes, early_departure_minutes, overtime_minutes, break_minutes) to the existing attendance_records daily-summary table, computed by application logic from events + company policy, not by this migration. Same employees permission module and org-scoped RLS shape as attendance_records itself.',
  'phase59-mmp-v1'
)
on conflict (version) do nothing;

commit;
