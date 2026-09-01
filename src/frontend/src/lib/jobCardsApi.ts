// Job Cards feature (see chat) — Phase 49 write persistence layer.
// Mirrors vendorsApi.ts/invoicesApi.ts's own established shape
// (requireSession gate, WriteResult<T>, remote-first — the store is only
// ever updated with the row Supabase actually persisted).
//
// expected_quantity and actual_time_spent_minutes are Postgres GENERATED
// columns (see database/phase-49/) — never sent in the write payload,
// always re-read from the server's own select afterward, so they can
// never drift from the two real inputs they're derived from.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { JobCard } from "@/types";
import { JOB_CARD_COLUMNS, transformJobCardRow } from "./hydration";
import type { JobCardRow } from "./hydration";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

export type JobCardWritable = Omit<
  JobCard,
  | "id"
  | "expectedQuantity"
  | "actualTimeSpentMinutes"
  | "createdAt"
  | "updatedAt"
>;

function toJobCardFields(v: JobCardWritable) {
  return {
    job_no: v.jobNo,
    project_id: v.projectId,
    employee_id: v.employeeId || null,
    employee_name: v.employeeName,
    job_description: v.jobDescription,
    operation_type: v.operationType,
    standard_time_per_unit_minutes: v.standardTimePerUnitMinutes,
    allocated_time_minutes: v.allocatedTimeMinutes,
    actual_completed_qty: v.actualCompletedQty,
    rejected_qty: v.rejectedQty,
    rework_qty: v.reworkQty,
    start_time: v.startTime || null,
    end_time: v.endTime || null,
    status: v.status,
    notes: v.notes || null,
  };
}

// Same JC-YYYY-NNN shape as computeNextInvNumber (lib/invoicesApi.ts) -
// pure calculation over supplied existing numbers, never a local counter.
export function computeNextJobNo(existingJobNos: string[]): string {
  const year = new Date().getFullYear();
  const nums = existingJobNos.map((n) => {
    const m = (n || "").match(/JC-\d{4}-(\d+)/);
    return m ? Number.parseInt(m[1], 10) : 0;
  });
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `JC-${year}-${String(next).padStart(3, "0")}`;
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

function isJobNoConflict(error: { code?: string; message?: string }) {
  return (
    error.code === "23505" &&
    (error.message?.includes("uq_job_cards_org_jobno") ||
      error.message?.includes("job_no"))
  );
}

async function fetchExistingJobNos(
  client: ReturnType<typeof getSupabase>,
): Promise<string[] | null> {
  const { data, error } = await client.from("job_cards").select("job_no");
  if (error || !data) return null;
  return (data as unknown as { job_no: string }[]).map((r) => r.job_no ?? "");
}

const MAX_JOB_NO_ATTEMPTS = 3;

export async function createJobCardRemote(
  jc: JobCardWritable,
  options?: { autoRenumberOnConflict?: boolean },
): Promise<WriteResult<JobCard>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { client } = gate;
  const autoRenumberOnConflict = options?.autoRenumberOnConflict ?? true;

  let candidate = jc;
  for (let attempt = 1; attempt <= MAX_JOB_NO_ATTEMPTS; attempt++) {
    const { data, error } = await client
      .from("job_cards")
      .insert(toJobCardFields(candidate))
      .select(JOB_CARD_COLUMNS)
      .single();

    if (!error) {
      return {
        status: "success",
        data: transformJobCardRow(data as unknown as JobCardRow),
      };
    }

    if (!isJobNoConflict(error)) {
      return { status: "error", error: error.message };
    }

    if (!autoRenumberOnConflict || attempt === MAX_JOB_NO_ATTEMPTS) {
      return {
        status: "error",
        error: `Job Card number ${candidate.jobNo} already exists. Please use a different number.`,
      };
    }

    const freshNumbers = await fetchExistingJobNos(client);
    if (freshNumbers === null) {
      return {
        status: "error",
        error: `Job Card number ${candidate.jobNo} already exists. Please use a different number.`,
      };
    }
    candidate = { ...candidate, jobNo: computeNextJobNo(freshNumbers) };
  }

  return {
    status: "error",
    error:
      "This Job Card number was just used by another session. Please try saving again.",
  };
}

export async function updateJobCardRemote(
  jc: JobCardWritable & { id: string },
): Promise<WriteResult<JobCard>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("job_cards")
    .update(toJobCardFields(jc))
    .eq("id", jc.id)
    .select(JOB_CARD_COLUMNS);

  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as JobCardRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: transformJobCardRow(rows[0]) };
}

export async function deleteJobCardRemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("job_cards")
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
