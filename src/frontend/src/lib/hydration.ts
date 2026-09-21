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

import { getCompanySettingsRemote } from "@/lib/companySettingsApi";
import type { CompanyProfileSettings } from "@/lib/companySettingsApi";
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
import {
  rowToInspectionSheet,
  rowToStageCompletion,
} from "@/lib/qmsInspectionWorkflowApi";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { rowToTool, rowToToolAssignmentHistory } from "@/lib/toolsApi";
import type { QuantityCheckpoint } from "@/qms/lib/quantityInspection";
import type {
  InspectionMode,
  InspectionSheet,
  InspectionStageCompletion,
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
  AssetPhoto,
  AssetUsageEvent,
  AttendanceRecord,
  BillableService,
  BomItem,
  BomRequisition,
  BomRequisitionStatus,
  CompanyDocument,
  CompanyPO,
  CompanyPOItem,
  CompanyPOStatus,
  CourierServiceProvider,
  CustomCostEntry,
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
  EmployeeReward,
  EmployeeType,
  EmploymentType,
  ExpenseFloat,
  ExpenseFloatStatus,
  FinishingItem,
  HardwareItem,
  InternalCosting,
  InvLineItem,
  InventoryItem,
  InventoryPurchase,
  Invoice,
  InvoicePurchaseOrder,
  InvoiceStatus,
  JobCard,
  JobCardException,
  JobCardInspectionEvent,
  JobCardStatus,
  LineItem,
  Machine,
  MachineDie,
  MachineServiceRate,
  MachineServiceUsage,
  MachineSparePart,
  ManualAdjustment,
  ManufacturingItem,
  MasterPO,
  MaterialPurchase,
  MaterialUsage,
  OutsourcedWork,
  POStatus,
  Payable,
  PayablePayment,
  Payment,
  PaymentMode,
  PettyExpense,
  PettyExpenseMode,
  PettyExpenseType,
  Project,
  ProjectActivity,
  ProjectItem,
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
  RawMaterialItem,
  SalaryPayment,
  ScrapRecord,
  ScrapStatus,
  ServiceType,
  Tender,
  TenderRequirement,
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

// Gap-closure fix — every hydrate*() below used to run a single unbounded
// .select(), which silently truncates at Supabase/PostgREST's default
// max-rows (confirmed live: a 2,506-row table returned only 1,000 rows,
// no error, no indication anything was missing). Wrapping the query in
// this instead pages through with .range() until a page comes back
// shorter than PAGE_SIZE, so hydration always returns the organization's
// complete table regardless of size. Every hydrate*() function's own
// contract (read-only, RLS-gated, {status, data, error} shape) is
// unchanged - this only replaces "one request" with "as many ranged
// requests as needed", transparently to every caller.
const PAGE_SIZE = 1000;
// Exported so the write-layer `*Api.ts` files' own "fetch every existing
// document number to compute the next one" collection reads (jobCardsApi.ts,
// invoicesApi.ts, quotationsApi.ts, etc. - found in the same final audit
// that added this export) can reuse it instead of each hand-rolling the
// same loop.
export async function fetchAllRows<T>(
  buildPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildPage(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { data: all, error: null };
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

  const { data, error } = await fetchAllRows((from, to) =>
    client
      .from("employees")
      .select(EMPLOYEE_COLUMNS)
      .order("name")
      .range(from, to),
  );

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

  const { data, error } = await fetchAllRows((from, to) =>
    client
      .from("machines")
      .select(MACHINE_COLUMNS)
      .order("machine_code")
      .range(from, to),
  );

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

  const { data, error } = await fetchAllRows((from, to) =>
    client
      .from("tools")
      .select(TOOL_COLUMNS)
      .order("tool_code")
      .range(from, to),
  );

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

  const { data, error } = await fetchAllRows((from, to) =>
    client
      .from("tool_assignment_history")
      .select(TOOL_ASSIGNMENT_HISTORY_COLUMNS)
      .order("recorded_at", { ascending: false })
      .range(from, to),
  );

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

  const { data, error } = await fetchAllRows((from, to) =>
    client.from("dies").select(DIE_COLUMNS).order("die_code").range(from, to),
  );

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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("machine_spare_parts")
      .select("machine_id, inventory_item_id, created_at")
      .range(from, to),
  );
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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("machine_dies")
      .select("machine_id, die_id, created_at")
      .range(from, to),
  );
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

// Phase 51 (Group 2) — universal asset photo store (see AssetPhoto in
// types.ts for why one shared table covers machine/die/tool/
// inventory_item rather than four). Wholesale-replaced on hydration,
// same as every other org-wide domain list here.
// "project" owner_type + the three processing_*/processed_* columns
// added by supabase/migrations/20260915130000_project_photos.sql
// (Project Photos + Project Cover) - see AssetPhoto in types.ts. NULL
// for every row of every owner_type that never requests AI processing,
// which this phase never does (Phase 2, not implemented yet).
const ASSET_PHOTO_COLUMNS =
  "id, owner_type, owner_id, storage_path, original_filename, mime_type, " +
  "size_bytes, display_order, caption, is_primary, uploaded_by, " +
  "created_at, updated_at, processing_status, processed_storage_path, " +
  "processed_filename, cover_uses_processed, processed_background_color, " +
  "print_selected";

interface AssetPhotoRow {
  id: string;
  owner_type: string;
  owner_id: string;
  storage_path: string;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  display_order: number;
  caption: string | null;
  is_primary: boolean;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  processing_status: string | null;
  processed_storage_path: string | null;
  processed_filename: string | null;
  cover_uses_processed: boolean;
  processed_background_color: string | null;
  print_selected: boolean;
}

function rowToAssetPhoto(row: AssetPhotoRow): AssetPhoto {
  return {
    id: row.id,
    ownerType: row.owner_type as AssetPhoto["ownerType"],
    ownerId: row.owner_id,
    storagePath: row.storage_path,
    originalFilename: row.original_filename ?? undefined,
    mimeType: row.mime_type ?? undefined,
    sizeBytes: row.size_bytes ?? undefined,
    displayOrder: row.display_order,
    caption: row.caption ?? undefined,
    isPrimary: row.is_primary,
    uploadedBy: row.uploaded_by ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    processingStatus:
      (row.processing_status as AssetPhoto["processingStatus"]) ?? undefined,
    processedStoragePath: row.processed_storage_path ?? undefined,
    processedFilename: row.processed_filename ?? undefined,
    coverUsesProcessed: row.cover_uses_processed,
    processedBackgroundColor: row.processed_background_color ?? undefined,
    printSelected: row.print_selected,
  };
}

export async function hydrateAssetPhotos(): Promise<
  HydrationResult<AssetPhoto[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("asset_photos")
      .select(ASSET_PHOTO_COLUMNS)
      .order("display_order")
      .range(from, to),
  );
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as AssetPhotoRow[]).map(rowToAssetPhoto),
  };
}

// Phase 51 (Group 2) — universal asset usage-event log (see
// AssetUsageEvent in types.ts). Insert-only at the RLS level (no update/
// delete policy exists), same wholesale-hydrate-then-filter-client-side
// shape as hydrateToolAssignmentHistory above.
const ASSET_USAGE_EVENT_COLUMNS =
  "id, asset_type, asset_id, employee_id, employee_name, project_id, " +
  "job_card_id, event_type, quantity, condition_before, condition_after, " +
  "notes, recorded_by, event_at, created_at";

interface AssetUsageEventRow {
  id: string;
  asset_type: string;
  asset_id: string;
  employee_id: string | null;
  employee_name: string | null;
  project_id: string | null;
  job_card_id: string | null;
  event_type: string;
  quantity: number | null;
  condition_before: string | null;
  condition_after: string | null;
  notes: string | null;
  recorded_by: string | null;
  event_at: string;
  created_at: string;
}

function rowToAssetUsageEvent(row: AssetUsageEventRow): AssetUsageEvent {
  return {
    id: row.id,
    assetType: row.asset_type as AssetUsageEvent["assetType"],
    assetId: row.asset_id,
    employeeId: row.employee_id ?? undefined,
    employeeName: row.employee_name ?? undefined,
    projectId: row.project_id ?? undefined,
    jobCardId: row.job_card_id ?? undefined,
    eventType: row.event_type as AssetUsageEvent["eventType"],
    quantity: row.quantity ?? undefined,
    conditionBefore: row.condition_before ?? undefined,
    conditionAfter: row.condition_after ?? undefined,
    notes: row.notes ?? undefined,
    recordedBy: row.recorded_by ?? undefined,
    eventAt: new Date(row.event_at).getTime(),
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function hydrateAssetUsageEvents(): Promise<
  HydrationResult<AssetUsageEvent[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("asset_usage_events")
      .select(ASSET_USAGE_EVENT_COLUMNS)
      .order("event_at", { ascending: false })
      .range(from, to),
  );
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as AssetUsageEventRow[]).map(rowToAssetUsageEvent),
  };
}

// Phase 53 (Group 2) — employee_rewards (see EmployeeReward in types.ts).
// Standard insert/select-through-RLS shape, delete also allowed by RLS
// (unlike asset_usage_events) so a mis-entered reward can be removed.
const EMPLOYEE_REWARD_COLUMNS =
  "id, employee_id, reward_type, title, amount, related_job_card_id, " +
  "notes, awarded_by, awarded_at, created_at";

interface EmployeeRewardRow {
  id: string;
  employee_id: string;
  reward_type: string;
  title: string;
  amount: number | null;
  related_job_card_id: string | null;
  notes: string | null;
  awarded_by: string | null;
  awarded_at: string;
  created_at: string;
}

function rowToEmployeeReward(row: EmployeeRewardRow): EmployeeReward {
  return {
    id: row.id,
    employeeId: row.employee_id,
    rewardType: row.reward_type as EmployeeReward["rewardType"],
    title: row.title,
    amount: row.amount ?? undefined,
    relatedJobCardId: row.related_job_card_id ?? undefined,
    notes: row.notes ?? undefined,
    awardedBy: row.awarded_by ?? undefined,
    awardedAt: row.awarded_at,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function hydrateEmployeeRewards(): Promise<
  HydrationResult<EmployeeReward[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("employee_rewards")
      .select(EMPLOYEE_REWARD_COLUMNS)
      .order("awarded_at", { ascending: false })
      .range(from, to),
  );
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as EmployeeRewardRow[]).map(rowToEmployeeReward),
  };
}

// Phase 55 (Group 2) — Company Document Library (see database/phase-55).
const COMPANY_DOCUMENT_COLUMNS =
  "id, category, document_type, title, issue_date, expiry_date, version, " +
  "status, is_tender_eligible, storage_path, original_filename, " +
  "mime_type, size_bytes, notes, uploaded_by, created_at, updated_at";

interface CompanyDocumentRow {
  id: string;
  category: string;
  document_type: string;
  title: string;
  issue_date: string | null;
  expiry_date: string | null;
  version: string | null;
  status: string;
  is_tender_eligible: boolean;
  storage_path: string;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToCompanyDocument(row: CompanyDocumentRow): CompanyDocument {
  return {
    id: row.id,
    category: row.category,
    documentType: row.document_type,
    title: row.title,
    issueDate: row.issue_date ?? undefined,
    expiryDate: row.expiry_date ?? undefined,
    version: row.version ?? undefined,
    status: row.status as CompanyDocument["status"],
    isTenderEligible: row.is_tender_eligible,
    storagePath: row.storage_path,
    originalFilename: row.original_filename ?? undefined,
    mimeType: row.mime_type ?? undefined,
    sizeBytes: row.size_bytes ?? undefined,
    notes: row.notes ?? undefined,
    uploadedBy: row.uploaded_by ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

export async function hydrateCompanyDocuments(): Promise<
  HydrationResult<CompanyDocument[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("company_documents")
      .select(COMPANY_DOCUMENT_COLUMNS)
      .order("expiry_date", { ascending: true, nullsFirst: false })
      .range(from, to),
  );
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as CompanyDocumentRow[]).map(rowToCompanyDocument),
  };
}

// Phase 56 (Group 2) — Tender Management (see database/phase-56).
const TENDER_COLUMNS =
  "id, tender_number, title, customer_id, authority_name, portal, " +
  "bid_type, submission_deadline, opening_date, " +
  "technical_requirements_summary, financial_requirements_summary, " +
  "emd_amount, emd_details, status, source_document_storage_path, " +
  "source_document_filename, final_pack_storage_path, " +
  "final_pack_generated_at, activity_log, created_by, created_at, " +
  "updated_at";

interface TenderRow {
  id: string;
  tender_number: string;
  title: string;
  customer_id: string | null;
  authority_name: string | null;
  portal: string | null;
  bid_type: string | null;
  submission_deadline: string | null;
  opening_date: string | null;
  technical_requirements_summary: string | null;
  financial_requirements_summary: string | null;
  emd_amount: number | null;
  emd_details: string | null;
  status: string;
  source_document_storage_path: string | null;
  source_document_filename: string | null;
  final_pack_storage_path: string | null;
  final_pack_generated_at: string | null;
  activity_log: ProjectActivity[] | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTender(row: TenderRow): Tender {
  return {
    id: row.id,
    tenderNumber: row.tender_number,
    title: row.title,
    customerId: row.customer_id ?? undefined,
    authorityName: row.authority_name ?? undefined,
    portal: row.portal ?? undefined,
    bidType: row.bid_type ?? undefined,
    submissionDeadline: row.submission_deadline ?? undefined,
    openingDate: row.opening_date ?? undefined,
    technicalRequirementsSummary:
      row.technical_requirements_summary ?? undefined,
    financialRequirementsSummary:
      row.financial_requirements_summary ?? undefined,
    emdAmount: row.emd_amount ?? undefined,
    emdDetails: row.emd_details ?? undefined,
    status: row.status as Tender["status"],
    sourceDocumentStoragePath: row.source_document_storage_path ?? undefined,
    sourceDocumentFilename: row.source_document_filename ?? undefined,
    finalPackStoragePath: row.final_pack_storage_path ?? undefined,
    finalPackGeneratedAt: row.final_pack_generated_at
      ? new Date(row.final_pack_generated_at).getTime()
      : undefined,
    activityLog: row.activity_log ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

export async function hydrateTenders(): Promise<HydrationResult<Tender[]>> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("tenders")
      .select(TENDER_COLUMNS)
      .order("submission_deadline", { ascending: true, nullsFirst: false })
      .range(from, to),
  );
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as TenderRow[]).map(rowToTender),
  };
}

const TENDER_REQUIREMENT_COLUMNS =
  "id, tender_id, requirement_text, category, is_mandatory, priority, " +
  "status, matched_company_document_id, matched_document_title, " +
  "matched_document_expiry, action_needed, display_order, created_at, " +
  "updated_at";

interface TenderRequirementRow {
  id: string;
  tender_id: string;
  requirement_text: string;
  category: string;
  is_mandatory: boolean;
  priority: number;
  status: string;
  matched_company_document_id: string | null;
  matched_document_title: string | null;
  matched_document_expiry: string | null;
  action_needed: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

function rowToTenderRequirement(row: TenderRequirementRow): TenderRequirement {
  return {
    id: row.id,
    tenderId: row.tender_id,
    requirementText: row.requirement_text,
    category: row.category as TenderRequirement["category"],
    isMandatory: row.is_mandatory,
    priority: row.priority,
    status: row.status as TenderRequirement["status"],
    matchedCompanyDocumentId: row.matched_company_document_id ?? undefined,
    matchedDocumentTitle: row.matched_document_title ?? undefined,
    matchedDocumentExpiry: row.matched_document_expiry ?? undefined,
    actionNeeded: row.action_needed ?? undefined,
    displayOrder: row.display_order,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

export async function hydrateTenderRequirements(): Promise<
  HydrationResult<TenderRequirement[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("tender_requirements")
      .select(TENDER_REQUIREMENT_COLUMNS)
      .order("display_order", { ascending: true })
      .range(from, to),
  );
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as TenderRequirementRow[]).map(
      rowToTenderRequirement,
    ),
  };
}

// Phase 19 — Customers. Exact column list per the Phase 19 report's
// field-by-field mapping. organization_id/updated_at are DB-only,
// deliberately not requested (no frontend counterpart).
const CUSTOMER_COLUMNS =
  "id, name, contact_person, phone, email, address, gstin, state_name, " +
  "state_code, additional_details, emails, primary_email, " +
  "delivery_addresses, created_at";

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
  delivery_addresses: Array<{
    id: string;
    label: string;
    address: string;
  }> | null;
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
    deliveryAddresses: row.delivery_addresses ?? undefined,
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

  const { data, error } = await fetchAllRows((from, to) =>
    client
      .from("customers")
      .select(CUSTOMER_COLUMNS)
      .order("name")
      .range(from, to),
  );

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

  const { data, error } = await fetchAllRows((from, to) =>
    client
      .from("inventory_items")
      .select(INVENTORY_ITEM_COLUMNS)
      .order("name")
      .range(from, to),
  );

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

  const { data, error } = await fetchAllRows((from, to) =>
    client.from("vendors").select(VENDOR_COLUMNS).order("name").range(from, to),
  );

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

  const { data, error } = await fetchAllRows((from, to) =>
    client
      .from("company_pos")
      .select(COMPANY_PO_COLUMNS)
      .order("created_at")
      .range(from, to),
  );

  if (error) {
    return { status: "error", error: error.message };
  }

  return {
    status: "success",
    data: (data as unknown as CompanyPORow[]).map(transformCompanyPORow),
  };
}

// Phase M.1 — Payables. paid_amount is trigger-derived (see
// database/phase-m1/) — hydrated as-is, never recomputed here.
export const PAYABLE_COLUMNS =
  "id, vendor_name, payment_type, total_amount, paid_amount, due_date, " +
  "vendor_id, project_id, company_po_id, notes, created_at";

export interface PayableRow {
  id: string;
  vendor_name: string;
  payment_type: string;
  total_amount: number;
  paid_amount: number;
  due_date: string | null;
  vendor_id: string | null;
  project_id: string | null;
  company_po_id: string | null;
  notes: string | null;
  created_at: string;
}

export function transformPayableRow(row: PayableRow): Payable {
  return {
    id: row.id,
    vendorName: row.vendor_name,
    paymentType: row.payment_type,
    totalAmount: row.total_amount,
    paidAmount: row.paid_amount,
    dueDate: row.due_date ?? "",
    vendorId: row.vendor_id ?? undefined,
    projectId: row.project_id ?? undefined,
    companyPoId: row.company_po_id ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function hydratePayables(): Promise<HydrationResult<Payable[]>> {
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

  const { data, error } = await fetchAllRows((from, to) =>
    client
      .from("payables")
      .select(PAYABLE_COLUMNS)
      .order("created_at")
      .range(from, to),
  );

  if (error) {
    return { status: "error", error: error.message };
  }

  return {
    status: "success",
    data: (data as unknown as PayableRow[]).map(transformPayableRow),
  };
}

export const PAYABLE_PAYMENT_COLUMNS =
  "id, payable_id, amount, payment_date, mode, reference_no, notes, " +
  "attachment_ref, attachment_type, attachment_name, created_at";

export interface PayablePaymentRow {
  id: string;
  payable_id: string;
  amount: number;
  payment_date: string;
  mode: string;
  reference_no: string | null;
  notes: string | null;
  attachment_ref: string | null;
  attachment_type: string | null;
  attachment_name: string | null;
  created_at: string;
}

export function transformPayablePaymentRow(
  row: PayablePaymentRow,
): PayablePayment {
  return {
    id: row.id,
    payableId: row.payable_id,
    amount: row.amount,
    paymentDate: row.payment_date,
    mode: row.mode as PayablePayment["mode"],
    referenceNo: row.reference_no ?? "",
    notes: row.notes ?? "",
    attachmentRef: row.attachment_ref ?? undefined,
    attachmentType:
      (row.attachment_type as "image" | "pdf" | null) ?? undefined,
    attachmentName: row.attachment_name ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function hydratePayablePayments(): Promise<
  HydrationResult<PayablePayment[]>
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

  const { data, error } = await fetchAllRows((from, to) =>
    client
      .from("payable_payments")
      .select(PAYABLE_PAYMENT_COLUMNS)
      .order("created_at")
      .range(from, to),
  );

  if (error) {
    return { status: "error", error: error.message };
  }

  return {
    status: "success",
    data: (data as unknown as PayablePaymentRow[]).map(
      transformPayablePaymentRow,
    ),
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
  "activity_log, planned_start_date, actual_production_start_date, " +
  "target_completion_date, customer_committed_delivery_date, " +
  "actual_completion_date, work_type, lifecycle_stage, material_ownership, " +
  "ordered_quantity, planned_quantity, received_quantity, produced_quantity, " +
  "accepted_quantity, rejected_quantity, rework_quantity, returned_quantity, " +
  "remaining_quantity, overproduction_quantity";

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
  planned_start_date: string | null;
  actual_production_start_date: string | null;
  target_completion_date: string | null;
  customer_committed_delivery_date: string | null;
  actual_completion_date: string | null;
  // Phase 57 (Group 2, Master Monster Prompt)
  work_type: string | null;
  lifecycle_stage: string | null;
  material_ownership: string | null;
  ordered_quantity: number | null;
  planned_quantity: number | null;
  received_quantity: number | null;
  produced_quantity: number | null;
  accepted_quantity: number | null;
  rejected_quantity: number | null;
  rework_quantity: number | null;
  returned_quantity: number | null;
  remaining_quantity: number | null;
  overproduction_quantity: number | null;
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
    plannedStartDate: row.planned_start_date ?? undefined,
    actualProductionStartDate: row.actual_production_start_date ?? undefined,
    targetCompletionDate: row.target_completion_date ?? undefined,
    customerCommittedDeliveryDate:
      row.customer_committed_delivery_date ?? undefined,
    actualCompletionDate: row.actual_completion_date ?? undefined,
    workType: (row.work_type as Project["workType"]) ?? undefined,
    lifecycleStage:
      (row.lifecycle_stage as Project["lifecycleStage"]) ?? undefined,
    materialOwnership:
      (row.material_ownership as Project["materialOwnership"]) ?? undefined,
    orderedQuantity: row.ordered_quantity ?? undefined,
    plannedQuantity: row.planned_quantity ?? undefined,
    receivedQuantity: row.received_quantity ?? undefined,
    producedQuantity: row.produced_quantity ?? undefined,
    acceptedQuantity: row.accepted_quantity ?? undefined,
    rejectedQuantity: row.rejected_quantity ?? undefined,
    reworkQuantity: row.rework_quantity ?? undefined,
    returnedQuantity: row.returned_quantity ?? undefined,
    remainingQuantity: row.remaining_quantity ?? undefined,
    overproductionQuantity: row.overproduction_quantity ?? undefined,
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

  const { data, error } = await fetchAllRows((from, to) =>
    client
      .from("projects")
      .select(PROJECT_COLUMNS)
      .order("created_at")
      .range(from, to),
  );

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

  const { data, error } = await fetchAllRows((from, to) =>
    client
      .from("outsourced_works")
      .select(OUTSOURCED_WORK_COLUMNS)
      .order("created_at")
      .range(from, to),
  );

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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("advance_records")
      .select(ADVANCE_RECORD_COLUMNS)
      .order("date")
      .range(from, to),
  );
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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("attendance_records")
      .select(ATTENDANCE_RECORD_COLUMNS)
      .order("date")
      .range(from, to),
  );
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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("employee_documents")
      .select(EMPLOYEE_DOCUMENT_COLUMNS)
      .order("uploaded_at")
      .range(from, to),
  );
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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("salary_payments")
      .select(SALARY_PAYMENT_COLUMNS)
      .order("payment_date")
      .range(from, to),
  );
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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("inventory_purchases")
      .select(INVENTORY_PURCHASE_COLUMNS)
      .order("created_at")
      .range(from, to),
  );
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as InventoryPurchaseRow[]).map(
      transformInventoryPurchaseRow,
    ),
  };
}

// Monster-1 — Material Purchases (ProjectDetail.tsx's per-project material
// log) was 100% local-only despite record_material_purchase() already
// existing, tested, and correctly writing into this exact table with
// project_id/thickness set (see database/phase-11/phase11_completion_report.md
// — that RPC's whole design is "match addMaterialPurchase() exactly", it
// just never got called from the frontend). Same table as
// hydrateInventoryPurchases above, disjoint slice: project_id IS NOT NULL
// selects the project-scoped rows record_material_purchase() creates,
// leaving general inventory purchases (project_id IS NULL) untouched and
// exactly as hydrateInventoryPurchases already reads them.
const MATERIAL_PURCHASE_COLUMNS =
  "id, project_id, inventory_item_id, material_name, thickness, quantity, " +
  "unit_cost, supplier_name, vendor_id, purchase_date, attachments, created_at";

export interface MaterialPurchaseRow {
  id: string;
  project_id: string | null;
  inventory_item_id: string | null;
  material_name: string | null;
  thickness: string | null;
  quantity: number | null;
  unit_cost: number | null;
  supplier_name: string | null;
  vendor_id: string | null;
  purchase_date: string | null;
  attachments: PurchaseAttachment[] | null;
  created_at: string;
}

export function transformMaterialPurchaseRow(
  row: MaterialPurchaseRow,
): MaterialPurchase {
  return {
    id: row.id,
    projectId: row.project_id ?? "",
    inventoryItemId: row.inventory_item_id ?? undefined,
    materialType: row.material_name ?? "",
    thickness: row.thickness ?? "",
    quantity: row.quantity ?? 0,
    // record_material_purchase() has no separate "unit" param — the RPC
    // stores it via inventory_items.unit, not on the purchase row itself;
    // unit_cost is genuinely unused here (this domain never tracks cost)
    // and deliberately not read into MaterialPurchase, which has no such
    // field.
    unit: undefined,
    supplierName: row.supplier_name ?? "",
    vendorId: row.vendor_id ?? undefined,
    purchaseDate: row.purchase_date ?? "",
    attachments: row.attachments ?? undefined,
  };
}

export async function hydrateMaterialPurchases(): Promise<
  HydrationResult<MaterialPurchase[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("inventory_purchases")
      .select(MATERIAL_PURCHASE_COLUMNS)
      .not("project_id", "is", null)
      .order("created_at")
      .range(from, to),
  );
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as MaterialPurchaseRow[]).map(
      transformMaterialPurchaseRow,
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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("inventory_usages")
      .select(INVENTORY_USAGE_COLUMNS)
      .order("created_at")
      .range(from, to),
  );
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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("project_bom_items")
      .select(BOM_ITEM_COLUMNS)
      .order("created_at")
      .range(from, to),
  );
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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("bom_requisitions")
      .select(BOM_REQUISITION_COLUMNS)
      .order("created_at")
      .range(from, to),
  );
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as BomRequisitionRow[]).map(
      transformBomRequisitionRow,
    ),
  };
}

// scrap_records (Monster-1) — projectName is deliberately left for the
// caller to resolve from projectId (see store.ts's setScrapRecordsFromServer
// call site), same convention as every other project-referencing domain
// hydrated in this file.
export interface ScrapRecordRow {
  id: string;
  project_id: string | null;
  stage: string | null;
  material_type: string;
  unit: string;
  generated_qty: number;
  reusable_qty: number;
  sold_qty: number;
  disposed_qty: number;
  scrap_value: number | null;
  status: string;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
}

const SCRAP_RECORD_COLUMNS =
  "id, project_id, stage, material_type, unit, generated_qty, reusable_qty, " +
  "sold_qty, disposed_qty, scrap_value, status, notes, recorded_by, created_at";

export function transformScrapRecordRow(row: ScrapRecordRow): ScrapRecord {
  return {
    id: row.id,
    projectId: row.project_id ?? undefined,
    stage: row.stage ?? undefined,
    materialType: row.material_type,
    unit: row.unit,
    generatedQty: row.generated_qty,
    reusableQty: row.reusable_qty,
    soldQty: row.sold_qty,
    disposedQty: row.disposed_qty,
    scrapValue: row.scrap_value ?? undefined,
    status: row.status as ScrapStatus,
    notes: row.notes ?? undefined,
    recordedBy: row.recorded_by ?? "",
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function hydrateScrapRecords(): Promise<
  HydrationResult<ScrapRecord[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("scrap_records")
      .select(SCRAP_RECORD_COLUMNS)
      .order("created_at")
      .range(from, to),
  );
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as ScrapRecordRow[]).map(transformScrapRecordRow),
  };
}

// project_items (Monster-2, "Items" tab).
export interface ProjectItemRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  unit: string | null;
  unit_price: number | null;
  status: string;
  created_at: string;
}

const PROJECT_ITEM_COLUMNS =
  "id, project_id, name, description, unit, unit_price, status, created_at";

export function transformProjectItemRow(row: ProjectItemRow): ProjectItem {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description ?? undefined,
    unit: row.unit ?? undefined,
    unitPrice: row.unit_price ?? undefined,
    status: row.status as ProjectItem["status"],
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function hydrateProjectItems(): Promise<
  HydrationResult<ProjectItem[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("project_items")
      .select(PROJECT_ITEM_COLUMNS)
      .order("created_at")
      .range(from, to),
  );
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as ProjectItemRow[]).map(transformProjectItemRow),
  };
}

// internal_costings (Monster-2, "Internal Costing" tab) — one row per
// project (UNIQUE project_id).
export interface InternalCostingRow {
  id: string;
  project_id: string;
  raw_material_cost: number;
  cnc_cost: number;
  hardware_cost: number;
  powder_coating_cost: number;
  assembly_cost: number;
  packing_cost: number;
  labour_cost: number | null;
  transport_cost: number | null;
  machine_cost: number | null;
  outsource_cost: number | null;
  consumables_cost: number | null;
  electricity_cost: number | null;
  scrap_loss_cost: number | null;
  extra_costs: CustomCostEntry[] | null;
  manual_adjustments: ManualAdjustment[] | null;
  // Repeatable line items (Master ERP Architecture, Phase 1 / internal
  // costing line items) — were missing from this app-boot hydration path
  // entirely, so a full page reload silently dropped every saved Raw
  // Material/Hardware/Manufacturing/Finishing row even though it was
  // correctly persisted in Supabase (internalCostingApi.ts's own
  // upsert-response mapping already included these; only this
  // separate reload-time read path did not).
  raw_materials: RawMaterialItem[] | null;
  hardware_items: HardwareItem[] | null;
  manufacturing_items: ManufacturingItem[] | null;
  finishing_items: FinishingItem[] | null;
}

const INTERNAL_COSTING_COLUMNS =
  "id, project_id, raw_material_cost, cnc_cost, hardware_cost, " +
  "powder_coating_cost, assembly_cost, packing_cost, labour_cost, " +
  "transport_cost, machine_cost, outsource_cost, consumables_cost, " +
  "electricity_cost, scrap_loss_cost, extra_costs, manual_adjustments, " +
  "raw_materials, hardware_items, manufacturing_items, finishing_items";

export function transformInternalCostingRow(
  row: InternalCostingRow,
): InternalCosting {
  return {
    id: row.id,
    projectId: row.project_id,
    rawMaterialCost: row.raw_material_cost,
    cncCost: row.cnc_cost,
    hardwareCost: row.hardware_cost,
    powderCoatingCost: row.powder_coating_cost,
    assemblyCost: row.assembly_cost,
    packingCost: row.packing_cost,
    labourCost: row.labour_cost ?? undefined,
    transportCost: row.transport_cost ?? undefined,
    machineCost: row.machine_cost ?? undefined,
    outsourceCost: row.outsource_cost ?? undefined,
    consumablesCost: row.consumables_cost ?? undefined,
    electricityCost: row.electricity_cost ?? undefined,
    scrapLossCost: row.scrap_loss_cost ?? undefined,
    extraCosts: row.extra_costs ?? undefined,
    manualAdjustments: row.manual_adjustments ?? undefined,
    rawMaterials: row.raw_materials ?? undefined,
    hardwareItems: row.hardware_items ?? undefined,
    manufacturingItems: row.manufacturing_items ?? undefined,
    finishingItems: row.finishing_items ?? undefined,
  };
}

export async function hydrateInternalCostings(): Promise<
  HydrationResult<InternalCosting[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("internal_costings")
      .select(INTERNAL_COSTING_COLUMNS)
      .range(from, to),
  );
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as InternalCostingRow[]).map(
      transformInternalCostingRow,
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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("project_employees")
      .select("project_id, employee_id")
      .range(from, to),
  );
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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("project_machinery")
      .select("project_id, machine_id")
      .range(from, to),
  );
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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("project_dies")
      .select("project_id, die_id")
      .range(from, to),
  );
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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("billable_services")
      .select(BILLABLE_SERVICE_COLUMNS)
      .order("name")
      .range(from, to),
  );
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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("machine_service_rate_history")
      .select(RATE_HISTORY_COLUMNS)
      .order("effective_from")
      .range(from, to),
  );
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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("machine_service_usage")
      .select(USAGE_COLUMNS)
      .order("usage_date", { ascending: false })
      .range(from, to),
  );
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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("quotations")
      .select(QUOTATION_COLUMNS)
      .order("created_at")
      .range(from, to),
  );
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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("quotation_revisions")
      .select(QUOTATION_REVISION_COLUMNS)
      .order("created_at")
      .range(from, to),
  );
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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("master_pos")
      .select(MASTER_PO_COLUMNS)
      .order("created_at")
      .range(from, to),
  );
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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("quotation_purchase_orders")
      .select(QUOTATION_PURCHASE_ORDER_COLUMNS)
      .order("created_at")
      .range(from, to),
  );
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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("project_purchase_orders")
      .select(PROJECT_PURCHASE_ORDER_COLUMNS)
      .order("created_at")
      .range(from, to),
  );
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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("expense_floats")
      .select(EXPENSE_FLOAT_COLUMNS)
      .order("created_at")
      .range(from, to),
  );
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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("petty_expenses")
      .select(PETTY_EXPENSE_COLUMNS)
      .order("created_at")
      .range(from, to),
  );
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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("delivery_challans")
      .select(DELIVERY_CHALLAN_COLUMNS)
      .order("created_at")
      .range(from, to),
  );
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
  "reminder_count, next_reminder_custom_date, selected_email, " +
  "eway_bill_document, terms_and_conditions, created_at";

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

// Invoice multi-PO feature (see chat) — Phase 48.
export const INVOICE_PO_COLUMNS =
  "id, invoice_id, quotation_purchase_order_id, po_number, po_date, created_at";

export interface InvoicePurchaseOrderRow {
  id: string;
  invoice_id: string;
  quotation_purchase_order_id: string | null;
  po_number: string;
  po_date: string | null;
  created_at: string;
}

export function transformInvoicePORow(
  row: InvoicePurchaseOrderRow,
): InvoicePurchaseOrder {
  return {
    id: row.id,
    poNumber: row.po_number,
    poDate: row.po_date ?? undefined,
    quotationPurchaseOrderId: row.quotation_purchase_order_id ?? undefined,
  };
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
  eway_bill_document: PurchaseAttachment | null;
  terms_and_conditions: string | null;
  created_at: string;
  invoice_items?: InvoiceItemRow[];
  invoice_purchase_orders?: InvoicePurchaseOrderRow[];
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
    purchaseOrders: [...(row.invoice_purchase_orders ?? [])]
      .sort((a, b) =>
        a.created_at === b.created_at
          ? a.id.localeCompare(b.id)
          : a.created_at.localeCompare(b.created_at),
      )
      .map(transformInvoicePORow),
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
    ewayBillDocument: row.eway_bill_document ?? undefined,
    termsAndConditions: row.terms_and_conditions ?? undefined,
  };
}

export async function hydrateInvoices(): Promise<HydrationResult<Invoice[]>> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("invoices")
      .select(
        `${INVOICE_COLUMNS}, invoice_items(${INVOICE_ITEM_COLUMNS}), invoice_purchase_orders(${INVOICE_PO_COLUMNS})`,
      )
      .order("created_at")
      .range(from, to),
  );
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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("payments")
      .select(PAYMENT_COLUMNS)
      .order("created_at")
      .range(from, to),
  );
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as PaymentRow[]).map(transformPaymentRow),
  };
}

// Job Cards feature (see chat) — Phase 49. expected_quantity and
// actual_time_spent_minutes are Postgres GENERATED columns, read here
// exactly like any other column - never computed client-side, so they
// can never drift from the server's own calculation.
// Split in two (see chat, Job Card Sign-off correction pass) so
// createJobCardRemote/updateJobCardRemote can always write+read the
// CORE columns (everything through the already-applied migration
// 20260917100000) and treat the SIGNOFF columns (migration
// 20260917180000 — prepared_by_*/assigned_by_*/in_process_check_*/
// qc_approved_by_*/completed_document_*, NOT yet applied/authorized) as
// a separate, best-effort second write — Create/Edit must never fail
// just because that second migration hasn't been applied yet.
// Inspection EVENTS are deliberately NOT a job_cards column at all
// (never were, in the corrected design) — they live in the real child
// table job_card_inspection_events, read via
// fetchJobCardInspectionEvents() below. work_center_machine_id/
// work_center_name are deliberately NOT listed here at all anymore
// (see chat, Work Center removal) — the columns stay in the live
// database (nothing else depends on them, confirmed, but dropping them
// isn't required to remove the feature), the frontend simply stops
// reading/writing them.
export const JOB_CARD_CORE_COLUMNS =
  "id, job_no, project_id, employee_id, employee_name, job_description, " +
  "operation_type, standard_time_per_unit_minutes, allocated_time_minutes, " +
  "expected_quantity, actual_completed_qty, rejected_qty, rework_qty, " +
  "reject_root_cause, stage_id, " +
  "start_time, end_time, actual_time_spent_minutes, active_seconds, " +
  "current_run_started_at, status, notes, " +
  "reference_photo_id, print_reference_photo, print_drawing, " +
  "total_quantity, expected_quantity_override, inspection_plan, " +
  "priority, start_date, " +
  "created_at, updated_at";

export const JOB_CARD_SIGNOFF_COLUMNS =
  "prepared_by_id, prepared_by_name, " +
  "assigned_by_employee_id, assigned_by_employee_name, " +
  "in_process_check_employee_id, in_process_check_employee_name, " +
  "qc_approved_by_employee_id, qc_approved_by_employee_name, " +
  "completed_document_storage_path, completed_document_filename, " +
  "completed_document_mime_type, completed_document_size_bytes, " +
  "completed_document_uploaded_by, completed_document_uploaded_by_name, " +
  "completed_document_uploaded_at";

export const JOB_CARD_COLUMNS = `${JOB_CARD_CORE_COLUMNS}, ${JOB_CARD_SIGNOFF_COLUMNS}`;

export interface JobCardRow {
  id: string;
  job_no: string;
  project_id: string;
  employee_id: string | null;
  employee_name: string;
  job_description: string;
  operation_type: string;
  standard_time_per_unit_minutes: number;
  allocated_time_minutes: number;
  expected_quantity: number;
  actual_completed_qty: number;
  rejected_qty: number;
  rework_qty: number;
  reject_root_cause: string | null;
  stage_id: string | null;
  start_time: string | null;
  end_time: string | null;
  actual_time_spent_minutes: number | null;
  active_seconds: number;
  current_run_started_at: string | null;
  status: string;
  notes: string | null;
  reference_photo_id: string | null;
  print_reference_photo: boolean;
  print_drawing: boolean;
  total_quantity: number | null;
  expected_quantity_override: number | null;
  inspection_plan: Array<{
    id?: string;
    label: string;
    triggerQty: number;
    cumulativeQty: number;
    sampleQty: number;
    source?: string;
  }> | null;
  priority: string;
  start_date: string | null;
  // Sign-off columns (database/20260917180000, applied) — optional here
  // since older cached rows may omit them; transformJobCardRow's own
  // `??` handling treats absent exactly like null.
  prepared_by_id?: string | null;
  prepared_by_name?: string | null;
  assigned_by_employee_id?: string | null;
  assigned_by_employee_name?: string | null;
  in_process_check_employee_id?: string | null;
  in_process_check_employee_name?: string | null;
  qc_approved_by_employee_id?: string | null;
  qc_approved_by_employee_name?: string | null;
  completed_document_storage_path?: string | null;
  completed_document_filename?: string | null;
  completed_document_mime_type?: string | null;
  completed_document_size_bytes?: number | null;
  completed_document_uploaded_by?: string | null;
  completed_document_uploaded_by_name?: string | null;
  completed_document_uploaded_at?: string | null;
  created_at: string;
  updated_at: string;
}

export function transformJobCardRow(row: JobCardRow): JobCard {
  return {
    id: row.id,
    jobNo: row.job_no,
    projectId: row.project_id,
    employeeId: row.employee_id ?? undefined,
    employeeName: row.employee_name,
    jobDescription: row.job_description,
    operationType: row.operation_type,
    standardTimePerUnitMinutes: row.standard_time_per_unit_minutes,
    allocatedTimeMinutes: row.allocated_time_minutes,
    expectedQuantity: row.expected_quantity,
    actualCompletedQty: row.actual_completed_qty,
    rejectedQty: row.rejected_qty,
    reworkQty: row.rework_qty,
    rejectRootCause:
      (row.reject_root_cause as JobCard["rejectRootCause"]) ?? undefined,
    stageId: row.stage_id ?? undefined,
    startTime: row.start_time ?? undefined,
    endTime: row.end_time ?? undefined,
    actualTimeSpentMinutes: row.actual_time_spent_minutes ?? undefined,
    activeSeconds: row.active_seconds ?? 0,
    currentRunStartedAt: row.current_run_started_at ?? undefined,
    status: (row.status as JobCardStatus | null) ?? "NotStarted",
    notes: row.notes ?? undefined,
    referencePhotoId: row.reference_photo_id ?? undefined,
    printReferencePhoto: row.print_reference_photo ?? false,
    printDrawing: row.print_drawing ?? false,
    totalQuantity: row.total_quantity ?? undefined,
    expectedQuantityOverride: row.expected_quantity_override ?? undefined,
    inspectionPlan: (row.inspection_plan ?? []).map((r, i) => ({
      id: r.id ?? `${row.id}-insp-${i}`,
      label: r.label,
      triggerQty: r.triggerQty,
      cumulativeQty: r.cumulativeQty,
      sampleQty: r.sampleQty,
      source:
        (r.source as JobCard["inspectionPlan"][number]["source"]) ?? "manual",
    })),
    priority: (row.priority as JobCard["priority"]) ?? "Normal",
    startDate: row.start_date ?? undefined,
    preparedById: row.prepared_by_id ?? undefined,
    preparedByName: row.prepared_by_name ?? undefined,
    assignedByEmployeeId: row.assigned_by_employee_id ?? undefined,
    assignedByEmployeeName: row.assigned_by_employee_name ?? undefined,
    inProcessCheckEmployeeId: row.in_process_check_employee_id ?? undefined,
    inProcessCheckEmployeeName: row.in_process_check_employee_name ?? undefined,
    qcApprovedByEmployeeId: row.qc_approved_by_employee_id ?? undefined,
    qcApprovedByEmployeeName: row.qc_approved_by_employee_name ?? undefined,
    completedDocumentStoragePath:
      row.completed_document_storage_path ?? undefined,
    completedDocumentFilename: row.completed_document_filename ?? undefined,
    completedDocumentMimeType: row.completed_document_mime_type ?? undefined,
    completedDocumentSizeBytes: row.completed_document_size_bytes ?? undefined,
    completedDocumentUploadedBy:
      row.completed_document_uploaded_by ?? undefined,
    completedDocumentUploadedByName:
      row.completed_document_uploaded_by_name ?? undefined,
    completedDocumentUploadedAt: row.completed_document_uploaded_at
      ? new Date(row.completed_document_uploaded_at).getTime()
      : undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

// ── Job Card Inspection Events (database/20260917180000, NOT YET
// APPLIED) — the checkpoint EXECUTION log's real child table, replacing
// the originally-designed job_cards.inspection_events jsonb column (see
// that migration's own header for the full "why"). A real, insert-only
// table, not queried via JOB_CARD_COLUMNS at all — fetched separately
// per Job Card by fetchJobCardInspectionEvents() in jobCardsApi.ts. ────

export const JOB_CARD_INSPECTION_EVENT_COLUMNS =
  "id, job_card_id, checkpoint_id, checkpoint_label, checkpoint_qty, " +
  "source, result, inspected_by, inspected_by_name, remarks, " +
  "inspected_at, created_at";

export interface JobCardInspectionEventRow {
  id: string;
  job_card_id: string;
  checkpoint_id: string;
  checkpoint_label: string;
  checkpoint_qty: number;
  source: string;
  result: string;
  inspected_by: string | null;
  inspected_by_name: string | null;
  remarks: string | null;
  inspected_at: string;
  created_at: string;
}

export function transformJobCardInspectionEventRow(
  row: JobCardInspectionEventRow,
): JobCardInspectionEvent {
  return {
    id: row.id,
    jobCardId: row.job_card_id,
    checkpointId: row.checkpoint_id,
    checkpointLabel: row.checkpoint_label,
    checkpointQty: row.checkpoint_qty,
    source: row.source as JobCardInspectionEvent["source"],
    result: row.result as JobCardInspectionEvent["result"],
    inspectedBy: row.inspected_by ?? undefined,
    inspectedByName: row.inspected_by_name ?? undefined,
    remarks: row.remarks ?? undefined,
    inspectedAt: new Date(row.inspected_at).getTime(),
  };
}

// ── Job Card Exceptions (database/phase-58) ─────────────────────────────

export const JOB_CARD_EXCEPTION_COLUMNS =
  "id, job_card_id, reason_type, description, status, reported_by, " +
  "reported_at, approved_by, approved_at, approval_notes, created_at";

export interface JobCardExceptionRow {
  id: string;
  job_card_id: string;
  reason_type: string;
  description: string | null;
  status: string;
  reported_by: string | null;
  reported_at: string;
  approved_by: string | null;
  approved_at: string | null;
  approval_notes: string | null;
  created_at: string;
}

export function transformJobCardExceptionRow(
  row: JobCardExceptionRow,
): JobCardException {
  return {
    id: row.id,
    jobCardId: row.job_card_id,
    reasonType: row.reason_type as JobCardException["reasonType"],
    description: row.description ?? undefined,
    status: row.status as JobCardException["status"],
    reportedBy: row.reported_by ?? undefined,
    reportedAt: new Date(row.reported_at).getTime(),
    approvedBy: row.approved_by ?? undefined,
    approvedAt: row.approved_at
      ? new Date(row.approved_at).getTime()
      : undefined,
    approvalNotes: row.approval_notes ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function hydrateJobCardExceptions(): Promise<
  HydrationResult<JobCardException[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("job_card_exceptions")
      .select(JOB_CARD_EXCEPTION_COLUMNS)
      .order("reported_at", { ascending: false })
      .range(from, to),
  );
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as JobCardExceptionRow[]).map(
      transformJobCardExceptionRow,
    ),
  };
}

export async function hydrateJobCards(): Promise<HydrationResult<JobCard[]>> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("job_cards")
      .select(JOB_CARD_COLUMNS)
      .order("created_at")
      .range(from, to),
  );
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as JobCardRow[]).map(transformJobCardRow),
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
  "created_by_name, created_at, updated_at, inspection_frequency_qty, " +
  "quantity_checkpoints";

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
  // Quantity-based inspection (Master ERP Architecture, Part 3) —
  // additive; both are absent/empty for every inspection created before
  // this column existed, which is exactly "no quantity checkpoints,
  // plain pass/fail" (see qms/lib/quantityInspection.ts's own header).
  inspection_frequency_qty: number | null;
  quantity_checkpoints: QuantityCheckpoint[] | null;
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
    inspectionFrequencyQty: row.inspection_frequency_qty ?? undefined,
    quantityCheckpoints: row.quantity_checkpoints ?? undefined,
  };
}

export async function hydrateProjectQmsInspections(): Promise<
  HydrationResult<ProjectQmsInspection[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("project_qms_inspections")
      .select(PROJECT_QMS_INSPECTION_COLUMNS)
      .order("created_at")
      .range(from, to),
  );
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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("project_qms_inspection_characteristics")
      .select(PROJECT_QMS_INSPECTION_CHARACTERISTIC_COLUMNS)
      .order("sequence")
      .range(from, to),
  );
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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("project_qms_inspection_attempts")
      .select(PROJECT_QMS_INSPECTION_ATTEMPT_COLUMNS)
      .order("round_number")
      .range(from, to),
  );
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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("project_qms_inspection_attempt_photos")
      .select(PROJECT_QMS_INSPECTION_ATTEMPT_PHOTO_COLUMNS)
      .in("attempt_id", attemptIds)
      .order("uploaded_at")
      .range(from, to),
  );
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
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("project_qms_inspection_overrides")
      .select(PROJECT_QMS_INSPECTION_OVERRIDE_COLUMNS)
      .order("overridden_at")
      .range(from, to),
  );
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as ProjectQmsInspectionOverrideRow[]).map(
      transformProjectQmsInspectionOverrideRow,
    ),
  };
}

// ============================================================================
// Phase P1.1 — QMS Inspection Sheets (inspection_sheets, qms_stage_completions).
// qms/api/inspections.ts and lib/qmsInspectionWorkflowApi.ts were already
// Supabase-backed before this phase (qms/db/repositories.ts swaps the 5
// per-sheet repo exports to the Supabase adapters — inspections.ts itself
// needed zero changes). This section only adds proactive app-boot
// hydration into useQmsStore's existing inspectionSheets/stageCompletions
// fields, matching the same bulk-array pattern used for every other
// Supabase-backed list in this app — useQmsStore's own loadInspectionSheets/
// loadStageCompletions() still exist unchanged and still work exactly as
// before (they unconditionally overwrite the same fields), so hydration
// only means the data may already be populated before a user first
// navigates to a QMS page, never a source of conflict.
//
// inspection_stage_entries / inspection_documents / inspection_history are
// deliberately NOT bulk-hydrated here — every real caller (qms/api/
// inspections.ts's getStageEntries/getDocuments/getHistory) fetches them
// per-sheet, on demand, when a specific sheet is opened; there is no
// existing global list in useQmsStore for them to populate, and inventing
// one (plus rewiring the UI components that call those functions directly
// today) would be a real architecture change, out of this phase's scope.
// Same precedent already established one section up in this file for
// project_qms_inspection_attempt_photos (see that section's own comment).
//
// Reuses qmsInspectionWorkflowApi.ts's own row-transform functions (now
// exported for this purpose) rather than duplicating them — same pattern
// already used above for rowToMachine/rowToDie/rowToTool.

const INSPECTION_SHEET_HYDRATION_COLUMNS =
  "id, project_id, inspection_number, revision, mode, status, stage_ids, " +
  "customer_id, drawing_reference, drawing_revision, generated_at, generated_by, " +
  "printed_at, printed_by, uploaded_at, uploaded_by, reviewed_at, reviewed_by, " +
  "approved_at, approved_by, closed_at, closed_by, document_family_id, " +
  "previous_revision_id, revision_reason, created_at, updated_at";

export async function hydrateInspectionSheets(): Promise<
  HydrationResult<InspectionSheet[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("inspection_sheets")
      .select(INSPECTION_SHEET_HYDRATION_COLUMNS)
      .order("generated_at", { ascending: false })
      .range(from, to),
  );
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as Parameters<typeof rowToInspectionSheet>[0][]).map(
      rowToInspectionSheet,
    ),
  };
}

const QMS_STAGE_COMPLETION_HYDRATION_COLUMNS =
  "id, sheet_id, stage_id, mode, inspector_name, signature_data_url, remarks, " +
  "completed_at, signed_at, assigned_to, assigned_to_name, assigned_by, " +
  "assigned_at, due_date, accepted_qty, rejected_qty, updated_at";

export async function hydrateQmsStageCompletions(): Promise<
  HydrationResult<InspectionStageCompletion[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;
  const { data, error } = await fetchAllRows((from, to) =>
    gate.client
      .from("qms_stage_completions")
      .select(QMS_STAGE_COMPLETION_HYDRATION_COLUMNS)
      .range(from, to),
  );
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as Parameters<typeof rowToStageCompletion>[0][]).map(
      rowToStageCompletion,
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
  "target_qty, stage_type, " +
  "created_at, updated_at";

const PRODUCTION_STAGE_TRANSACTION_COLUMNS =
  "id, stage_id, type, quantity, event_time, vendor_id, vendor_name, source_stage_id, created_at";

export async function hydrateProjectProductionStages(): Promise<
  HydrationResult<ProjectProduction[]>
> {
  const gate = await requireSessionForHydration();
  if (!gate.ok) return gate.result;

  const { data: stageRows, error: stageError } = await fetchAllRows(
    (from, to) =>
      gate.client
        .from("project_production_stages")
        .select(PROJECT_PRODUCTION_STAGE_COLUMNS)
        .order("project_id")
        .order("position")
        .range(from, to),
  );
  if (stageError) return { status: "error", error: stageError.message };

  const { data: txRows, error: txError } = await fetchAllRows((from, to) =>
    gate.client
      .from("production_stage_transactions")
      .select(PRODUCTION_STAGE_TRANSACTION_COLUMNS)
      .order("event_time")
      .range(from, to),
  );
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

// company_settings (Company Profile) — the one single-object domain in
// this file; every other hydrate*() here returns an array because
// useHydrationEffect()'s generic helper expects one. Company Settings is
// naturally a single row per organization, so it gets its own small
// effect in useSupabaseHydration.ts instead of forcing an array wrapper
// on it. Reuses getCompanySettingsRemote() (companySettingsApi.ts)
// rather than re-querying company_settings here — same table, same
// setting_key, one read path.
export async function hydrateCompanySettings(): Promise<
  HydrationResult<CompanyProfileSettings | undefined>
> {
  const result = await getCompanySettingsRemote();
  if (result.status === "success") {
    return { status: "success", data: result.data };
  }
  if (result.status === "unauthenticated") return { status: "unauthenticated" };
  return { status: "error", error: result.error };
}
