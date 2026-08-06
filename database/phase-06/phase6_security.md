# Phase 6 — Security Model: Customers

Status: **Implemented and behaviorally verified** against the live database using real, non-superuser sessions. See [phase6_verification.md](./phase6_verification.md) for method and [phase6_completion_report.md](./phase6_completion_report.md) for results.

## 1. Threat model addressed

Like Phase 5, this phase introduces zero new RLS policies and zero new permission-module mappings. Its security-relevant work is entirely about **verifying an already-frozen policy set still correctly matches live frontend gating**, and **ensuring the one piece of new trigger logic cannot become a route to inconsistent or incorrect data**.

## 2. RLS - confirmed reusable, not redesigned

Phase 1 already enabled RLS on `customers` and wrote `customers_select/insert/update/delete`, each `has_permission('customers','<action>') and organization_id = current_organization_id()`. Re-read directly from the live database and compared against `Customers.tsx:48-50,128,229`'s `canView/canCreate/canEdit/canDelete(currentUser, "customers")` calls - single-module, no cross-module OR, exact match. Confirmed live post-execution: a zero-permission test identity's `SELECT` returned 0 rows, `UPDATE` affected 0 rows, `INSERT` was rejected with `new row violates row-level security policy` - none of this migration's changes altered any of that, because none of it touched a policy. The 7 new columns are automatically covered by the existing row-level policies without any change, since RLS gates rows, not columns.

## 3. `sync_customer_email()` - a data-integrity control, not an access-control one

Unlike Phase 4's `settle_expense_float()`, this new function is never called directly as an RPC by an end user - it only ever fires as a trigger, attached to writes that have already passed through RLS on `customers` itself. It does not need, and does not have, any additional internal permission check of its own; its `SECURITY DEFINER` marking follows the same uniform, defensive style every trigger function in this project uses, not because this particular function needs to bypass another table's RLS (it only ever reads/writes the row already being inserted/updated by the statement that triggered it - no cross-row, no cross-table query at all).

Its actual security-adjacent role is preventing `email` from silently drifting out of sync with the authoritative `primary_email`/`emails[]` fields for any future write path - a duplicate-source-of-truth risk that, left unaddressed, could let stale or inconsistent contact information persist unnoticed. Verified live across four distinct scenarios and one edge case (a standalone direct `email` write correctly overridden back to the already-populated `primary_email` value) - confirmed to behave exactly as designed, not just as reasoned about statically.

## 4. `NOT NULL` and defaults - unchanged from what already existed

`name`'s `NOT NULL` already existed on the live table before this phase and was not modified - it already matched the frontend's own validation. No new `NOT NULL` was added to any of the 6 nullable new columns, since none of them are validated as required anywhere in `Customers.tsx`. `updated_at NOT NULL DEFAULT now()` mirrors the identical Phase 5 pattern.

## 5. Organization isolation

Unchanged from Phase 1 - `organization_id = current_organization_id()` remains part of every existing `customers` policy. Not independently re-tested this phase with a second organization, since the policies themselves are unmodified and were already verified this way when Phase 1 froze; re-confirmed only that the policy text itself is byte-for-byte unchanged.

## 6. Known, disclosed limitation carried from Phase 1-5

Same caveat as every prior phase: the frontend's local `AuthUser`/`localStorage`-based authentication is still entirely separate from Supabase Auth, so none of this RLS/permission enforcement is reachable by the live application yet - it becomes load-bearing only once a future phase wires the frontend to Supabase Auth.
