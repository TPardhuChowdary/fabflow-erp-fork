// Composes the printable Work Order layout for a drawing purely from its
// latest saved DrawingView — no live editor session required. This is what
// lets Preview/Print work directly from a tree row (Design Files hierarchy)
// without ever opening the Engineering Drawing Editor. Reuses the exact same
// composeFinalCanvas used by the editor's own Save flow, so the result is
// guaranteed identical to what the engineer last saved.

import { printDocument } from "@/lib/documentUtils";
import { fabric } from "fabric";
import { getLatestDrawingView, getViewsForDrawing } from "../api/drawings";
import type { DrawingDocument, DrawingView } from "../types";
import { type ExportCompanyInfo, composeFinalCanvas } from "./exportComposer";

/** Rebuilds the fabric canvas exactly as it was at save time (same pixel
 * size the objects' coordinates are absolute to — see DrawingView.canvasWidth/
 * canvasHeight) and composes it into the final title-blocked layout. Shared
 * by composeLatestView (one view) and composeAllPageViews (one per page)
 * below, so the rebuild logic exists in exactly one place. */
async function composeViewCanvas(
  view: DrawingView,
  company: ExportCompanyInfo,
): Promise<HTMLCanvasElement> {
  const width = view.canvasWidth ?? view.cropRect.w * 3;
  const height = view.canvasHeight ?? view.cropRect.h * 3;

  const hostCanvas = document.createElement("canvas");
  hostCanvas.width = width;
  hostCanvas.height = height;
  const fc = new fabric.Canvas(hostCanvas, { backgroundColor: "#ffffff" });

  await new Promise<void>((resolve) => {
    fc.loadFromJSON(JSON.parse(view.fabricJSON), () => {
      fc.renderAll();
      resolve();
    });
  });

  try {
    return await composeFinalCanvas(fc, view.titleBlock, company);
  } finally {
    fc.dispose();
  }
}

/** Rebuilds the fabric canvas exactly as it was at save time and composes
 * it into the final title-blocked layout. Returns null if this drawing has
 * never been saved yet. */
export async function composeLatestView(
  drawing: DrawingDocument,
  company: ExportCompanyInfo,
): Promise<HTMLCanvasElement | null> {
  const view = await getLatestDrawingView(drawing.id);
  if (!view) return null;
  return composeViewCanvas(view, company);
}

/** One composed canvas per PAGE of a multi-page drawing (see chat, Job
 * Card print) — the latest saved view for each distinct pageNumber,
 * ordered 1..numPages. A drawing with only one page returns a single-
 * element array, same content composeLatestView would have produced.
 * Reuses getViewsForDrawing (already sorted updatedAt desc, so the first
 * view seen per page is its latest) — no new query, no second drawing
 * renderer. */
export async function composeAllPageViews(
  drawing: DrawingDocument,
  company: ExportCompanyInfo,
): Promise<HTMLCanvasElement[]> {
  const views = await getViewsForDrawing(drawing.id);
  const latestByPage = new Map<number, DrawingView>();
  for (const v of views) {
    if (!latestByPage.has(v.pageNumber)) latestByPage.set(v.pageNumber, v);
  }
  const ordered = [...latestByPage.values()].sort(
    (a, b) => a.pageNumber - b.pageNumber,
  );
  return Promise.all(ordered.map((v) => composeViewCanvas(v, company)));
}

/** Prints exactly what a Preview dialog would show for a drawing —
 * composed fresh from its latest saved state, no dialog in between.
 * Returns false (and prints nothing) if the drawing has never been saved. */
export async function printLatestView(
  drawing: DrawingDocument,
  company: ExportCompanyInfo,
): Promise<boolean> {
  const canvas = await composeLatestView(drawing, company);
  if (!canvas) return false;
  const containerId = `work-drawing-print-${Date.now()}`;
  const container = document.createElement("div");
  container.id = containerId;
  container.style.cssText = "position:fixed;left:-9999px;top:-9999px;";
  const img = document.createElement("img");
  img.src = canvas.toDataURL("image/png");
  img.style.cssText = "display:block;width:100%;";
  container.appendChild(img);
  document.body.appendChild(container);
  await printDocument(containerId);
  container.remove();
  return true;
}
