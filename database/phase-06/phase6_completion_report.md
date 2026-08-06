# Phase 6 — Completion Report: Customers

**Verdict: Phase 6 is verified complete. All checks PASS. Zero FAILs.**

Migration: [phase6_customers_FINAL.sql](./phase6_customers_FINAL.sql), executed against the live Supabase project. Registered as `schema_migrations` version `20260806_006_phase6_customers`, checksum `1833447fcd46c7b6b3a9c064ce1c31b2cd699812c27f664ce500e87346dedef2` - independently recomputed from the file and confirmed to match before execution, and confirmed live to match exactly after.

## Execution notes - full transparency

**Execution itself was clean on the first attempt** - single `BEGIN...COMMIT`, zero errors. The two `NOTICE`s (`trigger "trg_customers_sync_email"/"trg_customers_updated_at" ... does not exist, skipping`) were the expected, harmless output of this file's own idempotent `DROP TRIGGER IF EXISTS` statements running for the first time.

**One correction happened during self-review, before execution, not during it**: the first generated draft did not include explicit rollback-consideration comments, which that round's instructions explicitly required - corrected before delivery, checksum recomputed.

**One test-methodology error was caught mid-verification, corrected, and disclosed** (full detail in [phase6_verification.md](./phase6_verification.md) §6): an `updated_at` trigger test performed entirely inside one transaction produced identical before/after timestamps - not a defect, but an inconclusive test, since `now()` is fixed for a transaction's lifetime. Recognized before being reported, re-run correctly across two separately committed transactions, and only the corrected result is reported below.

## Structural Verification

| Check | Method | Result | Status |
|---|---|---|---|
| Full 15-column inventory | `information_schema.columns` | Exact match to approved design; 7 new columns, `name`'s pre-existing `NOT NULL` untouched | PASS |
| Constraints unchanged | `pg_constraint` | 2 total (PK, organization_id FK) - identical to pre-migration state; zero new constraints added, as designed | PASS |
| Indexes unchanged | `pg_indexes` | 2 total, identical to pre-migration state | PASS |
| Triggers | `information_schema.triggers` | 3 rows: `trg_customers_sync_email` (INSERT + UPDATE), `trg_customers_updated_at` (UPDATE) | PASS |
| `sync_customer_email()` - `SECURITY DEFINER` + `search_path` | `pg_proc` | Present, `prosecdef=true`, `proconfig={search_path=public}`; function body matches source exactly | PASS |
| RLS unchanged | `pg_class.relrowsecurity`, `pg_policies` | Enabled; all 4 policies byte-for-byte identical to pre-migration state | PASS |
| Foreign keys into `customers.id` | `pg_constraint` (`confrelid`) | All 4 (`quotations`, `master_pos`, `quotation_purchase_orders`, `projects`) confirmed present, definitions unchanged | PASS |
| Frozen-baseline: Phase 1-5 untouched | Table/trigger/function/policy/index counts, 9 function body hashes | Table count 38 (unchanged); trigger 43=40+3; function 30=29+1; policy 123 (unchanged); index 88 (unchanged); all 9 hashes unchanged | PASS |

## Behavioral Verification

| Check | Method | Result | Status |
|---|---|---|---|
| RLS negative - `SELECT`/`UPDATE`/`INSERT` | Zero-permission session | `SELECT`→0 rows; `UPDATE`→0 rows; `INSERT`→rejected | PASS |
| RLS positive | Admin session | Row read correctly | PASS |
| Email sync - `primary_email` wins | Real insert | `email` set to `primary_email`'s value | PASS |
| Email sync - `emails[0]` fallback | Real insert, `primary_email` null | `email` set to first `emails[]` entry | PASS |
| Email sync - direct write preserved | Real insert, both null | `email` kept as submitted | PASS |
| Email sync - empty array graceful fallthrough | Real insert, `emails='[]'` | `email` kept as submitted, no error | PASS |
| Email sync - standalone override edge case | Real update, `primary_email` already set | `email` correctly overridden back to `primary_email` | PASS |
| Unrelated-column update leaves email unchanged | Real update (`phone` only) | `email`/`primary_email` unchanged | PASS |
| `updated_at` trigger | Real update, two separately committed transactions (corrected methodology) | Advanced from `11:27:08.75` to `11:27:14.11` | PASS |
| Pre-existing customer row intact | Direct read, all columns | Original 8 columns byte-identical; `email` still `NULL` as before; no backfill performed | PASS |

## Cleanup Confirmation
All Phase 6 verification identities (2 `auth.users` rows, cascaded `profiles`/`user_roles`, 3 generated `security_audit_log` rows) removed and confirmed at zero. All test customer rows created during behavioral testing were either rolled back or explicitly deleted, confirmed at zero residue.

## No FAILs
Every check passed on real, live, non-superuser behavioral evidence, including a genuinely corrected concurrency-adjacent test (the `updated_at` methodology fix) rather than a silently-accepted inconclusive result.
