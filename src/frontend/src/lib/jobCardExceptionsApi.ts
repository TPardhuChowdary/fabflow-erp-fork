// Employee Job Card Mobile Workflow — Job Card Exceptions write layer
// (database/phase-58). Mirrors employeeRewardsApi.ts's shape exactly:
// requireSession-then-insert, reported_by/approved_by set server-side
// from the real session, never passed in by the caller.
//
// Report (insert) and approve/reject (update) are deliberately separate
// functions matching the deliberately separate RLS actions on this table
// (job_cards.edit for insert, job_cards.approve for update) - a worker
// who can report an exception cannot also approve it unless they
// separately hold the approve permission.

import {
  JOB_CARD_EXCEPTION_COLUMNS,
  transformJobCardExceptionRow,
} from "@/lib/hydration";
import type { JobCardExceptionRow } from "@/lib/hydration";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { JobCardException } from "@/types";

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
  return { ok: true as const, client, userId: data.session.user.id };
}

export async function createJobCardExceptionRemote(input: {
  jobCardId: string;
  reasonType: JobCardException["reasonType"];
  description?: string;
}): Promise<WriteResult<JobCardException>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("job_card_exceptions")
    .insert({
      job_card_id: input.jobCardId,
      reason_type: input.reasonType,
      description: input.description || null,
      status: "pending",
      reported_by: gate.userId,
    })
    .select(JOB_CARD_EXCEPTION_COLUMNS)
    .single();
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: transformJobCardExceptionRow(data as unknown as JobCardExceptionRow),
  };
}

// Only reachable by someone holding job_cards.approve (enforced by RLS,
// not just the UI) - status moves to "approved" or "rejected", never
// back to "pending" from here.
export async function setJobCardExceptionStatusRemote(
  id: string,
  status: "approved" | "rejected",
  approvalNotes?: string,
): Promise<WriteResult<JobCardException>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("job_card_exceptions")
    .update({
      status,
      approved_by: gate.userId,
      approved_at: new Date().toISOString(),
      approval_notes: approvalNotes || null,
    })
    .eq("id", id)
    .select(JOB_CARD_EXCEPTION_COLUMNS);
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as JobCardExceptionRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: transformJobCardExceptionRow(rows[0]) };
}
