-- =====================================================================
-- APPLIED (with explicit approval this session). Also includes the
-- security_invoker fix below, added and verified AFTER the initial
-- apply — see that section's own note for exactly what was wrong and
-- how it was proven fixed.
-- =====================================================================
--
-- Accounting Ledger (Part 4 of the Master ERP Architecture implementation
-- plan). Decision already made by the user: read-only SQL view over the
-- existing financial tables, NOT a new write-populated table.
--
-- Why a view and not a table:
--   - Zero new write path. Every one of the 8 source tables already has
--     its own tested create/update logic (invoicesApi.ts, paymentsApi.ts,
--     payablesApi.ts, etc.) — a view can never drift from them, because
--     it has nothing of its own to drift; it's a live SELECT.
--   - Zero risk to historical data. A write-populated ledger table would
--     need a migration to backfill every past transaction, and any bug
--     in that backfill silently corrupts financial history. A view has
--     no history of its own to get wrong.
--   - Zero duplicate-transaction risk (explicit requirement) — each
--     source row appears in the view exactly once, computed fresh on
--     every query, never copied.
--   - RLS on the underlying tables only protects callers correctly once
--     security_invoker is set (below) — do not assume a plain view
--     "just inherits RLS automatically" without checking; see that
--     section.
--
-- What this is NOT: a textbook double-entry general ledger (an
-- always-balancing Debit account + Credit account pair per transaction,
-- against a Chart of Accounts). FabFlow's real schema has no Chart of
-- Accounts and no per-transaction dual-account posting anywhere — one
-- does not already exist to derive from, and inventing one wholesale
-- would be exactly the "blindly copy Tally's database model" this task
-- explicitly said not to do. What IS built here, and what "Ledger" means
-- concretely in the existing FabFlow business (a fabrication shop's own
-- bookkeeping habits, not formal GAAP double-entry): a unified,
-- chronological, per-party transaction history — a genuine "Customer
-- Ledger" / "Vendor Ledger" / "Employee Ledger" exactly the way Tally
-- users mean those specific reports, each row traceable back to its one
-- real source record.
--
-- Sign convention (per party, not a global trial balance):
--   Customer ledger:  Invoice = debit (increases what the customer owes
--                      us), Payment received = credit (reduces it).
--   Vendor ledger:     Payable = credit (increases what we owe them),
--                      Payable Payment = debit (reduces it).
--   Employee ledger:   Advance issued = debit (they owe us), Salary
--                       Payment = credit (we paid them; existing
--                       final_paid_amount already nets out deducted
--                       advances — see salary_payments.deducted_advance).
--   Company expense:   Petty Expense / Expense Float issued = debit only
--                       (a plain outflow; no offsetting party ledger
--                       exists in the current schema for "who received
--                       it" beyond the optional vendor already on the
--                       row, handled by folding it into the vendor
--                       ledger instead when vendor_id is present).
--
-- Traceability: every row carries source_table + source_id (the real
-- primary key of the actual invoice/payment/payable/etc. row) so the UI
-- can open the exact underlying record, and voucher_number is always a
-- real, already-existing identifier (inv_no, float_no, or a synthesized
-- "PAY-<short id>"/"SAL-<month>" label only for the few source tables
-- that were never given their own document-number column).

create or replace view public.financial_ledger as

-- Invoices — a customer owes us the invoice total from this date.
select
  i.id::text as entry_id,
  i.organization_id,
  coalesce(i.invoice_date::timestamptz, i.created_at) as entry_date,
  'Invoice'::text as voucher_type,
  i.inv_no as voucher_number,
  'invoices'::text as source_table,
  i.id as source_id,
  'Customer'::text as account_type,
  i.customer_id as account_id,
  c.name as account_name,
  i.project_id,
  i.total_amount as debit,
  0::numeric as credit,
  ('Invoice ' || i.inv_no || ' raised to ' || coalesce(c.name, 'customer')) as narration
from public.invoices i
left join public.customers c on c.id = i.customer_id

union all

-- Payments received against an invoice — reduces what that customer owes.
select
  p.id::text as entry_id,
  p.organization_id,
  coalesce(p.payment_date::timestamptz, p.created_at) as entry_date,
  'Payment'::text as voucher_type,
  ('PAY-' || substr(p.id::text, 1, 8)) as voucher_number,
  'payments'::text as source_table,
  p.id as source_id,
  'Customer'::text as account_type,
  i.customer_id as account_id,
  c.name as account_name,
  i.project_id,
  0::numeric as debit,
  p.amount as credit,
  ('Payment received' ||
    case when i.inv_no is not null then ' against invoice ' || i.inv_no else '' end ||
    case when p.mode is not null then ' via ' || p.mode else '' end) as narration
from public.payments p
left join public.invoices i on i.id = p.invoice_id
left join public.customers c on c.id = i.customer_id

union all

-- Payables — a bill from a vendor increases what we owe them.
select
  pa.id::text as entry_id,
  pa.organization_id,
  pa.created_at as entry_date,
  'Payable'::text as voucher_type,
  ('PBL-' || substr(pa.id::text, 1, 8)) as voucher_number,
  'payables'::text as source_table,
  pa.id as source_id,
  'Vendor'::text as account_type,
  pa.vendor_id as account_id,
  coalesce(v.name, pa.vendor_name) as account_name,
  pa.project_id,
  0::numeric as debit,
  pa.total_amount as credit,
  ('Payable recorded for ' || coalesce(v.name, pa.vendor_name) ||
    case when pa.payment_type is not null then ' (' || pa.payment_type || ')' else '' end) as narration
from public.payables pa
left join public.vendors v on v.id = pa.vendor_id

union all

-- Payable Payments — reduces what we owe that vendor.
select
  pp.id::text as entry_id,
  pp.organization_id,
  coalesce(pp.payment_date::timestamptz, pp.created_at) as entry_date,
  'PayablePayment'::text as voucher_type,
  ('PBP-' || substr(pp.id::text, 1, 8)) as voucher_number,
  'payable_payments'::text as source_table,
  pp.id as source_id,
  'Vendor'::text as account_type,
  pa.vendor_id as account_id,
  coalesce(v.name, pa.vendor_name) as account_name,
  pa.project_id,
  pp.amount as debit,
  0::numeric as credit,
  ('Payment made to ' || coalesce(v.name, pa.vendor_name) ||
    case when pp.mode is not null then ' via ' || pp.mode else '' end) as narration
from public.payable_payments pp
join public.payables pa on pa.id = pp.payable_id
left join public.vendors v on v.id = pa.vendor_id

union all

-- Petty Expenses with a known vendor fold into that vendor's ledger as a
-- plain outflow; without a vendor they're a standalone company expense
-- entry (account_type 'Expense', no party to net against in this schema).
select
  pe.id::text as entry_id,
  pe.organization_id,
  pe.date::timestamptz as entry_date,
  'PettyExpense'::text as voucher_type,
  coalesce(pe.bill_number, 'EXP-' || substr(pe.id::text, 1, 8)) as voucher_number,
  'petty_expenses'::text as source_table,
  pe.id as source_id,
  case when pe.vendor_id is not null then 'Vendor' else 'Expense' end as account_type,
  pe.vendor_id as account_id,
  coalesce(v.name, pe.vendor, pe.expense_type) as account_name,
  pe.project_id,
  pe.amount as debit,
  0::numeric as credit,
  coalesce(pe.item_name, pe.expense_type, 'Petty expense') as narration
from public.petty_expenses pe
left join public.vendors v on v.id = pe.vendor_id

union all

-- Expense Floats issued to an employee — a company outflow at issue time
-- (settlement/return is already netted into balance_amount on the same
-- row, not modeled as a separate ledger entry here to avoid double-
-- counting the same float).
select
  ef.id::text as entry_id,
  ef.organization_id,
  ef.issued_date::timestamptz as entry_date,
  'ExpenseFloat'::text as voucher_type,
  ef.float_no as voucher_number,
  'expense_floats'::text as source_table,
  ef.id as source_id,
  'Employee'::text as account_type,
  ef.employee_id as account_id,
  e.name as account_name,
  ef.project_id,
  ef.issued_amount as debit,
  0::numeric as credit,
  ('Expense float issued to ' || coalesce(e.name, 'employee') ||
    case when ef.purpose is not null then ' for ' || ef.purpose else '' end) as narration
from public.expense_floats ef
left join public.employees e on e.id = ef.employee_id

union all

-- Advances — an employee owes this back (debit on their ledger).
select
  ar.id::text as entry_id,
  ar.organization_id,
  ar.date::timestamptz as entry_date,
  'Advance'::text as voucher_type,
  ('ADV-' || substr(ar.id::text, 1, 8)) as voucher_number,
  'advance_records'::text as source_table,
  ar.id as source_id,
  'Employee'::text as account_type,
  ar.employee_id as account_id,
  e.name as account_name,
  null::uuid as project_id,
  ar.amount as debit,
  0::numeric as credit,
  ('Advance issued to ' || coalesce(e.name, 'employee') ||
    case when ar.reason is not null then ' — ' || ar.reason else '' end) as narration
from public.advance_records ar
left join public.employees e on e.id = ar.employee_id

union all

-- Salary Payments — settles against the employee (credit; the stored
-- final_paid_amount already nets out any deducted advance, so this is
-- the one true cash-out figure for that month, not double-counted
-- against the Advance entries above).
select
  sp.id::text as entry_id,
  sp.organization_id,
  coalesce(sp.payment_date::timestamptz, sp.updated_at) as entry_date,
  'SalaryPayment'::text as voucher_type,
  ('SAL-' || sp.month) as voucher_number,
  'salary_payments'::text as source_table,
  sp.id as source_id,
  'Employee'::text as account_type,
  sp.employee_id as account_id,
  e.name as account_name,
  null::uuid as project_id,
  0::numeric as debit,
  coalesce(sp.final_paid_amount, sp.amount) as credit,
  ('Salary paid to ' || coalesce(e.name, 'employee') || ' for ' || sp.month) as narration
from public.salary_payments sp
left join public.employees e on e.id = sp.employee_id;

comment on view public.financial_ledger is
  'Read-only unified transaction ledger (Master ERP Architecture, Part 4) — a live UNION ALL over invoices/payments/payables/payable_payments/petty_expenses/expense_floats/advance_records/salary_payments. Not a new table: nothing is stored here, nothing can drift from its 8 source tables. Party-ledger sign convention (Customer/Vendor/Employee), not a self-balancing double-entry general ledger — see this migration''s own header for the full reasoning. entry_id/source_table/source_id trace every row back to its exact real record. security_invoker=true is REQUIRED for RLS to apply correctly (see below) — do not recreate this view without it.';

-- ── security_invoker fix (explicitly required, verified on the live DB) ──
--
-- This view is owned by the role that created it, which on the linked
-- Supabase project is "postgres" — and postgres has BYPASSRLS. By
-- PostgreSQL's default (pre-PG15) view semantics, a plain view checks its
-- underlying tables' row security using the VIEW OWNER's role, not the
-- querying client's — meaning without this setting, every query through
-- this view would have silently run with RLS effectively bypassed for
-- ALL callers, regardless of who was actually asking. This is exactly
-- the "do not assume it automatically inherits RLS" risk flagged before
-- applying, and it was real, not hypothetical.
--
-- security_invoker (PostgreSQL 15+; this project runs 17) makes the view
-- check the underlying tables using the CALLING user's own privileges
-- and row security instead of the owner's. Verified directly against the
-- live database after setting this:
--   SET ROLE authenticated; JWT sub = testadmin13's real profile id
--     -> returned exactly the 1 real invoice row testadmin13's own
--        organization actually has (not 0, not bypassed-to-everything).
--   SET ROLE anon (no JWT at all)
--     -> returned 0 rows, proving RLS genuinely blocks unauthenticated
--        access through the view, not just through the base tables.
-- Both are real queries run against live data, not inferred from
-- documentation alone.
alter view public.financial_ledger set (security_invoker = true);
