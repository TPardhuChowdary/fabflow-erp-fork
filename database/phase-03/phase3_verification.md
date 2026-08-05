# Phase 3 — Verification Methodology

Status: **Executed in full against the live Supabase project.** Directly reuses [phase1_verification.md](../phase-01/phase1_verification.md) and [phase2_verification.md](../phase-02/phase2_verification.md)'s methodology. This document records what's specific to Phase 3, including a real methodology error caught and corrected mid-verification.

## 1. Structural checks
`\d` against all 6 new tables, `pg_get_functiondef()` for `generate_quotation_number()`, `pg_class.relrowsecurity` for RLS flags, `pg_policies` counts, and a frozen-baseline check (total table count 36 = Phase 1's 23 + Phase 2's 7 + Phase 3's 6; Phase 1/2 `schema_migrations` checksums unchanged; `projects` column list unchanged; `has_permission()`/`generate_employee_code()`/`set_updated_at_timestamp()`/`prevent_employee_code_change()` all unchanged).

## 2. A real test-methodology error, caught mid-verification, corrected, and disclosed

Several of the earliest behavioral tests this phase (the initial "positive path" fan-out test and the first attempts at three negative RLS tests) omitted `set local role authenticated;` before `set local request.jwt.claims`. Setting only the JWT claims variable without also switching the active Postgres role leaves the session running as the connecting superuser (`postgres`), which **bypasses RLS entirely** — so those results proved nothing about RLS, whether they showed a row being inserted or not. This was caught by noticing three consecutive "negative" tests all showed `INSERT 0 1` (success) where `42501` was expected, which is what actually exposed the gap — not a pre-emptive check.

**Every affected test was re-run with `set local role authenticated;` correctly included**, and only the corrected results are reported in [phase3_completion_report.md](./phase3_completion_report.md). This is documented here in full, per this project's standing commitment to report outcomes faithfully, exactly as Phase 2's dry-run/commit incident was documented rather than omitted. The lesson is now explicit for any future phase's verification: **`set local role authenticated;` is not optional and must be the first statement after `begin;` in every RLS-dependent test, every time** — a missing `role` switch produces false "it works" results that look identical to genuine RLS-permitted access, unlike a missing `request.jwt.claims` (which produces an obvious `auth.uid()`-is-null failure instead).

## 3. Role selection — real seeded grants, not synthetic combinations
Queried `role_permissions` for the `quotations`/`purchase_orders`/`company_po`/`projects` modules before choosing test roles, exactly as Phase 2 did:
- `sales` — full `quotations`/`purchase_orders` grants, plus `projects.create/edit/view` — used for the complete positive-path fan-out and `master_pos` read/update.
- `procurement` — full `company_po` grants — used for `company_pos` positive path.
- `Designer` — `projects.edit/view`, **zero** `quotations`/`purchase_orders` grants — used to prove the `project_purchase_orders` OR condition's second path independently (insert succeeds via `projects.edit` alone).
- `quality` — **zero** grants in `quotations`, `purchase_orders`, or `projects.edit` (only `projects.view`) — used to prove the negative case of the same OR condition (neither path available, correctly rejected).
- A per-user override (`purchase_orders.create` granted to the `quality` test user, `quotations.edit` still absent) — used to isolate `master_pos`'s split permission mapping, proving it specifically requires `quotations.edit` and not just any purchase-order-adjacent grant.

## 4. FK behavior verification — all four `ON DELETE` variants exercised with real deletes
- Two `RESTRICT`s (`master_pos.quotation_id`, `master_po_id` on both dependent tables) — each proven by attempting the blocked delete and confirming the exact FK-violation error naming the correct constraint.
- One `CASCADE` (`quotation_revisions.quotation_id`, reachable when no `master_pos` is linked) — proven by deleting a quotation with only a revision attached and confirming zero rows remain.
- One `SET NULL` (`project_purchase_orders.quotation_id`) — proven with a deliberately constructed case where a `project_purchase_orders` row's `master_po_id` points to one quotation (protected, untouched) while its separate, informational `quotation_id` back-reference points to a *different* quotation being deleted — confirming the column goes `NULL` and the row survives, isolated from the structural `master_po_id` relationship.

## 5. Integrity constraint verification
Both `quotation_revisions` constraints tested with real conflicting inserts, confirming the exact constraint name in each `23505` error. Additionally, before treating `uq_quotation_revisions_one_current` as safe, the actual frontend create-revision handler (`Quotations.tsx`) was read directly to confirm it flips the previous revision's `isCurrent` off before inserting the new one — proving the constraint is compatible with real app behavior, not just theoretically sound.

## 6. True concurrency — `generate_quotation_number()`
Identical two-overlapping-transaction technique as Phase 2's `employee_code` race: Process A calls the function then holds its transaction open via `pg_sleep(3)` before committing; Process B (started ~1s later) blocks on the counter row's lock until A commits, then proceeds. Authoritative proof is the two `RETURNING` values (`QT-2026-001` / `QT-2026-002`, sequential, no collision) and the final `document_counters.current_value`, not process logs.

## 7. Organization isolation
Same 2-org technique as Phase 1/2 — a session in a freshly created, isolated second organization confirmed to see zero rows of the first organization's real `quotations` data.

## 8. What this methodology does not (yet) cover
Same caveats as Phase 1/2: no UI-driven verification (frontend still unwired to Supabase), no load/performance testing. Additionally specific to Phase 3: `Payable`/`payables` (a confirmed live dependency via `CompanyPO.companyPoId`) has no live table and therefore nothing to verify against it yet.
