import type {
  InspectionMode,
  InspectionSheetStatus,
  QmsCriticality,
  QmsInspectionMethodType,
} from "./types";

export const CRITICALITY_LABELS: Record<QmsCriticality, string> = {
  SafetyCritical: "Safety Critical",
  FunctionalCritical: "Functional Critical",
  RegulatoryCritical: "Regulatory Critical",
  CustomerCritical: "Customer Critical",
  ProcessCritical: "Process Critical",
  Cosmetic: "Cosmetic",
};

// Only 5 severity tokens exist (success/warning/destructive/info/muted), so
// the 6 criticality levels collapse pairwise onto them — Safety is the one
// genuinely destructive level; the rest share warning/info by how close
// their original hue was, purely a palette constraint, not a meaning change.
export const CRITICALITY_BADGE_CLASS: Record<QmsCriticality, string> = {
  SafetyCritical: "bg-destructive/10 text-destructive border-destructive/30",
  FunctionalCritical: "bg-warning/15 text-warning border-warning/30",
  RegulatoryCritical: "bg-info/10 text-info border-info/30",
  CustomerCritical: "bg-info/10 text-info border-info/30",
  ProcessCritical: "bg-warning/15 text-warning border-warning/30",
  Cosmetic: "bg-muted text-muted-foreground border-border",
};

export const INSPECTION_METHOD_TYPE_LABELS: Record<
  QmsInspectionMethodType,
  string
> = {
  PassFail: "Pass / Fail",
  Numeric: "Numeric Measurement",
  MultiNumeric: "Multiple Numeric Measurements",
  Text: "Text Entry",
  Dropdown: "Dropdown",
  Checkbox: "Checkbox",
  Photo: "Photo Capture",
  File: "File Upload",
  Certificate: "Certificate Upload",
  BarcodeScan: "Barcode Scan",
  QRScan: "QR Code Scan",
};

// Sentinel value for the "Customer" filter meaning "characteristics with no customer scope"
export const QMS_GENERIC_CUSTOMER_SCOPE = "__generic__";

export const CATEGORY_SUGGESTIONS = [
  "Dimensional",
  "Visual",
  "Functional",
  "Process",
  "Safety",
  "Documentation",
  "Material",
];

// ── Phase 2 — Inspection Sheets ──────────────────────────────────

export const INSPECTION_SHEET_STATUS_LABELS: Record<
  InspectionSheetStatus,
  string
> = {
  Draft: "Draft",
  Generated: "Generated",
  Printed: "Printed",
  InspectionStarted: "Inspection Started",
  InProgress: "Inspection In Progress",
  Completed: "Inspection Completed",
  Signed: "Signed", // legacy — no longer produced, see types.ts note
  AwaitingUpload: "Awaiting Upload",
  Uploaded: "Uploaded",
  Reviewed: "Under Review", // Phase 3 relabel — internal value stays "Reviewed" for backward compatibility
  Approved: "Approved",
  Closed: "Closed",
};

// Same 5-token constraint as CRITICALITY_BADGE_CLASS above — this 12-step
// pipeline collapses onto success/warning/info/muted by proximity to each
// step's original hue and by pipeline stage (early=muted, active=info,
// needs-attention=warning, terminal=success).
export const INSPECTION_SHEET_STATUS_BADGE_CLASS: Record<
  InspectionSheetStatus,
  string
> = {
  Draft: "bg-muted text-muted-foreground border-border",
  Generated: "bg-muted text-muted-foreground border-border",
  Printed: "bg-info/10 text-info border-info/30",
  InspectionStarted: "bg-info/10 text-info border-info/30",
  InProgress: "bg-warning/15 text-warning border-warning/30",
  Completed: "bg-info/10 text-info border-info/30",
  Signed: "bg-info/10 text-info border-info/30",
  AwaitingUpload: "bg-warning/15 text-warning border-warning/30",
  Uploaded: "bg-info/10 text-info border-info/30",
  Reviewed: "bg-warning/15 text-warning border-warning/30",
  Approved: "bg-success/10 text-success border-success/30",
  Closed: "bg-success/10 text-success border-success/30",
};

export const INSPECTION_MODE_LABELS: Record<InspectionMode, string> = {
  Paper: "Paper-Based",
  Digital: "Digital",
  Hybrid: "Hybrid (Recommended)",
};
