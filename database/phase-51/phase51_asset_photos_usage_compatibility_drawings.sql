-- ============================================================================
-- Phase 51: Group 2 — Asset Photos, Asset Usage Events, Machine↔Die
-- compatibility metadata, Drawing Links extension
-- ============================================================================
-- Version:     20260902_051_phase51_asset_photos_usage_compatibility_drawings
-- Scope:       Approved Group 2 architecture (Phases 3-8, see chat). Phase 3
--              (Asset ID) requires NO schema change here - machine_code/
--              die_code/tool_code are already the correct, unique,
--              auto-generated identity (uq_machines_org_code /
--              uq_dies_org_code / uq_tools_org_code, all confirmed live).
--              machines.asset_id and dies.compatible_machine_id are both
--              left exactly as-is: deprecated in place, not read by any new
--              code, not dropped. (asset_id is a hand-typed, non-unique,
--              currently-garbage-valued field on 1 of 2 machines;
--              compatible_machine_id is the pre-many-to-many single-machine
--              field Dies.tsx still uses today, superseded by machine_dies
--              which MachineDetail.tsx's side already writes to correctly.)
--
-- Design notes:
--   - asset_photos.owner_type/owner_id is a polymorphic reference with no
--     direct FK, mirroring drawings.owner_type/owner_id (already live,
--     same structural reason: one column cannot FK four different
--     tables). machines.primary_image_data / dies.photo_data /
--     tools.photo_data are untouched - this is a new, additive photo
--     store, not a replacement. inventory_items gets photo support for
--     the first time via this same table - no new inventory-specific
--     photo column is added.
--   - has_asset_permission() is one small reusable SQL function shared by
--     asset_photos' table RLS, asset_usage_events' table RLS, and the new
--     Storage bucket's RLS below - avoids writing the same
--     owner_type-to-permission-module mapping four separate times. Maps
--     machine->machinery, die->tooling_dies, tool->tools,
--     inventory_item->inventory - the four permission modules that
--     already exist and already have view/create/edit/delete.
--   - asset_usage_events mirrors tool_assignment_history's own shape
--     (one row per event - e.g. issued/returned are two separate rows,
--     never one row with two timestamp columns) - insert+select-only
--     RLS, matching that table's own already-approved insert-only-audit-
--     trail design (confirmed live: tool_assignment_history has no
--     update/delete policy today). tool_assignment_history itself is
--     untouched and keeps being written to by the existing Tools flow -
--     Option A (coexist), no migration performed in this phase.
--   - job_card_id is nullable now so Phase 12 can start writing it later
--     without a further migration. job_cards exists (Phase 49) but has
--     zero rows in current data - the FK is safe regardless.
--   - machine_dies gets exactly 3 additive nullable/defaulted columns -
--     no existing row's meaning changes (status defaults 'active', the 3
--     existing machine_dies rows are unaffected).
--   - drawing_links' CHECK constraint is widened, not dropped/rebuilt from
--     scratch, preserving its existing name and every existing row
--     (3 live 'die' rows) untouched.
--   - asset-photos Storage bucket follows the exact same private-bucket +
--     folder-scoped-RLS pattern already live for engineering-drawings/
--     agent-documents (Phase 14 / Phase L.3) - object key convention
--     {organization_id}/{owner_type}/{owner_id}/{uuid}-{original_filename}
--     lets the storage policies reuse has_asset_permission() directly via
--     (storage.foldername(name))[2] as the owner_type argument.
--
-- Every DDL statement is idempotent: safe to re-run against a database
-- that already has it applied.
-- ============================================================================

begin;

-- ── Shared permission-mapping helper ──────────────────────────────────
create or replace function public.has_asset_permission(p_asset_type text, p_action text)
returns boolean
language sql
stable
as $$
  select case p_asset_type
    when 'machine'        then has_permission('machinery', p_action)
    when 'die'             then has_permission('tooling_dies', p_action)
    when 'tool'             then has_permission('tools', p_action)
    when 'inventory_item'  then has_permission('inventory', p_action)
    else false
  end;
$$;

-- ── asset_photos ────────────────────────────────────────────────────
create table if not exists public.asset_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id() references public.organizations(id),
  owner_type text not null check (owner_type in ('machine','die','tool','inventory_item')),
  owner_id uuid not null,
  storage_path text not null,
  original_filename text,
  mime_type text,
  size_bytes bigint,
  display_order integer not null default 0,
  caption text,
  is_primary boolean not null default false,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_asset_photos_owner
  on public.asset_photos(organization_id, owner_type, owner_id, display_order);

-- At most one primary photo per asset.
create unique index if not exists uq_asset_photos_one_primary
  on public.asset_photos(owner_type, owner_id) where (is_primary);

drop trigger if exists trg_asset_photos_updated_at on public.asset_photos;
create trigger trg_asset_photos_updated_at
  before update on public.asset_photos
  for each row execute function public.set_updated_at_timestamp();

alter table public.asset_photos enable row level security;

drop policy if exists asset_photos_select on public.asset_photos;
create policy asset_photos_select on public.asset_photos
  for select using (
    has_asset_permission(owner_type, 'view')
    and organization_id = current_organization_id()
  );

drop policy if exists asset_photos_insert on public.asset_photos;
create policy asset_photos_insert on public.asset_photos
  for insert with check (
    has_asset_permission(owner_type, 'edit')
    and organization_id = current_organization_id()
  );

drop policy if exists asset_photos_update on public.asset_photos;
create policy asset_photos_update on public.asset_photos
  for update using (
    has_asset_permission(owner_type, 'edit')
    and organization_id = current_organization_id()
  );

drop policy if exists asset_photos_delete on public.asset_photos;
create policy asset_photos_delete on public.asset_photos
  for delete using (
    has_asset_permission(owner_type, 'edit')
    and organization_id = current_organization_id()
  );

-- ── asset_usage_events ──────────────────────────────────────────────
create table if not exists public.asset_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id() references public.organizations(id),
  asset_type text not null check (asset_type in ('machine','die','tool')),
  asset_id uuid not null,
  employee_id uuid references public.employees(id) on delete set null,
  employee_name text,
  project_id uuid references public.projects(id) on delete set null,
  job_card_id uuid references public.job_cards(id) on delete set null,
  event_type text not null check (event_type in ('issued','returned','used','maintenance','inspection','other')),
  quantity numeric,
  condition_before text,
  condition_after text,
  notes text,
  recorded_by uuid references auth.users(id),
  event_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_asset_usage_events_asset
  on public.asset_usage_events(organization_id, asset_type, asset_id, event_at desc);
create index if not exists idx_asset_usage_events_project
  on public.asset_usage_events(organization_id, project_id);
create index if not exists idx_asset_usage_events_job_card
  on public.asset_usage_events(organization_id, job_card_id);

alter table public.asset_usage_events enable row level security;

-- Insert-only audit trail, same shape as tool_assignment_history - no
-- update/delete policy is intentional, not an oversight.
drop policy if exists asset_usage_events_select on public.asset_usage_events;
create policy asset_usage_events_select on public.asset_usage_events
  for select using (
    has_asset_permission(asset_type, 'view')
    and organization_id = current_organization_id()
  );

drop policy if exists asset_usage_events_insert on public.asset_usage_events;
create policy asset_usage_events_insert on public.asset_usage_events
  for insert with check (
    has_asset_permission(asset_type, 'edit')
    and organization_id = current_organization_id()
  );

-- ── machine_dies: compatibility metadata (additive only) ──────────────
alter table public.machine_dies
  add column if not exists purpose text,
  add column if not exists status text not null default 'active'
    check (status in ('active','inactive','restricted')),
  add column if not exists notes text;

-- ── drawing_links: widen linked_type to cover Tool + Inventory Item ────
alter table public.drawing_links
  drop constraint if exists drawing_links_linked_type_check;
alter table public.drawing_links
  add constraint drawing_links_linked_type_check
  check (linked_type = any (array['project','machine','vendor','customer','die','tool','inventory_item']));

-- ── Storage: asset-photos bucket + RLS ─────────────────────────────────
-- Private, same shape as engineering-drawings/agent-documents. Object key
-- convention: {organization_id}/{owner_type}/{owner_id}/{uuid}-{filename}
-- - the 2nd folder segment being owner_type is what lets these policies
-- reuse has_asset_permission() the same way the table RLS above does.
insert into storage.buckets (id, name, public)
values ('asset-photos', 'asset-photos', false)
on conflict (id) do nothing;

drop policy if exists asset_photos_storage_select on storage.objects;
create policy asset_photos_storage_select on storage.objects
  for select using (
    bucket_id = 'asset-photos'
    and (storage.foldername(name))[1] = (current_organization_id())::text
    and has_asset_permission((storage.foldername(name))[2], 'view')
  );

drop policy if exists asset_photos_storage_insert on storage.objects;
create policy asset_photos_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'asset-photos'
    and (storage.foldername(name))[1] = (current_organization_id())::text
    and has_asset_permission((storage.foldername(name))[2], 'edit')
  );

drop policy if exists asset_photos_storage_update on storage.objects;
create policy asset_photos_storage_update on storage.objects
  for update using (
    bucket_id = 'asset-photos'
    and (storage.foldername(name))[1] = (current_organization_id())::text
    and has_asset_permission((storage.foldername(name))[2], 'edit')
  );

drop policy if exists asset_photos_storage_delete on storage.objects;
create policy asset_photos_storage_delete on storage.objects
  for delete using (
    bucket_id = 'asset-photos'
    and (storage.foldername(name))[1] = (current_organization_id())::text
    and has_asset_permission((storage.foldername(name))[2], 'edit')
  );

insert into public.schema_migrations (version, description, checksum)
values (
  '20260902_051_phase51_asset_photos_usage_compatibility_drawings',
  'Phase 51 (Group 2): new asset_photos (polymorphic photo store for machine/die/tool/inventory_item, Storage-backed via new private asset-photos bucket, replaces nothing - existing base64 photo_data columns untouched), new asset_usage_events (polymorphic usage-event log for machine/die/tool, mirrors tool_assignment_history shape, insert-only RLS, coexists with tool_assignment_history unmigrated), machine_dies gets purpose/status/notes columns, drawing_links_linked_type_check widened to include tool/inventory_item. New shared has_asset_permission() SQL helper reused by both new tables'' RLS and the new bucket''s Storage RLS. No changes to machines.asset_id or dies.compatible_machine_id (both deprecated in place, not dropped).',
  'phase51-group2-v1'
)
on conflict (version) do nothing;

commit;
