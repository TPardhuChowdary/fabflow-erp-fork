import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AdvanceRecord,
  AppSettings,
  AttendanceRecord,
  AuthUser,
  BomItem,
  BomRequisition,
  BomRequisitionStatus,
  CompanyPO,
  Customer,
  DeliveryChallan,
  DesignFile,
  Employee,
  InternalCosting,
  InventoryItem,
  InventoryPurchase,
  Invoice,
  MasterPO,
  MaterialPurchase,
  MaterialRequisition,
  MaterialUsage,
  OutsourcedWork,
  Payable,
  PayablePayment,
  Payment,
  PettyExpense,
  Project,
  ProjectDelivery,
  ProjectItem,
  ProjectPO,
  ProjectProduction,
  ProjectProductionStage,
  ProjectStageStatus,
  PurchaseOrder,
  QualityInspection,
  Quotation,
  ReminderLog,
  SalaryPayment,
  StageTransaction,
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

interface DocCounters {
  QT: number;
  MR: number;
  DC: number;
  INV: number;
  PAY: number;
  PROJ: number;
}

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
  projectDeliveries: ProjectDelivery[];

  addCustomer: (c: Customer) => void;
  updateCustomer: (c: Customer) => void;
  deleteCustomer: (id: string) => void;

  addQuotation: (q: Quotation) => void;
  updateQuotation: (q: Quotation) => void;
  deleteQuotation: (id: string) => void;

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
  upsertProjectProduction: (p: ProjectProduction) => void;
  addStageTransaction: (
    projectId: string,
    stageIdx: number,
    tx: StageTransaction,
  ) => void;
  updateProjectStagesV2: (
    projectId: string,
    stages: ProjectProductionStage[],
  ) => void;
  upsertProjectDelivery: (d: ProjectDelivery) => void;

  // Auth & HR
  authUsers: AuthUser[];
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  salaryPayments: SalaryPayment[];
  advanceRecords: AdvanceRecord[];

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
  updatePettyExpense: (e: PettyExpense) => void;
  deletePettyExpense: (id: string) => void;
  restoreFromBackup: (data: Record<string, unknown[]>) => void;
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      customers: sampleCustomers,
      quotations: sampleQuotations,
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
      },

      // Project tracking initial state
      projects: sampleProjects,
      designFiles: sampleDesignFiles,
      internalCostings: sampleInternalCostings,
      materialPurchases: sampleMaterialPurchases,
      outsourcedWorks: sampleOutsourcedWorks,
      projectProductions: sampleProjectProductions,
      projectDeliveries: sampleProjectDeliveries,

      // Auth & HR initial state
      authUsers: [],
      employees: sampleEmployees,
      attendanceRecords: [],
      salaryPayments: [],
      advanceRecords: [],

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

      addQuotation: (q) => set((s) => ({ quotations: [...s.quotations, q] })),
      deleteQuotation: (id) =>
        set((s) => ({ quotations: s.quotations.filter((x) => x.id !== id) })),
      updateQuotation: (q) =>
        set((s) => ({
          quotations: s.quotations.map((x) => (x.id === q.id ? q : x)),
        })),

      addPurchaseOrder: (p) =>
        set((s) => ({ purchaseOrders: [...s.purchaseOrders, p] })),
      updatePurchaseOrder: (p) =>
        set((s) => ({
          purchaseOrders: s.purchaseOrders.map((x) => (x.id === p.id ? p : x)),
        })),

      addMasterPO: (m) =>
        set((s) => ({ masterPOs: [...(s.masterPOs || []), m] })),
      updateMasterPO: (m) =>
        set((s) => ({
          masterPOs: (s.masterPOs || []).map((x) => (x.id === m.id ? m : x)),
        })),
      deleteMasterPO: (id) => {
        const s = get();
        const po = (s.masterPOs || []).find((x) => x.id === id);
        if (po) {
          const hasProjects = (s.projects || []).some((proj) =>
            (proj.pos || []).some((p) => p.sharedPoId === po.sharedPoId),
          );
          if (hasProjects) {
            alert("Cannot delete PO. Linked projects exist.");
            return;
          }
        }
        set((s) => ({
          masterPOs: (s.masterPOs || []).filter((x) => x.id !== id),
        }));
      },

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
      deleteDeliveryChallan: (id) => {
        const s = get();
        const hasInvoices = (s.invoices || []).some((i) => i.dcId === id);
        if (hasInvoices) {
          alert("Cannot delete delivery challan. Linked invoices exist.");
          return;
        }
        set((s) => ({
          deliveryChallans: s.deliveryChallans.filter((x) => x.id !== id),
        }));
      },

      addInvoice: (i) => set((s) => ({ invoices: [...s.invoices, i] })),
      deleteInvoice: (id) =>
        set((s) => ({ invoices: s.invoices.filter((x) => x.id !== id) })),
      updateInvoice: (i) =>
        set((s) => ({
          invoices: s.invoices.map((x) => (x.id === i.id ? i : x)),
        })),

      addPayment: (p) => set((s) => ({ payments: [...s.payments, p] })),

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

      upsertProjectProduction: (p) =>
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
        }),

      addStageTransaction: (projectId, stageIdx, tx) =>
        set((s) => ({
          projectProductions: s.projectProductions.map((pp) => {
            if (pp.projectId !== projectId) return pp;
            const stages = (pp.stages || []).map((stage, i) => {
              if (i !== stageIdx) return stage;
              const newTxs = [...(stage.transactions || []), tx];
              const totalSent = newTxs
                .filter((t) => t.type === "send")
                .reduce((a, t) => a + t.quantity, 0);
              const totalReceived = newTxs
                .filter((t) => t.type === "receive")
                .reduce((a, t) => a + t.quantity, 0);
              return {
                ...stage,
                transactions: newTxs,
                quantitySent: totalSent,
                receivedQuantity: totalReceived,
              };
            });
            return { ...pp, stages };
          }),
        })),

      updateProjectStagesV2: (projectId, stages) =>
        set((s) => ({
          projectProductions: s.projectProductions.map((pp) =>
            pp.projectId === projectId ? { ...pp, stages } : pp,
          ),
        })),

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
        set((s) => ({ employees: s.employees.filter((x) => x.id !== id) }));
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
      addBomItem: (item) =>
        set((s) => {
          const invItem = s.inventoryItems.find(
            (x) => x.id === item.inventoryItemId,
          );
          const available = Number(invItem?.quantityAvailable || 0);
          const shortage = Math.max(
            0,
            Number(item.requiredQuantity || 0) - available,
          );
          const estimatedPrice = Number(item.estimatedPrice || 0);
          let newBomReqs = [...s.bomRequisitions];
          if (shortage > 0) {
            const existingIdx = newBomReqs.findIndex(
              (r) =>
                r.projectId === item.projectId &&
                r.inventoryItemId === item.inventoryItemId,
            );
            if (existingIdx >= 0) {
              newBomReqs[existingIdx] = {
                ...newBomReqs[existingIdx],
                shortageQty: shortage,
                requiredQty: item.requiredQuantity,
                availableQty: available,
                updatedAt: Date.now(),
              };
            } else {
              newBomReqs.push({
                id: crypto.randomUUID(),
                inventoryItemId: item.inventoryItemId,
                projectId: item.projectId,
                materialName: item.materialName,
                shortageQty: shortage,
                requiredQty: Number(item.requiredQuantity || 0),
                availableQty: available,
                estimatedPrice: estimatedPrice,
                status: "Pending",
                createdAt: Date.now(),
                updatedAt: Date.now(),
              });
            }
          }
          return {
            bomItems: [...s.bomItems, item],
            bomRequisitions: newBomReqs,
          };
        }),
      updateBomItem: (id, updates) =>
        set((s) => {
          const updatedBomItems = s.bomItems.map((x) =>
            x.id === id ? { ...x, ...updates } : x,
          );
          const updatedItem = updatedBomItems.find((x) => x.id === id);
          if (!updatedItem) return { bomItems: updatedBomItems };
          const invItem = s.inventoryItems.find(
            (x) => x.id === updatedItem.inventoryItemId,
          );
          const available = Number(invItem?.quantityAvailable || 0);
          const shortage = Math.max(
            0,
            Number(updatedItem.requiredQuantity || 0) - available,
          );
          const estimatedPrice = Number(updatedItem.estimatedPrice || 0);
          let newBomReqs = [...s.bomRequisitions];
          if (shortage > 0) {
            const existingIdx = newBomReqs.findIndex(
              (r) =>
                r.projectId === updatedItem.projectId &&
                r.inventoryItemId === updatedItem.inventoryItemId,
            );
            if (existingIdx >= 0) {
              const existing = newBomReqs[existingIdx];
              const newStatus =
                existing.status === "Completed"
                  ? "Pending"
                  : existing.status === "Ready to Complete"
                    ? "Pending"
                    : existing.status;
              newBomReqs[existingIdx] = {
                ...existing,
                shortageQty: shortage,
                requiredQty: Number(updatedItem.requiredQuantity || 0),
                availableQty: available,
                estimatedPrice: estimatedPrice,
                status: newStatus,
                updatedAt: Date.now(),
              };
            } else {
              newBomReqs.push({
                id: crypto.randomUUID(),
                inventoryItemId: updatedItem.inventoryItemId,
                projectId: updatedItem.projectId,
                materialName: updatedItem.materialName,
                shortageQty: shortage,
                requiredQty: Number(updatedItem.requiredQuantity || 0),
                availableQty: available,
                estimatedPrice: estimatedPrice,
                status: "Pending",
                createdAt: Date.now(),
                updatedAt: Date.now(),
              });
            }
          } else {
            newBomReqs = newBomReqs.filter(
              (r) =>
                !(
                  r.projectId === updatedItem.projectId &&
                  r.inventoryItemId === updatedItem.inventoryItemId &&
                  r.status !== "Completed"
                ),
            );
          }
          return { bomItems: updatedBomItems, bomRequisitions: newBomReqs };
        }),
      deleteBomItem: (id) =>
        set((s) => {
          const item = s.bomItems.find((x) => x.id === id);
          let newBomReqs = s.bomRequisitions;
          if (item) {
            newBomReqs = s.bomRequisitions.filter(
              (r) =>
                !(
                  r.projectId === item.projectId &&
                  r.inventoryItemId === item.inventoryItemId &&
                  r.status !== "Completed"
                ),
            );
          }
          return {
            bomItems: s.bomItems.filter((x) => x.id !== id),
            bomRequisitions: newBomReqs,
          };
        }),

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
      addPettyExpense: (e) =>
        set((s) => ({ pettyExpenses: [...(s.pettyExpenses || []), e] })),
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
      restoreFromBackup: (data) =>
        set(() => ({
          customers: (data.customers as Customer[]) || [],
          projects: (data.projects as Project[]) || [],
          quotations: (data.quotations as Quotation[]) || [],
          purchaseOrders: (data.purchaseOrders as PurchaseOrder[]) || [],
          masterPOs: (data.masterPOs as MasterPO[]) || [],
          companyPOs: (data.companyPOs as CompanyPO[]) || [],
          inventoryItems: (data.inventoryItems as InventoryItem[]) || [],
          materialRequisitions:
            (data.materialRequisitions as MaterialRequisition[]) || [],
          projectProductions:
            (data.projectProductions as ProjectProduction[]) || [],
          deliveryChallans: (data.deliveryChallans as DeliveryChallan[]) || [],
          invoices: (data.invoices as Invoice[]) || [],
          payments: (data.payments as Payment[]) || [],
          pettyExpenses: (data.pettyExpenses as PettyExpense[]) || [],
          employees: (data.employees as Employee[]) || [],
          vendors: (data.vendors as Vendor[]) || [],
          payables: (data.payables as Payable[]) || [],
          payablePayments: (data.payablePayments as PayablePayment[]) || [],
          materialUsages: (data.materialUsages as MaterialUsage[]) || [],
          materialPurchases:
            (data.materialPurchases as MaterialPurchase[]) || [],
          outsourcedWorks: (data.outsourcedWorks as OutsourcedWork[]) || [],
          advanceRecords: (data.advanceRecords as AdvanceRecord[]) || [],
          salaryPayments: (data.salaryPayments as SalaryPayment[]) || [],
          inventoryPurchases:
            (data.inventoryPurchases as InventoryPurchase[]) || [],
          bomItems: (data.bomItems as BomItem[]) || [],
          bomRequisitions: (data.bomRequisitions as BomRequisition[]) || [],
          qualityInspections:
            (data.qualityInspections as QualityInspection[]) || [],
          designFiles: (data.designFiles as DesignFile[]) || [],
          internalCostings: (data.internalCostings as InternalCosting[]) || [],
          attendanceRecords:
            (data.attendanceRecords as AttendanceRecord[]) || [],
          projectDeliveries:
            (data.projectDeliveries as ProjectDelivery[]) || [],
          projectItems: (data.projectItems as ProjectItem[]) || [],
        })),
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
        return {
          ...currentState,
          ...ps,
          pettyExpenses: ps.pettyExpenses || currentState.pettyExpenses || [],
          companyPOs: ps.companyPOs || currentState.companyPOs || [],
          vendors: ps.vendors || currentState.vendors || [],
          projects: ps.projects || currentState.projects || [],
          employees: ps.employees || currentState.employees || [],
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
          projectProductions:
            ps.projectProductions || currentState.projectProductions || [],
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
          advanceRecords:
            ps.advanceRecords || currentState.advanceRecords || [],
          inventoryPurchases:
            ps.inventoryPurchases || currentState.inventoryPurchases || [],
          reminderLogs: ps.reminderLogs || currentState.reminderLogs || [],
          projectItems: ps.projectItems || currentState.projectItems || [],
          quotations: ps.quotations || currentState.quotations || [],
        };
      },
    },
  ),
);

export const PRODUCTION_STAGE_NAMES = PRODUCTION_STAGES;
