-- ============================================================================
-- Phase 9: Invoices
-- ============================================================================
-- Version:     20260806_009_phase9_invoices
-- Scope:       Extends three pre-existing (not Phase 1-8-created) tables -
--              invoices, invoice_items, payments - selected by dependency
--              count (Phase 9 Discovery: invoices is the only remaining
--              pre-existing table with any live dependents - invoice_items
--              and payments both reference it; every other remaining table
--              has zero).
--
-- Dependencies on frozen phases:
--   - Phase 1: organization_id + RLS baseline on all three tables, reused
--     unmodified. Also the original 3 stock/finance triggers this file
--     modifies (see section 2 below) and prevent_overpayment(), which is
--     NOT modified.
--   - Phase 2: set_updated_at_timestamp() trigger function, reused
--     unmodified for two new updated_at triggers.
--   - Phase 5: projects.customer_id (NOT NULL since Phase 5) - used to
--     backfill the new invoices.customer_id column.
--
-- What this migration does:
--   1. Corrects two frozen Phase 1 trigger functions - update_invoice_total()
--      and update_invoice_status() - to fix two confirmed, evidence-backed
--      defects (see section 2). Explicitly approved by the user, subject to
--      the constraint that only the minimum logic required to reproduce the
--      frontend's existing behavior is changed - not a redesign.
--   2. invoices: adds customer_id (backfilled from projects.customer_id,
--      then NOT NULL), inv_no, dc_id (FK to delivery_challans, left at the
--      Postgres default ON DELETE - no evidence gathered about that table's
--      delete behavior), subtotal, cgst_rate/sgst_rate/igst_rate,
--      cgst_amt/sgst_amt/igst_amt, invoice_date, due_date, payment_terms,
--      paid_amount, buyer_gstin/buyer_address/buyer_state_name/
--      buyer_state_code, reminder_enabled/reminder_interval_days/
--      reminder_frequency_days/next_reminder_at/last_reminder_sent_at/
--      reminder_count/next_reminder_custom_date/selected_email,
--      invoice_type, po_number/po_date/delivery_vehicle_no/
--      delivery_destination, updated_at (+ trigger).
--   3. invoice_items: adds hsn, created_at (this table had none), updated_at
--      (+ trigger).
--   4. payments: adds mode, reference_no, notes, files. No updated_at -
--      confirmed no update/delete action exists for payments in the
--      frontend (add-only), so none is added.
--   5. Corrects payments.invoice_id from ON DELETE NO ACTION to
--      ON DELETE CASCADE - deleteInvoice() has zero dependency guard, and
--      CASCADE matches invoice_items' own already-correct behavior for the
--      identical invoice-child relationship (a payment orphaned from its
--      invoice is not meaningful data, unlike the vendor/inventory-item
--      cases which have a confirmed "retain the name, lose the link"
--      frontend promise).
--
-- Explicitly out of scope / deliberately unchanged:
--   - invoices.project_id and the new invoices.customer_id: left at the
--     default ON DELETE NO ACTION. deleteProject() and deleteCustomer()
--     (Phase 5, confirmed) already block deletion whenever a linked invoice
--     exists, so this path is confirmed unreachable through the app, not
--     contradicted by it.
--   - invoices.dc_id: left at the default ON DELETE NO ACTION.
--     delivery_challans has not been investigated in this phase; no
--     evidence-backed correction is possible yet.
--   - prevent_overpayment(): reviewed, confirmed still correct and matches
--     a real (if redundant) client-side check in Payments.tsx. Not modified.
--   - bankDetails, termsAndConditions (on Invoice): confirmed zero usage
--     anywhere in Invoices.tsx. Left frontend-only, no column added.
--   - invoiceNumber: confirmed a UI-form-only duplicate of invNo, not a
--     separate persisted concept. Only inv_no is added.
--   - RLS, permissions, indexes: confirmed already correct and already
--     covering every new column (RLS gates rows, not columns).
--
-- Rollback considerations (see phase9_rollback.md once archived):
--   Same ALTER-based shape as Phase 5-8 - reverses only this file's own
--   additions, never DROP TABLE. Reverting the two trigger-function fixes
--   would knowingly restore the two confirmed defects (naive non-GST
--   totals, and status strings that do not match the frontend's enum) -
--   a disclosed regression, not a neutral reversal. Reverting
--   payments.invoice_id to NO ACTION would restore the same class of
--   defect already disclosed for Phase 7/8's FK corrections.
--
-- Every DDL statement below is idempotent: safe to re-run this file
-- against a database that already has it applied.
-- ============================================================================

begin;

-- ============================================================================
-- 1. invoices - new columns
-- ============================================================================

alter table public.invoices add column if not exists customer_id uuid;
alter table public.invoices add column if not exists inv_no text;
alter table public.invoices add column if not exists dc_id uuid;
alter table public.invoices add column if not exists subtotal numeric;
alter table public.invoices add column if not exists cgst_rate numeric default 9;
alter table public.invoices add column if not exists sgst_rate numeric default 9;
alter table public.invoices add column if not exists igst_rate numeric default 0;
alter table public.invoices add column if not exists cgst_amt numeric;
alter table public.invoices add column if not exists sgst_amt numeric;
alter table public.invoices add column if not exists igst_amt numeric;
alter table public.invoices add column if not exists invoice_date date;
alter table public.invoices add column if not exists due_date date;
alter table public.invoices add column if not exists payment_terms text default '30 days';
alter table public.invoices add column if not exists paid_amount numeric default 0;
alter table public.invoices add column if not exists buyer_gstin text;
alter table public.invoices add column if not exists buyer_address text;
alter table public.invoices add column if not exists buyer_state_name text;
alter table public.invoices add column if not exists buyer_state_code text;
alter table public.invoices add column if not exists reminder_enabled boolean default true;
alter table public.invoices add column if not exists reminder_interval_days numeric default 5;
alter table public.invoices add column if not exists reminder_frequency_days numeric default 5;
alter table public.invoices add column if not exists next_reminder_at text;
alter table public.invoices add column if not exists last_reminder_sent_at text;
alter table public.invoices add column if not exists reminder_count numeric default 0;
alter table public.invoices add column if not exists next_reminder_custom_date text;
alter table public.invoices add column if not exists selected_email text;
alter table public.invoices add column if not exists invoice_type text default 'tax';
alter table public.invoices add column if not exists po_number text;
alter table public.invoices add column if not exists po_date date;
alter table public.invoices add column if not exists delivery_vehicle_no text;
alter table public.invoices add column if not exists delivery_destination text;
alter table public.invoices add column if not exists updated_at timestamptz not null default now();

-- ============================================================================
-- 2. invoices.customer_id - backfill then NOT NULL
-- ============================================================================
-- Confirmed a required field in the frontend (Invoices.tsx's create-form
-- validation). Backfilled from the linked project's own customer_id, which
-- has been NOT NULL since Phase 5 - a real, evidence-backed source, not an
-- invented value. Only touches rows where customer_id is still null, so
-- this is safe to re-run.

update public.invoices i
set customer_id = p.customer_id
from public.projects p
where i.project_id = p.id
  and i.customer_id is null;

alter table public.invoices alter column customer_id set not null;

-- ============================================================================
-- 3. Reuse Phase 2's set_updated_at_timestamp() for invoices
-- ============================================================================

drop trigger if exists trg_invoices_updated_at on public.invoices;

create trigger trg_invoices_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at_timestamp();

-- ============================================================================
-- 4. invoice_items - new columns
-- ============================================================================
-- This table had no created_at at all - added for consistency with every
-- other table in this project, purely additive, safe default.

alter table public.invoice_items add column if not exists hsn text;
alter table public.invoice_items add column if not exists created_at timestamptz not null default now();
alter table public.invoice_items add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_invoice_items_updated_at on public.invoice_items;

create trigger trg_invoice_items_updated_at
  before update on public.invoice_items
  for each row execute function public.set_updated_at_timestamp();

-- ============================================================================
-- 5. payments - new columns
-- ============================================================================
-- No updated_at / trigger: confirmed no update or delete action exists for
-- payments anywhere in the frontend (store.ts has only addPayment) - adding
-- one would be inventing behavior the app does not have.

alter table public.payments add column if not exists mode text;
alter table public.payments add column if not exists reference_no text;
alter table public.payments add column if not exists notes text;
alter table public.payments add column if not exists files jsonb default '[]'::jsonb;

-- ============================================================================
-- 6. Correct payments.invoice_id: NO ACTION -> CASCADE
-- ============================================================================
-- deleteInvoice() (store.ts) has zero dependency guard - it unconditionally
-- removes the invoice from local state. invoice_items already correctly
-- CASCADEs for the identical parent-child relationship; payments follows
-- the same precedent rather than SET NULL, since a payment record with no
-- invoice reference is not meaningful data and no frontend copy promises
-- an orphan-and-retain behavior for payments the way Vendors.tsx does for
-- vendors.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.payments'::regclass
      and conname = 'payments_invoice_id_fkey'
      and confdeltype <> 'c'
  ) then
    alter table public.payments
      drop constraint payments_invoice_id_fkey;

    alter table public.payments
      add constraint payments_invoice_id_fkey
      foreign key (invoice_id) references public.invoices(id) on delete cascade;
  end if;
end $$;

-- ============================================================================
-- 7. Correct update_invoice_total() - frozen Phase 1 function
-- ============================================================================
-- Confirmed defect: the original body computed total_amount as a naive
-- SUM(quantity * price) with no GST term at all, while Invoices.tsx always
-- computes totalAmount = subtotal + cgstAmt + sgstAmt + igstAmt, with GST
-- on by default (cgstRate/sgstRate default to 9/9). Corrected to reproduce
-- that exact formula, including per-component rounding
-- (Invoices.tsx:270-273's Math.round per tax component, not a single
-- combined rounding - Postgres round(numeric) with no second argument
-- ties away from zero, matching Math.round for the non-negative amounts
-- here). Only the computation changes: same function name, same
-- SECURITY DEFINER, same search_path, same single-purpose shape (one
-- UPDATE on invoices.total_amount, keyed on NEW.invoice_id). Depends on
-- the new cgst_rate/sgst_rate/igst_rate columns added in section 1 above -
-- coalesced to 0 so a null rate (never expected in practice, since the
-- frontend always sends a value) cannot break the calculation.

create or replace function public.update_invoice_total()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_subtotal numeric;
  v_cgst_rate numeric;
  v_sgst_rate numeric;
  v_igst_rate numeric;
  v_cgst_amt numeric;
  v_sgst_amt numeric;
  v_igst_amt numeric;
begin
  select coalesce(sum(quantity * price), 0) into v_subtotal
  from invoice_items
  where invoice_id = new.invoice_id;

  select coalesce(cgst_rate, 0), coalesce(sgst_rate, 0), coalesce(igst_rate, 0)
    into v_cgst_rate, v_sgst_rate, v_igst_rate
  from invoices
  where id = new.invoice_id;

  v_cgst_amt := round(v_subtotal * v_cgst_rate / 100);
  v_sgst_amt := round(v_subtotal * v_sgst_rate / 100);
  v_igst_amt := round(v_subtotal * v_igst_rate / 100);

  update invoices
  set total_amount = v_subtotal + v_cgst_amt + v_sgst_amt + v_igst_amt
  where id = new.invoice_id;

  return new;
end;
$function$;

-- ============================================================================
-- 8. Correct update_invoice_status() - frozen Phase 1 function
-- ============================================================================
-- Confirmed defect: the original body wrote 'Pending'/'Partially Paid'/
-- 'Paid' - strings that do not match the frontend's InvoiceStatus type
-- ("Unpaid" | "PartiallyPaid" | "Paid", no space). This is not a
-- hypothetical mismatch: the one existing production invoices row already
-- has status = 'Partially Paid', a value that fails every exact-match
-- comparison the frontend performs against it (Payments.tsx's payment-
-- eligibility filter, Dashboard.tsx's Unpaid widget, CustomerHistory.tsx's
-- Paid filter). Only the three string literals change - variable names,
-- structure, SECURITY DEFINER, and search_path are otherwise identical.

create or replace function public.update_invoice_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare paid numeric;
declare total numeric;
begin
  select coalesce(sum(amount),0) into paid
  from payments where invoice_id = new.invoice_id;

  select total_amount into total
  from invoices where id = new.invoice_id;

  update invoices
  set status =
    case
      when paid = 0 then 'Unpaid'
      when paid < total then 'PartiallyPaid'
      else 'Paid'
    end
  where id = new.invoice_id;

  return new;
end;
$function$;

-- ============================================================================
-- 9. Backfill the one existing production row's already-corrupted status
-- ============================================================================
-- The live row has status = 'Partially Paid' (the old, wrong format),
-- written before this migration's trigger fix existed. This statement only
-- touches rows still holding that exact legacy value, so it is idempotent -
-- a second run finds nothing left to correct.

update public.invoices
set status = 'PartiallyPaid'
where status = 'Partially Paid';

-- ============================================================================
-- 10. Register this migration
-- ============================================================================

insert into public.schema_migrations (version, description, checksum)
values (
  '20260806_009_phase9_invoices',
  'Phase 9: Invoices - invoices/invoice_items/payments new columns, updated_at triggers, customer_id backfill+NOT NULL, payments.invoice_id ON DELETE CASCADE correction, and evidence-backed minimal fixes to frozen Phase 1 functions update_invoice_total() (add GST to the total calculation) and update_invoice_status() (correct status strings to match the frontend InvoiceStatus enum), plus a one-row backfill of the already-corrupted legacy status value',
  '374bd0c6219391cf0f65b4007e11ffa95f4acad97a98d4e8473e61648a76e63f'
)
on conflict (version) do nothing;

commit;
