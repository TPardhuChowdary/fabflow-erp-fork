/**
 * Printable/PDF content for the Ledger module. Isolated from
 * lib/documentRenderers.tsx on purpose — the Ledger is a brand new module
 * and must not touch the render paths used by Invoice/Quotation/PO/Challan.
 * Rendered off-screen and captured via lib/documentUtils.ts's
 * printDocument()/handleDownload(), the same generic, document-agnostic
 * utilities Quotations/Invoices already use.
 */
import type { LedgerRow } from "../lib/ledger";

const fmt = (n: number) => `₹${(Number(n) || 0).toLocaleString("en-IN")}`;

const HIDDEN_STYLE: React.CSSProperties = {
  width: "794px",
  background: "white",
  padding: "20px",
  fontFamily: "Arial, sans-serif",
  fontSize: "13px",
  color: "#000",
};

interface Props {
  id: string;
  accountType: "Customer" | "Vendor";
  accountLabel: string;
  accountDetails: {
    phone?: string;
    email?: string;
    address?: string;
    gstin?: string;
  };
  periodLabel: string;
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
  outstanding: number;
  rows: LedgerRow[];
  settings: Record<string, string>;
}

import type React from "react";

export function LedgerDocContent({
  id,
  accountType,
  accountLabel,
  accountDetails,
  periodLabel,
  openingBalance,
  closingBalance,
  totalDebit,
  totalCredit,
  outstanding,
  rows,
  settings,
}: Props) {
  return (
    <div id={id} style={HIDDEN_STYLE}>
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          borderBottom: "2px solid #1a1a1a",
          paddingBottom: "12px",
          marginBottom: "14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
          {settings.companyLogo && (
            <img
              src={settings.companyLogo}
              alt="logo"
              style={{
                maxHeight: "60px",
                maxWidth: "120px",
                objectFit: "contain",
              }}
            />
          )}
          <div>
            <div style={{ fontSize: "20px", fontWeight: "800", color: "#111" }}>
              {settings.companyName || "YOUR COMPANY NAME"}
            </div>
            {settings.companyAddress && (
              <div
                style={{ fontSize: "11px", color: "#555", marginTop: "3px" }}
              >
                {settings.companyAddress}
              </div>
            )}
            {settings.companyGstin && (
              <div style={{ fontSize: "11px", color: "#555" }}>
                GSTIN: {settings.companyGstin}
              </div>
            )}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize: "18px",
              fontWeight: "700",
              color: "#1a1a1a",
              letterSpacing: "1px",
              textTransform: "uppercase",
            }}
          >
            {accountType} Ledger
          </div>
          <div style={{ fontSize: "11px", color: "#444", marginTop: "4px" }}>
            <strong>Period:</strong> {periodLabel}
          </div>
        </div>
      </div>

      {/* ACCOUNT DETAILS + OPENING BALANCE */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px",
          marginBottom: "16px",
          border: "1px solid #ddd",
          borderRadius: "4px",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "10px 14px", borderRight: "1px solid #ddd" }}>
          <div
            style={{
              fontSize: "10px",
              fontWeight: "700",
              color: "#777",
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              marginBottom: "6px",
            }}
          >
            {accountType}
          </div>
          <div style={{ fontWeight: "700", fontSize: "13px", color: "#111" }}>
            {accountLabel}
          </div>
          {accountDetails.address && (
            <div style={{ fontSize: "11px", color: "#555", marginTop: "3px" }}>
              {accountDetails.address}
            </div>
          )}
          {accountDetails.phone && (
            <div style={{ fontSize: "11px", color: "#555", marginTop: "3px" }}>
              Ph: {accountDetails.phone}
            </div>
          )}
          {accountDetails.gstin && (
            <div style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}>
              GSTIN: {accountDetails.gstin}
            </div>
          )}
        </div>
        <div style={{ padding: "10px 14px" }}>
          <div
            style={{
              fontSize: "10px",
              fontWeight: "700",
              color: "#777",
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              marginBottom: "6px",
            }}
          >
            Opening Balance
          </div>
          <div style={{ fontSize: "16px", fontWeight: "800", color: "#111" }}>
            {fmt(openingBalance)}
          </div>
        </div>
      </div>

      {/* TRANSACTION TABLE */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginBottom: "16px",
          fontSize: "11px",
        }}
      >
        <thead>
          <tr style={{ background: "#1a1a1a", color: "#fff" }}>
            <th style={{ padding: "6px 8px", textAlign: "left" }}>Date</th>
            <th style={{ padding: "6px 8px", textAlign: "left" }}>Type</th>
            <th style={{ padding: "6px 8px", textAlign: "left" }}>Doc No.</th>
            <th style={{ padding: "6px 8px", textAlign: "left" }}>
              Description
            </th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>Debit</th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>Credit</th>
            <th style={{ padding: "6px 8px", textAlign: "right" }}>Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.key}
              style={{
                borderBottom: "1px solid #eee",
                opacity: r.informational ? 0.6 : 1,
              }}
            >
              <td style={{ padding: "5px 8px" }}>{r.date}</td>
              <td style={{ padding: "5px 8px" }}>{r.docType}</td>
              <td style={{ padding: "5px 8px", fontFamily: "monospace" }}>
                {r.docNo}
              </td>
              <td style={{ padding: "5px 8px" }}>{r.description}</td>
              <td style={{ padding: "5px 8px", textAlign: "right" }}>
                {r.informational
                  ? r.refAmount
                    ? `(${fmt(r.refAmount)})`
                    : "—"
                  : r.debit
                    ? fmt(r.debit)
                    : "—"}
              </td>
              <td style={{ padding: "5px 8px", textAlign: "right" }}>
                {r.informational ? "—" : r.credit ? fmt(r.credit) : "—"}
              </td>
              <td
                style={{
                  padding: "5px 8px",
                  textAlign: "right",
                  fontWeight: 700,
                }}
              >
                {r.informational ? "—" : fmt(r.balance)}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={7}
                style={{ padding: "16px", textAlign: "center", color: "#999" }}
              >
                No transactions in this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* SUMMARY */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={{ width: "280px" }}>
          {[
            ["Total Debit", totalDebit],
            ["Total Credit", totalCredit],
            ["Closing Balance", closingBalance],
          ].map(([label, val]) => (
            <div
              key={label as string}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "4px 0",
                fontSize: "12px",
              }}
            >
              <span style={{ color: "#555" }}>{label}</span>
              <span style={{ fontWeight: 700 }}>{fmt(val as number)}</span>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 14px",
              background: "#1a1a1a",
              borderRadius: "4px",
              marginTop: "6px",
            }}
          >
            <span
              style={{
                color: "#ccc",
                fontSize: "11px",
                fontWeight: "700",
                textTransform: "uppercase",
              }}
            >
              Outstanding (All-Time)
            </span>
            <span
              style={{ color: "#fff", fontWeight: "800", fontSize: "16px" }}
            >
              {fmt(outstanding)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
