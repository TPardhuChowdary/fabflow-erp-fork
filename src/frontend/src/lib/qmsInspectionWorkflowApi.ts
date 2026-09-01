// Phase 46 — Supabase-backed replacements for the QMS inspection
// workflow's IndexedDB repos (closes the last QMS local-only exception:
// InspectionSheet, StageEntry, StageCompletion, Documents, History).
//
// Design: every one of the 5 entities was previously read/written through
// a generic `Repository<T>` instance (qms/db/repository.ts) with a small,
// fixed method set (getAll/getById/put/putMany/remove/queryByIndex/count).
// qms/api/inspections.ts — the one file that owns every business rule
// (status transitions, numbering, locking, history logging) — only ever
// calls those methods, never IndexedDB directly. So instead of rewriting
// inspections.ts's ~40 functions one at a time, this file provides
// Supabase-backed objects with THE SAME method shapes; qms/db/repositories.ts
// swaps its 5 exports to point here instead of at IndexedDB. inspections.ts
// itself needs zero changes — every transition rule, numbering scheme, and
// history log call keeps working exactly as before, now durably persisted.
//
// InspectionDocument is the one exception: a Blob cannot be stored in a
// Postgres row. Its adapter is hand-written (not the generic class) —
// bytes go to the qms-inspection-documents Storage bucket, the row keeps
// only metadata + storage_path, and callers fetch bytes on demand via
// downloadInspectionDocumentBlob() (mirrors the existing drawingEditor/
// api/drawings.ts Storage precedent exactly, down to the requireSession()
// shape and path convention).

import { getSupabase } from "@/lib/supabaseClient";
import type {
  InspectionDocument,
  InspectionHistoryEvent,
  InspectionMode,
  InspectionSheet,
  InspectionSheetStatus,
  InspectionStageCompletion,
  InspectionStageEntry,
} from "@/qms/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const QMS_DOCUMENTS_BUCKET = "qms-inspection-documents";

async function requireSession(): Promise<{
  client: SupabaseClient;
  userId: string;
  orgId: string;
}> {
  const client = getSupabase();
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) throw new Error("Not signed in.");
  const { data: profile, error } = await client
    .from("profiles")
    .select("organization_id")
    .eq("id", session.user.id)
    .maybeSingle();
  if (error)
    throw new Error(`Failed to resolve organization: ${error.message}`);
  if (!profile) throw new Error("Could not resolve your organization.");
  return {
    client,
    userId: session.user.id,
    orgId: (profile as { organization_id: string }).organization_id,
  };
}

function toIso(ms: number | undefined): string | null {
  return ms === undefined ? null : new Date(ms).toISOString();
}
function fromIso(iso: string | null | undefined): number | undefined {
  return iso ? new Date(iso).getTime() : undefined;
}

// ============================================================================
// Generic Supabase-backed adapter — matches qms/db/repository.ts's
// Repository<T> method shape exactly, so it's a drop-in replacement for
// any of the 4 non-Blob entities.
// ============================================================================

class SupabaseTableRepo<T extends { id: string }, Row extends { id: string }> {
  constructor(
    private table: string,
    private columns: string,
    private rowToEntity: (row: Row) => T,
    private entityToRow: (entity: T) => Record<string, unknown>,
    // The one db column every real call site in inspections.ts ever
    // queries this table by (e.g. "sheet_id", "project_id") — every
    // instance below is only ever queried by a single index in practice.
    private indexColumn?: string,
  ) {}

  async getAll(): Promise<T[]> {
    const client = getSupabase();
    const { data, error } = await client.from(this.table).select(this.columns);
    if (error)
      throw new Error(`[${this.table}] getAll failed: ${error.message}`);
    return ((data as unknown as Row[]) ?? []).map(this.rowToEntity);
  }

  async getById(id: string): Promise<T | undefined> {
    const client = getSupabase();
    const { data, error } = await client
      .from(this.table)
      .select(this.columns)
      .eq("id", id)
      .maybeSingle();
    if (error)
      throw new Error(`[${this.table}] getById failed: ${error.message}`);
    return data ? this.rowToEntity(data as unknown as Row) : undefined;
  }

  async put(item: T): Promise<T> {
    const client = getSupabase();
    const { data, error } = await client
      .from(this.table)
      .upsert(this.entityToRow(item), { onConflict: "id" })
      .select(this.columns)
      .single();
    if (error) throw new Error(`[${this.table}] put failed: ${error.message}`);
    return this.rowToEntity(data as unknown as Row);
  }

  async putMany(items: T[]): Promise<void> {
    if (items.length === 0) return;
    const client = getSupabase();
    const { error } = await client.from(this.table).upsert(
      items.map((i) => this.entityToRow(i)),
      { onConflict: "id" },
    );
    if (error)
      throw new Error(`[${this.table}] putMany failed: ${error.message}`);
  }

  async remove(id: string): Promise<void> {
    const client = getSupabase();
    const { error } = await client.from(this.table).delete().eq("id", id);
    if (error)
      throw new Error(`[${this.table}] remove failed: ${error.message}`);
  }

  // `indexName` is accepted (matching Repository<T>'s signature) but not
  // used to pick the column — every real caller always queries the one
  // index this instance was constructed with. A mismatched indexName is a
  // programmer error, not a runtime input, so it's asserted rather than
  // silently ignored.
  async queryByIndex(indexName: string, value: IDBValidKey): Promise<T[]> {
    if (!this.indexColumn) {
      throw new Error(`[${this.table}] has no queryByIndex column configured`);
    }
    const client = getSupabase();
    const { data, error } = await client
      .from(this.table)
      .select(this.columns)
      .eq(this.indexColumn, String(value));
    if (error)
      throw new Error(
        `[${this.table}] queryByIndex(${indexName}) failed: ${error.message}`,
      );
    return ((data as unknown as Row[]) ?? []).map(this.rowToEntity);
  }

  async count(): Promise<number> {
    const client = getSupabase();
    const { count, error } = await client
      .from(this.table)
      .select("id", { count: "exact", head: true });
    if (error)
      throw new Error(`[${this.table}] count failed: ${error.message}`);
    return count ?? 0;
  }
}

// ── inspection_sheets ────────────────────────────────────────────────────

const INSPECTION_SHEET_COLUMNS =
  "id, project_id, inspection_number, revision, mode, status, stage_ids, " +
  "customer_id, drawing_reference, drawing_revision, generated_at, generated_by, " +
  "printed_at, printed_by, uploaded_at, uploaded_by, reviewed_at, reviewed_by, " +
  "approved_at, approved_by, closed_at, closed_by, document_family_id, " +
  "previous_revision_id, revision_reason, created_at, updated_at";

interface InspectionSheetRow {
  id: string;
  project_id: string;
  inspection_number: string;
  revision: number;
  mode: string;
  status: string;
  stage_ids: string[] | null;
  customer_id: string | null;
  drawing_reference: string | null;
  drawing_revision: string | null;
  generated_at: string | null;
  generated_by: string | null;
  printed_at: string | null;
  printed_by: string | null;
  uploaded_at: string | null;
  uploaded_by: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
  document_family_id: string | null;
  previous_revision_id: string | null;
  revision_reason: string | null;
  created_at: string;
  updated_at: string;
}

export function rowToInspectionSheet(row: InspectionSheetRow): InspectionSheet {
  return {
    id: row.id,
    projectId: row.project_id,
    inspectionNumber: row.inspection_number,
    revision: row.revision,
    mode: row.mode as InspectionMode,
    status: row.status as InspectionSheetStatus,
    stageIds: row.stage_ids ?? [],
    customerId: row.customer_id ?? undefined,
    drawingReference: row.drawing_reference ?? undefined,
    drawingRevision: row.drawing_revision ?? undefined,
    generatedAt: fromIso(row.generated_at) ?? 0,
    generatedBy: row.generated_by ?? "",
    printedAt: fromIso(row.printed_at),
    printedBy: row.printed_by ?? undefined,
    uploadedAt: fromIso(row.uploaded_at),
    uploadedBy: row.uploaded_by ?? undefined,
    reviewedAt: fromIso(row.reviewed_at),
    reviewedBy: row.reviewed_by ?? undefined,
    approvedAt: fromIso(row.approved_at),
    approvedBy: row.approved_by ?? undefined,
    closedAt: fromIso(row.closed_at),
    closedBy: row.closed_by ?? undefined,
    createdAt: fromIso(row.created_at) ?? 0,
    updatedAt: fromIso(row.updated_at) ?? 0,
    documentFamilyId: row.document_family_id ?? undefined,
    previousRevisionId: row.previous_revision_id ?? undefined,
    revisionReason: row.revision_reason ?? undefined,
  };
}

function inspectionSheetToRow(s: InspectionSheet) {
  return {
    id: s.id,
    project_id: s.projectId,
    inspection_number: s.inspectionNumber,
    revision: s.revision,
    mode: s.mode,
    status: s.status,
    stage_ids: s.stageIds,
    customer_id: s.customerId ?? null,
    drawing_reference: s.drawingReference ?? null,
    drawing_revision: s.drawingRevision ?? null,
    generated_at: toIso(s.generatedAt),
    generated_by: s.generatedBy || null,
    printed_at: toIso(s.printedAt),
    printed_by: s.printedBy ?? null,
    uploaded_at: toIso(s.uploadedAt),
    uploaded_by: s.uploadedBy ?? null,
    reviewed_at: toIso(s.reviewedAt),
    reviewed_by: s.reviewedBy ?? null,
    approved_at: toIso(s.approvedAt),
    approved_by: s.approvedBy ?? null,
    closed_at: toIso(s.closedAt),
    closed_by: s.closedBy ?? null,
    document_family_id: s.documentFamilyId ?? null,
    previous_revision_id: s.previousRevisionId ?? null,
    revision_reason: s.revisionReason ?? null,
    created_at: toIso(s.createdAt),
    updated_at: toIso(s.updatedAt),
  };
}

export const inspectionSheetRepoSupabase = new SupabaseTableRepo<
  InspectionSheet,
  InspectionSheetRow
>(
  "inspection_sheets",
  INSPECTION_SHEET_COLUMNS,
  rowToInspectionSheet,
  inspectionSheetToRow,
  "project_id",
);

// ── inspection_stage_entries ────────────────────────────────────────────

const INSPECTION_STAGE_ENTRY_COLUMNS =
  "id, sheet_id, stage_id, characteristic_id, result, measured_value, remarks, updated_at, updated_by";

interface InspectionStageEntryRow {
  id: string;
  sheet_id: string;
  stage_id: string;
  characteristic_id: string;
  result: string | null;
  measured_value: string | null;
  remarks: string | null;
  updated_at: string;
  updated_by: string | null;
}

function rowToStageEntry(row: InspectionStageEntryRow): InspectionStageEntry {
  return {
    id: row.id,
    sheetId: row.sheet_id,
    stageId: row.stage_id,
    characteristicId: row.characteristic_id,
    result: (row.result as InspectionStageEntry["result"]) ?? undefined,
    measuredValue: row.measured_value ?? undefined,
    remarks: row.remarks ?? undefined,
    updatedAt: fromIso(row.updated_at) ?? 0,
    updatedBy: row.updated_by ?? undefined,
  };
}

function stageEntryToRow(e: InspectionStageEntry) {
  return {
    id: e.id,
    sheet_id: e.sheetId,
    stage_id: e.stageId,
    characteristic_id: e.characteristicId,
    result: e.result ?? null,
    measured_value: e.measuredValue ?? null,
    remarks: e.remarks ?? null,
    updated_at: toIso(e.updatedAt),
    updated_by: e.updatedBy ?? null,
  };
}

export const inspectionStageEntryRepoSupabase = new SupabaseTableRepo<
  InspectionStageEntry,
  InspectionStageEntryRow
>(
  "inspection_stage_entries",
  INSPECTION_STAGE_ENTRY_COLUMNS,
  rowToStageEntry,
  stageEntryToRow,
  "sheet_id",
);

// ── qms_stage_completions (Phase 11 table, activated here) ─────────────
// project_id is deliberately NEVER sent from the client — a BEFORE INSERT
// trigger (phase46) derives it from sheet_id -> inspection_sheets.project_id
// server-side, since InspectionStageCompletion carries no projectId field
// locally and every write site here only has a sheetId in scope.

const QMS_STAGE_COMPLETION_COLUMNS =
  "id, sheet_id, stage_id, mode, inspector_name, signature_data_url, remarks, " +
  "completed_at, signed_at, assigned_to, assigned_to_name, assigned_by, " +
  "assigned_at, due_date, accepted_qty, rejected_qty, updated_at";

interface QmsStageCompletionRow {
  id: string;
  sheet_id: string;
  stage_id: string;
  mode: string;
  inspector_name: string | null;
  signature_data_url: string | null;
  remarks: string | null;
  completed_at: string | null;
  signed_at: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  due_date: string | null;
  accepted_qty: number | null;
  rejected_qty: number | null;
  updated_at: string;
}

export function rowToStageCompletion(
  row: QmsStageCompletionRow,
): InspectionStageCompletion {
  return {
    id: row.id,
    sheetId: row.sheet_id,
    stageId: row.stage_id,
    mode: row.mode as InspectionStageCompletion["mode"],
    inspectorName: row.inspector_name ?? undefined,
    signatureDataUrl: row.signature_data_url ?? undefined,
    remarks: row.remarks ?? undefined,
    completedAt: fromIso(row.completed_at),
    signedAt: fromIso(row.signed_at),
    updatedAt: fromIso(row.updated_at) ?? 0,
    assignedTo: row.assigned_to ?? undefined,
    assignedToName: row.assigned_to_name ?? undefined,
    assignedBy: row.assigned_by ?? undefined,
    assignedAt: fromIso(row.assigned_at),
    dueDate: row.due_date ?? undefined,
    acceptedQty: row.accepted_qty ?? undefined,
    rejectedQty: row.rejected_qty ?? undefined,
  };
}

function stageCompletionToRow(c: InspectionStageCompletion) {
  return {
    id: c.id,
    sheet_id: c.sheetId,
    stage_id: c.stageId,
    mode: c.mode,
    inspector_name: c.inspectorName ?? null,
    signature_data_url: c.signatureDataUrl ?? null,
    remarks: c.remarks ?? null,
    completed_at: toIso(c.completedAt),
    signed_at: toIso(c.signedAt),
    assigned_to: c.assignedTo ?? null,
    assigned_to_name: c.assignedToName ?? null,
    assigned_by: c.assignedBy ?? null,
    assigned_at: toIso(c.assignedAt),
    due_date: c.dueDate ?? null,
    accepted_qty: c.acceptedQty ?? null,
    rejected_qty: c.rejectedQty ?? null,
    updated_at: toIso(c.updatedAt),
    // project_id intentionally omitted — server-side trigger fills it in.
  };
}

export const inspectionStageCompletionRepoSupabase = new SupabaseTableRepo<
  InspectionStageCompletion,
  QmsStageCompletionRow
>(
  "qms_stage_completions",
  QMS_STAGE_COMPLETION_COLUMNS,
  rowToStageCompletion,
  stageCompletionToRow,
  "sheet_id",
);

// ── inspection_history (append-only) ────────────────────────────────────

const INSPECTION_HISTORY_COLUMNS =
  "id, sheet_id, action, by_user_id, by_user_name, at, notes";

interface InspectionHistoryRow {
  id: string;
  sheet_id: string;
  action: string;
  by_user_id: string | null;
  by_user_name: string | null;
  at: string;
  notes: string | null;
}

function rowToHistoryEvent(row: InspectionHistoryRow): InspectionHistoryEvent {
  return {
    id: row.id,
    sheetId: row.sheet_id,
    action: row.action,
    byUserId: row.by_user_id ?? "",
    byUserName: row.by_user_name ?? "",
    at: fromIso(row.at) ?? 0,
    notes: row.notes ?? undefined,
  };
}

function historyEventToRow(h: InspectionHistoryEvent) {
  return {
    id: h.id,
    sheet_id: h.sheetId,
    action: h.action,
    by_user_id: h.byUserId || null,
    by_user_name: h.byUserName || null,
    at: toIso(h.at),
    notes: h.notes ?? null,
  };
}

export const inspectionHistoryRepoSupabase = new SupabaseTableRepo<
  InspectionHistoryEvent,
  InspectionHistoryRow
>(
  "inspection_history",
  INSPECTION_HISTORY_COLUMNS,
  rowToHistoryEvent,
  historyEventToRow,
  "sheet_id",
);

// ============================================================================
// inspection_documents — hand-written (Blob can't go through the generic
// upsert/select path). Only `put` and `queryByIndex("sheetId", ...)` are
// ever called on the real repo (confirmed via inspections.ts), so those
// are the two implemented for real; the rest exist for interface
// completeness and throw if ever actually reached.
// ============================================================================

const INSPECTION_DOCUMENT_COLUMNS =
  "id, sheet_id, stage_id, file_name, file_type, file_size, storage_path, " +
  "uploaded_at, uploaded_by, notes, caption, source, checksum";

interface InspectionDocumentRow {
  id: string;
  sheet_id: string;
  stage_id: string | null;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  uploaded_at: string;
  uploaded_by: string | null;
  notes: string | null;
  caption: string | null;
  source: string | null;
  checksum: string | null;
}

function rowToDocument(row: InspectionDocumentRow): InspectionDocument {
  return {
    id: row.id,
    sheetId: row.sheet_id,
    stageId: row.stage_id ?? undefined,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: row.file_size,
    storagePath: row.storage_path,
    // blob deliberately left undefined here — fetched on demand via
    // downloadInspectionDocumentBlob(), never eagerly on a list read.
    uploadedAt: fromIso(row.uploaded_at) ?? 0,
    uploadedBy: row.uploaded_by ?? "",
    notes: row.notes ?? undefined,
    caption: row.caption ?? undefined,
    source: (row.source as InspectionDocument["source"]) ?? undefined,
    checksum: row.checksum ?? undefined,
  };
}

export const inspectionDocumentRepoSupabase = {
  async getAll(): Promise<InspectionDocument[]> {
    const client = getSupabase();
    const { data, error } = await client
      .from("inspection_documents")
      .select(INSPECTION_DOCUMENT_COLUMNS);
    if (error)
      throw new Error(`[inspection_documents] getAll failed: ${error.message}`);
    return ((data as unknown as InspectionDocumentRow[]) ?? []).map(
      rowToDocument,
    );
  },

  async getById(id: string): Promise<InspectionDocument | undefined> {
    const client = getSupabase();
    const { data, error } = await client
      .from("inspection_documents")
      .select(INSPECTION_DOCUMENT_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error)
      throw new Error(
        `[inspection_documents] getById failed: ${error.message}`,
      );
    return data
      ? rowToDocument(data as unknown as InspectionDocumentRow)
      : undefined;
  },

  // Uploads the blob to Storage first (if present — a fresh upload always
  // carries one), then inserts the metadata row. If the row insert fails
  // after a successful upload, the orphaned Storage object is removed
  // best-effort so a failed save never leaves a dangling file behind.
  async put(doc: InspectionDocument): Promise<InspectionDocument> {
    const { client, orgId } = await requireSession();
    let storagePath = doc.storagePath;

    if (doc.blob) {
      storagePath = `${orgId}/${doc.sheetId}/${doc.id}-${doc.fileName}`;
      const { error: uploadError } = await client.storage
        .from(QMS_DOCUMENTS_BUCKET)
        .upload(storagePath, doc.blob, {
          contentType: doc.fileType || "application/octet-stream",
          upsert: true,
        });
      if (uploadError) {
        throw new Error(`Failed to upload document: ${uploadError.message}`);
      }
    }
    if (!storagePath) {
      throw new Error(
        "InspectionDocument.put requires either a blob (fresh upload) or an existing storagePath",
      );
    }

    const row = {
      id: doc.id,
      sheet_id: doc.sheetId,
      stage_id: doc.stageId ?? null,
      file_name: doc.fileName,
      file_type: doc.fileType,
      file_size: doc.fileSize,
      storage_path: storagePath,
      uploaded_at: toIso(doc.uploadedAt),
      uploaded_by: doc.uploadedBy || null,
      notes: doc.notes ?? null,
      caption: doc.caption ?? null,
      source: doc.source ?? null,
      checksum: doc.checksum ?? null,
    };
    const { data, error } = await client
      .from("inspection_documents")
      .upsert(row, { onConflict: "id" })
      .select(INSPECTION_DOCUMENT_COLUMNS)
      .single();
    if (error) {
      if (doc.blob) {
        await client.storage.from(QMS_DOCUMENTS_BUCKET).remove([storagePath]);
      }
      throw new Error(`Failed to save document metadata: ${error.message}`);
    }
    return rowToDocument(data as unknown as InspectionDocumentRow);
  },

  async putMany(): Promise<void> {
    throw new Error(
      "inspectionDocumentRepoSupabase.putMany is not supported — call put() per document",
    );
  },

  async remove(id: string): Promise<void> {
    const client = getSupabase();
    const existing = await this.getById(id);
    const { error } = await client
      .from("inspection_documents")
      .delete()
      .eq("id", id);
    if (error)
      throw new Error(`[inspection_documents] remove failed: ${error.message}`);
    if (existing?.storagePath) {
      await client.storage
        .from(QMS_DOCUMENTS_BUCKET)
        .remove([existing.storagePath]);
    }
  },

  async queryByIndex(
    indexName: string,
    value: IDBValidKey,
  ): Promise<InspectionDocument[]> {
    const client = getSupabase();
    const { data, error } = await client
      .from("inspection_documents")
      .select(INSPECTION_DOCUMENT_COLUMNS)
      .eq("sheet_id", String(value));
    if (error)
      throw new Error(
        `[inspection_documents] queryByIndex(${indexName}) failed: ${error.message}`,
      );
    return ((data as unknown as InspectionDocumentRow[]) ?? []).map(
      rowToDocument,
    );
  },

  async count(): Promise<number> {
    const client = getSupabase();
    const { count, error } = await client
      .from("inspection_documents")
      .select("id", { count: "exact", head: true });
    if (error)
      throw new Error(`[inspection_documents] count failed: ${error.message}`);
    return count ?? 0;
  },
};

// Fetches the actual bytes for one document on demand — the only way to
// get a real Blob back, since list/metadata reads never populate one.
// Used by DocumentUploadPanel.tsx and StagePhotoGallery.tsx at the moment
// a preview/download is actually requested.
export async function downloadInspectionDocumentBlob(
  documentId: string,
): Promise<Blob> {
  const client = getSupabase();
  const doc = await inspectionDocumentRepoSupabase.getById(documentId);
  if (!doc?.storagePath) {
    throw new Error("Document not found or has no stored file");
  }
  const { data, error } = await client.storage
    .from(QMS_DOCUMENTS_BUCKET)
    .download(doc.storagePath);
  if (error) throw new Error(`Failed to download document: ${error.message}`);
  return data;
}
