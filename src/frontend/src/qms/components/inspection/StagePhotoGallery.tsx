import { downloadInspectionDocumentBlob } from "@/lib/qmsInspectionWorkflowApi";
import { useEffect, useState } from "react";
import type { InspectionDocument } from "../../types";

/** §9 — every image attached to a stage renders as an actual photo
 * thumbnail (not a generic file-download row), reusing InspectionDocument
 * as-is: no separate "photos" table, just filtered by fileType.
 *
 * Phase 46 — `photo.blob` is no longer eagerly populated by the list read
 * that produces `photos` (bytes now live in Supabase Storage, fetched on
 * demand). A thumbnail gallery genuinely needs every visible photo's
 * bytes to render, so — unlike DocumentUploadPanel's single on-click
 * fetch — this component fetches all of them up front, once, when the
 * photo set changes. Object URLs are revoked on cleanup to avoid leaking
 * memory across stage/sheet navigation. */
export function StagePhotoGallery({
  photos,
}: { photos: InspectionDocument[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];

    Promise.all(
      photos.map(async (p) => {
        try {
          const blob = p.blob ?? (await downloadInspectionDocumentBlob(p.id));
          const url = URL.createObjectURL(blob);
          objectUrls.push(url);
          return [p.id, url] as const;
        } catch (e) {
          console.error(`Failed to load photo ${p.id}:`, e);
          return null;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setUrls(
        Object.fromEntries(
          entries.filter((e): e is [string, string] => e !== null),
        ),
      );
    });

    return () => {
      cancelled = true;
      for (const url of objectUrls) URL.revokeObjectURL(url);
    };
  }, [photos]);

  return (
    <div
      className="grid grid-cols-3 sm:grid-cols-4 gap-2"
      data-ocid="qms.inspection.photo_gallery"
    >
      {photos.map((photo, i) => {
        const url = urls[photo.id];
        return (
          <button
            key={photo.id}
            type="button"
            className="group relative rounded-md border overflow-hidden aspect-square text-left bg-muted/30"
            onClick={() =>
              url && window.open(url, "_blank", "noopener,noreferrer")
            }
            disabled={!url}
            data-ocid={`qms.inspection.photo.${i + 1}`}
            title={photo.caption || photo.fileName}
          >
            {url ? (
              <img
                src={url}
                alt={photo.caption || photo.fileName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
                Loading…
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity">
              {photo.caption || photo.fileName} ·{" "}
              {new Date(photo.uploadedAt).toLocaleDateString()}
            </div>
          </button>
        );
      })}
    </div>
  );
}
