-- FabFlow ERP  -  Phase 3: Quotations + Company POs
-- Adds: quotations, quotation_revisions, master_pos,
-- quotation_purchase_orders, project_purchase_orders (replaces the
-- frontend's unvalidated Project.pos[] array with a real FK-based table,
-- same precedent as Phase 2's project_employees), company_pos.
-- Reuses Phase 2's document_counters (unmodified) for organization-scoped
-- quotation numbering, and Phase 2's set_updated_at_timestamp() (unmodified)
-- for all six new tables' updated_at maintenance. Zero changes to any
-- frozen Phase 1 or Phase 2 table, column, policy, index, or trigger.
-- Idempotent: safe to run multiple times. Registers itself in
-- schema_migrations as its final statement, so that row's mere existence
-- is proof the whole transaction committed successfully.
--
-- Permission-module mapping (confirmed against the live frontend, not
-- assumed  -  see database/phase-03/phase3_architecture.md for the full
-- trace): master_pos INSERT and quotation_purchase_orders/
-- project_purchase_orders' quotations-side INSERT all use quotations.edit,
-- since creation only ever happens via Quotations.tsx's "Record PO"
-- fan-out. master_pos SELECT/UPDATE/DELETE and project_purchase_orders'
-- read path additionally use purchase_orders.*, matching
-- PurchaseOrders.tsx's own gating. project_purchase_orders also accepts
-- projects.edit for INSERT/UPDATE, matching ProjectDetail.tsx's
-- independent "Add PO" dialog  -  a second, confirmed live creation path.

begin;

-- ======================================================================
-- 1. quotations
-- ======================================================================

create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  qt_no text not null,
  customer_id uuid not null references public.customers(id),
  project_id uuid references public.projects(id),
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric not null,
  gst_rate numeric not null,
  gst_amount numeric not null,
  total_amount numeric not null,
  valid_until date not null,
  terms text,
  status text not null,
  quotation_date date,
  notes text,
  -- Last-10-version snapshot array, mirroring Quotation.history exactly  - 
  -- always read/written as a whole unit, never queried independently
  -- (same jsonb rationale as line_items below).
  history jsonb,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- NOTE: Quotation.recordedPO and the legacy PurchaseOrder/purchaseOrders
-- model are deliberately NOT represented anywhere in this migration  - 
-- confirmed dead code (no live call site creates either), per
-- database/phase-03/phase3_architecture.md.

create unique index if not exists uq_quotations_org_qtno
  on public.quotations (organization_id, qt_no);
create index if not exists idx_quotations_org_customer
  on public.quotations (organization_id, customer_id);

-- ======================================================================
-- 2. quotation_revisions
-- ======================================================================

create table if not exists public.quotation_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  revision_number integer not null,
  revision_date date not null,
  revision_notes text,
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric not null,
  gst_rate numeric not null,
  gst_amount numeric not null,
  total_amount numeric not null,
  valid_until date not null,
  terms text,
  notes text,
  status text not null,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  is_current boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Formalizes the frontend's own computed invariant
-- (nextRevisionNumber = max(revisionNumber) + 1 per quotation).
create unique index if not exists uq_quotation_revisions_quotation_number
  on public.quotation_revisions (quotation_id, revision_number);

-- Formalizes "only one revision per quotation has isCurrent: true"
-- (frontend comment, quoted verbatim in types.ts).
create unique index if not exists uq_quotation_revisions_one_current
  on public.quotation_revisions (quotation_id)
  where is_current;

create index if not exists idx_quotation_revisions_org_quotation
  on public.quotation_revisions (organization_id, quotation_id);

-- ======================================================================
-- 3. master_pos  -  the real shared identifier for one "PO event"
--    (replaces the frontend's bare string sharedPoId).
-- ======================================================================

create table if not exists public.master_pos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  po_number text not null,
  po_date date not null,
  customer_id uuid not null references public.customers(id),
  -- RESTRICT: a MasterPO is a real customer PO record (files attached,
  -- legal/business significance)  -  it must not be silently destroyable
  -- by deleting the quotation it was recorded against.
  quotation_id uuid not null references public.quotations(id) on delete restrict,
  files jsonb,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_master_pos_org_quotation
  on public.master_pos (organization_id, quotation_id);

-- ======================================================================
-- 4. quotation_purchase_orders  -  permanently tied to the revision it was
--    recorded under; a later price revision never touches it (frontend
--    comment, quoted verbatim in types.ts).
-- ======================================================================

create table if not exists public.quotation_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  -- CASCADE, explicit (not left as an implicit default): defensive
  -- completeness. In practice this path is unreachable today because a
  -- quotation_purchase_orders row can never exist without a master_pos
  -- row for the same quotation (both are created together, in the same
  -- handler, every time a PO is recorded)  -  master_pos.quotation_id's
  -- RESTRICT above is what actually blocks any problematic deletion.
  -- Correctness here does not rely on that invariant holding forever.
  revision_id uuid not null references public.quotation_revisions(id) on delete cascade,
  -- RESTRICT: makes the parent MasterPO's own protection meaningful  - 
  -- this ledger row must survive as long as its MasterPO does.
  master_po_id uuid not null references public.master_pos(id) on delete restrict,
  po_number text not null,
  po_date date not null,
  customer_id uuid not null references public.customers(id),
  files jsonb,
  remarks text,
  status text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_quotation_purchase_orders_org_revision
  on public.quotation_purchase_orders (organization_id, revision_id);

-- ======================================================================
-- 5. project_purchase_orders  -  replaces the frontend's embedded,
--    unvalidated Project.pos[] array with a real FK-based table. Same
--    precedent as Phase 2's project_employees replacing
--    assignedEmployeeIds[]. Does NOT modify the frozen projects table.
-- ======================================================================

create table if not exists public.project_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- RESTRICT: makes deleteMasterPO's existing app-level guard ("cannot
  -- delete PO, linked projects exist") a real, enforced DB constraint
  -- instead of a client-side .some() scan.
  master_po_id uuid not null references public.master_pos(id) on delete restrict,
  -- SET NULL, explicit: nullable, purely informational back-reference  - 
  -- distinct in kind from master_po_id's structural RESTRICT above.
  quotation_id uuid references public.quotations(id) on delete set null,
  po_number text not null,
  po_date date not null,
  quantity numeric not null,
  status text not null,
  file jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_purchase_orders_org_project
  on public.project_purchase_orders (organization_id, project_id);

-- ======================================================================
-- 6. company_pos  -  the company's own outgoing PO to a vendor
--    (procurement side; unrelated to customer quotations).
-- ======================================================================

create table if not exists public.company_pos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  cpo_number text not null,
  vendor_id uuid references public.vendors(id),
  vendor_name text not null,
  vendor_address text,
  vendor_gst text,
  vendor_contact text,
  -- jsonb, not a normalized table: always read/written as a whole
  -- embedded array (confirmed via CompanyPOs.tsx  -  po.items.length,
  -- never an independent item-level query), and unlike invoice_items
  -- there is no Postgres trigger that needs to aggregate over these rows
  -- individually. See phase3_architecture.md for the full comparison.
  items jsonb not null default '[]'::jsonb,
  delivery_address text,
  expected_delivery_date date,
  status text not null,
  gst_percent numeric,
  subtotal numeric not null,
  gst_amount numeric not null,
  grand_total numeric not null,
  terms_and_conditions text,
  notes text,
  file jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_company_pos_org_cpono
  on public.company_pos (organization_id, cpo_number);
create index if not exists idx_company_pos_org_vendor
  on public.company_pos (organization_id, vendor_id);

-- ======================================================================
-- 7. generate_quotation_number()  -  reuses Phase 2's document_counters
--    table completely unmodified (it was deliberately built generic  - 
--    a counter_key column, not constrained to 'EMP'  -  for exactly this
--    reuse). Same atomic INSERT..ON CONFLICT DO UPDATE..RETURNING
--    pattern as generate_employee_code(), proven concurrency-safe under
--    genuine concurrent load in Phase 2's verification. Format mirrors
--    the frontend's generateDocNo() exactly: QT-YYYY-NNN, sequence never
--    resets per calendar year. generate_employee_code() itself is not
--    touched  -  Phase 2 remains frozen.
-- ======================================================================

create or replace function public.generate_quotation_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value integer;
begin
  insert into public.document_counters (organization_id, counter_key, current_value)
  values (p_organization_id, 'QT', 1)
  on conflict (organization_id, counter_key)
  do update set current_value = public.document_counters.current_value + 1
  returning current_value into v_value;

  return 'QT-' || extract(year from now())::text || '-' || lpad(v_value::text, 3, '0');
end;
$$;

-- ======================================================================
-- 8. updated_at maintenance  -  reuses Phase 2's
--    set_updated_at_timestamp() completely unmodified (timestamp-only,
--    no updated_by dependency, safe to attach to any table). Phase 1's
--    set_updated_at() is not used here and not touched.
-- ======================================================================

drop trigger if exists trg_quotations_updated_at on public.quotations;
create trigger trg_quotations_updated_at
  before update on public.quotations
  for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_quotation_revisions_updated_at on public.quotation_revisions;
create trigger trg_quotation_revisions_updated_at
  before update on public.quotation_revisions
  for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_master_pos_updated_at on public.master_pos;
create trigger trg_master_pos_updated_at
  before update on public.master_pos
  for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_quotation_purchase_orders_updated_at on public.quotation_purchase_orders;
create trigger trg_quotation_purchase_orders_updated_at
  before update on public.quotation_purchase_orders
  for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_project_purchase_orders_updated_at on public.project_purchase_orders;
create trigger trg_project_purchase_orders_updated_at
  before update on public.project_purchase_orders
  for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_company_pos_updated_at on public.company_pos;
create trigger trg_company_pos_updated_at
  before update on public.company_pos
  for each row execute function public.set_updated_at_timestamp();

-- ======================================================================
-- 9. RLS + policies. Permission-module mapping confirmed against the
--    live frontend directly (see header comment and
--    phase3_architecture.md)  -  not a guessed 1:1 entity-name mapping.
-- ======================================================================

alter table public.quotations enable row level security;
drop policy if exists quotations_select on public.quotations;
create policy quotations_select on public.quotations for select using (has_permission('quotations','view') and organization_id = current_organization_id());
drop policy if exists quotations_insert on public.quotations;
create policy quotations_insert on public.quotations for insert with check (has_permission('quotations','create') and organization_id = current_organization_id());
drop policy if exists quotations_update on public.quotations;
create policy quotations_update on public.quotations for update using (has_permission('quotations','edit') and organization_id = current_organization_id());
drop policy if exists quotations_delete on public.quotations;
create policy quotations_delete on public.quotations for delete using (has_permission('quotations','delete') and organization_id = current_organization_id());

alter table public.quotation_revisions enable row level security;
drop policy if exists quotation_revisions_select on public.quotation_revisions;
create policy quotation_revisions_select on public.quotation_revisions for select using (has_permission('quotations','view') and organization_id = current_organization_id());
drop policy if exists quotation_revisions_insert on public.quotation_revisions;
create policy quotation_revisions_insert on public.quotation_revisions for insert with check (has_permission('quotations','edit') and organization_id = current_organization_id());
drop policy if exists quotation_revisions_update on public.quotation_revisions;
create policy quotation_revisions_update on public.quotation_revisions for update using (has_permission('quotations','edit') and organization_id = current_organization_id());
drop policy if exists quotation_revisions_delete on public.quotation_revisions;
create policy quotation_revisions_delete on public.quotation_revisions for delete using (has_permission('quotations','delete') and organization_id = current_organization_id());

-- master_pos: INSERT uses quotations.edit (created only via Quotations.tsx's
-- Record PO fan-out); SELECT/UPDATE/DELETE use purchase_orders.* (matches
-- PurchaseOrders.tsx's own gating, confirmed live).
alter table public.master_pos enable row level security;
drop policy if exists master_pos_select on public.master_pos;
create policy master_pos_select on public.master_pos for select using (has_permission('purchase_orders','view') and organization_id = current_organization_id());
drop policy if exists master_pos_insert on public.master_pos;
create policy master_pos_insert on public.master_pos for insert with check (has_permission('quotations','edit') and organization_id = current_organization_id());
drop policy if exists master_pos_update on public.master_pos;
create policy master_pos_update on public.master_pos for update using (has_permission('purchase_orders','edit') and organization_id = current_organization_id());
drop policy if exists master_pos_delete on public.master_pos;
create policy master_pos_delete on public.master_pos for delete using (has_permission('purchase_orders','delete') and organization_id = current_organization_id());

alter table public.quotation_purchase_orders enable row level security;
drop policy if exists quotation_purchase_orders_select on public.quotation_purchase_orders;
create policy quotation_purchase_orders_select on public.quotation_purchase_orders for select using (has_permission('quotations','view') and organization_id = current_organization_id());
drop policy if exists quotation_purchase_orders_insert on public.quotation_purchase_orders;
create policy quotation_purchase_orders_insert on public.quotation_purchase_orders for insert with check (has_permission('quotations','edit') and organization_id = current_organization_id());
drop policy if exists quotation_purchase_orders_update on public.quotation_purchase_orders;
create policy quotation_purchase_orders_update on public.quotation_purchase_orders for update using (has_permission('quotations','edit') and organization_id = current_organization_id());
drop policy if exists quotation_purchase_orders_delete on public.quotation_purchase_orders;
create policy quotation_purchase_orders_delete on public.quotation_purchase_orders for delete using (has_permission('quotations','delete') and organization_id = current_organization_id());

-- project_purchase_orders: two confirmed independent live creation paths
-- (Quotations.tsx's fan-out AND ProjectDetail.tsx's direct "Add PO"
-- dialog)  -  INSERT accepts either. Read additionally allows
-- purchase_orders.view since PurchaseOrders.tsx's "Customer Purchase
-- Orders" page also derives linked-project data from this table.
alter table public.project_purchase_orders enable row level security;
drop policy if exists project_purchase_orders_select on public.project_purchase_orders;
create policy project_purchase_orders_select on public.project_purchase_orders for select using ((has_permission('projects','view') or has_permission('purchase_orders','view')) and organization_id = current_organization_id());
drop policy if exists project_purchase_orders_insert on public.project_purchase_orders;
create policy project_purchase_orders_insert on public.project_purchase_orders for insert with check ((has_permission('quotations','edit') or has_permission('projects','edit')) and organization_id = current_organization_id());
drop policy if exists project_purchase_orders_update on public.project_purchase_orders;
create policy project_purchase_orders_update on public.project_purchase_orders for update using (has_permission('projects','edit') and organization_id = current_organization_id());
drop policy if exists project_purchase_orders_delete on public.project_purchase_orders;
create policy project_purchase_orders_delete on public.project_purchase_orders for delete using (has_permission('projects','delete') and organization_id = current_organization_id());

alter table public.company_pos enable row level security;
drop policy if exists company_pos_select on public.company_pos;
create policy company_pos_select on public.company_pos for select using (has_permission('company_po','view') and organization_id = current_organization_id());
drop policy if exists company_pos_insert on public.company_pos;
create policy company_pos_insert on public.company_pos for insert with check (has_permission('company_po','create') and organization_id = current_organization_id());
drop policy if exists company_pos_update on public.company_pos;
create policy company_pos_update on public.company_pos for update using (has_permission('company_po','edit') and organization_id = current_organization_id());
drop policy if exists company_pos_delete on public.company_pos;
create policy company_pos_delete on public.company_pos for delete using (has_permission('company_po','delete') and organization_id = current_organization_id());

-- ======================================================================
-- 10. Register this migration. Deliberately the last statement before
--     commit  -  its presence in schema_migrations after a run is proof
--     the entire transaction above succeeded, not just that it started.
--     Checksum is the SHA-256 of this file's content (sections 1-9,
--     i.e. everything above this statement), computed at authoring time.
-- ======================================================================

insert into public.schema_migrations (version, description, checksum)
values (
  '20260806_003_phase3_quotations_company_pos',
  'Phase 3: quotations, quotation_revisions, master_pos, quotation_purchase_orders, project_purchase_orders (junction, replaces Project.pos[] array), company_pos. Reuses Phase 2''s document_counters (unmodified) for quotation numbering and set_updated_at_timestamp() (unmodified) for updated_at maintenance. Permission-module mapping confirmed against live frontend (master_pos/project_purchase_orders split across quotations/purchase_orders/projects modules). RLS + org-scoped policies on all 6 new tables. Zero changes to any frozen Phase 1 or Phase 2 object.',
  '61c15c3743a27146a7cf26fbaf9ddb80c1f866ee716d87144592c3c1ff8dea85'
)
on conflict (version) do nothing;

commit;
