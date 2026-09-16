// Phase 51 (Group 2) — the one reusable photo UI for Machines, Dies,
// Tools, and Inventory Items (see AssetPhoto in types.ts,
// lib/assetPhotosApi.ts for the write layer). Used from each entity's
// own detail page/dialog with a different ownerType/ownerId, never
// duplicated per domain.
//
// The whole point of this component existing is the UX bug named across
// every Group 2 phase report: clicking an existing photo must open a
// PREVIEW, never the upload dialog. "Add Photo" is its own explicit
// button; the file input it triggers is visually hidden and never sits
// behind the thumbnails themselves.

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BACKGROUND_PALETTE,
  deleteAssetPhoto,
  findBackgroundByHex,
  getAssetPhotoSignedUrl,
  requestAssetPhotoProcessing,
  setPhotoCoverVariant,
  uploadAssetPhoto,
} from "@/lib/assetPhotosApi";
import { setPrimaryAssetPhoto } from "@/lib/assetPhotosApi";
import { useStore } from "@/store";
import type { AssetOwnerType, AssetPhoto } from "@/types";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ImagePlus,
  Loader2,
  RotateCw,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

interface AssetPhotoGalleryProps {
  ownerType: AssetOwnerType;
  ownerId: string;
  canEdit: boolean;
  /** Existing single base64 photo (machines.primaryImageData /
   * dies.photoData / tools.photoData) — shown as a read-only fallback
   * ONLY when this asset has zero real AssetPhoto rows yet, so a photo
   * uploaded before this system existed never just disappears. */
  legacyPhotoDataUrl?: string;
  /** Large single-photo card (matches the existing per-entity header
   * card these replace, e.g. MachineDetail.tsx's own photo box) instead
   * of the default compact thumbnail-strip layout. Shows the primary
   * photo (or first, or the legacy fallback) filling `heroClassName`;
   * clicking it opens the same preview dialog the thumbnail strip uses.
   * Additional photos beyond the primary still get a thumbnail strip
   * underneath so multi-photo assets stay fully browsable. */
  heroMode?: boolean;
  heroClassName?: string;
  heroAlt?: string;
  "data-ocid"?: string;
}

export function AssetPhotoGallery({
  ownerType,
  ownerId,
  canEdit,
  legacyPhotoDataUrl,
  heroMode,
  heroClassName,
  heroAlt,
  "data-ocid": dataOcid,
}: AssetPhotoGalleryProps) {
  const {
    assetPhotos,
    addAssetPhotoLocal,
    removeAssetPhotoLocal,
    updateAssetPhotoLocal,
  } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  // Phase 2 — AI background removal (originally project-only; Phase 5
  // generalized it to every owner type asset_photos supports — see the
  // AI-processing block's own comment below). A photo whose owner type
  // never requests processing simply never sets processingStatus, so
  // all of this stays completely inert for it (no extra network calls,
  // no UI change) — nothing here assumes a specific ownerType.
  const [processedSignedUrls, setProcessedSignedUrls] = useState<
    Record<string, string>
  >({});
  const [processingPhotoId, setProcessingPhotoId] = useState<string | null>(
    null,
  );
  const [viewingProcessed, setViewingProcessed] = useState(false);
  // Phase 4 — manual background override. showBackgroundPicker reveals
  // the swatch row ("Change Background"); selectedBackground is the
  // pending choice within it until "Reprocess with Selected Background"
  // is actually clicked — picking a swatch alone never triggers a call.
  const [showBackgroundPicker, setShowBackgroundPicker] = useState(false);
  const [selectedBackground, setSelectedBackground] = useState<string | null>(
    null,
  );

  const photos = useMemo(
    () =>
      (assetPhotos || [])
        .filter((p) => p.ownerType === ownerType && p.ownerId === ownerId)
        .sort(
          (a, b) =>
            a.displayOrder - b.displayOrder || a.createdAt - b.createdAt,
        ),
    [assetPhotos, ownerType, ownerId],
  );
  const usingLegacyFallback = photos.length === 0 && !!legacyPhotoDataUrl;

  // Eagerly resolve signed URLs for every real photo — small expected
  // count per asset (a handful), so one round-trip per photo on mount/
  // change is simpler and fine, not a paginated/lazy scheme. Deliberately
  // keyed on `photos` only: reading signedUrls[p.id] to compute `missing`
  // must NOT also make signedUrls a dependency, or every resolved URL
  // would immediately re-trigger the effect and refetch everything again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const missing = photos.filter((p) => !signedUrls[p.id]);
      if (missing.length === 0) return;
      const entries = await Promise.all(
        missing.map(
          async (p) =>
            [p.id, await getAssetPhotoSignedUrl(p.storagePath)] as const,
        ),
      );
      if (cancelled) return;
      setSignedUrls((prev) => {
        const next = { ...prev };
        for (const [id, url] of entries) if (url) next[id] = url;
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [photos]);

  // Same shape as the original-photo signed-URL effect above, applied to
  // whichever photos have a processed derivative — `withProcessed` is
  // simply empty (this never fires) for any photo that hasn't been
  // AI-processed yet, regardless of owner type.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see the original-photo effect's own comment — processedSignedUrls must stay out of the deps for the same reason
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const withProcessed = photos.filter(
        (p) => p.processedStoragePath && !processedSignedUrls[p.id],
      );
      if (withProcessed.length === 0) return;
      const entries = await Promise.all(
        withProcessed.map(
          async (p) =>
            [
              p.id,
              await getAssetPhotoSignedUrl(p.processedStoragePath as string),
            ] as const,
        ),
      );
      if (cancelled) return;
      setProcessedSignedUrls((prev) => {
        const next = { ...prev };
        for (const [id, url] of entries) if (url) next[id] = url;
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [photos]);

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setIsUploading(true);
    try {
      const result = await uploadAssetPhoto(ownerType, ownerId, file, {
        displayOrder: photos.length,
      });
      if (result.status === "unauthenticated") {
        toast.error("Not signed in to Supabase - photo was not uploaded.");
        return;
      }
      if (
        result.status === "error" ||
        result.status === "denied" ||
        !result.data
      ) {
        toast.error(
          `Could not upload photo: ${result.error ?? "unknown error"}`,
        );
        return;
      }
      addAssetPhotoLocal(result.data);
      // First real photo for this asset — make it primary automatically
      // so the thumbnail/header views (which show only the primary) have
      // something to show without a separate manual step.
      if (photos.length === 0) {
        const primaryResult = await setPrimaryAssetPhoto(
          result.data.id,
          ownerType,
          ownerId,
        );
        if (primaryResult.status === "success") {
          updateAssetPhotoLocal({ ...result.data, isPrimary: true });
        }
      }
      toast.success("Photo added");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSetPrimary(photo: AssetPhoto) {
    if (photo.isPrimary) return;
    setIsBusy(true);
    try {
      const result = await setPrimaryAssetPhoto(photo.id, ownerType, ownerId);
      if (result.status !== "success") {
        toast.error(
          `Could not set primary photo: ${result.error ?? "unknown error"}`,
        );
        return;
      }
      for (const p of photos) {
        if (p.isPrimary && p.id !== photo.id)
          updateAssetPhotoLocal({ ...p, isPrimary: false });
      }
      updateAssetPhotoLocal({ ...photo, isPrimary: true });
      toast.success("Primary photo updated");
    } finally {
      setIsBusy(false);
    }
  }

  // Phase 2 — AI background removal, generalized in Phase 5 to every
  // AI-capable owner type (see requestAssetPhotoProcessing's own
  // comment). Same call whether this is the first "Process with AI"
  // click or an explicit "Reprocess" — no extra flag is needed. The
  // Edge Function call is synchronous (the whole OpenAI + Storage + DB
  // round trip happens inside that one request), so the final outcome
  // is already known when it resolves — no polling loop is needed here.
  // Phase 4 — backgroundColor omitted means "AI Recommended" (the Edge
  // Function analyzes the product and picks a palette color itself);
  // passed means "Reprocess with Selected Background" (deterministic —
  // see requestAssetPhotoProcessing's own comment). Either way the
  // real response tells us which color was actually used, so the local
  // state update never has to guess.
  async function handleProcess(photo: AssetPhoto, backgroundColor?: string) {
    setProcessingPhotoId(photo.id);
    try {
      const result = await requestAssetPhotoProcessing(
        photo.id,
        backgroundColor,
      );
      if (result.status !== "success" || !result.data) {
        toast.error(`AI processing failed: ${result.error ?? "unknown error"}`);
        // The Edge Function's own claim already flips processing_status
        // to 'processing' before it does anything else, and marks it
        // 'failed' on any error — reflect that locally now rather than
        // waiting for a reload, so Retry appears immediately.
        updateAssetPhotoLocal({ ...photo, processingStatus: "failed" });
        return;
      }
      if (result.data.status === "processing") {
        toast(result.data.message ?? "This photo is already being processed.");
        updateAssetPhotoLocal({ ...photo, processingStatus: "processing" });
        return;
      }
      updateAssetPhotoLocal({
        ...photo,
        processingStatus: "ready",
        processedStoragePath: result.data.processedStoragePath,
        processedFilename: result.data.processedFilename,
        processedBackgroundColor: result.data.processedBackgroundColor,
      });
      setShowBackgroundPicker(false);
      setSelectedBackground(null);
      toast.success(
        result.data.processedBackgroundName
          ? `AI selected: ${result.data.processedBackgroundName}`
          : "AI processing complete — review the result before using it as the cover.",
      );
    } finally {
      setProcessingPhotoId(null);
    }
  }

  // Phase 3 — Project Photos cover variant. Never touches is_primary —
  // this photo is already the cover (that's why the action is only
  // shown when previewPhoto.isPrimary); it only changes which of this
  // row's two images the cover displays.
  async function handleSetCoverVariant(
    photo: AssetPhoto,
    useProcessed: boolean,
  ) {
    setIsBusy(true);
    try {
      const result = await setPhotoCoverVariant(photo.id, useProcessed);
      if (result.status !== "success") {
        toast.error(
          `Could not update cover: ${result.error ?? "unknown error"}`,
        );
        return;
      }
      updateAssetPhotoLocal({ ...photo, coverUsesProcessed: useProcessed });
      toast.success(
        useProcessed
          ? "Using processed image as cover"
          : "Using original as cover",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDelete(photo: AssetPhoto) {
    setIsBusy(true);
    try {
      const result = await deleteAssetPhoto(photo);
      if (result.status !== "success") {
        toast.error(
          `Could not delete photo: ${result.error ?? "unknown error"}`,
        );
        return;
      }
      removeAssetPhotoLocal(photo.id);
      setPreviewIndex(null);
      toast.success("Photo deleted");
    } finally {
      setIsBusy(false);
    }
  }

  function handleDownload(photo: AssetPhoto) {
    const url = signedUrls[photo.id];
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = photo.originalFilename || "photo";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
  }

  const previewPhoto = previewIndex !== null ? photos[previewIndex] : null;
  // Always land on the original when opening/switching a preview — never
  // silently show a processed image the user didn't ask to see.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only previewIndex should reset this
  useEffect(() => {
    setViewingProcessed(false);
    setShowBackgroundPicker(false);
    setSelectedBackground(null);
  }, [previewIndex]);
  const primaryIndex = photos.findIndex((p) => p.isPrimary);
  const heroIndex =
    primaryIndex >= 0 ? primaryIndex : photos.length > 0 ? 0 : -1;
  const heroPhoto = heroIndex >= 0 ? photos[heroIndex] : null;
  // Phase 5 — the hero display is heroMode's own cover concept
  // (machine/die/tool), so it respects cover_uses_processed exactly
  // like ProjectDetail/Projects.tsx already do externally for
  // projects — same field, same rule, never a second source of truth.
  // Picks between the two already-resolved signed-URL maps rather than
  // re-deriving a storage path, since both are fetched unconditionally
  // above regardless of ownerType.
  const heroImgUrl = heroPhoto
    ? heroPhoto.coverUsesProcessed && heroPhoto.processedStoragePath
      ? processedSignedUrls[heroPhoto.id]
      : signedUrls[heroPhoto.id]
    : usingLegacyFallback
      ? legacyPhotoDataUrl
      : undefined;

  const addPhotoInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      className="hidden"
      onChange={handleFileChosen}
    />
  );

  return (
    <div className="space-y-2" data-ocid={dataOcid}>
      {heroMode ? (
        <>
          <div
            className={
              heroClassName ??
              "relative rounded-xl border overflow-hidden bg-muted/30 flex items-center justify-center"
            }
            style={{ minHeight: 200 }}
          >
            {heroImgUrl ? (
              <button
                type="button"
                onClick={() => setPreviewIndex(heroIndex >= 0 ? heroIndex : 0)}
                className="absolute inset-0 w-full h-full"
                data-ocid={dataOcid ? `${dataOcid}.hero` : undefined}
              >
                <img
                  src={heroImgUrl}
                  alt={heroAlt || "Photo"}
                  className="w-full h-full object-cover"
                />
              </button>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground p-8">
                <ImagePlus className="w-10 h-10 opacity-40" />
                <p className="text-xs">No photo yet</p>
              </div>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                title={heroImgUrl ? "Change photo" : "Add photo"}
                className="absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded-full bg-background/90 border px-2.5 py-1.5 text-xs font-medium shadow-sm hover:bg-background"
                data-ocid={dataOcid ? `${dataOcid}.add_button` : undefined}
              >
                <ImagePlus className="w-3.5 h-3.5" />
                {isUploading
                  ? "Uploading…"
                  : heroImgUrl
                    ? "Change"
                    : "Add Photo"}
              </button>
            )}
          </div>
          {photos.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPreviewIndex(i)}
                  className="relative w-12 h-12 rounded border overflow-hidden shrink-0"
                  data-ocid={
                    dataOcid ? `${dataOcid}.thumb.${i + 1}` : undefined
                  }
                >
                  {signedUrls[p.id] ? (
                    <img
                      src={signedUrls[p.id]}
                      alt={p.caption || p.originalFilename || "Asset photo"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted animate-pulse" />
                  )}
                  {p.isPrimary && (
                    <Star className="absolute top-0.5 right-0.5 w-2.5 h-2.5 fill-warning text-warning" />
                  )}
                </button>
              ))}
            </div>
          )}
          {addPhotoInput}
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {usingLegacyFallback ? (
              <button
                type="button"
                onClick={() => setPreviewIndex(0)}
                className="w-16 h-16 rounded border overflow-hidden shrink-0"
                data-ocid={dataOcid ? `${dataOcid}.legacy_photo` : undefined}
              >
                <img
                  src={legacyPhotoDataUrl}
                  alt="Existing"
                  className="w-full h-full object-cover"
                />
              </button>
            ) : (
              photos.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPreviewIndex(i)}
                  className="relative w-16 h-16 rounded border overflow-hidden shrink-0"
                  data-ocid={
                    dataOcid ? `${dataOcid}.photo.${i + 1}` : undefined
                  }
                >
                  {signedUrls[p.id] ? (
                    <img
                      src={signedUrls[p.id]}
                      alt={p.caption || p.originalFilename || "Asset photo"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted animate-pulse" />
                  )}
                  {p.isPrimary && (
                    <Star className="absolute top-0.5 right-0.5 w-3 h-3 fill-warning text-warning" />
                  )}
                </button>
              ))
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-16 h-16 rounded border border-dashed flex flex-col items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/40 shrink-0"
                data-ocid={dataOcid ? `${dataOcid}.add_button` : undefined}
              >
                {isUploading ? (
                  <span className="text-[10px]">Uploading…</span>
                ) : (
                  <>
                    <ImagePlus className="w-4 h-4" />
                    <span className="text-[10px] mt-0.5">Add Photo</span>
                  </>
                )}
              </button>
            )}
          </div>
          {photos.length === 0 && !usingLegacyFallback && (
            <p className="text-xs text-muted-foreground">No photos yet.</p>
          )}
          {addPhotoInput}
        </>
      )}

      <Dialog
        open={previewIndex !== null}
        onOpenChange={(o) => !o && setPreviewIndex(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogTitle className="sr-only">
            {previewPhoto?.caption ||
              previewPhoto?.originalFilename ||
              "Photo preview"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Full-size preview of the selected asset photo.
          </DialogDescription>
          {usingLegacyFallback ? (
            <div className="space-y-3">
              <img
                src={legacyPhotoDataUrl}
                alt="Existing"
                className="w-full max-h-[70vh] object-contain rounded"
              />
              <p className="text-xs text-muted-foreground">
                Uploaded before the current photo system — preview only.
              </p>
            </div>
          ) : (
            previewPhoto && (
              <div className="space-y-3">
                {/* Phase 2 — AI background removal. Renders for any
                    photo with a processed derivative, regardless of
                    owner type — a photo that was never processed
                    simply has no processedStoragePath, so this stays
                    exactly as it always looked. Never silently shows
                    the processed image; "Original"/"Processed" is
                    always explicit. */}
                {previewPhoto.processedStoragePath && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-muted-foreground">
                      Viewing:
                    </span>
                    <div className="inline-flex rounded-md border overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setViewingProcessed(false)}
                        className={`px-2.5 py-1 ${!viewingProcessed ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                      >
                        Original
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewingProcessed(true)}
                        className={`px-2.5 py-1 border-l ${viewingProcessed ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                      >
                        Processed (AI)
                      </button>
                    </div>
                  </div>
                )}
                <div className="relative">
                  {(() => {
                    const showingUrl =
                      viewingProcessed && previewPhoto.processedStoragePath
                        ? processedSignedUrls[previewPhoto.id]
                        : signedUrls[previewPhoto.id];
                    return (
                      showingUrl && (
                        <img
                          src={showingUrl}
                          alt={
                            previewPhoto.caption ||
                            previewPhoto.originalFilename ||
                            "Asset photo"
                          }
                          className="w-full max-h-[70vh] object-contain rounded"
                        />
                      )
                    );
                  })()}
                  {photos.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewIndex((i) =>
                            i === null
                              ? null
                              : (i - 1 + photos.length) % photos.length,
                          )
                        }
                        className="absolute left-1 top-1/2 -translate-y-1/2 bg-background/80 rounded-full p-1.5 border"
                        aria-label="Previous photo"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewIndex((i) =>
                            i === null ? null : (i + 1) % photos.length,
                          )
                        }
                        className="absolute right-1 top-1/2 -translate-y-1/2 bg-background/80 rounded-full p-1.5 border"
                        aria-label="Next photo"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground flex-wrap">
                  <span>
                    {previewPhoto.originalFilename}
                    {photos.length > 1 &&
                      ` — ${(previewIndex ?? 0) + 1} of ${photos.length}`}
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(previewPhoto)}
                      disabled={!signedUrls[previewPhoto.id]}
                    >
                      <Download className="w-3.5 h-3.5 mr-1" /> Download
                    </Button>
                    {canEdit && !previewPhoto.isPrimary && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => handleSetPrimary(previewPhoto)}
                      >
                        <Star className="w-3.5 h-3.5 mr-1" /> Set Primary
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => handleDelete(previewPhoto)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                      </Button>
                    )}
                  </div>
                </div>

                {/* Phase 2 — AI background removal. Phase 5 generalized
                    this from project-only to every owner type
                    asset_photos supports — the Edge Function itself
                    validates owner_type and the matching module
                    permission server-side (see its own header), so no
                    ownerType allowlist is needed here; canEdit (already
                    computed per-module by each caller, e.g.
                    canEdit(currentUser,'job_cards')) is the only gate. */}
                {canEdit && (
                  <div
                    className="flex items-center gap-2 flex-wrap border-t pt-3"
                    data-ocid={dataOcid ? `${dataOcid}.ai` : undefined}
                  >
                    {!previewPhoto.processingStatus && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={processingPhotoId === previewPhoto.id}
                        onClick={() => handleProcess(previewPhoto)}
                        data-ocid={
                          dataOcid ? `${dataOcid}.ai.process_button` : undefined
                        }
                      >
                        <Sparkles className="w-3.5 h-3.5 mr-1" /> Process with
                        AI
                      </Button>
                    )}
                    {previewPhoto.processingStatus === "processing" && (
                      <Button variant="outline" size="sm" disabled>
                        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />{" "}
                        Processing…
                      </Button>
                    )}
                    {previewPhoto.processingStatus === "ready" && (
                      <>
                        {/* Phase 4 — which palette background this
                            processed image actually used. undefined
                            covers every processed image made before
                            this phase existed — a generic label, never
                            an error, per the backward-compat
                            requirement. */}
                        <span className="text-xs text-muted-foreground w-full basis-full">
                          Background:{" "}
                          {findBackgroundByHex(
                            previewPhoto.processedBackgroundColor,
                          )?.name ?? "AI selected / Existing"}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={processingPhotoId === previewPhoto.id}
                          onClick={() => handleProcess(previewPhoto)}
                          data-ocid={
                            dataOcid
                              ? `${dataOcid}.ai.reprocess_button`
                              : undefined
                          }
                        >
                          <RotateCw className="w-3.5 h-3.5 mr-1" />{" "}
                          {processingPhotoId === previewPhoto.id
                            ? "Processing…"
                            : "Reprocess"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={processingPhotoId === previewPhoto.id}
                          onClick={() => setShowBackgroundPicker((v) => !v)}
                          data-ocid={
                            dataOcid
                              ? `${dataOcid}.ai.change_background_button`
                              : undefined
                          }
                        >
                          {showBackgroundPicker
                            ? "Cancel"
                            : "Change Background"}
                        </Button>
                        {showBackgroundPicker && (
                          <div className="w-full basis-full flex flex-wrap items-center gap-2 pt-1">
                            {BACKGROUND_PALETTE.map((bg) => (
                              <button
                                key={bg.hex}
                                type="button"
                                title={bg.hex}
                                onClick={() => setSelectedBackground(bg.hex)}
                                className={`flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-[11px] ${
                                  selectedBackground === bg.hex
                                    ? "border-primary ring-1 ring-primary"
                                    : "hover:border-foreground/40"
                                }`}
                                data-ocid={
                                  dataOcid
                                    ? `${dataOcid}.ai.swatch.${bg.hex}`
                                    : undefined
                                }
                              >
                                <span
                                  className="w-4 h-4 rounded-full border shrink-0"
                                  style={{ backgroundColor: bg.hex }}
                                />
                                {bg.name}
                              </button>
                            ))}
                            <Button
                              size="sm"
                              disabled={
                                !selectedBackground ||
                                processingPhotoId === previewPhoto.id
                              }
                              onClick={() =>
                                selectedBackground &&
                                handleProcess(previewPhoto, selectedBackground)
                              }
                              data-ocid={
                                dataOcid
                                  ? `${dataOcid}.ai.reprocess_with_selected_button`
                                  : undefined
                              }
                            >
                              {processingPhotoId === previewPhoto.id
                                ? "Processing…"
                                : "Reprocess with Selected Background"}
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                    {/* Phase 3 — cover variant (original vs. processed).
                        Phase 5: only offered for owner types that
                        actually DISPLAY a cover somewhere (project's
                        external ProjectDetail/Projects list, or
                        machine/die/tool's own heroMode hero above) —
                        never for inventory_item/job_card, which have no
                        hero/cover display anywhere (confirmed in the
                        architecture audit), so the toggle would set a
                        flag nothing ever reads. Also only for the cover
                        row itself (isPrimary) once a processed image is
                        actually ready — never offered for a non-primary
                        photo or a processing/failed one. Never changes
                        isPrimary. */}
                    {(ownerType === "project" || heroMode) &&
                      previewPhoto.isPrimary &&
                      previewPhoto.processingStatus === "ready" &&
                      previewPhoto.processedStoragePath &&
                      (previewPhoto.coverUsesProcessed ? (
                        <>
                          <span className="text-xs text-muted-foreground">
                            Using Processed as Cover
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isBusy}
                            onClick={() =>
                              handleSetCoverVariant(previewPhoto, false)
                            }
                            data-ocid={
                              dataOcid
                                ? `${dataOcid}.ai.use_original_cover_button`
                                : undefined
                            }
                          >
                            Use Original as Cover
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isBusy}
                          onClick={() =>
                            handleSetCoverVariant(previewPhoto, true)
                          }
                          data-ocid={
                            dataOcid
                              ? `${dataOcid}.ai.use_processed_cover_button`
                              : undefined
                          }
                        >
                          Use Processed as Cover
                        </Button>
                      ))}
                    {previewPhoto.processingStatus === "failed" && (
                      <>
                        <span className="text-xs text-destructive">
                          AI processing failed.
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={processingPhotoId === previewPhoto.id}
                          onClick={() => handleProcess(previewPhoto)}
                          data-ocid={
                            dataOcid ? `${dataOcid}.ai.retry_button` : undefined
                          }
                        >
                          <RotateCw className="w-3.5 h-3.5 mr-1" />{" "}
                          {processingPhotoId === previewPhoto.id
                            ? "Processing…"
                            : "Retry"}
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
