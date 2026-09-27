-- =====================================================================
-- DRAFT — NOT APPLIED. Written per explicit instruction ("create the
-- migration, do not apply it, show me the exact SQL, wait for
-- approval"). Do not run against the live project without separate,
-- explicit approval.
-- =====================================================================
--
-- Project Timeline — Photo Attachments.
--
-- Lets a Project Timeline event (an entry inside projects.activity_log
-- jsonb, written only via add_project_activity()) have photos attached
-- through the EXISTING generic asset_photos subsystem (Phase 51,
-- already widened for job_card and project) rather than a new table.
-- Confirmed live before writing this (see the full architecture audit
-- delivered separately):
--   - asset_photos_owner_type_check currently allows
--     'machine'|'die'|'tool'|'inventory_item'|'job_card'|'project'.
--   - has_asset_permission(p_asset_type, p_action) is a simple CASE
--     mapping each owner_type to its own has_permission(module, action)
--     call, `else false` for anything unrecognized.
--   - asset_photos' own RLS policies (asset_photos_select/insert/
--     update/delete) read owner_type dynamically via
--     has_asset_permission(owner_type, ...) plus a plain
--     organization_id = current_organization_id() check on the row
--     itself — neither needs a single policy rewritten to support a
--     new owner_type, only the two things below. Same for the
--     "asset-photos" Storage bucket policies (they key off
--     (storage.foldername(name))[2], i.e. the same owner_type string).
--   - There is no FK on asset_photos.owner_id (deliberately — a
--     polymorphic reference, documented at the original table's own
--     creation), so no FK/trigger change is needed to point owner_id at
--     a Timeline event's id.
--   - 'projects' already has view/create/edit/delete/upload permission
--     actions defined — no new permission key is introduced. A Timeline
--     event always belongs to a project, so routing 'timeline_event'
--     through the exact same has_permission('projects', p_action) call
--     'project' already uses reproduces the identical isolation
--     guarantee project photos already have — no better, no worse,
--     and no new join/logic to write or audit.
--
-- This migration does exactly two things, the same two steps every
-- prior owner_type widening (job_card, project) used:
--   1. Widen the owner_type check constraint to add 'timeline_event'.
--   2. Widen has_asset_permission() to map 'timeline_event' ->
--      has_permission('projects', p_action).
--
-- Every existing branch (machine/die/tool/inventory_item/job_card/
-- project) is copied byte-for-byte unchanged below — this only adds one
-- new CASE branch and one new array element. No existing row's
-- owner_type is touched (widening a CHECK constraint is a superset of
-- the old one, so every row that already satisfied it still does), and
-- no existing owner_type's behavior changes.
-- =====================================================================

-- ── 1. Widen owner_type to include 'timeline_event' ─────────────────
alter table public.asset_photos drop constraint if exists asset_photos_owner_type_check;
alter table public.asset_photos add constraint asset_photos_owner_type_check
  check (owner_type = any (array['machine', 'die', 'tool', 'inventory_item', 'job_card', 'project', 'timeline_event']));

-- ── 2. Widen has_asset_permission() to route 'timeline_event' ───────
--       -> 'projects' (same module 'project' already uses)
create or replace function public.has_asset_permission(p_asset_type text, p_action text)
returns boolean
language sql
stable
as $$
  select case p_asset_type
    when 'machine'        then has_permission('machinery', p_action)
    when 'die'             then has_permission('tooling_dies', p_action)
    when 'tool'             then has_permission('tools', p_action)
    when 'inventory_item'  then has_permission('inventory', p_action)
    when 'job_card'         then has_permission('job_cards', p_action)
    when 'project'          then has_permission('projects', p_action)
    when 'timeline_event'   then has_permission('projects', p_action)
    else false
  end;
$$;

-- No RLS policy changes needed — asset_photos_select/insert/update/
-- delete and the Storage bucket policies already read owner_type
-- dynamically (see above). No new table, no new Storage bucket/prefix
-- (a timeline event's photos land in the same private "asset-photos"
-- bucket under {organization_id}/timeline_event/{eventId}/, exactly
-- the existing per-owner-type/owner-id prefix convention). No data
-- migration/backfill — every existing asset_photos row is untouched,
-- and old activity_log entries (no eventId in their metadata) simply
-- never get any asset_photos rows pointed at them.
