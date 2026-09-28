// Centralized document numbering (Task 5) - thin wrappers around the
// Supabase RPCs from supabase/migrations/20260927072624_centralized_
// document_numbering.sql. Every RPC derives organization_id server-side
// and enforces its own permission checks - this module does not (and
// must not) duplicate that logic client-side; it only shapes results
// for callers and reports {status, error} the same way every other
// lib/*Api.ts module in this codebase does.
import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface RpcResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

/** counter_key values the centralized system supports today. */
export type DocumentCounterKey =
  | "INV"
  | "QT"
  | "JC"
  | "CPO"
  | "DC"
  | "PROJ"
  | "FLT"
  | "EMP"
  | "MCH"
  | "TL"
  | "DIE";

async function requireSession(): Promise<
  { ok: true } | { ok: false; result: RpcResult<never> }
> {
  if (!isSupabaseConfigured) {
    return { ok: false, result: { status: "error", error: "Supabase is not configured" } };
  }
  const client = getSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) return { ok: false, result: { status: "error", error: error.message } };
  if (!data.session) return { ok: false, result: { status: "unauthenticated" } };
  return { ok: true };
}

/** Allocates the next number for a document type. Atomic, server-side. */
export async function allocateDocumentNumber(
  counterKey: DocumentCounterKey,
): Promise<RpcResult<{ formattedNumber: string; sequenceNumber: number }>> {
  const session = await requireSession();
  if (!session.ok) return session.result;
  const client = getSupabase();
  const { data, error } = await client
    .rpc("allocate_document_number", { p_counter_key: counterKey })
    .single<{ formatted_number: string; sequence_number: number }>();
  if (error) return { status: "error", error: error.message };
  if (!data) return { status: "error", error: "No number returned" };
  return {
    status: "success",
    data: { formattedNumber: data.formatted_number, sequenceNumber: data.sequence_number },
  };
}

/** Per-machine Service Record numbering - own RPC, not in the settings list. */
export async function allocateServiceRecordNumber(
  machineId: string,
  machineCode: string,
): Promise<RpcResult<{ formattedNumber: string; sequenceNumber: number }>> {
  const session = await requireSession();
  if (!session.ok) return session.result;
  const client = getSupabase();
  const { data, error } = await client
    .rpc("allocate_service_record_number", {
      p_machine_id: machineId,
      p_machine_code: machineCode,
    })
    .single<{ formatted_number: string; sequence_number: number }>();
  if (error) return { status: "error", error: error.message };
  if (!data) return { status: "error", error: "No number returned" };
  return {
    status: "success",
    data: { formattedNumber: data.formatted_number, sequenceNumber: data.sequence_number },
  };
}

/**
 * Advances a counter after a user manually edits an existing document's
 * number, so a future automatic allocation never collides with it.
 * Policy: next = MAX(current, numericSuffix + 1) - i.e. pass the
 * numeric suffix itself (not +1), the RPC does the max/greatest.
 * Best-effort: a failure here does not undo the document edit that
 * already succeeded, it only means the counter did not advance - the
 * table's own unique constraint remains the real safety net.
 */
export async function recordManualDocumentNumber(
  counterKey: DocumentCounterKey,
  numericSuffix: number,
): Promise<RpcResult<void>> {
  const session = await requireSession();
  if (!session.ok) return session.result;
  const client = getSupabase();
  const { error } = await client.rpc("record_manual_document_number", {
    p_counter_key: counterKey,
    p_numeric_suffix: numericSuffix,
  });
  if (error) return { status: "error", error: error.message };
  return { status: "success" };
}

/**
 * Hardening pass (Task 6 follow-up) - NOT YET WIRED to any call site.
 * Requires supabase/migrations/20260927180224_atomic_document_rename.sql
 * (written, sanity-checked, NOT applied - pending approval). Once
 * applied, this replaces the "update number, then separately call
 * recordManualDocumentNumber" two-call pattern with ONE atomic RPC call
 * that renames the document AND advances its counter in the same
 * Postgres transaction: if the rename fails (e.g. a duplicate number),
 * the counter is never touched; if it succeeds, the counter always
 * advances together with it. rowId must be the document's own UUID
 * primary key - never its human-readable number.
 */
export async function renameDocumentNumber(
  counterKey: DocumentCounterKey,
  rowId: string,
  newNumber: string,
): Promise<RpcResult<void>> {
  const session = await requireSession();
  if (!session.ok) return session.result;
  const client = getSupabase();
  const { error } = await client.rpc("rename_document_number", {
    p_counter_key: counterKey,
    p_row_id: rowId,
    p_new_number: newNumber,
  });
  if (error) return { status: "error", error: error.message };
  return { status: "success" };
}

export interface DocumentNumberingSetting {
  counterKey: DocumentCounterKey;
  prefix: string;
  includeYear: boolean;
  digitWidth: number;
  nextNumber: number;
}

/** Read all 11 numbering settings for the Settings page. */
export async function getDocumentNumberingSettings(): Promise<
  RpcResult<DocumentNumberingSetting[]>
> {
  const session = await requireSession();
  if (!session.ok) return session.result;
  const client = getSupabase();
  const { data, error } = await client.rpc("get_document_numbering_settings");
  if (error) return { status: "error", error: error.message };
  const rows = (data ?? []) as Array<{
    counter_key: string;
    prefix: string;
    include_year: boolean;
    digit_width: number;
    next_number: number;
  }>;
  return {
    status: "success",
    data: rows.map((r) => ({
      counterKey: r.counter_key as DocumentCounterKey,
      prefix: r.prefix,
      includeYear: r.include_year,
      digitWidth: r.digit_width,
      nextNumber: r.next_number,
    })),
  };
}

/** Admin changes a document type's prefix and/or next number. */
export async function setDocumentNumbering(
  counterKey: DocumentCounterKey,
  prefix: string,
  nextNumber: number,
): Promise<RpcResult<void>> {
  const session = await requireSession();
  if (!session.ok) return session.result;
  const client = getSupabase();
  const { error } = await client.rpc("set_document_numbering", {
    p_counter_key: counterKey,
    p_prefix: prefix,
    p_next_number: nextNumber,
  });
  if (error) return { status: "error", error: error.message };
  return { status: "success" };
}

/** Extracts the trailing numeric suffix from a document number, or null. */
export function extractNumericSuffix(value: string): number | null {
  const m = value.match(/(\d+)$/);
  return m ? Number.parseInt(m[1], 10) : null;
}

function splitNumber(value: string): { prefix: string; digits: string } | null {
  const m = value.match(/^(.*?)(\d+)$/);
  return m ? { prefix: m[1], digits: m[2] } : null;
}

/**
 * Task 6 - shared validation for manually editing an existing document
 * number, reused across every module's edit form. Preserves the
 * existing prefix/format exactly (everything before the trailing
 * numeric run - including an embedded year segment like "JC-2026-") so
 * a user can change JC-2026-011 to JC-2026-050 but can never silently
 * strip the prefix or introduce a new format. Uniqueness is NOT checked
 * here - that's the DB unique constraint's job (the real enforcement
 * boundary); this only validates shape.
 */
export function validateManualNumberEdit(
  newValue: string,
  currentValue: string,
): { ok: true; suffix: number } | { ok: false; error: string } {
  const trimmed = newValue.trim();
  if (!trimmed) return { ok: false, error: "Number is required" };
  const next = splitNumber(trimmed);
  if (!next) {
    return {
      ok: false,
      error: "Number must end in a numeric sequence (e.g. ...-050)",
    };
  }
  const current = splitNumber(currentValue);
  if (current && next.prefix !== current.prefix) {
    return {
      ok: false,
      error: `Number must keep the "${current.prefix}" prefix/format`,
    };
  }
  return { ok: true, suffix: Number.parseInt(next.digits, 10) };
}
