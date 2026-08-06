# Phase 10 — Rollback Plan

Status: **Documented, not executed.** No rollback has been performed or is currently needed - Phase 10 verification passed every check, after one disclosed defect was caught and corrected mid-verification (see [phase10_completion_report.md](./phase10_completion_report.md)). This document exists as the reference plan for the scenario where a genuine production-critical defect is discovered later, matching every prior phase's own precedent.

## 1. Same rollback shape as every prior phase

`delivery_challans` predates this migration - rollback is `ALTER`-based, reversing only this file's own additions, never `DROP TABLE`.

## 2. A note on the archived file's own history

The archived [phase10_delivery_challans_FINAL.sql](./phase10_delivery_challans_FINAL.sql) reflects the **corrected** design (checksum `98c7a6002331afdc07c9ba7b7156a9c08e568a28d5bf92bf92c0dec1fb03c14b`), not the briefly-live, defective first version (checksum `deb33f2b9f2a1aef3a51e6e6b6b3ff7ffeb10824adbdc1604133a4c4ab851314`, disclosed in full in [phase10_verification.md](./phase10_verification.md)). Any rollback should be planned against the archived file as it now stands - the defective intermediate state never reached a frozen or documented status and should not be treated as a rollback target.

## 3. Reverting the `customer_id` FK correction is a disclosed regression

Reverting `delivery_challans.customer_id`'s FK to the Postgres default `NO ACTION` would knowingly restore the confirmed `deleteCustomer()` guard gap this phase fixed - a customer delete that should succeed and clear the link would instead be blocked. Any future rollback decision must weigh this explicitly.

## 4. Current blast radius if rolled back

Same as every prior phase: the frontend is not wired to Supabase yet, so rolling back Phase 10 has zero user-facing impact today. `delivery_challans` has 0 rows, so no real data is at stake beyond whatever is entered after this phase ships.

## 5. Ordering constraints

Reverse of execution order:

```
customer_id FK -> restore to ON DELETE NO ACTION
        |
trigger (trg_delivery_challans_updated_at)
        |
new columns (updated_at, delivery_address, status, receiver_name,
        dispatch_date, mobile_number, collected_by, lr_number,
        transport_company, tracking_number, courier_company,
        driver_name, vehicle_no, dispatch_method, project_entries,
        items, dc_no, customer_id)
```

## 6. Rollback SQL (reference - verify against the live schema before running)

```sql
begin;

-- 1. Restore customer_id FK to its pre-Phase-10 original behavior.
--    WARNING: this knowingly restores a confirmed defect - see section 3.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.delivery_challans'::regclass
      and conname = 'delivery_challans_customer_id_fkey'
  ) then
    alter table public.delivery_challans drop constraint delivery_challans_customer_id_fkey;
  end if;
end $$;

-- 2. Trigger
drop trigger if exists trg_delivery_challans_updated_at on public.delivery_challans;

-- 3. Columns added this phase
alter table public.delivery_challans drop column if exists updated_at;
alter table public.delivery_challans drop column if exists delivery_address;
alter table public.delivery_challans drop column if exists status;
alter table public.delivery_challans drop column if exists receiver_name;
alter table public.delivery_challans alter column dispatch_date drop not null;
alter table public.delivery_challans drop column if exists dispatch_date;
alter table public.delivery_challans drop column if exists mobile_number;
alter table public.delivery_challans drop column if exists collected_by;
alter table public.delivery_challans drop column if exists lr_number;
alter table public.delivery_challans drop column if exists transport_company;
alter table public.delivery_challans drop column if exists tracking_number;
alter table public.delivery_challans drop column if exists courier_company;
alter table public.delivery_challans drop column if exists driver_name;
alter table public.delivery_challans drop column if exists vehicle_no;
alter table public.delivery_challans drop column if exists dispatch_method;
alter table public.delivery_challans drop column if exists project_entries;
alter table public.delivery_challans drop column if exists items;
alter table public.delivery_challans drop column if exists dc_no;
alter table public.delivery_challans drop column if exists customer_id;

-- 4. Remove the migration's own registration
delete from schema_migrations where version = '20260806_010_phase10_delivery_challans';

commit;
```

**Note on shared infrastructure:** this rollback does not touch `set_updated_at_timestamp()`, `has_permission()`, or `current_organization_id()` - all reused unmodified by Phase 10, remain correctly owned by their own phase's rollback plan.

## 7. What this rollback does not undo

Any real delivery challan data entered into the new columns would be lost by dropping them. Any real deletions that succeeded because of the `customer_id` FK correction cannot be un-happened.

## 8. Recommended alternative to a full rollback

Same as every prior phase: prefer a narrow, targeted forward-fix migration over a full rollback once real data exists.
