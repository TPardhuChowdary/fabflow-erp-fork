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
import type { Customer, Quotation } from "../types";

interface Props {
  quotation: Quotation | null;
  customer: Customer | null;
  open: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onRecordPO?: () => void;
}

const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

const DEFAULT_TERMS =
  "1. Quotation valid for 15 days from date of issue.\n2. Taxes applicable as per GST norms.\n3. Subject to local jurisdiction.";

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
  words = words.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  if (paise > 0) {
    words += ` and ${toWords(paise).trim()} Paise`;
  }
  return `${words} Only`;
}

export function QuotationPrintView({
  quotation,
  customer,
  open,
  onClose,
}: Props) {
  const { settings } = useStore();

  if (!quotation)
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent data-ocid="quotation-print.dialog.loading">
          <DialogHeader>
            <DialogTitle>Quotation Preview</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );

  const bankDetails = (quotation as any).bankDetails;
  const bankName = settings.bankName || bankDetails?.bankName || "";
  const accountName = settings.accountName || bankDetails?.accountName || "";
  const accountNumber = settings.accountNumber || bankDetails?.accountNo || "";
  const ifscCode = settings.ifscCode || bankDetails?.ifsc || "";
  const bankBranch = settings.bankBranch || bankDetails?.branch || "";
  // A quotation shows only the offered price — no GST/subtotal/grand-total
  // breakdown. `subtotal` (the pre-tax sum of line items entered by the
  // user) doubles as that quoted amount here; tax fields on the Quotation
  // record are intentionally not read or displayed in this document.
  const subtotal = Number(quotation.subtotal ?? 0);

  const quotationDate =
    (quotation as any).date ||
    (quotation as any).quotationDate ||
    (quotation as any).createdAt ||
    "—";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-4xl max-h-[92vh] overflow-y-auto max-sm:!fixed max-sm:!inset-0 max-sm:!max-w-full max-sm:!rounded-none max-sm:!h-screen max-sm:!max-h-screen max-sm:![transform:none]"
        data-ocid="quotation-print.dialog"
      >
        <DialogHeader className="no-print">
          <DialogTitle>Quotation Preview</DialogTitle>
        </DialogHeader>

        {/* Action Buttons */}
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
            data-ocid="quotation-print.close_button"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* ===== PRINT AREA ===== */}
        <div
          id={`pdf-content-${quotation?.id}`}
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

          {/* ===== HEADER: Seller (left) + QUOTATION (right) ===== */}
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
            {/* Seller / Company Info */}
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
                    fontSize: "24px",
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

            {/* Quotation Meta */}
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
              <div
                style={{ fontSize: "11px", color: "#444", marginTop: "4px" }}
              >
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
              {(quotation as any).poNumber && (
                <div style={{ fontSize: "11px", color: "#444" }}>
                  <strong>PO No:</strong> {(quotation as any).poNumber}
                </div>
              )}
            </div>
          </div>

          {/* ===== BILL TO ===== */}
          <div
            style={{
              marginBottom: "16px",
              border: "1px solid #ddd",
              borderRadius: "4px",
              overflow: "hidden",
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
                <div
                  style={{ fontSize: "11px", color: "#555", marginTop: "3px" }}
                >
                  Ph: {customer.phone}
                </div>
              )}
              {customer?.gstin && (
                <div
                  style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}
                >
                  GSTIN: {customer.gstin}
                </div>
              )}
              {(customer?.stateName || customer?.stateCode) && (
                <div
                  style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}
                >
                  State: {customer.stateName || "\u2014"}
                  {customer.stateCode ? ` | Code: ${customer.stateCode}` : ""}
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
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {(quotation.lineItems || []).length === 0 && (
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
              {(quotation.lineItems || []).map((item, i) => (
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

          {/* ===== QUOTED AMOUNT =====
              A quotation is a commercial offer, not a tax document — it
              intentionally shows only the price being offered. GST/subtotal/
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

          {/* ===== AMOUNT IN WORDS =====
              Converts only the quoted amount above — GST is never
              calculated or included in a quotation. */}
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
              {amountToWords(subtotal)}
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
                {(quotation as any).notes || quotation.terms || DEFAULT_TERMS}
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
            <div>
              We declare that this quotation shows the actual price of the
              goods/services described and that all particulars are true and
              correct.
            </div>
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
            <div>This is a computer generated quotation.</div>
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
        <div className="fixed bottom-0 left-0 right-0 flex sm:hidden bg-background border-t border-border p-3 gap-2 z-50 no-print print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-lg border border-border text-sm font-medium min-h-[48px]"
            data-ocid="quotation-print.mobile.close.button"
          >
            <X className="w-4 h-4" /> Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
