-- Phase 52 (Group 2, Phase 10 of the roadmap) — Project Lifecycle Dates.
--
-- Projects currently only carry created_at (creation timestamp) and
-- po_date (customer PO date, unrelated to production). There is no way to
-- record when production actually starts vs. when it was merely planned,
-- when it is due, or when it actually finished. This migration adds five
-- nullable date columns so each is its own real business event, entered
-- explicitly by a user action — never auto-derived or auto-populated by
-- this migration or by any trigger.
--
-- planned_start_date            - when production is expected/scheduled to begin
-- actual_production_start_date  - when production genuinely began (separate
--                                  from quotation/design/planning — set only
--                                  when a real production-start action occurs)
-- target_completion_date        - internal target finish date
-- customer_committed_delivery_date - the date promised to the customer
--                                     (distinct from target_completion_date,
--                                     which is the internal working target)
-- actual_completion_date        - when the project genuinely finished
--
-- All five are plain `date` columns (calendar dates, matching how the rest
-- of the app already treats po_date/purchaseDate-style fields as
-- YYYY-MM-DD strings, not timestamps) and default to null. No backfill: a
-- project created before this migration simply has no lifecycle dates
-- until a user sets them.

begin;

alter table public.projects
  add column if not exists planned_start_date date,
  add column if not exists actual_production_start_date date,
  add column if not exists target_completion_date date,
  add column if not exists customer_committed_delivery_date date,
  add column if not exists actual_completion_date date;

insert into public.schema_migrations (version, description, checksum)
values (
  '20260902_052_phase52_project_lifecycle_dates',
  'Phase 52 (Group 2, roadmap Phase 10): adds five nullable date columns to projects - planned_start_date, actual_production_start_date, target_completion_date, customer_committed_delivery_date, actual_completion_date. No backfill, no triggers - each is set only by an explicit user action. Existing RLS on projects already covers these (column-level, not row-level, so no new policies needed).',
  'phase52-group2-v1'
)
on conflict (version) do nothing;

commit;
