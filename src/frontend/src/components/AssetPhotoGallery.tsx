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
  deleteAssetPhoto,
  getAssetPhotoSignedUrl,
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
  const primaryIndex = photos.findIndex((p) => p.isPrimary);
  const heroIndex =
    primaryIndex >= 0 ? primaryIndex : photos.length > 0 ? 0 : -1;
  const heroPhoto = heroIndex >= 0 ? photos[heroIndex] : null;
  const heroImgUrl = heroPhoto
    ? signedUrls[heroPhoto.id]
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
                <div className="relative">
                  {signedUrls[previewPhoto.id] && (
                    <img
                      src={signedUrls[previewPhoto.id]}
                      alt={
                        previewPhoto.caption ||
                        previewPhoto.originalFilename ||
                        "Asset photo"
                      }
                      className="w-full max-h-[70vh] object-contain rounded"
                    />
                  )}
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
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {previewPhoto.originalFilename}
                    {photos.length > 1 &&
                      ` — ${(previewIndex ?? 0) + 1} of ${photos.length}`}
                  </span>
                  <div className="flex items-center gap-2">
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
              </div>
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
