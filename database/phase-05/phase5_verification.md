# Phase 5 — Verification Methodology

Status: **Executed in full against the live Supabase project.** Directly reuses [phase1_verification.md](../phase-01/phase1_verification.md)'s baseline methodology, [phase2_verification.md](../phase-02/phase2_verification.md)'s atomic-counter concurrency technique, and [phase3_verification.md](../phase-03/phase3_verification.md)'s `set local role authenticated;` discipline. This document records what's specific to Phase 5, including a genuinely new verification requirement this phase introduced: pre-execution live schema inspection of a pre-existing table.

## 1. Pre-execution live schema inspection - a new step, not needed by Phase 2-4

Because `projects` is a pre-existing table rather than one this migration creates, structural verification began *before* SQL was ever written: a read-only `\d public.projects` / `\d public.customers`, full `information_schema.columns`/`pg_constraint`/`pg_indexes`/`information_schema.triggers`/`pg_policies` inventory, and inspection of the two pre-existing trigger functions' actual bodies (`log_project()`, `create_stages()`) via `pg_get_functiondef()`. This surfaced `customer_id` and `status` already existing (proven by Phase 1's own index statements, not assumed), the existing `ON DELETE CASCADE` on `customer_id`, the global (non-org-scoped) `UNIQUE(project_number)`, and the one live data row - none of which could have been known from frontend source or prior migration files alone.

## 2. Post-execution structural checks
`information_schema.columns` for the full 20-column inventory, `pg_constraint` for all 7 constraints (PK, unique, 3 FKs, 1 check), `pg_indexes` (confirmed unchanged at 4 - this migration added zero new indexes), `information_schema.triggers` (confirmed 3 total: the 2 pre-existing `AFTER INSERT` triggers untouched, 1 new `BEFORE UPDATE`), `pg_proc` for `generate_project_number()`'s `SECURITY DEFINER`/`search_path`, `pg_class.relrowsecurity` and `pg_policies` for RLS (confirmed unchanged - this migration added zero new policies). Frozen-baseline check: total table count unchanged at 38 (this migration extends an existing table, creates none); 9 key Phase 1-4 function body hashes spot-checked, all unchanged; trigger count 40 = 39 (Phase 1-4) + 1 new; function count 29 = 28 (Phase 1-4) + 1 new; policy count 123 unchanged; index count 88 unchanged.

## 3. Test identity setup
Same pattern as Phase 4's verification (auto-provisioning trigger via `raw_user_meta_data`, explicit `user_roles` removal for the negative identity to guarantee zero permissions regardless of the `'employee'` role default). No repeat of the earlier duplicate-key incident from Phase 4's first attempt.

## 4. RLS - positive and negative, against the real pre-existing row
Negative identity: `SELECT` returned 0 rows (RLS-filtered), `UPDATE` affected 0 rows, direct `INSERT` rejected with `new row violates row-level security policy for table "projects"`. Positive identity (admin): `SELECT` correctly returned the row including its post-backfill `project_number`.

## 5. Backfill and constraint verification
Confirmed the one pre-existing `NULL` `project_number` value was populated to `PROJ-2026-001` by the migration's own backfill statement, not a manual step. `NOT NULL` violations tested live and directly: an insert omitting `name` was rejected with the standard not-null-constraint error; an insert with `quantity = 0` was rejected naming `projects_quantity_check` specifically.

## 6. `customer_id` FK correction - verified by attempting the exact scenario it closes
Rather than only reading the constraint definition, attempted a real `DELETE FROM customers WHERE id = <the linked test customer>` inside a rolled-back transaction - confirmed it now fails with a foreign-key violation naming `projects_customer_id_fkey`, proving the correction is live and effective, not just present in the catalog.

## 7. `updated_at` trigger - verified with a real `UPDATE`, not just its presence in `pg_trigger`
Read `updated_at` before and after a real `UPDATE ... SET work_description = ...` (inside a rolled-back transaction, separated by `pg_sleep(1)`), confirming the timestamp actually advanced from migration-execution time to the update's own execution time.

## 8. Pre-existing trigger non-interference - verified by absence of side effects, not by assumption
`trg_log_project`/`trg_project_stages` are both `AFTER INSERT`; this migration contains zero `INSERT INTO projects` statements. Confirmed via live row counts: `logs` (1 row) and `production_stages` (6 rows) - both matching the exact pre-execution baseline, proving neither trigger fired during the migration.

## 9. True concurrency - `generate_project_number()`, two-stage proof
First a rollback-based run confirmed genuine blocking (`clock_timestamp()` showed the second session's completion strictly after the first session's rollback), but a rollback also undoes the first call's counter increment, so both sides returned the same next value - correct given the rollback, but not a demonstration of final-state correctness under real commits. A second run, using real commits (matching Phase 2-4's own methodology exactly), produced `PROJ-2026-002` then `PROJ-2026-003` with no collision, the second session's completion again proven strictly after the first's commit via `clock_timestamp()`. Authoritative final `document_counters.current_value = 3` confirmed the count of real increments (1 backfill + 2 verification commits), not inferred from process logs.

## 10. Cleanup verification
All Phase 5 test identities (2 `auth.users` rows and their cascaded `profiles`/`user_roles`, plus 3 `security_audit_log` rows generated by their role assignment/removal) removed and confirmed at zero via live queries. No test data was ever committed into `projects` itself - the RLS negative test's insert attempt was rejected before persisting, and the numbering verification calls that were committed only ever touched `document_counters`, never `projects`.

## 11. What this methodology does not (yet) cover
Same caveats as Phase 1-4: no UI-driven verification (frontend still unwired to Supabase), no load/performance testing. Additionally specific to Phase 5: the `document_counters` `PROJ` counter now sits at 3, not 1, as a direct and accepted consequence of committing the two real concurrency-proof calls in section 9 - matching the identical precedent already accepted for Phase 4's `FLT` counter, not reset, and disclosed here rather than hidden.
