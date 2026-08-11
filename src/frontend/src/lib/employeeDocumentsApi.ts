// Phase 27 Batch 1 — Employee Documents write persistence layer.
//
// uploadedBy (a local display username, e.g. "admin") has no DB
// counterpart to write into - employee_documents.uploaded_by is a UUID
// FK to auth.users, a completely independent auth system from this app's
// local login (Phase 17B/17C). Never write the local username string
// into that column (it isn't a real auth.users id and would violate the
// FK). Instead, uploaded_by is populated from the real signed-in
// Supabase session's user id when one exists - genuine, non-fabricated
// audit information, just a different concept than the frontend's local
// display field, which stays local-only (merged back in by the
// hydration hook, never sent here).

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { EmployeeDocument } from "@/types";
import {
  EMPLOYEE_DOCUMENT_COLUMNS,
  transformEmployeeDocumentRow,
} from "./hydration";
import type { EmployeeDocumentRow } from "./hydration";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

type EmployeeDocumentWritable = Omit<EmployeeDocument, "id" | "uploadedBy">;

function toEmployeeDocumentFields(
  v: EmployeeDocumentWritable,
  uploadedByUserId: string | null,
) {
  return {
    employee_id: v.employeeId,
    document_group_id: v.documentGroupId,
    superseded_at: v.supersededAt
      ? new Date(v.supersededAt).toISOString()
      : null,
    document_name: v.documentName,
    document_type: v.documentType,
    file_data: v.fileData,
    file_mime_type: v.fileMimeType,
    upload_date: v.uploadDate,
    expiry_date: v.expiryDate || null,
    notes: v.notes || null,
    uploaded_by: uploadedByUserId,
    uploaded_at: new Date(v.uploadedAt).toISOString(),
  };
}

// UPDATE only ever touches supersededAt (Replace flow) or
// documentName/documentType/expiryDate/notes (Rename/edit flow) in the
// current UI - never re-sends file_data/file_mime_type/uploaded_at,
// matching handleSaveDocMeta's exact field set.
function toEmployeeDocumentUpdateFields(v: Partial<EmployeeDocumentWritable>) {
  const fields: Record<string, unknown> = {};
  if (v.supersededAt !== undefined) {
    fields.superseded_at = v.supersededAt
      ? new Date(v.supersededAt).toISOString()
      : null;
  }
  if (v.documentName !== undefined) fields.document_name = v.documentName;
  if (v.documentType !== undefined) fields.document_type = v.documentType;
  if (v.expiryDate !== undefined) fields.expiry_date = v.expiryDate || null;
  if (v.notes !== undefined) fields.notes = v.notes || null;
  return fields;
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

export async function createEmployeeDocumentRemote(
  doc: EmployeeDocumentWritable,
): Promise<WriteResult<Omit<EmployeeDocument, "uploadedBy">>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("employee_documents")
    .insert(toEmployeeDocumentFields(doc, gate.userId))
    .select(EMPLOYEE_DOCUMENT_COLUMNS)
    .single();
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: transformEmployeeDocumentRow(data as unknown as EmployeeDocumentRow),
  };
}

export async function updateEmployeeDocumentRemote(
  id: string,
  updates: Partial<EmployeeDocumentWritable>,
): Promise<WriteResult<Omit<EmployeeDocument, "uploadedBy">>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("employee_documents")
    .update(toEmployeeDocumentUpdateFields(updates))
    .eq("id", id)
    .select(EMPLOYEE_DOCUMENT_COLUMNS);
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as EmployeeDocumentRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: transformEmployeeDocumentRow(rows[0]) };
}

export async function deleteEmployeeDocumentRemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("employee_documents")
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
