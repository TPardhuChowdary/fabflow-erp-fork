// Production Stage Lines — persistence layer for production_stage_lines
// (Multiple Outsourcing/Work Lines under one production stage). Sibling
// to productionStagesApi.ts (same WriteResult contract, same session-gate
// pattern). Deliberately NOT folded into the global projectProductions
// store/hydration pipeline: lines are fetched on demand per stage from
// the Production page, same "fetch when needed, Supabase is the only
// source of truth" approach already used for BOM/usage lookups elsewhere
// in this codebase — avoids widening the large stage-set reconciliation
// RPC for a feature that only needs simple per-stage CRUD.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { ProductionStageLine } from "@/types";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

interface ProductionStageLineRow {
  id: string;
  stage_id: string;
  work_type: string;
  material: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  planned_qty: number;
  uom: string;
  notes: string | null;
  created_at: string;
}

const LINE_COLUMNS =
  "id, stage_id, work_type, material, vendor_id, vendor_name, planned_qty, uom, notes, created_at";

function rowToLine(row: ProductionStageLineRow): ProductionStageLine {
  return {
    id: row.id,
    stageId: row.stage_id,
    workType: row.work_type,
    material: row.material ?? undefined,
    vendorId: row.vendor_id ?? undefined,
    vendorName: row.vendor_name ?? undefined,
    plannedQty: row.planned_qty,
    uom: row.uom,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
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

export async function fetchProductionStageLines(
  stageId: string,
): Promise<WriteResult<ProductionStageLine[]>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("production_stage_lines")
    .select(LINE_COLUMNS)
    .eq("stage_id", stageId)
    .order("created_at");

  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as ProductionStageLineRow[]).map(rowToLine),
  };
}

export async function createProductionStageLineRemote(
  stageId: string,
  input: {
    workType: string;
    material?: string;
    vendorId?: string;
    vendorName?: string;
    plannedQty: number;
    uom: string;
    notes?: string;
  },
): Promise<WriteResult<ProductionStageLine>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("production_stage_lines")
    .insert({
      stage_id: stageId,
      work_type: input.workType,
      material: input.material || null,
      vendor_id: input.vendorId || null,
      vendor_name: input.vendorName || null,
      planned_qty: input.plannedQty,
      uom: input.uom,
      notes: input.notes || null,
    })
    .select(LINE_COLUMNS)
    .single();

  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: rowToLine(data as unknown as ProductionStageLineRow),
  };
}
