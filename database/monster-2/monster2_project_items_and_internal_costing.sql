-- Monster-2 — Project Items + Internal Costing persistence. Both were
-- 100% local-only Zustand state (pure set() calls, no Supabase table at
-- all — confirmed via information_schema.tables query before writing
-- this, not assumed), reachable from real ProjectDetail tabs ("Items",
-- "Internal Costing"). A third local-only tab found in the same audit
-- pass ("Design Files") was deliberately retired in the frontend instead
-- of migrated — it duplicated the already-Supabase-backed Drawing
-- Repository — so it has no table here.
--
-- RLS mirrors ProjectDetail.tsx's own permission checks exactly: both
-- tabs are gated on pCreate/pEdit/pDelete = canCreate/canEdit/canDelete
-- (currentUser, "projects") — confirmed directly from the page's own
-- pCreate/pEdit/pDelete declarations, not assumed. Internal Costing has
-- a single combined "Save Costing" button with no separate create/edit
-- distinction in the UI, so both insert and update are gated on the one
-- "projects.edit" permission that action semantically matches.

begin;

-- ── project_items ("Items" tab) ─────────────────────────────────────────
create table if not exists public.project_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  description text,
  unit text,
  unit_price numeric,
  status text not null default 'Pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.project_items enable row level security;

drop policy if exists project_items_select on public.project_items;
create policy project_items_select on public.project_items
  for select using (
    has_permission('projects', 'view')
    and organization_id = public.current_organization_id()
  );

drop policy if exists project_items_insert on public.project_items;
create policy project_items_insert on public.project_items
  for insert with check (
    has_permission('projects', 'create')
    and organization_id = public.current_organization_id()
  );

drop policy if exists project_items_update on public.project_items;
create policy project_items_update on public.project_items
  for update using (
    has_permission('projects', 'edit')
    and organization_id = public.current_organization_id()
  );

drop policy if exists project_items_delete on public.project_items;
create policy project_items_delete on public.project_items
  for delete using (
    has_permission('projects', 'delete')
    and organization_id = public.current_organization_id()
  );

drop trigger if exists trg_project_items_updated_at on public.project_items;
create trigger trg_project_items_updated_at
  before update on public.project_items
  for each row execute function set_updated_at_timestamp();

-- ── internal_costings ("Internal Costing" tab) ──────────────────────────
-- One row per project (unique on project_id), matching the local
-- upsertInternalCosting()'s own "exists for this project ? update :
-- insert" semantics exactly.
create table if not exists public.internal_costings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id(),
  project_id uuid not null references public.projects(id) on delete cascade,
  raw_material_cost numeric not null default 0,
  cnc_cost numeric not null default 0,
  hardware_cost numeric not null default 0,
  powder_coating_cost numeric not null default 0,
  assembly_cost numeric not null default 0,
  packing_cost numeric not null default 0,
  labour_cost numeric,
  transport_cost numeric,
  machine_cost numeric,
  outsource_cost numeric,
  consumables_cost numeric,
  electricity_cost numeric,
  scrap_loss_cost numeric,
  extra_costs jsonb not null default '[]'::jsonb,
  manual_adjustments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id)
);

alter table public.internal_costings enable row level security;

drop policy if exists internal_costings_select on public.internal_costings;
create policy internal_costings_select on public.internal_costings
  for select using (
    has_permission('projects', 'view')
    and organization_id = public.current_organization_id()
  );

drop policy if exists internal_costings_insert on public.internal_costings;
create policy internal_costings_insert on public.internal_costings
  for insert with check (
    has_permission('projects', 'edit')
    and organization_id = public.current_organization_id()
  );

drop policy if exists internal_costings_update on public.internal_costings;
create policy internal_costings_update on public.internal_costings
  for update using (
    has_permission('projects', 'edit')
    and organization_id = public.current_organization_id()
  );

drop policy if exists internal_costings_delete on public.internal_costings;
create policy internal_costings_delete on public.internal_costings
  for delete using (
    has_permission('projects', 'delete')
    and organization_id = public.current_organization_id()
  );

drop trigger if exists trg_internal_costings_updated_at on public.internal_costings;
create trigger trg_internal_costings_updated_at
  before update on public.internal_costings
  for each row execute function set_updated_at_timestamp();

commit;
