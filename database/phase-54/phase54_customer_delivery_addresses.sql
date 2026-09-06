-- Phase 54 (Group 2, roadmap Phase 15) — Delivery Locations.
--
-- Today, a delivery challan's address is either the customer's single
-- `address` field or free text typed fresh on every challan
-- (delivery_challans.delivery_address, type "customer" | "custom") — no
-- way to save and reuse a delivery site (factory gate, warehouse, site
-- office) across multiple challans for the same customer.
--
-- This adds ONE new jsonb column, following the exact same convention
-- already established by customers.additional_details and customers.emails
-- (both jsonb arrays, no separate table, no new RLS needed since they're
-- just customer-scoped data covered by the existing customers RLS).
--
-- delivery_addresses: array of {id, label, address}, e.g.
--   [{"id": "da-1", "label": "Factory Gate 2", "address": "..."}]
--
-- No backfill: existing customers simply start with an empty array. The
-- existing delivery_challans.delivery_address column is untouched by this
-- migration - its `type` field gets a new allowed value ("saved") purely
-- at the frontend/TypeScript level, since it's already a flexible jsonb
-- shape with no DB-level enum constraint to widen.

begin;

alter table public.customers
  add column if not exists delivery_addresses jsonb not null default '[]'::jsonb;

insert into public.schema_migrations (version, description, checksum)
values (
  '20260902_054_phase54_customer_delivery_addresses',
  'Phase 54 (Group 2, roadmap Phase 15): adds customers.delivery_addresses (jsonb array of {id,label,address}), same convention as the existing additional_details/emails jsonb columns. No new table, no new RLS - existing customers RLS already covers it. No backfill.',
  'phase54-group2-v1'
)
on conflict (version) do nothing;

commit;
