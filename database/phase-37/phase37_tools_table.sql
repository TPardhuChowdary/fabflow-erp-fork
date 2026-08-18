-- FabFlow ERP — Phase 37: Tool Register (master scope §6).
--
-- Net-new module, not an extension of Inventory or Machinery: a Tool is a
-- trackable, assignable shop asset (hand tools, measuring instruments,
-- power tool accessories) - distinct from Inventory (consumed stock) and
-- Machinery (fixed/large capital equipment). Reuses the existing
-- Employee-assignment pattern (assigned_employee_id) and the same 4-policy
-- org-scoped RLS shape as every other phase, gated on the new `tools`
-- permission module (permissions.ts) - not a new permissions mechanism.
--
-- source_company_po_item_id is a plain provenance column, mirroring the
-- one added to `machines` in Phase 35 - populated only when the Purchasing
-- integration (master scope §15) actually creates a tool from a received
-- CompanyPO line; left null for every manually-added tool.
--
-- Idempotent: safe to run multiple times.

begin;

create table if not exists public.tools (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  tool_code text not null,
  name text not null,
  category text,
  quantity numeric not null default 1,
  location text,
  assigned_employee_id uuid references public.employees(id) on delete set null,
  condition text check (condition in ('Excellent', 'Good', 'Fair', 'Poor', 'Critical')),
  status text not null default 'Available' check (status in (
    'Available', 'In Use', 'Under Repair', 'Lost', 'Retired'
  )),
  purchase_date date,
  replacement_value numeric,
  notes text,
  source_company_po_item_id uuid, -- soft reference, set by the Purchasing integration only
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tools_org on public.tools (organization_id);
create index if not exists idx_tools_org_status on public.tools (organization_id, status);
create index if not exists idx_tools_org_assigned on public.tools (organization_id, assigned_employee_id);

drop trigger if exists trg_tools_updated_at on public.tools;
create trigger trg_tools_updated_at
  before update on public.tools
  for each row execute function public.set_updated_at_timestamp();

alter table public.tools enable row level security;

drop policy if exists tools_select on public.tools;
create policy tools_select on public.tools for select
  using (has_permission('tools', 'view') and organization_id = current_organization_id());

drop policy if exists tools_insert on public.tools;
create policy tools_insert on public.tools for insert
  with check (has_permission('tools', 'create') and organization_id = current_organization_id());

drop policy if exists tools_update on public.tools;
create policy tools_update on public.tools for update
  using (has_permission('tools', 'edit') and organization_id = current_organization_id())
  with check (has_permission('tools', 'edit') and organization_id = current_organization_id());

drop policy if exists tools_delete on public.tools;
create policy tools_delete on public.tools for delete
  using (has_permission('tools', 'delete') and organization_id = current_organization_id());

insert into public.schema_migrations (version, description, checksum)
values (
  '20260817_037_phase37_tools_table',
  'Phase 37: create public.tools (Tool Register - tool_code, name, category, quantity, location, assigned_employee_id, condition, status, purchase_date, replacement_value, notes, source_company_po_item_id), standard org-scoped RLS gated on the new tools permission module. Net-new module, distinct from Inventory/Machinery.',
  'phase37-tools-table-v1'
)
on conflict (version) do nothing;

commit;
