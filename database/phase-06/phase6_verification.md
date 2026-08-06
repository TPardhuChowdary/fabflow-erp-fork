# Phase 6 — Verification Methodology

Status: **Executed in full against the live Supabase project.** Directly reuses [phase1_verification.md](../phase-01/phase1_verification.md)'s baseline methodology and [phase5_verification.md](../phase-05/phase5_verification.md)'s pre-existing-table adaptations (live schema inspection before SQL, `set local role authenticated;` discipline). This document records what's specific to Phase 6, including one test-methodology error caught and corrected mid-verification.

## 1. Pre-execution live schema inspection
As with Phase 5, a read-only `\d public.customers` (full `information_schema.columns`/`pg_constraint`/`pg_indexes`/`information_schema.triggers`/`pg_policies` inventory) was performed before any SQL was written - not assumed from frontend source or prior migration files alone. This surfaced `name`'s pre-existing `NOT NULL`, the complete absence of any trigger, and the exact 8-column baseline the new columns were checked against for name collisions.

## 2. Post-execution structural checks
`information_schema.columns` for the full 15-column inventory, `pg_constraint` (confirmed unchanged at 2 - this migration added zero new constraints), `pg_indexes` (confirmed unchanged at 2 - zero new indexes), `information_schema.triggers` (confirmed 3 rows: 2 events for `trg_customers_sync_email`, 1 for `trg_customers_updated_at`), `pg_proc` for `sync_customer_email()`'s `SECURITY DEFINER`/`search_path`, `pg_class.relrowsecurity` and `pg_policies` (confirmed unchanged at 4 policies). Frozen-baseline check: total table count unchanged at 38; 9 key Phase 1-5 function body hashes spot-checked, all unchanged; trigger count 43 = 40 (Phase 1-5) + 3 new; function count 30 = 29 (Phase 1-5) + 1 new; policy count 123 unchanged; index count 88 unchanged. All 4 foreign keys from `quotations`, `master_pos`, `quotation_purchase_orders` (Phase 3), and `projects` (Phase 5) into `customers.id` re-queried directly and confirmed unchanged.

## 3. Test identity setup
Same pattern as Phase 4/5's verification (auto-provisioning trigger via `raw_user_meta_data`, explicit `user_roles` removal for the negative identity).

## 4. RLS - positive and negative, against the real pre-existing row
Negative identity: `SELECT` returned 0 rows, `UPDATE` affected 0 rows, direct `INSERT` rejected with the expected RLS policy violation. Positive identity (admin): confirmed able to read the row.

## 5. `sync_customer_email()` - four cases plus one edge case, all verified live
- `primary_email` set, `emails[]` also populated -> `primary_email` wins.
- `primary_email` null, `emails[]` populated -> falls back to `emails[0].email`.
- Both null, a direct `email` value submitted -> preserved.
- `emails` set to an empty (but non-null) array, direct `email` also submitted -> falls through gracefully to the submitted `email`, no error - confirming PostgreSQL's documented graceful-`NULL` behavior for jsonb array-index access on an out-of-bounds/empty array held up in a real query, not just in isolated reasoning.
- **Edge case**: an `UPDATE` setting `email` alone, on a row whose `primary_email` was already populated from a prior write, was correctly overridden back to the `primary_email` value by the trigger - proving live the one disclosed behavioral consequence of this design, not just asserting it.

An additional case - an `UPDATE` touching only an unrelated column (`phone`) - was verified to leave `email`/`primary_email` completely unchanged, confirming no drift is introduced by writes that never touch the email fields at all.

## 6. `updated_at` trigger - a test-methodology error caught and corrected, disclosed in full

The first attempt created a test row and updated it inside a single transaction, then compared `updated_at` before and after. Both readings were identical - not because the trigger failed to fire, but because `now()` is `STABLE` (fixed for the entire lifetime of a transaction, the same fact already established during Phase 4's and Phase 5's reviews), so a single-transaction test cannot distinguish "the trigger correctly recomputed `now()`" from "the trigger never fired at all." This was recognized before being reported as a pass, not after. Corrected by committing the test row in its own transaction, then updating it in a genuinely separate one: `updated_at` advanced from `11:27:08.75` to `11:27:14.11`, a real elapsed-time increase across two independently committed transactions - the same technique Phase 5's `updated_at` verification already used successfully. Only the corrected result is reported as a pass.

## 7. Pre-existing customer row integrity
Confirmed the one existing row's original 8 columns (`id`, `name`, `contact_person`, `phone`, `gstin`, `created_at`, `organization_id`, and `email`) are byte-identical to their pre-migration values - `email` in particular remains `NULL`, exactly as before, since the new `sync_customer_email` trigger only fires on future inserts/updates and this migration performs no backfill (a deliberate difference from Phase 5, which did backfill `project_number`).

## 8. Cleanup verification
All Phase 6 test identities (2 `auth.users` rows and their cascaded `profiles`/`user_roles`, plus 3 `security_audit_log` rows generated by their role assignment/removal) removed and confirmed at zero. All test customer rows created during the `sync_customer_email()` behavioral tests were either rolled back (never persisted) or explicitly deleted after their specific test - confirmed at zero residue via a direct query for the test-id prefix used.

## 9. What this methodology does not (yet) cover
Same caveats as Phase 1-5: no UI-driven verification (frontend still unwired to Supabase), no load/performance testing.
