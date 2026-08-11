// Phase 27 Batch 1 — Attendance Records write persistence layer. Same
// contract as advanceRecordsApi.ts. No delete API - store.ts only
// exposes addAttendanceRecord/updateAttendanceRecord.
//
// attendance_records has a genuine UNIQUE(employee_id, date) constraint -
// a natural-key collision, not a generated-number race (confirmed Phase
// 25/26). The existing UI already prevents duplicate creates for the
// same employee/date by construction (markAttendance in EmployeeDetail.tsx
// checks getAttendance(day) first and calls update instead of add when a
// row already exists) - so a 23505 here surfaces as a plain "error", no
// retry logic needed (retrying with the same date would collide again).

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { AttendanceRecord } from "@/types";
import {
  ATTENDANCE_RECORD_COLUMNS,
  transformAttendanceRecordRow,
} from "./hydration";
import type { AttendanceRecordRow } from "./hydration";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

function toAttendanceRecordFields(v: Omit<AttendanceRecord, "id">) {
  return {
    employee_id: v.employeeId,
    date: v.date,
    status: v.status,
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

export async function createAttendanceRecordRemote(
  record: Omit<AttendanceRecord, "id">,
): Promise<WriteResult<AttendanceRecord>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("attendance_records")
    .insert(toAttendanceRecordFields(record))
    .select(ATTENDANCE_RECORD_COLUMNS)
    .single();
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: transformAttendanceRecordRow(data as unknown as AttendanceRecordRow),
  };
}

export async function updateAttendanceRecordRemote(
  record: AttendanceRecord,
): Promise<WriteResult<AttendanceRecord>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("attendance_records")
    .update(toAttendanceRecordFields(record))
    .eq("id", record.id)
    .select(ATTENDANCE_RECORD_COLUMNS);
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as AttendanceRecordRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: transformAttendanceRecordRow(rows[0]) };
}
