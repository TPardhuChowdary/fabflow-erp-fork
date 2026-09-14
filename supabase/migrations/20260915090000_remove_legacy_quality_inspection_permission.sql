-- =====================================================================
-- DRAFT — NOT APPLIED. Written per explicit instruction ("create the
-- migration, do not apply it"). Do not run this against the live
-- project without deciding it's wanted first.
-- =====================================================================
--
-- Removes the obsolete `quality_inspection` permission module and every
-- row that references it, completing the legacy Quality system removal
-- (frontend already removed in an earlier, separate change: pages/
-- Quality.tsx, the QualityInspection type/store fields, the ExportEngine
-- "Quality Inspection" report section, and the AttentionLayer alert that
-- used to route to it).
--
-- WHY THIS IS SAFE — confirmed by direct, live introspection of this
-- exact database before writing this migration, not assumed:
--   - Zero RLS policies anywhere reference `quality_inspection`
--     (checked pg_policies.qual/with_check on every table).
--   - Zero SQL functions anywhere reference it (checked pg_proc.prosrc).
--   - Every QMS table's RLS already uses a DIFFERENT, active permission
--     module instead — `inspection_sheets` (project_qms_inspections,
--     qms_stage_completions, inspection_sheets itself) and
--     `quality_characteristics` (the characteristic library) — neither
--     of which this migration touches.
--   - This exact finding — "quality_inspection is a dead/unused
--     permission key... referenced by no table's RLS policy" — was
--     already independently documented twice in this repo's own history
--     (database/phase-25/MASTER_AUDIT.md and database/phase-28/
--     PHASE28_INVESTIGATION.md), both times deliberately left untouched
--     "for awareness only". This migration is what finally acts on that
--     long-standing, twice-confirmed observation.
--   - The only role ever granted quality_inspection.* is the `quality`
--     role — which ALSO holds active, unrelated grants
--     (quality_characteristics.*, inspection_sheets.*, projects.view,
--     production.view, delivery_challans.view) and is therefore NOT
--     deleted here; only its 4 quality_inspection.* mappings are.
--   - Zero users currently hold the `quality` role (user_roles has no
--     matching rows) — but ONE real user, "prasad" (not a disposable QA
--     test account), holds a direct per-user override granting all 4
--     quality_inspection actions (user_permission_overrides). Flagged
--     explicitly here and in this session's report: this migration
--     removes those 4 override rows too, since they become meaningless
--     once the permission rows they reference no longer exist and the
--     one page that ever checked them (pages/Quality.tsx) is already
--     gone. No other permission/role/override belonging to "prasad" is
--     touched.
--
-- WHAT THIS DOES NOT TOUCH:
--   - inspection_sheets.*, quality_characteristics.*, qms_dashboard, or
--     any other active QMS permission module.
--   - project_qms_inspections, qms_stage_completions, inspection_sheets,
--     quality_characteristics tables or their RLS/triggers/functions.
--   - The `quality` role itself, or any of its other permission grants.
--   - Any role/user other than the exact 4-row mappings identified
--     above.
--
-- Delete order respects the two (and only two) foreign keys onto
-- permissions.id, confirmed via information_schema — user_permission_
-- overrides and role_permissions — deleting dependents before the
-- permissions rows themselves.

delete from public.user_permission_overrides
where permission_id in (
  select id from public.permissions where module = 'quality_inspection'
);

delete from public.role_permissions
where permission_id in (
  select id from public.permissions where module = 'quality_inspection'
);

delete from public.permissions
where module = 'quality_inspection';
