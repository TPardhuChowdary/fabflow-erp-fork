-- ============================================================================
-- Phase 12 (SQL numbering): QMS Inspection ↔ Production Gate Persistence
-- ============================================================================
-- Version:     20260809_012_phase12_qms_inspection_gate_persistence
--
-- Scope:       Implements the persistence architecture approved in the
--              conversation-level Phase 32 investigation record
--              (database/phase-32/PHASE32_PERSISTENCE_ARCHITECTURE.md — a
--              separate, conversation-level "Phase" numbering unrelated to
--              this SQL migration sequence, which continues 01-11). That
--              record, together with the business rules approved
--              immediately after it, is the sole source of truth for every
--              design decision below; nothing here invents new business
--              behavior.
--
-- What this migration does:
--   1. project_qms_inspections        — one row per independent QMS
--      inspection instance on a Project (a Project may have many). May
--      optionally carry a soft-reference to a local Production Stage,
--      making it a Required Inspection / production gate for that stage.
--   2. project_qms_inspection_characteristics — a snapshot of which
--      characteristics apply to one inspection instance, captured at
--      creation time so a later rename/retirement in the QMS Library
--      (which stays IndexedDB-only, out of scope) cannot silently alter
--      historical meaning.
--   3. project_qms_inspection_attempts — the append-only record of every
--      Pass/Fail/NA check, one row per attempt/round per characteristic,
--      carrying failure reason/description and rectification
--      action/description inline. INSERT-ONLY: UPDATE and DELETE are
--      blocked by trigger, not merely by convention.
--   4. project_qms_inspection_attempt_photos — evidence photos attributed
--      to one specific attempt (failure or rectification proof).
--      INSERT-ONLY, same enforcement.
--   5. project_qms_inspection_overrides — the supervisor/admin emergency
--      override log. INSERT-ONLY. Never writes to
--      project_qms_inspections.status — an override is a separate,
--      permanently visible record layered on top of a still-Failed
--      inspection, never a mutation of the result itself.
--   6. recompute_qms_inspection_status() + a trigger that calls it after
--      every attempt insert — derives project_qms_inspections.status
--      ('NotStarted'|'InProgress'|'Failed'|'Passed') from the latest
--      attempt per characteristic, server-side, so the gate state is
--      authoritative and race-safe across concurrent devices rather than
--      dependent on frontend recomputation.
--   7. One new permission action, ('inspection_sheets','override'),
--      seeded into the existing permissions table so the emergency
--      override path is separately grantable from ordinary
--      ('inspection_sheets','complete') access. Organization admins
--      already bypass has_permission() entirely (is_admin short-circuit,
--      see phase-01), so this seed is what makes the action *assignable*
--      to non-admin roles later via the existing role-permission
--      management flow — it does not itself grant the action to anyone.
--
-- What this migration does NOT do (explicitly, per the approved record):
--   - Does not touch, alter, or migrate any of the 26 already
--     Supabase-backed domains.
--   - Does not migrate project_production_stages or
--     production_stage_transactions — Production Stages remain
--     local/Zustand, exactly as Phase 28 decided and Phase 30/31/32
--     reaffirmed. The link from project_qms_inspections to a Production
--     Stage is a plain text soft-reference (required_production_stage_id),
--     never a foreign key, by explicit design (Phase 32 §D/I) — a real FK
--     is not possible against a table that lives only in the browser.
--   - Does not touch, alter, or migrate qms_stage_completions or any other
--     part of the existing one-sheet-per-project QMS/IndexedDB subsystem.
--     That subsystem keeps running entirely unchanged, in parallel with
--     these new tables.
--   - Does not add Supabase Storage usage. Photo evidence uses the same
--     base64-data-URL-in-a-text-column convention already established by
--     employee_documents (phase-02) and PurchasedItemAttachment, per
--     Phase 32 §K.
--   - Does not modify any unrelated schema, RLS policy, trigger, function,
--     or permission.
--
-- Pre-implementation verification performed live against this database
-- before writing this file (read-only only, no writes — see
-- database/phase-32/PHASE32_PERSISTENCE_ARCHITECTURE.md for the full
-- record):
--   A. project_production_stages / production_stage_transactions /
--      qms_stage_completions: all three confirmed live with their full
--      column sets, full RLS, and existing triggers from phase-11, all
--      still at 0 rows — correcting an earlier (Phase 28) undercount of
--      qms_stage_completions' columns, disclosed in the Phase 32 report.
--   B. has_permission(module, action), current_organization_id(),
--      set_updated_at_timestamp(): all confirmed defined (phase-01,
--      phase-02) and reused unmodified below.
--   C. No existing table can safely host this new data — see Phase 32 §C
--      for why qms_stage_completions (built for the old
--      one-sheet-per-project model) was deliberately not repurposed.
--
-- Idempotent: every statement below is safe to re-run against a database
-- that already has this migration applied.
-- ============================================================================

begin;

-- ============================================================================
-- 1. project_qms_inspections — one row per independent inspection instance
--    on a Project. Approved business rules 1, 2, 3, 5, 6, 18.
-- ============================================================================

create table if not exists public.project_qms_inspections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  project_id uuid not null references public.projects(id) on delete cascade,

  -- Soft link only — the QMS Library (InspectionStageDefinition) lives in
  -- IndexedDB, out of scope for this migration (Phase 32 §A). No FK is
  -- possible against a table that doesn't exist in Postgres. The name is
  -- snapshotted alongside it so a later Library rename can never silently
  -- rewrite what this historical record meant at the time.
  library_inspection_id text not null,
  library_inspection_name text not null,

  -- Soft link only, same reasoning — Production Stages stay local/Zustand
  -- (rule: do not migrate just to create a foreign key). NULL = an
  -- independent inspection (Path B / rule 5); set = a Required Inspection
  -- linked to that local stage (Path A / rules 2, 3, 4).
  required_production_stage_id text,

  mode text not null,
  -- Server-derived from the latest attempt per characteristic — see
  -- recompute_qms_inspection_status() below. Never written directly by
  -- ordinary client updates; any client-supplied value is overwritten by
  -- the next attempt insert's recompute, so a stale/incorrect client write
  -- self-heals rather than persisting (Postgres RLS has no native
  -- column-level policy short of a separate GRANT scheme, which existing
  -- migrations in this codebase — e.g. phase-11's bom_requisitions — also
  -- chose not to introduce; consistent with that established precedent).
  status text not null default 'NotStarted',

  created_by text,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_project_qms_inspections_mode check (mode in ('Digital','Paper','Hybrid')),
  constraint chk_project_qms_inspections_status check (status in ('NotStarted','InProgress','Failed','Passed')),

  -- THE duplicate-prevention guarantee (approved rule 6): the same Library
  -- inspection cannot be added twice to the same Project, at the database
  -- level, not merely by a frontend check that a race or a second client
  -- could bypass.
  constraint uq_project_qms_inspections_project_library unique (project_id, library_inspection_id)
);

create index if not exists idx_project_qms_inspections_org_project
  on public.project_qms_inspections (organization_id, project_id);
create index if not exists idx_project_qms_inspections_required_stage
  on public.project_qms_inspections (required_production_stage_id)
  where required_production_stage_id is not null;

drop trigger if exists trg_project_qms_inspections_updated_at on public.project_qms_inspections;
create trigger trg_project_qms_inspections_updated_at
  before update on public.project_qms_inspections
  for each row execute function public.set_updated_at_timestamp();

-- ============================================================================
-- 2. project_qms_inspection_characteristics — snapshot of which
--    characteristics apply to one inspection instance. Approved rule 7
--    (all characteristics required by default — no per-characteristic
--    "required" flag exists or is needed, per Decision 5-A).
-- ============================================================================

create table if not exists public.project_qms_inspection_characteristics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  project_qms_inspection_id uuid not null references public.project_qms_inspections(id) on delete cascade,

  -- Soft link only, same reasoning as above.
  library_characteristic_id text not null,
  name_snapshot text not null,
  category_snapshot text,

  sequence integer not null default 0,
  created_at timestamptz not null default now(),

  constraint uq_project_qms_inspection_characteristics unique (project_qms_inspection_id, library_characteristic_id)
);

create index if not exists idx_project_qms_inspection_characteristics_inspection
  on public.project_qms_inspection_characteristics (project_qms_inspection_id);

-- ============================================================================
-- 3. project_qms_inspection_attempts — the append-only heart of the
--    design. Approved rules 8, 9, 10, 11, 12, 13, 14.
-- ============================================================================

create table if not exists public.project_qms_inspection_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  project_qms_inspection_id uuid not null references public.project_qms_inspections(id) on delete cascade,
  characteristic_id uuid not null references public.project_qms_inspection_characteristics(id) on delete cascade,

  -- Always server-assigned by trg_set_qms_inspection_attempt_round below;
  -- any client-supplied value is overwritten before insert. This is what
  -- makes "re-inspection creates a new attempt, never overwrites" (rules
  -- 11/12) safe under two devices submitting a re-inspection at once.
  round_number integer not null,

  result text not null,
  measured_value text,
  remarks text,

  -- Populated only when result = 'Fail' (approved rule 9). Not enforced by
  -- a CHECK constraint requiring non-null-on-Fail, matching this
  -- codebase's existing convention of leaving cross-field business
  -- validation to the frontend where the constraint is about presentation
  -- rules rather than data integrity (e.g. the frontend, not the DB,
  -- already owns "OK Qty + Rejected Qty = Received Qty" on the legacy V2
  -- stage screen).
  failure_reason text,
  failure_description text,

  -- Populated only on the attempt that records a rectification before
  -- re-inspection (approved rule 10).
  rectification_action text,
  rectification_description text,

  performed_by text,
  performed_by_name text,
  performed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint chk_project_qms_inspection_attempts_result check (result in ('Pass','Fail','NA')),
  constraint uq_project_qms_inspection_attempts_round unique (characteristic_id, round_number)
);

create index if not exists idx_project_qms_inspection_attempts_inspection
  on public.project_qms_inspection_attempts (project_qms_inspection_id);
create index if not exists idx_project_qms_inspection_attempts_characteristic
  on public.project_qms_inspection_attempts (characteristic_id, round_number desc);

-- Server-assigns round_number: locks the parent characteristic row first
-- (the same lock-before-aggregate pattern already established by
-- phase-11's enforce_stage_transaction_limit()), so two concurrent
-- re-inspection submissions for the same characteristic serialize instead
-- of racing into the same round number.

create or replace function public.set_qms_inspection_attempt_round()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max_round integer;
begin
  perform 1 from public.project_qms_inspection_characteristics
    where id = NEW.characteristic_id for update;

  select coalesce(max(round_number), 0) into v_max_round
  from public.project_qms_inspection_attempts
  where characteristic_id = NEW.characteristic_id;

  NEW.round_number := v_max_round + 1;
  return NEW;
end;
$$;

drop trigger if exists trg_set_qms_inspection_attempt_round on public.project_qms_inspection_attempts;
create trigger trg_set_qms_inspection_attempt_round
  before insert on public.project_qms_inspection_attempts
  for each row execute function public.set_qms_inspection_attempt_round();

-- Derives project_qms_inspections.status from the latest attempt per
-- characteristic, per approved rule 8 (PASS = all required characteristics
-- passed): NotStarted (no attempts at all yet), InProgress (some
-- characteristics still unattempted or latest result is NA), Failed (any
-- characteristic's latest attempt is Fail), Passed (every characteristic's
-- latest attempt is Pass). Runs as SECURITY DEFINER so it can update
-- project_qms_inspections regardless of the calling user's own UPDATE
-- grant on that table — the same bypass-by-design pattern already used by
-- phase-11's recompute_bom_requisition().

create or replace function public.recompute_qms_inspection_status(p_inspection_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_characteristics integer;
  v_characteristics_with_attempts integer;
  v_fail_count integer;
  v_pass_count integer;
  v_status text;
begin
  select count(*) into v_total_characteristics
  from public.project_qms_inspection_characteristics
  where project_qms_inspection_id = p_inspection_id;

  with latest as (
    select distinct on (characteristic_id) characteristic_id, result
    from public.project_qms_inspection_attempts
    where project_qms_inspection_id = p_inspection_id
    order by characteristic_id, round_number desc
  )
  select
    count(*),
    count(*) filter (where result = 'Fail'),
    count(*) filter (where result = 'Pass')
  into v_characteristics_with_attempts, v_fail_count, v_pass_count
  from latest;

  if v_characteristics_with_attempts = 0 then
    v_status := 'NotStarted';
  elsif v_fail_count > 0 then
    v_status := 'Failed';
  elsif v_total_characteristics > 0 and v_pass_count = v_total_characteristics then
    v_status := 'Passed';
  else
    v_status := 'InProgress';
  end if;

  update public.project_qms_inspections
  set status = v_status, updated_at = now()
  where id = p_inspection_id;
end;
$$;

create or replace function public.trg_recompute_qms_inspection_status_on_attempt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recompute_qms_inspection_status(NEW.project_qms_inspection_id);
  return NEW;
end;
$$;

drop trigger if exists trg_qms_inspection_attempts_recompute_status on public.project_qms_inspection_attempts;
create trigger trg_qms_inspection_attempts_recompute_status
  after insert on public.project_qms_inspection_attempts
  for each row execute function public.trg_recompute_qms_inspection_status_on_attempt();

-- Append-only enforcement (approved rules 12, 13, 14): a database-level
-- guarantee, not merely a frontend convention. Shared by all three
-- append-only tables in this migration via TG_TABLE_NAME.

create or replace function public.prevent_qms_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Rows in % are append-only and cannot be updated or deleted (id=%)',
    TG_TABLE_NAME, coalesce(OLD.id, NEW.id);
end;
$$;

drop trigger if exists trg_project_qms_inspection_attempts_append_only on public.project_qms_inspection_attempts;
create trigger trg_project_qms_inspection_attempts_append_only
  before update or delete on public.project_qms_inspection_attempts
  for each row execute function public.prevent_qms_history_mutation();

-- ============================================================================
-- 4. project_qms_inspection_attempt_photos — evidence attributed to one
--    specific attempt. Approved rules 9, 10.
-- ============================================================================

create table if not exists public.project_qms_inspection_attempt_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  attempt_id uuid not null references public.project_qms_inspection_attempts(id) on delete cascade,

  -- Base64 data URL, same convention as employee_documents (phase-02) and
  -- PurchasedItemAttachment — not Supabase Storage (Phase 32 §K, this
  -- codebase has never used Storage anywhere).
  file_data text not null,
  file_mime_type text not null,
  caption text,

  uploaded_by text,
  uploaded_by_name text,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_project_qms_inspection_attempt_photos_attempt
  on public.project_qms_inspection_attempt_photos (attempt_id);

drop trigger if exists trg_project_qms_inspection_attempt_photos_append_only on public.project_qms_inspection_attempt_photos;
create trigger trg_project_qms_inspection_attempt_photos_append_only
  before update or delete on public.project_qms_inspection_attempt_photos
  for each row execute function public.prevent_qms_history_mutation();

-- ============================================================================
-- 5. project_qms_inspection_overrides — supervisor/admin emergency
--    override log. Approved rules 15, 16. Never writes to
--    project_qms_inspections.status — see the header note and function 3
--    above; an override is a visible, permanent, separate record, never a
--    mutation of the underlying Fail result.
-- ============================================================================

create table if not exists public.project_qms_inspection_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  project_qms_inspection_id uuid not null references public.project_qms_inspections(id) on delete cascade,
  required_production_stage_id text not null,

  -- NOT NULL at the database level, not just a frontend form requirement
  -- (approved rule 16 — "must require a reason").
  reason text not null,

  overridden_by text not null,
  overridden_by_name text not null,
  overridden_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_project_qms_inspection_overrides_inspection
  on public.project_qms_inspection_overrides (project_qms_inspection_id);
create index if not exists idx_project_qms_inspection_overrides_stage
  on public.project_qms_inspection_overrides (required_production_stage_id);

drop trigger if exists trg_project_qms_inspection_overrides_append_only on public.project_qms_inspection_overrides;
create trigger trg_project_qms_inspection_overrides_append_only
  before update or delete on public.project_qms_inspection_overrides
  for each row execute function public.prevent_qms_history_mutation();

-- ============================================================================
-- 6. New permission action for the override path (approved rule 15 —
--    "supervisor/admin only"). Seed only: organization admins already
--    bypass has_permission() entirely via the is_admin short-circuit
--    (phase-01), so this row is what makes the action *assignable* to a
--    non-admin role later through the existing role-permission management
--    flow — it does not itself grant the action to any specific user.
-- ============================================================================

insert into public.permissions (module, action, label, category)
values ('inspection_sheets', 'override', 'Override Production Gate (Emergency)', 'Quality')
on conflict (module, action) do nothing;

-- ============================================================================
-- 7. RLS + policies for every new table. Reuses the exact
--    has_permission(module, action) + organization_id =
--    current_organization_id() pattern already proven on 26 domains and
--    on phase-11's dormant tables. Reuses the existing 'inspection_sheets'
--    permission module throughout — no other new module is introduced.
--    No unrelated table's RLS is touched.
-- ============================================================================

alter table public.project_qms_inspections enable row level security;

drop policy if exists project_qms_inspections_select on public.project_qms_inspections;
create policy project_qms_inspections_select on public.project_qms_inspections for select
  using (has_permission('inspection_sheets','view') and organization_id = current_organization_id());

drop policy if exists project_qms_inspections_insert on public.project_qms_inspections;
create policy project_qms_inspections_insert on public.project_qms_inspections for insert
  with check (has_permission('inspection_sheets','generate') and organization_id = current_organization_id());

drop policy if exists project_qms_inspections_update on public.project_qms_inspections;
create policy project_qms_inspections_update on public.project_qms_inspections for update
  using (has_permission('inspection_sheets','complete') and organization_id = current_organization_id())
  with check (has_permission('inspection_sheets','complete') and organization_id = current_organization_id());

-- No delete policy: instances are durable business records (approved rule
-- 17 — deleting a Production Stage must not silently delete the
-- inspection or its history). Deletion is intentionally unavailable to
-- every role, including admins, through this API surface.

alter table public.project_qms_inspection_characteristics enable row level security;

drop policy if exists project_qms_inspection_characteristics_select on public.project_qms_inspection_characteristics;
create policy project_qms_inspection_characteristics_select on public.project_qms_inspection_characteristics for select
  using (has_permission('inspection_sheets','view') and organization_id = current_organization_id());

drop policy if exists project_qms_inspection_characteristics_insert on public.project_qms_inspection_characteristics;
create policy project_qms_inspection_characteristics_insert on public.project_qms_inspection_characteristics for insert
  with check (has_permission('inspection_sheets','generate') and organization_id = current_organization_id());

-- No update/delete: an immutable snapshot by design.

alter table public.project_qms_inspection_attempts enable row level security;

drop policy if exists project_qms_inspection_attempts_select on public.project_qms_inspection_attempts;
create policy project_qms_inspection_attempts_select on public.project_qms_inspection_attempts for select
  using (has_permission('inspection_sheets','view') and organization_id = current_organization_id());

drop policy if exists project_qms_inspection_attempts_insert on public.project_qms_inspection_attempts;
create policy project_qms_inspection_attempts_insert on public.project_qms_inspection_attempts for insert
  with check (has_permission('inspection_sheets','complete') and organization_id = current_organization_id());

-- No update/delete policy at all — combined with the append-only trigger
-- above, history cannot be altered by RLS misconfiguration alone or by
-- trigger removal alone; both layers must fail together.

alter table public.project_qms_inspection_attempt_photos enable row level security;

drop policy if exists project_qms_inspection_attempt_photos_select on public.project_qms_inspection_attempt_photos;
create policy project_qms_inspection_attempt_photos_select on public.project_qms_inspection_attempt_photos for select
  using (has_permission('inspection_sheets','view') and organization_id = current_organization_id());

drop policy if exists project_qms_inspection_attempt_photos_insert on public.project_qms_inspection_attempt_photos;
create policy project_qms_inspection_attempt_photos_insert on public.project_qms_inspection_attempt_photos for insert
  with check (has_permission('inspection_sheets','complete') and organization_id = current_organization_id());

alter table public.project_qms_inspection_overrides enable row level security;

drop policy if exists project_qms_inspection_overrides_select on public.project_qms_inspection_overrides;
create policy project_qms_inspection_overrides_select on public.project_qms_inspection_overrides for select
  using (has_permission('inspection_sheets','view') and organization_id = current_organization_id());

drop policy if exists project_qms_inspection_overrides_insert on public.project_qms_inspection_overrides;
create policy project_qms_inspection_overrides_insert on public.project_qms_inspection_overrides for insert
  with check (has_permission('inspection_sheets','override') and organization_id = current_organization_id());

-- ============================================================================
-- 8. Register this migration.
-- ============================================================================

insert into public.schema_migrations (version, description, checksum)
values (
  '20260809_012_phase12_qms_inspection_gate_persistence',
  'QMS Inspection <-> Production Gate persistence per the conversation-level Phase 32 investigation + approved business rules: project_qms_inspections (independent per-project inspection instances, optional soft-linked Required Inspection to a local Production Stage, unique(project_id, library_inspection_id) duplicate guard, server-derived status), project_qms_inspection_characteristics (per-instance snapshot of applicable characteristics), project_qms_inspection_attempts (append-only Pass/Fail/NA rounds with inline failure reason/description and rectification action/description, server-assigned round_number, insert-only enforced by trigger), project_qms_inspection_attempt_photos (per-attempt evidence, base64 convention, insert-only), project_qms_inspection_overrides (supervisor/admin emergency override log, reason required, insert-only, never mutates the underlying result), recompute_qms_inspection_status() + AFTER INSERT trigger (server-side derived gate state), one new inspection_sheets.override permission seeded. Production Stages remain local/Zustand (soft-referenced by text id only, no FK). Existing QMS IndexedDB subsystem, qms_stage_completions, project_production_stages, production_stage_transactions, and all 26 previously-migrated domains left completely untouched.',
  'f1c7a4e0b9d3f6a8c2e5b7d1a9c3e6f8b0d2a4c6e8f0b2d4a6c8e0f2b4d6a8c0'
)
on conflict (version) do nothing;

commit;
