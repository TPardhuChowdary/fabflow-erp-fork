// Wraps jsPDF (already a dependency, added for the QMS module) to embed the
// composed work-order canvas as a single landscape-A4 page.

import jsPDF from "jspdf";

export function composedCanvasToPdfBlob(canvas: HTMLCanvasElement): Blob {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const availW = pageWidth - margin * 2;
  const availH = pageHeight - margin * 2;

  const ar = canvas.width / canvas.height;
  let drawW = availW;
  let drawH = availW / ar;
  if (drawH > availH) {
    drawH = availH;
    drawW = availH * ar;
  }
  const x = (pageWidth - drawW) / 2;
  const y = (pageHeight - drawH) / 2;

  doc.addImage(canvas.toDataURL("image/png"), "PNG", x, y, drawW, drawH);
  return doc.output("blob");
}
