-- Phase 55 (Group 2, roadmap Phase 17) — Company Document Library.
--
-- A reusable, company-wide document repository (GST/PAN/MSME/ISO/Work
-- Orders/Vendor Certificates/Machinery lists/etc.) distinct from every
-- other per-project or per-asset document store already in this schema
-- (engineering-drawings, qms-inspection-documents, agent-documents). No
-- documents are fabricated by this migration - the table starts empty;
-- someone uploads the real ones through the new UI.
--
-- New permission module 'company_documents' (view/create/edit/delete),
-- NOT granted to any non-admin role by default - same pattern as the
-- existing 'email' module (Admin bypasses has_permission entirely; other
-- roles get it only if explicitly granted later via Settings > Users).

begin;

create table if not exists public.company_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default current_organization_id(),
  -- Broad grouping (Registration / Certification / Compliance / Financial
  -- / Machinery / Other) - free text, not an enum, since the real set of
  -- categories a business needs varies and shouldn't require a migration
  -- to extend.
  category text not null,
  -- The specific kind within that category, e.g. "GST Certificate",
  -- "ISO 9001:2015", "MSME Registration".
  document_type text not null,
  title text not null,
  issue_date date,
  expiry_date date,
  version text,
  status text not null default 'Active'
    check (status in ('Active', 'Superseded', 'Draft')),
  -- Phase 18/19+ (Document Health, Tender Management) read this to decide
  -- which documents are eligible to attach to a tender's final PDF pack.
  is_tender_eligible boolean not null default false,
  storage_path text not null,
  original_filename text,
  mime_type text,
  size_bytes bigint,
  notes text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_company_documents_org_id
  on public.company_documents(organization_id);
create index if not exists idx_company_documents_category
  on public.company_documents(organization_id, category);
create index if not exists idx_company_documents_expiry
  on public.company_documents(organization_id, expiry_date);

alter table public.company_documents enable row level security;

drop policy if exists company_documents_select on public.company_documents;
create policy company_documents_select on public.company_documents
  for select using (
    organization_id = current_organization_id()
    and has_permission('company_documents', 'view')
  );

drop policy if exists company_documents_insert on public.company_documents;
create policy company_documents_insert on public.company_documents
  for insert with check (
    organization_id = current_organization_id()
    and has_permission('company_documents', 'create')
  );

drop policy if exists company_documents_update on public.company_documents;
create policy company_documents_update on public.company_documents
  for update using (
    organization_id = current_organization_id()
    and has_permission('company_documents', 'edit')
  );

drop policy if exists company_documents_delete on public.company_documents;
create policy company_documents_delete on public.company_documents
  for delete using (
    organization_id = current_organization_id()
    and has_permission('company_documents', 'delete')
  );

-- Storage bucket + policies, same private-bucket-plus-org-scoped-folder
-- pattern as asset-photos (database/phase-51).
insert into storage.buckets (id, name, public)
values ('company-documents', 'company-documents', false)
on conflict (id) do nothing;

drop policy if exists company_documents_storage_select on storage.objects;
create policy company_documents_storage_select on storage.objects
  for select using (
    bucket_id = 'company-documents'
    and (storage.foldername(name))[1] = (current_organization_id())::text
    and has_permission('company_documents', 'view')
  );

drop policy if exists company_documents_storage_insert on storage.objects;
create policy company_documents_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'company-documents'
    and (storage.foldername(name))[1] = (current_organization_id())::text
    and has_permission('company_documents', 'create')
  );

drop policy if exists company_documents_storage_update on storage.objects;
create policy company_documents_storage_update on storage.objects
  for update using (
    bucket_id = 'company-documents'
    and (storage.foldername(name))[1] = (current_organization_id())::text
    and has_permission('company_documents', 'edit')
  );

drop policy if exists company_documents_storage_delete on storage.objects;
create policy company_documents_storage_delete on storage.objects
  for delete using (
    bucket_id = 'company-documents'
    and (storage.foldername(name))[1] = (current_organization_id())::text
    and has_permission('company_documents', 'delete')
  );

-- Seed the permission module itself (view/create/edit/delete). Not granted
-- to any non-admin role here - same as 'email'.
insert into public.permissions (module, action, label, category)
values
  ('company_documents', 'view', 'View Company Document Library', 'System'),
  ('company_documents', 'create', 'Add Company Documents', 'System'),
  ('company_documents', 'edit', 'Edit Company Documents', 'System'),
  ('company_documents', 'delete', 'Delete Company Documents', 'System')
on conflict (module, action) do nothing;

insert into public.schema_migrations (version, description, checksum)
values (
  '20260902_055_phase55_company_document_library',
  'Phase 55 (Group 2, roadmap Phase 17): new company_documents table (category/document_type/title/issue_date/expiry_date/version/status/is_tender_eligible/storage_path), new private company-documents Storage bucket + org-scoped RLS, new company_documents permission module (view/create/edit/delete, admin-only until explicitly granted). No documents seeded - table starts empty.',
  'phase55-group2-v1'
)
on conflict (version) do nothing;

commit;
