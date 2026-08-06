# Phase 5 — Security Model: Projects

Status: **Implemented and behaviorally verified** against the live database using real, non-superuser sessions. See [phase5_verification.md](./phase5_verification.md) for method and [phase5_completion_report.md](./phase5_completion_report.md) for results.

## 1. Threat model addressed

Unlike every prior phase, Phase 5 introduces zero new RLS policies and zero new permission-module mappings. Its security-relevant work is entirely about **verifying an already-frozen policy set still correctly matches live frontend gating**, and **correcting one pre-existing constraint that permitted an outcome the application itself prevents**.

## 2. RLS - confirmed reusable, not redesigned

Phase 1 already enabled RLS on `projects` and wrote `projects_select/insert/update/delete`, each `has_permission('projects','<action>') and organization_id = current_organization_id()`. Re-read directly from Phase 1's own executed SQL and compared line-for-line against `Projects.tsx:60-63` and `ProjectDetail.tsx:318-321`'s `canView/canCreate/canEdit/canDelete(currentUser, "projects")` calls - single-module, no cross-module OR, exact match. Confirmed live post-execution: a zero-permission test identity's `SELECT` returned 0 rows, `UPDATE` affected 0 rows, `INSERT` was rejected with `new row violates row-level security policy` - none of this migration's changes altered any of that behavior, because none of it touched a policy.

## 3. The one correction: `customer_id`'s `ON DELETE` behavior

This is the phase's central security/integrity finding. The live foreign key was `ON DELETE CASCADE` - meaning a direct delete of a customer with linked projects would silently cascade-delete those projects. The live frontend's `deleteCustomer()` (`store.ts:1201`) already unconditionally blocks this exact scenario through the UI. The database was, until this phase, capable of an outcome the application was specifically built to prevent - not a "stricter than the app" gap (the usual direction database corrections take in this project), but the opposite: the database was *more permissive* than the app. Corrected to the default (no special action). Verified live post-execution: attempting to delete the linked customer now fails with a foreign-key violation naming `projects_customer_id_fkey`, matching what the application has always guaranteed through its own guard.

## 4. `NOT NULL` / `CHECK` additions as a security-adjacent integrity property

`project_number`, `name`, `customer_id`, `quantity` all gained `NOT NULL`; `quantity` also gained `CHECK (quantity > 0)`. Each mirrors validation the frontend already enforces at `Projects.tsx:103-116` before a project can ever be created - closing the gap between what the application guarantees and what the database enforces, without rejecting anything a real user can produce through the guarded UI. Verified live: direct inserts missing `name`, or with `quantity = 0`, both correctly rejected with the expected constraint-violation errors.

## 5. `SECURITY DEFINER` function introduced this phase

Only one: `generate_project_number()`, `SECURITY DEFINER`, `SET search_path = public` - identical rationale to `generate_employee_code()`/`generate_quotation_number()`/`generate_float_number()`: needs to write to `document_counters` regardless of the caller's own grants on it.

## 6. Organization isolation

Unchanged from Phase 1 - `organization_id = current_organization_id()` remains part of every existing `projects` policy. Not independently re-tested this phase with a second organization, since the policies themselves are unmodified and were already verified this way when Phase 1 froze; re-confirmed only that the policy text itself is unchanged.

## 7. Known, disclosed limitation carried from Phase 1-4

Same caveat as every prior phase: the frontend's local `AuthUser`/`localStorage`-based authentication is still entirely separate from Supabase Auth, so none of this RLS/permission enforcement is reachable by the live application yet - it becomes load-bearing only once a future phase wires the frontend to Supabase Auth.
