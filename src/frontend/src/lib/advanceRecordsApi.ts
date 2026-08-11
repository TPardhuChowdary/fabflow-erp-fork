// Phase 27 Batch 1 — Advance Records write persistence layer. Sibling to
// every other <domain>Api.ts module in this engagement; same
// WriteStatus/WriteResult contract, same requireSession() shape, same
// affected-row semantics for UPDATE (never .single()).
//
// No delete API here — the frontend has no delete UI for AdvanceRecord
// (store.ts only exposes addAdvanceRecord/updateAdvanceRecord), so no
// delete mutation path exists to wire.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { AdvanceRecord } from "@/types";
import { ADVANCE_RECORD_COLUMNS, transformAdvanceRecordRow } from "./hydration";
import type { AdvanceRecordRow } from "./hydration";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

function toAdvanceRecordFields(v: Omit<AdvanceRecord, "id">) {
  return {
    employee_id: v.employeeId,
    amount: v.amount,
    date: v.date,
    reason: v.reason,
    remaining_balance: v.remainingBalance,
    signature_data: v.signatureData ?? null,
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

export async function createAdvanceRecordRemote(
  record: Omit<AdvanceRecord, "id">,
): Promise<WriteResult<AdvanceRecord>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("advance_records")
    .insert(toAdvanceRecordFields(record))
    .select(ADVANCE_RECORD_COLUMNS)
    .single();
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: transformAdvanceRecordRow(data as unknown as AdvanceRecordRow),
  };
}

export async function updateAdvanceRecordRemote(
  record: AdvanceRecord,
): Promise<WriteResult<AdvanceRecord>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("advance_records")
    .update(toAdvanceRecordFields(record))
    .eq("id", record.id)
    .select(ADVANCE_RECORD_COLUMNS);
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as AdvanceRecordRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: transformAdvanceRecordRow(rows[0]) };
}
