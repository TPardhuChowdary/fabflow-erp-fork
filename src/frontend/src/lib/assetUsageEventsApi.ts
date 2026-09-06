// Phase 51 (Group 2) / Phase 7 — universal asset usage-event write
// layer: Machine/Die/Tool all log through this one insert, matching
// asset_usage_events' insert+select-only RLS (see database/phase-51) —
// there is no update/delete function here because none is permitted.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { AssetUsageEvent } from "@/types";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

function rowToAssetUsageEvent(row: Record<string, unknown>): AssetUsageEvent {
  return {
    id: row.id as string,
    assetType: row.asset_type as AssetUsageEvent["assetType"],
    assetId: row.asset_id as string,
    employeeId: (row.employee_id as string) ?? undefined,
    employeeName: (row.employee_name as string) ?? undefined,
    projectId: (row.project_id as string) ?? undefined,
    jobCardId: (row.job_card_id as string) ?? undefined,
    eventType: row.event_type as AssetUsageEvent["eventType"],
    quantity: (row.quantity as number) ?? undefined,
    conditionBefore: (row.condition_before as string) ?? undefined,
    conditionAfter: (row.condition_after as string) ?? undefined,
    notes: (row.notes as string) ?? undefined,
    recordedBy: (row.recorded_by as string) ?? undefined,
    eventAt: new Date(row.event_at as string).getTime(),
    createdAt: new Date(row.created_at as string).getTime(),
  };
}

export async function createAssetUsageEvent(
  input: Omit<
    AssetUsageEvent,
    "id" | "createdAt" | "recordedBy" | "eventAt"
  > & {
    eventAt?: Date;
  },
): Promise<WriteResult<AssetUsageEvent>> {
  if (!isSupabaseConfigured) {
    return { status: "error", error: "Supabase is not configured" };
  }
  const client = getSupabase();
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) return { status: "unauthenticated" };

  const { data, error } = await client
    .from("asset_usage_events")
    .insert({
      asset_type: input.assetType,
      asset_id: input.assetId,
      employee_id: input.employeeId || null,
      employee_name: input.employeeName || null,
      project_id: input.projectId || null,
      job_card_id: input.jobCardId || null,
      event_type: input.eventType,
      quantity: input.quantity ?? null,
      condition_before: input.conditionBefore || null,
      condition_after: input.conditionAfter || null,
      notes: input.notes || null,
      recorded_by: session.user.id,
      event_at: (input.eventAt ?? new Date()).toISOString(),
    })
    .select()
    .single();
  if (error) return { status: "error", error: error.message };
  return { status: "success", data: rowToAssetUsageEvent(data) };
}
