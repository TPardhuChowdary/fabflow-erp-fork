// UX Redesign Lab — relational mock dataset.
//
// Ground truth: this entity list and every module name it maps to comes
// directly from the real FabFlow Page union (src/types.ts) — Dashboard,
// Customers, Quotations, Purchase Orders, Production, Material
// Requisitions, Quality/QMS, Delivery Challans, Invoices, Payments,
// Payables, Projects, Employees, Inventory, Settings, Vendors, Company
// PO, Petty Expenses, Machinery, Tools, Dies, Scrap, QMS
// Dashboard/Characteristics/Inspection Sheets/My Inspections, Drawing
// Editor, Ledger, Machine Revenue, Agent. Nothing here is an invented
// module. No production data, no Supabase, no real backend — pure
// client-side mock state for a UX simulation.
export type QuotationStatus = "Draft" | "Sent" | "Accepted" | "Rejected";
export type StageStatus = "NotStarted" | "InProgress" | "Blocked" | "Complete";
export type POStatus =
  | "Draft"
  | "PendingApproval"
  | "Approved"
  | "Confirmed"
  | "Delayed";
export type QmsStatus = "Open" | "Resolved";
export type InvoiceStatus = "Unpaid" | "PartiallyPaid" | "Paid";

// Field set matches the real pages/Customers.tsx Customer record exactly
// (see PARITY_TRACKER.md #1) — "contact" is kept as a derived display
// alias (= contactPerson) so the many existing lab screens that just
// show a name+contact line don't need touching.
export interface CustomerEmail {
  email: string;
  type: "Purchase" | "Accounts" | "Sales" | "Other";
}
export interface CustomerDetail {
  key: string;
  value: string;
}
export interface Customer {
  id: string;
  name: string;
  contact: string; // = contactPerson, kept for existing display call sites
  contactPerson: string;
  phone: string;
  email: string;
  gstin: string;
  stateName: string;
  stateCode: string;
  address: string;
  emails: CustomerEmail[];
  primaryEmail: string;
  additionalDetails: CustomerDetail[];
  since: string;
}
// Field set matches pages/Vendors.tsx exactly (see PARITY_TRACKER.md #2) —
// "contact" kept as a display alias (= phone) for existing call sites.
export interface Vendor {
  id: string;
  name: string;
  contact: string; // = phone, kept for existing display call sites
  phone: string;
  address: string;
  gstNumber: string;
}
// Real Vendors.tsx's detail panel merges two separate real purchase-log
// sources ("Purchase History") distinct from formal Purchase Orders.
export interface MaterialPurchase {
  id: string;
  vendorId: string;
  materialType: string;
  thickness: string;
  projectId: string | null;
  purchaseDate: string;
  quantity: number;
}
// This is the same real entity behind both Vendor's "Purchase History"
// panel (see #2) and pages/Inventory.tsx's "Purchases" tab — extended
// here with the fields Inventory's own Record Purchase form collects
// (itemId link, cost, GST) that Vendor's read-only view didn't need.
export interface InventoryPurchase {
  id: string;
  vendorId: string;
  itemId: string;
  materialName: string;
  purchaseDate: string;
  quantityPurchased: number;
  cost: number;
  applyGST: boolean;
}
// Field set matches pages/Quotations.tsx (see PARITY_TRACKER.md #4):
// real line items + GST/IGST tax computation + revisions + recorded
// POs. "item"/"qty"/"total" are kept as derived display aliases (first
// line item description, summed qty, computed total) so the many
// existing call sites across the 10 earlier lab models (which predate
// this parity pass and must stay untouched) keep compiling and reading
// sensible values without modification.
export interface QuotationLineItem {
  desc: string;
  hsn: string;
  qty: number;
  unitPrice: number;
  amount: number;
}
export interface Quotation {
  id: string;
  no: string;
  customerId: string;
  lineItems: QuotationLineItem[];
  subtotal: number;
  applyGST: boolean;
  applyIGST: boolean;
  cgstAmt: number;
  sgstAmt: number;
  igstAmt: number;
  validUntil: string;
  quotationDate: string;
  terms: string;
  status: QuotationStatus;
  createdAt: string;
  // derived aliases — kept in sync by the store, not user-edited directly
  item: string;
  qty: number;
  total: number;
}
export interface QuotationRevision {
  id: string;
  quotationId: string;
  revisionNumber: number;
  revisionDate: string;
  lineItems: QuotationLineItem[];
  total: number;
  isCurrent: boolean;
}
// This is real production's "Customer Purchase Orders" (pages/
// PurchaseOrders.tsx, Sales category, permission key `purchase_orders`)
// — a customer PO recorded against an Accepted quotation. NOT to be
// confused with the lab's separate `PurchaseOrder` type below, which
// models the *vendor*-side "Company PO" (Procurement category,
// permission key `company_po`, pages/CompanyPOs.tsx) — the file names
// in production are the reverse of what they sound like. See
// PARITY_TRACKER.md #5 and #15 for the corrected mapping.
export type CustomerPOStatus = "Open" | "In Progress" | "Completed";
export interface QuotationPO {
  id: string;
  quotationId: string;
  revisionId: string;
  poNumber: string;
  poDate: string;
  status: CustomerPOStatus;
}
export interface Project {
  id: string;
  no: string;
  name: string;
  customerId: string;
  quotationId: string | null;
  qty: number;
  // Real Projects.tsx has no monetary "value" field on the base project
  // record (pricing lives on Quotations/Invoices) — this is a synthetic
  // aggregation field the lab's dashboard/KPI math depends on throughout
  // (predates this parity pass); kept as a disclosed simplification
  // rather than ripped out, since removing it would ripple into every
  // dashboard/AI-briefing/pipeline calculation for a cosmetic-only gap.
  value: number;
  workDescription: string;
  createdAt: string;
}
export interface ProductionStage {
  id: string;
  projectId: string;
  name: string;
  order: number;
  status: StageStatus;
  blockedReason: string | null;
}
// Real production's per-project Production module (pages/Production.tsx,
// see PARITY_TRACKER.md #20) — a SEPARATE, real entity from the
// `ProductionStage`/`data.stages`/`advanceStage`/`blockStage` demo
// system above, which is an earlier invented concept (with its own
// "Blocked"/"Complete" status values) still read unmodified by
// Model1Pipeline.tsx (one of the 10 untouchable pre-existing models).
// Left that system completely untouched. Real stages are configured per-
// project at creation and stored as an array on one ProjectProduction
// record per project — not a flat cross-project list.
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
  quantitySent: number;
  sentDateTime: string;
  sentToVendorId: string;
  sentToVendorName: string;
  receivedQuantity: number;
  receivedDateTime: string;
  transactions: StageTransaction[];
  requiresMaterialTracking?: boolean;
}
export interface ProjectProduction {
  projectId: string;
  stages: ProjectProductionStage[];
}
export type BomRequisitionStatus =
  | "Pending"
  | "Ready to Complete"
  | "Completed";
// Matches pages/MaterialRequisitions.tsx's real field set (see
// PARITY_TRACKER.md #21). Disclosed simplification: production
// auto-generates these from a real BOM (Bill of Materials) shortage
// detection system this lab has never modeled (see #20's Production
// gaps) — seeded here as already-existing requisitions instead, since
// there's no BOM engine to generate them from live.
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
// This is real production's vendor-side "Company PO" (pages/
// CompanyPOs.tsx, Procurement category, permission key `company_po`) —
// see the QuotationPO comment above for the corrected file-name mapping.
export interface PurchaseOrder {
  id: string;
  no: string;
  vendorId: string;
  projectId: string | null;
  item: string;
  amount: number;
  status: POStatus;
  etaDays: number;
}
// Real production vendor-side "Company PO" (pages/CompanyPOs.tsx,
// Procurement, permission key `company_po`) — a SEPARATE, real entity
// from the `PurchaseOrder`/`purchaseOrders` above, which is an earlier,
// invented demo concept (with its own "PendingApproval"/"Approved"
// workflow) still read by three of the 10 untouchable pre-existing
// models (Model4Command, Model6Graph, Model10Feed via `approvePO`) —
// left completely alone. This is the module built for
// PARITY_TRACKER.md #15: real 3-status workflow (Draft/Sent/Received,
// no approval gate), free-form line items with computed amounts, GST%,
// vendor snapshot fields, file attachment.
// Disclosed simplification: production's real "Receive" flow is a per-
// line-item integration that can create/link Inventory items, Tools,
// Machines, or Dies (via a guided-create form for Machines/Dies, find-
// or-create for Inventory/Tools) — not reproduced; Status here is a
// simple Draft/Sent/Received toggle with no cross-module resource
// creation, tracked as a known gap given this session's scope ceiling.
export type CompanyPOStatus = "Draft" | "Sent" | "Received";
export interface CompanyPOItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
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
  file?: { ref: string; type: "image" | "pdf"; name: string };
  createdAt: number;
}
// Matches pages/Inventory.tsx's real field set (see PARITY_TRACKER.md
// #9): real category taxonomy, unit cost, estimated price. Real
// Reserved/Available stock split reinstated during the UX Consolidation
// pass (decisionlab/UX_CONSOLIDATION.md §2, row 9 — flagged as a real
// data-integrity guardrail production has and the prototype lacked, not
// optional). `qty` is production's real "Total Stock"; `reserved` is a
// disclosed simplification of production's real reservation-against-
// production-stage-consumption engine — seeded as a plain number rather
// than computed live from in-flight production stages, since that
// engine depends on the still-unmodeled BOM system (see Module 20/21's
// own disclosed gaps). `available` is always derived (qty - reserved),
// never stored, matching production's own display logic. Not reproduced
// (disclosed gaps): the conditional category-specific fields (brand/
// shade/RAL code/finish for powder coating, tank name for pretreatment
// chemical), file attachments on purchases, and material-usage tracking
// (`materialUsages`).
export type InventoryCategory =
  | "raw_material"
  | "consumable"
  | "spare_part"
  | "powder_coating_powder"
  | "pretreatment_chemical";
export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: InventoryCategory;
  qty: number;
  reserved: number;
  reorderAt: number;
  unit: string;
  unitCost: number;
  lastPurchaseDate: string;
}
export interface QmsIssue {
  id: string;
  ncrNo: string;
  projectId: string;
  stageId: string | null;
  issue: string;
  severity: "high" | "medium" | "low";
  status: QmsStatus;
}
// Field set matches pages/Invoices.tsx's core surface (see
// PARITY_TRACKER.md #6) — line items, editable CGST/SGST/IGST rates,
// tax/proforma type, PO linkage. "amount" kept as a derived alias
// (= totalAmount) for the many existing call sites across the 10
// earlier lab models. Not reproduced (disclosed gaps): delivery-
// challan quantity linkage, reminder scheduling, buyer-address
// override, per-invoice email selection — narrow real features whose
// omission doesn't remove a primary action/workflow.
export interface InvLineItem {
  desc: string;
  hsn: string;
  qty: number;
  rate: number;
  amount: number;
}
export interface Invoice {
  id: string;
  no: string;
  projectId: string;
  customerId: string;
  lineItems: InvLineItem[];
  subtotal: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  invoiceDate: string;
  poNumber: string;
  poDate: string;
  invoiceType: "tax" | "proforma";
  status: InvoiceStatus;
  amount: number; // derived alias = totalAmount
  paidAmount: number;
  dueDate: string;
}
// Matches pages/Payments.tsx's real field set (see PARITY_TRACKER.md
// #7). Not reproduced: file attachments (same disclosed gap as
// Quotations/Invoices/CustomerPOs — no PDF/blob infra in the lab) and
// the real "Receivables" reminder tab (WhatsApp/Email reminder
// scheduling with tone suggestions) — a genuinely deep, narrow
// secondary feature; production itself has no working Edit/Delete on
// payment records either (`pEdit`/`pDelete` computed but explicitly
// unused, "Reserved for future edit/delete actions"), so the lab
// correctly has none too — this is real parity, not a gap.
export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  date: string;
  method: string;
  referenceNo: string;
  notes: string;
}
// Matches pages/Machinery.tsx's real field set (see PARITY_TRACKER.md
// #10): real 5-value status, real 12-value type taxonomy, service
// scheduling by date (not a days-count). Not reproduced (disclosed
// gaps): warranty tracking, AMC contract details, purchase cost/vendor
// linkage, service-record log, machine-usage log — a genuinely deep
// secondary surface. "status" kept the same key name; values changed to
// the real 5 (only one prior call site, store.tsx's attentionItems,
// updated alongside).
export type MachineStatus =
  | "Operational"
  | "Under Maintenance"
  | "Breakdown"
  | "Idle"
  | "Decommissioned";
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
export interface Machine {
  id: string;
  machineCode: string;
  name: string;
  type: MachineType;
  status: MachineStatus;
  location: string;
  department: string;
  hourlyRate: number;
  nextServiceDue: string;
}
export type ToolStatus =
  | "Available"
  | "In Use"
  | "Under Repair"
  | "Lost"
  | "Retired";
export type ToolCondition = "Excellent" | "Good" | "Fair" | "Poor" | "Critical";
// Matches pages/Tools.tsx's real field set (see PARITY_TRACKER.md #11).
// Production Dies (pages/Dies.tsx) is a SEPARATE module/table, not a
// "type" discriminator on this same entity as the old lab model assumed
// — it will get its own type when Module 12 is built.
// Disclosed simplifications: photo is stored as the raw file data URI
// (production canvas-resizes to 800px/JPEG q0.75 before storing);
// sourceCompanyPoItemId (link back to a received Company PO line) is not
// reproduced; "tools.assign" is a distinct RBAC permission in production
// gating the Issue/Return controls — not enforced here, consistent with
// every other module's Role Layer being presentation-level in this
// prototype, not an enforcement gate.
export interface Tool {
  id: string;
  toolCode: string;
  name: string;
  category?: string;
  quantity: number;
  location?: string;
  assignedEmployeeId?: string;
  condition?: ToolCondition;
  status: ToolStatus;
  purchaseDate?: string;
  replacementValue?: number;
  notes?: string;
  photoData?: string;
  purchaseVendorId?: string;
  purchaseVendorName?: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}
// Real insert-only assignment log behind Tools' History panel — every
// Issue/Return appends a row (see PARITY_TRACKER.md #11).
export interface ToolAssignmentHistory {
  id: string;
  toolId: string;
  action: "issued" | "returned";
  employeeId?: string;
  recordedAt: number;
}
export type DieStatus =
  | "Available"
  | "In Use"
  | "Under Maintenance"
  | "Retired";
// Matches pages/Dies.tsx's real field set (see PARITY_TRACKER.md #12).
// Dies are reusable across projects — originalProjectId is provenance
// only, never ownership (a die stays "Available" and assignable to any
// later project regardless of which project it was made for).
// Disclosed simplification: production requires linking at least one
// Drawing Repository drawing on Create, through a dedicated many-to-
// many `drawingLinks` join table owned by the Drawing Repository/Editor
// module (not yet built here, see PARITY_TRACKER.md #24). This
// prototype reproduces the real "must link a drawing to create a die"
// rule using a simpler denormalized `linkedDrawingIds` array against
// the existing `Drawing` entity, until that module lands.
export interface Die {
  id: string;
  dieCode: string;
  name: string;
  type?: string;
  purpose?: string;
  compatibleMachineId?: string;
  originalProjectId?: string;
  location?: string;
  status: DieStatus;
  dateCreated?: string;
  condition?: ToolCondition;
  notes?: string;
  photoData?: string;
  purchaseDate?: string;
  purchaseCost?: number;
  purchaseVendorId?: string;
  purchaseVendorName?: string;
  linkedDrawingIds: string[];
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}
export type UserRole =
  | "admin"
  | "sales"
  | "procurement"
  | "production"
  | "quality"
  | "dispatch"
  | "accounts"
  | "employee";
export type EmploymentType = "Permanent" | "Temporary" | "Daily Wage";
// Matches pages/Employees.tsx's real field set (see PARITY_TRACKER.md
// #13). "department" (the lab's pre-existing invented field) is
// dropped — real production has no such field on Employee.
// Disclosed simplifications: username/password login-account
// provisioning on Create (real production creates a linked Supabase
// Auth account via a shared Edge Function) is not reproduced — there is
// no real backend auth here to provision, so `userId` stays unset;
// `employeeCode` (auto-generated the first time the real ID Card tab is
// opened) and `employeeType` (an ID-card-only accent-color setting,
// distinct from `role`) are not reproduced since the ID Card feature
// itself isn't built. The entire EmployeeDetail.tsx subsystem (ID Card
// generation, monthly attendance-driven Salary/Payroll calculation,
// Advances with e-signature, Documents) is a deep ~2,100-line HR/
// payroll module not reproduced here — View shows a read-only summary
// of the fields below instead of drilling into that subsystem.
export interface Employee {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  monthlySalary: number;
  joiningDate: string;
  userId: string;
  photoRef?: string;
  designation?: string;
  bloodGroup?: string;
  emergencyContactName?: string;
  emergencyContactRelation?: string;
  emergencyContactPhone?: string;
  employmentType?: EmploymentType;
  tempStartDate?: string;
  tempEndDate?: string;
  dailyWageRate?: number;
}
// Matches the Repository half of drawingEditor's real `DrawingDocument`
// (see PARITY_TRACKER.md #27) — real owner classification (project/
// machine/library) and real 7-value category taxonomy. "projectId" is
// kept as a derived display alias (= ownerId when ownerType is
// "project") for the pre-existing lab code that reads it directly.
// Disclosed simplification (a hard scope decision, not an oversight):
// the Editor half — a fabric.js canvas + pdf.js PDF rendering engine
// with vector/pixel/original annotation modes, dimension tools, magic-
// erase pixel manipulation, view detection, title-block forms, and
// drawing-tree/revision lineage — is a genuine CAD-adjacent graphics
// engine, not a CRUD surface, and is not reproducible in a React/mock-
// store UX prototype. Only the Repository (list, metadata, links) is
// built; "View"/"Edit" here show/edit metadata, never open a canvas.
export type DrawingOwnerType = "project" | "machine" | "library";
export type DrawingCategory =
  | "CNC Program"
  | "Die Drawing"
  | "Tooling"
  | "Machine Setup"
  | "Standard Drawing"
  | "Template"
  | "Other";
export interface Drawing {
  id: string;
  fileName: string;
  numPages: number;
  ownerType: DrawingOwnerType;
  ownerId?: string;
  category?: DrawingCategory;
  version: number;
  status: "Draft" | "Approved";
  uploadedBy: string;
  uploadedAt: number;
  notes?: string;
  tags: string[];
  // derived alias — kept in sync by the store, not user-edited directly
  projectId: string;
}
export type DrawingLinkedType =
  | "project"
  | "machine"
  | "vendor"
  | "customer"
  | "die";
export interface DrawingLink {
  id: string;
  drawingId: string;
  linkedType: DrawingLinkedType;
  linkedId: string;
  createdAt: number;
}
export type DCStatus = "Prepared" | "Dispatched" | "Delivered";
export type DispatchMethod =
  | "Company Vehicle"
  | "Customer Pickup"
  | "Courier"
  | "Transport / Logistics";
export interface DCProjectEntry {
  projectId: string;
  dispatchQty: number;
}
// Matches pages/DeliveryChallans.tsx's real field set (see
// PARITY_TRACKER.md #14): multi-project challans (a single DC can span
// several projects for the same customer), per-project dispatch-qty
// capped at the project's remaining quantity (totalQty minus what every
// OTHER challan has already dispatched — modeled here against the
// lab's existing `Project.qty`), 4 dispatch methods with their own
// conditional field sets, editable DC number with duplicate check,
// delivery address (customer's address vs a custom override).
// "no"/"projectId"/"qty"/"dispatchedAt" are kept as derived display
// aliases (= dcNo / first project entry's id / summed dispatchQty /
// dispatchDate) for the pre-existing lab models' call sites.
export interface DeliveryChallan {
  id: string;
  dcNo: string;
  customerId: string;
  projectEntries: DCProjectEntry[];
  dispatchMethod: DispatchMethod;
  vehicleNo?: string;
  driverName?: string;
  courierCompany?: string;
  trackingNumber?: string;
  transportCompany?: string;
  lrNumber?: string;
  collectedBy?: string;
  mobileNumber?: string;
  dispatchDate: string;
  receiverName: string;
  status: DCStatus;
  createdAt: number;
  deliveryAddress: { type: "customer" | "custom"; value: string };
  // derived aliases — kept in sync by the store, not user-edited directly
  no: string;
  projectId: string;
  qty: number;
  dispatchedAt: string;
}
// Matches pages/Payables.tsx's real field set (see PARITY_TRACKER.md
// #8). "amount" kept as a derived alias (= totalAmount) for existing
// call sites (VendorWorkspace, attentionItems, etc). Not reproduced:
// payment-attachment upload (same disclosed gap as every other module's
// file handling) and the vendor free-text override (real production
// lets a payable name a vendor that doesn't exist as a full Vendor
// record yet — narrow edge case, the lab always links a real vendorId).
export interface Payable {
  id: string;
  vendorId: string;
  paymentType: string;
  projectId: string | null;
  notes: string;
  amount: number; // derived alias = totalAmount
  paidAmount: number;
  dueDate: string;
}
export interface PayablePayment {
  id: string;
  payableId: string;
  amount: number;
  paymentDate: string;
  mode: string;
  referenceNo: string;
  notes: string;
}
export type PettyExpenseType =
  | "Material"
  | "Tools"
  | "Labour"
  | "Maintenance"
  | "Food"
  | "Transport"
  | "Misc"
  | "Inventory Purchase"
  | "Machine Service"
  | "Vehicle Expense"
  | "Employee Personal Expense"
  | "Courier / Delivery";
export type PettyExpenseMode = "Company Expense" | "Personal Expense";
export type ExpenseFloatStatus = "Open" | "Partially Settled" | "Fully Settled";
// Matches pages/PettyExpenses.tsx's core field set (see
// PARITY_TRACKER.md #16): the real 12-category taxonomy, Company/
// Personal expense mode, and the real Expense Float lifecycle (an
// advance issued to an employee, spent against by linking expenses via
// floatId, with balance/status DERIVED — never stored directly —
// exactly matching production's real `deriveFloatTotals()`).
// Disclosed simplification: production's "Settle Float" flow is a
// deep itemized-purchase form with 12 per-category conditional field
// sets that fan out to Inventory/Machinery/Payroll (creating/linking
// records in those modules) — not reproduced; this prototype's
// "Return Remaining" only records `returnedAmount` on the float itself,
// with expenses linked to it through the plain Add Expense dialog.
export interface PettyExpense {
  id: string;
  date: string;
  employeeId: string;
  amount: number;
  expenseType: PettyExpenseType;
  expenseMode: PettyExpenseMode;
  projectId?: string;
  floatId?: string;
  notes?: string;
  createdAt: string;
}
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
export interface LedgerEntry {
  id: string;
  date: string;
  account: string;
  debit: number;
  credit: number;
  ref: string;
}
export type ChargingMethod = "hour" | "piece" | "bend" | "kg" | "other";
// Matches pages/MachineRevenue.tsx's real domain model (see
// PARITY_TRACKER.md #17). Revenue-only, never profit/costing — every
// total sums billable-service usage revenue, never a machine's cost/
// depreciation. Keyed by *service* name, not machine name — a service
// optionally references a machine (process-level services have none).
export interface BillableService {
  id: string;
  name: string;
  machineId?: string;
  chargingMethod: ChargingMethod;
  unitLabel?: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}
// Insert-only rate history — Change Rate always appends a new row,
// never edits/deletes a past one, so past usage's frozen rateApplied/
// revenueAmount are never retroactively affected.
export interface MachineServiceRate {
  id: string;
  billableServiceId: string;
  rate: number;
  effectiveFrom: number;
  createdAt: number;
}
export interface MachineServiceUsage {
  id: string;
  projectId: string;
  billableServiceId: string;
  usageDate: string;
  quantity: number;
  unit?: string;
  rateApplied: number;
  revenueAmount: number;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}
export type ScrapStatus = "In Stock" | "Sold" | "Disposed";
// Matches pages/ScrapManagement.tsx's real field set (see
// PARITY_TRACKER.md #18).
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
export interface QmsCharacteristic {
  id: string;
  name: string;
  process: string;
  criticality: "Safety" | "Functional" | "Cosmetic";
}
export interface QmsInspection {
  id: string;
  projectId: string;
  characteristic: string;
  inspector: string;
  result: "Pass" | "Fail" | "Pending";
  date: string;
}
// Real QMS engine (see PARITY_TRACKER.md #22-26) — a SEPARATE, real
// subsystem from `QmsIssue`/`QmsCharacteristic`/`QmsInspection` above,
// which are earlier invented demo concepts still read unmodified by 4
// of the 10 untouchable pre-existing models (`qmsIssues` — an "NCR"
// concept that doesn't even exist in real production's QMS scope yet,
// per its own source comment) and one more (`qmsInspections`, read by
// Model7Timeline). Left that system completely untouched.
// Disclosed simplifications against the real (genuinely enterprise-
// scale — 536-line types.ts + 846-line store) QMS engine:
//   - Operations and a separate InspectionMethod master-data table are
//     dropped; `inspectionMethodType` is stored directly on the
//     characteristic as an enum instead of a joined reference.
//   - `InspectionStageDefinition` (a named checkpoint like "Welding
//     Inspection", optionally linked to a process) is collapsed into
//     ManufacturingProcess directly — adding a Project QMS inspection
//     means picking a process, not a separately-curated checkpoint.
//   - Per-characteristic results are stored as the current/latest state
//     inline (result/measuredValue/remarks/failureReason) instead of
//     production's real INSERT-ONLY attempts table with round numbers,
//     rectification tracking, and photo evidence — so there is no
//     append-only audit history of every attempt, only the latest one.
//   - Bulk-select actions, the Template manager (create/rename/delete/
//     apply reusable characteristic sets), Favorites, PDF/QR generation,
//     document upload/scan-and-approve, revision-family documents,
//     per-stage digital signature capture, and Production↔QMS gate
//     wiring (the "requiredProductionStageId" link and its override
//     flow — Module 20's Production already discloses this from its
//     side) are all real but not reproduced here.
export type QmsCriticality =
  | "SafetyCritical"
  | "FunctionalCritical"
  | "RegulatoryCritical"
  | "CustomerCritical"
  | "ProcessCritical"
  | "Cosmetic";
export type QmsCharacteristicStatus = "Active" | "Obsolete";
export type QmsInspectionMethodType =
  | "PassFail"
  | "Numeric"
  | "MultiNumeric"
  | "Text"
  | "Dropdown"
  | "Checkbox"
  | "Photo"
  | "File"
  | "Certificate"
  | "BarcodeScan"
  | "QRScan";
export interface ManufacturingProcess {
  id: string;
  name: string;
  sequence: number;
  active: boolean;
}
export interface QualityCharacteristic {
  id: string;
  name: string;
  description: string;
  category: string;
  processId: string;
  criticality: QmsCriticality;
  inspectionMethodType: QmsInspectionMethodType;
  acceptanceCriteria: string;
  toleranceNominal?: number;
  tolerancePlus?: number;
  toleranceMinus?: number;
  unit?: string;
  measuringInstrument?: string;
  standardReference?: string;
  drawingReference?: string;
  evidenceRequired: boolean;
  photoRequired: boolean;
  customerScope?: string;
  tags: string[];
  status: QmsCharacteristicStatus;
  createdAt: number;
  updatedAt: number;
}
export type InspectionMode = "Paper" | "Digital" | "Hybrid";
export type InspectionSheetStatus =
  | "Draft"
  | "Generated"
  | "Printed"
  | "InspectionStarted"
  | "InProgress"
  | "Completed"
  | "AwaitingUpload"
  | "Uploaded"
  | "Reviewed"
  | "Approved"
  | "Closed";
export const INSPECTION_SHEET_TRANSITIONS: Record<
  InspectionSheetStatus,
  InspectionSheetStatus[]
> = {
  Draft: ["Generated"],
  Generated: ["Printed", "InspectionStarted", "InProgress", "Uploaded"],
  Printed: ["InspectionStarted", "InProgress", "Uploaded"],
  InspectionStarted: ["InProgress", "Completed", "Uploaded"],
  InProgress: ["Completed", "AwaitingUpload", "Uploaded"],
  Completed: ["AwaitingUpload", "Uploaded", "Reviewed"],
  AwaitingUpload: ["Uploaded"],
  Uploaded: ["Reviewed"],
  Reviewed: ["Approved", "Uploaded"],
  Approved: ["Closed"],
  Closed: [],
};
export interface InspectionSheet {
  id: string;
  projectId: string;
  inspectionNumber: string;
  revision: number;
  mode: InspectionMode;
  status: InspectionSheetStatus;
  customerId?: string;
  drawingReference?: string;
  generatedAt: number;
  generatedBy: string;
}
export type ProjectQmsInspectionStatus =
  | "NotStarted"
  | "InProgress"
  | "Failed"
  | "Passed";
export interface ProjectQmsInspectionCharacteristic {
  id: string;
  projectQmsInspectionId: string;
  characteristicId: string;
  nameSnapshot: string;
  sequence: number;
  result?: "Pass" | "Fail" | "NA";
  measuredValue?: string;
  remarks?: string;
  failureReason?: string;
}
export interface ProjectQmsInspection {
  id: string;
  projectId: string;
  processId: string;
  processName: string;
  mode: InspectionMode;
  status: ProjectQmsInspectionStatus;
  createdAt: number;
  updatedAt: number;
}

// Matches pages/Settings.tsx's real Company Profile field set (see
// PARITY_TRACKER.md #29) plus the WhatsApp/Twilio and Gmail SMTP
// integration credential fields — all stored as one flat settings
// record exactly like the real `AppSettings` shape.
export interface AppSettings {
  companyName: string;
  companyAddress: string;
  companyGstin: string;
  companyStateName: string;
  companyStateCode: string;
  companyPhone: string;
  companyEmail: string;
  companyWebsite: string;
  companyLogo: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifscCode: string;
  bankBranch: string;
  companyTerms: string;
  companyDeclaration: string;
  quotationTerms: string;
  companyPOTerms: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFromNumber: string;
  gmailSenderEmail: string;
  gmailAppPassword: string;
}

// Real production's fine-grained MODULE_PERMISSIONS × action catalog
// (src/permissions.ts) ported verbatim in shape — module key, label,
// category, and its real action list — driving the same Settings ->
// Users permission-matrix UI (checkbox per module.action, grouped by
// category) as production. Kept as its own module (permissionCatalog.ts)
// rather than inline in data.ts since it's a static table, not mock
// entity data.
export type PermissionMap = Record<string, boolean>;

// Matches pages/Settings.tsx's real `OrgUserRow` (see PARITY_TRACKER.md
// #29). Disclosed simplification: this lab has no real backend auth to
// provision (same gap already disclosed on Employee.userId above) — an
// OrgUser here is a real named account record with a real role and real
// per-module.action permission overrides, but creating one does not
// provision an actual login; the lab's own sign-in stays the pre-existing
// coarse role-picker in FinalPrototype.tsx, untouched.
export interface OrgUser {
  id: string;
  username: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  overrides: PermissionMap;
  createdAt: number;
}

export type SecurityAuditEventType =
  | "password_changed"
  | "user_created"
  | "user_role_changed"
  | "user_permissions_changed"
  | "user_deactivated"
  | "user_reactivated"
  | "agent_action_proposed"
  | "agent_action_confirmed"
  | "agent_action_executed"
  | "agent_action_blocked"
  | "agent_action_failed";

// Matches pages/Settings.tsx's real `SecurityAuditLogEntry` (see
// PARITY_TRACKER.md #29) — read-only, insert-only by design in
// production. Also matches real agent/audit.ts's real 5-stage event
// taxonomy (proposed/confirmed/executed/blocked/failed) — Module 30 (AI
// Agent) reuses this exact same table to log every Classic-mode agent
// call, exactly like real production reuses security_audit_log rather
// than building a parallel Agent-specific audit system.
export interface SecurityAuditLogEntry {
  id: string;
  eventType: SecurityAuditEventType;
  actorUsername: string;
  targetUsername?: string;
  metadata: Record<string, string | number | boolean>;
  createdAt: number;
}

// Real pages/Quotations.tsx tax math reproduced exactly: GST = 9% CGST +
// 9% SGST, IGST = 18%, neither auto-applied (both false → 0 tax).
function mkQuotation(opts: {
  id: string;
  no: string;
  customerId: string;
  item: string;
  qty: number;
  unitPrice: number;
  status: QuotationStatus;
  createdAt: string;
  validUntil: string;
  applyGST?: boolean;
  applyIGST?: boolean;
}): Quotation {
  const amount = Math.round(opts.qty * opts.unitPrice);
  const applyGST = opts.applyGST ?? false;
  const applyIGST = opts.applyIGST ?? false;
  const cgstAmt = applyGST ? Math.round(amount * 0.09) : 0;
  const sgstAmt = applyGST ? Math.round(amount * 0.09) : 0;
  const igstAmt = applyIGST ? Math.round(amount * 0.18) : 0;
  const total = amount + cgstAmt + sgstAmt + igstAmt;
  return {
    id: opts.id,
    no: opts.no,
    customerId: opts.customerId,
    lineItems: [
      {
        desc: opts.item,
        hsn: "7326",
        qty: opts.qty,
        unitPrice: opts.unitPrice,
        amount,
      },
    ],
    subtotal: amount,
    applyGST,
    applyIGST,
    cgstAmt,
    sgstAmt,
    igstAmt,
    validUntil: opts.validUntil,
    quotationDate: opts.createdAt,
    terms: "50% advance, balance on dispatch.",
    status: opts.status,
    createdAt: opts.createdAt,
    item: opts.item,
    qty: opts.qty,
    total,
  };
}

// Real pages/Invoices.tsx tax math: CGST/SGST/IGST are editable rates
// (default 9/9/0), not opt-in checkboxes like Quotations.
function mkInvoice(opts: {
  id: string;
  no: string;
  projectId: string;
  customerId: string;
  item: string;
  qty: number;
  rate: number;
  cgstRate?: number;
  sgstRate?: number;
  igstRate?: number;
  invoiceDate: string;
  dueDate: string;
  paidAmount: number;
  status: InvoiceStatus;
  invoiceType?: "tax" | "proforma";
}): Invoice {
  const amount = Math.round(opts.qty * opts.rate);
  const cgstRate = opts.cgstRate ?? 9;
  const sgstRate = opts.sgstRate ?? 9;
  const igstRate = opts.igstRate ?? 0;
  const cgstAmt = Math.round((amount * cgstRate) / 100);
  const sgstAmt = Math.round((amount * sgstRate) / 100);
  const igstAmt = Math.round((amount * igstRate) / 100);
  const total = amount + cgstAmt + sgstAmt + igstAmt;
  return {
    id: opts.id,
    no: opts.no,
    projectId: opts.projectId,
    customerId: opts.customerId,
    lineItems: [
      { desc: opts.item, hsn: "7326", qty: opts.qty, rate: opts.rate, amount },
    ],
    subtotal: amount,
    cgstRate,
    sgstRate,
    igstRate,
    invoiceDate: opts.invoiceDate,
    poNumber: "",
    poDate: "",
    invoiceType: opts.invoiceType ?? "tax",
    status: opts.status,
    amount: total,
    paidAmount: opts.paidAmount,
    dueDate: opts.dueDate,
  };
}

export const initialData = {
  customers: [
    {
      id: "cust-1",
      name: "Meridian Fab Co.",
      contact: "Rakesh Iyer",
      contactPerson: "Rakesh Iyer",
      phone: "+91 98200 11122",
      email: "rakesh.iyer@meridianfab.in",
      gstin: "27ABCDE1234F1Z5",
      stateName: "Maharashtra",
      stateCode: "27",
      address: "Plot 14, MIDC Industrial Area, Pune, MH 411019",
      emails: [
        { email: "rakesh.iyer@meridianfab.in", type: "Accounts" },
        { email: "purchase@meridianfab.in", type: "Purchase" },
      ],
      primaryEmail: "rakesh.iyer@meridianfab.in",
      additionalDetails: [{ key: "PAN", value: "ABCDE1234F" }],
      since: "2022",
    },
    {
      id: "cust-2",
      name: "Norwood Industrial",
      contact: "Priya Nair",
      contactPerson: "Priya Nair",
      phone: "+91 98450 22233",
      email: "priya.nair@norwoodind.com",
      gstin: "29FGHIJ5678K1Z2",
      stateName: "Karnataka",
      stateCode: "29",
      address: "44 Peenya Industrial Estate, Bengaluru, KA 560058",
      emails: [{ email: "priya.nair@norwoodind.com", type: "Accounts" }],
      primaryEmail: "priya.nair@norwoodind.com",
      additionalDetails: [],
      since: "2023",
    },
    {
      id: "cust-3",
      name: "Ashfield Metalworks",
      contact: "Tom Ashfield",
      contactPerson: "Tom Ashfield",
      phone: "+91 90080 33344",
      email: "tom@ashfieldmetal.com",
      gstin: "24LMNOP9012Q1Z8",
      stateName: "Gujarat",
      stateCode: "24",
      address: "GIDC Estate, Vatva, Ahmedabad, GJ 382445",
      emails: [{ email: "tom@ashfieldmetal.com", type: "Sales" }],
      primaryEmail: "tom@ashfieldmetal.com",
      additionalDetails: [],
      since: "2024",
    },
    {
      id: "cust-4",
      name: "Delta Sheet Systems",
      contact: "S. Deshmukh",
      contactPerson: "S. Deshmukh",
      phone: "+91 99870 44455",
      email: "s.deshmukh@deltasheet.in",
      gstin: "27RSTUV3456W1Z4",
      stateName: "Maharashtra",
      stateCode: "27",
      address: "B-12 Chakan Industrial Park, Pune, MH 410501",
      emails: [
        { email: "s.deshmukh@deltasheet.in", type: "Purchase" },
        { email: "accounts@deltasheet.in", type: "Accounts" },
      ],
      primaryEmail: "s.deshmukh@deltasheet.in",
      additionalDetails: [{ key: "PAN", value: "RSTUV3456W" }],
      since: "2021",
    },
  ] as Customer[],

  vendors: [
    {
      id: "vend-1",
      name: "SteelSource India",
      contact: "+91 98200 55511",
      phone: "+91 98200 55511",
      address: "Plot 7, Taloja MIDC, Navi Mumbai, MH 410208",
      gstNumber: "27SSIND5511F1Z3",
    },
    {
      id: "vend-2",
      name: "Coatline Chemicals",
      contact: "+91 90210 66622",
      phone: "+91 90210 66622",
      address: "Sector 58, Faridabad, HR 121004",
      gstNumber: "06COATL6622G1Z8",
    },
    {
      id: "vend-3",
      name: "Precision Fasteners Ltd.",
      contact: "+91 98450 77733",
      phone: "+91 98450 77733",
      address: "Jigani Industrial Area, Bengaluru, KA 560105",
      gstNumber: "29PRECI7733H1Z1",
    },
  ] as Vendor[],

  // Real ERP records raw material/inventory purchases from a vendor
  // separately from formal Purchase Orders — see PARITY_TRACKER.md #2.
  materialPurchases: [
    {
      id: "mp-1",
      vendorId: "vend-1",
      materialType: "Cold-rolled steel sheet",
      thickness: "2mm",
      projectId: "proj-3",
      purchaseDate: "2026-08-12",
      quantity: 400,
    },
    {
      id: "mp-2",
      vendorId: "vend-1",
      materialType: "Hot-rolled steel coil",
      thickness: "3mm",
      projectId: null,
      purchaseDate: "2026-07-28",
      quantity: 250,
    },
  ] as MaterialPurchase[],
  inventoryPurchases: [
    {
      id: "ip-1",
      vendorId: "vend-2",
      itemId: "inv-2",
      materialName: "Powder coat RAL 7016",
      purchaseDate: "2026-08-05",
      quantityPurchased: 80,
      cost: 30400,
      applyGST: true,
    },
  ] as InventoryPurchase[],

  quotations: [
    mkQuotation({
      id: "qt-1",
      no: "QT-2026-010",
      customerId: "cust-1",
      item: "Bracket Assembly — Line 3 Retrofit",
      qty: 240,
      unitPrice: 1716.67,
      status: "Accepted",
      createdAt: "2026-08-02",
      validUntil: "2026-09-02",
      applyGST: true,
    }),
    mkQuotation({
      id: "qt-2",
      no: "QT-2026-011",
      customerId: "cust-2",
      item: "Chassis Panels — Q3 Run",
      qty: 60,
      unitPrice: 3108.33,
      status: "Accepted",
      createdAt: "2026-08-05",
      validUntil: "2026-09-05",
      applyGST: true,
    }),
    mkQuotation({
      id: "qt-3",
      no: "QT-2026-012",
      customerId: "cust-3",
      item: "Custom Enclosures",
      qty: 12,
      unitPrice: 4516.67,
      status: "Sent",
      createdAt: "2026-08-20",
      validUntil: "2026-09-20",
    }),
    mkQuotation({
      id: "qt-4",
      no: "QT-2026-013",
      customerId: "cust-4",
      item: "Sheet Metal Cabinets — Batch 4",
      qty: 500,
      unitPrice: 1782,
      status: "Accepted",
      createdAt: "2026-07-28",
      validUntil: "2026-08-28",
      applyIGST: true,
    }),
  ] as Quotation[],

  // Real quotationRevisions/quotationPurchaseOrders — see
  // PARITY_TRACKER.md #4. Revision 1 seeded for every quotation above,
  // matching production's "every quotation always has Revision 1" rule.
  quotationRevisions: [
    {
      id: "qrev-1",
      quotationId: "qt-1",
      revisionNumber: 1,
      revisionDate: "2026-08-02",
      lineItems: [
        {
          desc: "Bracket Assembly — Line 3 Retrofit",
          hsn: "7326",
          qty: 240,
          unitPrice: 1716.67,
          amount: 412000,
        },
      ],
      total: 412000,
      isCurrent: true,
    },
    {
      id: "qrev-2",
      quotationId: "qt-2",
      revisionNumber: 1,
      revisionDate: "2026-08-05",
      lineItems: [
        {
          desc: "Chassis Panels — Q3 Run",
          hsn: "7326",
          qty: 60,
          unitPrice: 3108.33,
          amount: 186500,
        },
      ],
      total: 186500,
      isCurrent: true,
    },
    {
      id: "qrev-3",
      quotationId: "qt-3",
      revisionNumber: 1,
      revisionDate: "2026-08-20",
      lineItems: [
        {
          desc: "Custom Enclosures",
          hsn: "7326",
          qty: 12,
          unitPrice: 4516.67,
          amount: 54200,
        },
      ],
      total: 54200,
      isCurrent: true,
    },
    {
      id: "qrev-4",
      quotationId: "qt-4",
      revisionNumber: 1,
      revisionDate: "2026-07-28",
      lineItems: [
        {
          desc: "Sheet Metal Cabinets — Batch 4",
          hsn: "7326",
          qty: 500,
          unitPrice: 1782,
          amount: 891000,
        },
      ],
      total: 891000,
      isCurrent: true,
    },
  ] as QuotationRevision[],
  quotationPOs: [] as QuotationPO[],

  projects: [
    {
      id: "proj-1",
      no: "PROJ-2026-013",
      name: "Bracket Assembly — Line 3 Retrofit",
      customerId: "cust-1",
      quotationId: "qt-1",
      qty: 240,
      value: 412000,
      workDescription:
        "Retrofit bracket assembly line 3 — laser cut, weld, powder coat RAL 7016, final assembly.",
      createdAt: "2026-08-04",
    },
    {
      id: "proj-2",
      no: "PROJ-2026-012",
      name: "Chassis Panels — Q3 Run",
      customerId: "cust-2",
      quotationId: "qt-2",
      qty: 60,
      value: 186500,
      workDescription: "Q3 production run of chassis side panels, 2mm CRCA.",
      createdAt: "2026-08-07",
    },
    {
      id: "proj-3",
      no: "PROJ-2026-010",
      name: "Sheet Metal Cabinets — Batch 4",
      customerId: "cust-4",
      quotationId: "qt-4",
      qty: 500,
      value: 891000,
      workDescription:
        "Batch 4 of enclosure cabinets — cut, form, weld, powder coat.",
      createdAt: "2026-07-30",
    },
  ] as Project[],

  stages: [
    {
      id: "st-1a",
      projectId: "proj-1",
      name: "Material Prep",
      order: 1,
      status: "Complete",
      blockedReason: null,
    },
    {
      id: "st-1b",
      projectId: "proj-1",
      name: "Welding",
      order: 2,
      status: "Complete",
      blockedReason: null,
    },
    {
      id: "st-1c",
      projectId: "proj-1",
      name: "Powder Coating",
      order: 3,
      status: "Blocked",
      blockedReason: "Waiting on powder coat material (PO-2026-039)",
    },
    {
      id: "st-1d",
      projectId: "proj-1",
      name: "Final Assembly",
      order: 4,
      status: "NotStarted",
      blockedReason: null,
    },
    {
      id: "st-2a",
      projectId: "proj-2",
      name: "Laser Cutting",
      order: 1,
      status: "Complete",
      blockedReason: null,
    },
    {
      id: "st-2b",
      projectId: "proj-2",
      name: "Welding",
      order: 2,
      status: "InProgress",
      blockedReason: null,
    },
    {
      id: "st-2c",
      projectId: "proj-2",
      name: "Assembly",
      order: 3,
      status: "NotStarted",
      blockedReason: null,
    },
    {
      id: "st-3a",
      projectId: "proj-3",
      name: "Laser Cutting",
      order: 1,
      status: "InProgress",
      blockedReason: null,
    },
    {
      id: "st-3b",
      projectId: "proj-3",
      name: "Bending",
      order: 2,
      status: "NotStarted",
      blockedReason: null,
    },
    {
      id: "st-3c",
      projectId: "proj-3",
      name: "Assembly",
      order: 3,
      status: "NotStarted",
      blockedReason: null,
    },
  ] as ProductionStage[],

  projectProductions: [
    {
      projectId: "proj-1",
      stages: [
        {
          stageName: "Material Prep",
          status: "Completed",
          notes: "",
          quantitySent: 0,
          sentDateTime: "",
          sentToVendorId: "",
          sentToVendorName: "",
          receivedQuantity: 0,
          receivedDateTime: "",
          transactions: [],
        },
        {
          stageName: "Laser Cutting",
          status: "InProgress",
          notes: "Running on CNC 04",
          quantitySent: 40,
          sentDateTime: "2026-08-24T09:00",
          sentToVendorId: "inhouse",
          sentToVendorName: "In-house",
          receivedQuantity: 0,
          receivedDateTime: "",
          requiresMaterialTracking: true,
          transactions: [
            {
              id: "tx-1",
              type: "send",
              quantity: 40,
              dateTime: "2026-08-24T09:00",
              sentToVendorId: "inhouse",
              sentToVendorName: "In-house",
            },
          ],
        },
        {
          stageName: "Powder Coating",
          status: "NotStarted",
          notes: "",
          quantitySent: 0,
          sentDateTime: "",
          sentToVendorId: "",
          sentToVendorName: "",
          receivedQuantity: 0,
          receivedDateTime: "",
          requiresMaterialTracking: true,
          transactions: [],
        },
        {
          stageName: "Assembly",
          status: "NotStarted",
          notes: "",
          quantitySent: 0,
          sentDateTime: "",
          sentToVendorId: "",
          sentToVendorName: "",
          receivedQuantity: 0,
          receivedDateTime: "",
          transactions: [],
        },
      ],
    },
    {
      projectId: "proj-2",
      stages: [
        {
          stageName: "Bending",
          status: "NotStarted",
          notes: "",
          quantitySent: 0,
          sentDateTime: "",
          sentToVendorId: "",
          sentToVendorName: "",
          receivedQuantity: 0,
          receivedDateTime: "",
          transactions: [],
        },
        {
          stageName: "Welding",
          status: "NotStarted",
          notes: "",
          quantitySent: 0,
          sentDateTime: "",
          sentToVendorId: "",
          sentToVendorName: "",
          receivedQuantity: 0,
          receivedDateTime: "",
          transactions: [],
        },
      ],
    },
  ] as ProjectProduction[],

  bomRequisitions: [
    {
      id: "bomreq-1",
      inventoryItemId: "inv-1",
      projectId: "proj-1",
      materialName: "Cold-rolled steel sheet 2mm",
      requiredQty: 500,
      availableQty: 340,
      shortageQty: 160,
      estimatedPrice: 152000,
      status: "Pending",
      createdAt: Date.now() - 4 * 86400000,
      updatedAt: Date.now() - 4 * 86400000,
    },
    {
      id: "bomreq-2",
      inventoryItemId: "inv-2",
      projectId: "proj-3",
      materialName: "Powder coat RAL 7016",
      requiredQty: 60,
      availableQty: 18,
      shortageQty: 42,
      estimatedPrice: 7560,
      status: "Ready to Complete",
      createdAt: Date.now() - 6 * 86400000,
      updatedAt: Date.now() - 2 * 86400000,
    },
    {
      id: "bomreq-3",
      inventoryItemId: "inv-3",
      projectId: "proj-2",
      materialName: "M8 Hex Bolts",
      requiredQty: 1000,
      availableQty: 1000,
      shortageQty: 0,
      estimatedPrice: 5000,
      status: "Completed",
      createdAt: Date.now() - 15 * 86400000,
      updatedAt: Date.now() - 10 * 86400000,
    },
  ] as BomRequisition[],

  purchaseOrders: [
    {
      id: "po-1",
      no: "PO-2026-039",
      vendorId: "vend-2",
      projectId: "proj-1",
      item: "Powder coat — RAL 7016",
      amount: 41800,
      status: "Delayed",
      etaDays: 9,
    },
    {
      id: "po-2",
      no: "PO-2026-041",
      vendorId: "vend-1",
      projectId: "proj-3",
      item: "Cold-rolled steel sheet 2mm",
      amount: 184200,
      status: "PendingApproval",
      etaDays: 3,
    },
    {
      id: "po-3",
      no: "PO-2026-040",
      vendorId: "vend-3",
      projectId: null,
      item: "M6 hex bolts (10,000 units)",
      amount: 22600,
      status: "Confirmed",
      etaDays: 5,
    },
  ] as PurchaseOrder[],

  inventory: [
    {
      id: "inv-1",
      sku: "MAT-CRS-2MM",
      name: "Cold-rolled steel sheet 2mm",
      category: "raw_material",
      qty: 340,
      reserved: 120,
      reorderAt: 400,
      unit: "sheets",
      unitCost: 465,
      lastPurchaseDate: "2026-08-12",
    },
    {
      id: "inv-2",
      sku: "MAT-PWD-7016",
      name: "Powder coat RAL 7016",
      category: "powder_coating_powder",
      qty: 18,
      reserved: 8,
      reorderAt: 40,
      unit: "kg",
      unitCost: 380,
      lastPurchaseDate: "2026-08-05",
    },
    {
      id: "inv-3",
      sku: "MAT-AL-EXT",
      name: "Aluminum extrusion profile",
      category: "raw_material",
      qty: 1250,
      reserved: 300,
      reorderAt: 500,
      unit: "m",
      unitCost: 210,
      lastPurchaseDate: "2026-07-20",
    },
  ] as InventoryItem[],

  qmsIssues: [
    {
      id: "qms-1",
      ncrNo: "NCR-118",
      projectId: "proj-1",
      stageId: "st-1c",
      issue: "Powder coat thickness below spec (batch 4)",
      severity: "high",
      status: "Open",
    },
    {
      id: "qms-2",
      ncrNo: "NCR-117",
      projectId: "proj-2",
      stageId: "st-2b",
      issue: "Weld porosity flagged on 3 units",
      severity: "medium",
      status: "Open",
    },
  ] as QmsIssue[],

  invoices: [
    mkInvoice({
      id: "invc-1",
      no: "INV-2026-091",
      projectId: "proj-1",
      customerId: "cust-1",
      item: "Bracket Assembly — Line 3 Retrofit",
      qty: 240,
      rate: 858.33,
      invoiceDate: "2026-08-15",
      dueDate: "2026-08-25",
      paidAmount: 0,
      status: "Unpaid",
    }),
    mkInvoice({
      id: "invc-2",
      no: "INV-2026-090",
      projectId: "proj-3",
      customerId: "cust-4",
      item: "Sheet Metal Cabinets — Batch 4",
      qty: 500,
      rate: 749.15,
      invoiceDate: "2026-08-25",
      dueDate: "2026-09-11",
      paidAmount: 0,
      status: "Unpaid",
    }),
    mkInvoice({
      id: "invc-3",
      no: "INV-2026-089",
      projectId: "proj-2",
      customerId: "cust-2",
      item: "Chassis Panels — Q3 Run",
      qty: 60,
      rate: 1307.56,
      invoiceDate: "2026-08-01",
      dueDate: "2026-08-15",
      paidAmount: 93200,
      status: "Paid",
    }),
  ] as Invoice[],

  payments: [
    {
      id: "pay-1",
      invoiceId: "invc-3",
      amount: 93200,
      date: "2026-08-14",
      method: "Bank Transfer",
    },
  ] as Payment[],

  machines: [
    {
      id: "mch-1",
      machineCode: "MCH-001",
      name: "Trumpf CNC Laser 04",
      type: "Laser Cutting",
      status: "Operational",
      location: "Bay 1",
      department: "Production",
      hourlyRate: 1200,
      nextServiceDue: "2026-09-11",
    },
    {
      id: "mch-2",
      machineCode: "MCH-002",
      name: "Amada Press Brake 02",
      type: "Bending",
      status: "Operational",
      location: "Bay 2",
      department: "Production",
      hourlyRate: 950,
      nextServiceDue: "2026-09-27",
    },
    {
      id: "mch-3",
      machineCode: "MCH-003",
      name: "Robotic Weld Cell 06",
      type: "Welding",
      status: "Breakdown",
      location: "Bay 3",
      department: "Production",
      hourlyRate: 1500,
      nextServiceDue: "2026-08-28",
    },
  ] as Machine[],

  tools: [
    {
      id: "tool-1",
      toolCode: "TL-001",
      name: "Digital Vernier Caliper",
      category: "Measuring",
      quantity: 3,
      location: "Tool Crib A",
      assignedEmployeeId: "emp-2",
      condition: "Good",
      status: "In Use",
      purchaseDate: "2024-11-10",
      replacementValue: 4500,
      isActive: true,
      createdAt: Date.now() - 200 * 86400000,
      updatedAt: Date.now() - 5 * 86400000,
    },
    {
      id: "tool-2",
      toolCode: "TL-002",
      name: "Deburring Tool Set",
      category: "Finishing",
      quantity: 6,
      location: "Finishing Bay",
      condition: "Fair",
      status: "Available",
      purchaseDate: "2023-06-02",
      replacementValue: 2200,
      isActive: true,
      createdAt: Date.now() - 500 * 86400000,
      updatedAt: Date.now() - 500 * 86400000,
    },
    {
      id: "tool-3",
      toolCode: "TL-003",
      name: "Torque Wrench 20-150Nm",
      category: "Hand Tool",
      quantity: 1,
      location: "Assembly",
      condition: "Poor",
      status: "Under Repair",
      purchaseDate: "2022-01-15",
      replacementValue: 6800,
      notes: "Calibration drifted, sent to vendor for recalibration",
      isActive: true,
      createdAt: Date.now() - 900 * 86400000,
      updatedAt: Date.now() - 10 * 86400000,
    },
  ] as Tool[],
  toolAssignmentHistory: [
    {
      id: "tah-1",
      toolId: "tool-1",
      action: "issued",
      employeeId: "emp-2",
      recordedAt: Date.now() - 5 * 86400000,
    },
  ] as ToolAssignmentHistory[],

  employees: [
    {
      id: "emp-1",
      name: "Arjun Mehta",
      phone: "9876500011",
      role: "production",
      monthlySalary: 42000,
      joiningDate: "2022-03-14",
      userId: "",
      designation: "Production Supervisor",
      bloodGroup: "O+",
      emergencyContactName: "Sunita Mehta",
      emergencyContactRelation: "Spouse",
      emergencyContactPhone: "9876500099",
      employmentType: "Permanent",
    },
    {
      id: "emp-2",
      name: "Kavita Rao",
      phone: "9876500022",
      role: "quality",
      monthlySalary: 38000,
      joiningDate: "2023-01-09",
      userId: "",
      designation: "QC Inspector",
      bloodGroup: "B+",
      employmentType: "Permanent",
    },
    {
      id: "emp-3",
      name: "Deepak Shah",
      phone: "9876500033",
      role: "procurement",
      monthlySalary: 45000,
      joiningDate: "2021-07-01",
      userId: "",
      designation: "Procurement Lead",
      employmentType: "Permanent",
    },
  ] as Employee[],

  dies: [
    {
      id: "die-1",
      dieCode: "DIE-001",
      name: "Progressive Die A14",
      type: "Progressive",
      purpose: "Bracket blanking + forming",
      compatibleMachineId: "mch-1",
      originalProjectId: "proj-1",
      location: "Press Bay 2",
      status: "Available",
      condition: "Good",
      linkedDrawingIds: ["dwg-1"],
      isActive: true,
      createdAt: Date.now() - 400 * 86400000,
      updatedAt: Date.now() - 400 * 86400000,
    },
    {
      id: "die-2",
      dieCode: "DIE-002",
      name: "Cabinet Panel Draw Die",
      type: "Draw",
      purpose: "Deep-draw cabinet panels",
      location: "Press Bay 1",
      status: "In Use",
      condition: "Fair",
      linkedDrawingIds: ["dwg-2"],
      isActive: true,
      createdAt: Date.now() - 120 * 86400000,
      updatedAt: Date.now() - 3 * 86400000,
    },
  ] as Die[],

  drawings: [
    {
      id: "dwg-1",
      fileName: "bracket-assembly-rev3.dxf",
      numPages: 1,
      ownerType: "project",
      ownerId: "proj-1",
      category: "Standard Drawing",
      version: 3,
      status: "Approved",
      uploadedBy: "admin",
      uploadedAt: Date.now() - 40 * 86400000,
      tags: ["bracket", "assembly"],
      projectId: "proj-1",
    },
    {
      id: "dwg-2",
      fileName: "cabinet-batch4-rev1.dxf",
      numPages: 1,
      ownerType: "project",
      ownerId: "proj-3",
      category: "Standard Drawing",
      version: 1,
      status: "Draft",
      uploadedBy: "admin",
      uploadedAt: Date.now() - 10 * 86400000,
      tags: ["cabinet"],
      projectId: "proj-3",
    },
    {
      id: "dwg-3",
      fileName: "progressive-die-a14.dxf",
      numPages: 2,
      ownerType: "library",
      category: "Die Drawing",
      version: 2,
      status: "Approved",
      uploadedBy: "admin",
      uploadedAt: Date.now() - 200 * 86400000,
      tags: ["die", "tooling"],
      projectId: "",
    },
  ] as Drawing[],

  drawingLinks: [
    {
      id: "dwl-1",
      drawingId: "dwg-3",
      linkedType: "die",
      linkedId: "die-1",
      createdAt: Date.now() - 200 * 86400000,
    },
  ] as DrawingLink[],

  deliveryChallans: [
    {
      id: "dc-1",
      dcNo: "DC-2026-021",
      customerId: "cust-2",
      projectEntries: [{ projectId: "proj-2", dispatchQty: 40 }],
      dispatchMethod: "Company Vehicle",
      vehicleNo: "MH-12-AB-3345",
      driverName: "Suresh Patil",
      dispatchDate: "2026-08-22",
      receiverName: "Warehouse Team",
      status: "Dispatched",
      createdAt: Date.now() - 8 * 86400000,
      deliveryAddress: { type: "customer", value: "" },
      no: "DC-2026-021",
      projectId: "proj-2",
      qty: 40,
      dispatchedAt: "2026-08-22",
    },
    {
      id: "dc-2",
      dcNo: "DC-2026-020",
      customerId: "cust-4",
      projectEntries: [{ projectId: "proj-3", dispatchQty: 120 }],
      dispatchMethod: "Transport / Logistics",
      transportCompany: "VRL Logistics",
      lrNumber: "LR-88213",
      dispatchDate: "2026-08-18",
      receiverName: "Site Store",
      status: "Delivered",
      createdAt: Date.now() - 12 * 86400000,
      deliveryAddress: { type: "customer", value: "" },
      no: "DC-2026-020",
      projectId: "proj-3",
      qty: 120,
      dispatchedAt: "2026-08-18",
    },
  ] as DeliveryChallan[],

  payables: [
    {
      id: "pay-v-1",
      vendorId: "vend-1",
      paymentType: "Material",
      projectId: "proj-1",
      notes: "",
      amount: 184200,
      paidAmount: 0,
      dueDate: "2026-09-05",
    },
    {
      id: "pay-v-2",
      vendorId: "vend-3",
      paymentType: "Outsourcing",
      projectId: null,
      notes: "",
      amount: 22600,
      paidAmount: 22600,
      dueDate: "2026-08-20",
    },
  ] as Payable[],
  payablePayments: [] as PayablePayment[],

  companyPOs: [
    {
      id: "cpo-1",
      cpoNumber: "CPO-001",
      vendorId: "vend-1",
      vendorName: "SteelSource India",
      vendorAddress: "Plot 7, Taloja MIDC, Navi Mumbai, MH 410208",
      vendorGst: "27SSIND5511F1Z3",
      vendorContact: "+91 98200 55511",
      items: [
        {
          id: "cpo-1-item-1",
          description: "Cold-rolled steel sheet 2mm",
          quantity: 500,
          unit: "sheets",
          rate: 950,
          amount: 475000,
        },
      ],
      deliveryAddress: "FabFlow Works, MIDC Phase 2, Pune, MH 411019",
      expectedDeliveryDate: "2026-09-05",
      status: "Sent",
      gstPercent: 18,
      subtotal: 475000,
      gstAmount: 85500,
      grandTotal: 560500,
      createdAt: Date.now() - 6 * 86400000,
    },
    {
      id: "cpo-2",
      cpoNumber: "CPO-002",
      vendorId: "vend-2",
      vendorName: "Coatline Chemicals",
      vendorAddress: "Sector 58, Faridabad, HR 121004",
      vendorGst: "06COATL6622G1Z8",
      vendorContact: "+91 90210 66622",
      items: [
        {
          id: "cpo-2-item-1",
          description: "Powder coat — RAL 7016",
          quantity: 200,
          unit: "kg",
          rate: 209,
          amount: 41800,
        },
      ],
      status: "Draft",
      gstPercent: 18,
      subtotal: 41800,
      gstAmount: 7524,
      grandTotal: 49324,
      createdAt: Date.now() - 2 * 86400000,
    },
  ] as CompanyPO[],

  pettyExpenses: [
    {
      id: "pe-1",
      date: "2026-08-27",
      employeeId: "emp-1",
      amount: 1450,
      expenseType: "Courier / Delivery",
      expenseMode: "Company Expense",
      notes: "Local courier — drawing prints",
      createdAt: "2026-08-27",
    },
    {
      id: "pe-2",
      date: "2026-08-25",
      employeeId: "emp-3",
      amount: 3200,
      expenseType: "Tools",
      expenseMode: "Company Expense",
      floatId: "flt-1",
      notes: "Grinding discs, gloves",
      createdAt: "2026-08-25",
    },
  ] as PettyExpense[],

  expenseFloats: [
    {
      id: "flt-1",
      floatNo: "FLT-2026-001",
      employeeId: "emp-3",
      issuedDate: "2026-08-20",
      issuedAmount: 10000,
      spentAmount: 3200,
      returnedAmount: 0,
      balanceAmount: 6800,
      status: "Partially Settled",
      purpose: "Tool crib restock",
      issuedBy: "admin",
      createdAt: Date.now() - 9 * 86400000,
    },
  ] as ExpenseFloat[],

  ledgerEntries: [
    {
      id: "led-1",
      date: "2026-08-14",
      account: "Bank — Bank Transfer",
      debit: 93200,
      credit: 0,
      ref: "INV-2026-089",
    },
    {
      id: "led-2",
      date: "2026-08-03",
      account: "Sales — Meridian Fab Co.",
      debit: 0,
      credit: 412000,
      ref: "PROJ-2026-013",
    },
  ] as LedgerEntry[],

  billableServices: [
    {
      id: "bsv-1",
      name: "Laser Cutting — CNC 04",
      machineId: "mch-1",
      chargingMethod: "hour",
      unitLabel: "hrs",
      isActive: true,
      createdAt: Date.now() - 200 * 86400000,
      updatedAt: Date.now() - 200 * 86400000,
    },
    {
      id: "bsv-2",
      name: "Powder Coating",
      chargingMethod: "kg",
      unitLabel: "kg",
      isActive: true,
      createdAt: Date.now() - 150 * 86400000,
      updatedAt: Date.now() - 150 * 86400000,
    },
  ] as BillableService[],
  machineServiceRates: [
    {
      id: "msr-1",
      billableServiceId: "bsv-1",
      rate: 1200,
      effectiveFrom: Date.now() - 200 * 86400000,
      createdAt: Date.now() - 200 * 86400000,
    },
    {
      id: "msr-2",
      billableServiceId: "bsv-2",
      rate: 180,
      effectiveFrom: Date.now() - 150 * 86400000,
      createdAt: Date.now() - 150 * 86400000,
    },
  ] as MachineServiceRate[],
  machineServiceUsage: [
    {
      id: "msu-1",
      projectId: "proj-1",
      billableServiceId: "bsv-1",
      usageDate: "2026-08-22",
      quantity: 6,
      unit: "hrs",
      rateApplied: 1200,
      revenueAmount: 7200,
      createdAt: Date.now() - 8 * 86400000,
      updatedAt: Date.now() - 8 * 86400000,
    },
    {
      id: "msu-2",
      projectId: "proj-3",
      billableServiceId: "bsv-2",
      usageDate: "2026-08-19",
      quantity: 230,
      unit: "kg",
      rateApplied: 180,
      revenueAmount: 41400,
      createdAt: Date.now() - 11 * 86400000,
      updatedAt: Date.now() - 11 * 86400000,
    },
  ] as MachineServiceUsage[],

  scrapRecords: [
    {
      id: "scrap-1",
      projectId: "proj-1",
      stage: "Laser Cutting",
      materialType: "MS offcuts",
      unit: "kg",
      generatedQty: 38,
      reusableQty: 10,
      soldQty: 0,
      disposedQty: 0,
      scrapValue: 950,
      status: "In Stock",
      recordedBy: "admin",
      createdAt: Date.now() - 11 * 86400000,
    },
    {
      id: "scrap-2",
      projectId: "proj-3",
      stage: "Bending",
      materialType: "Aluminum trim",
      unit: "kg",
      generatedQty: 12,
      reusableQty: 0,
      soldQty: 12,
      disposedQty: 0,
      scrapValue: 480,
      status: "Sold",
      recordedBy: "admin",
      createdAt: Date.now() - 9 * 86400000,
    },
  ] as ScrapRecord[],

  qmsCharacteristics: [
    {
      id: "qc-1",
      name: "Weld penetration depth",
      process: "Welding",
      criticality: "Safety",
    },
    {
      id: "qc-2",
      name: "Powder coat thickness",
      process: "Powder Coating",
      criticality: "Functional",
    },
    {
      id: "qc-3",
      name: "Surface finish",
      process: "Finishing",
      criticality: "Cosmetic",
    },
  ] as QmsCharacteristic[],

  qmsInspections: [
    {
      id: "insp-1",
      projectId: "proj-1",
      characteristic: "Powder coat thickness",
      inspector: "Kavita Rao",
      result: "Fail",
      date: "2026-08-26",
    },
    {
      id: "insp-2",
      projectId: "proj-2",
      characteristic: "Weld penetration depth",
      inspector: "Kavita Rao",
      result: "Pending",
      date: "2026-08-29",
    },
    {
      id: "insp-3",
      projectId: "proj-3",
      characteristic: "Surface finish",
      inspector: "Kavita Rao",
      result: "Pass",
      date: "2026-08-24",
    },
  ] as QmsInspection[],

  manufacturingProcesses: [
    { id: "proc-1", name: "Laser Cutting", sequence: 1, active: true },
    { id: "proc-2", name: "Bending", sequence: 2, active: true },
    { id: "proc-3", name: "Welding", sequence: 3, active: true },
    { id: "proc-4", name: "Powder Coating", sequence: 4, active: true },
    { id: "proc-5", name: "Assembly", sequence: 5, active: true },
  ] as ManufacturingProcess[],

  qualityCharacteristics: [
    {
      id: "qc-1",
      name: "Powder Coat Thickness",
      description: "Dry film thickness of the applied powder coat",
      category: "Dimensional",
      processId: "proc-4",
      criticality: "CustomerCritical",
      inspectionMethodType: "Numeric",
      acceptanceCriteria: "60-120 microns",
      toleranceNominal: 90,
      tolerancePlus: 30,
      toleranceMinus: 30,
      unit: "microns",
      measuringInstrument: "Elcometer 456",
      evidenceRequired: true,
      photoRequired: false,
      tags: ["coating", "thickness"],
      status: "Active",
      createdAt: Date.now() - 180 * 86400000,
      updatedAt: Date.now() - 180 * 86400000,
    },
    {
      id: "qc-2",
      name: "Weld Penetration Depth",
      description: "Full-penetration weld depth at structural joints",
      category: "Functional",
      processId: "proc-3",
      criticality: "SafetyCritical",
      inspectionMethodType: "Numeric",
      acceptanceCriteria: "Minimum 3mm penetration",
      toleranceNominal: 3.5,
      tolerancePlus: 1,
      toleranceMinus: 0,
      unit: "mm",
      measuringInstrument: "Weld gauge",
      standardReference: "AWS D1.1",
      evidenceRequired: true,
      photoRequired: true,
      tags: ["weld", "structural"],
      status: "Active",
      createdAt: Date.now() - 200 * 86400000,
      updatedAt: Date.now() - 200 * 86400000,
    },
    {
      id: "qc-3",
      name: "Surface Finish",
      description: "Visual surface finish, no visible scratches or dents",
      category: "Visual",
      processId: "proc-1",
      criticality: "Cosmetic",
      inspectionMethodType: "PassFail",
      acceptanceCriteria: "No visible defects under standard lighting",
      evidenceRequired: false,
      photoRequired: false,
      tags: ["visual", "finish"],
      status: "Active",
      createdAt: Date.now() - 90 * 86400000,
      updatedAt: Date.now() - 90 * 86400000,
    },
  ] as QualityCharacteristic[],

  inspectionSheets: [
    {
      id: "ins-1",
      projectId: "proj-1",
      inspectionNumber: "INS-2026-001",
      revision: 1,
      mode: "Hybrid",
      status: "InProgress",
      customerId: "cust-1",
      generatedAt: Date.now() - 6 * 86400000,
      generatedBy: "admin",
    },
    {
      id: "ins-2",
      projectId: "proj-3",
      inspectionNumber: "INS-2026-002",
      revision: 1,
      mode: "Digital",
      status: "Approved",
      customerId: "cust-4",
      generatedAt: Date.now() - 14 * 86400000,
      generatedBy: "admin",
    },
  ] as InspectionSheet[],

  projectQmsInspections: [
    {
      id: "pqi-1",
      projectId: "proj-1",
      processId: "proc-4",
      processName: "Powder Coating",
      mode: "Digital",
      status: "Failed",
      createdAt: Date.now() - 5 * 86400000,
      updatedAt: Date.now() - 1 * 86400000,
    },
  ] as ProjectQmsInspection[],

  projectQmsInspectionCharacteristics: [
    {
      id: "pqic-1",
      projectQmsInspectionId: "pqi-1",
      characteristicId: "qc-1",
      nameSnapshot: "Powder Coat Thickness",
      sequence: 1,
      result: "Fail",
      measuredValue: "45",
      failureReason: "Below minimum tolerance",
    },
  ] as ProjectQmsInspectionCharacteristic[],

  settings: {
    companyName: "FabFlow Manufacturing Pvt. Ltd.",
    companyAddress: "Plot 42, MIDC Industrial Area, Pune, Maharashtra 411019",
    companyGstin: "27AABCD1234E1ZX",
    companyStateName: "Maharashtra",
    companyStateCode: "27",
    companyPhone: "+91 98765 43210",
    companyEmail: "accounts@fabflow.example",
    companyWebsite: "www.fabflow.example",
    companyLogo: "",
    bankName: "State Bank of India",
    accountName: "FabFlow Manufacturing Pvt. Ltd.",
    accountNumber: "38291047562",
    ifscCode: "SBIN0001234",
    bankBranch: "Pune MIDC Branch",
    companyTerms:
      "1. Payment due within 30 days of invoice.\n2. Prices exclude GST unless stated.",
    companyDeclaration:
      "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.",
    quotationTerms:
      "1. Payment: 50% advance, balance on dispatch.\n2. Validity: 15 days from quotation date.",
    companyPOTerms:
      "1. Delivery within agreed timeline.\n2. Material to match approved drawing/spec.",
    twilioAccountSid: "",
    twilioAuthToken: "",
    twilioFromNumber: "",
    gmailSenderEmail: "",
    gmailAppPassword: "",
  } as AppSettings,

  orgUsers: [
    {
      id: "user-1",
      username: "admin",
      role: "admin",
      isActive: true,
      mustChangePassword: false,
      overrides: {},
      createdAt: Date.now() - 400 * 86400000,
    },
    {
      id: "user-2",
      username: "priya.sales",
      role: "sales",
      isActive: true,
      mustChangePassword: false,
      overrides: {},
      createdAt: Date.now() - 200 * 86400000,
    },
    {
      id: "user-3",
      username: "arjun.production",
      role: "production",
      isActive: true,
      // Disclosed override — this specific user has also been granted
      // the sheet-approve action beyond their role's real default, the
      // exact override pattern Settings -> Edit User exercises live.
      overrides: { "inspection_sheets.approve": true },
      mustChangePassword: false,
      createdAt: Date.now() - 150 * 86400000,
    },
    {
      id: "user-4",
      username: "kavita.qc",
      role: "quality",
      isActive: false,
      mustChangePassword: false,
      overrides: {},
      createdAt: Date.now() - 90 * 86400000,
    },
  ] as OrgUser[],

  securityAuditLog: [
    {
      id: "audit-1",
      eventType: "user_created",
      actorUsername: "admin",
      targetUsername: "kavita.qc",
      metadata: { role: "quality" },
      createdAt: Date.now() - 90 * 86400000,
    },
    {
      id: "audit-2",
      eventType: "user_permissions_changed",
      actorUsername: "admin",
      targetUsername: "arjun.production",
      metadata: { granted: "inspection_sheets.approve" },
      createdAt: Date.now() - 60 * 86400000,
    },
    {
      id: "audit-3",
      eventType: "user_deactivated",
      actorUsername: "admin",
      targetUsername: "kavita.qc",
      metadata: {},
      createdAt: Date.now() - 10 * 86400000,
    },
    {
      id: "audit-4",
      eventType: "password_changed",
      actorUsername: "priya.sales",
      metadata: {},
      createdAt: Date.now() - 3 * 86400000,
    },
  ] as SecurityAuditLogEntry[],
};

export type DataState = typeof initialData;
