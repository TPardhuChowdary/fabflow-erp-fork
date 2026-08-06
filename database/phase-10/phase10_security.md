# Phase 10 — Security Model: Delivery Challans

Status: **Implemented and behaviorally verified** against the live database using direct queries and real behavioral tests, including one disclosed defect caught and corrected mid-verification. See [phase10_verification.md](./phase10_verification.md) for method and [phase10_completion_report.md](./phase10_completion_report.md) for results.

## 1. Threat model addressed

Like every prior phase, this introduces zero new RLS policies and zero new permission-module mappings. Its access-control-relevant work is entirely about verifying an already-frozen policy set still correctly matches live frontend gating.

## 2. RLS - confirmed reusable, not redesigned

Phase 1 already enabled RLS with the standard 4 policies, matching the `delivery_challans` permission module's 7 actions. Confirmed live post-execution: policy count unchanged at 123, all 4 policies byte-for-byte identical. The 18 new columns are automatically covered - RLS gates rows, not columns.

## 3. The `customer_id` FK correction - a data-integrity control, and the source of this phase's one defect

Correcting the default `ON DELETE NO ACTION` to `SET NULL` does not change who can do what; it changes what happens to a delivery challan when a customer a user was already authorized to delete is actually deleted, matching a confirmed gap in `deleteCustomer()`'s guard. The first attempt at this correction also, incorrectly, made `customer_id` `NOT NULL` - a combination that is fundamentally incompatible with `SET NULL` and was proven broken by a real, live delete attempt during verification (see the architecture and completion-report documents for the full incident). The corrected design - nullable `customer_id`, `SET NULL` FK, "required at creation" left to frontend validation - matches the exact pattern already used for `vendor_id` and `inventory_item_id` in Phases 7 and 8, neither of which had this conflict because neither was ever made `NOT NULL`. This phase's incident is a useful, disclosed confirmation of why that precedent exists.

## 4. `NOT NULL` and defaults

`dispatch_date`'s `NOT NULL` matches `DeliveryChallans.tsx`'s own confirmed runtime validation ("Dispatch date is required"), and was safe to add directly since the table held 0 rows. No other new column received `NOT NULL`.

## 5. Organization isolation

Unchanged from Phase 1 - `organization_id = current_organization_id()` remains part of every existing policy. Not independently re-tested this phase, since the policies themselves are unmodified.

## 6. Known, disclosed limitation carried from Phase 1-9

Same caveat as every prior phase: the frontend's local `AuthUser`/`localStorage`-based authentication is still entirely separate from Supabase Auth, so none of this is reachable by the live application yet.
