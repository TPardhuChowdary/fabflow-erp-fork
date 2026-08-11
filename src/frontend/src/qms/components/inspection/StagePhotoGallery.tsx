import { useMemo } from "react";
import type { InspectionDocument } from "../../types";

/** §9 — every image attached to a stage renders as an actual photo
 * thumbnail (not a generic file-download row), reusing InspectionDocument
 * as-is: no separate "photos" table, just filtered by fileType. */
export function StagePhotoGallery({
  photos,
}: { photos: InspectionDocument[] }) {
  const urls = useMemo(
    () => photos.map((p) => URL.createObjectURL(p.blob)),
    [photos],
  );

  return (
    <div
      className="grid grid-cols-3 sm:grid-cols-4 gap-2"
      data-ocid="qms.inspection.photo_gallery"
    >
      {photos.map((photo, i) => (
        <button
          key={photo.id}
          type="button"
          className="group relative rounded-md border overflow-hidden aspect-square text-left"
          onClick={() => window.open(urls[i], "_blank", "noopener,noreferrer")}
          data-ocid={`qms.inspection.photo.${i + 1}`}
          title={photo.caption || photo.fileName}
        >
          <img
            src={urls[i]}
            alt={photo.caption || photo.fileName}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity">
            {photo.caption || photo.fileName} ·{" "}
            {new Date(photo.uploadedAt).toLocaleDateString()}
          </div>
        </button>
      ))}
    </div>
  );
}
