# Phase 8 — Security Model: Inventory

Status: **Implemented and behaviorally verified** against the live database using direct queries and real behavioral tests. See [phase8_verification.md](./phase8_verification.md) for method and [phase8_completion_report.md](./phase8_completion_report.md) for results.

## 1. Threat model addressed

Like Phase 5-7, this phase introduces zero new RLS policies and zero new permission-module mappings. Its access-control-relevant work is entirely about **verifying an already-frozen policy set still correctly matches live frontend gating**. Its data-integrity-relevant work - the two FK corrections and the new CHECK constraint - is a separate concern, addressed below, not an access-control change.

## 2. RLS - confirmed reusable, not redesigned

Phase 1 already enabled RLS on all three tables with the standard 4 policies each (`select/insert/update/delete`), each `has_permission('inventory','<action>') and organization_id = current_organization_id()`. Compared directly against `Inventory.tsx`'s `canView/canCreate/canEdit/canDelete(currentUser, "inventory")` calls - single-module, no cross-module OR, exact match. Confirmed live post-execution: policy count unchanged at 123 total, all 12 policies across the 3 tables byte-for-byte identical to pre-migration state. The 20 new columns are automatically covered by the existing row-level policies without any change, since RLS gates rows, not columns.

## 3. The two FK corrections - data-integrity controls, not access-control ones

Correcting `inventory_purchases.inventory_item_id` and `inventory_usages.inventory_item_id` from `ON DELETE NO ACTION` to `ON DELETE SET NULL` does not grant, revoke, or alter who can do what. It changes what happens, structurally, to other tables' rows when an inventory item a user was already authorized to delete is actually deleted. Before this correction, the database's own foreign-key enforcement would have silently contradicted an operation the RLS layer had already authorized, producing a raw constraint-violation error the frontend has no handling for. After it, an authorized delete succeeds and the referencing rows survive with their link cleared - exactly matching `deleteInventoryItem()`'s existing unconditional behavior. Verified live with a real delete against real linked rows, not just reasoned about statically.

## 4. The `gst_percent` CHECK constraint - a data-integrity control mirroring existing validation

`inventory_purchases_gst_percent_check` (`gst_percent IS NULL OR gst_percent >= 0`) mirrors `Inventory.tsx`'s own confirmed validation (`if (purchaseForm.applyGST && gstPct < 0)`), which already rejects a negative GST percentage in the UI. This is a redundant, defense-in-depth backstop, not a new rule - verified live with a real rejected insert (`gst_percent = -5`), confirmed to produce the exact expected constraint-violation error and leave no row behind.

## 5. `NOT NULL` and defaults - matches frontend behavior, confirmed safe

`inventory_items.name`'s new `NOT NULL` matches `Inventory.tsx`'s own required-field validation. Confirmed safe against the one pre-existing production row via a live check before the migration was written. No new `NOT NULL` was added to any of the 16 new nullable columns, since none of them are validated as required anywhere in the frontend. `updated_at NOT NULL DEFAULT now()` on all three tables mirrors the identical Phase 5/6/7 pattern and is purely additive metadata.

## 6. Organization isolation

Unchanged from Phase 1 - `organization_id = current_organization_id()` remains part of every existing policy on all three tables. Not independently re-tested this phase with a second organization, since the policies themselves are unmodified and were already verified this way when Phase 1 froze; re-confirmed only that policy text and count are byte-for-byte unchanged.

## 7. Known, disclosed limitation carried from Phase 1-7

Same caveat as every prior phase: the frontend's local `AuthUser`/`localStorage`-based authentication is still entirely separate from Supabase Auth, so none of this RLS/permission enforcement - nor either FK correction, nor the CHECK constraint - is reachable by the live application yet. Both FK corrections were confirmed, at the time of this migration, to be fixing dormant defects (each table held exactly one row), not active incidents.
