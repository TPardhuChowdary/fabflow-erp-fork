-- FabFlow ERP — Phase 2: Employees
-- Adds: employees, attendance_records, salary_payments, advance_records,
-- employee_documents, project_employees (junction), document_counters
-- (organization-scoped, concurrency-safe numbering). Completes the
-- profiles.employee_id FK Phase 1 reserved. Zero changes to any existing
-- Phase 1 table's columns, indexes, policies, or triggers — the only
-- touch to a Phase-1 object is the additive FK on profiles.employee_id.
-- Idempotent: safe to run multiple times. Registers itself in
-- schema_migrations as its final statement, so that row's mere existence
-- is proof the whole transaction committed successfully.

begin;

-- ══════════════════════════════════════════════════════════════════════
-- 1. employees
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  name text not null,
  phone text not null,
  role text not null,
  monthly_salary numeric not null,
  joining_date date not null,
  photo_ref text,
  employee_code text,
  designation text,
  blood_group text,
  emergency_contact_name text,
  emergency_contact_relation text,
  emergency_contact_phone text,
  employee_type text,
  -- Soft-delete infrastructure only (approved, no enforcement/frontend
  -- behavior attached yet — see phase2_architecture.md §Out of Scope).
  is_active boolean not null default true,
  left_date date,
  termination_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_employees_org_code
  on public.employees (organization_id, employee_code)
  where employee_code is not null;

-- ══════════════════════════════════════════════════════════════════════
-- 2. document_counters — general-purpose, organization-scoped, monotonic
--    numbering (Phase 2 only seeds/uses the 'EMP' key; reusable by a
--    later phase for its own prefix without a redesign).
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.document_counters (
  organization_id uuid not null references public.organizations(id),
  counter_key text not null,
  current_value integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (organization_id, counter_key)
);

-- ══════════════════════════════════════════════════════════════════════
-- 3. generate_employee_code() — single atomic upsert, so Postgres's own
--    row-lock on the upsert target serializes concurrent callers with no
--    separate SELECT step to race on. Monotonic: never reuses a number
--    even if the resulting employee row is later deleted. Mirrors the
--    frontend's existing generateDocNo() format/semantics exactly
--    (EMP-YYYY-NNN, sequence never resets per year).
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.generate_employee_code(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value integer;
begin
  insert into public.document_counters (organization_id, counter_key, current_value)
  values (p_organization_id, 'EMP', 1)
  on conflict (organization_id, counter_key)
  do update set current_value = public.document_counters.current_value + 1
  returning current_value into v_value;

  return 'EMP-' || extract(year from now())::text || '-' || lpad(v_value::text, 3, '0');
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 4. attendance_records — unique(employee_id, date) formalizes the
--    upsert-by-day invariant the frontend's markAttendance() already
--    relies on. ON DELETE CASCADE closes a gap the frontend's own
--    deleteEmployee() doesn't currently guard (see phase2_architecture.md).
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  date date not null,
  status text not null,
  updated_at timestamptz not null default now(),
  unique (employee_id, date)
);

-- ══════════════════════════════════════════════════════════════════════
-- 5. salary_payments — ON DELETE RESTRICT matches deleteEmployee()'s
--    existing guard (blocks employee delete while salary rows exist).
--    advance_deductions kept as jsonb: always read/written as one unit
--    embedded in a single payment row, never queried independently.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.salary_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  month text not null,
  amount numeric not null,
  payment_date date not null,
  notes text,
  original_salary numeric,
  deducted_advance numeric,
  final_paid_amount numeric,
  advance_deductions jsonb,
  updated_at timestamptz not null default now()
);

-- ══════════════════════════════════════════════════════════════════════
-- 6. advance_records — ON DELETE RESTRICT matches deleteEmployee()'s
--    existing guard. signature_data stores the same base64 canvas image
--    the frontend's "Signatures" tab already reads directly from this
--    record (no separate signatures table/entity exists in the frontend).
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.advance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  amount numeric not null,
  date date not null,
  reason text not null,
  remaining_balance numeric not null,
  signature_data text,
  updated_at timestamptz not null default now()
);

-- ══════════════════════════════════════════════════════════════════════
-- 7. employee_documents — ON DELETE CASCADE matches deleteEmployee()'s
--    existing cascade of employeeDocuments. document_group_id +
--    superseded_at replicate the frontend's version-history pattern
--    exactly (a "Replace" inserts a new row and marks the old one
--    superseded; nothing is ever hard-deleted by a Replace).
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  document_group_id uuid not null,
  superseded_at timestamptz,
  document_name text not null,
  document_type text not null,
  file_data text not null,
  file_mime_type text not null,
  upload_date date not null,
  expiry_date date,
  notes text,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ══════════════════════════════════════════════════════════════════════
-- 8. project_employees — pure junction table, following the exact
--    precedent Phase 1 already established for role_permissions /
--    user_roles / user_permission_overrides: composite primary key, no
--    surrogate id, ON DELETE CASCADE both directions. Replaces the
--    originally-proposed projects.assigned_employee_ids uuid[] per
--    approved revision — a real FK relationship instead of an
--    unvalidated array, closing a referential-integrity gap the current
--    frontend array has today (a deleted employee's id can be left
--    dangling in another project's array with no error).
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.project_employees (
  project_id uuid not null references public.projects(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, employee_id)
);

-- ══════════════════════════════════════════════════════════════════════
-- 9. Complete the profiles.employee_id FK Phase 1 reserved (column and
--    its unique constraint already exist, added nullable/unconstrained
--    on purpose since employees didn't exist yet). Purely additive —
--    no other profiles column, policy, or trigger is touched.
-- ══════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_employee_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_employee_id_fkey
      foreign key (employee_id) references public.employees(id);
  end if;
end $$;

-- ══════════════════════════════════════════════════════════════════════
-- 10. updated_at maintenance.
--     NOTE: Phase 1's public.set_updated_at() also writes
--     NEW.updated_by, which none of the 7 tables below have — attaching
--     it unchanged would raise "record NEW has no field updated_by" on
--     every UPDATE. None of the three approved design rounds asked for
--     an updated_by column, so rather than add one unprompted, this
--     migration defines one new, minimal, timestamp-only function and
--     uses it for every Phase 2 table. Phase 1's set_updated_at() is not
--     modified and continues to run unchanged on profiles.
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_employees_updated_at on public.employees;
create trigger trg_employees_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_document_counters_updated_at on public.document_counters;
create trigger trg_document_counters_updated_at
  before update on public.document_counters
  for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_attendance_records_updated_at on public.attendance_records;
create trigger trg_attendance_records_updated_at
  before update on public.attendance_records
  for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_salary_payments_updated_at on public.salary_payments;
create trigger trg_salary_payments_updated_at
  before update on public.salary_payments
  for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_advance_records_updated_at on public.advance_records;
create trigger trg_advance_records_updated_at
  before update on public.advance_records
  for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_employee_documents_updated_at on public.employee_documents;
create trigger trg_employee_documents_updated_at
  before update on public.employee_documents
  for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_project_employees_updated_at on public.project_employees;
create trigger trg_project_employees_updated_at
  before update on public.project_employees
  for each row execute function public.set_updated_at_timestamp();

-- ══════════════════════════════════════════════════════════════════════
-- 11. employee_code immutability. Documented as policy in
--     phase2_architecture.md; enforced here since implementation
--     requires it (any user with employees.edit could otherwise
--     silently overwrite a generated code via a normal UPDATE — RLS
--     alone doesn't distinguish "editing a name" from "editing a code").
--     Reuses Phase 1's existing is_admin flag on roles as the "Super
--     Admin" concept named in the approved design, rather than inventing
--     a new privilege tier — the same bypass has_permission() already
--     grants full access to.
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.prevent_employee_code_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.employee_code is not null and new.employee_code is distinct from old.employee_code then
    if not exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid() and r.is_admin
    ) then
      raise exception 'employee_code is immutable once set; only a Super Admin can change it';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_employee_code_change on public.employees;
create trigger trg_prevent_employee_code_change
  before update on public.employees
  for each row execute function public.prevent_employee_code_change();

-- ══════════════════════════════════════════════════════════════════════
-- 12. RLS + policies. All 7 tables scoped to the 'employees' permission
--     module — confirmed live against the actual frontend, not assumed:
--     EmployeeDetail.tsx gates every one of its tabs (Overview, ID Card,
--     Attendance, Salary & Advances, Signatures, Documents) via
--     employees.view/employees.edit alone. The 'salary_advance'
--     permission module exists in the seeded permissions table (a
--     transcription of the full frontend taxonomy) but is not referenced
--     by any current page — using it here would invent a distinction the
--     live app doesn't make. employee_documents' insert additionally
--     allows employees.upload (its dedicated 5th action).
--     project_employees' write policies require BOTH projects.edit AND
--     employees.view, per approved design — read stays projects.view
--     alone (viewing an assignment is a project-visibility concern; an
--     employee's own visibility isn't disclosed by seeing that a row
--     exists, only by being able to create one against an id the
--     policies would otherwise let go unseen).
-- ══════════════════════════════════════════════════════════════════════

alter table public.employees enable row level security;
drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees for select using (has_permission('employees','view') and organization_id = current_organization_id());
drop policy if exists employees_insert on public.employees;
create policy employees_insert on public.employees for insert with check (has_permission('employees','create') and organization_id = current_organization_id());
drop policy if exists employees_update on public.employees;
create policy employees_update on public.employees for update using (has_permission('employees','edit') and organization_id = current_organization_id());
drop policy if exists employees_delete on public.employees;
create policy employees_delete on public.employees for delete using (has_permission('employees','delete') and organization_id = current_organization_id());

alter table public.attendance_records enable row level security;
drop policy if exists attendance_records_select on public.attendance_records;
create policy attendance_records_select on public.attendance_records for select using (has_permission('employees','view') and organization_id = current_organization_id());
drop policy if exists attendance_records_insert on public.attendance_records;
create policy attendance_records_insert on public.attendance_records for insert with check (has_permission('employees','edit') and organization_id = current_organization_id());
drop policy if exists attendance_records_update on public.attendance_records;
create policy attendance_records_update on public.attendance_records for update using (has_permission('employees','edit') and organization_id = current_organization_id());
drop policy if exists attendance_records_delete on public.attendance_records;
create policy attendance_records_delete on public.attendance_records for delete using (has_permission('employees','delete') and organization_id = current_organization_id());

alter table public.salary_payments enable row level security;
drop policy if exists salary_payments_select on public.salary_payments;
create policy salary_payments_select on public.salary_payments for select using (has_permission('employees','view') and organization_id = current_organization_id());
drop policy if exists salary_payments_insert on public.salary_payments;
create policy salary_payments_insert on public.salary_payments for insert with check (has_permission('employees','edit') and organization_id = current_organization_id());
drop policy if exists salary_payments_update on public.salary_payments;
create policy salary_payments_update on public.salary_payments for update using (has_permission('employees','edit') and organization_id = current_organization_id());
drop policy if exists salary_payments_delete on public.salary_payments;
create policy salary_payments_delete on public.salary_payments for delete using (has_permission('employees','delete') and organization_id = current_organization_id());

alter table public.advance_records enable row level security;
drop policy if exists advance_records_select on public.advance_records;
create policy advance_records_select on public.advance_records for select using (has_permission('employees','view') and organization_id = current_organization_id());
drop policy if exists advance_records_insert on public.advance_records;
create policy advance_records_insert on public.advance_records for insert with check (has_permission('employees','edit') and organization_id = current_organization_id());
drop policy if exists advance_records_update on public.advance_records;
create policy advance_records_update on public.advance_records for update using (has_permission('employees','edit') and organization_id = current_organization_id());
drop policy if exists advance_records_delete on public.advance_records;
create policy advance_records_delete on public.advance_records for delete using (has_permission('employees','delete') and organization_id = current_organization_id());

alter table public.employee_documents enable row level security;
drop policy if exists employee_documents_select on public.employee_documents;
create policy employee_documents_select on public.employee_documents for select using (has_permission('employees','view') and organization_id = current_organization_id());
drop policy if exists employee_documents_insert on public.employee_documents;
create policy employee_documents_insert on public.employee_documents for insert with check ((has_permission('employees','upload') or has_permission('employees','edit')) and organization_id = current_organization_id());
drop policy if exists employee_documents_update on public.employee_documents;
create policy employee_documents_update on public.employee_documents for update using (has_permission('employees','edit') and organization_id = current_organization_id());
drop policy if exists employee_documents_delete on public.employee_documents;
create policy employee_documents_delete on public.employee_documents for delete using (has_permission('employees','delete') and organization_id = current_organization_id());

alter table public.project_employees enable row level security;
drop policy if exists project_employees_select on public.project_employees;
create policy project_employees_select on public.project_employees for select using (has_permission('projects','view') and organization_id = current_organization_id());
drop policy if exists project_employees_insert on public.project_employees;
create policy project_employees_insert on public.project_employees for insert with check (has_permission('projects','edit') and has_permission('employees','view') and organization_id = current_organization_id());
drop policy if exists project_employees_update on public.project_employees;
create policy project_employees_update on public.project_employees for update using (has_permission('projects','edit') and has_permission('employees','view') and organization_id = current_organization_id());
drop policy if exists project_employees_delete on public.project_employees;
create policy project_employees_delete on public.project_employees for delete using (has_permission('projects','edit') and has_permission('employees','view') and organization_id = current_organization_id());

-- document_counters is written only by generate_employee_code()
-- (SECURITY DEFINER, bypasses RLS by design — same rationale as every
-- other Phase 1 helper touching a table its caller shouldn't need direct
-- access to). No end-user-facing policy is needed; RLS is enabled with
-- zero policies, matching the same default-deny posture Phase 1's
-- schema_migrations table already has for an identical reason.
alter table public.document_counters enable row level security;

-- ══════════════════════════════════════════════════════════════════════
-- 13. Indexes — every one leads with organization_id, matching Phase 1's
--     documented rationale (RLS makes it a mandatory filter on every
--     query). Each serves a real, confirmed frontend query pattern.
-- ══════════════════════════════════════════════════════════════════════

create index if not exists idx_employees_org_name on public.employees (organization_id, name);
create index if not exists idx_attendance_records_org_employee on public.attendance_records (organization_id, employee_id);
create index if not exists idx_salary_payments_org_employee on public.salary_payments (organization_id, employee_id);
create index if not exists idx_advance_records_org_employee on public.advance_records (organization_id, employee_id);
create index if not exists idx_employee_documents_org_employee on public.employee_documents (organization_id, employee_id);
create index if not exists idx_employee_documents_group on public.employee_documents (document_group_id);
create index if not exists idx_project_employees_org_project on public.project_employees (organization_id, project_id);

-- ══════════════════════════════════════════════════════════════════════
-- 14. Register this migration. Deliberately the last statement before
--     commit — its presence in schema_migrations after a run is proof
--     the entire transaction above succeeded, not just that it started.
--     Checksum is the SHA-256 of this file's content (sections 1-13,
--     i.e. everything above this statement), computed at authoring time.
-- ══════════════════════════════════════════════════════════════════════

insert into public.schema_migrations (version, description, checksum)
values (
  '20260806_002_phase2_employees',
  'Phase 2: employees, attendance_records, salary_payments, advance_records, employee_documents, project_employees (junction, replaces array-based assignment), document_counters (organization-scoped concurrency-safe numbering), generate_employee_code(), employee_code immutability enforcement, completion of profiles.employee_id FK reserved by Phase 1, RLS + org-scoped policies on all 7 new tables',
  'c81352762b7cf43935dc02b299039daa1a0e1bc4bfa350cf4e3b2bea5a19949b'
)
on conflict (version) do nothing;

commit;
