# Phase 30 — FINAL Production ↔ QMS Workflow Specification & Read-Only Gap Analysis

**Status: READ-ONLY INVESTIGATION. No code, schema, RLS, trigger, permission,
hydration, API, IndexedDB, Zustand, or Supabase change was made in this
phase.** This document only reports findings and stops for a decision where
one is required, per explicit instruction.

---

## A. FINAL understood business workflow

1. A **Project** has two systems that are **independent by default**:
   Production Stages and QMS.
2. **Production Stages**: each Project auto-receives the standard/default
   stage list at creation; that default is normally sufficient; the user may
   customize (add/delete/reorder) that specific Project's stages afterward.
   The Production Stage tab shows the resulting, possibly-customized list.
   (Confirmed correct in Phase 29A — not treated as a problem here.)
3. **QMS**: a central Library holds inspection/QMS definitions. Each Project
   independently selects which inspections apply to it. Each selected
   inspection runs in Digital, Paper, or Hybrid mode. Inspectors are drawn
   from the shared roster used elsewhere in the app.
4. **Optional link**: a Production Stage *may* optionally be marked
   "Inspection Required," in which case the user picks one specific QMS
   inspection from the Library to link to that stage. Unlinked stages behave
   exactly as today — no requirement, no gate.
5. **Gate semantics**: only an *explicitly linked, explicitly required*
   inspection blocks its stage from completing/advancing while
   not-started/in-progress/failed, and unblocks it once
   accepted/passed. Independent (unlinked) QMS inspections never gate
   production.
6. **QMS also supports fully independent inspections**, selected directly
   from the Project's QMS area with no stage relationship at all.
7. **Duplicate prevention**: an inspection already linked to a stage must not
   be created a second time if later re-selected independently from the QMS
   area — must reuse/surface the existing link or clearly inform the user.
8. **Stage deletion** must not delete a linked inspection (it belongs to the
   Project independently) — only the stage↔inspection relationship is
   removed.
9. **Stage addition** must never auto-create or auto-link a QMS inspection
   just because the new stage's name resembles one — linking is always an
   explicit user action.
10. Production and QMS remain **not generally dependent** — the optional
    link/gate is the only exception, and it exists only where explicitly
    configured.

This matches the user's Phase 30 message exactly; nothing above is inferred
beyond it.

---

## B. Current Production Stage implementation

- `ProjectProductionStage` (`types.ts:578-613`) — full field list confirmed
  by direct read: `stageName, status, notes, quantitySent, sentDateTime,
  sentToVendorId, sentToVendorName, receivedQuantity, receivedDateTime,
  startTime, endTime, requiresMaterialTracking?, transactions?, stageId?,
  sentQty?, receivedQty?, okQty?, rejectedQty?, reworkQty?, isRework?,
  referenceId?, reworkStage?, assignedTo? (dead), vendor? (dead),
  orderedQty?/wipInProgressQty?/wipCompletedQty?/wipDispatchedQty? (all
  dead)`. **No inspection-related field exists.**
- `stageId` is populated **only** for synthetic rework stages
  (`Production.tsx:562`, `` `rework-${Date.now()}` ``) — confirmed by
  grepping every `stageId:` assignment in `store.ts` and `pages/*.tsx`; it
  is the sole hit. The 11 default stages and any stage added via
  `handleAddStage` never receive one. Stages are addressed today purely by
  **array index** (`stageIdx`), not a stable id.
- Default seeding: `addProject` (`store.ts:1655-1681`) builds every new
  Project's stage list from the fixed `DEFAULT_V2_STAGES` (`store.ts:80-95`,
  11 stages). Confirmed correct per Phase 29A.
- Add/Delete/Reorder: `handleAddStage`/`handleRemoveStage`/`handleMoveStage`
  (`ProjectDetail.tsx:1346-1385`), inside the Production tab
  (`ProjectDetail.tsx:3244`) only — `Production.tsx` has no such capability.
- Existing gating precedent: `checkMaterialAvailability`
  (`Production.tsx:329-345`) blocks starting/receiving a stage when BOM
  material is short, with an admin-only override dialog
  (`Production.tsx:1648-1675`, `materialOverrideDialog` state). This is the
  closest existing pattern in the codebase to "block a stage transition
  unless a condition is met, with an override" — directly relevant to the
  new Required-Inspection gate.
- Persistence: 100% local Zustand (`projectProductions` array), not migrated
  (Phase 28 deferred, reaffirmed permanent).

---

## C. Current QMS implementation

- Library types: `QualityCharacteristic` (qms/types.ts:70-95),
  `InspectionStageDefinition` (qms/types.ts:147-154).
- `generateInspectionSheet` (qms/api/inspections.ts:135-175) takes an
  explicit `stageIds: string[]` + `projectId` + `mode`, creating one
  `InspectionSheet` and one `InspectionStageCompletion` per selected stage.
  `mode === "Paper" ? "Paper" : "Digital"` — **Hybrid has no distinct
  completion-level state; it collapses to "Digital" per stage.**
- `InspectionStageCompletion` (qms/types.ts:284-315): `id, sheetId, stageId,
  mode ("Paper"|"Digital"), inspectorName?, signatureDataUrl?, remarks?,
  completedAt?, signedAt?, updatedAt, assignedTo?, assignedToName?,
  assignedBy?, assignedAt?, dueDate?, acceptedQty?, rejectedQty?`.
- `InspectionStageEntry` (qms/types.ts:269-279): per-**characteristic**
  result, `"Pass" | "Fail" | "NA"` — not per-stage.
- Sheet-level status is a **workflow-progress** ladder
  (`InspectionSheetStatus`, qms/types.ts:164-222: Draft → Generated →
  Printed → InspectionStarted → InProgress → Completed → AwaitingUpload →
  Uploaded → Reviewed → Approved → Closed), governing document handling
  (print/upload/review/approve), **not a quality pass/fail result.**
- **Confirmed by fresh grep this phase** (`qms/types.ts`): zero existing
  "Inspection Required"/gate concept anywhere. The only "required*" hits are
  `requiredSkills`/`requiredMachines` on the unrelated `Operation` type
  (qms/types.ts:41-51, staffing/equipment needed to perform a manufacturing
  operation — nothing to do with gating) and `evidenceRequired`/
  `photoRequired` on `QualityCharacteristic` (per-characteristic evidence
  flags, not a stage-level requirement). This confirms the entire
  "Inspection Required" concept described in Phase 30 is new — nothing
  partially built exists today.
- Inspectors: sourced from the shared Employees roster (confirmed in
  Phase 29), not a QMS-native list.
- Persistence: IndexedDB (`qms/db/`), permanently out of scope for Supabase
  migration (Phase 28 closure).

---

## D. Current Production↔QMS relationship

None, beyond a **display-only join**: `ProjectDetail.tsx`'s Production
Summary panel (`getQualityQtyTotals`, ~419-442; panel ~1766-1835) reads both
`projectProductions` (V2 stages) and QMS `stageCompletions` for the same
project side by side, for display purposes only. Nothing links a specific
Production Stage to a specific QMS inspection at the data level; nothing in
either write path reads or writes the other domain's data; no code path
blocks a Production Stage transition based on QMS state. This reconfirms
Phase 29's finding — unchanged.

---

## E. What already matches the Phase 30 business workflow

- Production Stages: auto-seed-then-customize, per-project scoping, tab
  display, add/delete/reorder — all match (per Phase 29A, reaffirmed by
  Phase 30 §2 verbatim).
- QMS: Library → per-project independent selection → Digital/Paper/Hybrid →
  shared-roster inspector assignment — all match.
- "Production and QMS are not generally dependent" (Phase 30 §10): matches
  today's actual code exactly — the only existing relationship is the
  display-only join in D above, which is not a dependency (nothing reads it
  to gate anything).
- "Most stages normally have no linked inspection" / "QMS inspections can
  exist independently of any stage": matches — `generateInspectionSheet`
  already treats `stageIds` as an arbitrary caller-supplied list with no
  requirement that a Production Stage even exist for a given `stageId`.

---

## F. What is missing (relative to the Phase 30 spec)

1. No "Inspection Required" flag/field anywhere on `ProjectProductionStage`
   or in QMS types.
2. No field/relationship linking a specific stage to a specific QMS
   inspection (a stage→inspection pointer, in either direction).
3. No stable, universal stage identifier — `stageId` today exists only for
   synthetic rework stages; the 11 default stages and any user-added stage
   have none. A reliable link needs every stage to have one.
4. No gate/blocking logic anywhere that reads QMS state to block a
   Production Stage transition (the only existing gate,
   `checkMaterialAvailability`, reads material/BOM data, not QMS data).
5. No stored, unambiguous "this inspection passed" signal for gating
   purposes — see I below.
6. No duplicate-prevention logic between "select from stage" and "select
   independently from QMS area" (today there is no "select from stage" path
   at all, since no link exists).
7. No stage-deletion handling of a linked inspection (moot today — no link
   exists to preserve).
8. No QMS project-level area/tab distinguishing
   independent/stage-linked/required/status-result inspections — Phase 30
   §11 explicitly says not to design this UI yet, so this is noted as
   missing, not scoped for solutioning here.

---

## G. What can be implemented purely in frontend using EXISTING persistence architecture

All of the following are **additive, optional fields/logic on the two
already-local systems** — no Supabase table, RLS policy, trigger, function,
permission, hydration path, or API-layer boundary is touched, and neither
domain crosses the local/Supabase line. Under the Phase 28 baseline
definition, none of this is a "persistence change":

- Add a stable `id` to every `ProjectProductionStage` (not just rework
  stages), generated at seed time (`addProject`/`DEFAULT_V2_STAGES`) and at
  `handleAddStage` time. `ProjectProductionStage` is already a free-form
  local Zustand type with several optional fields — adding one more is the
  same shape of change already used for every other "additive (Phase N)"
  field in this type (e.g. the existing "Failure tracking (additive)" and
  "WIP quantity tracking (Feature 2)" groups, per the type's own comments).
- Add optional fields for the link, e.g. `inspectionRequired?: boolean`,
  `linkedInspectionId?: string` (pointing at a QMS `InspectionStageDefinition`
  or sheet/completion id, exact shape TBD at implementation time) — same
  additive-optional-field pattern.
- Add the gate check itself as new frontend logic, following the exact
  precedent already in the codebase: `checkMaterialAvailability` in
  `Production.tsx` (block + optional admin-override dialog). A QMS-based
  gate would read the linked inspection's local IndexedDB state the same
  way the Production Summary panel already reads QMS `stageCompletions`
  today (D above) — no new storage layer needed to read it.
- Duplicate-prevention, stage-deletion (unlink-not-delete), and
  stage-addition (never auto-link) behaviors are all pure frontend logic
  operating on the fields above — no persistence implication.

**None of the above requires a decision from the user on architecture** —
it fits entirely inside the existing local/local split.

---

## H. What (if anything) would require persistence changes

**Nothing in the Phase 30 spec, as described, requires a Supabase schema,
RLS, trigger, permission, hydration, or API-boundary change, and nothing
requires moving either domain between local and Supabase storage.**

Reasoning: the entire feature — the flag, the link, the gate check, the
duplicate-prevention, the deletion/addition side-constraints — is expressed
purely in terms of the two systems that are *already* local
(`ProjectProductionStage` in Zustand, QMS types in IndexedDB). Since neither
system is Supabase-backed today (Production Stages deferred, QMS
permanently out of scope per Phase 28 closure), and the spec does not ask
either system to become Supabase-backed, there is no Supabase surface for
this feature to touch. This holds regardless of which of the open questions
in I below get decided, because every option under I is itself expressed in
terms of the same two local systems.

**STOP condition assessment**: the explicit stop condition ("if something
requires a persistence change, STOP and explain what is required") is **not
triggered** by anything in this investigation. Nothing further is stopped on
for architecture reasons. What *does* remain open is a **business-rule
definition**, not a persistence question — see I.

---

## I. Genuine business ambiguity requiring the user's decision

1. **What does "accepted/passed" mean for gating purposes?** No field in
   QMS data cleanly represents this today:
   - `InspectionSheetStatus` is a document-workflow ladder (Draft → ... →
     Approved → Closed), not a quality verdict — a sheet can reach
     "Approved" as an administrative/document step independent of whether
     individual measurements passed.
   - `InspectionStageEntry.result` ("Pass"/"Fail"/"NA") is per-**
     characteristic**, not per-stage — a stage can have many
     characteristics with mixed results; "did the stage pass" requires an
     aggregation rule (e.g. "no Fail present," "all Pass," "ignore NA") that
     does not exist today.
   - `InspectionStageCompletion.acceptedQty`/`rejectedQty` is a quantity
     tally, not a boolean — using `rejectedQty === 0` as a proxy for "passed"
     is an inference, not a stated rule.
   This needs an explicit decision before the gate can be built at all,
   since "block until accepted/passed" is not implementable without knowing
   what "passed" reads from. Options (not a recommendation to implement
   yet, per Phase 30's "do not recommend a schema design yet"):
   - **Option 1** — Derive "passed" from the per-stage completion tally
     (`rejectedQty === 0 && completedAt is set`, or similar).
   - **Option 2** — Derive "passed" from aggregating
     `InspectionStageEntry.result` for that stage (no "Fail" present).
   - **Option 3** — Introduce a new explicit per-completion field (e.g.
     `outcome: "Pass" | "Fail" | "Pending"`) set directly by the inspector,
     rather than deriving it.
2. **Exact duplicate-prevention UX** — Phase 30 §7 explicitly says "exact UI
   TBD at implementation time." Left open per the user's own framing, not
   decided here.
3. **Where the link is configured** — on the stage (from the Production
   tab) or on the inspection (from the QMS area), or both — Phase 30's
   example ("Powder Coating stage ↔ inspection") describes the relationship
   but not which screen initiates it. Relevant to G's "which UI" but not to
   whether it fits the existing architecture (it does, either way).
4. **Override on gate-block** — Phase 30 doesn't say whether a blocked stage
   can ever be manually overridden (the way the material-availability gate
   allows an admin override). Worth deciding alongside I.1, not assumed
   here in either direction.

None of these four items were decided or assumed in this report — they are
flagged for the user, per Phase 30's explicit "do not infer missing business
rules."

---

## J. Confirmation

No code, database schema, RLS policy, trigger, function, permission,
hydration path, API boundary, IndexedDB structure, Zustand store shape, or
any Supabase data was created, modified, or deleted during this
investigation. All findings above were obtained via direct source reads and
`grep` only (`types.ts`, `store.ts`, `pages/ProjectDetail.tsx`,
`pages/Production.tsx`, `qms/types.ts`, `qms/api/inspections.ts`). The
Phase 28 baseline (26/28 domains, ~93%, Supabase-backed; QMS permanently
out of scope; Production Stages deferred) is unchanged and unaffected by
this report.

---

## Final status

- Persistence change required: **No.**
- Everything in the Phase 30 spec fits inside the existing local/local
  architecture (G above).
- One genuine business-rule ambiguity remains open (I.1: definition of
  "passed" for gating) and should be decided before any implementation is
  scoped.
- **Per explicit instruction: this report stops here. No implementation, no
  schema design, and no next phase begins without the user's explicit
  confirmation.**
