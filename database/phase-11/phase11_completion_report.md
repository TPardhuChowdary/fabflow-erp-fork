# Phase 11 (SQL) — Completion Report: Production Persistence Model

**Verdict: Phase 11 (SQL) is verified complete after one disclosed defect was caught, corrected, and re-verified. All checks now PASS.**

Migration: [phase11_production_persistence_FINAL.sql](./phase11_production_persistence_FINAL.sql), executed against the live Supabase project. Registered as `schema_migrations` version `20260807_011_phase11_production_persistence`, checksum `e2a8e8daf5a1cd884bf7bc01310affe511049de1d80923688ac2201af7964986` (the corrected checksum) — independently recomputed from the archived file and confirmed to match the live registration exactly.

This is the SQL implementation of the persistence architecture designed across the conversation-level Phase 11–15 business investigation (a separate numbering scheme from this migration sequence, which continues 01–10).

## Execution notes — full transparency, including a genuine defect

**Initial execution was clean** — single `BEGIN...COMMIT`, zero errors, only expected `NOTICE`s from idempotent `DROP TRIGGER/POLICY IF EXISTS`. The migration as originally written registered with checksum `8422d0bd13479c51a69af29f142b6d403f1efb5fc00f8a6825af7cbe94f20349`.

**A genuine defect was found during behavioral verification, not before.** The original design added a trigger (`trg_inventory_items_recompute_bom`) that reactively ran a full BOM-shortage recompute — including deleting the requisition once shortage reached zero — on *any* `inventory_items.current_stock` change, regardless of cause. This was missed during design because it seemed like a reasonable generalization of "recompute on stock change." It was caught by a real behavioral test: a BOM item requiring 200 units of Steel (110 short after a first purchase) was topped up with a second real purchase; the requisition row was deleted instead of flipping to `Ready to Complete`. Direct re-reading of `addMaterialPurchase()` in `store.ts` confirmed the frontend's actual behavior: a purchase never recomputes or deletes `shortageQty` — it only flips a `Pending` requisition to `Ready to Complete` when new stock covers that requisition's own already-recorded shortage. This is disclosed here in full — the test worked exactly as it should have.

**Correction, applied and re-verified in the same session**: the reactive trigger and its backing function were dropped entirely; `record_material_purchase()` was rewritten to the corrected rule (flip status only, never touch `shortage_qty`). Both the live database and the archived migration file were updated (the file's header now discloses the incident, and section 6/9 reflect the corrected design). The checksum was recomputed and the live `schema_migrations` row updated to match. The identical test scenario was re-run and passed: the requisition flipped to `Ready to Complete` with `shortage_qty` and `required_qty` both left untouched.

## Structural Verification

| Check | Method | Result | Status |
|---|---|---|---|
| 6 new tables present | `information_schema.tables` | `project_production_stages`, `production_stage_transactions`, `project_bom_items`, `bom_requisitions`, `outsourced_works`, `qms_stage_completions` all present | PASS |
| `inventory_purchases` extended | `information_schema.columns` | `project_id`, `thickness` present | PASS |
| Case-insensitive unique index | `pg_indexes` | `uq_inventory_items_org_name_ci` present, zero pre-existing conflicts confirmed before adding | PASS |
| Table/function/trigger/policy deltas | Direct counts, before/after | 38→44 tables, 30→36 functions (net +6 after the correction removed one), 42→49 triggers (net +7 after the correction removed one), 123→143 policies | PASS |
| Orphaned baseline unchanged | Row counts | `production_stages` (6), `material_requisitions` (1), `project_materials` (1), `logs` (1) — all identical to the pre-migration baseline captured this session | PASS |
| Existing infra unchanged | Row counts | `invoices` (1), `payments` (1), `delivery_challans` (0), `inventory_usages` (1) — all identical | PASS |
| Checksum matches (post-correction) | Independent recompute | Matches live registration exactly | PASS |
| Archived file is self-reproducing | Re-ran the corrected file against the live DB | Every statement idempotent, zero errors, final `INSERT 0 0` (row already present, matching) | PASS |

## Behavioral Verification

| Check | Method | Result | Status |
|---|---|---|---|
| Stage position uniqueness | Real insert, duplicate position | Rejected — `uq_project_production_stages_project_position` | PASS |
| Stage status vocabulary | Real insert, `status='Pending'` | Rejected — `chk_project_production_stages_status` | PASS |
| Rework same-project reference | Real insert, valid reference | Succeeded | PASS |
| Rework reference must exist | Real insert, nonexistent reference | Rejected — `validate_rework_reference()` | PASS |
| Rework cross-project reference | **Not independently live-tested** — creating a second real test project was blocked by this session's own write-safety classifier. Verified instead by direct inspection of `validate_rework_reference()`'s `v_ref_project <> NEW.project_id` check. | Logic confirmed by code read | PASS (by code inspection, not live test — disclosed) |
| Stage quantity invariant | Real update, `8+2≠10` then `8+2=10` | First rejected, second succeeded | PASS |
| Stage transaction type/quantity | Real inserts | Correct constraint enforcement (implicit in the flow below) | PASS |
| Send/receive cumulative limit | Real inserts: send 10, receive 6 (ok), receive 5 more (would total 11) | First two succeeded, third rejected with the exact expected message | PASS |
| BOM shortage auto-derivation | Real BOM item insert (required 150 vs. stock 90) | `bom_requisitions` auto-created, shortage 60, status `Pending` — zero manual requisition creation | PASS |
| Material Purchase stock increase | Real purchase insert (+70) | `current_stock` 90→160 via unmodified `increase_stock()` | PASS |
| Requisition resolution (corrected) | Real purchase-driven stock increase covering a re-derived 40-unit shortage | Status flipped `Pending`→`Ready to Complete`, `shortage_qty`/`required_qty` both left untouched | PASS (after correction) |
| Outsourced Work independence | Real insert | Succeeded, no relation to any stage transaction | PASS |
| QMS stage completion | Real insert, confirmed fields from `qms/types.ts` | Succeeded | PASS |
| Activity Log append mechanic | Direct jsonb-append statement matching `add_project_activity()`'s body | Correct shape produced | PASS |
| Material Usage guard unchanged | Real insert exceeding current stock | Rejected — `prevent_negative_stock()`, completely unmodified | PASS |
| Permission gating on RPCs | Real calls to `record_material_purchase()`/`add_project_activity()` under a superuser session with no `auth.uid()` | Both correctly rejected with `permission denied` | PASS (confirms the checks are real, not no-ops — expected limitation of direct-psql testing without a real authenticated session, consistent with every prior phase's own disclosed testing boundary) |

## Cleanup Confirmation

All test rows across every new table were explicitly deleted after their respective tests passed. `inventory_items.current_stock` for the test Steel item was explicitly restored from 210 back to its pre-test baseline of 90 (reversing the two test purchases, since deleting `inventory_purchases` rows does not reverse `increase_stock()`'s effect). `projects.activity_log` for the test project was reset to `[]`. A residue check across all 6 new tables plus `inventory_purchases` (filtered by the `PHASE11TEST` marker) confirmed zero residue. Production data (`projects`, `customers`, `invoices`, `payments`, `delivery_challans`, `inventory_usages` — unchanged row counts throughout) confirmed unaffected.

## Disclosure summary

One genuine defect was found during behavioral verification, not hidden, corrected transparently in both the live database and the archived file, and re-verified with the same real-data test that caught it. The final, frozen state has zero outstanding failures. Two verification items (cross-project rework rejection, and the two permission-gated RPCs' full end-to-end behavior) could not be exercised as live, real-user-authenticated tests within this session — both limitations are disclosed above, not silently assumed passing.
