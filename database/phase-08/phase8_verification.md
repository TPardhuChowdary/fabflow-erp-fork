# Phase 8 — Verification Methodology

Status: **Executed in full against the live Supabase project.** Directly reuses [phase1_verification.md](../phase-01/phase1_verification.md)'s baseline methodology and [phase7_verification.md](../phase-07/phase7_verification.md)'s pre-existing-table and FK-correction-testing adaptations. This document records what's specific to Phase 8. No test-methodology errors occurred this phase - both prior lessons (two-separate-transaction `updated_at` testing from Phase 6, and correct `security_audit_log` column names from Phase 7) were applied correctly from the start.

## 1. Pre-execution live inspection

Full `information_schema.columns`/`pg_constraint`/`pg_indexes`/`information_schema.triggers`/`pg_policies` inventory of all three tables performed before any SQL was written, surfacing the 7/7/6-column baselines, `inventory_items.name`'s nullability, and the four pre-existing stock triggers' exact bodies (captured via `md5(prosrc)` for later drift comparison). A complete pre-execution baseline was captured immediately before execution: 38 tables / 0 views / 30 functions / 44 triggers / 123 policies / 88 indexes / 0 sequences, plus exact column, FK `confdeltype`, trigger, and row-level state of all three target tables (one row each, values recorded in full).

## 2. Post-execution structural checks

`information_schema.columns` for all 20 new columns across the 3 tables (correct types/nullability/defaults), `inventory_items.name`'s `NOT NULL`, `inventory_purchases_gst_percent_check`'s definition, all 3 new `updated_at` triggers (confirmed pointing at `set_updated_at_timestamp()`), both corrected FKs' `confdeltype` (`n`/`SET NULL`). Frozen-baseline check: table count unchanged at 38; function count unchanged at 30; index count unchanged at 88; policy count unchanged at 123; trigger count 47 = 44 (Phase 1-7) + 3 new - reconciles exactly. Five function body hashes (`increase_stock`, `reduce_stock`, `prevent_negative_stock`, `stock_check`, `set_updated_at_timestamp`) recomputed and confirmed identical pre- and post-execution.

## 3. Behavioral tests - real inserts, updates, and deletes, not static reasoning

A test inventory item was created and driven through the full lifecycle:

- **`increase_stock`**: a real purchase insert (quantity 50, also populating every new `inventory_purchases` column) drove `current_stock` from 0 to 50.
- **`reduce_stock`**: a real usage insert (quantity 20) drove `current_stock` from 50 to 30.
- **`prevent_negative_stock`** - negative case: a usage insert of quantity 9999 against 30 available was rejected with the exact expected `ERROR: Not enough stock`; `current_stock` confirmed unaffected and the row confirmed not inserted.
- **`gst_percent` CHECK** - negative case: a purchase insert with `gst_percent = -5` was rejected with the expected constraint-violation error; row confirmed not inserted.
- **`updated_at`**: tracked across three genuinely separate, independently committed statements - the item's initial insert, the two stock triggers' own internal `UPDATE inventory_items` (confirming the predicted safe side-effect interaction between the new `updated_at` trigger and the pre-existing stock triggers), and an explicit direct edit - each showing a real, later timestamp than the one before it.
- **`ON DELETE SET NULL`**: the test item was deleted while a real purchase and a real usage row still referenced it. The delete succeeded with no foreign-key violation; both rows survived with `inventory_item_id` read back as `NULL`; the cached `material_name` snapshot on both rows was confirmed to survive independently of the cleared link.

## 4. Cleanup verification

All test rows (one `inventory_items`, two `inventory_purchases` insert attempts including the rejected CHECK-violation one, three `inventory_usages` insert attempts including the rejected negative-stock one) were explicitly deleted or confirmed never persisted. A residue check across `inventory_items`/`inventory_purchases`/`inventory_usages` for the `PHASE8TEST` marker, plus explicit ID lookups for every test row created, confirmed zero residue. Production row counts re-confirmed at exactly the pre-execution baseline (1/1/1), with the three real rows re-verified byte-identical to their pre-execution values.

## 5. Production data integrity

The one pre-existing row in each of the three tables (`inventory_items` id `ccf33222-...`, name `Steel`, current_stock `90`; `inventory_purchases` id `fcf65bdf-...`, quantity `100`; `inventory_usages` id `7e462f06-...`, quantity_used `20`) was confirmed byte-identical across every original column both immediately after execution and again after test cleanup. Unrelated tables (`vendors`, `company_pos`, `customers`, `projects`) row counts re-confirmed unchanged.

## 6. What this methodology does not (yet) cover

Same caveats as Phase 1-7: no UI-driven verification (frontend still unwired to Supabase), no load/performance testing.
