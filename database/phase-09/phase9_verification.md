# Phase 9 — Verification Methodology

Status: **Executed in full against the live Supabase project.** Directly reuses [phase1_verification.md](../phase-01/phase1_verification.md)'s baseline methodology and every prior phase's pre-existing-table and FK-correction-testing adaptations. No test-methodology errors occurred this phase.

## 1. Pre-execution live inspection

Full column/constraint/index/trigger/policy inventory of all three tables performed before SQL was written, including reading all three finance trigger function bodies in full (`update_invoice_total`, `update_invoice_status`, `prevent_overpayment`) via `pg_get_functiondef()`. A complete pre-execution baseline was captured immediately before execution: 38 tables / 0 views / 30 functions / 47 triggers / 123 policies / 88 indexes / 0 sequences, plus exact column, FK `confdeltype`, function body hash, and row-level state of all three target tables (one row each). The linked project's `customer_id` was independently confirmed non-null before relying on it as the backfill source.

## 2. Post-execution structural checks

`information_schema.columns` for all 34 new columns (57 total across the 3 tables), `invoices.customer_id`'s `NOT NULL` and backfilled value, `payments_invoice_id_fkey`'s `confdeltype` (`c`/`CASCADE`), both corrected function bodies read back via `pg_get_functiondef()` and confirmed to match the migration file exactly. Frozen-baseline check: table count unchanged at 38; function count unchanged at 30 (confirms the two functions were replaced, not added, alongside the trigger); index count unchanged at 88; policy count unchanged at 123; trigger count 49 = 47 (Phase 1-8) + 2 new. `prevent_overpayment()` and `set_updated_at_timestamp()` body hashes recomputed and confirmed identical pre- and post-execution.

## 3. Behavioral tests - real inserts, updates, and deletes, hand-calculated against the frontend's own formula

A test invoice was created with the default GST rates (cgst 9, sgst 9, igst 0) and driven through its full lifecycle:

- **GST-aware `update_invoice_total()`**: a line item (qty 10, price 100) produced `total_amount = 1180` - matching the hand-calculated frontend formula exactly (subtotal 1000, cgst 90, sgst 90, igst 0). A second line item (qty 5, price 50) produced `total_amount = 1476` (subtotal 1250, cgst `round(112.5)=113`, sgst 113) - confirming the per-component rounding, not a combined shortcut, and confirming the `SUM()` aggregation over multiple items still works correctly.
- **Corrected `update_invoice_status()` strings**: a partial payment (500 of 1476) produced `status = 'PartiallyPaid'` (no space); a second payment covering the remainder produced `status = 'Paid'` - both read back and compared as exact strings, not just visually inspected.
- **`prevent_overpayment()` unaffected**: a further payment attempt against the now-fully-paid invoice was rejected with the exact expected `ERROR: Overpayment not allowed`, row not inserted - confirming this untouched trigger still functions correctly alongside the two corrected ones.
- **`updated_at` trigger**: tracked across two genuinely separate, independently committed statements (insert, then a later explicit edit) - a real, later timestamp confirmed each time.
- **`ON DELETE CASCADE`**: the test invoice was deleted while 2 real `invoice_items` rows and 2 real `payments` rows still referenced it. The delete succeeded, and all 4 child rows were confirmed removed (not orphaned) in the same operation - self-cleaning the test data as a side effect of the very behavior being verified.

## 4. Cleanup verification

All test rows were removed via the `CASCADE` delete itself; a residue check for the `PHASE9TEST` marker across all three tables, plus explicit ID lookups for every test row created, confirmed zero residue. Production row counts re-confirmed at exactly the pre-execution baseline (1/1/1).

## 5. Production data integrity

The one pre-existing row in each table was confirmed byte-identical across every original column both immediately after execution and again after test cleanup, with exactly one intended change: the invoice's `status` corrected from the corrupted `'Partially Paid'` to the frontend-matching `'PartiallyPaid'` - the disclosed, intentional defect fix, not drift. `total_amount` on the real row remained unchanged at `1000`, correctly, since the corrected trigger only recomputes on `invoice_items` insert/update and the real `invoice_items` row was never touched.

## 6. What this methodology does not (yet) cover

Same caveats as Phase 1-8: no UI-driven verification (frontend still unwired to Supabase), no load/performance testing.
