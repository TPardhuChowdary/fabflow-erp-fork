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
  // Phase 54 (Group 2, roadmap Phase 15) — reusable saved delivery
  // addresses, same jsonb-array convention as additionalDetails/emails
  // above. See database/phase-54.
  deliveryAddresses?: Array<{ id: string; label: string; address: string }>;
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

// Job Cards feature (see chat) — this JobCard shape replaces a dead
// legacy type of the same name (zero references anywhere in store.ts or
// any page — a leftover from the pre-Supabase ICP-canister prototype).
// Real employee-assigned, time-based work assignment/execution,
// complementing (not replacing) ProjectProductionStage.
export type JobCardStatus =
  | "NotStarted"
  | "InProgress"
  | "Completed"
  | "OnHold";

// Employee Job Card Mobile Workflow — matches job_cards.reject_root_cause's
// CHECK constraint exactly (database/phase-58). Recorded at the point a
// rejection/rework is entered so a later performance-calculation phase can
// exclude non-employee-caused failures - this phase only records the
// cause, it does not score anyone against it.
export type RejectRootCause =
  | "employee_workmanship"
  | "material"
  | "machine_equipment"
  | "design_specification"
  | "previous_process"
  | "supervisor_instruction"
  | "customer_change"
  | "other";

// Matches job_card_exceptions.reason_type's CHECK constraint exactly
// (database/phase-58).
export type JobCardExceptionReason =
  | "machine_breakdown"
  | "material_unavailable"
  | "incorrect_material"
  | "design_specification_change"
  | "supervisor_delay"
  | "customer_change"
  | "technical_difficulty"
  | "safety_delay"
  | "other";

export type JobCardExceptionStatus = "pending" | "approved" | "rejected";

// An exception is evidence explaining why assigned work wasn't completed
// - never itself a performance penalty. Reporting (insert) and approving
// (update) are deliberately different RLS actions (job_cards.edit vs.
// job_cards.approve, see database/phase-58) so a worker can't silently
// self-approve their own exception.
export interface JobCardException {
  id: string;
  jobCardId: string;
  reasonType: JobCardExceptionReason;
  description?: string;
  status: JobCardExceptionStatus;
  reportedBy?: string;
  reportedAt: number;
  approvedBy?: string;
  approvedAt?: number;
  approvalNotes?: string;
  createdAt: number;
}

export interface JobCard {
  id: string;
  jobNo: string;
  projectId: string;
  /** Real FK to Employee. Optional only because the employee may later be
   * deleted (ON DELETE SET NULL) — employeeName is snapshotted below so
   * the card still displays correctly in that case. */
  employeeId?: string;
  employeeName: string;
  jobDescription: string;
  operationType: string;
  /** Real FK to ProjectProductionStage. Optional — a Job Card is not
   * required to belong to a stage (ad-hoc work stays fully supported).
   * ON DELETE SET NULL: deleting a stage never deletes its Job Cards'
   * historical records (database/20260906060000). Enforced server-side
   * to belong to the same project and organization as this Job Card —
   * never trust a client-supplied value alone. Editing this field (or
   * actualCompletedQty/rejectedQty/reworkQty) on an already-Completed,
   * stage-linked card requires job_cards.approve and is audited via the
   * existing projects.activity_log mechanism — see enforce_job_card_
   * completed_quantity_approval in that same migration. */
  stageId?: string;
  standardTimePerUnitMinutes: number;
  allocatedTimeMinutes: number;
  /** Server-computed (Postgres GENERATED column): floor(allocatedTimeMinutes
   * / standardTimePerUnitMinutes). Never sent by the client — always
   * read back from the server so it can never drift from its two real
   * inputs. */
  expectedQuantity: number;
  actualCompletedQty: number;
  rejectedQty: number;
  reworkQty: number;
  /** Set when rejectedQty and/or reworkQty > 0 - see RejectRootCause. */
  rejectRootCause?: RejectRootCause;
  startTime?: string;
  endTime?: string;
  /** Server-computed (Postgres GENERATED column) from startTime/endTime -
   * includes paused time, unchanged by the pause/resume timer feature.
   * Still the field EmployeeDetail.tsx's performance metrics use. */
  actualTimeSpentMinutes?: number;
  /** Pause-aware accumulated working time, in seconds, from all CLOSED
   * run segments (excludes the currently-open one). Only ever written by
   * the enforce_job_card_timer_transition trigger (database/
   * 20260906050000) - never sent by the client. Live "current active
   * duration" = activeSeconds + (now() - currentRunStartedAt) while
   * status is InProgress, computed client-side, never persisted per-tick. */
  activeSeconds: number;
  /** When the currently-open run segment began. Set on Start/Resume,
   * cleared on Pause/Complete. Undefined/absent whenever there is no
   * open run (NotStarted, OnHold, or Completed). */
  currentRunStartedAt?: string;
  status: JobCardStatus;
  notes?: string;
  createdAt: number;
  updatedAt: number;
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

// Invoice multi-PO feature (see chat) — a real one-to-many child row,
// mirroring public.invoice_purchase_orders (Phase 48). Not a comma-
// separated string on Invoice itself.
export interface InvoicePurchaseOrder {
  id: string;
  poNumber: string;
  poDate?: string;
  /** Set when this row references a real QuotationPurchaseOrder record
   * (the actual Customer PO entity) rather than a manually-typed number —
   * undefined for a free-text entry, exactly like MaterialPurchase's
   * vendorId is undefined for a free-text supplierName. */
  quotationPurchaseOrderId?: string;
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
  /** Legacy single-PO fields (Phase 9) — kept for backward compatibility,
   * no longer written to by the UI. purchaseOrders below is the real
   * one-to-many list (Phase 48); every existing invoice's single
   * poNumber/poDate was backfilled into it as one row. */
  poNumber?: string;
  poDate?: string;
  /** Real one-to-many Invoice → Customer PO relationship (Phase 48,
   * invoice_purchase_orders). Each entry optionally references a real
   * QuotationPurchaseOrder record via quotationPurchaseOrderId when one
   * exists; poNumber/poDate are always present as a display snapshot. */
  purchaseOrders?: InvoicePurchaseOrder[];
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
  /** The invoice's E-Way Bill, when one has been produced and attached.
   * Same shape/tradeoff as CompanyPO.file (PurchaseAttachment: a single
   * optional attachment, `ref` a base64 data URI) — reused as-is rather
   * than inventing new attachment plumbing. Presence of this field (not a
   * separate boolean/status) is the sole source of truth for "E-Way Bill
   * completed": undefined = not attached, set = attached. */
  ewayBillDocument?: PurchaseAttachment;
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

export type Page =
  | "dashboard"
  | "customers"
  | "quotations"
  | "purchase-orders"
  | "production"
  | "job-cards"
  | "my-jobs"
  | "material-requisitions"
  | "delivery-challans"
  | "invoices"
  | "eway-bills"
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
  | "tool-detail"
  | "dies"
  | "die-detail"
  | "export-engine"
  | "scrap"
  | "qms-dashboard"
  | "qms-characteristics"
  | "qms-inspection-sheets"
  | "qms-my-inspections"
  | "drawing-editor"
  | "ledger"
  | "machine-revenue"
  | "agent"
  | "email-center"
  | "company-documents"
  | "tenders"
  | "tender-detail"
  | "design-lab"
  | "design-lab-v2"
  | "style-lab"
  | "design-archive"
  | "ux-lab"
  | "ux-final"
  | "ux-decision-lab"
  | "ux-visual-lab"
  | "ux-implementation-lab";

// ── Email Integration Types (see chat, database/phase-50) ──────────────
// Mirrors the live email_accounts/email_messages/email_attachments schema.
// `encrypted_credentials` never appears here — emailAccountsApi.ts's own
// explicit column list never selects it, so it can never even accidentally
// flow into one of these objects.

export type EmailProvider = "google" | "microsoft" | "imap_smtp";
export type EmailConnectionMethod = "oauth" | "imap_smtp";
export type EmailAccountStatus =
  | "connected"
  | "auth_required"
  | "sync_failed"
  | "disconnected";
export type EmailEncryption = "ssl" | "starttls" | "none";

export interface EmailAccount {
  id: string;
  emailAddress: string;
  displayName?: string;
  provider: EmailProvider;
  connectionMethod: EmailConnectionMethod;
  imapHost?: string;
  imapPort?: number;
  imapEncryption?: EmailEncryption;
  smtpHost?: string;
  smtpPort?: number;
  smtpEncryption?: EmailEncryption;
  status: EmailAccountStatus;
  statusDetail?: string;
  lastSyncAt?: number;
  syncWindowDays: number;
  isDefaultSender: boolean;
  createdAt: number;
}

export interface EmailMessage {
  id: string;
  emailAccountId: string;
  providerMessageId: string;
  providerThreadId?: string;
  /** Phase 5 Email Operations — the real RFC822 Message-ID header, the
   * only value a reply's In-Reply-To/References may correctly reference.
   * Undefined for messages synced before this was captured, or from an
   * adapter that doesn't (yet) report it — never fabricate a reply
   * target when this is absent. */
  providerInternetMessageId?: string;
  fromAddress: string;
  fromName?: string;
  toAddresses: string[];
  ccAddresses: string[];
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  snippet?: string;
  sentAt?: number;
  isRead: boolean;
  folder: string;
  hasAttachments: boolean;
}

export type EmailAttachmentProcessingStatus =
  | "pending"
  | "stored"
  | "failed"
  | "skipped_too_large"
  | "skipped_unsupported_type";

export interface EmailAttachment {
  id: string;
  emailMessageId: string;
  filename: string;
  mimeType?: string;
  sizeBytes?: number;
  storagePath: string;
  processingStatus: EmailAttachmentProcessingStatus;
}

// Phase 5 Email Operations (database/20260907010000_email_outbound_sends.sql
// — written, NOT applied). A reference into an EXISTING email_attachments
// row, never a raw Storage path — the send path re-verifies attachmentId
// against that table (organization-scoped) and reads bytes itself; the
// other fields here are a denormalized snapshot for confirmation display
// only. See emailAdapter.ts's SendMessageInput comment for why no raw
// path is ever accepted.
export interface EmailOutboundAttachmentRef {
  type: "email_attachment";
  attachmentId: string;
  filename: string;
  mimeType?: string;
  sizeBytes?: number;
}

export type EmailOutboundSendStatus =
  | "draft"
  | "confirmed"
  | "sending"
  | "sent"
  | "failed_before_provider"
  | "provider_rejected"
  | "unknown";

export interface EmailOutboundSend {
  id: string;
  emailAccountId: string;
  kind: "reply" | "new";
  replyToMessageId?: string;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  attachments: EmailOutboundAttachmentRef[];
  status: EmailOutboundSendStatus;
  idempotencyKey?: string;
  providerMessageId?: string;
  lastError?: string;
  confirmedAt?: number;
  sendingAt?: number;
  sentAt?: number;
  createdAt: number;
  updatedAt: number;
}

// ── Email Operational Alerts (Phase 7) ──────────────────────────
// Detection/notification only — see database/20260907030000. Nothing
// that reads or writes this type may perform, or result from, an
// autonomous ERP mutation, an outbound email, or a permission bypass.

export type EmailAlertIssueType =
  | "delivery_delay"
  | "quantity_change"
  | "quality_rejection"
  | "po_change"
  | "invoice_po_mismatch"
  | "price_discrepancy"
  | "correction_revision"
  | "follow_up_reminder"
  | "duplicate"
  | "unanswered"
  | "ambiguous_match"
  | "other";

export type EmailAlertSeverity = "critical" | "high" | "medium" | "low";

// Same four-way scale as Phase 6's MATCHING confidence taxonomy
// (agent/llm/orchestrator.ts) — never a numeric score.
export type EmailAlertConfidence =
  | "high_confidence"
  | "possible_match"
  | "ambiguous"
  | "no_match";

export type EmailAlertStatus = "new" | "acknowledged" | "resolved";

export interface EmailAlertMatchedRecord {
  type: string;
  id: string;
  label: string;
  confidence: EmailAlertConfidence;
}

export interface EmailOperationalAlert {
  id: string;
  emailMessageId: string;
  emailAccountId: string;
  issueType: EmailAlertIssueType;
  severity: EmailAlertSeverity;
  confidence: EmailAlertConfidence;
  summary: string;
  matchedRecords: EmailAlertMatchedRecord[];
  details: Record<string, unknown>;
  recommendedAction?: string;
  status: EmailAlertStatus;
  acknowledgedAt?: number;
  resolvedAt?: number;
  createdAt: number;
  updatedAt: number;
}

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
  | "deadline_updated"
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
  // Phase 52 (Group 2, roadmap Phase 10) — lifecycle dates. Each is a real
  // business event, set only by an explicit user action, never derived
  // automatically. createdAt (above) already covers "Created Date" - not
  // duplicated here. All YYYY-MM-DD strings, like every other date field
  // in this codebase (poDate, purchaseDate, etc.).
  plannedStartDate?: string;
  // Separate from plannedStartDate/quotation/design work - only set when
  // production genuinely begins.
  actualProductionStartDate?: string;
  targetCompletionDate?: string;
  // What was promised to the customer - distinct from targetCompletionDate,
  // which is the internal working target.
  customerCommittedDeliveryDate?: string;
  actualCompletionDate?: string;
  // Phase 57 (Group 2, Master Monster Prompt) — what kind of engagement
  // this project actually is, independent of lifecycleStage below. Not
  // the same field as projectType above (that's the existing repeat-
  // order feature) - a separate, new concept.
  workType?:
    | "full_manufacturing"
    | "sample"
    | "prototype"
    | "trial"
    | "production"
    | "service"
    | "partial_manufacturing"
    | "subcontract"
    | "other";
  // Only meaningful for sample/prototype-style work moving toward
  // production - left unset for ordinary production projects. Moving a
  // project through these is an update to this same field, never a new
  // project record.
  lifecycleStage?: "sample" | "production_ready" | "production" | "completed";
  materialOwnership?: "company" | "customer" | "mixed";
  // Quantity breakdown, alongside the existing totalQty (which remains
  // the headline/ordered quantity every existing screen already reads).
  orderedQuantity?: number;
  plannedQuantity?: number;
  // Customer-supplied goods/material entering FabFlow for processing -
  // e.g. 100 customer-owned chairs sent in for powder coating, or 10kg
  // of customer-owned powder. Deliberately separate from inventoryItems/
  // inventoryUsages, which stay scoped to company-owned stock.
  receivedQuantity?: number;
  producedQuantity?: number;
  acceptedQuantity?: number;
  rejectedQuantity?: number;
  reworkQuantity?: number;
  returnedQuantity?: number;
  remainingQuantity?: number;
  // Always max(producedQuantity - orderedQuantity, 0), computed by
  // Postgres (a GENERATED column) - read-only here, never sent on write.
  overproductionQuantity?: number;
}

export interface DesignFile {
  id: string;
  projectId: string;
  fileName: string;
  fileType: string;
  fileData: string;
  uploadedAt: number;
}

// Phase 11 (Group 2) — quantity/rate costing basis. "fixed" is the
// original behavior (amount entered directly); every other basis derives
// amount = quantity * rate, computed client-side and still persisted in
// `amount` for backward compatibility with every existing summing site.
export type CostBasis =
  | "fixed"
  | "per_piece"
  | "per_kg"
  | "per_hour"
  | "per_meter"
  | "per_unit";

export interface CustomCostEntry {
  id: string;
  name: string;
  amount: number;
  category: "Material" | "Process" | "Machine" | "Labour" | "Misc";
  // Undefined basis (or "fixed") == legacy behavior, amount entered
  // directly. Any other basis means amount was derived from quantity*rate
  // — quantity/rate are kept alongside amount so the line can be edited
  // later without losing how it was built.
  basis?: CostBasis;
  quantity?: number;
  rate?: number;
  // Set only when category is "Machine" and the rate was sourced from
  // that machine's own hourlyRate (Machinery.tsx) — lets the UI show
  // which machine a line came from without a new lookup table.
  machineId?: string;
  // Set only when category is "Labour" — same purpose for Employees.
  employeeId?: string;
}

export interface ManualAdjustment {
  id: string;
  name: string;
  amount: number;
  type: "Add Cost" | "Reduce Cost";
}

// Internal Costing line items (Master ERP Architecture audit, Phase 1) —
// repeatable rows per category, same amount = quantity * rate convention
// CustomCostEntry already established above. Each category is its own
// array rather than one generic shape (like CustomCostEntry) because the
// audit specifically asked for category-appropriate fields (material +
// size for Raw Materials, item + specification for Hardware, a bare
// process name for Manufacturing/Finishing) rather than one-size-fits-all
// fields most rows would leave blank.
export interface RawMaterialItem {
  id: string;
  material: string;
  size?: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface HardwareItem {
  id: string;
  item: string;
  specification?: string;
  quantity: number;
  rate: number;
  amount: number;
}

// The legacy single-number Internal Costing fields a ManufacturingItem row
// can itemize. manufacturing_items is the one shared/generic jsonb array
// for all of them (see ManufacturingItem.category below) rather than a
// separate array per category — extending the existing jsonb shape with
// one more key needed no migration, since Postgres jsonb enforces no
// column-level shape.
export type ManufacturingCostCategory =
  | "cncCost"
  | "assemblyCost"
  | "packingCost"
  | "labourCost"
  | "machineCost"
  | "outsourceCost"
  | "consumablesCost"
  | "electricityCost"
  | "scrapLossCost"
  | "transportCost";

export interface ManufacturingItem {
  id: string;
  /** Which of the 10 ManufacturingCostCategory fields this row itemizes.
   * Optional for backward compatibility: rows saved before this field
   * existed have no category — callers treat a missing category as
   * "machineCost", the one category this array exclusively held before. */
  category?: ManufacturingCostCategory;
  process: string;
  /** Added alongside category — matches the Hardware/Raw Material rows'
   * existing two-label-field shape (e.g. item+specification). */
  specification?: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface FinishingItem {
  id: string;
  process: string;
  quantity: number;
  rate: number;
  amount: number;
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
  // Line items (Phase 1 of the Master ERP Architecture implementation) —
  // additive alongside the legacy single-number *Cost fields above,
  // which stay untouched for existing costings. See
  // supabase/migrations/20260913090000_internal_costing_line_items.sql.
  rawMaterials?: RawMaterialItem[];
  hardwareItems?: HardwareItem[];
  manufacturingItems?: ManufacturingItem[];
  finishingItems?: FinishingItem[];
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
  // Monster-1 — the real backing row (public.inventory_purchases) is
  // resolved-or-created by material_type name via record_material_purchase();
  // carrying its id through lets edit/delete reuse the already-existing
  // inventoryPurchasesApi.ts functions instead of duplicating them.
  inventoryItemId?: string;
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
  /** Set only for a stage-to-stage material transfer (database/
   * 20260906060000): the upstream ProjectProductionStage this quantity
   * came from, instead of a vendor. Undefined for every ordinary
   * external/vendor send or receive — those keep meaning exactly what
   * they mean today. A "send" transaction on the downstream stage with
   * this set does NOT count toward that stage's own Sent/Received/
   * Pending figures (which stay scoped to sourceStageId === undefined,
   * preserving external Send/Receive math unchanged) — it is read
   * separately as "Downstream Consumed". */
  sourceStageId?: string;
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
  // Production <-> Job Card <-> Quantity integration (database/
  // 20260906060000) — both nullable/undefined, no backfill for existing
  // stages (see that migration's own header for the live counts verified
  // before it was written).
  /** "This stage needs N output pieces." No existing quantity field
   * (totalQty, orderedQuantity, BOM quantities, sentQty) legitimately
   * means this — see the chat design record. Normally seeded from the
   * project's orderedQuantity when a stage is created, but always
   * editable — never silently re-synced from the project afterward. */
  targetQty?: number;
  /** Authoritative discriminator for which workflow this stage exposes:
   * 'inhouse' -> Job Cards drive Accepted/Rejected/Rework/Processed;
   * 'external' -> the existing Send/Receive transactions drive Sent/
   * Received/Pending, Job Cards play no role. Undefined for every
   * existing stage (never inferred from sentToVendorId's "inhouse"
   * sentinel, which keeps its own, separate, existing meaning
   * unchanged) — the UI requires an explicit choice for new stages only. */
  stageType?: "inhouse" | "external";
  // WIP quantity tracking (Feature 2) — dead, zero read usage anywhere,
  // never persisted (confirmed by grep before the Production ↔ Job Card
  // design work) — left exactly as found, not resurrected by this change.
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

// Phase 53 (Group 2, roadmap Phase 13) — Employee Rewards / Merit.
// Deliberately not a duplicate of Job Card metrics (Phase 12's Performance
// tab already derives quality/efficiency straight from job_cards) - this
// is only the human decision to reward someone, optionally traceable back
// to the job card that justified it.
export type EmployeeRewardType = "Bonus" | "Recognition" | "Warning";

export interface EmployeeReward {
  id: string;
  employeeId: string;
  rewardType: EmployeeRewardType;
  title: string;
  amount?: number;
  relatedJobCardId?: string;
  notes?: string;
  awardedBy?: string;
  awardedAt: string; // YYYY-MM-DD
  createdAt: number;
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

// Phase 55 (Group 2, roadmap Phase 17) — Company Document Library. A
// reusable, company-wide document (GST/PAN/ISO/etc.), distinct from every
// per-project/per-employee/per-asset document store already in this
// schema. See database/phase-55.
export type CompanyDocumentStatus = "Active" | "Superseded" | "Draft";

export interface CompanyDocument {
  id: string;
  category: string;
  documentType: string;
  title: string;
  issueDate?: string;
  expiryDate?: string;
  version?: string;
  status: CompanyDocumentStatus;
  isTenderEligible: boolean;
  storagePath: string;
  originalFilename?: string;
  mimeType?: string;
  sizeBytes?: number;
  notes?: string;
  uploadedBy?: string;
  createdAt: number;
  updatedAt: number;
}

// Phase 56 (Group 2, roadmap Phases 19-24) — Tender Management + AI
// Document Intelligence. See database/phase-56.
export type TenderStatus =
  | "Draft"
  | "In Progress"
  | "Submitted"
  | "Won"
  | "Lost"
  | "Withdrawn";

export interface Tender {
  id: string;
  tenderNumber: string;
  title: string;
  customerId?: string;
  authorityName?: string;
  portal?: string;
  bidType?: string;
  submissionDeadline?: string; // ISO datetime
  openingDate?: string;
  technicalRequirementsSummary?: string;
  financialRequirementsSummary?: string;
  emdAmount?: number;
  emdDetails?: string;
  status: TenderStatus;
  sourceDocumentStoragePath?: string;
  sourceDocumentFilename?: string;
  finalPackStoragePath?: string;
  finalPackGeneratedAt?: number;
  activityLog?: ProjectActivity[];
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
}

export type TenderRequirementCategory =
  | "Eligibility"
  | "Technical"
  | "Financial"
  | "Document"
  | "Certificate"
  | "Declaration"
  | "Schedule"
  | "EMD"
  | "Portal"
  | "Format"
  | "Other";

// Verbatim vocabulary from the roadmap's Phase 21 spec.
export type TenderRequirementStatus =
  | "AVAILABLE"
  | "MISSING"
  | "EXPIRED"
  | "EXPIRING_SOON"
  | "NEEDS_REVIEW";

export interface TenderRequirement {
  id: string;
  tenderId: string;
  requirementText: string;
  category: TenderRequirementCategory;
  isMandatory: boolean;
  priority: number;
  status: TenderRequirementStatus;
  // Snapshotted at match time (Phase 21's explicit requirement) — never
  // silently re-read from the live company_documents row.
  matchedCompanyDocumentId?: string;
  matchedDocumentTitle?: string;
  matchedDocumentExpiry?: string;
  actionNeeded?: string;
  displayOrder: number;
  createdAt: number;
  updatedAt: number;
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
  // Phase 1 attachment-bug fix: stable identity, independent of file
  // content. Optional so pre-existing rows saved before this field
  // existed still parse — callers that read attachments back (Inventory,
  // MaterialDetailDrawer) backfill a real id for any legacy entry
  // missing one. Never key a list or match a removal by `ref` — two
  // attachments can share byte-identical content (a duplicate scan) and
  // therefore an identical `ref`, which silently collided list keys and
  // deleted the wrong entry before this field existed.
  id?: string;
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
  /** AI Agent redesign (see chat) — the assistant's display name shown in
   * the conversation header/empty state. Optional so existing settings
   * objects (pre-dating this field) fall back to the default
   * "FabFlow Copilot" in the UI rather than needing a migration. */
  aiAssistantName?: string;
  /** Voice conversation settings (see chat) — all optional so existing
   * settings objects fall back to sane defaults (voice off, browser's
   * own language) in AgentPage.tsx/agent/voice.ts. Each field maps to a
   * real, wired capability there — never a stub. BCP-47 codes (e.g.
   * "en-US"), see agent/voice.ts's SUPPORTED_VOICE_LANGUAGES. */
  voiceEnabled?: boolean;
  voiceInputLanguage?: string;
  voiceOutputLanguage?: string;
  autoSpeakResponses?: boolean;
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
  | "Draft"
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

// Phase 51 (Group 2) — universal asset photo store, one reusable table
// for Machines/Dies/Tools/Inventory Items rather than a per-domain photo
// system. Storage-backed (private "asset-photos" bucket), never base64 —
// see machines.primaryImageData/dies.photoData/tools.photoData for the
// legacy single-photo-per-asset fields this deliberately does NOT
// replace or migrate; those stay as a read-only fallback where no
// AssetPhoto rows exist yet for that asset.
// "job_card" added for the Employee Job Card Mobile Workflow's evidence
// photos - reuses AssetPhotoGallery/assetPhotosApi.ts unmodified (see
// database/phase-62, which widens asset_photos_owner_type_check and
// has_asset_permission() to match).
export type AssetOwnerType =
  | "machine"
  | "die"
  | "tool"
  | "inventory_item"
  | "job_card";

// Phase 51 (Group 2) — universal usage-event log for Machine/Die/Tool,
// one reusable table (asset_usage_events) rather than three. Mirrors
// ToolAssignmentHistory's own shape (one row per event, insert-only —
// see database/phase-51's RLS: select+insert only, no update/delete)
// deliberately kept generic enough to grow into Phase 12's Job Card
// integration later without another migration. tool_assignment_history
// itself is untouched and keeps recording Tools' issue/return
// independently — Option A (coexist), not replaced here.
export type AssetUsageEventType =
  | "issued"
  | "returned"
  | "used"
  | "maintenance"
  | "inspection"
  | "other";

export interface AssetUsageEvent {
  id: string;
  // Matches asset_usage_events.asset_type's CHECK constraint exactly -
  // deliberately narrower than AssetOwnerType (no "inventory_item";
  // usage-event tracking is a Machine/Die/Tool concept, not Inventory's).
  assetType: "machine" | "die" | "tool";
  assetId: string;
  employeeId?: string;
  employeeName?: string;
  projectId?: string;
  jobCardId?: string;
  eventType: AssetUsageEventType;
  quantity?: number;
  conditionBefore?: string;
  conditionAfter?: string;
  notes?: string;
  recordedBy?: string;
  eventAt: number;
  createdAt: number;
}

export interface AssetPhoto {
  id: string;
  ownerType: AssetOwnerType;
  ownerId: string;
  storagePath: string;
  originalFilename?: string;
  mimeType?: string;
  sizeBytes?: number;
  displayOrder: number;
  caption?: string;
  isPrimary: boolean;
  uploadedBy?: string;
  createdAt: number;
  updatedAt: number;
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
