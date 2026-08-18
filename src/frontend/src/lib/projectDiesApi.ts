// Phase 39 — Project Dies write persistence layer. Sibling to
// lib/projectEmployeesApi.ts / lib/projectMachineryApi.ts - same
// composite PK (project_id, die_id), no surrogate id, diff-based
// single-pair insert/delete, never a wholesale replace of the join
// table. Serves "Assigned Dies/Tooling" on the Project side.

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

export async function addProjectDieRemote(
  projectId: string,
  dieId: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { error } = await gate.client
    .from("project_dies")
    .insert({ project_id: projectId, die_id: dieId });
  if (error) return { status: "error", error: error.message };
  return { status: "success" };
}

export async function removeProjectDieRemote(
  projectId: string,
  dieId: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("project_dies")
    .delete()
    .eq("project_id", projectId)
    .eq("die_id", dieId)
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
