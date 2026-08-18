import { create } from "zustand";
import { persist } from "zustand/middleware";
// Phase 22 — repeatProject creates a real Project row remotely; every
// other domain's remote calls are initiated from page components, but
// repeatProject's local-only child-cloning logic (design files/BOM
// items/costing/production stages - none of those domains migrated) is
// tightly coupled to store.ts's own synchronous local-state reads, so
// the remote call is made from here instead of relocating that logic.
import { updateMachineRemote } from "./lib/machinesApi";
import {
  recordStageTransactionRemote,
  upsertProjectionStagesRemote,
} from "./lib/productionStagesApi";
import { createProjectRemote, updateProjectRemote } from "./lib/projectsApi";
import type {
  AdvanceRecord,
  AppSettings,
  AttendanceRecord,
  AuditLogEntry,
  AuthUser,
  BillableService,
  BomItem,
  BomRequisition,
  BomRequisitionStatus,
  CompanyPO,
  Customer,
  DeliveryChallan,
  DesignFile,
  Die,
  Employee,
  EmployeeDocument,
  ExpenseFloat,
  ExpenseFloatStatus,
  ExportJob,
  InternalCosting,
  InventoryItem,
  InventoryPurchase,
  Invoice,
  Machine,
  MachineCondition,
  MachineDie,
  MachineDocument,
  MachineServiceRate,
  MachineServiceUsage,
  MachineSparePart,
  MachineUsageLog,
  MasterPO,
  MaterialPurchase,
  MaterialRequisition,
  MaterialUsage,
  OutsourcedWork,
  Payable,
  PayablePayment,
  Payment,
  PettyExpense,
  ProductionMovement,
  Project,
  ProjectActivity,
  ProjectActivityType,
  ProjectDelivery,
  ProjectItem,
  ProjectPO,
  ProjectProduction,
  ProjectProductionStage,
  ProjectStageStatus,
  PurchaseOrder,
  QualityInspection,
  Quotation,
  QuotationPurchaseOrder,
  QuotationRevision,
  ReminderLog,
  SalaryAdvance,
  SalaryPayment,
  ScrapRecord,
  ServicePart,
  ServiceRecord,
  StageTransaction,
  StockReservation,
  Tool,
  ToolAssignmentHistory,
  Vendor,
} from "./types";

const PRODUCTION_STAGES = [
  "Cutting",
  "Bending",
  "Welding",
  "Finishing",
  "Powder Coating",
  "Assembly",
];

export const DEFAULT_V2_STAGES: Array<{
  name: string;
  requiresMaterialTracking: boolean;
}> = [
  { name: "Design", requiresMaterialTracking: false },
  { name: "Material Procurement", requiresMaterialTracking: false },
  { name: "Cutting", requiresMaterialTracking: true },
  { name: "Bending", requiresMaterialTracking: true },
  { name: "Welding", requiresMaterialTracking: true },
  { name: "Grinding", requiresMaterialTracking: true },
  { name: "Cleaning", requiresMaterialTracking: true },
  { name: "Taping", requiresMaterialTracking: true },
  { name: "Powder Coating", requiresMaterialTracking: true },
  { name: "Assembly", requiresMaterialTracking: true },
  { name: "Packing", requiresMaterialTracking: false },
];

const sampleVendors: Vendor[] = [
  {
    id: "v1",
    name: "Steel India Pvt Ltd",
    phone: "9876543210",
    address: "Industrial Area, Mumbai",
    gstNumber: "27ABCDE1234F1Z5",
    createdAt: Date.now(),
  },
  {
    id: "v2",
    name: "CNC Laser Works",
    phone: "9123456780",
    address: "Phase 2, Pune",
    gstNumber: "",
    createdAt: Date.now(),
  },
  {
    id: "v3",
    name: "FastTrack Logistics",
    phone: "9000011122",
    address: "NH-8, Delhi",
    gstNumber: "",
    createdAt: Date.now(),
  },
];

const sampleCustomers: Customer[] = [
  {
    id: "c1",
    name: "Tata Steel Projects",
    contactPerson: "Rajesh Kumar",
    phone: "9876543210",
    email: "rajesh@tatasteelprojects.com",
    address: "12 Industrial Area, Pune 411001",
    gstin: "27AADCT3518H1Z9",
    stateName: "Maharashtra",
    stateCode: "27",
    createdAt: Date.now() - 86400000 * 30,
  },
  {
    id: "c2",
    name: "Mahindra Fabrications",
    contactPerson: "Anita Shah",
    phone: "9123456789",
    email: "anita@mahindrafab.com",
    address: "45 MIDC, Nashik 422001",
    gstin: "27AABCM7890K1Z2",
    stateName: "Maharashtra",
    stateCode: "27",
    createdAt: Date.now() - 86400000 * 20,
  },
  {
    id: "c3",
    name: "L&T Engineering",
    contactPerson: "Suresh Patel",
    phone: "9988776655",
    email: "suresh@lt.com",
    address: "78 SEZ Road, Mumbai 400072",
    gstin: "27AAACL5672M1Z3",
    stateName: "Maharashtra",
    stateCode: "27",
    createdAt: Date.now() - 86400000 * 10,
  },
];

const sampleQuotations: Quotation[] = [];
const samplePOs: PurchaseOrder[] = [];

const sampleMRs: MaterialRequisition[] = [
  {
    id: "mr1",
    mrNo: "MR-2026-001",
    jobId: "j1",
    items: [
      {
        material: "MS Sheet 2mm 4x8 ft",
        qty: 12,
        unit: "Sheet",
        estimatedCost: 36000,
      },
      {
        material: "MS Angle 25x25x3",
        qty: 20,
        unit: "Meter",
        estimatedCost: 2000,
      },
    ],
    totalEstimatedCost: 38000,
    status: "Received",
    createdAt: Date.now() - 86400000 * 14,
  },
];

const sampleDCs: DeliveryChallan[] = [];
const sampleInvoices: Invoice[] = [];
const samplePayments: Payment[] = [];

const sampleProjects: Project[] = [
  {
    id: "proj1",
    projectNo: "PROJ-2026-001",
    customerId: "c1",
    projectName: "MS Enclosure Set",
    workDescription: "20 pcs 2mm MS sheet enclosures per drawing ENC-2026-A",
    createdAt: Date.now() - 86400000 * 20,
  },
  {
    id: "proj2",
    projectNo: "PROJ-2026-002",
    customerId: "c2",
    projectName: "SS Bracket Batch",
    workDescription: "50 pcs SS304 laser cut brackets 3mm",
    createdAt: Date.now() - 86400000 * 12,
  },
];

const sampleMaterialPurchases: MaterialPurchase[] = [
  {
    id: "mp1",
    projectId: "proj1",
    materialType: "MS Sheet",
    thickness: "2mm",
    quantity: 15,
    supplierName: "Steel India Pvt Ltd",
    purchaseDate: "2026-03-10",
  },
];

const sampleOutsourcedWorks: OutsourcedWork[] = [
  {
    id: "ow1",
    projectId: "proj1",
    vendorName: "CNC Laser Works",
    materialSent: "MS Sheet 2mm",
    quantitySent: 15,
    dateSent: "2026-03-12",
    dateReceived: "2026-03-15",
    processCost: 8500,
  },
];

const sampleInternalCostings: InternalCosting[] = [
  {
    id: "ic1",
    projectId: "proj1",
    rawMaterialCost: 18000,
    cncCost: 8500,
    hardwareCost: 2500,
    powderCoatingCost: 5000,
    assemblyCost: 3000,
    packingCost: 500,
  },
];

const mkStage = (
  stageName: string,
  status: import("./types").ProjectStageStatus,
  notes: string,
): import("./types").ProjectProductionStage => ({
  stageName,
  status,
  notes,
  quantitySent: 0,
  sentDateTime: "",
  sentToVendorId: "",
  sentToVendorName: "",
  receivedQuantity: 0,
  receivedDateTime: "",
  startTime: "",
  endTime: "",
  stageId: crypto.randomUUID(),
});

const sampleProjectProductions: ProjectProduction[] = [
  {
    id: "pp1",
    projectId: "proj1",
    version: "legacy" as const,
    stages: [
      mkStage("Cutting (CNC / Laser)", "Completed", "CNC laser done"),
      mkStage("Bending", "Completed", "All bends done"),
      mkStage("Welding", "InProgress", "In progress"),
      mkStage("Finishing", "NotStarted", ""),
      mkStage("Powder Coating", "NotStarted", ""),
      mkStage("Assembly", "NotStarted", ""),
    ],
  },
];

const sampleProjectDeliveries: ProjectDelivery[] = [
  {
    id: "pd1",
    projectId: "proj1",
    deliveryDate: "2026-04-15",
    deliveryDestination: "Tata Steel Projects, Pune",
    vehicleNumber: "MH12-AB-1234",
    deliveryChallan: "DC-2026-001",
  },
];

const sampleDesignFiles: DesignFile[] = [];

const sampleInventory: InventoryItem[] = [
  {
    id: "inv-1",
    name: "MS Sheet 2mm",
    unit: "sheets",
    quantityAvailable: 50,
    lastUpdated: Date.now(),
  },
  {
    id: "inv-2",
    name: "MS Angle 25x25x3",
    unit: "meters",
    quantityAvailable: 120,
    lastUpdated: Date.now(),
  },
  {
    id: "inv-3",
    name: "Bolts M8x20",
    unit: "pcs",
    quantityAvailable: 500,
    lastUpdated: Date.now(),
  },
  {
    id: "inv-4",
    name: "Hex Nuts M8",
    unit: "pcs",
    quantityAvailable: 500,
    lastUpdated: Date.now(),
  },
  {
    id: "inv-5",
    name: "Powder Coat Paint (Grey)",
    unit: "kg",
    quantityAvailable: 25,
    lastUpdated: Date.now(),
  },
];

const samplePayables: Payable[] = [
  {
    id: "pay-1",
    vendorName: "Steel India Pvt Ltd",
    paymentType: "Material",
    totalAmount: 45000,
    paidAmount: 20000,
    dueDate: "2026-04-10",
    projectId: "proj1",
    notes: "MS Sheet supply invoice SI-2026-4521",
    createdAt: Date.now() - 86400000 * 15,
  },
  {
    id: "pay-2",
    vendorName: "CNC Laser Works",
    paymentType: "CNC",
    totalAmount: 8500,
    paidAmount: 8500,
    dueDate: "2026-03-30",
    projectId: "proj1",
    notes: "Laser cutting charges for Enclosure batch",
    createdAt: Date.now() - 86400000 * 10,
  },
  {
    id: "pay-3",
    vendorName: "FastTrack Logistics",
    paymentType: "Transport",
    totalAmount: 6200,
    paidAmount: 0,
    dueDate: "2026-03-15",
    notes: "Freight charges - Pune to Mumbai",
    createdAt: Date.now() - 86400000 * 8,
  },
];

const samplePayablePayments: PayablePayment[] = [
  {
    id: "pp-1",
    payableId: "pay-1",
    amount: 20000,
    paymentDate: "2026-03-18",
    mode: "NEFT",
    referenceNo: "NEFT20260318001",
    notes: "Advance payment",
    createdAt: Date.now() - 86400000 * 12,
  },
  {
    id: "pp-2",
    payableId: "pay-2",
    amount: 8500,
    paymentDate: "2026-03-28",
    mode: "UPI",
    referenceNo: "UPI20260328002",
    notes: "Full payment cleared",
    createdAt: Date.now() - 86400000 * 2,
  },
];

// Phase 27 — shared literal union for every hydration-state block's
// `status` field, replacing the repeated inline union every earlier
// phase wrote out by hand.
type HydrationStatusValue =
  | "idle"
  | "loading"
  | "success"
  | "error"
  | "unauthenticated";

interface DocCounters {
  QT: number;
  MR: number;
  DC: number;
  INV: number;
  PAY: number;
  PROJ: number;
  MCH: number;
  SVC: number;
  EMP: number;
  TL: number;
  DIE: number;
}

const sampleMachines: Machine[] = [
  {
    id: "mch-1",
    machineCode: "MCH-001",
    name: "Bystronic Fiber Laser 3015",
    type: "Laser Cutting",
    brand: "Bystronic",
    model: "ByStar Fiber 3015",
    serialNumber: "BST-2021-FL-4421",
    assetId: "FAB-LASER-01",
    purchaseDate: "2021-06-15",
    purchaseCost: 4500000,
    purchaseVendorName: "Bystronic India",
    currentStatus: "Operational",
    location: "Bay 1 - Cutting Section",
    department: "Cutting",
    warrantyExpiry: "2024-06-15",
    amcVendorName: "Bystronic India",
    amcStartDate: "2024-07-01",
    amcEndDate: "2025-06-30",
    amcCost: 85000,
    amcCoverage: "Annual preventive maintenance, emergency breakdowns",
    serviceIntervalDays: 90,
    lastServiceDate: "2026-03-10",
    nextServiceDue: "2026-06-10",
    totalRunningHours: 4820,
    hourlyRate: 350,
    notes: "Primary laser cutting machine. Handle with care.",
    isActive: true,
    createdAt: Date.now() - 86400000 * 180,
    updatedAt: Date.now() - 86400000 * 30,
  },
  {
    id: "mch-2",
    machineCode: "MCH-002",
    name: "Amada HFE 100-3 CNC Press Brake",
    type: "Bending",
    brand: "Amada",
    model: "HFE 100-3",
    serialNumber: "AMD-2020-PB-8812",
    assetId: "FAB-BEND-01",
    purchaseDate: "2020-11-20",
    purchaseCost: 2800000,
    purchaseVendorName: "Amada India",
    currentStatus: "Operational",
    location: "Bay 2 - Bending Section",
    department: "Bending",
    warrantyExpiry: "2023-11-20",
    serviceIntervalDays: 120,
    lastServiceDate: "2026-01-15",
    nextServiceDue: "2026-05-15",
    totalRunningHours: 6200,
    hourlyRate: 200,
    notes: "100T press brake. 3-axis back gauge.",
    isActive: true,
    createdAt: Date.now() - 86400000 * 200,
    updatedAt: Date.now() - 86400000 * 60,
  },
  {
    id: "mch-3",
    machineCode: "MCH-003",
    name: "Lincoln MIG Welding Machine",
    type: "Welding",
    brand: "Lincoln Electric",
    model: "Power MIG 350MP",
    serialNumber: "LNC-2022-WLD-0091",
    assetId: "FAB-WELD-01",
    purchaseDate: "2022-03-01",
    purchaseCost: 180000,
    currentStatus: "Operational",
    location: "Bay 3 - Welding Section",
    department: "Welding",
    serviceIntervalDays: 180,
    lastServiceDate: "2025-12-01",
    nextServiceDue: "2026-06-01",
    totalRunningHours: 2100,
    hourlyRate: 80,
    isActive: true,
    createdAt: Date.now() - 86400000 * 120,
    updatedAt: Date.now() - 86400000 * 90,
  },
];

const sampleServiceRecords: ServiceRecord[] = [
  {
    id: "svc-1",
    machineId: "mch-1",
    serviceNumber: "SVC-001",
    serviceDate: "2026-03-10",
    serviceType: "Preventive",
    performedBy: "AMC Vendor",
    vendorName: "Bystronic India",
    technicianName: "Ramesh Kumar",
    technicianContact: "9876512345",
    serviceCost: 12000,
    travelCost: 2000,
    downtimeHours: 4,
    resolutionDetails:
      "Replaced nozzle, cleaned lens assembly, checked beam alignment. Machine calibrated.",
    machineCondition: "Good",
    nextServiceDue: "2026-06-10",
    runningHoursAtService: 4820,
    notes: "Quarterly AMC visit. All parameters within spec.",
    status: "Completed",
    createdBy: "admin",
    createdAt: Date.now() - 86400000 * 82,
  },
  {
    id: "svc-2",
    machineId: "mch-2",
    serviceNumber: "SVC-002",
    serviceDate: "2026-01-15",
    serviceType: "Corrective",
    performedBy: "External Vendor",
    vendorName: "Amada India",
    technicianName: "Suresh Patil",
    serviceCost: 28000,
    travelCost: 5000,
    downtimeHours: 16,
    breakdownCause: "Back-gauge servo motor fault. Y-axis movement erratic.",
    resolutionDetails:
      "Replaced servo drive module. Recalibrated back-gauge positioning. Full test run completed.",
    machineCondition: "Good",
    nextServiceDue: "2026-05-15",
    runningHoursAtService: 6200,
    status: "Completed",
    createdBy: "admin",
    createdAt: Date.now() - 86400000 * 136,
  },
];

const sampleEmployees: Employee[] = [
  {
    id: "emp1",
    name: "Ravi Sharma",
    phone: "9876543201",
    role: "Designer",
    monthlySalary: 30000,
    joiningDate: "2024-01-15",
    userId: "user-designer1",
  },
  {
    id: "emp2",
    name: "Sunil Tiwari",
    phone: "9876543202",
    role: "Worker",
    monthlySalary: 22000,
    joiningDate: "2024-03-01",
    userId: "user-worker1",
  },
  {
    id: "emp3",
    name: "Priya Nair",
    phone: "9876543203",
    role: "Accountant",
    monthlySalary: 35000,
    joiningDate: "2023-11-10",
    userId: "user-accountant1",
  },
];

const defaultSettings: AppSettings = {
  companyName: "",
  companyAddress: "",
  companyGstin: "",
  companyStateName: "",
  companyStateCode: "",
  companyPhone: "",
  companyEmail: "",
  companyLogo: "",
  twilioAccountSid: "",
  twilioAuthToken: "",
  twilioFromNumber: "",
  whatsappProvider: "twilio",
  gmailSenderEmail: "",
  gmailAppPassword: "",
  bankName: "",
  accountName: "",
  accountNumber: "",
  ifscCode: "",
  bankBranch: "",
  companyTerms: "",
  companyDeclaration: "",
  quotationTerms: "",
  companyPOTerms: "",
};

interface Store {
  customers: Customer[];
  quotations: Quotation[];
  quotationRevisions: QuotationRevision[];
  quotationPurchaseOrders: QuotationPurchaseOrder[];
  purchaseOrders: PurchaseOrder[];
  masterPOs: MasterPO[];
  companyPOs: CompanyPO[];
  addCompanyPO: (p: CompanyPO) => void;
  updateCompanyPO: (p: CompanyPO) => void;
  deleteCompanyPO: (id: string) => void;
  materialRequisitions: MaterialRequisition[];
  deliveryChallans: DeliveryChallan[];
  invoices: Invoice[];
  payments: Payment[];
  counters: DocCounters;

  // Project tracking
  projects: Project[];
  designFiles: DesignFile[];
  internalCostings: InternalCosting[];
  materialPurchases: MaterialPurchase[];
  outsourcedWorks: OutsourcedWork[];
  projectProductions: ProjectProduction[];
  // Phase 45 — same rationale/mechanics as preMigrationMachinesSnapshot
  // above: captured exactly once, on this browser's first boot after this
  // field was introduced, from whatever `projectProductions` held in
  // localStorage BEFORE that boot's Supabase hydration could overwrite
  // it. The Settings.tsx "Migrate Local Production Stages to Supabase"
  // button reads THIS field, not `projectProductions`, for the same
  // reason machines does.
  preMigrationProjectProductionsSnapshot: ProjectProduction[] | null;
  projectProductionsHydration: {
    status: "idle" | "loading" | "success" | "error" | "unauthenticated";
    error?: string;
  };
  setProjectProductionsHydrationStatus: (
    status: "idle" | "loading" | "success" | "error" | "unauthenticated",
    error?: string,
  ) => void;
  setProjectProductionsFromServer: (productions: ProjectProduction[]) => void;
  projectDeliveries: ProjectDelivery[];

  addCustomer: (c: Customer) => void;
  updateCustomer: (c: Customer) => void;
  deleteCustomer: (id: string) => void;

  addQuotation: (q: Quotation) => void;
  updateQuotation: (q: Quotation) => void;
  deleteQuotation: (id: string) => void;

  addQuotationRevision: (r: QuotationRevision) => void;
  updateQuotationRevision: (r: QuotationRevision) => void;
  addQuotationPurchaseOrder: (p: QuotationPurchaseOrder) => void;
  updateQuotationPurchaseOrder: (p: QuotationPurchaseOrder) => void;

  addPurchaseOrder: (p: PurchaseOrder) => void;
  updatePurchaseOrder: (p: PurchaseOrder) => void;
  addMasterPO: (m: MasterPO) => void;
  updateMasterPO: (m: MasterPO) => void;
  deleteMasterPO: (id: string) => void;

  addMaterialRequisition: (m: MaterialRequisition) => void;
  updateMaterialRequisition: (m: MaterialRequisition) => void;

  addDeliveryChallan: (d: DeliveryChallan) => void;
  updateDeliveryChallan: (d: DeliveryChallan) => void;
  deleteDeliveryChallan: (id: string) => void;

  addInvoice: (i: Invoice) => void;
  updateInvoice: (i: Invoice) => void;
  deleteInvoice: (id: string) => void;

  addPayment: (p: Payment) => void;
  // Local-only cleanup for the ON DELETE CASCADE that already happened
  // server-side (payments_invoice_id_fkey - Phase 9) when an invoice is
  // deleted - keeps the in-memory payments array from showing orphaned
  // rows for the rest of the session, until the next hydration.
  removePaymentsForInvoice: (invoiceId: string) => void;

  generateDocNo: (prefix: keyof DocCounters) => string;

  // Project tracking methods
  addProject: (p: Project) => void;
  updateProject: (p: Project) => void;
  deleteProject: (id: string) => void;
  addProjectPO: (projectId: string, po: ProjectPO) => void;
  updateProjectPO: (projectId: string, po: ProjectPO) => void;
  addDesignFile: (f: DesignFile) => void;
  deleteDesignFile: (id: string) => void;
  upsertInternalCosting: (c: InternalCosting) => void;
  addMaterialPurchase: (m: MaterialPurchase) => void;
  updateMaterialPurchase: (m: MaterialPurchase) => void;
  deleteMaterialPurchase: (id: string) => void;
  addOutsourcedWork: (o: OutsourcedWork) => void;
  updateOutsourcedWork: (o: OutsourcedWork) => void;
  deleteOutsourcedWork: (id: string) => void;
  // Phase 45 — remote-first: the Supabase write (via the atomic
  // upsert_project_production_stages RPC / production_stage_transactions
  // insert) happens BEFORE local state is touched, and local state is
  // only updated on confirmed success — same rigor as updateMachineRemote's
  // call sites below. Returns false (with local state left untouched) on
  // any failure so the caller can show an error instead of silently
  // pretending the save worked.
  upsertProjectProduction: (p: ProjectProduction) => Promise<boolean>;
  addStageTransaction: (
    projectId: string,
    stageIdx: number,
    tx: StageTransaction,
  ) => Promise<boolean>;
  updateProjectStagesV2: (
    projectId: string,
    stages: ProjectProductionStage[],
  ) => Promise<boolean>;
  upsertProjectDelivery: (d: ProjectDelivery) => void;

  // Auth & HR
  authUsers: AuthUser[];
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  salaryPayments: SalaryPayment[];
  advanceRecords: AdvanceRecord[];
  employeeDocuments: EmployeeDocument[];

  // Phase 18 — Supabase read/hydration status for the employees domain.
  // Observable so any component can distinguish loading/success/error/
  // unauthenticated rather than silently guessing from the data alone.
  employeesHydration: {
    status: "idle" | "loading" | "success" | "error" | "unauthenticated";
    error?: string;
  };
  setEmployeesHydrationStatus: (
    status: "idle" | "loading" | "success" | "error" | "unauthenticated",
    error?: string,
  ) => void;
  // Replaces the employees array wholesale with a Supabase-sourced result.
  // Only ever called on a successful hydration - never on loading/error/
  // unauthenticated, so a failed fetch never destroys existing local data.
  setEmployeesFromServer: (employees: Employee[]) => void;

  // Phase 19 — same shape as employeesHydration above, for the customers
  // domain.
  customersHydration: {
    status: "idle" | "loading" | "success" | "error" | "unauthenticated";
    error?: string;
  };
  setCustomersHydrationStatus: (
    status: "idle" | "loading" | "success" | "error" | "unauthenticated",
    error?: string,
  ) => void;
  setCustomersFromServer: (customers: Customer[]) => void;

  // Phase 20 — same shape, for the inventory items domain (master-data
  // scope only - see lib/inventoryApi.ts for the write-field boundary).
  inventoryItemsHydration: {
    status: "idle" | "loading" | "success" | "error" | "unauthenticated";
    error?: string;
  };
  setInventoryItemsHydrationStatus: (
    status: "idle" | "loading" | "success" | "error" | "unauthenticated",
    error?: string,
  ) => void;
  setInventoryItemsFromServer: (items: InventoryItem[]) => void;

  // Phase 21A — same shape, for the vendors domain.
  vendorsHydration: {
    status: "idle" | "loading" | "success" | "error" | "unauthenticated";
    error?: string;
  };
  setVendorsHydrationStatus: (
    status: "idle" | "loading" | "success" | "error" | "unauthenticated",
    error?: string,
  ) => void;
  setVendorsFromServer: (vendors: Vendor[]) => void;

  // Phase 21B — same shape, for the company POs domain.
  companyPOsHydration: {
    status: "idle" | "loading" | "success" | "error" | "unauthenticated";
    error?: string;
  };
  setCompanyPOsHydrationStatus: (
    status: "idle" | "loading" | "success" | "error" | "unauthenticated",
    error?: string,
  ) => void;
  setCompanyPOsFromServer: (pos: CompanyPO[]) => void;

  // Phase 22 — same shape, for the projects domain. setProjectsFromServer
  // is NOT a wholesale replace like every prior domain: assignedEmployeeIds/
  // pos/poNumber/poDate/poFiles have no DB column (explicitly approved
  // Decisions 3 + the PO-fields follow-up), so it merges those five fields
  // in from the CURRENT local project (matched by id) before replacing
  // state - otherwise every successful hydration would silently wipe them.
  projectsHydration: {
    status: "idle" | "loading" | "success" | "error" | "unauthenticated";
    error?: string;
  };
  setProjectsHydrationStatus: (
    status: "idle" | "loading" | "success" | "error" | "unauthenticated",
    error?: string,
  ) => void;
  setProjectsFromServer: (projects: Project[]) => void;

  // Phase 24 — same shape, for the outsourced works domain. Unlike
  // Projects, this IS a plain wholesale replace - every OutsourcedWork
  // field has a real DB column, no local-only fields to merge.
  outsourcedWorksHydration: {
    status: "idle" | "loading" | "success" | "error" | "unauthenticated";
    error?: string;
  };
  setOutsourcedWorksHydrationStatus: (
    status: "idle" | "loading" | "success" | "error" | "unauthenticated",
    error?: string,
  ) => void;
  setOutsourcedWorksFromServer: (works: OutsourcedWork[]) => void;

  // Phase 27 Batch 1 — same shape, wholesale replace, for every
  // Employees/Inventory/Projects-children domain in this batch.
  advanceRecordsHydration: { status: HydrationStatusValue; error?: string };
  setAdvanceRecordsHydrationStatus: (
    status: HydrationStatusValue,
    error?: string,
  ) => void;
  setAdvanceRecordsFromServer: (records: AdvanceRecord[]) => void;

  attendanceRecordsHydration: { status: HydrationStatusValue; error?: string };
  setAttendanceRecordsHydrationStatus: (
    status: HydrationStatusValue,
    error?: string,
  ) => void;
  setAttendanceRecordsFromServer: (records: AttendanceRecord[]) => void;

  // employeeDocumentsHydration — NOT a plain wholesale replace:
  // uploadedBy has no DB column (see lib/hydration.ts), merged in from
  // current local state per document id, same shape as Projects'
  // assignedEmployeeIds merge-exception.
  employeeDocumentsHydration: { status: HydrationStatusValue; error?: string };
  setEmployeeDocumentsHydrationStatus: (
    status: HydrationStatusValue,
    error?: string,
  ) => void;
  setEmployeeDocumentsFromServer: (
    docs: Omit<EmployeeDocument, "uploadedBy">[],
  ) => void;

  salaryPaymentsHydration: { status: HydrationStatusValue; error?: string };
  setSalaryPaymentsHydrationStatus: (
    status: HydrationStatusValue,
    error?: string,
  ) => void;
  setSalaryPaymentsFromServer: (payments: SalaryPayment[]) => void;

  inventoryPurchasesHydration: { status: HydrationStatusValue; error?: string };
  setInventoryPurchasesHydrationStatus: (
    status: HydrationStatusValue,
    error?: string,
  ) => void;
  setInventoryPurchasesFromServer: (purchases: InventoryPurchase[]) => void;

  inventoryUsagesHydration: { status: HydrationStatusValue; error?: string };
  setInventoryUsagesHydrationStatus: (
    status: HydrationStatusValue,
    error?: string,
  ) => void;
  setInventoryUsagesFromServer: (usages: MaterialUsage[]) => void;

  bomItemsHydration: { status: HydrationStatusValue; error?: string };
  setBomItemsHydrationStatus: (
    status: HydrationStatusValue,
    error?: string,
  ) => void;
  setBomItemsFromServer: (items: BomItem[]) => void;

  bomRequisitionsHydration: { status: HydrationStatusValue; error?: string };
  setBomRequisitionsHydrationStatus: (
    status: HydrationStatusValue,
    error?: string,
  ) => void;
  setBomRequisitionsFromServer: (reqs: BomRequisition[]) => void;

  // project_employees — no dedicated array; feeds Project.
  // assignedEmployeeIds only (see lib/hydration.ts's ProjectEmployeeRow).
  projectEmployeesHydration: { status: HydrationStatusValue; error?: string };
  setProjectEmployeesHydrationStatus: (
    status: HydrationStatusValue,
    error?: string,
  ) => void;
  setProjectEmployeesFromServer: (
    pairs: { projectId: string; employeeId: string }[],
  ) => void;

  // project_machinery / project_dies (Phase 39) — same "no dedicated
  // array, feeds Project.assignedMachineIds/assignedDieIds" shape as
  // project_employees above.
  projectMachineryHydration: { status: HydrationStatusValue; error?: string };
  setProjectMachineryHydrationStatus: (
    status: HydrationStatusValue,
    error?: string,
  ) => void;
  setProjectMachineryFromServer: (
    pairs: { projectId: string; machineId: string }[],
  ) => void;
  projectDiesHydration: { status: HydrationStatusValue; error?: string };
  setProjectDiesHydrationStatus: (
    status: HydrationStatusValue,
    error?: string,
  ) => void;
  setProjectDiesFromServer: (
    pairs: { projectId: string; dieId: string }[],
  ) => void;

  // Phase 27 Batch 2 — quotations, quotation_revisions, master_pos,
  // quotation_purchase_orders, project_purchase_orders.
  // quotationsHydration — NOT a plain wholesale replace: approvedBy
  // (display username) and recordedPO (legacy, never written) have no
  // DB column, merged in from current local state per quotation id, same
  // shape as employeeDocumentsHydration's uploadedBy merge-exception.
  quotationsHydration: { status: HydrationStatusValue; error?: string };
  setQuotationsHydrationStatus: (
    status: HydrationStatusValue,
    error?: string,
  ) => void;
  setQuotationsFromServer: (quotations: Quotation[]) => void;

  // quotationRevisionsHydration — NOT a plain wholesale replace:
  // createdBy (display username) has no DB column, merged in from
  // current local state per revision id.
  quotationRevisionsHydration: { status: HydrationStatusValue; error?: string };
  setQuotationRevisionsHydrationStatus: (
    status: HydrationStatusValue,
    error?: string,
  ) => void;
  setQuotationRevisionsFromServer: (revisions: QuotationRevision[]) => void;

  // masterPOsHydration — plain wholesale replace. sharedPoId has no DB
  // gap (derived from the row's own id in hydration.ts), nothing to merge.
  masterPOsHydration: { status: HydrationStatusValue; error?: string };
  setMasterPOsHydrationStatus: (
    status: HydrationStatusValue,
    error?: string,
  ) => void;
  setMasterPOsFromServer: (pos: MasterPO[]) => void;

  // quotationPurchaseOrdersHydration — NOT a plain wholesale replace:
  // createdBy (display username) has no DB column, merged in from
  // current local state per PO id.
  quotationPurchaseOrdersHydration: {
    status: HydrationStatusValue;
    error?: string;
  };
  setQuotationPurchaseOrdersHydrationStatus: (
    status: HydrationStatusValue,
    error?: string,
  ) => void;
  setQuotationPurchaseOrdersFromServer: (pos: QuotationPurchaseOrder[]) => void;

  // project_purchase_orders — no dedicated array; feeds Project.pos only
  // (see lib/hydration.ts's ProjectPurchaseOrderRow), same shape as
  // project_employees feeding Project.assignedEmployeeIds.
  projectPurchaseOrdersHydration: {
    status: HydrationStatusValue;
    error?: string;
  };
  setProjectPurchaseOrdersHydrationStatus: (
    status: HydrationStatusValue,
    error?: string,
  ) => void;
  setProjectPurchaseOrdersFromServer: (
    pairs: { projectId: string; po: ProjectPO }[],
  ) => void;

  // Phase 27 Batch 3 — expense_floats, petty_expenses.
  // expenseFloatsHydration — NOT a plain wholesale replace: issuedBy
  // (display username) has no DB column, merged in from current local
  // state per float id, same shape as employeeDocumentsHydration's
  // uploadedBy merge-exception.
  expenseFloatsHydration: { status: HydrationStatusValue; error?: string };
  setExpenseFloatsHydrationStatus: (
    status: HydrationStatusValue,
    error?: string,
  ) => void;
  setExpenseFloatsFromServer: (floats: ExpenseFloat[]) => void;

  // pettyExpensesHydration — plain wholesale replace. Every PettyExpense
  // field has a real DB column, nothing to merge.
  pettyExpensesHydration: { status: HydrationStatusValue; error?: string };
  setPettyExpensesHydrationStatus: (
    status: HydrationStatusValue,
    error?: string,
  ) => void;
  setPettyExpensesFromServer: (expenses: PettyExpense[]) => void;

  // Phase 27 Batch 4 — delivery_challans. Plain wholesale replace - every
  // field has a real DB column (soId/jobId are legacy, zero live write
  // sites, so there's nothing to merge back in even though they exist on
  // the type).
  deliveryChallansHydration: { status: HydrationStatusValue; error?: string };
  setDeliveryChallansHydrationStatus: (
    status: HydrationStatusValue,
    error?: string,
  ) => void;
  setDeliveryChallansFromServer: (challans: DeliveryChallan[]) => void;

  // Phase 27 Batch 5 — invoices (with invoice_items decomposed/rejoined
  // into lineItems by the hydration layer) and payments. Plain wholesale
  // replace - every field has a real DB column (soId/invoiceNumber/
  // bankDetails/termsAndConditions are legacy/form-only, zero live write
  // sites, so there's nothing to merge back in even though they exist on
  // the type).
  invoicesHydration: { status: HydrationStatusValue; error?: string };
  setInvoicesHydrationStatus: (
    status: HydrationStatusValue,
    error?: string,
  ) => void;
  setInvoicesFromServer: (invoices: Invoice[]) => void;

  paymentsHydration: { status: HydrationStatusValue; error?: string };
  setPaymentsHydrationStatus: (
    status: HydrationStatusValue,
    error?: string,
  ) => void;
  setPaymentsFromServer: (payments: Payment[]) => void;

  addAuthUser: (u: AuthUser) => void;
  updateAuthUser: (u: AuthUser) => void;
  deleteAuthUser: (id: string) => void;
  addEmployee: (e: Employee) => void;
  updateEmployee: (e: Employee) => void;
  deleteEmployee: (id: string) => void;
  addAttendanceRecord: (r: AttendanceRecord) => void;
  updateAttendanceRecord: (r: AttendanceRecord) => void;
  addSalaryPayment: (p: SalaryPayment) => void;
  addAdvanceRecord: (a: AdvanceRecord) => void;
  updateAdvanceRecord: (a: AdvanceRecord) => void;
  addEmployeeDocument: (d: EmployeeDocument) => void;
  updateEmployeeDocument: (d: EmployeeDocument) => void;
  deleteEmployeeDocument: (id: string) => void;

  // Inventory
  inventoryItems: InventoryItem[];
  inventoryPurchases: InventoryPurchase[];
  materialUsages: MaterialUsage[];

  addInventoryItem: (item: InventoryItem) => void;
  deleteInventoryItem: (id: string) => void;
  updateInventoryItem: (item: InventoryItem) => void;
  addInventoryPurchase: (purchase: InventoryPurchase) => void;
  updateInventoryPurchase: (purchase: InventoryPurchase) => void;
  deleteInventoryPurchase: (id: string) => void;
  addMaterialUsage: (usage: MaterialUsage) => boolean;
  deleteMaterialUsage: (
    id: string,
    inventoryItemId: string,
    qty: number,
  ) => void;
  updateMaterialUsage: (usage: MaterialUsage) => void;

  // Reminders
  reminderLogs: ReminderLog[];
  addReminderLog: (r: ReminderLog) => void;

  // Settings
  settings: AppSettings;
  updateSettings: (s: AppSettings) => void;

  // Payables
  payables: Payable[];
  payablePayments: PayablePayment[];
  addPayable: (p: Payable) => void;
  updatePayable: (p: Payable) => void;
  deletePayable: (id: string) => void;
  addPayablePayment: (p: PayablePayment) => void;

  // BOM
  bomItems: BomItem[];
  addBomItem: (item: BomItem) => void;
  updateBomItem: (id: string, updates: Partial<BomItem>) => void;
  deleteBomItem: (id: string) => void;

  // BOM Requisitions
  bomRequisitions: BomRequisition[];
  updateBomRequisition: (id: string, updates: Partial<BomRequisition>) => void;

  // Vendor Master
  vendors: Vendor[];
  addVendor: (v: Vendor) => void;
  updateVendor: (v: Vendor) => void;
  deleteVendor: (id: string) => void;

  // Quality Inspections
  qualityInspections: QualityInspection[];
  addQualityInspection: (q: QualityInspection) => void;
  updateQualityInspection: (q: QualityInspection) => void;

  // Project Items
  projectItems: ProjectItem[];
  addProjectItem: (item: Omit<ProjectItem, "id" | "createdAt">) => void;
  updateProjectItem: (id: string, updates: Partial<ProjectItem>) => void;
  deleteProjectItem: (id: string) => void;

  // Petty Expenses
  pettyExpenses: PettyExpense[];
  addPettyExpense: (e: PettyExpense) => void;
  /** Adds several PettyExpense records in one atomic update, resolving
   * every item's floatId against a single consistent floats snapshot
   * (unlike calling addPettyExpense in a loop, which re-derives float
   * status after each item and can silently strip floatId off an item
   * added after cumulative spend already crosses into "Fully Settled").
   * Used by the Float Settlement dialog's itemized "Purchased Items". */
  addPettyExpensesBatch: (items: PettyExpense[]) => void;
  updatePettyExpense: (e: PettyExpense) => void;
  deletePettyExpense: (id: string) => void;
  restoreFromBackup: (data: Record<string, unknown[]>) => void;

  // Audit Log
  auditLogs: AuditLogEntry[];
  addAuditLog: (entry: Omit<AuditLogEntry, "id" | "timestamp">) => void;

  // Project Activity Log
  addProjectActivity: (
    projectId: string,
    type: ProjectActivityType,
    description: string,
    performedBy: string,
    metadata?: Record<string, string | number>,
  ) => Promise<void>;

  // Stock Reservations
  stockReservations: StockReservation[];
  reserveStock: (
    reservation: Omit<StockReservation, "id" | "reservedAt" | "status">,
  ) => { success: boolean; message: string };
  releaseReservation: (reservationId: string) => void;
  consumeReservation: (reservationId: string) => void;

  // Scrap Management
  scrapRecords: ScrapRecord[];
  addScrapRecord: (r: ScrapRecord) => void;
  updateScrapRecord: (r: ScrapRecord) => void;
  deleteScrapRecord: (id: string) => void;

  // Machinery Management
  // Phase 35 — Supabase-backed (see database/phase-35). serviceRecords/
  // serviceParts/machineDocuments/machineUsageLogs deliberately stay
  // local-only (see phase35_machines_table.sql header) - but every action
  // below that mutates a *machines* field as a side effect of one of
  // those local-only records (service completion, usage logging,
  // breakdown/resolve) is remote-first for that side effect, exactly like
  // addProjectActivity's activityLog sync, so the change survives the
  // next hydration instead of being silently reverted by it.
  machines: Machine[];
  // Phase 35 — captured exactly once, on this browser's first-ever boot
  // after this field was introduced, from whatever `machines` held in
  // localStorage BEFORE that boot's hydration had a chance to run (see
  // the persist() `merge` function below). Never overwritten again after
  // that first capture. This exists because `machines` itself is NOT a
  // safe migration source: the moment Supabase hydration succeeds (which
  // happens automatically, every login), setMachinesFromServer replaces
  // `machines` wholesale - including in the persisted localStorage copy -
  // so by the time a user opens Settings and clicks "Migrate", the
  // original local data is already gone. The Migrate button in
  // Settings.tsx reads THIS field, not `machines`, for exactly that
  // reason - it is the one place pre-Supabase local machine data survives
  // long enough to actually be migrated.
  preMigrationMachinesSnapshot: Machine[] | null;
  machinesHydration: {
    status: "idle" | "loading" | "success" | "error" | "unauthenticated";
    error?: string;
  };
  setMachinesHydrationStatus: (
    status: "idle" | "loading" | "success" | "error" | "unauthenticated",
    error?: string,
  ) => void;
  setMachinesFromServer: (machines: Machine[]) => void;
  serviceRecords: ServiceRecord[];
  serviceParts: ServicePart[];
  machineDocuments: MachineDocument[];
  machineUsageLogs: MachineUsageLog[];
  addMachine: (m: Machine) => void;
  updateMachine: (m: Machine) => void;
  deleteMachine: (id: string) => void;
  addServiceRecord: (r: ServiceRecord) => Promise<boolean>;
  updateServiceRecord: (r: ServiceRecord) => Promise<boolean>;
  deleteServiceRecord: (id: string) => void;
  addServicePart: (p: ServicePart) => void;
  updateServicePart: (p: ServicePart) => void;
  deleteServicePart: (id: string) => void;
  addMachineDocument: (d: MachineDocument) => void;
  deleteMachineDocument: (id: string) => void;
  addMachineUsageLog: (l: MachineUsageLog) => Promise<boolean>;
  deleteMachineUsageLog: (id: string) => Promise<boolean>;
  reportBreakdown: (
    machineId: string,
    cause: string,
    createdBy: string,
  ) => Promise<boolean>;
  resolveBreakdown: (
    machineId: string,
    serviceRecordId: string,
    condition: MachineCondition,
  ) => Promise<boolean>;
  generateMachineCode: () => string;
  generateServiceNumber: (machineId: string) => string;

  // Tool Register (Phase 37) — net-new Supabase-backed module, no local
  // migration needed. Same shape as the Machinery domain above: plain
  // synchronous local setters here, remote-first writes happen at the
  // page level (Tools.tsx), mirroring Machinery.tsx/Employees.tsx.
  tools: Tool[];
  toolsHydration: {
    status: "idle" | "loading" | "success" | "error" | "unauthenticated";
    error?: string;
  };
  setToolsHydrationStatus: (
    status: "idle" | "loading" | "success" | "error" | "unauthenticated",
    error?: string,
  ) => void;
  setToolsFromServer: (tools: Tool[]) => void;
  addTool: (t: Tool) => void;
  updateTool: (t: Tool) => void;
  deleteTool: (id: string) => void;
  generateToolCode: () => string;

  // Tool Assignment History (Phase 43) — insert-only, mirrors
  // machineServiceRates' add-only shape exactly (see lib/toolsApi.ts).
  toolAssignmentHistory: ToolAssignmentHistory[];
  toolAssignmentHistoryHydration: {
    status: "idle" | "loading" | "success" | "error" | "unauthenticated";
    error?: string;
  };
  setToolAssignmentHistoryHydrationStatus: (
    status: "idle" | "loading" | "success" | "error" | "unauthenticated",
    error?: string,
  ) => void;
  setToolAssignmentHistoryFromServer: (rows: ToolAssignmentHistory[]) => void;
  addToolAssignmentHistoryLocal: (r: ToolAssignmentHistory) => void;

  // Tooling/Dies Register (Phase 38) — same shape as Tools above, plus
  // the two compatibility junctions (Machine<->Spare Part, Machine<->
  // Die). Junctions are wholesale-replaced on hydration (no local-only
  // predecessor to merge with) and toggled one pair at a time from the
  // UI, mirroring project_employees/assignedEmployeeIds.
  dies: Die[];
  diesHydration: {
    status: "idle" | "loading" | "success" | "error" | "unauthenticated";
    error?: string;
  };
  setDiesHydrationStatus: (
    status: "idle" | "loading" | "success" | "error" | "unauthenticated",
    error?: string,
  ) => void;
  setDiesFromServer: (dies: Die[]) => void;
  addDie: (d: Die) => void;
  updateDie: (d: Die) => void;
  deleteDie: (id: string) => void;
  generateDieCode: () => string;

  machineSpareParts: MachineSparePart[];
  machineSparePartsHydration: { status: HydrationStatusValue; error?: string };
  setMachineSparePartsHydrationStatus: (
    status: HydrationStatusValue,
    error?: string,
  ) => void;
  setMachineSparePartsFromServer: (rows: MachineSparePart[]) => void;
  addMachineSparePartLocal: (
    machineId: string,
    inventoryItemId: string,
  ) => void;
  removeMachineSparePartLocal: (
    machineId: string,
    inventoryItemId: string,
  ) => void;

  machineDies: MachineDie[];
  machineDiesHydration: { status: HydrationStatusValue; error?: string };
  setMachineDiesHydrationStatus: (
    status: HydrationStatusValue,
    error?: string,
  ) => void;
  setMachineDiesFromServer: (rows: MachineDie[]) => void;
  addMachineDieLocal: (machineId: string, dieId: string) => void;
  removeMachineDieLocal: (machineId: string, dieId: string) => void;

  // Machine/Service Revenue (Phase 40) — billableServices mirrors
  // dies/tools' wholesale-replace shape. machineServiceRates is
  // insert-only (no update/delete action exists - see
  // lib/machineRevenueApi.ts), so its local action is add-only.
  // machineServiceUsage gets full CRUD like a normal domain, but
  // revenueAmount/rateApplied are never recomputed locally from a
  // "current" rate - callers must pass the exact frozen values the
  // remote write already returned/accepted.
  billableServices: BillableService[];
  billableServicesHydration: { status: HydrationStatusValue; error?: string };
  setBillableServicesHydrationStatus: (
    status: HydrationStatusValue,
    error?: string,
  ) => void;
  setBillableServicesFromServer: (services: BillableService[]) => void;
  addBillableServiceLocal: (s: BillableService) => void;
  updateBillableServiceLocal: (s: BillableService) => void;
  deleteBillableServiceLocal: (id: string) => void;

  machineServiceRates: MachineServiceRate[];
  machineServiceRatesHydration: {
    status: HydrationStatusValue;
    error?: string;
  };
  setMachineServiceRatesHydrationStatus: (
    status: HydrationStatusValue,
    error?: string,
  ) => void;
  setMachineServiceRatesFromServer: (rates: MachineServiceRate[]) => void;
  addMachineServiceRateLocal: (r: MachineServiceRate) => void;

  machineServiceUsage: MachineServiceUsage[];
  machineServiceUsageHydration: {
    status: HydrationStatusValue;
    error?: string;
  };
  setMachineServiceUsageHydrationStatus: (
    status: HydrationStatusValue,
    error?: string,
  ) => void;
  setMachineServiceUsageFromServer: (usage: MachineServiceUsage[]) => void;
  addMachineServiceUsageLocal: (u: MachineServiceUsage) => void;
  updateMachineServiceUsageLocal: (u: MachineServiceUsage) => void;
  deleteMachineServiceUsageLocal: (id: string) => void;

  // Export Engine
  exportJobs: ExportJob[];
  addExportJob: (j: ExportJob) => void;
  updateExportJob: (j: ExportJob) => void;
  clearExportJobs: () => void;

  // Salary Advances (Feature 3)
  salaryAdvances: SalaryAdvance[];
  addSalaryAdvance: (a: SalaryAdvance) => void;
  updateSalaryAdvance: (a: SalaryAdvance) => void;
  deleteSalaryAdvance: (id: string) => void;

  // Expense Floats (Feature 4)
  expenseFloats: ExpenseFloat[];
  addExpenseFloat: (f: ExpenseFloat) => void;
  updateExpenseFloat: (f: ExpenseFloat) => void;
  deleteExpenseFloat: (id: string) => void;
  floatCounter: number;

  // Production Movements (Feature 2)
  productionMovements: ProductionMovement[];
  addProductionMovement: (m: ProductionMovement) => void;

  // Repeat Order (Feature 1)
  repeatProject: (
    projectId: string,
    options: {
      newName: string;
      copyDesignFiles: boolean;
      copyBOM: boolean;
      copyCosting: boolean;
      copyStages: boolean;
      copyQC: boolean;
      copyNotes: boolean;
    },
  ) => Promise<string | null>;
}

// Re-export MachineCondition so store users can reference it
export type {
  Machine,
  ServiceRecord,
  ServicePart,
  MachineDocument,
  MachineUsageLog,
  ExportJob,
} from "./types";

/** Backfills Revision 1 (+ a PO from the old recordedPO field, if any) for
 * any quotation that doesn't yet have a revision. Idempotent — checks
 * existing revisions by quotationId first, so it's safe to call on every
 * rehydrate rather than only once. New quotations created after this
 * feature shipped already get Revision 1 at creation time in
 * pages/Quotations.tsx, so this only ever fires for pre-existing data. */
function migrateQuotationsToRevisions(
  quotations: Quotation[],
  existingRevisions: QuotationRevision[],
  existingPOs: QuotationPurchaseOrder[],
): {
  revisions: QuotationRevision[];
  purchaseOrders: QuotationPurchaseOrder[];
} {
  const revisions = [...existingRevisions];
  const purchaseOrders = [...existingPOs];
  const hasRevision = new Set(revisions.map((r) => r.quotationId));
  for (const q of quotations) {
    if (hasRevision.has(q.id)) continue;
    const revisionId = `qrev-migrated-${q.id}`;
    revisions.push({
      id: revisionId,
      quotationId: q.id,
      revisionNumber: 1,
      revisionDate:
        q.quotationDate || new Date(q.createdAt).toISOString().split("T")[0],
      lineItems: q.lineItems,
      subtotal: q.subtotal,
      applyGST: q.applyGST,
      applyIGST: q.applyIGST,
      cgstRate: q.cgstRate,
      sgstRate: q.sgstRate,
      igstRate: q.igstRate,
      cgstAmt: q.cgstAmt,
      sgstAmt: q.sgstAmt,
      igstAmt: q.igstAmt,
      totalAmount: q.totalAmount,
      validUntil: q.validUntil,
      terms: q.terms,
      notes: q.notes,
      status: q.status,
      approvedBy: q.approvedBy,
      approvedAt: q.approvedAt,
      isCurrent: true,
      createdAt: q.createdAt,
    });
    if (q.recordedPO) {
      purchaseOrders.push({
        id: `qpo-migrated-${q.id}`,
        quotationId: q.id,
        revisionId,
        poNumber: q.recordedPO.poNumber,
        poDate: q.recordedPO.poDate,
        customerId: q.customerId,
        files: q.recordedPO.files || [],
        status: "Received",
        sharedPoId: q.recordedPO.sharedPoId,
        createdAt: q.createdAt,
      });
    }
  }
  return { revisions, purchaseOrders };
}

// ── Expense Float ↔ Expense Record linkage ──────────────────────────
//
// ExpenseFloat.spentAmount/balanceAmount/status are a derived read-model,
// not independently-entered data: they're always a pure function of
// issuedAmount, returnedAmount, and the live sum of every PettyExpense
// whose floatId points at this float. This keeps the float and its
// itemized purchase history from ever drifting apart.

function deriveFloatTotals(
  float: ExpenseFloat,
  allPettyExpenses: PettyExpense[],
): Pick<
  ExpenseFloat,
  "spentAmount" | "balanceAmount" | "status" | "settledAt"
> {
  const spentAmount = allPettyExpenses
    .filter((e) => e.floatId === float.id)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const balanceRaw = float.issuedAmount - spentAmount - float.returnedAmount;
  const balanceAmount = Math.max(0, balanceRaw);
  const status: ExpenseFloatStatus =
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

// Phase 27 Batch 3 note: recomputeFloats (the old per-mutation local
// recompute helper) was removed here - its only call sites were the
// addPettyExpense/addPettyExpensesBatch/updatePettyExpense/
// deletePettyExpense local actions, all simplified above to plain
// sync-from-server. deriveFloatTotals itself stays - restoreFromBackup
// (a genuinely local, out-of-scope JSON-import feature) still needs it.

/** Backfills one "legacy spend" PettyExpense (linked via floatId) for every
 * pre-existing ExpenseFloat whose spentAmount was manually entered before
 * Expense Records became the source of truth for float spend. Idempotent —
 * guarded by a deterministic `pe-legacy-<floatId>` id, same convention as
 * migrateQuotationsToRevisions above. Deliberately omits projectId so
 * ProjectDetail's project-cost totals are never retroactively changed by
 * this migration. Must run BEFORE any deriveFloatTotals pass — it reads
 * each float's persisted spentAmount, which a prior recompute would have
 * already zeroed out (nothing would be linked yet).
 *
 * Skips any float that already has at least one real linked PettyExpense:
 * its spentAmount is already properly itemized (derived, not manually
 * typed), so backfilling here would double-count that spend. */
function migrateExpenseFloatLegacySpend(
  floats: ExpenseFloat[],
  existingPettyExpenses: PettyExpense[],
): PettyExpense[] {
  const pettyExpenses = [...existingPettyExpenses];
  const known = new Set(pettyExpenses.map((e) => e.id));
  const floatsWithRealLinks = new Set(
    pettyExpenses
      .filter((e) => e.floatId && e.id !== `pe-legacy-${e.floatId}`)
      .map((e) => e.floatId),
  );
  for (const f of floats) {
    if (f.spentAmount <= 0) continue;
    if (floatsWithRealLinks.has(f.id)) continue;
    const legacyId = `pe-legacy-${f.id}`;
    if (known.has(legacyId)) continue;
    pettyExpenses.push({
      id: legacyId,
      date: f.issuedDate,
      employeeId: f.employeeId,
      amount: f.spentAmount,
      expenseType: "Misc",
      expenseMode: "Company Expense",
      floatId: f.id,
      notes:
        "Legacy spend migrated from float's manually-entered Spent Amount (pre-dates itemized Expense Records)",
      createdAt: new Date(f.createdAt).toISOString(),
    });
  }
  return pettyExpenses;
}

/** One-time-per-record migration: promotes each legacy SalaryAdvance into
 * an equivalent AdvanceRecord, so there is exactly one advance-and-recovery
 * system going forward — AdvanceRecord, the one actually wired into the
 * salary-payment deduction UI. Idempotent — guarded by a deterministic
 * `sa-migrated-<id>` id, same convention as migrateExpenseFloatLegacySpend/
 * migrateQuotationsToRevisions above. SalaryAdvance itself (type, store
 * state, its own actions) is left fully intact — this only stops it from
 * being the thing salary payment reads going forward; no data or code is
 * deleted, matching this app's usual "keep it, just stop writing to it"
 * retirement convention. */
function migrateSalaryAdvancesToAdvanceRecords(
  salaryAdvances: SalaryAdvance[],
  existingAdvanceRecords: AdvanceRecord[],
): AdvanceRecord[] {
  const advanceRecords = [...existingAdvanceRecords];
  const known = new Set(advanceRecords.map((a) => a.id));
  for (const sa of salaryAdvances) {
    const migratedId = `sa-migrated-${sa.id}`;
    if (known.has(migratedId)) continue;
    advanceRecords.push({
      id: migratedId,
      employeeId: sa.employeeId,
      amount: sa.amount,
      date: sa.advanceDate,
      reason: sa.reason || "Migrated from Salary Advance",
      remainingBalance: Math.max(0, sa.amount - sa.recoveredAmount),
    });
  }
  return advanceRecords;
}

// Phase 32 (Task #173) — backfills stageId on any ProjectProductionStage
// that predates this feature (every stage before this change had
// stageId only when it was a synthetic rework row, see
// pages/Production.tsx's handleSendToRework). Runs inside the persist
// `merge` below, same "backfill on load" pattern as
// migrateSalaryAdvancesToAdvanceRecords/migrateExpenseFloatLegacySpend
// above. Pure and idempotent: a production array where every stage
// already has a stageId is returned completely unchanged (same array
// reference), so this is safe to call unconditionally on every load,
// not just once. Never touches any other field, never reorders, never
// drops a stage - only fills in the one missing field.
function migrateProjectProductionStageIds(
  productions: ProjectProduction[],
): ProjectProduction[] {
  let anyChanged = false;
  const migrated = productions.map((pp) => {
    let ppChanged = false;
    const stages = pp.stages.map((stage) => {
      if (stage.stageId) return stage;
      ppChanged = true;
      return { ...stage, stageId: crypto.randomUUID() };
    });
    if (!ppChanged) return pp;
    anyChanged = true;
    return { ...pp, stages };
  });
  return anyChanged ? migrated : productions;
}

/** Strips an expense's float link if it's stale/invalid: float doesn't
 * exist, belongs to a different employee, or is already Fully Settled.
 * Backstop behind the UI's own dropdown filtering (which only ever offers
 * the selected employee's non-fully-settled floats) — silent strip rather
 * than a thrown error since these actions are void-returning. */
// Phase 27 Batch 3 — exported so PettyExpenses.tsx can apply this exact
// validation before building a remote write payload (see store.ts's
// Batch 3 notes on addPettyExpense/etc above).
export function resolveFloatLink(
  candidateFloatId: string | undefined,
  employeeId: string,
  floats: ExpenseFloat[],
): string | undefined {
  if (!candidateFloatId) return undefined;
  const f = floats.find((x) => x.id === candidateFloatId);
  if (!f || f.status === "Fully Settled" || f.employeeId !== employeeId) {
    return undefined;
  }
  return candidateFloatId;
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      customers: sampleCustomers,
      quotations: sampleQuotations,
      quotationRevisions: [],
      quotationPurchaseOrders: [],
      purchaseOrders: samplePOs,
      masterPOs: [],
      companyPOs: [],
      materialRequisitions: sampleMRs,
      deliveryChallans: sampleDCs,
      invoices: sampleInvoices,
      payments: samplePayments,
      counters: {
        QT: 2,
        MR: 1,
        DC: 0,
        INV: 0,
        PAY: 0,
        PROJ: 2,
        MCH: 3,
        SVC: 2,
        EMP: 0,
        TL: 0,
        DIE: 0,
      },

      // Project tracking initial state
      projects: sampleProjects,
      designFiles: sampleDesignFiles,
      internalCostings: sampleInternalCostings,
      materialPurchases: sampleMaterialPurchases,
      outsourcedWorks: sampleOutsourcedWorks,
      projectProductions: sampleProjectProductions,
      preMigrationProjectProductionsSnapshot: null,
      projectProductionsHydration: { status: "idle" },
      projectDeliveries: sampleProjectDeliveries,

      // Auth & HR initial state
      authUsers: [],
      employees: sampleEmployees,
      employeesHydration: { status: "idle" },
      customersHydration: { status: "idle" },
      inventoryItemsHydration: { status: "idle" },
      vendorsHydration: { status: "idle" },
      companyPOsHydration: { status: "idle" },
      projectsHydration: { status: "idle" },
      outsourcedWorksHydration: { status: "idle" },
      advanceRecordsHydration: { status: "idle" },
      attendanceRecordsHydration: { status: "idle" },
      employeeDocumentsHydration: { status: "idle" },
      salaryPaymentsHydration: { status: "idle" },
      inventoryPurchasesHydration: { status: "idle" },
      inventoryUsagesHydration: { status: "idle" },
      bomItemsHydration: { status: "idle" },
      bomRequisitionsHydration: { status: "idle" },
      projectEmployeesHydration: { status: "idle" },
      projectMachineryHydration: { status: "idle" },
      projectDiesHydration: { status: "idle" },
      quotationsHydration: { status: "idle" },
      quotationRevisionsHydration: { status: "idle" },
      masterPOsHydration: { status: "idle" },
      quotationPurchaseOrdersHydration: { status: "idle" },
      projectPurchaseOrdersHydration: { status: "idle" },
      expenseFloatsHydration: { status: "idle" },
      pettyExpensesHydration: { status: "idle" },
      deliveryChallansHydration: { status: "idle" },
      invoicesHydration: { status: "idle" },
      paymentsHydration: { status: "idle" },
      attendanceRecords: [],
      salaryPayments: [],
      advanceRecords: [],
      employeeDocuments: [],

      // Inventory initial state
      inventoryItems: sampleInventory,
      inventoryPurchases: [],
      materialUsages: [],

      // Reminders initial state
      reminderLogs: [],

      // Settings initial state
      settings: defaultSettings,

      // BOM initial state
      bomItems: [],
      bomRequisitions: [],

      // Payables initial state
      payables: samplePayables,
      payablePayments: samplePayablePayments,

      // Project Items initial state
      projectItems: [],

      // Quality Inspections initial state
      qualityInspections: [],

      // Petty Expenses
      pettyExpenses: [],

      // Audit Log
      auditLogs: [],

      // Stock Reservations
      stockReservations: [],

      // Scrap Management
      scrapRecords: [],

      // Machinery initial state
      machines: sampleMachines,
      // Real capture happens in persist()'s merge() below, on first boot
      // with real localStorage. This default only applies to a browser
      // that has genuinely never had ANY fabflow-erp-store localStorage
      // key at all (a brand new browser/device) - there is nothing to
      // migrate in that case, so null (treated as empty) is correct.
      preMigrationMachinesSnapshot: null,
      machinesHydration: { status: "idle" },
      serviceRecords: sampleServiceRecords,
      serviceParts: [],
      machineDocuments: [],
      machineUsageLogs: [],

      // Tool Register initial state (Phase 37) — net-new, starts empty.
      tools: [],
      toolsHydration: { status: "idle" },

      // Tool Assignment History initial state (Phase 43) — net-new, starts empty.
      toolAssignmentHistory: [],
      toolAssignmentHistoryHydration: { status: "idle" },

      // Tooling/Dies Register initial state (Phase 38) — net-new, starts empty.
      dies: [],
      diesHydration: { status: "idle" },
      machineSpareParts: [],
      machineSparePartsHydration: { status: "idle" },
      machineDies: [],
      machineDiesHydration: { status: "idle" },

      // Machine/Service Revenue initial state (Phase 40) — net-new, starts empty.
      billableServices: [],
      billableServicesHydration: { status: "idle" },
      machineServiceRates: [],
      machineServiceRatesHydration: { status: "idle" },
      machineServiceUsage: [],
      machineServiceUsageHydration: { status: "idle" },

      // Export Engine initial state
      exportJobs: [],

      // Salary Advances initial state
      salaryAdvances: [],

      // Expense Floats initial state
      expenseFloats: [],
      floatCounter: 0,

      // Production Movements initial state
      productionMovements: [],

      // Vendors initial state (with auto-migration from existing names)
      vendors: (() => {
        const base: Vendor[] = [...sampleVendors];
        return base;
      })(),

      generateDocNo: (prefix) => {
        const year = new Date().getFullYear();
        const next = get().counters[prefix] + 1;
        set((s) => ({ counters: { ...s.counters, [prefix]: next } }));
        return `${prefix}-${year}-${String(next).padStart(3, "0")}`;
      },

      addCustomer: (c) => set((s) => ({ customers: [...s.customers, c] })),
      updateCustomer: (c) =>
        set((s) => ({
          customers: s.customers.map((x) => (x.id === c.id ? c : x)),
        })),
      deleteCustomer: (id) => {
        const s = get();
        const hasQuotations = (s.quotations || []).some(
          (q) => q.customerId === id,
        );
        const hasInvoices = (s.invoices || []).some((i) => i.customerId === id);
        const hasProjects = (s.projects || []).some((p) => p.customerId === id);
        if (hasQuotations || hasInvoices || hasProjects) {
          alert(
            "Cannot delete customer. Linked transactions or projects exist.",
          );
          return;
        }
        set((s) => ({ customers: s.customers.filter((x) => x.id !== id) }));
      },

      // Phase 27 Batch 2 — quotations is now server-backed. history/
      // version used to be computed here on every update (snapshot the
      // pre-update row, bump version); that responsibility moved to
      // Quotations.tsx's handleSave, which builds the correct next
      // history array (a real quotations.history jsonb column) BEFORE
      // calling updateQuotationRemote, so the DB round-trip returns the
      // authoritative row. version itself has no DB column - it's
      // derived as history.length + 1 in hydration.ts's
      // transformQuotationRow, never computed here. These three actions
      // now only sync the local array from what the remote call actually
      // returned - no local recompute, no dead-code risk.
      addQuotation: (q) => set((s) => ({ quotations: [...s.quotations, q] })),
      deleteQuotation: (id) =>
        set((s) => ({ quotations: s.quotations.filter((x) => x.id !== id) })),
      updateQuotation: (q) =>
        set((s) => ({
          quotations: s.quotations.map((x) => (x.id === q.id ? q : x)),
        })),

      addQuotationRevision: (r) =>
        set((s) => ({
          quotationRevisions: [...(s.quotationRevisions || []), r],
        })),
      updateQuotationRevision: (r) =>
        set((s) => ({
          quotationRevisions: (s.quotationRevisions || []).map((x) =>
            x.id === r.id ? r : x,
          ),
        })),
      addQuotationPurchaseOrder: (p) =>
        set((s) => ({
          quotationPurchaseOrders: [...(s.quotationPurchaseOrders || []), p],
        })),
      updateQuotationPurchaseOrder: (p) =>
        set((s) => ({
          quotationPurchaseOrders: (s.quotationPurchaseOrders || []).map((x) =>
            x.id === p.id ? p : x,
          ),
        })),

      addPurchaseOrder: (p) =>
        set((s) => ({ purchaseOrders: [...s.purchaseOrders, p] })),
      updatePurchaseOrder: (p) =>
        set((s) => ({
          purchaseOrders: s.purchaseOrders.map((x) => (x.id === p.id ? p : x)),
        })),

      // Phase 27 Batch 2 — master_pos is now server-backed. The old
      // local hasProjects guard is superseded by the real DB RESTRICT
      // constraint from quotation_purchase_orders/project_purchase_orders
      // (checked in lib/purchaseOrdersApi.ts's deleteMasterPORemote,
      // which surfaces a clear error before this local action ever
      // runs) - these three are now plain sync-from-server-result.
      addMasterPO: (m) =>
        set((s) => ({ masterPOs: [...(s.masterPOs || []), m] })),
      updateMasterPO: (m) =>
        set((s) => ({
          masterPOs: (s.masterPOs || []).map((x) => (x.id === m.id ? m : x)),
        })),
      deleteMasterPO: (id) =>
        set((s) => ({
          masterPOs: (s.masterPOs || []).filter((x) => x.id !== id),
        })),

      addCompanyPO: (p) =>
        set((s) => ({ companyPOs: [...(s.companyPOs || []), p] })),
      updateCompanyPO: (p) =>
        set((s) => ({
          companyPOs: (s.companyPOs || []).map((x) => (x.id === p.id ? p : x)),
        })),
      deleteCompanyPO: (id) =>
        set((s) => ({
          companyPOs: (s.companyPOs || []).filter((x) => x.id !== id),
        })),

      addMaterialRequisition: (m) =>
        set((s) => ({ materialRequisitions: [...s.materialRequisitions, m] })),
      updateMaterialRequisition: (m) =>
        set((s) => ({
          materialRequisitions: s.materialRequisitions.map((x) =>
            x.id === m.id ? m : x,
          ),
        })),

      addDeliveryChallan: (d) =>
        set((s) => ({ deliveryChallans: [...s.deliveryChallans, d] })),
      updateDeliveryChallan: (d) =>
        set((s) => ({
          deliveryChallans: s.deliveryChallans.map((x) =>
            x.id === d.id ? d : x,
          ),
        })),
      // Phase 27 Batch 4 — the old hasInvoices guard moved to
      // DeliveryChallans.tsx's delete handler, checked BEFORE calling
      // deleteDeliveryChallanRemote (this stays a pure local business
      // rule - invoices is still fully local, unrelated to this domain's
      // own server migration - but it must run before the network call,
      // not after, now that this action only syncs a confirmed result).
      deleteDeliveryChallan: (id) =>
        set((s) => ({
          deliveryChallans: s.deliveryChallans.filter((x) => x.id !== id),
        })),

      addInvoice: (i) => set((s) => ({ invoices: [...s.invoices, i] })),
      deleteInvoice: (id) =>
        set((s) => ({ invoices: s.invoices.filter((x) => x.id !== id) })),
      updateInvoice: (i) =>
        set((s) => ({
          invoices: s.invoices.map((x) => (x.id === i.id ? i : x)),
        })),

      addPayment: (p) => set((s) => ({ payments: [...s.payments, p] })),
      removePaymentsForInvoice: (invoiceId) =>
        set((s) => ({
          payments: s.payments.filter((p) => p.invoiceId !== invoiceId),
        })),

      // Project tracking implementations
      addProject: (p) => {
        const projectWithVersion = { ...p, productionVersion: "v2" as const };
        const defaultV2Production: ProjectProduction = {
          id: `pp-${Date.now()}`,
          projectId: p.id,
          version: "v2",
          stages: DEFAULT_V2_STAGES.map((stg) => ({
            stageName: stg.name,
            status: "NotStarted" as ProjectStageStatus,
            notes: "",
            quantitySent: 0,
            sentDateTime: "",
            sentToVendorId: "",
            sentToVendorName: "",
            receivedQuantity: 0,
            receivedDateTime: "",
            startTime: "",
            endTime: "",
            requiresMaterialTracking: stg.requiresMaterialTracking,
            transactions: [],
            // Phase 32 (Task #173) - stable identity, generated once per
            // stage instance, never reused across projects or stages.
            stageId: crypto.randomUUID(),
          })),
        };
        set((s) => ({
          projects: [...s.projects, projectWithVersion],
          projectProductions: [...s.projectProductions, defaultV2Production],
        }));
      },
      updateProject: (p) =>
        set((s) => ({
          projects: s.projects.map((x) => (x.id === p.id ? p : x)),
        })),
      deleteProject: (id) => {
        const s = get();
        const hasInvoices = (s.invoices || []).some((i) => i.projectId === id);
        const hasDCs = (s.deliveryChallans || []).some((dc) =>
          (dc.projectEntries || []).some((e) => e.projectId === id),
        );
        const hasUsages = (s.materialUsages || []).some(
          (u) => u.projectId === id,
        );
        if (hasInvoices || hasDCs || hasUsages) {
          alert(
            "Cannot delete project. Linked records exist (invoices, delivery challans, or material usage).",
          );
          return;
        }
        set((s) => ({ projects: s.projects.filter((x) => x.id !== id) }));
      },

      addProjectPO: (projectId, po) =>
        set((s) => ({
          projects: s.projects.map((x) =>
            x.id === projectId ? { ...x, pos: [...(x.pos || []), po] } : x,
          ),
        })),

      updateProjectPO: (projectId, po) =>
        set((s) => ({
          projects: s.projects.map((x) =>
            x.id === projectId
              ? {
                  ...x,
                  pos: (x.pos || []).map((p) => (p.id === po.id ? po : p)),
                }
              : x,
          ),
        })),

      addDesignFile: (f) =>
        set((s) => ({ designFiles: [...s.designFiles, f] })),
      deleteDesignFile: (id) =>
        set((s) => ({ designFiles: s.designFiles.filter((f) => f.id !== id) })),

      upsertInternalCosting: (c) =>
        set((s) => {
          const exists = s.internalCostings.find(
            (x) => x.projectId === c.projectId,
          );
          return {
            internalCostings: exists
              ? s.internalCostings.map((x) =>
                  x.projectId === c.projectId ? c : x,
                )
              : [...s.internalCostings, c],
          };
        }),

      addMaterialPurchase: (m) =>
        set((s) => {
          // Find existing inventory item by name (case-insensitive match)
          const existingItem = s.inventoryItems.find(
            (x) =>
              x.name.trim().toLowerCase() ===
              m.materialType.trim().toLowerCase(),
          );

          let updatedInventoryItems = s.inventoryItems;
          let newItemId: string;

          if (existingItem) {
            newItemId = existingItem.id;
            updatedInventoryItems = s.inventoryItems.map((x) =>
              x.id === existingItem.id
                ? {
                    ...x,
                    quantityAvailable: x.quantityAvailable + m.quantity,
                    lastUpdated: Date.now(),
                  }
                : x,
            );
          } else {
            newItemId = `inv-auto-${Date.now()}`;
            const newItem: InventoryItem = {
              id: newItemId,
              name: m.materialType,
              unit: m.unit?.trim() || "units",
              quantityAvailable: m.quantity,
              lastUpdated: Date.now(),
            };
            updatedInventoryItems = [...s.inventoryItems, newItem];
          }

          // Create inventory purchase record for traceability
          const invPurchase: InventoryPurchase = {
            id: `invp-auto-${Date.now()}`,
            inventoryItemId: newItemId,
            materialName: m.materialType,
            quantityPurchased: m.quantity,
            supplierName: m.supplierName,
            vendorId: m.vendorId || undefined,
            purchaseDate: m.purchaseDate,
            cost: 0,
            attachments: m.attachments,
            createdAt: Date.now(),
          };

          // Update BOM requisitions
          const newQty =
            updatedInventoryItems.find((x) => x.id === newItemId)
              ?.quantityAvailable ?? 0;
          const updatedReqs = s.bomRequisitions.map((r) => {
            if (
              r.inventoryItemId === newItemId &&
              r.status === "Pending" &&
              newQty >= r.shortageQty
            ) {
              return {
                ...r,
                status: "Ready to Complete" as BomRequisitionStatus,
                updatedAt: Date.now(),
              };
            }
            return r;
          });

          return {
            materialPurchases: [...s.materialPurchases, m],
            inventoryItems: updatedInventoryItems,
            inventoryPurchases: [...s.inventoryPurchases, invPurchase],
            bomRequisitions: updatedReqs,
          };
        }),
      updateMaterialPurchase: (m) =>
        set((s) => ({
          materialPurchases: s.materialPurchases.map((x) =>
            x.id === m.id ? m : x,
          ),
        })),
      deleteMaterialPurchase: (id) =>
        set((s) => ({
          materialPurchases: s.materialPurchases.filter((x) => x.id !== id),
        })),

      addOutsourcedWork: (o) =>
        set((s) => ({ outsourcedWorks: [...s.outsourcedWorks, o] })),
      updateOutsourcedWork: (o) =>
        set((s) => ({
          outsourcedWorks: s.outsourcedWorks.map((x) =>
            x.id === o.id ? o : x,
          ),
        })),
      deleteOutsourcedWork: (id) =>
        set((s) => ({
          outsourcedWorks: (s.outsourcedWorks || []).filter((x) => x.id !== id),
        })),

      // Remote-first: upsertProjectionStagesRemote (the atomic RPC) must
      // succeed before local state changes at all. On success, local
      // state is set to the REQUESTED stages/production as-sent, not the
      // RPC's returned rows - the RPC's response only carries
      // project_production_stages columns (transactions:[] always, per
      // rowToProjectProductionStage), so using it directly here would
      // silently wipe every stage's local `transactions` array. What was
      // sent is deterministically what's now persisted, so reusing it
      // avoids that data loss without a second round-trip.
      upsertProjectProduction: async (p) => {
        const result = await upsertProjectionStagesRemote(
          p.projectId,
          p.stages || [],
        );
        if (result.status !== "success") {
          console.error(
            `[upsertProjectProduction] Supabase write failed: ${result.error ?? result.status}`,
          );
          return false;
        }
        set((s) => {
          const exists = s.projectProductions.find(
            (x) => x.projectId === p.projectId,
          );
          return {
            projectProductions: exists
              ? s.projectProductions.map((x) =>
                  x.projectId === p.projectId ? p : x,
                )
              : [...s.projectProductions, p],
          };
        });
        return true;
      },

      addStageTransaction: async (projectId, stageIdx, tx) => {
        const stage = get().projectProductions.find(
          (pp) => pp.projectId === projectId,
        )?.stages?.[stageIdx];
        if (!stage?.stageId) {
          console.error(
            `[addStageTransaction] stage at index ${stageIdx} for project ${projectId} has no stageId - cannot persist to Supabase.`,
          );
          return false;
        }
        const result = await recordStageTransactionRemote(stage.stageId, tx);
        if (result.status !== "success" || !result.data) {
          console.error(
            `[addStageTransaction] Supabase write failed: ${result.error ?? result.status}`,
          );
          return false;
        }
        const savedTx = result.data;
        set((s) => ({
          projectProductions: s.projectProductions.map((pp) => {
            if (pp.projectId !== projectId) return pp;
            const stages = (pp.stages || []).map((st, i) => {
              if (i !== stageIdx) return st;
              const newTxs = [...(st.transactions || []), savedTx];
              const totalSent = newTxs
                .filter((t) => t.type === "send")
                .reduce((a, t) => a + t.quantity, 0);
              const totalReceived = newTxs
                .filter((t) => t.type === "receive")
                .reduce((a, t) => a + t.quantity, 0);
              return {
                ...st,
                transactions: newTxs,
                quantitySent: totalSent,
                receivedQuantity: totalReceived,
              };
            });
            return { ...pp, stages };
          }),
        }));
        return true;
      },

      updateProjectStagesV2: async (projectId, stages) => {
        const result = await upsertProjectionStagesRemote(projectId, stages);
        if (result.status !== "success") {
          console.error(
            `[updateProjectStagesV2] Supabase write failed: ${result.error ?? result.status}`,
          );
          return false;
        }
        set((s) => ({
          projectProductions: s.projectProductions.map((pp) =>
            pp.projectId === projectId ? { ...pp, stages } : pp,
          ),
        }));
        return true;
      },

      upsertProjectDelivery: (d) =>
        set((s) => {
          const exists = s.projectDeliveries.find(
            (x) => x.projectId === d.projectId,
          );
          return {
            projectDeliveries: exists
              ? s.projectDeliveries.map((x) =>
                  x.projectId === d.projectId ? d : x,
                )
              : [...s.projectDeliveries, d],
          };
        }),

      // Auth & HR actions
      addAuthUser: (u) => set((s) => ({ authUsers: [...s.authUsers, u] })),
      updateAuthUser: (u) =>
        set((s) => ({
          authUsers: s.authUsers.map((x) => (x.id === u.id ? u : x)),
        })),
      addEmployee: (e) => set((s) => ({ employees: [...s.employees, e] })),
      updateEmployee: (e) =>
        set((s) => ({
          employees: s.employees.map((x) => (x.id === e.id ? e : x)),
        })),
      setEmployeesHydrationStatus: (status, error) =>
        set({ employeesHydration: { status, error } }),
      setEmployeesFromServer: (employees) =>
        set({ employees, employeesHydration: { status: "success" } }),
      setCustomersHydrationStatus: (status, error) =>
        set({ customersHydration: { status, error } }),
      setCustomersFromServer: (customers) =>
        set({ customers, customersHydration: { status: "success" } }),
      setInventoryItemsHydrationStatus: (status, error) =>
        set({ inventoryItemsHydration: { status, error } }),
      setVendorsHydrationStatus: (status, error) =>
        set({ vendorsHydration: { status, error } }),
      setVendorsFromServer: (vendors) =>
        set({ vendors, vendorsHydration: { status: "success" } }),
      setCompanyPOsHydrationStatus: (status, error) =>
        set({ companyPOsHydration: { status, error } }),
      setCompanyPOsFromServer: (companyPOs) =>
        set({ companyPOs, companyPOsHydration: { status: "success" } }),
      setProjectsHydrationStatus: (status, error) =>
        set({ projectsHydration: { status, error } }),
      // Phase 22 Decision 3 + PO-fields follow-up (both explicitly
      // approved) - NOT a wholesale replace. assignedEmployeeIds/pos/
      // poNumber/poDate/poFiles have no DB column, so they'd be wiped to
      // undefined on every successful hydration under the wholesale-
      // replace pattern every other domain uses. Instead, merge those
      // five fields in from the CURRENT local project (matched by id)
      // before committing the server-authoritative data. A project the
      // server doesn't know about yet (mid-flight local-only state) is
      // simply not in the incoming array and is dropped, same as every
      // other domain's hydration-replace semantics for everything else.
      setProjectsFromServer: (projects) =>
        set((s) => {
          const localById = new Map(s.projects.map((p) => [p.id, p]));
          const merged = projects.map((p) => {
            const local = localById.get(p.id);
            return {
              ...p,
              assignedEmployeeIds: local?.assignedEmployeeIds,
              pos: local?.pos,
              poNumber: local?.poNumber,
              poDate: local?.poDate,
              poFiles: local?.poFiles,
            };
          });
          return {
            projects: merged,
            projectsHydration: { status: "success" },
          };
        }),
      setInventoryItemsFromServer: (inventoryItems) =>
        set({
          inventoryItems,
          inventoryItemsHydration: { status: "success" },
        }),
      setOutsourcedWorksHydrationStatus: (status, error) =>
        set({ outsourcedWorksHydration: { status, error } }),
      // Wholesale replace - no local-only fields in this domain, unlike
      // Projects' setProjectsFromServer above.
      setOutsourcedWorksFromServer: (outsourcedWorks) =>
        set({
          outsourcedWorks,
          outsourcedWorksHydration: { status: "success" },
        }),

      // Phase 27 Batch 1
      setAdvanceRecordsHydrationStatus: (status, error) =>
        set({ advanceRecordsHydration: { status, error } }),
      setAdvanceRecordsFromServer: (advanceRecords) =>
        set({ advanceRecords, advanceRecordsHydration: { status: "success" } }),

      setAttendanceRecordsHydrationStatus: (status, error) =>
        set({ attendanceRecordsHydration: { status, error } }),
      setAttendanceRecordsFromServer: (attendanceRecords) =>
        set({
          attendanceRecords,
          attendanceRecordsHydration: { status: "success" },
        }),

      setEmployeeDocumentsHydrationStatus: (status, error) =>
        set({ employeeDocumentsHydration: { status, error } }),
      // uploadedBy has no DB column (see lib/hydration.ts) - merged in
      // from current local state per document id, same shape as
      // Projects' assignedEmployeeIds merge-exception. A document the
      // server doesn't know about yet is simply dropped, same semantics
      // as every other domain's hydration-replace.
      setEmployeeDocumentsFromServer: (docs) =>
        set((s) => {
          const localById = new Map(s.employeeDocuments.map((d) => [d.id, d]));
          const merged = docs.map((d) => ({
            ...d,
            uploadedBy: localById.get(d.id)?.uploadedBy ?? "—",
          }));
          return {
            employeeDocuments: merged,
            employeeDocumentsHydration: { status: "success" },
          };
        }),

      setSalaryPaymentsHydrationStatus: (status, error) =>
        set({ salaryPaymentsHydration: { status, error } }),
      setSalaryPaymentsFromServer: (salaryPayments) =>
        set({ salaryPayments, salaryPaymentsHydration: { status: "success" } }),

      setInventoryPurchasesHydrationStatus: (status, error) =>
        set({ inventoryPurchasesHydration: { status, error } }),
      setInventoryPurchasesFromServer: (inventoryPurchases) =>
        set({
          inventoryPurchases,
          inventoryPurchasesHydration: { status: "success" },
        }),

      setInventoryUsagesHydrationStatus: (status, error) =>
        set({ inventoryUsagesHydration: { status, error } }),
      setInventoryUsagesFromServer: (materialUsages) =>
        set({
          materialUsages,
          inventoryUsagesHydration: { status: "success" },
        }),

      setBomItemsHydrationStatus: (status, error) =>
        set({ bomItemsHydration: { status, error } }),
      setBomItemsFromServer: (bomItems) =>
        set({ bomItems, bomItemsHydration: { status: "success" } }),

      setBomRequisitionsHydrationStatus: (status, error) =>
        set({ bomRequisitionsHydration: { status, error } }),
      setBomRequisitionsFromServer: (bomRequisitions) =>
        set({
          bomRequisitions,
          bomRequisitionsHydration: { status: "success" },
        }),

      setProjectEmployeesHydrationStatus: (status, error) =>
        set({ projectEmployeesHydration: { status, error } }),
      // Groups pairs by projectId and applies to whatever project rows
      // currently exist in state. Runs independently of Projects'
      // hydration effect (both are separate useEffects) - safe either
      // order, since both this action and setProjectsFromServer's own
      // assignedEmployeeIds merge are idempotent forward-carries of the
      // same eventual DB truth (see store.ts's Phase 27 Batch 1 notes).
      setProjectEmployeesFromServer: (pairs) =>
        set((s) => {
          const byProject = new Map<string, string[]>();
          for (const { projectId, employeeId } of pairs) {
            const arr = byProject.get(projectId) ?? [];
            arr.push(employeeId);
            byProject.set(projectId, arr);
          }
          return {
            projects: s.projects.map((p) => ({
              ...p,
              assignedEmployeeIds: byProject.get(p.id) ?? [],
            })),
            projectEmployeesHydration: { status: "success" },
          };
        }),

      // project_machinery / project_dies (Phase 39) — same
      // group-pairs-by-projectId shape as setProjectEmployeesFromServer
      // above, applied to assignedMachineIds/assignedDieIds instead.
      setProjectMachineryHydrationStatus: (status, error) =>
        set({ projectMachineryHydration: { status, error } }),
      setProjectMachineryFromServer: (pairs) =>
        set((s) => {
          const byProject = new Map<string, string[]>();
          for (const { projectId, machineId } of pairs) {
            const arr = byProject.get(projectId) ?? [];
            arr.push(machineId);
            byProject.set(projectId, arr);
          }
          return {
            projects: s.projects.map((p) => ({
              ...p,
              assignedMachineIds: byProject.get(p.id) ?? [],
            })),
            projectMachineryHydration: { status: "success" },
          };
        }),
      setProjectDiesHydrationStatus: (status, error) =>
        set({ projectDiesHydration: { status, error } }),
      setProjectDiesFromServer: (pairs) =>
        set((s) => {
          const byProject = new Map<string, string[]>();
          for (const { projectId, dieId } of pairs) {
            const arr = byProject.get(projectId) ?? [];
            arr.push(dieId);
            byProject.set(projectId, arr);
          }
          return {
            projects: s.projects.map((p) => ({
              ...p,
              assignedDieIds: byProject.get(p.id) ?? [],
            })),
            projectDiesHydration: { status: "success" },
          };
        }),

      // Phase 27 Batch 2
      setQuotationsHydrationStatus: (status, error) =>
        set({ quotationsHydration: { status, error } }),
      // approvedBy (display username, no DB column) and recordedPO
      // (legacy, never written) merged in from current local state per
      // quotation id - same shape as employeeDocuments.uploadedBy.
      setQuotationsFromServer: (quotations) =>
        set((s) => {
          const localById = new Map(s.quotations.map((q) => [q.id, q]));
          const merged = quotations.map((q) => {
            const local = localById.get(q.id);
            return {
              ...q,
              approvedBy: local?.approvedBy,
              recordedPO: local?.recordedPO,
            };
          });
          return {
            quotations: merged,
            quotationsHydration: { status: "success" },
          };
        }),

      setQuotationRevisionsHydrationStatus: (status, error) =>
        set({ quotationRevisionsHydration: { status, error } }),
      // createdBy (display username, no DB column) merged in from
      // current local state per revision id.
      setQuotationRevisionsFromServer: (revisions) =>
        set((s) => {
          const localById = new Map(s.quotationRevisions.map((r) => [r.id, r]));
          const merged = revisions.map((r) => ({
            ...r,
            createdBy: localById.get(r.id)?.createdBy,
          }));
          return {
            quotationRevisions: merged,
            quotationRevisionsHydration: { status: "success" },
          };
        }),

      setMasterPOsHydrationStatus: (status, error) =>
        set({ masterPOsHydration: { status, error } }),
      // Plain wholesale replace - sharedPoId has no DB gap, derived
      // directly from the row's own id in hydration.ts.
      setMasterPOsFromServer: (masterPOs) =>
        set({ masterPOs, masterPOsHydration: { status: "success" } }),

      setQuotationPurchaseOrdersHydrationStatus: (status, error) =>
        set({ quotationPurchaseOrdersHydration: { status, error } }),
      // createdBy (display username, no DB column) merged in from
      // current local state per PO id.
      setQuotationPurchaseOrdersFromServer: (pos) =>
        set((s) => {
          const localById = new Map(
            s.quotationPurchaseOrders.map((p) => [p.id, p]),
          );
          const merged = pos.map((p) => ({
            ...p,
            createdBy: localById.get(p.id)?.createdBy,
          }));
          return {
            quotationPurchaseOrders: merged,
            quotationPurchaseOrdersHydration: { status: "success" },
          };
        }),

      setProjectPurchaseOrdersHydrationStatus: (status, error) =>
        set({ projectPurchaseOrdersHydration: { status, error } }),
      // Groups pairs by projectId and applies to whatever project rows
      // currently exist in state - identical shape to
      // setProjectEmployeesFromServer above, safe in either resolution
      // order against setProjectsFromServer's own pos merge-exception.
      setProjectPurchaseOrdersFromServer: (pairs) =>
        set((s) => {
          const byProject = new Map<string, ProjectPO[]>();
          for (const { projectId, po } of pairs) {
            const arr = byProject.get(projectId) ?? [];
            arr.push(po);
            byProject.set(projectId, arr);
          }
          return {
            projects: s.projects.map((p) => ({
              ...p,
              pos: byProject.get(p.id) ?? [],
            })),
            projectPurchaseOrdersHydration: { status: "success" },
          };
        }),

      // Phase 27 Batch 3
      setExpenseFloatsHydrationStatus: (status, error) =>
        set({ expenseFloatsHydration: { status, error } }),
      // issuedBy (display username, no DB column) merged in from
      // current local state per float id.
      setExpenseFloatsFromServer: (floats) =>
        set((s) => {
          const localById = new Map(s.expenseFloats.map((f) => [f.id, f]));
          const merged = floats.map((f) => ({
            ...f,
            issuedBy: localById.get(f.id)?.issuedBy ?? "—",
          }));
          return {
            expenseFloats: merged,
            expenseFloatsHydration: { status: "success" },
          };
        }),

      setPettyExpensesHydrationStatus: (status, error) =>
        set({ pettyExpensesHydration: { status, error } }),
      setPettyExpensesFromServer: (pettyExpenses) =>
        set({
          pettyExpenses,
          pettyExpensesHydration: { status: "success" },
        }),

      // Phase 27 Batch 4
      setDeliveryChallansHydrationStatus: (status, error) =>
        set({ deliveryChallansHydration: { status, error } }),
      setDeliveryChallansFromServer: (deliveryChallans) =>
        set({
          deliveryChallans,
          deliveryChallansHydration: { status: "success" },
        }),

      // Phase 27 Batch 5
      setInvoicesHydrationStatus: (status, error) =>
        set({ invoicesHydration: { status, error } }),
      setInvoicesFromServer: (invoices) =>
        set({
          invoices,
          invoicesHydration: { status: "success" },
        }),

      setPaymentsHydrationStatus: (status, error) =>
        set({ paymentsHydration: { status, error } }),
      setPaymentsFromServer: (payments) =>
        set({
          payments,
          paymentsHydration: { status: "success" },
        }),

      deleteEmployee: (id) => {
        const s = get();
        const hasSalary = (s.salaryPayments || []).some(
          (sp) => sp.employeeId === id,
        );
        const hasAdvance = (s.advanceRecords || []).some(
          (ar) => ar.employeeId === id,
        );
        if (hasSalary || hasAdvance) {
          alert(
            "Cannot delete employee. Linked salary payments or advance records exist.",
          );
          return;
        }
        set((s) => ({
          employees: s.employees.filter((x) => x.id !== id),
          employeeDocuments: (s.employeeDocuments || []).filter(
            (x) => x.employeeId !== id,
          ),
        }));
      },
      addAttendanceRecord: (r) =>
        set((s) => ({ attendanceRecords: [...s.attendanceRecords, r] })),
      updateAttendanceRecord: (r) =>
        set((s) => ({
          attendanceRecords: s.attendanceRecords.map((x) =>
            x.id === r.id ? r : x,
          ),
        })),
      addSalaryPayment: (p) =>
        set((s) => ({ salaryPayments: [...s.salaryPayments, p] })),
      addAdvanceRecord: (a) =>
        set((s) => ({ advanceRecords: [...s.advanceRecords, a] })),
      updateAdvanceRecord: (a) =>
        set((s) => ({
          advanceRecords: s.advanceRecords.map((x) => (x.id === a.id ? a : x)),
        })),
      addEmployeeDocument: (d) =>
        set((s) => ({
          employeeDocuments: [...(s.employeeDocuments || []), d],
        })),
      updateEmployeeDocument: (d) =>
        set((s) => ({
          employeeDocuments: (s.employeeDocuments || []).map((x) =>
            x.id === d.id ? d : x,
          ),
        })),
      deleteEmployeeDocument: (id) =>
        set((s) => ({
          employeeDocuments: (s.employeeDocuments || []).filter(
            (x) => x.id !== id,
          ),
        })),

      // Inventory actions
      addInventoryItem: (item) =>
        set((s) => ({ inventoryItems: [...s.inventoryItems, item] })),
      updateInventoryItem: (item) =>
        set((s) => ({
          inventoryItems: s.inventoryItems.map((x) =>
            x.id === item.id ? item : x,
          ),
        })),
      deleteInventoryItem: (id) =>
        set((s) => ({
          inventoryItems: s.inventoryItems.filter((x) => x.id !== id),
        })),
      updateInventoryPurchase: (purchase) =>
        set((s) => {
          const updatedPurchases = s.inventoryPurchases.map((x) =>
            x.id === purchase.id ? purchase : x,
          );
          // Recalculate stock for the affected item
          const allForItem = updatedPurchases.filter(
            (x) => x.inventoryItemId === purchase.inventoryItemId,
          );
          const newQty = allForItem.reduce(
            (sum, x) => sum + x.quantityPurchased,
            0,
          );
          const usedQty = (s.materialUsages || [])
            .filter((u) => u.inventoryItemId === purchase.inventoryItemId)
            .reduce((sum, u) => sum + u.quantityUsed, 0);
          const lastPurchase = allForItem.sort(
            (a, b) => b.createdAt - a.createdAt,
          )[0];
          const updatedItems = s.inventoryItems.map((x) =>
            x.id === purchase.inventoryItemId
              ? {
                  ...x,
                  quantityAvailable: Math.max(0, newQty - usedQty),
                  lastUpdated: Date.now(),
                  lastPurchasePrice: lastPurchase
                    ? (lastPurchase.unitCost ?? lastPurchase.cost) > 0
                      ? (lastPurchase.unitCost ?? lastPurchase.cost)
                      : x.lastPurchasePrice
                    : x.lastPurchasePrice,
                }
              : x,
          );
          return {
            inventoryPurchases: updatedPurchases,
            inventoryItems: updatedItems,
          };
        }),
      deleteInventoryPurchase: (id) =>
        set((s) => {
          const purchase = s.inventoryPurchases.find((x) => x.id === id);
          if (!purchase) return {};
          const updatedPurchases = s.inventoryPurchases.filter(
            (x) => x.id !== id,
          );
          const allForItem = updatedPurchases.filter(
            (x) => x.inventoryItemId === purchase.inventoryItemId,
          );
          const newQty = allForItem.reduce(
            (sum, x) => sum + x.quantityPurchased,
            0,
          );
          const usedQty = (s.materialUsages || [])
            .filter((u) => u.inventoryItemId === purchase.inventoryItemId)
            .reduce((sum, u) => sum + u.quantityUsed, 0);
          const lastPurchase = allForItem.sort(
            (a, b) => b.createdAt - a.createdAt,
          )[0];
          const updatedItems = s.inventoryItems.map((x) =>
            x.id === purchase.inventoryItemId
              ? {
                  ...x,
                  quantityAvailable: Math.max(0, newQty - usedQty),
                  lastUpdated: Date.now(),
                  lastPurchasePrice: lastPurchase
                    ? (lastPurchase.unitCost ?? lastPurchase.cost) > 0
                      ? (lastPurchase.unitCost ?? lastPurchase.cost)
                      : x.lastPurchasePrice
                    : undefined,
                }
              : x,
          );
          return {
            inventoryPurchases: updatedPurchases,
            inventoryItems: updatedItems,
          };
        }),
      addInventoryPurchase: (purchase) =>
        set((s) => {
          const updatedInventory = s.inventoryItems.map((x) =>
            x.id === purchase.inventoryItemId
              ? {
                  ...x,
                  quantityAvailable:
                    x.quantityAvailable + purchase.quantityPurchased,
                  lastUpdated: Date.now(),
                  unitCost:
                    (purchase.unitCost ?? purchase.cost) > 0
                      ? (purchase.unitCost ?? purchase.cost)
                      : x.unitCost,
                  lastPurchasePrice:
                    (purchase.unitCost ?? purchase.cost) > 0
                      ? (purchase.unitCost ??
                        Math.round(
                          (purchase.cost / purchase.quantityPurchased) * 100,
                        ) / 100)
                      : x.lastPurchasePrice,
                }
              : x,
          );
          const newQty =
            updatedInventory.find((x) => x.id === purchase.inventoryItemId)
              ?.quantityAvailable ?? 0;
          const updatedReqs = s.bomRequisitions.map((r) => {
            if (
              r.inventoryItemId === purchase.inventoryItemId &&
              r.status === "Pending" &&
              newQty >= r.shortageQty
            ) {
              return {
                ...r,
                status: "Ready to Complete" as BomRequisitionStatus,
                updatedAt: Date.now(),
              };
            }
            return r;
          });
          return {
            inventoryPurchases: [...s.inventoryPurchases, purchase],
            inventoryItems: updatedInventory,
            bomRequisitions: updatedReqs,
          };
        }),
      deleteAuthUser: (id) =>
        set((s) => ({ authUsers: s.authUsers.filter((x) => x.id !== id) })),
      addMaterialUsage: (usage) => {
        const item = get().inventoryItems.find(
          (x) => x.id === usage.inventoryItemId,
        );
        if (!item || item.quantityAvailable < usage.quantityUsed) return false;
        set((s) => ({
          materialUsages: [...s.materialUsages, usage],
          inventoryItems: s.inventoryItems.map((x) =>
            x.id === usage.inventoryItemId
              ? {
                  ...x,
                  quantityAvailable: x.quantityAvailable - usage.quantityUsed,
                  lastUpdated: Date.now(),
                }
              : x,
          ),
        }));
        return true;
      },
      deleteMaterialUsage: (id, inventoryItemId, qty) =>
        set((s) => ({
          materialUsages: s.materialUsages.filter((x) => x.id !== id),
          inventoryItems: s.inventoryItems.map((x) =>
            x.id === inventoryItemId
              ? {
                  ...x,
                  quantityAvailable: x.quantityAvailable + qty,
                  lastUpdated: Date.now(),
                }
              : x,
          ),
        })),
      updateMaterialUsage: (usage) =>
        set((s) => ({
          materialUsages: s.materialUsages.map((x) =>
            x.id === usage.id ? usage : x,
          ),
        })),

      // Reminder actions
      addReminderLog: (r) =>
        set((s) => ({ reminderLogs: [...s.reminderLogs, r] })),

      // Settings actions
      updateSettings: (s) => set(() => ({ settings: s })),

      // Payables actions
      addPayable: (p) => set((s) => ({ payables: [...s.payables, p] })),
      updatePayable: (p) =>
        set((s) => ({
          payables: s.payables.map((x) => (x.id === p.id ? p : x)),
        })),
      deletePayable: (id) =>
        set((s) => ({
          payables: s.payables.filter((x) => x.id !== id),
          payablePayments: s.payablePayments.filter((x) => x.payableId !== id),
        })),
      // BOM actions
      // NOTE: bomRequisitions is now fully server-owned (populated via
      // hydrateBomRequisitions()/setBomRequisitionsFromServer, driven by
      // the DB's recompute_bom_requisition() trigger on project_bom_items).
      // These three actions used to also locally recompute bomRequisitions
      // from client-side shortage math, but every real call site
      // (ProjectDetail.tsx) always calls refreshBomRequisitions() right
      // after, which wholesale-replaces this slice from the server anyway
      // — so the local recompute was dead weight that only risked a
      // momentary stale/incorrect flash. Removed; these actions now only
      // touch bomItems.
      addBomItem: (item) =>
        set((s) => ({
          bomItems: [...s.bomItems, item],
        })),
      updateBomItem: (id, updates) =>
        set((s) => ({
          bomItems: s.bomItems.map((x) =>
            x.id === id ? { ...x, ...updates } : x,
          ),
        })),
      deleteBomItem: (id) =>
        set((s) => ({
          bomItems: s.bomItems.filter((x) => x.id !== id),
        })),

      updateBomRequisition: (id, updates) =>
        set((s) => ({
          bomRequisitions: s.bomRequisitions.map((r) =>
            r.id === id ? { ...r, ...updates } : r,
          ),
        })),

      // Vendor actions
      addVendor: (v) =>
        set((s) => {
          // Deduplicate by normalized name
          const exists = s.vendors.find(
            (x) => x.name.trim().toLowerCase() === v.name.trim().toLowerCase(),
          );
          if (exists) return {};
          return { vendors: [...s.vendors, v] };
        }),
      updateVendor: (v) =>
        set((s) => ({
          vendors: s.vendors.map((x) => (x.id === v.id ? v : x)),
        })),
      deleteVendor: (id) =>
        set((s) => ({ vendors: s.vendors.filter((x) => x.id !== id) })),

      addQualityInspection: (q) =>
        set((s) => ({ qualityInspections: [...s.qualityInspections, q] })),
      updateQualityInspection: (q) =>
        set((s) => ({
          qualityInspections: s.qualityInspections.map((x) =>
            x.id === q.id ? q : x,
          ),
        })),

      // Project Items actions
      addProjectItem: (item) =>
        set((s) => ({
          projectItems: [
            ...s.projectItems,
            { ...item, id: crypto.randomUUID(), createdAt: Date.now() },
          ],
        })),
      updateProjectItem: (id, updates) =>
        set((s) => ({
          projectItems: s.projectItems.map((x) =>
            x.id === id ? { ...x, ...updates } : x,
          ),
        })),
      deleteProjectItem: (id) =>
        set((s) => ({
          projectItems: s.projectItems.filter((x) => x.id !== id),
        })),
      // Phase 27 Batch 3 — petty_expenses/expense_floats are now
      // server-backed. The old local floatId-resolution (resolveFloatLink)
      // and float-recompute-on-every-mutation logic used to live here;
      // resolveFloatLink's validation (float not fully settled, employee
      // matches) is a real business rule with no DB-enforced equivalent,
      // so it moved to PettyExpenses.tsx, applied BEFORE building the
      // remote write payload. The float recompute itself is now the DB
      // trigger's job (trg_recompute_petty_expense_floats), always more
      // current than any local derivation could be. These four actions
      // now only sync the local array from what the remote call actually
      // returned.
      addPettyExpense: (e) =>
        set((s) => ({ pettyExpenses: [...(s.pettyExpenses || []), e] })),
      addPettyExpensesBatch: (items) =>
        set((s) => ({
          pettyExpenses: [...(s.pettyExpenses || []), ...items],
        })),
      updatePettyExpense: (e) =>
        set((s) => ({
          pettyExpenses: (s.pettyExpenses || []).map((x) =>
            x.id === e.id ? e : x,
          ),
        })),
      deletePettyExpense: (id) =>
        set((s) => ({
          pettyExpenses: (s.pettyExpenses || []).filter((x) => x.id !== id),
        })),

      // ── Audit Log ─────────────────────────────────────────────
      addAuditLog: (entry) =>
        set((s) => ({
          auditLogs: [
            ...(s.auditLogs || []).slice(-499), // keep last 500 entries
            { ...entry, id: crypto.randomUUID(), timestamp: Date.now() },
          ],
        })),

      // ── Scrap Management ─────────────────────────────────────
      addScrapRecord: (r) =>
        set((s) => ({ scrapRecords: [...(s.scrapRecords || []), r] })),
      updateScrapRecord: (r) =>
        set((s) => ({
          scrapRecords: (s.scrapRecords || []).map((x) =>
            x.id === r.id ? r : x,
          ),
        })),
      deleteScrapRecord: (id) =>
        set((s) => ({
          scrapRecords: (s.scrapRecords || []).filter((x) => x.id !== id),
        })),

      // ── Stock Reservations ────────────────────────────────────
      reserveStock: (reservation) => {
        const state = get();
        const item = (state.inventoryItems || []).find(
          (i) => i.id === reservation.inventoryItemId,
        );
        if (!item) return { success: false, message: "Item not found" };
        const reserved = (state.stockReservations || [])
          .filter(
            (r) =>
              r.inventoryItemId === reservation.inventoryItemId &&
              r.status === "active",
          )
          .reduce((s, r) => s + r.quantity, 0);
        const available = item.quantityAvailable - reserved;
        if (reservation.quantity > available)
          return {
            success: false,
            message: `Only ${available} ${item.unit} available (${item.quantityAvailable} total − ${reserved} reserved)`,
          };
        const newReservation: StockReservation = {
          ...reservation,
          id: crypto.randomUUID(),
          reservedAt: Date.now(),
          status: "active",
        };
        set((s) => ({
          stockReservations: [...(s.stockReservations || []), newReservation],
          inventoryItems: s.inventoryItems.map((it) =>
            it.id === reservation.inventoryItemId
              ? {
                  ...it,
                  quantityReserved:
                    (it.quantityReserved ?? 0) + reservation.quantity,
                }
              : it,
          ),
        }));
        return {
          success: true,
          message: `Reserved ${reservation.quantity} ${item.unit}`,
        };
      },
      releaseReservation: (reservationId) => {
        const state = get();
        const res = (state.stockReservations || []).find(
          (r) => r.id === reservationId,
        );
        if (!res || res.status !== "active") return;
        set((s) => ({
          stockReservations: s.stockReservations.map((r) =>
            r.id === reservationId ? { ...r, status: "released" } : r,
          ),
          inventoryItems: s.inventoryItems.map((it) =>
            it.id === res.inventoryItemId
              ? {
                  ...it,
                  quantityReserved: Math.max(
                    0,
                    (it.quantityReserved ?? 0) - res.quantity,
                  ),
                }
              : it,
          ),
        }));
      },
      consumeReservation: (reservationId) => {
        const state = get();
        const res = (state.stockReservations || []).find(
          (r) => r.id === reservationId,
        );
        if (!res || res.status !== "active") return;
        set((s) => ({
          stockReservations: s.stockReservations.map((r) =>
            r.id === reservationId ? { ...r, status: "consumed" } : r,
          ),
          inventoryItems: s.inventoryItems.map((it) =>
            it.id === res.inventoryItemId
              ? {
                  ...it,
                  quantityAvailable: Math.max(
                    0,
                    it.quantityAvailable - res.quantity,
                  ),
                  quantityReserved: Math.max(
                    0,
                    (it.quantityReserved ?? 0) - res.quantity,
                  ),
                }
              : it,
          ),
        }));
      },

      // ── Project Activity Log ───────────────────────────────────
      // Phase 22 — remote-first (explicitly approved). activity_log is a
      // real DB column (unlike assignedEmployeeIds/pos/etc.), so this
      // must actually reach Supabase rather than being treated as
      // another local-only merge exception - otherwise every note/
      // auto-logged event added after project creation would silently
      // vanish on the next successful hydration.
      addProjectActivity: async (
        projectId,
        type,
        description,
        performedBy,
        metadata,
      ) => {
        const s = get();
        const project = (s.projects || []).find((p) => p.id === projectId);
        if (!project) return;
        const entry: ProjectActivity = {
          id: crypto.randomUUID(),
          type,
          description,
          performedBy,
          timestamp: Date.now(),
          metadata,
        };
        const updatedActivityLog = [...(project.activityLog || []), entry];
        const result = await updateProjectRemote({
          ...project,
          activityLog: updatedActivityLog,
        });
        // Never fabricate success - if the remote write failed (RLS
        // denial, no session, etc.), the entry is simply not added
        // locally either, so the UI never claims a note/event was saved
        // when it wasn't.
        if (result.status !== "success" || !result.data) return;
        const updatedProject = result.data;
        set((st) => ({
          projects: st.projects.map((p) =>
            p.id !== projectId
              ? p
              : {
                  ...updatedProject,
                  // Preserve local-only fields exactly as every other
                  // updateProjectRemote caller does.
                  assignedEmployeeIds: p.assignedEmployeeIds,
                  pos: p.pos,
                  poNumber: p.poNumber,
                  poDate: p.poDate,
                  poFiles: p.poFiles,
                },
          ),
        }));
      },

      // ── Machinery actions ──────────────────────────────────────
      generateMachineCode: () => {
        const next = get().counters.MCH + 1;
        set((s) => ({ counters: { ...s.counters, MCH: next } }));
        return `MCH-${String(next).padStart(3, "0")}`;
      },

      generateServiceNumber: (machineId) => {
        const machine = get().machines.find((m) => m.id === machineId);
        const existing = get().serviceRecords.filter(
          (r) => r.machineId === machineId,
        );
        const next = existing.length + 1;
        const code = machine?.machineCode || "MCH";
        return `SVC-${code}-${String(next).padStart(3, "0")}`;
      },

      addMachine: (m) => set((s) => ({ machines: [...(s.machines || []), m] })),

      updateMachine: (m) =>
        set((s) => ({
          machines: (s.machines || []).map((x) => (x.id === m.id ? m : x)),
        })),

      deleteMachine: (id) => {
        const s = get();
        const hasSvcRecords = (s.serviceRecords || []).some(
          (r) => r.machineId === id,
        );
        const hasUsageLogs = (s.machineUsageLogs || []).some(
          (l) => l.machineId === id,
        );
        if (hasSvcRecords || hasUsageLogs) {
          alert("Cannot delete machine. Service records or usage logs exist.");
          return;
        }
        set((s) => ({
          machines: (s.machines || []).filter((x) => x.id !== id),
          machineDocuments: (s.machineDocuments || []).filter(
            (x) => x.machineId !== id,
          ),
        }));
      },

      setMachinesHydrationStatus: (status, error) =>
        set({ machinesHydration: { status, error } }),
      setMachinesFromServer: (machines) =>
        set({ machines, machinesHydration: { status: "success" } }),
      setProjectProductionsHydrationStatus: (status, error) =>
        set({ projectProductionsHydration: { status, error } }),
      setProjectProductionsFromServer: (productions) =>
        set({
          projectProductions: productions,
          projectProductionsHydration: { status: "success" },
        }),

      // Phase 35 — addServiceRecord/updateServiceRecord/addMachineUsageLog/
      // deleteMachineUsageLog/reportBreakdown/resolveBreakdown all mutate a
      // *machines* row as a side effect of a local-only record. Each is now
      // remote-first for that side effect only (same discipline as
      // addProjectActivity above): the Machine-field update is pushed to
      // Supabase first, and the local-only record (ServiceRecord/
      // MachineUsageLog) is only written locally once that succeeds - so a
      // reload/re-hydration can never show a service record that says
      // "Completed" next to a machine whose status silently reverted
      // because the field never actually reached the server. Returns false
      // (nothing written, local or remote) on any non-success result so
      // the caller can surface it instead of assuming success.
      addServiceRecord: async (r) => {
        const s = get();
        const machine = (s.machines || []).find((m) => m.id === r.machineId);
        if (!machine) {
          // No matching machine to update (shouldn't happen in practice) -
          // still record the service entry itself.
          set((st) => ({ serviceRecords: [...(st.serviceRecords || []), r] }));
          return true;
        }
        const updates: Partial<Machine> = { updatedAt: Date.now() };
        if (r.status === "Completed") {
          updates.lastServiceDate = r.serviceDate;
          if (r.nextServiceDue) updates.nextServiceDue = r.nextServiceDue;
          if (
            r.machineCondition &&
            (machine.currentStatus === "Under Maintenance" ||
              machine.currentStatus === "Breakdown")
          ) {
            updates.currentStatus = "Operational";
          }
        } else if (r.status === "In Progress") {
          updates.currentStatus = "Under Maintenance";
        }
        const updatedMachine: Machine = { ...machine, ...updates };
        const result = await updateMachineRemote(updatedMachine);
        if (result.status !== "success" || !result.data) return false;
        const savedMachine = result.data;
        set((st) => ({
          serviceRecords: [...(st.serviceRecords || []), r],
          machines: (st.machines || []).map((m) =>
            m.id === savedMachine.id ? savedMachine : m,
          ),
        }));
        return true;
      },

      updateServiceRecord: async (r) => {
        const s = get();
        const machine = (s.machines || []).find((m) => m.id === r.machineId);
        if (!machine) {
          set((st) => ({
            serviceRecords: (st.serviceRecords || []).map((x) =>
              x.id === r.id ? r : x,
            ),
          }));
          return true;
        }
        const updates: Partial<Machine> = { updatedAt: Date.now() };
        if (r.status === "Completed") {
          updates.lastServiceDate = r.serviceDate;
          if (r.nextServiceDue) updates.nextServiceDue = r.nextServiceDue;
          updates.currentStatus = "Operational";
        }
        const updatedMachine: Machine = { ...machine, ...updates };
        const result = await updateMachineRemote(updatedMachine);
        if (result.status !== "success" || !result.data) return false;
        const savedMachine = result.data;
        set((st) => ({
          serviceRecords: (st.serviceRecords || []).map((x) =>
            x.id === r.id ? r : x,
          ),
          machines: (st.machines || []).map((m) =>
            m.id === savedMachine.id ? savedMachine : m,
          ),
        }));
        return true;
      },

      deleteServiceRecord: (id) =>
        set((s) => ({
          serviceRecords: (s.serviceRecords || []).filter((x) => x.id !== id),
          serviceParts: (s.serviceParts || []).filter(
            (x) => x.serviceRecordId !== id,
          ),
        })),

      addServicePart: (p) =>
        set((s) => ({ serviceParts: [...(s.serviceParts || []), p] })),

      updateServicePart: (p) =>
        set((s) => ({
          serviceParts: (s.serviceParts || []).map((x) =>
            x.id === p.id ? p : x,
          ),
        })),

      deleteServicePart: (id) =>
        set((s) => ({
          serviceParts: (s.serviceParts || []).filter((x) => x.id !== id),
        })),

      addMachineDocument: (d) =>
        set((s) => ({ machineDocuments: [...(s.machineDocuments || []), d] })),

      deleteMachineDocument: (id) =>
        set((s) => ({
          machineDocuments: (s.machineDocuments || []).filter(
            (x) => x.id !== id,
          ),
        })),

      addMachineUsageLog: async (l) => {
        const s = get();
        const machine = (s.machines || []).find((m) => m.id === l.machineId);
        if (!machine) {
          set((st) => ({
            machineUsageLogs: [...(st.machineUsageLogs || []), l],
          }));
          return true;
        }
        const updatedMachine: Machine = {
          ...machine,
          totalRunningHours: machine.totalRunningHours + l.hoursUsed,
          updatedAt: Date.now(),
        };
        const result = await updateMachineRemote(updatedMachine);
        if (result.status !== "success" || !result.data) return false;
        const savedMachine = result.data;
        set((st) => ({
          machineUsageLogs: [...(st.machineUsageLogs || []), l],
          machines: (st.machines || []).map((m) =>
            m.id === savedMachine.id ? savedMachine : m,
          ),
        }));
        return true;
      },

      deleteMachineUsageLog: async (id) => {
        const s = get();
        const log = (s.machineUsageLogs || []).find((l) => l.id === id);
        if (!log) return true;
        const machine = (s.machines || []).find((m) => m.id === log.machineId);
        if (!machine) {
          set((st) => ({
            machineUsageLogs: (st.machineUsageLogs || []).filter(
              (x) => x.id !== id,
            ),
          }));
          return true;
        }
        const updatedMachine: Machine = {
          ...machine,
          totalRunningHours: Math.max(
            0,
            machine.totalRunningHours - log.hoursUsed,
          ),
          updatedAt: Date.now(),
        };
        const result = await updateMachineRemote(updatedMachine);
        if (result.status !== "success" || !result.data) return false;
        const savedMachine = result.data;
        set((st) => ({
          machineUsageLogs: (st.machineUsageLogs || []).filter(
            (x) => x.id !== id,
          ),
          machines: (st.machines || []).map((m) =>
            m.id === savedMachine.id ? savedMachine : m,
          ),
        }));
        return true;
      },

      reportBreakdown: async (machineId, cause, createdBy) => {
        const s = get();
        const machine = (s.machines || []).find((m) => m.id === machineId);
        if (!machine) return false;
        const svcNumber = get().generateServiceNumber(machineId);
        const svcRecord: ServiceRecord = {
          id: crypto.randomUUID(),
          machineId,
          serviceNumber: svcNumber,
          serviceDate: new Date().toISOString().split("T")[0],
          serviceType: "Breakdown",
          performedBy: "Internal",
          serviceCost: 0,
          travelCost: 0,
          downtimeHours: 0,
          breakdownCause: cause,
          machineCondition: "Poor",
          status: "In Progress",
          createdBy,
          createdAt: Date.now(),
        };
        const updatedMachine: Machine = {
          ...machine,
          currentStatus: "Breakdown",
          updatedAt: Date.now(),
        };
        const result = await updateMachineRemote(updatedMachine);
        if (result.status !== "success" || !result.data) return false;
        const savedMachine = result.data;
        set((st) => ({
          machines: (st.machines || []).map((m) =>
            m.id === savedMachine.id ? savedMachine : m,
          ),
          serviceRecords: [...(st.serviceRecords || []), svcRecord],
        }));
        return true;
      },

      resolveBreakdown: async (machineId, serviceRecordId, condition) => {
        const s = get();
        const machine = (s.machines || []).find((m) => m.id === machineId);
        if (!machine) return false;
        const updatedMachine: Machine = {
          ...machine,
          currentStatus: "Operational",
          updatedAt: Date.now(),
        };
        const result = await updateMachineRemote(updatedMachine);
        if (result.status !== "success" || !result.data) return false;
        const savedMachine = result.data;
        set((st) => ({
          machines: (st.machines || []).map((m) =>
            m.id === savedMachine.id ? savedMachine : m,
          ),
          serviceRecords: (st.serviceRecords || []).map((r) =>
            r.id === serviceRecordId
              ? { ...r, status: "Completed", machineCondition: condition }
              : r,
          ),
        }));
        return true;
      },

      // ── Tool Register actions (Phase 37) ────────────────────────
      // Plain local setters, same shape as addMachine/updateMachine/
      // deleteMachine above - remote-first writes happen at the page
      // level (Tools.tsx calls createToolRemote/updateToolRemote/
      // deleteToolRemote first, then these only on a confirmed success).
      setToolsHydrationStatus: (status, error) =>
        set({ toolsHydration: { status, error } }),
      setToolsFromServer: (tools) =>
        set({ tools, toolsHydration: { status: "success" } }),
      addTool: (t) => set((s) => ({ tools: [...(s.tools || []), t] })),
      updateTool: (t) =>
        set((s) => ({
          tools: (s.tools || []).map((x) => (x.id === t.id ? t : x)),
        })),
      deleteTool: (id) =>
        set((s) => ({ tools: (s.tools || []).filter((x) => x.id !== id) })),
      generateToolCode: () => {
        const next = get().counters.TL + 1;
        set((s) => ({ counters: { ...s.counters, TL: next } }));
        return `TL-${String(next).padStart(3, "0")}`;
      },

      // ── Tool Assignment History actions (Phase 43) ──────────────
      // Insert-only, same shape as addMachineServiceRateLocal below - no
      // update/delete action exists because none should (see schema
      // header on tool_assignment_history).
      setToolAssignmentHistoryHydrationStatus: (status, error) =>
        set({ toolAssignmentHistoryHydration: { status, error } }),
      setToolAssignmentHistoryFromServer: (rows) =>
        set({
          toolAssignmentHistory: rows,
          toolAssignmentHistoryHydration: { status: "success" },
        }),
      addToolAssignmentHistoryLocal: (r) =>
        set((s) => ({
          toolAssignmentHistory: [r, ...(s.toolAssignmentHistory || [])],
        })),

      // ── Tooling/Dies Register actions (Phase 38) ────────────────
      setDiesHydrationStatus: (status, error) =>
        set({ diesHydration: { status, error } }),
      setDiesFromServer: (dies) =>
        set({ dies, diesHydration: { status: "success" } }),
      addDie: (d) => set((s) => ({ dies: [...(s.dies || []), d] })),
      updateDie: (d) =>
        set((s) => ({
          dies: (s.dies || []).map((x) => (x.id === d.id ? d : x)),
        })),
      deleteDie: (id) =>
        set((s) => ({ dies: (s.dies || []).filter((x) => x.id !== id) })),
      generateDieCode: () => {
        const next = get().counters.DIE + 1;
        set((s) => ({ counters: { ...s.counters, DIE: next } }));
        return `DIE-${String(next).padStart(3, "0")}`;
      },

      setMachineSparePartsHydrationStatus: (status, error) =>
        set({ machineSparePartsHydration: { status, error } }),
      setMachineSparePartsFromServer: (rows) =>
        set({
          machineSpareParts: rows,
          machineSparePartsHydration: { status: "success" },
        }),
      addMachineSparePartLocal: (machineId, inventoryItemId) =>
        set((s) => ({
          machineSpareParts: [
            ...(s.machineSpareParts || []),
            { machineId, inventoryItemId, createdAt: Date.now() },
          ],
        })),
      removeMachineSparePartLocal: (machineId, inventoryItemId) =>
        set((s) => ({
          machineSpareParts: (s.machineSpareParts || []).filter(
            (x) =>
              !(
                x.machineId === machineId &&
                x.inventoryItemId === inventoryItemId
              ),
          ),
        })),

      setMachineDiesHydrationStatus: (status, error) =>
        set({ machineDiesHydration: { status, error } }),
      setMachineDiesFromServer: (rows) =>
        set({ machineDies: rows, machineDiesHydration: { status: "success" } }),
      addMachineDieLocal: (machineId, dieId) =>
        set((s) => ({
          machineDies: [
            ...(s.machineDies || []),
            { machineId, dieId, createdAt: Date.now() },
          ],
        })),
      removeMachineDieLocal: (machineId, dieId) =>
        set((s) => ({
          machineDies: (s.machineDies || []).filter(
            (x) => !(x.machineId === machineId && x.dieId === dieId),
          ),
        })),

      // ── Machine/Service Revenue actions (Phase 40) ─────────────
      setBillableServicesHydrationStatus: (status, error) =>
        set({ billableServicesHydration: { status, error } }),
      setBillableServicesFromServer: (services) =>
        set({
          billableServices: services,
          billableServicesHydration: { status: "success" },
        }),
      addBillableServiceLocal: (s) =>
        set((st) => ({
          billableServices: [...(st.billableServices || []), s],
        })),
      updateBillableServiceLocal: (s) =>
        set((st) => ({
          billableServices: (st.billableServices || []).map((x) =>
            x.id === s.id ? s : x,
          ),
        })),
      deleteBillableServiceLocal: (id) =>
        set((st) => ({
          billableServices: (st.billableServices || []).filter(
            (x) => x.id !== id,
          ),
        })),

      setMachineServiceRatesHydrationStatus: (status, error) =>
        set({ machineServiceRatesHydration: { status, error } }),
      setMachineServiceRatesFromServer: (rates) =>
        set({
          machineServiceRates: rates,
          machineServiceRatesHydration: { status: "success" },
        }),
      // Insert-only, mirroring the DB table itself (see
      // lib/machineRevenueApi.ts) - no update/delete counterpart.
      addMachineServiceRateLocal: (r) =>
        set((st) => ({
          machineServiceRates: [...(st.machineServiceRates || []), r],
        })),

      setMachineServiceUsageHydrationStatus: (status, error) =>
        set({ machineServiceUsageHydration: { status, error } }),
      setMachineServiceUsageFromServer: (usage) =>
        set({
          machineServiceUsage: usage,
          machineServiceUsageHydration: { status: "success" },
        }),
      addMachineServiceUsageLocal: (u) =>
        set((st) => ({
          machineServiceUsage: [...(st.machineServiceUsage || []), u],
        })),
      updateMachineServiceUsageLocal: (u) =>
        set((st) => ({
          machineServiceUsage: (st.machineServiceUsage || []).map((x) =>
            x.id === u.id ? u : x,
          ),
        })),
      deleteMachineServiceUsageLocal: (id) =>
        set((st) => ({
          machineServiceUsage: (st.machineServiceUsage || []).filter(
            (x) => x.id !== id,
          ),
        })),

      // ── Export Engine actions ──────────────────────────────────
      addExportJob: (j) =>
        set((s) => ({ exportJobs: [...(s.exportJobs || []), j] })),

      updateExportJob: (j) =>
        set((s) => ({
          exportJobs: (s.exportJobs || []).map((x) => (x.id === j.id ? j : x)),
        })),

      clearExportJobs: () => set(() => ({ exportJobs: [] })),

      // ── Salary Advance actions ────────────────────────────────────
      addSalaryAdvance: (a) =>
        set((s) => ({ salaryAdvances: [...(s.salaryAdvances || []), a] })),

      updateSalaryAdvance: (a) =>
        set((s) => ({
          salaryAdvances: (s.salaryAdvances || []).map((x) =>
            x.id === a.id ? a : x,
          ),
        })),

      deleteSalaryAdvance: (id) =>
        set((s) => ({
          salaryAdvances: (s.salaryAdvances || []).filter((x) => x.id !== id),
        })),

      // ── Expense Float actions ─────────────────────────────────────
      // Phase 27 Batch 3 — expense_floats is now server-backed.
      // spent_amount/balance_amount/status/settled_at are 100%
      // trigger-owned (see lib/expenseFloatsApi.ts's notes) - the old
      // local deriveFloatTotals recompute here is dead weight now, since
      // every caller passes in the row the remote call actually
      // returned. floatCounter is kept purely as a local "next suggested
      // number" UX hint for PettyExpenses.tsx's Issue Float dialog - the
      // real collision-safe number comes from
      // createExpenseFloatRemote's bounded retry against live server
      // state, never from this counter alone.
      addExpenseFloat: (f) =>
        set((s) => ({
          expenseFloats: [...(s.expenseFloats || []), f],
          floatCounter: (s.floatCounter || 0) + 1,
        })),

      updateExpenseFloat: (f) =>
        set((s) => ({
          expenseFloats: (s.expenseFloats || []).map((x) =>
            x.id === f.id ? f : x,
          ),
        })),

      deleteExpenseFloat: (id) =>
        set((s) => ({
          expenseFloats: (s.expenseFloats || []).filter((x) => x.id !== id),
        })),

      // ── Production Movement actions ───────────────────────────────
      addProductionMovement: (m) =>
        set((s) => ({
          productionMovements: [...(s.productionMovements || []), m],
        })),

      // ── Repeat Order action ───────────────────────────────────────
      repeatProject: async (projectId, options) => {
        const s = get();
        const src = (s.projects || []).find((p) => p.id === projectId);
        if (!src) return null;

        // Resolve the canonical customer-visible base name
        const baseCustomerName =
          src.customerVisibleName || src.originalProjectName || src.projectName;

        // Count existing repeat orders from this source (or its parent)
        const rootId = src.parentProjectId || src.sourceProjectId || projectId;
        const existingRepeats = (s.projects || []).filter(
          (p) =>
            p.parentProjectId === rootId ||
            p.parentProjectId === projectId ||
            p.sourceProjectId === rootId ||
            p.sourceProjectId === projectId,
        );
        const seq = existingRepeats.length + 1;

        const internalOrderCode = `ORD-${String(seq).padStart(3, "0")}`;
        // projectName keeps the full internal tracking name; customerVisibleName is the clean name
        const internalProjectName = `${baseCustomerName} - ${internalOrderCode}`;

        const year = new Date().getFullYear();
        const projCount = (s.projects || []).length + 1;
        const initialProjectNo = `PROJ-${year}-${String(projCount).padStart(3, "0")}`;

        // Phase 22 — remote-first. The Project row goes through the same
        // remote boundary and bounded project-number retry as primary
        // creation. Design files/BOM items/internal costing/production
        // stages stay local-only clones exactly as before - none of
        // those domains are migrated this phase (Decision 1), so this is
        // not a partial migration of repeatProject, it's the same "only
        // this domain's own table moves" boundary already applied
        // everywhere else.
        const result = await createProjectRemote({
          projectNo: initialProjectNo,
          customerId: src.customerId,
          projectName: options.newName || internalProjectName,
          workDescription: src.workDescription,
          totalQty: src.totalQty,
          productionVersion: src.productionVersion,
          customerVisibleName: baseCustomerName,
          internalOrderCode,
          projectType: "REPEAT_ORDER",
          parentProjectId: rootId,
          originalProjectName: baseCustomerName,
          sourceProjectId: rootId,
          repeatOrderSeq: seq,
          activityLog: [
            {
              id: crypto.randomUUID(),
              type: "project_created",
              description: `Repeat order ${internalOrderCode} created from ${baseCustomerName}`,
              performedBy: "system",
              timestamp: Date.now(),
            },
          ],
        });

        if (result.status !== "success" || !result.data) {
          return null;
        }

        const newId = result.data.id;
        const newProject: Project = {
          ...result.data,
          // Inherited from source - matches the original spread-based
          // behavior exactly (assignedEmployeeIds was never explicitly
          // reset by repeatProject).
          assignedEmployeeIds: src.assignedEmployeeIds,
          // Reset operational fields - matches original behavior exactly.
          pos: [],
          poNumber: undefined,
          poDate: undefined,
          poFiles: [],
        };

        // Deep-clone design files
        const newDesignFiles = options.copyDesignFiles
          ? (s.designFiles || [])
              .filter((f) => f.projectId === projectId)
              .map((f) => ({ ...f, id: crypto.randomUUID(), projectId: newId }))
          : [];

        // Deep-clone BOM items
        const newBomItems = options.copyBOM
          ? (s.bomItems || [])
              .filter((b) => b.projectId === projectId)
              .map((b) => ({
                ...b,
                id: crypto.randomUUID(),
                projectId: newId,
                createdAt: Date.now(),
              }))
          : [];

        // Deep-clone internal costing (structure only, not values)
        const srcCosting = (s.internalCostings || []).find(
          (c) => c.projectId === projectId,
        );
        const newCosting =
          options.copyCosting && srcCosting
            ? [{ ...srcCosting, id: crypto.randomUUID(), projectId: newId }]
            : [];

        // Deep-clone production stages (reset progress)
        const srcProd = (s.projectProductions || []).find(
          (p) => p.projectId === projectId,
        );
        const newProd: ProjectProduction[] =
          options.copyStages && srcProd
            ? [
                {
                  id: crypto.randomUUID(),
                  projectId: newId,
                  version: srcProd.version,
                  stages: srcProd.stages.map((st) => ({
                    ...st,
                    status: "NotStarted" as ProjectStageStatus,
                    notes: "",
                    quantitySent: 0,
                    sentDateTime: "",
                    receivedQuantity: 0,
                    receivedDateTime: "",
                    startTime: "",
                    endTime: "",
                    transactions: [],
                    sentQty: 0,
                    receivedQty: 0,
                    okQty: 0,
                    rejectedQty: 0,
                    reworkQty: 0,
                    wipInProgressQty: 0,
                    wipCompletedQty: 0,
                    wipDispatchedQty: 0,
                    // Phase 32 (Task #173) - this is a NEW, independent
                    // stage instance in the new project, not the same
                    // stage as the source; `...st` above would otherwise
                    // carry the source's stageId over verbatim, making
                    // two unrelated stages (in two different projects)
                    // share one id. Every cloned stage gets its own fresh
                    // id, same as every other stage-creation path.
                    stageId: crypto.randomUUID(),
                  })),
                },
              ]
            : [];

        set((st) => ({
          projects: [...(st.projects || []), newProject],
          designFiles: [...(st.designFiles || []), ...newDesignFiles],
          bomItems: [...(st.bomItems || []), ...newBomItems],
          internalCostings: [...(st.internalCostings || []), ...newCosting],
          projectProductions: [...(st.projectProductions || []), ...newProd],
        }));

        return newId;
      },

      restoreFromBackup: (data) =>
        set(() => {
          const backupQuotations = (data.quotations as Quotation[]) || [];
          const { revisions: migratedRevisions, purchaseOrders: migratedPOs } =
            migrateQuotationsToRevisions(
              backupQuotations,
              (data.quotationRevisions as QuotationRevision[]) || [],
              (data.quotationPurchaseOrders as QuotationPurchaseOrder[]) || [],
            );
          const backupFloats = (data.expenseFloats as ExpenseFloat[]) || [];
          const pettyExpensesWithLegacySpend = migrateExpenseFloatLegacySpend(
            backupFloats,
            (data.pettyExpenses as PettyExpense[]) || [],
          );
          const expenseFloatsDerived = backupFloats.map((f) => ({
            ...f,
            ...deriveFloatTotals(f, pettyExpensesWithLegacySpend),
          }));
          const advanceRecordsWithMigratedSA =
            migrateSalaryAdvancesToAdvanceRecords(
              (data.salaryAdvances as SalaryAdvance[]) || [],
              (data.advanceRecords as AdvanceRecord[]) || [],
            );
          return {
            customers: (data.customers as Customer[]) || [],
            projects: (data.projects as Project[]) || [],
            quotations: backupQuotations,
            quotationRevisions: migratedRevisions,
            quotationPurchaseOrders: migratedPOs,
            purchaseOrders: (data.purchaseOrders as PurchaseOrder[]) || [],
            masterPOs: (data.masterPOs as MasterPO[]) || [],
            companyPOs: (data.companyPOs as CompanyPO[]) || [],
            inventoryItems: (data.inventoryItems as InventoryItem[]) || [],
            materialRequisitions:
              (data.materialRequisitions as MaterialRequisition[]) || [],
            // Phase 32 (Task #173) - a backup exported before this feature
            // existed won't have stageId on most stages; backfill here too
            // (not just in `merge`) since restoreFromBackup sets state
            // directly, bypassing merge until the next page reload.
            projectProductions: migrateProjectProductionStageIds(
              (data.projectProductions as ProjectProduction[]) || [],
            ),
            deliveryChallans:
              (data.deliveryChallans as DeliveryChallan[]) || [],
            invoices: (data.invoices as Invoice[]) || [],
            payments: (data.payments as Payment[]) || [],
            pettyExpenses: pettyExpensesWithLegacySpend,
            employees: (data.employees as Employee[]) || [],
            employeeDocuments:
              (data.employeeDocuments as EmployeeDocument[]) || [],
            vendors: (data.vendors as Vendor[]) || [],
            payables: (data.payables as Payable[]) || [],
            payablePayments: (data.payablePayments as PayablePayment[]) || [],
            materialUsages: (data.materialUsages as MaterialUsage[]) || [],
            materialPurchases:
              (data.materialPurchases as MaterialPurchase[]) || [],
            outsourcedWorks: (data.outsourcedWorks as OutsourcedWork[]) || [],
            advanceRecords: advanceRecordsWithMigratedSA,
            salaryPayments: (data.salaryPayments as SalaryPayment[]) || [],
            inventoryPurchases:
              (data.inventoryPurchases as InventoryPurchase[]) || [],
            bomItems: (data.bomItems as BomItem[]) || [],
            bomRequisitions: (data.bomRequisitions as BomRequisition[]) || [],
            qualityInspections:
              (data.qualityInspections as QualityInspection[]) || [],
            designFiles: (data.designFiles as DesignFile[]) || [],
            internalCostings:
              (data.internalCostings as InternalCosting[]) || [],
            attendanceRecords:
              (data.attendanceRecords as AttendanceRecord[]) || [],
            projectDeliveries:
              (data.projectDeliveries as ProjectDelivery[]) || [],
            projectItems: (data.projectItems as ProjectItem[]) || [],
            machines: (data.machines as Machine[]) || [],
            serviceRecords: (data.serviceRecords as ServiceRecord[]) || [],
            serviceParts: (data.serviceParts as ServicePart[]) || [],
            machineDocuments:
              (data.machineDocuments as MachineDocument[]) || [],
            machineUsageLogs:
              (data.machineUsageLogs as MachineUsageLog[]) || [],
            auditLogs: (data.auditLogs as AuditLogEntry[]) || [],
            salaryAdvances: (data.salaryAdvances as SalaryAdvance[]) || [],
            expenseFloats: expenseFloatsDerived,
            productionMovements:
              (data.productionMovements as ProductionMovement[]) || [],
          };
        }),
      addPayablePayment: (p) =>
        set((s) => {
          const payable = s.payables.find((x) => x.id === p.payableId);
          if (!payable) return {};
          const newPaid = payable.paidAmount + p.amount;
          const updatedPayable: Payable = {
            ...payable,
            paidAmount: newPaid,
          };
          return {
            payablePayments: [...s.payablePayments, p],
            payables: s.payables.map((x) =>
              x.id === p.payableId ? updatedPayable : x,
            ),
          };
        }),
    }),
    {
      name: "fabflow-erp-store",
      merge: (persistedState: unknown, currentState) => {
        const ps = (persistedState as Partial<typeof currentState>) || {};
        const mergedQuotations = ps.quotations || currentState.quotations || [];
        const { revisions: migratedRevisions, purchaseOrders: migratedPOs } =
          migrateQuotationsToRevisions(
            mergedQuotations,
            ps.quotationRevisions || currentState.quotationRevisions || [],
            ps.quotationPurchaseOrders ||
              currentState.quotationPurchaseOrders ||
              [],
          );
        const mergedFloats =
          ps.expenseFloats || currentState.expenseFloats || [];
        const pettyExpensesWithLegacySpend = migrateExpenseFloatLegacySpend(
          mergedFloats,
          ps.pettyExpenses || currentState.pettyExpenses || [],
        );
        const mergedFloatsDerived = mergedFloats.map((f) => ({
          ...f,
          ...deriveFloatTotals(f, pettyExpensesWithLegacySpend),
        }));
        const advanceRecordsWithMigratedSA =
          migrateSalaryAdvancesToAdvanceRecords(
            ps.salaryAdvances || currentState.salaryAdvances || [],
            ps.advanceRecords || currentState.advanceRecords || [],
          );
        // Phase 35 — capture the pre-Supabase-hydration `machines` array
        // exactly once, from whatever this specific browser's localStorage
        // held BEFORE this boot. Guarded so it only ever happens on the
        // first boot after this field was introduced (ps itself has no
        // preMigrationMachinesSnapshot yet) - every later boot's `ps`
        // already carries forward whatever was captured then, unchanged,
        // even after `machines` itself has since been overwritten by a
        // successful Supabase hydration. See the field's own comment on
        // the Store interface for why this can't just read `machines`.
        const preMigrationMachinesSnapshot =
          ps.preMigrationMachinesSnapshot !== undefined
            ? ps.preMigrationMachinesSnapshot
            : (ps.machines ?? currentState.machines ?? null);
        // Phase 45 — same capture-once mechanics as
        // preMigrationMachinesSnapshot immediately above, for
        // projectProductions (see the field's own comment on the Store
        // interface).
        const preMigrationProjectProductionsSnapshot =
          ps.preMigrationProjectProductionsSnapshot !== undefined
            ? ps.preMigrationProjectProductionsSnapshot
            : (ps.projectProductions ??
              currentState.projectProductions ??
              null);
        return {
          ...currentState,
          ...ps,
          preMigrationMachinesSnapshot,
          preMigrationProjectProductionsSnapshot,
          pettyExpenses: pettyExpensesWithLegacySpend,
          companyPOs: ps.companyPOs || currentState.companyPOs || [],
          vendors: ps.vendors || currentState.vendors || [],
          projects: ps.projects || currentState.projects || [],
          employees: ps.employees || currentState.employees || [],
          employeeDocuments:
            ps.employeeDocuments || currentState.employeeDocuments || [],
          inventoryItems:
            ps.inventoryItems || currentState.inventoryItems || [],
          bomItems: ps.bomItems || currentState.bomItems || [],
          bomRequisitions:
            ps.bomRequisitions || currentState.bomRequisitions || [],
          qualityInspections:
            ps.qualityInspections || currentState.qualityInspections || [],
          masterPOs: ps.masterPOs || currentState.masterPOs || [],
          purchaseOrders:
            ps.purchaseOrders || currentState.purchaseOrders || [],
          deliveryChallans:
            ps.deliveryChallans || currentState.deliveryChallans || [],
          invoices: ps.invoices || currentState.invoices || [],
          payments: ps.payments || currentState.payments || [],
          payables: ps.payables || currentState.payables || [],
          payablePayments:
            ps.payablePayments || currentState.payablePayments || [],
          materialRequisitions:
            ps.materialRequisitions || currentState.materialRequisitions || [],
          materialUsages:
            ps.materialUsages || currentState.materialUsages || [],
          materialPurchases:
            ps.materialPurchases || currentState.materialPurchases || [],
          outsourcedWorks:
            ps.outsourcedWorks || currentState.outsourcedWorks || [],
          projectProductions: migrateProjectProductionStageIds(
            ps.projectProductions || currentState.projectProductions || [],
          ),
          projectDeliveries:
            ps.projectDeliveries || currentState.projectDeliveries || [],
          designFiles: ps.designFiles || currentState.designFiles || [],
          internalCostings:
            ps.internalCostings || currentState.internalCostings || [],
          authUsers: ps.authUsers || currentState.authUsers || [],
          attendanceRecords:
            ps.attendanceRecords || currentState.attendanceRecords || [],
          salaryPayments:
            ps.salaryPayments || currentState.salaryPayments || [],
          advanceRecords: advanceRecordsWithMigratedSA,
          inventoryPurchases:
            ps.inventoryPurchases || currentState.inventoryPurchases || [],
          reminderLogs: ps.reminderLogs || currentState.reminderLogs || [],
          projectItems: ps.projectItems || currentState.projectItems || [],
          quotations: mergedQuotations,
          quotationRevisions: migratedRevisions,
          quotationPurchaseOrders: migratedPOs,
          machines: ps.machines || currentState.machines || [],
          serviceRecords:
            ps.serviceRecords || currentState.serviceRecords || [],
          serviceParts: ps.serviceParts || currentState.serviceParts || [],
          machineDocuments:
            ps.machineDocuments || currentState.machineDocuments || [],
          machineUsageLogs:
            ps.machineUsageLogs || currentState.machineUsageLogs || [],
          exportJobs: ps.exportJobs || currentState.exportJobs || [],
          auditLogs: ps.auditLogs || currentState.auditLogs || [],
          stockReservations:
            ps.stockReservations || currentState.stockReservations || [],
          scrapRecords: ps.scrapRecords || currentState.scrapRecords || [],
          salaryAdvances:
            ps.salaryAdvances || currentState.salaryAdvances || [],
          expenseFloats: mergedFloatsDerived,
          productionMovements:
            ps.productionMovements || currentState.productionMovements || [],
          floatCounter: ps.floatCounter ?? currentState.floatCounter ?? 0,
          // Deep-merge so a persisted store from before a new counter key
          // (e.g. EMP) was added doesn't silently drop it and produce NaN
          // the first time generateDocNo(prefix) runs on that key.
          counters: { ...currentState.counters, ...(ps.counters || {}) },
        };
      },
    },
  ),
);

export const PRODUCTION_STAGE_NAMES = PRODUCTION_STAGES;
