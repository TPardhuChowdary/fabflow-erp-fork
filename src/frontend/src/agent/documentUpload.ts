// FabFlow AI Agent -- document upload to private Storage (Phase 8).
//
// Files the user attaches in the Agent chat go straight from the browser
// to a dedicated, private Supabase Storage bucket -- never through the
// agent-chat Edge Function's JSON body (see openaiProvider.ts's
// MAX_REQUEST_BYTES: 500KB, far too small for real files, and this
// design deliberately never tries to raise it -- base64-in-JSON is not
// how this is done). Only a signed URL plus small metadata (filename,
// mimeType, sizeBytes) ever enters the LLM conversation.
//
// Session/org resolution mirrors drawingEditor/api/drawings.ts's own
// requireSession() exactly (same profiles.organization_id lookup) --
// not duplicated logic invented fresh, the same established pattern.
//
// Bucket: see the Phase 8 report for the exact creation steps this
// needs (bucket must exist, be private, and set file_size_limit and
// allowed_mime_types at the Storage level -- that is the real security
// boundary; the client-side checks below are a fast-fail UX convenience
// only, never the enforcement).

import { getSupabase } from "@/lib/supabaseClient";

export const AGENT_DOCUMENTS_BUCKET = "agent-documents";

// No existing size-limit convention was found anywhere in the app (PO,
// payment, and material attachment inputs enforce no size at all).
// Chosen conservative default for ERP documents/photos -- reported
// explicitly in the Phase 8 report, not silently assumed.
export const MAX_AGENT_FILE_BYTES = 10 * 1024 * 1024; // 10MB

// Matches the dominant accept="" pattern already used across the app
// (Payments, CompanyPOs, ProjectDetail material attachments all use
// .pdf,.jpg,.jpeg,.png) -- not a new policy invented from nothing.
export const ALLOWED_AGENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

// Signed URLs are used instead of a public bucket (never expose
// permanent public URLs). One year is long enough for ERP document
// retention without being unbounded/public -- a known, disclosed
// trade-off: whoever holds this exact URL string can read the file
// until it expires, same as any signed URL. No regeneration-on-view
// mechanism exists yet (a real limitation, reported, not hidden).
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365;

export interface AgentFileValidationError {
  ok: false;
  reason: string;
}

/** Fast client-side pre-check so the picker can reject before ever
 * attempting a network call -- NOT the security boundary (see header). */
export function validateAgentFile(
  file: File,
): { ok: true } | AgentFileValidationError {
  if (!ALLOWED_AGENT_MIME_TYPES.has(file.type)) {
    return {
      ok: false,
      reason: `Unsupported file type (${file.type || "unknown"}). Allowed: PDF, JPG, PNG.`,
    };
  }
  if (file.size > MAX_AGENT_FILE_BYTES) {
    return {
      ok: false,
      reason: `File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum is ${MAX_AGENT_FILE_BYTES / (1024 * 1024)}MB.`,
    };
  }
  if (file.size === 0) {
    return { ok: false, reason: "File is empty." };
  }
  return { ok: true };
}

export interface UploadedAgentFile {
  ok: true;
  storagePath: string;
  signedUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface UploadAgentFileError {
  ok: false;
  fileName: string;
  error: string;
}

/** Sanitizes a filename for use as a Storage path segment: strips path
 * separators and non-printable characters so a malicious filename (for
 * example one containing "../" or embedded slashes) can never escape
 * the intended `${orgId}/${uploadId}/` prefix or inject extra path
 * segments. The random uploadId prefix is the primary defense (the
 * sanitized name is never used alone to build the path); this is
 * defense in depth on top of that. */
function sanitizeFileName(rawName: string): string {
  const noSeparators = rawName.split("/").join("_").split("\\").join("_");
  let printable = "";
  for (let i = 0; i < noSeparators.length; i++) {
    const code = noSeparators.charCodeAt(i);
    if (code > 31 && code !== 127) {
      printable += noSeparators[i];
    }
  }
  const trimmed = printable.slice(-200);
  return trimmed.length > 0 ? trimmed : "file";
}

/** Uploads one file to the private agent-documents bucket and returns a
 * signed URL plus metadata -- never raw bytes back to the caller, never
 * a public URL. Each file is independent: a caller processing multiple
 * files must call this once per file and handle each result on its own
 * (never let one failure block or falsely report on another). */
export async function uploadAgentDocument(
  file: File,
): Promise<UploadedAgentFile | UploadAgentFileError> {
  const validation = validateAgentFile(file);
  if (!validation.ok) {
    return { ok: false, fileName: file.name, error: validation.reason };
  }

  const client = getSupabase();
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) {
    return { ok: false, fileName: file.name, error: "Not signed in." };
  }
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("organization_id")
    .eq("id", session.user.id)
    .maybeSingle();
  if (profileError || !profile) {
    return {
      ok: false,
      fileName: file.name,
      error: "Could not resolve your organization.",
    };
  }
  const orgId = (profile as { organization_id: string }).organization_id;

  const uploadId = crypto.randomUUID();
  const path = `${orgId}/${uploadId}/${sanitizeFileName(file.name)}`;

  const { error: uploadError } = await client.storage
    .from(AGENT_DOCUMENTS_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false, // never silently overwrite
    });
  if (uploadError) {
    return {
      ok: false,
      fileName: file.name,
      error: `Upload failed: ${uploadError.message}`,
    };
  }

  const { data: signedData, error: signError } = await client.storage
    .from(AGENT_DOCUMENTS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signError || !signedData) {
    return {
      ok: false,
      fileName: file.name,
      error: `Uploaded, but could not generate an access link: ${signError?.message ?? "unknown error"}`,
    };
  }

  return {
    ok: true,
    storagePath: path,
    signedUrl: signedData.signedUrl,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  };
}

// ── Orphan-file cleanup (Phase A1) ─────────────────────────────────────
//
// A file can be uploaded to Storage and then never actually get attached
// to any ERP record — the user cancels the confirmation, or the
// downstream write (e.g. recordPayment) fails after the upload already
// succeeded. Both cases leave a real object in private Storage with
// nothing in the database referencing it. This mirrors
// drawingEditor/api/drawings.ts's removePdfObjectBestEffort() exactly:
// best-effort, never throws, logs on failure rather than hiding it, and
// never masks whatever the real (ERP-write) error was — cleanup is a
// side effect of that error, not a replacement for reporting it.

/** Recovers the Storage path from a signed URL this module generated —
 * never from a URL supplied by the LLM/user, so it can't be tricked into
 * deleting an arbitrary path. Matches the exact shape
 * `createSignedUrl()` produces for this bucket
 * (".../object/sign/agent-documents/<path>?..."); returns null for
 * anything else rather than guessing. */
export function extractAgentDocumentStoragePath(url: string): string | null {
  const marker = `/object/sign/${AGENT_DOCUMENTS_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const afterMarker = url.slice(idx + marker.length);
  const path = afterMarker.split("?")[0];
  return path ? decodeURIComponent(path) : null;
}

/** Best-effort delete of one or more agent-documents Storage objects —
 * same shape as removePdfObjectBestEffort(): never throws, logs on
 * failure, and is never allowed to mask whatever the caller's real
 * (ERP-write or decline) outcome already was. */
export async function removeAgentDocumentsBestEffort(
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  const client = getSupabase();
  const { error } = await client.storage
    .from(AGENT_DOCUMENTS_BUCKET)
    .remove(paths);
  if (error) {
    console.error(
      `agent-documents cleanup failed for [${paths.join(", ")}]: ${error.message}`,
    );
  }
}

/** Scans a tool call's raw input for any agent-documents signed URLs
 * (regardless of which field they're under — deliberately not coupled
 * to recordPayment's specific `filesJson` shape, so this stays correct
 * for any future write tool that carries file references the same way)
 * and best-effort deletes the Storage objects they point to. Fire-and-
 * forget by design: cleanup must never delay or fail the caller's own
 * result reporting. */
export function cleanupAgentDocumentsFromInput(
  input: Record<string, unknown>,
): void {
  const paths: string[] = [];
  const visit = (value: unknown, depth: number): void => {
    if (depth > 4) return; // bounded recursion — this is metadata, never deeply nested
    if (typeof value === "string") {
      // filesJson (recordPayment) is itself a JSON string containing
      // more URLs — try parsing it, but a plain URL string works too.
      try {
        const parsed = JSON.parse(value);
        visit(parsed, depth + 1);
      } catch {
        const path = extractAgentDocumentStoragePath(value);
        if (path) paths.push(path);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
    } else if (value && typeof value === "object") {
      for (const v of Object.values(value)) visit(v, depth + 1);
    }
  };
  visit(input, 0);
  if (paths.length > 0) {
    void removeAgentDocumentsBestEffort(paths);
  }
}
