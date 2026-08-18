import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { printDocument } from "@/lib/documentUtils";
// Type-only — erased at compile time, so this does NOT pull the fabric.js
// runtime into this dialog's bundle. The actual runtime import is dynamic,
// inside the DXF branch below (see ../lib/dxfPreview.ts's own note on why).
import type { fabric } from "fabric";
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

function extOf(file: DesignFile): string {
  const m = file.fileName.toLowerCase().match(/\.[a-z0-9]+$/);
  return m ? m[0] : "";
}

function isPdf(file: DesignFile): boolean {
  return file.fileType === "application/pdf" || extOf(file) === ".pdf";
}

function isImage(file: DesignFile): boolean {
  return file.fileType.startsWith("image/");
}

function isDxf(file: DesignFile): boolean {
  return extOf(file) === ".dxf";
}

function isDocx(file: DesignFile): boolean {
  return extOf(file) === ".docx";
}

function isXlsx(file: DesignFile): boolean {
  return extOf(file) === ".xlsx" || extOf(file) === ".xls";
}

function isCsv(file: DesignFile): boolean {
  return extOf(file) === ".csv";
}

function isTxt(file: DesignFile): boolean {
  return extOf(file) === ".txt";
}

/** Formats without a real client-side preview path yet — shown with a
 * clear fallback + Download rather than silently failing. DWG belongs
 * here: Phase 1 explicitly does not attempt DWG conversion. */
function isKnownUnsupported(file: DesignFile): boolean {
  return extOf(file) === ".dwg" || extOf(file) === ".doc";
}

/** Naive CSV -> HTML table. Deliberately not routed through the `xlsx`
 * library — CSV is plain text, and pulling in a ~1MB parser for a format
 * `String.split` already handles keeps the bundle smaller (see report). */
function csvToHtml(text: string): string {
  const rows = text
    .split(/\r\n|\n|\r/)
    .filter((r) => r.length > 0)
    .slice(0, 2000) // guard against pathologically large files freezing the DOM
    .map((r) => r.split(","));
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = rows
    .map(
      (cells, i) =>
        `<tr>${cells.map((c) => `<td class="${i === 0 ? "font-semibold bg-muted/50" : ""} border px-2 py-1 text-xs">${esc(c)}</td>`).join("")}</tr>`,
    )
    .join("");
  return `<table class="w-full border-collapse">${body}</table>`;
}

/** Read-only Quick Look for a Design File — the generic project attachment
 * preview (PDF, image, DXF, DOCX, XLSX/XLS, CSV, TXT). Never edits, never
 * writes anything, never sends the file anywhere — every renderer here is
 * client-side. This is intentionally separate from the Drawing
 * Repository's PDF-specific WorkDrawingPreviewDialog/Drawing Editor: that
 * workflow is untouched by this file. */
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

  // DXF (fabric.js) preview state
  const dxfCanvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const dxfBaseZoomRef = useRef(1);
  const dxfResizeObserverRef = useRef<ResizeObserver | null>(null);
  const [layerVisibility, setLayerVisibility] = useState<
    Record<string, boolean>
  >({});
  const [skippedTypes, setSkippedTypes] = useState<string[]>([]);

  // DOCX / XLSX / CSV / TXT preview state
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [sheetHtmls, setSheetHtmls] = useState<string[]>([]);
  const [textContent, setTextContent] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run only on file identity/open change, not on every fileData read
  useEffect(() => {
    setPageNum(1);
    setScale(1);
    setRotation(0);
    setLoadError(false);
    setDocxHtml(null);
    setSheetNames([]);
    setSheetHtmls([]);
    setTextContent(null);
    setLayerVisibility({});
    setSkippedTypes([]);
    pdfDocRef.current = null;
    dxfResizeObserverRef.current?.disconnect();
    dxfResizeObserverRef.current = null;
    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.dispose();
      fabricCanvasRef.current = null;
    }
    if (!file || !open) return;

    if (isPdf(file)) {
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
    }

    if (isDxf(file)) {
      let cancelled = false;
      setLoading(true);
      (async () => {
        try {
          const text = await (await fetch(file.fileData)).text();
          // Dynamic import — keeps fabric.js and dxf-parser out of every
          // page's bundle except the moment a DXF is actually previewed.
          const {
            parseDxfInWorker,
            buildDxfScene,
            mountDxfCanvas,
            fitDxfCanvasToViewport,
          } = await import("../lib/dxfPreview");
          const dxf = await parseDxfInWorker(text);
          if (cancelled) return;
          const scene = buildDxfScene(dxf);
          if (cancelled) return;
          setSkippedTypes(scene.skippedEntityTypes);
          setLayerVisibility(
            Object.fromEntries(scene.layerNames.map((l) => [l, true])),
          );

          const el = dxfCanvasElRef.current;
          const container = el?.parentElement;
          if (!el || !container || cancelled) return;
          const canvas = mountDxfCanvas(el, scene);
          fabricCanvasRef.current = canvas;

          // A ResizeObserver — never a guessed/hard-coded size, and never
          // a setTimeout race — is the only reliable way to know the
          // container's REAL pixel size: the element starts out
          // display:none (still loading) and only becomes display:block
          // (and thus non-zero size) after this render commits. Per spec,
          // ResizeObserver fires again once that happens, so the very
          // first *meaningful* callback is exactly the moment to fit —
          // no race, and it also keeps the fit correct if the dialog is
          // ever resized afterwards (e.g. a different viewport).
          const ro = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry || cancelled) return;
            const { width, height } = entry.contentRect;
            if (width <= 0 || height <= 0) return;
            dxfBaseZoomRef.current = fitDxfCanvasToViewport(
              canvas,
              scene,
              width,
              height,
            );
          });
          ro.observe(container);
          dxfResizeObserverRef.current = ro;
        } catch {
          if (!cancelled) setLoadError(true);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    if (isDocx(file)) {
      let cancelled = false;
      setLoading(true);
      (async () => {
        try {
          const buf = await (await fetch(file.fileData)).arrayBuffer();
          const mammoth = await import("mammoth");
          const result = await mammoth.convertToHtml({ arrayBuffer: buf });
          if (cancelled) return;
          setDocxHtml(result.value);
        } catch {
          if (!cancelled) setLoadError(true);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    if (isXlsx(file)) {
      let cancelled = false;
      setLoading(true);
      (async () => {
        try {
          const buf = await (await fetch(file.fileData)).arrayBuffer();
          const XLSX = await import("xlsx");
          const wb = XLSX.read(buf, { type: "array" });
          if (cancelled) return;
          setSheetNames(wb.SheetNames);
          setSheetHtmls(
            wb.SheetNames.map((name) =>
              XLSX.utils.sheet_to_html(wb.Sheets[name], { editable: false }),
            ),
          );
          setActiveSheet(0);
        } catch {
          if (!cancelled) setLoadError(true);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    if (isCsv(file)) {
      let cancelled = false;
      setLoading(true);
      (async () => {
        try {
          const text = await (await fetch(file.fileData)).text();
          if (cancelled) return;
          setSheetNames(["CSV"]);
          setSheetHtmls([csvToHtml(text)]);
          setActiveSheet(0);
        } catch {
          if (!cancelled) setLoadError(true);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    if (isTxt(file)) {
      let cancelled = false;
      setLoading(true);
      (async () => {
        try {
          const text = await (await fetch(file.fileData)).text();
          if (cancelled) return;
          setTextContent(text);
        } catch {
          if (!cancelled) setLoadError(true);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }
  }, [file?.id, open]);

  // PDF page render. Two fixes on top of the original:
  //
  // 1. `loading` is deliberately in the dependency list even though the
  //    effect body never reads it. The canvas element only exists in the
  //    DOM once `loading` is false (see the conditional render below), so
  //    `canvasRef.current` is null on this effect's very first meaningful
  //    opportunity to run. Without `loading` as a trigger, nothing in
  //    [pageNum, scale, rotation, file] necessarily changes at the exact
  //    moment the canvas (re)mounts, so the effect could go dormant and
  //    the canvas would stay blank until the user happened to click
  //    zoom/rotate/page-nav — confirmed by mounting this component
  //    standalone and inspecting the canvas: it stayed at the browser's
  //    default 300x150, unrendered, until a tracked dep changed.
  // 2. The render scale is no longer a fixed BASE_SCALE constant — it is
  //    computed from the page's real (scale=1) point size against the
  //    ACTUAL measured container size, same fix class as DXF's
  //    fitDxfCanvasToViewport. A fixed constant meant a differently
  //    proportioned PDF (confirmed with 1400x900pt and 200x150pt test
  //    fixtures) either overflowed the visible area or rendered far
  //    smaller than the available space.
  useEffect(() => {
    const pdf = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas || !file || !isPdf(file) || loading) return;
    let cancelled = false;

    const renderAtFit = async () => {
      const page = await pdf.getPage(pageNum);
      if (cancelled) return;
      const container = canvas.parentElement;
      const native = page.getViewport({ scale: 1, rotation });
      const availW = container?.clientWidth || 800;
      const availH = container?.clientHeight || 500;
      const margin = 0.95;
      const fitScale = Math.min(
        (availW / native.width) * margin,
        (availH / native.height) * margin,
      );
      const viewport = page.getViewport({ scale: fitScale * scale, rotation });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    };

    renderAtFit();

    // Keep the fit correct if the dialog's available area changes size
    // (e.g. the browser window is resized while the preview is open) —
    // same rationale as DXF: this renderer draws real pixels via JS, so
    // JS has to know the real container size, unlike the HTML/CSS-flowed
    // renderers (image/DOCX/XLSX/CSV/TXT) which resize for free.
    const container = canvas.parentElement;
    let ro: ResizeObserver | null = null;
    if (container) {
      ro = new ResizeObserver(() => {
        if (!cancelled) renderAtFit();
      });
      ro.observe(container);
    }

    return () => {
      cancelled = true;
      ro?.disconnect();
    };
  }, [pageNum, scale, rotation, file, loading]);

  // DXF zoom — reuses the same +/- buttons as PDF/image, driving fabric's
  // own zoom instead of a CSS transform.
  useEffect(() => {
    const fc = fabricCanvasRef.current;
    if (!fc || !file || !isDxf(file)) return;
    fc.setZoom(dxfBaseZoomRef.current * scale);
    fc.requestRenderAll();
  }, [scale, file]);

  // Layer visibility toggles for DXF.
  useEffect(() => {
    const fc = fabricCanvasRef.current;
    if (
      !fc ||
      !file ||
      !isDxf(file) ||
      Object.keys(layerVisibility).length === 0
    )
      return;
    import("../lib/dxfPreview").then(({ applyDxfLayerVisibility }) =>
      applyDxfLayerVisibility(fc, layerVisibility),
    );
  }, [layerVisibility, file]);

  useEffect(() => {
    return () => {
      fabricCanvasRef.current?.dispose();
    };
  }, []);

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
      } else if (isDxf(file) && fabricCanvasRef.current) {
        const img = document.createElement("img");
        img.src = fabricCanvasRef.current.toDataURL({ format: "png" });
        img.style.cssText = "display:block;width:100%;";
        container.appendChild(img);
      } else if (isDocx(file) && docxHtml) {
        container.innerHTML = docxHtml;
      } else if ((isXlsx(file) || isCsv(file)) && sheetHtmls[activeSheet]) {
        container.innerHTML = sheetHtmls[activeSheet];
      } else if (isTxt(file) && textContent != null) {
        const pre = document.createElement("pre");
        pre.textContent = textContent;
        pre.style.cssText = "white-space:pre-wrap;font-family:monospace;";
        container.appendChild(pre);
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

  const canPreview =
    !!file &&
    (isPdf(file) ||
      isImage(file) ||
      isDxf(file) ||
      isDocx(file) ||
      isXlsx(file) ||
      isCsv(file) ||
      isTxt(file));
  const showZoom = !!file && (isPdf(file) || isImage(file) || isDxf(file));
  const showRotate = !!file && (isPdf(file) || isImage(file));
  const showPageNav = !!file && isPdf(file) && numPages > 1;
  const showSheetTabs =
    !!file && (isXlsx(file) || isCsv(file)) && sheetNames.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{file?.fileName}</DialogTitle>
          <DialogDescription className="sr-only">
            Preview of {file?.fileName ?? "the selected file"}
          </DialogDescription>
        </DialogHeader>

        {file && canPreview && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5 border-b pb-2">
              {showZoom && (
                <>
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
                </>
              )}
              {showRotate && (
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
              )}

              {showPageNav && (
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

              {showSheetTabs && (
                <>
                  <div className="w-px h-5 bg-border mx-1" />
                  {sheetNames.map((name, i) => (
                    <Button
                      key={name}
                      type="button"
                      variant={activeSheet === i ? "default" : "outline"}
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setActiveSheet(i)}
                    >
                      {name}
                    </Button>
                  ))}
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

            {isDxf(file) &&
              !loading &&
              !loadError &&
              Object.keys(layerVisibility).length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Layers:</span>
                  {Object.entries(layerVisibility).map(([layer, visible]) => (
                    <label
                      key={layer}
                      className="flex items-center gap-1 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={visible}
                        onChange={(e) =>
                          setLayerVisibility((v) => ({
                            ...v,
                            [layer]: e.target.checked,
                          }))
                        }
                      />
                      {layer}
                    </label>
                  ))}
                </div>
              )}
            {isDxf(file) && !loading && skippedTypes.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Not shown (not yet supported in preview):{" "}
                {skippedTypes.join(", ")}
              </p>
            )}

            <div
              className={
                isDocx(file) || isXlsx(file) || isCsv(file) || isTxt(file)
                  ? "border rounded-md overflow-auto max-h-[68vh] bg-background p-4"
                  : isDxf(file)
                    ? // Fixed (not min-) height: fitDxfCanvasToViewport measures
                      // this element's real clientHeight via ResizeObserver, so
                      // it must actually equal what's rendered, not just be a
                      // flexible lower bound that can collapse to min-h.
                      "border rounded-md overflow-auto bg-muted/30 flex items-center justify-center h-[500px]"
                    : "border rounded-md overflow-auto max-h-[68vh] bg-muted/30 flex items-center justify-center min-h-[300px]"
              }
            >
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
              {!loading && !loadError && isImage(file) && (
                <img
                  src={file.fileData}
                  alt={file.fileName}
                  style={{
                    transform: `rotate(${rotation}deg) scale(${scale})`,
                  }}
                  className="max-w-full max-h-[64vh] object-contain transition-transform"
                />
              )}
              {!loadError && isDxf(file) && (
                <canvas
                  ref={dxfCanvasElRef}
                  style={{ display: loading ? "none" : "block" }}
                />
              )}
              {!loading && !loadError && isDocx(file) && docxHtml != null && (
                <div
                  className="prose prose-sm max-w-none"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: mammoth's default (no image conversion configured) output is plain semantic HTML derived from the .docx's own markup -- no script tags, no externally-sourced content, never executed
                  dangerouslySetInnerHTML={{ __html: docxHtml }}
                />
              )}
              {!loading &&
                !loadError &&
                (isXlsx(file) || isCsv(file)) &&
                sheetHtmls[activeSheet] != null && (
                  <div
                    className="prose prose-sm max-w-none [&_table]:text-xs"
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: SheetJS's sheet_to_html or this file's own csvToHtml -- generated table markup only, never user-supplied script content
                    dangerouslySetInnerHTML={{
                      __html: sheetHtmls[activeSheet],
                    }}
                  />
                )}
              {!loading && !loadError && isTxt(file) && textContent != null && (
                <pre className="text-xs whitespace-pre-wrap font-mono">
                  {textContent}
                </pre>
              )}
            </div>
          </div>
        )}

        {file && !canPreview && (
          <div className="text-center py-10 text-sm text-muted-foreground border rounded-lg border-dashed">
            {isKnownUnsupported(file)
              ? "Preview unavailable for this file type."
              : "Preview isn't available for this file type."}
            <div className="mt-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onDownload(file)}
              >
                <Download className="w-3.5 h-3.5 mr-1.5" /> Download Original
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
