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
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  validUntil: string;
  terms: string;
  status: QuotationStatus;
  createdAt: number;
  version?: number;
  quotationDate?: string;
  notes?: string;
  history?: QuotationHistoryEntry[];
  recordedPO?: {
    poNumber: string;
    poDate: string;
    sharedPoId: string;
    files: PurchaseAttachment[];
  };
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

export interface DeliveryChallan {
  id: string;
  dcNo: string;
  soId?: string;
  jobId?: string;
  customerId: string;
  projectId?: string;
  items?: DCItem[];
  projectEntries?: DCProjectEntry[];
  vehicleNo: string;
  driverName: string;
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
  | "petty-expenses";

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

export interface Project {
  id: string;
  projectNo: string;
  customerId: string;
  projectId?: string;
  projectName: string;
  workDescription: string;
  assignedEmployeeIds?: string[];
  poNumber?: string;
  poDate?: string;
  poFiles?: PurchaseAttachment[];
  pos?: ProjectPO[];
  createdAt: number;
  productionVersion?: "legacy" | "v2";
  totalQty?: number;
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
  isRework?: boolean;
  referenceId?: string;
  reworkStage?: string;
  assignedTo?: string;
  vendor?: string;
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
  passwordHash: string; // SHA-256 hex
  role: UserRole;
  employeeId?: string; // linked employee
  permissions?: Record<string, boolean>;
}

export interface Employee {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  monthlySalary: number;
  joiningDate: string;
  userId: string; // linked AuthUser id
  photoRef?: string; // blob storage URL
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
  signatureData: string; // base64 canvas image
}

// ── Inventory Types ──────────────────────────────────────────────

export interface InventoryItem {
  id: string;
  name: string;
  unit: string; // pcs, kg, sheets, meters, etc.
  quantityAvailable: number;
  lastUpdated: number;
  unitCost?: number;
  lastPurchasePrice?: number;
  estimatedPrice?: number;
}

export type CompanyPOStatus = "Draft" | "Sent" | "Received";

export interface CompanyPOItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number; // quantity * rate
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

// ── Petty Expenses ──────────────────────────────────────────────

export type PettyExpenseType =
  | "Material"
  | "Tools"
  | "Labour"
  | "Maintenance"
  | "Food"
  | "Transport"
  | "Misc";
export type PettyExpenseMode = "Company Expense" | "Personal Expense";

export interface PettyExpense {
  id: string;
  date: string;
  employeeId: string;
  amount: number;
  expenseType: PettyExpenseType;
  expenseMode: PettyExpenseMode;
  projectId?: string;
  notes?: string;
  createdAt: string;
}
