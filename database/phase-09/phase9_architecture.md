# Phase 9 — Architecture: Invoices

Status: **Implemented, executed, and fully verified** against the live Supabase project. This is the final, frozen design.

## 1. Selection

Like every phase since 5, `invoices`/`invoice_items`/`payments` are pre-existing tables from Phase 1's original 14. Selected by dependency count: `invoices` is the only remaining pre-existing table with any live dependents (`invoice_items` and `payments` both reference it); every other remaining table has zero.

## 2. Two frozen Phase 1 trigger functions corrected - explicitly approved

This is the first phase to modify the *body* of a frozen function's logic, rather than a constraint's `ON DELETE` clause. Two confirmed defects justified it:

**`update_invoice_total()`** computed `total_amount` as a naive `SUM(quantity * price)` with no GST term, while `Invoices.tsx` always computes `totalAmount = subtotal + cgstAmt + sgstAmt + igstAmt` with GST on by default (`cgstRate`/`sgstRate` default to 9/9). Corrected to reproduce that exact formula, including per-tax-component rounding (`Invoices.tsx:270-273`'s three separate `Math.round()` calls, not one combined rounding) - verified live to produce byte-identical results to hand-calculated frontend values across two test cases (`1180`, then `1476` after a second line item).

**`update_invoice_status()`** wrote `'Pending'`/`'Partially Paid'`/`'Paid'` - strings that do not match the frontend's `InvoiceStatus` type (`"Unpaid" | "PartiallyPaid" | "Paid"`, no space). Not hypothetical: the one existing production row already held `'Partially Paid'`, a value that failed every exact-match comparison the frontend performs against it (`Payments.tsx`'s payment-eligibility filter, `Dashboard.tsx`'s Unpaid widget, `CustomerHistory.tsx`'s Paid filter). Corrected to the exact three enum strings, plus a one-row idempotent backfill of the already-corrupted live value.

Both changes were scoped to the minimum required: only the arithmetic/string-literal logic changed; function name, `SECURITY DEFINER`, `search_path`, ownership, and every existing trigger registration were left untouched (`CREATE OR REPLACE FUNCTION` preserves ownership and grants - only `DROP`+`CREATE` would have reset them). `prevent_overpayment()` was reviewed and confirmed still correct - not modified.

## 3. Columns added

`invoices`: `customer_id` (backfilled from `projects.customer_id`, `NOT NULL` since Phase 5, then made `NOT NULL` itself), `inv_no`, `dc_id`, `subtotal`, `cgst_rate`/`sgst_rate`/`igst_rate` (defaults 9/9/0, matching the frontend), `cgst_amt`/`sgst_amt`/`igst_amt`, `invoice_date`, `due_date`, `payment_terms` (default `'30 days'`), `paid_amount` (confirmed frontend-written, not trigger-derived - `Payments.tsx:338-340` computes and pushes it directly), `buyer_gstin`/`buyer_address`/`buyer_state_name`/`buyer_state_code`, the full reminder-field set (`reminder_enabled`/`reminder_interval_days`/`reminder_frequency_days`/`next_reminder_at`/`last_reminder_sent_at`/`reminder_count`/`next_reminder_custom_date`/`selected_email`), `invoice_type`, `po_number`/`po_date`/`delivery_vehicle_no`/`delivery_destination`, `updated_at` (+ reused Phase 2 trigger). `invoice_items`: `hsn`, `created_at` (this table had none), `updated_at` (+ trigger). `payments`: `mode`, `reference_no`, `notes`, `files` (jsonb). Every field confirmed via direct call-site tracing in `Invoices.tsx`/`Payments.tsx`, not inferred from the type signature alone.

## 4. FK correction

`payments.invoice_id` corrected from `ON DELETE NO ACTION` to `ON DELETE CASCADE`. `deleteInvoice()` has zero dependency guard; `invoice_items` already correctly `CASCADE`s for the identical parent-child relationship. `CASCADE` was chosen over `SET NULL` deliberately - a payment orphaned from its invoice is not meaningful financial data, and unlike vendors/inventory-items, no frontend copy promises an orphan-and-retain outcome for payments. Verified live: deleting a test invoice with real linked `invoice_items` and `payments` rows removed all three together.

## 5. Deliberately unchanged

`invoices.project_id` and the new `invoices.customer_id`: left at default `NO ACTION` - `deleteProject()` and `deleteCustomer()` (Phase 5, confirmed) already block deletion whenever a linked invoice exists, so this path is confirmed unreachable, not contradicted. `invoices.dc_id`: left at default `NO ACTION` - `delivery_challans` has not been investigated in this phase, so no evidence-backed correction is possible. `bankDetails`, `termsAndConditions`: confirmed zero usage in `Invoices.tsx`, left frontend-only. `invoiceNumber`: confirmed a UI-form-only duplicate of `invNo`, not a separate persisted concept. RLS, permissions, indexes: confirmed already correct and already covering every new column.

## 6. Review history

Discovery selected `invoices` by dependency count, then surfaced two confirmed frozen-Phase-1-function defects during live-trigger-body review - a bigger class of frozen-object change than any prior phase (a function's logic, not a constraint clause). The architecture round stopped explicitly at this decision, asking for the user's separate, explicit approval before proceeding - granted with eight named constraints (minimum-change, no redesign, preserve names/ownership/`SECURITY DEFINER`/`search_path`/permissions/registrations, exact-behavior-reproduction, documented reasoning). Re-running the architecture review under those constraints caught two things before SQL was written: `paid_amount` is frontend-written, not trigger-derivable (would have been scope creep to add trigger maintenance for it), and a missing `customer_id` column that Discovery's own summary had not listed. SQL generation, adversarial self-review (no defect found), execution, and independent verification (including hand-calculated GST-total behavioral tests and a real cascade-delete test) all completed with zero FAILs in the same continuous session.

## 7. Known, disclosed limitation carried from Phase 1-8

Same as every prior phase: the frontend's local `AuthUser`/`localStorage`-based authentication remains entirely separate from Supabase Auth. None of this is reachable by the live application yet. Unlike prior phases, the two trigger-function fixes here corrected a defect that was already live in production data (the one existing row's `status`), not merely a dormant one - the backfill in section 9 of the migration corrected it directly.
