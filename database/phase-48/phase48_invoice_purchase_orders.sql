-- ============================================================================
-- Phase 48: invoice_purchase_orders (Invoice -> multiple Customer POs)
-- ============================================================================
-- Version:     20260831_048_phase48_invoice_purchase_orders
-- Scope:       Real production feature request (see chat, "INVOICES — ONE
--              INVOICE MUST SUPPORT MULTIPLE POs"). Today invoices.po_number
--              / invoices.po_date (added in Phase 9) are a single free-text
--              pair per invoice. This adds a proper one-to-many child table,
--              the same real relationship shape invoice_items already has
--              to invoices (Phase 9) - not a comma-separated string hack.
--
-- What "PO" means here: the customer's own Purchase Order reference on our
-- outgoing invoice - NOT the internal public.purchase_orders table (which
-- is our own sales-order record, keyed off a quotation, distinct concept).
-- The real entity for a customer's PO already exists:
-- public.quotation_purchase_orders (id, quotation_id, po_number, po_date,
-- customer_id, ...). This table references it OPTIONALLY, by id, when a
-- linked PO row exists (no duplicated PO data - the real Purchase Order
-- entity is referenced, not copied) - the same "real FK when available,
-- free-text snapshot otherwise" pattern already used by
-- material_purchases.vendor_id/supplier_name and payables.vendor_id/
-- vendor_name. po_number/po_date are always stored as a snapshot (even
-- when linked) purely for display/print stability, matching how
-- invoice_items itself snapshots description/hsn/price rather than
-- joining live to a catalog.
--
-- Backward compatibility: invoices.po_number/po_date are left completely
-- untouched (not dropped, not deprecated in the schema) - every existing
-- invoice with a single PO is backfilled into exactly one
-- invoice_purchase_orders row below, so old and new invoices both read
-- through the same one list from this point forward. An invoice with no
-- PO gets zero rows here, same as it has no po_number today.
--
-- RLS/organization_id: mirrors invoice_items' own Phase 1 pattern exactly
-- (organization_id column, default current_organization_id(), 4 policies
-- gated by has_permission('invoices', <action>)).
--
-- Every DDL statement below is idempotent: safe to re-run this file
-- against a database that already has it applied.
-- ============================================================================

begin;

create table if not exists public.invoice_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  -- Optional real link to the customer's actual PO record. ON DELETE SET
  -- NULL, not CASCADE: deleting the source Customer PO record should not
  -- silently delete a real invoice's PO reference row - it should just
  -- fall back to being a plain text snapshot, same as material_purchases/
  -- payables already do when their vendor_id link is cleared.
  quotation_purchase_order_id uuid references public.quotation_purchase_orders(id) on delete set null,
  po_number text not null,
  po_date date,
  organization_id uuid not null default public.current_organization_id() references public.organizations(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_invoice_purchase_orders_org_invoice
  on public.invoice_purchase_orders(organization_id, invoice_id);

alter table public.invoice_purchase_orders enable row level security;

drop policy if exists invoice_purchase_orders_select on public.invoice_purchase_orders;
create policy invoice_purchase_orders_select on public.invoice_purchase_orders
  for select using (has_permission('invoices','view') and organization_id = current_organization_id());

drop policy if exists invoice_purchase_orders_insert on public.invoice_purchase_orders;
create policy invoice_purchase_orders_insert on public.invoice_purchase_orders
  for insert with check ((has_permission('invoices','create') or has_permission('invoices','edit')) and organization_id = current_organization_id());

drop policy if exists invoice_purchase_orders_update on public.invoice_purchase_orders;
create policy invoice_purchase_orders_update on public.invoice_purchase_orders
  for update using (has_permission('invoices','edit') and organization_id = current_organization_id());

drop policy if exists invoice_purchase_orders_delete on public.invoice_purchase_orders;
create policy invoice_purchase_orders_delete on public.invoice_purchase_orders
  for delete using (has_permission('invoices','edit') and organization_id = current_organization_id());

-- Backfill: every existing invoice with a non-empty po_number gets exactly
-- one row here, carrying its existing organization_id (not the session-
-- resolved current_organization_id(), which is not meaningful in a plain
-- migration session - same footgun avoidance as Phase 1 section 12).
-- Guarded by "no rows yet for this invoice" so re-running this file never
-- duplicates the backfill.
insert into public.invoice_purchase_orders (invoice_id, po_number, po_date, organization_id)
select i.id, i.po_number, i.po_date, i.organization_id
from public.invoices i
where i.po_number is not null and i.po_number <> ''
  and not exists (
    select 1 from public.invoice_purchase_orders ipo where ipo.invoice_id = i.id
  );

insert into public.schema_migrations (version, description, checksum)
values (
  '20260831_048_phase48_invoice_purchase_orders',
  'Phase 48: adds public.invoice_purchase_orders, a real one-to-many child table of invoices (mirrors invoice_items exactly: organization_id + 4 has_permission(''invoices'',...) RLS policies). Each row is an invoice''s reference to a customer Purchase Order - po_number/po_date always stored as a display snapshot, plus an OPTIONAL quotation_purchase_order_id FK (ON DELETE SET NULL) to the real public.quotation_purchase_orders entity when the invoice''s PO was sourced from one, avoiding duplicated PO data. invoices.po_number/po_date (Phase 9) are left untouched for backward compatibility; every existing invoice with a po_number is backfilled into exactly one row here.',
  'phase48-invoice-purchase-orders-v1'
)
on conflict (version) do nothing;

commit;
