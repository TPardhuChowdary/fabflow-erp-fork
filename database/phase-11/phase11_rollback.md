# Phase 11 (SQL) — Rollback Plan

Status: **Documented, not executed.** No rollback has been performed or is currently needed — Phase 11 (SQL) verification passed every check, after one disclosed defect was caught and corrected mid-verification (see [phase11_completion_report.md](./phase11_completion_report.md)).

## 1. Different rollback shape from Phases 1-10

Every table this migration creates (`project_production_stages`, `production_stage_transactions`, `project_bom_items`, `bom_requisitions`, `outsourced_works`, `qms_stage_completions`) is genuinely new — none pre-existed this migration. A rollback of these is therefore `DROP TABLE`-based, not `ALTER`-based. The two extensions to pre-existing tables (`inventory_purchases.project_id`/`thickness`, `inventory_items`'s new unique index) remain `ALTER`-based, matching every prior phase's convention.

## 2. Current blast radius if rolled back

All 6 new tables have 0 rows (confirmed at the close of this session's verification, after full test-data cleanup). Rolling back today loses no real data — the frontend is not wired to Supabase yet, so no user-facing impact exists either.

## 3. What a rollback must NOT touch

`production_stages`, `material_requisitions`, `project_materials`, `logs` — none of these was touched by this migration, and none should be touched by its rollback either. Reverting Phase 11 (SQL) does not "restore" these to any prior state, because they were never modified.

## 4. Ordering constraints

Reverse of execution order:

```
RLS policies (all 6 new tables)
        |
add_project_activity(), record_material_purchase()
        |
qms_stage_completions
        |
outsourced_works
        |
bom_requisitions -> project_bom_items (FK-dependent, in that order)
        |
production_stage_transactions -> project_production_stages (FK-dependent)
        |
inventory_purchases.project_id / .thickness columns
        |
inventory_items unique index (uq_inventory_items_org_name_ci)
```

## 5. Rollback SQL (reference — verify against the live schema before running)

```sql
begin;

drop policy if exists qms_stage_completions_update on public.qms_stage_completions;
drop policy if exists qms_stage_completions_insert on public.qms_stage_completions;
drop policy if exists qms_stage_completions_select on public.qms_stage_completions;
drop policy if exists outsourced_works_delete on public.outsourced_works;
drop policy if exists outsourced_works_update on public.outsourced_works;
drop policy if exists outsourced_works_insert on public.outsourced_works;
drop policy if exists outsourced_works_select on public.outsourced_works;
drop policy if exists bom_requisitions_approve on public.bom_requisitions;
drop policy if exists bom_requisitions_select on public.bom_requisitions;
drop policy if exists project_bom_items_delete on public.project_bom_items;
drop policy if exists project_bom_items_update on public.project_bom_items;
drop policy if exists project_bom_items_insert on public.project_bom_items;
drop policy if exists project_bom_items_select on public.project_bom_items;
drop policy if exists production_stage_transactions_delete on public.production_stage_transactions;
drop policy if exists production_stage_transactions_insert on public.production_stage_transactions;
drop policy if exists production_stage_transactions_select on public.production_stage_transactions;
drop policy if exists project_production_stages_delete on public.project_production_stages;
drop policy if exists project_production_stages_update on public.project_production_stages;
drop policy if exists project_production_stages_insert on public.project_production_stages;
drop policy if exists project_production_stages_select on public.project_production_stages;

drop function if exists public.add_project_activity(uuid, text, text, text, jsonb);
drop function if exists public.record_material_purchase(uuid, text, text, numeric, text, text, uuid, date, jsonb);

drop table if exists public.qms_stage_completions;
drop table if exists public.outsourced_works;
drop table if exists public.bom_requisitions;
drop function if exists public.recompute_bom_requisition(uuid);
drop function if exists public.trg_recompute_bom_requisition_on_bom_item();
drop table if exists public.project_bom_items;
drop function if exists public.enforce_stage_transaction_limit();
drop table if exists public.production_stage_transactions;
drop function if exists public.validate_rework_reference();
drop table if exists public.project_production_stages;

alter table public.inventory_purchases drop column if exists thickness;
alter table public.inventory_purchases drop column if exists project_id;
drop index if exists public.uq_inventory_items_org_name_ci;

delete from schema_migrations where version = '20260807_011_phase11_production_persistence';

commit;
```

## 6. What this rollback does not undo

Any real production/BOM/outsourced-work/QMS data entered into these tables between go-live and a future rollback decision would be lost by dropping them. Given the frontend is not yet wired to any of this, that risk is currently zero.

## 7. Recommended alternative to a full rollback

Same as every prior phase: prefer a narrow, targeted forward-fix migration over a full rollback once real data exists. This phase's own disclosed defect (the reactive stock-change trigger) is the precedent — it was corrected forward, in place, rather than rolled back.
