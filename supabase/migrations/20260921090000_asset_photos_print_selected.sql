-- Job Card Reference Photo multi-print selection (see chat) — a Job
-- Card's asset_photos rows can now be individually marked "print this
-- one", independent of attachment. Deliberately the SAME per-row-flag
-- pattern is_primary/cover_uses_processed already use on this table,
-- not a new join table: a photo either is or isn't selected for print,
-- which needs no relationship data beyond the row itself.
--
-- One additive, defaulted column: every existing row of every owner
-- type gets print_selected = false, except the small set backfilled
-- below to true so a currently-printing Job Card Reference Photo keeps
-- printing (see that backfill's own comment) — no row anywhere starts
-- printing a photo a human didn't already opt into printing.
--
-- Not touched by this migration, by design (see chat, "legacy
-- compatibility"): job_cards.reference_photo_id, job_cards.
-- print_reference_photo, asset_photos.cover_uses_processed,
-- asset_photos.is_primary. The new print path reads print_selected
-- only; the legacy columns stay exactly as they are for this pass.
--
-- RLS: no new policy needed. The existing asset_photos_update policy
-- (has_asset_permission(owner_type, 'edit') + organization scoping,
-- see 20260916090000_asset_photos_cover_variant.sql) already covers
-- UPDATE of any column on this table, print_selected included — the
-- exact same reasoning that migration gave for cover_uses_processed
-- needing no policy of its own.
alter table asset_photos
  add column print_selected boolean not null default false;

-- Backfill (see chat, "preserve their current behavior automatically")
-- — without this, every existing Job Card that already relies on the
-- legacy single-photo mechanism (reference_photo_id +
-- print_reference_photo=true) would silently stop printing its
-- Reference Photo the moment the new print path (which reads
-- print_selected instead) ships, since print_selected defaults false
-- for every pre-existing row. One set-based UPDATE...FROM (same join-
-- style backfill this codebase already uses, see
-- 20260906060000_job_card_stage_link_and_quantities.sql's own
-- upsert_project_production_stages()), run once, here, at migration
-- time — not a trigger (nothing ongoing needs to stay in sync; a Job
-- Card's legacy pair is read exactly once, right now, and never again
-- after this statement) and not a second print-selection mechanism
-- (it writes into the very same print_selected column the app now
-- reads). job_cards.reference_photo_id/print_reference_photo are only
-- read here, never written — they remain exactly as they are.
update asset_photos ap
set print_selected = true
from job_cards jc
where jc.reference_photo_id = ap.id
  and jc.print_reference_photo = true;
