-- Inventory Item -> Variant -> Specification architecture (see chat,
-- "Inventory Architecture Audit") — REVIEW ONLY, NOT APPLIED. Do not run
-- supabase db push against this file until explicitly approved.
--
-- Problem: inventory_items is a flat table today — every stock-keeping
-- unit is one row identified only by free-text `name` + `unit`, with a
-- `category` enum and ad-hoc columns that exist for exactly one category
-- each (brand/shade/ral_code/finish/powder_type for powder coating only;
-- pretreatment_tank for chemicals only — database/phase-36). There is no
-- concept of "these N rows are all MS Sheet, just different thickness."
-- A supplier bill line like "MS Sheet 1.2mm" today becomes an
-- independent row related to "MS Sheet 1.0mm" only by substring-matching
-- its name — no real grouping, no structured spec fields, no way to
-- query "all MS Sheet variants" or "everything with Thickness=1.2mm".
--
-- Design: two new small tables, plus two new nullable columns on the
-- EXISTING inventory_items table. Nothing about inventory_items' current
-- meaning changes — every existing row gets material_family_id = null
-- and specifications = null, identical to how it behaves today (a
-- standalone item with no family). current_stock stays exactly where it
-- is, per row — variant-level stock separation already falls out of
-- inventory_items' existing one-row-per-SKU design; this migration adds
-- grouping and structured specs on top of it, it does not change how
-- stock itself is tracked or calculated.
--
-- material_families is the "MS Sheet" concept — one row per material
-- family, scoped per organization.
create table public.material_families (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  name text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_material_families_org_name unique (organization_id, name)
);

create index idx_material_families_org on public.material_families (organization_id);

create trigger trg_material_families_updated_at
  before update on public.material_families
  for each row execute function public.set_updated_at_timestamp();

-- material_family_specifications is the TEMPLATE — which spec fields are
-- relevant for a family (e.g. Sheet -> Thickness/Length/Width/Grade),
-- not the values themselves. `position` controls display order (Thickness
-- before Grade, etc.) so the Add/Edit variant form can render fields in
-- a sensible, family-defined order.
create table public.material_family_specifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  material_family_id uuid not null references public.material_families(id) on delete cascade,
  spec_name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint uq_material_family_specifications_family_name unique (material_family_id, spec_name)
);

create index idx_material_family_specifications_family
  on public.material_family_specifications (material_family_id);

-- inventory_items gets the family link (which family this variant
-- belongs to) and the variant's own specification VALUES (matching the
-- family's template's spec_name keys, e.g.
-- {"Thickness":"1.2mm","Length":"8ft","Width":"4ft","Grade":"IS 2062"}).
-- Same jsonb key/value convention already proven twice this session for
-- Customer and Vendor Additional Details — reused here rather than a
-- third bespoke shape.
alter table public.inventory_items
  add column material_family_id uuid references public.material_families(id) on delete set null;

alter table public.inventory_items
  add column specifications jsonb null;

create index idx_inventory_items_material_family
  on public.inventory_items (material_family_id);

-- A GIN index lets "Thickness = 1.2mm"-style filtering (Part 6) run as
-- an indexed jsonb containment/path query instead of a full scan, once
-- the UI needs it — added now since it's a single cheap statement, not
-- a separate migration later.
create index idx_inventory_items_specifications
  on public.inventory_items using gin (specifications);

comment on column public.inventory_items.material_family_id is
  'Optional FK to material_families(id) -- which material family this item/variant belongs to (e.g. "MS Sheet"). NULL (every existing row) means this item has no family grouping, exactly as before this column existed.';
comment on column public.inventory_items.specifications is
  'Free-form spec-name/value pairs for this variant (e.g. {"Thickness":"1.2mm"}), keyed by the names defined in material_family_specifications for this item''s family. NULL means no structured specs entered.';

-- RLS: exact mirror of inventory_items' own has_permission('inventory',
-- verb) + org-match pattern (confirmed live before writing this).
alter table public.material_families enable row level security;

create policy material_families_select on public.material_families
  for select using (has_permission('inventory','view') and organization_id = current_organization_id());
create policy material_families_insert on public.material_families
  for insert with check (has_permission('inventory','create') and organization_id = current_organization_id());
create policy material_families_update on public.material_families
  for update using (has_permission('inventory','edit') and organization_id = current_organization_id())
  with check (has_permission('inventory','edit') and organization_id = current_organization_id());
create policy material_families_delete on public.material_families
  for delete using (has_permission('inventory','delete') and organization_id = current_organization_id());

alter table public.material_family_specifications enable row level security;

create policy material_family_specifications_select on public.material_family_specifications
  for select using (has_permission('inventory','view') and organization_id = current_organization_id());
create policy material_family_specifications_insert on public.material_family_specifications
  for insert with check (has_permission('inventory','create') and organization_id = current_organization_id());
create policy material_family_specifications_update on public.material_family_specifications
  for update using (has_permission('inventory','edit') and organization_id = current_organization_id())
  with check (has_permission('inventory','edit') and organization_id = current_organization_id());
create policy material_family_specifications_delete on public.material_family_specifications
  for delete using (has_permission('inventory','delete') and organization_id = current_organization_id());

-- No new policy needed on inventory_items itself -- its existing
-- SELECT/INSERT/UPDATE/DELETE policies already cover every column,
-- including these two new ones (same reasoning every prior additive
-- column migration in this history gives).
