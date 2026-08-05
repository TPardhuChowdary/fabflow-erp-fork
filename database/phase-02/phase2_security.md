# Phase 2 — Security Model: Employees

Status: **Implemented and behaviorally verified** against the live database using real, non-superuser sessions. See [phase2_verification.md](./phase2_verification.md) for method and [phase2_completion_report.md](./phase2_completion_report.md) for results.

## 1. Threat model addressed

Employee HR data (salary, advances, signatures, identity documents) is among the most sensitive data in the ERP. Phase 2's job is to make sure Phase 1's RLS/RBAC infrastructure actually covers it, correctly mapped to the permission module the live frontend already uses to gate access — not a plausible-looking but disconnected one.

## 2. Permission-module mapping — verified, not assumed

All 6 employee-data tables are scoped to the `employees` permission module. This was confirmed by directly reading `EmployeeDetail.tsx`'s actual gating logic rather than inferring it from the permission taxonomy: every tab (Overview, ID Card, Attendance, Salary & Advances, Signatures, Documents) checks `employees.view`/`employees.edit`/`employees.delete` alone. A separate `salary_advance` permission module exists in the seeded `permissions` table (Phase 1 transcribed the entire frontend taxonomy verbatim) but is **not referenced anywhere in current page code** — a live-verified finding, not a guess (`grep` across the frontend for `salary_advance` outside `permissions.ts` returns zero matches). Using it would have created RLS policies that don't correspond to any real access boundary the live app enforces, silently diverging from actual behavior. `employees.*` was used throughout instead.

**A concrete consequence, also verified live, worth stating plainly:** in the currently seeded `role_permissions` data (inherited unchanged from Phase 1), **no non-admin role has `employees.edit`, `employees.create`, `employees.delete`, or `employees.upload`** — only `employees.view` is broadly granted. In practice, today, only an admin-role user (or a user with an explicit per-user override) can create, edit, delete, or upload for an employee record. This is existing Phase 1 seed data, not something Phase 2 introduced or should second-guess — flagged here for visibility, not as a defect.

## 3. `project_employees` — cross-module dual-permission check

Assigning an employee to a project requires **both** `has_permission('projects','edit')` **and** `has_permission('employees','view')`. This is the first policy in the project (across both phases) that combines two different permission modules in a single `AND` — a deliberate design decision, approved explicitly, closing a real information-leak vector: without the second check, a user who can edit projects but has zero visibility into employee records could still attach an arbitrary employee id to a project, effectively probing/asserting facts about employee existence through a side channel the `employees` module's own RLS is specifically built to prevent. **Verified live:** a `Designer`-role test session (`projects.edit = true`, `employees.view = false` — a real combination present in the current seed data, not synthesized) was cleanly rejected with `42501` when attempting the insert; a `sales`-role session (both grants present) succeeded.

Read access to `project_employees` stays scoped to `projects.view` alone — seeing that an assignment row exists doesn't disclose anything about the employee beyond an id already implied by the assignment itself; creating one does, hence the asymmetry between read and write.

## 4. `employee_code` immutability — enforced, not just documented

Once `employee_code` is non-null, changing it requires the caller's role to have `roles.is_admin = true` — checked inside a `SECURITY DEFINER` trigger (`prevent_employee_code_change()`), independent of and in addition to ordinary RLS. This is deliberately a **second, narrower gate** layered on top of the `employees` table's normal `edit` policy: a user can have full `employees.edit` rights (via a role grant or an override) and still be blocked from changing this one field specifically, because RLS's `USING`/`WITH CHECK` clauses operate at the row level and can't distinguish "which column changed" — only a trigger can. **Verified live, with the two layers deliberately isolated from each other:** a test user was granted `employees.edit` via a `user_permission_overrides` row (not a role grant, to prove the mechanism generically) — their name-only edit succeeded (proving RLS allowed the `UPDATE` through), and their `employee_code` edit on the same row was then separately rejected by the trigger with the exact designed exception message — proving the two layers are independent, not that RLS alone happened to block it.

## 5. `document_counters` — default-deny, no end-user policy

RLS is enabled with **zero policies** — verified live via `\d document_counters` showing `Policies (row security enabled): (none)`. This is intentional and matches Phase 1's own precedent on `schema_migrations`: the table is written only by `generate_employee_code()`, a `SECURITY DEFINER` function that bypasses RLS by design, and no application code path needs direct row access to it. A caller without superuser/owner rights gets nothing, by default, unless a future phase deliberately adds a policy for a real reason.

## 6. `SECURITY DEFINER` functions introduced this phase

`generate_employee_code()` and `prevent_employee_code_change()` — both need to read/write tables (`document_counters`, `user_roles`/`roles`) that the calling user's own RLS grants may not otherwise expose, for the same reason every Phase 1 helper function needed it: avoiding circular RLS evaluation on their own internal lookups. Both are `SET search_path = public`, matching Phase 1's hardening pattern exactly. `set_updated_at_timestamp()` (§ see architecture doc §2.7) is deliberately **not** `SECURITY DEFINER` — it only ever writes `NEW.updated_at`, no cross-table query, no RLS bypass need, following the same reasoning Phase 1 applied to its own `set_updated_at()`.

## 7. Cascade/restrict delete behavior — a security-adjacent integrity property

`salary_payments`/`advance_records` use `ON DELETE RESTRICT` on `employee_id` — an employee with financial history cannot be deleted at all, matching the frontend's existing guard exactly (verified live: a delete attempt against an employee with a linked `salary_payments` row was rejected with the FK violation, not silently allowed). `attendance_records`/`employee_documents`/`project_employees` use `ON DELETE CASCADE` — verified live: deleting an employee with only these three linked (no salary/advance) succeeded and correctly removed all three, closing a gap the frontend's own delete guard doesn't currently check (attendance) without changing any behavior reachable today.

## 8. Known, disclosed limitation

The frontend's local `AuthUser`/`localStorage`-based authentication system is entirely separate from Phase 1's Supabase Auth, and Phase 2 does not reconcile them (§4 of the architecture doc). This means none of the RLS/permission enforcement described in this document is reachable by the live application yet — it only becomes load-bearing once a future phase wires the frontend to Supabase Auth. This is the same caveat Phase 1's own security doc carries, unchanged.
