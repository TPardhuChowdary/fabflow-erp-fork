# Phase 6 — Architecture: Customers

Status: **Implemented, executed, and fully verified** against the live Supabase project. This is the final, frozen design.

## 1. The second pre-existing table this migration extends, not creates

Like `projects` in Phase 5, `customers` is one of Phase 1's 14 pre-existing tables - given only `organization_id` and RLS by Phase 1, structurally untouched since. This is the second phase to extend a pre-existing table rather than create a new one, and the methodology carried over directly: read the live schema first, compare it field-by-field against the frontend's `Customer` type, and adapt the database to match rather than the reverse.

## 2. What already existed, confirmed via a live read before any SQL was written

`\d public.customers` (read-only, before writing this migration) showed exactly 8 columns: `id uuid` PK (`uuid_generate_v4()` default, the pre-existing table's own convention, left as-is), `name text` **already `NOT NULL`**, `contact_person text`, `email text`, `phone text`, `gstin text`, `created_at timestamptz`, `organization_id uuid not null`. Zero triggers. Zero `CHECK`/`UNIQUE` constraints beyond the primary key. RLS already enabled with all 4 policies (`customers_select/insert/update/delete`) confirmed to already match `Customers.tsx`'s `canView/canCreate/canEdit/canDelete` gating exactly - single-module, no cross-module OR.

## 3. Columns added

`address`, `state_name`, `state_code` (all `text`), `additional_details` (jsonb, an array of `{key, value}` pairs), `emails` (jsonb, an array of `{email, type}` objects), `primary_email` (text) - all nullable, matching confirmed runtime behavior: `Customers.tsx`'s `handleSave` validates only `name` as required. `address`'s frontend type declares it non-optional (`address: string`, no `?`), but was checked specifically and found to have zero runtime enforcement - runtime behavior, not the type annotation, was treated as the specification, the identical precedent already established for `Project.totalQty` in Phase 5. `updated_at timestamptz not null default now()`, backfilled via Postgres 11+'s fast-path default for the one existing row, the same pattern used for `projects.updated_at`.

Every one of these fields was confirmed live and actively read/displayed across `Quotations`, `Invoices`, `DeliveryChallans`, `Ledger`, `ProjectDetail`, `CustomerHistory`, and `ExportEngine` - not speculative future fields, but data the frontend already prints on real documents today, with zero corresponding column existing under any name before this phase.

## 4. `email` / `emails` / `primary_email` - the one place this phase adds real logic, not just columns

Confirmed directly from source (`Customers.tsx:91`'s own comment: *"Sync primaryEmail to legacy email field for backward compat"*): `emails[]` + `primaryEmail` is the authoritative, current model; the pre-existing `email` column is a derived mirror, written from the other two, never the reverse. Adding `emails`/`primary_email` as new columns while leaving `email` independent would have recreated exactly the "duplicate source of truth that can drift" problem this project's standing rules forbid - nothing would have kept the three consistent for any write path other than the one in `Customers.tsx` today.

Closed with a new trigger, `sync_customer_email()` (`BEFORE INSERT OR UPDATE`), that recomputes `email` using the identical fallback chain the frontend already uses: `primary_email`, then `emails[0].email`, then whatever the caller explicitly submitted for `email` in that same write. That last fallback was the one open architectural question carried out of the design review, resolved as the interpretation that most literally mirrors the frontend's own formula and changes no behavior. Verified live post-execution across four distinct cases (primary_email set, emails-only fallback, both-empty-preserve-direct-write, and an empty-but-non-null `emails` array gracefully falling through) - all four matched the predicted result exactly.

One confirmed, disclosed consequence of this design: a standalone direct write to `email` (not touching `primary_email`/`emails`) is silently overridden back to the already-populated `primary_email` value. This was traced during the adversarial review as a real but unreachable-in-practice scenario - `Customers.tsx`'s save handler always submits all three fields together, every save - and was proven live during verification, not just reasoned about.

## 5. Deliberately not added

No `CHECK` constraints on `gstin`/`phone`/`email` format - `Customers.tsx` was searched specifically for validation regex/pattern logic; none exists. No `UNIQUE` constraint on `name`/`gstin`/`email` - no duplicate-prevention check exists in the save handler. No `CHECK` tying `primary_email` to membership in `emails[]` - the frontend's UI happens to always produce that relationship through its own flow, but never asserts it as an explicit rule. Adding any of these would have invented semantics the frontend does not itself enforce.

No new index - `Customers.tsx`'s search box was read directly and confirmed to filter only on `name` and `contactPerson`; no query pattern justifies indexing `gstin`/`email`/`emails`.

No RLS changes - all 4 existing policies gate rows, not columns, and already match live frontend gating exactly.

## 6. Review history

Design went through: a discovery/investigation round selecting `customers` as the natural next module (four already-frozen foreign keys depend on it - more than any other remaining pre-existing table) → a live schema inspection specifically requested before any SQL was written, which corrected initial assumptions and surfaced the `email`/`emails[]`/`primary_email` authoritativeness question with hard evidence from the code's own comments → an architecture design round that ended with one explicitly unresolved question (the `email` trigger's final fallback) → SQL generation, resolving that question with clear reasoning and disclosure → a static self-review that caught a real gap (rollback considerations not yet in the file, per that round's explicit requirement) and fixed it → a fully independent adversarial review that re-derived every category from scratch and found no new defect → execution → verification, during which one flawed test (an `updated_at` check inside a single transaction, where `now()` is frozen for the whole transaction) was caught, disclosed, and corrected rather than reported as a false pass.

## 7. Known, disclosed limitation carried from Phase 1-5

Same as every prior phase: the frontend's local `AuthUser`/`localStorage`-based authentication remains entirely separate from Supabase Auth. None of this RLS/permission enforcement, nor `sync_customer_email()`, is reachable by the live application yet - both become load-bearing only once a future phase wires the frontend to Supabase.
