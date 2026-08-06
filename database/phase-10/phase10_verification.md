# Phase 10 — Verification Methodology

Status: **Executed in full against the live Supabase project, including one genuine defect caught during behavioral verification, disclosed, corrected, and re-verified.** This document records the incident in full, matching this project's standing transparency requirement.

## 1. Pre-execution live inspection

Full column/constraint/index/trigger/policy inventory of `delivery_challans` performed before SQL was written. A complete pre-execution baseline was captured: 38 tables / 30 functions / 49 triggers / 123 policies / 88 indexes, plus the exact 6-column pre-existing schema and 0 rows.

## 2. Post-execution structural checks (first pass)

`information_schema.columns` for all 18 new columns, the new FK's `confdeltype`, the new trigger's presence and target function - all confirmed matching the design. Frozen-baseline check: table/function/policy/index counts unchanged; trigger count 50 = 49 + 1.

## 3. Behavioral test that failed, disclosed in full

A real test customer and a real linked test delivery challan were created. The `updated_at` trigger test passed (advanced across two separately committed statements). The `ON DELETE SET NULL` test then **failed**: deleting the test customer produced

```
ERROR:  null value in column "customer_id" of relation "delivery_challans" violates not-null constraint
```

This was not a test-methodology error - the migration itself had added `customer_id` as both `NOT NULL` and the target of an `ON DELETE SET NULL` FK, a combination Postgres accepts at DDL time but cannot satisfy at runtime. This was caught by the test as designed, not hidden or explained away. A follow-up query confirmed the failed statement rolled back atomically: both the test customer and its link to the test delivery challan were unchanged afterward - no partial or corrupted state resulted.

## 4. Correction, applied live and re-verified

`ALTER TABLE public.delivery_challans ALTER COLUMN customer_id DROP NOT NULL;` was applied directly to the live database. The archived migration file was updated to remove the `SET NOT NULL` statement for `customer_id` (section 2 of the file), with a full explanation added to the header. The checksum was recomputed (`98c7a6002331afdc07c9ba7b7156a9c08e568a28d5bf92bf92c0dec1fb03c14b`) and the live `schema_migrations` row was updated to match, along with an updated description recording the correction. The exact same test scenario was then re-run: the customer delete succeeded, and the delivery challan survived with `customer_id` correctly read back as `NULL`.

## 5. Full re-verification after the fix

All structural checks were re-run after the correction: table/function/trigger/policy/index counts unchanged from the post-execution baseline (the fix was a single `ALTER COLUMN`, not a structural addition/removal), `customer_id` confirmed nullable, `dispatch_date` confirmed still `NOT NULL`, the FK confirmed still `SET NULL`. The independently recomputed checksum of the corrected archived file matches the corrected live registration exactly.

## 6. Cleanup verification

All test rows (the test customer and the test delivery challan) were explicitly deleted after the corrected test passed. A residue check for the `PHASE10TEST` marker across both tables, plus explicit ID lookups, confirmed zero residue. `delivery_challans` row count confirmed restored to 0 (its pre-execution baseline). Production data (`customers`, `projects`, `invoices` - all 1 row each) confirmed unchanged throughout, including the one real "Test Customer" row.

## 7. What this incident confirms about this project's own conventions

The corrected design - a nullable FK target column with `ON DELETE SET NULL`, "required at creation" left to frontend validation rather than a database `NOT NULL` - is the exact pattern already used for `vendor_id` (Phase 7) and `inventory_item_id` (Phase 8), neither of which was ever made `NOT NULL`. This incident is a live, disclosed confirmation of why that precedent exists, not a new lesson invalidating it.

## 8. What this methodology does not (yet) cover

Same caveats as Phase 1-9: no UI-driven verification (frontend still unwired to Supabase), no load/performance testing.
