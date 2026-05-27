import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { X } from "lucide-react";
import type React from "react";

import { useStore } from "../store";
import type { Customer, Invoice } from "../types";

interface Props {
  invoice: Invoice | null;
  customer: Customer | null;
  open: boolean;
  onClose: () => void;
}

const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

const DEFAULT_TERMS =
  "1. Payment due within 30 days of invoice date.\n2. Goods once sold are not returnable.\n3. Subject to local jurisdiction.";

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
  if (paise > 0) {
    words += ` and ${toWords(paise).trim()} Paise`;
  }
  return `${words} Only`;
}

export function InvoicePrintView({ invoice, customer, open, onClose }: Props) {
  const { settings } = useStore();

  if (!invoice) return null;

  // Bank details: prefer company settings, fall back to per-invoice bankDetails
  const bankDetails = invoice.bankDetails;
  const bankName = settings.bankName || bankDetails?.bankName || "";
  const accountName = settings.accountName || bankDetails?.accountName || "";
  const accountNumber = settings.accountNumber || bankDetails?.accountNo || "";
  const ifscCode = settings.ifscCode || bankDetails?.ifsc || "";
  const bankBranch = settings.bankBranch || bankDetails?.branch || "";
  const terms =
    invoice.termsAndConditions || settings.companyTerms || DEFAULT_TERMS;
  const declaration =
    settings.companyDeclaration ||
    "We declare that this invoice shows the actual price of the goods/services described and that all particulars are true and correct.";

  // Buyer details — prefer snapshot on invoice, fall back to live customer data
  const buyerGstin = invoice.buyerGstin || customer?.gstin || "";
  const buyerAddress = invoice.buyerAddress || customer?.address || "";
  const buyerStateName = invoice.buyerStateName || customer?.stateName || "";
  const buyerStateCode = invoice.buyerStateCode || customer?.stateCode || "";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-4xl max-h-[92vh] overflow-y-auto max-sm:!fixed max-sm:!inset-0 max-sm:!max-w-full max-sm:!rounded-none max-sm:!h-screen max-sm:!max-h-screen max-sm:![transform:none]"
        data-ocid="invoice-print.dialog"
      >
        {/* E-Way Bill Alert Banner */}
        {invoice && (invoice.totalAmount ?? 0) > 50000 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 no-print">
            <span className="mt-0.5 text-base leading-none">\u26a0\ufe0f</span>
            <div className="flex-1">
              <p className="font-semibold">E-Way Bill Required</p>
              <p className="mt-0.5 text-amber-700">
                This invoice exceeds \u20b950,000. An E-Way Bill is mandatory
                for this shipment.
              </p>
            </div>
            <a
              href="https://ewaybillgst.gov.in"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 shrink-0 rounded bg-amber-600 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-700 no-print"
            >
              Generate E-Way Bill \u2197
            </a>
          </div>
        )}

        <DialogHeader className="no-print">
          <DialogTitle>Invoice Preview</DialogTitle>
        </DialogHeader>

        {/* Action buttons — hidden during PDF capture */}
        <div
          id="action-buttons"
          className="hidden sm:flex gap-3 no-print justify-end mt-2 mb-2 items-center"
        >
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            className="ml-2"
            data-ocid="invoice-print.close_button"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* ===== PRINT AREA ===== */}
        <div
          id={`pdf-content-${invoice?.id}`}
          className="print-area bg-white text-black pb-20 sm:pb-0"
          style={{ fontFamily: "'Arial', sans-serif", fontSize: "13px" }}
        >
          <style>{`
            @media print {
              .no-print { display: none !important; }
              @page { size: A4; margin: 15mm; }
              body.print-mode > *:not(.print-area-wrapper) { display: none !important; }
              body.print-mode .print-area-wrapper { display: block !important; }
            }
          `}</style>

          {/* ===== HEADER: Seller (left) + TAX INVOICE (right) ===== */}
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
            {/* Seller / Company Info — logo + details */}
            <div
              style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}
            >
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
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: "800",
                    letterSpacing: "-0.3px",
                    color: "#111",
                  }}
                >
                  {settings.companyName || "YOUR COMPANY NAME"}
                </div>
                {settings.companyAddress && (
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#555",
                      marginTop: "3px",
                    }}
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
            {/* Invoice Meta */}
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
              <div
                style={{ fontSize: "11px", color: "#444", marginTop: "4px" }}
              >
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
              {invoice.poDate && (
                <div style={{ fontSize: "11px", color: "#444" }}>
                  <strong>PO Date:</strong> {invoice.poDate}
                </div>
              )}
              {invoice.deliveryVehicleNo && (
                <div style={{ fontSize: "11px", color: "#444" }}>
                  <strong>Vehicle No:</strong> {invoice.deliveryVehicleNo}
                </div>
              )}
            </div>
          </div>

          {/* ===== BILL TO + DELIVERY ===== */}
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
            <div
              style={{ padding: "10px 14px", borderRight: "1px solid #ddd" }}
            >
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
              <div
                style={{ fontWeight: "700", fontSize: "13px", color: "#111" }}
              >
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
                <div
                  style={{ fontSize: "11px", color: "#555", marginTop: "3px" }}
                >
                  Ph: {customer.phone}
                </div>
              )}
              {buyerGstin && (
                <div
                  style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}
                >
                  GSTIN: {buyerGstin}
                </div>
              )}
              {(buyerStateName || buyerStateCode) && (
                <div
                  style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}
                >
                  State: {buyerStateName || "\u2014"}
                  {buyerStateCode ? ` | Code: ${buyerStateCode}` : ""}
                </div>
              )}
              {/* Additional details merged inline into Bill To */}
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
              <div
                style={{ fontSize: "11px", color: "#444", lineHeight: "1.8" }}
              >
                {invoice.deliveryDestination && (
                  <div>
                    <strong>Destination:</strong> {invoice.deliveryDestination}
                  </div>
                )}
                {!invoice.deliveryDestination && (
                  <span style={{ color: "#aaa" }}>\u2014</span>
                )}
              </div>
            </div>
          </div>

          {/* ===== ITEMS TABLE ===== */}
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
                  style={{
                    padding: "8px 10px",
                    textAlign: "left",
                    width: "30px",
                  }}
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
                  style={{
                    padding: "8px 10px",
                    textAlign: "right",
                    width: "50px",
                  }}
                >
                  Qty
                </th>
                <th
                  style={{
                    padding: "8px 10px",
                    textAlign: "right",
                    width: "90px",
                  }}
                >
                  Unit Price
                </th>
                <th
                  style={{
                    padding: "8px 10px",
                    textAlign: "right",
                    width: "90px",
                  }}
                >
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {(invoice.lineItems || []).length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: "16px",
                      textAlign: "center",
                      color: "#aaa",
                      fontSize: "12px",
                    }}
                  >
                    No items
                  </td>
                </tr>
              )}
              {(invoice.lineItems || []).map((item, i) => (
                <tr
                  key={`${item.desc}-${i}`}
                  style={{
                    borderBottom: "1px solid #eee",
                    background: i % 2 === 0 ? "#fff" : "#fafafa",
                  }}
                >
                  <td style={{ padding: "7px 10px", color: "#888" }}>
                    {i + 1}
                  </td>
                  <td style={{ padding: "7px 10px" }}>{item.desc}</td>
                  <td
                    style={{
                      padding: "7px 10px",
                      textAlign: "center",
                      fontFamily: "monospace",
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

          {/* ===== TOTALS ===== */}
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
                  <span style={{ color: "#666" }}>
                    CGST ({invoice.cgstRate}%)
                  </span>
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
                  <span style={{ color: "#666" }}>
                    SGST ({invoice.sgstRate}%)
                  </span>
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
                  <span style={{ color: "#666" }}>
                    IGST ({invoice.igstRate}%)
                  </span>
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

          {/* ===== AMOUNT IN WORDS ===== */}
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

          {/* ===== BANK DETAILS + TERMS ===== */}
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
            <div
              style={{ padding: "10px 14px", borderRight: "1px solid #ddd" }}
            >
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
                style={{
                  color: "#555",
                  lineHeight: "1.7",
                  whiteSpace: "pre-line",
                }}
              >
                {terms}
              </div>
            </div>
          </div>

          {/* ===== DECLARATION ===== */}
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

          {/* ===== FOOTER / SIGNATURE ===== */}
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
                style={{
                  marginBottom: "30px",
                  fontSize: "11px",
                  color: "#555",
                }}
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

        {/* Mobile sticky bottom */}
        <div className="fixed bottom-0 left-0 right-0 flex sm:hidden bg-white border-t border-gray-200 p-3 gap-2 z-50 no-print print:hidden justify-center">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-gray-300 text-sm font-medium min-h-[48px] text-gray-600"
            data-ocid="invoice-print.mobile.close_button"
          >
            <X className="w-4 h-4" /> Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
