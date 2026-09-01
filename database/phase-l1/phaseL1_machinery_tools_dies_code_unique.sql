-- FabFlow ERP — Phase L.1: enforce uniqueness on machines.machine_code,
-- tools.tool_code, and dies.die_code.
--
-- Root cause (re-investigated fresh, not assumed): all three columns are
-- plain nullable text with no DB constraint at all — the frontend's own
-- generators (store.ts's generateMachineCode/generateToolCode/
-- generateDieCode) are bare in-memory Zustand counters (counters.MCH/TL/
-- DIE) with no server round-trip, and createMachineRemote/createToolRemote/
-- createDieRemote (lib/machinesApi.ts, toolsApi.ts, diesApi.ts) each
-- perform a single unguarded insert with no retry — the exact same
-- pre-hardening shape dc_no had before Phase C.1 and inv_no had before
-- Phase D.1.
--
-- Scope: org-scoped uniqueness (organization_id, <code>), matching
-- uq_delivery_challans_org_dcno (Phase C.1), uq_invoices_org_invno
-- (Phase D.1), and the dominant existing pattern in this schema
-- (expense_floats, company_pos, quotations all use an
-- (organization_id, <number>) unique index).
--
-- No NOT NULL: matching every prior numbering-hardening migration in this
-- series, this only adds uniqueness, not a not-null requirement — no
-- existing row is NULL in any of the three columns, but adding NOT NULL
-- is out of scope for this prerequisite and not required for the retry
-- pattern to work correctly.
--
-- No sequence, trigger, or RPC change — this reuses the exact
-- client-computed-candidate + DB-unique-constraint + bounded-retry-in-
-- the-API-layer pattern already proven for dc_no, inv_no, qt_no,
-- cpo_number, and float_no — no new mechanism, applied to three more
-- tables.
--
-- Precondition (verified separately, immediately before writing this
-- file, not part of this migration, no data modified): a fresh live-data
-- query confirmed zero duplicate (organization_id, machine_code) groups,
-- zero duplicate (organization_id, tool_code) groups, and zero duplicate
-- (organization_id, die_code) groups, and zero NULLs in any of the three
-- columns. This ADD CONSTRAINT will fail with 23505 if a duplicate
-- exists at apply time — re-check before running if meaningful time has
-- passed since that verification.

begin;

alter table public.machines
  add constraint uq_machines_org_code unique (organization_id, machine_code);

alter table public.tools
  add constraint uq_tools_org_code unique (organization_id, tool_code);

alter table public.dies
  add constraint uq_dies_org_code unique (organization_id, die_code);

commit;
