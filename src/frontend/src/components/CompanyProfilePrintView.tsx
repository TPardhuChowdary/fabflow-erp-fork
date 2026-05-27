import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, Printer, X } from "lucide-react";
import { useStore } from "../store";
import ShareButton from "./ShareButton";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CompanyProfilePrintView({ open, onClose }: Props) {
  const { settings } = useStore();

  const handlePrint = () => {
    try {
      document.body.classList.add("print-mode");
      window.print();
      document.body.classList.remove("print-mode");
    } catch (e) {
      console.error("Print failed:", e);
      document.body.classList.remove("print-mode");
    }
  };

  const bankDetails = (settings as any).bankDetails;
  const aboutUs =
    (settings as any).termsAndConditions ||
    "We are committed to delivering quality fabrication solutions on time.";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-4xl max-h-[92vh] overflow-y-auto"
        data-ocid="company-profile-print.dialog"
      >
        <DialogHeader className="no-print">
          <DialogTitle>Company Profile Preview</DialogTitle>
        </DialogHeader>

        {/* Action Buttons */}
        <div className="flex gap-2 no-print mb-2">
          <Button
            size="sm"
            onClick={handlePrint}
            data-ocid="company-profile-print.print.button"
          >
            <Printer className="w-4 h-4 mr-2" /> Print
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handlePrint}
            data-ocid="company-profile-print.download.button"
          >
            <Download className="w-4 h-4 mr-2" /> Download PDF
          </Button>
          <ShareButton
            type="Company Profile"
            id="company-profile"
            number={settings.companyName || "Profile"}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            className="ml-auto"
            data-ocid="company-profile-print.close_button"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* ===== PRINT AREA ===== */}
        <div
          className="print-area bg-white text-black"
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

          {/* ===== HEADER: Company (left) + COMPANY PROFILE (right) ===== */}
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

            {/* Document Meta */}
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
                COMPANY PROFILE
              </div>
              {settings.companyGstin && (
                <div
                  style={{ fontSize: "11px", color: "#444", marginTop: "4px" }}
                >
                  <strong>GSTIN:</strong> {settings.companyGstin}
                </div>
              )}
              {settings.companyStateCode && (
                <div style={{ fontSize: "11px", color: "#444" }}>
                  <strong>State Code:</strong> {settings.companyStateCode}
                </div>
              )}
            </div>
          </div>

          {/* ===== COMPANY INFORMATION + CONTACT DETAILS ===== */}
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
                Company Information
              </div>
              <div
                style={{ fontWeight: "700", fontSize: "13px", color: "#111" }}
              >
                {settings.companyName || "\u2014"}
              </div>
              {settings.companyAddress && (
                <div
                  style={{
                    fontSize: "11px",
                    color: "#555",
                    marginTop: "3px",
                    lineHeight: "1.5",
                  }}
                >
                  {settings.companyAddress}
                </div>
              )}
              {settings.companyGstin && (
                <div
                  style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}
                >
                  GSTIN: {settings.companyGstin}
                </div>
              )}
              {(settings.companyStateName || settings.companyStateCode) && (
                <div
                  style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}
                >
                  State: {settings.companyStateName || "\u2014"}
                  {settings.companyStateCode
                    ? ` | Code: ${settings.companyStateCode}`
                    : ""}
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
                Contact Details
              </div>
              <div
                style={{ fontSize: "11px", color: "#444", lineHeight: "1.8" }}
              >
                {settings.companyPhone ? (
                  <div>
                    <strong>Phone:</strong> {settings.companyPhone}
                  </div>
                ) : (
                  <div>
                    <strong>Phone:</strong>{" "}
                    <span style={{ color: "#aaa" }}>\u2014</span>
                  </div>
                )}
                {settings.companyEmail ? (
                  <div>
                    <strong>Email:</strong> {settings.companyEmail}
                  </div>
                ) : (
                  <div>
                    <strong>Email:</strong>{" "}
                    <span style={{ color: "#aaa" }}>\u2014</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ===== SERVICES & CAPABILITIES ===== */}
          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: "4px",
              padding: "14px",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                fontSize: "10px",
                fontWeight: "700",
                color: "#777",
                textTransform: "uppercase",
                letterSpacing: "0.8px",
                marginBottom: "10px",
              }}
            >
              Our Services &amp; Capabilities
            </div>
            <div style={{ fontSize: "12px", color: "#444", lineHeight: "1.8" }}>
              CNC Laser Cutting &middot; Sheet Metal Fabrication &middot;
              Bending &amp; Forming &middot; MIG/TIG Welding &middot; Powder
              Coating &middot; Assembly &amp; Packaging &middot; Quality
              Inspection
            </div>
          </div>

          {/* ===== BANK DETAILS + ABOUT US ===== */}
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
                  <strong>Bank:</strong> {bankDetails?.bankName || "\u2014"}
                </div>
                <div>
                  <strong>A/C Name:</strong>{" "}
                  {bankDetails?.accountName || "\u2014"}
                </div>
                <div>
                  <strong>A/C No:</strong> {bankDetails?.accountNo || "\u2014"}
                </div>
                <div>
                  <strong>IFSC:</strong> {bankDetails?.ifsc || "\u2014"}
                </div>
                <div>
                  <strong>Branch:</strong> {bankDetails?.branch || "\u2014"}
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
                About Us / Terms
              </div>
              <div
                style={{
                  color: "#555",
                  lineHeight: "1.7",
                  whiteSpace: "pre-line",
                }}
              >
                {aboutUs}
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
              We declare that all information provided in this company profile
              is accurate and up to date.
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
            <div>This is a computer generated company profile.</div>
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
      </DialogContent>
    </Dialog>
  );
}
