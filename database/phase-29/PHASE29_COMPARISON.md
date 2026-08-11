# Phase 29 — Production + QMS: Business Reference vs. Current Implementation (READ-ONLY)

No code, database, schema, RLS, trigger, permission, hydration, API, Zustand
state, IndexedDB, or Supabase data was modified in this phase. No fixtures
were created. No migration is proposed. This is a comparison only, building
on Phase 28's investigation (`database/phase-28/PHASE28_INVESTIGATION.md`)
and [[fabflow_production_qms_workflow]] (the business reference recorded in
memory), plus fresh direct reads this phase of `store.ts`'s `addProject`,
`pages/Production.tsx`, `pages/ProjectDetail.tsx`'s stage-management handlers,
`pages/Projects.tsx`'s creation form, and `qms/types.ts`/`qms/api/inspections.ts`'s
`generateInspectionSheet`.

---

## A. Executive summary

**Production Stages: does NOT match the business reference.** The reference
says a Project *specifies which stages apply* when it's created. In the
actual code, every project gets the **exact same fixed 11-stage list**
(`DEFAULT_V2_STAGES`) automatically at creation — there is no stage-selection
step anywhere in the "New Project" flow. A user *can* add/remove/reorder
stages, but only afterward, one at a time, by free-text name, from a
different screen (`ProjectDetail.tsx`'s Production tab) — not as part of
project configuration, and not from any catalog. The *display* side (the
Production Stage tab correctly shows only that project's own stages, never
another project's) does match.

**QMS: mostly matches.** A central Library of reusable inspection-stage
definitions and characteristics exists, and specific ones are genuinely
selected per-project each time an inspection sheet is generated — this part
matches the reference well. Digital/Paper execution matches cleanly; Hybrid
is only a whole-sheet label with no distinct behavior of its own beyond
seeding stage-level completions as "Digital" — a partial match, not a clean
one. Inspectors are drawn from the shared Employees roster, not a
QMS-specific roster — worth a decision, not necessarily a conflict.

**Production ↔ QMS: no direct interaction.** They are two independent,
project-scoped systems that both happen to hang off the same Project.
Confirmed by code, not assumed.

---

## B. Production Stage flow (as it actually works today)

```
Project creation (pages/Projects.tsx "Add Project" form)
    — has NO stage-related field of any kind (confirmed by grep: zero
      "stage"/"Stage" hits in the form itself)
    ↓
store.ts addProject(p)
    — unconditionally builds `defaultV2Production` from the fixed,
      hardcoded DEFAULT_V2_STAGES constant (11 stages: Design, Material
      Procurement, Cutting, Bending, Welding, Grinding, Cleaning, Taping,
      Powder Coating, Assembly, Packing) — same for every project, no
      per-project choice, no per-customer/per-process variation
    ↓
projectProductions: ProjectProduction[] (Zustand, local-only)
    — one row per project: { id, projectId, stages: ProjectProductionStage[] }
    ↓
Production Stage tab reads this — TWO separate UI surfaces, both filtering
correctly by projectId, but with meaningfully different capabilities:

  1. pages/Production.tsx (sidebar "Production" page)
     — lists ALL projects, each expandable to its own stages
       (projectProductions.find(pp => pp.projectId === project.id))
     — execution only: status change, Send/Receive material, quantity
       entry, rework creation, material-availability override
     — NO add/remove/reorder stage capability

  2. pages/ProjectDetail.tsx → "Production" tab (per-project page)
     — same underlying data, same execution actions, PLUS:
       handleAddStage (free-text name + requiresMaterialTracking checkbox,
       appended via updateProjectStagesV2)
       handleRemoveStage / handleMoveStage (reorder)
     — ALSO has extra rules Production.tsx does not: sequential stage lock
       (previous stage must be Completed before the next unlocks), and the
       derived Balance calculation
     — Production.tsx separately has its own extra rule ProjectDetail.tsx
       lacks: "OK Qty + Rejected Qty must equal Received Qty"
    ↓
Stage execution — Send/Receive (material-tracking stages) or direct
quantity entry (non-tracking stages), rework creation, no cap enforcement
on the "Move Qty →" side-ledger (confirmed pre-existing, unrelated bug,
Phase 28 §6 item 6).
```

**Storage**: 100% local Zustand (`projectProductions`), zero Supabase
involvement, per the confirmed and unchanged Phase 28/Phase 29 baseline.

---

## C. QMS flow (as it actually works today)

```
QMS Library (master data, shared across all projects):
  - QualityCharacteristic — individual checklist items (name, category,
    process/operation link, criticality, acceptance criteria, tolerance,
    measuring instrument, evidence/photo requirements, optional customer
    scope) — qms/pages/QualityCharacteristicLibrary.tsx
  - InspectionStageDefinition — ordered checkpoint "stages" (e.g. "Welding
    Inspection"), each optionally linked to a ManufacturingProcess so its
    checklist can auto-load from the Characteristic Library by processId
    ↓
Project assignment — happens at "Generate Inspection Sheet" time, not at
project creation: a user picks a subset of InspectionStageDefinition ids
(input.stageIds: string[]) for a specific input.projectId, plus one
input.mode for the whole sheet. qms/api/inspections.ts:generateInspection
Sheet() creates:
  - one InspectionSheet row (projectId, stageIds, mode, revision=1,
    status="Generated")
  - one InspectionStageCompletion row per selected stageId (mode inherited
    as "Digital" unless the sheet mode is exactly "Paper", in which case
    "Paper" — Hybrid sheets seed their completions as "Digital")
    ↓
Digital / Paper / Hybrid:
  - Digital: entirely online — entries/qty/sign-off all happen in
    InspectionSheetView.tsx, no physical artifact
  - Paper: a printable form is generated (InspectionSheetPdfButton /
    generateInspectionPdf), completed physically, then uploadDocument()
    attaches the scanned/photographed result; signStage/qty entry can
    still happen once uploaded
  - Hybrid: a sheet-level label only — no distinct completion-level
    behavior found; individual stage completions under a Hybrid sheet are
    still just "Paper" or "Digital" internally, with no third state
    ↓
Inspector — comes from the shared main-ERP `employees` roster
  (StageChecklistSection.tsx reads useStore().employees for the assignee
  picker), not a separate QMS-native inspector list. assignStage() stores
  assigneeId/assigneeName on the InspectionStageCompletion row.
    ↓
Execution — per-stage: mode toggle, characteristic entries (Pass/Fail/NA,
separate from the whole-stage acceptedQty/rejectedQty tally), sign-off
(digital signature capture), document upload (paper evidence).
    ↓
Result/completion storage — IndexedDB only (qms_stage_completions Supabase
table exists but covers roughly 2 of ~13 fields and has no sheetId column
at all — confirmed dead-end for migration in Phase 28, unchanged this
phase). Sheet-level status auto-advances through a locked state machine;
Approved/Closed sheets are immutable except via createRevision(), which
starts a fresh sheet+completions, never touching the prior revision's rows.
```

**Storage**: 100% IndexedDB (`qms/db/`), zero Supabase involvement for the
actual completion data, per the confirmed and unchanged Phase 28/Phase 29
baseline.

---

## D. Production ↔ QMS

**Independent — confirmed, not assumed.** No shared identifier space, no
FK, no code path where creating/updating a Production Stage triggers or
reads a QMS Inspection, or vice versa. The only place they meet is a
display-layer join in `ProjectDetail.tsx`'s "Production Summary" panel,
which shows `receivedQty`/`isRework` numbers from the V2 production system
next to `acceptedQtyTotal`/`rejectedQtyTotal` numbers pulled from QMS's
`stageCompletions` cache, side by side in one summary view — purely a UI
composition, not a data relationship. `InspectionStageDefinition.id` (QMS)
and `ProjectProductionStage`'s `stageId`/array-index identity (Production)
are different, unrelated identifier spaces, confirmed by direct comparison.

---

## E. Matches (confirmed against the business reference)

- **Production Stage tab is genuinely project-specific at the display/
  storage level** — both `Production.tsx` and `ProjectDetail.tsx` correctly
  filter by `projectId`; no project ever shows another project's stages.
- **QMS Library → per-project inspection selection matches well** — the
  library is real shared master data, and specific inspections are
  genuinely picked per-project (via `stageIds` at sheet-generation time),
  not globally applied.
- **Digital and Paper execution modes both match the reference cleanly** —
  Digital is fully online; Paper genuinely does print → physical
  completion → upload.
- **Inspectors are part of the QMS workflow**, as the reference states —
  assignment, dashboards, and sign-off are all real, working QMS-embedded
  features (just sourced from a shared roster — see Unknown/Unverified).

## F. Conflicts (verified against the business reference)

- **Production Stages are NOT specified at Project creation.** The
  reference explicitly says "when a Project is created, the Project
  specifies which Production Stages apply." The actual code seeds the
  identical fixed 11-stage list for every project, with zero selection
  UI in the creation form. Any customization is a separate, later,
  free-text, per-stage-at-a-time action on a different screen.
- **No stage catalog exists for the post-creation "Add Stage" action** —
  a user types an arbitrary stage name; there is no picker/library of
  reusable stage definitions to choose from (unlike QMS, which does have
  a real library for this).
- **Two divergent implementations of the same feature**: `Production.tsx`
  and `ProjectDetail.tsx`'s Production tab enforce different validation
  rules on the same underlying data (sequential lock exists only in one;
  the OK+Rejected=Received check exists only in the other) — not itself a
  conflict with the business reference, but a conflict with the "existing
  behavior is a reliable reference" premise, since the two surfaces don't
  actually agree with each other.
- **Hybrid mode has no distinct behavior** at the point where work
  actually happens (`InspectionStageCompletion.mode` is only ever
  `"Paper"` or `"Digital"`) — the reference describes Hybrid as a specific
  combination behavior ("physical completion + upload + online update"),
  but the code doesn't implement a third state to carry that meaning
  through to execution.

## G. Unknown / unverified

- **Whether "inspector/inspection configuration comes from the QMS
  system/library" (as the reference states) means inspectors should be a
  QMS-native concept**, distinct from today's shared `Employees` roster.
  The code clearly uses `Employees` today; whether that's considered
  correct or a gap relative to your intended workflow isn't something the
  code can answer — this is the open question already flagged in
  [[fabflow_production_qms_workflow]], now confirmed as the actual current
  wiring rather than assumed.
- **Whether the post-creation ad-hoc stage add/remove/reorder capability
  in `ProjectDetail.tsx` is intentional current functionality you want
  preserved**, or itself something you'd expect to work differently once
  "the Project specifies which stages apply" is properly implemented at
  creation time. Not determinable from code alone — a product-intent
  question.
- **Whether Hybrid mode is expected to need its own distinct execution
  behavior**, or whether "Paper + a later online update" is an acceptable
  way to realize Hybrid today. The code doesn't currently distinguish it,
  but whether that's a gap depends on intent, not just code.

---

## H. Persistence map

| Entity | Current storage | Read path | Write path | Project-specific? | Notes |
|---|---|---|---|---|---|
| `ProjectProduction` (the 11 default stages + any added/removed) | Zustand `projectProductions` (local, `localStorage`-persisted) | `Production.tsx`, `ProjectDetail.tsx` both `.find(pp => pp.projectId === id)` | `addProject` (seed), `updateProjectStagesV2` (whole-array replace), `addStageTransaction` (append + recompute) | **Yes** — one row per project | Survives reload (Zustand persist), not multi-device/multi-user safe; `project_production_stages`/`production_stage_transactions` Supabase tables exist, empty, unused, per the Phase 28 baseline — unchanged |
| `ProductionMovement` ("Move Qty →") | Zustand `productionMovements` (local) | `ProjectDetail.tsx`'s balance display panel only | `addProductionMovement` (plain append) | Yes (has `projectId`) | No Supabase table found for this at all; disconnected from the actual balance math (pre-existing bug, unrelated to migration) |
| `InspectionStageDefinition` / `QualityCharacteristic` (QMS Library) | IndexedDB (`qms/db/`) | `QualityCharacteristicLibrary.tsx`, sheet-generation UI | `qms/api/*` CRUD | **No — shared master data**, same library for every project | Confirmed no Supabase table backs this; entirely IndexedDB |
| `InspectionSheet` | IndexedDB | `qms/pages/*`, `ProjectDetail.tsx`'s Production Summary | `qms/api/inspections.ts` (`generateInspectionSheet`, status transitions, `createRevision`) | **Yes** — `projectId` field, one or more sheets (revisions) per project | Survives reload (IndexedDB), single-device only |
| `InspectionStageCompletion` | IndexedDB, mirrored by a thin, incomplete Supabase table (`qms_stage_completions`) | `InspectionSheetView.tsx` (component-local cache) + `useQmsStore`'s cross-project `stageCompletions` cache | `qms/api/inspections.ts` (`setStageCompletionQty`, `setStageCompletionMode`, `assignStage`, `signStage`) | **Yes** — via `sheetId` → `InspectionSheet.projectId` | IndexedDB is the real source of truth; the Supabase table is missing `sheetId` and ~8 other fields, confirmed non-viable as-is in Phase 28, unchanged this phase |
| Inspector assignment (`assignedTo`/`assignedToName` on a completion) | IndexedDB (part of `InspectionStageCompletion`) | Inspector Dashboard, StageChecklistSection's picker | `assignStage` | Yes, per stage-completion | Assignee pool sourced from Supabase-backed `employees` (already-migrated domain), not a QMS-only list |
| `Project.assignedEmployeeIds` | Frontend-only field on `Project`, confirmed never round-tripped to Supabase (re-merged locally on every hydration) | `ProjectDetail.tsx`'s team-assignment UI | `updateProject` | Yes, project-level | Distinct from anything stage-level; project-wide only, not per-Production-Stage or per-Inspection |

---

## I. Architectural implications (no implementation proposed)

- If "the Project specifies which Production Stages apply" is the actual
  intended behavior, the current fixed-11-stage-for-every-project model is
  a **behavior gap to close**, not merely a persistence-location question
  — this would be true whether Production Stages stay local-only or are
  someday migrated to Supabase. Fixing *where the data lives* would not by
  itself fix *what data gets created*.
- A real stage catalog/template concept (analogous to QMS's
  `InspectionStageDefinition` library) does not currently exist for
  Production Stages — today's "Add Stage" is free-text, not a selection.
  Whether one should exist is a business-workflow question, not a
  technical one.
- The two-page divergence (`Production.tsx` vs. `ProjectDetail.tsx`'s
  Production tab enforcing different rules on the same data) is a
  reconciliation question independent of any persistence decision — it
  would need addressing whether or not the domain ever moves to Supabase.
- QMS's "Project specifies which inspections apply" already matches the
  intended shape well at the *selection* level (library → per-project
  pick), which is a materially different starting point than Production
  Stages for any future work in this area.
- None of the above requires a schema/RLS/trigger/permission/hydration/API
  change to observe or reason about further — they are frontend business-
  logic and UX questions, distinct from the Phase 28 persistence-baseline
  question, which remains untouched and unaffected by anything found here.

---

## J. Final status

- **Current Production workflow matches the business reference: NO** —
  confirmed conflict at Project-creation time (fixed list, no
  per-project selection); display-layer project-scoping is correct.
- **Current QMS workflow matches the business reference: MOSTLY** — Library
  → per-project selection → Digital/Paper execution all match cleanly;
  Hybrid mode and inspector-sourcing are partial matches / open questions,
  not confirmed conflicts.
- **Production and QMS are directly connected: NO** — confirmed
  independent, meeting only in a display-layer summary panel.
- **Is any persistence change actually required to address what was found
  here: NO.** Every conflict and gap identified in this report is a
  frontend business-logic/UX question (what data gets created, what
  selection UI exists, which page's validation rule is authoritative) —
  none of it requires touching schema, RLS, triggers, permissions,
  hydration, or the local-vs-Supabase boundary to fix. The Phase 28
  persistence baseline is unaffected and unchanged by this investigation.

**STOP per instruction. No further action taken. Awaiting explicit
confirmation before any next phase.**
