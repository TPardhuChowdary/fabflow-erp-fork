-- FabFlow ERP — Phase 40: Machine / Service Revenue (master scope
-- §17-28).
--
-- Structural guarantee, enforced by this schema (not just app logic):
-- revenue is revenue-only, never profit/costing, and it lives on the
-- *billable service*, never the machine directly.
--   - billable_services.machine_id is OPTIONAL (nullable). A machine
--     may have zero, one, or several services; a process-level service
--     (e.g. "Powder Coating") may reference no machine at all.
--   - No column here computes or stores cost, margin, labour,
--     electricity, maintenance, or depreciation - only rate and
--     revenue_amount (both currency, both zero-cost concepts).
--   - machine_service_rate_history is INSERT-ONLY (no update/delete
--     policy at all): a rate can only ever be superseded by a new row
--     with a later effective_from, never edited or removed, so past
--     revenue can never silently change.
--   - machine_service_usage freezes rate_applied and revenue_amount at
--     insert time (application-computed, not a generated column, so a
--     later rate change never recalculates a historical usage row).
--   - Nothing here reads project_machinery/project_dies (Phase 39) or
--     writes to them. Assigning a machine to a project creates zero
--     rows in any table below - assignment and revenue are completely
--     unconnected code paths.
--
-- Idempotent: safe to run multiple times.

begin;

-- ══════════════════════════════════════════════════════════════════════
-- 1. billable_services
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.billable_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  name text not null,
  machine_id uuid references public.machines(id) on delete set null,
  charging_method text not null check (charging_method in (
    'hour', 'piece', 'bend', 'kg', 'other'
  )),
  unit_label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_billable_services_org on public.billable_services (organization_id);
create index if not exists idx_billable_services_org_machine on public.billable_services (organization_id, machine_id);

drop trigger if exists trg_billable_services_updated_at on public.billable_services;
create trigger trg_billable_services_updated_at
  before update on public.billable_services
  for each row execute function public.set_updated_at_timestamp();

alter table public.billable_services enable row level security;

drop policy if exists billable_services_select on public.billable_services;
create policy billable_services_select on public.billable_services for select
  using (has_permission('machine_revenue', 'view') and organization_id = current_organization_id());

drop policy if exists billable_services_insert on public.billable_services;
create policy billable_services_insert on public.billable_services for insert
  with check (has_permission('machine_revenue', 'create') and organization_id = current_organization_id());

drop policy if exists billable_services_update on public.billable_services;
create policy billable_services_update on public.billable_services for update
  using (has_permission('machine_revenue', 'edit') and organization_id = current_organization_id())
  with check (has_permission('machine_revenue', 'edit') and organization_id = current_organization_id());

drop policy if exists billable_services_delete on public.billable_services;
create policy billable_services_delete on public.billable_services for delete
  using (has_permission('machine_revenue', 'delete') and organization_id = current_organization_id());

-- ══════════════════════════════════════════════════════════════════════
-- 2. machine_service_rate_history — insert-only. No update/delete
--    policy is defined at all, so no role (other than direct DB
--    superuser access) can ever modify or remove a past rate.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.machine_service_rate_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  billable_service_id uuid not null references public.billable_services(id) on delete cascade,
  rate numeric not null check (rate >= 0),
  effective_from timestamptz not null default now(),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_service_rate_history_org on public.machine_service_rate_history (organization_id);
create index if not exists idx_service_rate_history_service on public.machine_service_rate_history (billable_service_id, effective_from desc);

alter table public.machine_service_rate_history enable row level security;

drop policy if exists machine_service_rate_history_select on public.machine_service_rate_history;
create policy machine_service_rate_history_select on public.machine_service_rate_history for select
  using (has_permission('machine_revenue', 'view') and organization_id = current_organization_id());

drop policy if exists machine_service_rate_history_insert on public.machine_service_rate_history;
create policy machine_service_rate_history_insert on public.machine_service_rate_history for insert
  with check (has_permission('machine_revenue', 'manage_rates') and organization_id = current_organization_id());

-- ══════════════════════════════════════════════════════════════════════
-- 3. machine_service_usage — quantity x rate = revenue, both frozen at
--    insert time. usage_date is when the work happened; created_at is
--    when it was recorded (may differ).
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.machine_service_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  project_id uuid not null references public.projects(id) on delete cascade,
  billable_service_id uuid not null references public.billable_services(id) on delete restrict,
  usage_date date not null default current_date,
  quantity numeric not null check (quantity > 0),
  unit text,
  rate_applied numeric not null check (rate_applied >= 0),
  revenue_amount numeric not null check (revenue_amount >= 0),
  recorded_by uuid references auth.users(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_service_usage_org on public.machine_service_usage (organization_id);
create index if not exists idx_service_usage_org_project on public.machine_service_usage (organization_id, project_id);
create index if not exists idx_service_usage_org_service on public.machine_service_usage (organization_id, billable_service_id);
create index if not exists idx_service_usage_org_date on public.machine_service_usage (organization_id, usage_date);

drop trigger if exists trg_service_usage_updated_at on public.machine_service_usage;
create trigger trg_service_usage_updated_at
  before update on public.machine_service_usage
  for each row execute function public.set_updated_at_timestamp();

alter table public.machine_service_usage enable row level security;

drop policy if exists machine_service_usage_select on public.machine_service_usage;
create policy machine_service_usage_select on public.machine_service_usage for select
  using (has_permission('machine_revenue', 'view') and organization_id = current_organization_id());

drop policy if exists machine_service_usage_insert on public.machine_service_usage;
create policy machine_service_usage_insert on public.machine_service_usage for insert
  with check (has_permission('machine_revenue', 'create') and organization_id = current_organization_id());

drop policy if exists machine_service_usage_update on public.machine_service_usage;
create policy machine_service_usage_update on public.machine_service_usage for update
  using (has_permission('machine_revenue', 'edit') and organization_id = current_organization_id())
  with check (has_permission('machine_revenue', 'edit') and organization_id = current_organization_id());

drop policy if exists machine_service_usage_delete on public.machine_service_usage;
create policy machine_service_usage_delete on public.machine_service_usage for delete
  using (has_permission('machine_revenue', 'delete') and organization_id = current_organization_id());

insert into public.schema_migrations (version, description, checksum)
values (
  '20260817_040_phase40_machine_service_revenue',
  'Phase 40: create public.billable_services, public.machine_service_rate_history (insert-only), public.machine_service_usage (freezes rate_applied/revenue_amount at insert time). Revenue-only, never profit/costing; billable_services.machine_id is optional so a service is never conflated with a machine asset. Gated on new machine_revenue permission module (manage_rates is a narrower action than edit, reserved for rate changes specifically).',
  'phase40-machine-service-revenue-v1'
)
on conflict (version) do nothing;

commit;
