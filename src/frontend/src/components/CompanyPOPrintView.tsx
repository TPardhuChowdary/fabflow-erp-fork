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
import type { CompanyPO } from "../types";

interface Props {
  po: CompanyPO | null;
  open: boolean;
  onClose: () => void;
}

const fmt = (n: number) =>
  `₹${(Number(n) || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

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

export function CompanyPOPrintView({ po, open, onClose }: Props) {
  const { settings } = useStore();

  if (!po) return null;

  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-4xl max-h-[92vh] overflow-y-auto max-sm:!fixed max-sm:!inset-0 max-sm:!max-w-full max-sm:!rounded-none max-sm:!h-screen max-sm:!max-h-screen max-sm:![transform:none]"
        data-ocid="company-po-print.dialog"
      >
        <DialogHeader className="no-print">
          <DialogTitle>Purchase Order Preview</DialogTitle>
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
            data-ocid="company-po-print.close_button"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* ===== PRINT AREA ===== */}
        <div
          id={`pdf-content-${po?.id}`}
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

          {/* ===== HEADER: Company (left) + PURCHASE ORDER (right) ===== */}
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
            {/* Company Info — logo + details */}
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

            {/* PO Meta */}
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
              <div
                style={{ fontSize: "11px", color: "#444", marginTop: "4px" }}
              >
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

          {/* ===== SUPPLIER DETAILS + DELIVERY ADDRESS ===== */}
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
                Supplier Details
              </div>
              <div
                style={{ fontWeight: "700", fontSize: "13px", color: "#111" }}
              >
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
                <div
                  style={{ fontSize: "11px", color: "#555", marginTop: "3px" }}
                >
                  GSTIN: {po.vendorGst}
                </div>
              )}
              {po.vendorContact && (
                <div
                  style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}
                >
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
              <div
                style={{ fontSize: "11px", color: "#444", lineHeight: "1.8" }}
              >
                {po.deliveryAddress ? (
                  <div style={{ whiteSpace: "pre-line" }}>
                    {po.deliveryAddress}
                  </div>
                ) : (
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
                    textAlign: "right",
                    width: "60px",
                  }}
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
                  style={{
                    padding: "8px 10px",
                    textAlign: "right",
                    width: "90px",
                  }}
                >
                  Rate (₹)
                </th>
                <th
                  style={{
                    padding: "8px 10px",
                    textAlign: "right",
                    width: "90px",
                  }}
                >
                  Amount (₹)
                </th>
              </tr>
            </thead>
            <tbody>
              {(po.items || []).length === 0 && (
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
              {(po.items || []).map((item, i) => (
                <tr
                  key={item.id}
                  style={{
                    borderBottom: "1px solid #eee",
                    background: i % 2 === 0 ? "#fff" : "#fafafa",
                  }}
                >
                  <td style={{ padding: "7px 10px", color: "#888" }}>
                    {i + 1}
                  </td>
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
                <span>{fmt(po.subtotal ?? 0)}</span>
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
                  <span>{fmt(po.gstAmount ?? 0)}</span>
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
                <span>{fmt(po.grandTotal ?? 0)}</span>
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
              {amountToWords(po.grandTotal ?? 0)}
            </span>
          </div>

          {/* ===== TERMS & CONDITIONS ===== */}
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
                style={{
                  color: "#555",
                  lineHeight: "1.7",
                  whiteSpace: "pre-line",
                }}
              >
                {po.termsAndConditions ||
                  settings.companyTerms ||
                  "1. Payment as per agreed terms.\n2. Goods as per specifications.\n3. Subject to local jurisdiction."}
              </div>
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
            data-ocid="company-po-print.mobile.close_button"
          >
            <X className="w-4 h-4" /> Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
