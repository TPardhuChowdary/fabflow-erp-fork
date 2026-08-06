# Phase 9 — Security Model: Invoices

Status: **Implemented and behaviorally verified** against the live database using direct queries and real behavioral tests. See [phase9_verification.md](./phase9_verification.md) for method and [phase9_completion_report.md](./phase9_completion_report.md) for results.

## 1. Threat model addressed

Like every prior phase, this introduces zero new RLS policies and zero new permission-module mappings. Its access-control-relevant work is entirely about verifying an already-frozen policy set still correctly matches live frontend gating. Its data-integrity-relevant work - the FK correction and the two trigger-function fixes - is a separate concern, addressed below.

## 2. RLS - confirmed reusable, not redesigned

Phase 1 already enabled RLS on all three tables with the standard 4 policies each (12 total), matching the `invoices`/`payments` permission modules. Confirmed live post-execution: policy count unchanged at 123, all 12 policies byte-for-byte identical. The 34 new columns across the three tables are automatically covered - RLS gates rows, not columns.

## 3. The `payments.invoice_id` FK correction - a data-integrity control, not access-control

Correcting `ON DELETE NO ACTION` to `CASCADE` does not change who can do what; it changes what happens to a payment record when an invoice a user was already authorized to delete is actually deleted. Before this correction, the database would have silently contradicted an operation RLS had already authorized. Verified live with a real delete against real linked rows.

## 4. The two frozen Phase 1 function corrections - the most significant security-adjacent decision this phase made

`update_invoice_total()` and `update_invoice_status()` are both `SECURITY DEFINER`, `search_path`-pinned functions - the same hardening class Phase 1 applied to every pre-existing trigger. Modifying their bodies carried real risk of weakening that hardening if done carelessly. The fix was scoped to the absolute minimum: no change to `SECURITY DEFINER`, `search_path`, function name, argument list, return type, ownership, or any grant - confirmed directly from `pg_get_functiondef()` output post-execution, byte-for-byte identical on every attribute except the specific arithmetic (`update_invoice_total`) and string literals (`update_invoice_status`) that were the actual, evidence-backed defects. `CREATE OR REPLACE FUNCTION` was used specifically because it preserves ownership and grants; a `DROP`+`CREATE` would not have.

`prevent_overpayment()` - the third finance-critical trigger on `payments` - was reviewed for any needed change and confirmed already correct. Not modified. Verified live post-execution: its body hash is identical to the pre-execution baseline, and a real overpayment attempt was still correctly rejected.

## 5. `NOT NULL` and defaults

`invoices.customer_id`'s new `NOT NULL` matches `Invoices.tsx`'s own required-field validation, and was proven safe via a real backfill from `projects.customer_id` (`NOT NULL` since Phase 5) rather than an invented value - confirmed live before the constraint was added. No other new column received `NOT NULL`, since none are validated as required anywhere in the frontend.

## 6. Organization isolation

Unchanged from Phase 1 - `organization_id = current_organization_id()` remains part of every existing policy on all three tables. Not independently re-tested this phase with a second organization, since the policies themselves are unmodified.

## 7. Known, disclosed limitation carried from Phase 1-8

Same caveat as every prior phase: the frontend's local `AuthUser`/`localStorage`-based authentication is still entirely separate from Supabase Auth, so none of this is reachable by the live application yet.
