import {
  formatJobCardDuration,
  getJobCardActiveSeconds,
} from "../hooks/useJobCardTimer";
/**
 * Shared document content components.
 * Used as hidden off-screen containers in page files so html2canvas
 * can capture them for Download / Share.
 */
import type {
  CompanyPO,
  Customer,
  DeliveryChallan,
  Invoice,
  JobCard,
  Project,
  Quotation,
} from "../types";
import { getCustomerVisibleName } from "./utils";

const fmt = (n: number) => `₹${(Number(n) || 0).toLocaleString("en-IN")}`;

const DEFAULT_INVOICE_TERMS =
  "1. Payment due within 30 days of invoice date.\n2. Goods once sold are not returnable.\n3. Subject to local jurisdiction.";
const DEFAULT_QUOTATION_TERMS =
  "1. Quotation valid for 15 days from date of issue.\n2. Taxes applicable as per GST norms.\n3. Subject to local jurisdiction.";
const DEFAULT_PO_TERMS =
  "1. Payment as per agreed terms.\n2. Goods as per specifications.\n3. Subject to local jurisdiction.";

function amountToWords(amount: number): string {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
  function toWords(n: number): string {
    if (n === 0) return "";
    if (n < 20) return `${ones[n]} `;
    if (n < 100)
      return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""} `;
    if (n < 1000)
      return `${ones[Math.floor(n / 100)]} Hundred ${toWords(n % 100)}`;
    if (n < 100000)
      return `${toWords(Math.floor(n / 1000))}Thousand ${toWords(n % 1000)}`;
    if (n < 10000000)
      return `${toWords(Math.floor(n / 100000))}Lakh ${toWords(n % 100000)}`;
    return `${toWords(Math.floor(n / 10000000))}Crore ${toWords(n % 10000000)}`;
  }
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  let words = toWords(rupees).trim();
  if (!words) words = "Zero";
  words =
    words.charAt(0).toUpperCase() +
    words
      .slice(1)
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  if (paise > 0) words += ` and ${toWords(paise).trim()} Paise`;
  return `${words} Only`;
}

/** Quotation-only wrapper around amountToWords that fixes a pre-existing
 * capitalization bug (the shared function's title-casing produces e.g.
 * "ELeven..." instead of "Eleven..."). Scoped to Quotation on purpose —
 * Invoice/PO keep calling the original amountToWords unchanged, per the
 * requirement that those documents continue exactly as they do today. */
function quotationAmountToWords(amount: number): string {
  return amountToWords(amount).replace(
    /^(\p{Lu})(\p{Lu})/u,
    (_m, first, second) => first + second.toLowerCase(),
  );
}

const HIDDEN_STYLE: React.CSSProperties = {
  width: "794px",
  background: "white",
  padding: "20px",
  fontFamily: "Arial, sans-serif",
  fontSize: "13px",
  color: "#000",
};

import type React from "react";

// ── INVOICE ────────────────────────────────────────────────────────

interface InvoiceDocProps {
  id: string;
  invoice: Invoice;
  customer: Customer | null;
  settings: Record<string, string>;
}

export function InvoiceDocContent({
  id,
  invoice,
  customer,
  settings,
}: InvoiceDocProps) {
  const bankName = settings.bankName || invoice.bankDetails?.bankName || "";
  const accountName =
    settings.accountName || invoice.bankDetails?.accountName || "";
  const accountNumber =
    settings.accountNumber || invoice.bankDetails?.accountNo || "";
  const ifscCode = settings.ifscCode || invoice.bankDetails?.ifsc || "";
  const bankBranch = settings.bankBranch || invoice.bankDetails?.branch || "";
  const terms =
    invoice.termsAndConditions ||
    settings.companyTerms ||
    DEFAULT_INVOICE_TERMS;
  const declaration =
    settings.companyDeclaration ||
    "We declare that this invoice shows the actual price of the goods/services described and that all particulars are true and correct.";
  const buyerGstin = invoice.buyerGstin || customer?.gstin || "";
  const buyerAddress = invoice.buyerAddress || customer?.address || "";
  const buyerStateName = invoice.buyerStateName || customer?.stateName || "";
  const buyerStateCode = invoice.buyerStateCode || customer?.stateCode || "";

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
            {(settings.companyStateName || settings.companyStateCode) && (
              <div style={{ fontSize: "11px", color: "#555" }}>
                State: {settings.companyStateName || "\u2014"}
                {settings.companyStateCode
                  ? ` | Code: ${settings.companyStateCode}`
                  : ""}
              </div>
            )}
            {settings.companyPhone && (
              <div style={{ fontSize: "11px", color: "#555" }}>
                Ph: {settings.companyPhone}
              </div>
            )}
            {settings.companyEmail && (
              <div style={{ fontSize: "11px", color: "#555" }}>
                {settings.companyEmail}
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
            {invoice.invoiceType === "proforma"
              ? "PROFORMA INVOICE"
              : "TAX INVOICE"}
          </div>
          <div style={{ fontSize: "11px", color: "#444", marginTop: "4px" }}>
            <strong>Invoice No:</strong> {invoice.invNo}
          </div>
          <div style={{ fontSize: "11px", color: "#444" }}>
            <strong>Date:</strong> {invoice.invoiceDate || "\u2014"}
          </div>
          {/* Invoice multi-PO feature (see chat) — same real list this
              document-generation path shares with InvoicePrintView.tsx;
              see that file's own comment for the fallback reasoning. */}
          {invoice.purchaseOrders && invoice.purchaseOrders.length > 0
            ? invoice.purchaseOrders.map((po) => (
                <div key={po.id} style={{ fontSize: "11px", color: "#444" }}>
                  <strong>PO No:</strong> {po.poNumber}
                  {po.poDate ? ` (${po.poDate})` : ""}
                </div>
              ))
            : invoice.poNumber && (
                <div style={{ fontSize: "11px", color: "#444" }}>
                  <strong>PO No:</strong> {invoice.poNumber}
                  {invoice.poDate ? ` (${invoice.poDate})` : ""}
                </div>
              )}
        </div>
      </div>

      {/* BILL TO + DELIVERY */}
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
            Bill To
          </div>
          <div style={{ fontWeight: "700", fontSize: "13px", color: "#111" }}>
            {customer?.name || "\u2014"}
          </div>
          {buyerAddress && (
            <div
              style={{
                fontSize: "11px",
                color: "#555",
                marginTop: "3px",
                lineHeight: "1.5",
              }}
            >
              {buyerAddress}
            </div>
          )}
          {customer?.phone && (
            <div style={{ fontSize: "11px", color: "#555", marginTop: "3px" }}>
              Ph: {customer.phone}
            </div>
          )}
          {buyerGstin && (
            <div style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}>
              GSTIN: {buyerGstin}
            </div>
          )}
          {(buyerStateName || buyerStateCode) && (
            <div style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}>
              State: {buyerStateName || "\u2014"}
              {buyerStateCode ? ` | Code: ${buyerStateCode}` : ""}
            </div>
          )}
          {(customer?.additionalDetails || []).map((d) => (
            <div
              key={d.key}
              style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}
            >
              <strong>{d.key}:</strong> {d.value}
            </div>
          ))}
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
            Delivery Details
          </div>
          <div style={{ fontSize: "11px", color: "#444", lineHeight: "1.8" }}>
            {invoice.deliveryDestination ? (
              <div>
                <strong>Destination:</strong> {invoice.deliveryDestination}
              </div>
            ) : (
              <span style={{ color: "#aaa" }}>—</span>
            )}
          </div>
        </div>
      </div>

      {/* ITEMS TABLE */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginBottom: "16px",
          fontSize: "12px",
        }}
      >
        <thead>
          <tr style={{ background: "#1a1a1a", color: "#fff" }}>
            <th
              style={{ padding: "8px 10px", textAlign: "left", width: "30px" }}
            >
              #
            </th>
            <th style={{ padding: "8px 10px", textAlign: "left" }}>
              Description
            </th>
            <th
              style={{
                padding: "8px 10px",
                textAlign: "center",
                width: "70px",
              }}
            >
              HSN
            </th>
            <th
              style={{ padding: "8px 10px", textAlign: "right", width: "50px" }}
            >
              Qty
            </th>
            <th
              style={{ padding: "8px 10px", textAlign: "right", width: "90px" }}
            >
              Unit Price
            </th>
            <th
              style={{ padding: "8px 10px", textAlign: "right", width: "90px" }}
            >
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {(invoice.lineItems || []).map((item, i) => (
            <tr
              key={`${item.desc}-${i}`}
              style={{
                borderBottom: "1px solid #eee",
                background: i % 2 === 0 ? "#fff" : "#fafafa",
              }}
            >
              <td style={{ padding: "7px 10px", color: "#888" }}>{i + 1}</td>
              <td style={{ padding: "7px 10px" }}>{item.desc}</td>
              <td
                style={{
                  padding: "7px 10px",
                  textAlign: "center",
                  color: "#666",
                }}
              >
                {item.hsn || "\u2014"}
              </td>
              <td style={{ padding: "7px 10px", textAlign: "right" }}>
                {item.qty}
              </td>
              <td style={{ padding: "7px 10px", textAlign: "right" }}>
                {fmt(item.rate)}
              </td>
              <td
                style={{
                  padding: "7px 10px",
                  textAlign: "right",
                  fontWeight: "600",
                }}
              >
                {fmt(item.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* TOTALS */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            width: "260px",
            border: "1px solid #ddd",
            borderRadius: "4px",
            overflow: "hidden",
            fontSize: "12px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "7px 12px",
              borderBottom: "1px solid #eee",
            }}
          >
            <span style={{ color: "#666" }}>Subtotal</span>
            <span>{fmt(invoice.subtotal ?? 0)}</span>
          </div>
          {(invoice.cgstAmt ?? 0) > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "7px 12px",
                borderBottom: "1px solid #eee",
              }}
            >
              <span style={{ color: "#666" }}>CGST ({invoice.cgstRate}%)</span>
              <span>{fmt(invoice.cgstAmt ?? 0)}</span>
            </div>
          )}
          {(invoice.sgstAmt ?? 0) > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "7px 12px",
                borderBottom: "1px solid #eee",
              }}
            >
              <span style={{ color: "#666" }}>SGST ({invoice.sgstRate}%)</span>
              <span>{fmt(invoice.sgstAmt ?? 0)}</span>
            </div>
          )}
          {(invoice.igstAmt ?? 0) > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "7px 12px",
                borderBottom: "1px solid #eee",
              }}
            >
              <span style={{ color: "#666" }}>IGST ({invoice.igstRate}%)</span>
              <span>{fmt(invoice.igstAmt ?? 0)}</span>
            </div>
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "9px 12px",
              background: "#1a1a1a",
              color: "#fff",
              fontWeight: "700",
              fontSize: "13px",
            }}
          >
            <span>Grand Total</span>
            <span>{fmt(invoice.totalAmount ?? 0)}</span>
          </div>
        </div>
      </div>

      {/* AMOUNT IN WORDS */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: "4px",
          padding: "8px 14px",
          marginBottom: "14px",
          fontSize: "12px",
        }}
      >
        <span style={{ fontWeight: "700", color: "#444" }}>
          Amount in Words:{" "}
        </span>
        <span style={{ fontStyle: "italic" }}>
          {amountToWords(invoice.totalAmount ?? 0)}
        </span>
      </div>

      {/* BANK + TERMS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0",
          border: "1px solid #ddd",
          borderRadius: "4px",
          overflow: "hidden",
          marginBottom: "14px",
          fontSize: "11px",
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
              marginBottom: "7px",
            }}
          >
            Bank Details
          </div>
          <div style={{ lineHeight: "1.8", color: "#444" }}>
            <div>
              <strong>Bank:</strong> {bankName || "\u2014"}
            </div>
            <div>
              <strong>A/C Name:</strong> {accountName || "\u2014"}
            </div>
            <div>
              <strong>A/C No:</strong> {accountNumber || "\u2014"}
            </div>
            <div>
              <strong>IFSC:</strong> {ifscCode || "\u2014"}
            </div>
            <div>
              <strong>Branch:</strong> {bankBranch || "\u2014"}
            </div>
          </div>
        </div>
        <div style={{ padding: "10px 14px" }}>
          <div
            style={{
              fontSize: "10px",
              fontWeight: "700",
              color: "#777",
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              marginBottom: "7px",
            }}
          >
            Terms &amp; Conditions
          </div>
          <div
            style={{ color: "#555", lineHeight: "1.7", whiteSpace: "pre-line" }}
          >
            {terms}
          </div>
        </div>
      </div>

      {/* DECLARATION */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: "4px",
          padding: "8px 14px",
          marginBottom: "14px",
          fontSize: "11px",
          color: "#555",
        }}
      >
        <div
          style={{
            fontWeight: "700",
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            color: "#777",
            marginBottom: "4px",
          }}
        >
          Declaration
        </div>
        <div style={{ whiteSpace: "pre-line" }}>{declaration}</div>
      </div>

      {/* FOOTER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          borderTop: "1px solid #ddd",
          paddingTop: "12px",
          fontSize: "11px",
          color: "#777",
        }}
      >
        <div>This is a computer generated invoice.</div>
        <div style={{ textAlign: "center" }}>
          <div
            style={{ marginBottom: "30px", fontSize: "11px", color: "#555" }}
          >
            For {settings.companyName || "Company"}
          </div>
          <div
            style={{
              width: "140px",
              borderTop: "1px solid #aaa",
              paddingTop: "4px",
              textAlign: "center",
              fontSize: "10px",
            }}
          >
            Authorised Signatory
          </div>
        </div>
      </div>
    </div>
  );
}

// ── QUOTATION ──────────────────────────────────────────────────────

interface QuotationDocProps {
  id: string;
  quotation: Quotation;
  customer: Customer | null;
  settings: Record<string, string>;
}

export function QuotationDocContent({
  id,
  quotation,
  customer,
  settings,
}: QuotationDocProps) {
  const bankName = settings.bankName || "";
  const accountName = settings.accountName || "";
  const accountNumber = settings.accountNumber || "";
  const ifscCode = settings.ifscCode || "";
  const bankBranch = settings.bankBranch || "";
  // A quotation shows only the offered price — no GST/subtotal/grand-total
  // breakdown. `subtotal` (the pre-tax sum of line items entered by the
  // user) doubles as that quoted amount here; tax fields on the Quotation
  // record are intentionally not read or displayed in this document.
  const subtotal = Number(quotation.subtotal ?? 0);
  const quotationDate =
    (quotation as any).date ||
    (quotation as any).quotationDate ||
    (quotation as any).createdAt ||
    "\u2014";
  const terms =
    (quotation as any).notes || quotation.terms || DEFAULT_QUOTATION_TERMS;

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
            {(settings.companyStateName || settings.companyStateCode) && (
              <div style={{ fontSize: "11px", color: "#555" }}>
                State: {settings.companyStateName || "\u2014"}
                {settings.companyStateCode
                  ? ` | Code: ${settings.companyStateCode}`
                  : ""}
              </div>
            )}
            {settings.companyPhone && (
              <div style={{ fontSize: "11px", color: "#555" }}>
                Ph: {settings.companyPhone}
              </div>
            )}
            {settings.companyEmail && (
              <div style={{ fontSize: "11px", color: "#555" }}>
                {settings.companyEmail}
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
            QUOTATION
          </div>
          <div style={{ fontSize: "11px", color: "#444", marginTop: "4px" }}>
            <strong>Quotation No:</strong> {quotation.qtNo}
          </div>
          <div style={{ fontSize: "11px", color: "#444" }}>
            <strong>Quotation Date:</strong> {quotationDate}
          </div>
          {quotation.validUntil && (
            <div style={{ fontSize: "11px", color: "#444" }}>
              <strong>Valid Until:</strong> {quotation.validUntil}
            </div>
          )}
        </div>
      </div>

      {/* BILL TO + VALID UNTIL */}
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
            Bill To
          </div>
          <div style={{ fontWeight: "700", fontSize: "13px", color: "#111" }}>
            {customer?.name || "\u2014"}
          </div>
          {customer?.address && (
            <div
              style={{
                fontSize: "11px",
                color: "#555",
                marginTop: "3px",
                lineHeight: "1.5",
              }}
            >
              {customer.address}
            </div>
          )}
          {customer?.phone && (
            <div style={{ fontSize: "11px", color: "#555", marginTop: "3px" }}>
              Ph: {customer.phone}
            </div>
          )}
          {customer?.gstin && (
            <div style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}>
              GSTIN: {customer.gstin}
            </div>
          )}
          {(customer?.additionalDetails || []).map((d) => (
            <div
              key={d.key}
              style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}
            >
              <strong>{d.key}:</strong> {d.value}
            </div>
          ))}
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
            Valid Until
          </div>
          <div style={{ fontSize: "13px", fontWeight: "700", color: "#111" }}>
            {quotation.validUntil || "\u2014"}
          </div>
        </div>
      </div>

      {/* ITEMS TABLE */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginBottom: "16px",
          fontSize: "12px",
        }}
      >
        <thead>
          <tr style={{ background: "#1a1a1a", color: "#fff" }}>
            <th
              style={{ padding: "8px 10px", textAlign: "left", width: "30px" }}
            >
              #
            </th>
            <th style={{ padding: "8px 10px", textAlign: "left" }}>
              Description
            </th>
            <th
              style={{
                padding: "8px 10px",
                textAlign: "center",
                width: "70px",
              }}
            >
              HSN
            </th>
            <th
              style={{ padding: "8px 10px", textAlign: "right", width: "50px" }}
            >
              Qty
            </th>
            <th
              style={{ padding: "8px 10px", textAlign: "right", width: "90px" }}
            >
              Unit Price
            </th>
            <th
              style={{ padding: "8px 10px", textAlign: "right", width: "90px" }}
            >
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {(quotation.lineItems || []).map((item, i) => (
            <tr
              key={`${item.desc}-${i}`}
              style={{
                borderBottom: "1px solid #eee",
                background: i % 2 === 0 ? "#fff" : "#fafafa",
              }}
            >
              <td style={{ padding: "7px 10px", color: "#888" }}>{i + 1}</td>
              <td style={{ padding: "7px 10px" }}>{item.desc}</td>
              <td
                style={{
                  padding: "7px 10px",
                  textAlign: "center",
                  color: "#666",
                }}
              >
                {item.hsn || "\u2014"}
              </td>
              <td style={{ padding: "7px 10px", textAlign: "right" }}>
                {item.qty}
              </td>
              <td style={{ padding: "7px 10px", textAlign: "right" }}>
                {fmt(Number(item.unitPrice ?? (item as any).rate ?? 0))}
              </td>
              <td
                style={{
                  padding: "7px 10px",
                  textAlign: "right",
                  fontWeight: "600",
                }}
              >
                {fmt(Number(item.amount ?? 0))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* QUOTED AMOUNT — a quotation is a commercial offer, not a tax
          document: it shows only the price being offered. GST/subtotal/
          grand-total breakdowns belong on the Proforma or Tax Invoice
          generated later, not here. */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: "10px",
        }}
      >
        <div style={{ width: "280px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 16px",
              background: "#1a1a1a",
              borderRadius: "4px",
            }}
          >
            <span
              style={{
                color: "#ccc",
                fontSize: "11px",
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: "0.6px",
              }}
            >
              Quoted Amount
            </span>
            <span
              style={{ color: "#fff", fontWeight: "800", fontSize: "18px" }}
            >
              {fmt(subtotal)}
            </span>
          </div>
          <div
            style={{
              fontSize: "10px",
              color: "#999",
              textAlign: "right",
              marginTop: "5px",
            }}
          >
            Taxes, if applicable, will be added at the time of invoicing.
          </div>
        </div>
      </div>

      {/* AMOUNT IN WORDS — converts only the quoted amount above; GST is
          never calculated or included in a quotation. */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: "4px",
          padding: "8px 14px",
          marginBottom: "14px",
          fontSize: "12px",
        }}
      >
        <span style={{ fontWeight: "700", color: "#444" }}>
          Amount in Words:{" "}
        </span>
        <span style={{ fontStyle: "italic" }}>
          {quotationAmountToWords(subtotal)}
        </span>
      </div>

      {/* BANK + TERMS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0",
          border: "1px solid #ddd",
          borderRadius: "4px",
          overflow: "hidden",
          marginBottom: "14px",
          fontSize: "11px",
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
              marginBottom: "7px",
            }}
          >
            Bank Details
          </div>
          <div style={{ lineHeight: "1.8", color: "#444" }}>
            <div>
              <strong>Bank:</strong> {bankName || "\u2014"}
            </div>
            <div>
              <strong>A/C Name:</strong> {accountName || "\u2014"}
            </div>
            <div>
              <strong>A/C No:</strong> {accountNumber || "\u2014"}
            </div>
            <div>
              <strong>IFSC:</strong> {ifscCode || "\u2014"}
            </div>
            <div>
              <strong>Branch:</strong> {bankBranch || "\u2014"}
            </div>
          </div>
        </div>
        <div style={{ padding: "10px 14px" }}>
          <div
            style={{
              fontSize: "10px",
              fontWeight: "700",
              color: "#777",
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              marginBottom: "7px",
            }}
          >
            Terms &amp; Conditions
          </div>
          <div
            style={{ color: "#555", lineHeight: "1.7", whiteSpace: "pre-line" }}
          >
            {terms}
          </div>
        </div>
      </div>

      {/* DECLARATION */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: "4px",
          padding: "8px 14px",
          marginBottom: "14px",
          fontSize: "11px",
          color: "#555",
        }}
      >
        <div
          style={{
            fontWeight: "700",
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            color: "#777",
            marginBottom: "4px",
          }}
        >
          Declaration
        </div>
        <div>
          We declare that this quotation shows the actual price of the
          goods/services described and that all particulars are true and
          correct.
        </div>
      </div>

      {/* FOOTER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          borderTop: "1px solid #ddd",
          paddingTop: "12px",
          fontSize: "11px",
          color: "#777",
        }}
      >
        <div>This is a computer generated quotation.</div>
        <div style={{ textAlign: "center" }}>
          <div
            style={{ marginBottom: "30px", fontSize: "11px", color: "#555" }}
          >
            For {settings.companyName || "Company"}
          </div>
          <div
            style={{
              width: "140px",
              borderTop: "1px solid #aaa",
              paddingTop: "4px",
              textAlign: "center",
              fontSize: "10px",
            }}
          >
            Authorised Signatory
          </div>
        </div>
      </div>
    </div>
  );
}

// ── COMPANY PO ─────────────────────────────────────────────────────

interface CompanyPODocProps {
  id: string;
  po: CompanyPO;
  settings: Record<string, string>;
}

export function CompanyPODocContent({ id, po, settings }: CompanyPODocProps) {
  const fmtPO = (n: number) =>
    `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  const terms =
    po.termsAndConditions || settings.companyTerms || DEFAULT_PO_TERMS;

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
            {settings.companyPhone && (
              <div style={{ fontSize: "11px", color: "#555" }}>
                Ph: {settings.companyPhone}
              </div>
            )}
            {settings.companyEmail && (
              <div style={{ fontSize: "11px", color: "#555" }}>
                {settings.companyEmail}
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
            PURCHASE ORDER
          </div>
          <div style={{ fontSize: "11px", color: "#444", marginTop: "4px" }}>
            <strong>PO No:</strong> {po.cpoNumber}
          </div>
          <div style={{ fontSize: "11px", color: "#444" }}>
            <strong>Date:</strong> {fmtDate(po.createdAt)}
          </div>
          {po.expectedDeliveryDate && (
            <div style={{ fontSize: "11px", color: "#444" }}>
              <strong>Expected Delivery:</strong> {po.expectedDeliveryDate}
            </div>
          )}
        </div>
      </div>

      {/* SUPPLIER + DELIVERY */}
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
            Supplier Details
          </div>
          <div style={{ fontWeight: "700", fontSize: "13px", color: "#111" }}>
            {po.vendorName || "\u2014"}
          </div>
          {po.vendorAddress && (
            <div
              style={{
                fontSize: "11px",
                color: "#555",
                marginTop: "3px",
                lineHeight: "1.5",
              }}
            >
              {po.vendorAddress}
            </div>
          )}
          {po.vendorGst && (
            <div style={{ fontSize: "11px", color: "#555", marginTop: "3px" }}>
              GSTIN: {po.vendorGst}
            </div>
          )}
          {po.vendorContact && (
            <div style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}>
              Contact: {po.vendorContact}
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
            Delivery Address
          </div>
          {po.deliveryAddress ? (
            <div
              style={{
                fontSize: "11px",
                color: "#444",
                lineHeight: "1.8",
                whiteSpace: "pre-line",
              }}
            >
              {po.deliveryAddress}
            </div>
          ) : (
            <span style={{ fontSize: "11px", color: "#aaa" }}>—</span>
          )}
        </div>
      </div>

      {/* ITEMS TABLE */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginBottom: "16px",
          fontSize: "12px",
        }}
      >
        <thead>
          <tr style={{ background: "#1a1a1a", color: "#fff" }}>
            <th
              style={{ padding: "8px 10px", textAlign: "left", width: "30px" }}
            >
              #
            </th>
            <th style={{ padding: "8px 10px", textAlign: "left" }}>
              Description
            </th>
            <th
              style={{ padding: "8px 10px", textAlign: "right", width: "60px" }}
            >
              Qty
            </th>
            <th
              style={{
                padding: "8px 10px",
                textAlign: "center",
                width: "60px",
              }}
            >
              Unit
            </th>
            <th
              style={{ padding: "8px 10px", textAlign: "right", width: "90px" }}
            >
              Rate (₹)
            </th>
            <th
              style={{ padding: "8px 10px", textAlign: "right", width: "90px" }}
            >
              Amount (₹)
            </th>
          </tr>
        </thead>
        <tbody>
          {(po.items || []).map((item, i) => (
            <tr
              key={item.id}
              style={{
                borderBottom: "1px solid #eee",
                background: i % 2 === 0 ? "#fff" : "#fafafa",
              }}
            >
              <td style={{ padding: "7px 10px", color: "#888" }}>{i + 1}</td>
              <td style={{ padding: "7px 10px" }}>{item.description}</td>
              <td style={{ padding: "7px 10px", textAlign: "right" }}>
                {item.quantity}
              </td>
              <td
                style={{
                  padding: "7px 10px",
                  textAlign: "center",
                  color: "#666",
                }}
              >
                {item.unit}
              </td>
              <td style={{ padding: "7px 10px", textAlign: "right" }}>
                {fmtPO(item.rate)}
              </td>
              <td
                style={{
                  padding: "7px 10px",
                  textAlign: "right",
                  fontWeight: "600",
                }}
              >
                {fmtPO(item.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* TOTALS */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            width: "260px",
            border: "1px solid #ddd",
            borderRadius: "4px",
            overflow: "hidden",
            fontSize: "12px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "7px 12px",
              borderBottom: "1px solid #eee",
            }}
          >
            <span style={{ color: "#666" }}>Subtotal</span>
            <span>{fmtPO(po.subtotal ?? 0)}</span>
          </div>
          {(po.gstPercent || 0) > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "7px 12px",
                borderBottom: "1px solid #eee",
              }}
            >
              <span style={{ color: "#666" }}>GST ({po.gstPercent}%)</span>
              <span>{fmtPO(po.gstAmount ?? 0)}</span>
            </div>
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "9px 12px",
              background: "#1a1a1a",
              color: "#fff",
              fontWeight: "700",
              fontSize: "13px",
            }}
          >
            <span>Grand Total</span>
            <span>{fmtPO(po.grandTotal ?? 0)}</span>
          </div>
        </div>
      </div>

      {/* AMOUNT IN WORDS */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: "4px",
          padding: "8px 14px",
          marginBottom: "14px",
          fontSize: "12px",
        }}
      >
        <span style={{ fontWeight: "700", color: "#444" }}>
          Amount in Words:{" "}
        </span>
        <span style={{ fontStyle: "italic" }}>
          {amountToWords(po.grandTotal ?? 0)}
        </span>
      </div>

      {/* TERMS */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: "4px",
          overflow: "hidden",
          marginBottom: "14px",
          fontSize: "11px",
        }}
      >
        <div style={{ padding: "10px 14px" }}>
          <div
            style={{
              fontSize: "10px",
              fontWeight: "700",
              color: "#777",
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              marginBottom: "7px",
            }}
          >
            Terms &amp; Conditions
          </div>
          <div
            style={{ color: "#555", lineHeight: "1.7", whiteSpace: "pre-line" }}
          >
            {terms}
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          borderTop: "1px solid #ddd",
          paddingTop: "12px",
          fontSize: "11px",
          color: "#777",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: "140px",
              borderTop: "1px solid #aaa",
              paddingTop: "4px",
              textAlign: "center",
              fontSize: "10px",
            }}
          >
            Receiver&apos;s Signature
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div
            style={{ marginBottom: "30px", fontSize: "11px", color: "#555" }}
          >
            For {settings.companyName || "Company"}
          </div>
          <div
            style={{
              width: "140px",
              borderTop: "1px solid #aaa",
              paddingTop: "4px",
              textAlign: "center",
              fontSize: "10px",
            }}
          >
            Authorised Signatory
          </div>
        </div>
      </div>
    </div>
  );
}

// ── DELIVERY CHALLAN ───────────────────────────────────────────────

interface ChallanDocProps {
  id: string;
  challan: DeliveryChallan;
  customer: Customer | null;
  projects: Project[];
  settings: Record<string, string>;
}

export function ChallanDocContent({
  id,
  challan,
  customer,
  projects,
  settings,
}: ChallanDocProps) {
  const entries = challan.projectEntries || [];

  const deliveryAddress = (() => {
    if (!challan.deliveryAddress) return customer?.address || "";
    if (challan.deliveryAddress.type === "custom")
      return challan.deliveryAddress.value;
    return customer?.address || "";
  })();

  function getPoRef(): string {
    const refs = entries
      .map((e) => {
        const proj = projects.find((p) => p.id === e.projectId);
        return (proj?.pos || [])
          .map((po) => po.poNumber)
          .filter(Boolean)
          .join(", ");
      })
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i);
    return refs.length > 0 ? refs.join(", ") : "\u2014";
  }

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
            {settings.companyPhone && (
              <div style={{ fontSize: "11px", color: "#555" }}>
                Ph: {settings.companyPhone}
              </div>
            )}
            {settings.companyEmail && (
              <div style={{ fontSize: "11px", color: "#555" }}>
                {settings.companyEmail}
              </div>
            )}
          </div>
        </div>
        <div style={{ textAlign: "right", minWidth: "160px" }}>
          <div
            style={{
              fontSize: "18px",
              fontWeight: "700",
              color: "#1a1a1a",
              letterSpacing: "1px",
              textTransform: "uppercase",
            }}
          >
            DELIVERY CHALLAN
          </div>
          <div style={{ fontSize: "11px", color: "#444", marginTop: "6px" }}>
            <strong>Challan No:</strong> {challan.dcNo || ""}
          </div>
          <div style={{ fontSize: "11px", color: "#444" }}>
            <strong>Date:</strong> {challan.dispatchDate || "\u2014"}
          </div>
        </div>
      </div>

      {/* BILL TO / SHIP TO / DISPATCH */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "0",
          border: "1px solid #ddd",
          borderRadius: "4px",
          overflow: "hidden",
          marginBottom: "14px",
          fontSize: "11px",
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
            Bill To
          </div>
          <div style={{ fontWeight: "700", fontSize: "13px", color: "#111" }}>
            {customer?.name || "\u2014"}
          </div>
          {customer?.phone && (
            <div style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}>
              Ph: {customer.phone}
            </div>
          )}
          {customer?.gstin && (
            <div style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}>
              GSTIN: {customer.gstin}
            </div>
          )}
        </div>
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
            Ship To
          </div>
          {deliveryAddress ? (
            <div
              style={{
                fontSize: "11px",
                color: "#333",
                lineHeight: "1.6",
                whiteSpace: "pre-line",
              }}
            >
              {deliveryAddress}
            </div>
          ) : (
            <div style={{ fontSize: "11px", color: "#aaa" }}>—</div>
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
            Dispatch Details
          </div>
          <div style={{ lineHeight: "1.8", color: "#444", fontSize: "11px" }}>
            <div>
              <strong>Dispatched Via:</strong>{" "}
              {challan.dispatchMethod ?? "Company Vehicle"}
            </div>
            {/* Only the fields relevant to the dispatch method above are
                ever populated (see buildDispatchFields in
                pages/DeliveryChallans.tsx), so this conditional-on-value
                rendering naturally shows only what applies. */}
            {challan.vehicleNo && (
              <div>
                <strong>Vehicle No:</strong> {challan.vehicleNo}
              </div>
            )}
            {challan.driverName && (
              <div>
                <strong>Driver:</strong> {challan.driverName}
              </div>
            )}
            {challan.courierCompany && (
              <div>
                <strong>Courier Company:</strong> {challan.courierCompany}
              </div>
            )}
            {challan.trackingNumber && (
              <div>
                <strong>Tracking No:</strong> {challan.trackingNumber}
              </div>
            )}
            {challan.transportCompany && (
              <div>
                <strong>Transport Company:</strong> {challan.transportCompany}
              </div>
            )}
            {challan.lrNumber && (
              <div>
                <strong>LR No:</strong> {challan.lrNumber}
              </div>
            )}
            {challan.collectedBy && (
              <div>
                <strong>Collected By:</strong> {challan.collectedBy}
              </div>
            )}
            {challan.mobileNumber && (
              <div>
                <strong>Mobile:</strong> {challan.mobileNumber}
              </div>
            )}
            {challan.receiverName && (
              <div>
                <strong>Receiver:</strong> {challan.receiverName}
              </div>
            )}
            <div>
              <strong>Dispatch Date:</strong> {challan.dispatchDate || "\u2014"}
            </div>
          </div>
        </div>
      </div>

      {/* REFERENCE */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: "4px",
          padding: "7px 14px",
          marginBottom: "14px",
          fontSize: "11px",
          color: "#444",
        }}
      >
        <strong>Customer PO Ref:</strong> {getPoRef()}
      </div>

      {/* ITEMS TABLE */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginBottom: "16px",
          fontSize: "12px",
        }}
      >
        <thead>
          <tr style={{ background: "#1a1a1a", color: "#fff" }}>
            <th
              style={{ padding: "8px 10px", textAlign: "left", width: "36px" }}
            >
              #
            </th>
            <th style={{ padding: "8px 10px", textAlign: "left" }}>
              Description
            </th>
            <th
              style={{
                padding: "8px 10px",
                textAlign: "right",
                width: "100px",
              }}
            >
              Quantity
            </th>
            <th
              style={{
                padding: "8px 10px",
                textAlign: "left",
                width: "80px",
                paddingLeft: "16px",
              }}
            >
              Unit
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => {
            const project = projects.find((p) => p.id === entry.projectId);
            const description =
              project?.workDescription?.trim() ||
              (project ? getCustomerVisibleName(project) : entry.projectId);
            return (
              <tr
                key={entry.projectId}
                style={{
                  borderBottom: "1px solid #eee",
                  background: i % 2 === 0 ? "#fff" : "#fafafa",
                }}
              >
                <td style={{ padding: "8px 10px", color: "#888" }}>{i + 1}</td>
                <td
                  style={{
                    padding: "8px 10px",
                    fontWeight: "500",
                    lineHeight: "1.5",
                  }}
                >
                  {description}
                </td>
                <td style={{ padding: "8px 10px", textAlign: "right" }}>
                  {entry.dispatchQty}
                </td>
                <td
                  style={{
                    padding: "8px 10px",
                    paddingLeft: "16px",
                    color: "#555",
                  }}
                >
                  Nos
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* SIGNATURE */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "40px",
          marginTop: "40px",
          paddingTop: "12px",
          borderTop: "1px solid #ddd",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              minHeight: "80px",
              borderBottom: "1px solid #555",
              marginBottom: "6px",
            }}
          />
          <div style={{ fontSize: "11px", fontWeight: "600", color: "#333" }}>
            Authorized Signatory
          </div>
          <div style={{ fontSize: "10px", color: "#777" }}>
            For {settings.companyName || "Company"}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              minHeight: "80px",
              borderBottom: "1px solid #555",
              marginBottom: "6px",
            }}
          />
          <div style={{ fontSize: "11px", fontWeight: "600", color: "#333" }}>
            Receiver&apos;s Signature
          </div>
          <div style={{ fontSize: "10px", color: "#777" }}>
            Name: {challan.receiverName || "________________________"}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: "16px",
          fontSize: "10px",
          color: "#aaa",
          textAlign: "center",
        }}
      >
        This is a computer generated delivery challan.
      </div>
    </div>
  );
}

// ── JOB CARD (printable, shop-floor physical-workflow copy) ─────────
//
// Reuses the exact same existing JobCard row this whole feature is built
// on — no second Job Card record, no new ledger, no new persistence.
// Active Time is read straight from the same persisted fields and the
// same getJobCardActiveSeconds helper the in-app View dialog uses
// (hooks/useJobCardTimer.ts) — never re-derived or fabricated here.
//
// The printed sheet is a blank shop-floor manual record, not a mirror of
// the digital Job Card's own live progress: Start Time, Targeted End
// Time, Completed/Rejected/Rework quantities, remarks and both
// signatures are always printed blank (never pre-filled from `jobCard`,
// see each block's own comment below) — a supervisor fills these in by
// hand, then transcribes them back into the digital record. Only
// Project/Employee/Operation/Production Stage/Expected Quantity/Status
// and the new "Printed On" timestamp are auto-populated, since those are
// identifying information rather than the physical work being recorded.

const JOB_CARD_STATUS_LABEL: Record<JobCard["status"], string> = {
  NotStarted: "Not Started",
  InProgress: "In Progress",
  OnHold: "On Hold",
  Completed: "Completed",
};

interface JobCardDocProps {
  id: string;
  jobCard: JobCard;
  /** Already resolved by the caller, e.g. "PROJ-2026-001 — Cut sheet
   * order" — this component does no project lookup of its own. */
  projectLabel: string;
  /** null for an ad-hoc (unlinked) Job Card — rendered as "Ad-hoc (no
   * stage)" rather than omitted, so the printed sheet is explicit about
   * it rather than silently blank. */
  stageLabel: string | null;
  settings: Record<string, string>;
  /** The moment this print was generated (client clock, `Date.now()` at
   * render time) — shown as "Printed On" so a supervisor can tell how
   * fresh a physical sheet is. Deliberately NOT the Job Card's own
   * createdAt, and never persisted anywhere (see handlePrintJobCard's own
   * comment) — a value the caller computes fresh per print, not a field
   * read off `jobCard`. */
  printedAt: number;
  /** Job Card print/layout (see chat) — three DIFFERENT photo/drawing
   * concepts (Section 6 of the spec), never to be mixed:
   *
   * projectPhotoUrl: the PROJECT's own reference photo (identifies the
   * overall product/project this Job Card belongs to) — small, always
   * on Page 1, whenever the Project has one. This REPLACES the old
   * per-Job-Card "Product / Result Photo" block that used to sit here
   * (that was the employee's own evidence photo, which conflated
   * evidence with a work instruction — CompleteJobCardDialog/MyJobs.tsx
   * still capture and show that evidence photo exactly as before, it
   * just no longer auto-prints on Page 1).
   *
   * referencePhotoUrl: THIS Job Card's own selected "Work Reference"
   * photo — the expected visual result of the operation, admin-picked
   * via reference_photo_id. Large, dedicated Page 2, only when the
   * caller resolved one AND the Job Card's printReferencePhoto flag is
   * on (the caller is responsible for that gate — this component only
   * renders what it's given).
   *
   * drawingImageDataUrl: the existing linked engineering Drawing,
   * already composed into its own established print layout by
   * drawingEditor's own composeLatestView — this component embeds it
   * as a flat image, it does not render or know anything about
   * drawings itself (no second drawing renderer). Page 3+, same
   * caller-side gating as above (printDrawing flag + a link existing).
   *
   * All three are optional and independent; each section simply does
   * not render when its URL is undefined — a Job Card with none of
   * them prints byte-for-byte the same single-page layout as before
   * this feature existed. */
  projectPhotoUrl?: string;
  referencePhotoUrl?: string;
  drawingImageDataUrl?: string;
}

function formatPrintedOn(ms: number): string {
  return new Date(ms).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

const JOB_CARD_LABEL_STYLE: React.CSSProperties = {
  fontSize: "10px",
  fontWeight: 700,
  color: "#777",
  textTransform: "uppercase",
  letterSpacing: "0.8px",
  marginBottom: "6px",
};

// Small uppercase "section eyebrow" — the one repeated visual device
// that gives the redesigned sheet its hierarchy (WHO/WHAT vs PRODUCTION
// TARGET vs QUALITY/INSPECTION vs RESPONSIBILITY, per the design brief)
// without resorting to boxed "UI cards" that print poorly. Deliberately
// text-only, no background fill — a manufacturing traveler reads by
// section labels and rules, not by colored chrome.
function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "10.5px",
        fontWeight: 800,
        color: "#1a1a1a",
        textTransform: "uppercase",
        letterSpacing: "1px",
        borderBottom: "1.5px solid #1a1a1a",
        paddingBottom: "3px",
        marginBottom: "8px",
      }}
    >
      {children}
    </div>
  );
}

// Compact Priority pill (Section 5, see chat) — a single small inline
// badge, not a boxed metric cell, so it never grows the Job Identification
// strip past its existing row layout.
const PRIORITY_PILL_COLORS: Record<JobCard["priority"], string> = {
  Low: "#666",
  Normal: "#333",
  High: "#b45309",
  Urgent: "#b91c1c",
};

function PriorityPill({ priority }: { priority: JobCard["priority"] }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "11px",
        fontWeight: 700,
        color: PRIORITY_PILL_COLORS[priority],
        border: `1px solid ${PRIORITY_PILL_COLORS[priority]}`,
        borderRadius: "10px",
        padding: "1px 8px",
      }}
    >
      {priority}
    </span>
  );
}

export function JobCardDocContent({
  id,
  jobCard,
  projectLabel,
  stageLabel,
  settings,
  printedAt,
  projectPhotoUrl,
  referencePhotoUrl,
  drawingImageDataUrl,
}: JobCardDocProps) {
  const activeTimeDisplay = formatJobCardDuration(
    getJobCardActiveSeconds(jobCard),
  );

  return (
    <div
      id={id}
      style={{
        ...HIDDEN_STYLE,
        fontSize: "13px",
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#1a1a1a",
      }}
    >
      {/* WHO/WHAT — FabFlow/company identity + the Job Card's own
          number, always the first thing a shop-floor reader sees. A
          thin accent bar under the rule (not a colored card) keeps this
          a manufacturing document rather than a generic printed form. */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          paddingBottom: "10px",
          marginBottom: "3px",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
          {settings.companyLogo && (
            <img
              src={settings.companyLogo}
              alt="logo"
              style={{
                maxHeight: "52px",
                maxWidth: "110px",
                objectFit: "contain",
              }}
            />
          )}
          <div>
            {/* Same settings.companyName/companyLogo source Invoice's own
                header reads — falls back to "FABFLOW" only when Company
                Profile is genuinely unset, not a hardcoded brand. */}
            <div style={{ fontSize: "18px", fontWeight: 800, color: "#111" }}>
              {settings.companyName || "FABFLOW"}
            </div>
            {settings.companyAddress && (
              <div
                style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}
              >
                {settings.companyAddress}
              </div>
            )}
            {settings.companyPhone && (
              <div style={{ fontSize: "11px", color: "#555" }}>
                Ph: {settings.companyPhone}
              </div>
            )}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "#888",
              letterSpacing: "2px",
              textTransform: "uppercase",
            }}
          >
            Job Card
          </div>
          <div
            style={{
              fontSize: "22px",
              fontWeight: 800,
              color: "#111",
              fontFamily: "'Courier New', monospace",
              lineHeight: 1.15,
            }}
          >
            {jobCard.jobNo}
          </div>
          {/* Printed On — computed by the caller at print-generation time
              (client clock), never the Job Card's own createdAt and
              never written back to the Job Card. */}
          <div style={{ fontSize: "10.5px", color: "#666", marginTop: "2px" }}>
            Printed {formatPrintedOn(printedAt)}
          </div>
        </div>
      </div>
      <div
        style={{
          height: "3px",
          background: "#1a1a1a",
          marginBottom: "14px",
        }}
      />

      {/* JOB IDENTIFICATION — one compact 2-row strip combining what was
          previously two separate boxes (core details + time/status): row
          1 is real identifying data (Project/Employee/Operation/Stage),
          row 2 pairs the shop floor's own blank Start/Targeted-End
          fields with the two values that ARE already known (Active
          Time, Status) — never pre-filling Start/End from jobCard.start
          Time/endTime, exactly as before. */}
      <div
        style={{
          border: "1px solid #bbb",
          borderRadius: "3px",
          overflow: "hidden",
          marginBottom: "12px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            fontSize: "12px",
          }}
        >
          {[
            ["Project", projectLabel || "—"],
            ["Operation", jobCard.operationType],
            ["Assigned Employee", jobCard.employeeName || "—"],
          ].map(([label, value], i) => (
            <div
              key={label}
              style={{
                padding: "8px 10px",
                borderLeft: i > 0 ? "1px solid #ddd" : undefined,
                borderBottom: "1px solid #ddd",
              }}
            >
              <div style={JOB_CARD_LABEL_STYLE}>{label}</div>
              <div style={{ fontWeight: 700, fontSize: "13px", color: "#111" }}>
                {value}
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr",
            fontSize: "12px",
          }}
        >
          <div style={{ padding: "8px 10px", borderBottom: "1px solid #ddd" }}>
            <div style={JOB_CARD_LABEL_STYLE}>Production Stage</div>
            <div style={{ fontWeight: 700, fontSize: "13px", color: "#111" }}>
              {stageLabel ?? "Ad-hoc (no stage)"}
            </div>
          </div>
          <div
            style={{
              padding: "8px 10px",
              borderLeft: "1px solid #ddd",
              borderBottom: "1px solid #ddd",
            }}
          >
            <div style={JOB_CARD_LABEL_STYLE}>Start Date</div>
            <div style={{ fontWeight: 700, fontSize: "13px", color: "#111" }}>
              {jobCard.startDate
                ? new Date(jobCard.startDate).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "—"}
            </div>
          </div>
          <div
            style={{
              padding: "8px 10px",
              borderLeft: "1px solid #ddd",
              borderBottom: "1px solid #ddd",
            }}
          >
            <div style={JOB_CARD_LABEL_STYLE}>Priority</div>
            <PriorityPill priority={jobCard.priority} />
          </div>
          <div
            style={{
              padding: "8px 10px",
              borderLeft: "1px solid #ddd",
              borderBottom: "1px solid #ddd",
            }}
          >
            <div style={JOB_CARD_LABEL_STYLE}>Active Time</div>
            <div style={{ fontWeight: 700, color: "#111" }}>
              {activeTimeDisplay}
            </div>
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            fontSize: "12px",
          }}
        >
          {(
            [
              ["Start Time (actual)", null],
              ["Targeted End Time", null],
              ["Status", JOB_CARD_STATUS_LABEL[jobCard.status]],
            ] as const
          ).map(([label, value], i) => (
            <div
              key={label}
              style={{
                padding: "8px 10px",
                borderLeft: i > 0 ? "1px solid #ddd" : undefined,
              }}
            >
              <div style={JOB_CARD_LABEL_STYLE}>{label}</div>
              {value === null ? (
                <div
                  style={{
                    borderBottom: "1px solid #999",
                    height: "16px",
                    marginTop: "3px",
                  }}
                />
              ) : (
                <div style={{ fontWeight: 700, color: "#111" }}>{value}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* PROJECT REFERENCE PHOTO — identifies the product/project this
          Job Card belongs to (Section 1, see chat); NOT an evidence or
          completion photo. Its own compact block, entirely absent when
          the caller resolved no Project photo — no placeholder box. */}
      {projectPhotoUrl && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            border: "1px solid #bbb",
            borderRadius: "3px",
            padding: "6px 10px",
            marginBottom: "12px",
          }}
        >
          <img
            src={projectPhotoUrl}
            alt="Project reference"
            style={{
              display: "block",
              width: "60px",
              height: "48px",
              objectFit: "contain",
              flexShrink: 0,
            }}
          />
          <div style={{ fontSize: "10px", color: "#777" }}>
            Project Reference — identifies the overall product
          </div>
        </div>
      )}

      {/* PRODUCTION PLANNING — real, server-computed/persisted numbers
          only (Expected Quantity is either the GENERATED column or the
          user's deliberate override — never client math). Total
          Quantity is a distinct, separately-persisted field, never a
          substitute for Expected Quantity. */}
      <div style={{ marginBottom: "12px" }}>
        <SectionEyebrow>Production Planning</SectionEyebrow>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.3fr 1fr 1fr",
            border: "1px solid #bbb",
            borderRadius: "3px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 12px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "9.5px", color: "#666" }}>
              Total Quantity
            </div>
            <div style={{ fontSize: "15px", fontWeight: 700, color: "#111" }}>
              {jobCard.totalQuantity ?? "—"}
            </div>
          </div>
          <div
            style={{
              padding: "10px 12px",
              textAlign: "center",
              background: "#f4f4f4",
              borderLeft: "1px solid #ddd",
            }}
          >
            <div style={{ fontSize: "9.5px", color: "#666" }}>
              Expected Quantity
            </div>
            <div style={{ fontSize: "26px", fontWeight: 800, color: "#111" }}>
              {jobCard.expectedQuantityOverride ?? jobCard.expectedQuantity}{" "}
              <span style={{ fontSize: "12px", fontWeight: 600 }}>pcs</span>
            </div>
            {jobCard.expectedQuantityOverride != null && (
              <div
                style={{
                  fontSize: "8.5px",
                  color: "#888",
                  fontStyle: "italic",
                }}
              >
                Edited target
              </div>
            )}
          </div>
          <div
            style={{
              padding: "10px 12px",
              textAlign: "center",
              borderLeft: "1px solid #ddd",
            }}
          >
            <div style={{ fontSize: "9.5px", color: "#666" }}>
              Std Time / Piece
            </div>
            <div style={{ fontSize: "15px", fontWeight: 700, color: "#111" }}>
              {jobCard.standardTimePerUnitMinutes} min
            </div>
          </div>
          <div
            style={{
              padding: "10px 12px",
              textAlign: "center",
              borderLeft: "1px solid #ddd",
            }}
          >
            <div style={{ fontSize: "9.5px", color: "#666" }}>
              Allocated Time
            </div>
            <div style={{ fontSize: "15px", fontWeight: 700, color: "#111" }}>
              {jobCard.allocatedTimeMinutes} min
            </div>
          </div>
        </div>
      </div>

      {/* WORK INSTRUCTION */}
      <div
        style={{
          border: "1px solid #bbb",
          borderRadius: "3px",
          padding: "9px 12px",
          marginBottom: "12px",
        }}
      >
        <SectionEyebrow>Work Instruction</SectionEyebrow>
        <div style={{ fontSize: "13px", color: "#111", lineHeight: 1.4 }}>
          {jobCard.jobDescription}
        </div>
      </div>

      {/* INSPECTION PLAN (Section 7, see chat) — real, admin-configured
          checkpoints only. Not connected to project_qms_inspections, no
          pass/fail semantics, purely printed. Entirely omitted when
          empty — no generic blank fallback table. */}
      {jobCard.inspectionPlan.length > 0 && (
        <div style={{ marginBottom: "14px" }}>
          <SectionEyebrow>Inspection Plan</SectionEyebrow>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "12px",
            }}
          >
            <thead>
              <tr style={{ background: "#eee" }}>
                {[
                  "S.No",
                  "Check Point",
                  "Inspection After",
                  "Cumulative Qty",
                  "To Be Checked",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      border: "1px solid #999",
                      padding: "6px 8px",
                      textAlign: "left",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...jobCard.inspectionPlan]
                .sort((a, b) => a.cumulativeQty - b.cumulativeQty)
                .map((row, i, sorted) => {
                  // "Inspection After" wording (Part 10, see chat):
                  // the FIRST row reads "N Nos" (from zero); the LAST
                  // row (always Final, when configured via the Create/
                  // Edit checkpoint UI) reads "Remaining N Nos"; every
                  // row in between reads "Next N Nos" — all derived
                  // from row.triggerQty (already the delta from the
                  // previous checkpoint), never re-computed here.
                  const isFirst = i === 0;
                  const isLast = i === sorted.length - 1;
                  const afterWording = isFirst
                    ? `${row.triggerQty} Nos`
                    : isLast && row.source === "final"
                      ? `Remaining ${row.triggerQty} Nos`
                      : `Next ${row.triggerQty} Nos`;
                  return (
                    <tr key={row.id}>
                      <td
                        style={{
                          border: "1px solid #999",
                          padding: "6px 8px",
                          textAlign: "center",
                        }}
                      >
                        {i + 1}
                      </td>
                      <td
                        style={{ border: "1px solid #999", padding: "6px 8px" }}
                      >
                        {row.label}
                      </td>
                      <td
                        style={{ border: "1px solid #999", padding: "6px 8px" }}
                      >
                        {afterWording}
                      </td>
                      <td
                        style={{
                          border: "1px solid #999",
                          padding: "6px 8px",
                          textAlign: "center",
                        }}
                      >
                        {row.cumulativeQty}
                      </td>
                      <td
                        style={{
                          border: "1px solid #999",
                          padding: "6px 8px",
                          textAlign: "center",
                        }}
                      >
                        {row.sampleQty}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* FINAL SIGN-OFF (Part 9, see chat) — exactly four roles.
          "Completed By" deliberately REMOVED: the Job Card already
          names the assigned Employee who performed the operation
          (Job Identification strip above), so a separate "Completed
          By" signature is redundant. Individual checkpoint
          inspector/result/timestamp/signature information stays in the
          DIGITAL record only (job_card_inspection_events) — this printed
          block is the physical document's own overall sign-off, not a
          per-checkpoint log (Part 10). Prepared By prints the actual
          persisted preparer (automatic, never a blank line); the other
          three print the actual selected name when set, and fall back
          to a blank ink-fill line only when nothing was selected. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gap: "16px",
        }}
      >
        {(
          [
            ["Prepared By", jobCard.preparedByName],
            ["Assigned By", jobCard.assignedByEmployeeName],
            ["In-Process Check", jobCard.inProcessCheckEmployeeName],
            ["QC Approved By", jobCard.qcApprovedByEmployeeName],
          ] as const
        ).map(([label, name]) => (
          <div key={label} style={{ textAlign: "center" }}>
            {name ? (
              <div
                style={{
                  minHeight: "44px",
                  borderBottom: "1px solid #555",
                  marginBottom: "5px",
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "center",
                  paddingBottom: "4px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#111",
                }}
              >
                {name}
              </div>
            ) : (
              <div
                style={{
                  minHeight: "44px",
                  borderBottom: "1px solid #555",
                  marginBottom: "5px",
                }}
              />
            )}
            <div style={{ fontSize: "10.5px", fontWeight: 600, color: "#333" }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: "16px",
          fontSize: "9.5px",
          color: "#aaa",
          textAlign: "center",
        }}
      >
        This is a physical copy of a FabFlow Job Card. The system record remains
        authoritative — data recorded above must be entered back into FabFlow,
        not treated as a separate record.
      </div>

      {/* PAGE 2 — Work Reference (Section 3/5, see chat). Only when the
          caller resolved a Job Card Reference Photo AND printReferencePhoto
          is on; otherwise this whole block doesn't exist, so no blank
          second page is ever generated. pageBreakBefore forces it onto
          its own sheet even though this is one continuous element in the
          DOM (same technique @page/CSS print rules already rely on
          elsewhere in this file for A4 pagination). */}
      {referencePhotoUrl && (
        <div style={{ pageBreakBefore: "always", paddingTop: "10mm" }}>
          <div
            style={{
              textAlign: "center",
              borderBottom: "3px solid #1a1a1a",
              paddingBottom: "14px",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                fontSize: "26px",
                fontWeight: 800,
                color: "#1a1a1a",
                letterSpacing: "2px",
                lineHeight: 1.3,
              }}
            >
              WORK REFERENCE
            </div>
            <div
              style={{
                fontSize: "15px",
                fontWeight: 700,
                color: "#555",
                letterSpacing: "1px",
              }}
            >
              EXPECTED RESULT
            </div>
            <div style={{ fontSize: "12px", color: "#555", marginTop: "8px" }}>
              {jobCard.jobNo} · {projectLabel} · {jobCard.operationType}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              border: "1px solid #999",
              borderRadius: "4px",
              padding: "16px",
            }}
          >
            <img
              src={referencePhotoUrl}
              alt="Work reference — expected result"
              style={{
                display: "block",
                maxWidth: "100%",
                maxHeight: "220mm",
                objectFit: "contain",
              }}
            />
          </div>
        </div>
      )}

      {/* PAGE 3+ — Linked Drawing (Section 4/5, see chat). Reuses the
          existing Drawing Editor's own composed print layout as a flat
          image (resolved by the caller via composeLatestView) — no
          second drawing renderer, no drawing data duplicated here. Only
          when the caller resolved an image AND printDrawing is on. */}
      {drawingImageDataUrl && (
        <div style={{ pageBreakBefore: "always", paddingTop: "20px" }}>
          <div
            style={{
              borderBottom: "2px solid #1a1a1a",
              paddingBottom: "10px",
              marginBottom: "16px",
            }}
          >
            <div
              style={{ fontSize: "18px", fontWeight: 800, color: "#1a1a1a" }}
            >
              Engineering Drawing
            </div>
            <div style={{ fontSize: "12px", color: "#555", marginTop: "4px" }}>
              {jobCard.jobNo} · {projectLabel}
            </div>
          </div>
          <img
            src={drawingImageDataUrl}
            alt="Linked engineering drawing"
            style={{
              display: "block",
              width: "100%",
              maxHeight: "260mm",
              objectFit: "contain",
            }}
          />
        </div>
      )}
    </div>
  );
}
