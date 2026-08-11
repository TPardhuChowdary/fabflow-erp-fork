/**
 * Zero-dependency CSV / Excel export for the Ledger module. This app has no
 * xlsx/exceljs package installed (checked package.json), so "Excel" export
 * uses the standard zero-dependency trick: an HTML <table> served with an
 * application/vnd.ms-excel mime type and a .xls extension, which Excel and
 * Google Sheets both open natively with real columns/rows. CSV export is a
 * plain comma-separated file.
 */
import type { LedgerRow } from "./ledger";

export interface LedgerExportMeta {
  companyName: string;
  accountType: "Customer" | "Vendor";
  accountLabel: string;
  periodLabel: string;
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
  outstanding: number;
}

const fmt = (n: number) =>
  (Number(n) || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function csvCell(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadBlob(
  content: string,
  mimeType: string,
  fileName: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const HEADERS = [
  "Date",
  "Document Type",
  "Document Number",
  "Description",
  "Debit",
  "Credit",
  "Running Balance",
];

function ledgerHeaderLines(meta: LedgerExportMeta): string[][] {
  return [
    [meta.companyName],
    [`${meta.accountType} Ledger — ${meta.accountLabel}`],
    [`Period: ${meta.periodLabel}`],
    [`Opening Balance: ${fmt(meta.openingBalance)}`],
    [],
  ];
}

function ledgerFooterLines(meta: LedgerExportMeta): string[][] {
  return [
    [],
    ["", "", "", "Total Debit", fmt(meta.totalDebit)],
    ["", "", "", "Total Credit", fmt(meta.totalCredit)],
    ["", "", "", "Closing Balance", fmt(meta.closingBalance)],
    ["", "", "", "Outstanding (all-time)", fmt(meta.outstanding)],
  ];
}

export function exportLedgerCsv(
  rows: LedgerRow[],
  meta: LedgerExportMeta,
  fileName: string,
): void {
  const lines: string[][] = [
    ...ledgerHeaderLines(meta),
    HEADERS,
    ...rows.map((r) => [
      r.date,
      r.docType,
      r.docNo,
      r.description,
      r.informational ? "" : r.debit ? fmt(r.debit) : "",
      r.informational ? "" : r.credit ? fmt(r.credit) : "",
      r.informational ? "" : fmt(r.balance),
    ]),
    ...ledgerFooterLines(meta),
  ];
  const csv = lines.map((row) => row.map(csvCell).join(",")).join("\r\n");
  downloadBlob(csv, "text/csv;charset=utf-8;", fileName);
}

export function exportLedgerExcel(
  rows: LedgerRow[],
  meta: LedgerExportMeta,
  fileName: string,
): void {
  const escapeHtml = (s: string | number) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const rowsHtml = rows
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.date)}</td>
        <td>${escapeHtml(r.docType)}</td>
        <td>${escapeHtml(r.docNo)}</td>
        <td>${escapeHtml(r.description)}</td>
        <td align="right">${r.informational ? "" : r.debit ? escapeHtml(fmt(r.debit)) : ""}</td>
        <td align="right">${r.informational ? "" : r.credit ? escapeHtml(fmt(r.credit)) : ""}</td>
        <td align="right">${r.informational ? "" : escapeHtml(fmt(r.balance))}</td>
      </tr>`,
    )
    .join("");

  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel">
<head>
  <meta charset="utf-8" />
  <style>
    table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; }
    th, td { border: 1px solid #ccc; padding: 4px 8px; }
    th { background: #1a1a1a; color: #fff; }
    .meta { font-weight: bold; }
  </style>
</head>
<body>
  <table>
    <tr><td class="meta" colspan="7">${escapeHtml(meta.companyName)}</td></tr>
    <tr><td class="meta" colspan="7">${escapeHtml(meta.accountType)} Ledger — ${escapeHtml(meta.accountLabel)}</td></tr>
    <tr><td colspan="7">Period: ${escapeHtml(meta.periodLabel)}</td></tr>
    <tr><td colspan="7">Opening Balance: ${escapeHtml(fmt(meta.openingBalance))}</td></tr>
    <tr><td colspan="7"></td></tr>
    <tr>${HEADERS.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>
    ${rowsHtml}
    <tr><td colspan="7"></td></tr>
    <tr><td colspan="4">Total Debit</td><td align="right">${escapeHtml(fmt(meta.totalDebit))}</td></tr>
    <tr><td colspan="4">Total Credit</td><td align="right">${escapeHtml(fmt(meta.totalCredit))}</td></tr>
    <tr><td colspan="4">Closing Balance</td><td align="right">${escapeHtml(fmt(meta.closingBalance))}</td></tr>
    <tr><td colspan="4">Outstanding (all-time)</td><td align="right">${escapeHtml(fmt(meta.outstanding))}</td></tr>
  </table>
</body>
</html>`;

  downloadBlob(html, "application/vnd.ms-excel", fileName);
}
