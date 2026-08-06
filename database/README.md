# FabFlow ERP — Database Documentation

Permanent record of the migration from a 100% client-side/`localStorage` ERP to a real, multi-tenant Supabase/PostgreSQL backend. One folder per phase, each self-contained: architecture, security model, verification methodology, completion report, and rollback plan.

**Target architecture (all phases):** React UI → Service Layer → Supabase → PostgreSQL. The UI never calls Supabase directly; `useStore()` action names/signatures stay stable across the migration.

**Priority order governing every phase:** Correctness > Security > Data integrity > Maintainability > Scalability > Backward compatibility > Performance > UX.

**Standing rule for every phase:** never simplify or remove an existing workflow because it's hard to migrate — understand why it exists first, ask if uncertain, never guess. Each phase gets its own architecture review, migration plan, rollback plan, and independent live verification before the next phase begins.

## Phases

| Phase | Scope | Status |
|-------|-------|--------|
| [phase-01](./phase-01/) | Organizations, Supabase Auth, normalized RBAC, RLS, Security Audit Log, schema migration tracking, trigger hardening, race-condition fixes, indexing | ✅ Complete — 17/17 verified, 0 FAIL |
| [phase-02](./phase-02/) | Employees, Attendance, Salary Payments, Advance Records, Employee Documents, Project↔Employee assignment, organization-scoped document numbering | ✅ Complete — all checks verified, 0 FAIL |
| [phase-03](./phase-03/) | Quotations, Quotation Revisions, Master POs, Quotation Purchase Orders, Project Purchase Orders (junction, replaces Project.pos[] array), Company POs | ✅ Complete — all checks verified, 0 FAIL |
| [phase-04](./phase-04/) | Petty Expenses, Expense Floats, organization-scoped float numbering, trigger-maintained derived balances, `settle_expense_float()` atomic settlement primitive | ✅ Complete — all checks verified, 0 FAIL |
| phase-05+ | Customers, Vendors, Projects, Inventory, Production, Material Requisitions, Machinery, Drawing Repository, QMS, Delivery Challans, Invoices & Payments, Ledger & Reports (incl. Payables), Dashboard & Analytics, full integration | Not started |

## Phase 1 documents

- [phase1_architecture.md](./phase-01/phase1_architecture.md) — what was built and why
- [phase1_security.md](./phase-01/phase1_security.md) — the security/authorization model
- [phase1_verification.md](./phase-01/phase1_verification.md) — reusable verification methodology (use this as the baseline for every future phase's verification too)
- [phase1_completion_report.md](./phase-01/phase1_completion_report.md) — the 17-item PASS/WARNING/FAIL results
- [phase1_rollback.md](./phase-01/phase1_rollback.md) — rollback plan (documented, not executed)
- [phase1_auth_permissions_rls_v5_FINAL.sql](./phase-01/phase1_auth_permissions_rls_v5_FINAL.sql) — the executed migration itself, registered in `schema_migrations` as `20260806_001_phase1_auth_permissions_rls`

## Phase 2 documents

- [phase2_architecture.md](./phase-02/phase2_architecture.md) — what was built and why, including the junction-table redesign of project↔employee assignment and the two-identity-system finding
- [phase2_security.md](./phase-02/phase2_security.md) — the security/authorization model, including the dual-permission `project_employees` policy and `employee_code` immutability enforcement
- [phase2_verification.md](./phase-02/phase2_verification.md) — verification methodology, extending Phase 1's with the RLS/trigger-isolation and atomic-upsert-concurrency techniques
- [phase2_completion_report.md](./phase-02/phase2_completion_report.md) — full results, including a full-transparency note on an execution-process deviation during self-review
- [phase2_rollback.md](./phase-02/phase2_rollback.md) — rollback plan (documented, not executed)
- [phase2_employees_v1_FINAL.sql](./phase-02/phase2_employees_v1_FINAL.sql) — the executed migration itself, registered in `schema_migrations` as `20260806_002_phase2_employees`

## Phase 3 documents

- [phase3_architecture.md](./phase-03/phase3_architecture.md) — what was built and why, including the live-vs-dead entity audit (legacy `PurchaseOrder`, `Quotation.recordedPO`, `Enquiry` all confirmed dead code) and the `sharedPoId` string → real FK redesign
- [phase3_security.md](./phase-03/phase3_security.md) — the security model, centered on the permission-module mapping correction (`master_pos`/`project_purchase_orders` split across `quotations`/`purchase_orders`/`projects`, confirmed against live frontend gating code, not assumed from table names)
- [phase3_verification.md](./phase-03/phase3_verification.md) — verification methodology, including a disclosed test-methodology error (`set local role authenticated;` omitted in early tests, causing false-positive RLS results) caught and corrected mid-verification
- [phase3_completion_report.md](./phase-03/phase3_completion_report.md) — full results, including three fully-disclosed execution-process notes (a non-ASCII-character syntax-error episode, a genuine "migration not yet applied" state caught by independent database-identity verification, and the test-methodology error above)
- [phase3_rollback.md](./phase-03/phase3_rollback.md) — rollback plan (documented, not executed)
- [phase3_quotations_company_pos_FINAL.sql](./phase-03/phase3_quotations_company_pos_FINAL.sql) — the executed migration itself, registered in `schema_migrations` as `20260806_003_phase3_quotations_company_pos`

## Phase 4 documents

- [phase4_architecture.md](./phase-04/phase4_architecture.md) — what was built and why, including the derived-field trigger design and the post-approval `settle_expense_float()` concurrency fix
- [phase4_security.md](./phase-04/phase4_security.md) — the security/authorization model, centered on `settle_expense_float()`'s internal permission re-check (necessary since it's a directly-callable `SECURITY DEFINER` RPC that doesn't inherit table RLS) and the deliberately-deferred `returned_amount` direct-write limitation
- [phase4_verification.md](./phase-04/phase4_verification.md) — verification methodology, including the auto-provisioning-trigger adaptation needed for an empty `auth.users` baseline and the `clock_timestamp()`-verified concurrency proofs
- [phase4_completion_report.md](./phase-04/phase4_completion_report.md) — full results, 0 FAIL
- [phase4_rollback.md](./phase-04/phase4_rollback.md) — rollback plan (documented, not executed)
- [phase4_petty_expenses_FINAL.sql](./phase-04/phase4_petty_expenses_FINAL.sql) — the executed migration itself, registered in `schema_migrations` as `20260806_004_phase4_petty_expenses`
