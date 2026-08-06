-- ============================================================================
-- Phase 10: Delivery Challans
-- ============================================================================
-- Version:     20260806_010_phase10_delivery_challans
-- Scope:       Extends the pre-existing (not Phase 1-9-created) table
--              delivery_challans - selected because dependency count no
--              longer differentiates the remaining tables (all zero
--              dependents); ranked first among production_stages/
--              project_materials/material_requisitions/delivery_challans/
--              logs by architectural readiness (single, real, active
--              frontend type - unlike material_requisitions' confirmed
--              unresolved three-way concept conflict) and by directly
--              unblocking Phase 9's dangling invoices.dc_id column.
--
-- Dependencies on frozen phases:
--   - Phase 1: organization_id + RLS baseline, reused unmodified.
--   - Phase 2: set_updated_at_timestamp() trigger function, reused
--     unmodified for a new updated_at trigger.
--   - Phase 9: invoices.dc_id (added, but never FK'd) - this migration
--     does not add that FK (out of this table's own scope to modify
--     invoices), but delivery_challans.id is now a valid, real target for
--     it once a future phase or admin action chooses to add it.
--
-- What this migration does:
--   Adds customer_id (new FK to customers, ON DELETE SET NULL - nullable,
--   matching the same pattern already used for vendor_id/inventory_item_id
--   throughout this engagement: the "required at creation" rule is
--   enforced by the frontend's own validation, not a hard NOT NULL,
--   because NOT NULL is fundamentally incompatible with ON DELETE SET
--   NULL on the same column - a real defect caught live during this
--   phase's Stage 7 verification, disclosed and corrected here rather
--   than left in the archived file; see phase10_completion_report.md for
--   the full incident record),
--   dc_no, items/project_entries/delivery_address (jsonb - always read and
--   written as whole embedded structures, same precedent as Phase 3's
--   company_pos.items), dispatch_method plus its 8 method-specific fields,
--   dispatch_date (NOT NULL - confirmed runtime-required, table empty),
--   receiver_name (nullable - type-required but not runtime-enforced,
--   confirmed by the absence of any validation guard), status (NOT NULL
--   DEFAULT 'Prepared', matching the confirmed create-time default),
--   updated_at (+ reused Phase 2 trigger - updateDeliveryChallan() is a
--   confirmed real, active edit workflow).
--
-- Explicitly out of scope / deliberately unchanged:
--   - delivery_challans.project_id: left at the pre-existing default
--     ON DELETE NO ACTION. deleteProject()'s own hasDCs guard checks
--     project_entries (the new jsonb column added here), not this flat
--     column - a pre-existing asymmetry in the app's own design, not
--     something this migration introduces or silently corrects.
--   - soId, jobId (on DeliveryChallan): confirmed zero usage anywhere in
--     DeliveryChallans.tsx - same dead legacy cluster as JobCard
--     (confirmed in Phase 8 discovery). Left frontend-only, no columns.
--   - The pre-existing quantity column: no confirmed frontend field maps
--     to it cleanly (DCItem.qty and DCProjectEntry.dispatchQty are both
--     per-row, embedded in the new jsonb columns, not a single top-level
--     total). Left exactly as-is, not dropped - never silently remove a
--     column without exhaustive proof of dead status, which was not
--     attempted for this pre-existing column in this phase.
--   - invoices.dc_id -> delivery_challans(id): not added here. Adding a
--     new FK on the invoices table is outside delivery_challans' own
--     scope; noted as a natural, low-risk follow-up now that a real
--     target table exists, not silently bundled into this migration.
--   - RLS, permissions, indexes: confirmed already correct and already
--     covering every new column.
--
-- Rollback considerations (see phase10_rollback.md once archived):
--   Same ALTER-based shape as every prior phase - reverses only this
--   file's own additions, never DROP TABLE. No data is backfilled (table
--   has 0 rows), so a rollback loses no real data beyond whatever was
--   entered into the new columns after this phase shipped.
--
-- Every DDL statement below is idempotent: safe to re-run this file
-- against a database that already has it applied.
--
-- Disclosed incident: the first executed version of this file added both
-- customer_id NOT NULL and customer_id ... ON DELETE SET NULL - a
-- self-contradictory combination that is not rejected at DDL time but
-- fails at runtime the moment the FK action actually fires (Postgres
-- cannot set a NOT NULL column to null). This was caught live during
-- Stage 7 independent verification, using a real test customer and a
-- real linked delivery challan: the delete failed with
-- "null value in column customer_id ... violates not-null constraint"
-- instead of succeeding with the link cleared, as designed. The failed
-- statement rolled back atomically (confirmed: both the test customer and
-- the link were unchanged afterward). Corrected by dropping the NOT NULL
-- on the live database and in this archived file (section 2 no longer
-- includes it), then re-verified with the same test scenario, which
-- passed. See phase10_completion_report.md for the full incident record.
-- ============================================================================

begin;

-- ============================================================================
-- 1. delivery_challans - new columns
-- ============================================================================

alter table public.delivery_challans add column if not exists customer_id uuid;
alter table public.delivery_challans add column if not exists dc_no text;
alter table public.delivery_challans add column if not exists items jsonb default '[]'::jsonb;
alter table public.delivery_challans add column if not exists project_entries jsonb default '[]'::jsonb;
alter table public.delivery_challans add column if not exists dispatch_method text;
alter table public.delivery_challans add column if not exists vehicle_no text;
alter table public.delivery_challans add column if not exists driver_name text;
alter table public.delivery_challans add column if not exists courier_company text;
alter table public.delivery_challans add column if not exists tracking_number text;
alter table public.delivery_challans add column if not exists transport_company text;
alter table public.delivery_challans add column if not exists lr_number text;
alter table public.delivery_challans add column if not exists collected_by text;
alter table public.delivery_challans add column if not exists mobile_number text;
alter table public.delivery_challans add column if not exists dispatch_date date;
alter table public.delivery_challans add column if not exists receiver_name text;
alter table public.delivery_challans add column if not exists status text default 'Prepared';
alter table public.delivery_challans add column if not exists delivery_address jsonb;
alter table public.delivery_challans add column if not exists updated_at timestamptz not null default now();

-- ============================================================================
-- 2. dispatch_date - add NOT NULL directly
-- ============================================================================
-- Safe without a backfill step: the table has 0 rows (confirmed live
-- before this file was written). dispatch_date is confirmed
-- runtime-required in DeliveryChallans.tsx ("Dispatch date is required").
-- customer_id is deliberately NOT made NOT NULL here - see section 1's
-- header comment: it is fundamentally incompatible with the ON DELETE
-- SET NULL FK added in section 3, and enforcing "required at creation"
-- is the frontend's job, not this column's.

alter table public.delivery_challans alter column dispatch_date set not null;

-- ============================================================================
-- 3. customer_id FK - ON DELETE SET NULL
-- ============================================================================
-- deleteCustomer() (store.ts) guards on hasQuotations/hasInvoices/
-- hasProjects only - confirmed directly, it does NOT check delivery
-- challans. A default (NO ACTION) FK would block a delete the app
-- already allows, so this is added as SET NULL from the start (not a
-- later correction, since the constraint does not exist until this
-- statement creates it for the first time).

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.delivery_challans'::regclass
      and conname = 'delivery_challans_customer_id_fkey'
  ) then
    alter table public.delivery_challans
      add constraint delivery_challans_customer_id_fkey
      foreign key (customer_id) references public.customers(id) on delete set null;
  end if;
end $$;

-- ============================================================================
-- 4. Reuse Phase 2's set_updated_at_timestamp() for delivery_challans
-- ============================================================================

drop trigger if exists trg_delivery_challans_updated_at on public.delivery_challans;

create trigger trg_delivery_challans_updated_at
  before update on public.delivery_challans
  for each row execute function public.set_updated_at_timestamp();

-- ============================================================================
-- 5. Register this migration
-- ============================================================================

insert into public.schema_migrations (version, description, checksum)
values (
  '20260806_010_phase10_delivery_challans',
  'Phase 10: Delivery Challans - new columns (customer_id, nullable, with ON DELETE SET NULL correcting a confirmed deleteCustomer() guard gap; dc_no, items/project_entries/delivery_address jsonb, dispatch-method fields, dispatch_date, receiver_name, status, updated_at + reused set_updated_at_timestamp() trigger). Corrected during Stage 7 verification: customer_id was briefly both NOT NULL and ON DELETE SET NULL, a self-contradictory combination caught live and fixed - see phase10_completion_report.md',
  '98c7a6002331afdc07c9ba7b7156a9c08e568a28d5bf92bf92c0dec1fb03c14b'
)
on conflict (version) do nothing;

commit;
