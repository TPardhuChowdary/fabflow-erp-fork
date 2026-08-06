# Phase 9 — Rollback Plan

Status: **Documented, not executed.** No rollback has been performed or is currently needed - Phase 9 verification passed every structural and behavioral check with zero FAILs (see [phase9_completion_report.md](./phase9_completion_report.md)). This document exists as the reference plan for the scenario where a genuine production-critical defect is discovered later, matching every prior phase's own precedent.

## 1. A new kind of rollback item - reverting function logic, not just a constraint

Every prior phase's rollback plan only ever needed to reverse a constraint's `ON DELETE` clause or drop an added column/trigger. This phase is the first to also need reverting a *function body* to its original logic. `CREATE OR REPLACE FUNCTION` with the original bodies (reproduced below, taken directly from the pre-execution baseline capture) is the correct reversal - not `DROP FUNCTION`, which would also require re-attaching every existing trigger that calls them (`trg_invoice_total` on `invoice_items`, `trg_payment_status` on `payments`).

## 2. Reverting the two function fixes is a disclosed regression, not a neutral reversal

Reverting `update_invoice_total()` and `update_invoice_status()` to their original bodies would knowingly restore both confirmed defects: totals computed without GST, and status strings that do not match the frontend's enum - including re-corrupting the one production row's `status` back to a value the frontend cannot correctly interpret. Any future rollback decision must weigh this explicitly.

## 3. Current blast radius if rolled back

Same as Phase 1-8: the frontend is not wired to Supabase yet, so rolling back Phase 9 has zero user-facing impact today - except that the one corrected production row would revert to its confirmed-broken `status` value.

## 4. Ordering constraints

Reverse of execution order:

```
payments.invoice_id FK -> restore to ON DELETE NO ACTION
        |
update_invoice_status() -> restore original body (see section 5)
        |
update_invoice_total() -> restore original body (see section 5)
        |
payments new columns (files, notes, reference_no, mode)
        |
trigger (trg_invoice_items_updated_at)
        |
invoice_items new columns (updated_at, created_at, hsn)
        |
trigger (trg_invoices_updated_at)
        |
invoices.customer_id -> restore to nullable
        |
invoices new columns (all 30 added in section 1 of the migration)
```

No data to consider reverting beyond the two backfills: the `customer_id` backfill (safe to leave - dropping the column removes the data with it) and the `status` backfill (see section 2 - reverting the function would re-corrupt this on the next payment event, and the row's current corrected value would need to be manually reverted too if a full rollback to old behavior is genuinely intended).

## 5. Rollback SQL (reference - verify against the live schema before running)

```sql
begin;

-- 1. Restore payments.invoice_id to its pre-Phase-9 original behavior.
--    WARNING: this knowingly restores a confirmed defect - see section 2.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.payments'::regclass
      and conname = 'payments_invoice_id_fkey'
      and confdeltype = 'c'
  ) then
    alter table public.payments drop constraint payments_invoice_id_fkey;
    alter table public.payments
      add constraint payments_invoice_id_fkey
      foreign key (invoice_id) references public.invoices(id);
  end if;
end $$;

-- 2. Restore the two frozen Phase 1 functions to their original bodies.
--    WARNING: this knowingly restores both confirmed defects - see section 2.
create or replace function public.update_invoice_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE paid NUMERIC;
DECLARE total NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount),0) INTO paid
  FROM payments WHERE invoice_id = NEW.invoice_id;

  SELECT total_amount INTO total
  FROM invoices WHERE id = NEW.invoice_id;

  UPDATE invoices
  SET status =
    CASE
      WHEN paid = 0 THEN 'Pending'
      WHEN paid < total THEN 'Partially Paid'
      ELSE 'Paid'
    END
  WHERE id = NEW.invoice_id;

  RETURN NEW;
END;
$function$;

create or replace function public.update_invoice_total()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  UPDATE invoices
  SET total_amount = (
    SELECT COALESCE(SUM(quantity * price),0)
    FROM invoice_items
    WHERE invoice_id = NEW.invoice_id
  )
  WHERE id = NEW.invoice_id;
  RETURN NEW;
END;
$function$;

-- 3. Triggers
drop trigger if exists trg_invoice_items_updated_at on public.invoice_items;
drop trigger if exists trg_invoices_updated_at on public.invoices;

-- 4. Columns added this phase
alter table public.payments drop column if exists files;
alter table public.payments drop column if exists notes;
alter table public.payments drop column if exists reference_no;
alter table public.payments drop column if exists mode;

alter table public.invoice_items drop column if exists updated_at;
alter table public.invoice_items drop column if exists created_at;
alter table public.invoice_items drop column if exists hsn;

alter table public.invoices alter column customer_id drop not null;

alter table public.invoices drop column if exists updated_at;
alter table public.invoices drop column if exists delivery_destination;
alter table public.invoices drop column if exists delivery_vehicle_no;
alter table public.invoices drop column if exists po_date;
alter table public.invoices drop column if exists po_number;
alter table public.invoices drop column if exists invoice_type;
alter table public.invoices drop column if exists selected_email;
alter table public.invoices drop column if exists next_reminder_custom_date;
alter table public.invoices drop column if exists reminder_count;
alter table public.invoices drop column if exists last_reminder_sent_at;
alter table public.invoices drop column if exists next_reminder_at;
alter table public.invoices drop column if exists reminder_frequency_days;
alter table public.invoices drop column if exists reminder_interval_days;
alter table public.invoices drop column if exists reminder_enabled;
alter table public.invoices drop column if exists buyer_state_code;
alter table public.invoices drop column if exists buyer_state_name;
alter table public.invoices drop column if exists buyer_address;
alter table public.invoices drop column if exists buyer_gstin;
alter table public.invoices drop column if exists paid_amount;
alter table public.invoices drop column if exists payment_terms;
alter table public.invoices drop column if exists due_date;
alter table public.invoices drop column if exists invoice_date;
alter table public.invoices drop column if exists igst_amt;
alter table public.invoices drop column if exists sgst_amt;
alter table public.invoices drop column if exists cgst_amt;
alter table public.invoices drop column if exists igst_rate;
alter table public.invoices drop column if exists sgst_rate;
alter table public.invoices drop column if exists cgst_rate;
alter table public.invoices drop column if exists subtotal;
alter table public.invoices drop column if exists dc_id;
alter table public.invoices drop column if exists inv_no;
alter table public.invoices drop column if exists customer_id;

-- 5. Remove the migration's own registration
delete from schema_migrations where version = '20260806_009_phase9_invoices';

commit;
```

**Note on shared infrastructure:** this rollback does not touch `set_updated_at_timestamp()`, `has_permission()`, `current_organization_id()`, or `prevent_overpayment()` - all reused or left unmodified by Phase 9, remain correctly owned by their own phase's rollback plan.

## 6. What this rollback does not undo

Any real invoice data entered into the new columns would be lost by dropping them. Any real invoice/payment/invoice_items deletions that succeeded because of the `CASCADE` correction cannot be un-happened. The one production row's `status` correction, if the function revert causes it to drift back to the old format on a future payment event, is a data-quality regression a full rollback knowingly accepts.

## 7. Recommended alternative to a full rollback

Same as every prior phase, with extra weight here: a full rollback re-introduces two confirmed, evidence-backed defects (including one that already corrupted real data once) rather than fixing a new problem. Any real production issue traced to Phase 9 should be diagnosed for a narrow, targeted forward-fix first.
