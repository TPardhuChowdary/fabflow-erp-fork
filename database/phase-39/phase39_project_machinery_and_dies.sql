-- FabFlow ERP — Phase 39: Project Resource Assignment (master scope
-- §10-13): Assigned Machinery + Assigned Dies/Tooling on a Project.
--
-- Exact mirror of project_employees (database/phase-02/
-- phase2_employees_v1_FINAL.sql): composite primary key, no surrogate
-- id, ON DELETE CASCADE both directions, org-scoped RLS gated on
-- projects.edit + the resource module's view permission.
--
-- Structural guarantee (§11, §22 — assignment must never create
-- revenue): these two tables carry no rate/cost/usage/revenue column
-- of any kind, and no other migration (billable_services,
-- machine_service_usage, Phase 40) reads from or writes to them.
-- Assigning a machine or die to a project is planning-only metadata.
--
-- Idempotent: safe to run multiple times.

begin;

-- ══════════════════════════════════════════════════════════════════════
-- 1. project_machinery
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.project_machinery (
  project_id uuid not null references public.projects(id) on delete cascade,
  machine_id uuid not null references public.machines(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, machine_id)
);

create index if not exists idx_project_machinery_org on public.project_machinery (organization_id);
create index if not exists idx_project_machinery_machine on public.project_machinery (machine_id);

drop trigger if exists trg_project_machinery_updated_at on public.project_machinery;
create trigger trg_project_machinery_updated_at
  before update on public.project_machinery
  for each row execute function public.set_updated_at_timestamp();

alter table public.project_machinery enable row level security;

drop policy if exists project_machinery_select on public.project_machinery;
create policy project_machinery_select on public.project_machinery for select
  using (has_permission('projects','view') and organization_id = current_organization_id());

drop policy if exists project_machinery_insert on public.project_machinery;
create policy project_machinery_insert on public.project_machinery for insert
  with check (has_permission('projects','edit') and has_permission('machinery','view') and organization_id = current_organization_id());

drop policy if exists project_machinery_update on public.project_machinery;
create policy project_machinery_update on public.project_machinery for update
  using (has_permission('projects','edit') and has_permission('machinery','view') and organization_id = current_organization_id());

drop policy if exists project_machinery_delete on public.project_machinery;
create policy project_machinery_delete on public.project_machinery for delete
  using (has_permission('projects','edit') and has_permission('machinery','view') and organization_id = current_organization_id());

-- ══════════════════════════════════════════════════════════════════════
-- 2. project_dies — serves both "Assigned Dies/Tooling" from the
--    Project side and "Project Assignments" history from the Die side
--    (§9 compatible_machine_id/original_project_id already covers
--    single-value provenance; this junction is the many-to-many
--    assignment layer on top, mirroring project_machinery exactly).
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.project_dies (
  project_id uuid not null references public.projects(id) on delete cascade,
  die_id uuid not null references public.dies(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, die_id)
);

create index if not exists idx_project_dies_org on public.project_dies (organization_id);
create index if not exists idx_project_dies_die on public.project_dies (die_id);

drop trigger if exists trg_project_dies_updated_at on public.project_dies;
create trigger trg_project_dies_updated_at
  before update on public.project_dies
  for each row execute function public.set_updated_at_timestamp();

alter table public.project_dies enable row level security;

drop policy if exists project_dies_select on public.project_dies;
create policy project_dies_select on public.project_dies for select
  using (has_permission('projects','view') and organization_id = current_organization_id());

drop policy if exists project_dies_insert on public.project_dies;
create policy project_dies_insert on public.project_dies for insert
  with check (has_permission('projects','edit') and has_permission('tooling_dies','view') and organization_id = current_organization_id());

drop policy if exists project_dies_update on public.project_dies;
create policy project_dies_update on public.project_dies for update
  using (has_permission('projects','edit') and has_permission('tooling_dies','view') and organization_id = current_organization_id());

drop policy if exists project_dies_delete on public.project_dies;
create policy project_dies_delete on public.project_dies for delete
  using (has_permission('projects','edit') and has_permission('tooling_dies','view') and organization_id = current_organization_id());

insert into public.schema_migrations (version, description, checksum)
values (
  '20260817_039_phase39_project_machinery_and_dies',
  'Phase 39: create public.project_machinery and public.project_dies junction tables (Assigned Machinery + Assigned Dies/Tooling on a Project). Exact mirror of project_employees: composite PK, cascade FKs, org-scoped RLS gated on projects.edit + the resource module''s view permission. No rate/cost/revenue column of any kind - assignment is planning-only and creates zero revenue.',
  'phase39-project-machinery-and-dies-v1'
)
on conflict (version) do nothing;

commit;
