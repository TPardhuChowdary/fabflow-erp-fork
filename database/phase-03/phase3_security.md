# Phase 3 — Security Model: Quotations + Company POs

Status: **Implemented and behaviorally verified** against the live database using real, non-superuser sessions. See [phase3_verification.md](./phase3_verification.md) for method and [phase3_completion_report.md](./phase3_completion_report.md) for results.

## 1. Threat model addressed

Quotation pricing, customer PO records, and company procurement records are commercially sensitive. Phase 3's job is to make sure access to them is gated by the permission module the live frontend actually checks — not a plausible-looking module inferred from the table's name.

## 2. Permission-module mapping — the central security finding of this phase

The original draft design assumed every PO-related table (`master_pos`, `quotation_purchase_orders`, `project_purchase_orders`) would be scoped to a `purchase_orders` module, matching their names. Re-reading the actual gating code in `Quotations.tsx`, `PurchaseOrders.tsx`, and `ProjectDetail.tsx` directly proved this wrong for every creation path: `addMasterPO`, the fan-out's `addProjectPO`, and `addQuotationPurchaseOrder` are all called only from inside `Quotations.tsx`'s Record PO handler, gated by `quotations.edit` — not `purchase_orders.create`. Shipping the naive mapping would have blocked the real live workflow for any user with full `quotations.edit` but no separate `purchase_orders.create` grant, a real access regression discovered before implementation, not after.

**`master_pos` in particular has a genuinely split mapping**, verified live: creation requires `quotations.edit`; viewing/updating/deleting requires `purchase_orders.*`. This was proven not just as a design claim but with an isolated test — a role granted `purchase_orders.create` via a per-user override, while explicitly lacking `quotations.edit`, was still correctly rejected (`42501`) when attempting to insert a `master_pos` row. That isolation technique (grant one permission via override, confirm the *other* specific permission is still required) is the same one Phase 2 used to isolate the `employee_code` immutability trigger from ordinary RLS.

## 3. `project_purchase_orders` — the first cross-module OR in this project spanning three modules

Its INSERT policy accepts `quotations.edit` **OR** `projects.edit` — two independently confirmed live creation paths (the fan-out, and `ProjectDetail.tsx`'s direct "Add PO" dialog). Its SELECT policy accepts `projects.view` **OR** `purchase_orders.view` — two independently confirmed live read contexts. Both ORs were verified live and directly, not just asserted: a `Designer`-role session (`projects.edit=true`, `quotations.edit=false` — a real seeded grant combination) successfully inserted via the `projects.edit` path alone; a `quality`-role session (`quotations.edit=false`, `projects.edit=false` — also real seeded data) was correctly rejected.

## 4. `SECURITY DEFINER` functions introduced this phase

Only one: `generate_quotation_number()`, `SECURITY DEFINER`, `SET search_path = public` — needs to write to `document_counters` regardless of the caller's own grants on it, the identical rationale as `generate_employee_code()` in Phase 2. No new trigger functions were needed this phase; `set_updated_at_timestamp()` is reused from Phase 2 completely unmodified.

## 5. Integrity constraints as a security-adjacent property

`unique(quotation_id, revision_number)` and `unique(quotation_id) WHERE is_current` prevent a class of data-integrity attack where a malicious or buggy client could otherwise create ambiguous revision history (two "current" prices for the same quotation) that downstream financial logic (invoicing, PO validation) would have to guess between. Verified live: both constraints reject the conflicting insert with the correct constraint name in the error.

## 6. FK-based integrity replacing string-matched relationships

The frontend's `sharedPoId` (a bare string, copied into three tables with zero validation) is replaced by `master_pos.id` as a real foreign key target. This closes an actual information-integrity gap: previously, nothing prevented a `quotation_purchase_orders` or `project_purchase_orders` row from referencing a `sharedPoId` that didn't correspond to any real `MasterPO` at all (a typo, a race, a partial write). Now the database itself guarantees every such reference is valid, or the write is rejected. Verified live for both `RESTRICT` relationships (`master_po_id` on both dependent tables) and the deliberate `SET NULL` on `project_purchase_orders.quotation_id` (an informational-only back-reference, not a structural one).

## 7. Organization isolation

Same mechanism as every table in Phase 1/2 — `organization_id = current_organization_id()` ANDed into every policy. Verified live this phase specifically for `quotations`: a session in a second, isolated test organization saw zero rows of the first organization's real quotation data.

## 8. Known, disclosed limitation

Same caveat as Phase 1 and Phase 2: the frontend's local `AuthUser`/`localStorage`-based authentication is still entirely separate from Supabase Auth, so none of this RLS/permission enforcement is reachable by the live application yet — it becomes load-bearing only once a future phase wires the frontend to Supabase Auth.
