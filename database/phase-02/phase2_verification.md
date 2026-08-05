# Phase 2 — Verification Methodology

Status: **Executed in full against the live Supabase project.** Directly reuses [phase1_verification.md](../phase-01/phase1_verification.md)'s methodology unchanged, per that document's own stated intent to be the baseline for every future phase. This document records only what's specific to Phase 2. For results, see [phase2_completion_report.md](./phase2_completion_report.md).

## 1. Structural checks
`\d` against all 7 new tables (columns, types, defaults, FKs with `ON DELETE` behavior, indexes, unique constraints, RLS policies, triggers) cross-checked line-by-line against [phase2_architecture.md](./phase2_architecture.md). `pg_proc.prosecdef`/`provolatile` for the 3 new functions. `pg_class.relrowsecurity` for all 7 tables. A frozen-baseline check: total `public` table count (30 = Phase 1's 23 + Phase 2's 7), `has_permission()`'s source unchanged, `projects` table's column list unchanged (confirming the junction-table design didn't touch it), and Phase 1's `schema_migrations` checksum unchanged.

## 2. Behavioral checks — technique unchanged from Phase 1
Real, non-superuser simulated sessions (`set local request.jwt.claims`) throughout. Test users created via direct `auth.users` insert (same technique as Phase 1, since the Admin API's service-role key remains unavailable in this session).

**Role selection was deliberate, not arbitrary:** the live seed data's actual grants were queried first (`role_permissions` for the `employees`/`projects` modules), and test roles were picked specifically because their real, already-seeded grant combinations exercise the properties needing proof — no synthetic overrides were used except where a scenario Phase 2 introduced (isolating the `employee_code` immutability trigger from ordinary RLS, §3) had no matching real role to test with:
- `sales` — `employees.view` only, `projects.create/edit/view` — used to prove RLS read/write boundaries on `employees`, and the **positive** case of `project_employees`' dual-permission check (has both required grants).
- `Designer` — `projects.edit/view`, **zero** `employees` grants — used to prove the **negative** case of the dual-permission check (has one of the two required grants, not both), demonstrating the policy is a real `AND`, not effectively an `OR`.
- `admin` — full bypass — used for functional/business-logic tests where the point was exercising trigger behavior, not re-testing RBAC already covered elsewhere.

## 3. Isolating the `employee_code` immutability trigger from RLS — a technique specific to this phase
A naive test (a role with only `employees.view`, no `edit`) can't isolate the trigger's own behavior, because RLS's `UPDATE` policy already blocks the statement before the trigger ever runs — the row simply doesn't match, silently (`UPDATE 0`, no error). To prove the trigger itself (not just RLS) is doing the rejecting, a test user was granted `employees.edit` via a `user_permission_overrides` row — confirmed via `has_permission()` returning `true` — and then two separate updates were run: a name-only change (succeeded, proving RLS let the statement through) and an `employee_code` change on the same row (rejected by the trigger with its designed exception text, proving the second, independent gate). This same technique — grant the permission via override to isolate a trigger-level rule from the RLS layer beneath it — is reusable for any future phase that adds a similar dual-layer rule.

## 4. True concurrency — `generate_employee_code()`
Same two-overlapping-transaction technique as Phase 1's stock/overpayment races, adapted for a single-statement atomic upsert rather than a `SELECT ... FOR UPDATE` followed by a separate check: Process A calls the function, then `pg_sleep(3)` **before** committing, holding the upsert's row lock open; Process B (started ~1s later) calls the same function for the same organization and blocks on that lock until A commits, then proceeds against the now-current value. The authoritative proof is the two `RETURNING` values themselves (`EMP-2026-001` / `EMP-2026-002`, sequential, no collision) plus the final `document_counters.current_value`, not the process logs — matching Phase 1's own stated preference for authoritative DB state over log output.

Both race transactions were **committed for real** this time (not rolled back) — a single-statement atomic upsert's concurrency-safety can't be meaningfully demonstrated across two independently-rolled-back transactions (each would see a clean slate and both trivially get the same "first" value, proving nothing about real contention). The resulting counter row was deleted afterward as ordinary cleanup, restoring `document_counters` to empty — harmless either way, since the counter is designed to be monotonic and gap-tolerant by nature.

## 5. Cross-module verification
`profiles.employee_id`'s new FK tested both directions: accepts a real `employees.id`, rejects a nonexistent one with the standard FK violation — proving the constraint Phase 1 reserved and Phase 2 completed is load-bearing, not just present in the schema.

## 6. What this methodology does not (yet) cover
Same caveats as Phase 1: no UI-driven verification (frontend still unwired to Supabase), no load/performance testing, no Supabase platform-level configuration. Additionally specific to Phase 2: the two-identity-system reconciliation (local `AuthUser` vs. Supabase `profiles`) is out of scope for this phase and therefore untested here — it has no behavior to verify yet.
