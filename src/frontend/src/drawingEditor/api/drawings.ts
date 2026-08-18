// Phase 14 — Supabase-backed. Was IndexedDB (fabflow-drawing-editor);
// see database/phase-14/phase14_drawing_repository_FINAL.sql for the
// schema this now reads/writes, and drawingEditor/db/database.ts (kept,
// dormant) for the old local store this replaces as the source of truth.
// Same seam pattern as qms/api/*.ts — pure async functions the Zustand
// store and 2 pages call through; every exported function signature and
// return shape is preserved from the IndexedDB version EXCEPT the two
// disclosed deviations below, both load-bearing on how a PDF's bytes move
// through Supabase Storage instead of an in-memory IndexedDB blob:
//
// 1. DrawingDocument.pdfBlob is now optional (types.ts). List/lookup
//    functions (getAllDrawings, getDrawingsByProject, getDrawingsByOwner,
//    getChildDrawings, findMasterDrawingBySourceDesignFile,
//    findWorkingDrawingByOriginal) return drawings with pdfBlob absent —
//    fetching every PDF just to render a list/tree row would defeat the
//    entire point of moving blobs out of memory and into Storage. Only
//    getDrawing(id) (single-drawing fetch) and the new getDrawingPdfBlob(id)
//    helper actually download bytes. The 3 real call sites that used to
//    read `.pdfBlob` off a list-sourced row (DrawingEditorPage.openDrawing,
//    DrawingEditorPage.handlePreviewOriginal, and the store's
//    findOrCreateWorkingDrawing) were updated to fetch on demand instead —
//    see those files' own comments at the call sites.
// 2. CreateWorkingDrawingInput no longer takes a `pdfBlob` field.
//    createWorkingDrawing (Repository Original -> hidden Working Drawing)
//    and duplicateDrawing (Rev A -> Rev B / "Save as Production Drawing")
//    both need to give a *new* drawing row its own Storage object holding
//    the *same* bytes as an existing one — done via a server-side
//    storage.copy(), never by downloading to the browser and re-uploading.
//    uploadDrawing and promoteDesignFileToMasterDrawing are unaffected:
//    both already receive a genuinely new Blob from the caller (a fresh
//    upload), which still must be uploaded, so their input shapes are
//    unchanged.

import { getSupabase } from "@/lib/supabaseClient";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DrawingDocument,
  DrawingLink,
  DrawingView,
  EditorMode,
  TitleBlockFields,
  UserEditorPreference,
} from "../types";

const DRAWINGS_BUCKET = "engineering-drawings";

// ── Row shapes (snake_case, as returned by PostgREST) ────────────────

interface DrawingRow {
  id: string;
  organization_id: string;
  file_name: string;
  storage_path: string;
  num_pages: number;
  project_id: string | null;
  owner_type: string | null;
  owner_id: string | null;
  uploaded_by: string | null;
  uploaded_by_name: string;
  category: string | null;
  notes: string | null;
  tags: string[] | null;
  parent_drawing_id: string | null;
  source_design_file_id: string | null;
  original_drawing_id: string | null;
  /** Phase 34 — see DrawingDocument.sourceKind. Optional on the row type
   * only so any code path that doesn't SELECT it (there shouldn't be any
   * after this phase, but defensively) still compiles; the DB column
   * itself is `not null default 'pdf'`. */
  source_kind?: string | null;
  created_at: string;
  updated_at: string;
}

interface DrawingViewRow {
  id: string;
  drawing_id: string;
  page_number: number;
  crop_rect: DrawingView["cropRect"];
  editor_mode: string;
  fabric_json: unknown;
  canvas_width: number | null;
  canvas_height: number | null;
  title_block: TitleBlockFields;
  created_by: string | null;
  created_by_name: string;
  export_count: number;
  created_at: string;
  updated_at: string;
}

interface DrawingLinkRow {
  id: string;
  drawing_id: string;
  linked_type: string;
  linked_id: string;
  created_at: string;
}

interface UserPreferenceRow {
  id: string;
  remembered_mode: string | null;
  last_project_id: string | null;
  updated_at: string;
}

// ── Row -> domain mapping ──────────────────────────────────────────

function rowToDrawing(
  row: DrawingRow,
  opts?: { pdfBlob?: Blob },
): DrawingDocument {
  return {
    id: row.id,
    fileName: row.file_name,
    pdfBlob: opts?.pdfBlob,
    numPages: row.num_pages,
    projectId: row.project_id ?? undefined,
    ownerType: (row.owner_type as DrawingDocument["ownerType"]) ?? undefined,
    ownerId: row.owner_id ?? undefined,
    uploadedBy: row.uploaded_by ?? "",
    uploadedByName: row.uploaded_by_name,
    uploadedAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    notes: row.notes ?? undefined,
    tags: row.tags ?? undefined,
    category: (row.category as DrawingDocument["category"]) ?? undefined,
    parentDrawingId: row.parent_drawing_id ?? undefined,
    sourceDesignFileId: row.source_design_file_id ?? undefined,
    originalDrawingId: row.original_drawing_id ?? undefined,
    sourceKind: (row.source_kind as DrawingDocument["sourceKind"]) ?? undefined,
  };
}

function rowToView(row: DrawingViewRow): DrawingView {
  return {
    id: row.id,
    drawingId: row.drawing_id,
    pageNumber: row.page_number,
    cropRect: row.crop_rect,
    editorMode: row.editor_mode as EditorMode,
    // fabric_json is stored as native jsonb (an object); the frontend
    // type has always been the JSON.stringify'd string form (what
    // fabric.Canvas.loadFromJSON expects) — re-serialize on the way out
    // so every existing caller keeps working unmodified.
    fabricJSON: JSON.stringify(row.fabric_json),
    canvasWidth: row.canvas_width ?? undefined,
    canvasHeight: row.canvas_height ?? undefined,
    titleBlock: row.title_block,
    createdBy: row.created_by ?? "",
    createdByName: row.created_by_name,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    exportCount: row.export_count,
  };
}

function rowToLink(row: DrawingLinkRow): DrawingLink {
  return {
    id: row.id,
    drawingId: row.drawing_id,
    linkedType: row.linked_type as DrawingLink["linkedType"],
    linkedId: row.linked_id,
    createdAt: new Date(row.created_at).getTime(),
  };
}

function rowToPreference(row: UserPreferenceRow): UserEditorPreference {
  return {
    id: row.id,
    userId: row.id,
    rememberedMode: (row.remembered_mode as EditorMode | null) ?? undefined,
    lastProjectId: row.last_project_id ?? undefined,
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

// ── Session / organization resolution (only needed by functions that
// construct a brand-new Storage path, i.e. ones creating a new object) ──

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

// ── Storage helpers ──────────────────────────────────────────────────

async function uploadPdfObject(
  client: SupabaseClient,
  orgId: string,
  drawingId: string,
  fileName: string,
  blob: Blob,
): Promise<string> {
  const path = `${orgId}/${drawingId}/${fileName}`;
  const { error } = await client.storage
    .from(DRAWINGS_BUCKET)
    .upload(path, blob, {
      contentType: blob.type || "application/pdf",
      upsert: false,
    });
  if (error) throw new Error(`Failed to upload PDF: ${error.message}`);
  return path;
}

async function downloadPdfObject(
  client: SupabaseClient,
  path: string,
): Promise<Blob> {
  const { data, error } = await client.storage
    .from(DRAWINGS_BUCKET)
    .download(path);
  if (error) throw new Error(`Failed to download PDF: ${error.message}`);
  return data;
}

/** Server-side copy — never downloads bytes to the browser just to
 * re-upload them. Used by createWorkingDrawing (Original -> hidden
 * Working Drawing) and duplicateDrawing (Rev A -> Rev B). */
async function copyPdfObject(
  client: SupabaseClient,
  fromPath: string,
  toPath: string,
): Promise<void> {
  const { error } = await client.storage
    .from(DRAWINGS_BUCKET)
    .copy(fromPath, toPath);
  if (error) throw new Error(`Failed to copy PDF: ${error.message}`);
}

async function removePdfObjectBestEffort(
  client: SupabaseClient,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await client.storage.from(DRAWINGS_BUCKET).remove(paths);
  if (error) {
    // Never surfaced as a thrown error — used only to roll back a
    // just-uploaded object after a subsequent DB insert failed, or to
    // clean up after a DB row is already gone. Either way the primary
    // operation's own result has already been decided; a Storage
    // cleanup failure here is logged, not hidden, but must not mask the
    // primary operation's actual outcome.
    console.error(
      `Storage cleanup failed for [${paths.join(", ")}]: ${error.message}`,
    );
  }
}

// ── Reads ─────────────────────────────────────────────────────────────

export async function getAllDrawings(): Promise<DrawingDocument[]> {
  const client = getSupabase();
  const { data, error } = await client
    .from("drawings")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load drawings: ${error.message}`);
  return ((data as DrawingRow[]) ?? []).map((r) => rowToDrawing(r));
}

export async function getDrawingsByProject(
  projectId: string,
): Promise<DrawingDocument[]> {
  const client = getSupabase();
  const { data, error } = await client
    .from("drawings")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load drawings: ${error.message}`);
  return ((data as DrawingRow[]) ?? []).map((r) => rowToDrawing(r));
}

/** Entity-owned drawings (project or machine) via owner_id. "library"
 * drawings have no single ownerId — they're browsed by category over the
 * full list instead, same as the rest of this module's filtering. */
export async function getDrawingsByOwner(
  ownerType: "project" | "machine",
  ownerId: string,
): Promise<DrawingDocument[]> {
  const client = getSupabase();
  const { data, error } = await client
    .from("drawings")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("owner_type", ownerType)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load drawings: ${error.message}`);
  return ((data as DrawingRow[]) ?? []).map((r) => rowToDrawing(r));
}

/** The only list/lookup function that eagerly fetches the PDF — every
 * other read here returns pdfBlob absent (see file header). */
export async function getDrawing(
  id: string,
): Promise<DrawingDocument | undefined> {
  const client = getSupabase();
  const { data, error } = await client
    .from("drawings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load drawing: ${error.message}`);
  if (!data) return undefined;
  const row = data as DrawingRow;
  const pdfBlob = await downloadPdfObject(client, row.storage_path);
  return rowToDrawing(row, { pdfBlob });
}

/** New — lets a caller holding only a list-sourced DrawingDocument (no
 * pdfBlob) fetch the actual bytes on demand, without re-fetching the
 * whole row. See file header, deviation 1. */
export async function getDrawingPdfBlob(id: string): Promise<Blob> {
  const client = getSupabase();
  const { data, error } = await client
    .from("drawings")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to resolve drawing: ${error.message}`);
  if (!data) throw new Error(`Drawing ${id} not found`);
  return downloadPdfObject(
    client,
    (data as { storage_path: string }).storage_path,
  );
}

export interface UploadDrawingInput {
  fileName: string;
  pdfBlob: Blob;
  numPages: number;
  uploadedBy: string;
  uploadedByName: string;
  /** Project-owned upload — kept as its own field for backward
   * compatibility; also mirrored into ownerType/ownerId below. */
  projectId?: string;
  ownerType?: "project" | "machine" | "library";
  ownerId?: string;
  category?: DrawingDocument["category"];
}

export async function uploadDrawing(
  input: UploadDrawingInput,
): Promise<DrawingDocument> {
  const { client, orgId } = await requireSession();
  const id = crypto.randomUUID();
  const ownerType =
    input.ownerType ?? (input.projectId ? "project" : undefined);
  const ownerId = input.ownerId ?? input.projectId;
  const storagePath = await uploadPdfObject(
    client,
    orgId,
    id,
    input.fileName,
    input.pdfBlob,
  );
  const { data, error } = await client
    .from("drawings")
    .insert({
      id,
      file_name: input.fileName,
      storage_path: storagePath,
      num_pages: input.numPages,
      project_id:
        ownerType === "project" ? (ownerId ?? null) : (input.projectId ?? null),
      owner_type: ownerType ?? null,
      owner_id: ownerId ?? null,
      category: input.category ?? null,
      uploaded_by: input.uploadedBy || null,
      uploaded_by_name: input.uploadedByName,
    })
    .select()
    .single();
  if (error) {
    await removePdfObjectBestEffort(client, [storagePath]);
    throw new Error(`Failed to create drawing: ${error.message}`);
  }
  return rowToDrawing(data as DrawingRow, { pdfBlob: input.pdfBlob });
}

// ── Design File promotion (Master Drawing) ──────────────────────────
//
// A Project's "Design Files" (main ERP store, local-only, not Supabase-
// backed) are a different system from this module's DrawingDocuments.
// Promotion bridges them without merging the two: the original DesignFile
// row is never read back into or written from here again after creation.

export async function findMasterDrawingBySourceDesignFile(
  sourceDesignFileId: string,
): Promise<DrawingDocument | undefined> {
  const client = getSupabase();
  const { data, error } = await client
    .from("drawings")
    .select("*")
    .eq("source_design_file_id", sourceDesignFileId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to look up Master Drawing: ${error.message}`);
  }
  return data ? rowToDrawing(data as DrawingRow) : undefined;
}

export interface PromoteDesignFileInput {
  sourceDesignFileId: string;
  fileName: string;
  pdfBlob: Blob;
  numPages: number;
  uploadedBy: string;
  uploadedByName: string;
  projectId?: string;
  ownerType?: "project" | "machine" | "library";
  ownerId?: string;
  category?: DrawingDocument["category"];
  /** Phase 34 — defaults to "pdf" (unchanged behavior) when omitted. */
  sourceKind?: DrawingDocument["sourceKind"];
}

/** Creates the one-time editable Master Drawing for a DesignFile. Callers
 * must check findMasterDrawingBySourceDesignFile() first — this function
 * always creates a new row and does not itself de-duplicate. */
export async function promoteDesignFileToMasterDrawing(
  input: PromoteDesignFileInput,
): Promise<DrawingDocument> {
  const { client, orgId } = await requireSession();
  const id = crypto.randomUUID();
  const ownerType =
    input.ownerType ?? (input.projectId ? "project" : undefined);
  const ownerId = input.ownerId ?? input.projectId;
  const storagePath = await uploadPdfObject(
    client,
    orgId,
    id,
    input.fileName,
    input.pdfBlob,
  );
  const { data, error } = await client
    .from("drawings")
    .insert({
      id,
      file_name: input.fileName,
      storage_path: storagePath,
      num_pages: input.numPages,
      project_id:
        ownerType === "project" ? (ownerId ?? null) : (input.projectId ?? null),
      owner_type: ownerType ?? null,
      owner_id: ownerId ?? null,
      category: input.category ?? null,
      uploaded_by: input.uploadedBy || null,
      uploaded_by_name: input.uploadedByName,
      source_design_file_id: input.sourceDesignFileId,
      source_kind: input.sourceKind ?? "pdf",
    })
    .select()
    .single();
  if (error) {
    await removePdfObjectBestEffort(client, [storagePath]);
    throw new Error(`Failed to create Master Drawing: ${error.message}`);
  }
  return rowToDrawing(data as DrawingRow, { pdfBlob: input.pdfBlob });
}

// ── Repository Original -> Working Drawing ────────────────────────────

export async function findWorkingDrawingByOriginal(
  originalDrawingId: string,
): Promise<DrawingDocument | undefined> {
  const client = getSupabase();
  const { data, error } = await client
    .from("drawings")
    .select("*")
    .eq("original_drawing_id", originalDrawingId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to look up Working Drawing: ${error.message}`);
  }
  return data ? rowToDrawing(data as DrawingRow) : undefined;
}

export interface CreateWorkingDrawingInput {
  originalDrawingId: string;
  fileName: string;
  numPages: number;
  uploadedBy: string;
  uploadedByName: string;
  projectId?: string;
  ownerType?: "project" | "machine" | "library";
  ownerId?: string;
  category?: DrawingDocument["category"];
}

/** Creates the one-time hidden Working Drawing for a Repository Original,
 * via a server-side Storage copy of the Original's own PDF object — see
 * file header, deviation 2. Callers must check
 * findWorkingDrawingByOriginal() first — this always creates a new row
 * and does not itself de-duplicate. */
export async function createWorkingDrawing(
  input: CreateWorkingDrawingInput,
): Promise<DrawingDocument> {
  const { client, orgId } = await requireSession();
  const { data: originalRow, error: originalError } = await client
    .from("drawings")
    .select("storage_path")
    .eq("id", input.originalDrawingId)
    .maybeSingle();
  if (originalError) {
    throw new Error(
      `Failed to resolve Original drawing: ${originalError.message}`,
    );
  }
  if (!originalRow)
    throw new Error(`Drawing ${input.originalDrawingId} not found`);

  const id = crypto.randomUUID();
  const storagePath = `${orgId}/${id}/${input.fileName}`;
  await copyPdfObject(
    client,
    (originalRow as { storage_path: string }).storage_path,
    storagePath,
  );

  const { data, error } = await client
    .from("drawings")
    .insert({
      id,
      file_name: input.fileName,
      storage_path: storagePath,
      num_pages: input.numPages,
      project_id:
        input.ownerType === "project"
          ? (input.ownerId ?? null)
          : (input.projectId ?? null),
      owner_type: input.ownerType ?? null,
      owner_id: input.ownerId ?? null,
      category: input.category ?? null,
      uploaded_by: input.uploadedBy || null,
      uploaded_by_name: input.uploadedByName,
      original_drawing_id: input.originalDrawingId,
    })
    .select()
    .single();
  if (error) {
    await removePdfObjectBestEffort(client, [storagePath]);
    throw new Error(`Failed to create Working Drawing: ${error.message}`);
  }
  return rowToDrawing(data as DrawingRow);
}

// ── Parent-child (Production Drawings) ──────────────────────────────

export async function getChildDrawings(
  parentDrawingId: string,
): Promise<DrawingDocument[]> {
  const client = getSupabase();
  const { data, error } = await client
    .from("drawings")
    .select("*")
    .eq("parent_drawing_id", parentDrawingId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load child drawings: ${error.message}`);
  return ((data as DrawingRow[]) ?? []).map((r) => rowToDrawing(r));
}

export interface CreateProductionDrawingOptions {
  newFileName: string;
  createdBy: string;
  createdByName: string;
}

/** "Save as Production Drawing" — reuses duplicateDrawing's exact clone
 * mechanism (fresh id, fresh DrawingViews, copied Storage object) and
 * additionally stamps parentDrawingId so the copy is recorded as a child
 * of the Master (or whichever drawing it was saved from). The parent is
 * left untouched. */
export async function createProductionDrawing(
  parentDrawingId: string,
  opts: CreateProductionDrawingOptions,
): Promise<DrawingDocument> {
  const copy = await duplicateDrawing(parentDrawingId, {
    newFileName: opts.newFileName,
    duplicatedBy: opts.createdBy,
    duplicatedByName: opts.createdByName,
  });
  const client = getSupabase();
  // A Production Drawing is never itself a Master, even when duplicated
  // from one — sourceDesignFileId is explicitly cleared again here
  // (duplicateDrawing already clears it, this is belt-and-suspenders
  // matching the original IndexedDB implementation's own redundancy).
  const { data, error } = await client
    .from("drawings")
    .update({ parent_drawing_id: parentDrawingId, source_design_file_id: null })
    .eq("id", copy.id)
    .select()
    .single();
  if (error)
    throw new Error(`Failed to save Production Drawing: ${error.message}`);
  return rowToDrawing(data as DrawingRow, { pdfBlob: copy.pdfBlob });
}

/** Deletes a drawing and, if it's a Repository Original with a hidden
 * Working Drawing, that Working Drawing too. drawing_views and
 * drawing_links rows cascade automatically (ON DELETE CASCADE on
 * drawing_id — see phase-14 migration); Storage objects do not cascade in
 * Postgres, so they're explicitly removed here after the DB rows are
 * confirmed gone. Returns every id actually removed so callers can keep
 * their caches in sync. */
export async function deleteDrawing(id: string): Promise<string[]> {
  const client = getSupabase();
  const working = await findWorkingDrawingByOriginal(id);
  const idsToRemove = working ? [id, working.id] : [id];

  const { data: rows, error: fetchError } = await client
    .from("drawings")
    .select("id, storage_path")
    .in("id", idsToRemove);
  if (fetchError) {
    throw new Error(
      `Failed to resolve drawings to delete: ${fetchError.message}`,
    );
  }
  const storagePaths = (
    (rows as { id: string; storage_path: string }[]) ?? []
  ).map((r) => r.storage_path);

  const { data: deleted, error: deleteError } = await client
    .from("drawings")
    .delete()
    .in("id", idsToRemove)
    .select("id");
  if (deleteError)
    throw new Error(`Failed to delete drawing: ${deleteError.message}`);
  if (!deleted || deleted.length === 0) {
    throw new Error(
      "Delete was blocked by policy, or the drawing no longer exists.",
    );
  }

  await removePdfObjectBestEffort(client, storagePaths);
  return idsToRemove;
}

/** Backs Rename, Move to Project, and re-owning a drawing to a different
 * machine/library category — all just a field patch on the same record.
 * Matches the original IndexedDB version's project_id sync logic exactly:
 * when ownerType is part of the patch, project_id is fully recomputed
 * from it; otherwise project_id only changes if projectId is explicitly
 * in the patch (and is left untouched in the DB otherwise, equivalent to
 * the original's `patch.projectId ?? existing.projectId` no-op case). */
export async function updateDrawing(
  id: string,
  patch: Partial<
    Pick<
      DrawingDocument,
      "fileName" | "projectId" | "ownerType" | "ownerId" | "category"
    >
  >,
): Promise<DrawingDocument> {
  const client = getSupabase();
  const fields: Record<string, unknown> = {};
  if (patch.fileName !== undefined) fields.file_name = patch.fileName;
  if (patch.category !== undefined) fields.category = patch.category ?? null;
  if (patch.ownerType !== undefined) {
    fields.owner_type = patch.ownerType;
    fields.project_id =
      patch.ownerType === "project" ? (patch.ownerId ?? null) : null;
    if (patch.ownerId !== undefined) fields.owner_id = patch.ownerId;
  } else {
    if (patch.ownerId !== undefined) fields.owner_id = patch.ownerId;
    if (patch.projectId !== undefined) fields.project_id = patch.projectId;
  }

  const { data, error } = await client
    .from("drawings")
    .update(fields)
    .eq("id", id)
    .select();
  if (error) throw new Error(`Failed to update drawing: ${error.message}`);
  const rows = (data as DrawingRow[]) ?? [];
  if (rows.length === 0) {
    throw new Error(
      `Update to drawing ${id} was blocked by policy, or it no longer exists.`,
    );
  }
  return rowToDrawing(rows[0]);
}

export interface DuplicateDrawingOptions {
  newFileName?: string;
  duplicatedBy: string;
  duplicatedByName: string;
}

/** Clones a DrawingDocument (via a server-side Storage copy of its PDF
 * object — see file header, deviation 2) plus every saved DrawingView for
 * it, giving each a fresh id (and the views a new drawingId FK). The
 * original is untouched. Every field not explicitly overridden here
 * (parentDrawingId, originalDrawingId, notes, tags, owner*, category,
 * project_id) is carried over unchanged, matching the IndexedDB version's
 * `{...original, ...overrides}` spread exactly. */
export async function duplicateDrawing(
  id: string,
  opts: DuplicateDrawingOptions,
): Promise<DrawingDocument> {
  const { client, orgId } = await requireSession();
  const { data: originalData, error: originalError } = await client
    .from("drawings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (originalError)
    throw new Error(`Failed to load drawing: ${originalError.message}`);
  if (!originalData) throw new Error(`Drawing ${id} not found`);
  const original = originalData as DrawingRow;

  const newId = crypto.randomUUID();
  const fileName = opts.newFileName || `${original.file_name} (Copy)`;
  const storagePath = `${orgId}/${newId}/${fileName}`;
  await copyPdfObject(client, original.storage_path, storagePath);

  const { data, error } = await client
    .from("drawings")
    .insert({
      id: newId,
      file_name: fileName,
      storage_path: storagePath,
      num_pages: original.num_pages,
      project_id: original.project_id,
      owner_type: original.owner_type,
      owner_id: original.owner_id,
      category: original.category,
      notes: original.notes,
      tags: original.tags,
      parent_drawing_id: original.parent_drawing_id,
      // A duplicate is a new, independent drawing — never the promoted
      // Master of the original's source Design File (there can only be
      // one), so this is deliberately not carried over.
      source_design_file_id: null,
      uploaded_by: opts.duplicatedBy || null,
      uploaded_by_name: opts.duplicatedByName,
    })
    .select()
    .single();
  if (error) {
    await removePdfObjectBestEffort(client, [storagePath]);
    throw new Error(`Failed to duplicate drawing: ${error.message}`);
  }
  const copy = rowToDrawing(data as DrawingRow);

  const { data: viewRows, error: viewsError } = await client
    .from("drawing_views")
    .select("*")
    .eq("drawing_id", id);
  if (viewsError)
    throw new Error(`Failed to load views to duplicate: ${viewsError.message}`);
  const views = (viewRows as DrawingViewRow[]) ?? [];
  if (views.length > 0) {
    const { error: insertViewsError } = await client
      .from("drawing_views")
      .insert(
        views.map((v) => ({
          id: crypto.randomUUID(),
          drawing_id: copy.id,
          page_number: v.page_number,
          crop_rect: v.crop_rect,
          editor_mode: v.editor_mode,
          fabric_json: v.fabric_json,
          canvas_width: v.canvas_width,
          canvas_height: v.canvas_height,
          title_block: v.title_block,
          created_by: v.created_by,
          created_by_name: v.created_by_name,
          export_count: 0,
        })),
      );
    if (insertViewsError) {
      throw new Error(`Failed to duplicate views: ${insertViewsError.message}`);
    }
  }

  return copy;
}

export async function getViewsForDrawing(
  drawingId: string,
): Promise<DrawingView[]> {
  const client = getSupabase();
  const { data, error } = await client
    .from("drawing_views")
    .select("*")
    .eq("drawing_id", drawingId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Failed to load drawing views: ${error.message}`);
  return ((data as DrawingViewRow[]) ?? []).map(rowToView);
}

export async function getDrawingView(
  id: string,
): Promise<DrawingView | undefined> {
  const client = getSupabase();
  const { data, error } = await client
    .from("drawing_views")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load drawing view: ${error.message}`);
  return data ? rowToView(data as DrawingViewRow) : undefined;
}

export async function getLatestDrawingView(
  drawingId: string,
): Promise<DrawingView | undefined> {
  const views = await getViewsForDrawing(drawingId); // already sorted updatedAt desc
  return views[0];
}

export type SaveDrawingViewInput = Omit<
  DrawingView,
  "id" | "createdAt" | "updatedAt" | "exportCount"
> & { id?: string };

export async function saveDrawingView(
  input: SaveDrawingViewInput,
): Promise<DrawingView> {
  const client = getSupabase();
  let fabricJson: unknown;
  try {
    fabricJson = JSON.parse(input.fabricJSON);
  } catch {
    throw new Error(
      "fabricJSON is not valid JSON — refusing to save a corrupt view.",
    );
  }

  if (input.id) {
    const { data, error } = await client
      .from("drawing_views")
      .update({
        page_number: input.pageNumber,
        crop_rect: input.cropRect,
        editor_mode: input.editorMode,
        fabric_json: fabricJson,
        canvas_width: input.canvasWidth ?? null,
        canvas_height: input.canvasHeight ?? null,
        title_block: input.titleBlock,
      })
      .eq("id", input.id)
      .select();
    if (error) throw new Error(`Failed to save drawing view: ${error.message}`);
    const rows = (data as DrawingViewRow[]) ?? [];
    if (rows.length > 0) return rowToView(rows[0]);
    // Falls through to create-new below, matching the original's own
    // fallback when input.id was set but no existing row was found.
  }

  const { data, error } = await client
    .from("drawing_views")
    .insert({
      id: crypto.randomUUID(),
      drawing_id: input.drawingId,
      page_number: input.pageNumber,
      crop_rect: input.cropRect,
      editor_mode: input.editorMode,
      fabric_json: fabricJson,
      canvas_width: input.canvasWidth ?? null,
      canvas_height: input.canvasHeight ?? null,
      title_block: input.titleBlock,
      created_by: input.createdBy || null,
      created_by_name: input.createdByName,
      export_count: 0,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to save drawing view: ${error.message}`);
  return rowToView(data as DrawingViewRow);
}

export async function deleteDrawingView(id: string): Promise<void> {
  const client = getSupabase();
  const { error } = await client.from("drawing_views").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete drawing view: ${error.message}`);
}

export async function recordExport(
  id: string,
): Promise<DrawingView | undefined> {
  const client = getSupabase();
  const { data: existing, error: fetchError } = await client
    .from("drawing_views")
    .select("export_count")
    .eq("id", id)
    .maybeSingle();
  if (fetchError)
    throw new Error(`Failed to load drawing view: ${fetchError.message}`);
  if (!existing) return undefined;
  const { data, error } = await client
    .from("drawing_views")
    .update({
      export_count: (existing as { export_count: number }).export_count + 1,
    })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw new Error(`Failed to record export: ${error.message}`);
  return data ? rowToView(data as DrawingViewRow) : undefined;
}

// ── Per-user mode preference ("remember my choice") ────────────────
// Self-only via RLS (id = auth.uid()) — userId here is expected to be the
// current session's own id, exactly as every existing caller already
// passes it (e.g. currentUser.id). A mismatched id is simply rejected by
// RLS, same fail-closed behavior as every other table in this app.

export async function getUserEditorPreference(
  userId: string,
): Promise<UserEditorPreference | undefined> {
  const client = getSupabase();
  const { data, error } = await client
    .from("user_editor_preferences")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error)
    throw new Error(`Failed to load editor preference: ${error.message}`);
  return data ? rowToPreference(data as UserPreferenceRow) : undefined;
}

export async function setRememberedMode(
  userId: string,
  mode: EditorMode,
): Promise<UserEditorPreference> {
  const client = getSupabase();
  const { data, error } = await client
    .from("user_editor_preferences")
    .upsert({ id: userId, remembered_mode: mode }, { onConflict: "id" })
    .select()
    .single();
  if (error)
    throw new Error(`Failed to save editor preference: ${error.message}`);
  return rowToPreference(data as UserPreferenceRow);
}

export async function clearRememberedMode(userId: string): Promise<void> {
  const client = getSupabase();
  const existing = await getUserEditorPreference(userId);
  if (!existing) return;
  const { error } = await client
    .from("user_editor_preferences")
    .update({ remembered_mode: null })
    .eq("id", userId);
  if (error)
    throw new Error(`Failed to clear editor preference: ${error.message}`);
}

export async function setLastEditorProject(
  userId: string,
  projectId: string,
): Promise<UserEditorPreference> {
  const client = getSupabase();
  const { data, error } = await client
    .from("user_editor_preferences")
    .upsert({ id: userId, last_project_id: projectId }, { onConflict: "id" })
    .select()
    .single();
  if (error) throw new Error(`Failed to save last project: ${error.message}`);
  return rowToPreference(data as UserPreferenceRow);
}

// ── Drawing links (optional many-to-many references) ───────────────

export async function addLink(
  drawingId: string,
  linkedType: DrawingLink["linkedType"],
  linkedId: string,
): Promise<DrawingLink> {
  const client = getSupabase();
  const { data, error } = await client
    .from("drawing_links")
    .insert({
      id: crypto.randomUUID(),
      drawing_id: drawingId,
      linked_type: linkedType,
      linked_id: linkedId,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to add link: ${error.message}`);
  return rowToLink(data as DrawingLinkRow);
}

export async function removeLink(id: string): Promise<void> {
  const client = getSupabase();
  const { error } = await client.from("drawing_links").delete().eq("id", id);
  if (error) throw new Error(`Failed to remove link: ${error.message}`);
}

export async function getLinksForDrawing(
  drawingId: string,
): Promise<DrawingLink[]> {
  const client = getSupabase();
  const { data, error } = await client
    .from("drawing_links")
    .select("*")
    .eq("drawing_id", drawingId);
  if (error) throw new Error(`Failed to load links: ${error.message}`);
  return ((data as DrawingLinkRow[]) ?? []).map(rowToLink);
}

export async function getLinksForEntity(
  linkedType: DrawingLink["linkedType"],
  linkedId: string,
): Promise<DrawingLink[]> {
  const client = getSupabase();
  const { data, error } = await client
    .from("drawing_links")
    .select("*")
    .eq("linked_id", linkedId)
    .eq("linked_type", linkedType);
  if (error) throw new Error(`Failed to load links: ${error.message}`);
  return ((data as DrawingLinkRow[]) ?? []).map(rowToLink);
}

/** Full link list — small dataset, loaded once and filtered client-side,
 * same pattern as getAllDrawings(). */
export async function getAllLinks(): Promise<DrawingLink[]> {
  const client = getSupabase();
  const { data, error } = await client.from("drawing_links").select("*");
  if (error) throw new Error(`Failed to load links: ${error.message}`);
  return ((data as DrawingLinkRow[]) ?? []).map(rowToLink);
}
