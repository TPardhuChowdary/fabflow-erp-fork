# Phase 8 — Architecture: Inventory

Status: **Implemented, executed, and fully verified** against the live Supabase project. This is the final, frozen design.

## 1. Selection - the most load-bearing remaining pre-existing table

Like `projects` (Phase 5), `customers` (Phase 6), and `vendors` (Phase 7), all three tables this phase touches - `inventory_items`, `inventory_purchases`, `inventory_usages` - are pre-existing tables from Phase 1's original 14, structurally untouched since (only `organization_id` and RLS added). Selected by the same dependency-count methodology used for every prior module choice: `inventory_items` has 5 live dependents (`inventory_purchases`, `inventory_usages`, `material_requisitions`, `project_materials`, plus the already-frozen `petty_expenses.inventory_item_id` from Phase 4) - more than any other remaining pre-existing table (`invoices` had 2, everything else had 0).

## 2. What already existed, confirmed via live reads before any SQL was written

`inventory_items`: 7 columns (`id`, `name`, `unit`, `current_stock`, `cost_per_unit`, `created_at`, `organization_id`), `name` nullable (unlike `vendors`/`customers`/`projects`, whose `name` was already `NOT NULL` before their respective phases). `inventory_purchases`: 7 columns including `vendor_id` (already corrected to `ON DELETE SET NULL` by Phase 7) and `inventory_item_id`. `inventory_usages`: 6 columns including `project_id` (`ON DELETE CASCADE`) and `inventory_item_id`. All three already had RLS enabled with the standard 4 policies, matching `Inventory.tsx`'s `canView/canCreate/canEdit/canDelete(currentUser, "inventory")` gating exactly. Four live triggers already existed and were confirmed to enforce real stock arithmetic: `increase_stock` (`AFTER INSERT` on `inventory_purchases`), `reduce_stock` and `prevent_negative_stock` (both on `inventory_usages`), and `stock_check` (on the out-of-scope `project_materials`, auto-inserting into `material_requisitions` when a project's requirement exceeds stock). One row existed in each of the three tables at the time of this migration.

## 3. Columns added

`inventory_items`: `quantity_reserved`, `reorder_level`, `last_purchase_price`, `estimated_price` (all nullable numeric) and `updated_at` (`NOT NULL DEFAULT now()`, reusing Phase 2's `set_updated_at_timestamp()` trigger). `inventory_purchases`: `material_name`, `supplier_name` (cached snapshots), `unit_cost`, `apply_gst`, `gst_percent`, `subtotal`, `gst_amount`, `final_total` (a confirmed, complete GST calculation already implemented in `Inventory.tsx`), `attachments` (jsonb), `purchase_date` (confirmed a genuinely separate, user-editable business date, distinct from `created_at`), and `updated_at`. `inventory_usages`: `material_name`, `used_date`, `notes`, and `updated_at`.

Every field was confirmed via direct call-site tracing, not inferred from type signatures alone - `quantity_reserved`, `reorder_level`, `last_purchase_price`, and `estimated_price` were specifically re-verified against real read/write sites in `Inventory.tsx`, `Dashboard.tsx`, `ProjectDetail.tsx`, and `store.ts` before being approved, after Discovery had only listed them by type signature.

## 4. `inventory_items.name` - NOT NULL added

Confirmed safe by a live, read-only check performed before this file was written: the table's one existing row (`name = 'Steel'`) already satisfied the constraint - zero rows with a NULL or empty-string name. Matches the frontend's own required-field validation in `Inventory.tsx`'s `handleAddItem`.

## 5. Two FK corrections - the same defect class Phase 7 fixed for vendors

`deleteInventoryItem()` (`store.ts`) has zero dependency guard - it unconditionally removes the item from local state - while `inventory_purchases.inventory_item_id` and `inventory_usages.inventory_item_id` were both left at the Postgres default, `ON DELETE NO ACTION`, which would reject an item delete outright the moment a real referencing row exists. Both corrected to `ON DELETE SET NULL`, using the identical `confdeltype`-guarded idempotent pattern Phase 7 established for `vendors`. `inventory_usages.project_id` (`ON DELETE CASCADE`) was deliberately left untouched - confirmed that `deleteProject()` already blocks deletion whenever a material usage exists, making that cascade path unreachable through the app, not contradicted by it.

## 6. Duplicate source of truth - confirmed deliberate, left as application logic

`MaterialPurchase` (a separate, project-scoped type) and `InventoryPurchase`/`InventoryItem` are not an accidental duplication: `addMaterialPurchase` (`store.ts`) deliberately finds-or-creates a matching `InventoryItem` and pushes a corresponding `InventoryPurchase` record as part of the same action. This synchronization was confirmed to belong in application logic, not a database trigger - it is a business-workflow decision (whether a new catalog item should be created, what its display name is), not an arithmetic invariant like the four existing stock triggers. Moving it into a trigger would make every `inventory_purchases` insert - including ones from `Inventory.tsx`'s own direct-purchase flow, which targets an existing item and does not go through this logic - unexpectedly try to create/match catalog items, changing today's behavior.

## 7. Deliberately not added (scope boundaries, all explicitly resolved before SQL)

- `material_requisitions.inventory_item_id` and `project_materials.inventory_item_id`: confirmed the same `ON DELETE NO ACTION` defect class, but both tables are outside this phase's declared scope. `material_requisitions` itself was found to have an unresolved, larger duplicate-concept question (a dead `MaterialRequisition`/`JobCard` type, a live `BomRequisition` type actually used by the routed page, and the database's own auto-generated shape via `stock_check` - none currently aligned) - deferred to a future phase that investigates and designs that table directly, not fixed here.
- `StockReservation`: confirmed a real, active, fully independent feature (its own record shape, its own `stockReservations` array, its own `reserveStock`/`releaseReservation`/`consumeReservation` actions) with **zero database table backing it at all** - never one of the 14 pre-existing tables. `inventory_items.quantity_reserved` mirrors only today's surface representation on the item; it does not require or depend on the reservation ledger existing as a real table. `StockReservation` itself needs its own future-phase discovery.
- No CHECK constraints beyond `gst_percent`: no other field has a confirmed frontend-enforced range/format rule.
- No UNIQUE constraints: no duplicate-prevention logic of any kind was found anywhere in `Inventory.tsx`/`ProjectDetail.tsx`/`store.ts` for item names, purchases, or usages.
- No new indexes: the existing Phase 1 indexes already cover every confirmed query pattern; none of the new columns are filtered, sorted, or searched on anywhere in the frontend.
- No RLS or permission changes: all already correct, confirmed to already cover the new columns (RLS gates rows, not columns).
- `increase_stock`, `reduce_stock`, `prevent_negative_stock`, `stock_check`: reviewed and confirmed independent of every column this migration adds. Not modified.

## 8. Review history

Design went through: a discovery round selecting `inventory_items`/`inventory_purchases`/`inventory_usages` by dependency count, surfacing the full field gap, the `MaterialPurchase`/`InventoryPurchase` synchronization, the `StockReservation` gap, and the `deleteInventoryItem()` guard defect → an architecture design round that ended with five explicitly unresolved questions → a resolution round that closed all five with direct evidence (two frontend-source checks confirming `purchase_date`'s editability and `MaterialUsage`'s real edit workflow, one live-database check confirming `inventory_items.name`'s safety, and two scope-boundary judgments grounded in already-confirmed facts) → SQL generation, followed by an adversarial self-review that found no defect → execution → verification, with zero defects found and a full suite of real behavioral tests (both triggers, both FK corrections, the CHECK constraint, and `updated_at`) run against real inserts/updates/deletes, not static reasoning.

## 9. Known, disclosed limitation carried from Phase 1-7

Same as every prior phase: the frontend's local `AuthUser`/`localStorage`-based authentication remains entirely separate from Supabase Auth. None of this RLS/permission enforcement, nor the two FK corrections, is reachable by the live application yet - both FK corrections were confirmed dormant defects (each table held exactly one row, unlinked in the way that would trigger the old blocking behavior) rather than live incidents.
