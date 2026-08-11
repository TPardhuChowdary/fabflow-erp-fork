import { cn } from "@/lib/utils";
import type { PageThumbnail } from "../lib/pdfRenderer";

interface Props {
  thumbnails: PageThumbnail[];
  currentPage: number;
  onSelect: (pageNumber: number) => void;
}

export function PageThumbnailList({
  thumbnails,
  currentPage,
  onSelect,
}: Props) {
  if (thumbnails.length === 0) {
    return (
      <p className="text-xs text-muted-foreground p-3">
        Upload a PDF to view all engineering drawing pages here.
      </p>
    );
  }

  return (
    <div className="space-y-2" data-ocid="drawing_editor.page_thumbnails">
      {thumbnails.map((t) => (
        <button
          key={t.pageNumber}
          type="button"
          onClick={() => onSelect(t.pageNumber)}
          className={cn(
            "relative block w-full rounded-md border bg-white overflow-hidden transition-colors",
            t.pageNumber === currentPage
              ? "border-primary ring-1 ring-primary"
              : "border-border hover:border-primary/50",
          )}
          data-ocid={`drawing_editor.page_thumb.${t.pageNumber}`}
        >
          <img
            src={t.dataUrl}
            alt={`Page ${t.pageNumber}`}
            className="w-full h-auto block"
          />
          <span className="absolute top-1 left-1 bg-black/70 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
            PAGE {String(t.pageNumber).padStart(2, "0")}
          </span>
        </button>
      ))}
    </div>
  );
}
