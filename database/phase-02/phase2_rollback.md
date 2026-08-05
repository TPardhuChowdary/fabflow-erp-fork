# Phase 2 — Rollback Plan

Status: **Documented, not executed.** No rollback has been performed or is currently needed — Phase 2 verification passed every structural, behavioral, concurrency, security, and cross-module check with zero FAILs (see [phase2_completion_report.md](./phase2_completion_report.md)). This document exists as the reference plan for the scenario where a genuine production-critical defect is discovered later, matching [phase1_rollback.md](../phase-01/phase1_rollback.md)'s own precedent.

## 1. Current blast radius if rolled back

Same as Phase 1: the frontend is not wired to Supabase yet, so rolling back Phase 2 has zero user-facing impact today. Revisit this section once a future phase wires the frontend to Supabase Auth and the Employees module against this schema.

## 2. Ordering constraints (apply Phase 1's lesson, extended)

`employee_documents.uploaded_by` and `profiles.employee_id` both reference tables involved in this rollback — drop dependents before parents, exactly as Phase 1's rollback doc requires for `security_audit_log` vs. `auth.users`. Additionally, `employees` is now referenced by `profiles` (via the FK Phase 2 added) — that FK must be dropped **before** `employees` itself, or the drop will fail with a foreign-key-dependency error.

## 3. Rollback SQL (reference — verify against the live schema before running)

```sql
begin;

-- 1. RLS policies on all 7 Phase 2 tables (drop before disabling RLS)
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in (
        'employees','attendance_records','salary_payments',
        'advance_records','employee_documents','project_employees'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

alter table employees disable row level security;
alter table attendance_records disable row level security;
alter table salary_payments disable row level security;
alter table advance_records disable row level security;
alter table employee_documents disable row level security;
alter table project_employees disable row level security;
alter table document_counters disable row level security;

-- 2. Triggers
drop trigger if exists trg_employees_updated_at on employees;
drop trigger if exists trg_prevent_employee_code_change on employees;
drop trigger if exists trg_document_counters_updated_at on document_counters;
drop trigger if exists trg_attendance_records_updated_at on attendance_records;
drop trigger if exists trg_salary_payments_updated_at on salary_payments;
drop trigger if exists trg_advance_records_updated_at on advance_records;
drop trigger if exists trg_employee_documents_updated_at on employee_documents;
drop trigger if exists trg_project_employees_updated_at on project_employees;

-- 3. The one touch to a frozen Phase-1 table — drop the FK only,
--    the employee_id column and its unique constraint were Phase 1's
--    own reservation and revert to that original state, not removed.
alter table profiles drop constraint if exists profiles_employee_id_fkey;

-- 4. Tables — children before parent
drop table if exists project_employees;
drop table if exists employee_documents;
drop table if exists advance_records;
drop table if exists salary_payments;
drop table if exists attendance_records;
drop table if exists employees;
drop table if exists document_counters;

-- 5. Functions
drop function if exists generate_employee_code(uuid);
drop function if exists prevent_employee_code_change();
drop function if exists set_updated_at_timestamp();

-- 6. Remove the migration's own registration
delete from schema_migrations where version = '20260806_002_phase2_employees';

commit;
```

## 4. What this rollback does not undo
Any real employee data created between Phase 2 shipping and a rollback decision — this is a business decision, not a schema-rollback one, same caveat as Phase 1's own rollback doc for real user accounts.

## 5. Recommended alternative to a full rollback
Same as Phase 1: prefer a narrow, targeted forward-fix migration (self-registered in `schema_migrations` like every other change) over a full rollback once real data exists in these tables. Reserve the plan above for the pre-production window or a genuinely unrecoverable defect.
