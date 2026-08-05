# Phase 1 — Architecture: Organizations, RBAC, RLS

Status: **Implemented and verified.** Executed against the live Supabase project (`znfczdkexmsgmedafhgz`) as [phase1_auth_permissions_rls_v5_FINAL.sql](./phase1_auth_permissions_rls_v5_FINAL.sql), registered in `schema_migrations` as `20260806_001_phase1_auth_permissions_rls`. See [phase1_completion_report.md](./phase1_completion_report.md) for verification evidence.

## 0. Why this exists

FabFlow ERP's entire application logic (every page, every workflow, every business rule) originally ran client-side against a Zustand store persisted to `localStorage`. A real, provisioned Supabase project existed but was completely unused by the frontend — zero imports, zero calls, confirmed by a full manual code trace (`main.tsx` → `App.tsx` → `AuthContext.tsx` → `store.ts`). Phase 1 is the first step of a 19-phase migration to a real multi-tenant SaaS backend, replacing **only the infrastructure layer** — no existing page, workflow, business rule, or permission behavior is redesigned.

**Adopted target architecture (frontend, future phases):** React UI → Service Layer → Supabase → PostgreSQL. The UI never calls Supabase directly. `useStore()` keeps its exact action names/signatures so existing call sites need zero changes — only each action's *body* moves from a synchronous `set()` to an async Supabase call followed by `set()` (Zustand-as-cache-over-service-layer). This frontend wiring is **not** part of Phase 1 — Phase 1 is backend infrastructure only.

**Priority order governing every design decision in this phase:** Correctness > Security > Data integrity > Maintainability > Scalability > Backward compatibility > Performance > UX (speed explicitly lowest priority).

## 1. System diagram

```
auth.users (Supabase-managed, GoTrue)
    │  AFTER INSERT trigger: handle_new_auth_user()
    ▼
profiles (organization_id, is_active, must_change_password,
          last_login, created_by, updated_by)
    │
    ├──▶ user_roles (user_id, role_id)  ◀── single source of truth for role assignment
    │         │
    │         ▼
    │      roles (12 seeded: admin/Admin, sales, procurement, production,
    │             quality, dispatch, accounts, employee, Accountant,
    │             Designer, Worker)
    │         │
    │         ▼
    │      role_permissions (role_id, permission_id)
    │         │
    │         ▼
    │      permissions (135 seeded rows, 27 modules — transcribed from
    │                    the existing frontend's permissions.ts)
    │
    └──▶ user_permission_overrides (user_id, permission_id, allowed)
              — per-user grant/revoke on top of role-derived permissions

organizations (fixed seed row: 00000000-0000-0000-0000-000000000001,
                "Shanmukha Sai Engineering Works")
    │
    └──▶ organization_id column added to all 14 pre-existing ERP tables:
         customers, vendors, projects, production_stages, inventory_items,
         inventory_purchases, inventory_usages, project_materials,
         material_requisitions, delivery_challans, invoices, invoice_items,
         payments, logs

has_permission(module, action) — the single permission-check function used
    by every RLS policy. Checks profiles.is_active, then admin bypass via
    roles.is_admin, then per-user override in user_permission_overrides,
    falling back to the role-derived grant via user_roles → role_permissions
    → permissions.

security_audit_log — organization_id, event_type, actor_user_id,
    target_user_id, metadata jsonb. Populated by 4 triggers:
    log_auth_login, log_role_change, log_permission_override_change,
    log_profile_active_change.

schema_migrations — version, description, executed_at, executed_by,
    checksum (SHA-256). Every future migration self-registers as its
    final statement, so its presence proves full transactional success.
```

## 2. Component detail

### 2.1 Organizations
Single fixed seed row today (`...0001`, "Shanmukha Sai Engineering Works") — the entire existing dataset belongs to this one tenant. The schema is multi-tenant-ready from day one (every ERP table carries `organization_id`, every RLS policy enforces it), but only one tenant exists until a real second customer is onboarded.

### 2.2 Normalized RBAC
`roles` / `permissions` / `role_permissions` / `user_roles` / `user_permission_overrides` replace what would otherwise be a JSONB permissions blob. `user_roles` is the **single source of truth** for "what role(s) does this user have" — `profiles` deliberately has no `primary_role_id` column (removed during design review as genuinely redundant: `has_permission()` never referenced it in any version of the design).

`permissions` (135 rows / 27 modules) is a direct transcription of the frontend's existing `permissions.ts:MODULE_PERMISSIONS`, plus two new modules (`users`, `audit_log`) needed by the RBAC/audit system itself. This means the permission *taxonomy* the frontend already enforces client-side is now also the source of truth for server-side enforcement — Phase 1 does not invent a new permission model, it relocates the existing one.

### 2.3 Profiles
Extends `auth.users` with ERP-specific fields Supabase's own table can't hold: `organization_id`, `employee_id` (nullable FK reserved for Phase 2's Employees migration), `is_active`, `must_change_password` (password-management foundation), `last_login`, `created_by`, `updated_by`. Auto-created by `handle_new_auth_user()` on every `auth.users` insert.

### 2.4 Permission engine — `has_permission(module, action)`
```
1. profiles.is_active must be true, else deny.
2. If the user's role has roles.is_admin = true, allow (full bypass).
3. Else check user_permission_overrides for an explicit allow/deny on
   this exact (user, module, action) — if present, that wins.
4. Else fall back to the role-derived grant: user_roles → role_permissions
   → permissions for this (module, action).
```
Every RLS policy on every table calls this function — there is exactly one place permission logic lives.

### 2.5 Security Audit Log
Four triggers write immutable audit rows: a user's role assignment/removal, a per-user permission override change, a profile activation/deactivation, and a successful login (`auth.users.last_sign_in_at` change, which also syncs `profiles.last_login`). This table has **no `ON DELETE CASCADE`** from `auth.users` — deliberately: an audit trail must not vanish just because the account it describes is later deleted. See [phase1_rollback.md](./phase1_rollback.md) for the operational implication of this choice.

### 2.6 SECURITY DEFINER hardening
`has_permission()`, `current_organization_id()`, `handle_new_auth_user()`, all 4 `log_*` trigger functions, and the 9 pre-existing ERP trigger functions (`create_stages`, `log_project`, `increase_stock`, `reduce_stock`, `stock_check`, `update_invoice_total`, `update_invoice_status`, `prevent_negative_stock`, `prevent_overpayment`) are all `SECURITY DEFINER` with `SET search_path = public`. This is necessary because these functions query tables (e.g. `profiles`, `roles`) that RLS now protects — without `SECURITY DEFINER` they would recurse into RLS evaluation on their own lookups and either fail or produce incorrect results for non-superuser callers. `set_updated_at()` is the one deliberate exception — it only writes `NEW.updated_at`, touches no other table, and so was correctly left as the default `SECURITY INVOKER`.

### 2.7 Race-condition fixes
`prevent_negative_stock` and `prevent_overpayment` originally did a plain `SELECT` then compared, with no lock — two concurrent transactions could both read the same stale value and both pass their check, over-drawing stock or over-paying an invoice. Both were rewritten to `SELECT ... FOR UPDATE` before comparing, serializing concurrent attempts on the same row. Verified under genuine OS-level concurrent transactions — see [phase1_completion_report.md](./phase1_completion_report.md) items 15c/15d.

### 2.8 `organization_id` backfill (14 pre-existing ERP tables)
Four-step sequence per table, required because `current_organization_id()` resolves via `auth.uid()`, which does not exist in a plain migration session and therefore cannot be used to backfill existing rows:
```
1. ALTER TABLE ... ADD COLUMN organization_id uuid REFERENCES organizations(id);  -- nullable
2. UPDATE ... SET organization_id = '00000000-0000-0000-0000-000000000001';        -- backfill existing rows to the seed org
3. ALTER TABLE ... ALTER COLUMN organization_id SET NOT NULL;
4. ALTER TABLE ... ALTER COLUMN organization_id SET DEFAULT current_organization_id();  -- new rows self-assign from the caller's session
```

### 2.9 Indexing strategy
20 composite indexes, every one leading with `organization_id` — RLS makes `organization_id = current_organization_id()` a mandatory filter on effectively every query against these tables, so a composite index with org id first also serves plain org-only filters, making a separate single-column `organization_id` index redundant. Each index's second column was chosen to match a real ERP page/workflow's actual query pattern (documented inline in the migration file), not added speculatively. Full list in [phase1_auth_permissions_rls_v5_FINAL.sql](./phase1_auth_permissions_rls_v5_FINAL.sql) section 13.

### 2.10 RLS policy pattern
Every one of the 14 pre-existing ERP tables gets 4 policies (select/insert/update/delete), each requiring **both**:
```sql
has_permission('<module>', '<action>') AND organization_id = current_organization_id()
```
`invoice_items`/`payments` inherit their parent table's permission module (`invoices`); `logs` is select-only via `projects.view`. The 6 new RBAC/org/profile tables follow the same two-part pattern, scoped appropriately (e.g. `profiles` allows self-row access in addition to `users.view`/`users.edit`).

## 3. What Phase 1 deliberately does not do

- **No frontend wiring.** The Zustand store still runs entirely on `localStorage`. Phase 1 is backend-only.
- **No Employees, Customers, Vendors, Projects, Quotations, Company POs, Inventory, Production, Material Requisitions, Machinery, Drawing Repository, QMS, Petty Expenses, Delivery Challans, Invoices & Payments, Ledger, Dashboard modules migrated.** Only the 14 tables that already existed in this Supabase project (a prior, separate, partial schema effort) got `organization_id` + RLS. Modules like Employees and Machinery have no Supabase table yet — that is Phase 2 onward, per the 19-phase roadmap.
- **No architecture changes beyond this design.** Phase 1 was explicitly frozen after 5 review-and-regenerate cycles; only a genuine production-critical defect discovered during verification would justify a change, and none was found.
