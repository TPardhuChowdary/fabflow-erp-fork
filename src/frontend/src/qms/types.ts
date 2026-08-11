// QMS entity definitions — Phase 1 (Quality Characteristic Library) scope only.
// See QMS_ARCHITECTURE.md for the full entity model; entities not needed until
// later phases (QualityGate, ProductInspectionPlan, InspectionRecord, NCR, CAPA)
// are intentionally not defined here yet.

export type QmsCriticality =
  | "SafetyCritical"
  | "FunctionalCritical"
  | "RegulatoryCritical"
  | "CustomerCritical"
  | "Cosmetic"
  | "ProcessCritical";

export const QMS_CRITICALITY_LEVELS: QmsCriticality[] = [
  "SafetyCritical",
  "FunctionalCritical",
  "RegulatoryCritical",
  "CustomerCritical",
  "ProcessCritical",
  "Cosmetic",
];

export type QmsCharacteristicStatus = "Active" | "Obsolete";

export type QmsInspectionMethodType =
  | "PassFail"
  | "Numeric"
  | "MultiNumeric"
  | "Text"
  | "Dropdown"
  | "Checkbox"
  | "Photo"
  | "File"
  | "Certificate"
  | "BarcodeScan"
  | "QRScan";

export interface ManufacturingProcess {
  id: string;
  name: string;
  sequence: number;
  active: boolean;
  createdAt: number;
}

export interface Operation {
  id: string;
  processId: string;
  name: string;
  sequence: number;
  department?: string;
  requiredSkills: string[];
  requiredMachines: string[];
  active: boolean;
  createdAt: number;
}

export interface InspectionMethod {
  id: string;
  name: string;
  type: QmsInspectionMethodType;
  config?: {
    options?: string[]; // for Dropdown
    unit?: string; // default unit for Numeric/MultiNumeric
  };
  active: boolean;
  createdAt: number;
}

export interface QualityCharacteristic {
  id: string;
  name: string;
  description: string;
  category: string;
  processId: string;
  operationId: string;
  criticality: QmsCriticality;
  inspectionMethodId: string;
  acceptanceCriteria: string;
  toleranceNominal?: number;
  tolerancePlus?: number;
  toleranceMinus?: number;
  unit?: string;
  measuringInstrument?: string;
  standardReference?: string;
  drawingReference?: string;
  evidenceRequired: boolean;
  photoRequired: boolean;
  customerScope?: string; // Customer.id reference — undefined = generic/all customers
  tags: string[];
  version: number;
  status: QmsCharacteristicStatus;
  createdAt: number;
  updatedAt: number;
}

export interface QmsTemplate {
  id: string;
  name: string;
  category: string;
  description?: string;
  characteristicIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface QmsFavorite {
  id: string; // `${userId}__${characteristicId}`
  userId: string;
  characteristicId: string;
  createdAt: number;
}

export interface CharacteristicLibraryFilters {
  search: string;
  processId: string; // "" = all
  operationId: string; // "" = all
  category: string; // "" = all
  criticality: string; // "" = all
  inspectionMethodId: string; // "" = all
  customerScope: string; // "" = all, "generic" = no customer scope
  status: "Active" | "Obsolete" | "All";
  favoritesOnly: boolean;
  templateId: string; // "" = none applied
}

export const DEFAULT_LIBRARY_FILTERS: CharacteristicLibraryFilters = {
  search: "",
  processId: "",
  operationId: "",
  category: "",
  criticality: "",
  inspectionMethodId: "",
  customerScope: "",
  status: "Active",
  favoritesOnly: false,
  templateId: "",
};

// ── Phase 2 — Inspection Sheets ──────────────────────────────────
// Everything below is additive to the Phase 1 model above; nothing above
// this line is changed by Phase 2.

/** A curated, ordered checkpoint stage a project can be inspected against.
 * Optionally linked to a ManufacturingProcess so its checklist can be
 * auto-loaded from the Characteristic Library by processId. */
export interface InspectionStageDefinition {
  id: string;
  name: string; // "Welding Inspection"
  processId?: string; // link into ManufacturingProcess — undefined = no auto checklist
  sequence: number;
  active: boolean;
  createdAt: number;
}

export type InspectionMode = "Paper" | "Digital" | "Hybrid";

// Phase 3 note: "Signed" is kept in this union for backward compatibility with
// any sheet already persisted in that status — it is no longer produced by
// new transitions, which use "AwaitingUpload" instead (see
// api/inspections.ts maybeMarkSheetSigned). Nothing reads/writes "Signed"
// going forward, but removing it would be a breaking type change against
// existing IndexedDB data, so it stays.
export type InspectionSheetStatus =
  | "Draft"
  | "Generated"
  | "Printed"
  | "InspectionStarted"
  | "InProgress"
  | "Completed"
  | "Signed"
  | "AwaitingUpload"
  | "Uploaded"
  | "Reviewed"
  | "Approved"
  | "Closed";

// Canonical Phase 3 workflow order used for the visual stepper and for
// transition validation. "Signed" is intentionally omitted from this display
// order (legacy-only, see note above) but remains a valid stored value.
export const INSPECTION_SHEET_STATUS_ORDER: InspectionSheetStatus[] = [
  "Draft",
  "Generated",
  "Printed",
  "InspectionStarted",
  "InProgress",
  "Completed",
  "AwaitingUpload",
  "Uploaded",
  "Reviewed",
  "Approved",
  "Closed",
];

// Legal forward transitions. Used by inspections.ts to block illegal status
// changes. "Signed" kept as a legacy predecessor of "Uploaded" only, so any
// pre-Phase-3 sheet that reached "Signed" can still progress normally.
// "Uploaded" is reachable from almost every active state, not just
// AwaitingUpload — a pure Paper-mode sheet (§Paper workflow: Generate →
// Print → inspector completes on paper, entirely outside the app → Scan →
// Upload → Approve) never passes through any of the digital per-stage
// states at all, so the whole-sheet upload can legally land while the sheet
// is still "Printed". Digital-mode sheets similarly can reach "Reviewed"
// straight from "Completed" — they never produce a physical document to
// upload in the first place.
export const INSPECTION_SHEET_TRANSITIONS: Record<
  InspectionSheetStatus,
  InspectionSheetStatus[]
> = {
  Draft: ["Generated"],
  Generated: ["Printed", "InspectionStarted", "InProgress", "Uploaded"],
  Printed: ["InspectionStarted", "InProgress", "Uploaded"],
  InspectionStarted: ["InProgress", "Completed", "Uploaded"],
  InProgress: ["Completed", "AwaitingUpload", "Signed", "Uploaded"],
  Completed: ["AwaitingUpload", "Signed", "Uploaded", "Reviewed"],
  Signed: ["Uploaded", "AwaitingUpload"],
  AwaitingUpload: ["Uploaded"],
  Uploaded: ["Reviewed"],
  Reviewed: ["Approved", "Uploaded"], // Uploaded = sent back for re-upload
  Approved: ["Closed"],
  Closed: [],
};

/** One inspection sheet per project. Mutable in place; `revision` increments
 * when the stage list is edited after the sheet leaves Draft. Every
 * meaningful change is additionally logged, immutably, to InspectionHistoryEvent. */
export interface InspectionSheet {
  id: string;
  projectId: string; // FK into the main ERP store — read-only reference, never written back
  inspectionNumber: string; // "INS-2026-001"
  revision: number;
  mode: InspectionMode;
  status: InspectionSheetStatus;
  stageIds: string[]; // ordered InspectionStageDefinition ids selected for this project
  customerId?: string; // snapshotted from the project at generation time
  drawingReference?: string;
  drawingRevision?: string;
  generatedAt: number;
  generatedBy: string;
  printedAt?: number;
  printedBy?: string;
  uploadedAt?: number; // most recent whole-sheet upload
  uploadedBy?: string;
  reviewedAt?: number;
  reviewedBy?: string;
  approvedAt?: number;
  approvedBy?: string;
  closedAt?: number;
  closedBy?: string;
  createdAt: number;
  updatedAt: number;

  // ── Phase 3 — revision control (additive, all optional) ──────────
  /** Stable id shared by every revision of "the same document." The first
   * revision leaves this undefined (it IS the family root — its own `id`
   * serves as the family id); revision 2+ always sets it explicitly. */
  documentFamilyId?: string;
  /** The InspectionSheet.id this revision was created from. Undefined for
   * the first revision of a document family. */
  previousRevisionId?: string;
  /** Free-text reason captured when this revision was created — also
   * logged to InspectionHistoryEvent on the previous revision for the
   * audit trail. */
  revisionReason?: string;
}

/** Structured digital result for one characteristic within one stage of one sheet.
 * This is the "structured data" side — never a substitute for the scanned document. */
export interface InspectionStageEntry {
  id: string;
  sheetId: string;
  stageId: string;
  characteristicId: string;
  result?: "Pass" | "Fail" | "NA";
  measuredValue?: string;
  remarks?: string;
  updatedAt: number;
  updatedBy?: string;
}

/** Per-stage sign-off: which mode this specific stage was completed in
 * (this is what makes Hybrid mean something — different stages, different modes),
 * plus inspector identity, digital signature, and timing. */
export interface InspectionStageCompletion {
  id: string;
  sheetId: string;
  stageId: string;
  mode: "Paper" | "Digital";
  inspectorName?: string;
  signatureDataUrl?: string; // canvas PNG data URL, digital mode only
  remarks?: string;
  completedAt?: number;
  signedAt?: number;
  updatedAt: number;

  // ── Phase 3 — stage assignment (additive, all optional) ───────────
  /** Employee.id (preferred) or free-text name of the currently assigned
   * inspector. Reassigning overwrites this field; each change is logged
   * to InspectionHistoryEvent as "StageAssigned" for reassignment history —
   * no separate assignment-history table needed. */
  assignedTo?: string;
  assignedToName?: string; // denormalized display name, avoids an Employee lookup everywhere
  assignedBy?: string;
  assignedAt?: number;
  dueDate?: string; // "YYYY-MM-DD", optional — drives the Overdue bucket on the Inspector Dashboard

  // ── Phase 4 — quantity tally (additive, all optional) ─────────────
  /** Pieces accepted/rejected at this stage — a whole-stage tally, distinct
   * from InspectionStageEntry.result (which is a per-characteristic
   * Pass/Fail/NA, not a headcount). Feeds ProjectDetail's dispatch-readiness
   * badge and Production Summary panel, replacing the legacy standalone
   * Quality Inspection module's per-project Approved/Rejected Qty. */
  acceptedQty?: number;
  rejectedQty?: number;
}

/** An uploaded document (typically a scanned, physically-signed sheet).
 * Immutable once created — a re-upload is a new row, never an overwrite. */
export interface InspectionDocument {
  id: string;
  sheetId: string;
  stageId?: string; // undefined = whole-sheet document (typical Paper mode)
  fileName: string;
  fileType: string;
  fileSize: number;
  blob: Blob;
  uploadedAt: number;
  uploadedBy: string;
  notes?: string; // doubles as "Comments" per Phase 3 §9/§10

  // ── Phase 3 — photo evidence, checksums, generated PDFs (additive) ──
  /** Distinguishes a user-uploaded scan/photo from a system-generated PDF —
   * both live in this same table; no separate "generated documents" store. */
  source?: "Uploaded" | "Generated";
  caption?: string; // short photo caption, distinct from the longer `notes`/comments
  checksum?: string; // SHA-256 hex digest via Web Crypto, computed at upload time
}

/** Append-only audit trail: every generation, print, status change, signature,
 * upload, review, and approval event for a sheet. */
export interface InspectionHistoryEvent {
  id: string;
  sheetId: string;
  action: string; // "Generated" | "Printed" | "StageSigned" | "DocumentUploaded" | "Reviewed" | "Approved" | ... free text for readability
  byUserId: string;
  byUserName: string;
  at: number;
  notes?: string;
}

export interface InspectionSheetFilters {
  search: string; // matches inspection number, project, customer
  status: InspectionSheetStatus | "All";
  mode: InspectionMode | "All";
  stageId: string; // "" = all
}

export const DEFAULT_INSPECTION_SHEET_FILTERS: InspectionSheetFilters = {
  search: "",
  status: "All",
  mode: "All",
  stageId: "",
};

// ── Phase 3 — Master Document, Revisions, Assignment, PDF/QR ─────────
// Everything below is additive; nothing above this line changes meaning.

/** Statuses where the sheet becomes read-only per §4 — checklist, stages,
 * mode, and uploads are all locked. The only legal action is "Create New
 * Revision". Centralized here so every component checks the same rule. */
export const LOCKED_SHEET_STATUSES: InspectionSheetStatus[] = [
  "Approved",
  "Closed",
];

export function isSheetLocked(status: InspectionSheetStatus): boolean {
  return LOCKED_SHEET_STATUSES.includes(status);
}

/** 1 → "A", 2 → "B", ... 27 → "AA". Display-only; the stored value stays
 * the existing numeric `revision` field for backward compatibility. */
export function revisionToLetter(revision: number): string {
  let n = revision;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label || "A";
}

export interface InspectorAssignmentSummary {
  sheetId: string;
  inspectionNumber: string;
  projectId: string;
  stageId: string;
  stageName: string;
  status: "Pending" | "Completed" | "Overdue";
  dueDate?: string;
  completedAt?: number;
}

// ════════════════════════════════════════════════════════════════════════
// Phase 32 — Production ↔ QMS gate persistence. Supabase-backed (5 tables:
// project_qms_inspections, project_qms_inspection_characteristics,
// project_qms_inspection_attempts, project_qms_inspection_attempt_photos,
// project_qms_inspection_overrides — see
// database/phase-12/phase12_qms_inspection_gate_persistence.sql), NOT
// IndexedDB — a deliberate exception to this file's "IndexedDB is source
// of truth" convention for everything above this line. This is a new,
// independent, per-project inspection-instance model that runs alongside
// (never replaces) the existing InspectionSheet/StageCompletion/StageEntry
// one-sheet-per-project model. `libraryInspectionId`/
// `libraryCharacteristicId` are soft references into
// InspectionStageDefinition/QualityCharacteristic above (no DB-level FK is
// possible against a Supabase table from IndexedDB-only master data) —
// `libraryInspectionName`/`nameSnapshot` are captured at creation time so a
// later Library rename never rewrites historical meaning.
// `requiredProductionStageId` is a soft reference to the LOCAL (Zustand)
// ProjectProductionStage.stageId — Production Stages stay local per the
// standing Phase 28 decision, so this is deliberately a plain string, not
// a relation the type system can enforce.
// ════════════════════════════════════════════════════════════════════════

export type ProjectQmsInspectionStatus =
  | "NotStarted"
  | "InProgress"
  | "Failed"
  | "Passed";

/** One independent QMS inspection instance on a Project (Phase 32 §1/§3).
 * `requiredProductionStageId` unset = independent (Path B, never blocks
 * Production); set = a Required Inspection linked to that local stage
 * (Path A, becomes a gate). `status` is never client-writable — it is
 * derived server-side by recompute_qms_inspection_status() from the
 * latest attempt per characteristic, and any client-supplied value is
 * overwritten by the next attempt insert. */
export interface ProjectQmsInspection {
  id: string;
  projectId: string;
  libraryInspectionId: string;
  libraryInspectionName: string;
  requiredProductionStageId?: string;
  mode: InspectionMode;
  status: ProjectQmsInspectionStatus;
  createdBy?: string;
  createdByName?: string;
  createdAt: number;
  updatedAt: number;
}

/** Snapshot of one characteristic applicable to one inspection instance,
 * captured at creation time (Phase 32 §4). All characteristics are
 * required by default (Decision 5-A) — there is deliberately no
 * per-characteristic "required" flag. */
export interface ProjectQmsInspectionCharacteristic {
  id: string;
  projectQmsInspectionId: string;
  libraryCharacteristicId: string;
  nameSnapshot: string;
  categorySnapshot?: string;
  sequence: number;
  createdAt: number;
}

export type ProjectQmsInspectionAttemptResult = "Pass" | "Fail" | "NA";

/** One append-only attempt/round for one characteristic (Phase 32 §5-§14).
 * INSERT-ONLY at the database level (RLS grants no update/delete, and a
 * trigger raises on any attempted update/delete) — never overwritten.
 * `roundNumber` is always server-assigned (locks the parent characteristic
 * row, then max+1), never client-supplied. `failureReason`/
 * `failureDescription` are populated only when `result === "Fail"`;
 * `rectificationAction`/`rectificationDescription` are populated on the
 * attempt that records what was done to fix a prior failure, before this
 * attempt's own result. */
export interface ProjectQmsInspectionAttempt {
  id: string;
  projectQmsInspectionId: string;
  characteristicId: string;
  roundNumber: number;
  result: ProjectQmsInspectionAttemptResult;
  measuredValue?: string;
  remarks?: string;
  failureReason?: string;
  failureDescription?: string;
  rectificationAction?: string;
  rectificationDescription?: string;
  performedBy?: string;
  performedByName?: string;
  performedAt: number;
  createdAt: number;
}

/** Evidence photo attributed to one specific attempt — failure evidence or
 * rectification proof, distinguished only by which attempt it's attached
 * to and its caption (Phase 32 §7/§9/§10). Base64 data URL, same
 * convention as EmployeeDocument — not Supabase Storage. INSERT-ONLY,
 * same enforcement as attempts. */
export interface ProjectQmsInspectionAttemptPhoto {
  id: string;
  attemptId: string;
  fileData: string;
  fileMimeType: string;
  caption?: string;
  uploadedBy?: string;
  uploadedByName?: string;
  uploadedAt: number;
  createdAt: number;
}

/** Supervisor/admin emergency override of a blocked Production Stage
 * (Phase 32 §13/§15/§16). INSERT-ONLY, permanently visible. Never written
 * by, or written into, ProjectQmsInspection.status — an override sits
 * alongside a still-Failed/InProgress inspection, it never turns it into
 * Passed. `reason` is required at the database level, not just in the UI. */
export interface ProjectQmsInspectionOverride {
  id: string;
  projectQmsInspectionId: string;
  requiredProductionStageId: string;
  reason: string;
  overriddenBy: string;
  overriddenByName: string;
  overriddenAt: number;
  createdAt: number;
}
