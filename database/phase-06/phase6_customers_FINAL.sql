-- FabFlow ERP - Phase 6: Customers
-- Like Phase 5's projects, customers is NOT a new table - it is one of
-- Phase 1's 14 pre-existing tables, given only organization_id + RLS by
-- Phase 1, structurally untouched since. This migration is the second
-- phase to extend a pre-existing table rather than create one.
--
-- Confirmed live before writing this file (read-only inspection, no
-- assumptions): customers has exactly 8 columns - id, name (already
-- NOT NULL), contact_person, email, phone, gstin, created_at,
-- organization_id. Zero triggers. Zero CHECK/UNIQUE constraints beyond
-- the primary key. RLS already enabled with 4 policies matching
-- Customers.tsx's canView/canCreate/canEdit/canDelete gating exactly -
-- confirmed unchanged, not touched by this migration.
--
-- What this migration adds, and why each one is additive-only:
-- address, state_name, state_code, additional_details (jsonb), emails
-- (jsonb), primary_email - all nullable. Confirmed live and actively
-- read/displayed across Quotations, Invoices, Delivery Challans,
-- Ledger, ProjectDetail, CustomerHistory, and ExportEngine today, with
-- zero corresponding column existing under any name. All nullable
-- because Customers.tsx's handleSave validates only `name` as
-- required - `address`'s frontend type declares it non-optional, but
-- has zero runtime enforcement, so runtime behavior (not the type
-- annotation) is treated as the specification, matching the identical
-- precedent already established for Project.totalQty in Phase 5.
--
-- Deliberately NOT added: no CHECK constraints on gstin/phone/email
-- format (searched Customers.tsx specifically for validation regex/
-- pattern logic - none exists); no UNIQUE constraint on name/gstin/
-- email (no duplicate-prevention check found in the save handler); no
-- CHECK tying primary_email to membership in emails (the frontend's UI
-- happens to always produce that relationship through its own flow,
-- but never asserts it as a rule). Adding any of these would invent
-- semantics the frontend does not itself enforce.
--
-- email / emails / primary_email - the one place this phase adds real
-- logic, not just columns. Confirmed from source (Customers.tsx's own
-- comment, "Sync primaryEmail to legacy email field for backward
-- compat"): emails[] + primaryEmail is the authoritative model; email
-- is a derived mirror, written from the other two, never the reverse.
-- Simply adding emails/primary_email as new columns while leaving
-- email as an independent field would recreate the exact "duplicate
-- source of truth that can drift" problem this project's standing
-- rules forbid - nothing would keep them consistent for any write path
-- other than the one that exists in Customers.tsx today. Closed with a
-- new trigger (sync_customer_email(), BEFORE INSERT OR UPDATE) that
-- recomputes email using the identical fallback chain the frontend
-- already uses: primary_email, then emails[0].email, then whatever the
-- caller explicitly submitted for email in that same write - the last
-- fallback is the one open question from this phase's architecture
-- review, resolved here as the interpretation that most literally
-- mirrors the frontend's own formula and changes no behavior.
--
-- updated_at + trigger: customers has no updated_at column or trigger
-- today (confirmed live). Added and wired to Phase 2's
-- set_updated_at_timestamp(), reused completely unmodified - the exact
-- same pattern already used for projects in Phase 5.
--
-- No new index: Customers.tsx's search box (confirmed by reading it
-- directly) filters only on name and contactPerson - no query pattern
-- justifies indexing gstin/email/emails, so none is added.
--
-- RLS: no policy changes. All 4 existing policies already match live
-- frontend gating exactly and gate rows, not columns - none of this
-- migration's additions require any policy to change.
--
-- Idempotent: safe to run multiple times. Registers itself in
-- schema_migrations as its final statement. Zero changes to any frozen
-- Phase 1-5 object - set_updated_at_timestamp() (Phase 2) is reused
-- unmodified; has_permission()/current_organization_id() (Phase 1) are
-- relied upon only through the RLS policies Phase 1 already wrote,
-- which are not touched; the 4 existing foreign keys into
-- customers.id (quotations, master_pos, quotation_purchase_orders -
-- all Phase 3 - and projects - Phase 5) are unaffected, since none of
-- them reference any column this migration touches and customers.id's
-- type/primary-key status is unchanged.
--
-- Rollback considerations: like Phase 5's projects, customers predates
-- this migration - a rollback must never DROP TABLE customers, only
-- reverse this file's own additions, in reverse order: drop
-- trg_customers_updated_at, drop trg_customers_sync_email, drop
-- function sync_customer_email(), then drop the 7 columns added in
-- section 1 (updated_at, primary_email, emails, additional_details,
-- state_code, state_name, address), then remove this version's
-- schema_migrations row. Every step is a plain reversible ALTER/DROP -
-- nothing here is destructive to pre-existing data (the one existing
-- "Test Customer" row's name/contact_person/email/phone/gstin/
-- created_at/organization_id values are never modified by this
-- migration; the new sync_customer_email trigger only fires on future
-- inserts/updates, never retroactively, so that row's existing NULL
-- email is left exactly as it was). No backfill is performed or
-- required this phase, unlike Phase 5's project_number backfill.

begin;

-- ============================================================
-- 1. Extend customers with the columns the frontend's Customer type
--    needs that do not already exist under any name. All nullable,
--    matching confirmed runtime behavior (only `name` is validated as
--    required anywhere in Customers.tsx).
-- ============================================================

alter table public.customers add column if not exists address text;
alter table public.customers add column if not exists state_name text;
alter table public.customers add column if not exists state_code text;
alter table public.customers add column if not exists additional_details jsonb;
alter table public.customers add column if not exists emails jsonb;
alter table public.customers add column if not exists primary_email text;
alter table public.customers add column if not exists updated_at timestamptz not null default now();

-- ============================================================
-- 2. sync_customer_email() - keeps the pre-existing `email` column
--    correct relative to the authoritative emails/primary_email model,
--    using the frontend's own fallback chain. No separate shared
--    function needed (unlike Phase 4's derived-field formula, this is
--    only ever called from one trigger entry point). Does not
--    reference OLD anywhere, so - unlike Phase 4/5's self-referencing
--    situations - INSERT and UPDATE can safely share one combined
--    trigger without any WHEN-clause-legality concern.
-- ============================================================

create or replace function public.sync_customer_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.email := coalesce(new.primary_email, new.emails -> 0 ->> 'email', new.email);
  return new;
end;
$$;

drop trigger if exists trg_customers_sync_email on public.customers;
create trigger trg_customers_sync_email
  before insert or update on public.customers
  for each row execute function public.sync_customer_email();

-- ============================================================
-- 3. updated_at maintenance - reuses Phase 2's
--    set_updated_at_timestamp() completely unmodified, the identical
--    pattern already used for projects in Phase 5.
-- ============================================================

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at_timestamp();

-- ============================================================
-- 4. Constraints, indexes, RLS - deliberately absent from this
--    migration. No CHECK/UNIQUE constraint is added (no frontend
--    validation or duplicate-prevention logic found to match against -
--    see header). No new index is added (the confirmed search
--    implementation filters only on name/contactPerson). RLS is
--    already correct and unchanged (Phase 1, confirmed to already
--    match live frontend gating exactly). Nothing here needs to
--    change or be added.
-- ============================================================

-- ============================================================
-- 5. Register this migration. Deliberately the last statement before
--    commit - its presence in schema_migrations after a run is proof
--    the entire transaction above succeeded, not just that it started.
--    Checksum is the SHA-256 of this file's content (sections 1-4,
--    i.e. everything above this statement), computed at authoring time.
-- ============================================================

insert into public.schema_migrations (version, description, checksum)
values (
  '20260806_006_phase6_customers',
  'Phase 6: extends the pre-existing customers table (not a new table - one of Phase 1''s 14 pre-existing ERP tables, same situation as projects in Phase 5). Adds address, state_name, state_code, additional_details (jsonb), emails (jsonb), primary_email, updated_at + trigger (reuses set_updated_at_timestamp unmodified) - all nullable, matching confirmed runtime validation (only name is required). Adds sync_customer_email() + trigger to keep the pre-existing email column correct relative to the newly-authoritative emails/primary_email model, using the frontend''s own fallback chain (primaryEmail, then emails[0].email, then the submitted email value) - closing a duplicate-source-of-truth risk rather than creating one. No CHECK/UNIQUE constraints added (no frontend validation or duplicate-prevention logic found), no new index added (confirmed search filters only on name/contactPerson), no RLS changes (all 4 existing policies already correct). Zero changes to any frozen Phase 1-5 object.',
  '1833447fcd46c7b6b3a9c064ce1c31b2cd699812c27f664ce500e87346dedef2'
)
on conflict (version) do nothing;

commit;
