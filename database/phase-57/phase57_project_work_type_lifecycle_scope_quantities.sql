-- Phase 57 (Master Monster Prompt, Phases 3/4/5/7-10) — Project work
-- type, lifecycle stage, material ownership/scope, and quantity
-- breakdown (including overproduction).
--
-- v2 - revised per your architecture-review clarifications:
--   1. quantity's NOT NULL is now actually dropped (the audit found the
--      original draft added nullable breakdown columns but left the
--      existing `quantity` column itself NOT NULL, which would have
--      silently defeated "samples may have no quantity" at the database
--      layer no matter what the frontend allowed).
--   2. customer_supplied_goods_qty is replaced by the more general
--      received_quantity (covers both "customer sent 100 finished
--      chairs" and "customer sent 10kg of powder" - same concept, one
--      column, per your Ordered/Planned/Received/Produced/Accepted/
--      Rejected/Rework/Returned/Remaining/Overproduction list).
--   3. overproduction_quantity is added as a GENERATED STORED column -
--      the exact same pattern already used by job_cards.expected_quantity
--      and job_cards.actual_time_spent_minutes, so it can never be
--      independently edited or drift out of sync: it is always exactly
--      greatest(produced - ordered, 0), computed by Postgres itself.
--      This directly satisfies the hard requirement that produced
--      quantity is NEVER written into the ordered-quantity field -
--      ordered_quantity stays 100, produced_quantity stays 110,
--      overproduction_quantity is always the derived, correct 10.
--
-- Confirmed via live audit before writing this: projects.status is
-- currently NULL on every existing row (the "Active"/"Completed" badges
-- seen in the UI are computed client-side from other signals, not stored
-- here) and projects.project_type only ever holds 'REPEAT_ORDER' or null
-- (it's dedicated to the existing repeat-order feature). Neither column
-- is repurposed here - new, separately-named columns avoid colliding
-- with either existing, in-use concept.
--
-- work_type (Phase 3): what kind of engagement this project actually is.
-- Defaults to 'full_manufacturing' - today's only real case, so every
-- existing project keeps its current implicit meaning.
--
-- lifecycle_stage (Phase 5): only meaningful for sample/prototype-style
-- work moving toward production; left NULL for ordinary production
-- projects rather than forcing every project through a sample pipeline
-- it was never part of. Moving a project through this is an UPDATE on
-- the same row - never a new project record, so history/links/documents
-- stay attached.
--
-- material_ownership + received_quantity (Phases 6-9): who owns the
-- material/goods being worked on. 'company' is the default (today's
-- only case) so company-owned inventory accounting is completely
-- unaffected until a project is explicitly marked otherwise.
-- received_quantity is the customer's own item/material count entering
-- FabFlow for processing - deliberately NOT the same field as
-- inventory_items/inventory_usages, which stay scoped to company-owned
-- stock; this is what prevents customer-owned goods/material from ever
-- being counted as FabFlow-manufactured inventory.
--
-- Quantity breakdown (Phase 4/5): projects.quantity (existing) is left
-- semantically untouched - every existing screen that reads it keeps
-- working exactly as today - and now also accepts NULL, since a sample/
-- trial/prototype project may legitimately have no quantity yet. The
-- new columns are purely additive detail alongside it: a screen that
-- wants the granular breakdown can read them when populated and fall
-- back to `quantity` when they're not (all nullable except the
-- generated overproduction column, no default forces a value where the
-- concept doesn't apply - e.g. accepted/rejected only make sense once QC
-- has actually run).

begin;

alter table public.projects
  add column if not exists work_type text
    not null default 'full_manufacturing'
    check (work_type in (
      'full_manufacturing',
      'sample',
      'prototype',
      'trial',
      'production',
      'service',
      'partial_manufacturing',
      'subcontract',
      'other'
    ));

alter table public.projects
  add column if not exists lifecycle_stage text
    check (lifecycle_stage in (
      'sample',
      'production_ready',
      'production',
      'completed'
    ));

alter table public.projects
  add column if not exists material_ownership text
    not null default 'company'
    check (material_ownership in ('company', 'customer', 'mixed'));

-- ── Quantity breakdown, including overproduction ────────────────────────

alter table public.projects
  add column if not exists ordered_quantity numeric;
alter table public.projects
  add column if not exists planned_quantity numeric;
alter table public.projects
  add column if not exists received_quantity numeric;
alter table public.projects
  add column if not exists produced_quantity numeric;
alter table public.projects
  add column if not exists accepted_quantity numeric;
alter table public.projects
  add column if not exists rejected_quantity numeric;
alter table public.projects
  add column if not exists rework_quantity numeric;
alter table public.projects
  add column if not exists returned_quantity numeric;
-- Not generated: unlike overproduction, "remaining" has no single
-- universal formula across every work type (remaining-to-produce vs.
-- remaining-to-return-to-customer mean different things depending on
-- scope), so it stays a plain value the application sets per context.
alter table public.projects
  add column if not exists remaining_quantity numeric;

-- Always exactly max(produced - ordered, 0), computed by Postgres -
-- never independently writable, never drifts out of sync, and the
-- original ordered_quantity/produced_quantity are never overwritten to
-- "make room" for it.
alter table public.projects
  add column if not exists overproduction_quantity numeric
    generated always as (
      greatest(coalesce(produced_quantity, 0) - coalesce(ordered_quantity, 0), 0)
    ) stored;

-- Relax the existing quantity column so a sample/prototype/trial project
-- can legitimately have no quantity at all. Existing 13 real projects
-- all already have a real positive value here, so this changes nothing
-- about them - it only stops blocking a FUTURE insert that omits it.
alter table public.projects
  alter column quantity drop not null;

insert into public.schema_migrations (version, description, checksum)
values (
  '20260903_057_phase57_project_work_type_lifecycle_scope_quantities',
  'Master Monster Prompt Phases 3/4/5/7-10 (v2, revised per architecture review): adds projects.work_type (default full_manufacturing), lifecycle_stage (nullable, sample/production_ready/production/completed), material_ownership (default company) + received_quantity, and a granular ordered/planned/received/produced/accepted/rejected/rework/returned/remaining quantity breakdown alongside the existing quantity column, plus a GENERATED overproduction_quantity (always max(produced-ordered,0), never independently writable). Also drops NOT NULL on projects.quantity so sample/trial/prototype projects can legitimately have no quantity. All additive/nullable-or-safely-defaulted, zero existing rows change meaning, zero backfill, no RLS change (existing projects RLS already covers new columns on the same table).',
  'phase57-mmp-v2'
)
on conflict (version) do nothing;

commit;
