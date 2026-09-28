// A4 printable Machine Sheet (item 10 of the production-focused
// implementation pass, see chat). Reuses the exact print-dialog pattern
// already established by CompanyPOPrintView.tsx/InvoicePrintView.tsx —
// same Dialog + .print-area + @media print block, no new PDF/print
// infrastructure. Only real, Supabase-persisted fields go on the sheet:
// the Machine row's own columns (identification, technical info, status/
// location, warranty/AMC/service-due single values) and the primary
// asset_photos row for this machine (ownerType "machine", the same table
// AssetPhotoGallery already writes to). serviceRecords (the detailed
// maintenance log) is deliberately NOT included — confirmed local-only
// (Zustand, no lib/*Api.ts write layer, see store.ts's addServiceRecord
// comment) — printing it would misrepresent local data as the
// authoritative record. A note on the sheet says so explicitly instead of
// silently omitting it.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getAssetPhotoSignedUrl } from "@/lib/assetPhotosApi";
import { useStore } from "../store";
import type { Machine } from "../types";
import { Printer, X } from "lucide-react";

interface Props {
  machine: Machine | null;
  open: boolean;
  onClose: () => void;
}

const row = (label: string, value?: string | number | null) =>
  value === undefined || value === null || value === "" ? null : (
    <div style={{ display: "flex", padding: "4px 0", fontSize: "12px" }}>
      <div style={{ width: "160px", color: "#777", fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ color: "#111" }}>{value}</div>
    </div>
  );

export function MachinePrintView({ machine, open, onClose }: Props) {
  const { settings, assetPhotos } = useStore();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!machine) {
      setPhotoUrl(null);
      return;
    }
    const photos = (assetPhotos || []).filter(
      (p) => p.ownerType === "machine" && p.ownerId === machine.id,
    );
    const primary = photos.find((p) => p.isPrimary) ?? photos[0];
    if (!primary) {
      setPhotoUrl(machine.primaryImageData || null);
      return;
    }
    let cancelled = false;
    getAssetPhotoSignedUrl(primary.storagePath).then((url) => {
      if (!cancelled) setPhotoUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [machine, assetPhotos]);

  const handlePrint = () => {
    try {
      document.body.classList.add("print-mode");
      window.print();
    } finally {
      document.body.classList.remove("print-mode");
    }
  };

  if (!machine) return null;

  const fmtDate = (d?: string) =>
    d
      ? new Date(d).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : undefined;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent size="preview" data-ocid="machine-print.dialog">
        <DialogHeader className="no-print">
          <DialogTitle>Machine Sheet Preview</DialogTitle>
        </DialogHeader>

        <div className="hidden sm:flex gap-3 no-print justify-end mt-2 mb-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={handlePrint}
            data-ocid="machine-print.print_button"
          >
            <Printer className="w-4 h-4" /> Print
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            data-ocid="machine-print.close_button"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div
          id={`pdf-content-machine-${machine.id}`}
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

          {/* Header */}
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
            <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
              {settings.companyLogo && (
                <img
                  src={settings.companyLogo}
                  alt="logo"
                  style={{ maxHeight: 60, maxWidth: 120, objectFit: "contain" }}
                />
              )}
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#111" }}>
                  {settings.companyName || "YOUR COMPANY NAME"}
                </div>
                {settings.companyAddress && (
                  <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>
                    {settings.companyAddress}
                  </div>
                )}
                {settings.companyPhone && (
                  <div style={{ fontSize: 11, color: "#555" }}>
                    Ph: {settings.companyPhone}
                  </div>
                )}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#1a1a1a",
                  letterSpacing: 1,
                  textTransform: "uppercase",
                }}
              >
                Machine Sheet
              </div>
              <div style={{ fontSize: 11, color: "#444", marginTop: 4 }}>
                <strong>Code:</strong> {machine.machineCode}
              </div>
              <div style={{ fontSize: 11, color: "#444" }}>
                <strong>Printed:</strong> {fmtDate(new Date().toISOString())}
              </div>
            </div>
          </div>

          {/* Name + status + photo */}
          <div
            style={{
              display: "flex",
              gap: 16,
              marginBottom: 16,
              border: "1px solid #ddd",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "12px 14px", flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>
                {machine.name}
              </div>
              <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
                {machine.type}
                {machine.brand ? ` · ${machine.brand}` : ""}
                {machine.model ? ` ${machine.model}` : ""}
              </div>
              <div style={{ marginTop: 8 }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "3px 10px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    border: "1px solid #999",
                    color: "#333",
                  }}
                >
                  {machine.currentStatus}
                </span>
              </div>
              {(machine.location || machine.department) && (
                <div style={{ fontSize: 11, color: "#666", marginTop: 8 }}>
                  {machine.location}
                  {machine.location && machine.department ? " · " : ""}
                  {machine.department}
                </div>
              )}
            </div>
            {photoUrl && (
              <img
                src={photoUrl}
                alt={machine.name}
                style={{
                  width: 160,
                  height: 140,
                  objectFit: "cover",
                  borderLeft: "1px solid #ddd",
                }}
              />
            )}
          </div>

          {/* Identification + technical */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div style={{ border: "1px solid #ddd", borderRadius: 4, padding: "10px 14px" }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#777",
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  marginBottom: 6,
                }}
              >
                Identification
              </div>
              {row("Machine Code", machine.machineCode)}
              {row("Serial Number", machine.serialNumber)}
              {row("Asset ID", machine.assetId)}
              {row("Purchase Date", fmtDate(machine.purchaseDate))}
              {row("Purchase Vendor", machine.purchaseVendorName)}
            </div>
            <div style={{ border: "1px solid #ddd", borderRadius: 4, padding: "10px 14px" }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#777",
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  marginBottom: 6,
                }}
              >
                Technical Information
              </div>
              {row("Type", machine.type)}
              {row("Brand", machine.brand)}
              {row("Model", machine.model)}
              {row("Total Running Hours", machine.totalRunningHours)}
              {row(
                "Hourly Rate",
                machine.hourlyRate != null ? `₹${machine.hourlyRate}` : undefined,
              )}
            </div>
          </div>

          {/* Warranty / AMC / Service due — real persisted single-value
              fields on the Machine row, not the local-only service log. */}
          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: 4,
              padding: "10px 14px",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#777",
                textTransform: "uppercase",
                letterSpacing: 0.8,
                marginBottom: 6,
              }}
            >
              Warranty / AMC / Maintenance Schedule
            </div>
            {row("Warranty Expiry", fmtDate(machine.warrantyExpiry))}
            {row("Warranty Vendor", machine.warrantyVendor)}
            {row("AMC Vendor", machine.amcVendorName)}
            {row(
              "AMC Period",
              machine.amcStartDate || machine.amcEndDate
                ? `${fmtDate(machine.amcStartDate) ?? "—"} to ${fmtDate(machine.amcEndDate) ?? "—"}`
                : undefined,
            )}
            {row("Service Interval (days)", machine.serviceIntervalDays)}
            {row("Last Service Date", fmtDate(machine.lastServiceDate))}
            {row("Next Service Due", fmtDate(machine.nextServiceDue))}
            {!machine.lastServiceDate &&
              !machine.nextServiceDue &&
              !machine.warrantyExpiry &&
              !machine.amcVendorName && (
                <div style={{ fontSize: 11, color: "#aaa" }}>
                  No maintenance/AMC/warranty data recorded.
                </div>
              )}
            <div
              style={{
                fontSize: 10,
                color: "#999",
                marginTop: 8,
                fontStyle: "italic",
              }}
            >
              Detailed service/maintenance history is tracked locally in this
              browser only and is not part of this organization&apos;s shared
              record — it is intentionally omitted from this printed sheet.
            </div>
          </div>

          {/* Notes */}
          {machine.notes && (
            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: 4,
                padding: "10px 14px",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#777",
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  marginBottom: 6,
                }}
              >
                Notes
              </div>
              <div style={{ fontSize: 12, color: "#444", whiteSpace: "pre-line" }}>
                {machine.notes}
              </div>
            </div>
          )}

          {/* Footer / signature */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              borderTop: "1px solid #ddd",
              paddingTop: 12,
              fontSize: 11,
              color: "#777",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ marginBottom: 30 }}>For {settings.companyName || "Company"}</div>
              <div
                style={{
                  width: 140,
                  borderTop: "1px solid #aaa",
                  paddingTop: 4,
                  fontSize: 10,
                }}
              >
                Authorised Signatory
              </div>
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 flex sm:hidden bg-background border-t border-border p-3 gap-2 z-50 no-print print:hidden justify-center">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-border text-sm font-medium min-h-[48px] text-muted-foreground"
            data-ocid="machine-print.mobile.close_button"
          >
            <X className="w-4 h-4" /> Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
