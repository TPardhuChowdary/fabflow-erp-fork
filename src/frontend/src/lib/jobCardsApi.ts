// Job Cards feature (see chat) — Phase 49 write persistence layer.
// Mirrors vendorsApi.ts/invoicesApi.ts's own established shape
// (requireSession gate, WriteResult<T>, remote-first — the store is only
// ever updated with the row Supabase actually persisted).
//
// expected_quantity and actual_time_spent_minutes are Postgres GENERATED
// columns (see database/phase-49/) — never sent in the write payload,
// always re-read from the server's own select afterward, so they can
// never drift from the two real inputs they're derived from.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { JobCard, JobCardInspectionEvent } from "@/types";
import {
  JOB_CARD_COLUMNS,
  JOB_CARD_INSPECTION_EVENT_COLUMNS,
  fetchAllRows,
  transformJobCardInspectionEventRow,
  transformJobCardRow,
} from "./hydration";
import type { JobCardInspectionEventRow, JobCardRow } from "./hydration";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

export type JobCardWritable = Omit<
  JobCard,
  | "id"
  | "expectedQuantity"
  | "actualTimeSpentMinutes"
  | "activeSeconds"
  | "currentRunStartedAt"
  | "createdAt"
  | "updatedAt"
  // Continuation Job Card fields are deliberately excluded from the
  // main create/update payload — see fetchJobCardContinuation/
  // updateJobCardContinuation's own comments, and JobCard.
  // isContinuation's doc comment in types.ts, for why.
  | "isContinuation"
  | "previousJobCardId"
  | "previousJobCardNo"
>;

// Both migrations (20260917180000 sign-off/inspection-events,
// 20260918090000 work-center drop) are now applied, so Create/Edit are
// back to a single authoritative write — no more CORE/SIGN-OFF split or
// PGRST204 swallowing (see chat, database/20260917180000 follow-up).
// work_center_machine_id/work_center_name are deliberately NOT written
// here anymore (see chat, Work Center removal) — the columns are gone
// from the live database entirely now.
function toJobCardFields(v: JobCardWritable) {
  return {
    job_no: v.jobNo,
    project_id: v.projectId,
    employee_id: v.employeeId || null,
    employee_name: v.employeeName,
    job_description: v.jobDescription,
    operation_type: v.operationType,
    standard_time_per_unit_minutes: v.standardTimePerUnitMinutes,
    allocated_time_minutes: v.allocatedTimeMinutes,
    actual_completed_qty: v.actualCompletedQty,
    rejected_qty: v.rejectedQty,
    rework_qty: v.reworkQty,
    reject_root_cause: v.rejectRootCause || null,
    // Nullable — a job card need not belong to a production stage
    // (ad-hoc work stays supported). Validated server-side against the
    // job card's own project_id/organization_id by
    // trg_validate_job_card_stage_reference; changing it on an already-
    // Completed, stage-linked card additionally requires job_cards.approve
    // (database/20260906060000).
    stage_id: v.stageId || null,
    start_time: v.startTime || null,
    end_time: v.endTime || null,
    status: v.status,
    notes: v.notes || null,
    // Job Card print/layout options (see chat) — reference_photo_id is
    // validated server-side against THIS job card's own asset_photos
    // rows by trg_validate_job_card_reference_photo (database/
    // 20260916180000); the two booleans are plain persisted print
    // preferences, both defaulting false at the DB level.
    reference_photo_id: v.referencePhotoId || null,
    print_reference_photo: v.printReferencePhoto,
    print_drawing: v.printDrawing,
    // Job Card planning fields (see chat, database/20260917100000) — all
    // plain columns, no staging needed (unlike reference_photo_id/drawing
    // links, none of these require a real row id to exist first).
    total_quantity: v.totalQuantity ?? null,
    expected_quantity_override: v.expectedQuantityOverride ?? null,
    inspection_plan: v.inspectionPlan ?? [],
    priority: v.priority,
    start_date: v.startDate || null,
    // Sign-off fields (database/20260917180000) — prepared_by_* is set
    // once at creation and never user-editable; callers must pass
    // through the existing value unchanged on edit.
    prepared_by_id: v.preparedById || null,
    prepared_by_name: v.preparedByName || null,
    // Assigned By / In-Process Check / QC Approved By are OPTIONAL
    // follow-up/sign-off fields (see chat) — never required to create or
    // save a Job Card; null simply means "not yet fulfilled".
    assigned_by_employee_id: v.assignedByEmployeeId || null,
    assigned_by_employee_name: v.assignedByEmployeeName || null,
    in_process_check_employee_id: v.inProcessCheckEmployeeId || null,
    in_process_check_employee_name: v.inProcessCheckEmployeeName || null,
    qc_approved_by_employee_id: v.qcApprovedByEmployeeId || null,
    qc_approved_by_employee_name: v.qcApprovedByEmployeeName || null,
    completed_document_storage_path: v.completedDocumentStoragePath || null,
    completed_document_filename: v.completedDocumentFilename || null,
    completed_document_mime_type: v.completedDocumentMimeType || null,
    completed_document_size_bytes: v.completedDocumentSizeBytes ?? null,
    completed_document_uploaded_by: v.completedDocumentUploadedBy || null,
    completed_document_uploaded_by_name:
      v.completedDocumentUploadedByName || null,
    completed_document_uploaded_at: v.completedDocumentUploadedAt
      ? new Date(v.completedDocumentUploadedAt).toISOString()
      : null,
  };
}

// Same JC-YYYY-NNN shape as computeNextInvNumber (lib/invoicesApi.ts) -
// pure calculation over supplied existing numbers, never a local counter.
export function computeNextJobNo(existingJobNos: string[]): string {
  const year = new Date().getFullYear();
  const nums = existingJobNos.map((n) => {
    const m = (n || "").match(/JC-\d{4}-(\d+)/);
    return m ? Number.parseInt(m[1], 10) : 0;
  });
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `JC-${year}-${String(next).padStart(3, "0")}`;
}

async function requireSession() {
  if (!isSupabaseConfigured) {
    return {
      ok: false as const,
      result: { status: "error" as const, error: "Supabase is not configured" },
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

function isJobNoConflict(error: { code?: string; message?: string }) {
  return (
    error.code === "23505" &&
    (error.message?.includes("uq_job_cards_org_jobno") ||
      error.message?.includes("job_no"))
  );
}

// database/20260918100000 — job_card_inspection_events.job_card_id is
// ON DELETE RESTRICT (changed from CASCADE), so deleting a Job Card
// with recorded inspection history now fails with a plain FK violation
// (23503) instead of reaching the append-only trigger. Caught here so
// the raw Postgres error never reaches the user.
function isInspectionHistoryConflict(error: {
  code?: string;
  message?: string;
}) {
  return (
    error.code === "23503" &&
    error.message?.includes("job_card_inspection_events_job_card_id_fkey")
  );
}

// Gap-closure fix — was a single unbounded .select(), which silently
// truncates past 1,000 rows and could miss the true max job_no, defeating
// the auto-renumber-on-conflict retry below at scale. The real safety net
// is still the DB's own uq_job_cards_org_jobno constraint (a truncated list
// just risks a spurious extra retry, never a duplicate), but this makes the
// retry actually succeed instead of exhausting MAX_JOB_NO_ATTEMPTS.
async function fetchExistingJobNos(
  client: ReturnType<typeof getSupabase>,
): Promise<string[] | null> {
  const { data, error } = await fetchAllRows<{ job_no: string }>((from, to) =>
    client.from("job_cards").select("job_no").range(from, to),
  );
  if (error || !data) return null;
  return data.map((r) => r.job_no ?? "");
}

const MAX_JOB_NO_ATTEMPTS = 3;

export async function createJobCardRemote(
  jc: JobCardWritable,
  options?: { autoRenumberOnConflict?: boolean },
): Promise<WriteResult<JobCard>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { client } = gate;
  const autoRenumberOnConflict = options?.autoRenumberOnConflict ?? true;

  let candidate = jc;
  for (let attempt = 1; attempt <= MAX_JOB_NO_ATTEMPTS; attempt++) {
    // CORE insert first — must succeed on its own regardless of whether
    // the sign-off migration (20260917180000) has been applied yet (see
    // chat, "Create must never be blocked by sign-off fields").
    const { data, error } = await client
      .from("job_cards")
      .insert(toJobCardFields(candidate))
      .select(JOB_CARD_COLUMNS)
      .single();

    if (!error) {
      return {
        status: "success",
        data: transformJobCardRow(data as unknown as JobCardRow),
      };
    }

    if (!isJobNoConflict(error)) {
      return { status: "error", error: error.message };
    }

    if (!autoRenumberOnConflict || attempt === MAX_JOB_NO_ATTEMPTS) {
      return {
        status: "error",
        error: `Job Card number ${candidate.jobNo} already exists. Please use a different number.`,
      };
    }

    const freshNumbers = await fetchExistingJobNos(client);
    if (freshNumbers === null) {
      return {
        status: "error",
        error: `Job Card number ${candidate.jobNo} already exists. Please use a different number.`,
      };
    }
    candidate = { ...candidate, jobNo: computeNextJobNo(freshNumbers) };
  }

  return {
    status: "error",
    error:
      "This Job Card number was just used by another session. Please try saving again.",
  };
}

export async function updateJobCardRemote(
  jc: JobCardWritable & { id: string },
): Promise<WriteResult<JobCard>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { client } = gate;

  const { data, error } = await client
    .from("job_cards")
    .update(toJobCardFields(jc))
    .eq("id", jc.id)
    .select(JOB_CARD_COLUMNS);

  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as JobCardRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: transformJobCardRow(rows[0]) };
}

// Inspection Checkpoint Execution (see chat, database/20260917180000) —
// a plain INSERT into the real, database-enforced append-only child
// table job_card_inspection_events (RLS grants INSERT/SELECT only,
// UPDATE/DELETE rejected by RLS + a trigger — see that migration's own
// header). Deliberately NOT a read-current-array/append/write-whole-
// array-back cycle: two inspectors completing two different checkpoints
// concurrently now produce two independent INSERTs, which can never
// conflict or lose an event — the exact race the original jsonb design
// had, and the reason this table replaced it.
export async function recordJobCardInspectionEvent(
  jobCardId: string,
  event: Omit<JobCardInspectionEvent, "id" | "jobCardId" | "inspectedAt">,
): Promise<WriteResult<JobCardInspectionEvent>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("job_card_inspection_events")
    .insert({
      job_card_id: jobCardId,
      checkpoint_id: event.checkpointId,
      checkpoint_label: event.checkpointLabel,
      checkpoint_qty: event.checkpointQty,
      source: event.source,
      result: event.result,
      inspected_by: event.inspectedBy || null,
      inspected_by_name: event.inspectedByName || null,
      remarks: event.remarks || null,
    })
    .select(JOB_CARD_INSPECTION_EVENT_COLUMNS)
    .single();

  if (error) return { status: "error", error: error.message };
  if (!data) {
    return {
      status: "denied",
      error: "No row was inserted (blocked by RLS)",
    };
  }
  return {
    status: "success",
    data: transformJobCardInspectionEventRow(
      data as unknown as JobCardInspectionEventRow,
    ),
  };
}

/** Every recorded inspection event for one Job Card, oldest first — the
 * application derives each checkpoint's CURRENT status as the latest
 * row matching its checkpointId (see jobCardCheckpoints.ts's
 * getCheckpointStatus), never by re-deriving from a jsonb array. */
export async function fetchJobCardInspectionEvents(
  jobCardId: string,
): Promise<JobCardInspectionEvent[]> {
  if (!isSupabaseConfigured) return [];
  const client = getSupabase();
  const { data, error } = await client
    .from("job_card_inspection_events")
    .select(JOB_CARD_INSPECTION_EVENT_COLUMNS)
    .eq("job_card_id", jobCardId)
    .order("inspected_at", { ascending: true });
  if (error || !data) return [];
  return (data as unknown as JobCardInspectionEventRow[]).map(
    transformJobCardInspectionEventRow,
  );
}

// Live production-quantity update (see chat, Part 5) — reuses the
// EXISTING actual_completed_qty column (the one authoritative
// production-quantity field, otherwise only ever written once by
// CompleteJobCardDialog at Complete time) as the checkpoint trigger
// input, rather than inventing a second/competing quantity counter.
// This function only WIDENS WHEN that same column can be written
// (additionally while InProgress/OnHold, not only at Complete) — it
// does not add a new field. Minimal single-column update, same pattern
// as updateJobCardStatusRemote below.
export async function updateJobCardProductionProgress(
  jobCardId: string,
  actualCompletedQty: number,
): Promise<WriteResult<JobCard>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("job_cards")
    .update({ actual_completed_qty: actualCompletedQty })
    .eq("id", jobCardId)
    .select(JOB_CARD_COLUMNS);

  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as JobCardRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: transformJobCardRow(rows[0]) };
}

// Job Card live timer (Start/Pause/Resume) — database/20260906050000.
// Deliberately a minimal {status}-only update, not a full-row
// updateJobCardRemote() call: sending only the field that's actually
// changing means every other column (including the new
// active_seconds/current_run_started_at, which the client never touches
// directly) arrives unchanged, letting the trg_enforce_job_card_timer_
// transition trigger compute and stamp them server-side with no risk of
// the client racing or clobbering its own math. The trigger is what
// validates the transition and enforces job_cards.approve for pause —
// this function does not duplicate either check; an invalid transition
// or a missing permission comes back as a normal Postgres error via the
// existing `error` branch below, exactly like any other write.
async function updateJobCardStatusRemote(
  id: string,
  status: "InProgress" | "OnHold",
): Promise<WriteResult<JobCard>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("job_cards")
    .update({ status })
    .eq("id", id)
    .select(JOB_CARD_COLUMNS);

  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as JobCardRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: transformJobCardRow(rows[0]) };
}

// Continuation Job Card (see chat, print template redesign, and the
// later "correct the Continuation Job Card workflow" corrective pass) —
// a dedicated, best-effort read/write pair for is_continuation/
// previous_job_card_id, deliberately NOT folded into JOB_CARD_COLUMNS/
// toJobCardFields/createJobCardRemote/updateJobCardRemote (see
// JobCard.isContinuation's own doc comment in types.ts for why:
// previous_job_card_id's migration is written but not yet approved/
// applied, and the combined read/write every OTHER Job Card field goes
// through must keep working regardless). Same one-writer-per-concern
// shape as setPrimaryAssetPhoto()/setPhotoPrintSelected() elsewhere in
// this codebase. Once the migration is applied, both of these become
// trivially foldable into the main path — not done here.
//
// previous_job_card_id is a self-FK to job_cards(id), not free text — a
// continuation Job Card points BACKWARD to the real, existing Job Card
// it continues from (e.g. JC-2026-008 continuing JC-2026-007 stores
// JC-2026-007's id). The printed/displayed "Previous Job Card" NUMBER is
// always resolved from that record, never stored as a separate text
// snapshot — one source of truth, no stale-number risk.

/** Fetches the current is_continuation/previous_job_card_id (resolved to
 * its job_no) for one Job Card, fresh from Supabase (never assumed from
 * an already-hydrated JobCard, which always carries the static
 * false/undefined default — see transformJobCardRow). Call this when
 * opening Edit/View or before printing, exactly like
 * completedDocumentSignedUrl is re-fetched on viewCard change elsewhere
 * in JobCards.tsx. */
export async function fetchJobCardContinuation(jobCardId: string): Promise<
  WriteResult<{
    isContinuation: boolean;
    previousJobCardId?: string;
    previousJobCardNo?: string;
  }>
> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("job_cards")
    .select("is_continuation, previous_job_card_id")
    .eq("id", jobCardId)
    .maybeSingle();
  if (error) return { status: "error", error: error.message };
  if (!data) return { status: "denied", error: "Job Card not found" };
  const row = data as {
    is_continuation: boolean | null;
    previous_job_card_id: string | null;
  };
  let previousJobCardNo: string | undefined;
  if (row.previous_job_card_id) {
    const prev = await gate.client
      .from("job_cards")
      .select("job_no")
      .eq("id", row.previous_job_card_id)
      .maybeSingle();
    previousJobCardNo =
      (prev.data as { job_no: string } | null)?.job_no ?? undefined;
  }
  return {
    status: "success",
    data: {
      isContinuation: row.is_continuation ?? false,
      previousJobCardId: row.previous_job_card_id ?? undefined,
      previousJobCardNo,
    },
  };
}

/** Persists is_continuation/previous_job_card_id for one Job Card.
 * Clears previous_job_card_id server-side whenever isContinuation is
 * false — unchecking "Yes" must never leave a stale relationship
 * silently printable again if the checkbox is later re-checked without
 * re-selecting it. */
export async function updateJobCardContinuation(
  jobCardId: string,
  fields: { isContinuation: boolean; previousJobCardId?: string },
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("job_cards")
    .update({
      is_continuation: fields.isContinuation,
      previous_job_card_id: fields.isContinuation
        ? fields.previousJobCardId || null
        : null,
    })
    .eq("id", jobCardId)
    .select("id");
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as { id: string }[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success" };
}

/** NotStarted -> InProgress. Server stamps start_time/current_run_started_at. */
export function startJobCardRemote(id: string): Promise<WriteResult<JobCard>> {
  return updateJobCardStatusRemote(id, "InProgress");
}

/** InProgress -> OnHold ("Paused"). Requires job_cards.approve server-side. */
export function pauseJobCardRemote(id: string): Promise<WriteResult<JobCard>> {
  return updateJobCardStatusRemote(id, "OnHold");
}

/** OnHold -> InProgress. Server stamps a fresh current_run_started_at;
 * active_seconds accumulated so far is untouched, never reset. */
export function resumeJobCardRemote(id: string): Promise<WriteResult<JobCard>> {
  return updateJobCardStatusRemote(id, "InProgress");
}

export async function deleteJobCardRemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("job_cards")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    if (isInspectionHistoryConflict(error)) {
      return {
        status: "denied",
        error:
          "This Job Card has recorded inspection history and cannot be deleted.",
      };
    }
    return { status: "error", error: error.message };
  }
  const rows = (data as unknown as { id: string }[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was deleted (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success" };
}
