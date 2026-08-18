-- FabFlow ERP — Phase 46: full QMS Inspection workflow persistence
-- (Sheet header, per-characteristic StageEntry, Documents, History; plus
-- finally activating the already-built qms_stage_completions table).
--
-- Today InspectionSheet / InspectionStageEntry / InspectionDocument /
-- InspectionStageCompletion / InspectionHistoryEvent live 100% in
-- per-browser IndexedDB (src/qms/db/database.ts) — a device that never
-- locally created a given sheet cannot see it at all, let alone its
-- progress. The user has explicitly required the complete workflow
-- (header, completions, per-characteristic entries, documents, history)
-- to become genuinely multi-device. This migration creates the minimum
-- normalized schema for that, reusing qms_stage_completions as-is (Phase
-- 11, 0 rows, already a near field-for-field match with
-- InspectionStageCompletion — this is its first real writer).
--
-- Every id is CLIENT-GENERATED (primary key has no default) — the
-- frontend already generates a stable crypto.randomUUID() for every one
-- of these entities today and depends on that id existing immediately
-- after local creation (optimistic UI). Inserts always pass id explicitly.
--
-- Field-by-field audit (performed against the live src/qms/types.ts,
-- not a summary) confirms every business-data field on all five frontend
-- types has a column below, with one intentional representational change:
-- InspectionDocument.blob (raw Blob) becomes a Supabase Storage object +
-- a storage_path column, mirroring the existing DrawingDocument/
-- drawingEditor precedent — not a silent omission.
--
-- Additive only: no existing table/column/policy is dropped or altered
-- beyond the one FK added to qms_stage_completions (safe — confirmed 0
-- rows, so no backfill needed).

begin;

create table if not exists public.inspection_sheets (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  project_id uuid not null references public.projects(id) on delete cascade,
  inspection_number text not null,
  revision integer not null default 1,
  mode text not null,
  status text not null,
  stage_ids uuid[] not null default '{}',
  customer_id uuid references public.customers(id) on delete set null,
  drawing_reference text,
  drawing_revision text,
  generated_at timestamptz,
  generated_by text,
  printed_at timestamptz,
  printed_by text,
  uploaded_at timestamptz,
  uploaded_by text,
  reviewed_at timestamptz,
  reviewed_by text,
  approved_at timestamptz,
  approved_by text,
  closed_at timestamptz,
  closed_by text,
  document_family_id uuid,
  previous_revision_id uuid references public.inspection_sheets(id) on delete set null,
  revision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_inspection_sheets_mode check (mode in ('Paper','Digital','Hybrid')),
  -- 'Signed' is a legacy value kept only for backward compatibility with
  -- pre-Phase-3 local data (src/qms/types.ts's own comment on
  -- InspectionSheetStatus) — nothing writes it going forward, but it must
  -- stay valid so a migrated legacy sheet is never rejected.
  constraint chk_inspection_sheets_status check (status in (
    'Draft','Generated','Printed','InspectionStarted','InProgress','Completed',
    'Signed','AwaitingUpload','Uploaded','Reviewed','Approved','Closed'
  ))
);

create index if not exists idx_inspection_sheets_org_project
  on public.inspection_sheets (organization_id, project_id);
create index if not exists idx_inspection_sheets_document_family
  on public.inspection_sheets (document_family_id);

drop trigger if exists trg_inspection_sheets_updated_at on public.inspection_sheets;
create trigger trg_inspection_sheets_updated_at
  before update on public.inspection_sheets
  for each row execute function public.set_updated_at_timestamp();

-- Activate qms_stage_completions (Phase 11, confirmed 0 rows): add the FK
-- to the sheet header table directly on the existing column, no parallel
-- column, no backfill needed.
alter table public.qms_stage_completions
  add constraint qms_stage_completions_sheet_id_fkey
  foreign key (sheet_id) references public.inspection_sheets(id) on delete cascade;

create table if not exists public.inspection_stage_entries (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  sheet_id uuid not null references public.inspection_sheets(id) on delete cascade,
  stage_id uuid not null,
  characteristic_id uuid not null,
  result text,
  measured_value text,
  remarks text,
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint chk_inspection_stage_entries_result check (result is null or result in ('Pass','Fail','NA')),
  constraint uq_inspection_stage_entries_sheet_stage_char unique (sheet_id, stage_id, characteristic_id)
);

create index if not exists idx_inspection_stage_entries_org_sheet
  on public.inspection_stage_entries (organization_id, sheet_id);

create table if not exists public.inspection_documents (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  sheet_id uuid not null references public.inspection_sheets(id) on delete cascade,
  stage_id uuid,
  file_name text not null,
  file_type text not null,
  file_size bigint not null,
  storage_path text not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by text,
  notes text,
  caption text,
  source text,
  checksum text,
  constraint chk_inspection_documents_source check (source is null or source in ('Uploaded','Generated'))
);

create index if not exists idx_inspection_documents_org_sheet
  on public.inspection_documents (organization_id, sheet_id);

create table if not exists public.inspection_history (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  sheet_id uuid not null references public.inspection_sheets(id) on delete cascade,
  action text not null,
  by_user_id text,
  by_user_name text,
  at timestamptz not null default now(),
  notes text
);

create index if not exists idx_inspection_history_org_sheet
  on public.inspection_history (organization_id, sheet_id);

-- ============================================================================
-- RLS — mirrors qms_stage_completions' own shape: has_permission on the
-- inspection_sheets module + organization match. Per-transition precision
-- (who may move a sheet from Reviewed to Approved, etc.) is enforced in
-- the application layer (qms/api/inspections.ts's transition table +
-- UI-level canEdit checks), matching this schema's existing convention
-- elsewhere (e.g. project_production_stages ORs create+edit across two
-- modules rather than encoding per-status logic into RLS).
-- ============================================================================

alter table public.inspection_sheets enable row level security;
alter table public.inspection_stage_entries enable row level security;
alter table public.inspection_documents enable row level security;
alter table public.inspection_history enable row level security;

drop policy if exists inspection_sheets_select on public.inspection_sheets;
create policy inspection_sheets_select on public.inspection_sheets for select
  using (has_permission('inspection_sheets','view') and organization_id = current_organization_id());

drop policy if exists inspection_sheets_insert on public.inspection_sheets;
create policy inspection_sheets_insert on public.inspection_sheets for insert
  with check (has_permission('inspection_sheets','generate') and organization_id = current_organization_id());

drop policy if exists inspection_sheets_update on public.inspection_sheets;
create policy inspection_sheets_update on public.inspection_sheets for update
  using (
    (has_permission('inspection_sheets','generate') or has_permission('inspection_sheets','complete')
      or has_permission('inspection_sheets','upload') or has_permission('inspection_sheets','print')
      or has_permission('inspection_sheets','review') or has_permission('inspection_sheets','approve')
      or has_permission('inspection_sheets','assign'))
    and organization_id = current_organization_id()
  )
  with check (
    (has_permission('inspection_sheets','generate') or has_permission('inspection_sheets','complete')
      or has_permission('inspection_sheets','upload') or has_permission('inspection_sheets','print')
      or has_permission('inspection_sheets','review') or has_permission('inspection_sheets','approve')
      or has_permission('inspection_sheets','assign'))
    and organization_id = current_organization_id()
  );

drop policy if exists inspection_stage_entries_select on public.inspection_stage_entries;
create policy inspection_stage_entries_select on public.inspection_stage_entries for select
  using (has_permission('inspection_sheets','view') and organization_id = current_organization_id());

drop policy if exists inspection_stage_entries_insert on public.inspection_stage_entries;
create policy inspection_stage_entries_insert on public.inspection_stage_entries for insert
  with check (has_permission('inspection_sheets','complete') and organization_id = current_organization_id());

drop policy if exists inspection_stage_entries_update on public.inspection_stage_entries;
create policy inspection_stage_entries_update on public.inspection_stage_entries for update
  using (has_permission('inspection_sheets','complete') and organization_id = current_organization_id())
  with check (has_permission('inspection_sheets','complete') and organization_id = current_organization_id());

drop policy if exists inspection_documents_select on public.inspection_documents;
create policy inspection_documents_select on public.inspection_documents for select
  using (has_permission('inspection_sheets','view') and organization_id = current_organization_id());

drop policy if exists inspection_documents_insert on public.inspection_documents;
create policy inspection_documents_insert on public.inspection_documents for insert
  with check (has_permission('inspection_sheets','upload') and organization_id = current_organization_id());

drop policy if exists inspection_history_select on public.inspection_history;
create policy inspection_history_select on public.inspection_history for select
  using (has_permission('inspection_sheets','view') and organization_id = current_organization_id());

drop policy if exists inspection_history_insert on public.inspection_history;
create policy inspection_history_insert on public.inspection_history for insert
  with check (
    (has_permission('inspection_sheets','generate') or has_permission('inspection_sheets','complete')
      or has_permission('inspection_sheets','upload') or has_permission('inspection_sheets','print')
      or has_permission('inspection_sheets','review') or has_permission('inspection_sheets','approve')
      or has_permission('inspection_sheets','assign'))
    and organization_id = current_organization_id()
  );

-- ============================================================================
-- Storage — new private bucket 'qms-inspection-documents' (created
-- manually via the Supabase dashboard, same as the existing
-- 'engineering-drawings' bucket — no SQL statement creates a bucket
-- anywhere in this repo's migration history). Path convention:
-- {organization_id}/{sheet_id}/{document_id}-{file_name}, matching
-- drawingEditor/api/drawings.ts's {orgId}/{drawingId}/{fileName}
-- precedent. Policies below are copied from the confirmed live
-- 'engineering_drawings_*' policy shape (supabase/migrations/
-- 20260811070452_remote_schema.sql:7712-7745), swapping the bucket id and
-- the permission module/actions.
-- ============================================================================

drop policy if exists qms_inspection_documents_select on storage.objects;
create policy qms_inspection_documents_select on storage.objects
  for select to public
  using (
    bucket_id = 'qms-inspection-documents'
    and has_permission('inspection_sheets','view')
    and (storage.foldername(name))[1] = (current_organization_id())::text
  );

drop policy if exists qms_inspection_documents_insert on storage.objects;
create policy qms_inspection_documents_insert on storage.objects
  for insert to public
  with check (
    bucket_id = 'qms-inspection-documents'
    and has_permission('inspection_sheets','upload')
    and (storage.foldername(name))[1] = (current_organization_id())::text
  );

drop policy if exists qms_inspection_documents_update on storage.objects;
create policy qms_inspection_documents_update on storage.objects
  for update to public
  using (
    bucket_id = 'qms-inspection-documents'
    and has_permission('inspection_sheets','upload')
    and (storage.foldername(name))[1] = (current_organization_id())::text
  )
  with check (
    bucket_id = 'qms-inspection-documents'
    and has_permission('inspection_sheets','upload')
    and (storage.foldername(name))[1] = (current_organization_id())::text
  );

drop policy if exists qms_inspection_documents_delete on storage.objects;
create policy qms_inspection_documents_delete on storage.objects
  for delete to public
  using (
    bucket_id = 'qms-inspection-documents'
    and has_permission('inspection_sheets','upload')
    and (storage.foldername(name))[1] = (current_organization_id())::text
  );

insert into public.schema_migrations (version, description, checksum)
values (
  '20260818_046_phase46_qms_inspection_workflow',
  'Phase 46: full QMS Inspection workflow persistence. Creates inspection_sheets (header), inspection_stage_entries (per-characteristic checklist detail, unique per sheet/stage/characteristic), inspection_documents (metadata; bytes in the new qms-inspection-documents Storage bucket via storage_path), inspection_history (append-only audit log) — all with client-generated primary keys and RLS gated on has_permission(''inspection_sheets'', <action>) + organization match. Adds the sheet_id FK to the already-existing, previously-dormant qms_stage_completions table (confirmed 0 rows, no backfill), giving it its first real writer. Adds 4 storage.objects policies for the new qms-inspection-documents bucket (created manually via dashboard, same as engineering-drawings), path-scoped by organization_id folder segment. Confirmed via a field-by-field audit against the live src/qms/types.ts that every InspectionSheet/InspectionStageEntry/InspectionDocument/InspectionStageCompletion/InspectionHistoryEvent field is represented — InspectionDocument.blob intentionally becomes Storage object + storage_path, not a silent omission.',
  'phase46-qms-inspection-workflow-v1'
)
on conflict (version) do nothing;

commit;
