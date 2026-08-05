# Phase 3 — Rollback Plan

Status: **Documented, not executed.** No rollback has been performed or is currently needed — Phase 3 verification passed every structural, behavioral, and concurrency check with zero FAILs (see [phase3_completion_report.md](./phase3_completion_report.md)). This document exists as the reference plan for the scenario where a genuine production-critical defect is discovered later, matching [phase1_rollback.md](../phase-01/phase1_rollback.md) and [phase2_rollback.md](../phase-02/phase2_rollback.md)'s own precedent.

## 1. Current blast radius if rolled back

Same as Phase 1 and Phase 2: the frontend is not wired to Supabase yet, so rolling back Phase 3 has zero user-facing impact today. Revisit this section once a future phase wires the frontend to Supabase against this schema.

## 2. Ordering constraints

Standard children-before-parents order, extended one level deeper than Phase 2 because of the `master_pos` hub:
```
quotation_purchase_orders, project_purchase_orders   (reference master_pos + quotations/quotation_revisions)
        |
master_pos                                            (references quotations)
        |
quotation_revisions                                   (references quotations)
        |
quotations
```
`company_pos` has no dependents and no dependencies on the other 5 tables — it can be dropped independently at any point.

## 3. Rollback SQL (reference — verify against the live schema before running)

```sql
begin;

-- 1. RLS policies on all 6 Phase 3 tables
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in (
        'quotations','quotation_revisions','master_pos',
        'quotation_purchase_orders','project_purchase_orders','company_pos'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

alter table quotations disable row level security;
alter table quotation_revisions disable row level security;
alter table master_pos disable row level security;
alter table quotation_purchase_orders disable row level security;
alter table project_purchase_orders disable row level security;
alter table company_pos disable row level security;

-- 2. Triggers
drop trigger if exists trg_quotations_updated_at on quotations;
drop trigger if exists trg_quotation_revisions_updated_at on quotation_revisions;
drop trigger if exists trg_master_pos_updated_at on master_pos;
drop trigger if exists trg_quotation_purchase_orders_updated_at on quotation_purchase_orders;
drop trigger if exists trg_project_purchase_orders_updated_at on project_purchase_orders;
drop trigger if exists trg_company_pos_updated_at on company_pos;

-- 3. Tables — children before parents, respecting the master_pos hub
drop table if exists quotation_purchase_orders;
drop table if exists project_purchase_orders;
drop table if exists master_pos;
drop table if exists quotation_revisions;
drop table if exists quotations;
drop table if exists company_pos;

-- 4. Function
drop function if exists generate_quotation_number(uuid);

-- 5. Remove the migration's own registration
delete from schema_migrations where version = '20260806_003_phase3_quotations_company_pos';

commit;
```

**Note on shared infrastructure:** this rollback does **not** touch `document_counters` or `set_updated_at_timestamp()` — both are Phase 2 objects, reused unmodified by Phase 3, and remain correctly owned by Phase 2's rollback plan. Rolling back Phase 3 alone should leave the `QT` counter key row (if any real quotation numbers were generated in production) untouched — deleting it would not be safe in general, since Phase 2's own document counters are meant to be monotonic and permanent.

## 4. What this rollback does not undo
Any real quotation, PO, or company PO data created between Phase 3 shipping and a rollback decision — a business decision, not a schema-rollback one, same caveat as Phase 1/2.

## 5. Recommended alternative to a full rollback
Same as Phase 1/2: prefer a narrow, targeted forward-fix migration over a full rollback once real data exists in these tables.
