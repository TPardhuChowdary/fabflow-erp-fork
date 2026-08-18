export type EnquiryStatus = "New" | "InProgress" | "Quoted" | "Closed";
export type QuotationStatus = "Draft" | "Sent" | "Accepted" | "Rejected";
export type POStatus = "Received" | "Confirmed" | "Cancelled";
export type SOStatus =
  | "Open"
  | "InProduction"
  | "ReadyToDispatch"
  | "Dispatched"
  | "Closed";
export type StageStatus = "Pending" | "InProgress" | "Complete";
export type QCStatus = "Pending" | "Pass" | "Fail" | "Rework";
export type MRStatus = "Draft" | "Approved" | "Ordered" | "Received";
export type DCStatus = "Prepared" | "Dispatched" | "Delivered";
export type InvoiceStatus = "Unpaid" | "PartiallyPaid" | "Paid";
export type PaymentMode = "Cash" | "Cheque" | "NEFT" | "RTGS" | "UPI";
export type PayableStatus = "Pending" | "Partial" | "Paid" | "Overdue";

export interface Customer {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  gstin: string;
  stateName?: string;
  stateCode?: string;
  additionalDetails?: Array<{ key: string; value: string }>;
  emails?: Array<{ email: string; type: string }>;
  primaryEmail?: string;
  createdAt: number;
}

export interface Enquiry {
  id: string;
  enqNo: string;
  customerId: string;
  projectId?: string;
  description: string;
  items: string;
  targetDate: string;
  status: EnquiryStatus;
  createdAt: number;
}

export interface LineItem {
  desc: string;
  hsn: string;
  qty: number;
  unitPrice: number;
  amount: number;
  /** Set when this line item was created via "+ Add Projects" (a real FK
   * to the project it came from), rather than typed manually. Optional -
   * manual line items (via "+ Add Row") never have this. */
  projectId?: string;
}

export interface QuotationHistoryEntry {
  version: number;
  updatedAt: number;
  snapshot: Record<string, unknown>;
}

export interface Quotation {
  id: string;
  qtNo: string;
  enqId?: string;
  customerId: string;
  projectId?: string;
  lineItems: LineItem[];
  subtotal: number;
  // §29-31: GST and IGST are both explicitly opt-in and mutually
  // exclusive - neither applies unless its flag is true. cgst/sgst
  // apply only when applyGST is true (intra-state, split evenly);
  // igst applies only when applyIGST is true (inter-state). Mirrors
  // Invoice's cgstRate/sgstRate/igstRate + cgstAmt/sgstAmt/igstAmt
  // shape exactly (see Invoice in this same file).
  applyGST: boolean;
  applyIGST: boolean;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgstAmt: number;
  sgstAmt: number;
  igstAmt: number;
  totalAmount: number;
  validUntil: string;
  terms: string;
  status: QuotationStatus;
  createdAt: number;
  version?: number;
  quotationDate?: string;
  notes?: string;
  history?: QuotationHistoryEntry[];
  approvedBy?: string;
  approvedAt?: number;
  recordedPO?: {
    poNumber: string;
    poDate: string;
    sharedPoId: string;
    files: PurchaseAttachment[];
  };
}

/** A priced, dated snapshot of a Quotation. Every quotation has at least
 * Revision 1. Only one revision per quotation has isCurrent: true — older
 * revisions are permanently read-only and keep whatever Purchase Orders
 * were recorded against them, even after a newer revision becomes current. */
export interface QuotationRevision {
  id: string;
  quotationId: string;
  revisionNumber: number;
  revisionDate: string;
  revisionNotes?: string;
  lineItems: LineItem[];
  subtotal: number;
  // Same optional GST/IGST shape as Quotation - see that interface's
  // comment. Each revision keeps its own tax configuration frozen at
  // the time it was current, same as every other revision field.
  applyGST: boolean;
  applyIGST: boolean;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgstAmt: number;
  sgstAmt: number;
  igstAmt: number;
  totalAmount: number;
  validUntil: string;
  terms: string;
  notes?: string;
  status: QuotationStatus;
  approvedBy?: string;
  approvedAt?: number;
  isCurrent: boolean;
  createdAt: number;
  createdBy?: string;
}

/** A Purchase Order recorded against a specific QuotationRevision. Multiple
 * POs may be recorded against the same revision (repeat orders at the same
 * price); each PO's revisionId is fixed at creation and never changes, so a
 * later price revision never alters historical POs. */
export interface QuotationPurchaseOrder {
  id: string;
  quotationId: string;
  revisionId: string;
  poNumber: string;
  poDate: string;
  customerId: string;
  files: PurchaseAttachment[];
  remarks?: string;
  status: POStatus;
  sharedPoId: string;
  createdAt: number;
  createdBy?: string;
}

export interface PurchaseOrder {
  id: string;
  poRef: string;
  qtId: string;
  customerId: string;
  projectId?: string;
  poDate: string;
  poAmount: number;
  status: POStatus;
  createdAt: number;
}

export interface SOLineItem {
  desc: string;
  qty: number;
  unitPrice: number;
  amount: number;
}

export interface SalesOrder {
  id: string;
  soNo: string;
  poId: string;
  customerId: string;
  projectId?: string;
  qtId: string;
  lineItems: SOLineItem[];
  deliveryDate: string;
  remarks: string;
  status: SOStatus;
  createdAt: number;
}

export interface ProductionStage {
  stageName: string;
  status: StageStatus;
  startDate?: string;
  completedDate?: string;
  operator?: string;
  notes?: string;
}

export interface JobCard {
  id: string;
  jobNo: string;
  soId?: string;
  customerId: string;
  projectId?: string;
  jobDescription: string;
  drawingFileIds: string[];
  materialRequisitionStatus: "Pending" | "Raised" | "Fulfilled";
  productionStages: ProductionStage[];
  qcStatus: QCStatus;
  qcNotes: string;
  assignedTo: string;
  createdAt: number;
}

export interface MRItem {
  material: string;
  qty: number;
  unit: string;
  estimatedCost: number;
}

export interface MaterialRequisition {
  id: string;
  mrNo: string;
  jobId?: string;
  items: MRItem[];
  totalEstimatedCost: number;
  status: MRStatus;
  createdAt: number;
}

export interface DCItem {
  description: string;
  qty: number;
  unit: string;
}

export interface DCProjectEntry {
  projectId: string;
  dispatchQty: number;
}

/** How the goods leave the premises. Drives which of the dispatch fields
 * below are relevant — see DeliveryChallans.tsx / DeliveryChallanPrintView.tsx.
 * "Company Vehicle" is the default and matches the app's original (and only)
 * behavior before this field existed. */
export type DispatchMethod =
  | "Company Vehicle"
  | "Customer Pickup"
  | "Courier"
  | "Transport / Logistics";

export interface DeliveryChallan {
  id: string;
  dcNo: string;
  soId?: string;
  jobId?: string;
  customerId: string;
  projectId?: string;
  items?: DCItem[];
  projectEntries?: DCProjectEntry[];
  /** Optional for backward compatibility with challans created before this
   * field existed — treat a missing value as "Company Vehicle" when reading. */
  dispatchMethod?: DispatchMethod;
  // Company Vehicle
  vehicleNo?: string;
  driverName?: string;
  // Courier
  courierCompany?: string;
  trackingNumber?: string;
  // Transport / Logistics
  transportCompany?: string;
  lrNumber?: string;
  // Customer Pickup
  collectedBy?: string;
  mobileNumber?: string;
  dispatchDate: string;
  receiverName: string;
  status: DCStatus;
  createdAt: number;
  deliveryAddress?: {
    type: "customer" | "custom";
    value: string;
  };
}

export interface InvLineItem {
  desc: string;
  hsn: string;
  qty: number;
  rate: number;
  amount: number;
  /** Set when this line item was created via "+ Add Projects" (a real FK
   * to the project it came from), rather than typed manually. Optional -
   * manual line items (via "+ Add") never have this. */
  projectId?: string;
}

export interface BankDetails {
  bankName: string;
  accountName: string;
  accountNo: string;
  ifsc: string;
  branch: string;
}

export interface Invoice {
  id: string;
  invNo: string;
  dcId: string;
  soId?: string;
  customerId: string;
  projectId?: string;
  lineItems: InvLineItem[];
  subtotal: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgstAmt: number;
  sgstAmt: number;
  igstAmt: number;
  totalAmount: number;
  invoiceDate: string;
  dueDate: string;
  paymentTerms: string;
  status: InvoiceStatus;
  paidAmount: number;
  deliveryVehicleNo?: string;
  deliveryDestination?: string;
  poNumber?: string;
  poDate?: string;
  bankDetails?: BankDetails;
  termsAndConditions?: string;
  buyerGstin?: string;
  buyerAddress?: string;
  buyerStateName?: string;
  buyerStateCode?: string;
  invoiceType?: "tax" | "proforma";
  createdAt: number;
  reminderEnabled?: boolean;
  reminderIntervalDays?: number;
  nextReminderAt?: string;
  lastReminderSentAt?: string | null;
  reminderCount?: number;
  reminderFrequencyDays?: number;
  nextReminderCustomDate?: string | null;
  selectedEmail?: string;
  invoiceNumber?: string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  paymentDate: string;
  mode: PaymentMode;
  referenceNo: string;
  notes: string;
  createdAt: number;
  files?: Array<{ name: string; url: string; type: string }>;
}

export interface Payable {
  id: string;
  vendorName: string;
  paymentType: string;
  totalAmount: number;
  paidAmount: number;
  dueDate: string;
  vendorId?: string;
  projectId?: string;
  notes?: string;
  createdAt: number;
  /** Optional link back to the Company Purchase Order this payable was
   * raised against. Nothing sets this today — it exists so the Ledger
   * module can show "Purchase Orders (when linked)" per-vendor without
   * requiring any change to the Payables module itself. Missing on every
   * existing record; always treat as optional. */
  companyPoId?: string;
}

export interface PayablePayment {
  id: string;
  payableId: string;
  amount: number;
  paymentDate: string;
  mode: PaymentMode;
  referenceNo: string;
  notes: string;
  attachmentRef?: string;
  attachmentType?: "image" | "pdf";
  attachmentName?: string;
  createdAt: number;
}

export interface Vendor {
  id: string;
  name: string;
  phone: string;
  address: string;
  gstNumber?: string;
  createdAt: number;
}

export interface QualityInspection {
  id: string;
  projectId: string;
  stage: string;
  qcStatus: QCStatus;
  qcNotes: string;
  updatedAt: number;
  // Enhanced quality fields (additive)
  approvedQty?: number;
  rejectedQty?: number;
  remarks?: string;
}

export type Page =
  | "dashboard"
  | "customers"
  | "quotations"
  | "purchase-orders"
  | "production"
  | "material-requisitions"
  | "quality"
  | "delivery-challans"
  | "invoices"
  | "payments"
  | "payables"
  | "customer-history"
  | "projects"
  | "project-detail"
  | "employees"
  | "employee-detail"
  | "inventory"
  | "settings"
  | "vendors"
  | "company-po"
  | "petty-expenses"
  | "machinery"
  | "machine-detail"
  | "tools"
  | "dies"
  | "export-engine"
  | "scrap"
  | "qms-dashboard"
  | "qms-characteristics"
  | "qms-inspection-sheets"
  | "qms-my-inspections"
  | "drawing-editor"
  | "ledger"
  | "machine-revenue";

// ── Project Tracking Types ──────────────────────────────────────

export type ProjectPOStatus = "Open" | "In Progress" | "Completed";

export interface ProjectPO {
  id: string;
  poNumber: string;
  poDate: string;
  quantity: number;
  status: ProjectPOStatus;
  file?: PurchaseAttachment;
  quotationId?: string;
  sharedPoId?: string;
}

export type ProjectActivityType =
  | "project_created"
  | "quotation_created"
  | "quotation_approved"
  | "po_received"
  | "production_started"
  | "production_stage_update"
  | "material_purchased"
  | "material_requisition"
  | "qc_passed"
  | "qc_failed"
  | "dispatch"
  | "invoice_generated"
  | "payment_received"
  | "machine_breakdown"
  | "report_exported"
  | "note";

export interface ProjectActivity {
  id: string;
  type: ProjectActivityType;
  description: string;
  performedBy: string;
  timestamp: number;
  metadata?: Record<string, string | number>;
}

export interface Project {
  id: string;
  projectNo: string;
  customerId: string;
  projectId?: string;
  projectName: string;
  workDescription: string;
  assignedEmployeeIds?: string[];
  assignedMachineIds?: string[];
  assignedDieIds?: string[];
  poNumber?: string;
  poDate?: string;
  poFiles?: PurchaseAttachment[];
  pos?: ProjectPO[];
  createdAt: number;
  productionVersion?: "legacy" | "v2";
  totalQty?: number;
  activityLog?: ProjectActivity[];
  // Repeat Order fields (legacy, kept for compat)
  sourceProjectId?: string;
  repeatOrderSeq?: number;
  originalProjectName?: string;
  // Naming architecture v2
  customerVisibleName?: string; // what customer sees on all docs/PDFs
  internalOrderCode?: string; // e.g. "ORD-005" — never shown to customer
  projectType?: "STANDARD" | "REPEAT_ORDER";
  parentProjectId?: string; // points to original project
}

export interface DesignFile {
  id: string;
  projectId: string;
  fileName: string;
  fileType: string;
  fileData: string;
  uploadedAt: number;
}

export interface CustomCostEntry {
  id: string;
  name: string;
  amount: number;
  category: "Material" | "Process" | "Misc";
}

export interface ManualAdjustment {
  id: string;
  name: string;
  amount: number;
  type: "Add Cost" | "Reduce Cost";
}

export interface InternalCosting {
  id: string;
  projectId: string;
  rawMaterialCost: number;
  cncCost: number;
  hardwareCost: number;
  powderCoatingCost: number;
  assemblyCost: number;
  packingCost: number;
  // New additive fields
  labourCost?: number;
  transportCost?: number;
  machineCost?: number;
  outsourceCost?: number;
  consumablesCost?: number;
  electricityCost?: number;
  scrapLossCost?: number;
  extraCosts?: CustomCostEntry[];
  manualAdjustments?: ManualAdjustment[];
}

export interface MaterialPurchase {
  id: string;
  projectId: string;
  materialType: string;
  thickness: string;
  quantity: number;
  unit?: string;
  supplierName: string;
  vendorId?: string;
  purchaseDate: string;
  attachments?: PurchaseAttachment[];
}

export interface OutsourcedWork {
  id: string;
  projectId: string;
  vendorId?: string;
  vendorName: string;
  materialSent: string;
  quantitySent: number;
  dateSent: string;
  dateReceived: string;
  processCost: number;
}

export type ProjectStageStatus =
  | "NotStarted"
  | "Sent"
  | "InProgress"
  | "Completed"
  | "Received";

export interface StageTransaction {
  id: string;
  type: "send" | "receive";
  quantity: number;
  dateTime: string;
  sentToVendorId?: string;
  sentToVendorName?: string;
}

export interface ProjectProductionStage {
  stageName: string;
  status: ProjectStageStatus;
  notes: string;
  // Material movement
  quantitySent: number;
  sentDateTime: string;
  sentToVendorId: string; // vendor id or "inhouse"
  sentToVendorName: string; // vendor name or "In-house"
  // Receiving
  receivedQuantity: number;
  receivedDateTime: string;
  // Time tracking
  startTime: string;
  endTime: string;
  // V2 fields
  requiresMaterialTracking?: boolean;
  transactions?: StageTransaction[];
  // Failure tracking (additive)
  stageId?: string;
  sentQty?: number;
  receivedQty?: number;
  okQty?: number;
  rejectedQty?: number;
  reworkQty?: number;
  isRework?: boolean;
  referenceId?: string;
  reworkStage?: string;
  assignedTo?: string;
  vendor?: string;
  // WIP quantity tracking (Feature 2)
  orderedQty?: number;
  wipInProgressQty?: number;
  wipCompletedQty?: number;
  wipDispatchedQty?: number;
}

export interface ProjectProduction {
  id: string;
  projectId: string;
  stages: ProjectProductionStage[];
  version?: "legacy" | "v2";
}

export interface ProjectDelivery {
  id: string;
  projectId: string;
  deliveryDate: string;
  deliveryDestination: string;
  vehicleNumber: string;
  deliveryChallan: string;
}

// ── Auth & HR Types ──────────────────────────────────────────────

export type UserRole =
  | "admin"
  | "sales"
  | "procurement"
  | "production"
  | "quality"
  | "dispatch"
  | "accounts"
  | "employee"
  | "Admin"
  | "Accountant"
  | "Designer"
  | "Worker";

export interface AuthUser {
  id: string;
  username: string;
  // Optional as of Priority 1 (real Supabase Auth): passwords are owned by
  // Supabase Auth now, not stored/compared client-side. Still present and
  // still read/written by the pre-existing, now-vestigial local-only paths
  // (store.ts's authUsers actions, Employees.tsx's inline login-account
  // capture) that this phase deliberately left untouched - see Priority 1
  // completion report.
  passwordHash?: string; // SHA-256 hex, local-only paths
  role: UserRole;
  employeeId?: string; // linked employee
  permissions?: Record<string, boolean>;
  // Real-Supabase-Auth-backed users only (id === the auth.users UUID):
  mustChangePassword?: boolean;
  isActive?: boolean;
}

export type EmployeeType =
  | "Permanent"
  | "Temporary"
  | "Supervisor"
  | "Management"
  | "Visitor";

// Phase 43 — Employment classification, deliberately a new/distinct field
// from EmployeeType above (which stays ID-card-accent-color-only, per
// design decision). "Daily Wage" employees are ordinary Employee rows
// that are never created/deleted daily - they stay in the register
// permanently, remain selectable everywhere an Employee already is, and
// use the pre-existing attendance_records table (Phase 2) to answer "who
// worked on a particular day" - no new schema for that part.
export type EmploymentType = "Permanent" | "Temporary" | "Daily Wage";

export interface Employee {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  monthlySalary: number;
  joiningDate: string;
  userId: string; // linked AuthUser id
  photoRef?: string; // blob storage URL
  /** EMP-YYYY-NNN, generated once via generateDocNo("EMP") the first time
   * the ID Card tab is opened for this employee. Undefined on employees
   * who have never had their card viewed yet. */
  employeeCode?: string;
  designation?: string;
  bloodGroup?: string;
  emergencyContactName?: string;
  emergencyContactRelation?: string;
  emergencyContactPhone?: string;
  /** Card-specific setting, edited only from the ID Card tab. Determines
   * the card's accent color. Defaults to "Permanent" when unset. */
  employeeType?: EmployeeType;
  // Phase 43 — Employment Type (see EmploymentType above). Undefined ==
  // "Permanent" for every pre-existing employee (schema default), no
  // extra fields populated. tempStartDate/tempEndDate are optional even
  // for Temporary (never forced). dailyWageRate is meaningful only for
  // "Daily Wage".
  employmentType?: EmploymentType;
  tempStartDate?: string;
  tempEndDate?: string;
  dailyWageRate?: number;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  status: "Present" | "Absent" | "Half Day";
}

export interface SalaryPayment {
  id: string;
  employeeId: string;
  month: string; // YYYY-MM
  amount: number;
  paymentDate: string;
  notes: string;
  // Advance deduction fields (optional, added in v2)
  originalSalary?: number;
  deductedAdvance?: number;
  finalPaidAmount?: number;
  advanceDeductions?: { advanceId: string; deductedAmount: number }[];
}

export interface AdvanceRecord {
  id: string;
  employeeId: string;
  amount: number;
  date: string;
  reason: string;
  remainingBalance: number;
  /** Optional so migrated legacy SalaryAdvance rows (which never captured a
   * signature) can be represented here too — see store.ts's
   * migrateSalaryAdvancesToAdvanceRecords. */
  signatureData?: string; // base64 canvas image
}

export type EmployeeDocumentType =
  | "Aadhaar"
  | "PAN"
  | "Passport"
  | "Driving License"
  | "Offer Letter"
  | "Appointment Letter"
  | "Salary Documents"
  | "Educational Certificates"
  | "Experience Certificates"
  | "Bank Documents"
  | "Medical Certificate"
  | "Identity Card"
  | "Other";

export interface EmployeeDocument {
  id: string;
  employeeId: string;
  /** Stable across Replace — the same value on every version of "this
   * document". = id on first upload. Lets a future Version History view
   * group all versions with a simple filter, without changing this shape. */
  documentGroupId: string;
  /** Set when a newer version replaces this row; undefined = current
   * version. The Documents tab only lists rows where this is unset. */
  supersededAt?: number;
  documentName: string;
  documentType: EmployeeDocumentType;
  fileData: string; // base64 data URL, same pattern as MachineDocument
  fileMimeType: string;
  uploadDate: string; // ISO date, for display
  expiryDate?: string;
  notes?: string;
  uploadedBy: string;
  uploadedAt: number;
}

// ── Inventory Types ──────────────────────────────────────────────

export interface StockReservation {
  id: string;
  inventoryItemId: string;
  projectId: string;
  projectName: string;
  quantity: number;
  reservedBy: string;
  reservedAt: number;
  status: "active" | "released" | "consumed";
  notes?: string;
}

// Phase 36 — Inventory classification (§3-5 of the master scope). Default
// 'raw_material' preserves every pre-Phase-36 row's meaning unchanged.
// Powder Coating (powder + pretreatment chemicals) is deliberately just
// two more categories of ordinary InventoryItem, not a second ledger -
// see database/phase-36 for the reasoning.
export type InventoryItemCategory =
  | "raw_material"
  | "consumable"
  | "spare_part"
  | "powder_coating_powder"
  | "pretreatment_chemical";

export interface InventoryItem {
  id: string;
  name: string;
  unit: string; // pcs, kg, sheets, meters, etc.
  quantityAvailable: number;
  quantityReserved?: number;
  reorderLevel?: number;
  lastUpdated: number;
  unitCost?: number;
  lastPurchasePrice?: number;
  estimatedPrice?: number;
  category?: InventoryItemCategory;
  // Powder Coating Powder fields (category === "powder_coating_powder") -
  // kept independently trackable per §4.1: two rows sharing a name but
  // different shade/RAL/finish/brand are genuinely different stock, never
  // merged.
  brand?: string;
  shade?: string;
  ralCode?: string;
  finish?: string;
  powderType?: string;
  // Pretreatment Chemicals field (category === "pretreatment_chemical")
  // per §4.2 - which tank/process this chemical is associated with.
  pretreatmentTank?: string;
}

export type CompanyPOStatus = "Draft" | "Sent" | "Received";

// Purchasing integration (§15/Task #211): a PO line may optionally be
// "received" into Inventory/Tools/Machines/Dies via the
// receive_company_po_item() RPC. resourceType/resourceItemId/
// pendingGuidedCreation/receivedAt are populated by that RPC, never
// set directly by the form's own free-text item editing.
export type CompanyPOItemResourceType =
  | "inventory"
  | "tool"
  | "machine"
  | "die";

export interface CompanyPOItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number; // quantity * rate
  resourceType?: CompanyPOItemResourceType;
  resourceItemId?: string;
  // true while a Machine/Die line is linked to resourceType but has no
  // resourceItemId yet - the guided-creation Add form hasn't been
  // completed/saved for it.
  pendingGuidedCreation?: boolean;
  receivedAt?: number;
}

export interface CompanyPO {
  id: string;
  cpoNumber: string;
  vendorId?: string;
  vendorName: string;
  vendorAddress?: string;
  vendorGst?: string;
  vendorContact?: string;
  items: CompanyPOItem[];
  deliveryAddress?: string;
  expectedDeliveryDate?: string;
  status: CompanyPOStatus;
  gstPercent?: number;
  subtotal: number;
  gstAmount: number;
  grandTotal: number;
  termsAndConditions?: string;
  notes?: string;
  file?: PurchaseAttachment;
  createdAt: number;
}

export interface PurchaseAttachment {
  ref: string;
  type: "image" | "pdf";
  name: string;
}

export interface InventoryPurchase {
  id: string;
  inventoryItemId: string;
  materialName: string;
  quantityPurchased: number;
  supplierName: string;
  vendorId?: string;
  purchaseDate: string;
  cost: number;
  unitCost?: number;
  applyGST?: boolean;
  gstPercent?: number;
  subtotal?: number;
  gstAmount?: number;
  finalTotal?: number;
  attachments?: PurchaseAttachment[];
  createdAt: number;
}

export interface MaterialUsage {
  id: string;
  projectId: string;
  inventoryItemId: string;
  materialName: string;
  quantityUsed: number;
  usedDate: string;
  notes: string;
  createdAt: number;
}

// ── Reminder Types ───────────────────────────────────────────────

export type ReminderType = "Manual" | "Follow-up" | "Final Notice";
export type ReminderMethod = "WhatsApp" | "Email";

export interface ReminderLog {
  id: string;
  invoiceId: string;
  date: string; // YYYY-MM-DD
  type: ReminderType;
  status: "Sent" | "Failed" | "Not Configured" | "Logged";
  method?: ReminderMethod;
  error?: string;
  createdAt: number;
}

// ── App Settings ─────────────────────────────────────────────────

export interface AppSettings {
  // Company Profile
  companyName: string;
  companyAddress: string;
  companyGstin: string;
  companyStateName: string;
  companyStateCode: string;
  companyPhone: string;
  companyEmail: string;
  companyWebsite?: string;
  companyLogo: string; // base64 DataURL
  // WhatsApp via Twilio
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFromNumber: string; // e.g. whatsapp:+14155238886
  // Future Meta API flexibility
  whatsappProvider: "twilio" | "meta";
  // Gmail SMTP
  gmailSenderEmail: string;
  gmailAppPassword: string;
  // Bank Details (used in document footers)
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifscCode: string;
  bankBranch: string;
  // Document Footer Text
  companyTerms: string;
  companyDeclaration: string;
  quotationTerms: string;
  companyPOTerms: string;
}

// ── BOM Types ────────────────────────────────────────────────────

export interface BomItem {
  id: string;
  projectId: string;
  inventoryItemId: string;
  materialName: string;
  requiredQuantity: number;
  estimatedPrice?: number;
  createdAt: number;
}

export type BomRequisitionStatus =
  | "Pending"
  | "Ready to Complete"
  | "Completed";

export interface BomRequisition {
  id: string;
  inventoryItemId: string;
  projectId: string;
  materialName: string;
  requiredQty?: number;
  availableQty?: number;
  shortageQty: number;
  estimatedPrice?: number;
  status: BomRequisitionStatus;
  createdAt: number;
  updatedAt: number;
}

// ── Project Items ─────────────────────────────────────────────────

export type ProjectItemStatus = "Accepted" | "Pending" | "Rejected";

export interface ProjectItem {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  unit?: string;
  unitPrice?: number;
  status: ProjectItemStatus;
  createdAt: number;
}

export interface MasterPO {
  id: string;
  poNumber: string;
  poDate: string;
  customerId: string;
  quotationId: string;
  files: PurchaseAttachment[];
  sharedPoId: string;
  status: "Open" | "In Progress" | "Completed";
  createdAt: number;
}

// ── Tool Register (Phase 37, master scope §6) ───────────────────

export type ToolStatus =
  | "Available"
  | "In Use"
  | "Under Repair"
  | "Lost"
  | "Retired";

export interface Tool {
  id: string;
  toolCode: string; // TL-001
  name: string;
  category?: string;
  quantity: number;
  location?: string;
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
  condition?: MachineCondition; // reuses the same 5-point scale as Machinery
  status: ToolStatus;
  purchaseDate?: string;
  replacementValue?: number;
  notes?: string;
  // Phase 43 — photo + vendor, same base64-inline photo pattern and
  // purchaseVendorId/Name pair Machines already carry (§17 mirror).
  photoData?: string;
  purchaseVendorId?: string;
  purchaseVendorName?: string;
  // Purchasing integration provenance (§15) - set only when this tool was
  // created by receiving a CompanyPO line, never guessed.
  sourceCompanyPoItemId?: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

// Phase 43 — insert-only "who has/had this tool" audit log, mirroring
// MachineServiceRate's insert-only shape exactly. tools.assignedEmployeeId
// stays the live "current holder" scalar; this is purely the historical
// trail layered on top (never a second source of truth for who has it
// now). employeeName is resolved client-side like every other *Name
// convenience field in this codebase.
export interface ToolAssignmentHistory {
  id: string;
  toolId: string;
  employeeId?: string; // undefined = returned/unassigned at this point
  employeeName?: string;
  action: "issued" | "returned";
  notes?: string;
  recordedBy?: string;
  recordedAt: number;
  createdAt: number;
}

// ── Tooling / Dies Register (Phase 38, master scope §7-9) ───────
// Dies are reusable across projects (§8) - originalProjectId is
// provenance/history only, never ownership; a die stays "Available" and
// assignable to any later project regardless of which project it was
// originally made for.

export type DieStatus =
  | "Available"
  | "In Use"
  | "Under Maintenance"
  | "Retired";

export interface Die {
  id: string;
  dieCode: string; // DIE-001
  name: string;
  type?: string;
  purpose?: string;
  compatibleMachineId?: string;
  originalProjectId?: string;
  location?: string;
  status: DieStatus;
  dateCreated?: string;
  condition?: MachineCondition;
  notes?: string;
  // Phase 43 — photo + full purchase info, same shape Machines/Tools
  // already carry.
  photoData?: string;
  purchaseDate?: string;
  purchaseCost?: number;
  purchaseVendorId?: string;
  purchaseVendorName?: string;
  // Purchasing integration provenance (§15) - set only when this die was
  // created by receiving a CompanyPO line, never guessed.
  sourceCompanyPoItemId?: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

// Machine <-> Spare Part (Inventory item, category = spare_part) and
// Machine <-> Die compatibility junctions (§9). Plain many-to-many link
// rows - a die/spare-part can be compatible with more than one machine,
// beyond whatever single "primary" compatibleMachineId a Die also
// carries above.
export interface MachineSparePart {
  machineId: string;
  inventoryItemId: string;
  createdAt: number;
}

export interface MachineDie {
  machineId: string;
  dieId: string;
  createdAt: number;
}

// ── Machine / Service Revenue (§17-28) ──────────────────────────
// Revenue is revenue-only, never profit/costing, and lives on the
// *service*, never the machine directly: a BillableService optionally
// references one machine (machineId), but a machine may have zero, one,
// or several services, and a process-level service (e.g. "Powder
// Coating") may reference no machine at all. Rate history is
// insert-only so a rate change never rewrites past revenue; every
// MachineServiceUsage row freezes its own rateApplied/revenueAmount at
// insert time. Assignment (Project.assignedMachineIds) never creates a
// usage/revenue row - the two are structurally unconnected.
export type ChargingMethod = "hour" | "piece" | "bend" | "kg" | "other";

export interface BillableService {
  id: string;
  name: string;
  machineId?: string; // optional - process-level services have none
  chargingMethod: ChargingMethod;
  unitLabel?: string; // display unit, e.g. "hrs", "pcs", "bends", "kg"
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MachineServiceRate {
  id: string;
  billableServiceId: string;
  rate: number;
  effectiveFrom: number;
  createdBy?: string;
  createdAt: number;
}

export interface MachineServiceUsage {
  id: string;
  projectId: string;
  billableServiceId: string;
  usageDate: string; // yyyy-mm-dd
  quantity: number;
  unit?: string;
  rateApplied: number; // frozen at insert time
  revenueAmount: number; // frozen at insert time (quantity * rateApplied)
  recordedBy?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

// ── Machinery Management ────────────────────────────────────────

export type MachineType =
  | "Laser Cutting"
  | "CNC"
  | "Welding"
  | "Bending"
  | "Powder Coating"
  | "Compressor"
  | "Generator"
  | "Drilling"
  | "Grinding"
  | "Forklift"
  | "Testing"
  | "Air Tool"
  | "Other";

export type MachineStatus =
  | "Operational"
  | "Under Maintenance"
  | "Breakdown"
  | "Idle"
  | "Decommissioned";

export type ServiceType =
  | "Preventive"
  | "Corrective"
  | "Breakdown"
  | "Calibration"
  | "AMC"
  | "Inspection"
  | "Other";

export type MachineCondition =
  | "Excellent"
  | "Good"
  | "Fair"
  | "Poor"
  | "Critical";

export interface Machine {
  id: string;
  machineCode: string; // MCH-001
  name: string;
  type: MachineType;
  brand?: string;
  model?: string;
  serialNumber?: string;
  assetId?: string;
  purchaseDate?: string;
  purchaseCost?: number;
  purchaseVendorId?: string;
  purchaseVendorName?: string;
  currentStatus: MachineStatus;
  location?: string;
  department?: string;
  warrantyExpiry?: string;
  warrantyVendor?: string;
  warrantyNotes?: string;
  amcVendorId?: string;
  amcVendorName?: string;
  amcStartDate?: string;
  amcEndDate?: string;
  amcCost?: number;
  amcCoverage?: string;
  serviceIntervalDays?: number;
  lastServiceDate?: string;
  nextServiceDue?: string;
  totalRunningHours: number;
  hourlyRate?: number;
  primaryImageData?: string; // base64 for localStorage phase
  notes?: string;
  // Purchasing integration provenance (§15, Phase 38) - set only when
  // this machine was created via the guided-creation flow off a received
  // CompanyPO line, never guessed.
  sourceCompanyPoItemId?: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MachineDocument {
  id: string;
  machineId: string;
  fileName: string;
  fileType:
    | "Purchase Invoice"
    | "Warranty"
    | "Manual"
    | "Installation Report"
    | "Calibration Certificate"
    | "AMC Contract"
    | "Maintenance Report"
    | "Other";
  fileData: string; // base64
  fileMimeType: string;
  notes?: string;
  expiryDate?: string;
  uploadedAt: number;
}

export interface ServiceRecord {
  id: string;
  machineId: string;
  serviceNumber: string; // SVC-001
  serviceDate: string;
  serviceType: ServiceType;
  performedBy: "Internal" | "External Vendor" | "AMC Vendor";
  vendorId?: string;
  vendorName?: string;
  technicianName?: string;
  technicianContact?: string;
  serviceCost: number;
  travelCost: number;
  downtimeHours: number;
  breakdownCause?: string;
  resolutionDetails?: string;
  machineCondition: MachineCondition;
  nextServiceDue?: string;
  runningHoursAtService?: number;
  invoiceData?: string; // base64
  invoiceFileName?: string;
  notes?: string;
  status: "Scheduled" | "In Progress" | "Completed" | "Cancelled";
  createdBy: string;
  createdAt: number;
}

export interface ServicePart {
  id: string;
  serviceRecordId: string;
  machineId: string;
  partName: string;
  partNumber?: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  vendorId?: string;
  vendorName?: string;
  beforeImageData?: string; // base64
  afterImageData?: string; // base64
  notes?: string;
}

export interface MachineUsageLog {
  id: string;
  machineId: string;
  projectId?: string;
  projectName?: string;
  logDate: string;
  hoursUsed: number;
  operatorName?: string;
  notes?: string;
  loggedBy: string;
  createdAt: number;
}

// ── Export Engine ────────────────────────────────────────────────

export type ExportSectionId =
  | "cover_page"
  | "quotations"
  | "purchase_orders"
  | "bom"
  | "design_files"
  | "internal_costing"
  | "material_purchases"
  | "material_usage"
  | "production_history"
  | "outsourced_work"
  | "qc_reports"
  | "delivery_challans"
  | "invoices"
  | "payment_history"
  | "profit_summary"
  | "machine_usage"
  | "attachments_index";

export type ExportContext = "project" | "customer";
export type ExportFormat = "print" | "zip";
export type ExportStatus = "idle" | "generating" | "done" | "error";

export interface ExportJob {
  id: string;
  context: ExportContext;
  scopeId: string; // projectId or customerId
  scopeName: string;
  sections: ExportSectionId[];
  format: ExportFormat;
  status: ExportStatus;
  requestedBy: string;
  requestedAt: number;
  completedAt?: number;
  errorMessage?: string;
}

// ── Petty Expenses ──────────────────────────────────────────────

export type PettyExpenseType =
  | "Material"
  | "Tools"
  | "Labour"
  | "Maintenance"
  | "Food"
  | "Transport"
  | "Misc"
  // ── Smart categories (additive) — selecting one of these in the Float
  // Settlement "Purchased Items" flow reveals extra fields and, on Finish
  // Settlement, fans out to the owning module's own existing store action
  // (see store.ts handleFinishSettlement usage in PettyExpenses.tsx). Each
  // module remains the single source of truth for its own data; Petty
  // Expense only ever records that cash was spent and triggers the update.
  | "Inventory Purchase"
  | "Machine Service"
  | "Vehicle Expense"
  | "Employee Personal Expense"
  | "Courier / Delivery";
export type PettyExpenseMode = "Company Expense" | "Personal Expense";

export type VehicleExpenseType =
  | "Fuel"
  | "Service"
  | "Repairs"
  | "Insurance"
  | "Registration"
  | "Tyres";
export type CourierServiceProvider =
  | "Rapido"
  | "Porter"
  | "Courier"
  | "Delivery";

/** A photo/bill/invoice attached to an itemized PettyExpense purchase —
 * same base64-data-URL, one-file-per-record convention as EmployeeDocument/
 * MachineDocument (structurally copied, not literally reused, since those
 * are hard-FK'd to employeeId/machineId, not to an expense record). */
export interface PurchasedItemAttachment {
  id: string;
  fileName: string;
  fileMimeType: string;
  fileData: string;
  uploadedAt: number;
}

export interface PettyExpense {
  id: string;
  date: string;
  employeeId: string;
  amount: number;
  expenseType: PettyExpenseType;
  expenseMode: PettyExpenseMode;
  projectId?: string;
  /** Optional link to the ExpenseFloat this purchase was made from. When set,
   * expenseMode is always "Company Expense" — float cash is company money by
   * definition. ExpenseFloat.spentAmount is derived by summing every
   * PettyExpense with a matching floatId (see store.ts deriveFloatTotals). */
  floatId?: string;
  notes?: string;
  createdAt: string;
  /** Itemized purchase detail — set when this record was generated by the
   * Float Settlement dialog's "Purchased Items" flow rather than the
   * ad-hoc single-amount Add Expense dialog. All optional/backward
   * compatible; `amount` above remains the authoritative total either way
   * (= quantity × unitPrice when itemized). */
  itemName?: string;
  quantity?: number;
  unitPrice?: number;
  vendor?: string;
  /** Links to the selected Vendors module record when the Purchased Item's
   * vendor was chosen from the Vendor dropdown rather than left blank.
   * `vendor` above stays the resolved display name for backward-compatible
   * reads (table columns, exports, reports). */
  vendorId?: string;
  billNumber?: string;
  attachments?: PurchasedItemAttachment[];

  // ── Smart category fields (additive, all optional) — set only when
  // expenseType is one of the categories above. Each field maps straight
  // onto the target module's own existing record shape (see store.ts).
  /** Inventory Purchase */
  inventoryItemId?: string;
  addedToInventory?: boolean;
  /** Machine Service */
  machineId?: string;
  serviceType?: ServiceType;
  /** Vehicle Expense — subtype only, no master data (no Vehicle module
   * exists yet; this stays a plain, unautomated Expense Record). */
  vehicleExpenseType?: VehicleExpenseType;
  /** Courier / Delivery */
  serviceProviderType?: CourierServiceProvider;
  pickupLocation?: string;
  dropLocation?: string;
  /** Employee Personal Expense — set to a SalaryPayment.id once recovered
   * through Payroll (see EmployeeDetail.tsx "Recover Personal Expenses").
   * Undefined/unset = still outstanding. */
  recoveredInSalaryPaymentId?: string;
}

// ── WIP Production Movement ──────────────────────────────────────

export interface ProductionMovement {
  id: string;
  projectId: string;
  fromStage: string;
  toStage: string;
  qty: number;
  movementDate: string;
  notes?: string;
  createdBy: string;
  createdAt: number;
}

// ── Salary Advance ───────────────────────────────────────────────

export type SalaryAdvanceStatus =
  | "Pending"
  | "Partially Recovered"
  | "Recovered";

export interface SalaryAdvance {
  id: string;
  employeeId: string;
  amount: number;
  advanceDate: string;
  reason: string;
  deductFromMonth?: string; // YYYY-MM
  status: SalaryAdvanceStatus;
  recoveredAmount: number;
  notes?: string;
  createdAt: number;
}

// ── Expense Float ────────────────────────────────────────────────

export type ExpenseFloatStatus = "Open" | "Partially Settled" | "Fully Settled";

export interface ExpenseFloat {
  id: string;
  floatNo: string;
  employeeId: string;
  issuedDate: string;
  issuedAmount: number;
  spentAmount: number;
  returnedAmount: number;
  balanceAmount: number;
  status: ExpenseFloatStatus;
  purpose?: string;
  notes?: string;
  projectId?: string;
  issuedBy: string;
  settledAt?: number;
  createdAt: number;
}

export interface AuditLogEntry {
  id: string;
  module: string;
  action: "create" | "update" | "delete" | "status_change";
  entityId: string;
  entityLabel: string;
  changedBy: string;
  oldValue?: string;
  newValue?: string;
  timestamp: number;
}

export type ScrapStatus = "In Stock" | "Sold" | "Disposed";

export interface ScrapRecord {
  id: string;
  projectId?: string;
  projectName?: string;
  stage?: string;
  materialType: string;
  unit: string;
  generatedQty: number;
  reusableQty: number;
  soldQty: number;
  disposedQty: number;
  scrapValue?: number;
  status: ScrapStatus;
  notes?: string;
  recordedBy: string;
  createdAt: number;
}
