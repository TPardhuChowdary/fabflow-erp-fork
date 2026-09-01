// Phase 22 — Projects write persistence layer. Sibling to
// lib/employeesApi.ts, lib/customersApi.ts, lib/inventoryApi.ts,
// lib/vendorsApi.ts, lib/companyPosApi.ts. Projects.tsx's centralized
// CREATE/UPDATE/DELETE, and store.ts's repeatProject, route through this
// module instead of talking to Supabase directly.
//
// Contract every write function here follows (identical to the prior five
// domains):
//   - Checks for a real Supabase session first; returns
//     {status:"unauthenticated"} with no network call if none exists.
//   - Never fabricates success. A rejected/failed request returns
//     {status:"error", error} with the real Supabase/RLS message.
//   - Only a "success" result returns the actual persisted row so the
//     caller can sync Zustand from what the database actually has.
//   - RLS is the only authorization boundary enforced here. This module
//     performs no permission check of its own - callers gate their UI
//     with canCreate/canEdit/canDelete(currentUser, "projects") first.
//   - update/delete request .select() (never .single()) and check
//     data.length - Postgres RLS silently matches zero rows on a blocked
//     UPDATE/DELETE (no thrown error) - "denied" distinguishes that from
//     a real thrown "error".
//
// Project-number collision handling (Phase 22 Decision 2, explicitly
// approved - same Option 1 pattern as Company POs): `projects` carries a
// genuine UNIQUE constraint on project_number, which is not DB-generated.
// The existing frontend numbering (generateDocNo("PROJ")) is a
// side-effecting local counter - it must NOT be called again during a
// retry (calling it again would burn another counter slot even though
// the first attempt already consumed one). The retry generator here is a
// pure function over fresh server state instead, matching the
// PROJ-YYYY-NNN format exactly but never touching the local counter.
//
// Local-only fields with no DB column (Phase 22 Decisions 3 + the
// follow-up PO-fields question, both explicitly approved): assignedEmployeeIds,
// pos, poNumber, poDate, poFiles. Never sent in any write payload here.
// Callers merge them from local state on top of what this module returns.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { normalizeBusinessName } from "@/lib/utils";
import type { Project } from "@/types";
import { transformProjectRow } from "./hydration";
import type { ProjectRow } from "./hydration";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

// The set of Project fields this module actually owns in the DB. Deliberately
// excludes id/organization_id/created_at/updated_at (DB-managed) and
// assignedEmployeeIds/pos/poNumber/poDate/poFiles (no DB column - local-only,
// per explicitly approved decisions).
export type ProjectWritable = Omit<
  Project,
  | "id"
  | "createdAt"
  | "assignedEmployeeIds"
  | "pos"
  | "poNumber"
  | "poDate"
  | "poFiles"
  | "projectId"
>;

function toProjectFields(v: ProjectWritable) {
  return {
    name: normalizeBusinessName(v.projectName),
    customer_id: v.customerId,
    quantity: v.totalQty ?? null,
    work_description: v.workDescription || null,
    production_version: v.productionVersion ?? null,
    customer_visible_name: v.customerVisibleName
      ? normalizeBusinessName(v.customerVisibleName)
      : null,
    internal_order_code: v.internalOrderCode || null,
    project_type: v.projectType ?? null,
    parent_project_id: v.parentProjectId || null,
    source_project_id: v.sourceProjectId || null,
    repeat_order_seq: v.repeatOrderSeq ?? null,
    original_project_name: v.originalProjectName || null,
    activity_log: v.activityLog ?? null,
  };
}

// UPDATE never touches project_number - it's immutable after creation
// (the edit dialog has no field for it; Projects.tsx's handleEditSave
// spreads the existing project's projectNo through unchanged), same
// pattern as Vendors/Company POs.
function toProjectUpdateFields(v: ProjectWritable) {
  return toProjectFields(v);
}

const SELECT_COLUMNS =
  "id, project_number, name, customer_id, quantity, created_at, " +
  "work_description, production_version, customer_visible_name, " +
  "internal_order_code, project_type, parent_project_id, " +
  "source_project_id, repeat_order_seq, original_project_name, " +
  "activity_log";

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

// Same PROJ-YYYY-NNN format as the existing generateDocNo("PROJ") in
// store.ts, but a pure calculation over supplied server-side numbers -
// never mutates any local counter. Mirrors the monotonic-counter's actual
// semantics (never resets per year - only the *display* year changes) by
// taking the max sequence number across ALL existing project_numbers,
// not just the current year's.
export function computeNextProjectNumber(existingNumbers: string[]): string {
  const year = new Date().getFullYear();
  const nums = existingNumbers.map((n) => {
    const m = (n || "").match(/^PROJ-\d{4}-(\d+)$/);
    return m ? Number.parseInt(m[1], 10) : 0;
  });
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `PROJ-${year}-${String(next).padStart(3, "0")}`;
}

async function fetchExistingProjectNumbers(
  client: ReturnType<typeof getSupabase>,
): Promise<string[] | null> {
  const { data, error } = await client
    .from("projects")
    .select("project_number");
  if (error || !data) return null;
  return (data as unknown as { project_number: string }[]).map(
    (r) => r.project_number,
  );
}

// Postgres unique_violation. Confirmed via investigation: the only UNIQUE
// constraint a normal INSERT could hit is projects_project_number_key -
// the primary key is server-generated (uuid_generate_v4()), so a PK
// collision is not a realistic path here.
function isProjectNumberConflict(error: { code?: string; message?: string }) {
  return (
    error.code === "23505" &&
    (error.message?.includes("projects_project_number_key") ||
      error.message?.includes("project_number"))
  );
}

const MAX_PROJECT_NUMBER_ATTEMPTS = 3;

export async function createProjectRemote(
  project: ProjectWritable & { projectNo: string },
): Promise<WriteResult<Project>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { client } = gate;

  let candidateNumber = project.projectNo;

  for (let attempt = 1; attempt <= MAX_PROJECT_NUMBER_ATTEMPTS; attempt++) {
    const { data, error } = await client
      .from("projects")
      .insert({
        ...toProjectFields(project),
        project_number: candidateNumber,
      })
      .select(SELECT_COLUMNS)
      .single();

    if (!error) {
      return {
        status: "success",
        data: transformProjectRow(data as unknown as ProjectRow) as Project,
      };
    }

    if (!isProjectNumberConflict(error)) {
      return { status: "error", error: error.message };
    }

    if (attempt === MAX_PROJECT_NUMBER_ATTEMPTS) {
      break;
    }

    // Collision on project_number specifically - re-derive the next
    // number from actual server state (never from the local counter,
    // never by calling generateDocNo() again) and retry.
    const freshNumbers = await fetchExistingProjectNumbers(client);
    if (freshNumbers === null) {
      break;
    }
    candidateNumber = computeNextProjectNumber(freshNumbers);
  }

  return {
    status: "error",
    error:
      "This project number was just used by another session. Please try saving again.",
  };
}

export async function updateProjectRemote(
  project: Project,
): Promise<WriteResult<Project>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("projects")
    .update(toProjectUpdateFields(project))
    .eq("id", project.id)
    .select(SELECT_COLUMNS);

  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as ProjectRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return {
    status: "success",
    data: transformProjectRow(rows[0]) as Project,
  };
}

// Appends one entry to projects.activity_log via the add_project_activity()
// RPC (database/phase-11/phase11_production_persistence_FINAL.sql) — "the
// sanctioned manual-note write path... Deliberately the ONLY write path
// created by this migration for activity_log", built specifically to
// avoid what store.ts's addProjectActivity used to do: read the full
// activityLog array from local state, append one entry client-side, and
// write the WHOLE array back via updateProjectRemote's normal full-row
// update. Unlike editing a project field (rare, low-stakes if a
// concurrent edit loses), activity log entries are appended from several
// independent triggers in quick succession (invoice generation, agent
// actions, manual notes) — a client-computed full-array overwrite would
// silently drop whichever entry lost the race. The RPC appends server-
// side via `activity_log || jsonb_build_array(entry)`, so two concurrent
// calls both survive regardless of ordering. Returns void, so the fresh
// row is read back the same way settleExpenseFloatRemote's RPC is.
export async function addProjectActivityRemote(
  projectId: string,
  type: string,
  description: string,
  performedBy: string,
  metadata?: Record<string, string | number>,
): Promise<WriteResult<Project>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { error: rpcError } = await gate.client.rpc("add_project_activity", {
    p_project_id: projectId,
    p_type: type,
    p_description: description,
    p_performed_by: performedBy,
    p_metadata: metadata ?? null,
  });
  if (rpcError) return { status: "error", error: rpcError.message };

  const { data, error } = await gate.client
    .from("projects")
    .select(SELECT_COLUMNS)
    .eq("id", projectId)
    .maybeSingle();
  if (error) return { status: "error", error: error.message };
  if (!data) {
    return {
      status: "denied",
      error:
        "Activity was recorded, but the updated project is not visible to you (blocked by RLS)",
    };
  }
  return {
    status: "success",
    data: transformProjectRow(data as unknown as ProjectRow) as Project,
  };
}

export async function deleteProjectRemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("projects")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as { id: string }[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was deleted (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success" };
}
