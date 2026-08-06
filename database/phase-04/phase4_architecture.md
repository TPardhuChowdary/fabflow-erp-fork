# Phase 4 — Architecture: Petty Expenses + Expense Floats

Status: **Implemented, executed, and fully verified** against the live Supabase project. This is the final, frozen design — it reflects three rounds of review (initial design, an explicit adversarial design review, and a final consistency pass) plus one post-approval correction made during SQL implementation review (the settlement concurrency fix, see §5).

## 1. Scope

Two new tables — `petty_expenses` and `expense_floats` — replacing the frontend's local-only `PettyExpense`/`ExpenseFloat` model with a real, RLS-protected, multi-tenant backend. `SalaryAdvance` was confirmed dead (superseded by Phase 2's `advance_records`, zero live call sites) and correctly excluded.

## 2. Tables

**`expense_floats`** — a cash advance issued to an employee, settled over time against linked petty expenses and direct returns. `id, organization_id, float_no (unique per org), employee_id, issued_date, issued_amount (CHECK > 0), spent_amount, returned_amount, balance_amount, status, purpose, notes, project_id, issued_by, settled_at, created_at, updated_at`. `spent_amount`/`balance_amount`/`status`/`settled_at` are never written directly — they are a pure, trigger-maintained function of `issued_amount`, `returned_amount`, and the live sum of linked `petty_expenses` rows (§4).

**`petty_expenses`** — an individual expense record, optionally linked to a float, a project, a vendor, an inventory item, or a salary-payment recovery. `id, organization_id, date, employee_id, amount (CHECK > 0), expense_type, expense_mode, project_id, float_id, notes, item_name, quantity, unit_price, vendor, vendor_id, bill_number, attachments (jsonb), inventory_item_id, added_to_inventory, machine_id, service_type, vehicle_expense_type, service_provider_type, pickup_location, drop_location, recovered_in_salary_payment_id, created_at, updated_at`.

`machine_id` deliberately carries **no FK** — the Machinery module has no live Supabase table yet. A future Machinery phase should add that FK as its own additive, forward-fix touch to this (by-then-frozen) table; it does not block Phase 4.

## 3. Numbering — `generate_float_number()`

Identical, unmodified pattern to `generate_employee_code()` (Phase 2) and `generate_quotation_number()` (Phase 3): atomic `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` against Phase 2's `document_counters` (new `counter_key = 'FLT'`), formatted `FLT-YYYY-NNN`. Proven concurrency-safe live (§ verification): two genuinely concurrent calls returned `FLT-2026-001` and `FLT-2026-002` with no collision.

## 4. Derived-field design — the central architectural decision of this phase

`spent_amount`, `balance_amount`, `status`, and `settled_at` are computed by exactly one function, `expense_float_recompute()`, called from every write path that can affect them — never duplicated:

- **`recompute_petty_expense_floats()`** — `AFTER INSERT OR UPDATE OR DELETE` on `petty_expenses`. Handles float_id reassignment on UPDATE by recomputing both the old and new float when they differ. Delegates the actual float row update to `expense_float_apply_recompute()`, which takes `SELECT ... FOR UPDATE` on the target float *before* summing `petty_expenses`, so a second concurrent writer blocks and re-reads the committed state rather than computing from a stale snapshot.
- **`expense_floats_before_write()`** — two separate triggers on `expense_floats` (`BEFORE INSERT`, unconditional; `BEFORE UPDATE`, gated by `WHEN (issued_amount or returned_amount changed)`). Split into two triggers rather than one combined `INSERT OR UPDATE` trigger because a `WHEN` clause referencing `OLD` is illegal for a trigger that also fires on `INSERT` — a real PostgreSQL restriction, not a style choice.

The formula: `spent := live SUM(petty_expenses.amount) WHERE float_id = this float`; `balance := GREATEST(0, issued - spent - returned)`; `status := 'Fully Settled'` if `issued - spent - returned <= 0`, else `'Partially Settled'` if `spent > 0 OR returned > 0`, else `'Open'`; `settled_at := COALESCE(existing settled_at, now())` when newly fully settled, else `NULL`. Because every path re-derives from a live query rather than trusting a cached value, correctness never depends on call order between the trigger paths and `settle_expense_float()`.

## 5. `settle_expense_float()` — added after initial approval, before execution

The original design let the settlement flow write `expense_floats.returned_amount` via a direct table `UPDATE`, matching the frontend's own `settleExpenseFloat(id, returnedAmount, notes)` action (which is itself already delta-based — it computes `newReturned = f.returnedAmount + returnedAmount` from a locally-read value). A dedicated implementation review found this unsafe under concurrency: two overlapping absolute-value writes to `returned_amount` could lose one settlement's contribution entirely, since Postgres's row lock serializes the *writes* but does nothing about a value that was already stale at read time.

`settle_expense_float(p_float_id, p_delta, p_notes default null)` closes this: `SECURITY DEFINER`, re-checks `has_permission('expense_float','edit') OR has_permission('expense_float','settle')` and `organization_id = current_organization_id()` internally (necessary because a `SECURITY DEFINER` RPC bypasses table RLS), locks the float row with `FOR UPDATE`, increments `returned_amount` by `p_delta` against the now-current value, and reuses `expense_float_recompute()` for the derived fields — no duplicated formula. Proven live under genuine concurrent settlement load: two overlapping calls with deltas 50 and 30 produced `returned_amount = 80`, not 50 or 30.

**Known, deliberately-accepted limitation, carried forward rather than closed in this phase**: nothing in the schema prevents a caller with `expense_float.edit`/`.settle` from bypassing `settle_expense_float()` and issuing a raw `UPDATE expense_floats SET returned_amount = ...` directly — RLS permits it identically for that column as for any other. Closing this fully would require a trigger-level "protected column" mechanism (e.g., a session-local marker checked by a `BEFORE UPDATE` guard), which is real new trigger *behavior*, not schema/data delivery — explicitly deferred to whichever future phase wires the frontend to Supabase Auth (§8), or a dedicated later hardening pass, rather than built pre-emptively against a caller that doesn't exist yet. See `phase4_security.md` §5.

## 6. Cross-module `ON DELETE` design

`petty_expenses.float_id`, `.vendor_id`, `.inventory_item_id` are all `ON DELETE SET NULL` — confirmed live against the actual frontend that `deleteExpenseFloat`, `deleteVendor`, and `deleteInventoryItem` are all unconditional today (no guard checks `petty_expenses` at all). `RESTRICT` on any of these would make the database stricter than the live app in an undisclosed way; `SET NULL` preserves today's actual deletability exactly and matches the table's own redundant-storage design (`vendor`/`item_name` text fields already exist independently of the FK columns for exactly this reason — the record stays meaningful without the live link). `recovered_in_salary_payment_id` uses the standard default (no special `ON DELETE`) since `deleteSalaryPayment` doesn't exist anywhere in the app, making this FK's delete behavior currently unreachable regardless of choice.

## 7. Review history

Three explicit review rounds before any SQL was written (initial design → adversarial design review, which found and corrected the derived-field trigger coverage gap and the `vendor_id`/`inventory_item_id` `ON DELETE` choice → final consistency pass, verdict APPROVE FOR SQL), then two implementation-stage reviews after SQL was generated (a static self-review that caught and fixed the `WHEN`-clause-on-`OLD` trigger split before delivery, and a dedicated adversarial implementation review of `settle_expense_float()` specifically that verified — by reading Phase 1's actual `has_permission()` source rather than assuming — that a theoretical `NULL`-bypass in its permission check is not exploitable).

## 8. Known, disclosed limitation carried from Phase 1–3

Same as every prior phase: the frontend's local `AuthUser`/`localStorage`-based authentication remains entirely separate from Supabase Auth. None of this RLS/permission enforcement, nor `settle_expense_float()`, is reachable by the live application yet — both become load-bearing only once a future phase wires the frontend to Supabase.
