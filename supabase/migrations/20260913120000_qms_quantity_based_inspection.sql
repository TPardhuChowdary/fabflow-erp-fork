-- =====================================================================
-- APPLIED (with explicit approval this session) — verified live: both
-- columns exist with the expected types/defaults/constraint, and the
-- pre-existing status/gate trigger (recompute_qms_inspection_status,
-- trg_project_qms_inspections_updated_at) is confirmed byte-for-byte
-- unchanged.
-- =====================================================================
--
-- Quantity-based production inspection (Part 3 of the Master ERP
-- Architecture implementation plan). Decision already made by the user:
-- inspection frequency is configured per production-stage inspection
-- requirement, i.e. on public.project_qms_inspections — not per Job
-- Card, and not a new table.
--
-- Existing architecture this preserves, unchanged:
--   - qms/lib/productionGate.ts's getStageInspectionGate() is the ONLY
--     thing that decides whether a Production Stage can proceed. It
--     reads project_qms_inspections.status ("NotStarted"/"InProgress"/
--     "Failed"/"Passed") verbatim and nothing else (see its own header:
--     "follows the inspection's server-derived `status` only. Never
--     recomputes a competing status here."). This migration adds
--     nothing that gate reads, so an inspection with no frequency
--     configured behaves EXACTLY as it does today -- no new blocking
--     behavior is introduced for any existing inspection.
--   - project_qms_inspection_attempts (the per-characteristic attempt
--     log) is INSERT-ONLY at the database level -- RLS grants no
--     update/delete and a trigger raises on any attempt to change a row
--     (see qms/types.ts's own comment on ProjectQmsInspectionAttempt).
--     This migration does NOT touch that table at all, specifically to
--     avoid going anywhere near its append-only guarantee. Quantity
--     checkpoint completion is tracked as a NEW, separate concept
--     alongside the existing characteristic-level attempts, not by
--     repurposing round_number (which already means "re-attempt count
--     for one characteristic" -- a different axis entirely).
--
-- Design (additive, two new columns, both on project_qms_inspections):
--   - inspection_frequency_qty integer, nullable, no default (NULL means
--     "no quantity-based checkpoints for this inspection" -- the single
--     pass/fail behavior every existing/future non-quantity inspection
--     already has, completely unchanged). CHECK (> 0) so a configured
--     frequency can't be zero/negative -- the one integrity rule that's
--     safe to enforce at the database level without knowing the exact
--     UI that will set it.
--   - quantity_checkpoints jsonb, NOT NULL DEFAULT '[]'::jsonb -- same
--     established convention as extra_costs/manual_adjustments/
--     raw_materials etc. elsewhere in this schema. Each element records
--     one completed checkpoint:
--       {quantity, completedAt, result, performedBy, performedByName, remarks}
--     "Which checkpoints are REQUIRED" (25/50/75/100 for a 100-piece Job
--     Card at every-25) is a pure computation from
--     (job card's expected_quantity, inspection_frequency_qty) -- never
--     stored, so it can never drift from the Job Card's own quantity.
--     "Which checkpoints are DONE" is exactly the quantities present in
--     this array -- read the array, never re-derive from attempts.
--
-- Explicitly NOT done here:
--   - No change to getStageInspectionGate() or the "Passed" status
--     meaning -- deciding when a quantity-checkpointed inspection's
--     overall status flips to "Passed" (e.g. only once every required
--     checkpoint is present) is application logic to build against
--     these columns, reviewed separately from this schema change.
--   - No automatic production blocking beyond what already exists.
--   - No touch to project_qms_inspection_attempts, its RLS, or its
--     insert-only trigger.

alter table public.project_qms_inspections
  add column if not exists inspection_frequency_qty integer,
  add column if not exists quantity_checkpoints jsonb not null default '[]'::jsonb;

alter table public.project_qms_inspections
  drop constraint if exists project_qms_inspections_frequency_qty_positive;
alter table public.project_qms_inspections
  add constraint project_qms_inspections_frequency_qty_positive
  check (inspection_frequency_qty is null or inspection_frequency_qty > 0);

comment on column public.project_qms_inspections.inspection_frequency_qty is
  'Optional quantity-based inspection interval (e.g. 25 = inspect at every 25 pieces plus a final inspection). NULL = no quantity checkpoints, single pass/fail exactly as before this column existed. Never read by getStageInspectionGate() -- that still reads status only.';
comment on column public.project_qms_inspections.quantity_checkpoints is
  'Completed quantity checkpoints: [{quantity, completedAt, result, performedBy, performedByName, remarks}]. The set of REQUIRED checkpoints is always computed from (job card expected_quantity, inspection_frequency_qty), never stored here -- this array only records which of them are done.';
