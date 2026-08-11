// Phase 2 — Inspection Sheets. Kept as its own file, separate from
// qms/api/index.ts, so the Phase 1 Characteristic Library API surface is
// never touched. Same pattern as index.ts: pure async functions backed by
// IndexedDB today, the seam a future backend would replace.

import { getSupabase } from "@/lib/supabaseClient";
import {
  inspectionDocumentRepo,
  inspectionHistoryRepo,
  inspectionSheetRepo,
  inspectionStageCompletionRepo,
  inspectionStageEntryRepo,
} from "../db/repositories";
import {
  INSPECTION_SHEET_TRANSITIONS,
  type InspectionDocument,
  type InspectionHistoryEvent,
  type InspectionMode,
  type InspectionSheet,
  type InspectionSheetStatus,
  type InspectionStageCompletion,
  type InspectionStageDefinition,
  type InspectionStageEntry,
  isSheetLocked,
  revisionToLetter,
} from "../types";

const SYSTEM_USER_ID = "system";
const SYSTEM_USER_NAME = "System";

// Phase 15 — inspection_stage_definitions is now Supabase-backed (see
// database/phase-15/phase15_qms_master_data_FINAL.sql); starter stages are
// seeded at most once, deliberately, via
// phase15_qms_master_data_SEED.sql, not automatically per-browser. Kept as
// a no-op so the existing `await ensureStagesSeeded()` call below keeps
// compiling and behaving safely — same convention as qms/api/index.ts's
// ensureSeeded().
export async function ensureStagesSeeded(): Promise<void> {
  return Promise.resolve();
}

// ── Stages (master data) ─────────────────────────────────────────

interface InspectionStageDefinitionRow {
  id: string;
  name: string;
  process_id: string | null;
  sequence: number;
  active: boolean;
  created_at: string;
}

function rowToStageDefinition(
  row: InspectionStageDefinitionRow,
): InspectionStageDefinition {
  return {
    id: row.id,
    name: row.name,
    processId: row.process_id ?? undefined,
    sequence: row.sequence,
    active: row.active,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function getInspectionStages(): Promise<
  InspectionStageDefinition[]
> {
  await ensureStagesSeeded();
  const client = getSupabase();
  const { data, error } = await client
    .from("inspection_stage_definitions")
    .select("*")
    .order("sequence");
  if (error)
    throw new Error(`Failed to load inspection stages: ${error.message}`);
  return ((data as InspectionStageDefinitionRow[]) ?? []).map(
    rowToStageDefinition,
  );
}

// ── History (append-only) ────────────────────────────────────────

async function logHistory(
  sheetId: string,
  action: string,
  byUserId: string,
  byUserName: string,
  notes?: string,
): Promise<void> {
  const event: InspectionHistoryEvent = {
    id: crypto.randomUUID(),
    sheetId,
    action,
    byUserId,
    byUserName,
    at: Date.now(),
    notes,
  };
  await inspectionHistoryRepo.put(event);
}

export async function getHistory(
  sheetId: string,
): Promise<InspectionHistoryEvent[]> {
  const rows = await inspectionHistoryRepo.queryByIndex("sheetId", sheetId);
  return rows.sort((a, b) => a.at - b.at);
}

// ── Sheets ────────────────────────────────────────────────────────

// Phase 3: 6-digit sequence per §2 ("INS-2026-000001"). Existing sheets
// generated under the old 3-digit format (e.g. "INS-2026-001") are never
// renumbered — this only affects newly-generated sheets going forward, so
// historical inspection numbers stay exactly as printed/recorded.
async function nextInspectionNumber(): Promise<string> {
  const count = await inspectionSheetRepo.count();
  const year = new Date().getFullYear();
  return `INS-${year}-${String(count + 1).padStart(6, "0")}`;
}

export async function getAllInspectionSheets(): Promise<InspectionSheet[]> {
  const list = await inspectionSheetRepo.getAll();
  return list.sort((a, b) => b.generatedAt - a.generatedAt);
}

/** Returns every revision belonging to the same document family, oldest
 * first — the family root is either `sheet.id` (revision 1) or
 * `sheet.documentFamilyId` (revision 2+). */
export async function getRevisionsForSheet(
  sheet: InspectionSheet,
): Promise<InspectionSheet[]> {
  const familyId = sheet.documentFamilyId ?? sheet.id;
  const all = await inspectionSheetRepo.getAll();
  return all
    .filter((s) => (s.documentFamilyId ?? s.id) === familyId)
    .sort((a, b) => a.revision - b.revision);
}

/** The project's current inspection sheet is the highest-revision row in
 * its document family — older revisions remain in the database (§3) but are
 * never returned here; use getRevisionsForSheet() to see the full history. */
export async function getInspectionSheetByProject(
  projectId: string,
): Promise<InspectionSheet | undefined> {
  const rows = await inspectionSheetRepo.queryByIndex("projectId", projectId);
  if (rows.length === 0) return undefined;
  return rows.reduce((latest, s) =>
    s.revision > latest.revision ? s : latest,
  );
}

export interface GenerateInspectionSheetInput {
  projectId: string;
  stageIds: string[];
  mode: InspectionMode;
  customerId?: string;
  drawingReference?: string;
  drawingRevision?: string;
  generatedBy: string;
  generatedByName: string;
}

export async function generateInspectionSheet(
  input: GenerateInspectionSheetInput,
): Promise<InspectionSheet> {
  const now = Date.now();
  const sheet: InspectionSheet = {
    id: crypto.randomUUID(),
    projectId: input.projectId,
    inspectionNumber: await nextInspectionNumber(),
    revision: 1,
    mode: input.mode,
    status: "Generated",
    stageIds: input.stageIds,
    customerId: input.customerId,
    drawingReference: input.drawingReference,
    drawingRevision: input.drawingRevision,
    generatedAt: now,
    generatedBy: input.generatedBy,
    createdAt: now,
    updatedAt: now,
  };
  await inspectionSheetRepo.put(sheet);

  const completions: InspectionStageCompletion[] = input.stageIds.map(
    (stageId) => ({
      id: crypto.randomUUID(),
      sheetId: sheet.id,
      stageId,
      mode: input.mode === "Paper" ? "Paper" : "Digital",
      updatedAt: now,
    }),
  );
  await inspectionStageCompletionRepo.putMany(completions);

  await logHistory(
    sheet.id,
    "Generated",
    input.generatedBy,
    input.generatedByName,
    `${input.stageIds.length} stage(s), ${input.mode} mode`,
  );
  return sheet;
}

/** Editing the stage list after the sheet has left Draft/Generated bumps
 * revision and reconciles InspectionStageCompletion rows to match. */
export async function updateInspectionSheetStages(
  sheetId: string,
  stageIds: string[],
  byUserId: string,
  byUserName: string,
): Promise<InspectionSheet> {
  const existing = await inspectionSheetRepo.getById(sheetId);
  if (!existing) throw new Error("Inspection sheet not found");
  if (isSheetLocked(existing.status)) {
    throw new Error(
      `Sheet is ${existing.status} and locked — create a new revision to change stages`,
    );
  }

  const bumpRevision = !["Draft", "Generated"].includes(existing.status);
  const updated: InspectionSheet = {
    ...existing,
    stageIds,
    revision: bumpRevision ? existing.revision + 1 : existing.revision,
    updatedAt: Date.now(),
  };
  await inspectionSheetRepo.put(updated);

  const currentCompletions = await inspectionStageCompletionRepo.queryByIndex(
    "sheetId",
    sheetId,
  );
  const now = Date.now();
  const toAdd = stageIds.filter(
    (id) => !currentCompletions.some((c) => c.stageId === id),
  );
  if (toAdd.length > 0) {
    await inspectionStageCompletionRepo.putMany(
      toAdd.map((stageId) => ({
        id: crypto.randomUUID(),
        sheetId,
        stageId,
        mode: (updated.mode === "Paper" ? "Paper" : "Digital") as
          | "Paper"
          | "Digital",
        updatedAt: now,
      })),
    );
  }

  await logHistory(
    sheetId,
    "StagesUpdated",
    byUserId,
    byUserName,
    `Now ${stageIds.length} stage(s)${bumpRevision ? ` — revision ${updated.revision}` : ""}`,
  );
  return updated;
}

export async function setInspectionSheetMode(
  sheetId: string,
  mode: InspectionMode,
  byUserId: string,
  byUserName: string,
): Promise<InspectionSheet> {
  const existing = await inspectionSheetRepo.getById(sheetId);
  if (!existing) throw new Error("Inspection sheet not found");
  if (isSheetLocked(existing.status)) {
    throw new Error(
      `Sheet is ${existing.status} and locked — create a new revision to change mode`,
    );
  }
  const updated = { ...existing, mode, updatedAt: Date.now() };
  await inspectionSheetRepo.put(updated);
  await logHistory(sheetId, "ModeChanged", byUserId, byUserName, mode);
  return updated;
}

export class IllegalTransitionError extends Error {
  constructor(from: InspectionSheetStatus, to: InspectionSheetStatus) {
    super(`Cannot move an inspection sheet from "${from}" to "${to}"`);
    this.name = "IllegalTransitionError";
  }
}

export function canTransitionStatus(
  from: InspectionSheetStatus,
  to: InspectionSheetStatus,
): boolean {
  return INSPECTION_SHEET_TRANSITIONS[from]?.includes(to) ?? false;
}

/** The single place every status change goes through — validates the
 * transition against INSPECTION_SHEET_TRANSITIONS (§5: "every transition
 * should be validated, illegal transitions should be blocked") and always
 * logs to history (§14), including transitions triggered automatically by
 * the system rather than a direct user click. */
async function transitionStatus(
  sheetId: string,
  status: InspectionSheetStatus,
  fields: Partial<InspectionSheet>,
  action: string,
  byUserId: string,
  byUserName: string,
  notes?: string,
): Promise<InspectionSheet> {
  const existing = await inspectionSheetRepo.getById(sheetId);
  if (!existing) throw new Error("Inspection sheet not found");
  if (
    existing.status !== status &&
    !canTransitionStatus(existing.status, status)
  ) {
    throw new IllegalTransitionError(existing.status, status);
  }
  const updated: InspectionSheet = {
    ...existing,
    ...fields,
    status,
    updatedAt: Date.now(),
  };
  await inspectionSheetRepo.put(updated);
  await logHistory(sheetId, action, byUserId, byUserName, notes);
  return updated;
}

export async function markPrinted(
  sheetId: string,
  byUserId: string,
  byUserName: string,
): Promise<InspectionSheet> {
  const now = Date.now();
  return transitionStatus(
    sheetId,
    "Printed",
    { printedAt: now, printedBy: byUserId },
    "Printed",
    byUserId,
    byUserName,
  );
}

export async function startInspection(
  sheetId: string,
  byUserId: string,
  byUserName: string,
): Promise<InspectionSheet> {
  return transitionStatus(
    sheetId,
    "InspectionStarted",
    {},
    "InspectionStarted",
    byUserId,
    byUserName,
  );
}

export async function markCompleted(
  sheetId: string,
  byUserId: string,
  byUserName: string,
): Promise<InspectionSheet> {
  return transitionStatus(
    sheetId,
    "Completed",
    {},
    "Completed",
    byUserId,
    byUserName,
  );
}

export async function markReviewed(
  sheetId: string,
  byUserId: string,
  byUserName: string,
  notes?: string,
): Promise<InspectionSheet> {
  const now = Date.now();
  return transitionStatus(
    sheetId,
    "Reviewed",
    { reviewedAt: now, reviewedBy: byUserId },
    "Reviewed",
    byUserId,
    byUserName,
    notes,
  );
}

export async function approveSheet(
  sheetId: string,
  byUserId: string,
  byUserName: string,
  notes?: string,
): Promise<InspectionSheet> {
  const now = Date.now();
  return transitionStatus(
    sheetId,
    "Approved",
    { approvedAt: now, approvedBy: byUserId },
    "Approved",
    byUserId,
    byUserName,
    notes,
  );
}

export async function closeSheet(
  sheetId: string,
  byUserId: string,
  byUserName: string,
): Promise<InspectionSheet> {
  const now = Date.now();
  return transitionStatus(
    sheetId,
    "Closed",
    { closedAt: now, closedBy: byUserId },
    "Closed",
    byUserId,
    byUserName,
  );
}

/** Bumps a sheet from an early status into InProgress the first time any
 * stage data is actually recorded — avoids a redundant manual "start working"
 * click on top of the explicit startInspection() action. Goes through the
 * same validated, logged transitionStatus() as every other status change. */
async function bumpToInProgressIfNeeded(sheetId: string): Promise<void> {
  const sheet = await inspectionSheetRepo.getById(sheetId);
  if (!sheet) return;
  if (["Generated", "Printed", "InspectionStarted"].includes(sheet.status)) {
    await transitionStatus(
      sheetId,
      "InProgress",
      {},
      "InProgress",
      SYSTEM_USER_ID,
      SYSTEM_USER_NAME,
      "First stage data recorded",
    );
  }
}

// ── Stage entries (structured digital checklist data) ────────────

export async function getStageEntries(
  sheetId: string,
): Promise<InspectionStageEntry[]> {
  return inspectionStageEntryRepo.queryByIndex("sheetId", sheetId);
}

export async function upsertStageEntry(
  sheetId: string,
  stageId: string,
  characteristicId: string,
  updates: {
    result?: "Pass" | "Fail" | "NA";
    measuredValue?: string;
    remarks?: string;
  },
  updatedBy: string,
): Promise<InspectionStageEntry> {
  const existingEntries = await inspectionStageEntryRepo.queryByIndex(
    "sheetId",
    sheetId,
  );
  const existing = existingEntries.find(
    (e) => e.stageId === stageId && e.characteristicId === characteristicId,
  );
  const entry: InspectionStageEntry = {
    id: existing?.id ?? crypto.randomUUID(),
    sheetId,
    stageId,
    characteristicId,
    result: updates.result ?? existing?.result,
    measuredValue: updates.measuredValue ?? existing?.measuredValue,
    remarks: updates.remarks ?? existing?.remarks,
    updatedAt: Date.now(),
    updatedBy,
  };
  await inspectionStageEntryRepo.put(entry);
  await bumpToInProgressIfNeeded(sheetId);
  return entry;
}

// ── Stage completion (per-stage mode, inspector, signature) ──────

export async function getStageCompletions(
  sheetId: string,
): Promise<InspectionStageCompletion[]> {
  return inspectionStageCompletionRepo.queryByIndex("sheetId", sheetId);
}

export async function setStageCompletionMode(
  sheetId: string,
  stageId: string,
  mode: "Paper" | "Digital",
): Promise<InspectionStageCompletion> {
  const rows = await inspectionStageCompletionRepo.queryByIndex(
    "sheetId",
    sheetId,
  );
  const existing = rows.find((r) => r.stageId === stageId);
  if (!existing) throw new Error("Stage completion not found");
  const updated = { ...existing, mode, updatedAt: Date.now() };
  await inspectionStageCompletionRepo.put(updated);
  return updated;
}

/** Records the pieces accepted/rejected at this stage — a whole-stage
 * headcount, separate from any per-characteristic Pass/Fail result. */
export async function setStageCompletionQty(
  sheetId: string,
  stageId: string,
  acceptedQty: number | undefined,
  rejectedQty: number | undefined,
): Promise<InspectionStageCompletion> {
  const rows = await inspectionStageCompletionRepo.queryByIndex(
    "sheetId",
    sheetId,
  );
  const existing = rows.find((r) => r.stageId === stageId);
  if (!existing) throw new Error("Stage completion not found");
  const updated = {
    ...existing,
    acceptedQty,
    rejectedQty,
    updatedAt: Date.now(),
  };
  await inspectionStageCompletionRepo.put(updated);
  return updated;
}

/** Once every stage is signed off (digitally signed, or a paper document
 * attached), a Paper/Hybrid sheet still needs one combined scanned document
 * uploaded — so it auto-advances to "AwaitingUpload" to make that explicit.
 * A pure-Digital sheet has no physical document to wait for, so it's left
 * at "Completed" and can go straight to "Reviewed" (see the transition
 * table in types.ts) instead of being forced through an upload step that
 * doesn't apply to it. */
async function maybeAdvanceAfterStageCompletion(
  sheetId: string,
): Promise<void> {
  const sheet = await inspectionSheetRepo.getById(sheetId);
  if (!sheet) return;
  if (
    !["InProgress", "InspectionStarted", "Completed"].includes(sheet.status)
  ) {
    return;
  }
  const completions = await inspectionStageCompletionRepo.queryByIndex(
    "sheetId",
    sheetId,
  );
  const relevant = completions.filter((c) =>
    sheet.stageIds.includes(c.stageId),
  );
  if (relevant.length === 0) return;

  const allStagesDone = relevant.every((c) =>
    c.mode === "Digital" ? !!c.signedAt : !!c.completedAt,
  );
  if (!allStagesDone) return;

  const hasPaperStages = relevant.some((c) => c.mode === "Paper");
  if (sheet.mode === "Digital" && !hasPaperStages) return; // nothing to upload — stays Completed

  if (canTransitionStatus(sheet.status, "AwaitingUpload")) {
    await transitionStatus(
      sheetId,
      "AwaitingUpload",
      {},
      "AwaitingUpload",
      SYSTEM_USER_ID,
      SYSTEM_USER_NAME,
      "All stages signed off — awaiting the combined scanned document",
    );
  }
}

export async function signStage(
  sheetId: string,
  stageId: string,
  data: { inspectorName: string; signatureDataUrl: string; remarks?: string },
  byUserId: string,
  byUserName: string,
): Promise<InspectionStageCompletion> {
  const sheet = await inspectionSheetRepo.getById(sheetId);
  if (sheet && isSheetLocked(sheet.status)) {
    throw new Error(`Sheet is ${sheet.status} and locked — cannot sign stages`);
  }
  const rows = await inspectionStageCompletionRepo.queryByIndex(
    "sheetId",
    sheetId,
  );
  const existing = rows.find((r) => r.stageId === stageId);
  if (!existing) throw new Error("Stage completion not found");
  const now = Date.now();
  const updated: InspectionStageCompletion = {
    ...existing,
    inspectorName: data.inspectorName,
    signatureDataUrl: data.signatureDataUrl,
    remarks: data.remarks ?? existing.remarks,
    signedAt: now,
    completedAt: now,
    updatedAt: now,
  };
  await inspectionStageCompletionRepo.put(updated);
  await bumpToInProgressIfNeeded(sheetId);
  await logHistory(sheetId, "StageSigned", byUserId, byUserName, stageId);
  await maybeAdvanceAfterStageCompletion(sheetId);
  return updated;
}

// ── Documents (Blob-backed, immutable, never overwritten) ────────

export async function getDocuments(
  sheetId: string,
): Promise<InspectionDocument[]> {
  const rows = await inspectionDocumentRepo.queryByIndex("sheetId", sheetId);
  return rows.sort((a, b) => b.uploadedAt - a.uploadedAt);
}

/** SHA-256 hex digest via the browser's built-in Web Crypto — no new
 * dependency needed. Lets a customer/auditor verify a downloaded copy
 * matches exactly what was originally uploaded (§10). */
async function computeChecksum(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface UploadDocumentOptions {
  stageId?: string;
  notes?: string;
  caption?: string;
  source?: "Uploaded" | "Generated";
}

export async function uploadDocument(
  sheetId: string,
  file: File,
  uploadedBy: string,
  byUserName: string,
  options: UploadDocumentOptions = {},
): Promise<InspectionDocument> {
  const sheet = await inspectionSheetRepo.getById(sheetId);
  if (!sheet) throw new Error("Inspection sheet not found");
  if (isSheetLocked(sheet.status)) {
    throw new Error(
      `Sheet is ${sheet.status} and locked — cannot upload a replacement`,
    );
  }
  const { stageId, notes, caption, source = "Uploaded" } = options;

  const now = Date.now();
  const checksum = await computeChecksum(file);
  const doc: InspectionDocument = {
    id: crypto.randomUUID(),
    sheetId,
    stageId,
    fileName: file.name,
    fileType: file.type || "application/octet-stream",
    fileSize: file.size,
    blob: file,
    uploadedAt: now,
    uploadedBy,
    notes,
    caption,
    source,
    checksum,
  };
  await inspectionDocumentRepo.put(doc);

  if (stageId) {
    const rows = await inspectionStageCompletionRepo.queryByIndex(
      "sheetId",
      sheetId,
    );
    const existing = rows.find((r) => r.stageId === stageId);
    if (existing) {
      await inspectionStageCompletionRepo.put({
        ...existing,
        completedAt: now,
        updatedAt: now,
      });
    }
  }

  if (
    !stageId &&
    source === "Uploaded" &&
    canTransitionStatus(sheet.status, "Uploaded")
  ) {
    await transitionStatus(
      sheetId,
      "Uploaded",
      { uploadedAt: now, uploadedBy },
      "Uploaded",
      uploadedBy,
      byUserName,
    );
  }

  await logHistory(
    sheetId,
    "DocumentUploaded",
    uploadedBy,
    byUserName,
    `${file.name}${stageId ? " (stage)" : " (whole sheet)"} — checksum ${checksum.slice(0, 12)}...`,
  );
  await bumpToInProgressIfNeeded(sheetId);
  await maybeAdvanceAfterStageCompletion(sheetId);
  return doc;
}

// ── Stage assignment (§6) ─────────────────────────────────────────
// Reuses InspectionStageCompletion (additive fields) and the existing
// InspectionHistoryEvent log for reassignment history — no new table.

export async function assignStage(
  sheetId: string,
  stageId: string,
  assigneeId: string,
  assigneeName: string,
  byUserId: string,
  byUserName: string,
): Promise<InspectionStageCompletion> {
  const sheet = await inspectionSheetRepo.getById(sheetId);
  if (sheet && isSheetLocked(sheet.status)) {
    throw new Error(
      `Sheet is ${sheet.status} and locked — cannot reassign stages`,
    );
  }
  const rows = await inspectionStageCompletionRepo.queryByIndex(
    "sheetId",
    sheetId,
  );
  const existing = rows.find((r) => r.stageId === stageId);
  if (!existing) throw new Error("Stage completion not found");
  const now = Date.now();
  const wasAssignedTo = existing.assignedToName;
  const updated: InspectionStageCompletion = {
    ...existing,
    assignedTo: assigneeId,
    assignedToName: assigneeName,
    assignedBy: byUserId,
    assignedAt: now,
    updatedAt: now,
  };
  await inspectionStageCompletionRepo.put(updated);
  await logHistory(
    sheetId,
    "StageAssigned",
    byUserId,
    byUserName,
    wasAssignedTo
      ? `${stageId} reassigned from ${wasAssignedTo} to ${assigneeName}`
      : `${stageId} assigned to ${assigneeName}`,
  );
  return updated;
}

/** Every InspectionStageCompletion across every sheet, joined with the
 * assignee — the raw feed the Inspector Dashboard (§7) filters down to one
 * person's view. Kept here rather than duplicated per-caller. */
export async function getAllAssignments(): Promise<
  Array<{
    sheetId: string;
    stageId: string;
    completion: InspectionStageCompletion;
  }>
> {
  const all = await inspectionStageCompletionRepo.getAll();
  return all
    .filter((c) => !!c.assignedTo)
    .map((completion) => ({
      sheetId: completion.sheetId,
      stageId: completion.stageId,
      completion,
    }));
}

/** Every InspectionStageCompletion across every sheet, unfiltered — used by
 * the Inspection Sheets search (§15) to match on inspector / assigned
 * inspector name without a per-sheet round trip per row. */
export async function getAllStageCompletions(): Promise<
  InspectionStageCompletion[]
> {
  return inspectionStageCompletionRepo.getAll();
}

// ── Revision control (§3) ─────────────────────────────────────────
// Each revision is its own InspectionSheet row (own id), linked by
// documentFamilyId + previousRevisionId — see the type-level comment in
// types.ts for why. The previous revision is left completely untouched:
// its own stage entries/completions/documents remain exactly as they were,
// permanently. The new revision starts with a fresh, empty inspection
// (only the stage list, mode, and drawing info carry forward) because it
// represents a new inspection cycle, not a copy of old results.

export async function createRevision(
  previousSheetId: string,
  reason: string,
  byUserId: string,
  byUserName: string,
): Promise<InspectionSheet> {
  const previous = await inspectionSheetRepo.getById(previousSheetId);
  if (!previous) throw new Error("Inspection sheet not found");
  if (!isSheetLocked(previous.status)) {
    throw new Error(
      "Only an Approved or Closed sheet can start a new revision",
    );
  }

  const now = Date.now();
  const familyId = previous.documentFamilyId ?? previous.id;
  const newSheet: InspectionSheet = {
    id: crypto.randomUUID(),
    projectId: previous.projectId,
    inspectionNumber: previous.inspectionNumber, // same document, new revision — number doesn't change
    revision: previous.revision + 1,
    mode: previous.mode,
    status: "Draft",
    stageIds: previous.stageIds,
    customerId: previous.customerId,
    drawingReference: previous.drawingReference,
    drawingRevision: previous.drawingRevision,
    generatedAt: now,
    generatedBy: byUserId,
    createdAt: now,
    updatedAt: now,
    documentFamilyId: familyId,
    previousRevisionId: previous.id,
    revisionReason: reason,
  };
  await inspectionSheetRepo.put(newSheet);

  const completions: InspectionStageCompletion[] = previous.stageIds.map(
    (stageId) => ({
      id: crypto.randomUUID(),
      sheetId: newSheet.id,
      stageId,
      mode: previous.mode === "Paper" ? "Paper" : "Digital",
      updatedAt: now,
    }),
  );
  await inspectionStageCompletionRepo.putMany(completions);

  await logHistory(
    previousSheetId,
    "RevisionCreated",
    byUserId,
    byUserName,
    `Revision ${revisionToLetter(newSheet.revision)} created — ${reason}`,
  );
  await logHistory(
    newSheet.id,
    "Generated",
    byUserId,
    byUserName,
    `Revision ${revisionToLetter(newSheet.revision)} of ${newSheet.inspectionNumber}, continuing from revision ${revisionToLetter(previous.revision)} — ${reason}`,
  );
  return newSheet;
}
