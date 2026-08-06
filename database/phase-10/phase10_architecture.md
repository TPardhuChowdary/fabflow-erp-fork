# Phase 10 — Architecture: Delivery Challans

Status: **Implemented, executed, and fully verified** against the live Supabase project (after one disclosed defect was caught and corrected during verification - see section 5). This is the final, frozen design.

## 1. Selection

`delivery_challans` is a pre-existing table from Phase 1's original 14. By Phase 10, dependency count no longer differentiates the remaining candidates - every table with real dependents has been migrated through Phase 9, leaving `production_stages`, `project_materials`, `material_requisitions`, `delivery_challans`, and `logs` all tied at zero. Ranked by the remaining criteria: `material_requisitions`/`project_materials` are confirmed **not architecturally ready** (Phase 8's unresolved three-way concept conflict - a dead `MaterialRequisition`/`JobCard` type, a live `BomRequisition` type, and the database's own `stock_check`-generated shape, none aligned). `production_stages` has a real, single, active counterpart (`ProjectProductionStage`, not the dead `ProductionStage`), but 25+ fields including a vendor-outsourcing sub-workflow, WIP tracking, and rework tracking - comparable in scope to Phase 9, better suited to its own dedicated phase. `logs` is simple but low business importance. `delivery_challans` has a real, single, active type, moderate complexity, 0 live rows, and directly unblocks Phase 9's dangling `invoices.dc_id` column (added then, never FK'd) - the clear choice.

## 2. Live database, confirmed before any SQL was written

6 columns (`id`, `project_id`, `dc_number`, `quantity`, `created_at`, `organization_id`), 0 rows, RLS + 4 policies + a 7-action permission module already correct, 2 indexes, 0 triggers, `project_id → projects(id)` `NO ACTION` (pre-existing, unmodified since before Phase 1).

## 3. Columns added

`customer_id` (new FK to `customers`), `dc_no`, `items`/`project_entries`/`delivery_address` (jsonb - always read and written as whole embedded structures, same precedent as Phase 3's `company_pos.items`), `dispatch_method` plus its 8 method-specific fields (`vehicle_no`/`driver_name`/`courier_company`/`tracking_number`/`transport_company`/`lr_number`/`collected_by`/`mobile_number` - confirmed real, already-shipped frontend features), `dispatch_date` (`NOT NULL`, confirmed runtime-required and the table was empty), `receiver_name` (nullable - type-required but not runtime-enforced, confirmed by the absence of any validation guard), `status` (`DEFAULT 'Prepared'`, matching the confirmed create-time default), `updated_at` (+ reused Phase 2 trigger - `updateDeliveryChallan()` confirmed a real, active edit workflow).

## 4. `customer_id` FK - `ON DELETE SET NULL`

`deleteCustomer()`'s guard (re-verified directly from source) is `hasQuotations || hasInvoices || hasProjects` - it does **not** check delivery challans at all. A default `NO ACTION` FK would block a customer delete the app already allows, so `SET NULL` was chosen from the start.

## 5. Disclosed defect, caught during Stage 7 verification, corrected

The first executed version of this migration added `customer_id` as both `NOT NULL` and `ON DELETE SET NULL` - a self-contradictory combination that Postgres accepts at DDL time but rejects at runtime the moment the FK action fires (a `SET NULL` action cannot satisfy a `NOT NULL` constraint on the same column). This was missed during the pre-execution adversarial review and caught live during independent verification, using a real test customer and a real linked delivery challan: the delete failed with `null value in column "customer_id" ... violates not-null constraint` instead of succeeding with the link cleared. The failed statement rolled back atomically - no partial state resulted. Corrected by dropping the `NOT NULL` (both on the live database and in the archived file), matching the same nullable-FK-target pattern already used for `vendor_id`/`inventory_item_id` throughout this engagement: "required at creation" is enforced by the frontend's own validation, not by a database constraint that would conflict with the FK action. Re-tested with the identical scenario after the fix - passed. Full incident record in [phase10_verification.md](./phase10_verification.md) and [phase10_completion_report.md](./phase10_completion_report.md).

## 6. Deliberately unchanged

`delivery_challans.project_id`: left at its pre-existing `NO ACTION` default. `deleteProject()`'s own `hasDCs` guard checks `project_entries` (the new jsonb column), not this flat column - a pre-existing asymmetry in the app's own design, not something this migration introduces or silently corrects. `soId`/`jobId`: confirmed zero usage anywhere in `DeliveryChallans.tsx` - same dead legacy cluster as `JobCard`. The pre-existing `quantity` column: no confirmed frontend field maps to it cleanly (both `DCItem.qty` and `DCProjectEntry.dispatchQty` are per-row, embedded in jsonb) - left exactly as-is, not dropped without exhaustive proof of dead status. `invoices.dc_id → delivery_challans(id)`: not added here - out of this table's own scope to modify `invoices`; noted as a natural, low-risk follow-up now that a real target exists. RLS, permissions, indexes: confirmed already correct.

## 7. Known, disclosed limitation carried from Phase 1-9

Same as every prior phase: the frontend's local `AuthUser`/`localStorage`-based authentication remains entirely separate from Supabase Auth. None of this is reachable by the live application yet.
