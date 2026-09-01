// Phase L — outbound counterpart to agent/documentUpload.ts's inbound
// upload pattern. That module lets a user attach a file INTO the Agent
// conversation (browser -> private Storage -> signed URL back to the
// LLM). This is the reverse direction: the Agent generates a ledger
// export string (via ledgerExport.ts's existing pure builders,
// unmodified) and uploads it to the SAME private agent-documents bucket,
// returning a signed URL the user can download from. Session/org
// resolution mirrors documentUpload.ts's uploadAgentDocument() exactly —
// not duplicated logic invented fresh, the same established pattern,
// just uploading a generated Blob instead of a user-supplied File. That
// file itself is never modified; only reused/imported from here.
//
// Bucket: reuses AGENT_DOCUMENTS_BUCKET as-is (see Phase L investigation
// report — no second bucket, no infrastructure change here).
//
// TTL: 24 hours, not documentUpload.ts's 1-year TTL — a ledger export is
// a point-in-time snapshot, not a long-lived reference attachment (see
// Phase L investigation report §11).

import { AGENT_DOCUMENTS_BUCKET } from "@/agent/documentUpload";
import { getSupabase } from "@/lib/supabaseClient";

const EXPORT_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24; // 24h

export interface LedgerExportUploadResult {
  ok: true;
  url: string;
  fileName: string;
  expiresAt: string; // ISO timestamp
}

export interface LedgerExportUploadError {
  ok: false;
  error: string;
}

/** Uploads already-built export content (a CSV or the .xls-trick HTML
 * string from ledgerExport.ts) to the private agent-documents bucket,
 * under `${orgId}/exports/${uploadId}/${fileName}`, and returns a signed
 * URL. Never receives raw ledger rows itself — the caller (agent/
 * queries.ts's exportLedger) is the only place that touches ledger
 * business data; this module only knows how to move a string to
 * Storage, exactly like documentUpload.ts only knows how to move a File
 * there. */
export async function uploadLedgerExport(
  content: string,
  mimeType: string,
  fileName: string,
): Promise<LedgerExportUploadResult | LedgerExportUploadError> {
  const client = getSupabase();
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) {
    return { ok: false, error: "Not signed in." };
  }
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("organization_id")
    .eq("id", session.user.id)
    .maybeSingle();
  if (profileError || !profile) {
    return { ok: false, error: "Could not resolve your organization." };
  }
  const orgId = (profile as { organization_id: string }).organization_id;

  const uploadId = crypto.randomUUID();
  const path = `${orgId}/exports/${uploadId}/${fileName}`;

  const blob = new Blob([content], { type: mimeType });
  const { error: uploadError } = await client.storage
    .from(AGENT_DOCUMENTS_BUCKET)
    .upload(path, blob, { contentType: mimeType, upsert: false });
  if (uploadError) {
    return { ok: false, error: `Upload failed: ${uploadError.message}` };
  }

  const { data: signedData, error: signError } = await client.storage
    .from(AGENT_DOCUMENTS_BUCKET)
    .createSignedUrl(path, EXPORT_SIGNED_URL_TTL_SECONDS);
  if (signError || !signedData) {
    return {
      ok: false,
      error: `Uploaded, but could not generate an access link: ${signError?.message ?? "unknown error"}`,
    };
  }

  const expiresAt = new Date(
    Date.now() + EXPORT_SIGNED_URL_TTL_SECONDS * 1000,
  ).toISOString();
  return { ok: true, url: signedData.signedUrl, fileName, expiresAt };
}
