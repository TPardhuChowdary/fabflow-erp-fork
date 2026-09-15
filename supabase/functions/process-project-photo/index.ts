// Project Photos — AI background removal (Phase 2). Dedicated,
// single-purpose Edge Function, deliberately separate from agent-chat/
// _shared/openaiProvider.ts: those implement ChatProvider (text/tool-
// call chat with vision INPUT only — see that file's own ChatContentBlock
// union, which has no image-output type at all). A one-shot image EDIT
// is architecturally a different operation — this file talks to
// OpenAI's dedicated image-edit endpoint directly via raw fetch, the
// same "no vendor SDK for one HTTP call" house convention
// openaiProvider.ts already established, and never touches that file,
// agent-chat/index.ts, or provider.ts.
//
// Two Supabase clients, deliberately different privilege levels (exact
// same split as email-sync/index.ts's own header comment explains):
//   - `userClient` (the caller's own forwarded JWT) does the ONE thing
//     that must be authorization-checked against the real user: reading
//     the target asset_photos row (RLS: has_asset_permission(owner_type,
//     'view') + organization_id = current_organization_id() — the exact
//     same policy every other asset-photos reader already goes through),
//     an explicit has_asset_permission('project','edit') check, and the
//     atomic claim UPDATE (covered by asset_photos_update's RLS too —
//     defense in depth, not just app-level logic).
//   - `serviceClient` (service-role) does everything AFTER that
//     authorization is established: reading the original photo's bytes
//     from Storage, calling OpenAI, writing the processed image back to
//     Storage, and the final DB update. Never used for the authorization
//     decision itself.
//
// Idempotency/concurrency: reuses the exact atomic-conditional-UPDATE
// claim idiom already proven in _shared/emailSyncLock.ts's
// claimSyncLock() (one UPDATE ... WHERE <not already fresh-locked>
// RETURNING id; 0 rows = someone else already owns it) — applied
// directly to asset_photos.processing_status, no new lock table. Staleness
// uses the column asset_photos already has (updated_at, auto-maintained
// by the existing set_updated_at_timestamp() trigger) rather than a new
// lease column — a fresh 'processing' row is NOT claimable; one older
// than STALE_PROCESSING_MS is (a crashed/never-returned prior attempt
// self-heals rather than wedging the photo forever).
//
// "Process with AI" vs "Reprocess" is not a separate request shape —
// the SAME claim query allows claiming from NULL, 'failed', OR 'ready'
// uniformly (see instructions: ready is "claimable only when explicitly
// requesting reprocess" — in practice the UI only ever shows a
// "Reprocess" button, never "Process with AI", once status is already
// 'ready', so reaching this endpoint with a 'ready' row already IS the
// explicit reprocess request; no extra flag is needed in the request
// body, which stays exactly `{ photoId }` per the approved architecture).
//
// Orphan safety on reprocess: the new processed image is uploaded under
// a FRESH path first; only after the DB row is updated to point at it
// is the OLD processed object (if any) removed, best-effort. If OpenAI
// fails, or the upload fails, processing_status becomes 'failed' and
// processed_storage_path/processed_filename are left completely
// untouched — a prior good processed image is never wiped by a failed
// reprocess attempt.

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// Verified live against the currently-deployed OpenAI images/edits docs
// immediately before writing this file (see chat) — not guessed from
// training-data memory. "sunburst" is OpenAI's own precision-editing
// tier, explicitly recommended for "workflows where editing precision
// matters most", which is exactly this use case (preserve the
// photographed product, change only the background).
const OPENAI_IMAGE_EDIT_URL = "https://api.openai.com/v1/images/edits";
const OPENAI_IMAGE_MODEL = "gpt-image-2.5-sunburst";
const ASSET_PHOTOS_BUCKET = "asset-photos";

// Same 3-minute stale threshold specified in the approved architecture;
// same reasoning as emailSyncLock.ts's LOCK_LEASE_MS — comfortably
// longer than a normal request should ever take, short enough that a
// genuinely crashed attempt self-heals promptly rather than wedging the
// photo.
const STALE_PROCESSING_MS = 3 * 60_000;

const EDIT_PROMPT = `You are editing a real photograph of a physical manufactured product or customer sample product, for use as a professional catalog/cover image.

Task: isolate the primary physical product in this photo and completely remove the original background. Replace it with a clean, opaque, soft white / very light neutral pastel background suitable for a professional industrial product photograph.

Strict requirements — the product itself must look exactly as photographed:
- Preserve the product's exact geometry, proportions, and dimensions.
- Preserve its exact colors, finishes, and textures.
- Preserve every visible detail: holes, welds, edges, hardware, fasteners, labels, and markings.
- Do NOT redesign the product in any way.
- Do NOT add any component that is not in the original photo.
- Do NOT remove any legitimate component that is in the original photo.
- Do NOT hallucinate or invent any missing geometry or detail.
- Do NOT alter or invent any branding, text, or labels.
- The background must be fully opaque — never transparent.
- The background must be a plain, soft white or very light neutral pastel tone — no strong colors, gradients, patterns, scenery, people, machinery, or rooms.
- A subtle, natural grounding shadow beneath the product is acceptable if it looks realistic.
- The only change should be the background. Do not beautify or otherwise alter the product's physical appearance.`;

interface AssetPhotoRow {
  id: string;
  owner_type: string;
  owner_id: string;
  storage_path: string;
  original_filename: string | null;
  mime_type: string | null;
  processed_storage_path: string | null;
}

function safeErrorMessage(err: unknown, fallback: string): string {
  // Never forward a raw stack trace or an unfiltered vendor response
  // body — just a message string, same discipline openaiProvider.ts's
  // own error handling already uses live.
  if (err instanceof Error) return err.message;
  return fallback;
}

// deno-lint-ignore no-explicit-any
async function markFailed(serviceClient: any, photoId: string): Promise<void> {
  // Deliberately touches ONLY processing_status/updated_at — never
  // processed_storage_path/processed_filename, so a prior good
  // processed image from an earlier successful run survives a failed
  // reprocess attempt untouched, exactly as required.
  try {
    await serviceClient
      .from("asset_photos")
      .update({ processing_status: "failed", updated_at: new Date().toISOString() })
      .eq("id", photoId);
  } catch (err) {
    // Best-effort — if even this write fails, the row is left mid-
    // "processing" and will self-heal via the staleness window on the
    // next attempt rather than throwing a second error over the one
    // already being returned to the client.
    console.error(`[process-project-photo] could not mark photo ${photoId} failed:`, safeErrorMessage(err, "unknown error"));
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Server misconfigured: missing Supabase environment." }, 500);
  }
  if (!OPENAI_API_KEY) {
    return jsonResponse(
      { error: "AI photo processing is not configured yet (no OPENAI_API_KEY secret set on this project)." },
      501,
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing Authorization header." }, 401);
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: "Not authenticated." }, 401);
  }

  let body: { photoId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }
  const photoId = body.photoId;
  if (!photoId || typeof photoId !== "string") {
    return jsonResponse({ error: "photoId is required." }, 400);
  }

  // RLS (on userClient) is the real authorization check for READ access
  // here, same reasoning as email-sync/index.ts: a user without
  // has_asset_permission('project','view') on their own org, or asking
  // for a photo in a different org, gets zero rows back — no
  // distinction leaked between "not yours" and "doesn't exist". Never
  // trusts a projectId from the request body (there isn't one) — the
  // owning project is always resolved server-side from this row's own
  // owner_id.
  const { data: photo, error: photoError } = await userClient
    .from("asset_photos")
    .select("id, owner_type, owner_id, storage_path, original_filename, mime_type, processed_storage_path")
    .eq("id", photoId)
    .maybeSingle();
  if (photoError) return jsonResponse({ error: photoError.message }, 400);
  if (!photo) return jsonResponse({ error: "Photo not found." }, 404);
  const photoRow = photo as AssetPhotoRow;
  if (photoRow.owner_type !== "project") {
    return jsonResponse({ error: "AI processing is only available for project photos." }, 400);
  }

  // Explicit edit-permission check — reading the row above only proved
  // 'view'. Reuses the existing has_asset_permission() SQL function
  // (already EXECUTE-granted to `authenticated`) rather than
  // duplicating its logic here; no new permission is introduced.
  const { data: canEdit, error: permError } = await userClient.rpc("has_asset_permission", {
    p_asset_type: "project",
    p_action: "edit",
  });
  if (permError) return jsonResponse({ error: permError.message }, 400);
  if (!canEdit) {
    return jsonResponse({ error: "You do not have permission to process this photo." }, 403);
  }

  // Confirms the owning project genuinely exists and belongs to the
  // caller's organization — projects_select RLS (projects.view +
  // organization_id match) is the real check; this is not inferred
  // solely from asset_photos.organization_id.
  const { data: project, error: projectError } = await userClient
    .from("projects")
    .select("id, organization_id")
    .eq("id", photoRow.owner_id)
    .maybeSingle();
  if (projectError) return jsonResponse({ error: projectError.message }, 400);
  if (!project) return jsonResponse({ error: "Project not found." }, 404);

  // ── Atomic claim ────────────────────────────────────────────────
  // Exact same idiom as _shared/emailSyncLock.ts's claimSyncLock(): one
  // conditional UPDATE, 0 rows returned means someone else already owns
  // it (or it's a fresh in-flight attempt) — never a second, silently
  // duplicate OpenAI call for a double-click or concurrent request.
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  const { data: claimed, error: claimError } = await userClient
    .from("asset_photos")
    .update({ processing_status: "processing", updated_at: new Date().toISOString() })
    .eq("id", photoId)
    .or(
      `processing_status.is.null,processing_status.eq.failed,processing_status.eq.ready,and(processing_status.eq.processing,updated_at.lt.${staleBefore})`,
    )
    .select("id")
    .maybeSingle();
  if (claimError) return jsonResponse({ error: claimError.message }, 400);
  if (!claimed) {
    return jsonResponse({ status: "processing", message: "This photo is already being processed." }, 409);
  }

  // ── Execution phase — service-role from here on ────────────────
  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const priorProcessedPath = photoRow.processed_storage_path; // captured before this run, for orphan cleanup only after success

  // Original bytes come directly from Storage via the service-role
  // client — never a signed URL round trip for the server-to-OpenAI
  // transfer (a signed URL is unnecessary indirection for a trusted
  // server context, and the instructions explicitly call for direct
  // Storage access here).
  const { data: originalBlob, error: downloadError } = await serviceClient.storage
    .from(ASSET_PHOTOS_BUCKET)
    .download(photoRow.storage_path);
  if (downloadError || !originalBlob) {
    await markFailed(serviceClient, photoId);
    return jsonResponse({ error: "Could not read the original photo." }, 502);
  }

  let editedBytes: Uint8Array;
  try {
    const form = new FormData();
    form.append("model", OPENAI_IMAGE_MODEL);
    form.append(
      "image",
      new File([originalBlob], photoRow.original_filename || "photo.png", {
        type: photoRow.mime_type || "image/png",
      }),
    );
    form.append("prompt", EDIT_PROMPT);
    form.append("background", "opaque"); // never transparent, per the API's own documented enum
    // input_fidelity omitted: live-tested against the real API and
    // gpt-image-2.5-sunburst rejects it ("does not support the
    // 'input_fidelity' parameter") despite general docs listing it as a
    // model-agnostic option — trust the live 400, not the doc table.
    form.append("output_format", "png");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    let res: Response;
    try {
      res = await fetch(OPENAI_IMAGE_EDIT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: form,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const parsed = await res.json().catch(() => null);
    if (!res.ok || !parsed) {
      throw new Error(parsed?.error?.message ?? `Image edit request failed (${res.status}).`);
    }
    const b64 = parsed?.data?.[0]?.b64_json;
    if (!b64 || typeof b64 !== "string") {
      throw new Error("Image edit response did not include image data.");
    }
    const bin = atob(b64);
    editedBytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) editedBytes[i] = bin.charCodeAt(i);
  } catch (err) {
    await markFailed(serviceClient, photoId);
    return jsonResponse({ error: safeErrorMessage(err, "AI image processing failed.") }, 502);
  }

  // Fresh path every run (never the same path twice) — the orphan-safe
  // ordering below depends on the new object never colliding with the
  // one it's about to replace.
  const newProcessedPath = `${project.organization_id}/project/${project.id}/${photoId}-processed-${crypto.randomUUID()}.png`;
  const newProcessedFilename = `${(photoRow.original_filename || "photo").replace(/\.[^.]+$/, "")}-processed.png`;

  const { error: uploadError } = await serviceClient.storage
    .from(ASSET_PHOTOS_BUCKET)
    .upload(newProcessedPath, editedBytes, { contentType: "image/png", upsert: false });
  if (uploadError) {
    await markFailed(serviceClient, photoId);
    return jsonResponse({ error: "Could not store the processed image." }, 502);
  }

  const { error: updateError } = await serviceClient
    .from("asset_photos")
    .update({
      processed_storage_path: newProcessedPath,
      processed_filename: newProcessedFilename,
      processing_status: "ready",
      updated_at: new Date().toISOString(),
    })
    .eq("id", photoId);
  if (updateError) {
    // The new object exists in Storage but nothing references it yet —
    // best-effort remove it now rather than leaving an avoidable orphan
    // (same reasoning as assetPhotosApi.ts's own upload-then-insert
    // rollback). The prior good processed_storage_path (if any) was
    // never touched by this failed UPDATE, so it remains exactly as it
    // was.
    await serviceClient.storage.from(ASSET_PHOTOS_BUCKET).remove([newProcessedPath]);
    await markFailed(serviceClient, photoId);
    return jsonResponse({ error: "Could not save the processed image record." }, 502);
  }

  // Only now, after the DB row genuinely points at the new object, is
  // the previous processed object (if this was a reprocess) removed.
  // Best-effort: a leftover old object here is a harmless orphan, never
  // something that should mask the success already achieved.
  if (priorProcessedPath && priorProcessedPath !== newProcessedPath) {
    await serviceClient.storage.from(ASSET_PHOTOS_BUCKET).remove([priorProcessedPath]).catch(() => {});
  }

  return jsonResponse(
    { status: "ready", processedStoragePath: newProcessedPath, processedFilename: newProcessedFilename },
    200,
  );
});
