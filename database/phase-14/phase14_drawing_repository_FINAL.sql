-- FabFlow ERP — Phase 14: Drawing Repository persistence (Postgres +
-- Storage). Moves the Engineering Drawing Editor module's 4 IndexedDB
-- stores (drawings, drawingViews, userPreferences, drawingLinks — see
-- src/frontend/src/drawingEditor/db/database.ts) to Supabase. This is the
-- application's first use of Supabase Storage — the `engineering-drawings`
-- bucket + its policies here establish the pattern Phase 15 (QMS
-- inspection documents) will reuse, not duplicate.
--
-- IDs are preserved as-is: every id in the existing IndexedDB layer is
-- already `crypto.randomUUID()` (confirmed via drawingEditor/api/drawings.ts),
-- so `uuid` primary keys here accept existing local ids unchanged — no
-- regeneration needed for the one-time import tool (Step 7, frontend-side).
--
-- Soft references (no FK), and why: `owner_id` (drawings) and `linked_id`
-- (drawing_links) can point at a project, a vendor, a customer, OR a
-- machine — and Machinery has no Supabase table at all (confirmed in this
-- session's Supabase integration audit: 100% local-only, no `machines`
-- table exists). A single real FK is therefore impossible for these two
-- columns; enforcing one only for the project/vendor/customer cases while
-- leaving machine silently unconstrained would be worse than being
-- consistently soft. `source_design_file_id` is also soft: Design Files
-- are a Project-embedded concept, not their own Supabase row today.
--
-- Idempotent: safe to run multiple times. Extends nothing, duplicates
-- nothing, does not touch any existing table, policy, trigger, or
-- function. Reuses phase2's set_updated_at_timestamp() unmodified.

begin;

-- ══════════════════════════════════════════════════════════════════════
-- 1. drawings — DrawingDocument metadata. pdfBlob itself never lands
--    here; it lives in the engineering-drawings Storage bucket at
--    storage_path, uploaded/downloaded by the frontend API layer.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.drawings (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  file_name text not null,
  storage_path text not null,
  num_pages integer not null,
  -- Legacy convenience field, kept because the frontend type
  -- (DrawingDocument.projectId) still reads/writes it directly for the
  -- common project-owned case, alongside owner_type/owner_id below.
  project_id uuid references public.projects(id),
  owner_type text check (owner_type in ('project', 'machine', 'library')),
  owner_id uuid, -- soft reference — see header note
  uploaded_by uuid references auth.users(id),
  uploaded_by_name text not null,
  category text,
  notes text,
  tags text[],
  parent_drawing_id uuid references public.drawings(id) on delete set null,
  source_design_file_id uuid, -- soft reference — see header note
  original_drawing_id uuid references public.drawings(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.drawings.original_drawing_id is
  'A hidden Working Drawing''s Repository Original. ON DELETE CASCADE matches deleteDrawing()''s existing, confirmed app-level behavior exactly: deleting an Original already deletes its Working Drawing too (drawingEditor/api/drawings.ts) — this makes that guarantee DB-enforced rather than solely app-logic.';

create index if not exists idx_drawings_org_project on public.drawings (organization_id, project_id);
create index if not exists idx_drawings_org_owner on public.drawings (organization_id, owner_type, owner_id);
create index if not exists idx_drawings_parent on public.drawings (parent_drawing_id);
create index if not exists idx_drawings_source_design_file on public.drawings (source_design_file_id);
create index if not exists idx_drawings_original on public.drawings (original_drawing_id);

drop trigger if exists trg_drawings_updated_at on public.drawings;
create trigger trg_drawings_updated_at
  before update on public.drawings
  for each row execute function public.set_updated_at_timestamp();

-- ══════════════════════════════════════════════════════════════════════
-- 2. drawing_views — one row per saved revision (drawing, page, save).
--    fabric_json stays a single jsonb blob per the existing app's own
--    "store fabric.Canvas.toJSON() verbatim" design — not normalized into
--    per-annotation rows (nothing ever queries into individual
--    annotations; it is always read/written as one atomic unit).
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.drawing_views (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  drawing_id uuid not null references public.drawings(id) on delete cascade,
  page_number integer not null,
  crop_rect jsonb not null,
  editor_mode text not null,
  fabric_json jsonb not null,
  canvas_width numeric,
  canvas_height numeric,
  title_block jsonb not null,
  created_by uuid references auth.users(id),
  created_by_name text not null,
  export_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_drawing_views_org_drawing on public.drawing_views (organization_id, drawing_id);

drop trigger if exists trg_drawing_views_updated_at on public.drawing_views;
create trigger trg_drawing_views_updated_at
  before update on public.drawing_views
  for each row execute function public.set_updated_at_timestamp();

-- ══════════════════════════════════════════════════════════════════════
-- 3. drawing_links — many-to-many, drawing to project/machine/vendor/
--    customer. linked_id is a soft reference (see header note).
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.drawing_links (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  drawing_id uuid not null references public.drawings(id) on delete cascade,
  linked_type text not null check (linked_type in ('project', 'machine', 'vendor', 'customer')),
  linked_id uuid not null, -- soft reference — see header note
  created_at timestamptz not null default now()
);

create index if not exists idx_drawing_links_org_drawing on public.drawing_links (organization_id, drawing_id);
create index if not exists idx_drawing_links_org_linked on public.drawing_links (organization_id, linked_type, linked_id);

-- ══════════════════════════════════════════════════════════════════════
-- 4. user_editor_preferences — 1:1 with auth.users, matches profiles'
--    own id=user_id convention. Self-only via RLS (section 6), not
--    drawing_editor-permission-gated — a user's own remembered mode/last
--    project isn't org business data, it's a personal UI preference.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.user_editor_preferences (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  remembered_mode text,
  last_project_id uuid references public.projects(id),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_user_editor_preferences_updated_at on public.user_editor_preferences;
create trigger trg_user_editor_preferences_updated_at
  before update on public.user_editor_preferences
  for each row execute function public.set_updated_at_timestamp();

-- ══════════════════════════════════════════════════════════════════════
-- 5. Storage — private bucket + org-scoped policies. Path convention:
--    {organization_id}/{drawing_id}/{filename} — storage.foldername(name)
--    gives the path segments as text[], so segment [1] is the org id.
--    This is the ONE bucket/policy pattern this whole app will have;
--    Phase 15's inspection-documents bucket copies this shape exactly.
-- ══════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('engineering-drawings', 'engineering-drawings', false)
on conflict (id) do nothing;

drop policy if exists engineering_drawings_select on storage.objects;
create policy engineering_drawings_select on storage.objects for select
  using (
    bucket_id = 'engineering-drawings'
    and has_permission('drawing_editor', 'view')
    and (storage.foldername(name))[1] = current_organization_id()::text
  );

drop policy if exists engineering_drawings_insert on storage.objects;
create policy engineering_drawings_insert on storage.objects for insert
  with check (
    bucket_id = 'engineering-drawings'
    and has_permission('drawing_editor', 'create')
    and (storage.foldername(name))[1] = current_organization_id()::text
  );

drop policy if exists engineering_drawings_update on storage.objects;
create policy engineering_drawings_update on storage.objects for update
  using (
    bucket_id = 'engineering-drawings'
    and has_permission('drawing_editor', 'edit')
    and (storage.foldername(name))[1] = current_organization_id()::text
  )
  with check (
    bucket_id = 'engineering-drawings'
    and has_permission('drawing_editor', 'edit')
    and (storage.foldername(name))[1] = current_organization_id()::text
  );

drop policy if exists engineering_drawings_delete on storage.objects;
create policy engineering_drawings_delete on storage.objects for delete
  using (
    bucket_id = 'engineering-drawings'
    and has_permission('drawing_editor', 'delete')
    and (storage.foldername(name))[1] = current_organization_id()::text
  );

-- ══════════════════════════════════════════════════════════════════════
-- 6. RLS — standard org-scoped 4-policy pattern on drawings/drawing_views/
--    drawing_links, reusing drawing_editor.{view,create,edit,delete}
--    unchanged (already seeded, already used by every existing
--    drawing_editor.* frontend permission check). user_editor_preferences
--    is self-only, no drawing_editor permission required.
-- ══════════════════════════════════════════════════════════════════════

alter table public.drawings enable row level security;
alter table public.drawing_views enable row level security;
alter table public.drawing_links enable row level security;
alter table public.user_editor_preferences enable row level security;

drop policy if exists drawings_select on public.drawings;
create policy drawings_select on public.drawings for select
  using (has_permission('drawing_editor', 'view') and organization_id = current_organization_id());
drop policy if exists drawings_insert on public.drawings;
create policy drawings_insert on public.drawings for insert
  with check (has_permission('drawing_editor', 'create') and organization_id = current_organization_id());
drop policy if exists drawings_update on public.drawings;
create policy drawings_update on public.drawings for update
  using (has_permission('drawing_editor', 'edit') and organization_id = current_organization_id())
  with check (has_permission('drawing_editor', 'edit') and organization_id = current_organization_id());
drop policy if exists drawings_delete on public.drawings;
create policy drawings_delete on public.drawings for delete
  using (has_permission('drawing_editor', 'delete') and organization_id = current_organization_id());

drop policy if exists drawing_views_select on public.drawing_views;
create policy drawing_views_select on public.drawing_views for select
  using (has_permission('drawing_editor', 'view') and organization_id = current_organization_id());
drop policy if exists drawing_views_insert on public.drawing_views;
create policy drawing_views_insert on public.drawing_views for insert
  with check (has_permission('drawing_editor', 'create') and organization_id = current_organization_id());
drop policy if exists drawing_views_update on public.drawing_views;
create policy drawing_views_update on public.drawing_views for update
  using (has_permission('drawing_editor', 'edit') and organization_id = current_organization_id())
  with check (has_permission('drawing_editor', 'edit') and organization_id = current_organization_id());
drop policy if exists drawing_views_delete on public.drawing_views;
create policy drawing_views_delete on public.drawing_views for delete
  using (has_permission('drawing_editor', 'delete') and organization_id = current_organization_id());

drop policy if exists drawing_links_select on public.drawing_links;
create policy drawing_links_select on public.drawing_links for select
  using (has_permission('drawing_editor', 'view') and organization_id = current_organization_id());
drop policy if exists drawing_links_insert on public.drawing_links;
create policy drawing_links_insert on public.drawing_links for insert
  with check (has_permission('drawing_editor', 'create') and organization_id = current_organization_id());
drop policy if exists drawing_links_delete on public.drawing_links;
create policy drawing_links_delete on public.drawing_links for delete
  using (has_permission('drawing_editor', 'delete') and organization_id = current_organization_id());

drop policy if exists user_editor_preferences_select on public.user_editor_preferences;
create policy user_editor_preferences_select on public.user_editor_preferences for select
  using (id = auth.uid());
drop policy if exists user_editor_preferences_insert on public.user_editor_preferences;
create policy user_editor_preferences_insert on public.user_editor_preferences for insert
  with check (id = auth.uid() and organization_id = current_organization_id());
drop policy if exists user_editor_preferences_update on public.user_editor_preferences;
create policy user_editor_preferences_update on public.user_editor_preferences for update
  using (id = auth.uid())
  with check (id = auth.uid() and organization_id = current_organization_id());

-- ══════════════════════════════════════════════════════════════════════
-- 7. Register this migration. Deliberately the last statement before
-- commit — its presence in schema_migrations after a run is proof the
-- entire transaction above succeeded, not just that it started.
-- Checksum is the SHA-256 of this file's content above this statement,
-- computed at authoring time.
-- ══════════════════════════════════════════════════════════════════════

insert into public.schema_migrations (version, description, checksum)
values (
  '20260811_014_phase14_drawing_repository',
  'Phase 14: drawings, drawing_views, drawing_links, user_editor_preferences (Postgres metadata for the Engineering Drawing Editor module, migrated off IndexedDB fabflow-drawing-editor); engineering-drawings private Storage bucket + 4 org-scoped storage.objects policies keyed to drawing_editor.{view,create,edit,delete} via storage.foldername(name)[1] = current_organization_id() path convention {organization_id}/{drawing_id}/{filename} — the app''s first Storage integration, reused unchanged by Phase 15 (QMS documents). IDs preserved as uuid (existing IndexedDB ids are already crypto.randomUUID()). owner_id/linked_id/source_design_file_id are deliberate soft references (no FK) since Machinery and Design Files have no corresponding Supabase table. original_drawing_id ON DELETE CASCADE formalizes deleteDrawing()''s existing Original+WorkingDrawing cascade. user_editor_preferences is self-only via RLS, not permission-gated. Reuses phase2''s set_updated_at_timestamp() unmodified. Zero changes to any existing table, policy, function, or permission.',
  '0df269cd14983bcbad7b17dc20e9bdd738d5403e71a6ec9d91291918f69961ee'
)
on conflict (version) do nothing;

commit;
