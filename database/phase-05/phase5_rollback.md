# Phase 5 — Rollback Plan

Status: **Documented, not executed.** No rollback has been performed or is currently needed - Phase 5 verification passed every structural, behavioral, and concurrency check with zero FAILs (see [phase5_completion_report.md](./phase5_completion_report.md)). This document exists as the reference plan for the scenario where a genuine production-critical defect is discovered later, matching [phase1_rollback.md](../phase-01/phase1_rollback.md), [phase2_rollback.md](../phase-02/phase2_rollback.md), [phase3_rollback.md](../phase-03/phase3_rollback.md), and [phase4_rollback.md](../phase-04/phase4_rollback.md)'s own precedent.

## 1. A different rollback shape from every prior phase

Phase 1-4 rollback plans all end with `DROP TABLE` for their new tables. Phase 5 cannot do that: `projects` is a pre-existing table this migration only *extends*, not one it created. Rolling back Phase 5 means reversing every individual `ALTER` this migration performed, in the opposite order, leaving `projects` and `customers` exactly as they were before this migration - including their pre-Phase-1 structure and the pre-existing `"Test Customer" → "Test Project" → Invoice"` data, which this migration was explicitly designed never to delete or restructure.

## 2. Current blast radius if rolled back

Same as Phase 1-4: the frontend is not wired to Supabase yet, so rolling back Phase 5 has zero user-facing impact today. One additional consideration specific to this phase: rolling back would restore `customer_id`'s `ON DELETE CASCADE`, reopening the gap between database and application behavior that this phase closed (see `phase5_security.md` §3) - worth being aware of, not a reason to avoid rollback if one is ever genuinely needed.

## 3. Ordering constraints

Reverse of execution order - drop the newest additions first:

```
trigger (trg_projects_updated_at)
        |
customer_id FK (restore ON DELETE CASCADE)
        |
NOT NULL / CHECK constraints (project_number, name, customer_id, quantity)
        |
new columns (work_description, production_version, customer_visible_name,
             internal_order_code, project_type, parent_project_id,
             source_project_id, repeat_order_seq, original_project_name,
             activity_log, updated_at)
        |
generate_project_number() function
```

The backfilled `project_number` value on the pre-existing row is **not** reverted to `NULL` by this plan - once real (even if generated for a pre-existing test row), reverting a document identifier to `NULL` is not a safe default action; if ever genuinely required, it would need an explicit decision at rollback time, not an automatic step here.

## 4. Rollback SQL (reference - verify against the live schema before running)

```sql
begin;

-- 1. Trigger
drop trigger if exists trg_projects_updated_at on public.projects;

-- 2. Restore customer_id's original ON DELETE CASCADE
alter table public.projects drop constraint if exists projects_customer_id_fkey;
alter table public.projects add constraint projects_customer_id_fkey
  foreign key (customer_id) references public.customers(id) on delete cascade;

-- 3. Constraints added this phase
alter table public.projects drop constraint if exists projects_quantity_check;
alter table public.projects alter column quantity drop not null;
alter table public.projects alter column customer_id drop not null;
alter table public.projects alter column name drop not null;
alter table public.projects alter column project_number drop not null;

-- 4. Columns added this phase
alter table public.projects drop column if exists updated_at;
alter table public.projects drop column if exists activity_log;
alter table public.projects drop column if exists original_project_name;
alter table public.projects drop column if exists repeat_order_seq;
alter table public.projects drop column if exists source_project_id;
alter table public.projects drop column if exists parent_project_id;
alter table public.projects drop column if exists project_type;
alter table public.projects drop column if exists internal_order_code;
alter table public.projects drop column if exists customer_visible_name;
alter table public.projects drop column if exists production_version;
alter table public.projects drop column if exists work_description;

-- 5. Function
drop function if exists generate_project_number(uuid);

-- 6. Remove the migration's own registration
delete from schema_migrations where version = '20260806_005_phase5_projects';

commit;
```

**Note on shared infrastructure:** this rollback does not touch `document_counters`, `set_updated_at_timestamp()`, `has_permission()`, or `current_organization_id()` - all Phase 1/2 objects, reused unmodified by Phase 5, remain correctly owned by their own phase's rollback plan. The `PROJ` counter key row is left untouched for the same reason every prior phase's rollback plan leaves its own counter key untouched - Phase 2's document counters are meant to be monotonic and permanent.

## 5. What this rollback does not undo

The one existing row's `project_number` remains whatever this migration's backfill set it to (`PROJ-2026-001`) - a business/data decision, not a schema-rollback one, same caveat as every prior phase. Any real project data created between Phase 5 shipping and a rollback decision is likewise out of scope for this plan.

## 6. Recommended alternative to a full rollback

Same as Phase 1-4: prefer a narrow, targeted forward-fix migration over a full rollback once real data exists in this table - particularly relevant here since `projects` already carried real (if old) data before this phase ever touched it.
