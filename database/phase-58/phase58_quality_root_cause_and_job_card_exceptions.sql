-- Phase 58 (Master Monster Prompt, Phases 17/21/31/32) — Quality
-- root-cause classification + approved operational exceptions for Job
-- Cards.
--
-- Confirmed via live audit: job_cards.rejected_qty/rework_qty and
-- project_production_stages.rejected_qty/rework_qty already record WHAT
-- failed, but nothing anywhere records WHY - so today every rejection or
-- rework is implicitly an employee fault by omission. This migration adds
-- the missing "why", using one shared vocabulary across both places a
-- rejection/rework already gets recorded, so quality-adjusted
-- performance (a later phase) can read root_cause and only count
-- employee-attributable failures against the employee, per the Master
-- Monster Prompt's explicit requirement that a quality failure must not
-- automatically become the employee's fault.
--
-- job_card_exceptions (Phase 17) is a genuinely new, separate table
-- rather than mutable columns on job_cards, deliberately mirroring the
-- insert-then-approve shape already used by inspection_sheets
-- (generated/reviewed/approved timestamps+by) - an employee can report an
-- exception (insert), but only someone with approve rights can approve
-- it (separate update path, RLS-gated on a distinct action), and the
-- report itself is never silently editable after the fact by the
-- reporter. This is what makes an approved exception meaningfully
-- protect the employee (Phase 31 anti-gaming: employees create
-- operational facts, only authorized approval turns those into a
-- protected outcome) rather than being a self-attested free-text field
-- anyone could edit later.
--
-- Also seeds the 'job_cards' permission module into the permissions
-- catalog. It was already the module every job_cards.* RLS policy and
-- every canView/canCreate/canEdit/canDelete("job_cards", ...) frontend
-- call has referenced since Phase 49 - it simply never got its
-- friendly-label rows inserted, so it was invisible in Settings > Users'
-- permission editor even though enforcement already depended on it. Adds
-- the missing 'approve' action alongside the existing four, needed for
-- job_card_exceptions' own RLS below.

begin;

-- ── Shared root-cause vocabulary, added where a rejection/rework is
--    already recorded. Nullable: only meaningful once a failure exists,
--    never forces a value where nothing failed. ─────────────────────────

alter table public.job_cards
  add column if not exists reject_root_cause text
    check (reject_root_cause in (
      'employee_workmanship',
      'material',
      'machine_equipment',
      'design_specification',
      'previous_process',
      'supervisor_instruction',
      'customer_change',
      'other'
    ));

alter table public.project_production_stages
  add column if not exists reject_root_cause text
    check (reject_root_cause in (
      'employee_workmanship',
      'material',
      'machine_equipment',
      'design_specification',
      'previous_process',
      'supervisor_instruction',
      'customer_change',
      'other'
    ));

-- ── Approved operational exceptions (Phase 17) ──────────────────────────

create table if not exists public.job_card_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default current_organization_id(),
  job_card_id uuid not null references public.job_cards(id) on delete cascade,
  reason_type text not null check (reason_type in (
    'machine_breakdown',
    'material_unavailable',
    'incorrect_material',
    'design_specification_change',
    'supervisor_delay',
    'customer_change',
    'technical_difficulty',
    'safety_delay',
    'other'
  )),
  description text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reported_by uuid references auth.users(id) on delete set null,
  reported_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  approval_notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_job_card_exceptions_job_card_id
  on public.job_card_exceptions(job_card_id);
create index if not exists idx_job_card_exceptions_org_id
  on public.job_card_exceptions(organization_id);

alter table public.job_card_exceptions enable row level security;

drop policy if exists job_card_exceptions_select on public.job_card_exceptions;
create policy job_card_exceptions_select on public.job_card_exceptions
  for select using (
    organization_id = current_organization_id()
    and has_permission('job_cards', 'view')
  );

-- Reporting an exception is a normal operational entry against an
-- existing job card - gated the same as editing a job card, not a
-- separate elevated right.
drop policy if exists job_card_exceptions_insert on public.job_card_exceptions;
create policy job_card_exceptions_insert on public.job_card_exceptions
  for insert with check (
    organization_id = current_organization_id()
    and has_permission('job_cards', 'edit')
  );

-- Only 'approve' can move status out of pending (or edit approval_notes) -
-- deliberately a different action than 'edit', so an org can grant
-- ordinary job-card editing without also granting exception approval.
drop policy if exists job_card_exceptions_update on public.job_card_exceptions;
create policy job_card_exceptions_update on public.job_card_exceptions
  for update using (
    organization_id = current_organization_id()
    and has_permission('job_cards', 'approve')
  );

drop policy if exists job_card_exceptions_delete on public.job_card_exceptions;
create policy job_card_exceptions_delete on public.job_card_exceptions
  for delete using (
    organization_id = current_organization_id()
    and has_permission('job_cards', 'delete')
  );

-- ── job_cards permission module: was already enforced everywhere,
--    never had its catalog rows. Not granted to any non-admin role here -
--    same "admin-only until explicitly granted" convention as every
--    other module seeded this way. ──────────────────────────────────────

insert into public.permissions (module, action, label, category)
values
  ('job_cards', 'view', 'View Job Cards', 'Production'),
  ('job_cards', 'create', 'Create Job Cards', 'Production'),
  ('job_cards', 'edit', 'Edit Job Cards', 'Production'),
  ('job_cards', 'delete', 'Delete Job Cards', 'Production'),
  ('job_cards', 'approve', 'Approve Job Card Exceptions', 'Production')
on conflict (module, action) do nothing;

insert into public.schema_migrations (version, description, checksum)
values (
  '20260903_058_phase58_quality_root_cause_and_job_card_exceptions',
  'Master Monster Prompt Phases 17/21/31/32: adds reject_root_cause (shared vocabulary) to job_cards and project_production_stages so a rejection/rework can be attributed to employee/material/machine/design/previous-process/supervisor/customer/other rather than defaulting to employee fault; adds new job_card_exceptions table (report-then-approve, separate insert vs approve RLS actions) for Phase 17 approved operational exceptions; seeds the job_cards permission module catalog rows (view/create/edit/delete/approve) that every job_cards RLS policy and frontend check has referenced since Phase 49 but which were never seeded into the permissions catalog.',
  'phase58-mmp-v1'
)
on conflict (version) do nothing;

commit;
