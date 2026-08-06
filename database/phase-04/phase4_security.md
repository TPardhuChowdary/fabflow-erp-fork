# Phase 4 — Security Model: Petty Expenses + Expense Floats

Status: **Implemented and behaviorally verified** against the live database using real, non-superuser sessions. See [phase4_verification.md](./phase4_verification.md) for method and [phase4_completion_report.md](./phase4_completion_report.md) for results.

## 1. Threat model addressed

Petty expenses and expense floats are financial records — cash issued to and spent by employees. Phase 4's job is to make sure creation, viewing, editing, and settlement are gated by the permission modules the live frontend actually checks, and that the one genuinely new write primitive this phase introduces (`settle_expense_float()`) cannot be invoked by an unauthorized caller despite running as `SECURITY DEFINER`.

## 2. Permission-module mapping — confirmed against live frontend gating code, not inferred from table names

- **`petty_expenses` INSERT** accepts `petty_expenses.create` **OR** `expense_float.settle`. Confirmed live: the float-settlement flow (`handleFinishSettlement` in `PettyExpenses.tsx`) creates `PettyExpense` rows via `addPettyExpensesBatch`, gated only by the settlement dialog's own `expense_float.settle`-derived access — there is no separate `petty_expenses.create` check on that specific path.
- **`petty_expenses` UPDATE** accepts `petty_expenses.edit` **OR** `employees.edit`. Confirmed live: `EmployeeDetail.tsx`'s payroll dialog marks personal expenses as recovered via `updatePettyExpense({...recoveredInSalaryPaymentId})` under an `employees.edit`-gated context, not `petty_expenses.edit` — a genuine hidden write path that a naive `petty_expenses.edit`-only policy would have silently blocked.
- **`expense_floats` UPDATE** accepts `expense_float.edit` **OR** `expense_float.settle`. `settleExpenseFloat`, called from the same settlement flow, writes `returned_amount` under the settlement permission, not the general edit permission.

Both cross-module ORs were found during the mandatory adversarial design review (not the initial draft), which specifically re-derived every INSERT/UPDATE path from `store.ts`/`PettyExpenses.tsx`/`EmployeeDetail.tsx` source rather than trusting the first-pass design's permission-module guesses.

## 3. `settle_expense_float()` — the one function this phase exposes as a direct RPC, and why its authorization had to be re-derived rather than assumed

Every other new function this phase (`generate_float_number`, `expense_float_recompute`, `expense_float_apply_recompute`, the two trigger functions) is only ever invoked from inside a trigger or from another `SECURITY DEFINER` function — never called directly by an end user, so RLS on the tables they touch is the only gate that ever mattered for them. `settle_expense_float()` is different: it is meant to be called directly, as an RPC, by whichever future phase wires the settlement flow to Supabase. A `SECURITY DEFINER` function invoked that way does **not** inherit table RLS the way a plain `UPDATE` through PostgREST would.

It closes this itself: `if not (has_permission('expense_float','edit') or has_permission('expense_float','settle')) then raise exception`, followed by `SELECT ... WHERE id = p_float_id AND organization_id = current_organization_id() FOR UPDATE` — the identical permission condition and org-scoping the `expense_floats_update` RLS policy already enforces, re-implemented at the one point where RLS itself doesn't reach.

**This was checked adversarially, not assumed safe.** PL/pgSQL's `IF NOT (a OR b) THEN RAISE` does not inherit SQL's "NULL is deny" behavior the way an RLS `USING`/`WITH CHECK` clause does — if `has_permission()` could ever return `NULL`, this specific pattern would silently skip the exception and let the call through. Rather than assume this couldn't happen, the actual frozen Phase 1 definition of `has_permission()` was read directly: its top-level expression is `exists(...) AND (exists(...) OR coalesce(scalar_subquery, exists(...)))` — `exists()` is provably always boolean, and the one scalar subquery is protected by `user_permission_overrides.allowed boolean NOT NULL` plus a primary key guaranteeing at most one matching row. **`has_permission()` cannot return `NULL`**, so the check is fail-closed in practice, not just in appearance. Verified live in addition to this static proof: a zero-permission test user calling `settle_expense_float()` directly received `ERROR: permission denied for settle_expense_float`, not a silent success.

Cross-organization targeting is closed the same way, and verified live with a genuine second organization's admin user: `SELECT ... WHERE id=... AND organization_id=current_organization_id()` means a float belonging to another org is simply never found — the function raises the identical "not found" error whether the float doesn't exist at all or exists in a different org, which also means the error message leaks no information about cross-org float existence.

## 4. `SECURITY DEFINER` functions introduced this phase

All six: `generate_float_number()`, `expense_float_recompute()`, `expense_float_apply_recompute()`, `settle_expense_float()`, `recompute_petty_expense_floats()`, `expense_floats_before_write()`. All `SET search_path = public`, matching every prior phase's convention exactly — necessary because several of these run inside triggers that must read/write across `petty_expenses`/`expense_floats` regardless of the originating session's own row-level visibility into those tables (a user with `petty_expenses.create` but not `petty_expenses.view`, for instance, must still be able to trigger a correct float recompute).

## 5. Known, deliberately-accepted limitation

`settle_expense_float()` is the *correct* path, not the *only possible* path: RLS's `expense_floats_update` policy still permits a direct `UPDATE expense_floats SET returned_amount = ...` from any caller with `expense_float.edit`/`.settle`, identically to any other column on that table. A concrete, non-concurrent sequence demonstrates why this matters: call `settle_expense_float(F, 50, ...)` (returned_amount becomes 50), then issue a raw `PATCH .../expense_floats?id=eq.F` with `{"returned_amount": 30}` — RLS permits it, and the 50 is silently overwritten by 30.

This was evaluated explicitly as a final architectural decision (not an oversight): closing it fully requires a "protected column" trigger mechanism — new trigger *behavior*, which this phase's own standing rule says to add only when absolutely required. Since no frontend code calls Supabase for any table in this project yet, there is no live caller to protect against today; the natural, correct enforcement point is the future Supabase-integration phase's own call-site discipline (call the RPC, never PATCH `returned_amount` directly), reviewable against real code once it exists, rather than a database-level guess built against a caller that hasn't been designed. Documented here explicitly so it is not lost, matching this project's standing "never make corrections silently" rule applied in reverse — disclosing a *non*-correction just as plainly as a correction.

## 6. Integrity constraints as a security-adjacent property

`CHECK (amount > 0)` and `CHECK (issued_amount > 0)` formalize validation the frontend already performs, preventing a malformed direct write (bypassing the UI) from entering a zero or negative expense/issuance. Both verified live via real rejected inserts.

## 7. Organization isolation

Same mechanism as every table in Phase 1–3 — `organization_id = current_organization_id()` ANDed into every RLS policy, plus (uniquely to this phase) re-implemented inside `settle_expense_float()` itself since that path doesn't go through RLS. Verified live both ways: a second, genuinely isolated test organization's admin user saw zero rows of the first organization's real float data via `SELECT`, and received a clean "not found" — not a silent no-op or an information-leaking error — when attempting to settle a float that belonged to the other organization.

## 8. Known, disclosed limitation carried from Phase 1–3

Same caveat as every prior phase: the frontend's local `AuthUser`/`localStorage`-based authentication is still entirely separate from Supabase Auth, so none of this RLS/permission enforcement is reachable by the live application yet — it becomes load-bearing only once a future phase wires the frontend to Supabase Auth.
