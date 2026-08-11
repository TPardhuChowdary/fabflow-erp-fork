# Phase 25 — Master Remaining-Domain Audit (read-only)

No code, database, schema, RLS, role, or permission changes were made in this
phase. Every fact below was confirmed by direct `psql` schema/RLS/trigger
inspection against `db.znfczdkexmsgmedafhgz.supabase.co` and direct reads of
`src/frontend/src/types.ts`, `store.ts`, and page/lib source — not assumed
from the Phase 23 inventory.

Completed and verified (treated as ground truth, not re-investigated except
where a remaining domain's FK/permission facts needed confirming):
Employees, Customers, Inventory Items, Vendors, Company POs, Projects,
Outsourced Works.

---

## 1. Remaining domain count

**26** real business/persistence tables remain unmigrated, out of 44 total
public-schema tables. (44 − 7 migrated − 11 system/reference tables per the
exclusion list = 26.)

Excluded per the standing exclusion list (system/reference, confirmed not
needed by any remaining business migration): `organizations`, `permissions`,
`roles`, `role_permissions`, `user_roles`, `user_permission_overrides`,
`profiles`, `schema_migrations`, `logs`, `security_audit_log`,
`document_counters`.

Of the 26, **3 are not real frontend-owned CRUD migration targets** at all
(see §2 footnote) — `bom_requisitions`, `production_stages`,
`project_materials`. That leaves **23 genuine candidate domains**.

## 2. Completed-domain count

**7** — Employees, Customers, Inventory Items, Vendors, Company POs,
Projects, Outsourced Works. Verified fact confirmed this phase: Employees'
hydration/write layer (`lib/hydration.ts`, `lib/employeesApi.ts`) already
covers the later-added ID Card fields (`employee_code`, `designation`,
`blood_group`, `emergency_contact_*`, `employee_type`) — this domain has
**no regression**, nothing further needed there. `employees` also has three
DB-only columns with zero frontend representation (`is_active`, `left_date`,
`termination_reason`) — pre-existing, documented in code, not a gap.

## 3. Complete remaining-domain table

Legend: **Cat** = A safe / B safe-mechanical / C blocked / D high-risk /
E genuine decision. "—" = not applicable / none found.

| # | Table | Frontend type | FK deps (✓=migrated) | Triggers | JSON/JSONB | Numbering | Cat |
|---|---|---|---|---|---|---|---|
| 1 | `advance_records` | `AdvanceRecord` | employees ✓ | updated_at only | — | none | A |
| 2 | `attendance_records` | `AttendanceRecord` | employees ✓ | updated_at only | — | none (unique employee_id+date) | A |
| 3 | `employee_documents` | `EmployeeDocument` | employees ✓, auth.users | updated_at only | — | none | A |
| 4 | `project_employees` | none (assignedEmployeeIds: string[] on Project) | employees ✓, projects ✓ | updated_at only | — | none | B |
| 5 | `project_bom_items` | `BomItem` | inventory_items ✓, projects ✓ | `trg_project_bom_items_recompute` → `recompute_bom_requisition()` | — | none | B |
| 6 | `inventory_purchases` | `InventoryPurchase` | inventory_items ✓, vendors ✓, projects ✓ (unused) | `trg_increase_stock` | attachments jsonb (opaque, matches frontend) | none | B |
| 7 | `inventory_usages` | `MaterialUsage` | inventory_items ✓, projects ✓ | `trg_negative_stock` (raises), `trg_reduce_stock` | — | none | B |
| 8 | `salary_payments` | `SalaryPayment` | employees ✓ | updated_at only | advance_deductions jsonb (matches frontend) | none | B |
| 9 | `quotations` | `Quotation` | customers ✓, projects ✓ (nullable) | updated_at only | line_items jsonb (opaque, matches frontend) | `qt_no` — **UNIQUE(org, qt_no)**, local counter (`generateDocNo("QT")`) ⚠ race | B |
| 10 | `quotation_revisions` | `QuotationRevision` | quotations ✗ | updated_at only | line_items jsonb | revision_number unique per quotation (DB-enforced) | B (blocked until quotations done) |
| 11 | `master_pos` | `MasterPO` | customers ✓, quotations ✗ | updated_at only | files jsonb | `po_number` — no DB unique constraint | B (blocked until quotations done) |
| 12 | `quotation_purchase_orders` | `QuotationPurchaseOrder` | quotations ✗, quotation_revisions ✗, master_pos ✗, customers ✓ | updated_at only | files jsonb | `po_number` — no unique | B (blocked, deepest in the PO chain) |
| 13 | `project_purchase_orders` | `ProjectPO` (frontend name) | projects ✓, master_pos ✗, quotations ✗ (nullable) | updated_at only | file jsonb | `po_number` — no unique | B (blocked until master_pos done) |
| 14 | `invoices` | `Invoice` | projects ✓, customers ✓ | updated_at only | — (no jsonb) | `inv_no` — no DB unique | **E** (see §7/§10) |
| 15 | `invoice_items` | embedded `Invoice.lineItems[]` (**shape mismatch**) | invoices ✗ | `trg_invoice_total` → recomputes `invoices.total_amount` | — | — | **E**, blocked until invoices decision made |
| 16 | `payments` | `Payment` | invoices ✗ | `trg_overpayment` (raises), `trg_payment_status` | files jsonb (matches frontend) | none | B, blocked until invoices done |
| 17 | `expense_floats` | `ExpenseFloat` | employees ✓, auth.users, projects ✓ | `trg_expense_floats_before_insert`/`_update` → `expense_float_recompute()` | — | `float_no` — **UNIQUE(org, float_no)**, local counter ⚠ race | D |
| 18 | `petty_expenses` | `PettyExpense` | employees ✓, expense_floats (batch-paired), inventory_items ✓, projects ✓, vendors ✓, salary_payments ✗ (nullable) | `trg_recompute_petty_expense_floats` (bidirectional w/ #17) | attachments jsonb (matches frontend) | none | D |
| 19 | `material_requisitions` | `MaterialRequisition` (**shape mismatch**) | inventory_items ✓, projects ✓ | none | — | — | **E** (carried from Phase 23) |
| 20 | `delivery_challans` | `DeliveryChallan` | projects ✓, customers ✓ | updated_at only | items, project_entries, delivery_address (3× jsonb) | `dc_number` + `dc_no` — dual, no unique either | D |
| 21 | `project_production_stages` | `ProjectProductionStage`/`StageTransaction` (local V2 system) | projects ✓ (self-ref) | `trg_validate_rework_reference` (raises) | — | `position` unique per project (DB-enforced) | **E** — see §5 major finding |
| 22 | `production_stage_transactions` | `StageTransaction` (embedded) | project_production_stages ✗, vendors ✓ | `trg_enforce_stage_transaction_limit` (raises) | — | none | **E**, blocked until #21 decided |
| 23 | `qms_stage_completions` | QMS module's own IndexedDB type (separate persistence architecture) | projects ✓ | updated_at only | — | none | **E** (carried from Phase 23) |

Confirmed **not real migration targets** (excluded from the 23 above):

- **`bom_requisitions`** — RLS has only `SELECT` and an "approve" `UPDATE`
  policy, **no INSERT/DELETE policy at all**; rows are created/updated/
  deleted exclusively by `recompute_bom_requisition()` (fired from
  `project_bom_items`'s trigger). Not frontend-owned CRUD. Frontend type
  `BomRequisition` exists only as a **read** projection.
- **`production_stages`** — the legacy table `create_stages()` writes into
  on every `projects` INSERT (Phase 22 Decision 1: explicitly left
  untouched, no frontend type reads/writes it).
- **`project_materials`** — confirmed via repo-wide grep: **zero** frontend
  references (no type, no import, no page). Dead/superseded table from an
  earlier schema generation (superseded by `project_bom_items`). Its only
  purpose today is that `stock_check()` (a trigger nobody's code fires
  since nothing inserts into `project_materials`) would auto-create
  `material_requisitions` rows — dead code path, not reachable.

## 4. Dependency graph / order

```
employees ✓ ─┬─ advance_records                (A)
             ├─ attendance_records              (A)
             ├─ employee_documents              (A)
             └─ salary_payments                 (B)

employees ✓ + projects ✓ ─── project_employees  (B)

inventory_items ✓ + projects ✓ ─┬─ project_bom_items    (B)
                                 ├─ inventory_purchases  (B)
                                 └─ inventory_usages     (B)

customers ✓ + projects ✓ ─── quotations (B)
    └─ quotation_revisions (B)
         └─ quotation_purchase_orders (B) ── needs master_pos too
    └─ master_pos (B) ── needs customers ✓ + quotations
         ├─ quotation_purchase_orders (B) ── also needs quotation_revisions
         └─ project_purchase_orders (B) ── needs projects ✓ + master_pos

projects ✓ + customers ✓ ─── invoices (E)
    ├─ invoice_items (E, blocked on invoices decision)
    └─ payments (B, blocked until invoices live)

employees ✓ + projects ✓ + inventory_items ✓ + vendors ✓ ─┬─ expense_floats (D)
                                                            └─ petty_expenses (D) ── bidirectional with expense_floats;
                                                                                       soft dep on salary_payments (nullable FK)

inventory_items ✓ + projects ✓ ─── material_requisitions (E, standalone)

projects ✓ + customers ✓ ─── delivery_challans (D, standalone)

projects ✓ ─── project_production_stages (E)
    └─ production_stage_transactions (E, blocked on #21's decision)

projects ✓ ─── qms_stage_completions (E, standalone, separate architecture)
```

Every remaining domain's **direct** FK dependencies already resolve to one
of the 7 completed domains (or to another remaining domain within the same
family). No domain depends on `bom_requisitions`, `production_stages`, or
`project_materials` — those three are dead ends, safely ignorable.

## 5. Safe batches

### Batch 1 — "Employees/Inventory/Projects children" (8 domains, Category A/B, zero remaining-domain interdependencies)

`advance_records`, `attendance_records`, `employee_documents`,
`project_employees`, `project_bom_items`, `inventory_purchases`,
`inventory_usages`, `salary_payments`.

- **Why safe together:** every one of these is a direct, single-hop child
  of an already-proven domain (Employees, Inventory Items, or Projects),
  uses the identical `hydrate<Domain>()` / `<domain>Api.ts` /
  `<domain>Hydration` Zustand-state / `useSupabaseHydration` effect
  architecture proven in Phases 19–24, and none of the eight reference each
  other.
- **Shared architecture:** all use plain scalar-column mapping, no jsonb
  requiring reshaping, no numbering race (only `attendance_records` has a
  DB-enforced uniqueness — `(employee_id, date)` — which is a natural key
  collision the existing UI already prevents by construction, not a
  generated-number race).
- **Shared testing strategy:** identical negative/positive/reload cycle
  used in every prior phase; fixture rows against the existing "Test
  Project"/"Test Customer"/a disclosed test employee.
- **Dependencies already satisfied:** yes, 100%, on the 7 completed
  domains only.
- **Complexity:** low, except two mechanical special cases:
  - `project_employees` — **first composite-primary-key domain**
    `(project_id, employee_id)`, no surrogate `id` column. Needs a
    pair-based add/remove write shape (not the established single-`id`
    CRUD pattern) — mechanical, not ambiguous, but genuinely new code
    shape. Also requires unwinding part of Projects' `setProjectsFromServer`
    merge-exception for `assignedEmployeeIds` (Phase 22 Decision 3), since
    this domain existing would let that field finally round-trip for real.
  - `project_bom_items` — `trg_project_bom_items_recompute` fires
    `recompute_bom_requisition()` as a disclosed, deferred side effect
    into `bom_requisitions` (system-managed, not migrated, not touched by
    the frontend — see §3). The trigger's own code comment states it
    "exactly matches the frontend's deleteBomItem/updateBomItem filter
    (`r.status !== "Completed"`)" — i.e. the DB was deliberately written
    to replicate already-existing frontend logic. Mechanical, not a
    decision.
  - `inventory_usages` — `trg_negative_stock` raises a plain Postgres
    exception (`RAISE EXCEPTION 'Not enough stock'`) on INSERT, not an RLS
    denial. Needs the write API to catch this thrown error and map it to a
    `status:"error"` result with that exact message surfaced — mechanical,
    same "catch and surface" shape already used for RLS-thrown INSERT
    errors, just a different Postgres error class.

This is the single largest safe batch in the whole remaining migration —
**8 of 23 real candidate domains (35%) in one implementation pass.**

### Batch 2 — "Quotations family" (5 domains, Category B, strictly sequential internally but one implementation pass)

`quotations` → `quotation_revisions` → `master_pos` →
`quotation_purchase_orders`, and `project_purchase_orders` (parallel with
`quotation_purchase_orders`, needs `master_pos` + `projects`).

- **Why safe together:** once `quotations`' numbering race is solved with
  the exact bounded-retry pattern already proven twice (Company POs,
  Projects), every other table in the family is a straightforward child
  with no numbering race of its own (none of `quotation_revisions`,
  `master_pos`, `quotation_purchase_orders`, `project_purchase_orders` has
  a DB-enforced unique constraint on its own `po_number`/`revision_number`
  columns except `quotation_revisions`' `(quotation_id, revision_number)` —
  and that number is a deterministic "next revision for this quotation",
  not a global counter, so it doesn't share the retry-race shape at all).
- **Mechanical special handling:**
  - `quotations.line_items` is `jsonb`, matching the frontend's
    `LineItem[]` shape directly (same as Company POs' `items` jsonb) — no
    reshaping needed, unlike invoices/MRs.
  - `master_pos_insert`'s RLS policy uses the **`quotations`** permission
    module (`quotations.edit`), not `purchase_orders.create` — an
    intentional asymmetry vs. its own SELECT/UPDATE/DELETE policies (which
    use `purchase_orders`). Confirmed via direct RLS read, not assumed;
    the write-gate code must reuse `canEdit(user,"quotations")` for create,
    not `canCreate(user,"purchase_orders")`.
  - `quotation_purchase_orders`/`project_purchase_orders` both carry a
    frontend-only `sharedPoId` (MasterPO) concept that has no direct DB
    column — the DB's actual linking mechanism is the real FK
    (`master_po_id`), so this is not a genuine gap, just a naming
    difference to map correctly, not preserve as local-only.
- **Dependencies already satisfied:** all on Customers ✓ / Projects ✓,
  nothing outside this family or the completed 7.
- **Complexity:** medium (5 tables, real inter-table sequencing within one
  pass, one numbering-race solve), but every sub-decision is mechanically
  determined by already-established patterns.

### Batch 3 — "Salary/Petty-cash cluster" (2 domains, Category D, dedicated pass — do NOT merge into Batch 1)

`expense_floats` + `petty_expenses`.

- **Why NOT safe to fold into Batch 1 despite `expense_floats`' FKs being
  fully satisfied:** these two tables have a **genuine bidirectional
  trigger relationship** —
  `petty_expenses`' `trg_recompute_petty_expense_floats` (AFTER
  INSERT/UPDATE/DELETE) calls `expense_float_apply_recompute()`, which
  re-derives `expense_floats.spent_amount/balance_amount/status/settled_at`
  by re-summing `petty_expenses.amount WHERE float_id = ...`; and
  `expense_floats` has its own BEFORE INSERT/UPDATE trigger that does the
  same derivation from `issued_amount`/`returned_amount`. Both are fully
  mechanical (the exact formulas are captured in §7/§10 below, not
  ambiguous) but the two tables must be migrated **together, in the same
  pass**, with an explicit test that proves a petty-expense write against a
  float causes the float's derived fields to update correctly after
  reload — this is genuinely different verification shape from every
  batch-1 domain (a cross-table trigger side effect must be *asserted*,
  not just "did my own row round-trip").
- `expense_floats.float_no` has a real `UNIQUE(organization_id, float_no)`
  constraint and the current frontend generator (`floatCounter`, a local
  scan-based counter, format `FLT-YYYY-NNN`) is a genuine race exactly like
  Company PO/Projects before their migration — reuse the identical
  bounded-retry pattern (confirmed safe to reuse mechanically).
- Soft, non-blocking dependency: `petty_expenses.recovered_in_salary_
  payment_id` is a **nullable** FK to `salary_payments` — this domain can
  migrate before or after `salary_payments` without being blocked, but the
  EmployeeDetail.tsx "Recover Personal Expenses" fan-out write only becomes
  fully live once *both* are migrated.

### Batch 4 — "Invoices/Payments" (up to 3 domains, blocked on ONE genuine decision — see §7)

`invoices` (decision required) → `invoice_items` (mechanical once decided)
→ `payments` (Category B, `trg_overpayment`/`trg_payment_status` are both
mechanical: raise-and-catch, and a pure status recompute from
`SUM(payments.amount)` vs `invoices.total_amount`).

- Cannot be batched with anything else — must wait on the Part 10 decision
  before any code is written for `invoices`/`invoice_items`. `payments`
  itself is otherwise trivial and could be implemented in the same pass
  immediately after the `invoices` decision is resolved.

### Batch 5 — "Material Requisitions" (1 domain, blocked on ONE genuine decision — see §7, carried from Phase 23)

Standalone; no benefit to batching with anything else regardless of the
decision made.

### Batch 6 — "Delivery Challans" (1 domain, Category D, dedicated pass)

Standalone. Three real jsonb fields (`items`, `project_entries`,
`delivery_address`) that already match the frontend's `DCItem[]`/
`DCProjectEntry[]`/`{type,value}` shapes directly (confirmed by comparing
`types.ts` field shapes to the jsonb defaults — no reshaping needed, same
"opaque jsonb blob" pattern as Company PO/Quotations). The **only** open
question is mechanical, not a business decision: which of `dc_number` /
`dc_no` the current `DeliveryChallans.tsx` actually reads/writes — a
5-minute targeted grep, not investigated further this phase per the
read-only-only instruction, but explicitly NOT a Category E ambiguity (the
answer is a fact about existing code, not a choice).

### Batch 7 — "Production Stages / V2 System" (2 domains, Category E, dedicated milestone — see §5 major finding, §10)

`project_production_stages` → `production_stage_transactions`.

- This is **not** a normal batch — it is very likely its own
  Projects-scale milestone (comparable to Phase 22), not a quick pass.
  Both tables stay together because `production_stage_transactions` is
  meaningless without `project_production_stages` existing first.

### Batch 8 — "QMS Stage Completions" (1 domain, Category E, lowest priority)

Standalone; separate IndexedDB-based persistence architecture (confirmed
carried-forward finding from Phase 23, re-confirmed this phase — no new
facts changed this classification).

## 6. High-risk domains — trigger-by-trigger detail

| Table | Trigger | What it does | DB or FE authoritative? | Ambiguity remaining? |
|---|---|---|---|---|
| `invoice_items` | `trg_invoice_total` (AFTER INSERT/UPDATE) | Recomputes `invoices.total_amount = SUM(quantity*price) + cgst_amt + sgst_amt + igst_amt` (amounts derived from `invoices.cgst_rate/sgst_rate/igst_rate`, rounded) | **DB must become authoritative for total_amount** — the frontend currently computes lineItem.amount client-side per row and invoice.totalAmount as a separate field; once migrated, `invoices.total_amount` is DB-derived and the frontend read-path must trust it, not recompute its own copy. | Not an ambiguity — this is a **consequence** of Decision E-1 (§10), not a separate question. |
| `payments` | `trg_overpayment` (BEFORE INSERT, raises) | Blocks any insert where `SUM(existing payments)+NEW.amount > invoices.total_amount` | DB authoritative (hard business rule already enforced) | None — mechanical catch-and-surface, same shape as `inventory_usages`' stock check. |
| `payments` | `trg_payment_status` (AFTER INSERT/UPDATE) | Recomputes `invoices.status` from `SUM(payments.amount)` vs `total_amount` (`Unpaid`/`PartiallyPaid`/`Paid`) | DB authoritative — matches frontend's existing `InvoiceStatus` enum values exactly (`"Unpaid" \| "PartiallyPaid" \| "Paid"`) | None — DB enum values are a byte-for-byte match to `types.ts`'s `InvoiceStatus`, not guessed. |
| `expense_floats` | `trg_expense_floats_before_insert`/`_update` → `expense_float_recompute()` | Recomputes `spent_amount` (sum of linked `petty_expenses.amount`), `balance_amount = greatest(0, issued − spent − returned)`, `status` (`Open`/`Partially Settled`/`Fully Settled`), `settled_at` | DB authoritative | None — DB enum values are a byte-for-byte match to `types.ts`'s `ExpenseFloatStatus`. |
| `petty_expenses` | `trg_recompute_petty_expense_floats` (AFTER INSERT/UPDATE/DELETE) | On any petty-expense write/delete touching a `float_id`, re-runs the same recompute above for the OLD and/or NEW float | DB authoritative, bidirectional with the row above — see Batch 3 rationale | None — purely mechanical propagation, formula fully captured. |
| `inventory_purchases` | `trg_increase_stock` (AFTER INSERT) | `inventory_items.current_stock += NEW.quantity` | DB authoritative (already established pattern — same as Company POs/Inventory Items domain) | None. |
| `inventory_usages` | `trg_negative_stock` (BEFORE INSERT, raises), `trg_reduce_stock` (AFTER INSERT) | Blocks usage exceeding current stock; then decrements `current_stock -= NEW.quantity_used` | DB authoritative | None — mechanical catch-and-surface. |
| `project_bom_items` | `trg_project_bom_items_recompute` → `recompute_bom_requisition()` | Upserts/deletes a `bom_requisitions` row mirroring shortage between `required_quantity` and `inventory_items.current_stock`; explicitly documented in the function body to replicate existing frontend delete/update filtering | DB authoritative, `bom_requisitions` itself stays non-frontend-owned (§3) | None — function comment cites the exact frontend logic it mirrors. |
| `project_production_stages` | `trg_validate_rework_reference` (BEFORE INSERT/UPDATE, raises) | Ensures a rework stage's `reference_stage_id` belongs to the same `project_id` | Mechanical validation, not ambiguous on its own | The *whole domain* is ambiguous — see §10 Decision E-3. This one trigger is simple; the domain around it is not. |
| `production_stage_transactions` | `trg_enforce_stage_transaction_limit` (BEFORE INSERT, raises) | Locks the parent stage row, then blocks a `'receive'` transaction if cumulative received would exceed cumulative sent for that stage | Mechanical, DB authoritative | Same as above — blocked by Decision E-3, not independently ambiguous. |
| `qms_stage_completions` | `trg_qms_stage_completions_updated_at` only | Plain timestamp trigger, no business logic | N/A | The domain's ambiguity is architectural (IndexedDB vs Supabase reconciliation), not this trigger. |

## 7. Local-only data

| Frontend field(s) | Natural DB home | Home migrated? | Safe to stay local during parent's migration? | Would hydration erase it? | Genuine decision? |
|---|---|---|---|---|---|
| `Invoice.lineItems[].amount` (per-line, client-computed) | none — `invoice_items` stores `quantity`/`price` only, DB derives the invoice-level total via trigger, never a per-line amount | N/A | No — if `invoices` migrates while keeping `lineItems` local-only, `invoices.total_amount` would never be populated (nothing ever inserts into `invoice_items` to fire the trigger), leaving every invoice's DB total permanently `0`/stale | Yes, silently, if mishandled | **Yes — Decision E-1, see §10** |
| `MaterialRequisition.items[]` (MRItem[]), `mrNo`, `jobId`, `totalEstimatedCost` | `material_requisitions` is one-row-per-item; `mrNo`/`jobId`/`totalEstimatedCost` have **no DB column at all** | N/A | Same shape of problem as above | Yes if mishandled | **Yes — Decision E-2, see §10** (carried from Phase 23) |
| `MasterPO.sharedPoId`, `QuotationPurchaseOrder.sharedPoId` | Not a real gap — the DB's actual cross-table link is the FK (`master_po_id`), `sharedPoId` is a legacy in-memory convenience string | N/A | Yes, trivially — just don't send it, map through the real FK instead | No | No — mechanical, not ambiguous. |
| `ProjectProductionStage`/`StageTransaction` (the entire local V2 stage system) | `project_production_stages` + `production_stage_transactions` — see §5 major finding, this is almost certainly the intended home | Not yet | This is the crux of Decision E-3 | Would be catastrophic if migrated carelessly (would need to reconcile 11 local V2 stages against a DB schema with different field semantics) | **Yes — Decision E-3, see §10** |
| `Employee.is_active`/`left_date`/`termination_reason`-equivalent | Already exist as DB-only columns on the already-migrated `employees` table, zero frontend fields at all | Migrated (Employees) | N/A — this is a DB-has-more-than-frontend case, not a frontend-local field | N/A | No — not a migration item, just an observed gap on a completed domain, noted for awareness only. |

No other remaining-domain frontend field was found with a genuine "cannot
determine correct behavior" ambiguity — every other local-only field
(`sharedPoId`, `Payment.files` shape, `SalaryPayment.advanceDeductions`
jsonb, etc.) maps mechanically onto an existing DB column or a clearly
correct FK substitution.

## 8. Numbering / concurrency

| Document number | Generator today | DB unique constraint? | Race after migration? | Fix |
|---|---|---|---|---|
| `quotations.qt_no` | `generateDocNo("QT")` — local monotonic counter, `QT-YYYY-NNN` | **Yes** — `UNIQUE(organization_id, qt_no)` | **Yes** | Reuse the Company PO / Projects bounded-retry pattern exactly (pure `computeNextQtNumber(existing[])`, never re-call the side-effecting local counter on retry). |
| `expense_floats.float_no` | Local scan-based `floatCounter`, `FLT-YYYY-NNN` | **Yes** — `UNIQUE(organization_id, float_no)` | **Yes** | Same bounded-retry pattern. |
| `master_pos.po_number` | Not yet traced this phase (family blocked on `quotations` anyway) | No | No (no DB constraint to violate) | Safe as a plain single-attempt insert; duplicates would be a UX ugliness, not a crash — no retry logic needed. |
| `project_purchase_orders.po_number` | — | No | No | Same as above. |
| `quotation_purchase_orders.po_number` | — | No | No | Same as above. |
| `invoices.inv_no` | Not traced (blocked on Decision E-1 anyway) | No | No | Same as above — no retry logic needed even once decided. |
| `delivery_challans.dc_number`/`dc_no` | Not traced (Batch 6 pre-check will resolve which field is live) | No (neither column has a unique index) | No | Same as above. |
| `attendance_records` (employee_id, date) | Natural key, not a generated number | **Yes** — `UNIQUE(employee_id, date)` | Only if the UI ever allows creating two attendance rows for the same employee/date concurrently — the existing UI already prevents this by construction (one row per date in the calendar view), so this is a **natural-key collision**, not a generated-number race. If it ever fires, surface it as a plain "denied/error" (already-exists), no retry needed — retrying wouldn't produce a different key. | No retry pattern needed; just don't swallow the constraint-violation error. |
| `quotation_revisions.revision_number` | Deterministic "current max + 1 for this quotation", not a shared global counter | **Yes** — `UNIQUE(quotation_id, revision_number)` | Low — collisions would require two concurrent revision-creates on the *same* quotation, a much narrower window than an org-wide document counter; the existing single-current-revision UI flow makes this practically not a hot path. Still recommend a scoped version of the same bounded-retry pattern (re-derive next revision number from fresh server state) for correctness, not because a real race was observed. | Scoped bounded-retry, same shape. |

Only **two** genuinely hot, org-wide races exist: `quotations.qt_no` and
`expense_floats.float_no`. Both are directly solvable by copy-pasting the
already-twice-proven pattern — no new design needed.

## 9. Security / RLS

Checked every remaining table's SELECT/INSERT/UPDATE/DELETE policy against
the corresponding `permissions.ts` `MODULE_PERMISSIONS` key. Findings:

- Every RLS module string referenced by a remaining table's policies
  (`employees`, `production`, `material_requisitions`, `inventory`,
  `delivery_challans`, `invoices`, `payments`, `expense_float`,
  `petty_expenses`, `quotations`, `purchase_orders`, `projects`,
  `inspection_sheets`) **already exists** as a key in `permissions.ts`.
  No missing module found.
- One **cross-module reuse pattern**, confirmed intentional by direct RLS
  read, that Prompt 3 must preserve mechanically rather than "fix": `master_
  pos`'s INSERT policy checks `quotations.edit`, while its SELECT/UPDATE/
  DELETE policies check `purchase_orders.view/edit/delete` — an asymmetric
  but deliberate design (creating a Master PO is gated by quotation-editing
  rights; managing an existing one is gated by the Purchase Orders module).
  `quotation_purchase_orders` and `project_purchase_orders` mix
  `quotations`/`projects`/`purchase_orders` module checks similarly across
  their four policies — all confirmed directly from the live RLS
  definitions, not inferred.
- **No frontend write path was found that currently exposes a mutation RLS
  would deny**, for the simple reason that all 23 remaining domains are
  still 100% local-only Zustand state today — there is no live remote write
  path yet to have a mismatch. This becomes a live concern only once each
  domain is migrated, at which point the same mechanical rule already
  applied in every prior phase (permission gate must call
  `canCreate/canEdit/canDelete(user, <the RLS module>)`, not a different
  module) continues to apply — nothing new to flag.
- One unused/dead permission key observed: `quality_inspection` exists in
  `permissions.ts` but no remaining (or completed) table's RLS references
  it (inspection-related tables use `inspection_sheets` instead). Not a
  blocker, not touched, noted for awareness only.

## 10. Master migration order

Optimized for: correctness → dependency safety → minimum repeated
investigation → maximum domains per pass → minimum quota → architecture
reuse. **Not** optimized for raw table count (Batch 7's 2 tables are
correctly ordered last-but-one despite being few, because of their risk;
Batch 1's 8 tables are correctly ordered first despite being "only 8 of 23"
because they're free wins).

1. **Batch 1** (8 domains) — Employees/Inventory/Projects children. No
   decisions, no dedicated investigation beyond the two noted mechanical
   special cases. Implement immediately.
2. **Batch 2** (5 domains) — Quotations family. No decisions. One
   numbering-race solve (`qt_no`), reused pattern. Implement immediately
   after Batch 1 (or in the same session if quota allows — they are
   fully independent of each other).
3. **Batch 3** (2 domains) — Expense Floats + Petty Expenses. No decisions,
   but genuinely higher-risk due to the bidirectional recompute trigger —
   deserves its own dedicated pass with cross-table verification, not
   folded into Batch 1 despite satisfied dependencies.
4. **Decision E-1** (Invoices) must be made before any invoices/
   invoice_items code is written — see below. Once made, **Batch 4**
   (invoices → invoice_items → payments) is a single implementation pass.
5. **Decision E-2** (Material Requisitions) must be made before **Batch 5**.
   Independent of every other remaining decision — can be resolved in
   parallel with E-1/E-3 at any time.
6. **Batch 6** (Delivery Challans) — no genuine decision, just the mechanical
   `dc_number`/`dc_no` fact-check at the start of its own implementation
   pass. Can run any time after Batch 1 (only depends on Projects/
   Customers).
7. **Decision E-3** (Production Stages / V2 system) is the largest,
   highest-stakes remaining decision in the engagement — recommend treating
   **Batch 7** as its own dedicated milestone (Projects-Phase-22-scale
   investigation + explicit decision + implementation), not bundled with
   anything else, and doing it **last** among the "real" domains so that
   every mechanical win is banked first.
8. **Batch 8** (QMS Stage Completions) — lowest priority, separate
   architecture, no dependency pressure from anything else. Fine to do
   whenever, or defer indefinitely if the QMS module's IndexedDB
   architecture is intentionally staying separate long-term (a question
   for the user, not addressed by this audit).

Recommended session order: **Batch 1 → Batch 2 → Batch 3 → (resolve
Decision E-2, then Batch 5) → Batch 6 → (resolve Decision E-1, then Batch
4) → (resolve Decision E-3, then Batch 7) → Batch 8 (optional/deferred)**.

## 11. Estimated number of implementation passes

**7–8 passes** to close everything:

1. Batch 1 (8 domains)
2. Batch 2 (5 domains)
3. Batch 3 (2 domains)
4. Batch 5 (1 domain, after Decision E-2)
5. Batch 6 (1 domain)
6. Batch 4 (3 domains, after Decision E-1)
7. Batch 7 (2 domains, after Decision E-3 — likely itself a multi-step
   milestone like Phase 22, possibly counts as 2 passes on its own)
8. Batch 8 (1 domain, optional)

That closes all 23 real remaining domains in as few as 6 passes if Batch 7
is done in one, or 7–8 if it needs the same investigate → decide →
implement split Phase 22 needed. Either way, **Batches 1+2 alone close 13
of 23 domains (57%) in the first two passes**, with zero decisions and
zero dedicated high-risk investigation — the highest-value place to spend
the next chunk of quota.

---

## STOP CONDITIONS

### SAFE TO IMPLEMENT AUTOMATICALLY (Category A)
`advance_records`, `attendance_records`, `employee_documents`.

### SAFE WITH MECHANICAL SPECIAL HANDLING (Category B)
`project_employees` (composite key), `project_bom_items` (disclosed
deferred trigger side effect), `inventory_purchases`, `inventory_usages`
(exception catch-and-surface), `salary_payments`, `quotations` (numbering
retry), `quotation_revisions`, `master_pos` (asymmetric RLS module reuse),
`quotation_purchase_orders`, `project_purchase_orders`, `payments`
(exception catch-and-surface) — this last one blocked only by Decision E-1,
not itself ambiguous.

### BLOCKED (Category C)
None found independently — every "blocked" domain in §3/§4 is blocked by
a **remaining** domain within the same family/batch (e.g.
`quotation_revisions` blocked by `quotations`), which resolves naturally
once that batch is implemented in dependency order. No domain is blocked
by something outside this plan's control.

### HIGH-RISK BUT IMPLEMENTABLE AFTER TARGETED INVESTIGATION (Category D)
`expense_floats` + `petty_expenses` (bidirectional recompute — formulas
already fully captured in §6, "targeted investigation" here means careful
cross-table testing, not further unknowns), `delivery_challans` (targeted
fact-check of `dc_number` vs `dc_no`, not a business decision).

### GENUINE BUSINESS DECISION REQUIRED (Category E)

**Decision E-1 — Invoices / Invoice Items**
- **Exact problem:** `invoices.total_amount` is DB-derived from
  `invoice_items` rows via `trg_invoice_total`; but the frontend's
  `Invoice.lineItems: InvLineItem[]` is an embedded array with different
  field names (`desc`/`hsn`/`qty`/`rate`/`amount`) than the DB's
  `invoice_items` columns (`description`/`hsn`/`quantity`/`price`), and
  the frontend stores a **per-line `amount`** that `invoice_items` has no
  column for at all (the DB only stores `quantity`×`price` and derives the
  invoice **total**, never a per-line total).
- **Why existing code/DB doesn't answer it:** the DB schema was built for
  a decomposed one-row-per-item model with server-computed totals; the
  frontend was built around a client-owned, denormalized line-item array
  with its own per-line math. Neither side's shape is a strict subset of
  the other's — this can't be resolved by "just map the fields."
- **Options:**
  - **(A) Decompose on write, reassemble on read.** `invoices` migration
    also migrates `invoice_items` in the same pass: each `lineItems[]`
    entry becomes one `invoice_items` insert (mapping
    `desc→description, qty→quantity, rate→price`, dropping the per-line
    `amount` field since the DB never stores it — `amount` is always
    `qty*rate` and can be recomputed for display); `invoices.total_amount`
    becomes DB-derived and the frontend must trust it over any local
    computation on read.
  - **(B) Defer invoice_items entirely, exactly like Material
    Requisitions.** Migrate only the `invoices` table's own scalar fields;
    `lineItems` stays 100% local-only, `invoices.total_amount` is never
    populated by the trigger (nothing ever writes to `invoice_items`).
  - **(C) Schema change to store lineItems as jsonb on `invoices` directly**
    — not actually available without a DDL change, which is out of scope
    for this engagement's established boundaries (never modify schema).
    Listed only for completeness; not a real option.
- **Recommended option: (A).** Option B would leave every migrated
  invoice's DB-side financial total permanently wrong/zero, which is worse
  than the mechanical decomposition cost, and Invoices are one of the most
  financially load-bearing domains in the app (feeds Payments/Ledger).
  Option C isn't available.
- **What happens under each option:** (A) — real, correct, DB-derived
  invoice totals; per-line `amount` becomes a computed display value
  instead of a stored one (a small frontend refactor, not a data-loss
  risk). (B) — invoices "migrate" in name only; the domain's single most
  important number (`total_amount`) never becomes real, defeating the
  purpose of migrating Invoices at all this cycle.

**Decision E-2 — Material Requisitions** *(carried forward unchanged from
Phase 23, re-confirmed this phase, not re-decided)*
- **Exact problem:** `material_requisitions` is one-row-per-item, but
  `MaterialRequisition.items: MRItem[]` is an embedded array; `mrNo`,
  `jobId`, `totalEstimatedCost` have zero DB representation at all.
- **Why existing code/DB doesn't answer it:** same shape of conflict as
  E-1, no natural DB home exists yet for the three orphan fields.
- **Options:** same three-option shape as E-1 (decompose / defer / schema
  change-not-available).
- **Recommended option:** decompose (A), for the same reasoning as E-1 —
  but this is the user's decision to make, not pre-empted here.
- **What happens under each option:** mirrors E-1's consequences.

**Decision E-3 — Project Production Stages / V2 Stage System**
- **Exact problem:** `project_production_stages` (`status` enum
  `NotStarted/Sent/InProgress/Completed/Received`, `sent_qty`/
  `received_qty`/`ok_qty`/`rejected_qty`, `is_rework`/`reference_stage_id`/
  `rework_stage_name`, `position` unique-per-project) and
  `production_stage_transactions` (`stage_id`, `type` send/receive,
  `quantity`, `event_time`, `vendor_id`/`vendor_name`) are, **field for
  field**, an almost exact structural match to the frontend's local-only
  `ProjectProductionStage`/`StageTransaction` V2 system (confirmed:
  `ProjectStageStatus` = `"NotStarted"|"Sent"|"InProgress"|"Completed"|
  "Received"` is a byte-for-byte match to the DB's CHECK constraint).
  But Phase 22 **explicitly decided** (Decision 1, approved) to leave this
  entire system local-only and untouched this engagement, treating the
  unrelated legacy `production_stages` trigger table as the only disclosed
  DB-side noise. Migrating `project_production_stages` now would mean
  **reversing that explicit prior decision** and replacing the whole local
  Zustand `projectProductions`/`ProjectProductionStage[]` system with real
  DB-backed CRUD.
- **Why existing code/DB doesn't answer it:** the DB schema's intent is
  strongly suggested by the field-level match, but nothing in the codebase
  states outright "this table is for the V2 system" — it could equally be
  an unused/future table nobody's wired up yet. Phase 22's own decision
  explicitly deferred this question rather than resolving it. There is also
  no established pattern anywhere in this engagement for migrating an
  entire local *array-of-stages-per-project* UI model into per-row DB
  writes with real-time multi-transaction concurrency (`send`/`receive`
  cumulative-quantity enforcement via `trg_enforce_stage_transaction_limit`)
  — this would be a genuinely new architecture shape, not a mechanical
  extension of anything proven so far.
- **Options:**
  - **(A) Migrate it as the real backing store**, treating the schema
    match as confirmation of intent; requires a dedicated Phase-22-scale
    investigation (how does existing local stage data for in-flight
    projects map onto the new schema? what happens to the still-untouched
    legacy `production_stages` rows? does `requiresMaterialTracking`/
    `wipInProgressQty`/etc. — frontend-only WIP fields with no DB column
    at all — get added as new columns, which is out of scope, or stay
    local-only forever even after migration?).
  - **(B) Leave it deferred indefinitely**, exactly as Phase 22 decided,
    and treat `project_production_stages`/`production_stage_transactions`
    as out of scope for this entire engagement, not just "not yet."
  - **(C) Partial migration** — migrate only `production_stage_transactions`
    (the send/receive ledger) while keeping stage *definitions* local —
    doesn't actually work, since `production_stage_transactions.stage_id`
    is a hard FK to `project_production_stages`, so this option requires
    (A) to exist first regardless.
- **No recommendation given** — this is the most consequential remaining
  decision in the whole migration and genuinely could go either way
  depending on whether the DB schema's V2-shaped design was an intentional
  forward-looking preparation or an artifact from an earlier development
  pass. Flagging for explicit user decision, not choosing silently, per
  this phase's own instruction.
- **What would happen under each option:** (A) — full real-time,
  concurrent-safe production tracking, but a large, multi-step investment
  comparable to or larger than Projects itself. (B) — the local V2 system
  stays exactly as reliable/unreliable as it is today (page-reload-durable
  only via existing Zustand persistence, not multi-device/multi-user safe)
  indefinitely. (C) — not actually a real option given the FK.

---

## Items Prompt 2 (validation/preflight) must check

1. Re-confirm the 7 completed domains are still in their Phase-24-closing
   state (no regressions) — cheap, read-only.
2. Confirm the user's decisions on **E-1** (Invoices) and **E-2** (Material
   Requisitions) — both needed before Batch 4/Batch 5 respectively. E-3
   (Production Stages) can be deferred past Prompt 2 if the user wants to
   start executing Batches 1/2/3/6 first.
3. Spot-check that Batch 1's two "mechanical special case" domains
   (`project_employees` composite-key shape, `project_bom_items`'
   `bom_requisitions` side effect) are still understood correctly — no new
   investigation, just a sanity restate before implementation starts.
4. Confirm current DB baselines (row counts) for every Batch-1/Batch-2
   table before any fixture testing begins, mirroring every prior phase's
   opening step.
5. Do **not** re-run the full schema/RLS/trigger dump done in this phase —
   it is captured in full in this document and should be trusted unless a
   specific fact is in doubt.

## Items Prompt 3 (execution) should do, in order

1. Implement **Batch 1** (8 domains) using the established
   `hydration.ts`/`<domain>Api.ts`/store-hydration-state/
   `useSupabaseHydration` effect/page-rewire pattern, with the two noted
   mechanical special cases handled as described in §5/§6. Full
   negative/positive/reload/cleanup/regression cycle per domain or as one
   combined pass (batch testing is fine given the shared architecture).
2. Implement **Batch 2** (5 domains), starting with `quotations`'
   bounded-retry numbering solve, then its four children in dependency
   order within the same pass.
3. Implement **Batch 3** (`expense_floats` + `petty_expenses` together),
   with explicit cross-table verification that a petty-expense write
   correctly recomputes its linked float after reload.
4. STOP and obtain Decision E-2 before implementing **Batch 5** (Material
   Requisitions).
5. Implement **Batch 6** (Delivery Challans) — start with the mechanical
   `dc_number`/`dc_no` fact-check, then proceed as a normal Category-D
   pass (no decision needed).
6. STOP and obtain Decision E-1 before implementing **Batch 4**
   (Invoices → Invoice Items → Payments).
7. STOP and obtain Decision E-3 before beginning any work on **Batch 7**
   (Production Stages / V2 system) — likely deserving its own dedicated
   investigation-then-implementation pass pair, not a single quick phase.
8. **Batch 8** (QMS Stage Completions) — implement whenever convenient, or
   confirm with the user it should stay deferred/out of scope long-term.

At every step: never guess, never silently choose among E-1/E-2/E-3's
options, never re-open a domain already closed in Batches 1–8 without a
new disclosed reason, and always finish each batch with DB-level
negative/positive proof, reload/hydration proof, fixture cleanup, and a
regression pass across every previously-completed domain — exactly the
standard this entire engagement has held since Phase 18.
