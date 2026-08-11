// Thin wrapper around pdfjs-dist: load a PDF, render a page to a canvas at
// a given scale, and build low-res page thumbnails. Bundled (not CDN) per
// Vite convention — the worker is resolved via Vite's native `?url` import,
// no vite.config changes needed.

import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function loadPdf(blob: Blob): Promise<PDFDocumentProxy> {
  const buf = await blob.arrayBuffer();
  return pdfjsLib.getDocument({ data: buf }).promise;
}

export async function renderPageToCanvas(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  scale: number,
): Promise<ReturnType<PDFPageProxy["getViewport"]>> {
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return viewport;
}

export interface PageThumbnail {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
}

export async function buildThumbnails(
  pdf: PDFDocumentProxy,
  scale = 0.25,
): Promise<PageThumbnail[]> {
  const thumbs: PageThumbnail[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    thumbs.push({
      pageNumber: i,
      dataUrl: canvas.toDataURL("image/png"),
      width: viewport.width,
      height: viewport.height,
    });
  }
  return thumbs;
}

/** Best-effort extraction of a part number / project name from page 1 text,
 * used only to prefill the title block — never blocks the upload flow. */
export async function extractHeaderHints(
  pdf: PDFDocumentProxy,
): Promise<{ partNo?: string; partName?: string }> {
  try {
    const page = await pdf.getPage(1);
    const txt = await page.getTextContent();
    const all = txt.items.map((i) => ("str" in i ? i.str : "")).join(" ");
    const projMatch = all.match(/Project Name\s*[:-]?\s*([A-Z0-9-_]+)/i);
    const itemMatch = all.match(/Item Description\s*[:-]?\s*([A-Z0-9 .-_]+)/i);
    return {
      partNo: projMatch?.[1]?.trim(),
      partName: itemMatch?.[1]?.trim().slice(0, 40),
    };
  } catch {
    return {};
  }
}
