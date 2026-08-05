# Phase 2 — Architecture: Employees

Status: **Implemented and verified.** Executed against the live Supabase project as [phase2_employees_v1_FINAL.sql](./phase2_employees_v1_FINAL.sql), registered in `schema_migrations` as `20260806_002_phase2_employees`. See [phase2_completion_report.md](./phase2_completion_report.md) for verification evidence. Frozen per [phase1_architecture.md](../phase-01/phase1_architecture.md)'s own precedent — see [Freeze Statement](#freeze-statement) at the end of this document.

## 0. Scope

Migrates the frontend's Employees module (`Employee`, `AttendanceRecord`, `SalaryPayment`, `AdvanceRecord`, `EmployeeDocument` in `types.ts`) to Supabase, integrated with Phase 1's Organizations/Auth/RBAC/RLS/Audit infrastructure, with zero changes to Phase 1 itself beyond one additive foreign key Phase 1 explicitly reserved for this purpose.

## 1. System diagram

```
employees (organization_id, name, phone, role, monthly_salary,
           joining_date, photo_ref, employee_code, designation,
           blood_group, emergency_contact_*, employee_type,
           is_active, left_date, termination_reason,
           created_at, updated_at)
    │
    ├──▶ attendance_records (employee_id, date, status)
    │      unique(employee_id, date) — ON DELETE CASCADE
    │
    ├──▶ salary_payments (employee_id, month, amount, ...,
    │      advance_deductions jsonb) — ON DELETE RESTRICT
    │
    ├──▶ advance_records (employee_id, amount, ..., signature_data)
    │      — ON DELETE RESTRICT
    │
    ├──▶ employee_documents (employee_id, document_group_id,
    │      superseded_at, file_data, uploaded_by → auth.users)
    │      — ON DELETE CASCADE
    │
    └──▶ project_employees (project_id, employee_id) — composite PK,
           ON DELETE CASCADE both directions. Junction table replacing
           the frontend's unvalidated Project.assignedEmployeeIds array.

document_counters (organization_id, counter_key, current_value)
    — general-purpose, organization-scoped, monotonic numbering.
    Phase 2 seeds/uses only the 'EMP' key.

generate_employee_code(org_id) — atomic INSERT..ON CONFLICT DO UPDATE
    RETURNING, format EMP-YYYY-NNN, mirrors the frontend's existing
    generateDocNo() semantics exactly (sequence never resets per year).

profiles.employee_id → employees(id)  — completes the FK Phase 1
    reserved (column + unique constraint existed since Phase 1;
    Phase 2 adds only the FK).
```

## 2. Component detail

### 2.1 `employees`
Direct mapping of the frontend `Employee` type. `employee_code` is unique within an organization (partial unique index, `WHERE employee_code IS NOT NULL`, since it's lazily generated — many employees will have none for a while). `role` is the ERP job-function field (`"Designer"`, `"Worker"`, etc.) — a distinct concept from RBAC's `roles` table, exactly as the frontend already keeps `AuthUser.role` (RBAC) and `Employee.role` (HR) separate.

**Soft-delete columns (`is_active`, `left_date`, `termination_reason`):** infrastructure only, approved and added deliberately inert. No RLS policy filters on `is_active`. No trigger enforces any relationship between the three columns. No frontend behavior changes because of them. They exist so a future phase can build real soft-delete UI/logic against a schema that's already there, without another migration.

**`employee_code` immutability:** once set (non-null), `employee_code` cannot be changed by a normal user, even one with `employees.edit` — enforced by `prevent_employee_code_change()` (§2.4), which only permits the change for a user in an `is_admin` role. This reuses Phase 1's existing admin-bypass concept rather than inventing a new privilege tier; the "dedicated administrative procedure" is simply: an admin-role user (or a future admin-only UI action acting on their behalf) issues the `UPDATE` directly. Enforcement was added because documentation alone wasn't sufficient — any user with `employees.edit` could otherwise silently overwrite a generated code via an ordinary field edit, since RLS doesn't distinguish "editing a name" from "editing a code" within the same row.

### 2.2 `attendance_records`
`unique(employee_id, date)` formalizes the invariant the frontend's `markAttendance()` already relies on (check-existing-then-update-or-insert). `ON DELETE CASCADE` — a deliberate integrity improvement over the frontend's `deleteEmployee()`, which today guards deletion against `salaryPayments`/`advanceRecords` but not `attendanceRecords`, leaving attendance rows orphaned on a real delete. The database now closes that gap without changing any currently-reachable behavior (deletion is already blocked in every real scenario the app allows while salary/advance rows exist).

### 2.3 `salary_payments` / `advance_records`
`ON DELETE RESTRICT`, matching `deleteEmployee()`'s existing guard exactly. `salary_payments.advance_deductions` is `jsonb`, not a normalized join table — it's always read/written as a single unit embedded in one payment record, never queried independently across payments, so normalizing it would be complexity the app has no use for. `advance_records.signature_data` stores the same base64 canvas image the frontend's "Signatures" tab already reads directly from this record — there is no separate signatures entity in the frontend, and none was invented here.

### 2.4 `employee_documents`
`document_group_id` + `superseded_at` replicate the frontend's version-history pattern exactly: a "Replace" inserts a new row and marks the prior one superseded; nothing is hard-deleted by a Replace. `uploaded_by` references `auth.users(id)`, matching Phase 1's own pattern for "who did this" columns (e.g. `profiles.created_by`) — nullable, since the frontend isn't wired to Supabase Auth yet and can't populate it until a future phase does.

### 2.5 `project_employees` — junction table, not an array
Replaces the originally-proposed `projects.assigned_employee_ids uuid[]` (dropped before implementation, per approved revision) with a real many-to-many relationship, following the **exact precedent** Phase 1 already established for `role_permissions` / `user_roles` / `user_permission_overrides`: composite primary key `(project_id, employee_id)`, no surrogate `id` column, `ON DELETE CASCADE` both directions. This closes a referential-integrity gap the frontend's array has today — a deleted employee's id can be left dangling in another project's array with no error — without changing any currently-reachable app behavior (the frontend never relied on those dangling ids resolving to anything).

### 2.6 `document_counters` / `generate_employee_code()`
General-purpose, organization-scoped, monotonic counter table — deliberately not constrained to a fixed set of keys, so a later phase can reuse it for its own numbering prefix without a redesign; Phase 2 only ever seeds/uses the `'EMP'` key. `generate_employee_code()` is a single atomic `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` — Postgres's own row-lock on the upsert target serializes concurrent callers with no separate `SELECT` step to race on. The counter only increments; it has no awareness of whether a resulting `employees` row is later deleted, so a number is never reused — replicating the frontend's own `DocCounters` semantics (monotonic, never resets per calendar year) while making it concurrency-safe and multi-tenant-correct. Verified under genuine concurrent load — see [phase2_completion_report.md](./phase2_completion_report.md).

### 2.7 `set_updated_at_timestamp()` — a new, minimal function, not Phase 1's `set_updated_at()`
Discovered during implementation self-review (not assumed): Phase 1's `set_updated_at()` also writes `NEW.updated_by`, a column none of the 7 Phase 2 tables have — attaching it unchanged would raise `record "new" has no field "updated_by"` on every `UPDATE`. Rather than add an `updated_by` column nobody asked for, a new, minimal, timestamp-only trigger function was written and used for all 7 Phase 2 tables. **Phase 1's `set_updated_at()` itself was not touched** and continues to run unmodified on `profiles`.

### 2.8 RLS — permission-module mapping (confirmed against the live frontend, not assumed)
All 6 employee-data tables (`employees`, `attendance_records`, `salary_payments`, `advance_records`, `employee_documents`) are scoped to the **`employees`** permission module — confirmed by reading `EmployeeDetail.tsx` directly: every one of its tabs (Overview, ID Card, Attendance, Salary & Advances, Signatures, Documents) is gated by `employees.view`/`employees.edit`/`employees.delete` alone. A separate `salary_advance` permission module exists in the seeded `permissions` table (a transcription of the full frontend taxonomy from Phase 1) but is **not referenced by any current page** — it's vestigial, left over from before the standalone Advances UI was consolidated into `EmployeeDetail`. Using it here would have invented a distinction the live app doesn't make; `employees.*` was used instead, faithfully matching actual behavior. `employee_documents`' insert policy additionally allows `employees.upload` (its dedicated 5th action, ORed with `employees.edit`, mirroring Phase 1's own `invoice_items` pattern).

`project_employees`' write policies (insert/update/delete) require **both** `has_permission('projects','edit')` **and** `has_permission('employees','view')` — a deliberate cross-module check, approved explicitly: a user with project-edit rights but no visibility into employee records shouldn't be able to attach an arbitrary employee id to a project, which would leak information about employee existence/identity through a side channel the `employees` RLS policies are specifically designed to prevent. Read access (`project_employees_select`) stays scoped to `projects.view` alone — viewing an assignment is a project-visibility concern, not an assignment action.

`document_counters` has RLS **enabled with zero policies** — the same default-deny posture Phase 1's `schema_migrations` table already uses for an identical reason: it's written only by `generate_employee_code()` (`SECURITY DEFINER`, bypasses RLS by design), and no end-user-facing code path needs direct access to it.

### 2.9 The one touch to a frozen Phase-1 table
`profiles.employee_id` gets its `FOREIGN KEY REFERENCES employees(id)` added — the column and its unique constraint already existed, deliberately unconstrained since Phase 1 (employees didn't exist yet). No other `profiles` column, policy, index, or trigger is touched. No change to `projects` at all — the junction-table design (§2.5) removed what would otherwise have been an additive column there.

## 3. Cross-module interactions (confirmed by code, not assumed)

| Module | Touch point | Status |
|---|---|---|
| Petty Expenses | `PettyExpense.employeeId`, `ExpenseFloat.employeeId` | Not yet migrated to Supabase (no live table) — out of Phase 2 scope, future phase |
| Projects | `project_employees` junction (§2.5) | Implemented this phase |
| QMS | `InspectionStageCompletion.assignedTo` stores an employee id | Not yet migrated to Supabase (no live table) — out of Phase 2 scope |
| Auth | Local `AuthUser.employeeId` (frontend) vs. `profiles.employee_id` (Supabase, this phase) — two separate, unreconciled identity systems | Deliberately out of scope — see §4 |
| Employee ID Card | Pure read + render over `Employee` + `Settings`, no separate stored entity | No schema needed, confirmed |
| Drawing Repository | `ownerType: "project" \| "machine" \| "library"` | Confirmed: no employee integration exists or is implied |

## 4. The two-identity-system question — still open, deliberately

The frontend runs two separate authentication systems today: a **local** one (`AuthUser` in `localStorage`, what the live app actually authenticates against) and **Supabase's** (Phase 1's `auth.users`/`profiles`, not yet wired to the frontend). Phase 2 completes the backend-side relationship (`profiles.employee_id → employees.id`) but does **not** touch `AuthContext.tsx` or attempt to reconcile the two systems — that's frontend-wiring work for a later phase, explicitly out of scope here (see Out of Scope, below).

## 5. Out of Scope

Phase 2 explicitly does **not** include:
- Supabase Storage migration (photos/documents remain base64 `text`, matching the app-wide existing pattern)
- Frontend authentication migration (the two-identity-system question above)
- Employee self-service portal
- Leave management
- Payroll calculations
- Shift scheduling
- Biometric integration
- Soft-delete **workflow** (only the `is_active`/`left_date`/`termination_reason` database columns are introduced — no UI, no enforcement logic, no RLS filtering tied to them)
- Employee login migration

## Freeze Statement

Phase 2's architecture is frozen as of the completion report's PASS verdict. It will not be reopened except for a genuine production-critical defect discovered later — not for a nicer design in hindsight, per the same standing rule Phase 1 established.
