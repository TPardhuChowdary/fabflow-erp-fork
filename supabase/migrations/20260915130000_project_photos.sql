-- =====================================================================
-- APPLIED — explicitly approved and applied to the live database via
-- the established controlled procedure (supabase db query --linked
-- --file), confirmed live in Phase 1/2 QA.
-- =====================================================================
--
-- Project Photos + Project Cover — reuses the existing generic
-- asset_photos subsystem (Phase 51, widened once already for Job Cards
-- in database/phase-62) rather than creating a second photo table/
-- bucket/gallery component. Confirmed live before writing this:
--   - asset_photos_owner_type_check currently allows
--     'machine'|'die'|'tool'|'inventory_item'|'job_card'.
--   - has_asset_permission(p_asset_type, p_action) maps each owner_type
--     to its own has_permission(module, action) call.
--   - Both asset_photos' own RLS policies (asset_photos_select/insert/
--     update/delete) and the "asset-photos" Storage bucket's policies
--     (asset_photos_storage_select/insert/update/delete) already read
--     owner_type dynamically (table: `has_asset_permission(owner_type,
--     ...)`; storage: `has_asset_permission((storage.foldername(name))
--     [2], ...)`) — neither needs a single policy rewritten to support
--     a new owner_type, only the two things below.
--   - 'projects' already has view/create/edit/delete/upload permission
--     actions defined (confirmed live in the permissions table) — no
--     new permission key is introduced by this migration.
--
-- This migration does exactly two things to the existing table:
--   1. Widen the owner_type check constraint to add 'project' (same
--      ALTER pattern database/phase-62 used to add 'job_card').
--   2. Widen has_asset_permission() to map 'project' -> has_permission
--      ('projects', p_action) (same pattern phase-62 used).
-- Plus one small additive change new to this feature:
--   3. Three nullable columns for the optional AI background-removal
--      pipeline (processing_status/processed_storage_path/
--      processed_filename). NULL for every existing row and for every
--      non-project owner_type that never opts into AI processing —
--      zero behavior change for machines/dies/tools/inventory_items/
--      job_cards. Deliberately NOT a separate table: these three
--      columns describe the same photo row's own derived-image state,
--      not a new entity with its own lifecycle/relationships.
--
-- "Exactly one cover per project" reuses the EXISTING partial unique
-- index uq_asset_photos_one_primary (owner_type, owner_id) where
-- is_primary — already enforced, already race-safe (a concurrent second
-- "set primary" hits a unique-violation, not silent double-primary),
-- already used in production for Machines/Dies/Tools/Inventory Items/
-- Job Cards. No new invariant needs to be added for this feature.
-- =====================================================================

-- ── 1. Widen owner_type to include 'project' ────────────────────────
alter table public.asset_photos drop constraint if exists asset_photos_owner_type_check;
alter table public.asset_photos add constraint asset_photos_owner_type_check
  check (owner_type = any (array['machine', 'die', 'tool', 'inventory_item', 'job_card', 'project']));

-- ── 2. Widen has_asset_permission() to route 'project' -> 'projects' ─
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
    else false
  end;
$$;

-- ── 3. Optional AI background-removal pipeline (nullable, additive) ──
-- processing_status is NULL until a user explicitly requests AI
-- processing for a photo (never set implicitly on plain upload).
-- Values used by the application: 'processing' | 'ready' | 'failed'.
-- ('uploaded' as a distinct status was considered but is redundant —
-- a freshly uploaded, never-processed photo is simply NULL here, which
-- already means "no AI derivative exists / not requested".)
alter table public.asset_photos add column if not exists processing_status text
  check (processing_status is null or processing_status in ('processing', 'ready', 'failed'));
alter table public.asset_photos add column if not exists processed_storage_path text;
alter table public.asset_photos add column if not exists processed_filename text;

-- No RLS changes needed for these three columns — they're covered by
-- the same asset_photos_update policy already gating every other column
-- on this table (has_asset_permission(owner_type, 'edit') + org match).
-- No new Storage bucket needed — a processed image is uploaded to the
-- same private "asset-photos" bucket, same
-- {organization_id}/project/{project_id}/ prefix, just a second object
-- next to the original (never overwriting it).
