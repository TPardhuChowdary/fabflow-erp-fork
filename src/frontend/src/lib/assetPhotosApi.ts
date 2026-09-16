// Phase 51 (Group 2) — universal asset photo write layer: Machines,
// Dies, Tools, Inventory Items all go through this one module rather
// than each getting its own upload/delete/preview code (see AssetPhoto
// in types.ts). Private Storage bucket "asset-photos", never base64 —
// this deliberately does NOT touch machines.primaryImageData/
// dies.photoData/tools.photoData, which stay exactly as they are as a
// legacy fallback (see callers).
//
// Org-id resolution and the upload/signed-URL shape mirror
// agent/documentUpload.ts's uploadAgentDocument() — the established
// pattern for uploading to a private, org-folder-scoped bucket from the
// browser — not reinvented here.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { AssetOwnerType, AssetPhoto } from "@/types";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

const ASSET_PHOTOS_BUCKET = "asset-photos";
const MAX_ASSET_PHOTO_BYTES = 10 * 1024 * 1024; // 10MB, same ceiling documentUpload.ts uses
const ALLOWED_ASSET_PHOTO_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour — regenerated on each view (see getAssetPhotoSignedUrl), unlike documentUpload's one-off long-lived link

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

/** Same path-safety reasoning as documentUpload.ts's sanitizeFileName —
 * strips separators/non-printables so a crafted filename can't escape
 * the {orgId}/{ownerType}/{ownerId}/ prefix or inject extra segments. */
function sanitizeFileName(rawName: string): string {
  const noSeparators = rawName.split("/").join("_").split("\\").join("_");
  let printable = "";
  for (let i = 0; i < noSeparators.length; i++) {
    const code = noSeparators.charCodeAt(i);
    if (code > 31 && code !== 127) printable += noSeparators[i];
  }
  const trimmed = printable.slice(-150);
  return trimmed.length > 0 ? trimmed : "photo";
}

export function validateAssetPhotoFile(
  file: File,
): { ok: true } | { ok: false; reason: string } {
  if (!ALLOWED_ASSET_PHOTO_MIME_TYPES.has(file.type)) {
    return {
      ok: false,
      reason: `Unsupported file type (${file.type || "unknown"}). Allowed: JPG, PNG, WEBP.`,
    };
  }
  if (file.size > MAX_ASSET_PHOTO_BYTES) {
    return {
      ok: false,
      reason: `File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum is ${MAX_ASSET_PHOTO_BYTES / (1024 * 1024)}MB.`,
    };
  }
  if (file.size === 0) return { ok: false, reason: "File is empty." };
  return { ok: true };
}

function rowToAssetPhoto(row: Record<string, unknown>): AssetPhoto {
  return {
    id: row.id as string,
    ownerType: row.owner_type as AssetOwnerType,
    ownerId: row.owner_id as string,
    storagePath: row.storage_path as string,
    originalFilename: (row.original_filename as string) ?? undefined,
    mimeType: (row.mime_type as string) ?? undefined,
    sizeBytes: (row.size_bytes as number) ?? undefined,
    displayOrder: row.display_order as number,
    caption: (row.caption as string) ?? undefined,
    isPrimary: row.is_primary as boolean,
    uploadedBy: (row.uploaded_by as string) ?? undefined,
    createdAt: new Date(row.created_at as string).getTime(),
    updatedAt: new Date(row.updated_at as string).getTime(),
    processingStatus:
      (row.processing_status as AssetPhoto["processingStatus"]) ?? undefined,
    processedStoragePath: (row.processed_storage_path as string) ?? undefined,
    processedFilename: (row.processed_filename as string) ?? undefined,
    coverUsesProcessed: row.cover_uses_processed as boolean,
    processedBackgroundColor:
      (row.processed_background_color as string) ?? undefined,
  };
}

// Phase 4 — the ONE allowlist this whole feature is built around: every
// swatch the UI can show, every value requestAssetPhotoProcessing can
// send, and every value the Edge Function will accept comes from this
// exact list (mirrored server-side in
// supabase/functions/process-project-photo/index.ts's own
// APPROVED_BACKGROUNDS — kept in sync by hand since the frontend can't
// import Deno function code, same reasoning the Edge Function's own
// header gives for staying isolated from openaiProvider.ts). Never
// construct a background value any other way.
export const BACKGROUND_PALETTE: ReadonlyArray<{ name: string; hex: string }> =
  [
    { name: "Pure White", hex: "#FFFFFF" },
    { name: "Warm White", hex: "#FAF9F6" },
    { name: "Light Gray", hex: "#F1F3F5" },
    { name: "Cool Gray", hex: "#E9EEF2" },
    { name: "Soft Blue-Gray", hex: "#E8F0F5" },
    { name: "Soft Beige", hex: "#F3EDE3" },
    { name: "Very Light Slate", hex: "#E5E7EB" },
  ];

/** Looks up a palette entry by hex (case-insensitive) — used to render
 * "AI selected: {name}" from a stored processedBackgroundColor. Returns
 * undefined for a processed image from before this phase, which the UI
 * shows as a generic label rather than treating as an error. */
export function findBackgroundByHex(
  hex: string | undefined,
): { name: string; hex: string } | undefined {
  if (!hex) return undefined;
  const normalized = hex.trim().toUpperCase();
  return BACKGROUND_PALETTE.find((b) => b.hex === normalized);
}

/** Uploads one photo for the given asset and inserts its asset_photos
 * row. `isPrimary: true` does NOT unset any existing primary — call
 * setPrimaryAssetPhoto() separately if that's the intent (kept as two
 * explicit steps rather than one implicit one, same "never surprise the
 * caller" spirit as documentUpload.ts's upsert:false). */
export async function uploadAssetPhoto(
  ownerType: AssetOwnerType,
  ownerId: string,
  file: File,
  opts?: { caption?: string; displayOrder?: number },
): Promise<WriteResult<AssetPhoto>> {
  const validation = validateAssetPhotoFile(file);
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

  const path = `${orgId}/${ownerType}/${ownerId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;

  const { error: uploadError } = await client.storage
    .from(ASSET_PHOTOS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    return { status: "error", error: `Upload failed: ${uploadError.message}` };
  }

  const { data, error } = await client
    .from("asset_photos")
    .insert({
      owner_type: ownerType,
      owner_id: ownerId,
      storage_path: path,
      original_filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      display_order: opts?.displayOrder ?? 0,
      caption: opts?.caption ?? null,
      uploaded_by: userId,
    })
    .select()
    .single();
  if (error) {
    // Row insert failed after a successful upload — best-effort remove
    // the now-orphaned Storage object rather than leaving it dangling
    // with nothing in the database referencing it (same reasoning as
    // documentUpload.ts's orphan-cleanup section).
    await client.storage.from(ASSET_PHOTOS_BUCKET).remove([path]);
    return { status: "error", error: error.message };
  }
  return { status: "success", data: rowToAssetPhoto(data) };
}

/** Signed URLs are regenerated on demand rather than stored — the DB
 * only ever holds storage_path (see AssetPhoto), so a photo stays
 * viewable indefinitely without a stale/expired link baked into a
 * database row. */
export async function getAssetPhotoSignedUrl(
  storagePath: string,
): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const client = getSupabase();
  const { data, error } = await client.storage
    .from(ASSET_PHOTOS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Which storage path a cover photo should display — shared by
 * ProjectDetail.tsx and Projects.tsx so the fallback rule (Phase 3:
 * cover_uses_processed=true but no processedStoragePath yet/anymore ->
 * never show a broken cover, fall back to the original) lives in one
 * place instead of being reimplemented at each call site. */
export function resolveCoverStoragePath(
  photo: Pick<
    AssetPhoto,
    "storagePath" | "processedStoragePath" | "coverUsesProcessed"
  >,
): string {
  if (photo.coverUsesProcessed && photo.processedStoragePath) {
    return photo.processedStoragePath;
  }
  return photo.storagePath;
}

export async function deleteAssetPhoto(
  photo: Pick<AssetPhoto, "id" | "storagePath" | "processedStoragePath">,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("asset_photos")
    .delete()
    .eq("id", photo.id)
    .select("id");
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as { id: string }[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was deleted (blocked by RLS, or the photo does not exist)",
    };
  }
  // Best-effort — the DB row is the source of truth for what's "still a
  // photo"; a Storage object orphaned by a failed remove() here is a
  // harmless leftover, never masks the successful delete just reported.
  // The row's processed derivative (if any — Project Photos AI
  // processing, Phase 2) is deleted the same way: once the row is gone
  // there is nothing left that could ever reference that object again.
  const paths = [photo.storagePath];
  if (photo.processedStoragePath) paths.push(photo.processedStoragePath);
  await gate.client.storage.from(ASSET_PHOTOS_BUCKET).remove(paths);
  return { status: "success" };
}

/** Unsets any existing primary photo for this owner first, then sets
 * the target — that order (never the reverse) is what keeps
 * uq_asset_photos_one_primary from ever seeing two rows both true at
 * once, even momentarily. */
export async function setPrimaryAssetPhoto(
  photoId: string,
  ownerType: AssetOwnerType,
  ownerId: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { error: unsetError } = await gate.client
    .from("asset_photos")
    .update({ is_primary: false })
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId)
    .eq("is_primary", true);
  if (unsetError) return { status: "error", error: unsetError.message };

  const { data, error } = await gate.client
    .from("asset_photos")
    .update({ is_primary: true })
    .eq("id", photoId)
    .select("id");
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as { id: string }[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the photo does not exist)",
    };
  }
  return { status: "success" };
}

// Phase 3 — Project Photos cover variant (original vs. processed).
// Deliberately its own single-purpose writer, not a generic "update any
// asset_photos column" API — same one-writer-per-concern shape as
// setPrimaryAssetPhoto() above. Never touches is_primary, storage_path,
// or processed_storage_path — RLS (asset_photos_update:
// has_asset_permission(owner_type, 'edit') + organization_id =
// current_organization_id()) is the actual authorization boundary,
// same as every other write in this file.
//
// Phase 5 — allowed for every owner_type that has a meaningful place to
// actually DISPLAY a cover (project's external ProjectDetail/Projects
// list, and machine/die/tool's own AssetPhotoGallery heroMode — see
// that component's heroImgUrl, which now reads this same field). NOT
// inventory_item/job_card: neither has a hero/cover display anywhere
// (confirmed in the architecture audit — their galleries are plain
// thumbnail strips), so exposing this toggle for them would set a flag
// nothing ever reads — a second, meaningless source of "truth" rather
// than reuse. If either entity grows a hero display later, add its
// owner_type here rather than inventing a parallel flag.
const COVER_VARIANT_OWNER_TYPES = [
  "project",
  "machine",
  "die",
  "tool",
] as const;

export async function setPhotoCoverVariant(
  photoId: string,
  useProcessed: boolean,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("asset_photos")
    .update({ cover_uses_processed: useProcessed })
    .eq("id", photoId)
    .in("owner_type", COVER_VARIANT_OWNER_TYPES)
    .select("id");
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as { id: string }[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error:
        "No row was updated (blocked by RLS, this photo type has no cover concept, or the photo does not exist)",
    };
  }
  return { status: "success" };
}

// Phase 2 — AI background removal. Dedicated Edge Function
// (supabase/functions/process-project-photo/index.ts — filename is a
// historical artifact, see that function's own Phase 5 header comment),
// never the ChatProvider/agent-chat relay — see that function's own
// header for why. Same request shape as every other Edge Function
// invocation in this codebase (lib/accountRecoveryApi.ts's own invoke()
// helper is the model this mirrors, adapted for this function's own
// response shape rather than that file's `{ success, error }`
// convention).
//
// Phase 5 — works for every AI-capable owner type (project, job_card,
// inventory_item, machine, tool, die), not project-only: the Edge
// Function itself derives owner_type from the photo row and checks the
// matching permission, so this call is identical regardless of which
// entity the photo belongs to. Renamed from
// requestAssetPhotoProcessing to match.
export interface PhotoProcessingResult {
  status: "ready" | "processing";
  processedStoragePath?: string;
  processedFilename?: string;
  /** Phase 4 — the palette hex actually used for this run (AI-chosen or
   * the caller's own manual choice echoed back). */
  processedBackgroundColor?: string;
  processedBackgroundName?: string;
  message?: string;
}

/** Requests AI background processing for one asset photo (any
 * AI-capable owner type). Same call whether this is the first "Process
 * with AI" or an explicit "Reprocess" — the Edge Function's own atomic
 * claim (keyed off the row's current processing_status) is what
 * distinguishes them, not a flag here. A 409 "already processing"
 * response is not an error — it comes back as a normal success with
 * status: "processing" so the UI can show "already processing" instead
 * of a failure toast.
 *
 * `backgroundColor` is optional and, when passed, MUST be one of
 * BACKGROUND_PALETTE's own hex values — this is the "Reprocess with
 * Selected Background" / manual-override path (Phase 4). Omitted means
 * "AI Recommended": the Edge Function analyzes the product itself and
 * picks a palette color server-side. The Edge Function re-validates
 * this value against its own allowlist regardless — this check here is
 * a cheap early reject, never the actual authorization boundary. */
export async function requestAssetPhotoProcessing(
  photoId: string,
  backgroundColor?: string,
): Promise<WriteResult<PhotoProcessingResult>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  if (backgroundColor !== undefined && !findBackgroundByHex(backgroundColor)) {
    return { status: "error", error: "Invalid background color." };
  }

  const { data, error } = await gate.client.functions.invoke<
    PhotoProcessingResult & { error?: string }
  >("process-project-photo", { body: { photoId, backgroundColor } });

  if (error) {
    const context = (
      error as { context?: { json?: () => Promise<Record<string, unknown>> } }
    ).context;
    if (context?.json) {
      try {
        const errBody = await context.json();
        if (errBody.status === "processing") {
          return {
            status: "success",
            data: {
              status: "processing",
              message: (errBody.message as string) ?? "Already processing.",
            },
          };
        }
        return {
          status: "error",
          error: (errBody.error as string) || error.message,
        };
      } catch {
        // fall through to the generic error below
      }
    }
    return { status: "error", error: error.message };
  }
  if (!data) {
    return {
      status: "error",
      error: "No response from the AI processing service.",
    };
  }
  return { status: "success", data };
}
