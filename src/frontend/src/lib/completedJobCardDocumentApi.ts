// Completed Physical Job Card attachment (see chat, Part 12-13,
// database/20260917180000) — the scanned/photographed, manually
// completed and signed physical Job Card, uploaded after shop-floor
// execution. Org-id resolution, path shape, and upload/signed-URL
// pattern mirror assetPhotosApi.ts/companyDocumentsApi.ts — the
// established pattern for a private, org-folder-scoped bucket, not
// reinvented here. Deliberately single-attachment (Upload/Replace/
// Remove, never a gallery): six plain columns directly on job_cards
// (see the migration's own comment for why this is the correct grain,
// not a new child table) rather than a row in some other repository.

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

const JOB_CARD_DOCUMENTS_BUCKET = "job-card-documents";
const MAX_JOB_CARD_DOCUMENT_BYTES = 15 * 1024 * 1024; // 15MB — same ceiling as company-documents (scans/multi-page)
const ALLOWED_JOB_CARD_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);
const SIGNED_URL_TTL_SECONDS = 60 * 60;

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
  return trimmed.length > 0 ? trimmed : "completed-job-card";
}

export function validateCompletedJobCardDocumentFile(
  file: File,
): { ok: true } | { ok: false; reason: string } {
  if (!ALLOWED_JOB_CARD_DOCUMENT_MIME_TYPES.has(file.type)) {
    return {
      ok: false,
      reason: `Unsupported file type (${file.type || "unknown"}). Allowed: PDF, JPG, PNG.`,
    };
  }
  if (file.size > MAX_JOB_CARD_DOCUMENT_BYTES) {
    return {
      ok: false,
      reason: `File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum is ${MAX_JOB_CARD_DOCUMENT_BYTES / (1024 * 1024)}MB.`,
    };
  }
  if (file.size === 0) return { ok: false, reason: "File is empty." };
  return { ok: true };
}

/** Upload (or Replace — pass the previous storagePath to remove it
 * first) the completed physical Job Card for one, real, already-created
 * Job Card. Never called during Create (no real id exists yet) — see
 * Part 13's own UX, this lives in the View/Edit area only. */
export async function uploadCompletedJobCardDocument(
  jobCardId: string,
  file: File,
  uploaderName: string,
  previousStoragePath?: string,
): Promise<WriteResult<JobCard>> {
  const validation = validateCompletedJobCardDocumentFile(file);
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

  const path = `${orgId}/${jobCardId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;

  const { error: uploadError } = await client.storage
    .from(JOB_CARD_DOCUMENTS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    return { status: "error", error: `Upload failed: ${uploadError.message}` };
  }

  const { data, error } = await client
    .from("job_cards")
    .update({
      completed_document_storage_path: path,
      completed_document_filename: file.name,
      completed_document_mime_type: file.type,
      completed_document_size_bytes: file.size,
      completed_document_uploaded_by: userId,
      completed_document_uploaded_by_name: uploaderName,
      completed_document_uploaded_at: new Date().toISOString(),
    })
    .eq("id", jobCardId)
    .select(JOB_CARD_COLUMNS);

  if (error) {
    // Same orphan-cleanup reasoning as assetPhotosApi.ts/companyDocumentsApi.ts.
    await client.storage.from(JOB_CARD_DOCUMENTS_BUCKET).remove([path]);
    return { status: "error", error: error.message };
  }
  const rows = (data as unknown as JobCardRow[]) ?? [];
  if (rows.length === 0) {
    // The DB write didn't take (RLS/row missing) — the just-uploaded
    // object would otherwise be orphaned.
    await client.storage.from(JOB_CARD_DOCUMENTS_BUCKET).remove([path]);
    return {
      status: "denied",
      error:
        "No row was updated (blocked by RLS, or the Job Card does not exist)",
    };
  }
  // Replace: only remove the OLD object after the new one is confirmed
  // persisted, so a failed replace never leaves the Job Card with no
  // attachment at all.
  if (previousStoragePath && previousStoragePath !== path) {
    await client.storage
      .from(JOB_CARD_DOCUMENTS_BUCKET)
      .remove([previousStoragePath]);
  }
  return { status: "success", data: transformJobCardRow(rows[0]) };
}

export async function removeCompletedJobCardDocument(
  jobCardId: string,
  storagePath: string,
): Promise<WriteResult<JobCard>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("job_cards")
    .update({
      completed_document_storage_path: null,
      completed_document_filename: null,
      completed_document_mime_type: null,
      completed_document_size_bytes: null,
      completed_document_uploaded_by: null,
      completed_document_uploaded_by_name: null,
      completed_document_uploaded_at: null,
    })
    .eq("id", jobCardId)
    .select(JOB_CARD_COLUMNS);

  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as JobCardRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error:
        "No row was updated (blocked by RLS, or the Job Card does not exist)",
    };
  }
  await gate.client.storage
    .from(JOB_CARD_DOCUMENTS_BUCKET)
    .remove([storagePath]);
  return { status: "success", data: transformJobCardRow(rows[0]) };
}

export async function getCompletedJobCardDocumentSignedUrl(
  storagePath: string,
): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const client = getSupabase();
  const { data, error } = await client.storage
    .from(JOB_CARD_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}
