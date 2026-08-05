# Phase 1 — Rollback Plan

Status: **Documented, not executed.** No rollback has been performed or is currently needed — Phase 1 verification passed all 17 items with zero FAILs (see [phase1_completion_report.md](./phase1_completion_report.md)). This document exists as the reference plan for the scenario where a genuine production-critical defect is discovered later, per this project's standing rule that every phase carries a migration plan, a rollback plan, and a verification pass before implementation.

## 1. Current blast radius if rolled back

The frontend is **not** wired to Supabase yet — it still runs entirely on `localStorage` (confirmed by full code trace prior to Phase 1). This means, as of today, rolling back Phase 1 has **zero user-facing impact**: no live traffic depends on any of this schema. This will no longer be true once a future phase wires the frontend to Supabase — at that point this document must be revisited and the blast radius reassessed before being trusted.

## 2. The ordering lesson (read this before writing any rollback SQL)

Discovered directly during Phase 1's own test-data cleanup, so it is empirically proven, not theoretical: **`security_audit_log`'s foreign keys to `auth.users` have no `ON DELETE CASCADE`, by design** (an audit trail must survive the deletion of the account it describes). This means:

- You cannot delete a row from `auth.users` while any `security_audit_log` row still references it (`23503` FK violation).
- You cannot delete `auth.users` and rely on `ON DELETE CASCADE` to clean up `user_roles`/`user_permission_overrides` first, either — that cascade fires `log_role_change()`/`log_permission_override_change()`, which try to **insert new** audit rows referencing the user *after* the parent row is already gone from the FK check's point of view, producing the exact same violation on a row that didn't even exist before you started.

**The only correct order** is:
1. Delete `user_permission_overrides` / `user_roles` rows explicitly, first, while the referenced `auth.users` row still exists (so their audit-trigger inserts succeed normally).
2. Delete every `security_audit_log` row that now references the user (both original rows and the ones step 1 just generated).
3. Only then delete from `auth.users` — `profiles` cascades cleanly, and `user_roles`/`user_permission_overrides` are already empty so no further trigger-driven inserts occur.

This ordering constraint applies to **any** future user deletion, in production or otherwise — not just rollback. It is a permanent operational fact about this schema, not a one-time migration quirk.

## 3. Rollback SQL (reference — verify against the live schema before running)

Reverse order of the forward migration's sections. Each statement is written defensively (`IF EXISTS`) so a partial rollback is safe to re-run, matching the forward migration's own idempotency pattern.

```sql
begin;

-- 1. RLS policies + RLS flag on the 14 pre-existing ERP tables
--    (drop policies first, then disable RLS — reverse of forward order)
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in (
        'customers','vendors','projects','production_stages','inventory_items',
        'inventory_purchases','inventory_usages','project_materials',
        'material_requisitions','delivery_challans','invoices','invoice_items',
        'payments','logs'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

alter table customers disable row level security;
alter table vendors disable row level security;
alter table projects disable row level security;
alter table production_stages disable row level security;
alter table inventory_items disable row level security;
alter table inventory_purchases disable row level security;
alter table inventory_usages disable row level security;
alter table project_materials disable row level security;
alter table material_requisitions disable row level security;
alter table delivery_challans disable row level security;
alter table invoices disable row level security;
alter table invoice_items disable row level security;
alter table payments disable row level security;
alter table logs disable row level security;

-- 2. organization_id columns on the 14 pre-existing ERP tables
--    (drops the column and its composite index together)
alter table customers drop column if exists organization_id;
alter table vendors drop column if exists organization_id;
alter table projects drop column if exists organization_id;
alter table production_stages drop column if exists organization_id;
alter table inventory_items drop column if exists organization_id;
alter table inventory_purchases drop column if exists organization_id;
alter table inventory_usages drop column if exists organization_id;
alter table project_materials drop column if exists organization_id;
alter table material_requisitions drop column if exists organization_id;
alter table delivery_challans drop column if exists organization_id;
alter table invoices drop column if exists organization_id;
alter table invoice_items drop column if exists organization_id;
alter table payments drop column if exists organization_id;
alter table logs drop column if exists organization_id;

-- 3. Revert the 9 pre-existing trigger functions to SECURITY INVOKER.
--    NOTE: prevent_negative_stock / prevent_overpayment were rewritten
--    (not just re-flagged) to add the FOR UPDATE row lock. Reverting their
--    SECURITY DEFINER flag does not remove the row lock — the lock is part
--    of the function body, not the security context. Removing the lock
--    itself is a deliberate, separate decision (it re-introduces the two
--    proven race conditions) and is NOT included here by default; do so
--    explicitly and only if a specific reason requires it.
alter function create_stages() security invoker;
alter function log_project() security invoker;
alter function increase_stock() security invoker;
alter function reduce_stock() security invoker;
alter function stock_check() security invoker;
alter function update_invoice_total() security invoker;
alter function update_invoice_status() security invoker;
alter function prevent_negative_stock() security invoker;
alter function prevent_overpayment() security invoker;

-- 4. New RBAC/org/audit tables — RLS + policies drop automatically with
--    the tables themselves. Order respects FK dependencies (children
--    before parents), and follows the same audit-log-before-auth.users
--    ordering lesson from Section 2 for any auth.users rows created
--    during this phase's own use.
drop table if exists user_permission_overrides;
drop table if exists user_roles;
drop table if exists role_permissions;
drop table if exists security_audit_log;
drop table if exists profiles;              -- also drops handle_new_auth_user's target
drop table if exists roles;
drop table if exists permissions;
drop table if exists organizations;

-- 5. Trigger + function cleanup
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_login on auth.users;
drop function if exists handle_new_auth_user();
drop function if exists has_permission(text, text);
drop function if exists current_organization_id();
drop function if exists log_security_event(text, uuid, uuid, jsonb);
drop function if exists log_auth_login();
drop function if exists log_role_change();
drop function if exists log_permission_override_change();
drop function if exists log_profile_active_change();
drop function if exists set_updated_at();

-- 6. Remove the migration's own registration
delete from schema_migrations where version = '20260806_001_phase1_auth_permissions_rls';
drop table if exists schema_migrations;  -- only if no later migration has registered since

commit;
```

## 4. What this rollback does **not** undo

- Any real `auth.users` rows created by real signups after Phase 1 shipped. Those users, and their data, are a business decision, not a schema-rollback decision — do not delete real user accounts as a side effect of a schema rollback. Section 2's ordering rule applies if that decision is separately made.
- The frontend's `permissions.ts` taxonomy, which Phase 1's `permissions` seed data was transcribed from but does not modify.

## 5. Recommended alternative to a full rollback

Because RLS fails closed (a policy gap denies access rather than granting it), a narrower fix — patching one policy, one function, or one index — is almost always safer and smaller than a full rollback once real data exists in these tables. Reserve the rollback above for the pre-production window (now) or a genuinely unrecoverable defect; prefer a targeted forward-fix migration, self-registered in `schema_migrations` like every other change, once the frontend is live against this schema.
