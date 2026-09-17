-- Job Card planning fields (see chat) — NOT YET APPLIED, written for review
-- only. Seven additive, nullable-or-defaulted columns on job_cards, all
-- independent of each other and of every existing job_cards column/
-- trigger. Reuses established conventions throughout rather than
-- inventing new ones:
--
-- total_quantity: the Job Card's own overall required output — a
-- DIFFERENT concept from expected_quantity (the GENERATED column,
-- untouched here, still floor(allocated_time_minutes /
-- standard_time_per_unit_minutes) — the achievable output within the
-- allocated time window, not the total order size). Nullable, no
-- default, no backfill: every existing Job Card simply has no Total
-- Quantity recorded, exactly as before this column existed.
--
-- expected_quantity_override: the manual planning override for
-- expected_quantity. Deliberately a NEW, separate, plain (non-generated)
-- column — expected_quantity itself is `generated always as (...)
-- stored` (database/phase-49/phase49_job_cards.sql) and therefore
-- structurally cannot accept a client-written value; there is no way to
-- "unlock" a GENERATED column. NULL means "use the automatic
-- calculation" (today's behavior, unchanged); a non-null value is the
-- user's deliberate override and is never touched by this migration or
-- any trigger — only the application decides when to read/write it.
--
-- inspection_plan: freeform, Job-Card-scoped, purely descriptive
-- checklist — same jsonb-array-of-plain-objects convention already
-- established by project_qms_inspections.quantity_checkpoints
-- (20260913120000_qms_quantity_based_inspection.sql). Each element:
-- {label, triggerQty, cumulativeQty, sampleQty}. Deliberately NOT built
-- on project_qms_inspections/inspection_frequency_qty — that table is
-- the QMS stage-gate system itself (keyed to project_id +
-- library_inspection_id + required_production_stage_id, feeding
-- getStageInspectionGate()'s Pass/Fail gate), a different, heavier,
-- production-stage-scoped concept. This column has zero interaction
-- with QMS gate logic, zero pass/fail semantics — it is printed, not
-- gated. not null default '[]'::jsonb so an unconfigured plan is simply
-- an empty array (the application already treats "no rows" as "no
-- section printed", not an error).
--
-- work_center_machine_id / work_center_name: reuses the existing
-- `machines` master (database/phase-35/phase35_machines_table.sql) —
-- no duplicate Work Center table. Same real-FK-plus-display-snapshot
-- pattern already used throughout this schema (job_cards.employee_id +
-- employee_name, machines.purchase_vendor_id + purchase_vendor_name,
-- machines.amc_vendor_id + amc_vendor_name): the snapshot survives the
-- machine later being deleted/decommissioned, so a historical Job
-- Card's printed Work Center never goes blank. ON DELETE SET NULL
-- matches every existing optional FK into machines.id (dies.
-- compatible_machine_id, machine_service_revenue.machine_id).
--
-- priority: genuinely new — grepped every migration touching job_cards
-- and every other table for a Low/Normal/High-style priority enum;
-- the only existing `priority` column anywhere (tender_requirements.
-- priority) is an unrelated integer sort order, not reusable. Follows
-- the same `text not null default '...' check (... in (...))` shape
-- already used for job_cards.status and machines.current_status.
--
-- start_date: the planned/scheduled Job Card date, distinct from
-- job_cards.start_time (the real, server-authoritative timer column set
-- only by Start/Resume — completely untouched by this migration).
-- Mirrors the exact precedent already set by projects.planned_start_date
-- (database/phase-52/phase52_project_lifecycle_dates.sql): a plain
-- nullable `date` column, set only by explicit user action, no trigger,
-- no backfill.
--
-- No change to any existing column, trigger, function, or RLS policy.
-- Existing job_cards RLS (job_cards_select/insert/update/delete, all
-- scoped on has_permission('job_cards', ...) + organization_id) already
-- covers these seven new columns at the row level — no new policy
-- needed. Does not reapply 20260916180000_job_card_print_reference.sql.

alter table public.job_cards
  add column if not exists total_quantity integer
    check (total_quantity is null or total_quantity >= 0),
  add column if not exists expected_quantity_override integer
    check (expected_quantity_override is null or expected_quantity_override >= 0),
  add column if not exists inspection_plan jsonb not null default '[]'::jsonb,
  add column if not exists work_center_machine_id uuid
    references public.machines(id) on delete set null,
  add column if not exists work_center_name text,
  add column if not exists priority text not null default 'Normal'
    check (priority in ('Low', 'Normal', 'High', 'Urgent')),
  add column if not exists start_date date;

comment on column public.job_cards.total_quantity is
  'Overall required output for this Job Card — distinct from expected_quantity (the GENERATED, allocated-time-derived achievable output). Nullable, no backfill.';
comment on column public.job_cards.expected_quantity_override is
  'Manual planning override for expected_quantity. NULL = use the automatic calculation. Never written by any trigger — application-only.';
comment on column public.job_cards.inspection_plan is
  'Freeform, printed-only Job Card inspection checklist: [{label, triggerQty, cumulativeQty, sampleQty}]. Independent of project_qms_inspections and its stage-gate logic.';
comment on column public.job_cards.work_center_machine_id is
  'Optional FK to machines(id) — which machine/station this operation runs on. ON DELETE SET NULL, same as every other optional machine reference in this schema.';
comment on column public.job_cards.work_center_name is
  'Display snapshot of work_center_machine_id at the time it was set, so a later machine deletion never blanks a historical Job Card''s printed Work Center.';
comment on column public.job_cards.priority is
  'Low / Normal / High / Urgent. Defaults Normal for every existing and new Job Card.';
comment on column public.job_cards.start_date is
  'Planned/scheduled Job Card date. Distinct from start_time (the real, server-authoritative timer column) — never read or written by the timer triggers.';
