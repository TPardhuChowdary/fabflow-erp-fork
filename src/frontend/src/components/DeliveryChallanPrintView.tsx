import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { X } from "lucide-react";
import type React from "react";

import { useStore } from "../store";
import type { Customer, DeliveryChallan, Project } from "../types";

interface Props {
  challan: DeliveryChallan | null;
  customer: Customer | null;
  projects: Project[];
  open: boolean;
  onClose: () => void;
}

export function DeliveryChallanPrintView({
  challan,
  customer,
  projects,
  open,
  onClose,
}: Props) {
  const { settings } = useStore();

  if (!challan) return null;

  const entries = challan.projectEntries || [];

  // Delivery address
  const deliveryAddress = (() => {
    if (!challan.deliveryAddress) return customer?.address || "";
    if (challan.deliveryAddress.type === "custom")
      return challan.deliveryAddress.value;
    return customer?.address || "";
  })();

  // PO reference
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

  const challanNo = challan.dcNo || "";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-4xl max-h-[92vh] overflow-y-auto max-sm:!fixed max-sm:!inset-0 max-sm:!max-w-full max-sm:!rounded-none max-sm:!h-screen max-sm:!max-h-screen max-sm:![transform:none]"
        data-ocid="delivery-challan-print.dialog"
      >
        <DialogHeader className="no-print">
          <DialogTitle>Delivery Challan Preview</DialogTitle>
        </DialogHeader>

        {/* Action buttons — hidden during PDF capture */}
        <div
          id="action-buttons"
          className="hidden sm:flex gap-3 no-print justify-end mt-2 mb-2 items-center"
        >
          <button
            type="button"
            onClick={onClose}
            className="ml-2 p-1 rounded hover:bg-muted"
            data-ocid="delivery-challan-print.close_button"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ===== PRINT AREA ===== */}
        <div
          id={`pdf-content-${challan?.id}`}
          className="print-area bg-white text-black pb-20 sm:pb-0"
          style={{ fontFamily: "'Arial', sans-serif", fontSize: "13px" }}
        >
          <style>{`
            @media print {
              .no-print { display: none !important; }
              @page { size: A4; margin: 15mm; }
            }
          `}</style>

          {/* ===== HEADER ===== */}
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
            {/* Company info */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "16px",
              }}
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

            {/* Title + Meta */}
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
              <div
                style={{ fontSize: "11px", color: "#444", marginTop: "6px" }}
              >
                <strong>Challan No:</strong> {challanNo}
              </div>
              <div style={{ fontSize: "11px", color: "#444" }}>
                <strong>Date:</strong> {challan.dispatchDate || "\u2014"}
              </div>
            </div>
          </div>

          {/* ===== BILL TO + SHIP TO + DISPATCH DETAILS ===== */}
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
            {/* Bill To */}
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
              {customer?.phone && (
                <div
                  style={{
                    fontSize: "11px",
                    color: "#555",
                    marginTop: "2px",
                  }}
                >
                  Ph: {customer.phone}
                </div>
              )}
              {customer?.gstin && (
                <div
                  style={{
                    fontSize: "11px",
                    color: "#555",
                    marginTop: "2px",
                  }}
                >
                  GSTIN: {customer.gstin}
                </div>
              )}
            </div>

            {/* Ship To */}
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

            {/* Dispatch Details */}
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
              <div
                style={{ lineHeight: "1.8", color: "#444", fontSize: "11px" }}
              >
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
                  <strong>Dispatch Date:</strong>{" "}
                  {challan.dispatchDate || "\u2014"}
                </div>
              </div>
            </div>
          </div>

          {/* ===== REFERENCE ROW ===== */}
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
                    width: "36px",
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
              {entries.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    style={{
                      padding: "16px",
                      textAlign: "center",
                      color: "#aaa",
                    }}
                  >
                    No items
                  </td>
                </tr>
              )}
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
                    <td style={{ padding: "8px 10px", color: "#888" }}>
                      {i + 1}
                    </td>
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

          {/* ===== SIGNATURE SECTION ===== */}
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
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: "600",
                  color: "#333",
                }}
              >
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
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: "600",
                  color: "#333",
                }}
              >
                Receiver&apos;s Signature
              </div>
              <div style={{ fontSize: "10px", color: "#777" }}>
                Name: {challan.receiverName || "________________________"}
              </div>
            </div>
          </div>

          {/* Footer */}
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

        {/* Mobile sticky bottom */}
        <div className="fixed bottom-0 left-0 right-0 flex sm:hidden bg-white border-t border-gray-200 p-3 gap-2 z-50 no-print print:hidden justify-center">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-gray-300 text-sm font-medium min-h-[48px] text-gray-600"
            data-ocid="delivery-challan-print.mobile.close_button"
          >
            <X className="w-4 h-4" /> Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
