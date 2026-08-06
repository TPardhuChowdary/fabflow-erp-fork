# Phase 7 — Security Model: Vendors

Status: **Implemented and behaviorally verified** against the live database using real, non-superuser sessions. See [phase7_verification.md](./phase7_verification.md) for method and [phase7_completion_report.md](./phase7_completion_report.md) for results.

## 1. Threat model addressed

Like Phase 5 and Phase 6, this phase introduces zero new RLS policies and zero new permission-module mappings. Its access-control-relevant work is entirely about **verifying an already-frozen policy set still correctly matches live frontend gating**. Its data-integrity-relevant work - the two foreign-key corrections - is a separate concern, addressed in section 3 below, not an access-control change.

## 2. RLS - confirmed reusable, not redesigned

Phase 1 already enabled RLS on `vendors` and wrote `vendors_select/insert/update/delete`, each `has_permission('vendors','<action>') and organization_id = current_organization_id()`. Re-read directly from the live database and compared against `Vendors.tsx`'s `canView/canCreate/canEdit/canDelete(currentUser, "vendors")` calls - single-module, no cross-module OR, exact match. Confirmed live post-execution: a zero-permission test identity's `SELECT` returned 0 rows, `UPDATE` affected 0 rows, `INSERT` was rejected with `new row violates row-level security policy` - none of this migration's changes altered any of that, because none of it touched a policy. The 2 new columns (`address`, `updated_at`) are automatically covered by the existing row-level policies without any change, since RLS gates rows, not columns - confirmed live: the admin test identity could read and update `address` on a row through the unmodified `vendors_select`/`vendors_update` policies.

## 3. The two FK corrections - data-integrity controls, not access-control ones

Correcting `inventory_purchases.vendor_id` and `company_pos.vendor_id` from `ON DELETE NO ACTION` to `ON DELETE SET NULL` does not grant, revoke, or alter who can do what. It changes what happens, structurally, to *other tables'* rows when a vendor row a user was already authorized to delete is actually deleted. Framed against this project's priority order (Correctness > Security > Data integrity > ...), this is squarely a data-integrity correction: before it, the database's own foreign-key enforcement would have silently contradicted an operation the RLS layer had already authorized, producing a raw constraint-violation error the frontend has no handling for. After it, an authorized delete succeeds and the referencing row survives with its link cleared, exactly matching what `Vendors.tsx`'s own delete-confirmation dialog already promises the user.

Both corrections were reasoned through and verified for trigger-interaction safety before execution (see [phase7_architecture.md](./phase7_architecture.md) §4) and confirmed live afterward with real inserts and a real delete, not just static reasoning.

## 4. `NOT NULL` and defaults - unchanged from what already existed

`name`'s `NOT NULL` already existed on the live table before this phase and was not modified - it already matched the frontend's own validation (only `name` is checked in `Vendors.tsx`/`VendorSelect.tsx`). No new `NOT NULL` was added to any of the 6 pre-existing nullable columns, or to the new `address` column, since none of them are validated as required anywhere in the frontend. `updated_at NOT NULL DEFAULT now()` mirrors the identical Phase 5/6 pattern and is purely additive metadata, not a behavior-gating constraint.

## 5. Organization isolation

Unchanged from Phase 1 - `organization_id = current_organization_id()` remains part of every existing `vendors` policy. Not independently re-tested this phase with a second organization, since the policies themselves are unmodified and were already verified this way when Phase 1 froze; re-confirmed only that the policy text itself is byte-for-byte unchanged (123 total policies, unchanged count, before and after execution).

## 6. Known, disclosed limitation carried from Phase 1-6

Same caveat as every prior phase: the frontend's local `AuthUser`/`localStorage`-based authentication is still entirely separate from Supabase Auth, so none of this RLS/permission enforcement - nor either FK correction - is reachable by the live application yet. Both FK corrections were confirmed, at the time of this migration, to be fixing a *dormant* defect (`vendors` held 0 rows), not an active incident; they become load-bearing only once a future phase wires the frontend to Supabase and real vendor deletions with real linked data begin to occur.
