// Phase 18 — the single centralized server-hydration layer. Every domain
// migrated from Zustand/localStorage to Supabase gets one function here,
// not scattered fetches inside individual components/pages.
//
// Contract every hydrate*() function follows:
//   - Read-only. Never writes to Supabase.
//   - Checks for a real Supabase Auth session first. No session -> returns
//     {status: "unauthenticated"} immediately, no request is made, no
//     error is raised. This is the expected, normal state for every user
//     today, since the app's own login flow (AuthContext) does not
//     establish a Supabase session - the two are still independent (see
//     Phase 17B/17C). Callers must not treat this as an error.
//   - RLS is the only authorization boundary. This layer performs no
//     permission check of its own - if RLS denies a row, Supabase simply
//     returns fewer rows (or a policy-appropriate error), and that is
//     surfaced as-is rather than second-guessed here.
//   - Never overwrites caller state on failure. Callers decide what to do
//     with a "loading"/"error"/"unauthenticated" result; only a "success"
//     result carries data meant to replace local state.

import { rowToDie } from "@/lib/diesApi";
import type {
  BillableServiceRow,
  RateHistoryRow,
  UsageRow,
} from "@/lib/machineRevenueApi";
import {
  rowToBillableService,
  rowToRate,
  rowToUsage,
} from "@/lib/machineRevenueApi";
import { rowToMachine } from "@/lib/machinesApi";
import {
  rowToProjectProductionStage,
  rowToStageTransaction,
} from "@/lib/productionStagesApi";
import type {
  ProductionStageTransactionRow,
  ProjectProductionStageRow,
} from "@/lib/productionStagesApi";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { rowToTool, rowToToolAssignmentHistory } from "@/lib/toolsApi";
import type {
  InspectionMode,
  ProjectQmsInspection,
  ProjectQmsInspectionAttempt,
  ProjectQmsInspectionAttemptPhoto,
  ProjectQmsInspectionAttemptResult,
  ProjectQmsInspectionCharacteristic,
  ProjectQmsInspectionOverride,
  ProjectQmsInspectionStatus,
} from "@/qms/types";
import type {
  AdvanceRecord,
  AttendanceRecord,
  BillableService,
  BomItem,
  BomRequisition,
  BomRequisitionStatus,
  CompanyPO,
  CompanyPOItem,
  CompanyPOStatus,
  CourierServiceProvider,
  Customer,
  DCItem,
  DCProjectEntry,
  DCStatus,
  DeliveryChallan,
  Die,
  DispatchMethod,
  Employee,
  EmployeeDocument,
  EmployeeDocumentType,
  EmployeeType,
  EmploymentType,
  ExpenseFloat,
  ExpenseFloatStatus,
  InvLineItem,
  InventoryItem,
  InventoryPurchase,
  Invoice,
  InvoiceStatus,
  LineItem,
  Machine,
  MachineDie,
  MachineServiceRate,
  MachineServiceUsage,
  MachineSparePart,
  MasterPO,
  MaterialUsage,
  OutsourcedWork,
  POStatus,
  Payment,
  PaymentMode,
  PettyExpense,
  PettyExpenseMode,
  PettyExpenseType,
  Project,
  ProjectActivity,
  ProjectPO,
  ProjectPOStatus,
  ProjectProduction,
  PurchaseAttachment,
  PurchasedItemAttachment,
  Quotation,
  QuotationHistoryEntry,
  QuotationPurchaseOrder,
  QuotationRevision,
  QuotationStatus,
  SalaryPayment,
  ServiceType,
  Tool,
  ToolAssignmentHistory,
  UserRole,
  VehicleExpenseType,
  Vendor,
} from "@/types";

export type HydrationStatus =
  | "idle"
  | "loading"
  | "success"
  | "error"
  | "unauthenticated";

export interface HydrationResult<T> {
  status: HydrationStatus;
  data?: T;
  error?: string;
}

// Exact column list this phase's mapping confirmed - see the Phase 18
// report for the full frontend<->DB field-by-field justification. Only
// columns with a confirmed frontend counterpart are selected; DB-only
// columns (is_active, left_date, termination_reason, organization_id,
// created_at, updated_at) are deliberately not requested here, since
// there is nowhere in the frontend Employee shape to put them yet.
const EMPLOYEE_COLUMNS =
  "id, name, phone, role, monthly_salary, joining_date, photo_ref, " +
  "employee_code, designation, blood_group, emergency_contact_name, " +
  "emergency_contact_relation, emergency_contact_phone, employee_type, " +
  "employment_type, temp_start_date, temp_end_date, daily_wage_rate";

interface EmployeeRow {
  id: string;
  name: string;
  phone: string;
  role: string;
  monthly_salary: number;
  joining_date: string;
  photo_ref: string | null;
  employee_code: string | null;
  designation: string | null;
  blood_group: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relation: string | null;
  emergency_contact_phone: string | null;
  employee_type: string | null;
  employment_type: string | null;
  temp_start_date: string | null;
  temp_end_date: string | null;
  daily_wage_rate: number | null;
}

function transformEmployeeRow(row: EmployeeRow): Employee {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    // The DB column is a plain text, not an enum - confirmed (Phase 17B)
    // to share a vocabulary with the frontend's UserRole union, but that
    // is not DB-enforced, so this cast documents an assumption rather
    // than a guarantee.
    role: row.role as UserRole,
    monthlySalary: row.monthly_salary,
    joiningDate: row.joining_date,
    // No DB representation exists for this field (Phase 18 mapping
    // finding, disclosed - not invented). userId refers to the OLD local
    // AuthUser system's id, which Supabase-sourced rows have no way to
    // populate. Left empty rather than guessed.
    userId: "",
    photoRef: row.photo_ref ?? undefined,
    employeeCode: row.employee_code ?? undefined,
    designation: row.designation ?? undefined,
    bloodGroup: row.blood_group ?? undefined,
    emergencyContactName: row.emergency_contact_name ?? undefined,
    emergencyContactRelation: row.emergency_contact_relation ?? undefined,
    emergencyContactPhone: row.emergency_contact_phone ?? undefined,
    // Same reasoning as role above - not DB-enforced, so this is an
    // assumption, not a guarantee.
    employeeType: (row.employee_type as EmployeeType | null) ?? undefined,
    // Phase 43 — Employment Type, DB-defaulted to 'Permanent' (see
    // database/phase-43); undefined here only for a row somehow still
    // null, which the UI also treats as "Permanent".
    employmentType: (row.employment_type as EmploymentType | null) ?? undefined,
    tempStartDate: row.temp_start_date ?? undefined,
    tempEndDate: row.temp_end_date ?? undefined,
    dailyWageRate: row.daily_wage_rate ?? undefined,
  };
}

export async function hydrateEmployees(): Promise<HydrationResult<Employee[]>> {
  if (!isSupabaseConfigured) {
    return { status: "error", error: "Supabase is not configured" };
  }
  const client = getSupabase();

  const { data: sessionData, error: sessionError } =
    await client.auth.getSession();
  if (sessionError) {
    return { status: "error", error: sessionError.message };
  }
  if (!sessionData.session) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await client
    .from("employees")
    .select(EMPLOYEE_COLUMNS)
    .order("name");

  if (error) {
    return { status: "error", error: error.message };
  }

  return {
    status: "success",
    data: (data as unknown as EmployeeRow[]).map(transformEmployeeRow),
  };
}

// Phase 35 — Machines. Reuses machinesApi.ts's rowToMachine (the write
// layer's own read-mapping, kept in one place rather than duplicated here)
// since this hydration function's column list and row shape are identical
// to every other read that module already needs to do after a write.
const MACHINE_COLUMNS =
  "id, machine_code, name, type, brand, model, serial_number, asset_id, " +
  "purchase_date, purchase_cost, purchase_vendor_id, purchase_vendor_name, " +
  "current_status, location, department, warranty_expiry, warranty_vendor, " +
  "warranty_notes, amc_vendor_id, amc_vendor_name, amc_start_date, " +
  "amc_end_date, amc_cost, amc_coverage, service_interval_days, " +
  "last_service_date, next_service_due, total_running_hours, hourly_rate, " +
  "primary_image_data, notes, source_company_po_item_id, is_active, " +
  "created_at, updated_at";

export async function hydrateMachines(): Promise<HydrationResult<Machine[]>> {
  if (!isSupabaseConfigured) {
    return { status: "error", error: "Supabase is not configured" };
  }
  const client = getSupabase();

  const { data: sessionData, error: sessionError } =
    await client.auth.getSession();
  if (sessionError) {
    return { status: "error", error: sessionError.message };
  }
  if (!sessionData.session) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await client
    .from("machines")
    .select(MACHINE_COLUMNS)
    .order("machine_code");

  if (error) {
    return { status: "error", error: error.message };
  }

  return {
    status: "success",
    data: (data as unknown as Parameters<typeof rowToMachine>[0][]).map(
      rowToMachine,
    ),
  };
}

// Phase 37 — Tools. Reuses toolsApi.ts's rowToTool, same reasoning as
// hydrateMachines above. Phase 43 added photo_data/purchase_vendor_id/
// purchase_vendor_name.
const TOOL_COLUMNS =
  "id, tool_code, name, category, quantity, location, assigned_employee_id, " +
  "condition, status, purchase_date, replacement_value, notes, photo_data, " +
  "purchase_vendor_id, purchase_vendor_name, " +
  "source_company_po_item_id, is_active, created_at, updated_at";

export async function hydrateTools(): Promise<HydrationResult<Tool[]>> {
  if (!isSupabaseConfigured) {
    return { status: "error", error: "Supabase is not configured" };
  }
  const client = getSupabase();

  const { data: sessionData, error: sessionError } =
    await client.auth.getSession();
  if (sessionError) {
    return { status: "error", error: sessionError.message };
  }
  if (!sessionData.session) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await client
    .from("tools")
    .select(TOOL_COLUMNS)
    .order("tool_code");

  if (error) {
    return { status: "error", error: error.message };
  }

  return {
    status: "success",
    data: (data as unknown as Parameters<typeof rowToTool>[0][]).map(rowToTool),
  };
}

// Phase 43 — tool_assignment_history (insert-only). Reuses toolsApi.ts's
// rowToToolAssignmentHistory, same reasoning as hydrateTools above.
const TOOL_ASSIGNMENT_HISTORY_COLUMNS =
  "id, tool_id, employee_id, action, notes, recorded_by, recorded_at, created_at";

export async function hydrateToolAssignmentHistory(): Promise<
  HydrationResult<ToolAssignmentHistory[]>
> {
  if (!isSupabaseConfigured) {
    return { status: "error", error: "Supabase is not configured" };
  }
  const client = getSupabase();

  const { data: sessionData, error: sessionError } =
    await client.auth.getSession();
  if (sessionError) {
    return { status: "error", error: sessionError.message };
  }
  if (!sessionData.session) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await client
    .from("tool_assignment_history")
    .select(TOOL_ASSIGNMENT_HISTORY_COLUMNS)
    .order("recorded_at", { ascending: false });

  if (error) {
    return { status: "error", error: error.message };
  }

  return {
    status: "success",
    data: (
      data as unknown as Parameters<typeof rowToToolAssignmentHistory>[0][]
    ).map(rowToToolAssignmentHistory),
  };
}

// Phase 38 — Dies. Reuses diesApi.ts's rowToDie, same reasoning as
// hydrateTools above. Phase 43 added photo_data/purchase_date/
// purchase_cost/purchase_vendor_id/purchase_vendor_name.
const DIE_COLUMNS =
  "id, die_code, name, type, purpose, compatible_machine_id, " +
  "original_project_id, location, status, date_created, condition, " +
  "notes, photo_data, purchase_date, purchase_cost, purchase_vendor_id, " +
  "purchase_vendor_name, source_company_po_item_id, is_active, created_at, updated_at";

export async function hydrateDies(): Promise<HydrationResult<Die[]>> {
  if (!isSupabaseConfigured) {
    return { status: "error", error: "Supabase is not configured" };
  }
  const client = getSupabase();

  const { data: sessionData, error: sessionError } =
    await client.auth.getSession();
  if (sessionError) {
    return { status: "error", error: sessionError.message };
  }
  if (!sessionData.session) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await client
    .from("dies")
    .select(DIE_COLUMNS)
    .order("die_code");

  if (error) {
    return { status: "error", error: error.message };
  }

  return {
    status: "success",
    data: (data as unknown as Parameters<typeof rowToDie>[0][]).map(rowToDie),
  };
}

// Phase 38 — machine_spare_parts / machine_dies compatibility junctions.
// Composite PK, no surrogate id, same shape as hydrateProjectEmployees
// above - mapped to the frontend's camelCase shape here (not left raw),
// since MachineSparePart/MachineDie (types.ts) are real frontend types
// with their own consumers, unlike ProjectEmployeePair's ad-hoc raw pair.
// Wholesale-replaced on hydration; no local-only predecessor to merge.
interface MachineSparePartRow {
  machine_id: string;
  inventory_item_id: string;
  created_at: string;
}

export async function hydrateMachineSpareParts(): Promise<
  HydrationResult<MachineSparePart[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("machine_spare_parts")
    .select("machine_id, inventory_item_id, created_at");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as MachineSparePartRow[]).map((row) => ({
      machineId: row.machine_id,
      inventoryItemId: row.inventory_item_id,
      createdAt: new Date(row.created_at).getTime(),
    })),
  };
}

interface MachineDieRow {
  machine_id: string;
  die_id: string;
  created_at: string;
}

export async function hydrateMachineDies(): Promise<
  HydrationResult<MachineDie[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("machine_dies")
    .select("machine_id, die_id, created_at");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as MachineDieRow[]).map((row) => ({
      machineId: row.machine_id,
      dieId: row.die_id,
      createdAt: new Date(row.created_at).getTime(),
    })),
  };
}

// Phase 19 — Customers. Exact column list per the Phase 19 report's
// field-by-field mapping. organization_id/updated_at are DB-only,
// deliberately not requested (no frontend counterpart).
const CUSTOMER_COLUMNS =
  "id, name, contact_person, phone, email, address, gstin, state_name, " +
  "state_code, additional_details, emails, primary_email, created_at";

interface CustomerRow {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gstin: string | null;
  state_name: string | null;
  state_code: string | null;
  additional_details: Array<{ key: string; value: string }> | null;
  emails: Array<{ email: string; type: string }> | null;
  primary_email: string | null;
  created_at: string;
}

function transformCustomerRow(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    contactPerson: row.contact_person ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    address: row.address ?? "",
    gstin: row.gstin ?? "",
    stateName: row.state_name ?? undefined,
    stateCode: row.state_code ?? undefined,
    additionalDetails: row.additional_details ?? undefined,
    emails: row.emails ?? undefined,
    primaryEmail: row.primary_email ?? undefined,
    // DB stores a real timestamptz; the frontend type uses epoch ms
    // (Date.now() at local-creation time, pre-Supabase). Converted here,
    // not guessed - this is a mechanical unit conversion, not a mapping
    // ambiguity (see Phase 19 report).
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function hydrateCustomers(): Promise<HydrationResult<Customer[]>> {
  if (!isSupabaseConfigured) {
    return { status: "error", error: "Supabase is not configured" };
  }
  const client = getSupabase();

  const { data: sessionData, error: sessionError } =
    await client.auth.getSession();
  if (sessionError) {
    return { status: "error", error: sessionError.message };
  }
  if (!sessionData.session) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await client
    .from("customers")
    .select(CUSTOMER_COLUMNS)
    .order("name");

  if (error) {
    return { status: "error", error: error.message };
  }

  return {
    status: "success",
    data: (data as unknown as CustomerRow[]).map(transformCustomerRow),
  };
}

// Phase 20 — Inventory Items, master-data scope only. Hydration reads ALL
// columns (including current_stock/quantity_reserved/last_purchase_price)
// since display needs the real numbers - but per the Phase 20 report's
// approved scope, inventoryApi.ts's write functions never send these
// three fields back. They are trigger-owned (increase_stock()/
// reduce_stock(), fired by inventory_purchases/inventory_usages INSERTs -
// both project-dependent and explicitly out of scope this phase), so a
// naive full-record write would silently clobber the DB's authoritative
// stock with a stale local value. Read-only here is a deliberate,
// disclosed boundary, not an oversight.
const INVENTORY_ITEM_COLUMNS =
  "id, name, unit, current_stock, cost_per_unit, quantity_reserved, " +
  "reorder_level, last_purchase_price, estimated_price, updated_at, " +
  "category, brand, shade, ral_code, finish, powder_type, pretreatment_tank";

interface InventoryItemRow {
  id: string;
  name: string;
  unit: string | null;
  current_stock: number | null;
  cost_per_unit: number | null;
  quantity_reserved: number | null;
  reorder_level: number | null;
  last_purchase_price: number | null;
  estimated_price: number | null;
  updated_at: string;
  category: string | null;
  brand: string | null;
  shade: string | null;
  ral_code: string | null;
  finish: string | null;
  powder_type: string | null;
  pretreatment_tank: string | null;
}

function transformInventoryItemRow(row: InventoryItemRow): InventoryItem {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit ?? "",
    quantityAvailable: row.current_stock ?? 0,
    quantityReserved: row.quantity_reserved ?? undefined,
    reorderLevel: row.reorder_level ?? undefined,
    unitCost: row.cost_per_unit ?? undefined,
    lastPurchasePrice: row.last_purchase_price ?? undefined,
    estimatedPrice: row.estimated_price ?? undefined,
    lastUpdated: new Date(row.updated_at).getTime(),
    category:
      (row.category as InventoryItem["category"] | null) ?? "raw_material",
    brand: row.brand ?? undefined,
    shade: row.shade ?? undefined,
    ralCode: row.ral_code ?? undefined,
    finish: row.finish ?? undefined,
    powderType: row.powder_type ?? undefined,
    pretreatmentTank: row.pretreatment_tank ?? undefined,
  };
}

export async function hydrateInventoryItems(): Promise<
  HydrationResult<InventoryItem[]>
> {
  if (!isSupabaseConfigured) {
    return { status: "error", error: "Supabase is not configured" };
  }
  const client = getSupabase();

  const { data: sessionData, error: sessionError } =
    await client.auth.getSession();
  if (sessionError) {
    return { status: "error", error: sessionError.message };
  }
  if (!sessionData.session) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await client
    .from("inventory_items")
    .select(INVENTORY_ITEM_COLUMNS)
    .order("name");

  if (error) {
    return { status: "error", error: error.message };
  }

  return {
    status: "success",
    data: (data as unknown as InventoryItemRow[]).map(
      transformInventoryItemRow,
    ),
  };
}

// Phase 21A — Vendors. Simple 1:1 scalar mapping, same shape as
// Customers. DB-only: organization_id, updated_at. Frontend-only: none.
// DB has an `email` column with no frontend Vendor field - disclosed,
// not guessed; simply not read/written here.
const VENDOR_COLUMNS = "id, name, phone, address, gstin, created_at";

interface VendorRow {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  gstin: string | null;
  created_at: string;
}

function transformVendorRow(row: VendorRow): Vendor {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? "",
    address: row.address ?? "",
    gstNumber: row.gstin ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function hydrateVendors(): Promise<HydrationResult<Vendor[]>> {
  if (!isSupabaseConfigured) {
    return { status: "error", error: "Supabase is not configured" };
  }
  const client = getSupabase();

  const { data: sessionData, error: sessionError } =
    await client.auth.getSession();
  if (sessionError) {
    return { status: "error", error: sessionError.message };
  }
  if (!sessionData.session) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await client
    .from("vendors")
    .select(VENDOR_COLUMNS)
    .order("name");

  if (error) {
    return { status: "error", error: error.message };
  }

  return {
    status: "success",
    data: (data as unknown as VendorRow[]).map(transformVendorRow),
  };
}

// Phase 21B — Company POs. Only trigger is set_updated_at_timestamp - no
// business-logic trigger, so subtotal/gst_amount/grand_total are stored
// exactly as the frontend computes them (confirmed via investigation, not
// guessed). items/file are jsonb, stored/read as opaque JSON matching the
// frontend's existing shape 1:1 - no DB-side schema on their contents.
// DB-only: organization_id, updated_at. Frontend-only: none.
export const COMPANY_PO_COLUMNS =
  "id, cpo_number, vendor_id, vendor_name, vendor_address, vendor_gst, " +
  "vendor_contact, items, delivery_address, expected_delivery_date, " +
  "status, gst_percent, subtotal, gst_amount, grand_total, " +
  "terms_and_conditions, notes, file, created_at";

export interface CompanyPORow {
  id: string;
  cpo_number: string;
  vendor_id: string | null;
  vendor_name: string;
  vendor_address: string | null;
  vendor_gst: string | null;
  vendor_contact: string | null;
  items: CompanyPOItem[];
  delivery_address: string | null;
  expected_delivery_date: string | null;
  status: string;
  gst_percent: number | null;
  subtotal: number;
  gst_amount: number;
  grand_total: number;
  terms_and_conditions: string | null;
  notes: string | null;
  file: PurchaseAttachment | null;
  created_at: string;
}

export function transformCompanyPORow(row: CompanyPORow): CompanyPO {
  return {
    id: row.id,
    cpoNumber: row.cpo_number,
    vendorId: row.vendor_id ?? undefined,
    vendorName: row.vendor_name,
    vendorAddress: row.vendor_address ?? undefined,
    vendorGst: row.vendor_gst ?? undefined,
    vendorContact: row.vendor_contact ?? undefined,
    items: row.items ?? [],
    deliveryAddress: row.delivery_address ?? undefined,
    expectedDeliveryDate: row.expected_delivery_date ?? undefined,
    // DB text column, not DB-enforced against the frontend union - same
    // reasoning as Employee.role in hydrateEmployees() above.
    status: row.status as CompanyPOStatus,
    gstPercent: row.gst_percent ?? undefined,
    subtotal: row.subtotal,
    gstAmount: row.gst_amount,
    grandTotal: row.grand_total,
    termsAndConditions: row.terms_and_conditions ?? undefined,
    notes: row.notes ?? undefined,
    file: row.file ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function hydrateCompanyPOs(): Promise<
  HydrationResult<CompanyPO[]>
> {
  if (!isSupabaseConfigured) {
    return { status: "error", error: "Supabase is not configured" };
  }
  const client = getSupabase();

  const { data: sessionData, error: sessionError } =
    await client.auth.getSession();
  if (sessionError) {
    return { status: "error", error: sessionError.message };
  }
  if (!sessionData.session) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await client
    .from("company_pos")
    .select(COMPANY_PO_COLUMNS)
    .order("created_at");

  if (error) {
    return { status: "error", error: error.message };
  }

  return {
    status: "success",
    data: (data as unknown as CompanyPORow[]).map(transformCompanyPORow),
  };
}

// Phase 22 — Projects. Only trg_projects_updated_at (bookkeeping) plus two
// disclosed, deliberately-untouched side effects confirmed by investigation:
//   - trg_project_stages -> create_stages() inserts 6 fixed-name rows into
//     the LEGACY `production_stages` table on every INSERT. That table is
//     not read/written anywhere in this codebase - the frontend's real
//     stage system (DEFAULT_V2_STAGES, 11 stages) lives entirely in local
//     Zustand `projectProductions` and is NOT migrated this phase. These
//     trigger-created rows are accepted as deferred, disclosed noise per
//     the explicitly approved Decision 1 - not reconciled, not read here.
//   - trg_log_project -> log_project() writes one row to a `logs` table.
//     Not surfaced to the frontend in any way; irrelevant to hydration.
//
// DB-only, no frontend counterpart (left unmapped, never read/written):
// organization_id, updated_at, status, value.
// Frontend-only, no DB column (per explicitly approved Decisions 3 + the
// follow-up PO-fields question): assignedEmployeeIds, pos, poNumber,
// poDate, poFiles. hydrateProjects() does NOT populate these - the
// hydration hook merges them in from current local state before replacing
// Zustand, since they never round-trip through Supabase.
const PROJECT_COLUMNS =
  "id, project_number, name, customer_id, quantity, created_at, " +
  "work_description, production_version, customer_visible_name, " +
  "internal_order_code, project_type, parent_project_id, " +
  "source_project_id, repeat_order_seq, original_project_name, " +
  "activity_log";

export interface ProjectRow {
  id: string;
  project_number: string;
  name: string;
  customer_id: string;
  quantity: number | null;
  created_at: string;
  work_description: string | null;
  production_version: string | null;
  customer_visible_name: string | null;
  internal_order_code: string | null;
  project_type: string | null;
  parent_project_id: string | null;
  source_project_id: string | null;
  repeat_order_seq: number | null;
  original_project_name: string | null;
  activity_log: ProjectActivity[] | null;
}

// Deliberately returns Omit<Project, ...> for the local-only fields -
// callers (the hydration hook) are responsible for merging those back in
// from current local state, never this function.
export function transformProjectRow(
  row: ProjectRow,
): Omit<
  Project,
  "assignedEmployeeIds" | "pos" | "poNumber" | "poDate" | "poFiles"
> {
  return {
    id: row.id,
    projectNo: row.project_number,
    customerId: row.customer_id,
    projectName: row.name,
    workDescription: row.work_description ?? "",
    createdAt: new Date(row.created_at).getTime(),
    productionVersion:
      (row.production_version as Project["productionVersion"]) ?? undefined,
    totalQty: row.quantity ?? undefined,
    activityLog: row.activity_log ?? undefined,
    sourceProjectId: row.source_project_id ?? undefined,
    repeatOrderSeq: row.repeat_order_seq ?? undefined,
    originalProjectName: row.original_project_name ?? undefined,
    customerVisibleName: row.customer_visible_name ?? undefined,
    internalOrderCode: row.internal_order_code ?? undefined,
    projectType: (row.project_type as Project["projectType"]) ?? undefined,
    parentProjectId: row.parent_project_id ?? undefined,
  };
}

export async function hydrateProjects(): Promise<HydrationResult<Project[]>> {
  if (!isSupabaseConfigured) {
    return { status: "error", error: "Supabase is not configured" };
  }
  const client = getSupabase();

  const { data: sessionData, error: sessionError } =
    await client.auth.getSession();
  if (sessionError) {
    return { status: "error", error: sessionError.message };
  }
  if (!sessionData.session) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await client
    .from("projects")
    .select(PROJECT_COLUMNS)
    .order("created_at");

  if (error) {
    return { status: "error", error: error.message };
  }

  // Local-only fields (assignedEmployeeIds/pos/poNumber/poDate/poFiles)
  // are intentionally absent here - the hydration hook merges them from
  // current local state per project id before this replaces Zustand.
  return {
    status: "success",
    data: (data as unknown as ProjectRow[]).map(
      (row) => transformProjectRow(row) as Project,
    ),
  };
}

// Phase 24 — Outsourced Works. Simple 1:1 scalar mapping, no jsonb, no
// local-only fields (confirmed via Phase 23 investigation, re-confirmed by
// Phase 24's targeted verification). Only trigger is
// trg_outsourced_works_updated_at -> set_updated_at_timestamp() - no
// business-logic trigger. RLS keys off the `projects` module, not its own.
// DB-only, no frontend counterpart: organization_id, updated_at.
export const OUTSOURCED_WORK_COLUMNS =
  "id, project_id, vendor_id, vendor_name, material_sent, quantity_sent, " +
  "date_sent, date_received, process_cost, created_at";

export interface OutsourcedWorkRow {
  id: string;
  project_id: string;
  vendor_id: string | null;
  vendor_name: string;
  material_sent: string;
  quantity_sent: number;
  date_sent: string | null;
  date_received: string | null;
  process_cost: number;
  created_at: string;
}

export function transformOutsourcedWorkRow(
  row: OutsourcedWorkRow,
): OutsourcedWork {
  return {
    id: row.id,
    projectId: row.project_id,
    vendorId: row.vendor_id ?? undefined,
    vendorName: row.vendor_name,
    materialSent: row.material_sent,
    quantitySent: row.quantity_sent,
    dateSent: row.date_sent ?? "",
    dateReceived: row.date_received ?? "",
    processCost: row.process_cost,
  };
}

export async function hydrateOutsourcedWorks(): Promise<
  HydrationResult<OutsourcedWork[]>
> {
  if (!isSupabaseConfigured) {
    return { status: "error", error: "Supabase is not configured" };
  }
  const client = getSupabase();

  const { data: sessionData, error: sessionError } =
    await client.auth.getSession();
  if (sessionError) {
    return { status: "error", error: sessionError.message };
  }
  if (!sessionData.session) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await client
    .from("outsourced_works")
    .select(OUTSOURCED_WORK_COLUMNS)
    .order("created_at");

  if (error) {
    return { status: "error", error: error.message };
  }

  return {
    status: "success",
    data: (data as unknown as OutsourcedWorkRow[]).map(
      transformOutsourcedWorkRow,
    ),
  };
}

// ─────────────────────────────────────────────────────────────────
// Phase 27 Batch 1 — Employees/Inventory/Projects children. Same
// wholesale-replace hydration contract as every prior domain except
// where explicitly noted otherwise below.

async function requireSessionForHydration() {
  if (!isSupabaseConfigured) {
    return {
      ok: false as const,
      result: { status: "error" as const, error: "Supabase is not configured" },
    };
  }
  const client = getSupabase();
  const { data: sessionData, error: sessionError } =
    await client.auth.getSession();
  if (sessionError) {
    return {
      ok: false as const,
      result: { status: "error" as const, error: sessionError.message },
    };
  }
  if (!sessionData.session) {
    return {
      ok: false as const,
      result: { status: "unauthenticated" as const },
    };
  }
  return { ok: true as const, client };
}

// advance_records
export const ADVANCE_RECORD_COLUMNS =
  "id, employee_id, amount, date, reason, remaining_balance, signature_data";

export interface AdvanceRecordRow {
  id: string;
  employee_id: string;
  amount: number;
  date: string;
  reason: string;
  remaining_balance: number;
  signature_data: string | null;
}

export function transformAdvanceRecordRow(
  row: AdvanceRecordRow,
): AdvanceRecord {
  return {
    id: row.id,
    employeeId: row.employee_id,
    amount: row.amount,
    date: row.date,
    reason: row.reason,
    remainingBalance: row.remaining_balance,
    signatureData: row.signature_data ?? undefined,
  };
}

export async function hydrateAdvanceRecords(): Promise<
  HydrationResult<AdvanceRecord[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("advance_records")
    .select(ADVANCE_RECORD_COLUMNS)
    .order("date");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as AdvanceRecordRow[]).map(
      transformAdvanceRecordRow,
    ),
  };
}

// attendance_records
export const ATTENDANCE_RECORD_COLUMNS = "id, employee_id, date, status";

export interface AttendanceRecordRow {
  id: string;
  employee_id: string;
  date: string;
  status: string;
}

export function transformAttendanceRecordRow(
  row: AttendanceRecordRow,
): AttendanceRecord {
  return {
    id: row.id,
    employeeId: row.employee_id,
    date: row.date,
    status: row.status as AttendanceRecord["status"],
  };
}

export async function hydrateAttendanceRecords(): Promise<
  HydrationResult<AttendanceRecord[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("attendance_records")
    .select(ATTENDANCE_RECORD_COLUMNS)
    .order("date");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as AttendanceRecordRow[]).map(
      transformAttendanceRecordRow,
    ),
  };
}

// employee_documents — uploadedBy is a local display username with no DB
// counterpart (DB's uploaded_by is a UUID FK to auth.users, a completely
// independent auth system per Phase 17B/17C - never populated from the
// local username). Deliberately NOT selected/mapped here, exactly the
// same "local-only field merged in by the hydration hook" shape as
// Project's assignedEmployeeIds (Phase 22 Decision 3) - the hydration
// hook merges the existing local uploadedBy per document id before
// replacing Zustand.
export const EMPLOYEE_DOCUMENT_COLUMNS =
  "id, employee_id, document_group_id, superseded_at, document_name, " +
  "document_type, file_data, file_mime_type, upload_date, expiry_date, " +
  "notes, uploaded_at";

export interface EmployeeDocumentRow {
  id: string;
  employee_id: string;
  document_group_id: string;
  superseded_at: string | null;
  document_name: string;
  document_type: string;
  file_data: string;
  file_mime_type: string;
  upload_date: string;
  expiry_date: string | null;
  notes: string | null;
  uploaded_at: string;
}

// Deliberately returns Omit<EmployeeDocument, "uploadedBy"> - see column
// comment above. Callers (the hydration hook) merge uploadedBy back in
// from current local state, never this function.
export function transformEmployeeDocumentRow(
  row: EmployeeDocumentRow,
): Omit<EmployeeDocument, "uploadedBy"> {
  return {
    id: row.id,
    employeeId: row.employee_id,
    documentGroupId: row.document_group_id,
    supersededAt: row.superseded_at
      ? new Date(row.superseded_at).getTime()
      : undefined,
    documentName: row.document_name,
    documentType: row.document_type as EmployeeDocumentType,
    fileData: row.file_data,
    fileMimeType: row.file_mime_type,
    uploadDate: row.upload_date,
    expiryDate: row.expiry_date ?? undefined,
    notes: row.notes ?? undefined,
    uploadedAt: new Date(row.uploaded_at).getTime(),
  };
}

export async function hydrateEmployeeDocuments(): Promise<
  HydrationResult<Omit<EmployeeDocument, "uploadedBy">[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("employee_documents")
    .select(EMPLOYEE_DOCUMENT_COLUMNS)
    .order("uploaded_at");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as EmployeeDocumentRow[]).map(
      transformEmployeeDocumentRow,
    ),
  };
}

// salary_payments
export const SALARY_PAYMENT_COLUMNS =
  "id, employee_id, month, amount, payment_date, notes, original_salary, " +
  "deducted_advance, final_paid_amount, advance_deductions";

export interface SalaryPaymentRow {
  id: string;
  employee_id: string;
  month: string;
  amount: number;
  payment_date: string;
  notes: string | null;
  original_salary: number | null;
  deducted_advance: number | null;
  final_paid_amount: number | null;
  advance_deductions: SalaryPayment["advanceDeductions"] | null;
}

export function transformSalaryPaymentRow(
  row: SalaryPaymentRow,
): SalaryPayment {
  return {
    id: row.id,
    employeeId: row.employee_id,
    month: row.month,
    amount: row.amount,
    paymentDate: row.payment_date,
    notes: row.notes ?? "",
    originalSalary: row.original_salary ?? undefined,
    deductedAdvance: row.deducted_advance ?? undefined,
    finalPaidAmount: row.final_paid_amount ?? undefined,
    advanceDeductions: row.advance_deductions ?? undefined,
  };
}

export async function hydrateSalaryPayments(): Promise<
  HydrationResult<SalaryPayment[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("salary_payments")
    .select(SALARY_PAYMENT_COLUMNS)
    .order("payment_date");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as SalaryPaymentRow[]).map(
      transformSalaryPaymentRow,
    ),
  };
}

// inventory_purchases — project_id/thickness columns confirmed unused by
// every current frontend call site (Inventory.tsx, PettyExpenses.tsx fan
// out) - left unmapped/unwritten, not a local-only-field gap.
export const INVENTORY_PURCHASE_COLUMNS =
  "id, vendor_id, inventory_item_id, quantity, cost, created_at, " +
  "material_name, supplier_name, unit_cost, apply_gst, gst_percent, " +
  "subtotal, gst_amount, final_total, attachments, purchase_date";

export interface InventoryPurchaseRow {
  id: string;
  vendor_id: string | null;
  inventory_item_id: string | null;
  quantity: number | null;
  cost: number | null;
  created_at: string;
  material_name: string | null;
  supplier_name: string | null;
  unit_cost: number | null;
  apply_gst: boolean | null;
  gst_percent: number | null;
  subtotal: number | null;
  gst_amount: number | null;
  final_total: number | null;
  attachments: PurchaseAttachment[] | null;
  purchase_date: string | null;
}

export function transformInventoryPurchaseRow(
  row: InventoryPurchaseRow,
): InventoryPurchase {
  return {
    id: row.id,
    inventoryItemId: row.inventory_item_id ?? "",
    materialName: row.material_name ?? "",
    quantityPurchased: row.quantity ?? 0,
    supplierName: row.supplier_name ?? "",
    vendorId: row.vendor_id ?? undefined,
    purchaseDate: row.purchase_date ?? "",
    cost: row.cost ?? 0,
    unitCost: row.unit_cost ?? undefined,
    applyGST: row.apply_gst ?? undefined,
    gstPercent: row.gst_percent ?? undefined,
    subtotal: row.subtotal ?? undefined,
    gstAmount: row.gst_amount ?? undefined,
    finalTotal: row.final_total ?? undefined,
    attachments: row.attachments ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function hydrateInventoryPurchases(): Promise<
  HydrationResult<InventoryPurchase[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("inventory_purchases")
    .select(INVENTORY_PURCHASE_COLUMNS)
    .order("created_at");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as InventoryPurchaseRow[]).map(
      transformInventoryPurchaseRow,
    ),
  };
}

// inventory_usages
export const INVENTORY_USAGE_COLUMNS =
  "id, project_id, inventory_item_id, quantity_used, created_at, " +
  "material_name, used_date, notes";

export interface InventoryUsageRow {
  id: string;
  project_id: string | null;
  inventory_item_id: string | null;
  quantity_used: number | null;
  created_at: string;
  material_name: string | null;
  used_date: string | null;
  notes: string | null;
}

export function transformInventoryUsageRow(
  row: InventoryUsageRow,
): MaterialUsage {
  return {
    id: row.id,
    projectId: row.project_id ?? "",
    inventoryItemId: row.inventory_item_id ?? "",
    materialName: row.material_name ?? "",
    quantityUsed: row.quantity_used ?? 0,
    usedDate: row.used_date ?? "",
    notes: row.notes ?? "",
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function hydrateInventoryUsages(): Promise<
  HydrationResult<MaterialUsage[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("inventory_usages")
    .select(INVENTORY_USAGE_COLUMNS)
    .order("created_at");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as InventoryUsageRow[]).map(
      transformInventoryUsageRow,
    ),
  };
}

// project_bom_items
export const BOM_ITEM_COLUMNS =
  "id, project_id, inventory_item_id, material_name, required_quantity, " +
  "estimated_price, created_at";

export interface BomItemRow {
  id: string;
  project_id: string;
  inventory_item_id: string;
  material_name: string;
  required_quantity: number;
  estimated_price: number | null;
  created_at: string;
}

export function transformBomItemRow(row: BomItemRow): BomItem {
  return {
    id: row.id,
    projectId: row.project_id,
    inventoryItemId: row.inventory_item_id,
    materialName: row.material_name,
    requiredQuantity: row.required_quantity,
    estimatedPrice: row.estimated_price ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function hydrateBomItems(): Promise<HydrationResult<BomItem[]>> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("project_bom_items")
    .select(BOM_ITEM_COLUMNS)
    .order("created_at");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as BomItemRow[]).map(transformBomItemRow),
  };
}

// bom_requisitions — system-managed (recompute_bom_requisition(), fired
// from project_bom_items' trigger). No INSERT/DELETE RLS policy exists on
// this table (confirmed Phase 23/25/26) - the only frontend-legitimate
// write is the "Mark as Completed" UPDATE (bom_requisitions_approve
// policy, material_requisitions.approve permission). Read side is a
// plain wholesale-replace hydration like every other domain; the DB's
// own row id becomes authoritative (the local id: crypto.randomUUID()
// scheme this replaces was never persisted anywhere else).
export const BOM_REQUISITION_COLUMNS =
  "id, inventory_item_id, project_id, material_name, required_qty, " +
  "available_qty, shortage_qty, estimated_price, status, created_at, updated_at";

export interface BomRequisitionRow {
  id: string;
  inventory_item_id: string;
  project_id: string;
  material_name: string;
  required_qty: number | null;
  available_qty: number | null;
  shortage_qty: number;
  estimated_price: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export function transformBomRequisitionRow(
  row: BomRequisitionRow,
): BomRequisition {
  return {
    id: row.id,
    inventoryItemId: row.inventory_item_id,
    projectId: row.project_id,
    materialName: row.material_name,
    requiredQty: row.required_qty ?? undefined,
    availableQty: row.available_qty ?? undefined,
    shortageQty: row.shortage_qty,
    estimatedPrice: row.estimated_price ?? undefined,
    status: row.status as BomRequisitionStatus,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

export async function hydrateBomRequisitions(): Promise<
  HydrationResult<BomRequisition[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("bom_requisitions")
    .select(BOM_REQUISITION_COLUMNS)
    .order("created_at");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as BomRequisitionRow[]).map(
      transformBomRequisitionRow,
    ),
  };
}

// project_employees — composite PK (project_id, employee_id), no
// surrogate id column, no dedicated frontend type. Feeds
// Project.assignedEmployeeIds only. Returns raw pairs; the hydration
// hook groups them by project_id and replaces the local-only merge that
// setProjectsFromServer previously used for this one field (Phase 22
// Decision 3's anticipated resolution, not a new decision).
export interface ProjectEmployeeRow {
  project_id: string;
  employee_id: string;
}

export interface ProjectEmployeePair {
  projectId: string;
  employeeId: string;
}

export async function hydrateProjectEmployees(): Promise<
  HydrationResult<ProjectEmployeePair[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("project_employees")
    .select("project_id, employee_id");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as ProjectEmployeeRow[]).map((row) => ({
      projectId: row.project_id,
      employeeId: row.employee_id,
    })),
  };
}

// project_machinery / project_dies (Phase 39) — same raw-pairs shape as
// hydrateProjectEmployees above. Feed Project.assignedMachineIds /
// assignedDieIds only.
export interface ProjectMachineryRow {
  project_id: string;
  machine_id: string;
}

export interface ProjectMachinePair {
  projectId: string;
  machineId: string;
}

export async function hydrateProjectMachinery(): Promise<
  HydrationResult<ProjectMachinePair[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("project_machinery")
    .select("project_id, machine_id");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as ProjectMachineryRow[]).map((row) => ({
      projectId: row.project_id,
      machineId: row.machine_id,
    })),
  };
}

export interface ProjectDieRow {
  project_id: string;
  die_id: string;
}

export interface ProjectDiePair {
  projectId: string;
  dieId: string;
}

export async function hydrateProjectDies(): Promise<
  HydrationResult<ProjectDiePair[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("project_dies")
    .select("project_id, die_id");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as ProjectDieRow[]).map((row) => ({
      projectId: row.project_id,
      dieId: row.die_id,
    })),
  };
}

// ── Phase 40 — Machine/Service Revenue (§17-28) ──────────────────
// Full frontend-shaped rows, mirroring hydrateDies/hydrateTools above -
// these are real domain types with their own consumers (dashboard,
// drill-down, Project Overview readonly block), not raw pairs.

const BILLABLE_SERVICE_COLUMNS =
  "id, name, machine_id, charging_method, unit_label, is_active, created_at, updated_at";

export async function hydrateBillableServices(): Promise<
  HydrationResult<BillableService[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("billable_services")
    .select(BILLABLE_SERVICE_COLUMNS)
    .order("name");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as BillableServiceRow[]).map(rowToBillableService),
  };
}

const RATE_HISTORY_COLUMNS =
  "id, billable_service_id, rate, effective_from, created_by, created_at";

export async function hydrateMachineServiceRates(): Promise<
  HydrationResult<MachineServiceRate[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("machine_service_rate_history")
    .select(RATE_HISTORY_COLUMNS)
    .order("effective_from");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as RateHistoryRow[]).map(rowToRate),
  };
}

const USAGE_COLUMNS =
  "id, project_id, billable_service_id, usage_date, quantity, unit, " +
  "rate_applied, revenue_amount, recorded_by, notes, created_at, updated_at";

export async function hydrateMachineServiceUsage(): Promise<
  HydrationResult<MachineServiceUsage[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("machine_service_usage")
    .select(USAGE_COLUMNS)
    .order("usage_date", { ascending: false });
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as UsageRow[]).map(rowToUsage),
  };
}

// ── Phase 27 Batch 2 — quotations, quotation_revisions, master_pos,
// quotation_purchase_orders, project_purchase_orders ──────────────────
//
// Local-only fields with no DB column, confirmed by direct comparison
// against database/phase-03/phase3_quotations_company_pos_FINAL.sql:
//   - Quotation.enqId — no column, was always "" on create, dead.
//   - Quotation.version — no column. quotations.history IS a real jsonb
//     column though, so version is derived as history.length + 1 on
//     every hydrate, never merged from local state (it's a pure function
//     of server-truth history, can never go stale).
//   - Quotation.recordedPO — legacy pre-Revisions field, never written by
//     any live code path (grep-confirmed), read only as a defensive
//     fallback in a couple of display spots. Preserved via the same
//     by-id local merge as EmployeeDocument.uploadedBy (Batch 1), so old
//     locally-restored backups keep displaying it.
//   - Quotation.approvedBy / QuotationRevision.createdBy /
//     QuotationPurchaseOrder.createdBy — DB's approved_by/created_by are
//     uuid FKs into auth.users; the frontend fields are display
//     usernames. Same resolution as employee_documents.uploaded_by in
//     Batch 1: the DB column gets the real signed-in session's user id
//     (genuine audit data), the username stays a local-only field merged
//     in by id post-hydration.
//   - MasterPO.sharedPoId / QuotationPurchaseOrder.sharedPoId /
//     ProjectPO.sharedPoId — confirmed to have no real DB gap; the actual
//     cross-table link is the real FK master_po_id. Not a merge-exception
//     at all — derived directly and deterministically from master_po_id
//     (or, for MasterPO itself, from its own id) on every hydrate.
//   - QuotationRevision.approvedBy / approvedAt — DB columns exist but
//     grep-confirmed zero live write sites; left unmapped (always
//     undefined), matching today's actual behavior exactly.

export const QUOTATION_COLUMNS =
  "id, qt_no, customer_id, project_id, line_items, subtotal, apply_gst, " +
  "apply_igst, cgst_rate, sgst_rate, igst_rate, cgst_amt, sgst_amt, " +
  "igst_amt, total_amount, valid_until, terms, status, quotation_date, " +
  "notes, history, approved_at, created_at";

export interface QuotationRow {
  id: string;
  qt_no: string;
  customer_id: string;
  project_id: string | null;
  line_items: LineItem[];
  subtotal: number;
  apply_gst: boolean;
  apply_igst: boolean;
  cgst_rate: number;
  sgst_rate: number;
  igst_rate: number;
  cgst_amt: number;
  sgst_amt: number;
  igst_amt: number;
  total_amount: number;
  valid_until: string;
  terms: string | null;
  status: string;
  quotation_date: string | null;
  notes: string | null;
  history: QuotationHistoryEntry[] | null;
  approved_at: string | null;
  created_at: string;
}

export function transformQuotationRow(row: QuotationRow): Quotation {
  const history = row.history ?? [];
  return {
    id: row.id,
    qtNo: row.qt_no,
    customerId: row.customer_id,
    projectId: row.project_id ?? undefined,
    lineItems: row.line_items ?? [],
    subtotal: row.subtotal,
    applyGST: row.apply_gst,
    applyIGST: row.apply_igst,
    cgstRate: row.cgst_rate,
    sgstRate: row.sgst_rate,
    igstRate: row.igst_rate,
    cgstAmt: row.cgst_amt,
    sgstAmt: row.sgst_amt,
    igstAmt: row.igst_amt,
    totalAmount: row.total_amount,
    validUntil: row.valid_until,
    terms: row.terms ?? "",
    status: row.status as QuotationStatus,
    createdAt: new Date(row.created_at).getTime(),
    version: history.length + 1,
    quotationDate: row.quotation_date ?? undefined,
    notes: row.notes ?? undefined,
    history,
    approvedAt: row.approved_at
      ? new Date(row.approved_at).getTime()
      : undefined,
  };
}

export async function hydrateQuotations(): Promise<
  HydrationResult<Quotation[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("quotations")
    .select(QUOTATION_COLUMNS)
    .order("created_at");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as QuotationRow[]).map(transformQuotationRow),
  };
}

export const QUOTATION_REVISION_COLUMNS =
  "id, quotation_id, revision_number, revision_date, revision_notes, " +
  "line_items, subtotal, apply_gst, apply_igst, cgst_rate, sgst_rate, " +
  "igst_rate, cgst_amt, sgst_amt, igst_amt, total_amount, " +
  "valid_until, terms, notes, status, is_current, created_at";

export interface QuotationRevisionRow {
  id: string;
  quotation_id: string;
  revision_number: number;
  revision_date: string;
  revision_notes: string | null;
  line_items: LineItem[];
  subtotal: number;
  apply_gst: boolean;
  apply_igst: boolean;
  cgst_rate: number;
  sgst_rate: number;
  igst_rate: number;
  cgst_amt: number;
  sgst_amt: number;
  igst_amt: number;
  total_amount: number;
  valid_until: string;
  terms: string | null;
  notes: string | null;
  status: string;
  is_current: boolean;
  created_at: string;
}

export function transformQuotationRevisionRow(
  row: QuotationRevisionRow,
): QuotationRevision {
  return {
    id: row.id,
    quotationId: row.quotation_id,
    revisionNumber: row.revision_number,
    revisionDate: row.revision_date,
    revisionNotes: row.revision_notes ?? undefined,
    lineItems: row.line_items ?? [],
    subtotal: row.subtotal,
    applyGST: row.apply_gst,
    applyIGST: row.apply_igst,
    cgstRate: row.cgst_rate,
    sgstRate: row.sgst_rate,
    igstRate: row.igst_rate,
    cgstAmt: row.cgst_amt,
    sgstAmt: row.sgst_amt,
    igstAmt: row.igst_amt,
    totalAmount: row.total_amount,
    validUntil: row.valid_until,
    terms: row.terms ?? "",
    notes: row.notes ?? undefined,
    status: row.status as QuotationStatus,
    isCurrent: row.is_current,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function hydrateQuotationRevisions(): Promise<
  HydrationResult<QuotationRevision[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("quotation_revisions")
    .select(QUOTATION_REVISION_COLUMNS)
    .order("created_at");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as QuotationRevisionRow[]).map(
      transformQuotationRevisionRow,
    ),
  };
}

export const MASTER_PO_COLUMNS =
  "id, po_number, po_date, customer_id, quotation_id, files, status, created_at";

export interface MasterPORow {
  id: string;
  po_number: string;
  po_date: string;
  customer_id: string;
  quotation_id: string;
  files: PurchaseAttachment[] | null;
  status: string;
  created_at: string;
}

export function transformMasterPORow(row: MasterPORow): MasterPO {
  return {
    id: row.id,
    poNumber: row.po_number,
    poDate: row.po_date,
    customerId: row.customer_id,
    quotationId: row.quotation_id,
    files: row.files ?? [],
    // No DB gap - the real cross-table link is master_po_id. For the
    // MasterPO row itself that FK value is its own id.
    sharedPoId: row.id,
    status: row.status as MasterPO["status"],
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function hydrateMasterPOs(): Promise<HydrationResult<MasterPO[]>> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("master_pos")
    .select(MASTER_PO_COLUMNS)
    .order("created_at");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as MasterPORow[]).map(transformMasterPORow),
  };
}

export const QUOTATION_PURCHASE_ORDER_COLUMNS =
  "id, quotation_id, revision_id, master_po_id, po_number, po_date, " +
  "customer_id, files, remarks, status, created_at";

export interface QuotationPurchaseOrderRow {
  id: string;
  quotation_id: string;
  revision_id: string;
  master_po_id: string;
  po_number: string;
  po_date: string;
  customer_id: string;
  files: PurchaseAttachment[] | null;
  remarks: string | null;
  status: string;
  created_at: string;
}

export function transformQuotationPurchaseOrderRow(
  row: QuotationPurchaseOrderRow,
): QuotationPurchaseOrder {
  return {
    id: row.id,
    quotationId: row.quotation_id,
    revisionId: row.revision_id,
    poNumber: row.po_number,
    poDate: row.po_date,
    customerId: row.customer_id,
    files: row.files ?? [],
    remarks: row.remarks ?? undefined,
    status: row.status as POStatus,
    sharedPoId: row.master_po_id,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function hydrateQuotationPurchaseOrders(): Promise<
  HydrationResult<QuotationPurchaseOrder[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("quotation_purchase_orders")
    .select(QUOTATION_PURCHASE_ORDER_COLUMNS)
    .order("created_at");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as QuotationPurchaseOrderRow[]).map(
      transformQuotationPurchaseOrderRow,
    ),
  };
}

// project_purchase_orders — same shape as project_employees above: no
// dedicated top-level frontend type, feeds Project.pos[] only. Returns
// {projectId, po} pairs; the hydration hook groups them by project_id
// and replaces the local-only merge setProjectsFromServer previously
// used for this one field.
export const PROJECT_PURCHASE_ORDER_COLUMNS =
  "id, project_id, master_po_id, quotation_id, po_number, po_date, " +
  "quantity, status, file, created_at";

export interface ProjectPurchaseOrderRow {
  id: string;
  project_id: string;
  master_po_id: string;
  quotation_id: string | null;
  po_number: string;
  po_date: string;
  quantity: number;
  status: string;
  file: PurchaseAttachment | null;
  created_at: string;
}

export interface ProjectPurchaseOrderPair {
  projectId: string;
  po: ProjectPO;
}

export function transformProjectPurchaseOrderRow(
  row: ProjectPurchaseOrderRow,
): ProjectPurchaseOrderPair {
  return {
    projectId: row.project_id,
    po: {
      id: row.id,
      poNumber: row.po_number,
      poDate: row.po_date,
      quantity: row.quantity,
      status: row.status as ProjectPOStatus,
      file: row.file ?? undefined,
      quotationId: row.quotation_id ?? undefined,
      sharedPoId: row.master_po_id,
    },
  };
}

export async function hydrateProjectPurchaseOrders(): Promise<
  HydrationResult<ProjectPurchaseOrderPair[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("project_purchase_orders")
    .select(PROJECT_PURCHASE_ORDER_COLUMNS)
    .order("created_at");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as ProjectPurchaseOrderRow[]).map(
      transformProjectPurchaseOrderRow,
    ),
  };
}

// ── Phase 27 Batch 3 — expense_floats, petty_expenses ──────────────────
//
// spent_amount/balance_amount/status/settled_at on expense_floats are
// 100% trigger-owned (expense_floats_before_write() -> expense_float_
// recompute(), confirmed via pg_get_functiondef) - byte-for-byte the same
// formula store.ts's own deriveFloatTotals() already used locally. Never
// written by the frontend; always read back from what the trigger set.
//
// issuedBy: DB issued_by is a uuid FK to auth.users; the frontend field
// is a display username from the local auth system. Same resolution as
// every other *_by field this phase: DB column gets the real session
// user id, username stays local-only, merged back in by store.ts.
//
// PettyExpense.createdAt is unusually already an ISO string in the local
// type (not epoch ms like every other domain's createdAt) - DB's
// created_at timestamptz round-trips directly with no unit conversion.
export const EXPENSE_FLOAT_COLUMNS =
  "id, float_no, employee_id, issued_date, issued_amount, spent_amount, " +
  "returned_amount, balance_amount, status, purpose, notes, project_id, " +
  "settled_at, created_at";

export interface ExpenseFloatRow {
  id: string;
  float_no: string;
  employee_id: string;
  issued_date: string;
  issued_amount: number;
  spent_amount: number;
  returned_amount: number;
  balance_amount: number;
  status: string;
  purpose: string | null;
  notes: string | null;
  project_id: string | null;
  settled_at: string | null;
  created_at: string;
}

export function transformExpenseFloatRow(row: ExpenseFloatRow): ExpenseFloat {
  return {
    id: row.id,
    floatNo: row.float_no,
    employeeId: row.employee_id,
    issuedDate: row.issued_date,
    issuedAmount: row.issued_amount,
    spentAmount: row.spent_amount,
    returnedAmount: row.returned_amount,
    balanceAmount: row.balance_amount,
    status: row.status as ExpenseFloatStatus,
    purpose: row.purpose ?? undefined,
    notes: row.notes ?? undefined,
    projectId: row.project_id ?? undefined,
    // No DB gap - local-only display username, merged in by store.ts.
    // "—" is the fallback for a row this session has never seen locally
    // (e.g. created by another user), same shape as employee_documents.
    issuedBy: "—",
    settledAt: row.settled_at ? new Date(row.settled_at).getTime() : undefined,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function hydrateExpenseFloats(): Promise<
  HydrationResult<ExpenseFloat[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("expense_floats")
    .select(EXPENSE_FLOAT_COLUMNS)
    .order("created_at");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as ExpenseFloatRow[]).map(transformExpenseFloatRow),
  };
}

export const PETTY_EXPENSE_COLUMNS =
  "id, date, employee_id, amount, expense_type, expense_mode, project_id, " +
  "float_id, notes, item_name, quantity, unit_price, vendor, vendor_id, " +
  "bill_number, attachments, inventory_item_id, added_to_inventory, " +
  "machine_id, service_type, vehicle_expense_type, service_provider_type, " +
  "pickup_location, drop_location, recovered_in_salary_payment_id, created_at";

export interface PettyExpenseRow {
  id: string;
  date: string;
  employee_id: string;
  amount: number;
  expense_type: string;
  expense_mode: string;
  project_id: string | null;
  float_id: string | null;
  notes: string | null;
  item_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  vendor: string | null;
  vendor_id: string | null;
  bill_number: string | null;
  attachments: PurchasedItemAttachment[] | null;
  inventory_item_id: string | null;
  added_to_inventory: boolean | null;
  machine_id: string | null;
  service_type: string | null;
  vehicle_expense_type: string | null;
  service_provider_type: string | null;
  pickup_location: string | null;
  drop_location: string | null;
  recovered_in_salary_payment_id: string | null;
  created_at: string;
}

export function transformPettyExpenseRow(row: PettyExpenseRow): PettyExpense {
  return {
    id: row.id,
    date: row.date,
    employeeId: row.employee_id,
    amount: row.amount,
    expenseType: row.expense_type as PettyExpenseType,
    expenseMode: row.expense_mode as PettyExpenseMode,
    projectId: row.project_id ?? undefined,
    floatId: row.float_id ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    itemName: row.item_name ?? undefined,
    quantity: row.quantity ?? undefined,
    unitPrice: row.unit_price ?? undefined,
    vendor: row.vendor ?? undefined,
    vendorId: row.vendor_id ?? undefined,
    billNumber: row.bill_number ?? undefined,
    attachments: row.attachments ?? undefined,
    inventoryItemId: row.inventory_item_id ?? undefined,
    addedToInventory: row.added_to_inventory ?? undefined,
    machineId: row.machine_id ?? undefined,
    serviceType: (row.service_type as ServiceType | null) ?? undefined,
    vehicleExpenseType:
      (row.vehicle_expense_type as VehicleExpenseType | null) ?? undefined,
    serviceProviderType:
      (row.service_provider_type as CourierServiceProvider | null) ?? undefined,
    pickupLocation: row.pickup_location ?? undefined,
    dropLocation: row.drop_location ?? undefined,
    recoveredInSalaryPaymentId: row.recovered_in_salary_payment_id ?? undefined,
  };
}

export async function hydratePettyExpenses(): Promise<
  HydrationResult<PettyExpense[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("petty_expenses")
    .select(PETTY_EXPENSE_COLUMNS)
    .order("created_at");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as PettyExpenseRow[]).map(transformPettyExpenseRow),
  };
}

// ── Phase 27 Batch 4 — delivery_challans ────────────────────────────
//
// dc_no is confirmed the live field (frontend type/field is dcNo,
// exact-name match); dc_number is a dead/unused duplicate column, same
// finding as project_materials/production_stages in earlier phases -
// never selected, never written. project_id/quantity are also dead
// top-level columns superseded by the project_entries jsonb array
// (DeliveryChallan has no singular projectId/quantity field at all -
// only projectEntries: DCProjectEntry[]) - left unmapped too.
//
// items/project_entries/delivery_address are jsonb and already match
// DCItem[]/DCProjectEntry[]/{type,value} directly, no reshaping.
//
// No numbering race - no unique constraint on dc_no (confirmed via \d),
// so dc_no collisions are a pre-existing, unenforced possibility the
// frontend already only soft-guards against via a local duplicate scan.
// That exact same soft guard is preserved in DeliveryChallans.tsx,
// unchanged in strength - not upgraded to a bounded-retry pattern, since
// there is no DB constraint to retry against.
//
// soId/jobId - confirmed zero live write sites (grep), legacy dead
// fields with no DB column. Left unmapped, same as Quotation.enqId.
export const DELIVERY_CHALLAN_COLUMNS =
  "id, dc_no, customer_id, items, project_entries, dispatch_method, " +
  "vehicle_no, driver_name, courier_company, tracking_number, " +
  "transport_company, lr_number, collected_by, mobile_number, " +
  "dispatch_date, receiver_name, status, delivery_address, created_at";

export interface DeliveryChallanRow {
  id: string;
  dc_no: string | null;
  customer_id: string | null;
  items: DCItem[] | null;
  project_entries: DCProjectEntry[] | null;
  dispatch_method: string | null;
  vehicle_no: string | null;
  driver_name: string | null;
  courier_company: string | null;
  tracking_number: string | null;
  transport_company: string | null;
  lr_number: string | null;
  collected_by: string | null;
  mobile_number: string | null;
  dispatch_date: string;
  receiver_name: string | null;
  status: string | null;
  delivery_address: { type: "customer" | "custom"; value: string } | null;
  created_at: string;
}

export function transformDeliveryChallanRow(
  row: DeliveryChallanRow,
): DeliveryChallan {
  return {
    id: row.id,
    dcNo: row.dc_no ?? "",
    customerId: row.customer_id ?? "",
    items: row.items ?? undefined,
    projectEntries: row.project_entries ?? undefined,
    dispatchMethod: (row.dispatch_method as DispatchMethod | null) ?? undefined,
    vehicleNo: row.vehicle_no ?? undefined,
    driverName: row.driver_name ?? undefined,
    courierCompany: row.courier_company ?? undefined,
    trackingNumber: row.tracking_number ?? undefined,
    transportCompany: row.transport_company ?? undefined,
    lrNumber: row.lr_number ?? undefined,
    collectedBy: row.collected_by ?? undefined,
    mobileNumber: row.mobile_number ?? undefined,
    dispatchDate: row.dispatch_date,
    receiverName: row.receiver_name ?? "",
    status: row.status as DCStatus,
    createdAt: new Date(row.created_at).getTime(),
    deliveryAddress: row.delivery_address ?? undefined,
  };
}

export async function hydrateDeliveryChallans(): Promise<
  HydrationResult<DeliveryChallan[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("delivery_challans")
    .select(DELIVERY_CHALLAN_COLUMNS)
    .order("created_at");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as DeliveryChallanRow[]).map(
      transformDeliveryChallanRow,
    ),
  };
}

// Phase 27 Batch 5 — invoices, invoice_items, payments.
//
// invoice_items is a real one-row-per-line-item table (Option A,
// decompose-on-write - confirmed via Phase 26 preflight E-1, and directly
// via Phase 9's own migration doc/SQL, which is committed in this repo at
// database/phase-09/phase9_invoices_FINAL.sql). invoices.total_amount is
// trigger-owned (trg on invoice_items INSERT/UPDATE recomputes it from
// SUM(quantity*price) + GST - see update_invoice_total() in that file);
// invoices.status is trigger-owned by update_invoice_status() (fires on
// payments INSERT/UPDATE, from SUM(payments.amount) vs total_amount).
// invoices.paid_amount is explicitly NOT trigger-derived (confirmed by
// Phase 9's own doc: "paid_amount is frontend-written, not
// trigger-derivable") - the write layer must maintain it explicitly.
//
// Confirmed dead / excluded from every write path (Phase 9's own migration
// comments + direct frontend grep): Invoice.bankDetails, .termsAndConditions
// (zero write-side usage, always settings-driven at print time),
// .invoiceNumber (UI-form-only duplicate of invNo, never a separate DB
// column), .soId (zero occurrences anywhere in Invoices.tsx/Payments.tsx/
// store.ts, same dead-legacy-field shape as DeliveryChallan.soId/.jobId).
//
// inv_no confirmed no DB unique constraint (same as dc_no) - the existing
// soft local duplicate-scan guard is preserved as-is, not upgraded.
//
// invoice_items has no explicit ordering column. Line-item order is
// preserved by inserting items sequentially (one at a time, not a single
// bulk array insert) so each row's created_at is a distinct, increasing
// timestamp - see invoicesApi.ts. Hydration orders by created_at to match.

export const INVOICE_COLUMNS =
  "id, inv_no, dc_id, customer_id, project_id, subtotal, cgst_rate, " +
  "sgst_rate, igst_rate, cgst_amt, sgst_amt, igst_amt, total_amount, " +
  "invoice_date, due_date, payment_terms, status, paid_amount, " +
  "delivery_vehicle_no, delivery_destination, po_number, po_date, " +
  "buyer_gstin, buyer_address, buyer_state_name, buyer_state_code, " +
  "invoice_type, reminder_enabled, reminder_interval_days, " +
  "reminder_frequency_days, next_reminder_at, last_reminder_sent_at, " +
  "reminder_count, next_reminder_custom_date, selected_email, created_at";

export const INVOICE_ITEM_COLUMNS =
  "id, invoice_id, description, hsn, quantity, price, project_id, created_at";

export interface InvoiceItemRow {
  id: string;
  invoice_id: string;
  description: string | null;
  hsn: string | null;
  quantity: number;
  price: number;
  project_id: string | null;
  created_at: string;
}

export interface InvoiceRow {
  id: string;
  inv_no: string | null;
  dc_id: string | null;
  customer_id: string;
  project_id: string | null;
  subtotal: number | null;
  cgst_rate: number | null;
  sgst_rate: number | null;
  igst_rate: number | null;
  cgst_amt: number | null;
  sgst_amt: number | null;
  igst_amt: number | null;
  total_amount: number | null;
  invoice_date: string | null;
  due_date: string | null;
  payment_terms: string | null;
  status: string | null;
  paid_amount: number | null;
  delivery_vehicle_no: string | null;
  delivery_destination: string | null;
  po_number: string | null;
  po_date: string | null;
  buyer_gstin: string | null;
  buyer_address: string | null;
  buyer_state_name: string | null;
  buyer_state_code: string | null;
  invoice_type: string | null;
  reminder_enabled: boolean | null;
  reminder_interval_days: number | null;
  reminder_frequency_days: number | null;
  next_reminder_at: string | null;
  last_reminder_sent_at: string | null;
  reminder_count: number | null;
  next_reminder_custom_date: string | null;
  selected_email: string | null;
  created_at: string;
  invoice_items?: InvoiceItemRow[];
}

export function transformInvoiceItemRow(row: InvoiceItemRow): InvLineItem {
  return {
    desc: row.description ?? "",
    hsn: row.hsn ?? "",
    qty: row.quantity ?? 0,
    rate: row.price ?? 0,
    amount: (row.quantity ?? 0) * (row.price ?? 0),
    projectId: row.project_id ?? undefined,
  };
}

export function transformInvoiceRow(row: InvoiceRow): Invoice {
  const items = [...(row.invoice_items ?? [])].sort((a, b) =>
    a.created_at === b.created_at
      ? a.id.localeCompare(b.id)
      : a.created_at.localeCompare(b.created_at),
  );
  return {
    id: row.id,
    invNo: row.inv_no ?? "",
    dcId: row.dc_id ?? "",
    customerId: row.customer_id,
    projectId: row.project_id ?? undefined,
    lineItems: items.map(transformInvoiceItemRow),
    subtotal: row.subtotal ?? 0,
    cgstRate: row.cgst_rate ?? 0,
    sgstRate: row.sgst_rate ?? 0,
    igstRate: row.igst_rate ?? 0,
    cgstAmt: row.cgst_amt ?? 0,
    sgstAmt: row.sgst_amt ?? 0,
    igstAmt: row.igst_amt ?? 0,
    totalAmount: row.total_amount ?? 0,
    invoiceDate: row.invoice_date ?? "",
    dueDate: row.due_date ?? "",
    paymentTerms: row.payment_terms ?? "",
    status: (row.status as InvoiceStatus | null) ?? "Unpaid",
    paidAmount: row.paid_amount ?? 0,
    deliveryVehicleNo: row.delivery_vehicle_no ?? undefined,
    deliveryDestination: row.delivery_destination ?? undefined,
    poNumber: row.po_number ?? undefined,
    poDate: row.po_date ?? undefined,
    buyerGstin: row.buyer_gstin ?? undefined,
    buyerAddress: row.buyer_address ?? undefined,
    buyerStateName: row.buyer_state_name ?? undefined,
    buyerStateCode: row.buyer_state_code ?? undefined,
    invoiceType: (row.invoice_type as "tax" | "proforma" | null) ?? "tax",
    createdAt: new Date(row.created_at).getTime(),
    reminderEnabled: row.reminder_enabled ?? undefined,
    reminderIntervalDays: row.reminder_interval_days ?? undefined,
    nextReminderAt: row.next_reminder_at ?? undefined,
    lastReminderSentAt: row.last_reminder_sent_at ?? null,
    reminderCount: row.reminder_count ?? undefined,
    reminderFrequencyDays: row.reminder_frequency_days ?? undefined,
    nextReminderCustomDate: row.next_reminder_custom_date ?? null,
    selectedEmail: row.selected_email ?? undefined,
    // invoiceNumber is a form-staging duplicate of invNo, never persisted -
    // hydrate it from invNo so the edit form's field starts populated.
    invoiceNumber: row.inv_no ?? "",
  };
}

export async function hydrateInvoices(): Promise<HydrationResult<Invoice[]>> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("invoices")
    .select(`${INVOICE_COLUMNS}, invoice_items(${INVOICE_ITEM_COLUMNS})`)
    .order("created_at");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as InvoiceRow[]).map(transformInvoiceRow),
  };
}

export const PAYMENT_COLUMNS =
  "id, invoice_id, amount, payment_date, mode, reference_no, notes, " +
  "files, created_at";

export interface PaymentRow {
  id: string;
  invoice_id: string;
  amount: number;
  payment_date: string | null;
  mode: string | null;
  reference_no: string | null;
  notes: string | null;
  files: Array<{ name: string; url: string; type: string }> | null;
  created_at: string;
}

export function transformPaymentRow(row: PaymentRow): Payment {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    amount: row.amount,
    paymentDate: row.payment_date ?? "",
    mode: (row.mode as PaymentMode | null) ?? "Cash",
    referenceNo: row.reference_no ?? "",
    notes: row.notes ?? "",
    createdAt: new Date(row.created_at).getTime(),
    files: row.files ?? undefined,
  };
}

export async function hydratePayments(): Promise<HydrationResult<Payment[]>> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("payments")
    .select(PAYMENT_COLUMNS)
    .order("created_at");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as PaymentRow[]).map(transformPaymentRow),
  };
}

// ════════════════════════════════════════════════════════════════════════
// Phase 32 — Production ↔ QMS gate persistence (5 tables). See
// qms/types.ts's own Phase 32 section header for the full architecture
// note. Loaded into qms/store/useQmsStore.ts (NOT the main useStore()),
// mirroring that store's existing stageCompletions cache — see
// hooks/useSupabaseHydration.ts for the wiring.
// ════════════════════════════════════════════════════════════════════════

export const PROJECT_QMS_INSPECTION_COLUMNS =
  "id, project_id, library_inspection_id, library_inspection_name, " +
  "required_production_stage_id, mode, status, created_by, " +
  "created_by_name, created_at, updated_at";

export interface ProjectQmsInspectionRow {
  id: string;
  project_id: string;
  library_inspection_id: string;
  library_inspection_name: string;
  required_production_stage_id: string | null;
  mode: string;
  status: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export function transformProjectQmsInspectionRow(
  row: ProjectQmsInspectionRow,
): ProjectQmsInspection {
  return {
    id: row.id,
    projectId: row.project_id,
    libraryInspectionId: row.library_inspection_id,
    libraryInspectionName: row.library_inspection_name,
    requiredProductionStageId: row.required_production_stage_id ?? undefined,
    mode: row.mode as InspectionMode,
    status: row.status as ProjectQmsInspectionStatus,
    createdBy: row.created_by ?? undefined,
    createdByName: row.created_by_name ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

export async function hydrateProjectQmsInspections(): Promise<
  HydrationResult<ProjectQmsInspection[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("project_qms_inspections")
    .select(PROJECT_QMS_INSPECTION_COLUMNS)
    .order("created_at");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as ProjectQmsInspectionRow[]).map(
      transformProjectQmsInspectionRow,
    ),
  };
}

export const PROJECT_QMS_INSPECTION_CHARACTERISTIC_COLUMNS =
  "id, project_qms_inspection_id, library_characteristic_id, " +
  "name_snapshot, category_snapshot, sequence, created_at";

export interface ProjectQmsInspectionCharacteristicRow {
  id: string;
  project_qms_inspection_id: string;
  library_characteristic_id: string;
  name_snapshot: string;
  category_snapshot: string | null;
  sequence: number;
  created_at: string;
}

export function transformProjectQmsInspectionCharacteristicRow(
  row: ProjectQmsInspectionCharacteristicRow,
): ProjectQmsInspectionCharacteristic {
  return {
    id: row.id,
    projectQmsInspectionId: row.project_qms_inspection_id,
    libraryCharacteristicId: row.library_characteristic_id,
    nameSnapshot: row.name_snapshot,
    categorySnapshot: row.category_snapshot ?? undefined,
    sequence: row.sequence,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function hydrateProjectQmsInspectionCharacteristics(): Promise<
  HydrationResult<ProjectQmsInspectionCharacteristic[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("project_qms_inspection_characteristics")
    .select(PROJECT_QMS_INSPECTION_CHARACTERISTIC_COLUMNS)
    .order("sequence");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as ProjectQmsInspectionCharacteristicRow[]).map(
      transformProjectQmsInspectionCharacteristicRow,
    ),
  };
}

export const PROJECT_QMS_INSPECTION_ATTEMPT_COLUMNS =
  "id, project_qms_inspection_id, characteristic_id, round_number, " +
  "result, measured_value, remarks, failure_reason, failure_description, " +
  "rectification_action, rectification_description, performed_by, " +
  "performed_by_name, performed_at, created_at";

export interface ProjectQmsInspectionAttemptRow {
  id: string;
  project_qms_inspection_id: string;
  characteristic_id: string;
  round_number: number;
  result: string;
  measured_value: string | null;
  remarks: string | null;
  failure_reason: string | null;
  failure_description: string | null;
  rectification_action: string | null;
  rectification_description: string | null;
  performed_by: string | null;
  performed_by_name: string | null;
  performed_at: string;
  created_at: string;
}

export function transformProjectQmsInspectionAttemptRow(
  row: ProjectQmsInspectionAttemptRow,
): ProjectQmsInspectionAttempt {
  return {
    id: row.id,
    projectQmsInspectionId: row.project_qms_inspection_id,
    characteristicId: row.characteristic_id,
    roundNumber: row.round_number,
    result: row.result as ProjectQmsInspectionAttemptResult,
    measuredValue: row.measured_value ?? undefined,
    remarks: row.remarks ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    failureDescription: row.failure_description ?? undefined,
    rectificationAction: row.rectification_action ?? undefined,
    rectificationDescription: row.rectification_description ?? undefined,
    performedBy: row.performed_by ?? undefined,
    performedByName: row.performed_by_name ?? undefined,
    performedAt: new Date(row.performed_at).getTime(),
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function hydrateProjectQmsInspectionAttempts(): Promise<
  HydrationResult<ProjectQmsInspectionAttempt[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("project_qms_inspection_attempts")
    .select(PROJECT_QMS_INSPECTION_ATTEMPT_COLUMNS)
    .order("round_number");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as ProjectQmsInspectionAttemptRow[]).map(
      transformProjectQmsInspectionAttemptRow,
    ),
  };
}

export const PROJECT_QMS_INSPECTION_ATTEMPT_PHOTO_COLUMNS =
  "id, attempt_id, file_data, file_mime_type, caption, uploaded_by, " +
  "uploaded_by_name, uploaded_at, created_at";

export interface ProjectQmsInspectionAttemptPhotoRow {
  id: string;
  attempt_id: string;
  file_data: string;
  file_mime_type: string;
  caption: string | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  uploaded_at: string;
  created_at: string;
}

export function transformProjectQmsInspectionAttemptPhotoRow(
  row: ProjectQmsInspectionAttemptPhotoRow,
): ProjectQmsInspectionAttemptPhoto {
  return {
    id: row.id,
    attemptId: row.attempt_id,
    fileData: row.file_data,
    fileMimeType: row.file_mime_type,
    caption: row.caption ?? undefined,
    uploadedBy: row.uploaded_by ?? undefined,
    uploadedByName: row.uploaded_by_name ?? undefined,
    uploadedAt: new Date(row.uploaded_at).getTime(),
    createdAt: new Date(row.created_at).getTime(),
  };
}

// Deliberately NOT loaded on initial app hydration (unlike the other 4
// tables in this Phase 32 group) — base64 photo payloads can be large and
// most inspections/attempts will have none; loading every photo for every
// attempt across every project up front would bloat the initial hydration
// fetch for no benefit. Fetched on demand instead — see
// lib/qmsInspectionsApi.ts's getProjectQmsInspectionAttemptPhotos().
export async function hydrateProjectQmsInspectionAttemptPhotosForAttempts(
  attemptIds: string[],
): Promise<HydrationResult<ProjectQmsInspectionAttemptPhoto[]>> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  if (attemptIds.length === 0) return { status: "success", data: [] };
  const { data, error } = await gate.client
    .from("project_qms_inspection_attempt_photos")
    .select(PROJECT_QMS_INSPECTION_ATTEMPT_PHOTO_COLUMNS)
    .in("attempt_id", attemptIds)
    .order("uploaded_at");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as ProjectQmsInspectionAttemptPhotoRow[]).map(
      transformProjectQmsInspectionAttemptPhotoRow,
    ),
  };
}

export const PROJECT_QMS_INSPECTION_OVERRIDE_COLUMNS =
  "id, project_qms_inspection_id, required_production_stage_id, reason, " +
  "overridden_by, overridden_by_name, overridden_at, created_at";

export interface ProjectQmsInspectionOverrideRow {
  id: string;
  project_qms_inspection_id: string;
  required_production_stage_id: string;
  reason: string;
  overridden_by: string;
  overridden_by_name: string;
  overridden_at: string;
  created_at: string;
}

export function transformProjectQmsInspectionOverrideRow(
  row: ProjectQmsInspectionOverrideRow,
): ProjectQmsInspectionOverride {
  return {
    id: row.id,
    projectQmsInspectionId: row.project_qms_inspection_id,
    requiredProductionStageId: row.required_production_stage_id,
    reason: row.reason,
    overriddenBy: row.overridden_by,
    overriddenByName: row.overridden_by_name,
    overriddenAt: new Date(row.overridden_at).getTime(),
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function hydrateProjectQmsInspectionOverrides(): Promise<
  HydrationResult<ProjectQmsInspectionOverride[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("project_qms_inspection_overrides")
    .select(PROJECT_QMS_INSPECTION_OVERRIDE_COLUMNS)
    .order("overridden_at");
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as ProjectQmsInspectionOverrideRow[]).map(
      transformProjectQmsInspectionOverrideRow,
    ),
  };
}

// ============================================================================
// Phase 45 — Production Stages (closes the "Production Stage Completions"
// local-only exception). Fetches both project_production_stages and the
// independent production_stage_transactions ledger, joins transactions
// onto their stage in memory, and groups stages by project_id into
// ProjectProduction[] — the exact shape store.ts's projectProductions
// field already expects, so setProjectProductionsFromServer can replace
// it directly with no further transformation at the call site.
// ============================================================================

const PROJECT_PRODUCTION_STAGE_COLUMNS =
  "id, project_id, stage_name, position, status, notes, " +
  "requires_material_tracking, sent_qty, received_qty, ok_qty, rejected_qty, " +
  "is_rework, reference_stage_id, rework_stage_name, sent_to_vendor_id, " +
  "sent_to_vendor_name, sent_date_time, received_date_time, rework_qty, " +
  "created_at, updated_at";

const PRODUCTION_STAGE_TRANSACTION_COLUMNS =
  "id, stage_id, type, quantity, event_time, vendor_id, vendor_name, created_at";

export async function hydrateProjectProductionStages(): Promise<
  HydrationResult<ProjectProduction[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;

  const { data: stageRows, error: stageError } = await gate.client
    .from("project_production_stages")
    .select(PROJECT_PRODUCTION_STAGE_COLUMNS)
    .order("project_id")
    .order("position");
  if (stageError) return { status: "error", error: stageError.message };

  const { data: txRows, error: txError } = await gate.client
    .from("production_stage_transactions")
    .select(PRODUCTION_STAGE_TRANSACTION_COLUMNS)
    .order("event_time");
  if (txError) return { status: "error", error: txError.message };

  const txByStage = new Map<string, ProductionStageTransactionRow[]>();
  for (const row of txRows as unknown as ProductionStageTransactionRow[]) {
    const list = txByStage.get(row.stage_id) ?? [];
    list.push(row);
    txByStage.set(row.stage_id, list);
  }

  const productionsByProject = new Map<string, ProjectProduction>();
  for (const row of stageRows as unknown as ProjectProductionStageRow[]) {
    const stage = rowToProjectProductionStage(row);
    stage.transactions = (txByStage.get(row.id) ?? []).map(
      rowToStageTransaction,
    );

    const existing = productionsByProject.get(row.project_id);
    if (existing) {
      existing.stages.push(stage);
    } else {
      productionsByProject.set(row.project_id, {
        id: row.project_id, // ProjectProduction.id has no independent DB identity — one row per project, keyed by project_id, matching store.ts's existing local convention (upsertProjectProduction keys off projectId, not id).
        projectId: row.project_id,
        stages: [stage],
        version: "v2",
      });
    }
  }

  return { status: "success", data: Array.from(productionsByProject.values()) };
}
