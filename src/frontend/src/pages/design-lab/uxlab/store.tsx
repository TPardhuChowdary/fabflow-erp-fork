// UX Redesign Lab — the shared workflow engine.
//
// This is a REAL client-side state store (React context + useState),
// not a decorative demo: every action below actually mutates the
// dataset, and every screen across all 5 models reads from the same
// live state — so approving a PO here really does remove it from every
// other screen's "pending approval" list, advancing a stage really does
// update the project's computed status everywhere it's shown, etc.
// No backend, no persistence across reloads (React state only) — this
// is a UX simulation, not a data layer, by design.
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  type AppSettings,
  type BillableService,
  type ChargingMethod,
  type CompanyPO,
  type CompanyPOItem,
  type CompanyPOStatus,
  type Customer,
  type DCProjectEntry,
  type DCStatus,
  type DataState,
  type DeliveryChallan,
  type Die,
  type Drawing,
  type DrawingCategory,
  type DrawingLinkedType,
  type DrawingOwnerType,
  type Employee,
  type ExpenseFloat,
  type InspectionMode,
  type InspectionSheet,
  type InspectionSheetStatus,
  type InvLineItem,
  type InventoryItem,
  type InventoryPurchase,
  type Invoice,
  type Machine,
  type MachineServiceUsage,
  type OrgUser,
  type Payable,
  type PermissionMap,
  type PettyExpense,
  type PettyExpenseMode,
  type PettyExpenseType,
  type ProductionStage,
  type Project,
  type ProjectProductionStage,
  type ProjectQmsInspection,
  type PurchaseOrder,
  type QmsCharacteristicStatus,
  type QmsCriticality,
  type QmsInspectionMethodType,
  type QualityCharacteristic,
  type Quotation,
  type QuotationLineItem,
  type QuotationPO,
  type ScrapRecord,
  type ScrapStatus,
  type SecurityAuditEventType,
  type SecurityAuditLogEntry,
  type StageTransaction,
  type Tool,
  type UserRole,
  type Vendor,
  initialData,
} from "./data";

export type EntityKey =
  | "customers"
  | "vendors"
  | "machines"
  | "tools"
  | "employees"
  | "inventory"
  | "invoices"
  | "payables"
  | "deliveryChallans"
  | "companyPOs"
  | "pettyExpenses"
  | "scrapRecords"
  | "drawings"
  | "purchaseOrders";

export interface AttentionItem {
  id: string;
  title: string;
  detail: string;
  severity: "critical" | "warning";
  module: string;
  navigateTo: { view: string; id: string };
}

interface Ctx {
  data: DataState;
  // actions — every one is a real mutation, not a no-op
  advanceStage: (stageId: string) => void;
  blockStage: (stageId: string, reason: string) => void;
  approvePO: (poId: string) => void;
  receivePO: (poId: string) => void;
  resolveQms: (issueId: string) => void;
  recordPayment: (invoiceId: string, amount: number) => void;
  acceptQuotation: (quotationId: string) => Project;
  createProjectDirect: (
    customerId: string,
    name: string,
    qty: number,
    value: number,
    workDescription?: string,
  ) => Project;
  // Real Projects.tsx Edit + linked-record delete guard (invoices,
  // delivery challans, material usage) — PARITY_TRACKER.md #3.
  updateProjectFields: (
    id: string,
    fields: {
      customerId: string;
      name: string;
      qty: number;
      workDescription: string;
    },
  ) => void;
  projectDeleteBlockReason: (projectId: string) => string | null;
  deleteProject: (id: string) => void;
  createQuotation: (
    customerId: string,
    item: string,
    qty: number,
    total: number,
  ) => Quotation;
  // Real Quotations action surface (line items, tax, revisions,
  // status, duplicate, delete, record PO) — PARITY_TRACKER.md #4.
  updateQuotationFields: (
    id: string,
    fields: {
      customerId: string;
      lineItems: QuotationLineItem[];
      applyGST: boolean;
      applyIGST: boolean;
      validUntil: string;
      terms: string;
    },
  ) => void;
  deleteQuotation: (id: string) => void;
  duplicateQuotation: (id: string) => Quotation | null;
  createQuotationRevision: (
    id: string,
    fields: {
      lineItems: QuotationLineItem[];
      applyGST: boolean;
      applyIGST: boolean;
      validUntil: string;
      terms: string;
    },
  ) => void;
  updateQuotationStatus: (id: string, status: Quotation["status"]) => void;
  recordQuotationPO: (
    quotationId: string,
    poNumber: string,
    poDate: string,
  ) => QuotationPO;
  updateQuotationPOStatus: (id: string, status: QuotationPO["status"]) => void;
  deleteQuotationPO: (id: string) => void;
  // Real Invoices action surface — PARITY_TRACKER.md #6.
  addInvoice: (fields: {
    customerId: string;
    projectId: string;
    lineItems: InvLineItem[];
    cgstRate: number;
    sgstRate: number;
    igstRate: number;
    invoiceDate: string;
    dueDate: string;
    poNumber: string;
    poDate: string;
    invoiceType: "tax" | "proforma";
  }) => Invoice;
  updateInvoiceFields: (
    id: string,
    fields: {
      customerId: string;
      projectId: string;
      lineItems: InvLineItem[];
      cgstRate: number;
      sgstRate: number;
      igstRate: number;
      invoiceDate: string;
      dueDate: string;
      poNumber: string;
      poDate: string;
      invoiceType: "tax" | "proforma";
    },
  ) => void;
  updateInvoiceStatus: (id: string, status: Invoice["status"]) => void;
  deleteInvoiceFull: (id: string) => void;
  addPayment: (fields: {
    invoiceId: string;
    amount: number;
    date: string;
    method: string;
    referenceNo: string;
    notes: string;
  }) => { ok: true } | { ok: false; error: string };
  // Real Payables action surface — PARITY_TRACKER.md #8.
  addPayable: (fields: {
    vendorId: string;
    paymentType: string;
    amount: number;
    dueDate: string;
    projectId: string | null;
    notes: string;
  }) => Payable;
  addPayablePayment: (fields: {
    payableId: string;
    amount: number;
    paymentDate: string;
    mode: string;
    referenceNo: string;
    notes: string;
  }) => { ok: true } | { ok: false; error: string };
  deletePayableFull: (id: string) => void;
  // Real Inventory action surface — PARITY_TRACKER.md #9.
  addInventoryItemFull: (fields: {
    sku: string;
    name: string;
    category: InventoryItem["category"];
    reorderAt: number;
    unit: string;
    unitCost: number;
  }) => InventoryItem;
  updateInventoryItemFields: (
    id: string,
    fields: {
      sku: string;
      name: string;
      category: InventoryItem["category"];
      reorderAt: number;
      unit: string;
      unitCost: number;
    },
  ) => void;
  deleteInventoryItemFull: (id: string) => void;
  addInventoryPurchaseFull: (fields: {
    itemId: string;
    vendorId: string;
    quantityPurchased: number;
    purchaseDate: string;
    cost: number;
    applyGST: boolean;
  }) => InventoryPurchase;
  // Real Machinery Add/Edit — PARITY_TRACKER.md #10.
  addMachineFull: (fields: {
    name: string;
    type: Machine["type"];
    status: Machine["status"];
    location: string;
    department: string;
    hourlyRate: number;
    nextServiceDue: string;
  }) => Machine;
  updateMachineFields: (
    id: string,
    fields: {
      name: string;
      type: Machine["type"];
      status: Machine["status"];
      location: string;
      department: string;
      hourlyRate: number;
      nextServiceDue: string;
    },
  ) => void;
  // Real Tools Add/Edit/Issue/Return — PARITY_TRACKER.md #11.
  addToolFull: (fields: {
    name: string;
    category?: string;
    quantity: number;
    location?: string;
    assignedEmployeeId?: string;
    condition?: Tool["condition"];
    status: Tool["status"];
    purchaseDate?: string;
    replacementValue?: number;
    notes?: string;
    photoData?: string;
    purchaseVendorId?: string;
    purchaseVendorName?: string;
  }) => Tool;
  updateToolFields: (
    id: string,
    fields: {
      name: string;
      category?: string;
      quantity: number;
      location?: string;
      assignedEmployeeId?: string;
      condition?: Tool["condition"];
      status: Tool["status"];
      purchaseDate?: string;
      replacementValue?: number;
      notes?: string;
      photoData?: string;
      purchaseVendorId?: string;
      purchaseVendorName?: string;
    },
  ) => void;
  issueTool: (toolId: string, employeeId: string) => void;
  returnTool: (toolId: string) => void;
  // Real Tooling/Dies Add/Edit/Delete — PARITY_TRACKER.md #12.
  addDieFull: (fields: {
    name: string;
    type?: string;
    purpose?: string;
    compatibleMachineId?: string;
    originalProjectId?: string;
    location?: string;
    status: Die["status"];
    dateCreated?: string;
    condition?: Die["condition"];
    notes?: string;
    photoData?: string;
    purchaseDate?: string;
    purchaseCost?: number;
    purchaseVendorId?: string;
    purchaseVendorName?: string;
    linkedDrawingIds: string[];
  }) => Die;
  updateDieFields: (
    id: string,
    fields: {
      name: string;
      type?: string;
      purpose?: string;
      compatibleMachineId?: string;
      originalProjectId?: string;
      location?: string;
      status: Die["status"];
      dateCreated?: string;
      condition?: Die["condition"];
      notes?: string;
      photoData?: string;
      purchaseDate?: string;
      purchaseCost?: number;
      purchaseVendorId?: string;
      purchaseVendorName?: string;
      linkedDrawingIds: string[];
    },
  ) => void;
  deleteDie: (id: string) => void;
  // Real Employees Add/Edit/Delete — PARITY_TRACKER.md #13.
  addEmployeeFull: (fields: {
    name: string;
    phone: string;
    role: Employee["role"];
    monthlySalary: number;
    joiningDate: string;
    photoRef?: string;
    designation?: string;
    bloodGroup?: string;
    emergencyContactName?: string;
    emergencyContactRelation?: string;
    emergencyContactPhone?: string;
    employmentType?: Employee["employmentType"];
    tempStartDate?: string;
    tempEndDate?: string;
    dailyWageRate?: number;
  }) => Employee;
  employeeDuplicateExists: (name: string, phone: string) => Employee | null;
  updateEmployeeFields: (
    id: string,
    fields: {
      name: string;
      phone: string;
      role: Employee["role"];
      monthlySalary: number;
      joiningDate: string;
      photoRef?: string;
      designation?: string;
      bloodGroup?: string;
      emergencyContactName?: string;
      emergencyContactRelation?: string;
      emergencyContactPhone?: string;
      employmentType?: Employee["employmentType"];
      tempStartDate?: string;
      tempEndDate?: string;
      dailyWageRate?: number;
    },
  ) => void;
  // Real Delivery Challans Add/Edit/Status/Delete — PARITY_TRACKER.md
  // #14.
  dcRemainingQty: (projectId: string, excludeChallanId?: string) => number;
  dcNumberExists: (dcNo: string) => boolean;
  addDeliveryChallanFull: (fields: {
    dcNo: string;
    customerId: string;
    projectEntries: DCProjectEntry[];
    dispatchMethod: DeliveryChallan["dispatchMethod"];
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
    deliveryAddress: DeliveryChallan["deliveryAddress"];
  }) => DeliveryChallan;
  updateDeliveryChallanFull: (
    id: string,
    fields: {
      projectEntries: DCProjectEntry[];
      dispatchMethod: DeliveryChallan["dispatchMethod"];
      vehicleNo?: string;
      driverName?: string;
      courierCompany?: string;
      trackingNumber?: string;
      transportCompany?: string;
      lrNumber?: string;
      collectedBy?: string;
      mobileNumber?: string;
      receiverName: string;
      deliveryAddress: DeliveryChallan["deliveryAddress"];
    },
  ) => void;
  updateDeliveryChallanStatus: (id: string, status: DCStatus) => void;
  // Real Company PO (vendor-side) Add/Edit/Status — PARITY_TRACKER.md
  // #15. NOT the old `purchaseOrders`/`approvePO`/`receivePO` demo
  // entity, which three of the 10 pre-existing models still read
  // unmodified.
  genCpoNumber: () => string;
  addCompanyPOFull: (fields: {
    vendorId?: string;
    vendorName: string;
    vendorAddress?: string;
    vendorGst?: string;
    vendorContact?: string;
    items: CompanyPOItem[];
    deliveryAddress?: string;
    expectedDeliveryDate?: string;
    gstPercent?: number;
    termsAndConditions?: string;
    notes?: string;
    file?: CompanyPO["file"];
  }) => CompanyPO;
  updateCompanyPOFull: (
    id: string,
    fields: {
      vendorId?: string;
      vendorName: string;
      vendorAddress?: string;
      vendorGst?: string;
      vendorContact?: string;
      items: CompanyPOItem[];
      deliveryAddress?: string;
      expectedDeliveryDate?: string;
      gstPercent?: number;
      termsAndConditions?: string;
      notes?: string;
      file?: CompanyPO["file"];
    },
  ) => void;
  updateCompanyPOStatus: (id: string, status: CompanyPOStatus) => void;
  // Real Petty Expenses / Expense Floats — PARITY_TRACKER.md #16.
  resolveFloatLink: (
    candidateFloatId: string | undefined,
    employeeId: string,
  ) => string | undefined;
  addPettyExpenseFull: (fields: {
    date: string;
    employeeId: string;
    amount: number;
    expenseType: PettyExpenseType;
    expenseMode: PettyExpenseMode;
    projectId?: string;
    floatId?: string;
    notes?: string;
  }) => PettyExpense;
  updatePettyExpenseFull: (
    id: string,
    fields: {
      date: string;
      employeeId: string;
      amount: number;
      expenseType: PettyExpenseType;
      expenseMode: PettyExpenseMode;
      projectId?: string;
      floatId?: string;
      notes?: string;
    },
  ) => void;
  addExpenseFloatFull: (fields: {
    employeeId: string;
    issuedDate: string;
    issuedAmount: number;
    purpose?: string;
    notes?: string;
    projectId?: string;
  }) => ExpenseFloat;
  returnExpenseFloatAmount: (id: string, returnedAmount: number) => void;
  // Real Machine/Service Revenue — PARITY_TRACKER.md #17. Revenue-only,
  // never profit/costing.
  currentServiceRate: (billableServiceId: string) => number;
  serviceDeleteBlockReason: (billableServiceId: string) => string | null;
  addBillableServiceFull: (fields: {
    name: string;
    machineId?: string;
    chargingMethod: ChargingMethod;
    unitLabel?: string;
    initialRate?: number;
  }) => BillableService;
  updateBillableServiceFull: (
    id: string,
    fields: {
      name: string;
      machineId?: string;
      chargingMethod: ChargingMethod;
      unitLabel?: string;
      isActive: boolean;
    },
  ) => void;
  deleteBillableServiceFull: (id: string) => void;
  changeServiceRate: (billableServiceId: string, rate: number) => void;
  addServiceUsageFull: (fields: {
    projectId: string;
    billableServiceId: string;
    usageDate: string;
    quantity: number;
    notes?: string;
  }) => MachineServiceUsage;
  updateServiceUsageFull: (
    id: string,
    fields: { usageDate: string; quantity: number; notes?: string },
  ) => void;
  deleteServiceUsageFull: (id: string) => void;
  // Real Scrap Management Add/Edit — PARITY_TRACKER.md #18.
  addScrapRecordFull: (fields: {
    projectId?: string;
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
  }) => ScrapRecord;
  updateScrapRecordFull: (
    id: string,
    fields: {
      projectId?: string;
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
    },
  ) => void;
  // Real Production (per-project stages) — PARITY_TRACKER.md #20. NOT
  // the old `stages`/`advanceStage`/`blockStage` demo entity, which
  // Model1Pipeline still reads unmodified.
  updateProjectStagesFull: (
    projectId: string,
    stages: ProjectProductionStage[],
  ) => void;
  addStageTransactionFull: (
    projectId: string,
    stageIdx: number,
    tx: StageTransaction,
  ) => void;
  // Real Material Requisitions — PARITY_TRACKER.md #21.
  completeBomRequisition: (id: string) => void;
  // Real QMS engine — PARITY_TRACKER.md #22-26.
  addCharacteristicFull: (fields: {
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
  }) => QualityCharacteristic;
  updateCharacteristicFull: (
    id: string,
    fields: {
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
    },
  ) => void;
  generateInspectionSheet: (
    projectId: string,
    mode: InspectionMode,
  ) => InspectionSheet;
  advanceInspectionSheetStatus: (
    id: string,
    status: InspectionSheetStatus,
  ) => void;
  addProjectQmsInspection: (
    projectId: string,
    processId: string,
    mode: InspectionMode,
  ) => { ok: true; data: ProjectQmsInspection } | { ok: false; error: string };
  recordCharacteristicResult: (
    id: string,
    result: "Pass" | "Fail" | "NA",
    measuredValue?: string,
    remarks?: string,
    failureReason?: string,
  ) => void;
  // Real Drawing Repository — PARITY_TRACKER.md #27. Metadata/links
  // only; see data.ts's Drawing comment for why the Editor half (canvas
  // annotation) isn't reproduced.
  addDrawingFull: (fields: {
    fileName: string;
    numPages: number;
    ownerType: DrawingOwnerType;
    ownerId?: string;
    category?: DrawingCategory;
    status: "Draft" | "Approved";
    notes?: string;
    tags: string[];
  }) => Drawing;
  updateDrawingFull: (
    id: string,
    fields: {
      fileName: string;
      numPages: number;
      ownerType: DrawingOwnerType;
      ownerId?: string;
      category?: DrawingCategory;
      status: "Draft" | "Approved";
      notes?: string;
      tags: string[];
    },
  ) => void;
  addDrawingLinkFull: (
    drawingId: string,
    linkedType: DrawingLinkedType,
    linkedId: string,
  ) => void;
  removeDrawingLinkFull: (id: string) => void;
  // Real Settings action surface — PARITY_TRACKER.md #29. Company
  // Profile/WhatsApp/Email are one flat settings record (real
  // pages/Settings.tsx also treats them that way — three separate save
  // buttons all call the same updateSettings()); Backup & Restore is a
  // real export-everything/restore-everything pair over this lab's own
  // `data` state (not the real 30-collection production shape, this
  // lab's own real shape); User Management is real named accounts with
  // real role + fine-grained permission-override editing (see
  // permissionCatalog.ts) — disclosed gap: no real backend auth is
  // provisioned by Create User, same as Employee.userId's existing gap.
  updateAppSettingsFull: (fields: Partial<AppSettings>) => void;
  exportBackup: () => string;
  restoreBackup: (json: string) => { ok: true } | { ok: false; error: string };
  createOrgUserFull: (
    username: string,
    role: UserRole,
  ) => { ok: true; user: OrgUser } | { ok: false; error: string };
  updateOrgUserRoleFull: (id: string, role: UserRole) => void;
  updateOrgUserOverridesFull: (id: string, overrides: PermissionMap) => void;
  setOrgUserActiveFull: (id: string, isActive: boolean) => void;
  // Real Agent action surface — PARITY_TRACKER.md #30. Reuses this same
  // securityAuditLog, exactly like real agent/audit.ts reuses production's
  // security_audit_log table rather than a parallel Agent-specific log.
  logAgentAuditFull: (
    eventType: import("./data").SecurityAuditEventType,
    metadata: Record<string, string | number | boolean>,
  ) => void;
  createPO: (
    vendorId: string,
    item: string,
    amount: number,
    projectId: string | null,
  ) => PurchaseOrder;
  // Real Customers CRUD (full field set + linked-record delete guard) —
  // see PARITY_TRACKER.md #1.
  addCustomer: (fields: Omit<Customer, "id" | "contact" | "since">) => Customer;
  updateCustomer: (
    id: string,
    fields: Omit<Customer, "id" | "contact" | "since">,
  ) => void;
  customerDeleteBlockReason: (customerId: string) => string | null;
  // Real Vendors CRUD (duplicate-name check on create, unrestricted
  // delete) — see PARITY_TRACKER.md #2.
  vendorNameExists: (name: string) => boolean;
  addVendor: (fields: Omit<Vendor, "id" | "contact">) => Vendor;
  updateVendor: (id: string, fields: Omit<Vendor, "id" | "contact">) => void;
  // Generic create/delete for every module that only had a read-only
  // list before this pass (Customers, Vendors, Machinery, Tools/Dies,
  // Employees, Inventory, Invoices, Payables, Delivery Challans,
  // Company PO, Petty Expenses, Machine Revenue, Scrap, Drawings) — one
  // real mutation path instead of 14 bespoke ones. See EntityKey below.
  addRecord: (
    entity: EntityKey,
    values: Record<string, string>,
  ) => { id: string; label: string };
  deleteRecord: (entity: EntityKey, id: string) => void;
  // selectors — computed from live state, not hardcoded strings
  attentionItems: AttentionItem[];
  vendorContext: (vendorId: string) => {
    vendor: DataState["vendors"][number] | undefined;
    purchaseOrders: PurchaseOrder[];
    relatedProjects: Project[];
    payable: DataState["payables"][number] | undefined;
    materialPurchases: DataState["materialPurchases"];
    inventoryPurchases: DataState["inventoryPurchases"];
    vPayables: DataState["payables"];
    totalPayablesAmt: number;
    pendingBalance: number;
    totalPurchaseCount: number;
  };
  customerContext: (customerId: string) => {
    customer: DataState["customers"][number] | undefined;
    quotations: Quotation[];
    projects: Project[];
    invoices: Invoice[];
  };
  projectContext: (projectId: string) => {
    project: Project | undefined;
    customer: DataState["customers"][number] | undefined;
    quotation: Quotation | undefined;
    stages: ProjectProductionStage[];
    inspections: DataState["projectQmsInspections"];
    invoice: Invoice | undefined;
    payments: DataState["payments"];
    customerPOs: QuotationPO[];
    requisitions: DataState["bomRequisitions"];
    deliveryChallans: DataState["deliveryChallans"];
    drawings: DataState["drawings"];
  };
}

const StoreCtx = createContext<Ctx | null>(null);

let seq = 1000;
const nextId = (prefix: string) => `${prefix}-${seq++}`;

// Real Settings action surface — PARITY_TRACKER.md #29. Every user-
// management action below writes a real security_audit_log-shaped
// entry, matching real production's own log_security_event() calls.
// Disclosed simplification: this lab's sign-in (FinalPrototype.tsx's
// role picker) has no named logged-in account to attribute events to —
// real production only ever lets an admin reach these actions anyway
// (canEditUsers), so the actor is fixed as "admin". Module-level (not a
// closure inside the provider) since it captures no component state.
const logAudit = (
  entry: Omit<SecurityAuditLogEntry, "id" | "createdAt">,
): SecurityAuditLogEntry => ({
  id: nextId("audit"),
  createdAt: Date.now(),
  ...entry,
});

// Matches the real store.ts deriveFloatTotals() exactly — spentAmount is
// derived by summing every PettyExpense with a matching floatId, never
// stored directly (see PARITY_TRACKER.md #16).
function deriveFloatTotals(
  float: ExpenseFloat,
  allExpenses: PettyExpense[],
): Pick<
  ExpenseFloat,
  "spentAmount" | "balanceAmount" | "status" | "settledAt"
> {
  const spentAmount = allExpenses
    .filter((e) => e.floatId === float.id)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const balanceRaw = float.issuedAmount - spentAmount - float.returnedAmount;
  const balanceAmount = Math.max(0, balanceRaw);
  const status: ExpenseFloat["status"] =
    balanceRaw <= 0
      ? "Fully Settled"
      : spentAmount > 0 || float.returnedAmount > 0
        ? "Partially Settled"
        : "Open";
  return {
    spentAmount,
    balanceAmount,
    status,
    settledAt:
      status === "Fully Settled" ? (float.settledAt ?? Date.now()) : undefined,
  };
}

const recomputeFloats = (
  expenses: PettyExpense[],
  floats: ExpenseFloat[],
): ExpenseFloat[] =>
  floats.map((f) => ({ ...f, ...deriveFloatTotals(f, expenses) }));

const defaultStages = (projectId: string): ProductionStage[] => [
  {
    id: nextId("st"),
    projectId,
    name: "Material Prep",
    order: 1,
    status: "NotStarted",
    blockedReason: null,
  },
  {
    id: nextId("st"),
    projectId,
    name: "Production",
    order: 2,
    status: "NotStarted",
    blockedReason: null,
  },
  {
    id: nextId("st"),
    projectId,
    name: "Quality Check",
    order: 3,
    status: "NotStarted",
    blockedReason: null,
  },
  {
    id: nextId("st"),
    projectId,
    name: "Dispatch",
    order: 4,
    status: "NotStarted",
    blockedReason: null,
  },
];

// Real GST/IGST tax computation, matching pages/Quotations.tsx's own
// computeQuotationTax() exactly — module-level since it's pure (no
// reactive dependencies), avoiding an exhaustive-deps footgun in the
// useCallbacks that use it.
function quotationTax(
  lineItems: QuotationLineItem[],
  applyGST: boolean,
  applyIGST: boolean,
) {
  const subtotal = lineItems.reduce((s, li) => s + li.amount, 0);
  const cgstAmt = applyGST ? Math.round(subtotal * 0.09) : 0;
  const sgstAmt = applyGST ? Math.round(subtotal * 0.09) : 0;
  const igstAmt = applyIGST ? Math.round(subtotal * 0.18) : 0;
  return {
    subtotal,
    cgstAmt,
    sgstAmt,
    igstAmt,
    total: subtotal + cgstAmt + sgstAmt + igstAmt,
  };
}

// Real Invoices tax: editable CGST/SGST/IGST rates, matching
// pages/Invoices.tsx exactly — module-level for the same
// exhaustive-deps reason as quotationTax above.
function invoiceTax(
  lineItems: InvLineItem[],
  cgstRate: number,
  sgstRate: number,
  igstRate: number,
) {
  const subtotal = lineItems.reduce((s, li) => s + li.amount, 0);
  const cgstAmt = Math.round((subtotal * cgstRate) / 100);
  const sgstAmt = Math.round((subtotal * sgstRate) / 100);
  const igstAmt = Math.round((subtotal * igstRate) / 100);
  return { subtotal, total: subtotal + cgstAmt + sgstAmt + igstAmt };
}

export function UxLabStoreProvider({
  children,
}: { children: React.ReactNode }) {
  const [data, setData] = useState<DataState>(() =>
    structuredClone(initialData),
  );

  const advanceStage = useCallback((stageId: string) => {
    setData((d) => {
      const stages = d.stages.map((s) => {
        if (s.id !== stageId) return s;
        const next: ProductionStage["status"] =
          s.status === "NotStarted" || s.status === "Blocked"
            ? "InProgress"
            : s.status === "InProgress"
              ? "Complete"
              : s.status;
        return { ...s, status: next, blockedReason: null };
      });
      return { ...d, stages };
    });
  }, []);

  const blockStage = useCallback((stageId: string, reason: string) => {
    setData((d) => ({
      ...d,
      stages: d.stages.map((s) =>
        s.id === stageId
          ? { ...s, status: "Blocked", blockedReason: reason }
          : s,
      ),
    }));
  }, []);

  const approvePO = useCallback((poId: string) => {
    setData((d) => ({
      ...d,
      purchaseOrders: d.purchaseOrders.map((p) =>
        p.id === poId ? { ...p, status: "Approved" } : p,
      ),
    }));
  }, []);

  const receivePO = useCallback((poId: string) => {
    setData((d) => ({
      ...d,
      purchaseOrders: d.purchaseOrders.map((p) =>
        p.id === poId ? { ...p, status: "Confirmed" } : p,
      ),
    }));
  }, []);

  const resolveQms = useCallback((issueId: string) => {
    setData((d) => ({
      ...d,
      qmsIssues: d.qmsIssues.map((q) =>
        q.id === issueId ? { ...q, status: "Resolved" } : q,
      ),
    }));
  }, []);

  const recordPayment = useCallback((invoiceId: string, amount: number) => {
    setData((d) => {
      const invoices = d.invoices.map((inv) =>
        inv.id === invoiceId
          ? {
              ...inv,
              paidAmount: Math.min(inv.amount, inv.paidAmount + amount),
            }
          : inv,
      );
      const payments = [
        ...d.payments,
        {
          id: nextId("pay"),
          invoiceId,
          amount,
          date: new Date().toISOString().slice(0, 10),
          method: "Bank Transfer",
          referenceNo: "",
          notes: "",
        },
      ];
      return { ...d, invoices, payments };
    });
  }, []);

  const acceptQuotation = useCallback((quotationId: string): Project => {
    let created: Project = null as unknown as Project;
    setData((d) => {
      const q = d.quotations.find((x) => x.id === quotationId);
      if (!q) return d;
      const projectId = nextId("proj");
      created = {
        id: projectId,
        no: `PROJ-2026-${String(20 + (seq % 90)).padStart(3, "0")}`,
        name: q.item,
        customerId: q.customerId,
        quotationId: q.id,
        qty: q.qty,
        value: q.total,
        workDescription: q.item,
        createdAt: new Date().toISOString().slice(0, 10),
      };
      return {
        ...d,
        quotations: d.quotations.map((x) =>
          x.id === quotationId ? { ...x, status: "Accepted" } : x,
        ),
        projects: [...d.projects, created],
        stages: [...d.stages, ...defaultStages(projectId)],
      };
    });
    return created;
  }, []);

  const createProjectDirect = useCallback(
    (
      customerId: string,
      name: string,
      qty: number,
      value: number,
      workDescription = "",
    ): Project => {
      const projectId = nextId("proj");
      const created: Project = {
        id: projectId,
        no: `PROJ-2026-${String(20 + (seq % 90)).padStart(3, "0")}`,
        name,
        customerId,
        quotationId: null,
        qty,
        value,
        workDescription,
        createdAt: new Date().toISOString().slice(0, 10),
      };
      setData((d) => ({
        ...d,
        projects: [...d.projects, created],
        stages: [...d.stages, ...defaultStages(projectId)],
      }));
      return created;
    },
    [],
  );

  const createQuotation = useCallback(
    (
      customerId: string,
      item: string,
      qty: number,
      total: number,
    ): Quotation => {
      const today = new Date().toISOString().slice(0, 10);
      const unitPrice = qty > 0 ? total / qty : 0;
      const id = nextId("qt");
      const no = `QT-2026-${String(10 + (seq % 90)).padStart(3, "0")}`;
      const lineItems = [
        { desc: item, hsn: "7326", qty, unitPrice, amount: total },
      ];
      const q: Quotation = {
        id,
        no,
        customerId,
        lineItems,
        subtotal: total,
        applyGST: false,
        applyIGST: false,
        cgstAmt: 0,
        sgstAmt: 0,
        igstAmt: 0,
        validUntil: "",
        quotationDate: today,
        terms: "",
        status: "Draft",
        createdAt: today,
        item,
        qty,
        total,
      };
      setData((d) => ({
        ...d,
        quotations: [...d.quotations, q],
        quotationRevisions: [
          ...d.quotationRevisions,
          {
            id: nextId("qrev"),
            quotationId: id,
            revisionNumber: 1,
            revisionDate: today,
            lineItems,
            total,
            isCurrent: true,
          },
        ],
      }));
      return q;
    },
    [],
  );

  const createPO = useCallback(
    (
      vendorId: string,
      item: string,
      amount: number,
      projectId: string | null,
    ): PurchaseOrder => {
      const po: PurchaseOrder = {
        id: nextId("po"),
        no: `PO-2026-${String(40 + (seq % 90)).padStart(3, "0")}`,
        vendorId,
        projectId,
        item,
        amount,
        status: "Draft",
        etaDays: 7,
      };
      setData((d) => ({ ...d, purchaseOrders: [...d.purchaseOrders, po] }));
      return po;
    },
    [],
  );

  // Real Customers create/edit/delete — matches pages/Customers.tsx's own
  // shape (full field set, not the generic 2-field form) and its
  // pre-confirm linked-record delete guard, per PARITY_TRACKER.md #1.
  const addCustomer = useCallback(
    (fields: Omit<Customer, "id" | "contact" | "since">): Customer => {
      const c: Customer = {
        ...fields,
        id: nextId("cust"),
        contact: fields.contactPerson,
        since: String(new Date().getFullYear()),
      };
      setData((d) => ({ ...d, customers: [...d.customers, c] }));
      return c;
    },
    [],
  );

  const updateCustomer = useCallback(
    (id: string, fields: Omit<Customer, "id" | "contact" | "since">) => {
      setData((d) => ({
        ...d,
        customers: d.customers.map((c) =>
          c.id === id ? { ...c, ...fields, contact: fields.contactPerson } : c,
        ),
      }));
    },
    [],
  );

  // Returns a block reason if the customer has linked records (mirrors
  // the real page's guard exactly), or null if the delete may proceed.
  const customerDeleteBlockReason = useCallback(
    (customerId: string): string | null => {
      const hasQuotations = data.quotations.some(
        (q) => q.customerId === customerId,
      );
      const hasInvoices = data.invoices.some((inv) => {
        const proj = data.projects.find((p) => p.id === inv.projectId);
        return proj?.customerId === customerId;
      });
      const hasProjects = data.projects.some(
        (p) => p.customerId === customerId,
      );
      if (hasQuotations || hasInvoices || hasProjects) {
        return "Cannot delete customer. Linked transactions or projects exist.";
      }
      return null;
    },
    [data],
  );

  // Real Vendors create/edit — matches pages/Vendors.tsx's own shape
  // (real field set + duplicate-name rejection on create). Unlike
  // Customers, real Vendors.tsx allows delete unconditionally — it just
  // warns that linked purchase/payable records will lose the link, so
  // there is no vendor delete-block-reason helper; deleteRecord already
  // covers plain deletion.
  const vendorNameExists = useCallback(
    (name: string) =>
      data.vendors.some(
        (v) => v.name.trim().toLowerCase() === name.trim().toLowerCase(),
      ),
    [data],
  );

  const addVendor = useCallback(
    (fields: Omit<Vendor, "id" | "contact">): Vendor => {
      const v: Vendor = {
        ...fields,
        id: nextId("vend"),
        contact: fields.phone,
      };
      setData((d) => ({ ...d, vendors: [...d.vendors, v] }));
      return v;
    },
    [],
  );

  const updateVendor = useCallback(
    (id: string, fields: Omit<Vendor, "id" | "contact">) => {
      setData((d) => ({
        ...d,
        vendors: d.vendors.map((v) =>
          v.id === id ? { ...v, ...fields, contact: fields.phone } : v,
        ),
      }));
    },
    [],
  );

  // Real Projects.tsx Edit + delete guard — see PARITY_TRACKER.md #3.
  const updateProjectFields = useCallback(
    (
      id: string,
      fields: {
        customerId: string;
        name: string;
        qty: number;
        workDescription: string;
      },
    ) => {
      setData((d) => ({
        ...d,
        projects: d.projects.map((p) =>
          p.id === id ? { ...p, ...fields } : p,
        ),
      }));
    },
    [],
  );

  const projectDeleteBlockReason = useCallback(
    (projectId: string): string | null => {
      const hasInvoices = data.invoices.some((i) => i.projectId === projectId);
      const hasDCs = data.deliveryChallans.some((dc) =>
        dc.projectEntries.some((e) => e.projectId === projectId),
      );
      if (hasInvoices || hasDCs) {
        return "Cannot delete project. Linked records exist (invoices, delivery challans, or material usage).";
      }
      return null;
    },
    [data],
  );

  const deleteProject = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      projects: d.projects.filter((p) => p.id !== id),
      stages: d.stages.filter((s) => s.projectId !== id),
    }));
  }, []);

  // Real Quotations action surface — line items, real GST/IGST tax
  // (9%+9% / 18%, matching computeQuotationTax exactly), revisions,
  // status workflow, duplicate, delete, record PO. PARITY_TRACKER.md #4.

  const updateQuotationFields = useCallback(
    (
      id: string,
      fields: {
        customerId: string;
        lineItems: QuotationLineItem[];
        applyGST: boolean;
        applyIGST: boolean;
        validUntil: string;
        terms: string;
      },
    ) => {
      const tax = quotationTax(
        fields.lineItems,
        fields.applyGST,
        fields.applyIGST,
      );
      setData((d) => ({
        ...d,
        quotations: d.quotations.map((q) =>
          q.id === id
            ? {
                ...q,
                ...fields,
                ...tax,
                item: fields.lineItems[0]?.desc ?? q.item,
                qty: fields.lineItems.reduce((s, li) => s + li.qty, 0),
                total: tax.total,
              }
            : q,
        ),
      }));
    },
    [],
  );

  const deleteQuotation = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      quotations: d.quotations.filter((q) => q.id !== id),
      quotationRevisions: d.quotationRevisions.filter(
        (r) => r.quotationId !== id,
      ),
      quotationPOs: d.quotationPOs.filter((p) => p.quotationId !== id),
    }));
  }, []);

  const duplicateQuotation = useCallback(
    (id: string): Quotation | null => {
      const src = data.quotations.find((q) => q.id === id);
      if (!src) return null;
      const today = new Date().toISOString().slice(0, 10);
      const newId = nextId("qt");
      const no = `QT-2026-${String(10 + (seq % 90)).padStart(3, "0")}`;
      const dup: Quotation = {
        ...src,
        id: newId,
        no,
        status: "Draft",
        quotationDate: today,
        createdAt: today,
      };
      setData((d) => ({
        ...d,
        quotations: [...d.quotations, dup],
        quotationRevisions: [
          ...d.quotationRevisions,
          {
            id: nextId("qrev"),
            quotationId: newId,
            revisionNumber: 1,
            revisionDate: today,
            lineItems: dup.lineItems,
            total: dup.total,
            isCurrent: true,
          },
        ],
      }));
      return dup;
    },
    [data],
  );

  const createQuotationRevision = useCallback(
    (
      id: string,
      fields: {
        lineItems: QuotationLineItem[];
        applyGST: boolean;
        applyIGST: boolean;
        validUntil: string;
        terms: string;
      },
    ) => {
      const tax = quotationTax(
        fields.lineItems,
        fields.applyGST,
        fields.applyIGST,
      );
      const today = new Date().toISOString().slice(0, 10);
      setData((d) => {
        const existingRevs = d.quotationRevisions.filter(
          (r) => r.quotationId === id,
        );
        const nextNum =
          Math.max(0, ...existingRevs.map((r) => r.revisionNumber)) + 1;
        return {
          ...d,
          quotationRevisions: [
            ...d.quotationRevisions.map((r) =>
              r.quotationId === id ? { ...r, isCurrent: false } : r,
            ),
            {
              id: nextId("qrev"),
              quotationId: id,
              revisionNumber: nextNum,
              revisionDate: today,
              lineItems: fields.lineItems,
              total: tax.total,
              isCurrent: true,
            },
          ],
          quotations: d.quotations.map((q) =>
            q.id === id
              ? {
                  ...q,
                  ...fields,
                  ...tax,
                  status: "Draft" as const,
                  item: fields.lineItems[0]?.desc ?? q.item,
                  qty: fields.lineItems.reduce((s, li) => s + li.qty, 0),
                  total: tax.total,
                }
              : q,
          ),
        };
      });
    },
    [],
  );

  const updateQuotationStatus = useCallback(
    (id: string, status: Quotation["status"]) => {
      setData((d) => ({
        ...d,
        quotations: d.quotations.map((q) =>
          q.id === id ? { ...q, status } : q,
        ),
      }));
    },
    [],
  );

  const recordQuotationPO = useCallback(
    (quotationId: string, poNumber: string, poDate: string): QuotationPO => {
      const revisionId =
        data.quotationRevisions.find(
          (r) => r.quotationId === quotationId && r.isCurrent,
        )?.id ?? "";
      const po: QuotationPO = {
        id: nextId("qpo"),
        quotationId,
        revisionId,
        poNumber,
        poDate,
        status: "Open",
      };
      setData((d) => ({ ...d, quotationPOs: [...d.quotationPOs, po] }));
      return po;
    },
    [data],
  );

  // Real pages/PurchaseOrders.tsx (Customer POs) status workflow +
  // delete — PARITY_TRACKER.md #5.
  const updateQuotationPOStatus = useCallback(
    (id: string, status: QuotationPO["status"]) => {
      setData((d) => ({
        ...d,
        quotationPOs: d.quotationPOs.map((p) =>
          p.id === id ? { ...p, status } : p,
        ),
      }));
    },
    [],
  );

  const deleteQuotationPO = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      quotationPOs: d.quotationPOs.filter((p) => p.id !== id),
    }));
  }, []);

  // Real Invoices action surface — line items, editable CGST/SGST/IGST
  // rates, tax/proforma type, PO linkage, status workflow, delete (no
  // guard in production — it just also removes payments for the
  // invoice, reproduced below). PARITY_TRACKER.md #6.
  const addInvoice = useCallback(
    (fields: {
      customerId: string;
      projectId: string;
      lineItems: InvLineItem[];
      cgstRate: number;
      sgstRate: number;
      igstRate: number;
      invoiceDate: string;
      dueDate: string;
      poNumber: string;
      poDate: string;
      invoiceType: "tax" | "proforma";
    }): Invoice => {
      const { total } = invoiceTax(
        fields.lineItems,
        fields.cgstRate,
        fields.sgstRate,
        fields.igstRate,
      );
      const inv: Invoice = {
        ...fields,
        id: nextId("invc"),
        no: `INV-2026-${String(90 + (seq % 90)).padStart(3, "0")}`,
        subtotal: fields.lineItems.reduce((s, li) => s + li.amount, 0),
        amount: total,
        paidAmount: 0,
        status: "Unpaid",
      };
      setData((d) => ({ ...d, invoices: [...d.invoices, inv] }));
      return inv;
    },
    [],
  );

  const updateInvoiceFields = useCallback(
    (
      id: string,
      fields: {
        customerId: string;
        projectId: string;
        lineItems: InvLineItem[];
        cgstRate: number;
        sgstRate: number;
        igstRate: number;
        invoiceDate: string;
        dueDate: string;
        poNumber: string;
        poDate: string;
        invoiceType: "tax" | "proforma";
      },
    ) => {
      const { subtotal, total } = invoiceTax(
        fields.lineItems,
        fields.cgstRate,
        fields.sgstRate,
        fields.igstRate,
      );
      setData((d) => ({
        ...d,
        invoices: d.invoices.map((inv) =>
          inv.id === id ? { ...inv, ...fields, subtotal, amount: total } : inv,
        ),
      }));
    },
    [],
  );

  const updateInvoiceStatus = useCallback(
    (id: string, status: Invoice["status"]) => {
      setData((d) => ({
        ...d,
        invoices: d.invoices.map((inv) =>
          inv.id === id ? { ...inv, status } : inv,
        ),
      }));
    },
    [],
  );

  const deleteInvoiceFull = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      invoices: d.invoices.filter((inv) => inv.id !== id),
      payments: d.payments.filter((p) => p.invoiceId !== id),
    }));
  }, []);

  // Real pages/Payments.tsx Record Payment — full field set + the real
  // overpayment guard ("Amount exceeds remaining balance of ₹X"). No
  // Edit/Delete on payment records — production itself has none either
  // (see the Payment type comment in data.ts). PARITY_TRACKER.md #7.
  const addPayment = useCallback(
    (fields: {
      invoiceId: string;
      amount: number;
      date: string;
      method: string;
      referenceNo: string;
      notes: string;
    }): { ok: true } | { ok: false; error: string } => {
      const inv = data.invoices.find((i) => i.id === fields.invoiceId);
      if (!inv) return { ok: false, error: "Invoice not found" };
      const remaining = inv.amount - inv.paidAmount;
      if (fields.amount > remaining + 0.001) {
        return {
          ok: false,
          error: `Amount exceeds remaining balance of ₹${remaining.toLocaleString("en-IN")}`,
        };
      }
      setData((d) => ({
        ...d,
        invoices: d.invoices.map((i) =>
          i.id === fields.invoiceId
            ? {
                ...i,
                paidAmount: i.paidAmount + fields.amount,
                status:
                  i.paidAmount + fields.amount >= i.amount
                    ? ("Paid" as const)
                    : ("PartiallyPaid" as const),
              }
            : i,
        ),
        payments: [...d.payments, { ...fields, id: nextId("pay") }],
      }));
      return { ok: true };
    },
    [data],
  );

  // Real pages/Payables.tsx action surface — Add Payable, Add Payment
  // against a payable (same real overpayment guard pattern as Invoices'
  // Record Payment), Delete. PARITY_TRACKER.md #8.
  const addPayable = useCallback(
    (fields: {
      vendorId: string;
      paymentType: string;
      amount: number;
      dueDate: string;
      projectId: string | null;
      notes: string;
    }): Payable => {
      const p: Payable = { ...fields, id: nextId("pay-v"), paidAmount: 0 };
      setData((d) => ({ ...d, payables: [...d.payables, p] }));
      return p;
    },
    [],
  );

  const addPayablePayment = useCallback(
    (fields: {
      payableId: string;
      amount: number;
      paymentDate: string;
      mode: string;
      referenceNo: string;
      notes: string;
    }): { ok: true } | { ok: false; error: string } => {
      const payable = data.payables.find((p) => p.id === fields.payableId);
      if (!payable) return { ok: false, error: "Payable not found" };
      const balance = payable.amount - payable.paidAmount;
      if (fields.amount > balance) {
        return {
          ok: false,
          error: `Amount exceeds balance of ₹${balance.toLocaleString("en-IN")}`,
        };
      }
      setData((d) => ({
        ...d,
        payables: d.payables.map((p) =>
          p.id === fields.payableId
            ? { ...p, paidAmount: p.paidAmount + fields.amount }
            : p,
        ),
        payablePayments: [
          ...d.payablePayments,
          { ...fields, id: nextId("payp") },
        ],
      }));
      return { ok: true };
    },
    [data],
  );

  const deletePayableFull = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      payables: d.payables.filter((p) => p.id !== id),
      payablePayments: d.payablePayments.filter((pp) => pp.payableId !== id),
    }));
  }, []);

  // Real pages/Inventory.tsx action surface — Add/Edit/Delete Item,
  // Record Purchase (increments stock, updates last purchase price/
  // date). PARITY_TRACKER.md #9.
  const addInventoryItemFull = useCallback(
    (fields: {
      sku: string;
      name: string;
      category: InventoryItem["category"];
      reorderAt: number;
      unit: string;
      unitCost: number;
    }): InventoryItem => {
      const item: InventoryItem = {
        ...fields,
        id: nextId("inv"),
        qty: 0,
        reserved: 0,
        lastPurchaseDate: "",
      };
      setData((d) => ({ ...d, inventory: [...d.inventory, item] }));
      return item;
    },
    [],
  );

  const updateInventoryItemFields = useCallback(
    (
      id: string,
      fields: {
        sku: string;
        name: string;
        category: InventoryItem["category"];
        reorderAt: number;
        unit: string;
        unitCost: number;
      },
    ) => {
      setData((d) => ({
        ...d,
        inventory: d.inventory.map((i) =>
          i.id === id ? { ...i, ...fields } : i,
        ),
      }));
    },
    [],
  );

  const deleteInventoryItemFull = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      inventory: d.inventory.filter((i) => i.id !== id),
      inventoryPurchases: d.inventoryPurchases.filter((p) => p.itemId !== id),
    }));
  }, []);

  const addInventoryPurchaseFull = useCallback(
    (fields: {
      itemId: string;
      vendorId: string;
      quantityPurchased: number;
      purchaseDate: string;
      cost: number;
      applyGST: boolean;
    }): InventoryPurchase => {
      const item = data.inventory.find((i) => i.id === fields.itemId);
      const purchase: InventoryPurchase = {
        ...fields,
        id: nextId("ip"),
        materialName: item?.name ?? "",
      };
      const unitCost =
        fields.quantityPurchased > 0
          ? Math.round(fields.cost / fields.quantityPurchased)
          : (item?.unitCost ?? 0);
      setData((d) => ({
        ...d,
        inventoryPurchases: [...d.inventoryPurchases, purchase],
        inventory: d.inventory.map((i) =>
          i.id === fields.itemId
            ? {
                ...i,
                qty: i.qty + fields.quantityPurchased,
                unitCost,
                lastPurchaseDate: fields.purchaseDate,
              }
            : i,
        ),
      }));
      return purchase;
    },
    [data],
  );

  // Real pages/Machinery.tsx Add/Edit — production has no delete for
  // machines (matches the lab's own pre-existing choice, confirmed real
  // in an earlier pass). PARITY_TRACKER.md #10.
  const addMachineFull = useCallback(
    (fields: {
      name: string;
      type: Machine["type"];
      status: Machine["status"];
      location: string;
      department: string;
      hourlyRate: number;
      nextServiceDue: string;
    }): Machine => {
      const machine: Machine = {
        ...fields,
        id: nextId("mch"),
        machineCode: nextId("MCH"),
      };
      setData((d) => ({ ...d, machines: [...d.machines, machine] }));
      return machine;
    },
    [],
  );

  const updateMachineFields = useCallback(
    (
      id: string,
      fields: {
        name: string;
        type: Machine["type"];
        status: Machine["status"];
        location: string;
        department: string;
        hourlyRate: number;
        nextServiceDue: string;
      },
    ) => {
      setData((d) => ({
        ...d,
        machines: d.machines.map((m) =>
          m.id === id ? { ...m, ...fields } : m,
        ),
      }));
    },
    [],
  );

  const addToolFull = useCallback(
    (fields: {
      name: string;
      category?: string;
      quantity: number;
      location?: string;
      assignedEmployeeId?: string;
      condition?: Tool["condition"];
      status: Tool["status"];
      purchaseDate?: string;
      replacementValue?: number;
      notes?: string;
      photoData?: string;
      purchaseVendorId?: string;
      purchaseVendorName?: string;
    }): Tool => {
      let tool!: Tool;
      setData((d) => {
        tool = {
          ...fields,
          id: nextId("tool"),
          toolCode: `TL-${String(d.tools.length + 1).padStart(3, "0")}`,
          isActive: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        return { ...d, tools: [...d.tools, tool] };
      });
      return tool;
    },
    [],
  );

  const updateToolFields = useCallback(
    (
      id: string,
      fields: {
        name: string;
        category?: string;
        quantity: number;
        location?: string;
        assignedEmployeeId?: string;
        condition?: Tool["condition"];
        status: Tool["status"];
        purchaseDate?: string;
        replacementValue?: number;
        notes?: string;
        photoData?: string;
        purchaseVendorId?: string;
        purchaseVendorName?: string;
      },
    ) => {
      setData((d) => ({
        ...d,
        tools: d.tools.map((t) =>
          t.id === id ? { ...t, ...fields, updatedAt: Date.now() } : t,
        ),
      }));
    },
    [],
  );

  const issueTool = useCallback((toolId: string, employeeId: string) => {
    setData((d) => ({
      ...d,
      tools: d.tools.map((t) =>
        t.id === toolId
          ? {
              ...t,
              assignedEmployeeId: employeeId,
              status: "In Use" as const,
              updatedAt: Date.now(),
            }
          : t,
      ),
      toolAssignmentHistory: [
        ...d.toolAssignmentHistory,
        {
          id: nextId("tah"),
          toolId,
          action: "issued" as const,
          employeeId,
          recordedAt: Date.now(),
        },
      ],
    }));
  }, []);

  const returnTool = useCallback((toolId: string) => {
    setData((d) => ({
      ...d,
      tools: d.tools.map((t) =>
        t.id === toolId
          ? {
              ...t,
              assignedEmployeeId: undefined,
              status: "Available" as const,
              updatedAt: Date.now(),
            }
          : t,
      ),
      toolAssignmentHistory: [
        ...d.toolAssignmentHistory,
        {
          id: nextId("tah"),
          toolId,
          action: "returned" as const,
          recordedAt: Date.now(),
        },
      ],
    }));
  }, []);

  const addDieFull = useCallback(
    (fields: {
      name: string;
      type?: string;
      purpose?: string;
      compatibleMachineId?: string;
      originalProjectId?: string;
      location?: string;
      status: Die["status"];
      dateCreated?: string;
      condition?: Die["condition"];
      notes?: string;
      photoData?: string;
      purchaseDate?: string;
      purchaseCost?: number;
      purchaseVendorId?: string;
      purchaseVendorName?: string;
      linkedDrawingIds: string[];
    }): Die => {
      let die!: Die;
      setData((d) => {
        die = {
          ...fields,
          id: nextId("die"),
          dieCode: `DIE-${String(d.dies.length + 1).padStart(3, "0")}`,
          isActive: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        return { ...d, dies: [...d.dies, die] };
      });
      return die;
    },
    [],
  );

  const updateDieFields = useCallback(
    (
      id: string,
      fields: {
        name: string;
        type?: string;
        purpose?: string;
        compatibleMachineId?: string;
        originalProjectId?: string;
        location?: string;
        status: Die["status"];
        dateCreated?: string;
        condition?: Die["condition"];
        notes?: string;
        photoData?: string;
        purchaseDate?: string;
        purchaseCost?: number;
        purchaseVendorId?: string;
        purchaseVendorName?: string;
        linkedDrawingIds: string[];
      },
    ) => {
      setData((d) => ({
        ...d,
        dies: d.dies.map((x) =>
          x.id === id ? { ...x, ...fields, updatedAt: Date.now() } : x,
        ),
      }));
    },
    [],
  );

  const deleteDie = useCallback((id: string) => {
    setData((d) => ({ ...d, dies: d.dies.filter((x) => x.id !== id) }));
  }, []);

  const employeeDuplicateExists = useCallback(
    (name: string, phone: string): Employee | null => {
      if (!phone.trim()) return null;
      return (
        data.employees.find(
          (e) =>
            e.name.trim().toLowerCase() === name.trim().toLowerCase() &&
            e.phone.trim() === phone.trim(),
        ) ?? null
      );
    },
    [data.employees],
  );

  const addEmployeeFull = useCallback(
    (fields: {
      name: string;
      phone: string;
      role: Employee["role"];
      monthlySalary: number;
      joiningDate: string;
      photoRef?: string;
      designation?: string;
      bloodGroup?: string;
      emergencyContactName?: string;
      emergencyContactRelation?: string;
      emergencyContactPhone?: string;
      employmentType?: Employee["employmentType"];
      tempStartDate?: string;
      tempEndDate?: string;
      dailyWageRate?: number;
    }): Employee => {
      const emp: Employee = { ...fields, id: nextId("emp"), userId: "" };
      setData((d) => ({ ...d, employees: [...d.employees, emp] }));
      return emp;
    },
    [],
  );

  const updateEmployeeFields = useCallback(
    (
      id: string,
      fields: {
        name: string;
        phone: string;
        role: Employee["role"];
        monthlySalary: number;
        joiningDate: string;
        photoRef?: string;
        designation?: string;
        bloodGroup?: string;
        emergencyContactName?: string;
        emergencyContactRelation?: string;
        emergencyContactPhone?: string;
        employmentType?: Employee["employmentType"];
        tempStartDate?: string;
        tempEndDate?: string;
        dailyWageRate?: number;
      },
    ) => {
      setData((d) => ({
        ...d,
        employees: d.employees.map((e) =>
          e.id === id ? { ...e, ...fields } : e,
        ),
      }));
    },
    [],
  );

  const dcRemainingQty = useCallback(
    (projectId: string, excludeChallanId?: string): number => {
      const project = data.projects.find((p) => p.id === projectId);
      const total = project?.qty ?? 0;
      const dispatched = data.deliveryChallans
        .filter((dc) => dc.id !== excludeChallanId)
        .reduce((sum, dc) => {
          const entry = dc.projectEntries.find(
            (e) => e.projectId === projectId,
          );
          return sum + (entry?.dispatchQty ?? 0);
        }, 0);
      return total - dispatched;
    },
    [data.projects, data.deliveryChallans],
  );

  const dcNumberExists = useCallback(
    (dcNo: string) => data.deliveryChallans.some((dc) => dc.dcNo === dcNo),
    [data.deliveryChallans],
  );

  const addDeliveryChallanFull = useCallback(
    (fields: {
      dcNo: string;
      customerId: string;
      projectEntries: DCProjectEntry[];
      dispatchMethod: DeliveryChallan["dispatchMethod"];
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
      deliveryAddress: DeliveryChallan["deliveryAddress"];
    }): DeliveryChallan => {
      const totalQty = fields.projectEntries.reduce(
        (s, e) => s + e.dispatchQty,
        0,
      );
      const dc: DeliveryChallan = {
        ...fields,
        id: nextId("dc"),
        status: "Prepared",
        createdAt: Date.now(),
        no: fields.dcNo,
        projectId: fields.projectEntries[0]?.projectId ?? "",
        qty: totalQty,
        dispatchedAt: fields.dispatchDate,
      };
      setData((d) => ({ ...d, deliveryChallans: [...d.deliveryChallans, dc] }));
      return dc;
    },
    [],
  );

  const updateDeliveryChallanFull = useCallback(
    (
      id: string,
      fields: {
        projectEntries: DCProjectEntry[];
        dispatchMethod: DeliveryChallan["dispatchMethod"];
        vehicleNo?: string;
        driverName?: string;
        courierCompany?: string;
        trackingNumber?: string;
        transportCompany?: string;
        lrNumber?: string;
        collectedBy?: string;
        mobileNumber?: string;
        receiverName: string;
        deliveryAddress: DeliveryChallan["deliveryAddress"];
      },
    ) => {
      setData((d) => ({
        ...d,
        deliveryChallans: d.deliveryChallans.map((dc) =>
          dc.id === id
            ? {
                ...dc,
                ...fields,
                projectId: fields.projectEntries[0]?.projectId ?? dc.projectId,
                qty: fields.projectEntries.reduce(
                  (s, e) => s + e.dispatchQty,
                  0,
                ),
              }
            : dc,
        ),
      }));
    },
    [],
  );

  const updateDeliveryChallanStatus = useCallback(
    (id: string, status: DCStatus) => {
      setData((d) => ({
        ...d,
        deliveryChallans: d.deliveryChallans.map((dc) =>
          dc.id === id ? { ...dc, status } : dc,
        ),
      }));
    },
    [],
  );

  const genCpoNumber = useCallback(() => {
    const nums = data.companyPOs.map((p) => {
      const m = p.cpoNumber.match(/CPO-(\d+)/);
      return m ? Number(m[1]) : 0;
    });
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return `CPO-${String(next).padStart(3, "0")}`;
  }, [data.companyPOs]);

  const addCompanyPOFull = useCallback(
    (fields: {
      vendorId?: string;
      vendorName: string;
      vendorAddress?: string;
      vendorGst?: string;
      vendorContact?: string;
      items: CompanyPOItem[];
      deliveryAddress?: string;
      expectedDeliveryDate?: string;
      gstPercent?: number;
      termsAndConditions?: string;
      notes?: string;
      file?: CompanyPO["file"];
    }): CompanyPO => {
      const subtotal = fields.items.reduce((s, i) => s + i.amount, 0);
      const gstAmount = subtotal * ((fields.gstPercent || 0) / 100);
      let po!: CompanyPO;
      setData((d) => {
        const nums = d.companyPOs.map((p) => {
          const m = p.cpoNumber.match(/CPO-(\d+)/);
          return m ? Number(m[1]) : 0;
        });
        po = {
          ...fields,
          id: nextId("cpo"),
          cpoNumber: `CPO-${String((nums.length > 0 ? Math.max(...nums) : 0) + 1).padStart(3, "0")}`,
          status: "Draft",
          subtotal,
          gstAmount,
          grandTotal: subtotal + gstAmount,
          createdAt: Date.now(),
        };
        return { ...d, companyPOs: [...d.companyPOs, po] };
      });
      return po;
    },
    [],
  );

  const updateCompanyPOFull = useCallback(
    (
      id: string,
      fields: {
        vendorId?: string;
        vendorName: string;
        vendorAddress?: string;
        vendorGst?: string;
        vendorContact?: string;
        items: CompanyPOItem[];
        deliveryAddress?: string;
        expectedDeliveryDate?: string;
        gstPercent?: number;
        termsAndConditions?: string;
        notes?: string;
        file?: CompanyPO["file"];
      },
    ) => {
      const subtotal = fields.items.reduce((s, i) => s + i.amount, 0);
      const gstAmount = subtotal * ((fields.gstPercent || 0) / 100);
      setData((d) => ({
        ...d,
        companyPOs: d.companyPOs.map((po) =>
          po.id === id
            ? {
                ...po,
                ...fields,
                subtotal,
                gstAmount,
                grandTotal: subtotal + gstAmount,
              }
            : po,
        ),
      }));
    },
    [],
  );

  const updateCompanyPOStatus = useCallback(
    (id: string, status: CompanyPOStatus) => {
      setData((d) => ({
        ...d,
        companyPOs: d.companyPOs.map((po) =>
          po.id === id ? { ...po, status } : po,
        ),
      }));
    },
    [],
  );

  const resolveFloatLinkFn = useCallback(
    (candidateFloatId: string | undefined, employeeId: string) => {
      if (!candidateFloatId) return undefined;
      const f = data.expenseFloats.find((x) => x.id === candidateFloatId);
      if (!f || f.status === "Fully Settled" || f.employeeId !== employeeId) {
        return undefined;
      }
      return candidateFloatId;
    },
    [data.expenseFloats],
  );

  const addPettyExpenseFull = useCallback(
    (fields: {
      date: string;
      employeeId: string;
      amount: number;
      expenseType: PettyExpenseType;
      expenseMode: PettyExpenseMode;
      projectId?: string;
      floatId?: string;
      notes?: string;
    }): PettyExpense => {
      const expense: PettyExpense = {
        ...fields,
        id: nextId("pe"),
        createdAt: new Date().toISOString(),
      };
      setData((d) => {
        const pettyExpenses = [...d.pettyExpenses, expense];
        return {
          ...d,
          pettyExpenses,
          expenseFloats: recomputeFloats(pettyExpenses, d.expenseFloats),
        };
      });
      return expense;
    },
    [],
  );

  const updatePettyExpenseFull = useCallback(
    (
      id: string,
      fields: {
        date: string;
        employeeId: string;
        amount: number;
        expenseType: PettyExpenseType;
        expenseMode: PettyExpenseMode;
        projectId?: string;
        floatId?: string;
        notes?: string;
      },
    ) => {
      setData((d) => {
        const pettyExpenses = d.pettyExpenses.map((e) =>
          e.id === id ? { ...e, ...fields } : e,
        );
        return {
          ...d,
          pettyExpenses,
          expenseFloats: recomputeFloats(pettyExpenses, d.expenseFloats),
        };
      });
    },
    [],
  );

  const addExpenseFloatFull = useCallback(
    (fields: {
      employeeId: string;
      issuedDate: string;
      issuedAmount: number;
      purpose?: string;
      notes?: string;
      projectId?: string;
    }): ExpenseFloat => {
      let float!: ExpenseFloat;
      setData((d) => {
        const num = d.expenseFloats.length + 1;
        float = {
          ...fields,
          id: nextId("flt"),
          floatNo: `FLT-${new Date().getFullYear()}-${String(num).padStart(3, "0")}`,
          spentAmount: 0,
          returnedAmount: 0,
          balanceAmount: fields.issuedAmount,
          status: "Open",
          issuedBy: "admin",
          createdAt: Date.now(),
        };
        return { ...d, expenseFloats: [...d.expenseFloats, float] };
      });
      return float;
    },
    [],
  );

  const returnExpenseFloatAmount = useCallback(
    (id: string, returnedAmount: number) => {
      setData((d) => {
        const expenseFloats = d.expenseFloats.map((f) =>
          f.id === id ? { ...f, returnedAmount } : f,
        );
        return {
          ...d,
          expenseFloats: recomputeFloats(d.pettyExpenses, expenseFloats),
        };
      });
    },
    [],
  );

  const currentServiceRate = useCallback(
    (billableServiceId: string): number => {
      const sorted = data.machineServiceRates
        .filter((r) => r.billableServiceId === billableServiceId)
        .sort((a, b) => b.effectiveFrom - a.effectiveFrom);
      return sorted[0]?.rate ?? 0;
    },
    [data.machineServiceRates],
  );

  const serviceDeleteBlockReason = useCallback(
    (billableServiceId: string): string | null => {
      const hasUsage = data.machineServiceUsage.some(
        (u) => u.billableServiceId === billableServiceId,
      );
      return hasUsage
        ? "Services with recorded usage cannot be deleted."
        : null;
    },
    [data.machineServiceUsage],
  );

  const addBillableServiceFull = useCallback(
    (fields: {
      name: string;
      machineId?: string;
      chargingMethod: ChargingMethod;
      unitLabel?: string;
      initialRate?: number;
    }): BillableService => {
      const service: BillableService = {
        id: nextId("bsv"),
        name: fields.name,
        machineId: fields.machineId,
        chargingMethod: fields.chargingMethod,
        unitLabel: fields.unitLabel,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setData((d) => ({
        ...d,
        billableServices: [...d.billableServices, service],
        machineServiceRates:
          fields.initialRate != null && fields.initialRate >= 0
            ? [
                ...d.machineServiceRates,
                {
                  id: nextId("msr"),
                  billableServiceId: service.id,
                  rate: fields.initialRate,
                  effectiveFrom: Date.now(),
                  createdAt: Date.now(),
                },
              ]
            : d.machineServiceRates,
      }));
      return service;
    },
    [],
  );

  const updateBillableServiceFull = useCallback(
    (
      id: string,
      fields: {
        name: string;
        machineId?: string;
        chargingMethod: ChargingMethod;
        unitLabel?: string;
        isActive: boolean;
      },
    ) => {
      setData((d) => ({
        ...d,
        billableServices: d.billableServices.map((s) =>
          s.id === id ? { ...s, ...fields, updatedAt: Date.now() } : s,
        ),
      }));
    },
    [],
  );

  const deleteBillableServiceFull = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      billableServices: d.billableServices.filter((s) => s.id !== id),
    }));
  }, []);

  const changeServiceRate = useCallback(
    (billableServiceId: string, rate: number) => {
      setData((d) => ({
        ...d,
        machineServiceRates: [
          ...d.machineServiceRates,
          {
            id: nextId("msr"),
            billableServiceId,
            rate,
            effectiveFrom: Date.now(),
            createdAt: Date.now(),
          },
        ],
      }));
    },
    [],
  );

  const addServiceUsageFull = useCallback(
    (fields: {
      projectId: string;
      billableServiceId: string;
      usageDate: string;
      quantity: number;
      notes?: string;
    }): MachineServiceUsage => {
      let usage!: MachineServiceUsage;
      setData((d) => {
        const service = d.billableServices.find(
          (s) => s.id === fields.billableServiceId,
        );
        const sorted = d.machineServiceRates
          .filter((r) => r.billableServiceId === fields.billableServiceId)
          .sort((a, b) => b.effectiveFrom - a.effectiveFrom);
        const rate = sorted[0]?.rate ?? 0;
        usage = {
          ...fields,
          id: nextId("msu"),
          unit: service?.unitLabel,
          rateApplied: rate,
          revenueAmount: fields.quantity * rate,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        return {
          ...d,
          machineServiceUsage: [...d.machineServiceUsage, usage],
        };
      });
      return usage;
    },
    [],
  );

  const updateServiceUsageFull = useCallback(
    (
      id: string,
      fields: { usageDate: string; quantity: number; notes?: string },
    ) => {
      setData((d) => ({
        ...d,
        machineServiceUsage: d.machineServiceUsage.map((u) =>
          u.id === id
            ? {
                ...u,
                ...fields,
                // rateApplied stays frozen — revenueAmount recomputed
                // from the ORIGINAL frozen rate, never the current one,
                // exactly matching production's real edit behavior.
                revenueAmount: fields.quantity * u.rateApplied,
                updatedAt: Date.now(),
              }
            : u,
        ),
      }));
    },
    [],
  );

  const deleteServiceUsageFull = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      machineServiceUsage: d.machineServiceUsage.filter((u) => u.id !== id),
    }));
  }, []);

  const addScrapRecordFull = useCallback(
    (fields: {
      projectId?: string;
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
    }): ScrapRecord => {
      let rec!: ScrapRecord;
      setData((d) => {
        rec = {
          ...fields,
          id: nextId("scrap"),
          projectName: d.projects.find((p) => p.id === fields.projectId)?.name,
          recordedBy: "admin",
          createdAt: Date.now(),
        };
        return { ...d, scrapRecords: [...d.scrapRecords, rec] };
      });
      return rec;
    },
    [],
  );

  const updateScrapRecordFull = useCallback(
    (
      id: string,
      fields: {
        projectId?: string;
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
      },
    ) => {
      setData((d) => ({
        ...d,
        scrapRecords: d.scrapRecords.map((r) =>
          r.id === id
            ? {
                ...r,
                ...fields,
                projectName: d.projects.find((p) => p.id === fields.projectId)
                  ?.name,
              }
            : r,
        ),
      }));
    },
    [],
  );

  const updateProjectStagesFull = useCallback(
    (projectId: string, stages: ProjectProductionStage[]) => {
      setData((d) => ({
        ...d,
        projectProductions: d.projectProductions.map((pp) =>
          pp.projectId === projectId ? { ...pp, stages } : pp,
        ),
      }));
    },
    [],
  );

  const addStageTransactionFull = useCallback(
    (projectId: string, stageIdx: number, tx: StageTransaction) => {
      setData((d) => ({
        ...d,
        projectProductions: d.projectProductions.map((pp) => {
          if (pp.projectId !== projectId) return pp;
          const stages = pp.stages.map((s, i) => {
            if (i !== stageIdx) return s;
            const transactions = [...(s.transactions || []), tx];
            if (tx.type === "send") {
              return {
                ...s,
                transactions,
                quantitySent: s.quantitySent + tx.quantity,
                sentDateTime: tx.dateTime,
                sentToVendorId: tx.sentToVendorId || s.sentToVendorId,
                sentToVendorName: tx.sentToVendorName || s.sentToVendorName,
                status:
                  s.status === "NotStarted" ? ("Sent" as const) : s.status,
              };
            }
            return {
              ...s,
              transactions,
              receivedQuantity: s.receivedQuantity + tx.quantity,
              receivedDateTime: tx.dateTime,
            };
          });
          return { ...pp, stages };
        }),
      }));
    },
    [],
  );

  const completeBomRequisition = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      bomRequisitions: d.bomRequisitions.map((r) =>
        r.id === id
          ? { ...r, status: "Completed" as const, updatedAt: Date.now() }
          : r,
      ),
    }));
  }, []);

  const addCharacteristicFull = useCallback(
    (fields: {
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
    }): QualityCharacteristic => {
      const c: QualityCharacteristic = {
        ...fields,
        id: nextId("qc"),
        status: "Active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setData((d) => ({
        ...d,
        qualityCharacteristics: [...d.qualityCharacteristics, c],
      }));
      return c;
    },
    [],
  );

  const updateCharacteristicFull = useCallback(
    (
      id: string,
      fields: {
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
      },
    ) => {
      setData((d) => ({
        ...d,
        qualityCharacteristics: d.qualityCharacteristics.map((c) =>
          c.id === id ? { ...c, ...fields, updatedAt: Date.now() } : c,
        ),
      }));
    },
    [],
  );

  const generateInspectionSheet = useCallback(
    (projectId: string, mode: InspectionMode): InspectionSheet => {
      let sheet!: InspectionSheet;
      setData((d) => {
        const nums = d.inspectionSheets.map((s) => {
          const m = s.inspectionNumber.match(/INS-\d{4}-(\d+)/);
          return m ? Number(m[1]) : 0;
        });
        const next = (nums.length > 0 ? Math.max(...nums) : 0) + 1;
        sheet = {
          id: nextId("ins"),
          projectId,
          inspectionNumber: `INS-${new Date().getFullYear()}-${String(next).padStart(3, "0")}`,
          revision: 1,
          mode,
          status: "Draft",
          generatedAt: Date.now(),
          generatedBy: "admin",
        };
        return { ...d, inspectionSheets: [...d.inspectionSheets, sheet] };
      });
      return sheet;
    },
    [],
  );

  const advanceInspectionSheetStatus = useCallback(
    (id: string, status: InspectionSheetStatus) => {
      setData((d) => ({
        ...d,
        inspectionSheets: d.inspectionSheets.map((s) =>
          s.id === id ? { ...s, status } : s,
        ),
      }));
    },
    [],
  );

  const addProjectQmsInspection = useCallback(
    (
      projectId: string,
      processId: string,
      mode: InspectionMode,
    ):
      | { ok: true; data: ProjectQmsInspection }
      | { ok: false; error: string } => {
      let result:
        | { ok: true; data: ProjectQmsInspection }
        | { ok: false; error: string } = {
        ok: false,
        error: "Select a process",
      };
      setData((d) => {
        const existing = d.projectQmsInspections.find(
          (i) => i.projectId === projectId && i.processId === processId,
        );
        if (existing) {
          result = {
            ok: false,
            error: "already exists for this project",
          };
          return d;
        }
        const process = d.manufacturingProcesses.find(
          (p) => p.id === processId,
        );
        if (!process) return d;
        const inspection: ProjectQmsInspection = {
          id: nextId("pqi"),
          projectId,
          processId,
          processName: process.name,
          mode,
          status: "NotStarted",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        const chars = d.qualityCharacteristics
          .filter((c) => c.processId === processId && c.status === "Active")
          .map((c, i) => ({
            id: nextId("pqic"),
            projectQmsInspectionId: inspection.id,
            characteristicId: c.id,
            nameSnapshot: c.name,
            sequence: i + 1,
          }));
        result = { ok: true, data: inspection };
        return {
          ...d,
          projectQmsInspections: [...d.projectQmsInspections, inspection],
          projectQmsInspectionCharacteristics: [
            ...d.projectQmsInspectionCharacteristics,
            ...chars,
          ],
        };
      });
      return result;
    },
    [],
  );

  const recordCharacteristicResult = useCallback(
    (
      id: string,
      result: "Pass" | "Fail" | "NA",
      measuredValue?: string,
      remarks?: string,
      failureReason?: string,
    ) => {
      setData((d) => {
        const projectQmsInspectionCharacteristics =
          d.projectQmsInspectionCharacteristics.map((c) =>
            c.id === id
              ? { ...c, result, measuredValue, remarks, failureReason }
              : c,
          );
        const target = projectQmsInspectionCharacteristics.find(
          (c) => c.id === id,
        );
        if (!target) return { ...d, projectQmsInspectionCharacteristics };
        const siblings = projectQmsInspectionCharacteristics.filter(
          (c) => c.projectQmsInspectionId === target.projectQmsInspectionId,
        );
        const status: ProjectQmsInspection["status"] = siblings.some(
          (c) => c.result === "Fail",
        )
          ? "Failed"
          : siblings.every((c) => c.result === "Pass" || c.result === "NA")
            ? "Passed"
            : siblings.some((c) => c.result)
              ? "InProgress"
              : "NotStarted";
        const projectQmsInspections = d.projectQmsInspections.map((i) =>
          i.id === target.projectQmsInspectionId
            ? { ...i, status, updatedAt: Date.now() }
            : i,
        );
        return {
          ...d,
          projectQmsInspectionCharacteristics,
          projectQmsInspections,
        };
      });
    },
    [],
  );

  const addDrawingFull = useCallback(
    (fields: {
      fileName: string;
      numPages: number;
      ownerType: DrawingOwnerType;
      ownerId?: string;
      category?: DrawingCategory;
      status: "Draft" | "Approved";
      notes?: string;
      tags: string[];
    }): Drawing => {
      const d: Drawing = {
        ...fields,
        id: nextId("dwg"),
        version: 1,
        uploadedBy: "admin",
        uploadedAt: Date.now(),
        projectId: fields.ownerType === "project" ? (fields.ownerId ?? "") : "",
      };
      setData((prev) => ({ ...prev, drawings: [...prev.drawings, d] }));
      return d;
    },
    [],
  );

  const updateDrawingFull = useCallback(
    (
      id: string,
      fields: {
        fileName: string;
        numPages: number;
        ownerType: DrawingOwnerType;
        ownerId?: string;
        category?: DrawingCategory;
        status: "Draft" | "Approved";
        notes?: string;
        tags: string[];
      },
    ) => {
      setData((d) => ({
        ...d,
        drawings: d.drawings.map((dw) =>
          dw.id === id
            ? {
                ...dw,
                ...fields,
                projectId:
                  fields.ownerType === "project" ? (fields.ownerId ?? "") : "",
              }
            : dw,
        ),
      }));
    },
    [],
  );

  const addDrawingLinkFull = useCallback(
    (drawingId: string, linkedType: DrawingLinkedType, linkedId: string) => {
      setData((d) => ({
        ...d,
        drawingLinks: [
          ...d.drawingLinks,
          {
            id: nextId("dwl"),
            drawingId,
            linkedType,
            linkedId,
            createdAt: Date.now(),
          },
        ],
      }));
    },
    [],
  );

  const removeDrawingLinkFull = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      drawingLinks: d.drawingLinks.filter((l) => l.id !== id),
    }));
  }, []);

  const updateAppSettingsFull = useCallback((fields: Partial<AppSettings>) => {
    setData((d) => ({ ...d, settings: { ...d.settings, ...fields } }));
  }, []);

  const exportBackup = useCallback(() => {
    return JSON.stringify(
      { version: "uxlab-v1", exportedAt: new Date().toISOString(), ...data },
      null,
      2,
    );
  }, [data]);

  const restoreBackup = useCallback(
    (json: string): { ok: true } | { ok: false; error: string } => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        return { ok: false, error: "Failed to parse backup file." };
      }
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        (parsed as Record<string, unknown>).version !== "uxlab-v1" ||
        !("customers" in parsed) ||
        !("projects" in parsed)
      ) {
        return {
          ok: false,
          error: "Invalid backup file. Version or structure mismatch.",
        };
      }
      const {
        version: _v,
        exportedAt: _e,
        ...restored
      } = parsed as Record<string, unknown>;
      setData(restored as DataState);
      return { ok: true };
    },
    [],
  );

  const createOrgUserFull = useCallback(
    (
      username: string,
      role: UserRole,
    ): { ok: true; user: OrgUser } | { ok: false; error: string } => {
      const trimmed = username.trim();
      if (!trimmed) return { ok: false, error: "Username is required" };
      let result: { ok: true; user: OrgUser } | { ok: false; error: string } = {
        ok: false,
        error: "",
      };
      setData((d) => {
        const conflict = d.orgUsers.some(
          (u) => u.username.toLowerCase() === trimmed.toLowerCase(),
        );
        if (conflict) {
          result = { ok: false, error: "Username already taken" };
          return d;
        }
        const user: OrgUser = {
          id: nextId("user"),
          username: trimmed,
          role,
          isActive: true,
          mustChangePassword: true,
          overrides: {},
          createdAt: Date.now(),
        };
        result = { ok: true, user };
        return {
          ...d,
          orgUsers: [...d.orgUsers, user],
          securityAuditLog: [
            logAudit({
              eventType: "user_created",
              actorUsername: "admin",
              targetUsername: user.username,
              metadata: { role },
            }),
            ...d.securityAuditLog,
          ],
        };
      });
      return result;
    },
    [],
  );

  const updateOrgUserRoleFull = useCallback((id: string, role: UserRole) => {
    setData((d) => {
      const user = d.orgUsers.find((u) => u.id === id);
      if (!user || user.role === role) return d;
      return {
        ...d,
        orgUsers: d.orgUsers.map((u) => (u.id === id ? { ...u, role } : u)),
        securityAuditLog: [
          logAudit({
            eventType: "user_role_changed",
            actorUsername: "admin",
            targetUsername: user.username,
            metadata: { from: user.role, to: role },
          }),
          ...d.securityAuditLog,
        ],
      };
    });
  }, []);

  const updateOrgUserOverridesFull = useCallback(
    (id: string, overrides: PermissionMap) => {
      setData((d) => {
        const user = d.orgUsers.find((u) => u.id === id);
        if (!user) return d;
        return {
          ...d,
          orgUsers: d.orgUsers.map((u) =>
            u.id === id ? { ...u, overrides } : u,
          ),
          securityAuditLog: [
            logAudit({
              eventType: "user_permissions_changed",
              actorUsername: "admin",
              targetUsername: user.username,
              metadata: { overrideCount: Object.keys(overrides).length },
            }),
            ...d.securityAuditLog,
          ],
        };
      });
    },
    [],
  );

  const setOrgUserActiveFull = useCallback((id: string, isActive: boolean) => {
    setData((d) => {
      const user = d.orgUsers.find((u) => u.id === id);
      if (!user || user.isActive === isActive) return d;
      return {
        ...d,
        orgUsers: d.orgUsers.map((u) => (u.id === id ? { ...u, isActive } : u)),
        securityAuditLog: [
          logAudit({
            eventType: isActive ? "user_reactivated" : "user_deactivated",
            actorUsername: "admin",
            targetUsername: user.username,
            metadata: {},
          }),
          ...d.securityAuditLog,
        ],
      };
    });
  }, []);

  const logAgentAuditFull = useCallback(
    (
      eventType: SecurityAuditEventType,
      metadata: Record<string, string | number | boolean>,
    ) => {
      setData((d) => ({
        ...d,
        securityAuditLog: [
          logAudit({ eventType, actorUsername: "admin", metadata }),
          ...d.securityAuditLog,
        ],
      }));
    },
    [],
  );

  const addRecord = useCallback(
    (
      entity: EntityKey,
      v: Record<string, string>,
    ): { id: string; label: string } => {
      const id = nextId(entity);
      const today = new Date().toISOString().slice(0, 10);
      let label = "";
      setData((d) => {
        switch (entity) {
          case "customers": {
            // Generic-form path (kept for architecture consistency with
            // the other 12 entities) — the real create/edit UI for
            // Customers is the dedicated CustomerFormDialog + addCustomer/
            // updateCustomer below, which carries the full real field set
            // (see PARITY_TRACKER.md #1). This path fills sensible
            // defaults for the fields a bare {name, contact} form can't
            // supply, so it stays fully typed rather than a stub.
            label = v.name;
            return {
              ...d,
              customers: [
                ...d.customers,
                {
                  id,
                  name: v.name,
                  contact: v.contact,
                  contactPerson: v.contact,
                  phone: "",
                  email: "",
                  gstin: "",
                  stateName: "",
                  stateCode: "",
                  address: "",
                  emails: [],
                  primaryEmail: "",
                  additionalDetails: [],
                  since: "2026",
                },
              ],
            };
          }
          case "vendors": {
            // Generic-form path kept for architecture consistency; the
            // real create/edit UI is the dedicated VendorFormDialog +
            // addVendor/updateVendor below (PARITY_TRACKER.md #2).
            label = v.name;
            return {
              ...d,
              vendors: [
                ...d.vendors,
                {
                  id,
                  name: v.name,
                  contact: v.contact,
                  phone: v.contact,
                  address: "",
                  gstNumber: "",
                },
              ],
            };
          }
          case "machines": {
            // Generic-form path kept for architecture consistency; the
            // real create/edit UI is the dedicated screen below
            // (PARITY_TRACKER.md #10).
            label = v.name;
            return {
              ...d,
              machines: [
                ...d.machines,
                {
                  id,
                  machineCode: `MCH-${String(d.machines.length + 1).padStart(3, "0")}`,
                  name: v.name,
                  type: "Other" as const,
                  status: "Idle" as const,
                  location: "",
                  department: "",
                  hourlyRate: 0,
                  nextServiceDue: "",
                },
              ],
            };
          }
          case "tools": {
            // Generic-form path kept for architecture consistency; the
            // real create/edit UI is the dedicated screen below
            // (PARITY_TRACKER.md #11).
            label = v.name;
            return {
              ...d,
              tools: [
                ...d.tools,
                {
                  id,
                  toolCode: `TL-${String(d.tools.length + 1).padStart(3, "0")}`,
                  name: v.name,
                  quantity: 1,
                  location: v.location || "Unassigned",
                  status: "Available" as const,
                  isActive: true,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                },
              ],
            };
          }
          case "employees": {
            // Generic-form path kept for architecture consistency; the
            // real create/edit UI is the dedicated screen below
            // (PARITY_TRACKER.md #13).
            label = v.name;
            return {
              ...d,
              employees: [
                ...d.employees,
                {
                  id,
                  name: v.name,
                  phone: "",
                  role: "employee" as const,
                  monthlySalary: 0,
                  joiningDate: today,
                  userId: "",
                },
              ],
            };
          }
          case "inventory": {
            // Generic-form path kept for architecture consistency; the
            // real create/edit UI is the dedicated screen below
            // (PARITY_TRACKER.md #9).
            label = v.name;
            return {
              ...d,
              inventory: [
                ...d.inventory,
                {
                  id,
                  sku: v.sku,
                  name: v.name,
                  category: "raw_material" as const,
                  qty: Number(v.qty) || 0,
                  reserved: 0,
                  reorderAt: Number(v.reorderAt) || 0,
                  unit: v.unit || "units",
                  unitCost: 0,
                  lastPurchaseDate: "",
                },
              ],
            };
          }
          case "invoices": {
            // Generic-form path kept for architecture consistency; the
            // real create/edit UI is the dedicated InvoiceFormDialog +
            // addInvoice/updateInvoiceFields below (PARITY_TRACKER.md #6).
            label = `INV-2026-${String(90 + (seq % 90)).padStart(3, "0")}`;
            const proj = d.projects.find((p) => p.id === v.projectId);
            const amt = Number(v.amount) || 0;
            return {
              ...d,
              invoices: [
                ...d.invoices,
                {
                  id,
                  no: label,
                  projectId: v.projectId,
                  customerId: proj?.customerId ?? "",
                  lineItems: [
                    {
                      desc: "Invoice",
                      hsn: "",
                      qty: 1,
                      rate: amt,
                      amount: amt,
                    },
                  ],
                  subtotal: amt,
                  cgstRate: 0,
                  sgstRate: 0,
                  igstRate: 0,
                  invoiceDate: today,
                  poNumber: "",
                  poDate: "",
                  invoiceType: "tax" as const,
                  amount: amt,
                  paidAmount: 0,
                  dueDate: v.dueDate || today,
                  status: "Unpaid" as const,
                },
              ],
            };
          }
          case "payables": {
            // Generic-form path kept for architecture consistency; the
            // real create/edit UI is the dedicated PayableFormDialog +
            // addPayable below (PARITY_TRACKER.md #8).
            label = v.vendorId;
            return {
              ...d,
              payables: [
                ...d.payables,
                {
                  id,
                  vendorId: v.vendorId,
                  paymentType: "Other",
                  projectId: null,
                  notes: "",
                  amount: Number(v.amount) || 0,
                  paidAmount: 0,
                  dueDate: v.dueDate || today,
                },
              ],
            };
          }
          case "deliveryChallans": {
            // Generic-form path kept for architecture consistency; the
            // real create/edit UI is the dedicated screen below
            // (PARITY_TRACKER.md #14).
            label = `DC-2026-${String(20 + (seq % 90)).padStart(3, "0")}`;
            const entries = v.projectId
              ? [{ projectId: v.projectId, dispatchQty: Number(v.qty) || 0 }]
              : [];
            return {
              ...d,
              deliveryChallans: [
                ...d.deliveryChallans,
                {
                  id,
                  dcNo: label,
                  customerId: "",
                  projectEntries: entries,
                  dispatchMethod: "Company Vehicle" as const,
                  vehicleNo: v.vehicleNo || "",
                  dispatchDate: today,
                  receiverName: "",
                  status: "Prepared" as const,
                  createdAt: Date.now(),
                  deliveryAddress: { type: "customer" as const, value: "" },
                  no: label,
                  projectId: v.projectId || "",
                  qty: Number(v.qty) || 0,
                  dispatchedAt: today,
                },
              ],
            };
          }
          case "scrapRecords": {
            // Generic-form path kept for architecture consistency; the
            // real create/edit UI is the dedicated screen below
            // (PARITY_TRACKER.md #18).
            label = v.materialType;
            return {
              ...d,
              scrapRecords: [
                ...d.scrapRecords,
                {
                  id,
                  projectId: v.projectId || undefined,
                  materialType: v.materialType,
                  unit: "kg",
                  generatedQty: 0,
                  reusableQty: 0,
                  soldQty: 0,
                  disposedQty: 0,
                  status: "In Stock" as const,
                  recordedBy: "admin",
                  createdAt: Date.now(),
                },
              ],
            };
          }
          case "drawings": {
            // Generic-form path kept for architecture consistency; the
            // real create/edit UI is the dedicated screen below
            // (PARITY_TRACKER.md #27).
            label = v.fileName;
            return {
              ...d,
              drawings: [
                ...d.drawings,
                {
                  id,
                  fileName: v.fileName,
                  numPages: 1,
                  ownerType: "project" as const,
                  ownerId: v.projectId,
                  version: 1,
                  status: "Draft" as const,
                  uploadedBy: "admin",
                  uploadedAt: Date.now(),
                  tags: [],
                  projectId: v.projectId,
                },
              ],
            };
          }
          default:
            return d;
        }
      });
      return { id, label };
    },
    [],
  );

  const deleteRecord = useCallback((entity: EntityKey, id: string) => {
    setData((d) => {
      switch (entity) {
        case "customers":
          return { ...d, customers: d.customers.filter((x) => x.id !== id) };
        case "vendors":
          return { ...d, vendors: d.vendors.filter((x) => x.id !== id) };
        case "machines":
          return { ...d, machines: d.machines.filter((x) => x.id !== id) };
        case "tools":
          return { ...d, tools: d.tools.filter((x) => x.id !== id) };
        case "employees":
          return { ...d, employees: d.employees.filter((x) => x.id !== id) };
        case "inventory":
          return { ...d, inventory: d.inventory.filter((x) => x.id !== id) };
        case "invoices":
          return { ...d, invoices: d.invoices.filter((x) => x.id !== id) };
        case "payables":
          return { ...d, payables: d.payables.filter((x) => x.id !== id) };
        case "deliveryChallans":
          return {
            ...d,
            deliveryChallans: d.deliveryChallans.filter((x) => x.id !== id),
          };
        case "companyPOs":
          return { ...d, companyPOs: d.companyPOs.filter((x) => x.id !== id) };
        case "pettyExpenses": {
          const pettyExpenses = d.pettyExpenses.filter((x) => x.id !== id);
          return {
            ...d,
            pettyExpenses,
            expenseFloats: recomputeFloats(pettyExpenses, d.expenseFloats),
          };
        }
        case "scrapRecords":
          return {
            ...d,
            scrapRecords: d.scrapRecords.filter((x) => x.id !== id),
          };
        case "drawings":
          return { ...d, drawings: d.drawings.filter((x) => x.id !== id) };
        case "purchaseOrders":
          return {
            ...d,
            purchaseOrders: d.purchaseOrders.filter((x) => x.id !== id),
          };
        default:
          return d;
      }
    });
  }, []);

  const vendorContext = useCallback(
    (vendorId: string) => {
      const vendor = data.vendors.find((v) => v.id === vendorId);
      const purchaseOrders = data.purchaseOrders.filter(
        (p) => p.vendorId === vendorId,
      );
      const relatedProjectIds = new Set(
        purchaseOrders.map((p) => p.projectId).filter(Boolean),
      );
      const relatedProjects = data.projects.filter((p) =>
        relatedProjectIds.has(p.id),
      );
      const payable = data.payables.find((p) => p.vendorId === vendorId);
      // Real Purchase History (materialPurchases + inventoryPurchases) is
      // a distinct real concept from formal Purchase Orders above — see
      // PARITY_TRACKER.md #2.
      const materialPurchases = data.materialPurchases.filter(
        (p) => p.vendorId === vendorId,
      );
      const inventoryPurchases = data.inventoryPurchases.filter(
        (p) => p.vendorId === vendorId,
      );
      const vPayables = data.payables.filter((p) => p.vendorId === vendorId);
      const totalPayablesAmt = vPayables.reduce((s, p) => s + p.amount, 0);
      const pendingBalance = vPayables.reduce(
        (s, p) => s + (p.amount - p.paidAmount),
        0,
      );
      const totalPurchaseCount =
        materialPurchases.length + inventoryPurchases.length;
      return {
        vendor,
        purchaseOrders,
        relatedProjects,
        payable,
        materialPurchases,
        inventoryPurchases,
        vPayables,
        totalPayablesAmt,
        pendingBalance,
        totalPurchaseCount,
      };
    },
    [data],
  );

  const customerContext = useCallback(
    (customerId: string) => {
      const customer = data.customers.find((c) => c.id === customerId);
      const quotations = data.quotations.filter(
        (q) => q.customerId === customerId,
      );
      const projects = data.projects.filter((p) => p.customerId === customerId);
      const projectIds = new Set(projects.map((p) => p.id));
      const invoices = data.invoices.filter((i) => projectIds.has(i.projectId));
      return { customer, quotations, projects, invoices };
    },
    [data],
  );

  const attentionItems: AttentionItem[] = useMemo(() => {
    const today = new Date("2026-08-30");
    const items: AttentionItem[] = [];
    for (const s of data.stages) {
      if (s.status === "Blocked") {
        const p = data.projects.find((pr) => pr.id === s.projectId);
        items.push({
          id: `stage-${s.id}`,
          title: `${p?.no ?? "Project"} is blocked at ${s.name}`,
          detail: s.blockedReason ?? "Blocked",
          severity: "critical",
          module: "Production",
          navigateTo: { view: "project", id: s.projectId },
        });
      }
    }
    for (const m of data.machines) {
      if (m.status === "Breakdown")
        items.push({
          id: `machine-${m.id}`,
          title: `${m.name} is down`,
          detail: "Offline — check Machinery for queued jobs behind it",
          severity: "critical",
          module: "Machinery",
          navigateTo: { view: "machinery", id: m.id },
        });
    }
    for (const inv of data.invoices) {
      const balance = inv.amount - inv.paidAmount;
      if (balance > 0 && new Date(inv.dueDate) < today) {
        const days = Math.round(
          (today.getTime() - new Date(inv.dueDate).getTime()) / 86400000,
        );
        items.push({
          id: `inv-${inv.id}`,
          title: `${inv.no} is ${days} days overdue`,
          detail: `₹${balance.toLocaleString("en-IN")} outstanding`,
          severity: "warning",
          module: "Invoices",
          navigateTo: { view: "invoice", id: inv.id },
        });
      }
    }
    for (const it of data.inventory) {
      // Checked against Available (qty - reserved), not raw Total Stock —
      // matches production's real reorder logic and the Reserved/
      // Available split restored during the UX Consolidation pass
      // (decisionlab/UX_CONSOLIDATION.md §2, row 9). A prior version of
      // this check compared raw `qty`, which would have under-alerted
      // once material was reserved against an in-flight order.
      const available = it.qty - it.reserved;
      if (available <= it.reorderAt)
        items.push({
          id: `stock-${it.id}`,
          title: `${it.name} is below reorder level`,
          detail: `${available} ${it.unit} available, reorder at ${it.reorderAt}`,
          severity: "warning",
          module: "Inventory",
          navigateTo: { view: "inventory", id: it.id },
        });
    }
    for (const q of data.qmsIssues) {
      if (q.status === "Open" && q.severity === "high")
        items.push({
          id: `qms-${q.id}`,
          title: `${q.ncrNo} needs review`,
          detail: q.issue,
          severity: "warning",
          module: "QMS",
          navigateTo: { view: "project", id: q.projectId },
        });
    }
    for (const po of data.purchaseOrders) {
      if (po.status === "PendingApproval")
        items.push({
          id: `po-${po.id}`,
          title: `${po.no} needs approval`,
          detail: `₹${po.amount.toLocaleString("en-IN")} — ${po.item}`,
          severity: "warning",
          module: "Purchase Orders",
          navigateTo: { view: "po", id: po.id },
        });
    }
    return items;
  }, [data]);

  // Real ProjectDetail.tsx cross-links (6,453 lines — the single largest
  // production file; see PARITY_TRACKER.md's ProjectDetail entry). This
  // used to read the OLD invented `stages`/`qmsIssues`/`purchaseOrders`
  // demo entities directly — a real, silent staleness bug: Modules 20
  // (Production), 22-26 (QMS), and 5 (Customer PO) already built the
  // REAL per-project entities these fields should have pointed at all
  // along. `projectContext` has exactly one caller (ProjectWorkspace.tsx)
  // and is not read by any of the 10 untouchable pre-existing models, so
  // fixing its return shape here is safe.
  const projectContext = useCallback(
    (projectId: string) => {
      const project = data.projects.find((p) => p.id === projectId);
      const customer = project
        ? data.customers.find((c) => c.id === project.customerId)
        : undefined;
      const quotation = project?.quotationId
        ? data.quotations.find((q) => q.id === project.quotationId)
        : undefined;
      const production = data.projectProductions.find(
        (pp) => pp.projectId === projectId,
      );
      const stages = production?.stages ?? [];
      const inspections = data.projectQmsInspections.filter(
        (q) => q.projectId === projectId,
      );
      const invoice = data.invoices.find((i) => i.projectId === projectId);
      const payments = invoice
        ? data.payments.filter((p) => p.invoiceId === invoice.id)
        : [];
      const customerPOs = quotation
        ? data.quotationPOs.filter((p) => p.quotationId === quotation.id)
        : [];
      const requisitions = data.bomRequisitions.filter(
        (r) => r.projectId === projectId,
      );
      const deliveryChallans = data.deliveryChallans.filter((dc) =>
        dc.projectEntries.some((e) => e.projectId === projectId),
      );
      const drawings = data.drawings.filter((d) => d.projectId === projectId);
      return {
        project,
        customer,
        quotation,
        stages,
        inspections,
        invoice,
        payments,
        customerPOs,
        requisitions,
        deliveryChallans,
        drawings,
      };
    },
    [data],
  );

  const value: Ctx = {
    data,
    advanceStage,
    blockStage,
    approvePO,
    receivePO,
    resolveQms,
    recordPayment,
    acceptQuotation,
    createProjectDirect,
    createQuotation,
    updateQuotationFields,
    deleteQuotation,
    duplicateQuotation,
    createQuotationRevision,
    updateQuotationStatus,
    recordQuotationPO,
    updateQuotationPOStatus,
    addInvoice,
    updateInvoiceFields,
    updateInvoiceStatus,
    deleteInvoiceFull,
    addPayment,
    addPayable,
    addPayablePayment,
    deletePayableFull,
    addInventoryItemFull,
    updateInventoryItemFields,
    deleteInventoryItemFull,
    addInventoryPurchaseFull,
    addMachineFull,
    updateMachineFields,
    addToolFull,
    updateToolFields,
    issueTool,
    returnTool,
    addDieFull,
    updateDieFields,
    deleteDie,
    addEmployeeFull,
    employeeDuplicateExists,
    updateEmployeeFields,
    dcRemainingQty,
    dcNumberExists,
    addDeliveryChallanFull,
    updateDeliveryChallanFull,
    updateDeliveryChallanStatus,
    genCpoNumber,
    addCompanyPOFull,
    updateCompanyPOFull,
    updateCompanyPOStatus,
    resolveFloatLink: resolveFloatLinkFn,
    addPettyExpenseFull,
    updatePettyExpenseFull,
    addExpenseFloatFull,
    returnExpenseFloatAmount,
    currentServiceRate,
    serviceDeleteBlockReason,
    addBillableServiceFull,
    updateBillableServiceFull,
    deleteBillableServiceFull,
    changeServiceRate,
    addServiceUsageFull,
    updateServiceUsageFull,
    deleteServiceUsageFull,
    addScrapRecordFull,
    updateScrapRecordFull,
    updateProjectStagesFull,
    addStageTransactionFull,
    completeBomRequisition,
    addCharacteristicFull,
    updateCharacteristicFull,
    generateInspectionSheet,
    advanceInspectionSheetStatus,
    addProjectQmsInspection,
    recordCharacteristicResult,
    addDrawingFull,
    updateDrawingFull,
    addDrawingLinkFull,
    removeDrawingLinkFull,
    updateAppSettingsFull,
    exportBackup,
    restoreBackup,
    createOrgUserFull,
    updateOrgUserRoleFull,
    updateOrgUserOverridesFull,
    setOrgUserActiveFull,
    logAgentAuditFull,
    deleteQuotationPO,
    createPO,
    addCustomer,
    updateCustomer,
    customerDeleteBlockReason,
    vendorNameExists,
    addVendor,
    updateVendor,
    updateProjectFields,
    projectDeleteBlockReason,
    deleteProject,
    addRecord,
    deleteRecord,
    vendorContext,
    customerContext,
    attentionItems,
    projectContext,
  };
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useUxLabStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx)
    throw new Error("useUxLabStore must be used within UxLabStoreProvider");
  return ctx;
}
