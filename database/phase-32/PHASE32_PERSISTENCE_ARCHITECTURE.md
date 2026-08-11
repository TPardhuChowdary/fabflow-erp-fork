# Phase 32 — Persistence Architecture Investigation for the NEW Production ↔ QMS Manufacturing Workflow

**Status: READ-ONLY INVESTIGATION. No code, schema, RLS, trigger,
permission, hydration, API, IndexedDB, Zustand, or Supabase change was
made in this phase.** Everything below is a **proposal** pending your
explicit approval — nothing has been created.

Business decisions in effect for this analysis (as approved): **1-B**
(independent Project Inspection instances), **2-B** (supervisor override,
reason required, logged, marked, never turns Fail into Pass), **3-B**
(warn-and-reuse duplicate prevention), **4-A** (link only initiated from
the Production Stage side), **5-A** (all characteristics on an inspection
are required by default).

---

## Two facts discovered this phase that materially change the picture

### 1. A correction to Phase 28: `qms_stage_completions` is fuller than previously reported

Phase 28 reported the live `qms_stage_completions` table as only 9 columns
("missing sheetId and ~8 other fields... confirmed non-viable as a
migration target as-is"). Re-probing the live table this phase (via the
same read-only column-existence technique, executed fresh) shows **all 20
columns succeed**, matching `database/phase-11/phase11_production_persistence_FINAL.sql`
exactly: `id, organization_id, project_id, sheet_id, stage_id, mode,
inspector_name, signature_data_url, remarks, completed_at, signed_at,
assigned_to, assigned_to_name, assigned_by, assigned_at, due_date,
accepted_qty, rejected_qty, created_at, updated_at` — a near field-for-field
match with the frontend `InspectionStageCompletion` type. This is a
**correction to an earlier finding**, disclosed transparently. It does not
reopen your QMS-out-of-scope decision (that was about the whole subsystem
architecture and stays exactly as you decided) but it matters now because
this phase is evaluating what already exists to reuse.

**Also discovered**: `project_production_stages` and
`production_stage_transactions` are similarly live with their **full**
column sets, full RLS policies (`has_permission()` + `organization_id`
pattern), and the same triggers Phase 28 already found
(`trg_validate_rework_reference`, `trg_enforce_stage_transaction_limit`,
`trg_qms_stage_completions_updated_at`) — all three tables confirmed still
at **0 rows**. This entire piece of infrastructure
(`database/phase-11/phase11_production_persistence_FINAL.sql`, 818 lines)
was fully built and applied, then deliberately left unused when you
declined the Production Stages migration in Phase 28. It's real, tested-
shape infrastructure sitting dormant — directly useful as a **convention
reference** for anything proposed below, even where the tables themselves
aren't reused as-is.

### 2. QMS data today has zero cross-device visibility and no backup

Confirmed by direct inspection: `qms/db/` (the IndexedDB layer) has no
sync, replication, or export mechanism of any kind, and `Settings.tsx`'s
backup/export feature has zero references to QMS data. **This means every
inspection result, photo, and sign-off recorded in QMS today lives
entirely inside one browser, on one device, with no copy anywhere else.**
If that device's browser storage is cleared, or a different device/browser
is used, that data is gone or invisible. This is the single most important
fact driving the recommendation below — a **production gate** that's
supposed to block work for the whole shop floor cannot rely on data that
only one browser can see.

---

## Walking through your 15 investigation points

### 1. Project-specific QMS inspection instances (Decision 1-B)
**Must be Supabase-backed.** This is new, durable business data (a formal
record that "Project X requires Powder Coating QC") that every user, on
every device, needs to see consistently — exactly the kind of data the
other 26 domains are Supabase-backed for. It references the QMS Library
(characteristics/inspection definitions), which stays IndexedDB-only per
your standing decision — so the link is a **soft reference** (a stored id
+ a name snapshot), not a real foreign key, matching the same "soft link"
pattern Phase 28 already found and accepted for `qms_stage_completions.stage_id`
today.

### 2. Production Stage → Required QMS Inspection relationship
**Must be Supabase-backed on the inspection side; the Production Stage
itself stays local**, per your still-standing decision not to migrate
Production Stages (this phase doesn't reopen that). The link is stored as
a soft reference from the new Supabase table to the **local, stable id**
of the `ProjectProductionStage` (see G below for why that id needs to
become reliably populated). This is enough for the gate to work
cross-device — see I below for why the stage's other fields don't need to
move.

### 3. Independent Project QMS inspections (Path B)
Same table as #1, just with no stage link. No separate table needed.

### 4. Individual characteristic creation
Must be Supabase-backed as a **snapshot**, not a live pointer to the
Library. Reason: the Library can change over time (rename/retire a
characteristic); if a historical inspection re-derived "what applied"
from the current Library state, past records could silently become
inaccurate. Snapshotting the characteristic name/category onto the
instance at creation time keeps history honest — directly serves your
§13 "never destroy history" rule.

### 5. Characteristic Pass/Fail/NA + failure attempts
**Must be Supabase-backed, append-only.** This is the core of your
rectification cycle (§10-§14) and needs to survive reloads/devices/users
and never be overwritten. See the proposed `project_qms_inspection_attempts`
table below — one new row per attempt, database-enforced to be
un-editable and un-deletable once written.

### 6. Failure reasons/descriptions
Same table/row as #5 — additional columns, populated only when
`result = 'Fail'`.

### 7. Failure photos/evidence
Must be Supabase-backed and attributable to the **specific attempt**
(characteristic + round), not just the stage. Proposed as its own small
table so one attempt can have multiple photos.

### 8. Rectification/corrective actions
Same shape as failure detail — recorded against the failed attempt it
remedies.

### 9. Rectification photos/evidence
Same photo table as #7, same attribution model.

### 10. Re-inspection attempts
Just the **next row** in the same append-only attempts table for the same
characteristic — no separate concept needed; "re-inspection" is simply
attempt #2, #3, etc.

### 11. Final inspection result
Must be Supabase-backed, but **derived**, not manually entered — computed
from the latest attempt per characteristic per your §9 rule (all pass →
Pass; any fail → Fail; incomplete → Not Passed). Recommended to be computed
server-side (a trigger/function), not left to frontend JS, so it can never
drift or race — see I below.

### 12. Production-stage inspection gate state
Same derived value as #11, read by the gate-check logic wherever a stage
transition is attempted. Must be Supabase-backed for the same
cross-device reason as #1.

### 13. Supervisor/Admin overrides and reasons
Must be Supabase-backed, append-only, and — per your explicit
clarification — must never alter the underlying Fail/Pass result. Modeled
as a **separate, additional record layered on top of** the (still-Failed)
inspection state, not a mutation of it. See table proposal below.

### 14. Audit/history information
Already has a proven precedent: `InspectionHistoryEvent` (existing QMS
IndexedDB type) is an immutable, append-only log — the right *shape*,
just at the wrong location for this new data (which needs to be visible
across devices). The new attempts/photos/overrides tables *are* the audit
trail for this workflow; no separate history table is needed beyond them.

### 15. Digital/Paper/Hybrid execution data
Stays exactly as-is — you explicitly said not to redesign these modes this
phase. The new inspection-instance table simply records which mode was
selected (a single column), matching today's `InspectionSheet.mode`
concept.

---

## A. What can remain local safely

- The entire QMS **Library** — `QualityCharacteristic`,
  `InspectionStageDefinition`, templates. Rarely changes, not
  transactional, doesn't need per-device sync the way live inspection
  results do. Referenced only by soft link + snapshot from the new tables.
- The **existing** one-sheet-per-project `InspectionSheet` /
  `InspectionStageCompletion` / `InspectionStageEntry` /
  `InspectionDocument` data and screens — completely untouched, keep
  working exactly as today, in parallel with the new tables.
- `ProjectProductionStage`'s own core fields (name, position, status,
  quantities, transactions) — stay in local Zustand, per your still-
  standing decision not to migrate Production Stages.
- Digital/Paper/Hybrid mode *mechanics* beyond simply recording which mode
  was chosen.

## B. What should be Supabase-backed

Everything identified as "must be Supabase-backed" in items 1, 2 (link +
gate side), 3, 4 (snapshot), 5, 6, 7, 8, 9, 10, 11, 12, 13 above — in
short: the entire new inspection-instance/attempt/evidence/override
record set. This is genuinely new, durable, cross-device business data,
which is exactly the category the other 26 domains were migrated for.

## C. What existing Supabase tables could be reused

**None of the new data fits cleanly into an existing table.**
`qms_stage_completions` belongs to the *old* one-sheet-per-project model
(its `stage_id` references QMS's own `InspectionStageDefinition` id space
for a *sheet's* checkpoint stage, not a standalone project-inspection
instance) — retrofitting the new independent-instance/attempt-history
model onto it would mean overloading an existing table with a different
concept, which risks corrupting or complicating the old model it already
serves. Recommended: leave `qms_stage_completions` (and
`project_production_stages` / `production_stage_transactions`) exactly as
they are, untouched, and add new, purpose-built tables alongside them.
Their **conventions** (RLS shape, trigger patterns, column naming) are
reused extensively — see D/E/F.

## D. What new Supabase tables would genuinely be required (proposed shape)

All five below follow the exact existing conventions (uuid pk,
`organization_id` + `current_organization_id()`, `created_at`/`updated_at`
timestamptz, snake_case) already used by every migrated domain.

**1. `project_qms_inspections`** — one row per independent inspection
instance on a project.
```
id                          uuid pk
organization_id             uuid  (existing convention)
project_id                  uuid  FK -> projects(id) on delete cascade
library_inspection_id       text  -- soft link to QMS Library, no DB FK possible
library_inspection_name     text  -- snapshot, so renames in the Library don't rewrite history
required_production_stage_id text nullable  -- soft link to the LOCAL ProjectProductionStage.id; null = independent (Path B)
mode                        text  check in ('Digital','Paper','Hybrid')
status                      text  -- 'NotStarted' | 'InProgress' | 'Passed' | 'Failed', derived (see F)
created_by, created_at, updated_at
unique (project_id, library_inspection_id)   -- THIS is Decision 3-B's duplicate guard
```

**2. `project_qms_inspection_characteristics`** — snapshot of which
characteristics apply to this instance.
```
id, organization_id
project_qms_inspection_id  uuid FK -> project_qms_inspections(id) on delete cascade
library_characteristic_id  text  -- soft link
name_snapshot, category_snapshot  text
sequence                   integer
created_at
```

**3. `project_qms_inspection_attempts`** — the append-only core.
```
id, organization_id
project_qms_inspection_id  uuid FK
characteristic_id          uuid FK -> project_qms_inspection_characteristics(id)
round_number                integer  -- auto-computed, see F
result                       text check in ('Pass','Fail','NA')
measured_value               text
failure_reason                text nullable
failure_description            text nullable
rectification_action           text nullable
rectification_description       text nullable
performed_by, performed_at, created_at
-- INSERT-ONLY: update/delete blocked by trigger (see F)
```

**4. `project_qms_inspection_attempt_photos`** — evidence attached to a
specific attempt (failure photo or rectification proof).
```
id, organization_id
attempt_id     uuid FK -> project_qms_inspection_attempts(id) on delete cascade
file_data      text  -- base64 data URL, same convention as employee_documents
file_mime_type text
caption        text nullable
uploaded_by, uploaded_at, created_at
-- INSERT-ONLY, same trigger pattern
```

**5. `project_qms_inspection_overrides`** — Decision 2-B, the emergency
override log.
```
id, organization_id
project_qms_inspection_id  uuid FK
required_production_stage_id  text  -- which stage this override released
reason        text not null
overridden_by, overridden_at, created_at
-- INSERT-ONLY. Never writes to project_qms_inspections.status.
-- The gate-check reads status AND "any active override" separately —
-- a Failed inspection stays Failed on the record; the override is a
-- visible, separate, permanent flag that let the stage proceed anyway.
```

## E. What RLS policies would genuinely be required

Reuse the exact, already-proven pattern from every migrated domain and
from the dormant Phase-11 tables: `has_permission(module, action) and
organization_id = current_organization_id()` on every policy.

Recommended module: reuse the existing `inspection_sheets` permission
module (already has view/generate/complete/upload/print/review/approve/
assign) for the four regular tables — no new module needed. For the
override table specifically, add **one new permission action**:
`inspection_sheets.override` — a small **data** change (one new row in
the existing `permissions` seed table, not a schema change) so overriding
requires a distinct, admin-grantable permission rather than being
available to anyone who can merely "complete" an inspection, matching your
explicit "supervisor/admin only" requirement.

Proposed policy shape (mirroring the dormant `qms_stage_completions`
policies exactly):
- `select`: `has_permission('inspection_sheets','view') and organization_id = current_organization_id()`
- `insert`/`update` on inspections/characteristics/attempts/photos:
  `has_permission('inspection_sheets','complete') and organization_id = current_organization_id()`
- `insert` on overrides only: `has_permission('inspection_sheets','override') and organization_id = current_organization_id()`
- No `update`/`delete` policies at all on attempts/photos/overrides — RLS
  simply has no policy permitting those operations, which combined with
  the append-only triggers (F) gives two independent layers stopping
  history from being altered.

## F. What triggers/database functions would genuinely be required

1. **`set_updated_at_timestamp()`** — already exists, reused as-is for
   `project_qms_inspections.updated_at`. Zero new code.
2. **New: append-only guard.** One small trigger function (or one
   generic one parameterized by `TG_TABLE_NAME`) that raises an exception
   on any `UPDATE` or `DELETE` against `project_qms_inspection_attempts`,
   `_attempt_photos`, and `_overrides`. This is the actual mechanism that
   *guarantees* "never destroy history" — not just a frontend convention
   that a future bug could bypass.
3. **New: round-number auto-increment.** A trigger on insert into
   `project_qms_inspection_attempts` that locks the parent characteristic
   row `for update` and sets `round_number` to one more than the current
   max for that characteristic — the same lock-before-aggregate,
   concurrency-safe pattern already proven by
   `enforce_stage_transaction_limit()` in the dormant Phase-11 migration.
   This stops two simultaneous re-inspections from racing into the same
   round number.
4. **New: status recompute.** A trigger (or a `security definer` function
   called right after an attempt insert) that recomputes
   `project_qms_inspections.status` from the latest attempt per
   characteristic, per your §9 rule. Doing this **in the database**, not
   only in frontend JS, is what makes the gate state authoritative and
   safe under concurrent writes from two devices — see I.

## G. What existing frontend APIs/hydration would need to change

- New `lib/qmsInspectionsApi.ts` (mirroring `employeeDocumentsApi.ts`'s
  shape) — CRUD against the 5 new tables.
- New hydration wiring in `lib/hydration.ts` /
  `hooks/useSupabaseHydration.ts` — the same pattern used for every one of
  the 26 existing domains, so the new data loads into a Zustand cache on
  login/refresh.
- New Zustand cache slice (mirroring `useQmsStore`'s existing
  `stageCompletions` cache) for the new inspection/attempt/override data.
- Gate-check logic (the code that currently calls
  `checkMaterialAvailability`) extended to also check this new cache,
  keyed by `(project_id, stable_local_stage_id)`.
- **One necessary local-only change**: `ProjectProductionStage` needs a
  **stable, always-populated id** (today `stageId` only exists for
  synthetic rework stages, per Phase 30/31's finding) — generated at seed
  time and at `handleAddStage` time. This is a local Zustand/type change,
  not a persistence-boundary change, but it's a genuine prerequisite: the
  soft link in `project_qms_inspections.required_production_stage_id`
  needs something stable to point at.

## H. How existing QMS data would be preserved/migrated

**No migration needed.** The old `InspectionSheet` /
`InspectionStageCompletion` / `InspectionStageEntry` / `InspectionDocument`
data stays exactly where it is, untouched, and keeps working exactly as
today. The five new tables are additive and run in parallel — nothing is
converted, moved, or deleted. If you later decide the old one-sheet model
should be retired in favor of the new one, that would be a separate,
future decision — not assumed or started here.

## I. How the Production Stage gate would reliably work across users/devices

Two things combine to make this reliable, both matching how the other 26
domains already work (no new mechanism invented):

1. **Shared source of truth.** The gate reads `project_qms_inspections.status`
   (server-computed, F.4) from Supabase — the same row, visible to every
   user and device, instead of today's per-browser IndexedDB data that
   literally cannot be seen from a second device.
2. **Refresh model, honestly stated.** Like every other Supabase-backed
   domain in this app today, data loads via hydration on login/action-
   refresh — **not** a live push subscription (confirmed: no
   `supabase.channel()`/realtime usage exists anywhere in
   `lib/hydration.ts` today). This means a second device sees an
   inspection's Pass/Fail update on its next refresh, not instantly the
   millisecond it happens elsewhere — exactly the same behavior every
   other module in this app already has, not a new limitation introduced
   by this proposal. True instant push (Supabase Realtime) would be a
   **nice to have**, not required for correctness, and is a separable
   future enhancement.

## J. How inspection history stays append-only and is never lost

Two independent, database-level layers (not just a frontend rule):
`project_qms_inspection_attempts`/`_attempt_photos`/`_overrides` have (a)
no RLS policy permitting `update`/`delete` at all, and (b) an explicit
trigger that raises an exception on any attempted `update`/`delete`. Even
a future frontend bug or a different client entirely cannot silently
overwrite a past Fail record — the guarantee lives in the database, not in
application code discipline.

## K. How photos/evidence should be persisted

**Base64 data-URL in a text column** — the exact, proven convention
already used for `employee_documents` and `PurchasedItemAttachment`
(Petty Expenses), not Supabase Storage (which this codebase has never
used anywhere; introducing it would be a genuinely new architecture
element, out of scope for this feature alone). One row per photo in
`project_qms_inspection_attempt_photos`, attributed to a specific attempt.

**Risk flagged, not solved here**: the existing base64 convention has no
compression/resizing anywhere in the codebase today (confirmed by grep —
`employeeDocumentsApi.ts`/`EmployeeDetail.tsx` upload raw file data
as-is). A manufacturing QC workflow with multiple characteristics ×
multiple rounds × multiple photos per project could accumulate
meaningfully more photos than today's one-photo-per-document features.
Recommending client-side compression/resize before upload as a **nice to
have**, not required for correctness — flagged for your awareness, not
decided or implemented here.

## L. Whether the 26/28 baseline can remain intact while extending

**Yes, fully.** Nothing in this proposal touches, alters, or migrates any
of the 26 already-Supabase-backed domains, the existing QMS IndexedDB
subsystem, or `project_production_stages`/`production_stage_transactions`
(Production Stages migration is still not being proposed or reopened
here). This is purely additive: 5 new, independent Supabase tables for
the new workflow, sitting alongside everything that already exists
unchanged.

---

## Required for correctness / Nice to have / Can remain local

**Required for correctness** (the feature does not work safely without
these being Supabase-backed):
- `project_qms_inspections` (instances, links, derived status)
- `project_qms_inspection_characteristics` (snapshot)
- `project_qms_inspection_attempts` (append-only results + failure/
  rectification detail)
- `project_qms_inspection_overrides` (override log)
- The append-only DB triggers (F.2) and RLS's absence of update/delete
  policies (E) — without these, "never destroy history" is only a
  convention, not a guarantee
- A stable, always-populated id on `ProjectProductionStage` (local-only
  change, G)

**Nice to have** (improves the feature, not required to ship correctly):
- `project_qms_inspection_attempt_photos` as a *separate* table (vs.
  folding a single photo into the attempt row) — separate table is
  recommended for multi-photo support, but a simpler single-photo-per-
  attempt column would also technically work if you want to start smaller
- A dedicated `inspection_sheets.override` permission action (vs. reusing
  `.complete`) — better practice, but separable
- Client-side photo compression (K)
- Supabase Realtime push for instant (not refresh-based) cross-device
  gate updates (I)

**Can remain local** (no change needed):
- QMS Library (characteristics/inspection definitions)
- The old one-sheet-per-project QMS data and screens
- `ProjectProductionStage`'s own core fields (name, position, status,
  quantities, transactions)
- Digital/Paper/Hybrid mode mechanics beyond recording the chosen mode

---

## Final answers

### 1. Recommended architecture
Five new, additive Supabase tables (D) layered on top of the existing
Production Stage (local) and QMS Library (local) systems via soft
references and snapshots — no existing table is repurposed, no existing
domain is touched, the old QMS sheet model keeps running untouched in
parallel.

### 2. Exact persistence changes required
`project_qms_inspections`, `project_qms_inspection_characteristics`,
`project_qms_inspection_attempts`, `project_qms_inspection_attempt_photos`,
`project_qms_inspection_overrides` — full proposed shapes in D; RLS in E;
triggers/functions in F. One new permission-table row
(`inspection_sheets.override`). None of this has been created — this is
the proposal only.

### 3. Exact frontend changes required
New `qmsInspectionsApi.ts`, new hydration wiring, new Zustand cache slice,
gate-check logic extended to read the new cache, and one local-only type
change (a stable `id` on every `ProjectProductionStage`) — detailed in G.

### 4. Migration/data-preservation considerations
None required. Purely additive; existing QMS and Production Stage data
and screens are entirely untouched (H).

### 5. Security/RLS considerations
Reuses the existing, already-audited `has_permission()` +
`organization_id` pattern used by all 26 migrated domains and the dormant
Phase-11 tables. One new permission action for overrides, so only
admins/supervisors granted it can use the emergency-release path (E).

### 6. Risks
- Base64 photo storage has no compression today anywhere in the codebase
  — row/hydration-payload size could grow meaningfully faster than
  existing single-document features (K), worth watching, not blocking.
- The soft-link design (no real DB foreign key from the new Supabase
  tables to the local Production Stage id, or to the IndexedDB Library)
  relies on application-level integrity rather than database-enforced
  integrity — the same trade-off already accepted for
  `qms_stage_completions.stage_id` today, not a new risk class.
- Gate updates are refresh-based, not instantly live across devices (I) —
  consistent with how the rest of the app already behaves, but worth
  being explicit that it isn't instant.

### 7. Whether I recommend proceeding
Yes — the business requirement (durable, cross-device, tamper-evident
manufacturing quality records feeding a production gate) is a genuine fit
for Supabase, the existing 26-domain pattern and the dormant Phase-11
tables already prove the conventions work, and none of it requires
touching anything already working.

### 8. STOP/GO decision for the next implementation phase
**STOP** — per your explicit instruction, no schema, code, or data change
has been made. This document is the complete proposal. Waiting for your
explicit confirmation before any implementation phase begins.
