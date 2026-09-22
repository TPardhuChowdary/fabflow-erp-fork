// Job Card Employee Assignments — persistence layer for
// job_card_employee_assignments (Multiple Job Card Employees, Option A:
// simple roster, no per-employee timer — see chat "Employee Architecture
// Review"). Sibling to productionStageLinesApi.ts (same WriteResult
// contract, same session-gate pattern). One Job Card, many employees;
// job_cards.employee_id and the Job Card's own timer are untouched and
// remain the sole elapsed-time source.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

export interface JobCardEmployeeAssignment {
  id: string;
  jobCardId: string;
  employeeId?: string;
  employeeName: string;
  roleDescription?: string;
  createdAt: string;
}

interface JobCardEmployeeAssignmentRow {
  id: string;
  job_card_id: string;
  employee_id: string | null;
  employee_name: string;
  role_description: string | null;
  created_at: string;
}

const ASSIGNMENT_COLUMNS =
  "id, job_card_id, employee_id, employee_name, role_description, created_at";

function rowToAssignment(
  row: JobCardEmployeeAssignmentRow,
): JobCardEmployeeAssignment {
  return {
    id: row.id,
    jobCardId: row.job_card_id,
    employeeId: row.employee_id ?? undefined,
    employeeName: row.employee_name,
    roleDescription: row.role_description ?? undefined,
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

export async function fetchJobCardEmployeeAssignments(
  jobCardId: string,
): Promise<WriteResult<JobCardEmployeeAssignment[]>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("job_card_employee_assignments")
    .select(ASSIGNMENT_COLUMNS)
    .eq("job_card_id", jobCardId)
    .order("created_at");

  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as JobCardEmployeeAssignmentRow[]).map(
      rowToAssignment,
    ),
  };
}

export async function addJobCardEmployeeAssignmentRemote(
  jobCardId: string,
  employeeId: string,
  employeeName: string,
): Promise<WriteResult<JobCardEmployeeAssignment>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("job_card_employee_assignments")
    .insert({
      job_card_id: jobCardId,
      employee_id: employeeId,
      employee_name: employeeName,
    })
    .select(ASSIGNMENT_COLUMNS)
    .single();

  if (error) {
    // uq_job_card_employee_assignments_card_employee — surfaced as a
    // friendly message rather than the raw Postgres constraint text.
    if (error.code === "23505") {
      return { status: "error", error: "This employee is already assigned to this Job Card" };
    }
    return { status: "error", error: error.message };
  }
  return {
    status: "success",
    data: rowToAssignment(data as unknown as JobCardEmployeeAssignmentRow),
  };
}

export async function removeJobCardEmployeeAssignmentRemote(
  assignmentId: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { error } = await gate.client
    .from("job_card_employee_assignments")
    .delete()
    .eq("id", assignmentId);

  if (error) return { status: "error", error: error.message };
  return { status: "success" };
}
