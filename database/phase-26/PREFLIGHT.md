# Phase 26 — Master Migration Preflight (read-only)

Validates database/phase-25/MASTER_AUDIT.md. No code/DB/schema/RLS/
permission/fixture changes made. All facts below from targeted `psql`
reads and targeted source reads — global investigation NOT repeated.

## Baseline row counts confirmed (read-only, all pre-existing seed data
predating this session — none created by this engagement)

`material_requisitions=1`, `invoices=1`, `inventory_purchases=1`,
`inventory_usages=1`. Everything else remaining = 0.
`project_production_stages=0`, `production_stage_transactions=0` —
confirms zero trigger-created rows, Phase 25's E-3 premise still holds.

## Correction to Phase 25 — E-2 is RESOLVED, not a genuine decision

Direct read of `pages/MaterialRequisitions.tsx` shows the **live page
does not use `MaterialRequisition`/`materialRequisitions` at all** — it
reads/writes `bomRequisitions: BomRequisition[]` exclusively (`updateBom
Requisition` for "Mark as Completed"). Repo-wide grep confirms
`materialRequisitions`/`addMaterialRequisition`/`updateMaterialRequisition`
have **zero live call sites** — the only reference outside `store.ts`/
`types.ts` is `Settings.tsx`'s full-state JSON backup export, not a real
feature.

**Conclusion:** `MaterialRequisition`/`MRItem[]` is dead legacy state,
exactly like `project_materials`. There is nothing to decompose and
nothing to decide — Option C from Phase 25's own A/B/C/D framing turns out
to be correct, and more: the live page already gets its data from a table
that already IS one-row-per-item (`bom_requisitions`, via `project_bom_
items`'s trigger). **E-2 is RESOLVED: do not migrate `material_
requisitions` at all (nothing depends on it); instead fold `bom_
requisitions` READ (hydrate) + its one legitimate write path (`bom_
requisitions_approve` UPDATE policy, "Mark as Completed") into Batch 1,
alongside `project_bom_items`.**

## Batch 1 — FINAL STATUS: SAFE, with corrected scope

Original 8 + 1 correction (drop `material_requisitions`'s wrongly-implied
work, add `bom_requisitions` read+approve-write, batched with
`project_bom_items`):

| Domain | Status | Note |
|---|---|---|
| `advance_records` | SAFE | Single centralized mutation site confirmed: `EmployeeDetail.tsx` only. |
| `attendance_records` | SAFE | Same. |
| `employee_documents` | SAFE | Same. |
| `salary_payments` | SAFE | Same. |
| `project_employees` | REQUIRES SPECIAL BUT UNAMBIGUOUS HANDLING | Confirmed: frontend toggles `Project.assignedEmployeeIds` as a whole-array replace in `ProjectDetail.tsx` (checkbox → `updateProject({...project, assignedEmployeeIds: updated})`). Correct migration: diff old vs new array on each toggle, issue exactly one pair-INSERT or pair-DELETE for the single changed id — never a wholesale replace-all. Once migrated, `setProjectsFromServer`'s field-merge exception for `assignedEmployeeIds` (Phase 22 Decision 3) is replaced by computing it from hydrated `project_employees` rows grouped by `project_id` — this was always the anticipated resolution path per Decision 3's own wording, not a new ambiguity. |
| `project_bom_items` **+ `bom_requisitions` (corrected addition)** | REQUIRES SPECIAL BUT UNAMBIGUOUS HANDLING | Confirmed `recompute_bom_requisition()`'s own code comment states it mirrors existing frontend `deleteBomItem`/`updateBomItem` filtering exactly. Confirmed frontend's local `newBomReqs` computation in `addBomItem`/`updateBomItem`/`deleteBomItem` is the same logic the DB trigger now owns — once migrated, this local recompute becomes dead code, replaced by hydrating `bom_requisitions` (read-only except the "Mark as Completed" UPDATE, which uses the `material_requisitions.approve` permission — confirmed present in `permissions.ts`). |
| `inventory_purchases` | REQUIRES SPECIAL BUT UNAMBIGUOUS HANDLING | `trg_increase_stock` — same "DB authoritative for stock" pattern already proven for the completed Inventory Items domain. |
| `inventory_usages` | REQUIRES SPECIAL BUT UNAMBIGUOUS HANDLING | `trg_negative_stock` raises a plain exception (not RLS) on insufficient stock — catch-and-surface, same shape as every other thrown-error case already handled. |

No local-only field would be lost during hydration for any Batch-1 domain
— confirmed by direct type comparison, no field exists on any Batch-1
frontend type without a direct DB column.

## Batch 2 — FINAL STATUS: SAFE

`quotations` → `quotation_revisions` → `master_pos` →
`quotation_purchase_orders` / `project_purchase_orders`.

- `quotations.line_items` confirmed jsonb, frontend `LineItem[]` shape
  matches directly (no reshaping) — same pattern as the completed Company
  POs domain.
- `qt_no` confirmed local-counter-generated (`generateDocNo("QT")`),
  DB confirmed `UNIQUE(organization_id, qt_no)` — reuse the Company
  PO/Projects bounded-retry pattern exactly, no new design.
- `master_pos` INSERT policy confirmed keyed to `quotations.edit`
  (not `purchase_orders.create`, which its SELECT/UPDATE/DELETE use) —
  must preserve this asymmetry mechanically, not "fix" it.
  `quotation_purchase_orders`/`project_purchase_orders` mix `quotations`/
  `projects`/`purchase_orders` module checks similarly across their four
  policies each — confirmed directly from live RLS, must be preserved
  as-is.
- `sharedPoId` (`MasterPO`, `QuotationPurchaseOrder`) confirmed to have no
  real DB gap — the actual cross-table link is the real FK
  (`master_po_id`); map through the FK, don't try to preserve `sharedPoId`
  as local-only state.
- No child needs to migrate before its parent within a single
  implementation pass — dependency order (`quotations` first, then the
  other four) is achievable inside one pass since nothing outside this
  family blocks it.

## Batch 3 — FINAL STATUS: SAFE (mechanical, upgraded confidence vs Phase 25)

`expense_floats` + `petty_expenses`, migrated together in one dedicated
pass (not because of ambiguity — because of cross-table verification
effort).

- **Direct comparison confirms the frontend's own `deriveFloatTotals()`
  (store.ts) is a byte-for-byte match to the DB's
  `expense_float_recompute()`** — identical formula: `spentAmount = SUM(
  petty_expenses.amount WHERE float_id = this)`, `balanceAmount = max(0,
  issued − spent − returned)`, identical three-way status derivation
  (`Open`/`Partially Settled`/`Fully Settled`), identical `settledAt`
  behavior. **DB becomes authoritative on hydration (wholesale replace,
  same as every domain except Projects) — this is not ambiguous, it is
  the frontend's own already-proven logic, now server-side.**
- Correct INSERT/UPDATE/DELETE order: `expense_floats` create first (no
  dependency on `petty_expenses`); `petty_expenses` create/update/delete
  each trigger a server-side recompute of their linked float — the
  frontend write API does NOT need to separately call anything to
  "refresh" the float; the next hydration (or an immediate re-fetch of
  that one float row after the petty-expense write) picks up the
  DB-recomputed values.
- `float_no` confirmed `UNIQUE(organization_id, float_no)`, generated
  today via a local scan-based `floatCounter` — reuse the bounded-retry
  pattern exactly, no new design.
- Hydration cannot cause stale calculated values to overwrite DB values
  as long as the wholesale-replace pattern is used (never merge a locally
  computed `spentAmount`/`balanceAmount`/`status` back over what the
  server returns) — mechanical rule, already the default for every
  domain except Projects' explicit merge-exception.

## Delivery Challans — FINAL STATUS: SAFE

Confirmed via direct read of `pages/DeliveryChallans.tsx`: the frontend
type/field is `dcNo` only; the live create flow reads/writes exactly one
number (`dcNumber` form state → `dcNo` on the record), with only a
client-side local-array duplicate check (no DB constraint exists on either
`dc_number` or `dc_no`, confirmed). **`dc_no` is the live field
(name matches exactly); `dc_number` is a dead/unused duplicate column** —
same shape of finding as `project_materials`/`production_stages`. Map
`dcNo → dc_no`, never write `dc_number`. The three jsonb fields (`items`,
`project_entries`, `delivery_address`) already match the frontend's
`DCItem[]`/`DCProjectEntry[]`/`{type,value}` shapes directly, no
reshaping needed (same opaque-jsonb pattern as Company POs/Quotations).
No numbering race (no unique constraint on either number column).

## QMS Stage Completions — FINAL STATUS: GENUINE DECISION (confirmed, not downgraded)

Direct read of `qms/api/inspections.ts` confirms the QMS inspection
system is a **fully independent, IndexedDB-backed repository subsystem**
(`inspectionStageCompletionRepo`) with its own stateful workflow engine
(mode toggling, assignment routing, signature capture, auto-advance logic
via `maybeAdvanceAfterStageCompletion`) — it does not use the Zustand
store or any pattern established elsewhere in this engagement. Migrating
it would require either a dual-write scheme (no established precedent,
high correctness risk) or replacing the IndexedDB repository layer
entirely (a significant rewrite of QMS's own architecture, not a
"migration" in the sense every other domain has used). **Confirmed as a
genuine architectural decision, not merely "high effort."** No downgrade
from Phase 25's classification — if anything, this targeted look
reinforces it.

## E-1 — Invoices / Invoice Items — RESOLVED, Option A confirmed

Direct read of `pages/Invoices.tsx` confirms the frontend already computes
`subtotal = form.lineItems.reduce((s, li) => s + li.amount, 0)` client-side
from the same `desc/hsn/qty/rate/amount` shape the audit described — this
is a mechanical decomposition, not a design question. Mapping:
`desc→description, hsn→hsn, qty→quantity, rate→price`; per-line `amount`
is always `qty*rate`, recomputed for display, never stored (the DB has no
column for it and never will). `invoices.total_amount` becomes DB-derived
via `trg_invoice_total` (server-authoritative, matches the existing
`InvoiceStatus`/tax-rate fields already on the row). `invoices.subtotal`
is a real, separate nullable DB column the trigger does **not** write —
the frontend write path must set it directly on invoice create/update
(computed the same way it is today), it does not derive automatically.
**E-1: RESOLVED — NO FURTHER BUSINESS DECISION REQUIRED. Option A
confirmed correct and implementable as described in Phase 25.**

## E-2 — Material Requisitions — RESOLVED (see correction above)

**No migration needed for `material_requisitions` at all** — it is dead
legacy state with zero live UI. The real remaining work
(`bom_requisitions` read + approve-write) is mechanical and folded into
Batch 1 alongside `project_bom_items`.

## E-3 — Project Production Stages — CONFIRMED, still requires user decision

Every Phase 25 premise re-verified this pass, unchanged:
- DB `status` enum (`NotStarted/Sent/InProgress/Completed/Received`) is a
  byte-for-byte match to frontend `ProjectStageStatus`.
- `project_production_stages`/`production_stage_transactions` columns
  closely mirror `ProjectProductionStage`/`StageTransaction`.
- `project_production_stages` row count confirmed **0** — no
  trigger-created rows, nothing has ever been written to it.
- Frontend confirmed still 100% local (`projectProductions` in Zustand).
- Phase 22's Decision 1 (explicitly approved) deliberately deferred this
  system, distinct from the legacy `production_stages` noise.

Migrating it would require: replacing local stage persistence entirely;
reconciling the existing 11-stage local model against the DB's schema
(including frontend-only WIP fields — `requiresMaterialTracking`,
`wipInProgressQty`, etc. — that have no DB column at all and would need
their own local-only-field decision); migrating `StageTransaction` data
with real concurrency enforcement (`trg_enforce_stage_transaction_limit`);
and touching `ProjectDetail.tsx`'s Production tab, `Production.tsx`, and
anywhere Outsourced Works/QMS read production-stage context. **This is a
milestone-scale decision, not resolvable by this preflight — reconfirmed
as genuinely requiring explicit user direction before any investigation
or implementation begins**, consistent with Phase 25's own
no-recommendation stance.

---

## FINAL OUTPUT

**1. Phase 25 findings confirmed/changed:**
Confirmed: Batch 1 (7 of 8 original domains), Batch 2 (all 5), Batch 3
(both), Delivery Challans, QMS Stage Completions, E-1, E-3.
**Changed:** E-2 is RESOLVED (not a genuine decision) — `material_
requisitions` is dead legacy state; the real work is `bom_requisitions`
read+approve-write, folded into Batch 1 alongside `project_bom_items`.

**2. Batch 1 final status:** SAFE (8 domains + corrected `bom_
requisitions` addition = effectively 9 tables, still one implementation
pass). Two domains need special-but-unambiguous handling
(`project_employees` diff-write, `project_bom_items`+`bom_requisitions`
recompute/approve-write); rest are plain extensions.

**3. Batch 2 final status:** SAFE (5 domains, one pass, sequential
internally).

**4. Batch 3 final status:** SAFE, mechanical (2 domains, one dedicated
pass for cross-table verification, zero ambiguity — upgraded confidence
vs. Phase 25's "high-risk" framing since the frontend's own logic is
already a proven match to the DB's).

**5. Delivery Challans final status:** SAFE (1 domain, `dc_no` confirmed
live, `dc_number` confirmed dead).

**6. QMS final status:** GENUINE DECISION (confirmed unchanged — separate
IndexedDB architecture, not a migration in the established sense).

**7. E-1 final decision:** RESOLVED — Option A (decompose on write),
confirmed implementable exactly as Phase 25 proposed.

**8. E-2 final decision:** RESOLVED — no migration needed;
`material_requisitions` is dead; fold `bom_requisitions` (read +
approve-write only) into Batch 1.

**9. E-3 final decision:** STILL REQUIRES EXPLICIT USER DECISION — no
change, reconfirmed as the correct call.

**10. Final implementation batches for Prompt 3:**
- **Pass 1 — Batch 1** (advance_records, attendance_records,
  employee_documents, salary_payments, project_employees,
  project_bom_items + bom_requisitions, inventory_purchases,
  inventory_usages)
- **Pass 2 — Batch 2** (quotations, quotation_revisions, master_pos,
  quotation_purchase_orders, project_purchase_orders)
- **Pass 3 — Batch 3** (expense_floats, petty_expenses)
- **Pass 4 — Delivery Challans**
- **Pass 5 — Invoices/Invoice Items/Payments** (E-1 now resolved, ready
  to implement — `payments` folds into this same pass, its two triggers
  are mechanical)
- **Pass 6 — Production Stages milestone** (only after user resolves E-3;
  likely its own investigate-then-implement pair, like Phase 22)
- **Pass 7 (optional/deferred) — QMS Stage Completions**, only if the user
  decides to reconcile the IndexedDB architecture at all.

**11. Domains Prompt 3 can execute automatically (no further stop needed):**
All of Batch 1 (8 tables), all of Batch 2 (5 tables), all of Batch 3
(2 tables), Delivery Challans, Invoices/Invoice Items/Payments (3 tables)
— **19 of 23 real remaining domains**, zero further decisions required.

**12. Domains that must remain blocked:**
`project_production_stages` + `production_stage_transactions` (blocked on
E-3), `qms_stage_completions` (blocked on the IndexedDB-reconciliation
decision — effectively the same class of stop as E-3).

**13. Genuinely necessary user decisions remaining:**
Only **E-3** (Project Production Stages / V2 system) and, separately,
whether QMS Stage Completions should ever be reconciled into Supabase at
all (not urgent, no dependency pressure from anything else).

**14. Exact Prompt-3 execution order:**
Batch 1 → Batch 2 → Batch 3 → Delivery Challans → Invoices/Invoice
Items/Payments — all five passes executable back-to-back with no user
input required between them, each closing with the full standard
verification cycle (hydration, API boundary, mutation-path rewiring,
permission-gate preservation, negative/positive DB-level test, reload/
hydration proof, fixture cleanup, baseline confirmation, regression
across all previously-completed domains, typecheck/lint/build/fresh
browser boot) before moving to the next. Then STOP and present E-3 for
explicit decision before touching Production Stages; QMS Stage
Completions stays deferred unless/until separately authorized.
