-- FabFlow ERP — Phase 42: Quotation optional GST/IGST (master scope §29-31).
--
-- Today, quotations/quotation_revisions carry a single flat gst_rate/
-- gst_amount pair that the frontend always defaulted to 18% - there was
-- no way to issue a no-tax or IGST (inter-state) quotation. This
-- migration adds the same split cgst/sgst/igst rate+amount shape
-- invoices already use (see hydration.ts's INVOICE_COLUMNS), plus two
-- new booleans (apply_gst/apply_igst) so "no tax" is a real, selectable
-- state instead of an assumed default.
--
-- Additive and backward-compatible, same discipline as every prior
-- phase this session: gst_rate/gst_amount are NOT dropped (still
-- `not null` with no prior default) - only given a DEFAULT of 0 so the
-- application can stop populating them going forward without breaking
-- the existing NOT NULL constraint. No existing row's data is touched.
--
-- Mutual exclusivity (GST and IGST can never both be true on one
-- quotation - matches the master scope's explicit requirement) is
-- enforced with a real CHECK constraint, not just app-level validation.
--
-- Backfill (added after live testing surfaced the gap): every
-- pre-existing quotation was created under the OLD always-on-18%
-- behavior (gst_rate was never 0 before this feature existed), so
-- leaving their new apply_gst/cgst_rate/etc. at the just-added
-- defaults of false/0 would make "view an old quotation" incorrectly
-- report "no tax" despite its stored total_amount having 18% baked in
-- - violating "editing/viewing a quotation restores the original tax
-- configuration" for data that already existed. The UPDATEs below
-- split each pre-existing row's legacy flat gst_rate/gst_amount back
-- into the new cgst/sgst columns (GST, never IGST, since IGST did not
-- exist as a concept before this migration). Guarded to only touch
-- rows still at the just-added defaults with a genuine legacy rate, so
-- it is safe to re-run and never touches a quotation saved after this
-- feature ships (those already have real applyGST/applyIGST values).

begin;

alter table public.quotations
  add column if not exists apply_gst boolean not null default false,
  add column if not exists apply_igst boolean not null default false,
  add column if not exists cgst_rate numeric not null default 0,
  add column if not exists sgst_rate numeric not null default 0,
  add column if not exists igst_rate numeric not null default 0,
  add column if not exists cgst_amt numeric not null default 0,
  add column if not exists sgst_amt numeric not null default 0,
  add column if not exists igst_amt numeric not null default 0;

alter table public.quotations
  alter column gst_rate set default 0,
  alter column gst_amount set default 0;

drop trigger if exists trg_quotations_gst_igst_exclusive on public.quotations;
alter table public.quotations
  drop constraint if exists chk_quotations_gst_igst_exclusive;
alter table public.quotations
  add constraint chk_quotations_gst_igst_exclusive
  check (not (apply_gst and apply_igst));

alter table public.quotation_revisions
  add column if not exists apply_gst boolean not null default false,
  add column if not exists apply_igst boolean not null default false,
  add column if not exists cgst_rate numeric not null default 0,
  add column if not exists sgst_rate numeric not null default 0,
  add column if not exists igst_rate numeric not null default 0,
  add column if not exists cgst_amt numeric not null default 0,
  add column if not exists sgst_amt numeric not null default 0,
  add column if not exists igst_amt numeric not null default 0;

alter table public.quotation_revisions
  alter column gst_rate set default 0,
  alter column gst_amount set default 0;

alter table public.quotation_revisions
  drop constraint if exists chk_quotation_revisions_gst_igst_exclusive;
alter table public.quotation_revisions
  add constraint chk_quotation_revisions_gst_igst_exclusive
  check (not (apply_gst and apply_igst));

update public.quotations
set apply_gst = true,
    cgst_rate = gst_rate / 2,
    sgst_rate = gst_rate / 2,
    cgst_amt = gst_amount / 2,
    sgst_amt = gst_amount / 2
where gst_rate > 0
  and apply_gst = false
  and cgst_rate = 0
  and igst_rate = 0;

update public.quotation_revisions
set apply_gst = true,
    cgst_rate = gst_rate / 2,
    sgst_rate = gst_rate / 2,
    cgst_amt = gst_amount / 2,
    sgst_amt = gst_amount / 2
where gst_rate > 0
  and apply_gst = false
  and cgst_rate = 0
  and igst_rate = 0;

insert into public.schema_migrations (version, description, checksum)
values (
  '20260817_042_phase42_quotation_gst_igst',
  'Phase 42: quotations/quotation_revisions get apply_gst, apply_igst (mutually exclusive via CHECK constraint), cgst_rate/sgst_rate/igst_rate, cgst_amt/sgst_amt/igst_amt - same split shape invoices already use. Neither tax applies by default (both booleans default false, all new rate/amount columns default 0). Legacy gst_rate/gst_amount columns are kept (still NOT NULL, now DEFAULT 0) for backward compatibility but no longer populated by the application. Pre-existing rows are backfilled from their legacy flat gst_rate/gst_amount into cgst/sgst so historical quotations still show their original tax configuration.',
  'phase42-quotation-gst-igst-v2'
)
on conflict (version) do nothing;

commit;
