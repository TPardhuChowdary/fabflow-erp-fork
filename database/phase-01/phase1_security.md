# Phase 1 — Security Model

Status: **Implemented and behaviorally verified** against the live database using real, non-superuser sessions. See [phase1_verification.md](./phase1_verification.md) for method and [phase1_completion_report.md](./phase1_completion_report.md) for results.

## 1. Threat model addressed

Before Phase 1, the ERP had no server-side access control whatsoever — all business rules (who can view/edit/delete what) were enforced only in the React frontend, which is trivially bypassable by anyone with API access. Phase 1's purpose is to make every one of those rules **also** true at the database layer, so a compromised or malicious client cannot read or write data it shouldn't, regardless of what the UI does or doesn't check.

## 2. Multi-tenancy isolation

Every row in every ERP-data table carries a mandatory, non-null `organization_id`. Every RLS policy requires `organization_id = current_organization_id()` in addition to the relevant permission check — meaning even a fully-privileged user (e.g. an org's own admin) can never see or modify another organization's rows. `current_organization_id()` resolves from the caller's own `profiles` row via `auth.uid()`, so it cannot be spoofed by client-supplied input.

**Verified:** a user in a 2nd, isolated test organization saw exactly 0 rows of the 1st organization's real customer/project data via direct `SELECT` — not filtered client-side, filtered by Postgres itself.

## 3. Authorization — RBAC + per-user overrides

`has_permission(module, action)` is the single function every RLS policy calls. Resolution order:
1. `profiles.is_active` must be true (a deactivated account loses all access immediately, everywhere, with no code change needed anywhere else).
2. `roles.is_admin = true` → full bypass (2 of 12 seeded roles: `admin`, `Admin`).
3. `user_permission_overrides` — an explicit per-user allow/deny for this exact `(module, action)`, if present, wins over the role-derived grant. This is the foundation for "grant this one extra permission to this one employee without creating a whole new role."
4. Otherwise, the role-derived grant via `user_roles → role_permissions → permissions`.

**Verified:** `admin` bypasses all checks (`projects.delete=true`, `users.edit=true`); `sales` role correctly has `projects.view=true` but `projects.delete=false` and `users.edit=false`, matching its seeded grant list exactly — and the corresponding real `SELECT`/`INSERT` against `payments` (a module `sales` has zero grants in) was silently filtered to 0 rows on read and rejected with Postgres's own `42501` row-level-security error on write.

## 4. `SECURITY DEFINER` — deliberate, scoped, documented

17 functions run as `SECURITY DEFINER` with `SET search_path = public`: the permission engine, the auth/audit triggers, and all 9 pre-existing ERP business-logic triggers. This is required, not incidental — these functions must read tables (`profiles`, `roles`, `role_permissions`) that RLS now protects, and without definer rights they would recurse into RLS evaluation against their own caller's permissions, breaking automation for every non-superuser. `set_updated_at()` is the sole function correctly left as invoker rights, since it touches no other table.

**Risk this introduces and how it's bounded:** a `SECURITY DEFINER` function runs with the privileges of its *owner* (here, effectively the migration's executing role), not its caller — so an error in one of these functions' logic could in principle read/write more broadly than RLS would otherwise allow. This is mitigated by (a) `SET search_path = public` on every one, preventing search-path-hijacking attacks, and (b) every one of these 17 functions being short, single-purpose, and reviewed across 5 design cycles before execution.

## 5. Security Audit Log

`security_audit_log` records: `role_assigned` / `role_removed`, `permission_override_changed` / `permission_override_removed`, `user_activated` / `user_deactivated`, `login_success`. All four logging paths are trigger-driven (not application-code-driven), so **no future code change anywhere in the stack can silently skip logging** — the moment the underlying data changes, the log entry is written, guaranteed by the database itself.

**Design choice, not an oversight:** `security_audit_log`'s foreign keys to `auth.users` (`actor_user_id`, `target_user_id`) have no `ON DELETE CASCADE`. An audit trail must survive the deletion of the account it describes — otherwise deleting a user would be a way to erase evidence of what that user did. The operational consequence of this choice (a user cannot be deleted from `auth.users` while audit rows still reference them, and the correct deletion order) is documented in [phase1_rollback.md](./phase1_rollback.md), discovered and resolved during this phase's test-data cleanup.

**Verified live:** all 4 audit paths were triggered with real data during verification and produced exactly the expected `event_type`/`target_user_id`/`metadata` rows.

## 6. Password management foundation

`profiles.must_change_password` (boolean, default false) is the foundation Phase 1 lays for a forced-password-reset flow — the actual reset UI/flow is frontend work for a later phase, not built here. `profiles.last_login` is kept in sync automatically by `log_auth_login()` on every real `auth.users.last_sign_in_at` change.

## 7. Race-condition-safe business logic

Two pre-existing triggers (`prevent_negative_stock`, `prevent_overpayment`) originally had a check-then-act race: two concurrent transactions could both read stock/payment totals before either committed, both pass validation against the stale value, and both proceed — resulting in negative stock or a double-paid invoice. Both now take a `SELECT ... FOR UPDATE` row lock before comparing, so the second concurrent transaction blocks until the first commits, then re-evaluates against the now-current, correct value.

**Verified under genuine concurrency** (two real overlapping Postgres transactions, not sequential simulation): a stock item with 100 units, hit with two concurrent 60-unit usages, ended at exactly 40 (one succeeded, one correctly rejected) — never went negative. An invoice with a 1000 total, hit with two concurrent 600 payments, ended with exactly one 600 payment recorded — never double-paid.

## 8. Known non-blocking finding

`schema_migrations` shows `relrowsecurity = true` in `pg_class` despite the Phase 1 migration file never issuing `ENABLE ROW LEVEL SECURITY` on it — not something this migration did; most likely a Supabase platform default for newly created tables. With RLS on and zero policies defined, the effective behavior is default-deny for every role except the table owner — which is the correct posture for a DBA-only migration-tracking table that no application code path was ever going to query through the RLS-constrained REST layer. Assessed as a **WARNING**, not a defect; no fix applied.

## 9. What Phase 1 does not yet secure

- Frontend still authenticates nothing — it's still pure `localStorage`, so none of this security model is reachable by real users yet. It only becomes load-bearing once the frontend is wired to Supabase (future phase).
- No rate limiting, no CAPTCHA, no MFA — those are Supabase Auth platform features to be configured, not schema/RLS concerns, and are out of Phase 1's scope.
- No column-level or field-level security — RLS here is row-level only, matching the granularity the existing frontend's permission model already assumes.
