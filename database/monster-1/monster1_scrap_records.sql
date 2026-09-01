-- Monster-1 — Scrap Records persistence (was 100% local-only Zustand
-- state, no Supabase table at all — confirmed via schema query before
-- writing this, not assumed). Single flat table, no shape-mismatch
-- ambiguity: ScrapRecord (types.ts) maps 1:1 onto this table.
-- projectName is intentionally NOT a column — it's derived client-side
-- from project_id exactly like every other domain table in this schema
-- (machine_service_usage, inventory_purchases, etc.); ScrapManagement.tsx's
-- own projectName field is a resolved-at-write-time convenience, not an
-- independent fact.
--
-- RLS mirrors ScrapManagement.tsx's own permission checks exactly:
-- pView/pCreate/pEdit/pDelete all gate on the "inventory" module, not a
-- separate "scrap" module — scrap is inventory-adjacent in this app,
-- confirmed directly from the page's canView/canCreate/canEdit/canDelete
-- calls, not assumed.

begin;

create table if not exists public.scrap_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id(),
  project_id uuid references public.projects(id) on delete set null,
  stage text,
  material_type text not null,
  unit text not null default 'kg',
  generated_qty numeric not null default 0,
  reusable_qty numeric not null default 0,
  sold_qty numeric not null default 0,
  disposed_qty numeric not null default 0,
  scrap_value numeric,
  status text not null default 'In Stock',
  notes text,
  recorded_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.scrap_records enable row level security;

drop policy if exists scrap_records_select on public.scrap_records;
create policy scrap_records_select on public.scrap_records
  for select using (
    has_permission('inventory', 'view')
    and organization_id = public.current_organization_id()
  );

drop policy if exists scrap_records_insert on public.scrap_records;
create policy scrap_records_insert on public.scrap_records
  for insert with check (
    has_permission('inventory', 'create')
    and organization_id = public.current_organization_id()
  );

drop policy if exists scrap_records_update on public.scrap_records;
create policy scrap_records_update on public.scrap_records
  for update using (
    has_permission('inventory', 'edit')
    and organization_id = public.current_organization_id()
  );

drop policy if exists scrap_records_delete on public.scrap_records;
create policy scrap_records_delete on public.scrap_records
  for delete using (
    has_permission('inventory', 'delete')
    and organization_id = public.current_organization_id()
  );

drop trigger if exists trg_scrap_records_updated_at on public.scrap_records;
create trigger trg_scrap_records_updated_at
  before update on public.scrap_records
  for each row execute function set_updated_at_timestamp();

commit;
