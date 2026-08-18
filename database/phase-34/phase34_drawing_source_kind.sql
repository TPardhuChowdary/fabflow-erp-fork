-- ══════════════════════════════════════════════════════════════════════
-- Phase 34 — Universal Edit: drawings.source_kind
-- ══════════════════════════════════════════════════════════════════════
--
-- Step 5 of the FabFlow work list adds "Edit" support for DXF and image
-- (PNG/JPG/JPEG) Design Files, routed through the exact same Drawing
-- Editor (drawings/drawing_views tables, crop → mode-select → annotate →
-- save pipeline) that PDF Design Files already use — not a second,
-- competing editor or storage system.
--
-- The only schema gap: `drawings` has no column recording what kind of
-- file was actually uploaded, so the editor's loading step (which needs
-- to know whether to call pdf.js or parse DXF/decode an image) has
-- nothing to branch on. `storage_path` is already generic (any blob),
-- and `num_pages`/`drawing_views.page_number` already tolerate a
-- constant `1` for a single-view DXF/image — no other column needs to
-- change shape.
--
-- Additive and backward-compatible: every existing row (100% PDF today)
-- gets 'pdf' as its default, so nothing about current behavior changes
-- until a new DXF/image promotion actually sets a different value.
-- ══════════════════════════════════════════════════════════════════════

alter table public.drawings
  add column source_kind text not null default 'pdf'
  check (source_kind in ('pdf', 'dxf', 'image'));

comment on column public.drawings.source_kind is
  'Phase 34 — which kind of file this drawing was promoted/uploaded from, and therefore how the Drawing Editor''s loading step must interpret storage_path: pdf.js for "pdf", the existing DXF parser (lib/dxfPreview.ts) for "dxf", a plain image decode for "image". Default ''pdf'' preserves every pre-Phase-34 row unchanged.';

-- ══════════════════════════════════════════════════════════════════════
-- Register this migration. Deliberately the last statement before
-- commit — its presence in schema_migrations after a run is proof the
-- entire transaction above succeeded, not just that it started.
-- ══════════════════════════════════════════════════════════════════════

insert into public.schema_migrations (version, description, checksum)
values (
  '20260817_034_phase34_drawing_source_kind',
  'Phase 34: add drawings.source_kind (text, not null, default ''pdf'', check in pdf/dxf/image). Additive-only — lets the Drawing Editor''s loading step branch on what kind of file a drawing was promoted from (PDF via pdf.js, DXF via the existing lib/dxfPreview.ts parser, or a plain image decode), while every other part of the editor (crop selection, mode selection, buildFabricCanvas, save, composeLatestView/Preview) stays completely unchanged and shared across all three kinds. No RLS, index, or other column shape change; every existing PDF-sourced row defaults to ''pdf'' with zero behavior change.',
  'phase34-drawing-source-kind-v1'
)
on conflict (version) do nothing;
