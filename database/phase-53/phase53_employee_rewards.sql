-- Phase 53 (Group 2, roadmap Phase 13) — Employee Rewards / Merit.
--
-- A separate, minimal record of recognition/bonus given to an employee.
-- Deliberately NOT a duplicate of job_cards metrics (Phase 12's Performance
-- tab already derives quality/efficiency from job_cards directly) — this
-- table only stores the human decision to reward someone, optionally
-- pointing at the job card that justified it so the reward is auditable
-- back to a real performance record instead of being a bare log entry.
--
-- No "points"/gamification system — not requested, and would be
-- speculative without a concrete use case. amount is nullable because a
-- reward can be pure recognition (a note) with no monetary component.

begin;

create table if not exists public.employee_rewards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default current_organization_id(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  reward_type text not null check (reward_type in ('Bonus', 'Recognition', 'Warning')),
  title text not null,
  amount numeric,
  -- Optional traceability to the job card that justified this reward -
  -- e.g. an employee who hit 0 rejects across a run. Nullable: not every
  -- reward has to trace back to one specific job card.
  related_job_card_id uuid references public.job_cards(id) on delete set null,
  notes text,
  awarded_by uuid references auth.users(id) on delete set null,
  awarded_at date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists idx_employee_rewards_employee_id
  on public.employee_rewards(employee_id);
create index if not exists idx_employee_rewards_org_id
  on public.employee_rewards(organization_id);

alter table public.employee_rewards enable row level security;

drop policy if exists employee_rewards_select on public.employee_rewards;
create policy employee_rewards_select on public.employee_rewards
  for select using (
    organization_id = current_organization_id()
    and has_permission('employees', 'view')
  );

drop policy if exists employee_rewards_insert on public.employee_rewards;
create policy employee_rewards_insert on public.employee_rewards
  for insert with check (
    organization_id = current_organization_id()
    and has_permission('employees', 'edit')
  );

drop policy if exists employee_rewards_update on public.employee_rewards;
create policy employee_rewards_update on public.employee_rewards
  for update using (
    organization_id = current_organization_id()
    and has_permission('employees', 'edit')
  );

drop policy if exists employee_rewards_delete on public.employee_rewards;
create policy employee_rewards_delete on public.employee_rewards
  for delete using (
    organization_id = current_organization_id()
    and has_permission('employees', 'delete')
  );

insert into public.schema_migrations (version, description, checksum)
values (
  '20260902_053_phase53_employee_rewards',
  'Phase 53 (Group 2, roadmap Phase 13): new employee_rewards table - Bonus/Recognition/Warning records with optional amount and optional related_job_card_id for auditability back to real performance data. Does not duplicate job_cards metrics (Phase 12 Performance tab derives those directly). Standard org-scoped RLS via has_permission(employees, *).',
  'phase53-group2-v1'
)
on conflict (version) do nothing;

commit;
