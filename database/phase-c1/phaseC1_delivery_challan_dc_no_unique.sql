-- FabFlow ERP — Phase C.1: enforce uniqueness on delivery_challans.dc_no.
--
-- Root cause (investigated, not assumed): dc_no is a plain nullable text
-- column with no DB constraint at all. Both the human UI (previewDcNo() in
-- DeliveryChallans.tsx) and the Agent (computeNextDcNumber() in
-- deliveryChallansApi.ts) independently compute max(existing)+1 over
-- whatever `deliveryChallans` array is hydrated *locally* — two sessions
-- racing without seeing each other's writes can and did (reproduced live
-- during Phase C testing) insert the same number.
--
-- Scope: org-scoped uniqueness (organization_id, dc_no), matching the
-- dominant existing pattern in this schema — expense_floats, company_pos,
-- and quotations all use an (organization_id, <number>) unique index;
-- projects_project_number_key (global, no org scope) is the one outlier,
-- not the pattern to copy here.
--
-- No NOT NULL: 0 existing NULLs, and no precedent constraint (company_pos,
-- quotations, expense_floats) adds NOT NULL either — kept minimal and
-- additive, matching house convention exactly.
--
-- No sequence, trigger, RPC, or document_counters change: document_counters
-- exists (Phase 11) but has zero real consumers anywhere in the frontend
-- (grepped, confirmed) — introducing it here would add a second, unused-
-- until-now mechanism instead of reusing the pattern already proven live
-- in createProjectRemote/createQuotationRemote (client-computed candidate +
-- DB unique constraint + bounded retry-on-23505 in the API layer).
--
-- Precondition (performed separately, before this migration, NOT part of
-- this file): the one known live duplicate pair (two "DC-2026-001" rows,
-- self-inflicted during Phase C testing) was resolved by renumbering the
-- later-created row to "DC-2026-002" via the existing updateDeliveryChallanRemote
-- API — no record was deleted, no other field was touched, and a fresh
-- REST query confirmed zero duplicate dc_no groups remain. This ADD
-- CONSTRAINT will fail with 23505 if any duplicate (organization_id, dc_no)
-- pair still exists at apply time — re-check before running if more time
-- has passed since that fix.

begin;

alter table public.delivery_challans
  add constraint uq_delivery_challans_org_dcno unique (organization_id, dc_no);

commit;
