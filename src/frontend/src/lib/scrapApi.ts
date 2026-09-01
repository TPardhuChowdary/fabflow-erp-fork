// Monster-1 — Scrap Records write persistence layer. Sibling to every
// other <domain>Api.ts module in this codebase; same WriteResult
// contract, same requireSession() shape, same affected-row semantics
// for UPDATE/DELETE (never .single(), check rows.length).
//
// projectName is intentionally never sent to or read from the table —
// it's a client-side convenience resolved from project_id, same as
// every other domain here that references a project.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { ScrapRecord, ScrapStatus } from "@/types";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

interface ScrapRecordRow {
  id: string;
  project_id: string | null;
  stage: string | null;
  material_type: string;
  unit: string;
  generated_qty: number;
  reusable_qty: number;
  sold_qty: number;
  disposed_qty: number;
  scrap_value: number | null;
  status: string;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
}

function rowToScrapRecord(row: ScrapRecordRow): ScrapRecord {
  return {
    id: row.id,
    projectId: row.project_id ?? undefined,
    stage: row.stage ?? undefined,
    materialType: row.material_type,
    unit: row.unit,
    generatedQty: row.generated_qty,
    reusableQty: row.reusable_qty,
    soldQty: row.sold_qty,
    disposedQty: row.disposed_qty,
    scrapValue: row.scrap_value ?? undefined,
    status: row.status as ScrapStatus,
    notes: row.notes ?? undefined,
    recordedBy: row.recorded_by ?? "",
    createdAt: new Date(row.created_at).getTime(),
  };
}

function toScrapRecordFields(
  v: Omit<ScrapRecord, "id" | "createdAt" | "projectName">,
) {
  return {
    project_id: v.projectId || null,
    stage: v.stage || null,
    material_type: v.materialType,
    unit: v.unit,
    generated_qty: v.generatedQty,
    reusable_qty: v.reusableQty,
    sold_qty: v.soldQty,
    disposed_qty: v.disposedQty,
    scrap_value: v.scrapValue ?? null,
    status: v.status,
    notes: v.notes || null,
    recorded_by: v.recordedBy || null,
  };
}

export const SCRAP_RECORD_COLUMNS =
  "id, project_id, stage, material_type, unit, generated_qty, reusable_qty, " +
  "sold_qty, disposed_qty, scrap_value, status, notes, recorded_by, created_at";

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

export async function createScrapRecordRemote(
  record: Omit<ScrapRecord, "id" | "createdAt" | "projectName">,
): Promise<WriteResult<ScrapRecord>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("scrap_records")
    .insert(toScrapRecordFields(record))
    .select(SCRAP_RECORD_COLUMNS)
    .single();
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: rowToScrapRecord(data as unknown as ScrapRecordRow),
  };
}

export async function updateScrapRecordRemote(
  record: Omit<ScrapRecord, "createdAt" | "projectName">,
): Promise<WriteResult<ScrapRecord>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("scrap_records")
    .update(toScrapRecordFields(record))
    .eq("id", record.id)
    .select(SCRAP_RECORD_COLUMNS);
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as ScrapRecordRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: rowToScrapRecord(rows[0]) };
}

export async function deleteScrapRecordRemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("scrap_records")
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
