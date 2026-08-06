# Phase 9 — Completion Report: Invoices

**Verdict: Phase 9 is verified complete. All checks PASS. Zero FAILs.**

Migration: [phase9_invoices_FINAL.sql](./phase9_invoices_FINAL.sql), executed against the live Supabase project. Registered as `schema_migrations` version `20260806_009_phase9_invoices`, checksum `374bd0c6219391cf0f65b4007e11ffa95f4acad97a98d4e8473e61648a76e63f` - independently recomputed from the file and confirmed to match before execution, and confirmed live to match exactly after.

## Execution notes - full transparency

**Execution itself was clean on the first attempt** - single `BEGIN...COMMIT`, zero errors. The two `NOTICE`s (`trigger "trg_invoices_updated_at"/"trg_invoice_items_updated_at" ... does not exist, skipping`) were the expected, harmless output of this file's own idempotent `DROP TRIGGER IF EXISTS` statements running for the first time.

**This phase modified the bodies of two frozen Phase 1 functions** (`update_invoice_total()`, `update_invoice_status()`) - the first time in this engagement that a function's logic, not just a constraint clause, was corrected. This was explicitly approved by the user with eight named constraints after the architecture round identified two confirmed, evidence-backed defects and stopped to ask. The re-run architecture review caught two things before SQL was written that would otherwise have been mistakes: `paid_amount` is frontend-written, not trigger-derivable (adding trigger maintenance would have been scope creep), and a required `customer_id` column that the original discovery summary had not listed.

**No test-methodology errors occurred this phase.**

## Structural Verification

| Check | Method | Result | Status |
|---|---|---|---|
| Full column inventory, all 3 tables | `information_schema.columns` | 34 new columns present (57 total), exact match to approved design | PASS |
| `invoices.customer_id` NOT NULL + backfill | `information_schema.columns`, direct read | Present, backfilled from `projects.customer_id` for the one existing row | PASS |
| `payments_invoice_id_fkey` FK | `pg_constraint.confdeltype` | Corrected from `a` (`NO ACTION`) to `c` (`CASCADE`) | PASS |
| `update_invoice_total()` body | `pg_get_functiondef()` | Matches the migration file exactly; name, `SECURITY DEFINER`, `search_path` unchanged | PASS |
| `update_invoice_status()` body | `pg_get_functiondef()` | Matches the migration file exactly; same unchanged attributes | PASS |
| `prevent_overpayment()` unchanged | Body hash | Identical pre/post | PASS |
| 2 new `updated_at` triggers | `information_schema.triggers` | Present, both pointing to `set_updated_at_timestamp()` | PASS |
| RLS unchanged | `pg_policies` | 123 total, all 12 policies on the 3 tables byte-for-byte identical | PASS |
| Permissions unchanged | `public.permissions` | `invoices`/`payments` module rows unchanged, 135 total unchanged | PASS |
| Frozen-baseline: Phase 1-8 untouched | Table/function/policy/index counts | Table 38 (unchanged); function 30 (unchanged - confirms replace not add); policy 123 (unchanged); index 88 (unchanged); trigger 49 = 47 + 2 | PASS |

## Behavioral Verification

| Check | Method | Result | Status |
|---|---|---|---|
| GST-aware `update_invoice_total()` | Real line items, hand-calculated expected values | `1180` then `1476` - exact match, including per-component rounding | PASS |
| Corrected `update_invoice_status()` strings | Real payments | `'PartiallyPaid'` then `'Paid'`, exact string match | PASS |
| `prevent_overpayment()` - negative case | Real overpayment attempt | Rejected with `ERROR: Overpayment not allowed`, row not inserted | PASS |
| `updated_at` trigger | Real update, two separately committed statements | Advanced across a real elapsed interval | PASS |
| `ON DELETE CASCADE` | Real invoice + 2 real `invoice_items` + 2 real `payments`, real delete | All 4 rows removed together, none orphaned | PASS |
| Pre-existing production data intact | Direct read, all columns | Byte-identical except the one intended `status` correction | PASS |

## Cleanup Confirmation

All Phase 9 test rows were removed by the `CASCADE` delete itself, as part of the very behavior being verified. Residue check for the `PHASE9TEST` marker and explicit ID lookups confirmed zero residue. Production row counts confirmed restored to the exact pre-execution baseline (1/1/1).

## No FAILs

Every check passed on real, live, non-superuser-scoped behavioral evidence, including hand-calculated GST totals verified against the exact frontend formula and a real cascading delete - not reasoned about statically.
