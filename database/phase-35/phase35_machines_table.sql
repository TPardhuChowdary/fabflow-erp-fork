-- FabFlow ERP — Phase 35: Machinery Supabase migration (public.machines).
--
-- Prerequisite for the "Remaining Approved Implementation Scope" master
-- prompt (§10-13 Project resource assignment, §17-28 Machine/Service
-- Revenue, §9 Machine<->Spare Part/Tooling relationships): every one of
-- those needs a real, org-scoped, RLS-protected `machines` row to
-- reference via a foreign key. Today Machinery is 100% local-only
-- Zustand/localStorage state (confirmed: no `machines`/`service_records`/
-- `service_parts` table exists anywhere in database/phase-*).
--
-- Scope of this migration: `machines` only — a 1:1 mirror of the existing
-- frontend `Machine` type (types.ts) plus `organization_id`.
-- `service_records`/`service_parts` (maintenance history) deliberately
-- stay local-only for now (no requirement in the approved scope needs
-- them persisted); MachineDocument likewise stays local, matching how
-- EmployeeDocument's base64 blobs are handled. The frontend read/write
-- layer (lib/machinesApi.ts) still keeps every Machine-entity field this
-- table's rows depend on (currentStatus, lastServiceDate,
-- nextServiceDue, totalRunningHours) in sync with Supabase whenever a
-- local-only ServiceRecord/MachineUsageLog/breakdown action changes them,
-- so migrating this table introduces zero regression in existing
-- Machinery functionality.
--
-- ID preservation: the one-time frontend migration tool
-- (lib/machinesMigration.ts) upserts by the machine's EXISTING local id
-- (already a crypto.randomUUID() per sampleMachines/addMachine) — `id
-- uuid primary key` below accepts those ids unchanged, and the upsert is
-- safe to re-run (idempotent, never a blind insert / never duplicates).
--
-- Idempotent: safe to run multiple times. Touches no existing table,
-- policy, trigger, or function; reuses phase2's
-- set_updated_at_timestamp() and phase1's current_organization_id()/
-- has_permission() unmodified. Reuses the existing `machinery` permission
-- module (permissions.ts) — no new permission module needed for this
-- table.

begin;

-- ══════════════════════════════════════════════════════════════════════
-- 1. machines
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.machines (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  machine_code text not null,
  name text not null,
  type text not null check (type in (
    'Laser Cutting', 'CNC', 'Welding', 'Bending', 'Powder Coating',
    'Compressor', 'Generator', 'Drilling', 'Grinding', 'Forklift',
    'Testing', 'Air Tool', 'Other'
  )),
  brand text,
  model text,
  serial_number text,
  asset_id text,
  purchase_date date,
  purchase_cost numeric,
  purchase_vendor_id uuid references public.vendors(id) on delete set null,
  purchase_vendor_name text,
  current_status text not null default 'Operational' check (current_status in (
    'Operational', 'Under Maintenance', 'Breakdown', 'Idle', 'Decommissioned'
  )),
  location text,
  department text,
  warranty_expiry date,
  warranty_vendor text,
  warranty_notes text,
  amc_vendor_id uuid references public.vendors(id) on delete set null,
  amc_vendor_name text,
  amc_start_date date,
  amc_end_date date,
  amc_cost numeric,
  amc_coverage text,
  service_interval_days integer,
  last_service_date date,
  next_service_due date,
  total_running_hours numeric not null default 0,
  hourly_rate numeric,
  -- base64 image data, same 1:1-mirror-of-the-frontend-type reasoning as
  -- every other column here — not re-architected onto Supabase Storage in
  -- this pass (out of scope for this migration; a natural future
  -- enhancement, not silently dropped functionality).
  primary_image_data text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_machines_org on public.machines (organization_id);
create index if not exists idx_machines_org_status on public.machines (organization_id, current_status);
create index if not exists idx_machines_org_active on public.machines (organization_id, is_active);

drop trigger if exists trg_machines_updated_at on public.machines;
create trigger trg_machines_updated_at
  before update on public.machines
  for each row execute function public.set_updated_at_timestamp();

-- ══════════════════════════════════════════════════════════════════════
-- 2. RLS — standard org-scoped 4-policy pattern, reusing the existing
--    `machinery` permission module unchanged (already seeded, already
--    used by every existing machinery.* frontend permission check in
--    Machinery.tsx / MachineDetail.tsx).
-- ══════════════════════════════════════════════════════════════════════

alter table public.machines enable row level security;

drop policy if exists machines_select on public.machines;
create policy machines_select on public.machines for select
  using (has_permission('machinery', 'view') and organization_id = current_organization_id());

drop policy if exists machines_insert on public.machines;
create policy machines_insert on public.machines for insert
  with check (has_permission('machinery', 'create') and organization_id = current_organization_id());

drop policy if exists machines_update on public.machines;
create policy machines_update on public.machines for update
  using (has_permission('machinery', 'edit') and organization_id = current_organization_id())
  with check (has_permission('machinery', 'edit') and organization_id = current_organization_id());

drop policy if exists machines_delete on public.machines;
create policy machines_delete on public.machines for delete
  using (has_permission('machinery', 'delete') and organization_id = current_organization_id());

-- ══════════════════════════════════════════════════════════════════════
-- Register this migration.
-- ══════════════════════════════════════════════════════════════════════

insert into public.schema_migrations (version, description, checksum)
values (
  '20260817_035_phase35_machines_table',
  'Phase 35: create public.machines (1:1 mirror of frontend Machine type + organization_id), standard org-scoped RLS reusing the existing machinery permission module unchanged. Prerequisite for Project Machinery/Dies assignment, Machine<->Spare Part/Tooling relationships, and the Machine/Service Revenue system. service_records/service_parts/machine documents intentionally remain local-only. Idempotent, additive-only, touches no existing table/policy/function.',
  'phase35-machines-table-v1'
)
on conflict (version) do nothing;

commit;
