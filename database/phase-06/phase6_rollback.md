# Phase 6 — Rollback Plan

Status: **Documented, not executed.** No rollback has been performed or is currently needed - Phase 6 verification passed every structural and behavioral check with zero FAILs (see [phase6_completion_report.md](./phase6_completion_report.md)). This document exists as the reference plan for the scenario where a genuine production-critical defect is discovered later, matching [phase1_rollback.md](../phase-01/phase1_rollback.md) through [phase5_rollback.md](../phase-05/phase5_rollback.md)'s own precedent.

## 1. Same rollback shape as Phase 5

Like `projects`, `customers` predates this migration - rollback is `ALTER`-based, reversing only this file's own additions, never `DROP TABLE customers`.

## 2. Current blast radius if rolled back

Same as Phase 1-5: the frontend is not wired to Supabase yet, so rolling back Phase 6 has zero user-facing impact today.

## 3. Ordering constraints

Reverse of execution order:

```
trigger (trg_customers_updated_at)
        |
trigger (trg_customers_sync_email)
        |
function (sync_customer_email)
        |
new columns (updated_at, primary_email, emails, additional_details,
             state_code, state_name, address)
```

No backfilled data to consider reverting - unlike Phase 5's `project_number` backfill, this migration performs no data writes at all, only schema changes. The pre-existing `"Test Customer"` row's `email` column, still `NULL` today, is unaffected either way.

## 4. Rollback SQL (reference - verify against the live schema before running)

```sql
begin;

-- 1. Triggers
drop trigger if exists trg_customers_updated_at on public.customers;
drop trigger if exists trg_customers_sync_email on public.customers;

-- 2. Function
drop function if exists sync_customer_email();

-- 3. Columns added this phase
alter table public.customers drop column if exists updated_at;
alter table public.customers drop column if exists primary_email;
alter table public.customers drop column if exists emails;
alter table public.customers drop column if exists additional_details;
alter table public.customers drop column if exists state_code;
alter table public.customers drop column if exists state_name;
alter table public.customers drop column if exists address;

-- 4. Remove the migration's own registration
delete from schema_migrations where version = '20260806_006_phase6_customers';

commit;
```

**Note on shared infrastructure:** this rollback does not touch `set_updated_at_timestamp()`, `has_permission()`, or `current_organization_id()` - all Phase 1/2 objects, reused unmodified by Phase 6, remain correctly owned by their own phase's rollback plan.

## 5. What this rollback does not undo

Any real customer data entered into the new columns (`address`, `emails`, etc.) between Phase 6 shipping and a rollback decision would be lost by dropping those columns - a business/data decision, not a schema-rollback one, same caveat as every prior phase. Since this migration itself wrote no data, this only matters for data entered by real usage after this phase went live.

## 6. Recommended alternative to a full rollback

Same as Phase 1-5: prefer a narrow, targeted forward-fix migration over a full rollback once real data exists in the new columns.
