-- FabFlow ERP — Phase 15: QMS Master Data (Supabase migration, Phase 2 of
-- the approved QMS migration plan — see the read-only architecture review
-- delivered before this file was written).
--
-- Migrates 7 of the 12 IndexedDB (`fabflow-qms` v2) master-data stores:
-- processes, operations, inspectionMethods, characteristics, templates,
-- favorites, inspectionStages. Inspection Sheets / stage entries /
-- completions / documents / history (the other 5 stores) are explicitly
-- OUT OF SCOPE for this migration — they stay IndexedDB-backed until a
-- later, separately-approved phase.
--
-- IDs are preserved exactly: every IndexedDB row in these 7 stores already
-- uses crypto.randomUUID() (confirmed by reading qms/api/index.ts,
-- qms/api/inspections.ts, qms/db/seed.ts in full) — a `uuid` primary key
-- accepts those existing string values unchanged. The one exception is
-- `favorites`, whose id (`${userId}__${characteristicId}`) is a composite
-- string, not a uuid — kept as a `text` primary key, exactly as-is (see
-- section 6).
--
-- Phase 32 compatibility (critical, verified against
-- database/phase-12/phase12_qms_inspection_gate_persistence_v2_ascii_safe.sql):
-- project_qms_inspections.library_inspection_id and
-- project_qms_inspection_characteristics.library_characteristic_id are
-- soft `text` references (no FK) into InspectionStageDefinition.id /
-- QualityCharacteristic.id — because until now those tables didn't exist
-- in Postgres. This migration does NOT touch Phase 32's tables, columns,
-- policies, functions, or triggers in any way. Because
-- inspection_stage_definitions.id and quality_characteristics.id below
-- preserve the exact same uuid values the IndexedDB rows already have,
-- Phase 32's existing soft text references keep resolving correctly by
-- plain string equality — no Phase 32 change is required or made.
--
-- Read-only vs read/write master data (confirmed by grepping every
-- qms/api/*.ts function): processes, operations, inspectionMethods, and
-- inspectionStages have NO create/update/delete function anywhere in the
-- current app — they are seed-once, read-only master lists. Only
-- characteristics (create/update/status), templates (full CRUD), and
-- favorites (toggle/bulk-add) are actually mutable through the existing
-- UI today. RLS below still grants full select/insert/update/delete on
-- every table for a permissioned caller (forward-compatible, matches the
-- Drawing Repository migration's own precedent of not under-provisioning
-- RLS just because today's UI doesn't yet exercise every verb) — this
-- does not change what the current frontend actually does.
--
-- customer_scope: inspected CharacteristicFormDialog.tsx directly — the
-- field is a controlled <Select> populated only from real `customers`
-- rows, with a sentinel ("__generic__") that the frontend normalizes to
-- undefined before saving. The stored value is therefore always either
-- absent or a genuine customers.id — safe to become a real, nullable FK.
--
-- Seed data: this migration creates EMPTY tables only. No demo/starter
-- rows are inserted here — populating them (if desired at all, given
-- Supabase data is organization-wide while the old IndexedDB seed was
-- per-browser) is a separate, not-yet-made decision, deliberately not
-- folded into schema creation.
--
-- Idempotent: safe to re-run. Touches no existing table, policy, trigger,
-- function, or permission. Reuses phase2's set_updated_at_timestamp() and
-- the existing quality_characteristics.{view,create,edit,delete}
-- permission module unmodified — no new permission module introduced.

begin;

-- ══════════════════════════════════════════════════════════════════════
-- 1. manufacturing_processes — read-only master list today (no
--    create/update/delete function exists in qms/api/index.ts).
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.manufacturing_processes (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  name text not null,
  sequence integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_manufacturing_processes_org on public.manufacturing_processes (organization_id);

-- ══════════════════════════════════════════════════════════════════════
-- 2. operations — read-only master list. requiredSkills/requiredMachines
--    are free-text name arrays (Machinery is local-only, confirmed by the
--    prior Supabase integration audit — no real FK target exists).
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.operations (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  process_id uuid not null references public.manufacturing_processes(id),
  name text not null,
  sequence integer not null,
  department text,
  required_skills text[] not null default '{}',
  required_machines text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_operations_org_process on public.operations (organization_id, process_id);

-- ══════════════════════════════════════════════════════════════════════
-- 3. inspection_methods — read-only master list.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.inspection_methods (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  name text not null,
  type text not null,
  -- {options?: string[], unit?: string} — matches InspectionMethod.config exactly.
  config jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint chk_inspection_methods_type check (type in (
    'PassFail','Numeric','MultiNumeric','Text','Dropdown','Checkbox',
    'Photo','File','Certificate','BarcodeScan','QRScan'
  ))
);

create index if not exists idx_inspection_methods_org on public.inspection_methods (organization_id);

-- ══════════════════════════════════════════════════════════════════════
-- 4. quality_characteristics — the one master-data table with real
--    create/update/status-change functions today (qms/api/index.ts).
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.quality_characteristics (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  name text not null,
  description text not null,
  category text not null,
  process_id uuid not null references public.manufacturing_processes(id),
  operation_id uuid not null references public.operations(id),
  criticality text not null,
  inspection_method_id uuid not null references public.inspection_methods(id),
  acceptance_criteria text not null,
  tolerance_nominal numeric,
  tolerance_plus numeric,
  tolerance_minus numeric,
  unit text,
  measuring_instrument text,
  standard_reference text,
  drawing_reference text,
  evidence_required boolean not null default false,
  photo_required boolean not null default false,
  -- Real FK — see header note. NULL = generic/all customers, exactly
  -- matching the existing "undefined = generic" meaning.
  customer_scope uuid references public.customers(id),
  tags text[] not null default '{}',
  version integer not null default 1,
  status text not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_quality_characteristics_criticality check (criticality in (
    'SafetyCritical','FunctionalCritical','RegulatoryCritical',
    'CustomerCritical','Cosmetic','ProcessCritical'
  )),
  constraint chk_quality_characteristics_status check (status in ('Active','Obsolete'))
);

create index if not exists idx_quality_characteristics_org on public.quality_characteristics (organization_id);
create index if not exists idx_quality_characteristics_process on public.quality_characteristics (process_id);
create index if not exists idx_quality_characteristics_operation on public.quality_characteristics (operation_id);
create index if not exists idx_quality_characteristics_method on public.quality_characteristics (inspection_method_id);
create index if not exists idx_quality_characteristics_status on public.quality_characteristics (status);
create index if not exists idx_quality_characteristics_category on public.quality_characteristics (category);
create index if not exists idx_quality_characteristics_customer_scope on public.quality_characteristics (customer_scope);

drop trigger if exists trg_quality_characteristics_updated_at on public.quality_characteristics;
create trigger trg_quality_characteristics_updated_at
  before update on public.quality_characteristics
  for each row execute function public.set_updated_at_timestamp();

-- ══════════════════════════════════════════════════════════════════════
-- 5. qms_templates — full CRUD today. characteristic_ids is a soft
--    reference array (Postgres cannot FK individual array elements) — the
--    same soft-array convention this table already used in IndexedDB.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.qms_templates (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  name text not null,
  category text not null,
  description text,
  characteristic_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_qms_templates_org on public.qms_templates (organization_id);

drop trigger if exists trg_qms_templates_updated_at on public.qms_templates;
create trigger trg_qms_templates_updated_at
  before update on public.qms_templates
  for each row execute function public.set_updated_at_timestamp();

-- ══════════════════════════════════════════════════════════════════════
-- 6. qms_favorites — id preserved EXACTLY as the existing composite
--    string `${userId}__${characteristicId}` (text primary key, never
--    forced into uuid — see header note and RLS section 8 below).
--    user_id is a real auth.users FK: QmsFavorite.userId has always come
--    from AuthContext's currentUser.id, which is a genuine auth.users
--    uuid for every session created since Priority 1.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.qms_favorites (
  id text primary key,
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  user_id uuid not null references auth.users(id),
  characteristic_id uuid not null references public.quality_characteristics(id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint uq_qms_favorites_user_characteristic unique (user_id, characteristic_id)
);

create index if not exists idx_qms_favorites_org_user on public.qms_favorites (organization_id, user_id);

-- ══════════════════════════════════════════════════════════════════════
-- 7. inspection_stage_definitions — read-only master list today (no
--    create function in qms/api/inspections.ts). This is the table
--    Phase 32's project_qms_inspections.library_inspection_id soft-
--    references by id — see header note.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.inspection_stage_definitions (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  name text not null,
  process_id uuid references public.manufacturing_processes(id),
  sequence integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_inspection_stage_definitions_org on public.inspection_stage_definitions (organization_id);
create index if not exists idx_inspection_stage_definitions_process on public.inspection_stage_definitions (process_id);

-- ══════════════════════════════════════════════════════════════════════
-- 8. RLS — reuses the existing quality_characteristics.{view,create,edit,
--    delete} permission module for all 7 tables (no second permission
--    system). qms_favorites is the one exception: self-only by row
--    (id = auth.uid()-owned), gated on quality_characteristics.view for
--    insert (must be able to see the library to favorite something in
--    it) rather than create/edit/delete — favoriting is a personal
--    bookmark, not an edit to the shared Library, matching how
--    getFavoriteIds() has always queried by the CURRENT user only.
-- ══════════════════════════════════════════════════════════════════════

alter table public.manufacturing_processes enable row level security;
alter table public.operations enable row level security;
alter table public.inspection_methods enable row level security;
alter table public.quality_characteristics enable row level security;
alter table public.qms_templates enable row level security;
alter table public.qms_favorites enable row level security;
alter table public.inspection_stage_definitions enable row level security;

drop policy if exists manufacturing_processes_select on public.manufacturing_processes;
create policy manufacturing_processes_select on public.manufacturing_processes for select
  using (has_permission('quality_characteristics','view') and organization_id = current_organization_id());
drop policy if exists manufacturing_processes_insert on public.manufacturing_processes;
create policy manufacturing_processes_insert on public.manufacturing_processes for insert
  with check (has_permission('quality_characteristics','create') and organization_id = current_organization_id());
drop policy if exists manufacturing_processes_update on public.manufacturing_processes;
create policy manufacturing_processes_update on public.manufacturing_processes for update
  using (has_permission('quality_characteristics','edit') and organization_id = current_organization_id())
  with check (has_permission('quality_characteristics','edit') and organization_id = current_organization_id());
drop policy if exists manufacturing_processes_delete on public.manufacturing_processes;
create policy manufacturing_processes_delete on public.manufacturing_processes for delete
  using (has_permission('quality_characteristics','delete') and organization_id = current_organization_id());

drop policy if exists operations_select on public.operations;
create policy operations_select on public.operations for select
  using (has_permission('quality_characteristics','view') and organization_id = current_organization_id());
drop policy if exists operations_insert on public.operations;
create policy operations_insert on public.operations for insert
  with check (has_permission('quality_characteristics','create') and organization_id = current_organization_id());
drop policy if exists operations_update on public.operations;
create policy operations_update on public.operations for update
  using (has_permission('quality_characteristics','edit') and organization_id = current_organization_id())
  with check (has_permission('quality_characteristics','edit') and organization_id = current_organization_id());
drop policy if exists operations_delete on public.operations;
create policy operations_delete on public.operations for delete
  using (has_permission('quality_characteristics','delete') and organization_id = current_organization_id());

drop policy if exists inspection_methods_select on public.inspection_methods;
create policy inspection_methods_select on public.inspection_methods for select
  using (has_permission('quality_characteristics','view') and organization_id = current_organization_id());
drop policy if exists inspection_methods_insert on public.inspection_methods;
create policy inspection_methods_insert on public.inspection_methods for insert
  with check (has_permission('quality_characteristics','create') and organization_id = current_organization_id());
drop policy if exists inspection_methods_update on public.inspection_methods;
create policy inspection_methods_update on public.inspection_methods for update
  using (has_permission('quality_characteristics','edit') and organization_id = current_organization_id())
  with check (has_permission('quality_characteristics','edit') and organization_id = current_organization_id());
drop policy if exists inspection_methods_delete on public.inspection_methods;
create policy inspection_methods_delete on public.inspection_methods for delete
  using (has_permission('quality_characteristics','delete') and organization_id = current_organization_id());

drop policy if exists quality_characteristics_select on public.quality_characteristics;
create policy quality_characteristics_select on public.quality_characteristics for select
  using (has_permission('quality_characteristics','view') and organization_id = current_organization_id());
drop policy if exists quality_characteristics_insert on public.quality_characteristics;
create policy quality_characteristics_insert on public.quality_characteristics for insert
  with check (has_permission('quality_characteristics','create') and organization_id = current_organization_id());
drop policy if exists quality_characteristics_update on public.quality_characteristics;
create policy quality_characteristics_update on public.quality_characteristics for update
  using (has_permission('quality_characteristics','edit') and organization_id = current_organization_id())
  with check (has_permission('quality_characteristics','edit') and organization_id = current_organization_id());
drop policy if exists quality_characteristics_delete on public.quality_characteristics;
create policy quality_characteristics_delete on public.quality_characteristics for delete
  using (has_permission('quality_characteristics','delete') and organization_id = current_organization_id());

drop policy if exists qms_templates_select on public.qms_templates;
create policy qms_templates_select on public.qms_templates for select
  using (has_permission('quality_characteristics','view') and organization_id = current_organization_id());
drop policy if exists qms_templates_insert on public.qms_templates;
create policy qms_templates_insert on public.qms_templates for insert
  with check (has_permission('quality_characteristics','create') and organization_id = current_organization_id());
drop policy if exists qms_templates_update on public.qms_templates;
create policy qms_templates_update on public.qms_templates for update
  using (has_permission('quality_characteristics','edit') and organization_id = current_organization_id())
  with check (has_permission('quality_characteristics','edit') and organization_id = current_organization_id());
drop policy if exists qms_templates_delete on public.qms_templates;
create policy qms_templates_delete on public.qms_templates for delete
  using (has_permission('quality_characteristics','delete') and organization_id = current_organization_id());

drop policy if exists qms_favorites_select on public.qms_favorites;
create policy qms_favorites_select on public.qms_favorites for select
  using (user_id = auth.uid());
drop policy if exists qms_favorites_insert on public.qms_favorites;
create policy qms_favorites_insert on public.qms_favorites for insert
  with check (
    user_id = auth.uid()
    and organization_id = current_organization_id()
    and has_permission('quality_characteristics','view')
  );
drop policy if exists qms_favorites_delete on public.qms_favorites;
create policy qms_favorites_delete on public.qms_favorites for delete
  using (user_id = auth.uid());

drop policy if exists inspection_stage_definitions_select on public.inspection_stage_definitions;
create policy inspection_stage_definitions_select on public.inspection_stage_definitions for select
  using (has_permission('quality_characteristics','view') and organization_id = current_organization_id());
drop policy if exists inspection_stage_definitions_insert on public.inspection_stage_definitions;
create policy inspection_stage_definitions_insert on public.inspection_stage_definitions for insert
  with check (has_permission('quality_characteristics','create') and organization_id = current_organization_id());
drop policy if exists inspection_stage_definitions_update on public.inspection_stage_definitions;
create policy inspection_stage_definitions_update on public.inspection_stage_definitions for update
  using (has_permission('quality_characteristics','edit') and organization_id = current_organization_id())
  with check (has_permission('quality_characteristics','edit') and organization_id = current_organization_id());
drop policy if exists inspection_stage_definitions_delete on public.inspection_stage_definitions;
create policy inspection_stage_definitions_delete on public.inspection_stage_definitions for delete
  using (has_permission('quality_characteristics','delete') and organization_id = current_organization_id());

-- ══════════════════════════════════════════════════════════════════════
-- 9. Register this migration.
-- ══════════════════════════════════════════════════════════════════════

insert into public.schema_migrations (version, description, checksum)
values (
  '20260811_015_phase15_qms_master_data',
  'Phase 15: QMS master data (Phase 2 of the approved QMS Supabase migration) — manufacturing_processes, operations, inspection_methods, quality_characteristics, qms_templates, qms_favorites, inspection_stage_definitions. Migrates 7 of 12 fabflow-qms IndexedDB v2 stores; inspection_sheets/stage entries/completions/documents/history stay IndexedDB-backed, out of scope. IDs preserved exactly as existing crypto.randomUUID() values (qms_favorites keeps its existing composite text id `${userId}__${characteristicId}` unchanged, not forced into uuid). Real FKs added only to genuinely Supabase-backed targets: operations/quality_characteristics/inspection_stage_definitions -> manufacturing_processes, quality_characteristics -> operations/inspection_methods, quality_characteristics.customer_scope -> customers (verified via CharacteristicFormDialog.tsx that the field is always a real customers.id or absent, never free text), qms_favorites.user_id -> auth.users. No FK to Machinery (local-only, no Supabase table) for requiredSkills/requiredMachines - kept as free-text arrays, matching existing meaning. Reuses quality_characteristics.{view,create,edit,delete} for all 7 tables (qms_favorites additionally self-scoped by user_id = auth.uid()) - no new permission module. Reuses set_updated_at_timestamp() unmodified. Zero changes to Phase 32 (project_qms_inspections and its 4 sibling tables) - its existing soft text references to InspectionStageDefinition.id/QualityCharacteristic.id keep resolving correctly since those ids are preserved exactly. No seed/demo data inserted - all 7 tables start empty.',
  '31bd9dad732389f148e4a2a3ff76ef2d4afc81b87cbd6a431d87d7f853dc0629'
)
on conflict (version) do nothing;

commit;
