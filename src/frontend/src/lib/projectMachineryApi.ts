// Phase 39 — Project Machinery write persistence layer. Sibling to
// lib/projectEmployeesApi.ts (this module's template - same composite
// PK (project_id, machine_id), no surrogate id, diff-based single-pair
// insert/delete, never a wholesale replace of the join table).

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

export async function addProjectMachineRemote(
  projectId: string,
  machineId: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { error } = await gate.client
    .from("project_machinery")
    .insert({ project_id: projectId, machine_id: machineId });
  if (error) return { status: "error", error: error.message };
  return { status: "success" };
}

export async function removeProjectMachineRemote(
  projectId: string,
  machineId: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("project_machinery")
    .delete()
    .eq("project_id", projectId)
    .eq("machine_id", machineId)
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
