-- ============================================================================
-- Phase 7: Vendors
-- ============================================================================
-- Version:     20260806_007_phase7_vendors
-- Scope:       Extends the pre-existing public.vendors table (one of the 14
--              original pre-Phase-1 tables) to match the live frontend model,
--              and corrects two vendor_id foreign keys whose default
--              ON DELETE behavior conflicted with the frontend's already
--              -documented, unconditional deleteVendor() workflow.
--
-- Selected by dependency analysis (most frozen-phase FK dependents of any
-- remaining untouched pre-existing table: company_pos.vendor_id [Phase 3],
-- petty_expenses.vendor_id [Phase 4], plus the pre-existing
-- inventory_purchases.vendor_id).
--
-- What this migration does:
--   1. Adds vendors.address (nullable) - present on the frontend Vendor type
--      but never runtime-required (only name is validated in Vendors.tsx /
--      VendorSelect.tsx), so added nullable rather than NOT NULL.
--   2. Adds vendors.updated_at + reuses Phase 2's set_updated_at_timestamp()
--      trigger, mirroring the identical pattern already applied to projects
--      (Phase 5) and customers (Phase 6).
--   3. Corrects inventory_purchases.vendor_id from the default
--      ON DELETE NO ACTION to ON DELETE SET NULL. inventory_purchases is a
--      pre-existing table; Phase 1 only added organization_id/RLS to it and
--      never touched this FK.
--   4. Corrects company_pos.vendor_id from the default ON DELETE NO ACTION
--      to ON DELETE SET NULL. company_pos was created by the now-frozen
--      Phase 3 migration. This is a deliberate, explicitly user-approved
--      correction to a frozen-phase object - the archived
--      phase3_quotations_company_pos_FINAL.sql file itself is NOT modified;
--      only the live constraint is altered here, by Phase 7.
--
-- Why the two FK corrections are necessary (not cosmetic):
--   deleteVendor() (store.ts) has zero dependency guard - it unconditionally
--   removes the vendor from local state - and the Vendors.tsx delete
--   -confirmation dialog explicitly promises the user: "Existing purchase
--   and payable records linked to this vendor will retain the vendor name
--   but lose the link." Both inventory_purchases and company_pos left their
--   vendor_id FK at the Postgres default (NO ACTION), which would reject a
--   vendor delete outright the moment a real referencing row exists -
--   directly contradicting that promised, unconditional behavior. This
--   mismatch is confirmed dormant only because vendors currently has 0 rows
--   and the frontend is not yet wired to Supabase; it is a genuine,
--   confirmed correctness/data-integrity defect, not a hypothetical one.
--   petty_expenses.vendor_id (Phase 4) already uses ON DELETE SET NULL
--   correctly and is the proven working precedent for this exact pattern,
--   including safe interaction with an UPDATE-firing updated_at trigger on
--   the same table (confirmed live before writing this file: company_pos's
--   own trg_company_pos_updated_at is BEFORE UPDATE / set_updated_at_
--   timestamp(), the identical shape already proven safe on petty_expenses).
--
-- Explicitly NOT changed in this migration (all evaluated and decided
-- during Phase 7's architecture review, not overlooked):
--   - vendors.email: confirmed live column with zero frontend read/write
--     path anywhere in the codebase. Left untouched - not necessary to
--     preserve app behavior or fix a defect, so the standing "modify only
--     when necessary" rule says leave it alone.
--   - vendors.gstin: kept as-is, mapped to the frontend's gstNumber field
--     at the (future) service/adapter layer. Renaming is cosmetic churn
--     with no behavioral benefit.
--   - RLS policies (vendors_select/insert/update/delete): already correct,
--     already match Vendors.tsx's single-module canView/canCreate/canEdit/
--     canDelete(currentUser, "vendors") gating exactly. Untouched.
--   - permissions (vendors.view/create/edit/delete): already seeded by
--     Phase 1. Untouched.
--   - indexes: idx_vendors_org_name already covers the list/search/sort
--     pattern used by Vendors.tsx. No new query pattern is introduced by
--     address/updated_at, so no new index is added.
--   - No CHECK constraints: no field has a frontend-enforced format/range
--     rule to mirror.
--   - No UNIQUE constraint on name: the frontend's own dedup is
--     inconsistent across its write paths (Vendors.tsx blocks on a
--     duplicate, VendorSelect.tsx silently reuses the existing vendor, and
--     the backup-restore/merge path in store.ts applies no dedup at all),
--     so a DB-level UNIQUE constraint would be stricter than the app's own
--     confirmed behavior - left out per "the database adapts to the
--     application."
--   - No numbering function: Vendor has no code/number field anywhere in
--     the frontend, unlike Projects (Phase 5).
--   - No new triggers beyond the one updated_at-maintenance trigger: gstin/
--     gstNumber is a plain 1:1 rename-free mapping, not a duplicate-
--     representation problem like Phase 6's email/emails[]/primaryEmail,
--     so no sync trigger is needed.
--
-- Rollback considerations (see phase7_rollback.md once archived):
--   Same ALTER-based shape as Phase 5/6 - reverses only this file's own
--   additions, never DROP TABLE. Rolling back the two FK corrections would
--   restore ON DELETE NO ACTION on both tables, which would knowingly
--   restore the confirmed defect described above - any future rollback
--   plan must treat that restoration as a disclosed regression, not a
--   neutral reversal. No data is written or backfilled by this migration
--   (vendors has 0 rows), so there is nothing to lose by rolling back the
--   column additions themselves. Reverse order:
--     drop trigger trg_vendors_updated_at
--       -> drop column vendors.updated_at
--       -> drop column vendors.address
--     restore company_pos_vendor_id_fkey to ON DELETE NO ACTION (default)
--     restore inventory_purchases_vendor_id_fkey to ON DELETE NO ACTION
--       (default)
--     delete from schema_migrations where version =
--       '20260806_007_phase7_vendors'
--
-- Every DDL statement below is idempotent: safe to re-run this file against
-- a database that already has it applied.
-- ============================================================================

begin;

-- ============================================================================
-- 1. vendors.address
-- ============================================================================
-- Present on the frontend Vendor type (types.ts) but never runtime-required
-- (only name is validated on Add/Edit in Vendors.tsx and VendorSelect.tsx),
-- so added nullable - matches the identical "type-required, runtime-
-- optional" handling already used for customers.address in Phase 6.

alter table public.vendors
  add column if not exists address text;

-- ============================================================================
-- 2. vendors.updated_at
-- ============================================================================
-- Mirrors the identical pattern already applied to projects (Phase 5) and
-- customers (Phase 6). now() is STABLE, so this default is computed once
-- and applied via Postgres's fast ADD COLUMN path - no table rewrite, safe
-- regardless of row count (vendors currently has 0 rows in any case).

alter table public.vendors
  add column if not exists updated_at timestamptz not null default now();

-- ============================================================================
-- 3. Reuse Phase 2's set_updated_at_timestamp() for vendors.updated_at
-- ============================================================================
-- Same function, same BEFORE UPDATE pattern already used by
-- trg_projects_updated_at (Phase 5) and trg_customers_updated_at (Phase 6).
-- Not modified here - only a new trigger registration pointing at it.

drop trigger if exists trg_vendors_updated_at on public.vendors;

create trigger trg_vendors_updated_at
  before update on public.vendors
  for each row execute function public.set_updated_at_timestamp();

-- ============================================================================
-- 4. Correct inventory_purchases.vendor_id: NO ACTION -> SET NULL
-- ============================================================================
-- inventory_purchases is a pre-existing table (Phase 1 only added
-- organization_id/RLS to it; this FK's default ON DELETE behavior predates
-- this entire engagement). Guarded on confdeltype so a second run of this
-- migration, or a run against a database that already has the corrected
-- constraint, is a genuine no-op rather than an unnecessary drop/recreate.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.inventory_purchases'::regclass
      and conname = 'inventory_purchases_vendor_id_fkey'
      and confdeltype <> 'n'
  ) then
    alter table public.inventory_purchases
      drop constraint inventory_purchases_vendor_id_fkey;

    alter table public.inventory_purchases
      add constraint inventory_purchases_vendor_id_fkey
      foreign key (vendor_id) references public.vendors(id) on delete set null;
  end if;
end $$;

-- ============================================================================
-- 5. Correct company_pos.vendor_id: NO ACTION -> SET NULL
-- ============================================================================
-- company_pos was created by the now-frozen Phase 3 migration
-- (phase3_quotations_company_pos_FINAL.sql). This ALTER modifies only the
-- LIVE constraint; the archived Phase 3 file is not edited. Explicitly
-- approved by the user for this exact reason: it preserves the
-- application's already-documented deleteVendor() behavior, matches
-- company_pos's own cached vendor snapshot design (vendor_name/
-- vendor_address/vendor_gst/vendor_contact already survive independently
-- of vendor_id), and corrects a confirmed database/application mismatch.
-- Same confdeltype guard as above for idempotency.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.company_pos'::regclass
      and conname = 'company_pos_vendor_id_fkey'
      and confdeltype <> 'n'
  ) then
    alter table public.company_pos
      drop constraint company_pos_vendor_id_fkey;

    alter table public.company_pos
      add constraint company_pos_vendor_id_fkey
      foreign key (vendor_id) references public.vendors(id) on delete set null;
  end if;
end $$;

-- ============================================================================
-- 6. Register this migration
-- ============================================================================

insert into public.schema_migrations (version, description, checksum)
values (
  '20260806_007_phase7_vendors',
  'Phase 7: Vendors - add address/updated_at, reuse set_updated_at_timestamp(), correct inventory_purchases.vendor_id and company_pos.vendor_id (frozen Phase 3, live-only correction) from ON DELETE NO ACTION to ON DELETE SET NULL',
  '0e3c291d28bf8be7947ed60befb1d1479ac2fc245128ad58161ac3998e3da410'
)
on conflict (version) do nothing;

commit;
