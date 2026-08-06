# Phase 7 — Verification Methodology

Status: **Executed in full against the live Supabase project.** Directly reuses [phase1_verification.md](../phase-01/phase1_verification.md)'s baseline methodology and [phase5_verification.md](../phase-05/phase5_verification.md)/[phase6_verification.md](../phase-06/phase6_verification.md)'s pre-existing-table adaptations (live schema inspection before SQL, `set local role authenticated;` discipline, two-separate-transaction `updated_at` testing). This document records what's specific to Phase 7, including one test-methodology error caught and corrected mid-verification.

## 1. Pre-execution live schema and FK inspection

A read-only `information_schema.columns`/`pg_constraint`/`pg_indexes`/`information_schema.triggers`/`pg_policies` inventory of `public.vendors` was performed before any SQL was written, surfacing the 7-column baseline, zero triggers, and the missing `address` column. Additionally - beyond what Phase 5/6 needed, since neither had a comparably load-bearing FK question - every live foreign key referencing `vendors.id` was enumerated and its `confdeltype` checked directly, surfacing both `inventory_purchases.vendor_id` and `company_pos.vendor_id` at the default `NO ACTION`, against `petty_expenses.vendor_id`'s already-correct `SET NULL`. This inspection was repeated once more immediately before execution (identity check, checksum check, and a final `confdeltype` pre-state capture for all three FKs) to establish the exact baseline execution would be diffed against.

## 2. Post-execution structural checks

`information_schema.columns` for the full 9-column inventory (7 pre-existing + `address` + `updated_at`), `information_schema.triggers` (confirmed the new `trg_vendors_updated_at`, `BEFORE UPDATE`), `pg_constraint` `confdeltype` for all three vendor-referencing FKs (both corrected to `n`/`SET NULL`, `petty_expenses` unchanged), `pg_policies` (confirmed unchanged at 4 policies on `vendors`, 123 total - zero new policies), `pg_indexes` (confirmed unchanged at 2 on `vendors`, 88 total - zero new indexes), `pg_proc` (confirmed `set_updated_at_timestamp()`'s body hash unchanged - reused, not redefined; function count unchanged at 30). Frozen-baseline check: table count unchanged at 38; trigger count 44 = 43 (Phase 1-6) + 1 new; 6 spot-checked Phase 1-6 function body hashes (`has_permission`, `current_organization_id`, `set_updated_at_timestamp`, `sync_customer_email`, `settle_expense_float`, `generate_project_number`) all unchanged.

## 3. Test identity setup

Same pattern as Phase 4/5/6's verification (auto-provisioning trigger via `raw_user_meta_data`, explicit `user_roles` removal for the negative identity).

## 4. RLS - positive and negative

Negative identity: `SELECT` returned 0 rows, `UPDATE` affected 0 rows, direct `INSERT` rejected with the expected RLS policy violation. Positive identity (admin): read a row including the new `address`/`updated_at` columns, and successfully updated `address` through the unmodified `vendors_update` policy - confirming the new columns are automatically covered by row-level policies with zero policy change required.

## 5. `ON DELETE SET NULL` - both corrected FKs, tested live with a real delete

A test vendor was created with a real linked `inventory_purchases` row and a real linked `company_pos` row (both referencing the test vendor's `id`). The vendor was then deleted directly. Both outcomes were confirmed by re-reading the two dependent rows afterward: the delete succeeded with no foreign-key violation, both rows survived, and both `vendor_id` columns read back as `NULL`. On `company_pos` specifically, the cached `vendor_name` snapshot ("PHASE7TEST Vendor V1") was confirmed to survive independently of the cleared link - the exact behavior `Vendors.tsx`'s delete-confirmation dialog promises the user, proven live rather than only reasoned about statically.

## 6. `updated_at` trigger - two genuinely separate transactions, per the Phase 6 lesson

Applying the methodology correction already disclosed in [phase6_verification.md](../phase-06/phase6_verification.md) §6, this test was designed correctly from the start: a test vendor was inserted and committed in one transaction, its `updated_at` captured, then updated (a `phone` change) in a second, later, separately committed transaction. `updated_at` advanced from `12:50:19.3518+00` to `12:50:24.226493+00` - a real, multi-second elapsed-time increase across two independently committed transactions, correctly proving the trigger fires rather than merely reflecting `now()`'s transaction-lifetime stability.

## 7. Cleanup verification - a test-methodology error caught and corrected, disclosed in full

The first cleanup pass attempted to delete `security_audit_log` rows referencing the two test identities using a `user_id` column - which does not exist on that table (its actual columns are `actor_user_id`/`target_user_id`). This malformed query silently deleted nothing, and the subsequent `auth.users` delete for both test identities then failed outright on a foreign-key violation (`security_audit_log_target_user_id_fkey`), leaving both test `auth.users` rows, both `profiles` rows, and 4 audit rows (2 `role_assigned`, 2 `role_removed`) genuinely live. This was not silently passed over: the residue-count check performed immediately afterward returned 2 leftover `auth.users` and 2 leftover `profiles`, surfacing the failure directly. The correct column names were looked up from `information_schema.columns`, the 4 audit rows were deleted using `actor_user_id`/`target_user_id`, the `auth.users` delete was re-run and succeeded (cascading to `profiles`), and a follow-up query confirmed zero *new* audit rows were generated by that second round of deletion. A final residue check across all seven categories (test vendors, test `inventory_purchases`, test `company_pos`, `auth.users`, `profiles`, `security_audit_log`, and a full production-table row-count re-check) confirmed zero residue, and a full structural re-check (38 tables / 44 triggers / 30 functions / 123 policies / 88 indexes) confirmed none of this test activity left any drift.

## 8. What this methodology does not (yet) cover

Same caveats as Phase 1-6: no UI-driven verification (frontend still unwired to Supabase), no load/performance testing.
