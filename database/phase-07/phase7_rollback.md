# Phase 7 — Rollback Plan

Status: **Documented, not executed.** No rollback has been performed or is currently needed - Phase 7 verification passed every structural and behavioral check with zero FAILs (see [phase7_completion_report.md](./phase7_completion_report.md)). This document exists as the reference plan for the scenario where a genuine production-critical defect is discovered later, matching [phase1_rollback.md](../phase-01/phase1_rollback.md) through [phase6_rollback.md](../phase-06/phase6_rollback.md)'s own precedent.

## 1. Same rollback shape as Phase 5/6, plus one new wrinkle

Like `projects` and `customers`, `vendors` predates this migration - rollback is `ALTER`-based, reversing only this file's own additions, never `DROP TABLE vendors`. New for Phase 7: two of this migration's changes are corrections to foreign keys on *other* tables (`inventory_purchases`, `company_pos`), not `vendors` itself, and one of those two (`company_pos`) is a live object originally created by the now-frozen Phase 3 migration. Rolling back Phase 7 does not touch the archived `phase3_quotations_company_pos_FINAL.sql` file - it would only restore that table's live constraint to the state Phase 3 originally left it in.

## 2. Current blast radius if rolled back

Same as Phase 1-6: the frontend is not wired to Supabase yet, so rolling back Phase 7 has zero user-facing impact today.

## 3. A rollback of the two FK corrections is a disclosed regression, not a neutral reversal

Unlike every other rollback item in this project so far, reverting `inventory_purchases.vendor_id` and `company_pos.vendor_id` back to `ON DELETE NO ACTION` would knowingly restore the confirmed defect this phase fixed: a vendor delete that `Vendors.tsx` promises will always succeed would once again be rejected outright by the database the moment a real referencing row exists. Any future rollback decision must weigh this explicitly, not treat it as a routine, side-effect-free reversal.

## 4. Ordering constraints

Reverse of execution order:

```
trigger (trg_vendors_updated_at)
        |
new columns (updated_at, address) on vendors
        |
company_pos.vendor_id FK -> restore to ON DELETE NO ACTION
        |
inventory_purchases.vendor_id FK -> restore to ON DELETE NO ACTION
```

No backfilled data to consider reverting - like Phase 6, this migration performs no data writes at all, only schema and constraint changes. `vendors` held 0 rows throughout.

## 5. Rollback SQL (reference - verify against the live schema before running)

```sql
begin;

-- 1. Trigger
drop trigger if exists trg_vendors_updated_at on public.vendors;

-- 2. Columns added this phase
alter table public.vendors drop column if exists updated_at;
alter table public.vendors drop column if exists address;

-- 3. Restore company_pos.vendor_id to its frozen-Phase-3 original behavior
--    (ON DELETE NO ACTION - the Postgres default, i.e. no ON DELETE clause).
--    WARNING: this knowingly restores a confirmed defect - see section 3 above.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.company_pos'::regclass
      and conname = 'company_pos_vendor_id_fkey'
      and confdeltype = 'n'
  ) then
    alter table public.company_pos drop constraint company_pos_vendor_id_fkey;
    alter table public.company_pos
      add constraint company_pos_vendor_id_fkey
      foreign key (vendor_id) references public.vendors(id);
  end if;
end $$;

-- 4. Restore inventory_purchases.vendor_id to its pre-Phase-7 original behavior.
--    WARNING: this knowingly restores a confirmed defect - see section 3 above.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.inventory_purchases'::regclass
      and conname = 'inventory_purchases_vendor_id_fkey'
      and confdeltype = 'n'
  ) then
    alter table public.inventory_purchases drop constraint inventory_purchases_vendor_id_fkey;
    alter table public.inventory_purchases
      add constraint inventory_purchases_vendor_id_fkey
      foreign key (vendor_id) references public.vendors(id);
  end if;
end $$;

-- 5. Remove the migration's own registration
delete from schema_migrations where version = '20260806_007_phase7_vendors';

commit;
```

**Note on shared infrastructure:** this rollback does not touch `set_updated_at_timestamp()`, `has_permission()`, or `current_organization_id()` - all Phase 1/2 objects, reused unmodified by Phase 7, remain correctly owned by their own phase's rollback plan. It also does not touch any other column, constraint, index, policy, or row on `company_pos` or `inventory_purchases` beyond the one `vendor_id` foreign key each.

## 6. What this rollback does not undo

Any real vendor data entered into `address` between Phase 7 shipping and a rollback decision would be lost by dropping that column - a business/data decision, not a schema-rollback one, same caveat as every prior phase. Any real vendor deletions that succeeded *because* of the two FK corrections (i.e., that would have been rejected before this phase) cannot be un-happened by this rollback - the rollback only changes future behavior, not past, already-committed deletes.

## 7. Recommended alternative to a full rollback

Same as Phase 1-6: prefer a narrow, targeted forward-fix migration over a full rollback once real data exists. This is especially true for the two FK corrections in this phase - a full rollback would have to knowingly reintroduce a confirmed, previously-fixed defect, so any real production issue traced to Phase 7 should be diagnosed for a targeted fix first.
