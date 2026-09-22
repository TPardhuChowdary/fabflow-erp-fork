import { Factory } from "lucide-react";
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
//
// A4 physical-sheet redesign (see chat) — laid out to match the
// proportions of a real shop-floor Job Card: Project info + a large
// Project Reference Photo share the top band, Production Planning/
// Actual-Work/Work-Instruction stay compact in the middle, and
// Inspection Plan gets the majority of the remaining page (one signature
// pair per checkpoint — see chat, "every inspection needs its own
// signature"). Deliberately NOT a mirror of the digital Job Card's own
// live progress: Active Time, Status, and every actual-production value
// (Start/End Time, Total Time Taken, Received/Completed/Failed/
// Remaining quantities) are transient app state or handwritten shop-
// floor data — never printed as a live/zero value, always either the
// real persisted number (Total Quantity/Time-per-Piece/Allocated Time/
// Target, each only when actually configured) or a blank ink-fill line.
// Only Project/Project Code/Operation/Employee/Start Date/Priority and
// the "Printed On" timestamp are auto-populated, since those are
// identifying information known at creation time, not the physical work
// being recorded.

interface JobCardDocProps {
  id: string;
  jobCard: JobCard;
  /** The Project's own code, e.g. "PROJ-2026-001" — printed as its own
   * "Project Code" row, separate from the Project's name below. */
  projectCode: string;
  /** The Project's own name, e.g. "L-Shape Frame" — printed as "Project". */
  projectName: string;
  settings: Record<string, string>;
  /** The moment this print was generated (client clock, `Date.now()` at
   * render time) — shown as "Printed On" so a supervisor can tell how
   * fresh a physical sheet is. Deliberately NOT the Job Card's own
   * createdAt, and never persisted anywhere (see handlePrintJobCard's own
   * comment) — a value the caller computes fresh per print, not a field
   * read off `jobCard`. */
  printedAt: number;
  /** Total physical pages this print will produce (Page 1 + Work
   * Reference page, if any + one page per linked-drawing sheet, if any)
   * — computed by the caller, who already knows exactly which of those
   * are included. Defaults to 1 when omitted. */
  totalPages?: number;
  /** Job Card print/layout (see chat) — three DIFFERENT photo/drawing
   * concepts, never to be mixed:
   *
   * projectPhotoUrl: the PROJECT's own reference photo (identifies the
   * overall product/project this Job Card belongs to) — large, on the
   * right of the upper band on Page 1, whenever the Project has one.
   * projectPhotoCaption: that photo's own caption/filename, shown
   * beneath it, when available.
   *
   * referencePhotoUrls: THIS Job Card's own selected "Work Reference"
   * photo(s) — the expected visual result of the operation. Multi-print
   * selection (see chat): each entry is one asset_photos row whose
   * print_selected flag is true, already resolved to Original or AI
   * Processed per its own cover_uses_processed (the caller does this
   * via resolveCoverStoragePath, same as the Project Photo above) — one
   * dedicated page per entry, in array order, starting at Page 2. Empty
   * array/undefined renders zero photo pages, never a blank one (the
   * caller is responsible for the print_selected filtering — this
   * component only renders what it's given).
   *
   * drawingSheets: every page of every Drawing linked to this Job Card
   * (see chat — a Job Card can have MULTIPLE linked drawings, not just
   * one), already composed into their own established print layout by
   * drawingEditor's own composeAllPageViews (one flat image per page,
   * in order, per drawing) — this component embeds them, it does not
   * render or know anything about drawings itself (no second drawing
   * renderer). Page 3+, one page per sheet, same caller-side gating as
   * above (printDrawing flag + at least one link existing). Each
   * sheet's own title/number/revision are that DRAWING's own title-
   * block fields (see chat, "show its actual drawing title") — its page
   * heading falls back to "Engineering Drawing" only when that drawing
   * has none of them set.
   *
   * All three groups are optional and independent; each section simply
   * does not render when nothing was resolved for it. */
  projectPhotoUrl?: string;
  projectPhotoCaption?: string;
  referencePhotoUrls?: { url: string; caption?: string }[];
  drawingSheets?: {
    url: string;
    title?: string;
    number?: string;
    revision?: string;
    /** 1-based position of this sheet within ITS OWN drawing, and that
     * drawing's total page count — e.g. "Sheet 2 of 3" — computed by the
     * caller (who already grouped composeAllPageViews's output per
     * drawing) rather than inferred here from adjacent title metadata,
     * which two different drawings could coincidentally share. */
    sheetIndex: number;
    sheetCount: number;
  }[];
}

/** The print-generation timestamp (client clock, see handlePrintJobCard),
 * shown as the title bar's "Date:" field — the reference shows a plain
 * date there, never the Job Card's own createdAt and never persisted. */
function formatPrintDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
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

// Fixed-A4 industrial print palette (see chat, "Job Card print template
// redesign" — matched against the supplied paper reference). Kept as
// named constants rather than scattered hex literals since the whole
// point of this redesign is visual consistency with one reference
// image across many small boxed sections.
const JOB_CARD_NAVY = "#15325c";
const JOB_CARD_BLUE_BG = "#dce8f5";
const JOB_CARD_BORDER_BLUE = "#a9c3de";
// Solid section-header bar (see chat, "final approved Job Card print
// copy") — every boxed section's own header strip (Job Identification,
// Reference Photo, Production Planning, Production Actual, Work
// Instruction, Inspection Plan, Sign-Off) uses this solid blue fill
// with white text in the approved print copy, replacing the earlier
// pale JOB_CARD_BLUE_BG-fill/navy-text treatment those bars used
// before. JOB_CARD_BLUE_BG/JOB_CARD_NAVY stay in use elsewhere
// (borders, the header brand row, icon tiles removed from Production
// Planning, etc.) — this is additive, not a replacement of those.
const JOB_CARD_HEADER_BLUE = "#1c5ea8";

// Every physical sheet (Page 1, and each Reference Photo/Drawing page
// that follows it) gets the SAME fixed A4 box — width/min-height in mm,
// not px, with its own 15mm padding now that the print popup's own
// @page margin is 0 (see handlePrintJobCard's print CSS). 15mm matches
// EXACTLY what the popup's @page margin used to be, so the two
// already-shipped page types this redesign must NOT touch (Reference
// Photo pages, Drawing pages — see chat, "keep the existing design")
// render at the identical physical size/position as before; only WHERE
// the margin comes from moved, from the browser's print margin into
// this one shared content box.
const JOB_CARD_PAGE_STYLE: React.CSSProperties = {
  width: "210mm",
  minHeight: "297mm",
  boxSizing: "border-box",
  padding: "15mm",
};

// Compact Priority pill (Section 5, see chat) — a single small inline
// badge, not a boxed metric cell, so it never grows the Job Identification
// strip past its existing row layout.
// Filled pill (see chat, minimalist redesign) — a soft tint background
// + matching text color per priority, not just a bordered outline,
// matching the reference's own "HIGH" pill treatment.
const PRIORITY_PILL_COLORS: Record<
  JobCard["priority"],
  { bg: string; text: string }
> = {
  Low: { bg: "#eef0f2", text: "#555" },
  Normal: { bg: "#e6ecf3", text: "#334" },
  High: { bg: "#fde3e3", text: "#b13a3a" },
  Urgent: { bg: "#fbd5d5", text: "#8f1f1f" },
};

function PriorityPill({ priority }: { priority: JobCard["priority"] }) {
  const colors = PRIORITY_PILL_COLORS[priority];
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "10.5px",
        fontWeight: 800,
        color: colors.text,
        background: colors.bg,
        borderRadius: "10px",
        padding: "2px 10px",
        textTransform: "uppercase",
        letterSpacing: "0.4px",
      }}
    >
      {priority}
    </span>
  );
}

export function JobCardDocContent({
  id,
  jobCard,
  projectCode,
  projectName,
  settings,
  printedAt,
  totalPages,
  projectPhotoUrl,
  referencePhotoUrls,
  drawingSheets,
}: JobCardDocProps) {
  const pageCount = totalPages ?? 1;
  // Target for This Job — expectedQuantity is a Postgres GENERATED
  // column (derived from Allocated Time / Standard Time), always a real
  // number; expectedQuantityOverride, when set, is the deliberate manual
  // override. Always printed as a value, never a blank line — same
  // effective-value rule used everywhere else in this feature
  // (jobCardCheckpoints.ts, the View dialog).
  const targetQty =
    jobCard.expectedQuantityOverride ?? jobCard.expectedQuantity;

  return (
    // Plain, unstyled root — only a getElementById hook for
    // handlePrintJobCard's `el.innerHTML` read. Deliberately NOT the
    // physical A4 page box itself: `.innerHTML` returns this element's
    // CHILDREN, so if the page sizing lived here it would be silently
    // discarded the moment the caller reads innerHTML, leaving Page 1
    // unconstrained while only the later photo/drawing page divs (true
    // siblings) kept their width. Each physical page — including Page 1
    // now — is its own explicit JOB_CARD_PAGE_STYLE child div instead,
    // exactly like the photo/drawing pages below already are.
    <div id={id}>
      <div
        style={{
          ...JOB_CARD_PAGE_STYLE,
          fontSize: "13px",
          // Softer, more professional sans-serif (see chat, "newly
          // approved Job Card print design") — replaces the previous
          // plain Arial stack. System-font stack (no external @font-face
          // needed in a print popup): each OS's own humanist UI face,
          // which reads noticeably less "harsh"/typewriter-like than
          // Arial at the same sizes/weights used throughout this
          // template — a typeface change only, no size changed here.
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          color: "#1a1a1a",
          background: "#fff",
        }}
      >
        {/* HEADER (see chat, "final approved Job Card print copy") — a
          single bordered box, three columns split by vertical dividers:
          company logo/name (+ tagline underneath it, not under "JOB
          CARD") on the left, a large "JOB CARD" title centered (same
          20px size — only typeface/weight/letter-spacing changed, per
          "do not make the title physically larger"), and Job Card
          No./Date/Page as right-aligned "Label : Value" lines on the
          right — matching the approved print copy's exact structure.
          No separate brand strip above this — this IS the complete
          header. */}
        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            marginBottom: "10px",
            border: `1px solid ${JOB_CARD_BORDER_BLUE}`,
            borderRadius: "4px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              flex: "0 0 34%",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 14px",
              borderRight: `1px solid ${JOB_CARD_BORDER_BLUE}`,
            }}
          >
            {settings.companyLogo ? (
              <img
                src={settings.companyLogo}
                alt="logo"
                style={{
                  maxHeight: "38px",
                  maxWidth: "100px",
                  objectFit: "contain",
                }}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "34px",
                  height: "34px",
                  borderRadius: "6px",
                  background: JOB_CARD_NAVY,
                  color: "#fff",
                  flexShrink: 0,
                }}
              >
                <Factory size={18} strokeWidth={2.25} />
              </div>
            )}
            <div>
              {/* Same settings.companyName/companyAddress source
                Invoice's own header reads — falls back to "Company
                Name" only when Company Profile is genuinely unset, not
                a hardcoded brand. */}
              <div
                style={{
                  fontSize: "15px",
                  fontWeight: 700,
                  color: JOB_CARD_NAVY,
                  letterSpacing: "0.2px",
                  lineHeight: 1.15,
                }}
              >
                {settings.companyName || "Company Name"}
              </div>
              <div
                style={{
                  fontSize: "8px",
                  fontWeight: 600,
                  color: "#5a7ba3",
                  letterSpacing: "0.6px",
                  textTransform: "uppercase",
                  marginTop: "1px",
                }}
              >
                One Operation. One Team. Better Results.
              </div>
              {settings.companyAddress && (
                <div
                  style={{ fontSize: "10px", color: "#666", marginTop: "1px" }}
                >
                  {settings.companyAddress}
                </div>
              )}
            </div>
          </div>
          <div
            style={{
              flex: "1 1 auto",
              textAlign: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "10px 14px",
              borderRight: `1px solid ${JOB_CARD_BORDER_BLUE}`,
            }}
          >
            <div
              style={{
                fontSize: "28px",
                fontWeight: 800,
                color: JOB_CARD_NAVY,
                letterSpacing: "2px",
              }}
            >
              JOB CARD
            </div>
          </div>
          <div
            style={{
              flex: "0 0 26%",
              padding: "10px 14px",
              fontSize: "10.5px",
              color: "#333",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: "3px",
            }}
          >
            {(
              [
                ["Job Card No.", jobCard.jobNo],
                ["Date", formatPrintDate(printedAt)],
                ["Page", `1 of ${pageCount}`],
              ] as const
            ).map(([label, value]) => (
              <div key={label} style={{ display: "flex", gap: "6px" }}>
                <span style={{ fontWeight: 700, color: "#333" }}>{label}</span>
                <span>:</span>
                <span style={{ fontWeight: 700, color: JOB_CARD_NAVY }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* UPPER BAND — Job identification on the left, a LARGE Project
          Reference Photo on the right (see chat, uploaded A4 reference:
          the photo is given real visual weight here, not a thumbnail).
          FIXED physical height (see chat, "Reference Photo area
          height" correction) — height: "66mm" on this row itself (the
          same ~250px maximum the photo frame already allowed before,
          converted to a physical unit: 250px @ 96dpi = 66.1mm, so this
          preserves the exact composition the design was already
          approved at for a tall/portrait photo) is now UNCONDITIONAL,
          not a max reached only by some photos. Previously this row
          used alignItems:"flex-start" so its height was whatever its
          TALLEST child happened to need — a landscape photo (short at
          width:100%) left the row short, a portrait photo hit its
          250px cap and left the row tall, so Production Planning below
          physically moved up or down depending on which photo was
          uploaded. alignItems:"stretch" (the default, set explicitly
          here) + this fixed row height fixes that: both the Job
          Details column and the photo frame now always fill the SAME
          66mm, with or without a photo, so every section below always
          starts at the same position. */}
        <div
          style={{
            display: "flex",
            gap: "16px",
            alignItems: "stretch",
            marginBottom: "10px",
            height: "66mm",
          }}
        >
          <div
            style={{
              flex: projectPhotoUrl ? "0 0 40%" : "1 1 100%",
              border: `1px solid ${JOB_CARD_BORDER_BLUE}`,
              borderRadius: "4px",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                background: JOB_CARD_HEADER_BLUE,
                padding: "5px 10px",
                fontSize: "10px",
                fontWeight: 800,
                color: "#fff",
                textTransform: "uppercase",
                letterSpacing: "0.8px",
              }}
            >
              Job Identification
            </div>
            <div style={{ flex: "1 1 auto" }}>
              {(
                [
                  ["Project", projectName || "—"],
                  ["Project Code", projectCode || "—"],
                  ["Operation", jobCard.operationType],
                  ["Employee", jobCard.employeeName || "—"],
                  // Drawing No. (see chat, minimalist redesign) — the
                  // FIRST linked drawing's own title-block number, the
                  // exact same value the Drawing page(s) below already
                  // print (drawingSheets[i].number). Reused, not a new
                  // field/fetch. Omitted entirely (not "—") when no
                  // drawing is linked/resolved, or that drawing's title
                  // block never had a number set — never a fabricated
                  // value.
                  ...(drawingSheets?.[0]?.number
                    ? [["Drawing No.", drawingSheets[0].number]]
                    : []),
                  // Previous Job Card (see chat, "correct the
                  // Continuation Job Card workflow") — printed ONLY when
                  // this Job Card is a real, persisted continuation of
                  // an existing one; jobCard.previousJobCardNo is
                  // resolved from the referenced Job Card's own job_no
                  // by fetchJobCardContinuation(), never computed or
                  // invented here. Omitted entirely (not a blank row)
                  // when continuation is No or no previous card is set.
                  ...(jobCard.isContinuation && jobCard.previousJobCardNo
                    ? [["Previous Job Card", jobCard.previousJobCardNo]]
                    : []),
                  [
                    "Start Date",
                    jobCard.startDate
                      ? new Date(jobCard.startDate).toLocaleDateString(
                          "en-IN",
                          { day: "numeric", month: "short", year: "numeric" },
                        )
                      : "—",
                  ],
                ] as [string, string][]
              ).map(([label, value], i) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    gap: "6px",
                    fontSize: "12px",
                    padding: "6px 10px",
                    borderTop: i > 0 ? "1px solid #e5e5e5" : undefined,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      color: "#333",
                      minWidth: "80px",
                    }}
                  >
                    {label}
                  </div>
                  <div style={{ color: "#111" }}>{value}</div>
                </div>
              ))}
              <div
                style={{
                  display: "flex",
                  gap: "6px",
                  alignItems: "center",
                  padding: "6px 10px",
                  borderTop: "1px solid #e5e5e5",
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    color: "#333",
                    minWidth: "80px",
                    fontSize: "12px",
                  }}
                >
                  Priority
                </div>
                <PriorityPill priority={jobCard.priority} />
              </div>
            </div>
          </div>

          {/* REFERENCE PHOTO (see chat, "final approved Job Card print
            copy") — identifies the product/project this Job Card
            belongs to; NOT an evidence or completion photo. Bordered
            box with its own solid-blue header bar, matching Job
            Identification's chrome exactly. FIXED frame (see chat,
            "Reference Photo area height" correction) — the inner div
            wrapping the <img>, not the <img> itself, is height:"100%"
            (which resolves to the parent row's fixed 66mm minus this
            header bar's own height — see that row's own comment): a
            real fixed-size container the image is constrained INSIDE,
            never the other way around. The <img> itself is
            width:"100%"/height:"100%" + objectFit:"contain", so it
            scales to fit within this frame and is centered
            (object-position defaults to 50% 50%) — a portrait,
            landscape, or square photo all fit proportionally inside
            the exact same frame, and the frame's size never depends on
            which one was uploaded. Opaque, sharp, never faded/masked/
            gradient/shadowed — plain object-fit:contain only. */}
          {projectPhotoUrl && (
            <div
              style={{
                flex: "0 0 60%",
                height: "100%",
                border: `1px solid ${JOB_CARD_BORDER_BLUE}`,
                borderRadius: "4px",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  background: JOB_CARD_HEADER_BLUE,
                  padding: "5px 10px",
                  fontSize: "10px",
                  fontWeight: 800,
                  color: "#fff",
                  textTransform: "uppercase",
                  letterSpacing: "0.8px",
                }}
              >
                Reference Photo
              </div>
              <div
                style={{
                  flex: "1 1 auto",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <img
                  src={projectPhotoUrl}
                  alt="Project reference"
                  style={{
                    display: "block",
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* PRODUCTION PLANNING (see chat, "final approved Job Card print
          copy") — real, persisted numbers only. Total Quantity is the
          only one of these four that's genuinely optional (Time per
          Piece/Allocated Time are required at creation; Target is the
          GENERATED expectedQuantity or its override) — it alone falls
          back to a blank ink-fill line when not configured. Plain
          label-above/large-number-below per column, centered, divided
          by vertical rules — no decorative icon tiles (removed to match
          the approved print copy, which doesn't have them). */}
        <div
          style={{
            marginBottom: "8px",
            border: `1px solid ${JOB_CARD_BORDER_BLUE}`,
            borderRadius: "4px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              background: JOB_CARD_HEADER_BLUE,
              padding: "5px 10px",
              fontSize: "10px",
              fontWeight: 800,
              color: "#fff",
              textTransform: "uppercase",
              letterSpacing: "0.8px",
            }}
          >
            Production Planning
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
            }}
          >
            {(
              [
                ["Total Qty", jobCard.totalQuantity, "pcs"],
                ["Time / Piece", jobCard.standardTimePerUnitMinutes, "mins"],
                ["Allocated Time", jobCard.allocatedTimeMinutes, "hrs"],
                ["Expected Qty", targetQty, "pcs"],
              ] as const
            ).map(([label, value, unit], i) => (
              <div
                key={label}
                style={{
                  padding: "10px 8px",
                  textAlign: "center",
                  borderLeft: i > 0 ? "1px solid #ddd" : undefined,
                }}
              >
                <div
                  style={{
                    fontSize: "9.5px",
                    fontWeight: 700,
                    color: "#666",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    marginBottom: "4px",
                  }}
                >
                  {label}
                </div>
                {value == null ? (
                  <div
                    style={{
                      borderBottom: "1px solid #999",
                      height: "18px",
                      width: "60%",
                      margin: "0 auto",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "center",
                      gap: "4px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "22px",
                        fontWeight: 800,
                        color: "#1a1a1a",
                      }}
                    >
                      {value}
                    </span>
                    <span
                      style={{
                        fontSize: "10.5px",
                        fontWeight: 600,
                        color: "#666",
                      }}
                    >
                      {unit}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* PRODUCTION ACTUAL (see chat, minimalist redesign) — merges
          what were previously two separate boxed rows (Actual Timing +
          Quantity Tracking) into ONE continuous row, matching the
          reference. Physically handwritten by the employee/supervisor;
          never pre-filled from jobCard's own startTime/endTime/
          activeSeconds/actualCompletedQty/rejectedQty (those are the
          DIGITAL record's own live state, not the paper record) —
          same blank-ink-fill-line rule every other actual-work field
          in this template already follows. */}
        <div
          style={{
            border: `1px solid ${JOB_CARD_BORDER_BLUE}`,
            borderRadius: "4px",
            overflow: "hidden",
            marginBottom: "10px",
          }}
        >
          <div
            style={{
              background: JOB_CARD_HEADER_BLUE,
              padding: "5px 10px",
              fontSize: "10px",
              fontWeight: 800,
              color: "#fff",
              textTransform: "uppercase",
              letterSpacing: "0.8px",
            }}
          >
            Production Actual{" "}
            <span style={{ fontWeight: 600, textTransform: "none" }}>
              (To Be Filled By Worker / Supervisor)
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(8, 1fr)",
              fontSize: "10.5px",
            }}
          >
            {[
              "Start Time",
              "End Time",
              "Time Taken",
              "Total Received",
              "Completed",
              "Rejected",
              "Failed",
              "Remaining",
            ].map((label, i) => (
              // display:flex column + justifyContent:"flex-end" (see
              // chat, "newly approved Job Card print design") — anchors
              // every column's underline to the SAME bottom position
              // regardless of how many lines its own label wraps to.
              // "Total Received" is the one label long enough to wrap
              // in this narrow 1/8-width column; without this, its
              // taller label would push its underline lower than its
              // seven siblings in the same row. The underline itself
              // (height: "18px") is untouched — same size for all 8.
              <div
                key={label}
                style={{
                  padding: "8px 6px 9px",
                  borderLeft: i > 0 ? "1px solid #ddd" : undefined,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                }}
              >
                <div
                  style={
                    label === "Total Received"
                      ? { ...JOB_CARD_LABEL_STYLE, fontSize: "8.5px" }
                      : JOB_CARD_LABEL_STYLE
                  }
                >
                  {label}
                </div>
                <div
                  style={{
                    borderBottom: "1px solid #999",
                    height: "18px",
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* WORK INSTRUCTION — a numbered LIST (one line per line of
          jobDescription when the user entered several, else a single
          numbered line), matching the minimalist redesign's reference
          — small navy numbered markers, not a bordered table anymore.
          Same source/split logic as before, purely a visual change. */}
        <div
          style={{
            border: `1px solid ${JOB_CARD_BORDER_BLUE}`,
            borderRadius: "4px",
            overflow: "hidden",
            marginBottom: "10px",
          }}
        >
          <div
            style={{
              background: JOB_CARD_HEADER_BLUE,
              padding: "5px 10px",
              fontSize: "10px",
              fontWeight: 800,
              color: "#fff",
              textTransform: "uppercase",
              letterSpacing: "0.8px",
            }}
          >
            Work Instruction
          </div>
          <div style={{ padding: "8px 10px" }}>
            {(jobCard.jobDescription || "—")
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line, i) => (
                <div
                  key={
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed print snapshot of a plain-text field, never reordered
                    i
                  }
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "8px",
                    marginBottom: "5px",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "16px",
                      height: "16px",
                      borderRadius: "3px",
                      background: JOB_CARD_BLUE_BG,
                      color: JOB_CARD_NAVY,
                      fontSize: "9.5px",
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ fontSize: "12px", color: "#111" }}>
                    {line}
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* INSPECTION PLAN (see chat, "newly approved Job Card print
          design") — exactly three columns now: Checkpoint, Inspection
          After, Inspector Sign. Cumulative Qty, Sample Qty and QC Sign
          are REMOVED from the printed table per the final approved
          layout — row.cumulativeQty/row.sampleQty are still real,
          persisted, admin-configured values on the data model (used
          below to sort rows and compute afterWording, exactly as
          before), simply no longer given their own printed columns;
          nothing is invented or deleted. Inspector Sign keeps generous
          width/padding for a real handwritten signature. Entirely
          omitted when empty — no generic blank fallback table.
          Whatever checkpoints actually exist on this Job Card print,
          in order — never a hardcoded First/Second/Final set. */}
        {jobCard.inspectionPlan.length > 0 && (
          <div
            style={{
              marginBottom: "10px",
              border: `1px solid ${JOB_CARD_BORDER_BLUE}`,
              borderRadius: "4px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                background: JOB_CARD_HEADER_BLUE,
                padding: "5px 10px",
                fontSize: "10px",
                fontWeight: 800,
                color: "#fff",
                textTransform: "uppercase",
                letterSpacing: "0.8px",
              }}
            >
              Inspection Plan
            </div>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "11.5px",
              }}
            >
              <colgroup>
                <col style={{ width: "30%" }} />
                <col style={{ width: "30%" }} />
                <col style={{ width: "40%" }} />
              </colgroup>
              <thead>
                <tr>
                  {["Checkpoint", "Inspection After", "Inspector Sign"].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          borderBottom: `1px solid ${JOB_CARD_BORDER_BLUE}`,
                          padding: "6px 8px",
                          textAlign: "left",
                          color: JOB_CARD_NAVY,
                        }}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {[...jobCard.inspectionPlan]
                  .sort((a, b) => a.cumulativeQty - b.cumulativeQty)
                  .map((row, i, sorted) => {
                    // "Inspection After" wording (see chat): the FIRST row
                    // reads "N Nos" (from zero); the LAST row (always
                    // Final, when configured via the Create/Edit checkpoint
                    // UI) reads "Remaining N Nos"; every row in between
                    // reads "Next N Nos" — all derived from
                    // row.triggerQty (already the delta from the previous
                    // checkpoint), never re-computed here.
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
                            borderTop: "1px solid #ddd",
                            padding: "9px 8px",
                          }}
                        >
                          {row.label}
                        </td>
                        <td
                          style={{
                            borderTop: "1px solid #ddd",
                            padding: "9px 8px",
                          }}
                        >
                          {afterWording}
                        </td>
                        <td
                          style={{
                            borderTop: "1px solid #ddd",
                            padding: "9px 8px",
                            height: "30px",
                          }}
                        />
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}

        {/* SIGN-OFF (see chat, "newly approved Job Card print design")
          — exactly FOUR roles now, per the final approved layout.
          Every label below is a presentation-only mapping onto the
          same persisted fields this template has always used; nothing
          is deleted and no duplicate field is invented:
          - "Prepared By" — jobCard.preparedByName, unchanged.
          - "In-Process By" — jobCard.employeeName, the assigned worker
            who actually performs/is in process on this operation (was
            labeled "Performed By").
          - "QC By" — jobCard.inProcessCheckEmployeeName. Its own doc
            comment in types.ts already establishes this field as "who
            is responsible for the in-process/QC check" (confirmed in
            an earlier semantic-verification pass) — genuinely a QC
            role, now under a shorter label (was "QC Inspected By").
          - "Approved By" — jobCard.qcApprovedByEmployeeName, unchanged
            (the LATER, final QC approval — distinct from "QC By"
            above).
          jobCard.assignedByEmployeeName ("Assigned To" in the previous
          layout) is the one role dropped from this four-slot strip —
          its data is still fully persisted and editable from the Edit
          form, simply not given a printed cell here, same "retiring a
          printed label ≠ deleting the data" reasoning already used for
          the prior label changes on this template. Prepared By prints
          the actual persisted preparer (automatic, never a blank
          line); the other three print the actual selected name when
          set, and fall back to a blank ink-fill line only when nothing
          was selected. No per-cell date — the Job Card's own date is
          already in the header above. */}
        <div
          style={{
            border: `1px solid ${JOB_CARD_BORDER_BLUE}`,
            borderRadius: "4px",
            overflow: "hidden",
            marginBottom: "10px",
          }}
        >
          <div
            style={{
              background: JOB_CARD_HEADER_BLUE,
              padding: "5px 10px",
              fontSize: "10px",
              fontWeight: 800,
              color: "#fff",
              textTransform: "uppercase",
              letterSpacing: "0.8px",
            }}
          >
            Sign-Off
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
              gap: "12px",
              padding: "10px",
            }}
          >
            {(
              [
                ["Prepared By", jobCard.preparedByName],
                ["In-Process By", jobCard.employeeName],
                ["QC By", jobCard.inProcessCheckEmployeeName],
                ["Approved By", jobCard.qcApprovedByEmployeeName],
              ] as const
            ).map(([label, name]) => (
              <div key={label} style={{ textAlign: "center" }}>
                {name ? (
                  <div
                    style={{
                      minHeight: "40px",
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
                      minHeight: "40px",
                      borderBottom: "1px solid #555",
                      marginBottom: "5px",
                    }}
                  />
                )}
                <div
                  style={{
                    fontSize: "10.5px",
                    fontWeight: 600,
                    color: "#333",
                    marginBottom: "8px",
                  }}
                >
                  {label}
                </div>
                {/* Date line (see chat, "final approved Job Card print
                  copy") — a plain physical writing line, same as every
                  other worker-filled blank in this template (Production
                  Actual's underlines); no per-signatory date is
                  persisted anywhere on the Job Card, so this is never
                  pre-filled from data. */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "4px",
                    fontSize: "9px",
                    color: "#666",
                  }}
                >
                  <span>Date:</span>
                  <span
                    style={{
                      flex: "1 1 auto",
                      borderBottom: "1px solid #999",
                      height: "10px",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CONTINUATION JOB CARD (see chat, and the later "correct the
          Continuation Job Card workflow" corrective pass) — real,
          persisted state now, read straight off
          jobCard.isContinuation (see types.ts's own doc comment — NOT
          part of the main JOB_CARD_COLUMNS hydration yet; the caller is
          responsible for having resolved a fresh value via
          fetchJobCardContinuation() before printing, same as it already
          is for print_selected photos). Yes/No is always shown as a
          real, mutually-exclusive checked pair — never a single
          ambiguous checkbox. This footer indicator is status-only; the
          actual PREVIOUS Job Card number (when continuation is Yes)
          prints once, inside JOB DETAILS above — never here, and never
          a "Next Job Card No." (that concept doesn't exist — a
          continuation points backward to a real, already-existing Job
          Card, never forward to an invented one). */}
        <div
          style={{
            marginTop: "8px",
            paddingTop: "8px",
            borderTop: "1px solid #ccc",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "11px",
            color: "#333",
          }}
        >
          <span style={{ fontWeight: 700, marginRight: "4px" }}>
            Continuation Job Card:
          </span>
          {(["Yes", "No"] as const).map((option) => {
            const checked = (option === "Yes") === !!jobCard.isContinuation;
            return (
              <span
                key={option}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "3px",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "12px",
                    height: "12px",
                    border: "1.5px solid #555",
                    fontSize: "9px",
                    fontWeight: 800,
                    lineHeight: 1,
                  }}
                >
                  {checked ? "✓" : ""}
                </span>
                {option}
              </span>
            );
          })}
        </div>

        {/* FOOTER (see chat, "final approved Job Card print copy") —
          three-part split: FabFlow ERP left, "Build • Fabricate •
          Deliver" centered, Internal Use Only right. */}
        <div
          style={{
            marginTop: "8px",
            paddingTop: "6px",
            borderTop: "1px solid #ddd",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "9px",
            color: "#999",
          }}
        >
          <span style={{ fontWeight: 700, color: "#666" }}>FabFlow ERP</span>
          <span style={{ fontWeight: 700, color: JOB_CARD_NAVY }}>
            Build • Fabricate • Deliver
          </span>
          <span>Internal Use Only</span>
        </div>
      </div>

      {/* PAGE 2+ — Work Reference (Section 3/5, see chat; multi-print
          selection extension). One page per selected Reference Photo,
          in array order — the caller already filtered to
          print_selected=true and resolved each one's Original/AI
          Processed variant, so this stays a pure render loop with no
          selection logic of its own. Zero entries means this whole
          block renders nothing, so no blank second page is ever
          generated. pageBreakBefore forces each page onto its own sheet
          even though these are continuous elements in the DOM (same
          technique @page/CSS print rules already rely on elsewhere in
          this file for A4 pagination). */}
      {(referencePhotoUrls ?? []).map((photo, i) => (
        <div
          key={photo.url}
          style={{ ...JOB_CARD_PAGE_STYLE, pageBreakBefore: "always" }}
        >
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
              {(referencePhotoUrls?.length ?? 0) > 1 &&
                ` — Photo ${i + 1} of ${referencePhotoUrls?.length}`}
            </div>
            <div style={{ fontSize: "12px", color: "#555", marginTop: "8px" }}>
              {jobCard.jobNo} · {projectCode} — {projectName} ·{" "}
              {jobCard.operationType}
              {photo.caption ? ` · ${photo.caption}` : ""}
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
              src={photo.url}
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
      ))}

      {/* NEXT PAGE(S) — Linked Drawing(s), starting right after however
          many Reference Photo pages were rendered above (0 or more,
          multi-print selection). One page per composed sheet across
          EVERY linked drawing (see chat — a Job Card can have multiple
          linked drawings, and a multi-page drawing must print all its
          pages, not just the most-recently-edited one). Reuses the
          existing Drawing Editor's own composed print layout as flat
          images (resolved by the caller via composeAllPageViews per
          linked drawing) — no second drawing renderer, no drawing data
          duplicated here. Only when the caller resolved at least one
          sheet AND printDrawing is on. Each page's heading shows THAT
          drawing's own title/number/revision (from its title block)
          when available, falling back to the generic "Engineering
          Drawing" only when none of those were set. */}
      {drawingSheets?.map((sheet, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed print snapshot of an ordered page list, never reordered
          key={i}
          style={{ ...JOB_CARD_PAGE_STYLE, pageBreakBefore: "always" }}
        >
          <div
            style={{
              borderBottom: "2px solid #1a1a1a",
              paddingBottom: "10px",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                fontSize: "18px",
                fontWeight: 800,
                color: "#1a1a1a",
              }}
            >
              {sheet.title || "Engineering Drawing"}
              {sheet.number ? ` · ${sheet.number}` : ""}
              {sheet.revision ? ` · Rev ${sheet.revision}` : ""}
            </div>
            <div style={{ fontSize: "12px", color: "#555", marginTop: "4px" }}>
              {jobCard.jobNo} · {projectCode} — {projectName}
              {sheet.sheetCount > 1
                ? ` · Sheet ${sheet.sheetIndex} of ${sheet.sheetCount}`
                : ""}
            </div>
          </div>
          <img
            src={sheet.url}
            alt={`Linked engineering drawing${sheet.sheetCount > 1 ? ` — sheet ${sheet.sheetIndex}` : ""}`}
            style={{
              display: "block",
              width: "100%",
              maxHeight: "260mm",
              objectFit: "contain",
            }}
          />
        </div>
      ))}
    </div>
  );
}
