-- Multiple Job Card Employees — Option A: simple assignment (see chat,
-- "Employee Architecture Review" — approved). REVIEW ONLY, NOT APPLIED.
-- Do not run supabase db push against this file until explicitly approved.
--
-- Requirement: several employees can physically co-work one Job Card
-- (e.g. four employees holding/working the same heavy sheet). It stays
-- ONE Job Card with ONE elapsed duration. job_cards.active_seconds /
-- current_run_started_at / status and enforce_job_card_timer_transition()
-- remain the sole, authoritative elapsed-time source — nothing here
-- adds a second clock. If labour-minutes accounting is ever needed it is
-- derived as job_cards.active_seconds x count(assignments), computed at
-- query time, never stored — so it can never be misread as hours.
--
-- job_card_employee_assignments is a plain roster: who is on this Job
-- Card. No status, no timer columns, no trigger, no event history of
-- its own. job_cards.employee_id is untouched, for backward
-- compatibility with every existing Job Card.

create table public.job_card_employee_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  job_card_id uuid not null references public.job_cards(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  employee_name text not null,
  role_description text,
  created_at timestamptz not null default now(),
  constraint uq_job_card_employee_assignments_card_employee unique (job_card_id, employee_id)
);

create index idx_job_card_employee_assignments_org_card
  on public.job_card_employee_assignments (organization_id, job_card_id);
create index idx_job_card_employee_assignments_employee
  on public.job_card_employee_assignments (employee_id);

-- RLS: exact mirror of job_cards' own has_permission('job_cards', verb)
-- + org-match pattern.
alter table public.job_card_employee_assignments enable row level security;

create policy job_card_employee_assignments_select on public.job_card_employee_assignments
  for select using (
    has_permission('job_cards', 'view') and organization_id = current_organization_id()
  );

create policy job_card_employee_assignments_insert on public.job_card_employee_assignments
  for insert with check (
    has_permission('job_cards', 'edit') and organization_id = current_organization_id()
  );

create policy job_card_employee_assignments_update on public.job_card_employee_assignments
  for update using (
    has_permission('job_cards', 'edit') and organization_id = current_organization_id()
  ) with check (
    has_permission('job_cards', 'edit') and organization_id = current_organization_id()
  );

create policy job_card_employee_assignments_delete on public.job_card_employee_assignments
  for delete using (
    has_permission('job_cards', 'delete') and organization_id = current_organization_id()
  );
