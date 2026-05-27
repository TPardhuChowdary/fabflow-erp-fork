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
  Project,
  Quotation,
} from "../types";

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
          {invoice.poNumber && (
            <div style={{ fontSize: "11px", color: "#444" }}>
              <strong>PO No:</strong> {invoice.poNumber}
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
              <span style={{ color: "#aaa" }}>\u2014</span>
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
  const cgstAmt = Number((quotation as any).cgstAmt ?? 0);
  const sgstAmt = Number((quotation as any).sgstAmt ?? 0);
  const igstAmt = Number((quotation as any).igstAmt ?? 0);
  const cgstRate = (quotation as any).cgstRate;
  const sgstRate = (quotation as any).sgstRate;
  const igstRate = (quotation as any).igstRate;
  const gstAmount = Number(quotation.gstAmount ?? 0);
  const gstRate = quotation.gstRate;
  const subtotal = Number(quotation.subtotal ?? 0);
  const totalAmount = Number(quotation.totalAmount ?? 0);
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
            <span>{fmt(subtotal)}</span>
          </div>
          {cgstAmt > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "7px 12px",
                borderBottom: "1px solid #eee",
              }}
            >
              <span style={{ color: "#666" }}>CGST ({cgstRate}%)</span>
              <span>{fmt(cgstAmt)}</span>
            </div>
          )}
          {sgstAmt > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "7px 12px",
                borderBottom: "1px solid #eee",
              }}
            >
              <span style={{ color: "#666" }}>SGST ({sgstRate}%)</span>
              <span>{fmt(sgstAmt)}</span>
            </div>
          )}
          {igstAmt > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "7px 12px",
                borderBottom: "1px solid #eee",
              }}
            >
              <span style={{ color: "#666" }}>IGST ({igstRate}%)</span>
              <span>{fmt(igstAmt)}</span>
            </div>
          )}
          {cgstAmt === 0 && sgstAmt === 0 && igstAmt === 0 && gstAmount > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "7px 12px",
                borderBottom: "1px solid #eee",
              }}
            >
              <span style={{ color: "#666" }}>GST ({gstRate}%)</span>
              <span>{fmt(gstAmount)}</span>
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
            <span>{fmt(totalAmount)}</span>
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
          {amountToWords(totalAmount)}
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
            <span style={{ fontSize: "11px", color: "#aaa" }}>\u2014</span>
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
            <div style={{ fontSize: "11px", color: "#aaa" }}>\u2014</div>
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
              project?.projectName ||
              entry.projectId;
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
