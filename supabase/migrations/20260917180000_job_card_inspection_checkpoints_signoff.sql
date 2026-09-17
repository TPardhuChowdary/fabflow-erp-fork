-- Job Card Inspection Checkpoint Execution + Final Sign-off + Physical
-- Document Traceability (see chat) — NOT YET APPLIED, written for review
-- only.
--
-- Builds the NEXT layer on top of the already-committed/deployed Job
-- Card Planning feature (20260917100000_job_card_planning_fields.sql,
-- commit f2514810). That migration already added job_cards.
-- inspection_plan jsonb (freeform CONFIGURATION: label/triggerQty/
-- cumulativeQty/sampleQty per checkpoint) and job_cards.total_quantity.
-- This migration does NOT touch either column — inspection_plan stays
-- exactly what it was (configuration); this adds a second, independent
-- jsonb column for EXECUTION events, plus plain snapshot columns for
-- the print sign-off block and the completed-physical-document
-- attachment.
--
-- ARCHITECTURE DECISIONS (see chat for the full investigation):
--
-- 1. job_card_inspection_events (checkpoint EXECUTION log) — a REAL
--    child table, NOT a jsonb column. Revised after the migration
--    safety review flagged the original jsonb design (see below for
--    why) — this is the corrected version, replacing that column
--    entirely before this migration has ever been applied (safe to
--    edit in place, never applied/authorized).
--
--    Why NOT jsonb (the original design): a jsonb array on job_cards,
--    "append-only" only by application convention (read-current-array,
--    append, write-whole-array-back), has two real problems: (a)
--    nothing in the database stops a future write from overwriting or
--    truncating the array, so the audit-trail guarantee this feature
--    exists to provide would be purely a promise, not a fact; (b) a
--    genuine read-modify-write race — two inspectors completing two
--    DIFFERENT checkpoints on the same Job Card at nearly the same
--    time can silently lose one event (last write wins on the whole
--    array), which is a real, non-hypothetical risk for exactly the
--    multi-checkpoint, multi-person workflow this feature models.
--
--    Why a child table, and why it mirrors
--    project_qms_inspection_attempts specifically: that table is
--    THIS SAME CODEBASE's own already-proven answer to "an immutable,
--    per-event audit trail that must never lose or overwrite a
--    historical record" — genuinely insert-only at the database level
--    (RLS grants no UPDATE/DELETE at all, PLUS an explicit
--    BEFORE DELETE OR UPDATE trigger, prevent_qms_history_mutation(),
--    that raises on any attempt to modify a row). job_card_inspection_
--    events reuses that exact same trigger function (already generic —
--    parameterized on TG_TABLE_NAME, not tied to
--    project_qms_inspection_attempts specifically) rather than writing
--    a near-duplicate. One INSERT per inspection event means two
--    concurrent inspectors produce two independent rows — no
--    read-modify-write, no race, no possible event loss.
--
--    Deliberately NOT project_qms_inspection_attempts itself and NOT
--    project_qms_inspections — those remain Project+Production-Stage-
--    scoped (the "WHAT" — the QMS characteristic library, stage-gate
--    Pass/Fail, getStageInspectionGate()), a different, heavier,
--    differently-shaped concept this table has zero FK/interaction
--    with. job_card_inspection_events is purely Job-Card-scoped (the
--    "WHEN"), gated on the existing job_cards permission module, not
--    the QMS inspection_sheets one — matching how this migration's own
--    job-card-documents storage policies already gate on job_cards.
--
--    Column choices (deliberately NOT every column
--    project_qms_inspection_attempts has — only what Job Card
--    checkpoint execution actually needs):
--      checkpoint_id text — the job_cards.inspection_plan row's own
--        already-existing client-generated `id` (e.g. "insp-final-150")
--        — a stable, existing key, not a new identity scheme. Never a
--        quantity — the same quantity could theoretically appear at two
--        different checkpoint configurations over the Job Card's
--        lifetime (Total Quantity changes, a checkpoint gets deleted
--        and a new one added at the same number), so identity must be
--        the checkpoint's own id, not its quantity.
--      checkpoint_label / checkpoint_qty / source — SNAPSHOTTED at
--        inspection time (not re-read from inspection_plan later), so
--        a later configuration change (Total Quantity edited, a
--        checkpoint relabeled) can never retroactively alter what an
--        already-recorded historical event says happened.
--      inspected_by uuid (no FK) / inspected_by_name text — same
--        FK-less snapshot shape as job_cards.prepared_by_id/
--        prepared_by_name below (the more directly relevant precedent,
--        from the very same migration, over QMS's own text-typed
--        performed_by) — the application already resolves this from
--        the authenticated session.
--      No round_number/reinspection-attempt-numbering column: Job Card
--        checkpoint reinspection doesn't need a dedicated ordinal the
--        way QMS's per-characteristic attempts do; "the latest row for
--        this checkpoint_id, ordered by inspected_at" is sufficient and
--        is exactly how the application already derives current status.
--
-- 2. prepared_by_id / prepared_by_name — mirrors the exact
--    project_qms_inspections.created_by / created_by_name shape (plain
--    uuid, NO foreign key to auth.users — that table has no such FK
--    either, confirmed by inspecting its own constraints; every table
--    in this schema that snapshots "which authenticated user did this"
--    uses this same FK-less snapshot convention). Set ONCE, by the
--    application, at Job Card creation time, from the authenticated
--    session — never a manually-selected field, never editable
--    afterward.
--
-- 3. assigned_by_employee_id/name, in_process_check_employee_id/name,
--    qc_approved_by_employee_id/name — three independent optional FKs
--    into employees(id), ON DELETE SET NULL, with a display-name
--    snapshot alongside each — the exact real-FK-plus-display-snapshot
--    pattern already used for job_cards.employee_id/employee_name and
--    (from the previous migration) work_center_machine_id/
--    work_center_name. These are selected via the existing
--    EmployeeSelect component, same as Assigned Employee — deliberately
--    a DIFFERENT column from employee_id (Assigned Employee = the
--    worker performing the operation; these three = who assigned the
--    work, who ran the in-process check, who gave final QC approval).
--
-- 4. completed_document_* (six columns) — the scanned/photographed
--    physical Job Card, uploaded after shop-floor execution. Inspected
--    both existing candidate repositories first:
--      - asset_photos: image-only (jpeg/png/webp enforced in
--        assetPhotosApi.ts), and carries a whole background-removal/
--        thumbnail PROCESSING pipeline (processing_status,
--        processed_storage_path, cover_uses_processed,
--        processed_background_color) that has no meaning for a signed
--        paper scan — reusing it here would misuse that pipeline and
--        conflate "Reference Photo" with "Completed Physical Job Card",
--        which Part 14 of the spec explicitly requires stay separate.
--      - company_documents: right BUCKET pattern (private,
--        PDF+JPEG+PNG allowed, signed URLs) but wrong GRAIN — it is a
--        fixed compliance-document library (category, document_type,
--        expiry_date, is_tender_eligible) with no owner_id/entity
--        scoping at all; there is no way to attach one to "this exact
--        Job Card" without misusing columns that mean something else
--        entirely (e.g. is_tender_eligible on a shop-floor scan makes
--        no sense).
--    Given the described UX is explicitly single-attachment
--    (Upload / Replace / Remove — never a gallery, see Part 13), six
--    plain columns directly on job_cards is the minimal correct shape:
--    no new table, no new RLS policy (job_cards' own existing
--    organization_id + has_permission('job_cards', ...) policies
--    already cover every one of these columns at the row level), no
--    risk of an orphaned child-table row. "Replace" is simply
--    overwriting these six columns after deleting the previous Storage
--    object; "Remove" is setting them all back to NULL. A NEW private
--    bucket (job-card-documents) is created below, mirroring
--    company-documents' bucket-plus-org-folder-scoped-RLS pattern
--    exactly, reusing the existing job_cards permission module
--    (job_cards.view/edit) rather than inventing a new permission
--    module — this is not "a second competing file repository": it
--    fills a real gap (private PDF/scan storage, one file per Job
--    Card, using the SAME org-scoping and signed-URL conventions as
--    every other private bucket in this schema).
--
-- No change to any existing column, trigger, function, RLS policy, or
-- to inspection_plan/total_quantity/expected_quantity/expected_quantity_
-- override/work_center_*/priority/start_date from the previous
-- migration. No change to project_qms_inspections or any other QMS
-- table. Does not reapply 20260917100000_job_card_planning_fields.sql.

alter table public.job_cards
  add column if not exists prepared_by_id uuid,
  add column if not exists prepared_by_name text,
  add column if not exists assigned_by_employee_id uuid
    references public.employees(id) on delete set null,
  add column if not exists assigned_by_employee_name text,
  add column if not exists in_process_check_employee_id uuid
    references public.employees(id) on delete set null,
  add column if not exists in_process_check_employee_name text,
  add column if not exists qc_approved_by_employee_id uuid
    references public.employees(id) on delete set null,
  add column if not exists qc_approved_by_employee_name text,
  add column if not exists completed_document_storage_path text,
  add column if not exists completed_document_filename text,
  add column if not exists completed_document_mime_type text,
  add column if not exists completed_document_size_bytes bigint,
  add column if not exists completed_document_uploaded_by uuid,
  add column if not exists completed_document_uploaded_by_name text,
  add column if not exists completed_document_uploaded_at timestamptz;

comment on column public.job_cards.prepared_by_id is
  'The authenticated user who created this Job Card. Snapshot-only, no FK (matches project_qms_inspections.created_by) -- set once by the application at creation, never editable.';
comment on column public.job_cards.prepared_by_name is
  'Display-name snapshot of prepared_by_id at creation time.';
comment on column public.job_cards.assigned_by_employee_id is
  'Optional FK to employees(id) -- who assigned/instructed this work. Distinct from employee_id (the worker performing it). ON DELETE SET NULL, same convention as every other optional employee reference in this schema.';
comment on column public.job_cards.assigned_by_employee_name is
  'Display snapshot of assigned_by_employee_id at the time it was set.';
comment on column public.job_cards.in_process_check_employee_id is
  'Optional FK to employees(id) -- who is responsible for the in-process/QC check. ON DELETE SET NULL.';
comment on column public.job_cards.in_process_check_employee_name is
  'Display snapshot of in_process_check_employee_id at the time it was set.';
comment on column public.job_cards.qc_approved_by_employee_id is
  'Optional FK to employees(id) -- who gave final QC approval/sign-off. ON DELETE SET NULL.';
comment on column public.job_cards.qc_approved_by_employee_name is
  'Display snapshot of qc_approved_by_employee_id at the time it was set.';
comment on column public.job_cards.completed_document_storage_path is
  'Storage path (job-card-documents bucket) of the scanned/photographed, manually completed and signed physical Job Card. NULL = none uploaded. Distinct from reference_photo_id (expected-result photo) and from any Project Reference Photo -- this is evidence the physical paperwork was completed, not a work instruction.';
comment on column public.job_cards.completed_document_filename is
  'Original filename of the uploaded completed-document, for display.';
comment on column public.job_cards.completed_document_mime_type is
  'MIME type of the uploaded completed-document (application/pdf, image/jpeg, or image/png).';
comment on column public.job_cards.completed_document_size_bytes is
  'Byte size of the uploaded completed-document, for display.';
comment on column public.job_cards.completed_document_uploaded_by is
  'Snapshot-only uuid of who uploaded the completed-document, no FK (same convention as prepared_by_id).';
comment on column public.job_cards.completed_document_uploaded_by_name is
  'Display-name snapshot of completed_document_uploaded_by.';
comment on column public.job_cards.completed_document_uploaded_at is
  'When the completed-document was uploaded.';

-- Storage bucket + policies for the completed-physical-Job-Card
-- attachment -- same private-bucket-plus-org-folder-scoped-RLS pattern
-- as company-documents/asset-photos, reusing the EXISTING job_cards
-- permission module rather than inventing a new one. Path convention:
-- <organization_id>/<job_card_id>/<filename> -- the organization_id
-- folder segment is what RLS enforces; the job_card_id segment is an
-- application-level convention (mirrors asset_photos' owner_id folder
-- segment) that keeps one Job Card's attachment from ever colliding
-- with another's path.
insert into storage.buckets (id, name, public)
values ('job-card-documents', 'job-card-documents', false)
on conflict (id) do nothing;

drop policy if exists job_card_documents_storage_select on storage.objects;
create policy job_card_documents_storage_select on storage.objects
  for select using (
    bucket_id = 'job-card-documents'
    and (storage.foldername(name))[1] = (current_organization_id())::text
    and has_permission('job_cards', 'view')
  );

drop policy if exists job_card_documents_storage_insert on storage.objects;
create policy job_card_documents_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'job-card-documents'
    and (storage.foldername(name))[1] = (current_organization_id())::text
    and has_permission('job_cards', 'edit')
  );

drop policy if exists job_card_documents_storage_update on storage.objects;
create policy job_card_documents_storage_update on storage.objects
  for update using (
    bucket_id = 'job-card-documents'
    and (storage.foldername(name))[1] = (current_organization_id())::text
    and has_permission('job_cards', 'edit')
  );

drop policy if exists job_card_documents_storage_delete on storage.objects;
create policy job_card_documents_storage_delete on storage.objects
  for delete using (
    bucket_id = 'job-card-documents'
    and (storage.foldername(name))[1] = (current_organization_id())::text
    and has_permission('job_cards', 'edit')
  );

-- job_card_inspection_events — the checkpoint EXECUTION log, replacing
-- the originally-designed job_cards.inspection_events jsonb column (see
-- this file's own header for why). A real child table, one row per
-- completed inspection attempt at one checkpoint.
create table if not exists public.job_card_inspection_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default current_organization_id()
    references public.organizations(id),
  job_card_id uuid not null
    references public.job_cards(id) on delete cascade,
  -- The inspection_plan row's own existing client-generated `id` — see
  -- this file's header for why identity is the checkpoint's id, never
  -- its quantity.
  checkpoint_id text not null,
  -- Snapshotted at inspection time — never re-read from
  -- job_cards.inspection_plan later, so a later configuration change
  -- (Total Quantity edited, a checkpoint relabeled) can never
  -- retroactively alter what an already-recorded event says happened.
  checkpoint_label text not null,
  checkpoint_qty integer not null check (checkpoint_qty >= 0),
  source text not null check (source in ('manual', 'automatic', 'final')),
  result text not null check (result in ('Pass', 'Fail')),
  -- Snapshot-only, no FK -- same shape as job_cards.prepared_by_id
  -- above (the application resolves this from the authenticated
  -- session).
  inspected_by uuid,
  inspected_by_name text,
  remarks text,
  inspected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_job_card_inspection_events_job_card
  on public.job_card_inspection_events (job_card_id);
create index if not exists idx_job_card_inspection_events_checkpoint
  on public.job_card_inspection_events (job_card_id, checkpoint_id);

comment on table public.job_card_inspection_events is
  'Immutable, database-enforced (see trg_job_card_inspection_events_append_only) audit trail of Job Card checkpoint inspections -- one row per completed attempt. A checkpoint''s current status is derived by the application as the latest row for its checkpoint_id, ordered by inspected_at; an earlier Fail is never overwritten by a later Pass -- both rows remain. Independent of project_qms_inspections/project_qms_inspection_attempts (a different, Project+Production-Stage-scoped concept) -- this table has zero FK/relationship to any QMS table.';
comment on column public.job_card_inspection_events.checkpoint_id is
  'The job_cards.inspection_plan row''s own client-generated id -- never the checkpoint quantity, since a quantity can recur across different checkpoint configurations over the Job Card''s lifetime.';

alter table public.job_card_inspection_events enable row level security;

-- SELECT/INSERT gated on the existing job_cards permission module (not
-- QMS's inspection_sheets) -- this is Job-Card-scoped, matching how
-- this same migration's job-card-documents storage policies above
-- already gate on job_cards. Deliberately NO update/delete policy at
-- all (RLS default-denies both with none defined) -- belt-and-suspenders
-- with the trigger below, exactly mirroring
-- project_qms_inspection_attempts' own real, live policy set (insert +
-- select only, confirmed by inspecting it directly).
drop policy if exists job_card_inspection_events_select on public.job_card_inspection_events;
create policy job_card_inspection_events_select on public.job_card_inspection_events
  for select using (
    has_permission('job_cards', 'view')
    and organization_id = current_organization_id()
  );

drop policy if exists job_card_inspection_events_insert on public.job_card_inspection_events;
create policy job_card_inspection_events_insert on public.job_card_inspection_events
  for insert with check (
    has_permission('job_cards', 'edit')
    and organization_id = current_organization_id()
  );

-- Reuses the EXISTING, already-generic prevent_qms_history_mutation()
-- function (parameterized on TG_TABLE_NAME, not written specifically
-- for project_qms_inspection_attempts) rather than writing a
-- near-duplicate -- the exact same real, database-enforced
-- append-only guarantee that table already has.
drop trigger if exists trg_job_card_inspection_events_append_only
  on public.job_card_inspection_events;
create trigger trg_job_card_inspection_events_append_only
  before delete or update on public.job_card_inspection_events
  for each row execute function public.prevent_qms_history_mutation();
