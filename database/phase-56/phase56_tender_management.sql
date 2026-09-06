-- Phase 56 (Group 2, roadmap Phases 19-24) — Tender Management + AI
-- Document Intelligence, foundation schema.
--
-- Two tables:
--   tenders             — one row per tender being tracked/bid on.
--   tender_requirements — the extracted/entered checklist for one tender,
--                         each row matched (or not) against the Company
--                         Document Library (Phase 55/17).
--
-- Deliberately reuses existing architecture rather than inventing new:
--   - customer_id is a real FK to customers (nullable — many tenders are
--     issued by a government/authority that isn't in the Customers table
--     at all; authority_name carries that case as free text).
--   - matched_company_document_id is a real FK to company_documents
--     (Phase 55). Per Phase 21's explicit requirement, the match is
--     SNAPSHOTTED (matched_document_title/matched_document_expiry copied
--     at match time) so a later edit/expiry-change in the library does
--     not silently alter an already-prepared tender's checklist — the
--     live FK is kept too, only for "open the matched document," never
--     re-read to overwrite the snapshot.
--   - activity_log jsonb column mirrors projects.activity_log exactly
--     (Phase 18/monster-2 precedent) rather than a new audit table.
--   - status vocabulary on tender_requirements matches Phase 21's spec
--     verbatim: AVAILABLE / MISSING / EXPIRED / EXPIRING_SOON /
--     NEEDS_REVIEW.
--
-- New private Storage bucket 'tender-documents' holds the tender's own
-- source PDF(s) (inbound, from the authority — NOT the same thing as
-- company_documents, which are the company's own outbound certificates)
-- and, once generated, the assembled Final Tender PDF Pack (Phase 23).

begin;

create table if not exists public.tenders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default current_organization_id(),
  tender_number text not null,
  title text not null,
  customer_id uuid references public.customers(id) on delete set null,
  authority_name text,
  portal text,
  bid_type text,
  submission_deadline timestamptz,
  opening_date timestamptz,
  technical_requirements_summary text,
  financial_requirements_summary text,
  emd_amount numeric,
  emd_details text,
  status text not null default 'Draft'
    check (status in ('Draft', 'In Progress', 'Submitted', 'Won', 'Lost', 'Withdrawn')),
  -- The tender's own source document(s), as uploaded — the thing Phase 20
  -- ingests. Nullable: a tender can be created before the PDF is attached.
  source_document_storage_path text,
  source_document_filename text,
  -- Phase 23's assembled output, once generated.
  final_pack_storage_path text,
  final_pack_generated_at timestamptz,
  activity_log jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tender_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default current_organization_id(),
  tender_id uuid not null references public.tenders(id) on delete cascade,
  -- Actual tender wording, preserved verbatim per Phase 20's explicit
  -- instruction - never paraphrased away.
  requirement_text text not null,
  category text not null default 'Other'
    check (category in (
      'Eligibility', 'Technical', 'Financial', 'Document', 'Certificate',
      'Declaration', 'Schedule', 'EMD', 'Portal', 'Format', 'Other'
    )),
  is_mandatory boolean not null default true,
  -- Lower sorts first - Phase 22's priority order (mandatory-missing
  -- first, etc.) is computed from this plus status, not stored as a
  -- separate label.
  priority integer not null default 100,
  status text not null default 'NEEDS_REVIEW'
    check (status in ('AVAILABLE', 'MISSING', 'EXPIRED', 'EXPIRING_SOON', 'NEEDS_REVIEW')),
  matched_company_document_id uuid references public.company_documents(id) on delete set null,
  matched_document_title text,
  matched_document_expiry date,
  action_needed text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tenders_org_id on public.tenders(organization_id);
create index if not exists idx_tenders_status on public.tenders(organization_id, status);
create index if not exists idx_tender_requirements_tender_id
  on public.tender_requirements(tender_id);
create index if not exists idx_tender_requirements_org_id
  on public.tender_requirements(organization_id);

alter table public.tenders enable row level security;
alter table public.tender_requirements enable row level security;

drop policy if exists tenders_select on public.tenders;
create policy tenders_select on public.tenders
  for select using (
    organization_id = current_organization_id() and has_permission('tenders', 'view')
  );
drop policy if exists tenders_insert on public.tenders;
create policy tenders_insert on public.tenders
  for insert with check (
    organization_id = current_organization_id() and has_permission('tenders', 'create')
  );
drop policy if exists tenders_update on public.tenders;
create policy tenders_update on public.tenders
  for update using (
    organization_id = current_organization_id() and has_permission('tenders', 'edit')
  );
drop policy if exists tenders_delete on public.tenders;
create policy tenders_delete on public.tenders
  for delete using (
    organization_id = current_organization_id() and has_permission('tenders', 'delete')
  );

drop policy if exists tender_requirements_select on public.tender_requirements;
create policy tender_requirements_select on public.tender_requirements
  for select using (
    organization_id = current_organization_id() and has_permission('tenders', 'view')
  );
drop policy if exists tender_requirements_insert on public.tender_requirements;
create policy tender_requirements_insert on public.tender_requirements
  for insert with check (
    organization_id = current_organization_id() and has_permission('tenders', 'edit')
  );
drop policy if exists tender_requirements_update on public.tender_requirements;
create policy tender_requirements_update on public.tender_requirements
  for update using (
    organization_id = current_organization_id() and has_permission('tenders', 'edit')
  );
drop policy if exists tender_requirements_delete on public.tender_requirements;
create policy tender_requirements_delete on public.tender_requirements
  for delete using (
    organization_id = current_organization_id() and has_permission('tenders', 'edit')
  );

insert into storage.buckets (id, name, public)
values ('tender-documents', 'tender-documents', false)
on conflict (id) do nothing;

drop policy if exists tender_documents_storage_select on storage.objects;
create policy tender_documents_storage_select on storage.objects
  for select using (
    bucket_id = 'tender-documents'
    and (storage.foldername(name))[1] = (current_organization_id())::text
    and has_permission('tenders', 'view')
  );
drop policy if exists tender_documents_storage_insert on storage.objects;
create policy tender_documents_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'tender-documents'
    and (storage.foldername(name))[1] = (current_organization_id())::text
    and has_permission('tenders', 'edit')
  );
drop policy if exists tender_documents_storage_update on storage.objects;
create policy tender_documents_storage_update on storage.objects
  for update using (
    bucket_id = 'tender-documents'
    and (storage.foldername(name))[1] = (current_organization_id())::text
    and has_permission('tenders', 'edit')
  );
drop policy if exists tender_documents_storage_delete on storage.objects;
create policy tender_documents_storage_delete on storage.objects
  for delete using (
    bucket_id = 'tender-documents'
    and (storage.foldername(name))[1] = (current_organization_id())::text
    and has_permission('tenders', 'delete')
  );

insert into public.permissions (module, action, label, category)
values
  ('tenders', 'view', 'View Tenders', 'System'),
  ('tenders', 'create', 'Create Tenders', 'System'),
  ('tenders', 'edit', 'Edit Tenders / Requirements', 'System'),
  ('tenders', 'delete', 'Delete Tenders', 'System')
on conflict (module, action) do nothing;

insert into public.schema_migrations (version, description, checksum)
values (
  '20260902_056_phase56_tender_management',
  'Phase 56 (Group 2, roadmap Phases 19-24 foundation): new tenders + tender_requirements tables, new private tender-documents Storage bucket, new tenders permission module (view/create/edit/delete, admin-only until explicitly granted). Requirement status vocabulary matches Phase 21 spec verbatim (AVAILABLE/MISSING/EXPIRED/EXPIRING_SOON/NEEDS_REVIEW). Document matches snapshotted (matched_document_title/expiry) so later company_documents edits do not silently alter an already-prepared tender.',
  'phase56-group2-v1'
)
on conflict (version) do nothing;

commit;
