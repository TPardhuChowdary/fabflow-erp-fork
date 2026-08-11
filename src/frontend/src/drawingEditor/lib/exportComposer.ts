// Composes the final "work order" export: a landscape-A4 canvas with a
// branded header, the annotated drawing, and a 3-column bottom grid
// (specs | title block | signatures). Direct port of composeFinalCanvas,
// parameterized by company info (from the ERP's existing Settings) instead
// of a module-local logo upload.

import type { fabric } from "fabric";
import type { TitleBlockFields } from "../types";

export interface ExportCompanyInfo {
  companyName: string;
  companyLogoDataUrl?: string;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export async function composeFinalCanvas(
  fabricCanvas: fabric.Canvas,
  titleBlock: TitleBlockFields,
  company: ExportCompanyInfo,
): Promise<HTMLCanvasElement> {
  const dwgW = fabricCanvas.getWidth();
  const dwgH = fabricCanvas.getHeight();
  const tb = titleBlock;

  const logoImg = company.companyLogoDataUrl
    ? await loadImage(company.companyLogoDataUrl).catch(() => null)
    : null;

  // A4 landscape at ~200 DPI.
  const OUT_W = 2400;
  const OUT_H = Math.round(OUT_W * Math.SQRT1_2);

  const margin = 30;
  const headerH = 90;
  const bottomGridH = 320;
  const drawingTopY = margin + headerH + 10;
  const drawingBottomY = OUT_H - margin - bottomGridH - 10;
  const drawingAreaH = drawingBottomY - drawingTopY;
  const drawingAreaW = OUT_W - margin * 2;

  const out = document.createElement("canvas");
  out.width = OUT_W;
  out.height = OUT_H;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, OUT_W, OUT_H);

  ctx.strokeStyle = "#0a0e1a";
  ctx.lineWidth = 2.5;
  ctx.strokeRect(margin * 0.5, margin * 0.5, OUT_W - margin, OUT_H - margin);
  ctx.lineWidth = 1;
  ctx.strokeRect(
    margin * 0.5 + 6,
    margin * 0.5 + 6,
    OUT_W - margin - 12,
    OUT_H - margin - 12,
  );

  // Header band
  ctx.fillStyle = "#0a0e1a";
  ctx.fillRect(margin, margin, OUT_W - margin * 2, headerH);
  ctx.fillStyle = "#00d4ff";
  ctx.fillRect(margin, margin + headerH - 3, OUT_W - margin * 2, 3);

  let headerTextX = margin + 22;
  if (logoImg) {
    const lr = logoImg.naturalWidth / logoImg.naturalHeight;
    const lh = headerH * 0.65;
    const lw = lh * lr;
    ctx.drawImage(logoImg, margin + 18, margin + (headerH - lh) / 2, lw, lh);
    headerTextX = margin + 18 + lw + 22;
  }
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px Helvetica, monospace";
  ctx.textBaseline = "top";
  ctx.fillText(company.companyName || "Your Company", headerTextX, margin + 18);
  ctx.fillStyle = "#7c8aab";
  ctx.font = "16px Helvetica, monospace";
  ctx.fillText("SHOP FLOOR WORK INSTRUCTION", headerTextX, margin + 58);

  ctx.fillStyle = "#00d4ff";
  ctx.font = "bold 22px Helvetica, monospace";
  ctx.textAlign = "right";
  ctx.fillText(
    tb.jobCard || `DOC-${Date.now().toString().slice(-6)}`,
    OUT_W - margin - 22,
    margin + 22,
  );
  ctx.fillStyle = "#7c8aab";
  ctx.font = "16px Helvetica, monospace";
  ctx.fillText(
    tb.date || new Date().toLocaleDateString(),
    OUT_W - margin - 22,
    margin + 58,
  );
  ctx.textAlign = "left";

  // Drawing area
  const ar = dwgW / dwgH;
  let drawW = drawingAreaW;
  let drawH = drawingAreaW / ar;
  if (drawH > drawingAreaH) {
    drawH = drawingAreaH;
    drawW = drawingAreaH * ar;
  }
  const drawX = margin + (drawingAreaW - drawW) / 2;
  const drawY = drawingTopY + (drawingAreaH - drawH) / 2;

  ctx.strokeStyle = "#0a0e1a";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(margin + 4, drawingTopY, drawingAreaW - 8, drawingAreaH);

  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = "#0a0e1a";
  if (logoImg) {
    const lr = logoImg.naturalWidth / logoImg.naturalHeight;
    const wmH = Math.min(drawingAreaH * 0.5, drawingAreaW * 0.25);
    const wmW = wmH * lr;
    ctx.drawImage(
      logoImg,
      margin + (drawingAreaW - wmW) / 2,
      drawingTopY + (drawingAreaH - wmH) / 2 - 40,
      wmW,
      wmH,
    );
  }
  ctx.font = "bold 80px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    company.companyName || "YOUR COMPANY",
    margin + drawingAreaW / 2,
    drawingTopY + drawingAreaH * 0.78,
  );
  ctx.restore();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const fabricEl = fabricCanvas.toCanvasElement(1);
  ctx.drawImage(fabricEl, drawX, drawY, drawW, drawH);

  // Bottom grid — 3 columns
  const gridY = OUT_H - margin - bottomGridH;
  const gridW = OUT_W - margin * 2;
  const gridH = bottomGridH;
  const colW1 = Math.round(gridW * 0.24);
  const colW2 = Math.round(gridW * 0.46);
  const colW3 = gridW - colW1 - colW2;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(margin, gridY, gridW, gridH);
  ctx.strokeStyle = "#0a0e1a";
  ctx.lineWidth = 1.8;
  ctx.strokeRect(margin, gridY, gridW, gridH);

  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(margin + colW1, gridY);
  ctx.lineTo(margin + colW1, gridY + gridH);
  ctx.moveTo(margin + colW1 + colW2, gridY);
  ctx.lineTo(margin + colW1 + colW2, gridY + gridH);
  ctx.stroke();

  // Left column: specs
  const leftX = margin;
  const leftRows: Array<{ label: string; value: string }> = [
    { label: "TOLERANCE", value: tb.tolerance || "± 0.5" },
    { label: "GAUGE", value: tb.gauge || "—" },
    { label: "MATERIAL", value: tb.material || "—" },
    { label: "FINISH", value: tb.finish || "—" },
    { label: "SCALE", value: "NTS (Do not scale)" },
    { label: "UNITS", value: "ALL DIMS IN MM" },
  ];
  const leftRowH = gridH / leftRows.length;
  leftRows.forEach((r, i) => {
    const ry = gridY + i * leftRowH;
    if (i > 0) {
      ctx.strokeStyle = "#dde3ef";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(leftX, ry);
      ctx.lineTo(leftX + colW1, ry);
      ctx.stroke();
    }
    ctx.fillStyle = "#7c8aab";
    ctx.font = "bold 13px monospace";
    ctx.textBaseline = "top";
    ctx.fillText(r.label, leftX + 12, ry + 8);
    ctx.fillStyle = "#0a0e1a";
    ctx.font = "bold 18px Helvetica, monospace";
    let val = r.value;
    const maxW = colW1 - 24;
    while (ctx.measureText(val).width > maxW && val.length > 4)
      val = val.slice(0, -2);
    if (val !== r.value) val = `${val.slice(0, -1)}…`;
    ctx.fillText(val, leftX + 12, ry + 28);
  });

  // Middle column: title block
  const midX = margin + colW1;
  const titleHeaderH = 38;
  ctx.fillStyle = "#0a0e1a";
  ctx.fillRect(midX, gridY, colW2, titleHeaderH);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 18px Helvetica, monospace";
  ctx.textBaseline = "middle";
  ctx.fillText("PART DETAILS", midX + 14, gridY + titleHeaderH / 2);
  if (tb.operation) {
    ctx.fillStyle = "#00d4ff";
    ctx.font = "bold 16px monospace";
    ctx.textAlign = "right";
    ctx.fillText(tb.operation, midX + colW2 - 14, gridY + titleHeaderH / 2);
    ctx.textAlign = "left";
  }
  ctx.textBaseline = "alphabetic";

  const fieldsY = gridY + titleHeaderH;
  const fieldsH = gridH - titleHeaderH;
  const fRows = 4;
  const fCols = 2;
  const fRowH = fieldsH / fRows;
  const fColW = colW2 / fCols;

  ctx.strokeStyle = "#dde3ef";
  ctx.lineWidth = 0.8;
  for (let i = 1; i < fRows; i++) {
    ctx.beginPath();
    ctx.moveTo(midX, fieldsY + i * fRowH);
    ctx.lineTo(midX + colW2, fieldsY + i * fRowH);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(midX + fColW, fieldsY);
  ctx.lineTo(midX + fColW, fieldsY + fieldsH);
  ctx.stroke();

  const midCell = (c: number, r: number, label: string, value: string) => {
    const cellX = midX + c * fColW;
    const cellY = fieldsY + r * fRowH;
    ctx.fillStyle = "#7c8aab";
    ctx.font = "bold 12px monospace";
    ctx.textBaseline = "top";
    ctx.fillText(label, cellX + 10, cellY + 8);
    ctx.fillStyle = "#0a0e1a";
    ctx.font = "bold 18px Helvetica, monospace";
    let val = value || "—";
    const maxW = fColW - 22;
    while (ctx.measureText(val).width > maxW && val.length > 4)
      val = val.slice(0, -2);
    if (val !== (value || "—")) val = `${val.slice(0, -1)}…`;
    ctx.fillText(val, cellX + 10, cellY + 30);
  };
  midCell(0, 0, "PART NO", tb.partNo);
  midCell(1, 0, "PART NAME", tb.partName);
  midCell(0, 1, "QUANTITY", tb.quantity);
  midCell(1, 1, "REVISION", tb.revision);
  midCell(0, 2, "JOB CARD", tb.jobCard);
  midCell(1, 2, "DRAWING DATE", tb.date);
  midCell(0, 3, "MACHINE", tb.machine);
  midCell(1, 3, "OPERATOR", tb.operator);

  // Right column: 3 stacked signatures
  const rightX = margin + colW1 + colW2;
  const sigRowH = gridH / 3;
  const sigs = [
    { icon: "✎", label: "PREPARED BY" },
    { icon: "✓", label: "VERIFIED BY" },
    { icon: "★", label: "APPROVED BY" },
  ];
  sigs.forEach((s, i) => {
    const ry = gridY + i * sigRowH;
    const bandH = 32;
    ctx.fillStyle = "#0a0e1a";
    ctx.fillRect(rightX, ry, colW3, bandH);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px Helvetica, monospace";
    ctx.textBaseline = "middle";
    ctx.fillText(`${s.icon}  ${s.label}`, rightX + 14, ry + bandH / 2);
    ctx.textBaseline = "alphabetic";

    const lineY = ry + sigRowH * 0.72;
    ctx.strokeStyle = "#7c8aab";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rightX + 14, lineY);
    ctx.lineTo(rightX + colW3 - 14, lineY);
    ctx.stroke();
    ctx.fillStyle = "#7c8aab";
    ctx.font = "11px monospace";
    ctx.textBaseline = "top";
    ctx.fillText("NAME", rightX + 14, lineY + 5);
    ctx.textAlign = "right";
    ctx.fillText("DATE", rightX + colW3 - 14, lineY + 5);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    if (i < 2) {
      ctx.strokeStyle = "#0a0e1a";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(rightX, ry + sigRowH);
      ctx.lineTo(rightX + colW3, ry + sigRowH);
      ctx.stroke();
    }
  });

  return out;
}
