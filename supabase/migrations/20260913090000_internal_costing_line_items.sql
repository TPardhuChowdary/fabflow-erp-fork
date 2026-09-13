-- =====================================================================
-- DRAFT — NOT APPLIED. Reviewed and written per explicit instruction
-- ("prepare migrations... do not silently apply"). Do not run this
-- against the live project without deciding it's wanted first.
-- =====================================================================
--
-- Internal Costing — multi-line-item support (Part 4 of the
-- "Master ERP Architecture" audit).
--
-- Problem: public.internal_costings currently holds exactly one
-- aggregate number per cost category (raw_material_cost, hardware_cost,
-- cnc_cost, powder_coating_cost, assembly_cost, packing_cost,
-- labour_cost, transport_cost, machine_cost, outsource_cost,
-- consumables_cost, electricity_cost, scrap_loss_cost) — there is no way
-- to record "2x MS Sheet @ ₹X + 3x Angle @ ₹Y" as separate line items,
-- only a single pre-summed Raw Material total. The one place this table
-- ALREADY supports repeatable line items is extra_costs (jsonb array,
-- {id,label,amount}) and manual_adjustments (jsonb array) — both wired
-- up in ProjectDetail.tsx already. This migration extends the same
-- established pattern to the four categories the audit asked for
-- (raw materials, hardware, manufacturing/processing, finishing),
-- rather than inventing a new one.
--
-- Design choices:
--   - ADDITIVE ONLY. The 13 existing numeric *_cost columns and
--     extra_costs/manual_adjustments are untouched — no drop, no
--     rename, no data migration of existing values into the new
--     columns. Every existing costing row keeps working exactly as
--     today; Total Manufacturing Cost's existing formula in
--     ProjectDetail.tsx is not required to change as part of applying
--     this migration (that's a separate, UI-side follow-up).
--   - jsonb array, NOT NULL DEFAULT '[]'::jsonb — identical convention
--     to extra_costs/manual_adjustments on this exact table, so no new
--     null-handling pattern is introduced.
--   - Line-item shape is deliberately loose (jsonb, not a normalized
--     child table): quantity × rate = amount is a client-side
--     calculation exactly like extra_costs already is, and a normalized
--     table would need its own RLS policies, indexes, and a join to
--     reconstruct one costing — not justified for what is fundamentally
--     a per-project draft/working document, same reasoning that applied
--     to extra_costs/manual_adjustments already.
--   - manufacturing_items and finishing_items are named generically
--     (not "cutting_items"/"welding_items"/etc.) because the audit
--     asked for user-defined line items ("Cutting, Bending, Welding,
--     Grinding, Drilling, Assembly, Labour, Other") — the process name
--     is data (a "process" field per line), not a fixed column set.
--
-- Suggested shapes (enforced by application code, not a DB CHECK
-- constraint — same as extra_costs today):
--   raw_materials:       [{id, material, size, quantity, rate, amount}]
--   hardware_items:      [{id, item, specification, quantity, rate, amount}]
--   manufacturing_items: [{id, process, quantity, rate, amount}]
--   finishing_items:     [{id, process, quantity, rate, amount}]
--
-- NOT included in this migration (deliberately out of scope):
--   - No change to how Total Manufacturing Cost is computed — that's
--     application code (ProjectDetail.tsx), reviewed separately so a
--     formula change is never bundled silently into a schema change.
--   - No RLS policy change — internal_costings' existing org-scoped
--     RLS already covers new columns on the same table automatically.
--   - No backfill of the legacy single-number columns into line items
--     — there is no way to safely reconstruct "which materials/rates"
--     made up a historical single total, so existing costings are left
--     exactly as they are; only new/edited costings would use the new
--     line-item columns going forward.

alter table public.internal_costings
  add column if not exists raw_materials jsonb not null default '[]'::jsonb,
  add column if not exists hardware_items jsonb not null default '[]'::jsonb,
  add column if not exists manufacturing_items jsonb not null default '[]'::jsonb,
  add column if not exists finishing_items jsonb not null default '[]'::jsonb;

comment on column public.internal_costings.raw_materials is
  'Repeatable raw-material line items: [{id, material, size, quantity, rate, amount}]. Additive alongside the legacy raw_material_cost single-number column (Phase: internal costing line items).';
comment on column public.internal_costings.hardware_items is
  'Repeatable hardware line items: [{id, item, specification, quantity, rate, amount}]. Additive alongside the legacy hardware_cost single-number column.';
comment on column public.internal_costings.manufacturing_items is
  'Repeatable manufacturing/processing line items: [{id, process, quantity, rate, amount}] (e.g. Cutting, Bending, Welding). Additive alongside the legacy cnc_cost/assembly_cost/packing_cost/labour_cost single-number columns.';
comment on column public.internal_costings.finishing_items is
  'Repeatable finishing line items: [{id, process, quantity, rate, amount}] (e.g. Powder Coating, Galvanizing). Additive alongside the legacy powder_coating_cost single-number column.';
