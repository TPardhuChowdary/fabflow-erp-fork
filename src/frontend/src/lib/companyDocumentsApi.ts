// Phase 55 (Group 2) / Phase 17 — Company Document Library write layer.
// Org-id resolution, path shape, and upload/signed-URL pattern mirror
// assetPhotosApi.ts (which itself mirrors agent/documentUpload.ts) — the
// established pattern for uploading to a private, org-folder-scoped
// bucket from the browser, not reinvented here. Private bucket
// "company-documents" (see database/phase-55).

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { CompanyDocument } from "@/types";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

const COMPANY_DOCUMENTS_BUCKET = "company-documents";
const MAX_COMPANY_DOCUMENT_BYTES = 15 * 1024 * 1024; // 15MB — these are scans/certificates, occasionally multi-page
const ALLOWED_COMPANY_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour, regenerated on each view — same as assetPhotosApi, never stored

async function requireSession() {
  if (!isSupabaseConfigured) {
    return {
      ok: false as const,
      result: { status: "error" as const, error: "Supabase is not configured" },
    };
  }
  const client = getSupabase();
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) {
    return {
      ok: false as const,
      result: { status: "unauthenticated" as const },
    };
  }
  return { ok: true as const, client, userId: session.user.id };
}

function sanitizeFileName(rawName: string): string {
  const noSeparators = rawName.split("/").join("_").split("\\").join("_");
  let printable = "";
  for (let i = 0; i < noSeparators.length; i++) {
    const code = noSeparators.charCodeAt(i);
    if (code > 31 && code !== 127) printable += noSeparators[i];
  }
  const trimmed = printable.slice(-150);
  return trimmed.length > 0 ? trimmed : "document";
}

export function validateCompanyDocumentFile(
  file: File,
): { ok: true } | { ok: false; reason: string } {
  if (!ALLOWED_COMPANY_DOCUMENT_MIME_TYPES.has(file.type)) {
    return {
      ok: false,
      reason: `Unsupported file type (${file.type || "unknown"}). Allowed: PDF, JPG, PNG.`,
    };
  }
  if (file.size > MAX_COMPANY_DOCUMENT_BYTES) {
    return {
      ok: false,
      reason: `File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum is ${MAX_COMPANY_DOCUMENT_BYTES / (1024 * 1024)}MB.`,
    };
  }
  if (file.size === 0) return { ok: false, reason: "File is empty." };
  return { ok: true };
}

function rowToCompanyDocument(row: Record<string, unknown>): CompanyDocument {
  return {
    id: row.id as string,
    category: row.category as string,
    documentType: row.document_type as string,
    title: row.title as string,
    issueDate: (row.issue_date as string) ?? undefined,
    expiryDate: (row.expiry_date as string) ?? undefined,
    version: (row.version as string) ?? undefined,
    status: row.status as CompanyDocument["status"],
    isTenderEligible: row.is_tender_eligible as boolean,
    storagePath: row.storage_path as string,
    originalFilename: (row.original_filename as string) ?? undefined,
    mimeType: (row.mime_type as string) ?? undefined,
    sizeBytes: (row.size_bytes as number) ?? undefined,
    notes: (row.notes as string) ?? undefined,
    uploadedBy: (row.uploaded_by as string) ?? undefined,
    createdAt: new Date(row.created_at as string).getTime(),
    updatedAt: new Date(row.updated_at as string).getTime(),
  };
}

export interface CompanyDocumentFormInput {
  category: string;
  documentType: string;
  title: string;
  issueDate?: string;
  expiryDate?: string;
  version?: string;
  status: CompanyDocument["status"];
  isTenderEligible: boolean;
  notes?: string;
}

/** Automatic filename generation (Phase 17's explicit requirement): the
 * Storage object is never named after the raw upload — it's built from
 * category/type/date so files are findable/sortable in Storage itself,
 * independent of whatever the uploader's local file happened to be
 * called. The original name is preserved separately in
 * original_filename for display. */
function buildStoragePath(
  orgId: string,
  input: CompanyDocumentFormInput,
  file: File,
): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "doc";
  const ext = sanitizeFileName(file.name).split(".").pop() || "pdf";
  const datePart = (
    input.issueDate || new Date().toISOString().slice(0, 10)
  ).replace(/-/g, "");
  return `${orgId}/${slug(input.category)}-${slug(input.documentType)}-${datePart}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
}

export async function uploadCompanyDocument(
  input: CompanyDocumentFormInput,
  file: File,
): Promise<WriteResult<CompanyDocument>> {
  const validation = validateCompanyDocumentFile(file);
  if (!validation.ok) return { status: "error", error: validation.reason };

  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { client, userId } = gate;

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();
  if (profileError || !profile) {
    return { status: "error", error: "Could not resolve your organization." };
  }
  const orgId = (profile as { organization_id: string }).organization_id;

  const path = buildStoragePath(orgId, input, file);

  const { error: uploadError } = await client.storage
    .from(COMPANY_DOCUMENTS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    return { status: "error", error: `Upload failed: ${uploadError.message}` };
  }

  const { data, error } = await client
    .from("company_documents")
    .insert({
      category: input.category,
      document_type: input.documentType,
      title: input.title,
      issue_date: input.issueDate || null,
      expiry_date: input.expiryDate || null,
      version: input.version || null,
      status: input.status,
      is_tender_eligible: input.isTenderEligible,
      storage_path: path,
      original_filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      notes: input.notes || null,
      uploaded_by: userId,
    })
    .select()
    .single();
  if (error) {
    // Same orphan-cleanup reasoning as assetPhotosApi.ts.
    await client.storage.from(COMPANY_DOCUMENTS_BUCKET).remove([path]);
    return { status: "error", error: error.message };
  }
  return { status: "success", data: rowToCompanyDocument(data) };
}

export async function updateCompanyDocumentMeta(
  id: string,
  patch: Partial<CompanyDocumentFormInput>,
): Promise<WriteResult<CompanyDocument>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const fields: Record<string, unknown> = {};
  if (patch.category !== undefined) fields.category = patch.category;
  if (patch.documentType !== undefined)
    fields.document_type = patch.documentType;
  if (patch.title !== undefined) fields.title = patch.title;
  if (patch.issueDate !== undefined)
    fields.issue_date = patch.issueDate || null;
  if (patch.expiryDate !== undefined)
    fields.expiry_date = patch.expiryDate || null;
  if (patch.version !== undefined) fields.version = patch.version || null;
  if (patch.status !== undefined) fields.status = patch.status;
  if (patch.isTenderEligible !== undefined)
    fields.is_tender_eligible = patch.isTenderEligible;
  if (patch.notes !== undefined) fields.notes = patch.notes || null;

  const { data, error } = await gate.client
    .from("company_documents")
    .update(fields)
    .eq("id", id)
    .select();
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as Record<string, unknown>[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error:
        "No row was updated (blocked by RLS, or the document does not exist)",
    };
  }
  return { status: "success", data: rowToCompanyDocument(rows[0]) };
}

export async function getCompanyDocumentSignedUrl(
  storagePath: string,
): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const client = getSupabase();
  const { data, error } = await client.storage
    .from(COMPANY_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function deleteCompanyDocument(
  doc: Pick<CompanyDocument, "id" | "storagePath">,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("company_documents")
    .delete()
    .eq("id", doc.id)
    .select("id");
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as { id: string }[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error:
        "No row was deleted (blocked by RLS, or the document does not exist)",
    };
  }
  await gate.client.storage
    .from(COMPANY_DOCUMENTS_BUCKET)
    .remove([doc.storagePath]);
  return { status: "success" };
}
