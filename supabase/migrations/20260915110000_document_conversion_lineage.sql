-- =====================================================================
-- DRAFT — NOT APPLIED. Written per explicit instruction ("write the
-- migration, do not apply it"). Do not run against the live project
-- without deciding it's wanted first.
-- =====================================================================
--
-- Phase 1 of the Unified Commercial Document Architecture — database
-- foundation ONLY. Adds three explicit, narrow relationship tables
-- (never a generic polymorphic "document engine"):
--
--   delivery_challan_quotations  — a DC's consumption of a Quotation
--   quotation_invoices           — a direct (no-DC) Invoice's consumption
--                                   of a Quotation
--   invoice_delivery_challans    — an Invoice's consumption of a DC
--
-- Mutual-exclusion rule (enforced by the future conversion layer, NOT by
-- this schema alone — see this migration's own note near the bottom):
-- a single invoice's conversion source is either a direct Quotation
-- (writes quotation_invoices) OR one/more DCs (writes
-- invoice_delivery_challans), never both for the same quantity. A
-- DC-sourced invoice may still show the quotation as reference/display
-- context without writing a second quotation_invoices row — that
-- distinction lives in application code that does not exist yet
-- (explicitly out of scope this phase).
--
-- Quantity semantics (see chat, "Final source/lineage rules"):
--   quotation_remaining = quotation_total
--                          - SUM(delivery_challan_quotations.quantity)
--                          - SUM(quotation_invoices.quantity)
--   dc_remaining         = dc_total - SUM(invoice_delivery_challans.quantity)
-- invoice_delivery_challans.quantity is an explicit, user/app-supplied
-- consumption figure — deliberately NEVER derived from
-- SUM(invoice_items.quantity), because invoice line quantities are
-- financial/commercial figures with no guaranteed shared unit of
-- measure against a DC's operational dispatchQty (invoice_items has no
-- unit column at all, unlike delivery_challans' own item rows — checked
-- directly against types.ts/hydration.ts before writing this).
--
-- Source totals are read live from the existing jsonb structures, not
-- duplicated into a new column:
--   quotation_total = SUM((line_items[].qty))    from quotations.line_items
--   dc_total         = SUM((project_entries[].dispatchQty)) from
--                       delivery_challans.project_entries
-- Both jsonb columns are confirmed (via a live read of real rows before
-- writing this) to store plain camelCase keys exactly as the frontend
-- sends them (qty, dispatchQty) — no key-casing transform happens on
-- write, so reading them back with ->> 'qty' / ->> 'dispatchQty' is
-- exactly correct, not an assumption.
--
-- Concurrency: each table gets one BEFORE INSERT OR UPDATE OF quantity
-- trigger that row-locks the source document (SELECT ... FOR UPDATE),
-- sums existing consumption from the relationship table itself (live,
-- never a cached counter — excluding the row being updated, so an
-- UPDATE re-checks correctly), and raises an exception if the new total
-- would exceed the source's own total. This is the exact same shape as
-- the already-proven public.prevent_overpayment() (BEFORE INSERT on
-- payments, row-locks invoices, sums payments, rejects on overflow) —
-- read directly from pg_proc before writing this, not assumed from
-- memory. One trigger function (check_quotation_remaining) is shared by
-- BOTH quotation-consuming tables (delivery_challan_quotations and
-- quotation_invoices) because they enforce the exact same invariant
-- against the exact same source table via the exact same two columns
-- (quotation_id, quantity) — this is direct code reuse of one narrow
-- invariant, not a generic engine; it does not generalize to any other
-- table.
--
-- organization_id consistency: beyond the standard RLS org-scoping,
-- each trigger function also verifies new.organization_id matches the
-- organization_id actually stored on both endpoint rows, raising if not
-- — defense in depth against a client sending a mismatched org id that
-- would otherwise only be caught by RLS's own USING/WITH CHECK clauses.
--
-- invoices.dc_id: left completely untouched by this migration. No
-- backfill performed (the live database currently has 1 invoice, 0 with
-- a dc_id, and 0 delivery_challans rows — there is nothing to backfill;
-- confirmed by direct query immediately before writing this). dc_id
-- remains the legacy/compatibility single-DC field; a future phase may
-- populate it for the simple single-DC case while
-- invoice_delivery_challans becomes the authoritative relationship.
--
-- DC-spanning-multiple-quotations: the schema below technically permits
-- multiple delivery_challan_quotations rows for the same DC (no
-- uniqueness on delivery_challan_id alone, only on the (DC, quotation)
-- pair) — this is deliberately the safer, more permissive shape. The
-- UX/business allocation behavior for that scenario (how a user would
-- actually split one DC's dispatch across two different quotations) is
-- explicitly NOT designed or built here — flagged as a business decision
-- to resolve before that specific conversion path is implemented.
-- =====================================================================

-- ── delivery_challan_quotations ─────────────────────────────────────
-- A Delivery Challan's consumption of a Quotation's quantity.

create table if not exists public.delivery_challan_quotations (
  id uuid primary key default gen_random_uuid(),
  delivery_challan_id uuid not null references public.delivery_challans(id) on delete cascade,
  quotation_id uuid not null references public.quotations(id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  organization_id uuid not null default public.current_organization_id() references public.organizations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (delivery_challan_id, quotation_id)
);

create index if not exists idx_dcq_org_dc
  on public.delivery_challan_quotations(organization_id, delivery_challan_id);
create index if not exists idx_dcq_org_quotation
  on public.delivery_challan_quotations(organization_id, quotation_id);

alter table public.delivery_challan_quotations enable row level security;

drop policy if exists delivery_challan_quotations_select on public.delivery_challan_quotations;
create policy delivery_challan_quotations_select on public.delivery_challan_quotations
  for select using (has_permission('delivery_challans','view') and organization_id = current_organization_id());

drop policy if exists delivery_challan_quotations_insert on public.delivery_challan_quotations;
create policy delivery_challan_quotations_insert on public.delivery_challan_quotations
  for insert with check ((has_permission('delivery_challans','create') or has_permission('delivery_challans','edit')) and organization_id = current_organization_id());

drop policy if exists delivery_challan_quotations_update on public.delivery_challan_quotations;
create policy delivery_challan_quotations_update on public.delivery_challan_quotations
  for update using (has_permission('delivery_challans','edit') and organization_id = current_organization_id())
  with check (has_permission('delivery_challans','edit') and organization_id = current_organization_id());

drop policy if exists delivery_challan_quotations_delete on public.delivery_challan_quotations;
create policy delivery_challan_quotations_delete on public.delivery_challan_quotations
  for delete using (has_permission('delivery_challans','edit') and organization_id = current_organization_id());

drop trigger if exists trg_dcq_updated_at on public.delivery_challan_quotations;
create trigger trg_dcq_updated_at
  before update on public.delivery_challan_quotations
  for each row execute function public.set_updated_at_timestamp();

-- ── quotation_invoices ───────────────────────────────────────────────
-- A direct (no-DC) Invoice's consumption of a Quotation's quantity.

create table if not exists public.quotation_invoices (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  quantity numeric not null check (quantity > 0),
  organization_id uuid not null default public.current_organization_id() references public.organizations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quotation_id, invoice_id)
);

create index if not exists idx_qi_org_quotation
  on public.quotation_invoices(organization_id, quotation_id);
create index if not exists idx_qi_org_invoice
  on public.quotation_invoices(organization_id, invoice_id);

alter table public.quotation_invoices enable row level security;

drop policy if exists quotation_invoices_select on public.quotation_invoices;
create policy quotation_invoices_select on public.quotation_invoices
  for select using (has_permission('invoices','view') and organization_id = current_organization_id());

drop policy if exists quotation_invoices_insert on public.quotation_invoices;
create policy quotation_invoices_insert on public.quotation_invoices
  for insert with check ((has_permission('invoices','create') or has_permission('invoices','edit')) and organization_id = current_organization_id());

drop policy if exists quotation_invoices_update on public.quotation_invoices;
create policy quotation_invoices_update on public.quotation_invoices
  for update using (has_permission('invoices','edit') and organization_id = current_organization_id())
  with check (has_permission('invoices','edit') and organization_id = current_organization_id());

drop policy if exists quotation_invoices_delete on public.quotation_invoices;
create policy quotation_invoices_delete on public.quotation_invoices
  for delete using (has_permission('invoices','edit') and organization_id = current_organization_id());

drop trigger if exists trg_qi_updated_at on public.quotation_invoices;
create trigger trg_qi_updated_at
  before update on public.quotation_invoices
  for each row execute function public.set_updated_at_timestamp();

-- ── invoice_delivery_challans ────────────────────────────────────────
-- An Invoice's consumption of a Delivery Challan's dispatched quantity.

create table if not exists public.invoice_delivery_challans (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  delivery_challan_id uuid not null references public.delivery_challans(id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  organization_id uuid not null default public.current_organization_id() references public.organizations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invoice_id, delivery_challan_id)
);

create index if not exists idx_idc_org_invoice
  on public.invoice_delivery_challans(organization_id, invoice_id);
create index if not exists idx_idc_org_dc
  on public.invoice_delivery_challans(organization_id, delivery_challan_id);

alter table public.invoice_delivery_challans enable row level security;

drop policy if exists invoice_delivery_challans_select on public.invoice_delivery_challans;
create policy invoice_delivery_challans_select on public.invoice_delivery_challans
  for select using (has_permission('invoices','view') and organization_id = current_organization_id());

drop policy if exists invoice_delivery_challans_insert on public.invoice_delivery_challans;
create policy invoice_delivery_challans_insert on public.invoice_delivery_challans
  for insert with check ((has_permission('invoices','create') or has_permission('invoices','edit')) and organization_id = current_organization_id());

drop policy if exists invoice_delivery_challans_update on public.invoice_delivery_challans;
create policy invoice_delivery_challans_update on public.invoice_delivery_challans
  for update using (has_permission('invoices','edit') and organization_id = current_organization_id())
  with check (has_permission('invoices','edit') and organization_id = current_organization_id());

drop policy if exists invoice_delivery_challans_delete on public.invoice_delivery_challans;
create policy invoice_delivery_challans_delete on public.invoice_delivery_challans
  for delete using (has_permission('invoices','edit') and organization_id = current_organization_id());

drop trigger if exists trg_idc_updated_at on public.invoice_delivery_challans;
create trigger trg_idc_updated_at
  before update on public.invoice_delivery_challans
  for each row execute function public.set_updated_at_timestamp();

-- updated_at handling reuses the existing public.set_updated_at_timestamp()
-- function already applied to invoices/quotations/delivery_challans/
-- invoice_items (confirmed live via pg_trigger/pg_proc before writing
-- this) — a plain `new.updated_at = now()`, nothing more. Deliberately
-- NOT public.set_updated_at() (a different, pre-existing function that
-- also sets new.updated_by, which none of these three tables have a
-- column for) — using that one would raise at runtime on first UPDATE.
-- No new helper function is created by this migration.

-- ── check_quotation_remaining() ──────────────────────────────────────
-- Shared by delivery_challan_quotations and quotation_invoices: both
-- enforce the identical invariant (quotation_id, quantity) against the
-- same source table, so one function serves both triggers. Row-locks
-- the quotation (same technique as prevent_overpayment's `for update`
-- on invoices), sums existing consumption from BOTH quotation-consuming
-- tables together (per the mandatory unified-consumption rule), and
-- rejects if the new row would push total consumption past the
-- quotation's own line-item quantity total.
create or replace function public.check_quotation_remaining()
returns trigger
language plpgsql
as $$
declare
  v_quotation_org uuid;
  v_total numeric;
  v_consumed_dc numeric;
  v_consumed_inv numeric;
  v_row_id uuid;
begin
  perform 1 from public.quotations where id = new.quotation_id for update;

  select organization_id into v_quotation_org
    from public.quotations where id = new.quotation_id;

  if v_quotation_org is null then
    raise exception 'Quotation % not found', new.quotation_id;
  end if;

  if new.organization_id <> v_quotation_org then
    raise exception 'organization_id mismatch: row org % does not match quotation org %',
      new.organization_id, v_quotation_org;
  end if;

  select coalesce(sum((item->>'qty')::numeric), 0) into v_total
    from public.quotations q, jsonb_array_elements(q.line_items) as item
    where q.id = new.quotation_id;

  -- Exclude the row being updated (if any) from its own "already
  -- consumed" tally, so an UPDATE re-validates correctly rather than
  -- double-counting itself.
  v_row_id := new.id;

  select coalesce(sum(quantity), 0) into v_consumed_dc
    from public.delivery_challan_quotations
    where quotation_id = new.quotation_id
      and id is distinct from v_row_id;

  select coalesce(sum(quantity), 0) into v_consumed_inv
    from public.quotation_invoices
    where quotation_id = new.quotation_id
      and id is distinct from v_row_id;

  if v_consumed_dc + v_consumed_inv + new.quantity > v_total then
    raise exception
      'Quotation over-consumption: requested % exceeds remaining % (of total %, already consumed %)',
      new.quantity, (v_total - v_consumed_dc - v_consumed_inv), v_total, (v_consumed_dc + v_consumed_inv);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_dcq_check_remaining on public.delivery_challan_quotations;
create trigger trg_dcq_check_remaining
  before insert or update of quantity on public.delivery_challan_quotations
  for each row execute function public.check_quotation_remaining();

drop trigger if exists trg_qi_check_remaining on public.quotation_invoices;
create trigger trg_qi_check_remaining
  before insert or update of quantity on public.quotation_invoices
  for each row execute function public.check_quotation_remaining();

-- ── check_dc_remaining() ──────────────────────────────────────────────
-- Enforces the DC-billing invariant for invoice_delivery_challans:
-- row-locks the delivery challan, sums existing invoice_delivery_challans
-- consumption against it (excluding the row being updated), and rejects
-- if the new row would exceed the DC's own dispatched-quantity total.
create or replace function public.check_dc_remaining()
returns trigger
language plpgsql
as $$
declare
  v_dc_org uuid;
  v_total numeric;
  v_consumed numeric;
  v_row_id uuid;
begin
  perform 1 from public.delivery_challans where id = new.delivery_challan_id for update;

  select organization_id into v_dc_org
    from public.delivery_challans where id = new.delivery_challan_id;

  if v_dc_org is null then
    raise exception 'Delivery Challan % not found', new.delivery_challan_id;
  end if;

  if new.organization_id <> v_dc_org then
    raise exception 'organization_id mismatch: row org % does not match delivery challan org %',
      new.organization_id, v_dc_org;
  end if;

  select coalesce(sum((entry->>'dispatchQty')::numeric), 0) into v_total
    from public.delivery_challans d, jsonb_array_elements(d.project_entries) as entry
    where d.id = new.delivery_challan_id;

  v_row_id := new.id;

  select coalesce(sum(quantity), 0) into v_consumed
    from public.invoice_delivery_challans
    where delivery_challan_id = new.delivery_challan_id
      and id is distinct from v_row_id;

  if v_consumed + new.quantity > v_total then
    raise exception
      'Delivery Challan over-invoicing: requested % exceeds remaining % (of total %, already invoiced %)',
      new.quantity, (v_total - v_consumed), v_total, v_consumed;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_idc_check_remaining on public.invoice_delivery_challans;
create trigger trg_idc_check_remaining
  before insert or update of quantity on public.invoice_delivery_challans
  for each row execute function public.check_dc_remaining();
