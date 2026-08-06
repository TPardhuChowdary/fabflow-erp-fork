# Phase 7 — Architecture: Vendors

Status: **Implemented, executed, and fully verified** against the live Supabase project. This is the final, frozen design.

## 1. The third pre-existing table extended, and the first phase to correct a frozen phase's own object

Like `projects` (Phase 5) and `customers` (Phase 6), `vendors` is one of Phase 1's 14 pre-existing tables - given only `organization_id` and RLS by Phase 1, structurally untouched since. Selected by dependency analysis, not preference: a grep of every frozen migration's foreign keys showed `vendors` with more dependents (`company_pos.vendor_id` - Phase 3, `petty_expenses.vendor_id` - Phase 4) than any other remaining pre-existing table, plus a pre-existing `inventory_purchases.vendor_id` reference confirmed live.

Phase 7 is also the first phase in this engagement to modify a live object created by an already-frozen migration (`company_pos`, Phase 3). This was not done casually: it required its own explicit architecture question, its own evidence-backed recommendation, and a distinct, explicit user approval separate from the general architecture sign-off, before it went into SQL. The archived `phase3_quotations_company_pos_FINAL.sql` file itself was never edited - only the live constraint was altered, by Phase 7's own migration.

## 2. What already existed, confirmed via a live read before any SQL was written

`public.vendors` had exactly 7 columns: `id uuid` PK, `name text NOT NULL`, `phone text`, `email text`, `gstin text`, `created_at timestamptz`, `organization_id uuid NOT NULL`. Zero triggers. Zero `CHECK`/`UNIQUE` constraints beyond the primary key and the `organization_id` foreign key. RLS already enabled with all 4 policies (`vendors_select/insert/update/delete`) confirmed to already match `Vendors.tsx`'s `canView/canCreate/canEdit/canDelete(currentUser, "vendors")` gating exactly - single-module, no cross-module OR. The table held 0 rows at the time of this migration.

Three live foreign keys reference `vendors.id`: `inventory_purchases.vendor_id` (pre-existing, predates Phase 1), `company_pos.vendor_id` (Phase 3), and `petty_expenses.vendor_id` (Phase 4). All three confirmed nullable.

## 3. Columns added

`address text` (nullable) and `updated_at timestamptz not null default now()`, with a reused `set_updated_at_timestamp()` (Phase 2) `BEFORE UPDATE` trigger - the identical pattern already applied to `projects` (Phase 5) and `customers` (Phase 6). `address` is declared non-optional on the frontend `Vendor` type (`address: string`, no `?`), but was checked specifically against `Vendors.tsx`'s and `VendorSelect.tsx`'s save handlers and found to have zero runtime enforcement - only `name` is validated in either flow. Runtime behavior, not the type annotation, was treated as the specification, the same precedent already established for `Project.totalQty` (Phase 5) and `Customer.address` (Phase 6).

## 4. Two FK corrections - the load-bearing decision of this phase

`deleteVendor()` (`store.ts`) has zero dependency guard - it unconditionally removes the vendor from local state - and `Vendors.tsx`'s own delete-confirmation dialog explicitly promises the user: *"Existing purchase and payable records linked to this vendor will retain the vendor name but lose the link."* Both `inventory_purchases.vendor_id` and `company_pos.vendor_id` were left at the Postgres default, `ON DELETE NO ACTION`, which would reject a vendor delete outright the moment a real referencing row exists - directly contradicting that promised, unconditional behavior. `petty_expenses.vendor_id` (Phase 4) already used `ON DELETE SET NULL` correctly and served as the proven working precedent, including safe interaction with an `UPDATE`-firing `updated_at` trigger on the same table.

Both `inventory_purchases.vendor_id` and `company_pos.vendor_id` were corrected to `ON DELETE SET NULL`, using a `confdeltype`-guarded `DO` block so a second run of the migration is a genuine no-op rather than an unnecessary drop/recreate. Before writing the SQL, the trigger interaction was checked live: `company_pos` has its own `BEFORE UPDATE` `set_updated_at_timestamp()` trigger, which fires on the internal `UPDATE` an `ON DELETE SET NULL` action performs - confirmed safe by direct comparison against the already-proven `petty_expenses` precedent. `inventory_purchases`'s only trigger (`trg_increase_stock`) is `AFTER INSERT`-only and cannot fire on this path at all.

`inventory_purchases.vendor_id` is a pre-existing object (Phase 1 only ever added `organization_id`/RLS to this table); correcting it follows the same "pre-existing table, modify only when necessary" precedent already used for `projects.customer_id` in Phase 5. `company_pos.vendor_id` required a separate, explicit approval given by the user specifically because it touches a frozen Phase 3 object - granted on the stated grounds that the correction preserves the application's already-documented behavior, matches `company_pos`'s own cached vendor snapshot design (`vendor_name`/`vendor_address`/`vendor_gst`/`vendor_contact`, which already survive independently of `vendor_id`), and corrects a confirmed database/application mismatch.

## 5. Deliberately not added

`vendors.email` - a confirmed live column with zero frontend read/write path anywhere in the codebase (exhaustive grep, zero occurrences) - left untouched. Not necessary to preserve app behavior or fix a defect, so the standing "modify only when necessary" rule says leave it alone.

`vendors.gstin` was not renamed to match the frontend's `gstNumber` field name. The two are the same concept under different names; renaming is cosmetic churn with no behavioral benefit. The mapping is intended to be handled at the future service/adapter layer, the same way every other camelCase/snake_case pair already is.

No `UNIQUE` constraint on `name`. `Vendors.tsx` blocks on a duplicate name; `VendorSelect.tsx` silently reuses the existing vendor instead; the backup-restore/merge path in `store.ts` (`vendors: (data.vendors as Vendor[]) || []`) applies no dedup at all. A DB-level `UNIQUE` constraint would be stricter than the app's own confirmed, already-inconsistent behavior across all its write paths - left out per "the database adapts to the application."

No `CHECK` constraints - no field has a frontend-enforced format or range rule to mirror. No new index - `idx_vendors_org_name` already covers the only query pattern `Vendors.tsx` uses (list/search/sort by name); nothing filters or searches on `address`/`gstin`/`updated_at`. No numbering function - `Vendor` has no code/number field anywhere in the frontend, unlike `Project` (Phase 5). No new triggers beyond the one `updated_at`-maintenance trigger - `gstin`/`gstNumber` is a plain 1:1 rename-free mapping, not a duplicate-representation problem like Phase 6's `email`/`emails[]`/`primary_email`.

## 6. Review history

Design went through: a discovery/investigation round selecting `vendors` as the natural next module by dependency count → a live schema and FK inspection specifically requested before any SQL was written, which surfaced both the missing `address` column and, more significantly, the two blocking `NO ACTION` foreign keys with hard evidence (a live `pg_constraint` query plus `Vendors.tsx`'s own delete-dialog copy) → an architecture design round that ended with three explicitly unresolved questions → a resolution round applying the standing "database adapts to the application" principle to each, closing two outright and flagging the third (the frozen Phase 3 `company_pos` correction) as requiring separate, explicit approval → that approval, given → SQL generation, followed by an adversarial self-review that found and fixed one real defect (a missing `public.` schema-prefix on the reused trigger function, caught by direct comparison against the archived Phase 5/6 files) → execution → verification, during which one test-methodology error (an incorrect `security_audit_log` column name during cleanup, which left two test identities live) was caught by the residue-count check itself, disclosed, and corrected rather than reported as a false pass.

## 7. Known, disclosed limitation carried from Phase 1-6

Same as every prior phase: the frontend's local `AuthUser`/`localStorage`-based authentication remains entirely separate from Supabase Auth. None of this RLS/permission enforcement, nor the two FK corrections, is reachable by the live application yet - both become load-bearing only once a future phase wires the frontend to Supabase. The two FK corrections in particular were confirmed dormant defects rather than live incidents specifically because `vendors` held 0 rows at the time they were found.
