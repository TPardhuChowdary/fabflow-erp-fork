# Phase 28 — Final Remaining-Domain Investigation (READ-ONLY)

No code, database, schema, RLS, trigger, permission, or data changes were made
in this phase. No test fixtures were created. Every DB-side fact below is
either (a) freshly re-confirmed this phase via read-only Supabase queries
(`select(...)` column-existence probes and `count: 'exact'` row counts,
executed under the current, RLS-restricted `user1@gmail.com` session) or (b)
carried from Phase 25's `MASTER_AUDIT.md` / Phase 26's `PREFLIGHT.md`, both
originally confirmed via direct `psql` access in an earlier session and
explicitly re-verifiable, not re-derived from memory. Every frontend-side
fact was confirmed by direct source reads this phase (`types.ts`, `store.ts`,
`pages/Production.tsx`, `pages/ProjectDetail.tsx`, `qms/**`).

---

## 1. Exact remaining-domain count

**3 tables, 2 independent systems.**

| Table | System |
|---|---|
| `project_production_stages` | "V2 Production" (local Zustand `projectProductions`) |
| `production_stage_transactions` | same system, child of the row above |
| `qms_stage_completions` | QMS module (separate IndexedDB-backed subsystem) |

Confirmed against the current overall state: **26 of 28 identified domains
are migrated and Supabase-backed** (unchanged from the Batch-5 final report).
These 3 tables (2 systems) are the entirety of what remains. No other
previously-migrated domain was found regressed or bypassed this phase (see
§11).

---

## 2. Complete dependency graph

```
projects ✓ (migrated) ──┬── project_production_stages
                         │       └── production_stage_transactions
                         │             (hard FK: stage_id → project_production_stages.id)
                         │
                         └── qms_stage_completions
                                 (soft link only — see below)

project_production_stages ──(self-referencing FK)── reference_stage_id
    (rework stage → the stage it reworks; trg_validate_rework_reference
     enforces same-project only)

production_stage_transactions ──(FK)── vendors ✓ (migrated)
    (vendor_id, nullable — "inhouse" sentinel has no real vendor row)

qms_stage_completions ──(FK)── projects ✓ (migrated)
    stage_id on this table is NOT an FK to project_production_stages —
    it references qms's own independent InspectionStageDefinition id
    space (a master-data list, its own separate IndexedDB store, no
    Supabase table found for it either). The two "stage" concepts —
    V2 production stages and QMS inspection stages — are named
    similarly but are unrelated identifier spaces today.

Frontend-only, no DB table at all:
    Employees (assignedEmployeeIds) — project-level only, not per-stage
    InspectionStageDefinition — QMS master data, IndexedDB only
    ProductionMovement ("Move Qty →" audit trail) — 100% local, no DB
        table found for it; not counted as one of the 3 remaining
        domains because it was never in the Phase 25 26-table inventory
        — flagging here as a newly-observed gap, not a scope item.
```

**No cross-dependency between the two remaining systems exists at the
data layer.** `project_production_stages`/`production_stage_transactions`
and `qms_stage_completions` can be decided and migrated (or not)
completely independently of each other. Their only frontend-visible
relationship is that `ProjectDetail.tsx`'s "Production Summary" panel
displays numbers from both side by side (`receivedQty` from V2 stages,
`acceptedQty`/`rejectedQty` from QMS) — a display-layer join only, not a
data-layer one.

---

## 3. Frontend → DB field mapping

### `project_production_stages`

Confirmed DB columns (re-verified this phase via column-existence probes):
`id, organization_id, project_id, stage_name, status, sent_qty, received_qty,
ok_qty, rejected_qty, is_rework, reference_stage_id, rework_stage_name,
position, notes, requires_material_tracking, created_at, updated_at`.

Confirmed **absent**: `assigned_to`, `vendor`, `start_time`, `end_time`,
`quantity_sent`, `sent_date_time`, `received_quantity`, `received_date_time`,
`rework_qty`, `ordered_qty`, `wip_in_progress_qty`, `wip_completed_qty`,
`wip_dispatched_qty`.

| Frontend field (`ProjectProductionStage`) | DB column | Note |
|---|---|---|
| `stageName` | `stage_name` | direct |
| `status` (`ProjectStageStatus`) | `status` | byte-for-byte enum match, re-confirmed |
| `notes` | `notes` | direct |
| `requiresMaterialTracking` | `requires_material_tracking` | direct — **this phase corrects Phase 25's framing**, which implied this field had no DB column; it does |
| `sentQty` | `sent_qty` | direct (V2 field) |
| `receivedQty` | `received_qty` | direct (V2 field) |
| `okQty` | `ok_qty` | direct (V2 field) |
| `rejectedQty` | `rejected_qty` | direct (V2 field) |
| `isRework` | `is_rework` | direct |
| `referenceId` | `reference_stage_id` | name differs, concept direct; frontend value is unstable (see §6) |
| `reworkStage` | `rework_stage_name` | name differs, concept direct |
| (array position) | `position`, UNIQUE per project | **frontend has no equivalent field at all** — stages are ordered by array index, not a stored value; reconciliation would need to synthesize `position` from array order |
| `stageId` | `id` | **frontend's `stageId` is optional and only ever populated for synthetic rework stages** — the base 11 stages have no stable id today; DB's `id` is a real always-present UUID PK |
| `quantitySent`, `sentDateTime`, `sentToVendorId`, `sentToVendorName`, `receivedQuantity`, `receivedDateTime` (V1-legacy duplicate fields) | *(no column)* | dead weight if migrated as-is — see §6 |
| `startTime`, `endTime` | *(no column)* | confirmed never read/written anywhere despite being declared — pure dead fields, safe to drop |
| `reworkQty` | *(no column)* | distinct from `is_rework`/`reference_stage_id`; DB has no equivalent |
| `assignedTo`, `vendor` | *(no column)* | confirmed **write-only dead fields in the frontend itself** (see §6) — not just missing from DB, unused everywhere |
| `orderedQty`, `wipInProgressQty`, `wipCompletedQty`, `wipDispatchedQty` | *(no column)* | confirmed **entirely dead** in the frontend too — declared, reset to 0 on project-repeat, never read or written by any handler |
| `transactions?: StageTransaction[]` | *(embedded in `production_stage_transactions`, a real child table)* | see below |

### `production_stage_transactions`

Confirmed DB columns: `id, organization_id, stage_id, type, quantity,
event_time, vendor_id, vendor_name, created_at`. Confirmed absent: `notes`.

| Frontend field (`StageTransaction`) | DB column |
|---|---|
| `id` | `id` |
| `type` (`"send"\|"receive"`) | `type` |
| `quantity` | `quantity` |
| `dateTime` | `event_time` |
| `sentToVendorId` | `vendor_id` |
| `sentToVendorName` | `vendor_name` |

Structurally this table is a near-exact match — no orphan fields either
direction, aside from the frontend embedding it as `stage.transactions[]`
rather than a sibling table.

### `qms_stage_completions`

Confirmed DB columns: `id, organization_id, project_id, stage_id,
accepted_qty, rejected_qty, completed_at, created_at, updated_at`. Confirmed
absent: `status`, `is_completed`, `completed_by`, `inspector_id`, `notes`,
`signature`.

The frontend `InspectionStageCompletion` type has **13 fields**; the DB
table has **9 columns**, and the overlap is much smaller than that count
suggests:

| Frontend field | DB column | Note |
|---|---|---|
| `id` | `id` | direct |
| — (`sheetId`) | *(no column)* | **the single most important missing field** — DB has `project_id` but no `sheet_id`/equivalent; the frontend's entire model is scoped to a specific `InspectionSheet` (one project can have many sheets across revisions), which the DB schema cannot represent at all |
| `stageId` | `stage_id` | direct, but **different identifier space** — frontend's `stageId` here refers to `InspectionStageDefinition.id` (QMS master data), unrelated to `project_production_stages.id` |
| `acceptedQty` | `accepted_qty` | direct |
| `rejectedQty` | `rejected_qty` | direct |
| `completedAt` | `completed_at` | direct |
| `updatedAt` | `updated_at` | direct |
| `mode` (`"Paper"\|"Digital"`) | *(no column)* | missing |
| `inspectorName` | *(no column)* | missing |
| `signatureDataUrl` | *(no column)* | missing — this alone (a base64 PNG signature capture) has no jsonb/text column to land in |
| `remarks` | *(no column)* | missing |
| `signedAt` | *(no column)* | missing |
| `assignedTo`, `assignedToName`, `assignedBy`, `assignedAt`, `dueDate` (the entire Phase-3 assignment feature) | *(no column)* | missing entirely |

**Roughly half the frontend type's fields, including the entire assignment
workflow and the entire signature-capture workflow, have no DB
representation whatsoever.** This is a materially different — and much
larger — gap than the V2 production system's.

---

## 4. All mutation/read call sites

### V2 Production (`projectProductions` / `ProjectProductionStage[]`)

**Store actions** (`store.ts`), all plain local `set()` calls, zero
Supabase infrastructure (confirmed: no `hydrateProductionStages` anywhere
in `hydration.ts`/`useSupabaseHydration.ts`):
- `addStageTransaction(projectId, stageIdx, tx)` — store.ts:1855-1877.
  Appends to `stage.transactions[]`, then **recomputes** `quantitySent`/
  `receivedQuantity` (the V1-legacy fields) from the full transaction
  history on every call — a derived aggregate kept in sync client-side.
- `updateProjectStagesV2(projectId, stages)` — store.ts:1879-1884. Whole-array
  replace of one project's `stages`.
- `addProductionMovement(m)` — store.ts:3000-3003. Plain append to the
  fully separate `productionMovements` array (see §6, item 6).
- Project creation seeds a default V2 production row (store.ts:1679,
  `defaultV2Production`, built from the 11-entry `DEFAULT_V2_STAGES`
  constant, store.ts:80-95).
- `repeatProject` clones a project's stages, explicitly zeroing the WIP
  fields (store.ts:3140-3142) — the only other place those 4 dead fields
  are touched at all.

**Page call sites:**
- `pages/Production.tsx` — the primary editing surface. Send/Receive
  dialogs (~lines 456-513), status-change handlers with material-
  availability gating (~363-416), rework creation (`handleSendToRework`,
  535-577), transaction history table (1162).
- `pages/ProjectDetail.tsx` — a **largely duplicated second copy** of the
  same Send/Receive/status logic (own `SentToSelect`, own dialogs,
  ~1308-1358), plus the sequential-stage lock (3303-3304, **not present in
  Production.tsx**), the derived balance calculation (3661-3669), the
  "Move Qty →" dialog (5620-5734), and the Production Summary panel
  (1766-1835) that also pulls in QMS numbers.
- `pages/Settings.tsx:710` — read-only, full-state JSON backup export.
- `pages/ExportEngine.tsx:292,306` — read-only, printable project report.
- `pages/Projects.tsx:148` — comment only, no functional call site.

### QMS (`qms_stage_completions` / `InspectionStageCompletion`)

**API layer** (`qms/api/inspections.ts`), all IndexedDB-backed:
`getStageCompletions`, `setStageCompletionMode`, `setStageCompletionQty`
(no numeric validation at all — accepts negative/non-integer/unbounded
values), `signStage` (also advances sheet status, logs history), `assignStage`
(also logs history; no `dueDate` setter exists anywhere despite the field
being declared), `getAllAssignments`, `getAllStageCompletions`. Row creation
happens only inside `generateInspectionSheet`, `updateInspectionSheetStages`,
and `createRevision` — never a standalone "create one completion" call.

**Cache layer** (`qms/store/useQmsStore.ts`): a cross-project
`stageCompletions: InspectionStageCompletion[]` array, refreshed only by a
full `getAllStageCompletions()` re-fetch (`loadStageCompletions`, no
incremental sync). **No wrapper actions exist for the per-stage mutators** —
components call `qms/api/inspections.ts` directly.

**Page/component call sites:**
- `qms/components/inspection/InspectionSheetView.tsx` — the actual editing
  surface, keeps its own **component-local** `completions` state, separate
  from the Zustand cache; explicitly re-syncs the Zustand cache only after
  `setStageCompletionQty` (not after `assignStage`/`signStage`/mode-change/
  uploads — a confirmed staleness gap, see §6).
- `qms/pages/InspectorDashboard.tsx` — "My Assigned Inspections",
  `getAllAssignments()` filtered by `currentUser.employeeId`.
- `qms/pages/InspectionSheetsList.tsx` — `getAllStageCompletions()` for
  cross-sheet search only.
- `pages/ProjectDetail.tsx` — `getQualityQtyTotals()` (419-442) sums
  `acceptedQty`/`rejectedQty` across the latest inspection sheet's
  completions for the header badge and Production Summary panel.
- Embedding chain: `ProjectDetail.tsx` → `qms/pages/ProjectInspectionTab.tsx`
  → `qms/components/inspection/InspectionSheetView.tsx` →
  `qms/api/inspections.ts` → IndexedDB.

---

## 5. Trigger/function behavior and risks

Re-confirmed from Phase 25/26 (trigger names, not re-read via psql this
phase since read-only DB access this session is anon-key/RLS-scoped, not
superuser — column-existence and row-count checks are all that's directly
verifiable that way; trigger bodies are trusted from the prior phase's
direct psql inspection, consistent with every fact re-confirmed this phase
via other means):

| Trigger | Table | Behavior | Risk if migrated |
|---|---|---|---|
| `trg_validate_rework_reference` (BEFORE INSERT/UPDATE, raises) | `project_production_stages` | Ensures a rework stage's `reference_stage_id` belongs to the same `project_id` | Low in isolation — mechanical, catch-and-surface like every other raise-trigger already handled in Batches 1-5. **But** the frontend's current `referenceId` is populated from `stage.stageId || "stage-${stageIdx}"` (Production.tsx:~570) — an **unstable, non-persistent fallback string**, not a real id. Migrating as-is would send garbage into a column a real FK-validating trigger checks. Every base stage needs a real, stable DB `id` before rework references can be trusted. |
| `trg_enforce_stage_transaction_limit` (BEFORE INSERT, raises) | `production_stage_transactions` | Locks the parent stage row, blocks a `'receive'` if cumulative received would exceed cumulative sent | Directly enforces exactly what the frontend's own duplicated (Production.tsx + ProjectDetail.tsx) "Cannot receive more than sent" check already does — **this migration would upgrade a client-only soft check into a real DB-enforced hard rule**, which is a behavior tightening, not a behavior change, assuming no bad legacy data exists (confirmed: 0 rows in either table today). |
| `trg_qms_stage_completions_updated_at` | `qms_stage_completions` | Plain timestamp maintenance | No business logic, no risk. |

**No trigger enforces**: the "OK+Rejected must equal Received" rule (only
in `Production.tsx`, not even in `ProjectDetail.tsx`); the sequential
stage-lock (only in `ProjectDetail.tsx`, not `Production.tsx`, not the DB);
quantity conservation across the "Move Qty →" feature (nowhere at all, a
confirmed existing gap independent of migration).

---

## 6. Local-only fields / state (confirmed dead, confirmed live, or confirmed ambiguous)

1. **`assignedTo`/`vendor` on `ProjectProductionStage`** — confirmed
   **write-only dead fields in the frontend itself**, not merely absent
   from the DB. Only ever set to `""` in one rework-creation code path;
   never read anywhere, never rendered.
2. **`orderedQty`/`wipInProgressQty`/`wipCompletedQty`/`wipDispatchedQty`**
   ("WIP quantity tracking (Feature 2)") — confirmed **entirely dead**:
   declared, reset to `0` in exactly one place (`repeatProject`), never
   read or written by any real handler, no UI displays them.
3. **`startTime`/`endTime`** — declared, always empty string, never read
   or written by any handler. Dead.
4. **V1-legacy duplicate fields** (`quantitySent`, `sentDateTime`,
   `receivedQuantity`, `receivedDateTime`, and the top-level
   `sentToVendorId`/`sentToVendorName` on the stage itself, as opposed to
   on each transaction) — **not dead**, but redundant: `addStageTransaction`
   keeps `quantitySent`/`receivedQuantity` as a derived aggregate of the
   real `transactions[]` array on every write. If `production_stage_
   transactions` becomes the DB source of truth, these four fields become
   pure display-cache duplicates of a `SUM()` query — safe to keep
   computing client-side post-migration, not a blocker.
5. **`referenceId` instability** (§5) — a genuine pre-existing correctness
   gap, independent of migration, that migration would surface rather than
   cause: rework references are already fragile today (`stageIdx`-based
   fallback), a DB FK would just make the fragility visible via rejected
   writes instead of silent misattribution.
6. **`ProductionMovement` / "Move Qty →" feature** — confirmed **100%
   disconnected from the actual quantity fields it displays next to**. No
   DB table was found for it in the Phase 25 26-table inventory. This is a
   genuine pre-existing bug (the on-screen "Balance" never reflects a
   recorded movement), not something this investigation was asked to fix,
   but material to disclose: if `project_production_stages` migrates and
   `productionMovements` does not, this inconsistency persists unchanged;
   if a future decision migrates production stages, `productionMovements`
   would need its own explicit in/out-of-scope call, since it wasn't in
   the original 26-table inventory at all.
7. **QMS's entire assignment + signature-capture feature set**
   (`mode`, `inspectorName`, `signatureDataUrl`, `remarks`, `signedAt`,
   `assignedTo`, `assignedToName`, `assignedBy`, `assignedAt`, `dueDate`) —
   **all fully live and actively used** (Inspector Dashboard, sign-off
   flow, StageChecklistSection's employee picker), and **none of it has
   any DB column**. This is not dead weight to prune — it is the majority
   of the feature, entirely unrepresented in `qms_stage_completions`.
8. **`sheetId`** (QMS) — confirmed the single most structurally important
   gap: the DB table cannot distinguish which `InspectionSheet` (i.e.
   which revision) a completion belongs to at all.

---

## 7. RLS / permission behavior

- **`project_production_stages`/`production_stage_transactions`**: RLS
  module is `production` (`permissions.ts:46-50` — actions `view/create/
  edit/delete`, no `approve`). Confirmed this phase: row counts are **0**
  under the current session for both tables (consistent with Phase 26's
  psql-confirmed "0 rows, no trigger-created rows, nothing has ever been
  written").
- **`qms_stage_completions`**: RLS module is `inspection_sheets`
  (`permissions.ts:134-147` — actions `view/generate/complete/upload/
  print/review/approve/assign`, a materially richer action set than
  `production`'s, matching the richer workflow). Row count confirmed **0**
  this phase as well.
- No missing/mismatched permission module was found for either system —
  both already exist and are already wired to their respective completed
  RLS policies (per Phase 25 §9, re-confirmed structurally this phase via
  `permissions.ts`).
- One pre-existing, unrelated observation (carried from Phase 25, not
  re-derived): `quality_inspection` is a dead/unused permission key —
  present in `permissions.ts` but referenced by no table's RLS policy
  (QMS tables use `inspection_sheets` instead). Not a blocker for either
  remaining domain.
- Since both tables have 0 rows and no live write path today, there is
  **no current mismatch** between frontend permission gates and RLS to
  report — this only becomes a live concern once a domain actually starts
  writing.

---

## 8. Classification

### `project_production_stages` + `production_stage_transactions`

**C — Requires an architectural/business decision**, not a mechanical
migration and not a simple "safe with implementation details" case. The
schema match is strong enough that it is very likely the intended eventual
home, but three separate things must be decided together before any code
is written, none of which is a fact-finding question this investigation
can resolve on its own:

- **Stage identity**: the frontend's 11 base stages have no stable id
  today (`stageId` is undefined for all of them); the DB's `id` is a real
  PK and `position` is a real unique-per-project column with no frontend
  equivalent. Migrating requires either backfilling real ids onto the
  local array (a one-time reconciliation, not urgent since there are 0
  rows to conflict with) or redesigning how stages are addressed.
- **What to do with the 4 fully-dead fields** (`orderedQty` + 3 WIP
  fields) and the 2 fully-dead fields (`assignedTo`/`vendor`) — drop them
  from the write path entirely (recommended, they're unused), or carry
  them forward as local-only decoration.
- **Whether `ProductionMovement` is in scope** — it was never part of the
  original 26-table inventory, has no DB table, and its existing
  disconnection from the real balance numbers is a pre-existing bug this
  investigation surfaced but was not asked to fix.

This matches Phase 25/26's own conclusion exactly — re-confirmed, not
downgraded or upgraded by anything found this phase.

### `qms_stage_completions`

**D — Should remain intentionally out of scope**, more firmly than a
"deferred, revisit later" framing suggests. This is not primarily a
migration-effort question — it is that **the DB table represents roughly
half the frontend feature.** IndexedDB is the unambiguous, currently-
correct source of truth for a rich, actively-used workflow (assignment
routing tied to the shared `employees` roster, digital signature capture,
sheet-revision-scoped completions, auto-advancing a locked-and-reversible
status state machine). Treating the existing `qms_stage_completions` table
as a migration target would mean either (a) migrating only the two fields
it already has (`accepted_qty`/`rejected_qty`) while leaving the rest —
including `sheetId`, the field that makes a completion row meaningful at
all — permanently local, which is not a real migration of the domain, or
(b) a from-scratch schema redesign (new columns for `sheet_id`, `mode`,
signature storage, the assignment fields) that is a new engineering
project, not a continuation of this migration engagement's established
"map existing DB shape onto existing frontend shape" pattern used for
every one of the 26 completed domains so far.

---

## 9. Smallest possible decisions

### Decision F-1 — Project Production Stages / V2 System

**Question: should `project_production_stages`/`production_stage_
transactions` be migrated at all, and if so, on what timeline relative to
the rest of this engagement?**

- **Option A — Migrate now, as its own dedicated milestone.** Treat the
  schema match as confirmation of intent. Scope: backfill stable stage
  ids, decide the 6 dead fields' fate, decide `ProductionMovement`'s
  status, implement hydration + write layer + page rewiring for both
  tables, full negative/positive/reload/regression cycle — comparable
  in size to the Quotations family (Batch 2) or larger, since two pages
  (`Production.tsx` and `ProjectDetail.tsx`) currently duplicate the
  logic independently and would both need rewiring, plus the sequential-
  lock/quantity-equality rules that exist in only one of the two pages
  today would need a single, reconciled implementation.
- **Option B — Leave deferred indefinitely, explicitly out of scope for
  this entire engagement**, not just "not yet." The local V2 system stays
  exactly as reliable as it is today (page-reload-durable via Zustand
  persistence, not multi-device/multi-user safe).
- **Option C — Partial/staged approach**: migrate `project_production_
  stages` only (stage definitions, statuses, quantities) in one pass,
  explicitly leaving `production_stage_transactions` local a while longer
  and reconciling the `production` module's UI to write scalar quantity
  fields only (no per-transaction ledger yet). This still requires the
  stage-identity decision up front, and the FK from `production_stage_
  transactions.stage_id` means the *transactions* table can never migrate
  before *stages* does — but stages alone could migrate without
  transactions, unlike the reverse.

**My recommendation: Option A, but only if you want this domain
migrated as part of the current engagement at all** — the schema is
ready and the business logic is well-understood after this
investigation; deferring it doesn't reduce future cost, and the two
duplicated pages (`Production.tsx`/`ProjectDetail.tsx`) diverging
further over time is itself a live cost. If this isn't currently a
priority relative to other project work, **Option B** is a completely
reasonable, zero-risk choice — nothing about today's local system is
broken by leaving it as-is.

### Decision F-2 — QMS Stage Completions

**Question: should the existing `qms_stage_completions` table be extended
with the ~8 missing columns to become a real migration target, or should
QMS stage completions be formally declared permanently out of scope for
this Supabase-migration engagement?**

- **Option A — Formally close this as out of scope.** State plainly that
  QMS is, and will remain, an independent IndexedDB-backed subsystem by
  design, not a Supabase migration candidate under this engagement. Zero
  further investigation or schema work needed.
- **Option B — Treat it as a new feature request** ("add real-time/
  multi-device QMS sync"), scoped and planned separately from this
  migration engagement, with its own schema design pass (new columns,
  possibly new tables for signatures/assignments) rather than reusing the
  existing thin `qms_stage_completions` table as-is.

**My recommendation: Option A.** This isn't a close call — the existing
table covers roughly 2 of the frontend type's 13 fields, and the feature
it's missing (signature capture, sheet-revision scoping, assignment
routing) is exactly the part of QMS that's most actively used. There is no
"smallest possible" migration here; it's either a large net-new project or
not worth pursuing as part of this engagement.

---

## 10. Recommended final migration strategy

1. **Declare the migration 26/28 = ~93% complete and functionally done**
   for this engagement's original scope, with `project_production_stages`/
   `production_stage_transactions` and `qms_stage_completions` as two
   explicitly-disclosed, independently-decidable exceptions — not
   oversights.
2. **QMS (`qms_stage_completions`): close as out of scope now** (Decision
   F-2, Option A). No further work needed from this investigation; nothing
   is blocked or degraded by leaving it exactly as it is.
3. **Production Stages (F-1): hold for your explicit go/no-go**, since
   unlike QMS this one has a real, ready-shaped DB target and a
   non-trivial but bounded and well-understood implementation path if you
   want it. If you choose **Option A** (migrate), it should run as its
   own dedicated milestone-scale pass — not folded into a "batch" — given
   the stage-identity backfill, the two-page duplication to reconcile, and
   the dead-field cleanup all need to land together, in that order, before
   any hydration/write-layer code is written. If you choose **Option B**
   (defer indefinitely) or don't respond, the correct default is to leave
   it exactly as-is; nothing about the current local-only system is broken
   or urgent.
4. **Either way, no further "investigation" phases are needed for either
   domain** — this document, together with Phase 25/26, is a complete
   enough picture to either implement Option A directly or close the book
   on both domains permanently.

---

## 11. Regression re-verification

Performed this phase, read-only:
- `npx tsc --noEmit` — clean, zero errors.
- `npx biome check` on every file touched across Batches 1-5 — clean; the
  39 pre-existing errors in the full-repo `biome check` are all in
  `ExportEngine.tsx` and unrelated files never touched by this
  engagement, confirmed by name.
- `npx vite build` — clean, zero errors, 4 JS bundles produced.
- Fresh-tab browser check (no stale-HMR artifacts): Dashboard and
  Inventory pages render cleanly under the current session, zero new
  console errors (only the same pre-existing font-decode 400 noise seen
  in every prior batch's verification).
- Row counts re-confirmed this phase for all 3 remaining tables: **0**
  each, consistent with Phase 26's psql-verified baseline — no drift.

**No regression found in any of the 26 previously-migrated domains.**

---

## 12. CLOSURE — decisions received, Phase 28 closed

The user reviewed §9's two decisions and closed this phase with explicit
direction. No code, schema, RLS, trigger, permission, or data changes were
made in response — this section only records the decisions.

**Decision F-2 (QMS Stage Completions) — Option A selected, formally and
permanently.** QMS Stage Completions is closed as **out of scope** for this
Supabase-migration engagement. `qms_stage_completions` is not a migration
target. The existing IndexedDB-backed subsystem (`qms/db/`,
`qms/api/inspections.ts`, `qms/store/useQmsStore.ts`) remains the
sole, unmodified source of truth for QMS stage-completion data,
indefinitely. This is a closed decision, not a "revisit later" — it should
not be re-opened without a new, explicit reason from the user.

**Decision F-1 (Production Stages) — deferred, not approved.** The user
did **not** select Option A (migrate now). `project_production_stages` and
`production_stage_transactions` remain exactly as they are today: real,
correctly-shaped, empty (0 rows) Supabase tables with no live frontend
write path. The local Zustand `projectProductions`/`ProjectProductionStage`
V2 system (`store.ts`, `pages/Production.tsx`, `pages/ProjectDetail.tsx`)
remains the sole, unmodified persistence layer for production-stage data.
No hydration, no write layer, no page rewiring — nothing described in §9's
Option A was implemented or begun. This may be revisited on explicit future
request; absent that, it stays local-only.

**Baseline reconfirmed:** **26 of 28 identified domains (~93%) are
Supabase-backed and verified**, and this is the **stable, intentional end
state** of this migration engagement — not a partial/incomplete state
awaiting more batches. The 2 remaining domains are closed/deferred per the
decisions above, not outstanding work.

**Standing instruction for all future work on this codebase** (recorded
here for continuity, not just for this phase): ordinary UI changes and
feature development going forward must **preserve the existing persistence
architecture exactly as it stands** — the 26 Supabase-backed domains stay
Supabase-backed via their established `hydration.ts` → `useSupabaseHydration.ts`
→ Zustand → `<domain>Api.ts` pattern, and the 2 deferred/out-of-scope
domains (production stages, QMS stage completions) stay on their current
local persistence (Zustand-only, IndexedDB-only respectively). **No future
change may modify database persistence — schema, RLS, triggers,
permissions, hydration/write-layer code, or which domains are
Supabase-backed vs. local-only — unless the user explicitly requests it.**
A request to add a UI field, fix a display bug, or build a new feature is
not, by itself, authorization to touch persistence architecture.

Phase 28 is closed.
