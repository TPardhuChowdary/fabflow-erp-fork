// Phase 18B — Employees write persistence layer. Sibling to
// lib/hydration.ts (read-only, untouched this phase). Employees.tsx (and
// EmployeeDetail.tsx's updateEmployee call sites) call into this module
// instead of talking to Supabase directly.
//
// Contract every write function here follows:
//   - Checks for a real Supabase session first; returns
//     {status:"unauthenticated"} with no network call if none exists.
//   - Never fabricates success. A rejected/failed request returns
//     {status:"error", error} with the real Supabase/RLS message -
//     callers must not update Zustand on this path.
//   - Only a "success" result returns the actual persisted row (for
//     create/update) so the caller can sync Zustand from what the
//     database actually has, not from what was optimistically assumed.
//   - RLS is the only authorization boundary enforced here. This module
//     performs no permission check of its own.
//
// IMPORTANT, disclosed Phase 18B finding: Postgres RLS behaves
// asymmetrically between INSERT and UPDATE/DELETE. An INSERT blocked by a
// WITH CHECK policy throws a real, catchable error ("new row violates
// row-level security policy") - loud and unambiguous. An UPDATE or DELETE
// blocked by a USING policy does NOT throw an error at all - the
// statement "succeeds" but silently matches zero rows, because RLS makes
// the target row invisible to the statement rather than raising a
// permission error. A response with no error and zero affected rows is
// therefore the CORRECT, EXPECTED signature of an RLS-blocked UPDATE/
// DELETE, not evidence of success and not evidence of failure by itself -
// it must be distinguished explicitly by checking how many rows came
// back, which is why update/delete here always request .select() (never
// .single(), which throws its own, unrelated "Cannot coerce the result to
// a single JSON object" error on zero rows - a symptom of the coercion
// call itself, not a description of what RLS did) and check data.length.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { Employee, EmployeeType, EmploymentType, UserRole } from "@/types";

// "denied" = the request reached Supabase and completed with no error,
// but zero rows were affected - the confirmed signature of either an
// RLS-blocked UPDATE/DELETE or a target row that doesn't exist. Kept
// distinct from "error" (a real thrown Postgrest/network error) and from
// "success" (>=1 row actually affected), so callers/tests never have to
// guess which case they're looking at.
export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

interface EmployeeRow {
  id: string;
  name: string;
  phone: string;
  role: string;
  monthly_salary: number;
  joining_date: string;
  photo_ref: string | null;
  employee_code: string | null;
  designation: string | null;
  blood_group: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relation: string | null;
  emergency_contact_phone: string | null;
  employee_type: string | null;
  employment_type: string | null;
  temp_start_date: string | null;
  temp_end_date: string | null;
  daily_wage_rate: number | null;
}

function rowToEmployee(row: EmployeeRow): Employee {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    role: row.role as UserRole,
    monthlySalary: row.monthly_salary,
    joiningDate: row.joining_date,
    // No DB representation - see Phase 18A/18B mapping. Not guessed.
    userId: "",
    photoRef: row.photo_ref ?? undefined,
    employeeCode: row.employee_code ?? undefined,
    designation: row.designation ?? undefined,
    bloodGroup: row.blood_group ?? undefined,
    emergencyContactName: row.emergency_contact_name ?? undefined,
    emergencyContactRelation: row.emergency_contact_relation ?? undefined,
    emergencyContactPhone: row.emergency_contact_phone ?? undefined,
    employeeType: (row.employee_type as EmployeeType | null) ?? undefined,
    employmentType: (row.employment_type as EmploymentType | null) ?? undefined,
    tempStartDate: row.temp_start_date ?? undefined,
    tempEndDate: row.temp_end_date ?? undefined,
    dailyWageRate: row.daily_wage_rate ?? undefined,
  };
}

// Frontend -> DB payload. Deliberately omits id (DB-generated on insert,
// path param on update/delete) and every field with no DB representation
// or no confirmed frontend need (userId, organization_id, is_active,
// left_date, termination_reason, created_at, updated_at - see mapping).
function toEmployeeFields(e: Omit<Employee, "id">) {
  return {
    name: e.name,
    phone: e.phone,
    role: e.role,
    monthly_salary: e.monthlySalary,
    joining_date: e.joiningDate,
    photo_ref: e.photoRef ?? null,
    employee_code: e.employeeCode ?? null,
    designation: e.designation ?? null,
    blood_group: e.bloodGroup ?? null,
    emergency_contact_name: e.emergencyContactName ?? null,
    emergency_contact_relation: e.emergencyContactRelation ?? null,
    emergency_contact_phone: e.emergencyContactPhone ?? null,
    employee_type: e.employeeType ?? null,
    employment_type: e.employmentType ?? null,
    temp_start_date: e.tempStartDate ?? null,
    temp_end_date: e.tempEndDate ?? null,
    daily_wage_rate: e.dailyWageRate ?? null,
  };
}

const SELECT_COLUMNS =
  "id, name, phone, role, monthly_salary, joining_date, photo_ref, " +
  "employee_code, designation, blood_group, emergency_contact_name, " +
  "emergency_contact_relation, emergency_contact_phone, employee_type, " +
  "employment_type, temp_start_date, temp_end_date, daily_wage_rate";

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

export async function createEmployeeRemote(
  employee: Omit<Employee, "id">,
): Promise<WriteResult<Employee>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("employees")
    .insert(toEmployeeFields(employee))
    .select(SELECT_COLUMNS)
    .single();

  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: rowToEmployee(data as unknown as EmployeeRow),
  };
}

export async function updateEmployeeRemote(
  employee: Employee,
): Promise<WriteResult<Employee>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  // Deliberately no .single()/.maybeSingle() - see the module header. A
  // plain array lets zero-rows-affected (RLS-blocked or nonexistent row)
  // be reported as "denied" instead of throwing an unrelated coercion
  // error that would misrepresent what actually happened.
  const { data, error } = await gate.client
    .from("employees")
    .update(toEmployeeFields(employee))
    .eq("id", employee.id)
    .select(SELECT_COLUMNS);

  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as EmployeeRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: rowToEmployee(rows[0]) };
}

export async function deleteEmployeeRemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  // .select() on a delete returns the deleted row(s) - the only reliable
  // way to know whether anything was actually removed. Without it, a
  // DELETE that RLS silently blocks (zero rows matched) and a DELETE that
  // genuinely removed a row are indistinguishable from the client's
  // perspective (both return no error).
  const { data, error } = await gate.client
    .from("employees")
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
