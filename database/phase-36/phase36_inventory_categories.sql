-- FabFlow ERP — Phase 36: Inventory classification + Powder Coating
-- Materials (master scope §3, §4, §4.1, §4.2, §4.3, §5).
--
-- Additive-only: one new `category` column (default 'raw_material' so
-- every existing row's meaning is completely unchanged) plus 6 new
-- nullable columns used only by the two powder-coating categories.
-- Consumables and Spare Parts need no extra columns at all - they are
-- just `inventory_items` rows with a different `category` value, reusing
-- 100% of the existing purchase/usage/stock-trigger machinery
-- (increase_stock()/reduce_stock(), inventory_purchases,
-- inventory_usages) untouched. This is deliberately NOT a second
-- inventory/ledger system for Powder Coating (§4.3): a Powder Coating
-- Powder row is purchased and consumed through the exact same
-- inventory_purchases/inventory_usages flow as a raw material row -
-- only its category and the 5 powder-specific columns differ.
--
-- Idempotent: safe to run multiple times. Touches no existing policy,
-- trigger, or function.

begin;

alter table public.inventory_items
  add column if not exists category text not null default 'raw_material'
  check (category in (
    'raw_material', 'consumable', 'spare_part',
    'powder_coating_powder', 'pretreatment_chemical'
  ));

-- Powder Coating Powder fields (§4.1). Deliberately independent columns,
-- not a shared "spec" jsonb blob - brand/shade/ral_code/finish/
-- powder_type are exactly the attributes that make two powder rows with
-- the same name genuinely different stock (e.g. same "Red Powder" name,
-- different RAL code), and each needs to be independently filterable/
-- searchable, not buried in an opaque blob.
alter table public.inventory_items add column if not exists brand text;
alter table public.inventory_items add column if not exists shade text;
alter table public.inventory_items add column if not exists ral_code text;
alter table public.inventory_items add column if not exists finish text;
alter table public.inventory_items add column if not exists powder_type text;

-- Pretreatment Chemicals field (§4.2) - which tank/process this chemical
-- is associated with (e.g. "Degreasing Tank 1", "Phosphating").
alter table public.inventory_items add column if not exists pretreatment_tank text;

create index if not exists idx_inventory_items_org_category
  on public.inventory_items (organization_id, category);

insert into public.schema_migrations (version, description, checksum)
values (
  '20260817_036_phase36_inventory_categories',
  'Phase 36: inventory_items.category (enum: raw_material/consumable/spare_part/powder_coating_powder/pretreatment_chemical, default raw_material) + 6 nullable Powder Coating columns (brand, shade, ral_code, finish, powder_type, pretreatment_tank). Additive-only, zero behavior change for existing rows. Consumables/Spare Parts/Powder Coating all reuse the existing inventory_purchases/inventory_usages/stock-trigger machinery unchanged - not a second inventory system.',
  'phase36-inventory-categories-v1'
)
on conflict (version) do nothing;

commit;
