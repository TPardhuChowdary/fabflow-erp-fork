-- ══════════════════════════════════════════════════════════════════════
-- Phase 33 — Fix drawings.source_design_file_id column type
-- ══════════════════════════════════════════════════════════════════════
--
-- ROOT CAUSE (confirmed live, not guessed):
--
-- Phase 14 declared `drawings.source_design_file_id` as `uuid`, with the
-- comment "owner_id/linked_id/source_design_file_id are deliberate soft
-- references (no FK) since Machinery and Design Files have no
-- corresponding Supabase table" — correctly identifying that Design
-- Files live outside Supabase, but leaving the column typed `uuid`
-- anyway.
--
-- Design Files are generated purely client-side in
-- src/frontend/src/pages/ProjectDetail.tsx (handleFileUpload):
--   id: `df-${Date.now()}`
-- e.g. "df-1786899123456" — never a UUID.
--
-- Every call in the "Edit a freshly uploaded Design File" path
-- (drawingEditor/api/drawings.ts: findMasterDrawingBySourceDesignFile,
-- then promoteDesignFileToMasterDrawing) either filters or inserts this
-- string directly against the `uuid` column. Postgres rejects the cast
-- ("invalid input syntax for type uuid") before any RLS or business
-- logic runs; PostgREST surfaces that as a 400, which is exactly the
-- "Failed to load resource: the server responded with a status of 400"
-- reproduced live for this task's audit — confirmed against this
-- project's real Supabase instance, not inferred from source alone.
--
-- Existing Drawing Repository drawings are unaffected by this bug
-- because they don't have a source_design_file_id at all (they were
-- uploaded directly, or migrated from IndexedDB with a real
-- crypto.randomUUID() id) — which is exactly why "Edit" already worked
-- for those and nowhere else.
--
-- FIX: widen the column from `uuid` to `text`. This is the column's
-- correct type given what it actually stores — client-generated
-- "df-<timestamp>" strings — and matches how it was already described
-- (a soft reference, not a real FK) at Phase 14. No RLS policy, index
-- definition, or application code path changes shape: the column is
-- still indexed, still nullable, still compared with plain equality.
--
-- No other change. No validation loosened. No unsupported file types
-- newly allowed — this only fixes the plumbing that was silently
-- rejecting a value the application always intended to send.
-- ══════════════════════════════════════════════════════════════════════

alter table public.drawings
  alter column source_design_file_id type text
  using source_design_file_id::text;

comment on column public.drawings.source_design_file_id is
  'Soft reference (no FK) to a client-only Design File id, e.g. "df-1786899123456" — Design Files are never persisted to Supabase (see ProjectDetail.tsx handleFileUpload), so this is deliberately text, not uuid. Fixed from uuid at Phase 33 after live reproduction of the resulting "Edit" 400.';

-- ══════════════════════════════════════════════════════════════════════
-- Register this migration. Deliberately the last statement before
-- commit — its presence in schema_migrations after a run is proof the
-- entire transaction above succeeded, not just that it started.
-- ══════════════════════════════════════════════════════════════════════

insert into public.schema_migrations (version, description, checksum)
values (
  '20260816_033_phase33_fix_source_design_file_id_type',
  'Phase 33: alter drawings.source_design_file_id from uuid to text. Root-caused live: Design File ids are client-generated "df-<timestamp>" strings (ProjectDetail.tsx handleFileUpload), never UUIDs, so every promote-a-fresh-upload call (findMasterDrawingBySourceDesignFile, promoteDesignFileToMasterDrawing) was rejected by Postgres with an invalid uuid cast before RLS or app logic ran, surfaced as a 400 on the Design Files "Edit" button. No RLS, index, or app-code shape change; column remains nullable and indexed. Existing Drawing Repository drawings (no source_design_file_id, or a real migrated uuid) are unaffected.',
  'phase33-fix-source-design-file-id-type-v1'
)
on conflict (version) do nothing;
