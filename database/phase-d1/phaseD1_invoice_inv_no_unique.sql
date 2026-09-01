-- FabFlow ERP — Phase D.1: enforce uniqueness on invoices.inv_no.
--
-- Root cause (re-investigated fresh, not assumed): inv_no is a plain
-- nullable text column with no DB constraint at all — identical shape to
-- dc_no before Phase C.1. Both Invoices.tsx's previewInvNo() and the
-- Agent's createInvoice independently compute max(existing)+1 over
-- whatever `invoices` array is hydrated *locally*, with no server-side
-- backstop.
--
-- Scope: org-scoped uniqueness (organization_id, inv_no), matching
-- uq_delivery_challans_org_dcno (Phase C.1) and the dominant existing
-- pattern in this schema (expense_floats, company_pos, quotations all use
-- an (organization_id, <number>) unique index).
--
-- No NOT NULL: live data audit (Phase D.1 investigation) found exactly one
-- existing NULL inv_no (a legacy row, predates Phase D) and zero
-- duplicate (organization_id, inv_no) groups among the non-null rows — no
-- precedent constraint (company_pos, quotations, expense_floats,
-- delivery_challans) adds NOT NULL either, and this migration does not
-- either. The existing NULL row is valid and is left untouched.
--
-- No sequence, trigger, RPC, or document_counters change — document_counters
-- remains unused by the frontend (re-confirmed in the Phase D.1 audit);
-- this reuses the exact client-computed-candidate + DB-unique-constraint +
-- bounded-retry-in-the-API-layer pattern already proven for dc_no
-- (Phase C.1), projects, quotations, and company_pos — no new mechanism.
--
-- Precondition (verified separately, NOT part of this file, no data
-- modified): a fresh live-data query confirmed zero duplicate
-- (organization_id, inv_no) groups among non-null rows before this
-- migration was written. This ADD CONSTRAINT will fail with 23505 if a
-- duplicate exists at apply time — re-check before running if meaningful
-- time has passed since that verification.

begin;

alter table public.invoices
  add constraint uq_invoices_org_invno unique (organization_id, inv_no);

commit;
