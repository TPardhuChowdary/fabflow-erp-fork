-- ============================================================================
-- Phase 49: job_cards (Employee-assigned, time-based work)
-- ============================================================================
-- Version:     20260831_049_phase49_job_cards
-- Scope:       Real production feature request (see chat, "JOB CARDS —
--              EMPLOYEE-ASSIGNED, TIME-BASED WORK"). New table - no
--              pre-existing job_cards table exists (the frontend `JobCard`
--              type in types.ts was dead code from the pre-Supabase ICP
--              prototype: zero references in store.ts or any page - this
--              migration and its paired frontend work replace that dead
--              definition with a real, wired one of the same name).
--
-- Design notes:
--   - project_id: required (every real job card is real work done in the
--     context of a project, matching production_stages' own mandatory
--     project linkage) and CASCADEs with its project - a deleted project's
--     job cards are not meaningful orphaned records, same reasoning as
--     invoice_items cascading with its invoice.
--   - employee_id: the real Employee entity (public.employees), matching
--     the explicit requirement "must use the real Employee entity, do not
--     duplicate employee information." ON DELETE SET NULL (not CASCADE) so
--     a job card's historical record survives an employee being removed -
--     employee_name is snapshotted alongside it for exactly that case,
--     the same "real FK + display snapshot" pattern already used by
--     material_purchases.vendor_id/supplier_name.
--   - expected_quantity is a GENERATED column, not a plain writable one:
--     Expected Quantity = Allocated Time / Standard Time per Unit, per the
--     explicit spec. No existing quantity-rounding convention was found
--     anywhere else in this codebase (grepped) - floor() is used because a
--     fabricator cannot produce a fractional physical piece, matching
--     every other quantity field in this schema being a whole-unit count.
--     Generated (not client-writable) so it can never drift from its two
--     real inputs - the same "trigger/generated-column owns the derived
--     value, client never sends it" convention update_invoice_total()
--     already established for invoices.total_amount.
--   - actual_time_spent_minutes is likewise GENERATED from start_time/
--     end_time, never independently entered - avoids a second source of
--     truth for a value that's arithmetically determined by two other
--     real columns.
--   - status enum values follow this codebase's existing PascalCase
--     concatenated convention (ProjectStageStatus: "NotStarted",
--     "InProgress", "Completed", ...).
--
-- RLS/organization_id: same Phase 1 pattern as every other table (column +
-- default current_organization_id() + 4 has_permission('job_cards',...)
-- policies). "job_cards" is a new permission module (see permissions.ts) -
-- Admin bypasses granular checks as it already does for every module, and
-- any other role must be explicitly granted access via the existing
-- Settings permission-matrix UI, exactly like every module added since
-- Phase 3 (no phase since Phase 2 has re-seeded role_permissions - grants
-- are self-service through Settings, not migration-seeded, confirmed by
-- inspecting every intervening phase file).
--
-- Every DDL statement below is idempotent: safe to re-run this file
-- against a database that already has it applied.
-- ============================================================================

begin;

create table if not exists public.job_cards (
  id uuid primary key default gen_random_uuid(),
  job_no text not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  employee_name text not null,
  job_description text not null,
  operation_type text not null,
  standard_time_per_unit_minutes numeric not null check (standard_time_per_unit_minutes > 0),
  allocated_time_minutes numeric not null check (allocated_time_minutes >= 0),
  expected_quantity integer generated always as (
    floor(allocated_time_minutes / standard_time_per_unit_minutes)
  ) stored,
  actual_completed_qty integer not null default 0 check (actual_completed_qty >= 0),
  rejected_qty integer not null default 0 check (rejected_qty >= 0),
  rework_qty integer not null default 0 check (rework_qty >= 0),
  start_time timestamptz,
  end_time timestamptz,
  actual_time_spent_minutes integer generated always as (
    case
      when start_time is not null and end_time is not null
        then round(extract(epoch from (end_time - start_time)) / 60)::integer
      else null
    end
  ) stored,
  status text not null default 'NotStarted'
    check (status in ('NotStarted', 'InProgress', 'Completed', 'OnHold')),
  notes text,
  organization_id uuid not null default public.current_organization_id() references public.organizations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_job_cards_org_jobno
  on public.job_cards(organization_id, job_no);

create index if not exists idx_job_cards_org_project
  on public.job_cards(organization_id, project_id);

create index if not exists idx_job_cards_org_employee
  on public.job_cards(organization_id, employee_id);

drop trigger if exists trg_job_cards_updated_at on public.job_cards;
create trigger trg_job_cards_updated_at
  before update on public.job_cards
  for each row execute function public.set_updated_at_timestamp();

alter table public.job_cards enable row level security;

drop policy if exists job_cards_select on public.job_cards;
create policy job_cards_select on public.job_cards
  for select using (has_permission('job_cards','view') and organization_id = current_organization_id());

drop policy if exists job_cards_insert on public.job_cards;
create policy job_cards_insert on public.job_cards
  for insert with check (has_permission('job_cards','create') and organization_id = current_organization_id());

drop policy if exists job_cards_update on public.job_cards;
create policy job_cards_update on public.job_cards
  for update using (has_permission('job_cards','edit') and organization_id = current_organization_id());

drop policy if exists job_cards_delete on public.job_cards;
create policy job_cards_delete on public.job_cards
  for delete using (has_permission('job_cards','delete') and organization_id = current_organization_id());

insert into public.schema_migrations (version, description, checksum)
values (
  '20260831_049_phase49_job_cards',
  'Phase 49: adds public.job_cards - employee-assigned, time-based work assignment/execution, real FKs to projects (required, cascades) and employees (optional, SET NULL + employee_name snapshot). expected_quantity and actual_time_spent_minutes are GENERATED STORED columns (never client-writable), derived from standard_time_per_unit_minutes/allocated_time_minutes and start_time/end_time respectively - floor() rounding, no existing convention found elsewhere in the codebase to instead follow. New job_cards permission module, org-scoped RLS mirroring every existing table exactly.',
  'phase49-job-cards-v1'
)
on conflict (version) do nothing;

commit;
