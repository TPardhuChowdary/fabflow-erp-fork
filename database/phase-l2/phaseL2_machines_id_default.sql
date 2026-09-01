-- FabFlow ERP — Phase L.2: fix machines.id missing DB default.
--
-- Root cause (confirmed by direct comparison of the original migration
-- files, and reproduced live): database/phase-35/phase35_machines_table.sql
-- defines "id uuid primary key" with NO default, unlike
-- database/phase-37/phase37_tools_table.sql and
-- database/phase-38/phase38_dies_and_compatibility.sql, which both use
-- "id uuid primary key default gen_random_uuid()". A genuine unmocked
-- insert into machines with no explicit id fails live with
-- 23502 "null value in column id violates not-null constraint" — the
-- exact error createMachineRemote() (lib/machinesApi.ts) and the real
-- "Add Machine" UI (pages/Machinery.tsx) both hit, since neither ever
-- supplies an id (Omit<Machine, "id">, matching every other create*Remote
-- function in this codebase). Every existing machine row was created via
-- upsertMachineRemote's one-time local->Supabase migration path instead,
-- which explicitly supplies its own pre-existing id — never through a
-- genuine fresh create.
--
-- Fix: add the same default every other table in this schema already
-- uses. Additive only — does not touch existing rows (they already have
-- real ids), does not change any column type, does not affect any FK.

begin;

alter table public.machines
  alter column id set default gen_random_uuid();

commit;
