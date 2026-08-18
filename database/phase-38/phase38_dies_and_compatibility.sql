-- FabFlow ERP — Phase 38: Tooling/Dies Register + Machine<->Spare Part/Die
-- compatibility (master scope §7, §8, §9), plus the machines/dies
-- Purchasing-provenance columns called for in §15 of the approved plan.
--
-- Dies are reusable across projects (§8): original_project_id is
-- provenance/history only, never ownership - a die's status/assignment
-- is completely independent of which project it was first made for.
--
-- Two distinct compatibility mechanisms, both from the approved plan,
-- kept together rather than collapsed into one:
--   - dies.compatible_machine_id: a die's own single "primary" compatible
--     machine, shown directly on the die record.
--   - machine_dies / machine_spare_parts: real many-to-many junctions
--     (a die or spare part can fit more than one machine; a machine's
--     "Compatible Tooling"/"Compatible Spare Parts" panels read these).
--
-- Idempotent: safe to run multiple times.

begin;

-- ══════════════════════════════════════════════════════════════════════
-- 1. Purchasing-provenance retrofit (§15): machines gets the same
--    source_company_po_item_id column tools/dies get, mirroring §C.5.
--    Purely additive, unused until the Purchasing integration phase
--    actually writes to it.
-- ══════════════════════════════════════════════════════════════════════

alter table public.machines add column if not exists source_company_po_item_id uuid;

-- ══════════════════════════════════════════════════════════════════════
-- 2. dies
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.dies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  die_code text not null,
  name text not null,
  type text,
  purpose text,
  compatible_machine_id uuid references public.machines(id) on delete set null,
  original_project_id uuid references public.projects(id) on delete set null, -- provenance only, see header
  location text,
  status text not null default 'Available' check (status in (
    'Available', 'In Use', 'Under Maintenance', 'Retired'
  )),
  date_created date,
  condition text check (condition in ('Excellent', 'Good', 'Fair', 'Poor', 'Critical')),
  notes text,
  source_company_po_item_id uuid, -- soft reference, set by the Purchasing integration only
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_dies_org on public.dies (organization_id);
create index if not exists idx_dies_org_status on public.dies (organization_id, status);
create index if not exists idx_dies_org_compatible_machine on public.dies (organization_id, compatible_machine_id);

drop trigger if exists trg_dies_updated_at on public.dies;
create trigger trg_dies_updated_at
  before update on public.dies
  for each row execute function public.set_updated_at_timestamp();

alter table public.dies enable row level security;

drop policy if exists dies_select on public.dies;
create policy dies_select on public.dies for select
  using (has_permission('tooling_dies', 'view') and organization_id = current_organization_id());

drop policy if exists dies_insert on public.dies;
create policy dies_insert on public.dies for insert
  with check (has_permission('tooling_dies', 'create') and organization_id = current_organization_id());

drop policy if exists dies_update on public.dies;
create policy dies_update on public.dies for update
  using (has_permission('tooling_dies', 'edit') and organization_id = current_organization_id())
  with check (has_permission('tooling_dies', 'edit') and organization_id = current_organization_id());

drop policy if exists dies_delete on public.dies;
create policy dies_delete on public.dies for delete
  using (has_permission('tooling_dies', 'delete') and organization_id = current_organization_id());

-- ══════════════════════════════════════════════════════════════════════
-- 3. machine_dies — many-to-many, mirrors project_employees' composite-PK
--    shape (§9). Gated on BOTH machinery and tooling_dies view/edit so
--    either module's own permission is sufficient to manage the link -
--    matches how a link genuinely belongs to both sides.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.machine_dies (
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  machine_id uuid not null references public.machines(id) on delete cascade,
  die_id uuid not null references public.dies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (machine_id, die_id)
);

create index if not exists idx_machine_dies_org on public.machine_dies (organization_id);
create index if not exists idx_machine_dies_die on public.machine_dies (die_id);

alter table public.machine_dies enable row level security;

drop policy if exists machine_dies_select on public.machine_dies;
create policy machine_dies_select on public.machine_dies for select
  using (
    (has_permission('machinery', 'view') or has_permission('tooling_dies', 'view'))
    and organization_id = current_organization_id()
  );

drop policy if exists machine_dies_insert on public.machine_dies;
create policy machine_dies_insert on public.machine_dies for insert
  with check (
    (has_permission('machinery', 'edit') or has_permission('tooling_dies', 'edit'))
    and organization_id = current_organization_id()
  );

drop policy if exists machine_dies_delete on public.machine_dies;
create policy machine_dies_delete on public.machine_dies for delete
  using (
    (has_permission('machinery', 'edit') or has_permission('tooling_dies', 'edit'))
    and organization_id = current_organization_id()
  );

-- ══════════════════════════════════════════════════════════════════════
-- 4. machine_spare_parts — same shape, linking machines to
--    inventory_items (rows with category = 'spare_part'). Gated on
--    machinery + inventory permissions for the same reason as above.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.machine_spare_parts (
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  machine_id uuid not null references public.machines(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (machine_id, inventory_item_id)
);

create index if not exists idx_machine_spare_parts_org on public.machine_spare_parts (organization_id);
create index if not exists idx_machine_spare_parts_item on public.machine_spare_parts (inventory_item_id);

alter table public.machine_spare_parts enable row level security;

drop policy if exists machine_spare_parts_select on public.machine_spare_parts;
create policy machine_spare_parts_select on public.machine_spare_parts for select
  using (
    (has_permission('machinery', 'view') or has_permission('inventory', 'view'))
    and organization_id = current_organization_id()
  );

drop policy if exists machine_spare_parts_insert on public.machine_spare_parts;
create policy machine_spare_parts_insert on public.machine_spare_parts for insert
  with check (
    (has_permission('machinery', 'edit') or has_permission('inventory', 'edit'))
    and organization_id = current_organization_id()
  );

drop policy if exists machine_spare_parts_delete on public.machine_spare_parts;
create policy machine_spare_parts_delete on public.machine_spare_parts for delete
  using (
    (has_permission('machinery', 'edit') or has_permission('inventory', 'edit'))
    and organization_id = current_organization_id()
  );

insert into public.schema_migrations (version, description, checksum)
values (
  '20260817_038_phase38_dies_and_compatibility',
  'Phase 38: create public.dies (Tooling/Dies Register), public.machine_dies and public.machine_spare_parts (many-to-many compatibility junctions), plus machines.source_company_po_item_id retrofit. Dies reusable across projects (original_project_id is provenance only). RLS gated on new tooling_dies permission module (dies table) and combined machinery/tooling_dies or machinery/inventory permissions (junction tables).',
  'phase38-dies-and-compatibility-v1'
)
on conflict (version) do nothing;

commit;
