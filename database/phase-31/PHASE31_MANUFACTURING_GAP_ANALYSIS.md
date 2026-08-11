# Phase 31 — FINAL Production ↔ QMS Manufacturing Workflow Specification & Read-Only Gap Analysis

**Status: READ-ONLY INVESTIGATION. No code, schema, RLS, trigger, permission,
hydration, API, IndexedDB, Zustand, or Supabase change was made in this
phase.**

---

## A. Final understood manufacturing workflow

1. A Project has two independent-by-default systems: Production Stages and
   QMS, with Project as the common parent.
2. Production Stages auto-seed from the standard default list at creation
   (correct, not a problem — Phase 29A) and are freely
   add/delete/reorder-customizable per Project.
3. The QMS Library holds inspection definitions. A Project independently
   selects which inspections apply to it — **any number**, whether or not
   they relate to a Production Stage.
4. A Production Stage may optionally have "Inspection Required" = YES with
   one specific selected QMS inspection — **project-specific**, not a
   template-wide rule (the same stage name can require inspection in one
   project and not another).
5. Two valid ways to add an inspection to a Project: **Path A**
   (Production Stage → Inspection Required → select → becomes linked +
   becomes a gate) and **Path B** (Project's QMS area → select directly →
   independent, no gate). Both must coexist.
6. **Duplicate prevention**: the same QMS inspection must not be
   unintentionally duplicated on one Project (e.g. linking it via Path A,
   then re-selecting it via Path B must reuse/report the existing instance,
   not create a second one).
7. **Production gate**: only an explicitly linked required inspection
   blocks its stage — not-started/in-progress/failed blocks; passed
   releases. Unlinked/independent inspections never block.
8. **Characteristic structure preserved**: an inspection is made of
   individual characteristics (e.g. Colour, Thickness, Surface Finish,
   Adhesion, Scratches), each with its own result.
9. **Overall inspection result** is derived from characteristic results:
   all required pass → PASS; any required fails → FAIL; incomplete → NOT
   PASSED. This is explicitly distinct from the document/workflow status
   (Draft/Approved/Closed/etc.).
10. **Characteristic-level failure capture**: a failed characteristic must
    record its own failure reason, description, and photo evidence — not
    lumped into one whole-inspection blob.
11. **Rectification/corrective action**: FAIL → rectification (action
    taken, description, evidence) → re-inspection → PASS → release. A
    failure is not a dead end.
12. **Re-inspection**: the same characteristic can be re-checked after
    rectification; once all required characteristics have an acceptable
    final result, overall = PASS and the stage releases.
13. **Never destroy failure history**: every round (Round 1 fail + reason +
    photo, rectification + proof, Round 2 result, ...) must remain
    retrievable — a later PASS must not erase what failed before.
14. **Multiple rectification cycles** must be supported and all attempts
    kept, not just the latest.
15. Deleting a Production Stage must not delete its linked inspection (it
    belongs to the Project); only the stage-relationship is removed, QMS
    history preserved.
16. Adding a Production Stage must never auto-create/auto-link a QMS
    inspection — always an explicit user action.
17. Digital/Paper/Hybrid execution modes remain as-is, not redesigned this
    phase.
18. QMS does not universally control Production — the dependency exists
    only where explicitly configured (§4/§5/§7); otherwise fully
    independent.
19. UI intent (not to be implemented yet): a Project QMS area comparable in
    usability to Production, surfacing independent vs. stage-linked vs.
    required inspections, status/result, failed characteristics, evidence,
    rectification, re-inspection, and history.

This matches your Phase 31 message exactly — nothing above is inferred
beyond it.

---

## B. Current Production implementation

Unchanged from Phase 30 (§B there), re-confirmed, no new facts this phase:

- `ProjectProductionStage` (types.ts:578-613) — no inspection-link field.
- `stageId` populated only for synthetic rework stages
  (`Production.tsx:562`) — every other stage (default 11 + user-added) is
  addressed by array index only, no stable id.
- Add/Delete/Reorder: `handleAddStage`/`handleRemoveStage`/`handleMoveStage`
  (`ProjectDetail.tsx:1346-1385`), inside the Production tab only.
- Existing gate precedent: `checkMaterialAvailability`
  (`Production.tsx:329-345`) blocks a stage transition on a condition, with
  an admin-override dialog (`Production.tsx:1648-1675`) — the closest
  existing "block unless X, with override" pattern in the codebase.
- Persistence: 100% local Zustand, not migrated (permanent, Phase 28).

---

## C. Current QMS implementation

### C1. Sheet/instance model — the key structural fact this phase surfaces

`InspectionSheet` (qms/types.ts:227-265) is, by its own doc comment,
**"One inspection sheet per project. Mutable in place; `revision`
increments when the stage list is edited after the sheet leaves Draft."**
`ProjectInspectionTab.tsx:64-72` enforces this in practice: it always
resolves to **the single highest-revision sheet** for a project (`sheet =
projectSheets.reduce((latest, s) => s.revision > latest.revision ? s :
latest)`). There is no UI or store path to create a second, independent
sheet for a project — "adding an inspection" today means
`updateInspectionSheetStages` editing the *existing* sheet's `stageIds[]`
array and bumping its `revision`, not creating a new addressable inspection
instance.

**This means today's QMS models "one inspection document containing N
checkpoint-stages" per project — not "N independently-lifecycled QMS
inspections per project" as Phase 31 §5/§6 requires.** This is the single
largest structural gap in this report (see F, L/M).

### C2. Characteristics

`QualityCharacteristic` (qms/types.ts:70-95) lives in the central Library,
each optionally tagged with a `processId`. Which characteristics appear
under a given checkpoint stage inside a sheet is **auto-derived**, not
user-added per inspection: `InspectionSheetView.tsx:133-143` builds
`characteristicsByStage` by filtering `characteristics.filter(c =>
stage.processId && c.processId === stage.processId)`. So §8's "the user can
add the characteristics that need to be inspected" is **partially met at
the Library level** (characteristics are added/edited in
`QualityCharacteristicLibrary.tsx`, globally) but **not met at the
per-inspection-instance level** (no way to pick/customize which
characteristics apply to *this* specific stage-inspection on *this*
project beyond what the Library's process-linkage already implies).

### C3. Result capture — no history, no per-characteristic failure detail

- `InspectionStageEntry` (qms/types.ts:269-279): one row per `(sheetId,
  stageId, characteristicId)` — `result?: "Pass"|"Fail"|"NA",
  measuredValue?, remarks?, updatedAt, updatedBy?`.
- `upsertStageEntry` (qms/api/inspections.ts:427-457): looks up the
  existing row for that triple and **overwrites it in place**
  (`id: existing?.id ?? crypto.randomUUID()`, then `put`). A second save
  replaces `result`/`measuredValue`/`remarks` entirely; nothing preserves
  what the previous save held. **Confirmed: a Fail → rectify → Pass cycle
  today destroys the Fail record.**
- `remarks` is a single free-text field — no distinct "failure reason" vs.
  "failure description" vs. "rectification action" fields; nothing
  structurally separates "why it failed" from "what was done about it."
- No round/attempt number exists anywhere on `InspectionStageEntry`.

### C4. Evidence/photos

`InspectionDocument` (qms/types.ts, full type quoted in Phase 28/30
context) has `stageId?` (optional — filters photos to a stage) but **no
`characteristicId` field**. `StagePhotoGallery.tsx` renders all documents
for a stage as one flat gallery — there is no way today to say "this photo
belongs to the Surface Finish failure" vs. "this photo belongs to the
Adhesion failure" within the same stage.

### C5. Overall result

No "overall inspection PASS/FAIL" is computed anywhere in the codebase.
`InspectionSheetStatus` (Draft→...→Approved→Closed,
qms/types.ts:164-222) is a document-workflow ladder, confirmed (again, per
grep this phase: `allStagesDone` in `inspections.ts:535` checks sheet
*completion progress*, not quality result). §9's "quality result and
document/workflow status are separate concepts" is correctly anticipating a
genuine gap — today there is only the document-workflow status; no
quality-result concept exists in parallel.

### C6. Execution modes / inspectors — unchanged from Phase 29/30

Digital/Paper/Hybrid (Hybrid collapses to "Digital" at the per-stage
completion level, per `generateInspectionSheet`'s
`mode === "Paper" ? "Paper" : "Digital"`); inspectors sourced from the
shared Employees roster. Not touched or redesigned per your §17 instruction.

### C7. Persistence

IndexedDB (`qms/db/`), permanently out of scope for Supabase migration
(Phase 28 closure), unchanged.

---

## D. Current Production ↔ QMS relationship

None beyond the same display-only join already found in Phase 29/30
(`ProjectDetail.tsx`'s Production Summary panel reading both datasets side
by side for display). No write path or gate reads the other domain's data.

---

## E. What already matches

- Production Stages: auto-seed-then-customize, per-project scoping, tab
  display, add/delete/reorder (§2) — match.
- QMS Library existing and per-project selectable in principle (§3) —
  match, modulo C1's one-sheet-per-project constraint.
- Characteristics exist as first-class checkable items with Pass/Fail/NA
  (§8) — match at the concept level.
- Digital/Paper/Hybrid execution modes (§17) — match, unchanged.
- "QMS does not generally control production" (§18) — matches exactly:
  today there is zero gating in either direction.
- Photo evidence attaches to a stage's inspection record (§10, partially —
  see F for the per-characteristic gap).
- `InspectionHistoryEvent` (qms/types.ts:341-349) already establishes the
  *pattern* of an immutable, append-only audit log for a sheet
  (`action`/`byUserId`/`at`/`notes`) — a genuine, reusable precedent for
  §13's "never destroy history," even though it doesn't cover
  characteristic-level result rounds today (see F/I).

---

## F. What is missing

1. **Multiple independent inspections per project** (C1) — today's model is
   one sheet with a stage list, not N addressable inspection instances.
   Needed for Path A + Path B to coexist as genuinely separate, individually
   trackable things.
2. **Inspection Required flag + stage↔inspection link** — does not exist
   anywhere (reconfirmed from Phase 30, unchanged).
3. **Stable Production Stage ids** for every stage, not just rework stages
   (reconfirmed from Phase 30, unchanged).
4. **Gate logic** reading QMS result to block a Production Stage transition
   — does not exist.
5. **Per-characteristic failure detail fields** — failure reason vs.
   description vs. rectification action are all currently just one
   `remarks` string; no dedicated fields.
6. **Per-characteristic photo evidence** — `InspectionDocument` has no
   `characteristicId`.
7. **Result history / attempt rounds** — `upsertStageEntry` overwrites in
   place; no round number, no preserved prior attempts.
8. **Rectification/corrective-action concept** — zero hits anywhere in
   `qms/` (confirmed by grep this phase); does not exist in any form.
9. **Re-inspection concept as a distinct action** — today "re-inspecting" is
   indistinguishable from "editing the same entry," because there's no
   round/attempt structure to re-inspect *into*.
10. **Overall inspection PASS/FAIL derivation** — no such computed value
    exists (C5).
11. **Duplicate-prevention logic** for the same inspection being added twice
    to one project — moot today since there's only ever one sheet per
    project to add stages to, but genuinely needed once (1) is addressed.
12. **QMS project-level UI distinguishing independent/linked/required
    inspections** — explicitly out of scope to design this phase (§19).

---

## G. What existing frontend functionality can be reused

- **`checkMaterialAvailability` + `materialOverrideDialog` pattern**
  (`Production.tsx:329-345`, `:1648-1675`) — directly reusable as the
  *shape* of the Production-gate mechanism (block a transition, show why,
  optional override), just swapping "material shortage" for "inspection not
  passed" as the blocking condition.
- **`InspectionHistoryEvent` append-only logging pattern**
  (qms/types.ts:341-349, `logHistory()` in inspections.ts) — directly
  reusable as the *shape* of a never-overwrite audit trail; the same
  approach (a new immutable row per meaningful event, keyed to the parent
  record) is the natural fit for preserving each Fail/Rectify/Re-inspect
  round, rather than inventing a new history mechanism from scratch.
- **`InspectionDocument`'s existing `source`/`caption`/`checksum`
  additive-field pattern** (qms/types.ts, "Phase 3 — photo evidence... 
  additive" comment) — the established precedent in this exact file for
  adding evidence-related fields onto an existing type without breaking
  existing rows; the natural template for adding a `characteristicId`
  (and/or a `roundId`) the same way.
- **`StagePhotoGallery` component** — reusable as-is for rendering
  photos once they're filterable by characteristic/round, no rewrite
  needed to the rendering itself.
- **`InspectionStageEntry`'s `Pass`/`Fail`/`NA` 3-state model and
  `StageChecklistSection`'s toggle UI** — the base interaction (tap
  Pass/Fail/NA per characteristic) is reusable as-is; only the
  *persistence shape underneath it* needs to change from upsert to
  append (see H).
- **Shared Employees roster for inspector assignment** — unchanged, reusable
  as-is for whichever party performs a re-inspection.

---

## H. What new frontend/business logic would be required

All additive to the two already-local systems — see L/M for the persistence
framing.

1. A stable `id` on every `ProjectProductionStage` (not just rework
   stages).
2. New optional fields on `ProjectProductionStage`:
   `inspectionRequired?: boolean`, a pointer to the linked QMS inspection
   instance (exact shape depends on H.3).
3. A genuine **inspection-instance concept** in QMS distinct from
   "the project's one sheet" — i.e., either (a) relaxing the
   one-sheet-per-project model to allow multiple sheets per project, each
   independently addressable and optionally stage-linked, or (b) introducing
   a new lighter-weight "Project QMS Inspection" record layered above the
   existing sheet/stage/entry tables that each point at one Library
   inspection definition and optionally at one Production Stage id. This is
   a genuine architecture-shape decision (not a persistence-location
   decision — both options stay local) and should be surfaced to you before
   implementation, not decided here.
4. Gate-evaluation logic (new, pure frontend): given a stage's linked
   inspection, compute PASS/FAIL/NOT PASSED per §9's rule and block/allow
   the stage transition accordingly — modeled on `checkMaterialAvailability`.
5. Round/attempt structure for `InspectionStageEntry`-equivalent data: change
   from upsert-by-triple to **append-only**, with a `round`/`attemptNumber`
   and a computed "latest attempt per characteristic" view for the checklist
   UI, while every past attempt stays queryable.
6. Structured failure fields (reason, description) and structured
   rectification fields (action taken, description) — either as new columns
   on the entry/attempt row, or a related "attempt detail" record.
7. `characteristicId` (and ideally `roundId`) on `InspectionDocument` so
   evidence photos can be attributed to a specific failed characteristic and
   a specific attempt.
8. Duplicate-prevention check: before creating a new Project-QMS-inspection
   link (from either Path A or Path B), check whether that
   (`projectId`, Library inspection id) pair already exists and
   reuse/report instead of creating a duplicate.
9. Stage-deletion handling: on `handleRemoveStage`, if the removed stage had
   a linked inspection, clear only the link field — never cascade-delete the
   QMS inspection or its history.
10. Stage-addition handling: `handleAddStage` continues to never auto-set
    `inspectionRequired`/auto-link anything — this already matches §16
    today by simple omission, just needs to stay that way as new fields are
    added.

---

## I. How failure → rectification → re-inspection would fit into the existing QMS model

The existing model has the right *shape* in one place
(`InspectionHistoryEvent`'s append-only, immutable, timestamped log) but
applies it at the wrong granularity (whole-sheet events like "Generated"/
"Approved", not per-characteristic quality attempts). The fit is:

- Keep `QualityCharacteristic` and the Pass/Fail/NA 3-state exactly as they
  are (§8 says don't replace this — confirmed still true).
- Replace `upsertStageEntry`'s overwrite-in-place behavior with an
  **append** operation: each Pass/Fail/NA submission becomes a new,
  immutable row (an "attempt"), never a mutation of a prior row — mirroring
  how `InspectionHistoryEvent` already never mutates past events.
- A FAIL attempt gets its structured failure fields (reason, description)
  and its evidence (via `InspectionDocument` once characteristic-attributed,
  per H.7) attached to *that specific attempt row*, not to the sheet or the
  stage as a whole.
- A rectification is recorded as its own attempt-adjacent record (action
  taken, description, evidence) — logically "between" a FAIL attempt and the
  next attempt for the same characteristic.
- A subsequent re-inspection is simply the next attempt row for the same
  `(stageId, characteristicId)` — its `result` supersedes the prior one only
  for "what counts right now" (the latest attempt), while every prior
  attempt remains permanently queryable, directly satisfying §13/§14.
- The overall-inspection PASS/FAIL (§9) becomes a derived read: for each
  required characteristic, take its **latest** attempt's result; PASS only
  if every required characteristic's latest result is Pass, FAIL if any
  latest result is Fail, NOT PASSED if any is missing/NA-pending.

None of this requires discarding any existing QMS concept — it is additive
and reuses the existing Pass/Fail/NA vocabulary, the existing
append-only-log precedent, and the existing `InspectionDocument` evidence
mechanism.

---

## J. How the Production Stage gate would determine whether the stage can proceed

1. A stage transition attempt (e.g. "mark stage Completed" / "move to next
   stage" — the exact trigger point mirrors wherever
   `checkMaterialAvailability` is currently called from, i.e. the
   start/receive/complete action handlers in `Production.tsx`/
   `ProjectDetail.tsx`) first checks whether that stage has
   `inspectionRequired === true` and a linked inspection.
2. If not linked → proceed exactly as today, no change in behavior
   (§7/§18 — unlinked stages behave normally).
3. If linked → evaluate the derived overall result from I above for that
   linked inspection:
   - Not started / no attempts yet → BLOCKED ("inspection not started").
   - Any required characteristic's latest attempt is Fail, or attempts are
     incomplete → BLOCKED ("inspection not passed" / "in progress").
   - All required characteristics' latest attempts are Pass → RELEASED,
     production proceeds.
4. Whether a manual override is ever allowed (the way the material gate
   allows an admin override) is **not specified** in your Phase 31 message
   and is flagged as an open question in N, not assumed here.

---

## K. Whether duplicate prevention is already possible or needs new logic

**Needs new logic — nothing exists today that could prevent it.** Under
today's one-sheet-per-project model, "adding an inspection" only ever means
editing the one sheet's `stageIds[]` array
(`updateInspectionSheetStages`) — there is no second, independent write
path through which a duplicate *of the same kind* could even currently
arise, so the question has been structurally moot so far. Once H.3
introduces a genuine multi-inspection-per-project model with two entry
points (Path A from the stage, Path B from the QMS area), a duplicate
becomes possible for the first time, and an explicit check
(`does this project already have an instance of this Library inspection
definition?`) will need to be added at whichever point creates a new
instance. This is pure new frontend logic — no persistence implication.

---

## L. Whether the requested functionality can be implemented without changing persistence

**Yes.** Every gap identified in F/H is expressible as new types, new
optional fields, and new frontend logic on the two systems that are already
local (Zustand `ProjectProductionStage` / QMS IndexedDB tables). This
includes the more significant H.3 change (introducing a genuine
multi-inspection-per-project concept) — it is a **data-shape** change
within IndexedDB (a new table or a relaxed one-sheet-per-project
constraint), not a move of QMS data onto Supabase, and it touches no
Supabase schema, RLS, trigger, permission, hydration path, or API boundary,
and does not cross the Phase 28 local/Supabase line in either direction.
The STOP condition from Phase 30/31 ("if something requires a persistence
change, STOP") is **not triggered** by anything found in this
investigation.

---

## M. If persistence changes are genuinely required, identify them precisely (do not implement)

None are genuinely required under the Phase 28 definition of "persistence
change" (Supabase schema/RLS/trigger/permission/hydration/API/local-vs-
Supabase domain movement). For completeness, the **local, non-Supabase**
data-shape changes this investigation surfaced (not implemented, listed
only so the scope is precise) are:

- New IndexedDB store/table (or extended existing one) for a genuine
  per-project, per-Library-inspection instance record, replacing/extending
  the one-sheet-per-project assumption (H.3).
- Conversion of `InspectionStageEntry` result-capture from upsert to
  append-only with an attempt/round number (H.5).
- New optional fields on `ProjectProductionStage` and on `InspectionDocument`
  (H.2, H.7).

All of the above stay entirely inside the existing local Zustand/IndexedDB
boundary and are schema-design-level decisions for a future implementation
phase, per your explicit instruction not to design a schema yet.

---

## N. Remaining genuine business decisions you must answer

1. **How should "multiple inspections per project" actually be modeled at
   the instance level?** (H.3) — e.g., does relaxing "one sheet per
   project" to "many sheets per project" make sense given the sheet also
   carries print/upload/revision/document-workflow semantics per inspection
   instance, or should a lighter parallel "Project QMS Inspection" concept
   sit above the existing sheet mechanics? This determines a lot of
   downstream shape and is the single biggest open design question.
2. **Can a blocked (gate-failed) Production Stage ever be manually
   overridden**, the way the existing material-availability gate allows an
   admin override — or is a Required Inspection gate meant to be
   absolute/non-overridable? Not stated in your spec.
3. **Exact duplicate-prevention UX** (§6 already says "exact UI TBD at
   implementation time" — reconfirmed still open, not decided here).
4. **Where can the link be initiated** — only from the Production Stage side
   (Path A), only from the QMS side when marking something "linked to a
   stage," or genuinely both, with the same duplicate-prevention rule
   applying regardless of direction? Your §5 describes both paths existing
   but doesn't say whether linking itself can be initiated from either side
   or only from Path A.
5. **What counts as "required" for the PASS rule** (§9: "ALL required
   characteristics pass") — are all characteristics under a linked
   inspection automatically "required," or can some be optional/informational
   within one inspection? Not stated.

None of these were decided or assumed in this report.

---

## O. Confirmation

No code, database schema, RLS policy, trigger, function, permission,
hydration path, API boundary, IndexedDB structure, Zustand store shape, or
any Supabase data was created, modified, or deleted during this
investigation. All findings were obtained via direct source reads and grep
only: `types.ts`, `store.ts`, `pages/ProjectDetail.tsx`,
`pages/Production.tsx`, `qms/types.ts`, `qms/api/inspections.ts`,
`qms/pages/ProjectInspectionTab.tsx`,
`qms/components/inspection/StageChecklistSection.tsx`,
`qms/components/inspection/StagePhotoGallery.tsx`,
`qms/components/inspection/InspectionSheetView.tsx`. The Phase 28 baseline
(26/28 domains, ~93%, Supabase-backed; QMS permanently out of scope;
Production Stages deferred) is unchanged and unaffected by this report.

---

## Final status

- Persistence change required: **No** (L).
- The single biggest structural gap is C1/H.3: today's QMS models one
  inspection-sheet-with-many-stages per project, not many independent
  inspections per project — this needs a design decision (N.1) before any
  of the rest can be implemented cleanly.
- The single biggest data-integrity gap is C3/H.5: current result capture
  overwrites in place and would silently violate §13 ("never destroy
  failure history") if built on as-is.
- **Per explicit instruction: this report stops here. No implementation, no
  schema design, and no next phase begins without your explicit
  confirmation.**
