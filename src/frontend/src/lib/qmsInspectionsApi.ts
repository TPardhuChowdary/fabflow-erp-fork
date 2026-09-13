// Phase 32 — QMS Inspection <-> Production Gate write persistence layer.
// Writes to the 5 tables added by
// database/phase-12/phase12_qms_inspection_gate_persistence.sql. The read
// path is lib/hydration.ts's hydrateProjectQmsInspections() and friends;
// this file is insert/update only, mirroring lib/employeeDocumentsApi.ts's
// shape.
//
// Identity note (contrast with employeeDocumentsApi.ts): the
// created_by/performed_by/uploaded_by/overridden_by columns on these 5
// tables are plain `text`, NOT a FK to auth.users - unlike
// employee_documents.uploaded_by. So this file does not need to read the
// real Supabase session's user id for those columns; callers pass the
// local app's own current-user id/name directly, the same byUserId/
// byUserName shape qms/api/inspections.ts's functions already take. A
// real Supabase Auth session is still required for any write to succeed
// at all, since RLS's has_permission() resolves off auth.uid() -
// requireSession() below only gates on that session existing, it does
// not extract an id from it for these columns.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type {
  InspectionMode,
  ProjectQmsInspection,
  ProjectQmsInspectionAttempt,
  ProjectQmsInspectionAttemptPhoto,
  ProjectQmsInspectionAttemptResult,
  ProjectQmsInspectionCharacteristic,
  ProjectQmsInspectionOverride,
} from "@/qms/types";
import {
  PROJECT_QMS_INSPECTION_ATTEMPT_COLUMNS,
  PROJECT_QMS_INSPECTION_ATTEMPT_PHOTO_COLUMNS,
  PROJECT_QMS_INSPECTION_CHARACTERISTIC_COLUMNS,
  PROJECT_QMS_INSPECTION_COLUMNS,
  PROJECT_QMS_INSPECTION_OVERRIDE_COLUMNS,
  transformProjectQmsInspectionAttemptPhotoRow,
  transformProjectQmsInspectionAttemptRow,
  transformProjectQmsInspectionCharacteristicRow,
  transformProjectQmsInspectionOverrideRow,
  transformProjectQmsInspectionRow,
} from "./hydration";
import type {
  ProjectQmsInspectionAttemptPhotoRow,
  ProjectQmsInspectionAttemptRow,
  ProjectQmsInspectionCharacteristicRow,
  ProjectQmsInspectionOverrideRow,
  ProjectQmsInspectionRow,
} from "./hydration";

export type WriteStatus =
  | "success"
  | "denied"
  | "error"
  | "unauthenticated"
  | "duplicate";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

// Postgres unique_violation - raised by
// uq_project_qms_inspections_project_library when the same Library
// inspection is added to a Project a second time (Decision 3-B).
const UNIQUE_VIOLATION = "23505";

async function requireSession() {
  if (!isSupabaseConfigured) {
    return {
      ok: false as const,
      result: {
        status: "error" as const,
        error: "Supabase is not configured",
      },
    };
  }
  const client = getSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) {
    return {
      ok: false as const,
      result: { status: "error" as const, error: error.message },
    };
  }
  if (!data.session) {
    return {
      ok: false as const,
      result: { status: "unauthenticated" as const },
    };
  }
  return { ok: true as const, client };
}

// ── project_qms_inspections ─────────────────────────────────────────

export interface CreateProjectQmsInspectionInput {
  projectId: string;
  libraryInspectionId: string;
  libraryInspectionName: string;
  requiredProductionStageId?: string;
  mode: InspectionMode;
  byUserId?: string;
  byUserName?: string;
}

/** Creates a new independent inspection instance (Path A when
 * requiredProductionStageId is set, Path B when it's omitted). On a
 * duplicate - (projectId, libraryInspectionId) already exists for this
 * project, per uq_project_qms_inspections_project_library - returns
 * status "duplicate" with the EXISTING row's data rather than creating a
 * second instance. The caller/UI is expected to show/reuse that existing
 * inspection per Decision 3-B, never silently fail and never silently
 * duplicate. */
export async function createProjectQmsInspectionRemote(
  input: CreateProjectQmsInspectionInput,
): Promise<WriteResult<ProjectQmsInspection>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("project_qms_inspections")
    .insert({
      project_id: input.projectId,
      library_inspection_id: input.libraryInspectionId,
      library_inspection_name: input.libraryInspectionName,
      required_production_stage_id: input.requiredProductionStageId ?? null,
      mode: input.mode,
      created_by: input.byUserId ?? null,
      created_by_name: input.byUserName ?? null,
    })
    .select(PROJECT_QMS_INSPECTION_COLUMNS)
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      const existing = await gate.client
        .from("project_qms_inspections")
        .select(PROJECT_QMS_INSPECTION_COLUMNS)
        .eq("project_id", input.projectId)
        .eq("library_inspection_id", input.libraryInspectionId)
        .maybeSingle();
      if (existing.error) {
        return { status: "error", error: existing.error.message };
      }
      if (existing.data) {
        return {
          status: "duplicate",
          data: transformProjectQmsInspectionRow(
            existing.data as unknown as ProjectQmsInspectionRow,
          ),
        };
      }
      // RLS hid the existing row from this caller (different permission
      // scope) - report the duplicate honestly without fabricating its
      // data rather than guessing.
      return {
        status: "duplicate",
        error:
          "This inspection already exists for this project, but the existing record isn't visible to you.",
      };
    }
    return { status: "error", error: error.message };
  }

  return {
    status: "success",
    data: transformProjectQmsInspectionRow(
      data as unknown as ProjectQmsInspectionRow,
    ),
  };
}

export interface UpdateProjectQmsInspectionInput {
  /** Pass null to unlink (e.g. Production Stage deletion, rule 17). Pass
   * undefined (omit) to leave unchanged. */
  requiredProductionStageId?: string | null;
  mode?: InspectionMode;
  /** Quantity-based inspection (Master ERP Architecture, Part 3). Pass
   * null to remove quantity checkpoints entirely (back to plain
   * pass/fail); undefined (omit) to leave unchanged. Never touches
   * status/the characteristic-attempt trigger — see this function's own
   * header note on that below. */
  inspectionFrequencyQty?: number | null;
}

/** Updates the link (requiredProductionStageId), mode, and/or the
 * quantity-inspection frequency. `status` is never accepted here - it is
 * exclusively server-derived by recompute_qms_inspection_status() after
 * every attempt insert (see database/phase-12/...sql section 3); this
 * function has no parameter for it at all, so it cannot be set
 * incorrectly by a caller mistake. inspectionFrequencyQty is a
 * completely separate, additive axis (see
 * qms/lib/quantityInspection.ts) — setting it never changes status and
 * never affects getStageInspectionGate()'s existing pass/fail gate. */
export async function updateProjectQmsInspectionRemote(
  id: string,
  updates: UpdateProjectQmsInspectionInput,
): Promise<WriteResult<ProjectQmsInspection>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const fields: Record<string, unknown> = {};
  if (updates.requiredProductionStageId !== undefined) {
    fields.required_production_stage_id = updates.requiredProductionStageId;
  }
  if (updates.mode !== undefined) fields.mode = updates.mode;
  if (updates.inspectionFrequencyQty !== undefined) {
    fields.inspection_frequency_qty = updates.inspectionFrequencyQty;
  }

  const { data, error } = await gate.client
    .from("project_qms_inspections")
    .update(fields)
    .eq("id", id)
    .select(PROJECT_QMS_INSPECTION_COLUMNS);
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as ProjectQmsInspectionRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return {
    status: "success",
    data: transformProjectQmsInspectionRow(rows[0]),
  };
}

/** Records one completed quantity checkpoint (Master ERP Architecture,
 * Part 3) — appends to project_qms_inspections.quantity_checkpoints.
 * Re-reads the row immediately before writing (never trusts a
 * caller-supplied snapshot) so the common case — one inspector recording
 * one checkpoint at a time — can't record the same quantity twice.
 *
 * ponytail: this is read-then-write, not a single atomic SQL statement —
 * two genuinely concurrent calls for the SAME inspection (different
 * quantities) could still race and one write could clobber the other's
 * new entry (a jsonb column has no built-in atomic "append" the way a
 * relational child-table INSERT would). Upgrade path if concurrent
 * recording of the same inspection ever becomes real: a
 * SECURITY DEFINER RPC doing the read-check-append inside one
 * transaction, mirroring recompute_qms_inspection_status()'s own
 * pattern. Not built here since it needs a new function, which needs its
 * own review, same bar as this migration did.
 *
 * This never touches status or the characteristic-attempt trigger; it is
 * a wholly separate tracking mechanism (see qms/lib/quantityInspection.ts). */
export async function recordQuantityCheckpointRemote(
  inspectionId: string,
  checkpoint: {
    quantity: number;
    result: "Pass" | "Fail";
    performedBy?: string;
    performedByName?: string;
    remarks?: string;
  },
): Promise<WriteResult<ProjectQmsInspection>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data: currentRow, error: readError } = await gate.client
    .from("project_qms_inspections")
    .select(PROJECT_QMS_INSPECTION_COLUMNS)
    .eq("id", inspectionId)
    .maybeSingle();
  if (readError) return { status: "error", error: readError.message };
  if (!currentRow) {
    return { status: "denied", error: "Inspection not found." };
  }
  const current = transformProjectQmsInspectionRow(
    currentRow as unknown as ProjectQmsInspectionRow,
  );
  const existing = current.quantityCheckpoints ?? [];
  if (existing.some((c) => c.quantity === checkpoint.quantity)) {
    return {
      status: "duplicate",
      error: `Quantity ${checkpoint.quantity} was already recorded for this inspection.`,
    };
  }

  const { data, error } = await gate.client
    .from("project_qms_inspections")
    .update({
      quantity_checkpoints: [
        ...existing,
        { ...checkpoint, completedAt: new Date().toISOString() },
      ],
    })
    .eq("id", inspectionId)
    .select(PROJECT_QMS_INSPECTION_COLUMNS);
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as ProjectQmsInspectionRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return {
    status: "success",
    data: transformProjectQmsInspectionRow(rows[0]),
  };
}

// ── project_qms_inspection_characteristics ──────────────────────────

export interface CreateProjectQmsInspectionCharacteristicInput {
  projectQmsInspectionId: string;
  libraryCharacteristicId: string;
  nameSnapshot: string;
  categorySnapshot?: string;
  sequence: number;
}

/** Bulk-creates the characteristic snapshot for a freshly-created
 * inspection instance - normally called once, immediately after
 * createProjectQmsInspectionRemote succeeds, with every characteristic
 * that instance's Library definition implies at that moment (Phase 32
 * §4). Not editable afterward - an immutable snapshot by design, matching
 * the table's RLS (select/insert only, no update/delete policy). */
export async function createProjectQmsInspectionCharacteristicsRemote(
  inputs: CreateProjectQmsInspectionCharacteristicInput[],
): Promise<WriteResult<ProjectQmsInspectionCharacteristic[]>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  if (inputs.length === 0) return { status: "success", data: [] };

  const { data, error } = await gate.client
    .from("project_qms_inspection_characteristics")
    .insert(
      inputs.map((v) => ({
        project_qms_inspection_id: v.projectQmsInspectionId,
        library_characteristic_id: v.libraryCharacteristicId,
        name_snapshot: v.nameSnapshot,
        category_snapshot: v.categorySnapshot ?? null,
        sequence: v.sequence,
      })),
    )
    .select(PROJECT_QMS_INSPECTION_CHARACTERISTIC_COLUMNS);
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as ProjectQmsInspectionCharacteristicRow[]).map(
      transformProjectQmsInspectionCharacteristicRow,
    ),
  };
}

// ── project_qms_inspection_attempts ─────────────────────────────────

export interface CreateProjectQmsInspectionAttemptInput {
  projectQmsInspectionId: string;
  characteristicId: string;
  result: ProjectQmsInspectionAttemptResult;
  measuredValue?: string;
  remarks?: string;
  /** Only meaningful when result === "Fail" (Phase 32 §9). */
  failureReason?: string;
  failureDescription?: string;
  /** Only meaningful on the attempt that records what was done to fix a
   * PRIOR failed attempt, before this attempt's own result (Phase 32
   * §10). */
  rectificationAction?: string;
  rectificationDescription?: string;
  byUserId?: string;
  byUserName?: string;
}

/** Creates one new attempt/round. Never an update of a prior attempt -
 * roundNumber is not accepted here at all; it is always server-assigned
 * by trg_set_qms_inspection_attempt_round (locks the characteristic row,
 * then max(round_number)+1), so a re-inspection is always a fresh row.
 * This is what makes "never overwrite or destroy previous inspection
 * attempts" (rules 11-14) a database guarantee, not just a convention
 * this function happens to follow. The overall inspection's status is
 * recomputed automatically server-side immediately after this insert -
 * no separate call is needed to update it. */
export async function createProjectQmsInspectionAttemptRemote(
  input: CreateProjectQmsInspectionAttemptInput,
): Promise<WriteResult<ProjectQmsInspectionAttempt>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("project_qms_inspection_attempts")
    .insert({
      project_qms_inspection_id: input.projectQmsInspectionId,
      characteristic_id: input.characteristicId,
      result: input.result,
      measured_value: input.measuredValue ?? null,
      remarks: input.remarks ?? null,
      failure_reason: input.failureReason ?? null,
      failure_description: input.failureDescription ?? null,
      rectification_action: input.rectificationAction ?? null,
      rectification_description: input.rectificationDescription ?? null,
      performed_by: input.byUserId ?? null,
      performed_by_name: input.byUserName ?? null,
    })
    .select(PROJECT_QMS_INSPECTION_ATTEMPT_COLUMNS)
    .single();
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: transformProjectQmsInspectionAttemptRow(
      data as unknown as ProjectQmsInspectionAttemptRow,
    ),
  };
}

// ── project_qms_inspection_attempt_photos ───────────────────────────

export interface CreateProjectQmsInspectionAttemptPhotoInput {
  attemptId: string;
  /** Base64 data URL - same convention as EmployeeDocument.fileData. */
  fileData: string;
  fileMimeType: string;
  /** e.g. "Failure evidence" vs "Rectification proof" - the only thing
   * that distinguishes the two use cases at the data level, besides
   * which attempt the photo is attached to (Phase 32 §7/§9/§10). */
  caption?: string;
  byUserId?: string;
  byUserName?: string;
}

export async function createProjectQmsInspectionAttemptPhotoRemote(
  input: CreateProjectQmsInspectionAttemptPhotoInput,
): Promise<WriteResult<ProjectQmsInspectionAttemptPhoto>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("project_qms_inspection_attempt_photos")
    .insert({
      attempt_id: input.attemptId,
      file_data: input.fileData,
      file_mime_type: input.fileMimeType,
      caption: input.caption ?? null,
      uploaded_by: input.byUserId ?? null,
      uploaded_by_name: input.byUserName ?? null,
    })
    .select(PROJECT_QMS_INSPECTION_ATTEMPT_PHOTO_COLUMNS)
    .single();
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: transformProjectQmsInspectionAttemptPhotoRow(
      data as unknown as ProjectQmsInspectionAttemptPhotoRow,
    ),
  };
}

// ── project_qms_inspection_overrides ────────────────────────────────

export interface CreateProjectQmsInspectionOverrideInput {
  projectQmsInspectionId: string;
  requiredProductionStageId: string;
  reason: string;
  byUserId: string;
  byUserName: string;
}

/** Records a supervisor/admin emergency override (rules 15-16). Requires
 * the caller to already hold the inspection_sheets.override permission -
 * RLS enforces this independently (a denied insert surfaces as a Postgres
 * RLS error here, returned as status "error"), this function does not
 * duplicate that check. Deliberately never touches
 * project_qms_inspections.status: the underlying inspection's stored
 * result stays exactly as it was (still Failed/InProgress), this only
 * adds a permanently visible, separate, insert-only override record.
 * Callers must read BOTH the inspection's status AND whether an active
 * override exists for it when deciding if a stage may proceed - never
 * infer one from the other. */
export async function createProjectQmsInspectionOverrideRemote(
  input: CreateProjectQmsInspectionOverrideInput,
): Promise<WriteResult<ProjectQmsInspectionOverride>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("project_qms_inspection_overrides")
    .insert({
      project_qms_inspection_id: input.projectQmsInspectionId,
      required_production_stage_id: input.requiredProductionStageId,
      reason: input.reason,
      overridden_by: input.byUserId,
      overridden_by_name: input.byUserName,
    })
    .select(PROJECT_QMS_INSPECTION_OVERRIDE_COLUMNS)
    .single();
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: transformProjectQmsInspectionOverrideRow(
      data as unknown as ProjectQmsInspectionOverrideRow,
    ),
  };
}
