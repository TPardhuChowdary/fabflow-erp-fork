// Phase 53 (Group 2) / Phase 13 — Employee Rewards/Merit write layer.
// employee_rewards permits insert/select/update/delete via RLS (see
// database/phase-53), so unlike assetUsageEventsApi.ts this also exposes
// a delete function - a mis-entered reward can be removed.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { EmployeeReward } from "@/types";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

function rowToEmployeeReward(row: Record<string, unknown>): EmployeeReward {
  return {
    id: row.id as string,
    employeeId: row.employee_id as string,
    rewardType: row.reward_type as EmployeeReward["rewardType"],
    title: row.title as string,
    amount: (row.amount as number) ?? undefined,
    relatedJobCardId: (row.related_job_card_id as string) ?? undefined,
    notes: (row.notes as string) ?? undefined,
    awardedBy: (row.awarded_by as string) ?? undefined,
    awardedAt: row.awarded_at as string,
    createdAt: new Date(row.created_at as string).getTime(),
  };
}

export async function createEmployeeReward(
  input: Omit<EmployeeReward, "id" | "createdAt" | "awardedBy">,
): Promise<WriteResult<EmployeeReward>> {
  if (!isSupabaseConfigured) {
    return { status: "error", error: "Supabase is not configured" };
  }
  const client = getSupabase();
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) return { status: "unauthenticated" };

  const { data, error } = await client
    .from("employee_rewards")
    .insert({
      employee_id: input.employeeId,
      reward_type: input.rewardType,
      title: input.title,
      amount: input.amount ?? null,
      related_job_card_id: input.relatedJobCardId || null,
      notes: input.notes || null,
      awarded_by: session.user.id,
      awarded_at: input.awardedAt,
    })
    .select()
    .single();
  if (error) return { status: "error", error: error.message };
  return { status: "success", data: rowToEmployeeReward(data) };
}

export async function deleteEmployeeReward(
  id: string,
): Promise<WriteResult<never>> {
  if (!isSupabaseConfigured) {
    return { status: "error", error: "Supabase is not configured" };
  }
  const client = getSupabase();
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) return { status: "unauthenticated" };

  const { data, error } = await client
    .from("employee_rewards")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { status: "error", error: error.message };
  if (!data || data.length === 0) {
    return {
      status: "denied",
      error: "No row was deleted (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success" };
}
