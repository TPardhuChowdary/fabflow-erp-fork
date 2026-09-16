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
// body, which is `{ photoId, backgroundColor? }` — backgroundColor is
// the only addition Phase 4 makes to this shape, see that phase's own
// header comment above for what it does).
//
// Orphan safety on reprocess: the new processed image is uploaded under
// a FRESH path first; only after the DB row is updated to point at it
// is the OLD processed object (if any) removed, best-effort. If OpenAI
// fails, or the upload fails, processing_status becomes 'failed' and
// processed_storage_path/processed_filename are left completely
// untouched — a prior good processed image is never wiped by a failed
// reprocess attempt.
//
// Phase 4 — AI/manual background color. The images/edits endpoint
// returns pixels only, no structured text alongside them, so it can't
// itself report back "which palette color did I use" for us to store.
// Rather than trust free-text parsing of a color the edit model claims
// to have picked, the choice is always made BEFORE the edit call and
// then told to the edit model as an explicit, deterministic instruction
// — the same mechanism serves both paths:
//   - Manual override: the caller's own (allowlist-validated) choice.
//   - "AI Recommended": one lightweight vision classification call
//     (gpt-5.6-luna via /v1/responses — the same model
//     _shared/openaiProvider.ts already uses live for vision input;
//     reused here as a plain literal via raw fetch, never importing
//     that file, keeping this function's existing isolation) asks the
//     model to pick a palette option number after analyzing the
//     product's brightness/color/material — never freeform text.
// Either way, the exact chosen {name, hex} is known server-side before
// the edit call, so it can be embedded verbatim in the edit prompt AND
// stored in processed_background_color — no parsing of the edit
// response required, no chance of the edit model silently drifting.
//
// Phase 5 — generalized to every asset_photos owner_type (project,
// job_card, inventory_item, machine, tool, die), not just projects.
// Deliberately NOT renamed/split into six functions: nothing below is
// actually project-specific once OWNER_TABLES exists — the file name
// is now a historical artifact (same as how Phase 51's AssetPhotoGallery
// component kept its name after growing beyond its original scope).
// Two things generalize:
//   - has_asset_permission's own p_asset_type param, already keyed
//     dynamically off owner_type in the DB function (see
//     20260915130000_project_photos.sql) — was hardcoded to the
//     literal 'project' here; now passes photoRow.owner_type straight
//     through, so authorization is checked against the CORRECT module
//     per owner type (projects/job_cards/inventory/machinery/tools/
//     tooling_dies) — reusing the exact same routing every other
//     asset_photos reader/writer already goes through, never a new
//     "photo processing" permission.
//   - the "does the owning row genuinely exist, in my org" check,
//     previously a hardcoded `.from("projects")` — now looks up the
//     right table via OWNER_TABLES. Every owner table already has the
//     same {id, organization_id} shape (confirmed live before writing
//     this), so one generic query shape covers all six.
const OWNER_TABLES: Record<string, string> = {
  project: "projects",
  job_card: "job_cards",
  inventory_item: "inventory_items",
  machine: "machines",
  tool: "tools",
  die: "dies",
};

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
// Vision classification call for the "AI Recommended" path only — same
// endpoint/model _shared/openaiProvider.ts already uses live for real
// vision input (see that file's own header), reused here as a literal.
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_CLASSIFY_MODEL = "gpt-5.6-luna";
const ASSET_PHOTOS_BUCKET = "asset-photos";

// The ONLY backgrounds this feature will ever produce or accept — every
// value that reaches the image-edit prompt or the database comes from
// this list, never a frontend- or model-supplied string taken at face
// value. Order matters only for the classification prompt's numbering.
const APPROVED_BACKGROUNDS: ReadonlyArray<{ name: string; hex: string }> = [
  { name: "Pure White", hex: "#FFFFFF" },
  { name: "Warm White", hex: "#FAF9F6" },
  { name: "Light Gray", hex: "#F1F3F5" },
  { name: "Cool Gray", hex: "#E9EEF2" },
  { name: "Soft Blue-Gray", hex: "#E8F0F5" },
  { name: "Soft Beige", hex: "#F3EDE3" },
  { name: "Very Light Slate", hex: "#E5E7EB" },
];

function findApprovedBackground(hex: unknown): { name: string; hex: string } | undefined {
  if (typeof hex !== "string") return undefined;
  const normalized = hex.trim().toUpperCase();
  return APPROVED_BACKGROUNDS.find((b) => b.hex === normalized);
}

function buildEditPrompt(bg: { name: string; hex: string }): string {
  return `You are editing a real photograph of a physical manufactured product or customer sample product, for use as a professional catalog/cover image.

Task: isolate the primary physical product in this photo and completely remove the original background. Replace it with a clean, fully opaque background using EXACTLY this color: ${bg.name} (${bg.hex}). Do not use any other color, shade, gradient, or pattern for the background — this exact color is a fixed requirement, not a suggestion.

Strict requirements — the product itself must look exactly as photographed:
- Preserve the product's exact geometry, proportions, and dimensions.
- Preserve its exact colors, finishes, and textures.
- Preserve every visible detail: holes, welds, edges, hardware, fasteners, labels, and markings.
- Do NOT redesign, recolor, or reshape the product in any way.
- Do NOT add any component that is not in the original photo.
- Do NOT remove any legitimate component that is in the original photo.
- Do NOT hallucinate or invent any missing geometry or detail.
- Do NOT alter or invent any branding, text, or labels.
- The background must be fully opaque — never transparent — and must be exactly ${bg.hex} (${bg.name}).
- A subtle, natural grounding shadow beneath the product is acceptable if it looks realistic.
- The only change should be the background. Do not beautify or otherwise alter the product's physical appearance.`;
}

// Picks one palette option for the "AI Recommended" path by asking a
// real vision-capable model to look at the actual product photo — never
// a guess, never defaults to white. Constrained to respond with only an
// option number (1-7) rather than free-text color names/hex, which
// keeps parsing trivial and impossible to confuse with prose.
async function chooseBackgroundViaAI(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  storagePath: string,
  apiKey: string,
): Promise<{ name: string; hex: string }> {
  const { data: signed, error: signError } = await serviceClient.storage
    .from(ASSET_PHOTOS_BUCKET)
    .createSignedUrl(storagePath, 300);
  if (signError || !signed) {
    throw new Error("Could not prepare the photo for background analysis.");
  }

  const optionsList = APPROVED_BACKGROUNDS.map((b, i) => `${i + 1}. ${b.name} (${b.hex})`).join("\n");
  const prompt = `You are choosing a professional product-photography background color for a physical manufactured product shown in the attached photo.

Analyze the product's dominant colors, brightness, material, and visual characteristics. Choose the ONE option below that gives the product the clearest, most professional contrast and visibility:
- If the product itself is white or very light-colored, do NOT choose a white/near-white background — choose one with enough contrast instead (e.g. a light gray, cool gray, blue-gray, or beige option).
- If the product is dark-colored, prefer a white/warm-white/light neutral option.
- If the product has multiple strong colors, prefer the most neutral option that won't visually compete with it.

Approved options:
${optionsList}

Respond with ONLY the number of your chosen option (1-7). No other words, punctuation, or explanation.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: OPENAI_CLASSIFY_MODEL,
        input: [
          {
            type: "message",
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: signed.signedUrl },
            ],
          },
        ],
        // Reliability fix (Phase 5 live-QA follow-up): this is a
        // reasoning model (see _shared/openaiProvider.ts's own
        // reasoning.effort usage for the same model) — its hidden
        // reasoning tokens count against max_output_tokens, and at 16
        // tokens the model frequently spent the entire budget
        // "thinking" and never emitted the visible answer digit,
        // observed live as incomplete:{reason:"max_output_tokens"}.
        // effort:"low" keeps reasoning minimal for what is a trivial
        // 1-of-7 classification (matches this same codebase's existing
        // convention rather than introducing a new one), and 200 is a
        // generous buffer on top so a still-larger reasoning burst
        // can't reproduce the same failure. Everything else about the
        // call (model, prompt, image, response parsing) is unchanged.
        reasoning: { effort: "low" },
        max_output_tokens: 200,
        store: false,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const parsed = await res.json().catch(() => null);
  if (!res.ok || !parsed) {
    throw new Error(parsed?.error?.message ?? `Background analysis request failed (${res.status}).`);
  }
  // deno-lint-ignore no-explicit-any
  const output = (parsed as any)?.output;
  let text = "";
  if (Array.isArray(output)) {
    for (const item of output) {
      if (item?.type === "message" && Array.isArray(item.content)) {
        const block = item.content.find((c: { type?: string }) => c?.type === "output_text");
        if (block?.text) {
          text = String(block.text);
          break;
        }
      }
    }
  }
  // Normalize whitespace/newlines the model may wrap the digit in, then
  // accept only a genuine 1-7 selection — an exact single-digit answer
  // first (the expected shape), falling back to a word-boundary digit
  // (so "3" inside stray leaked text still parses, but "13" or "2024"
  // never do). Never falls through to an arbitrary/default color: no
  // match is always a thrown, controlled error.
  const trimmedText = text.trim();
  const match = trimmedText.match(/^[1-7]$/) ?? trimmedText.match(/\b[1-7]\b/);
  if (!match) {
    throw new Error("Background analysis did not return a valid selection.");
  }
  return APPROVED_BACKGROUNDS[Number(match[0]) - 1];
}

// Same 3-minute stale threshold specified in the approved architecture;
// same reasoning as emailSyncLock.ts's LOCK_LEASE_MS — comfortably
// longer than a normal request should ever take, short enough that a
// genuinely crashed attempt self-heals promptly rather than wedging the
// photo.
const STALE_PROCESSING_MS = 3 * 60_000;

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

  let body: { photoId?: string; backgroundColor?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }
  const photoId = body.photoId;
  if (!photoId || typeof photoId !== "string") {
    return jsonResponse({ error: "photoId is required." }, 400);
  }
  // Manual override is optional — omitted means "AI Recommended" (the
  // model chooses via chooseBackgroundViaAI below). When present, it
  // must be one of the fixed approved hex values; the frontend only
  // ever sends values from that same list, but this is the actual
  // authorization boundary — never trust it without re-checking here.
  let manualBackground: { name: string; hex: string } | undefined;
  if (body.backgroundColor !== undefined) {
    manualBackground = findApprovedBackground(body.backgroundColor);
    if (!manualBackground) {
      return jsonResponse(
        { error: "Invalid background color. Must be one of the approved palette values." },
        400,
      );
    }
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
  const ownerTable = OWNER_TABLES[photoRow.owner_type];
  if (!ownerTable) {
    return jsonResponse({ error: "AI processing is not available for this photo type." }, 400);
  }

  // Explicit edit-permission check — reading the row above only proved
  // 'view'. Reuses the existing has_asset_permission() SQL function
  // (already EXECUTE-granted to `authenticated`) rather than
  // duplicating its logic here; no new permission is introduced.
  // p_asset_type is the photo's OWN owner_type, never trusted from the
  // request body — has_asset_permission() routes it to the correct
  // module internally (project->projects, job_card->job_cards, etc.),
  // so this is the exact right permission for whatever entity this
  // photo actually belongs to.
  const { data: canEdit, error: permError } = await userClient.rpc("has_asset_permission", {
    p_asset_type: photoRow.owner_type,
    p_action: "edit",
  });
  if (permError) return jsonResponse({ error: permError.message }, 400);
  if (!canEdit) {
    return jsonResponse({ error: "You do not have permission to process this photo." }, 403);
  }

  // Confirms the owning entity genuinely exists and belongs to the
  // caller's organization — that table's own SELECT RLS (view
  // permission + organization_id match) is the real check; this is not
  // inferred solely from asset_photos.organization_id. ownerTable was
  // just validated against the fixed OWNER_TABLES map above, so this is
  // never an arbitrary/unvalidated table name.
  const { data: ownerRow, error: ownerError } = await userClient
    .from(ownerTable)
    .select("id, organization_id")
    .eq("id", photoRow.owner_id)
    .maybeSingle();
  if (ownerError) return jsonResponse({ error: ownerError.message }, 400);
  if (!ownerRow) return jsonResponse({ error: "Owning record not found." }, 404);

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

  // The background is chosen BEFORE the edit call (see this file's own
  // header comment for why): the caller's validated manual choice, or
  // one real vision analysis of the actual product photo. Either way
  // it's a concrete {name, hex} by the time the edit prompt is built —
  // never decided by, or parsed out of, the edit call itself.
  let chosenBackground: { name: string; hex: string };
  if (manualBackground) {
    chosenBackground = manualBackground;
  } else {
    try {
      chosenBackground = await chooseBackgroundViaAI(serviceClient, photoRow.storage_path, OPENAI_API_KEY);
    } catch (err) {
      await markFailed(serviceClient, photoId);
      return jsonResponse(
        { error: safeErrorMessage(err, "Could not analyze the product to choose a background.") },
        502,
      );
    }
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
    form.append("prompt", buildEditPrompt(chosenBackground));
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
  // one it's about to replace. Same {orgId}/{ownerType}/{ownerId}/
  // prefix convention assetPhotosApi.ts's uploadAssetPhoto() already
  // uses for originals — not a new path scheme.
  const newProcessedPath = `${ownerRow.organization_id}/${photoRow.owner_type}/${photoRow.owner_id}/${photoId}-processed-${crypto.randomUUID()}.png`;
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
      processed_background_color: chosenBackground.hex,
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
    {
      status: "ready",
      processedStoragePath: newProcessedPath,
      processedFilename: newProcessedFilename,
      processedBackgroundColor: chosenBackground.hex,
      processedBackgroundName: chosenBackground.name,
    },
    200,
  );
});
