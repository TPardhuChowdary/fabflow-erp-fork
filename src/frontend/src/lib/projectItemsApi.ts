// Monster-2 — Project Items ("Items" tab) write persistence. Sibling to
// every other <domain>Api.ts module in this codebase; same WriteResult
// contract, same requireSession() shape, same affected-row semantics for
// UPDATE/DELETE (never .single(), check rows.length). Was 100% local-only
// Zustand state (project_items table + RLS added in
// database/monster-2/monster2_project_items_and_internal_costing.sql).

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { ProjectItem } from "@/types";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

interface ProjectItemRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  unit: string | null;
  unit_price: number | null;
  status: string;
  created_at: string;
}

function rowToProjectItem(row: ProjectItemRow): ProjectItem {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description ?? undefined,
    unit: row.unit ?? undefined,
    unitPrice: row.unit_price ?? undefined,
    status: row.status as ProjectItem["status"],
    createdAt: new Date(row.created_at).getTime(),
  };
}

function toProjectItemFields(v: Omit<ProjectItem, "id" | "createdAt">) {
  return {
    project_id: v.projectId,
    name: v.name,
    description: v.description ?? null,
    unit: v.unit ?? null,
    unit_price: v.unitPrice ?? null,
    status: v.status,
  };
}

const PROJECT_ITEM_COLUMNS =
  "id, project_id, name, description, unit, unit_price, status, created_at";

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

export async function createProjectItemRemote(
  item: Omit<ProjectItem, "id" | "createdAt">,
): Promise<WriteResult<ProjectItem>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("project_items")
    .insert(toProjectItemFields(item))
    .select(PROJECT_ITEM_COLUMNS)
    .single();
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: rowToProjectItem(data as unknown as ProjectItemRow),
  };
}

export async function updateProjectItemRemote(
  item: Omit<ProjectItem, "createdAt">,
): Promise<WriteResult<ProjectItem>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("project_items")
    .update(toProjectItemFields(item))
    .eq("id", item.id)
    .select(PROJECT_ITEM_COLUMNS);
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as ProjectItemRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: rowToProjectItem(rows[0]) };
}

export async function deleteProjectItemRemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("project_items")
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
