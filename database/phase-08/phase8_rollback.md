# Phase 8 — Rollback Plan

Status: **Documented, not executed.** No rollback has been performed or is currently needed - Phase 8 verification passed every structural and behavioral check with zero FAILs (see [phase8_completion_report.md](./phase8_completion_report.md)). This document exists as the reference plan for the scenario where a genuine production-critical defect is discovered later, matching [phase1_rollback.md](../phase-01/phase1_rollback.md) through [phase7_rollback.md](../phase-07/phase7_rollback.md)'s own precedent.

## 1. Same rollback shape as Phase 5-7

Like `projects`, `customers`, and `vendors`, all three tables this phase touches predate this migration - rollback is `ALTER`-based, reversing only this file's own additions, never `DROP TABLE`.

## 2. Current blast radius if rolled back

Same as Phase 1-7: the frontend is not wired to Supabase yet, so rolling back Phase 8 has zero user-facing impact today.

## 3. A rollback of the two FK corrections is a disclosed regression, not a neutral reversal

Same caveat already recorded for Phase 7's vendor corrections: reverting `inventory_purchases.inventory_item_id` and `inventory_usages.inventory_item_id` back to `ON DELETE NO ACTION` would knowingly restore the confirmed defect this phase fixed - an inventory item delete that `deleteInventoryItem()` promises will always succeed would once again be rejected outright by the database the moment a real referencing row exists. Any future rollback decision must weigh this explicitly, not treat it as a routine, side-effect-free reversal.

## 4. Ordering constraints

Reverse of execution order:

```
inventory_purchases.inventory_item_id FK -> restore to ON DELETE NO ACTION
inventory_usages.inventory_item_id FK -> restore to ON DELETE NO ACTION
        |
trigger (trg_inventory_usages_updated_at)
        |
new columns on inventory_usages (updated_at, notes, used_date, material_name)
        |
trigger (trg_inventory_purchases_updated_at)
        |
constraint (inventory_purchases_gst_percent_check)
        |
new columns on inventory_purchases (updated_at, purchase_date, attachments,
        final_total, gst_amount, subtotal, gst_percent, apply_gst, unit_cost,
        supplier_name, material_name)
        |
trigger (trg_inventory_items_updated_at)
        |
inventory_items.name -> restore to nullable
        |
new columns on inventory_items (updated_at, estimated_price,
        last_purchase_price, reorder_level, quantity_reserved)
```

No backfilled data to consider reverting - like Phase 6/7, this migration performs no data writes at all, only schema and constraint changes. All three tables held exactly one row throughout, untouched by this migration.

## 5. Rollback SQL (reference - verify against the live schema before running)

```sql
begin;

-- 1. Restore both FK corrections to their pre-Phase-8 original behavior.
--    WARNING: this knowingly restores a confirmed defect - see section 3.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.inventory_purchases'::regclass
      and conname = 'inventory_purchases_inventory_item_id_fkey'
      and confdeltype = 'n'
  ) then
    alter table public.inventory_purchases drop constraint inventory_purchases_inventory_item_id_fkey;
    alter table public.inventory_purchases
      add constraint inventory_purchases_inventory_item_id_fkey
      foreign key (inventory_item_id) references public.inventory_items(id);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.inventory_usages'::regclass
      and conname = 'inventory_usages_inventory_item_id_fkey'
      and confdeltype = 'n'
  ) then
    alter table public.inventory_usages drop constraint inventory_usages_inventory_item_id_fkey;
    alter table public.inventory_usages
      add constraint inventory_usages_inventory_item_id_fkey
      foreign key (inventory_item_id) references public.inventory_items(id);
  end if;
end $$;

-- 2. Triggers
drop trigger if exists trg_inventory_usages_updated_at on public.inventory_usages;
drop trigger if exists trg_inventory_purchases_updated_at on public.inventory_purchases;
drop trigger if exists trg_inventory_items_updated_at on public.inventory_items;

-- 3. Constraint
alter table public.inventory_purchases drop constraint if exists inventory_purchases_gst_percent_check;

-- 4. Columns added this phase
alter table public.inventory_usages drop column if exists updated_at;
alter table public.inventory_usages drop column if exists notes;
alter table public.inventory_usages drop column if exists used_date;
alter table public.inventory_usages drop column if exists material_name;

alter table public.inventory_purchases drop column if exists updated_at;
alter table public.inventory_purchases drop column if exists purchase_date;
alter table public.inventory_purchases drop column if exists attachments;
alter table public.inventory_purchases drop column if exists final_total;
alter table public.inventory_purchases drop column if exists gst_amount;
alter table public.inventory_purchases drop column if exists subtotal;
alter table public.inventory_purchases drop column if exists gst_percent;
alter table public.inventory_purchases drop column if exists apply_gst;
alter table public.inventory_purchases drop column if exists unit_cost;
alter table public.inventory_purchases drop column if exists supplier_name;
alter table public.inventory_purchases drop column if exists material_name;

-- 5. inventory_items.name back to nullable
alter table public.inventory_items alter column name drop not null;

alter table public.inventory_items drop column if exists updated_at;
alter table public.inventory_items drop column if exists estimated_price;
alter table public.inventory_items drop column if exists last_purchase_price;
alter table public.inventory_items drop column if exists reorder_level;
alter table public.inventory_items drop column if exists quantity_reserved;

-- 6. Remove the migration's own registration
delete from schema_migrations where version = '20260806_008_phase8_inventory';

commit;
```

**Note on shared infrastructure:** this rollback does not touch `set_updated_at_timestamp()`, `has_permission()`, `current_organization_id()`, `increase_stock`, `reduce_stock`, `prevent_negative_stock`, or `stock_check` - all Phase 1/2 objects, reused or left unmodified by Phase 8, remain correctly owned by their own phase's rollback plan.

## 6. What this rollback does not undo

Any real inventory data entered into the new columns (`purchase_date`, `attachments`, `notes`, etc.) between Phase 8 shipping and a rollback decision would be lost by dropping those columns - a business/data decision, not a schema-rollback one, same caveat as every prior phase. Any real inventory-item deletions that succeeded because of the two FK corrections cannot be un-happened by this rollback - the rollback only changes future behavior, not past, already-committed deletes.

## 7. Recommended alternative to a full rollback

Same as Phase 1-7: prefer a narrow, targeted forward-fix migration over a full rollback once real data exists. Especially true for the two FK corrections - a full rollback would have to knowingly reintroduce a confirmed, previously-fixed defect, so any real production issue traced to Phase 8 should be diagnosed for a targeted fix first.
