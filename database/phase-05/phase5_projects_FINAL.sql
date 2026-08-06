-- FabFlow ERP - Phase 5: Projects
-- Unlike Phase 2-4, projects and customers are NOT new tables. They are
-- 2 of the 14 pre-existing tables from "a prior, separate, partial
-- schema effort" that Phase 1 only added organization_id + RLS to
-- (phase1_architecture.md 2.8, 3). This migration is the first to touch
-- their actual structure. It EXTENDS the existing projects table and
-- CORRECTS one existing constraint - it does not create projects or
-- customers, and does not touch customers' structure at all.
--
-- Reused, not duplicated: the live table already has project_number,
-- name, and quantity columns matching the frontend's projectNo/
-- projectName/totalQty concepts. This migration adds NOT NULL (and a
-- CHECK on quantity) to those EXISTING columns - it does not add new
-- project_no/project_name/total_qty columns alongside them. Confirmed
-- live via \d public.projects before writing any of this file.
--
-- Existing data preserved, not deleted: the live database's only
-- non-Phase-1-4 business data is one connected chain - a "Test
-- Customer", one "Test Project" against it, and one "Partially Paid"
-- invoice against that project. That project's project_number was
-- NULL. Per explicit instruction, this chain is treated as existing
-- data, not removed - this migration backfills a real generated
-- project_number for it (via the same generate_project_number()
-- function real future usage will call, not a hardcoded literal, so
-- the document_counters state stays correctly synchronized and no
-- future collision is possible) before adding the NOT NULL constraint
-- that could not otherwise be added safely.
--
-- Deliberately untouched, with evidence: `status` and `value` already
-- exist on the live table but correspond to no field anywhere on the
-- frontend's Project type and no computed logic anywhere in the
-- frontend (checked directly against Dashboard.tsx's Order Pipeline
-- widget, which computes from array lengths, not any status column).
-- No constraint, default, or semantics are invented for either here.
-- The existing UNIQUE(project_number) constraint is global rather than
-- organization-scoped, unlike every other numbered document in this
-- project - left exactly as-is, since only one organization exists
-- today and changing it would not preserve or fix any real behavior,
-- only pre-empt a currently non-existent multi-org scenario.
--
-- Confirmed dead, not carried into schema: the frontend's top-level
-- Project.poNumber/poDate/poFiles fields have zero read call sites
-- anywhere in the codebase (traced exhaustively) - not proposed as
-- columns. Project.pos[]/assignedEmployeeIds[] remain genuinely live in
-- the frontend today, but are NOT reintroduced as columns here, because
-- Phase 2's project_employees and Phase 3's project_purchase_orders
-- already exist as their normalized, frozen replacements - adding
-- array columns alongside them would create two permanent database
-- sources for the same fact, which is what this project's standing
-- rules explicitly forbid. Those junction tables remain the sole
-- authority; a future integration phase bridges the array shape to
-- them without any change to the user-facing screens.
--
-- The one correction to a pre-existing constraint in this file:
-- projects.customer_id's FK is changed from ON DELETE CASCADE to the
-- default (no special action). deleteCustomer() in the live frontend
-- (store.ts) already unconditionally blocks deleting any customer that
-- has linked projects - the live CASCADE permits an outcome the
-- application was specifically built to make impossible. This closes
-- that gap without changing anything reachable through the app, since
-- the guarded UI path never exercises the CASCADE branch today.
--
-- Idempotent: safe to run multiple times. Registers itself in
-- schema_migrations as its final statement. Zero changes to any frozen
-- Phase 1-4 object - document_counters and set_updated_at_timestamp()
-- (both Phase 2) are reused unmodified; has_permission()/
-- current_organization_id() (Phase 1) are relied upon only through the
-- RLS policies Phase 1 already wrote for projects/customers, which are
-- confirmed to already match live frontend gating exactly and are not
-- touched by this migration at all.

begin;

-- ============================================================
-- 1. Extend projects with the columns the frontend's Project type
--    needs that do not already exist under any name. All nullable,
--    matching the frontend's own optionality for each (none of these
--    are required at creation, unlike project_number/name/quantity
--    below). parent_project_id/source_project_id are real
--    self-referencing FKs, not bare uuid columns, because both are
--    used for genuine relational lookups in repeatProject() and
--    ProjectDetail.tsx (store.ts, confirmed live) - ON DELETE SET NULL
--    because no code path in the frontend ever blocks or reacts to
--    deleting a project that has repeat-order children, so RESTRICT
--    would be stricter than today's app, and CASCADE would delete
--    real sibling project records with no frontend intent behind it.
-- ============================================================

alter table public.projects add column if not exists work_description text;
alter table public.projects add column if not exists production_version text;
alter table public.projects add column if not exists customer_visible_name text;
alter table public.projects add column if not exists internal_order_code text;
alter table public.projects add column if not exists project_type text;
alter table public.projects add column if not exists parent_project_id uuid references public.projects(id) on delete set null;
alter table public.projects add column if not exists source_project_id uuid references public.projects(id) on delete set null;
alter table public.projects add column if not exists repeat_order_seq integer;
alter table public.projects add column if not exists original_project_name text;
alter table public.projects add column if not exists activity_log jsonb;

-- updated_at: NOT NULL with a constant DEFAULT is a safe, single-pass
-- addition under Postgres 11+ (confirmed server version 17) - existing
-- rows are backfilled to the default automatically, no separate
-- backfill statement needed the way project_number's below does.
alter table public.projects add column if not exists updated_at timestamptz not null default now();

-- ============================================================
-- 2. generate_project_number() - identical, unmodified pattern to
--    generate_employee_code()/generate_quotation_number()/
--    generate_float_number(): atomic upsert against Phase 2's
--    document_counters (new counter_key 'PROJ'), same FLT-YYYY-NNN
--    -style format the frontend's own generateDocNo("PROJ") already
--    produces. Used both by the one-time backfill below and by any
--    future project-creation wiring.
-- ============================================================

create or replace function public.generate_project_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value integer;
begin
  insert into public.document_counters (organization_id, counter_key, current_value)
  values (p_organization_id, 'PROJ', 1)
  on conflict (organization_id, counter_key)
  do update set current_value = public.document_counters.current_value + 1
  returning current_value into v_value;

  return 'PROJ-' || extract(year from now())::text || '-' || lpad(v_value::text, 3, '0');
end;
$$;

-- ============================================================
-- 3. Backfill: give the existing "Test Project" row (the only row with
--    a NULL project_number) a real generated number, via the same
--    function real usage will call - not a hardcoded literal - so
--    document_counters' PROJ counter for this organization starts
--    correctly synchronized and no future call can ever collide with
--    this backfilled value. Naturally idempotent: matches zero rows
--    once every project_number is populated, on this and every future
--    run of this file.
-- ============================================================

update public.projects
set project_number = public.generate_project_number(organization_id)
where project_number is null;

-- ============================================================
-- 4. NOT NULL / CHECK on the existing project_number, name, customer_id,
--    and quantity columns - not new columns, the same ones already
--    live. Each mirrors validation the frontend already enforces at
--    every real creation path (Projects.tsx: customerId and
--    projectName both explicitly required in the same validation
--    check; totalQty required and > 0; projectNo always generated,
--    never blank) - confirmed safe against the one existing row before
--    writing this (name='Test Project', customer_id populated with a
--    valid reference, quantity=100, project_number now backfilled by
--    section 3). All four ALTER COLUMN SET NOT NULL statements are
--    naturally idempotent - a no-op if already set.
-- ============================================================

alter table public.projects alter column project_number set not null;
alter table public.projects alter column name set not null;
alter table public.projects alter column customer_id set not null;
alter table public.projects alter column quantity set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_quantity_check' and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects add constraint projects_quantity_check check (quantity > 0);
  end if;
end $$;

-- ============================================================
-- 5. Correct customer_id's ON DELETE behavior. The existing FK is
--    CASCADE; deleteCustomer() in the live frontend (store.ts)
--    unconditionally blocks deleting any customer with linked
--    projects, so this closes a live gap between what the database
--    permits and what the application was built to prevent, without
--    changing anything reachable through the guarded UI path (which
--    never reaches the CASCADE branch today). Drop-then-add is
--    naturally idempotent and reuses the constraint's existing default
--    name for continuity.
-- ============================================================

alter table public.projects drop constraint if exists projects_customer_id_fkey;
alter table public.projects add constraint projects_customer_id_fkey
  foreign key (customer_id) references public.customers(id);

-- ============================================================
-- 6. updated_at maintenance - reuses Phase 2's
--    set_updated_at_timestamp() completely unmodified.
-- ============================================================

drop trigger if exists trg_projects_updated_at on public.projects;
create trigger trg_projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at_timestamp();

-- ============================================================
-- 7. RLS - deliberately absent from this migration. Phase 1 already
--    enabled RLS on projects and customers and already wrote
--    projects_select/insert/update/delete and customers_select/
--    insert/update/delete, each has_permission('<module>','<action>')
--    and organization_id = current_organization_id(). Confirmed live,
--    byte-for-byte, to already match what Projects.tsx/ProjectDetail.tsx
--    gate on (canView/canCreate/canEdit/canDelete, single-module, no
--    cross-module OR). Nothing here needs to change or be added.
-- ============================================================

-- ============================================================
-- 8. Register this migration. Deliberately the last statement before
--    commit - its presence in schema_migrations after a run is proof
--    the entire transaction above succeeded, not just that it started.
--    Checksum is the SHA-256 of this file's content (sections 1-7,
--    i.e. everything above this statement), computed at authoring time.
-- ============================================================

insert into public.schema_migrations (version, description, checksum)
values (
  '20260806_005_phase5_projects',
  'Phase 5: extends the pre-existing projects table (not a new table - one of Phase 1''s 14 pre-existing ERP tables). Adds work_description, production_version, customer_visible_name, internal_order_code, project_type, parent_project_id/source_project_id (self-referencing FKs, ON DELETE SET NULL), repeat_order_seq, original_project_name, activity_log (jsonb), updated_at + trigger (reuses set_updated_at_timestamp unmodified). Reuses existing project_number/name/customer_id/quantity columns (not duplicated as project_no/project_name/total_qty) - backfills the one existing NULL project_number via a new generate_project_number() function (reuses document_counters unmodified, new counter_key PROJ) before adding NOT NULL, then adds NOT NULL to name/customer_id and NOT NULL + CHECK(quantity > 0) to quantity, matching validation the frontend already enforces at every real creation path. Corrects projects.customer_id FK from ON DELETE CASCADE to default, matching deleteCustomer()''s existing guard against deleting a customer with linked projects. status and value columns, the global (non-org-scoped) UNIQUE(project_number) constraint, and all Phase 1 RLS policies on projects/customers are confirmed already correct and deliberately untouched. Zero changes to any frozen Phase 1-4 object.',
  '89d561c9423bb1cf6c723226ef3dda74c1471b2247cbf84c91a28c5fa1f3934b'
)
on conflict (version) do nothing;

commit;
