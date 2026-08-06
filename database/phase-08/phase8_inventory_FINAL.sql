-- ============================================================================
-- Phase 8: Inventory
-- ============================================================================
-- Version:     20260806_008_phase8_inventory
-- Scope:       Extends three pre-existing (not Phase 1-7-created) tables -
--              inventory_items, inventory_purchases, inventory_usages -
--              selected by dependency count (Phase 8 Discovery: most
--              load-bearing remaining pre-existing table, 5 dependents
--              including frozen petty_expenses.inventory_item_id).
--
-- Dependencies on frozen phases:
--   - Phase 1: organization_id + RLS baseline on all three tables, reused
--     unmodified. Also the three pre-existing stock triggers
--     (increase_stock, reduce_stock, prevent_negative_stock), which this
--     migration does not touch.
--   - Phase 2: set_updated_at_timestamp() trigger function, reused
--     unmodified for three new updated_at triggers.
--   - Phase 4: petty_expenses.inventory_item_id -> inventory_items,
--     ON DELETE SET NULL - already correct, not touched.
--   - Phase 7: inventory_purchases.vendor_id -> vendors, ON DELETE
--     SET NULL - already correct, not touched. Also the direct
--     methodological precedent for this migration's own FK corrections.
--
-- What this migration does:
--   1. inventory_items: adds quantity_reserved, reorder_level,
--      last_purchase_price, estimated_price, updated_at (+ trigger).
--      Adds NOT NULL to the pre-existing name column - confirmed safe by
--      a live read showing the table's one existing row already has a
--      non-null, non-empty name.
--   2. inventory_purchases: adds material_name, supplier_name, unit_cost,
--      apply_gst, gst_percent, subtotal, gst_amount, final_total,
--      attachments, purchase_date, updated_at (+ trigger). Adds a CHECK
--      mirroring Inventory.tsx's own validation (rejects a negative
--      gst_percent whenever one is present).
--   3. inventory_usages: adds material_name, used_date, notes,
--      updated_at (+ trigger).
--   4. Corrects inventory_purchases.inventory_item_id and
--      inventory_usages.inventory_item_id from the default
--      ON DELETE NO ACTION to ON DELETE SET NULL - deleteInventoryItem()
--      has zero dependency guard (store.ts), the same confirmed
--      database/application mismatch already fixed for vendors in
--      Phase 7, using the identical confdeltype-guarded pattern.
--
-- Explicitly out of scope for this migration (see phase8_architecture.md
-- for the full reasoning, all resolved before this file was written):
--   - material_requisitions.inventory_item_id and
--     project_materials.inventory_item_id: confirmed the same class of
--     ON DELETE defect, but both tables are outside this phase's declared
--     scope and material_requisitions itself has an unresolved, larger
--     duplicate-concept question - deferred to a future phase, not fixed
--     here.
--   - inventory_usages.project_id (ON DELETE CASCADE, unchanged): the
--     frontend's deleteProject() already blocks deletion whenever a
--     material usage exists, so this path is confirmed unreachable
--     through the app, not contradicted by it. Left untouched.
--   - StockReservation / inventory_items.quantity_reserved's backing
--     ledger: quantity_reserved is added as a plain counter mirroring
--     today's frontend representation only. The full reservation ledger
--     (StockReservation) has no database table at all and needs its own
--     discovery in a future phase.
--   - increase_stock, reduce_stock, prevent_negative_stock, stock_check:
--     reviewed and confirmed independent of every column this migration
--     adds. Not modified.
--   - RLS, permissions, indexes: confirmed already correct and already
--     covering every new column (RLS gates rows, not columns). Not
--     modified.
--
-- Rollback considerations (see phase8_rollback.md once archived):
--   Same ALTER-based shape as Phase 5-7 - reverses only this file's own
--   additions, never DROP TABLE. Reverting the two FK corrections would
--   knowingly restore the confirmed inventory-item-deletion defect this
--   migration fixes - a disclosed regression, not a neutral reversal,
--   same caveat already recorded for Phase 7's vendor corrections.
--   inventory_items.name's NOT NULL can be safely dropped with no data
--   loss (DROP NOT NULL never fails). No data is backfilled by this
--   migration - the one existing inventory_items row already satisfies
--   every new constraint without modification.
--
-- Every DDL statement below is idempotent: safe to re-run this file
-- against a database that already has it applied.
-- ============================================================================

begin;

-- ============================================================================
-- 1. inventory_items - new columns
-- ============================================================================
-- All nullable except updated_at: none of these are set at item-creation
-- time in Inventory.tsx (handleAddItem only sets name/unit/quantityAvailable
-- with quantityAvailable defaulting to 0); quantity_reserved/reorder_level/
-- last_purchase_price/estimated_price are populated later by other flows
-- (stock reservation, purchase recording, manual edit) or never set at all.

alter table public.inventory_items
  add column if not exists quantity_reserved numeric default 0;

alter table public.inventory_items
  add column if not exists reorder_level numeric;

alter table public.inventory_items
  add column if not exists last_purchase_price numeric;

alter table public.inventory_items
  add column if not exists estimated_price numeric;

-- updated_at: mirrors the identical pattern already applied to projects
-- (Phase 5), customers (Phase 6), and vendors (Phase 7). now() is STABLE,
-- so this default is computed once via Postgres's fast ADD COLUMN path -
-- no table rewrite, safe regardless of row count.

alter table public.inventory_items
  add column if not exists updated_at timestamptz not null default now();

-- ============================================================================
-- 2. inventory_items.name - add NOT NULL
-- ============================================================================
-- Confirmed safe by a live, read-only check before this file was written:
-- the table's one existing row (name = 'Steel') already satisfies this.
-- SET NOT NULL is naturally idempotent - re-running this against a column
-- that is already NOT NULL succeeds as a no-op, no guard needed.

alter table public.inventory_items
  alter column name set not null;

-- ============================================================================
-- 3. Reuse Phase 2's set_updated_at_timestamp() for inventory_items
-- ============================================================================

drop trigger if exists trg_inventory_items_updated_at on public.inventory_items;

create trigger trg_inventory_items_updated_at
  before update on public.inventory_items
  for each row execute function public.set_updated_at_timestamp();

-- ============================================================================
-- 4. inventory_purchases - new columns
-- ============================================================================
-- material_name/supplier_name: cached snapshots, matching the same
-- pattern already used for company_pos.vendor_name (Phase 3) and every
-- other vendor-linked entity in this codebase (Phase 7 Discovery).
-- attachments: jsonb, matching the file/files jsonb convention already
-- used in Phase 3/4's frozen tables.

alter table public.inventory_purchases
  add column if not exists material_name text;

alter table public.inventory_purchases
  add column if not exists supplier_name text;

alter table public.inventory_purchases
  add column if not exists unit_cost numeric;

alter table public.inventory_purchases
  add column if not exists apply_gst boolean default false;

alter table public.inventory_purchases
  add column if not exists gst_percent numeric;

alter table public.inventory_purchases
  add column if not exists subtotal numeric;

alter table public.inventory_purchases
  add column if not exists gst_amount numeric;

alter table public.inventory_purchases
  add column if not exists final_total numeric;

alter table public.inventory_purchases
  add column if not exists attachments jsonb default '[]'::jsonb;

-- purchase_date: confirmed a genuinely separate, user-editable business
-- date (Inventory.tsx's purchase form lets the user set this to any
-- date, not locked to "today") - distinct from created_at, which always
-- reflects row-insertion time regardless of what date the user selects.

alter table public.inventory_purchases
  add column if not exists purchase_date date;

alter table public.inventory_purchases
  add column if not exists updated_at timestamptz not null default now();

-- ============================================================================
-- 5. inventory_purchases - CHECK constraint mirroring confirmed validation
-- ============================================================================
-- Inventory.tsx explicitly rejects a negative GST percentage whenever GST
-- is applied ("if (purchaseForm.applyGST && gstPct < 0)"); gst_percent is
-- only ever submitted (non-undefined) when apply_gst is true, so a plain
-- "null-or-non-negative" check faithfully mirrors that rule without
-- inventing any behavior the frontend does not itself enforce.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.inventory_purchases'::regclass
      and conname = 'inventory_purchases_gst_percent_check'
  ) then
    alter table public.inventory_purchases
      add constraint inventory_purchases_gst_percent_check
      check (gst_percent is null or gst_percent >= 0);
  end if;
end $$;

-- ============================================================================
-- 6. Reuse Phase 2's set_updated_at_timestamp() for inventory_purchases
-- ============================================================================

drop trigger if exists trg_inventory_purchases_updated_at on public.inventory_purchases;

create trigger trg_inventory_purchases_updated_at
  before update on public.inventory_purchases
  for each row execute function public.set_updated_at_timestamp();

-- ============================================================================
-- 7. inventory_usages - new columns
-- ============================================================================
-- material_name: cached snapshot, same pattern as above.
-- used_date: confirmed distinct from created_at - ProjectDetail.tsx
-- displays and edits used_date independently of the row's own timestamp.
-- notes: confirmed actively used in the usage form.

alter table public.inventory_usages
  add column if not exists material_name text;

alter table public.inventory_usages
  add column if not exists used_date date;

alter table public.inventory_usages
  add column if not exists notes text;

-- updated_at: justified by a confirmed real edit workflow
-- (ProjectDetail.tsx's editUsageForm + updateMaterialUsage), not merely
-- following convention - usages are genuinely editable after creation.

alter table public.inventory_usages
  add column if not exists updated_at timestamptz not null default now();

-- ============================================================================
-- 8. Reuse Phase 2's set_updated_at_timestamp() for inventory_usages
-- ============================================================================

drop trigger if exists trg_inventory_usages_updated_at on public.inventory_usages;

create trigger trg_inventory_usages_updated_at
  before update on public.inventory_usages
  for each row execute function public.set_updated_at_timestamp();

-- ============================================================================
-- 9. Correct inventory_purchases.inventory_item_id: NO ACTION -> SET NULL
-- ============================================================================
-- deleteInventoryItem() (store.ts) has zero dependency guard - it
-- unconditionally removes the item from local state - while this FK was
-- left at the Postgres default (NO ACTION), which would reject an item
-- delete outright the moment a real referencing purchase row exists. Same
-- confirmed defect class, and the same confdeltype-guarded idempotent
-- correction, already applied to vendors in Phase 7.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.inventory_purchases'::regclass
      and conname = 'inventory_purchases_inventory_item_id_fkey'
      and confdeltype <> 'n'
  ) then
    alter table public.inventory_purchases
      drop constraint inventory_purchases_inventory_item_id_fkey;

    alter table public.inventory_purchases
      add constraint inventory_purchases_inventory_item_id_fkey
      foreign key (inventory_item_id) references public.inventory_items(id) on delete set null;
  end if;
end $$;

-- ============================================================================
-- 10. Correct inventory_usages.inventory_item_id: NO ACTION -> SET NULL
-- ============================================================================
-- Same reasoning and same idempotent pattern as section 9.
-- inventory_usages.project_id (ON DELETE CASCADE) is deliberately not
-- touched here - deleteProject() already blocks deletion whenever a
-- material usage exists, so that path is confirmed unreachable through
-- the app, not contradicted by it.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.inventory_usages'::regclass
      and conname = 'inventory_usages_inventory_item_id_fkey'
      and confdeltype <> 'n'
  ) then
    alter table public.inventory_usages
      drop constraint inventory_usages_inventory_item_id_fkey;

    alter table public.inventory_usages
      add constraint inventory_usages_inventory_item_id_fkey
      foreign key (inventory_item_id) references public.inventory_items(id) on delete set null;
  end if;
end $$;

-- ============================================================================
-- 11. Register this migration
-- ============================================================================

insert into public.schema_migrations (version, description, checksum)
values (
  '20260806_008_phase8_inventory',
  'Phase 8: Inventory - inventory_items/inventory_purchases/inventory_usages new columns, updated_at + reused set_updated_at_timestamp() triggers, NOT NULL on inventory_items.name, gst_percent CHECK on inventory_purchases, and inventory_item_id ON DELETE NO ACTION to SET NULL corrections on inventory_purchases and inventory_usages',
  '2f007df6694e894403445917e1580ab199d7647899587c78e08f5328da28a474'
)
on conflict (version) do nothing;

commit;
