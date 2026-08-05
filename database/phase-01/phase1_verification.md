# Phase 1 — Verification Methodology

Status: **Executed in full against the live Supabase project.** This document is the reusable runbook — the techniques here are intended to be the baseline method for verifying every future phase, not a one-off. For the actual results, see [phase1_completion_report.md](./phase1_completion_report.md).

## 1. Principle: structural inspection is necessary but not sufficient

A migration can be structurally perfect (every table, policy, index, and function exists exactly as designed) and still be functionally broken — RLS enabled with the wrong `USING` clause, `has_permission()` returning the wrong answer for a subtle role combination, a `SECURITY DEFINER` function that leaks access it shouldn't. Every item in Phase 1 was therefore checked twice: once structurally (does the object exist, with the right flags?) and once behaviorally (does it actually do the right thing when a real session touches it?).

## 2. Structural checks

Plain introspection queries against Postgres catalogs — no session simulation needed:
- `pg_class.relrowsecurity` — RLS enabled per table.
- `pg_policies` — policy count and definition per table, cross-checked against the migration file's design.
- `pg_proc.prosecdef` — `SECURITY DEFINER` flag per function.
- `pg_indexes` — existence of every named `idx_*` composite index.
- `information_schema.columns` — nullability/defaults on backfilled `organization_id` columns, plus a full table scan confirming zero `NULL` values anywhere.
- Direct row/count lookups on seed data (`roles`, `permissions`, `role_permissions`, `organizations`, `schema_migrations`).

## 3. Behavioral checks — simulating a real, non-superuser session

Querying as the `postgres` superuser bypasses RLS entirely and would produce false-positive "it works" results. The correct technique, used throughout:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<user-uuid>","role":"authenticated"}';
-- ... real queries as this simulated user ...
rollback;  -- or commit, if the test is meant to persist real state
```

Supabase's `auth.uid()` resolves from `current_setting('request.jwt.claims', true)::json->>'sub'`, so this genuinely exercises the same code path a real authenticated REST/Realtime request would hit — `has_permission()`, every RLS policy, every trigger — under the identity of a specific test user, not the DBA connection.

**Test users**, created via direct `INSERT INTO auth.users` (the Supabase Admin API's service-role key was not available in this session; direct insert with `pgcrypto`'s `crypt()`/`gen_salt('bf')` for the password hash is an acceptable substitute for verification purposes, since `handle_new_auth_user()` fires identically regardless of insert path):
- `admin_org1` — role `admin`, organization `...0001`.
- `sales_org1` — role `sales`, organization `...0001`.
- `sales_org2` — role `sales`, a 2nd, isolated test organization created solely for this purpose.

### 3.1 Permission engine
Call `has_permission(module, action)` directly under each simulated session and compare against the seeded `role_permissions` grant list.

### 3.2 RLS enforcement — the read/write distinction
- **Read denial** is silent: a `SELECT` from a user lacking `view` on a module returns 0 rows, even when real matching rows exist — RLS filters at the row level, no error.
- **Write denial** is explicit: an `INSERT` violating a policy's `WITH CHECK` raises Postgres error `23503`/`42501` — specifically `42501 row-level security policy` is the unambiguous signature that RLS (not a business-logic trigger, not a FK) is what blocked the statement. This distinction matters when debugging — an unexpected error code means the wrong layer rejected the operation.
- Always cross-check against a `SELECT` "as postgres" baseline first, so an empty result set from the simulated session actually proves filtering rather than proving the data never existed.

### 3.3 Organization isolation
Requires a genuinely separate organization + user — a single-org test can't distinguish "isolation works" from "isolation was never exercised." Compare row counts visible to `sales_org1` vs `sales_org2` for the same underlying table.

### 3.4 Security Audit Log
Trigger each of the 4 logging paths with a real data change (role assignment, permission override, profile activation toggle, `auth.users.last_sign_in_at` update simulating a login) and query `security_audit_log` for the resulting row, checking `event_type`/`target_user_id`/`metadata` against the trigger's actual source (`pg_get_functiondef`), not an assumed schema — an early pass in this verification queried the wrong `event_type` strings and a wrong assumed column layout for `user_permission_overrides`, producing false negatives that were caught by re-reading the actual function/table definitions rather than trusting the first query's empty result.

### 3.5 Existing business triggers, under a real session
The 9 pre-existing ERP triggers (`create_stages`, `log_project`, `increase_stock`, `reduce_stock`, `stock_check`, `update_invoice_total`, `update_invoice_status`, `prevent_negative_stock`, `prevent_overpayment`) were exercised as `admin_org1` (not `postgres`) through a full realistic chain — project creation → stock purchase → stock usage → auto-requisition on shortfall → invoice line items → payment → status transition — inside a single transaction, then rolled back to leave no trace. Both negative paths (insufficient stock, overpayment) were separately confirmed to raise the exact designed exception message.

### 3.6 True concurrency — race-condition fixes
Sequential testing cannot prove a lock-based fix works; it can only prove the check-then-act logic is correct in isolation. The actual race requires two **genuinely overlapping** Postgres transactions:

```
Process A: BEGIN; <triggering INSERT, acquires row lock>; SELECT pg_sleep(3); COMMIT;
Process B (started ~1s later): BEGIN; <same triggering INSERT>; COMMIT;
```

Process B's `SELECT ... FOR UPDATE` (inside the trigger) blocks on A's held lock until A commits, then re-reads the now-current, post-A value before deciding — proving the lock actually serializes the two attempts rather than merely looking correct on paper. Implemented as two real OS-level concurrent `psql` processes (background shell jobs, not a single script), with the final database state — not the process logs — treated as the authoritative result.

### 3.7 Data-integrity smoke test
Row counts across all 14 pre-existing ERP tables, before and after the full verification pass, confirm zero rows lost or corrupted by the migration itself — any count delta should be traceable exactly to test/race fixtures created during verification, never to pre-existing data.

## 4. Test-data hygiene

All test data (users, organizations, audit rows, race fixtures) created for verification must be identifiable by a fixed UUID pattern or name prefix (this phase used `a0000000-...`, `b0000000-...`, `c0000000-...` UUID prefixes and a `ZZZ_VERIFY_` name prefix) and removed afterward via an idempotent cleanup script, run only after every check has passed and been recorded — never before, since several checks (audit log, concurrency) depend on that data existing.

**Cleanup ordering lesson learned:** deleting a user from `auth.users` while they still hold `user_roles`/`user_permission_overrides` rows lets the `ON DELETE CASCADE` fire the audit-logging triggers on those child tables *after* the parent `auth.users` row is already gone from the FK check's point of view, causing a spurious FK violation on the newly-inserted audit row. The correct order is: explicitly delete `user_roles`/`user_permission_overrides` first (while the user still exists, so their audit-trigger inserts succeed normally), then delete the resulting + original audit rows, and only then delete `auth.users` itself. This ordering requirement is general — it will recur for any real user deletion in production, not just test cleanup — and is documented operationally in [phase1_rollback.md](./phase1_rollback.md).

## 5. What this methodology does not cover

- Frontend-driven (browser/UI) verification — not possible yet, since the frontend isn't wired to Supabase (that's future-phase work). This methodology verifies the database layer only.
- Load/performance testing — out of scope per the stated priority order (performance is explicitly the second-lowest priority, below backward compatibility).
- Supabase platform-level configuration (rate limiting, MFA, etc.) — not a schema/RLS concern.
