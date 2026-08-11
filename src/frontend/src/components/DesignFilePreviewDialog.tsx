import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { printDocument } from "@/lib/documentUtils";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { loadPdf } from "../drawingEditor/lib/pdfRenderer";
import type { DesignFile } from "../types";

interface Props {
  file: DesignFile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownload: (file: DesignFile) => void;
}

const BASE_SCALE = 1.3;

function isPdf(file: DesignFile): boolean {
  return (
    file.fileType === "application/pdf" ||
    file.fileName.toLowerCase().endsWith(".pdf")
  );
}

function isImage(file: DesignFile): boolean {
  return file.fileType.startsWith("image/");
}

/** Read-only viewer for a Design File — the original customer document.
 * Never edits, never creates drawings; Edit (promotion into the Drawing
 * Editor) and Download stay separate actions. */
export function DesignFilePreviewDialog({
  file,
  open,
  onOpenChange,
  onDownload,
}: Props) {
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [printing, setPrinting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run only on file identity/open change, not on every fileData read
  useEffect(() => {
    setPageNum(1);
    setScale(1);
    setRotation(0);
    setLoadError(false);
    pdfDocRef.current = null;
    if (!file || !open || !isPdf(file)) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const blob = await (await fetch(file.fileData)).blob();
        const pdf = await loadPdf(blob);
        if (cancelled) return;
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file?.id, open]);

  useEffect(() => {
    const pdf = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas || !file || !isPdf(file)) return;
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageNum);
      if (cancelled) return;
      const viewport = page.getViewport({
        scale: BASE_SCALE * scale,
        rotation,
      });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    })();
    return () => {
      cancelled = true;
    };
  }, [pageNum, scale, rotation, file]);

  const handlePrint = async () => {
    if (!file) return;
    setPrinting(true);
    try {
      const containerId = `design-file-print-${Date.now()}`;
      const container = document.createElement("div");
      container.id = containerId;
      container.style.cssText = "position:fixed;left:-9999px;top:-9999px;";

      if (isPdf(file) && pdfDocRef.current) {
        const pdf = pdfDocRef.current;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5, rotation });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          const img = document.createElement("img");
          img.src = canvas.toDataURL("image/png");
          img.style.cssText = "display:block;width:100%;margin-bottom:12px;";
          container.appendChild(img);
        }
      } else if (isImage(file)) {
        const img = document.createElement("img");
        img.src = file.fileData;
        img.style.cssText = "display:block;width:100%;";
        container.appendChild(img);
      } else {
        setPrinting(false);
        return;
      }

      document.body.appendChild(container);
      await printDocument(containerId);
      container.remove();
    } finally {
      setPrinting(false);
    }
  };

  const canPreview = !!file && (isPdf(file) || isImage(file));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{file?.fileName}</DialogTitle>
        </DialogHeader>

        {file && canPreview && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5 border-b pb-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() =>
                  setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)))
                }
                title="Zoom out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground w-12 text-center">
                {Math.round(scale * 100)}%
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() =>
                  setScale((s) => Math.min(3, +(s + 0.25).toFixed(2)))
                }
                title="Zoom in"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                title="Rotate"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </Button>

              {isPdf(file) && numPages > 1 && (
                <>
                  <div className="w-px h-5 bg-border mx-1" />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={pageNum <= 1}
                    onClick={() => setPageNum((p) => Math.max(1, p - 1))}
                    title="Previous page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {pageNum} / {numPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={pageNum >= numPages}
                    onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
                    title="Next page"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </>
              )}

              <div className="w-px h-5 bg-border mx-1" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                disabled={printing}
                onClick={handlePrint}
              >
                <Printer className="w-3.5 h-3.5" /> Print
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => onDownload(file)}
              >
                <Download className="w-3.5 h-3.5" /> Download
              </Button>
            </div>

            <div className="border rounded-md overflow-auto max-h-[68vh] bg-muted/30 flex items-center justify-center min-h-[300px]">
              {loading && (
                <p className="text-sm text-muted-foreground py-10">
                  Loading preview…
                </p>
              )}
              {loadError && (
                <p className="text-sm text-destructive py-10">
                  Couldn't load this file for preview.
                </p>
              )}
              {!loading && !loadError && isPdf(file) && (
                <canvas ref={canvasRef} className="max-w-none" />
              )}
              {!loading && !loadError && !isPdf(file) && isImage(file) && (
                <img
                  src={file.fileData}
                  alt={file.fileName}
                  style={{
                    transform: `rotate(${rotation}deg) scale(${scale})`,
                  }}
                  className="max-w-full max-h-[64vh] object-contain transition-transform"
                />
              )}
            </div>
          </div>
        )}

        {file && !canPreview && (
          <div className="text-center py-10 text-sm text-muted-foreground border rounded-lg border-dashed">
            Preview isn't available for this file type.
            <div className="mt-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onDownload(file)}
              >
                <Download className="w-3.5 h-3.5 mr-1.5" /> Download
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
