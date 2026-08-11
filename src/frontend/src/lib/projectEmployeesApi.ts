// Phase 27 Batch 1 — Project Employees write persistence layer.
// Composite PK (project_id, employee_id), no surrogate id column - the
// first pair-keyed domain in this engagement. The frontend toggles
// Project.assignedEmployeeIds as a whole-array replace
// (ProjectDetail.tsx); the correct migration is a diff on each toggle -
// exactly one pair-INSERT or pair-DELETE for the single changed id,
// never a wholesale replace-all of the join table.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
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

export async function addProjectEmployeeRemote(
  projectId: string,
  employeeId: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { error } = await gate.client
    .from("project_employees")
    .insert({ project_id: projectId, employee_id: employeeId });
  if (error) return { status: "error", error: error.message };
  return { status: "success" };
}

export async function removeProjectEmployeeRemote(
  projectId: string,
  employeeId: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("project_employees")
    .delete()
    .eq("project_id", projectId)
    .eq("employee_id", employeeId)
    .select("project_id");
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as { project_id: string }[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was deleted (blocked by RLS, or the pair does not exist)",
    };
  }
  return { status: "success" };
}
