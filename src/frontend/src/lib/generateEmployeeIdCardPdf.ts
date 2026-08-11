// Real, programmatically-generated binary PDF (via jsPDF, with an embedded
// QR via qrcode) — same rationale and the same two dependencies as
// qms/lib/generateInspectionPdf.ts: a PVC card printer needs an exact
// physical-size binary PDF, not a browser print-to-PDF flow. Sized to a real
// CR80 card in PORTRAIT orientation (53.98mm × 85.6mm, matching the
// company's approved lanyard-card template) — page 1 is the front, page 2
// the back. Layout mirrors components/EmployeeIdCardPreview.tsx's on-screen
// version as closely as jsPDF's primitives allow (no icon glyphs here —
// plain bold labels instead, matching this codebase's other jsPDF export,
// generateInspectionPdf.ts, which does the same; decorative curves are
// approximated as short-segment polyline arcs since jsPDF has no native
// bezier-stroke helper).
import jsPDF from "jspdf";
import QRCode from "qrcode";
import type { Employee, EmployeeType } from "../types";

const CARD_WIDTH = 53.98;
const CARD_HEIGHT = 85.6;

const EMPLOYEE_TYPE_COLORS: Record<EmployeeType, [number, number, number]> = {
  Permanent: [234, 179, 8],
  Temporary: [249, 115, 22],
  Supervisor: [30, 58, 95],
  Management: [17, 24, 39],
  Visitor: [22, 163, 74],
};

export interface EmployeeIdCardPdfInput {
  employee: Employee; // employeeCode must already be set by the caller
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyWebsite?: string;
  companyLogoDataUrl?: string;
}

/** The rounded dark bar near the top of every card — printed indicator of
 * the lanyard punch-hole on the physical CR80 blank. Purely decorative. */
function drawLanyardSlot(doc: jsPDF) {
  doc.setFillColor(60, 60, 60);
  doc.roundedRect(CARD_WIDTH / 2 - 6, 2, 12, 1.6, 0.8, 0.8, "F");
}

/** A short-segment polyline approximating a quarter-circle arc — used for
 * the decorative swoosh curves bottom-right of the front face, since jsPDF
 * has no native bezier-stroke primitive. */
function drawArc(
  doc: jsPDF,
  cx: number,
  cy: number,
  r: number,
  color: [number, number, number],
  lineWidth: number,
) {
  const steps = 16;
  doc.setDrawColor(...color);
  doc.setLineWidth(lineWidth);
  let prevX = cx;
  let prevY = cy - r;
  for (let i = 1; i <= steps; i++) {
    const a = (Math.PI / 2) * (i / steps);
    const x = cx - r * Math.sin(a);
    const y = cy - r * Math.cos(a);
    doc.line(prevX, prevY, x, y);
    prevX = x;
    prevY = y;
  }
}

export async function generateEmployeeIdCardPdf(
  input: EmployeeIdCardPdfInput,
): Promise<Blob> {
  const { employee } = input;
  const accent = EMPLOYEE_TYPE_COLORS[employee.employeeType ?? "Permanent"];
  const roleLabel = employee.designation || employee.role;
  const doc = new jsPDF({
    unit: "mm",
    format: [CARD_WIDTH, CARD_HEIGHT],
  });

  // ── Front ────────────────────────────────────────────────
  const stripW = 7;
  const contentX = stripW + 2;
  const contentW = CARD_WIDTH - contentX - 2;
  const contentCenterX = stripW + (CARD_WIDTH - stripW) / 2;

  doc.setFillColor(...accent);
  doc.rect(0, 0, stripW, CARD_HEIGHT, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text(employee.role, stripW / 2, CARD_HEIGHT / 2, {
    angle: 90,
    align: "center",
  });
  doc.setTextColor(0, 0, 0);

  const headerH = 15;
  const logoSize = 9;
  if (input.companyLogoDataUrl) {
    try {
      doc.addImage(
        input.companyLogoDataUrl,
        "PNG",
        contentX,
        (headerH - logoSize) / 2,
        logoSize,
        logoSize,
      );
    } catch {
      // malformed/unsupported logo data — skip it rather than fail the export
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  const nameX = input.companyLogoDataUrl ? contentX + logoSize + 1.5 : contentX;
  const companyNameLines = doc
    .splitTextToSize(
      input.companyName || "Your Company",
      CARD_WIDTH - nameX - 2,
    )
    .slice(0, 2);
  doc.text(
    companyNameLines,
    nameX,
    headerH / 2 - (companyNameLines.length - 1) * 1.6,
  );

  drawLanyardSlot(doc);

  // Photo — centered within the content column, on a light-gray mat,
  // mirroring components/EmployeeIdCardPreview.tsx.
  const photoW = 20;
  const photoH = 24;
  const matPad = 1.5;
  const photoX = contentCenterX - photoW / 2;
  const photoY = headerH + 1;
  doc.setFillColor(243, 244, 246);
  doc.roundedRect(
    photoX - matPad,
    photoY - matPad,
    photoW + matPad * 2,
    photoH + matPad * 2,
    1,
    1,
    "F",
  );
  if (employee.photoRef) {
    try {
      doc.addImage(employee.photoRef, "JPEG", photoX, photoY, photoW, photoH);
    } catch {
      // unsupported photo data — leave the space blank rather than fail
    }
  }

  let y = photoY + photoH + matPad + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text(employee.name, contentCenterX, y, { align: "center" });
  y += 4.5;

  doc.setFillColor(...accent);
  const pillW = Math.min(contentW, doc.getTextWidth(roleLabel) + 6);
  doc.roundedRect(contentCenterX - pillW / 2, y - 3, pillW, 4.5, 2.2, 2.2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.text(roleLabel, contentCenterX, y, { align: "center" });
  doc.setTextColor(0, 0, 0);
  y += 5;

  doc.setDrawColor(accent[0], accent[1], accent[2]);
  doc.setLineWidth(0.2);
  doc.line(contentX, y, CARD_WIDTH - 3, y);
  y += 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.text(`ID No : ${employee.employeeCode ?? "—"}`, contentX, y);
  y += 4.5;
  doc.text(`${employee.phone || "—"}`, contentX, y);

  // Decorative swoosh curves, bottom-right, above the footer bar.
  drawArc(doc, CARD_WIDTH, CARD_HEIGHT - 6, 18, accent, 0.5);
  drawArc(doc, CARD_WIDTH, CARD_HEIGHT - 6, 12, accent, 0.6);
  drawArc(doc, CARD_WIDTH, CARD_HEIGHT - 6, 6, accent, 0.9);

  // Footer bar
  const footerH = 6;
  doc.setFillColor(...accent);
  doc.rect(0, CARD_HEIGHT - footerH, CARD_WIDTH, footerH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.text("01", 3, CARD_HEIGHT - footerH / 2 + 1);
  doc.text(
    input.companyWebsite || "—",
    CARD_WIDTH - 3,
    CARD_HEIGHT - footerH / 2 + 1,
    { align: "right" },
  );
  doc.setTextColor(0, 0, 0);

  // ── Back ─────────────────────────────────────────────────
  doc.addPage([CARD_WIDTH, CARD_HEIGHT]);
  doc.setFillColor(...accent);
  doc.rect(0, 0, 2, CARD_HEIGHT, "F");
  drawLanyardSlot(doc);

  const bx = 6;
  const bw = CARD_WIDTH - bx - 3;
  let by = 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...accent);
  doc.text("COMPANY ADDRESS", bx, by);
  doc.setTextColor(0, 0, 0);
  by += 4.5;

  doc.setFontSize(7);
  doc.text(input.companyName || "Your Company", bx, by);
  by += 3.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  const backAddrLines = doc.splitTextToSize(input.companyAddress || "—", bw);
  doc.text(backAddrLines, bx, by);
  by += backAddrLines.length * 3 + 2;

  doc.setDrawColor(accent[0], accent[1], accent[2]);
  doc.setLineWidth(0.2);
  doc.line(bx, by, CARD_WIDTH - 3, by);
  by += 3.5;

  doc.text(`${input.companyPhone || "—"}`, bx, by);
  by += 3.2;
  doc.text(`${input.companyEmail || "—"}`, bx, by);
  by += 3.2;
  doc.text(`${input.companyWebsite || "—"}`, bx, by);
  by += 4;

  doc.line(bx, by, CARD_WIDTH - 3, by);
  by += 4.5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...accent);
  doc.text("EMERGENCY CONTACT", bx, by);
  doc.setTextColor(0, 0, 0);
  by += 4.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.text(`Name : ${employee.emergencyContactName || "—"}`, bx, by);
  by += 3.2;
  doc.text(`Phone : ${employee.emergencyContactPhone || "—"}`, bx, by);
  by += 3.2;
  doc.text(`Blood Group : ${employee.bloodGroup || "—"}`, bx, by);

  if (employee.employeeCode) {
    const qrDataUrl = await QRCode.toDataURL(employee.employeeCode, {
      margin: 1,
      width: 200,
    });
    doc.addImage(qrDataUrl, "PNG", CARD_WIDTH - 15, CARD_HEIGHT - 32, 12, 12);
  }

  // Legal footer — plain white background with bulleted lines, matching the
  // approved template exactly (not a tinted band).
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.setTextColor(40);
  const footerLines = [
    `This card is the property of ${input.companyName || "the company"}.`,
    "If found, please return to the above address.",
    "Misuse of this card is a punishable offence.",
  ];
  let fy = CARD_HEIGHT - 10;
  for (const line of footerLines) {
    doc.text(`• ${line}`, bx, fy);
    fy += 2.8;
  }

  return doc.output("blob");
}
