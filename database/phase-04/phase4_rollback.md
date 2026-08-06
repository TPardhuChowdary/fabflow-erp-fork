# Phase 4 — Rollback Plan

Status: **Documented, not executed.** No rollback has been performed or is currently needed — Phase 4 verification passed every structural, behavioral, and concurrency check with zero FAILs (see [phase4_completion_report.md](./phase4_completion_report.md)). This document exists as the reference plan for the scenario where a genuine production-critical defect is discovered later, matching [phase1_rollback.md](../phase-01/phase1_rollback.md), [phase2_rollback.md](../phase-02/phase2_rollback.md), and [phase3_rollback.md](../phase-03/phase3_rollback.md)'s own precedent.

## 1. Current blast radius if rolled back

Same as Phase 1–3: the frontend is not wired to Supabase yet, so rolling back Phase 4 has zero user-facing impact today. Revisit this section once a future phase wires the frontend to Supabase against this schema.

## 2. Ordering constraints

Simpler than Phase 3's `master_pos` hub — `petty_expenses` and `expense_floats` reference each other only through the single nullable `petty_expenses.float_id` column (`ON DELETE SET NULL`, not a hard structural dependency), so there is no forced parent/child drop order between the two tables themselves. The only real ordering constraint is functions before nothing (functions have no dependents within this phase) and triggers before the tables they're attached to.

```
petty_expenses, expense_floats   (no hard FK dependency between them; either can drop first)
        |
functions: settle_expense_float, expense_float_apply_recompute,
           recompute_petty_expense_floats, expense_floats_before_write,
           expense_float_recompute, generate_float_number
```

## 3. Rollback SQL (reference — verify against the live schema before running)

```sql
begin;

-- 1. RLS policies on both Phase 4 tables
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('expense_floats','petty_expenses')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

alter table expense_floats disable row level security;
alter table petty_expenses disable row level security;

-- 2. Triggers
drop trigger if exists trg_recompute_petty_expense_floats on petty_expenses;
drop trigger if exists trg_expense_floats_before_insert on expense_floats;
drop trigger if exists trg_expense_floats_before_update on expense_floats;
drop trigger if exists trg_expense_floats_updated_at on expense_floats;
drop trigger if exists trg_petty_expenses_updated_at on petty_expenses;

-- 3. Tables
drop table if exists petty_expenses;
drop table if exists expense_floats;

-- 4. Functions
drop function if exists settle_expense_float(uuid, numeric, text);
drop function if exists expense_float_apply_recompute(uuid);
drop function if exists recompute_petty_expense_floats();
drop function if exists expense_floats_before_write();
drop function if exists expense_float_recompute(uuid, numeric, numeric, timestamptz);
drop function if exists generate_float_number(uuid);

-- 5. Remove the migration's own registration
delete from schema_migrations where version = '20260806_004_phase4_petty_expenses';

commit;
```

**Note on shared infrastructure:** this rollback does **not** touch `document_counters`, `set_updated_at_timestamp()`, `has_permission()`, or `current_organization_id()` — all are Phase 1/2 objects, reused unmodified by Phase 4, and remain correctly owned by their own phase's rollback plan. Rolling back Phase 4 alone should leave the `FLT` counter key row untouched, for the identical reason Phase 3's rollback plan leaves `QT` untouched — Phase 2's document counters are meant to be monotonic and permanent, and deleting one would not be safe in general once real float numbers exist in production.

## 4. What this rollback does not undo

Any real petty expense or expense float data created between Phase 4 shipping and a rollback decision — a business decision, not a schema-rollback one, same caveat as every prior phase.

## 5. Recommended alternative to a full rollback

Same as Phase 1–3: prefer a narrow, targeted forward-fix migration over a full rollback once real data exists in these tables. This is particularly relevant for the one known, disclosed limitation carried forward from this phase (`phase4_security.md` §5, the `returned_amount` direct-write path) — closing it, if ever needed, should be a forward-fix migration adding a protected-column trigger, not a rollback of this one.
