-- =====================================================================
-- DRAFT — NOT APPLIED. Written per explicit instruction ("write the
-- migration, do not apply it, wait for approval"). Do not run against
-- the live project without separate, explicit approval.
-- =====================================================================
--
-- Project Photos — Phase 4: AI-selected / user-selected processed
-- background color.
--
-- Same additive-column shape as cover_uses_processed
-- (20260916090000_asset_photos_cover_variant.sql): one nullable text
-- column on the same photo row, not a new table — this describes the
-- processed derivative's own background choice, not a new entity.
-- NULL for every existing row (nothing has ever recorded a background
-- color before this phase) and for every non-project owner_type, which
-- never populates processed_* columns at all — zero behavior change
-- for machines/dies/tools/inventory_items/job_cards. Existing
-- processed images with no stored color are a normal, permanent state
-- here, not a value requiring backfill or reprocessing — the frontend
-- falls back to a generic "AI selected / Existing" label for them.
--
-- The CHECK constraint restricts values to the exact 7-color approved
-- palette (uppercase hex) as defense-in-depth alongside the Edge
-- Function's own server-side allowlist validation — a second layer,
-- not the only layer, matching this table's existing
-- processing_status CHECK pattern.
--
-- No other schema object changes: is_primary, cover_uses_processed,
-- uq_asset_photos_one_primary, processing_status, processed_storage_path,
-- processed_filename, owner_type check constraint, RLS policies,
-- permissions, and the asset-photos Storage bucket are all untouched.
alter table public.asset_photos
  add column if not exists processed_background_color text
  check (
    processed_background_color is null
    or upper(processed_background_color) in (
      '#FFFFFF', '#FAF9F6', '#F1F3F5', '#E9EEF2', '#E8F0F5', '#F3EDE3', '#E5E7EB'
    )
  );
