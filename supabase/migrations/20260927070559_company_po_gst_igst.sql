-- =====================================================================
-- DRAFT — NOT APPLIED. Written per explicit instruction ("write the
-- migration but STOP before applying and clearly show what it
-- changes"). Do not run against the live project without separate,
-- explicit approval.
-- =====================================================================
--
-- Company PO — optional GST/IGST (Task 2, mirrors Phase 42's
-- database/phase-42/phase42_quotation_gst_igst.sql for Quotation).
--
-- Today, company_pos carries only a flat gst_percent/gst_amount pair
-- (see hydration.ts's COMPANY_PO_COLUMNS) with no CGST/SGST split and no
-- IGST concept at all - there is no way to issue an inter-state Company
-- PO with the correct tax type. This migration adds the exact same
-- split cgst/sgst/igst rate+amount shape Quotation and Invoice already
-- use, plus two booleans (apply_gst/apply_igst) so "no tax" is a real,
-- selectable state - identical column names/types/defaults to Phase
-- 42's quotations migration, for consistency across all three document
-- types per Task 2's explicit "do not invent a second competing tax
-- system" instruction.
--
-- Additive and backward-compatible: gst_percent/gst_amount are NOT
-- dropped (still nullable/not-null as they are today) - the frontend
-- simply stops populating them going forward. No existing row's data is
-- touched by the ALTERs.
--
-- Mutual exclusivity (GST and IGST can never both be true on one PO) is
-- enforced with a real CHECK constraint, matching quotations/
-- quotation_revisions.
--
-- Backfill: every pre-existing Company PO was created under the old
-- flat-gst_percent-only behavior, so leaving their new apply_gst/
-- cgst_rate/etc. at the just-added defaults (false/0) would make
-- "view an old PO" incorrectly report "no tax" despite its stored
-- grand_total having that percentage baked in. The UPDATE below splits
-- each pre-existing row's legacy flat gst_percent/gst_amount back into
-- the new cgst/sgst columns (GST, never IGST, since IGST did not exist
-- as a concept on Company PO before this migration) - same guarded,
-- re-runnable shape as Phase 42's quotations backfill.

begin;

alter table public.company_pos
  add column if not exists apply_gst boolean not null default false,
  add column if not exists apply_igst boolean not null default false,
  add column if not exists cgst_rate numeric not null default 0,
  add column if not exists sgst_rate numeric not null default 0,
  add column if not exists igst_rate numeric not null default 0,
  add column if not exists cgst_amt numeric not null default 0,
  add column if not exists sgst_amt numeric not null default 0,
  add column if not exists igst_amt numeric not null default 0;

alter table public.company_pos
  alter column gst_amount set default 0;

alter table public.company_pos
  drop constraint if exists chk_company_pos_gst_igst_exclusive;
alter table public.company_pos
  add constraint chk_company_pos_gst_igst_exclusive
  check (not (apply_gst and apply_igst));

update public.company_pos
set apply_gst = true,
    cgst_rate = gst_percent / 2,
    sgst_rate = gst_percent / 2,
    cgst_amt = gst_amount / 2,
    sgst_amt = gst_amount / 2
where coalesce(gst_percent, 0) > 0
  and apply_gst = false
  and cgst_rate = 0
  and igst_rate = 0;

insert into public.schema_migrations (version, description, checksum)
values (
  '20260927_company_po_gst_igst',
  'Company PO gets apply_gst, apply_igst (mutually exclusive via CHECK constraint), cgst_rate/sgst_rate/igst_rate, cgst_amt/sgst_amt/igst_amt - same split shape Quotation (Phase 42) and Invoice already use. Neither tax applies by default. Legacy gst_percent/gst_amount columns are kept for backward compatibility but no longer populated by the application. Pre-existing rows are backfilled from their legacy flat gst_percent/gst_amount into cgst/sgst so historical POs still show their original tax configuration.',
  'company-po-gst-igst-v1'
)
on conflict (version) do nothing;

commit;
