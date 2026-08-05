# Phase 3 — Completion Report: Quotations + Company POs

**Verdict: Phase 3 is verified complete. All checks PASS. Zero FAILs.**

Migration: [phase3_quotations_company_pos_FINAL.sql](./phase3_quotations_company_pos_FINAL.sql), executed against the live Supabase project. Registered as `schema_migrations` version `20260806_003_phase3_quotations_company_pos`, checksum `61c15c3743a27146a7cf26fbaf9ddb80c1f866ee716d87144592c3c1ff8dea85` — confirmed live to match exactly.

## Execution notes — full transparency

**1. A syntax error was reported and resolved before successful execution.** The first delivered file contained Unicode box-drawing separator characters (`═`) and em-dashes (`—`) in its comments. A syntax error (`ERROR: 42601 syntax error at or near ";"` at line 150) was reported against text that did not match this file's actual bytes — proven via raw byte dump, full-file control-character scan, and a complete character-level parser-state trace from byte 0 (tracking string/dollar-quote/comment state and parenthesis nesting exactly as the Postgres lexer does), none of which found any defect in the file. The non-ASCII characters were removed defensively as the most plausible explanation for a transmission/copy-paste corruption, producing an ASCII-only corrected file with a recomputed checksum. This is the file that was ultimately executed successfully.

**2. The database's actual state was independently verified before verification began, not assumed.** After the user reported successful execution, a fresh, read-only inspection (`current_database()`, `schema_migrations` row count, full table listing, `generate_quotation_number()` existence) showed Phase 3 absent — 2 `schema_migrations` rows, 30 tables, no Phase 3 objects. This was reported plainly rather than assumed away. A second execution attempt by the user then succeeded; a fresh independent re-check confirmed 3 `schema_migrations` rows (checksum matching exactly), 36 tables, all 6 Phase 3 tables present, and `generate_quotation_number()` present — at which point full verification began.

**3. A real test-methodology error was caught and corrected mid-verification.** Several early behavioral tests omitted `set local role authenticated;`, meaning they ran as the `postgres` superuser and bypassed RLS entirely — producing false "access granted" results for what were meant to be negative (denial) tests. This was noticed because three consecutive expected-`42501` tests all showed successful inserts instead, which prompted re-examination of the test scripts themselves rather than the migration. Every affected test was re-run correctly; only the corrected results are reported below. Full detail in [phase3_verification.md](./phase3_verification.md).

None of the above three items are defects in the Phase 3 migration's content — all three were process/transmission/test-methodology issues, caught, explained, and resolved before being reported as verified.

## Structural Verification

| Check | Method | Result | Status |
|---|---|---|---|
| All 6 tables exist with correct columns/types/defaults | `\d` per table | Exact match to design for all 6 | ✅ PASS |
| All FKs with correct `ON DELETE` behavior | `\d` per table | `RESTRICT` on `master_pos.quotation_id`, `master_po_id` (both dependents); `CASCADE` on `quotation_revisions.quotation_id`, `quotation_purchase_orders.quotation_id`/`revision_id`, `project_purchase_orders.project_id`; `SET NULL` on `project_purchase_orders.quotation_id` — all correct | ✅ PASS |
| Unique / partial-unique constraints | `\d` per table | `uq_quotations_org_qtno`, `uq_quotation_revisions_quotation_number`, `uq_quotation_revisions_one_current` (partial, `WHERE is_current`), `uq_company_pos_org_cpono` — all present | ✅ PASS |
| Indexes | `\d` per table | All 6 composite `org_*` indexes present | ✅ PASS |
| RLS enabled on all 6 tables | `pg_class.relrowsecurity` | All 6 = `true` | ✅ PASS |
| Policy counts | `pg_policies` | 4 per table × 6 tables = 24, matching design | ✅ PASS |
| `generate_quotation_number()` | `pg_get_functiondef()` | Byte-identical to the reviewed/approved definition; `SECURITY DEFINER`, `search_path=public` | ✅ PASS |
| Frozen-baseline: Phase 1/2 untouched | Table count, checksums, function defs, `projects` columns | 36 tables total (23+7+6); Phase 1/2 `schema_migrations` checksums unchanged; `has_permission()`/`generate_employee_code()`/`set_updated_at_timestamp()`/`prevent_employee_code_change()` unchanged; `projects` has its original 9 columns | ✅ PASS |

## Behavioral Verification

| Check | Method | Result | Status |
|---|---|---|---|
| `has_permission()` for new module combinations | Simulated sessions, real seeded grants | `sales`: `quotations.create=t`, `purchase_orders.view=t`, `company_po.view=f`; `quality`: `quotations.edit=f`, `projects.edit=f` — matches seed data exactly | ✅ PASS |
| Quotation numbering | Real `generate_quotation_number()` call | Returned `QT-2026-001`, correct format | ✅ PASS |
| Quotation creation | `sales` session, real `INSERT` | Succeeded under RLS | ✅ PASS |
| Revision creation | `sales` session, real `INSERT` | Succeeded, `revision_number=1`, `is_current=true` | ✅ PASS |
| `unique(quotation_id, revision_number)` | Real conflicting insert | Rejected: `23505 duplicate key ... "uq_quotation_revisions_quotation_number"` | ✅ PASS |
| `unique(quotation_id) WHERE is_current` | Real conflicting insert (two `is_current=true` rows) | Rejected: `23505 duplicate key ... "uq_quotation_revisions_one_current"` | ✅ PASS |
| Real create-revision flow compatible with the constraint | Direct read of `Quotations.tsx`'s handler | Confirmed it flips the previous revision's `isCurrent` off before inserting the new one | ✅ PASS |
| `master_pos` creation (positive) | `sales` session (`quotations.edit`), real `INSERT` | Succeeded under RLS | ✅ PASS |
| `master_pos` read/update (positive) | Same `sales` session (`purchase_orders.view`/`.edit`) | `SELECT` returned the row; `UPDATE` succeeded | ✅ PASS |
| `quotation_purchase_orders` creation | `sales` session, real `INSERT` | Succeeded | ✅ PASS |
| `project_purchase_orders` creation — path 1 (fan-out) | `sales` session (`quotations.edit`), real `INSERT` | Succeeded | ✅ PASS |
| `project_purchase_orders` creation — path 2 (direct) | `Designer` session (`projects.edit` only, `quotations.edit=false`), real `INSERT` | Succeeded — proves the OR is real, not effectively an AND | ✅ PASS |
| `company_pos` creation | `procurement` session (`company_po.create`), real `INSERT` | Succeeded | ✅ PASS |
| RLS denial — `project_purchase_orders` insert | `quality` session (neither `quotations.edit` nor `projects.edit`) | Rejected: `42501 row-level security policy` | ✅ PASS |
| RLS denial — `company_pos` insert | `sales` session (no `company_po` grants) | Rejected: `42501` | ✅ PASS |
| Permission-mapping precision — `master_pos` insert isolated | `quality` session granted `purchase_orders.create` via override, `quotations.edit` still absent | Rejected: `42501` — proves the policy requires `quotations.edit` specifically, not any purchase-order-adjacent grant | ✅ PASS |
| FK RESTRICT — `master_pos.quotation_id` | Real delete attempt against a quotation with a linked `master_pos` row | Rejected with the FK violation naming `master_pos_quotation_id_fkey` | ✅ PASS |
| FK RESTRICT — `master_po_id` | Real delete attempt against a `master_pos` row with a linked `project_purchase_orders` row | Rejected with the FK violation naming `project_purchase_orders_master_po_id_fkey` | ✅ PASS |
| FK CASCADE — `quotation_revisions.quotation_id` | Real delete of a quotation with only a revision attached (no `master_pos`) | Succeeded; revision count went to 0 | ✅ PASS |
| FK SET NULL — `project_purchase_orders.quotation_id` | Real delete of a quotation referenced only via the informational `quotation_id` back-reference (structural `master_po_id` link pointed elsewhere) | Succeeded; `quotation_id` became `NULL`, row survived, the structurally-linked quotation remained fully intact | ✅ PASS |
| Cross-module: organization isolation | 2nd, isolated test organization, real session | Saw 0 rows of org 1's real `quotations` data | ✅ PASS |

## Concurrency Verification

| Check | Method | Result | Status |
|---|---|---|---|
| `generate_quotation_number()` under genuine concurrent load | Two real, overlapping, committed transactions racing for the same organization's counter (lock-hold technique, identical to Phase 2's `employee_code` race) | Process A: `QT-2026-001`; Process B (blocked on A's lock until A committed): `QT-2026-002`. No collision. Final `document_counters.current_value = 2`, matching | ✅ PASS |

## Cleanup Confirmation
All temporary verification data (6 test `auth.users` rows across 2 organizations and their cascaded `profiles`/`user_roles`, 1 `user_permission_overrides` row, all associated `security_audit_log` rows, the 2nd test organization, and the `document_counters` `QT` test row) was removed and confirmed via live queries: **0 remaining** in every category. All 6 Phase 3 data tables confirmed empty before cleanup — every behavioral test ran inside a transaction that was rolled back, so no test data was ever committed to the actual entity tables. Real production data (1 organization, 1 customer, 1 project, and all other pre-existing rows across all three phases) confirmed fully intact.

## No FAILs
Every check passed on real, live, non-superuser behavioral evidence, including the corrected re-runs after the test-methodology error was caught. The three execution-notes items above are process findings, fully disclosed, not defects in the migration's content — the content itself passed every structural and behavioral check applied to it.
