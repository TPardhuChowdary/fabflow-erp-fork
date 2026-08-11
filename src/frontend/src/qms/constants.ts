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

export const CRITICALITY_BADGE_CLASS: Record<QmsCriticality, string> = {
  SafetyCritical: "bg-red-100 text-red-800 border-red-200",
  FunctionalCritical: "bg-orange-100 text-orange-700 border-orange-200",
  RegulatoryCritical: "bg-purple-100 text-purple-700 border-purple-200",
  CustomerCritical: "bg-blue-100 text-blue-700 border-blue-200",
  ProcessCritical: "bg-yellow-100 text-yellow-800 border-yellow-200",
  Cosmetic: "bg-gray-100 text-gray-600 border-gray-200",
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

export const INSPECTION_SHEET_STATUS_BADGE_CLASS: Record<
  InspectionSheetStatus,
  string
> = {
  Draft: "bg-gray-100 text-gray-600 border-gray-200",
  Generated: "bg-slate-100 text-slate-700 border-slate-200",
  Printed: "bg-indigo-100 text-indigo-700 border-indigo-200",
  InspectionStarted: "bg-blue-100 text-blue-700 border-blue-200",
  InProgress: "bg-yellow-100 text-yellow-800 border-yellow-200",
  Completed: "bg-cyan-100 text-cyan-700 border-cyan-200",
  Signed: "bg-purple-100 text-purple-700 border-purple-200",
  AwaitingUpload: "bg-amber-100 text-amber-700 border-amber-200",
  Uploaded: "bg-teal-100 text-teal-700 border-teal-200",
  Reviewed: "bg-orange-100 text-orange-700 border-orange-200",
  Approved: "bg-green-100 text-green-700 border-green-200",
  Closed: "bg-green-100 text-green-800 border-green-300",
};

export const INSPECTION_MODE_LABELS: Record<InspectionMode, string> = {
  Paper: "Paper-Based",
  Digital: "Digital",
  Hybrid: "Hybrid (Recommended)",
};
