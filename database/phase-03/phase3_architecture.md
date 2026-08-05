# Phase 3 — Architecture: Quotations + Company POs

Status: **Implemented and verified.** Executed against the live Supabase project as [phase3_quotations_company_pos_FINAL.sql](./phase3_quotations_company_pos_FINAL.sql), registered in `schema_migrations` as `20260806_003_phase3_quotations_company_pos`. See [phase3_completion_report.md](./phase3_completion_report.md) for verification evidence.

## 0. Scope

Migrates the frontend's Quotations + Purchase Order ecosystem (`Quotation`, `QuotationRevision`, `QuotationPurchaseOrder`, `MasterPO`, `ProjectPO`) and the separate Company PO module (`CompanyPO`) to Supabase, integrated with Phase 1's RBAC/RLS and Phase 2's `document_counters` infrastructure, with zero changes to any frozen Phase 1 or Phase 2 object.

This module turned out to be the most tangled of the three phases so far — three overlapping, historically-layered PO concepts coexisted in the frontend, one of them fully dead code. Distinguishing live from dead, and mapping the real (not assumed) permission gating, was the majority of this phase's design work.

## 1. System diagram

```
quotations (organization_id, qt_no, customer_id, project_id, line_items jsonb,
            subtotal/gst_rate/gst_amount/total_amount, valid_until, status,
            history jsonb, approved_by/approved_at, created_at, updated_at)
    |
    +--> quotation_revisions (quotation_id CASCADE, revision_number,
    |      unique(quotation_id, revision_number),
    |      unique(quotation_id) WHERE is_current, line_items jsonb, ...)
    |
    +--> master_pos (quotation_id RESTRICT, customer_id, po_number, status)
    |      -- the real shared identifier for one "PO event", replacing
    |      -- the frontend's bare string sharedPoId
    |      |
    |      +--> quotation_purchase_orders (quotation_id CASCADE,
    |      |      revision_id CASCADE, master_po_id RESTRICT)
    |      |
    |      +--> project_purchase_orders (project_id CASCADE,
    |             master_po_id RESTRICT, quotation_id SET NULL)
    |             -- replaces the frontend's embedded, unvalidated
    |             -- Project.pos[] array; does not modify projects itself
    |
    +--> (referenced by project_purchase_orders.quotation_id, informational)

company_pos (organization_id, cpo_number, vendor_id, vendor_name, items jsonb,
             subtotal/gst_amount/grand_total, status)
    -- the company's own outgoing PO to a vendor; procurement side,
    -- entirely separate from customer quotations

generate_quotation_number(org_id) -- reuses Phase 2's document_counters
    table completely unmodified, new counter_key 'QT'. Same atomic
    INSERT..ON CONFLICT DO UPDATE..RETURNING pattern as
    generate_employee_code(), proven concurrency-safe again in this
    phase's own verification.
```

## 2. What's live vs. dead (confirmed by code, not assumed)

| Type | Status | How confirmed |
|---|---|---|
| `Quotation`, `QuotationRevision`, `QuotationPurchaseOrder`, `MasterPO`, `ProjectPO`, `CompanyPO` | **Live** | Real call sites found in `Quotations.tsx`, `ProjectDetail.tsx`, `PurchaseOrders.tsx`, `CompanyPOs.tsx` |
| `Quotation.recordedPO` | **Dead** | Never constructed by any live action — only read for one-time backward-compat UI checks; `store.ts` backfills it into the new model once, on load, and nothing writes a new one |
| Legacy `PurchaseOrder` / `purchaseOrders` state / `addPurchaseOrder` | **Dead** | `addPurchaseOrder` is called nowhere in the app; the state survives only in `store.ts`'s own backup/restore plumbing and `Settings.tsx`'s backup export |
| `Enquiry` | **Dead** | No live page creates one; `addEnquiry` is never called; `Quotation.enqId` is optional and unpopulated in practice |

None of the dead entities are represented anywhere in this migration — migrating them would mean building backend support for a workflow the app doesn't actually run.

## 3. The "Record PO" fan-out — a real, confirmed 3-way transaction

Reading `Quotations.tsx`'s handler directly (not inferred) shows recording a customer PO against a quotation creates, in one user action: (1) one `MasterPO` with a fresh shared identifier, (2) one `ProjectPO` per line item that fuzzy-matches an existing project by customer-visible name, and (3) one `QuotationPurchaseOrder` permanently tied to the specific revision. All three were tied together by a bare client-generated string (`sharedPoId`) with zero referential integrity. This migration replaces that string with `master_pos.id` as a real `uuid` — `project_purchase_orders.master_po_id` and `quotation_purchase_orders.master_po_id` are genuine foreign keys, not string-matched columns, directly mirroring how Phase 2's `project_employees` replaced `assignedEmployeeIds` string/array matching.

`project_purchase_orders` also has a **second, independent, confirmed live creation path**: `ProjectDetail.tsx`'s own "Add PO" dialog, gated by `projects.edit` — separate from the quotations-driven fan-out. Both paths are supported by the same table via an OR'd RLS policy (§5).

## 4. Permission-module mapping — confirmed against the live frontend, not a guessed 1:1 entity-name mapping

This was the single most important correction made during design review (see [phase3_completion_report.md](./phase3_completion_report.md) for the finding and how it was verified):

| Table | Module(s) actually used | Confirmed via |
|---|---|---|
| `quotations`, `quotation_revisions`, `quotation_purchase_orders` | `quotations` | `Quotations.tsx`'s own `pCreate`/`pEdit`/`pDelete`/`pView` vars |
| `master_pos` — INSERT | `quotations.edit` | `addMasterPO` is called only from `Quotations.tsx`'s Record PO handler, behind the same `pEdit` |
| `master_pos` — SELECT/UPDATE/DELETE | `purchase_orders.*` | `PurchaseOrders.tsx`'s own `pView`/`pEdit`/`pDelete` vars |
| `project_purchase_orders` — INSERT | `quotations.edit` **OR** `projects.edit` | Two independent call sites: the fan-out (`Quotations.tsx`) and the direct dialog (`ProjectDetail.tsx`, gated by `canEdit(currentUser,"projects")`) |
| `project_purchase_orders` — SELECT | `projects.view` **OR** `purchase_orders.view` | `ProjectDetail.tsx` shows `project.pos`; `PurchaseOrders.tsx`'s `getLinkedProjects` also derives from this data |
| `project_purchase_orders` — UPDATE | `projects.edit` | `ProjectDetail.tsx`'s `handleUpdatePOStatus` |
| `company_pos` | `company_po` | `CompanyPOs.tsx` |

Using `purchase_orders.*` uniformly for every PO-related table (the naive, entity-name-matching assumption) would have blocked the real live "Record PO" workflow for any user with `quotations.edit` but no separate `purchase_orders.create` grant — a real, confirmed defect in the original draft design, corrected before implementation.

## 5. RLS design highlights

`master_pos_insert` and `project_purchase_orders_insert`/`_select` are the first policies in this project (across all three phases) built from grants spanning genuinely different permission modules for a single operation — not just ORing two actions within one module (Phase 1's `invoice_items` precedent), but ORing/requiring across `quotations`, `purchase_orders`, and `projects`. Verified live under real simulated sessions, including the negative case (a role with `projects.edit` and `purchase_orders.create` via override, but explicitly lacking `quotations.edit`, correctly rejected on `master_pos` insert — proving the mapping is precise, not just "any purchase-order-adjacent grant").

## 6. Storage decisions (approved)
`quotations.line_items`, `quotation_revisions.line_items`, `company_pos.items` are all `jsonb`, not normalized tables — unlike Phase 1's `invoice_items`, none of these have a Postgres trigger that needs to aggregate over them; all totals are pre-computed by the frontend and stored directly on the parent row, and all are confirmed (via `lib/ledger.ts` and `CompanyPOs.tsx`) to be read only as whole embedded arrays, never queried independently.

## 7. Integrity improvements over the frontend's current behavior (disclosed, not silent)
- `unique(quotation_id, revision_number)` and `unique(quotation_id) WHERE is_current` formalize invariants the frontend already computes client-side (`nextRevisionNumber = max + 1`; exactly one current revision) but never enforced at the data layer. Verified live that the real create-revision flow (which flips the previous revision's `isCurrent` off before inserting the new one) is fully compatible with both constraints.
- `master_pos.quotation_id` (RESTRICT), `quotation_purchase_orders`/`project_purchase_orders.master_po_id` (RESTRICT), `quotation_purchase_orders.revision_id` (CASCADE, explicit), `project_purchase_orders.quotation_id` (SET NULL, explicit) — every FK behavior was individually reasoned about rather than left as an implicit default, and each one was proven live in this phase's verification, not just asserted.

## 8. What Phase 3 deliberately does not touch
No column, index, policy, or trigger on any frozen Phase 1 or Phase 2 table — confirmed structurally in verification. `projects` in particular gets no new column (the junction-table design for `project_purchase_orders` avoided that entirely, the same way Phase 2's `project_employees` avoided modifying `projects` for employee assignment).

## 9. Out of scope, confirmed live but deliberately deferred
`Payable`/`payables` — references `CompanyPO.companyPoId`, confirmed live in `lib/ledger.ts`, has no live Supabase table. Same treatment as Petty Expenses/QMS in Phase 2 and Enquiry in this phase: a real, confirmed dependency, explicitly not built now.
