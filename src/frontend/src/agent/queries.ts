// FabFlow AI Agent — READ / query tools (Phase 2).
//
// These are the Agent's "eyes": they never write anything, and every one
// reads from data FabFlow's own hydration already pulled from Supabase
// under RLS (useStore.getState(), useQmsStore.getState()) — there is no
// separate Agent database access anywhere in this file. A query is still
// permission-gated the same way an action is (see runQuery below): RLS
// already limited what THIS ORGANIZATION's hydration fetched, but a
// permission-restricted role inside that org (e.g. no invoices.view)
// must not see invoice data through the Agent just because the array
// happens to be sitting in the client's memory.
//
// A query never invents or estimates an ERP fact — every field returned
// traces to a real record. Where FabFlow simply doesn't track something
// yet (e.g. a per-order due date), the query says so explicitly rather
// than guessing (see `AgentQueryResult.caveats`).

import {
  getAllDrawings,
  getDrawingsByProject,
} from "@/drawingEditor/api/drawings";
import {
  buildCustomerLedgerEntries,
  buildVendorLedgerEntries,
  computeLedger,
  resolveDateRange,
} from "@/lib/ledger";
import type { DateRangePreset } from "@/lib/ledger";
import {
  buildLedgerCsvContent,
  buildLedgerExcelContent,
} from "@/lib/ledgerExport";
import type { LedgerExportMeta } from "@/lib/ledgerExport";
import { uploadLedgerExport } from "@/lib/ledgerExportRemote";
import { getCurrentServiceRate } from "@/lib/machineRevenueApi";
import { hasPermission } from "@/permissions";
import { useQmsStore } from "@/qms/store/useQmsStore";
import { useStore } from "@/store";
import type { AuthUser, Employee, Project } from "@/types";
import type { ToolParameterSchema } from "./types";

export interface AgentQueryContext {
  currentUser: AuthUser;
}

export interface AgentQueryResult<T> {
  ok: boolean;
  message: string;
  data?: T;
  /** Things the answer could NOT determine because FabFlow doesn't track
   * that fact yet (e.g. no per-order delivery due-date field exists) —
   * surfaced so the Agent never silently fills the gap with a guess. */
  caveats?: string[];
}

export interface AgentQuery<
  TParams = Record<string, unknown>,
  TData = unknown,
> {
  name: string;
  description: string;
  permission: string;
  /** Same LLM-facing schema as agent/actions.ts's AgentAction — see that
   * file's JsonSchemaProperty/ToolParameterSchema doc comment. */
  parameters: ToolParameterSchema;
  // Some queries (getProjectDocuments) need an async round-trip (drawing
  // metadata isn't in the always-hydrated main store) — execute may
  // return either directly, runQuery always awaits it either way.
  execute: (
    params: TParams,
    ctx: AgentQueryContext,
  ) => AgentQueryResult<TData> | Promise<AgentQueryResult<TData>>;
}

// ── Shared read helpers (pure, no store writes) ───────────────────────

function orderLabel(p: Project): string {
  return p.internalOrderCode
    ? `${p.internalOrderCode} (${p.projectName})`
    : p.projectName;
}

/** A project's own production summary, derived from the same
 * `projectProductions`/stage data the Production page itself renders —
 * no parallel computation, just reading it. */
function summarizeProduction(projectId: string) {
  const s = useStore.getState();
  const prod = s.projectProductions.find((pp) => pp.projectId === projectId);
  if (!prod || prod.stages.length === 0) {
    return { stages: [], bottleneckStage: null as string | null };
  }
  const stages = prod.stages.map((st) => ({
    stageName: st.stageName,
    status: st.status,
    sentQty: st.sentQty ?? st.quantitySent ?? 0,
    receivedQty: st.receivedQty ?? st.receivedQuantity ?? 0,
    okQty: st.okQty ?? 0,
    rejectedQty: st.rejectedQty ?? 0,
  }));
  // Bottleneck heuristic: among stages actually in progress, the one with
  // the largest gap between what it received and what it has passed as
  // OK so far. This is a simple, honestly-labeled heuristic (not a real
  // rate/throughput model) — FabFlow doesn't track elapsed time per stage
  // today, so a true "behind schedule" calculation isn't possible yet.
  const inProgress = stages.filter(
    (st) => st.status === "InProgress" || st.status === "Sent",
  );
  let bottleneckStage: string | null = null;
  if (inProgress.length > 0) {
    const worst = inProgress.reduce((a, b) =>
      b.receivedQty - b.okQty > a.receivedQty - a.okQty ? b : a,
    );
    if (worst.receivedQty - worst.okQty > 0) bottleneckStage = worst.stageName;
  }
  return { stages, bottleneckStage };
}

/** An order's QMS status, reading both the Inspection Sheet workflow
 * (qms/api/inspections.ts's tables) and the Phase-32 Production<->QMS
 * gate records — the two separate QMS systems that already exist. */
function summarizeQms(projectId: string) {
  const qs = useQmsStore.getState();
  const sheet = qs.inspectionSheets.find((sh) => sh.projectId === projectId);
  const gateInspections = qs.projectQmsInspections.filter(
    (i) => i.projectId === projectId,
  );
  return {
    sheetStatus: sheet?.status ?? null,
    sheetNumber: sheet?.inspectionNumber ?? null,
    gateInspectionCount: gateInspections.length,
    gatePendingCount: gateInspections.filter((i) => i.status !== "Passed")
      .length,
  };
}

// ── Query implementations ──────────────────────────────────────────────

export const searchCustomers: AgentQuery<
  { name: string },
  Array<{ id: string; name: string }>
> = {
  name: "searchCustomers",
  description: "Find customers whose name matches the given text.",
  permission: "customers.view",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Customer name or partial name to search for.",
      },
    },
    required: ["name"],
  },
  execute: ({ name }) => {
    const q = name.trim().toUpperCase();
    const matches = useStore
      .getState()
      .customers.filter((c) => c.name.toUpperCase().includes(q));
    return {
      ok: true,
      message: `Found ${matches.length} matching customer(s).`,
      data: matches.map((c) => ({ id: c.id, name: c.name })),
    };
  },
};

// ── searchInventoryItems (Phase B) ──────────────────────────────────────
// Same shape as searchCustomers — a plain substring filter over the
// already-hydrated store, not a new API. This is the ONLY way
// recordInventoryPurchase/recordInventoryUsage's inventoryItemId should
// ever be resolved: never invented, never guessed from a name that
// merely "sounds similar."
export const searchInventoryItems: AgentQuery<
  { name: string },
  Array<{
    id: string;
    name: string;
    unit: string;
    quantityAvailable: number;
    category?: string;
  }>
> = {
  name: "searchInventoryItems",
  description:
    "Find inventory items whose name matches the given text — always call this before recordInventoryPurchase or recordInventoryUsage to resolve the real item; never invent an inventoryItemId.",
  permission: "inventory.view",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Item name or partial name to search for.",
      },
    },
    required: ["name"],
  },
  execute: ({ name }) => {
    const q = name.trim().toUpperCase();
    const matches = useStore
      .getState()
      .inventoryItems.filter((i) => i.name.toUpperCase().includes(q));
    return {
      ok: true,
      message: `Found ${matches.length} matching inventory item(s).`,
      data: matches.map((i) => ({
        id: i.id,
        name: i.name,
        unit: i.unit,
        quantityAvailable: i.quantityAvailable,
        category: i.category,
      })),
    };
  },
};

// ── searchMaterialRequisitions (Monster-1) ──────────────────────────
// Material Requisitions is system-generated (project_bom_items shortages,
// via recompute_bom_requisition()) — there is no create action, only
// this read + the two write actions below. Mirrors the real
// MaterialRequisitions.tsx page's own fields exactly.
export const searchMaterialRequisitions: AgentQuery<
  { status?: string; projectId?: string },
  Array<{
    id: string;
    materialName: string;
    projectId: string;
    requiredQty?: number;
    availableQty?: number;
    shortageQty: number;
    estimatedPrice?: number;
    status: string;
  }>
> = {
  name: "searchMaterialRequisitions",
  description:
    "List material requisitions (auto-generated from BOM shortages), optionally filtered by status (Pending, Ready to Complete, Completed) and/or project. Resolve a real requisition id here before completeMaterialRequisition — never invent one.",
  permission: "material_requisitions.view",
  parameters: {
    type: "object",
    properties: {
      status: {
        type: "string",
        description: "One of: Pending, Ready to Complete, Completed. Optional.",
      },
      projectId: {
        type: "string",
        description:
          "Optional project id (resolve via findProject first) to filter to one project.",
      },
    },
    required: [],
  },
  execute: ({ status, projectId }) => {
    let matches = useStore.getState().bomRequisitions;
    if (status) matches = matches.filter((r) => r.status === status);
    if (projectId) matches = matches.filter((r) => r.projectId === projectId);
    return {
      ok: true,
      message: `Found ${matches.length} material requisition(s).`,
      data: matches.map((r) => ({
        id: r.id,
        materialName: r.materialName,
        projectId: r.projectId,
        requiredQty: r.requiredQty,
        availableQty: r.availableQty,
        shortageQty: r.shortageQty,
        estimatedPrice: r.estimatedPrice,
        status: r.status,
      })),
    };
  },
};

// ── searchDeliveryChallans (Phase C) ────────────────────────────────────
// Scoped by customer, not free-text — this is the ONE way
// createDeliveryChallan should check for a plausible existing DC before
// proposing a new one (the real app's own duplicate guard is only an
// exact dc_no collision check; this is the broader "does something like
// this already exist" search the Agent's standing duplicate-protection
// principle needs).
export const searchDeliveryChallans: AgentQuery<
  { customerId: string },
  Array<{
    id: string;
    dcNo: string;
    dispatchDate: string;
    receiverName: string;
    status: string;
    projectEntries: Array<{ projectId: string; dispatchQty: number }>;
  }>
> = {
  name: "searchDeliveryChallans",
  description:
    "Find existing delivery challans for a customer — call this before createDeliveryChallan to check for a plausible existing match (never create a duplicate).",
  permission: "delivery_challans.view",
  parameters: {
    type: "object",
    properties: {
      customerId: {
        type: "string",
        description: "The customer id (resolve via searchCustomers first).",
      },
    },
    required: ["customerId"],
  },
  execute: ({ customerId }) => {
    const matches = useStore
      .getState()
      .deliveryChallans.filter((dc) => dc.customerId === customerId);
    return {
      ok: true,
      message: `Found ${matches.length} delivery challan(s) for this customer.`,
      data: matches.map((dc) => ({
        id: dc.id,
        dcNo: dc.dcNo,
        dispatchDate: dc.dispatchDate,
        receiverName: dc.receiverName,
        status: dc.status,
        projectEntries: dc.projectEntries ?? [],
      })),
    };
  },
};

// ── searchInvoices (Phase D) ────────────────────────────────────────────
// getInvoiceStatus (below) requires an already-known projectId and its
// returned invoice objects carry no `id` — insufficient for createInvoice's
// own duplicate-check/entity-resolution needs. This is the resolution
// mechanism for those: filter by customerId and/or projectId (at least one
// required — an unscoped dump of every invoice is not what any caller
// needs), returning the real id plus every field createInvoice/its
// confirmation copy needs. Same shape as searchDeliveryChallans — a plain
// filter over the already-hydrated store, not a new API.
export const searchInvoices: AgentQuery<
  { customerId?: string; projectId?: string },
  Array<{
    id: string;
    invNo: string;
    customerId: string;
    projectId: string | null;
    dcId: string | null;
    status: string;
    totalAmount: number;
    paidAmount: number;
    dueDate: string;
  }>
> = {
  name: "searchInvoices",
  description:
    "Find existing invoices for a customer and/or project — call this before createInvoice to check for a plausible existing match, and to resolve a real invoice id (e.g. for recordPayment). At least one of customerId/projectId is required.",
  permission: "invoices.view",
  parameters: {
    type: "object",
    properties: {
      customerId: {
        type: "string",
        description:
          "Optional customer id (resolve via searchCustomers first).",
      },
      projectId: {
        type: "string",
        description: "Optional project id (resolve via findProject first).",
      },
    },
    required: [],
  },
  execute: ({ customerId, projectId }) => {
    if (!customerId && !projectId) {
      return {
        ok: false,
        message:
          "Provide at least one of customerId or projectId to search invoices.",
      };
    }
    let matches = useStore.getState().invoices;
    if (customerId)
      matches = matches.filter((i) => i.customerId === customerId);
    if (projectId) matches = matches.filter((i) => i.projectId === projectId);
    return {
      ok: true,
      message: `Found ${matches.length} invoice(s).`,
      data: matches.map((i) => ({
        id: i.id,
        invNo: i.invNo,
        customerId: i.customerId,
        projectId: i.projectId ?? null,
        dcId: i.dcId ?? null,
        status: i.status,
        totalAmount: i.totalAmount,
        paidAmount: i.paidAmount,
        dueDate: i.dueDate,
      })),
    };
  },
};

// ── searchQuotations (Phase E) ───────────────────────────────────────────
// Same shape as searchInvoices/searchDeliveryChallans — a plain filter
// over the already-hydrated store, not a new API. This is createQuotation's
// duplicate-check/entity-resolution mechanism: filter by customerId and/or
// projectId (at least one required), returning the real id plus every
// field createQuotation's confirmation copy needs.
export const searchQuotations: AgentQuery<
  { customerId?: string; projectId?: string },
  Array<{
    id: string;
    qtNo: string;
    customerId: string;
    projectId: string | null;
    status: string;
    totalAmount: number;
    validUntil: string;
  }>
> = {
  name: "searchQuotations",
  description:
    "Find existing quotations for a customer and/or project — call this before createQuotation to check for a plausible existing match. At least one of customerId/projectId is required.",
  permission: "quotations.view",
  parameters: {
    type: "object",
    properties: {
      customerId: {
        type: "string",
        description:
          "Optional customer id (resolve via searchCustomers first).",
      },
      projectId: {
        type: "string",
        description: "Optional project id (resolve via findProject first).",
      },
    },
    required: [],
  },
  execute: ({ customerId, projectId }) => {
    if (!customerId && !projectId) {
      return {
        ok: false,
        message:
          "Provide at least one of customerId or projectId to search quotations.",
      };
    }
    let matches = useStore.getState().quotations;
    if (customerId)
      matches = matches.filter((q) => q.customerId === customerId);
    if (projectId) matches = matches.filter((q) => q.projectId === projectId);
    return {
      ok: true,
      message: `Found ${matches.length} quotation(s).`,
      data: matches.map((q) => ({
        id: q.id,
        qtNo: q.qtNo,
        customerId: q.customerId,
        projectId: q.projectId ?? null,
        status: q.status,
        totalAmount: q.totalAmount,
        validUntil: q.validUntil,
      })),
    };
  },
};

// ── searchCustomerPOs (Phase F) ──────────────────────────────────────────
// Same shape as searchQuotations/searchInvoices — a plain filter over the
// already-hydrated quotationPurchaseOrders store array, not a new API.
// This is recordCustomerPO's duplicate-check/entity-resolution mechanism:
// filter by customerId and/or quotationId (at least one required),
// returning the real id plus every field already present on the record —
// no invented fields.
export const searchCustomerPOs: AgentQuery<
  { customerId?: string; quotationId?: string },
  Array<{
    id: string;
    poNumber: string;
    poDate: string;
    customerId: string;
    quotationId: string;
    status: string;
  }>
> = {
  name: "searchCustomerPOs",
  description:
    "Find existing customer purchase orders for a customer and/or quotation — call this before recordCustomerPO to check for a plausible existing match. At least one of customerId/quotationId is required.",
  permission: "purchase_orders.view",
  parameters: {
    type: "object",
    properties: {
      customerId: {
        type: "string",
        description:
          "Optional customer id (resolve via searchCustomers first).",
      },
      quotationId: {
        type: "string",
        description:
          "Optional quotation id (resolve via searchQuotations first).",
      },
    },
    required: [],
  },
  execute: ({ customerId, quotationId }) => {
    if (!customerId && !quotationId) {
      return {
        ok: false,
        message:
          "Provide at least one of customerId or quotationId to search customer purchase orders.",
      };
    }
    let matches = useStore.getState().quotationPurchaseOrders;
    if (customerId)
      matches = matches.filter((p) => p.customerId === customerId);
    if (quotationId)
      matches = matches.filter((p) => p.quotationId === quotationId);
    return {
      ok: true,
      message: `Found ${matches.length} customer purchase order(s).`,
      data: matches.map((p) => ({
        id: p.id,
        poNumber: p.poNumber,
        poDate: p.poDate,
        customerId: p.customerId,
        quotationId: p.quotationId,
        status: p.status,
      })),
    };
  },
};

// ── searchVendors (Phase G) ───────────────────────────────────────────────
// Same shape as searchCustomers — a plain substring filter over the
// already-hydrated vendors store array, not a new API. This is
// createVendor's duplicate-check/entity-resolution mechanism: never guess
// or invent a vendorId, always resolve through this first.
export const searchVendors: AgentQuery<
  { name: string },
  Array<{
    id: string;
    name: string;
    phone: string;
    address: string;
    gstNumber?: string;
  }>
> = {
  name: "searchVendors",
  description:
    "Find vendors whose name matches the given text — always call this before createVendor to check for a plausible existing match; never invent a vendorId.",
  permission: "vendors.view",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Vendor name or partial name to search for.",
      },
    },
    required: ["name"],
  },
  execute: ({ name }) => {
    const q = name.trim().toUpperCase();
    const matches = useStore
      .getState()
      .vendors.filter((v) => v.name.toUpperCase().includes(q));
    return {
      ok: true,
      message: `Found ${matches.length} matching vendor(s).`,
      data: matches.map((v) => ({
        id: v.id,
        name: v.name,
        phone: v.phone,
        address: v.address,
        gstNumber: v.gstNumber,
      })),
    };
  },
};

// ── searchCompanyPOs (Phase H) ─────────────────────────────────────────────
// Same shape as searchCustomerPOs — a plain filter over the already-
// hydrated companyPOs store array, not a new API. This is createCompanyPO's
// duplicate-check/entity-resolution mechanism: filter by vendorId and/or
// cpoNumber (at least one required), returning the real id plus the fields
// createCompanyPO's confirmation copy and the caller need — no invented
// fields (CompanyPO has no poDate/project field, so createdAt/
// expectedDeliveryDate are used instead, matching the actual schema).
export const searchCompanyPOs: AgentQuery<
  { vendorId?: string; cpoNumber?: string },
  Array<{
    id: string;
    cpoNumber: string;
    vendorId?: string;
    vendorName: string;
    status: string;
    grandTotal: number;
    expectedDeliveryDate?: string;
    createdAt: number;
  }>
> = {
  name: "searchCompanyPOs",
  description:
    "Find existing company purchase orders for a vendor and/or by CPO number — call this before createCompanyPO to check for a plausible existing match. At least one of vendorId/cpoNumber is required.",
  permission: "company_po.view",
  parameters: {
    type: "object",
    properties: {
      vendorId: {
        type: "string",
        description: "Optional vendor id (resolve via searchVendors first).",
      },
      cpoNumber: {
        type: "string",
        description: "Optional exact CPO number to look up.",
      },
    },
    required: [],
  },
  execute: ({ vendorId, cpoNumber }) => {
    if (!vendorId && !cpoNumber) {
      return {
        ok: false,
        message:
          "Provide at least one of vendorId or cpoNumber to search company purchase orders.",
      };
    }
    let matches = useStore.getState().companyPOs;
    if (vendorId) matches = matches.filter((p) => p.vendorId === vendorId);
    if (cpoNumber) matches = matches.filter((p) => p.cpoNumber === cpoNumber);
    return {
      ok: true,
      message: `Found ${matches.length} company purchase order(s).`,
      data: matches.map((p) => ({
        id: p.id,
        cpoNumber: p.cpoNumber,
        vendorId: p.vendorId,
        vendorName: p.vendorName,
        status: p.status,
        grandTotal: p.grandTotal,
        expectedDeliveryDate: p.expectedDeliveryDate,
        createdAt: p.createdAt,
      })),
    };
  },
};

// ── searchExpenseFloats (Phase I) ──────────────────────────────────────────
// Same shape as searchCompanyPOs — a plain filter over the already-
// hydrated expenseFloats store array, not a new API. This is
// createExpenseFloat's duplicate/open-float-check mechanism: filter by
// employeeId and/or status (at least one required), returning the real id
// plus the approved field set — no invented fields.
export const searchExpenseFloats: AgentQuery<
  { employeeId?: string; status?: string },
  Array<{
    id: string;
    floatNo: string;
    employeeId: string;
    issuedDate: string;
    issuedAmount: number;
    balanceAmount: number;
    status: string;
  }>
> = {
  name: "searchExpenseFloats",
  description:
    "Find existing expense floats for an employee and/or by status — call this before createExpenseFloat to check whether the employee already has a relevant open float. At least one of employeeId/status is required.",
  permission: "expense_float.view",
  parameters: {
    type: "object",
    properties: {
      employeeId: {
        type: "string",
        description: "Optional employee id (resolve via findEmployee first).",
      },
      status: {
        type: "string",
        description:
          'Optional status filter: "Open", "Partially Settled", or "Fully Settled".',
      },
    },
    required: [],
  },
  execute: ({ employeeId, status }) => {
    if (!employeeId && !status) {
      return {
        ok: false,
        message:
          "Provide at least one of employeeId or status to search expense floats.",
      };
    }
    let matches = useStore.getState().expenseFloats;
    if (employeeId)
      matches = matches.filter((f) => f.employeeId === employeeId);
    if (status) matches = matches.filter((f) => f.status === status);
    return {
      ok: true,
      message: `Found ${matches.length} expense float(s).`,
      data: matches.map((f) => ({
        id: f.id,
        floatNo: f.floatNo,
        employeeId: f.employeeId,
        issuedDate: f.issuedDate,
        issuedAmount: f.issuedAmount,
        balanceAmount: f.balanceAmount,
        status: f.status,
      })),
    };
  },
};

// ── getCustomerLedger (Phase K) ────────────────────────────────────────────
// Read-only wrapper around lib/ledger.ts's existing computation engine —
// buildCustomerLedgerEntries/resolveDateRange/computeLedger are reused
// completely unchanged, exactly as Ledger.tsx's own customer-account view
// calls them. No new business logic, no new data source.
//
// Vendor Ledger is deliberately NOT exposed here (approved scope): its
// entries are built partly from `payables`/`payablePayments`, which are
// confirmed still local-only (store.ts seeds them from a hardcoded array,
// no `payables`/`payable_payments` table exists anywhere in the live
// schema) — presenting that as authoritative shared ERP data through the
// Agent would be dishonest about what FabFlow actually knows.
//
// Sub-permission defense-in-depth, mirroring getCustomerOverview's own
// established pattern: RLS already prevents invoices/payments/quotations
// the user can't see from ever being hydrated into the store, but this
// query re-checks explicitly anyway and passes an empty array (plus a
// caveat) for any source the current user lacks view permission on,
// rather than silently trusting whatever happens to be in memory.
export interface CustomerLedgerData {
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
  outstanding: number;
  rows: Array<{
    date: string;
    docType: string;
    docNo: string;
    description: string;
    debit: number;
    credit: number;
    balance: number;
    informational: boolean;
    status?: string;
    projectId?: string;
  }>;
}

const MAX_LEDGER_ROWS = 200;

export const getCustomerLedger: AgentQuery<
  {
    customerId: string;
    datePreset?: string;
    customStart?: string;
    customEnd?: string;
    projectId?: string;
  },
  CustomerLedgerData
> = {
  name: "getCustomerLedger",
  description:
    "A customer's ledger: quotations, invoices, and payments combined into a running-balance statement. Always call searchCustomers first to resolve the real customer. Read-only — FabFlow's Vendor Ledger is not available here (see caveats if asked about a vendor).",
  permission: "ledger.view",
  parameters: {
    type: "object",
    properties: {
      customerId: {
        type: "string",
        description: "The customer id (resolve via searchCustomers first).",
      },
      datePreset: {
        type: "string",
        description:
          'One of "all" (default), "today", "this_month", "last_month", "custom".',
      },
      customStart: {
        type: "string",
        description:
          'Start date (YYYY-MM-DD), only used when datePreset is "custom".',
      },
      customEnd: {
        type: "string",
        description:
          'End date (YYYY-MM-DD), only used when datePreset is "custom".',
      },
      projectId: {
        type: "string",
        description:
          "Optional project id (resolve via findProject first) to filter the ledger to one project.",
      },
    },
    required: ["customerId"],
  },
  execute: (
    { customerId, datePreset, customStart, customEnd, projectId },
    ctx,
  ) => {
    const s = useStore.getState();
    const customer = s.customers.find((c) => c.id === customerId);
    if (!customer) return { ok: false, message: "Customer not found." };

    const canSeeQuotations = hasPermission(ctx.currentUser, "quotations.view");
    const canSeeInvoices = hasPermission(ctx.currentUser, "invoices.view");
    const canSeePayments = hasPermission(ctx.currentUser, "payments.view");
    const caveats: string[] = [];
    if (!canSeeQuotations)
      caveats.push("Quotations excluded (no quotations.view permission).");
    if (!canSeeInvoices)
      caveats.push("Invoices excluded (no invoices.view permission).");
    if (!canSeePayments)
      caveats.push("Payments excluded (no payments.view permission).");

    const entries = buildCustomerLedgerEntries({
      customerId,
      quotations: canSeeQuotations ? s.quotations : [],
      invoices: canSeeInvoices ? s.invoices : [],
      payments: canSeePayments ? s.payments : [],
    });
    const filtered = projectId
      ? entries.filter((e) => e.projectId === projectId)
      : entries;

    const range = resolveDateRange(
      (datePreset as DateRangePreset) || "all",
      customStart,
      customEnd,
    );
    const computation = computeLedger(filtered, range);
    const rows = computation.rows.slice(-MAX_LEDGER_ROWS);
    if (computation.rows.length > rows.length) {
      caveats.push(
        `Showing the most recent ${rows.length} of ${computation.rows.length} entries.`,
      );
    }

    return {
      ok: true,
      message: `Ledger for ${customer.name}: ${rows.length} entr${rows.length === 1 ? "y" : "ies"}, closing balance ₹${computation.closingBalance.toLocaleString("en-IN")}.`,
      data: {
        openingBalance: computation.openingBalance,
        closingBalance: computation.closingBalance,
        totalDebit: computation.totalDebit,
        totalCredit: computation.totalCredit,
        outstanding: computation.outstanding,
        rows: rows.map((r) => ({
          date: r.date,
          docType: r.docType,
          docNo: r.docNo,
          description: r.description,
          debit: r.debit,
          credit: r.credit,
          balance: r.balance,
          informational: r.informational,
          status: r.status,
          projectId: r.projectId,
        })),
      },
      caveats: caveats.length > 0 ? caveats : undefined,
    };
  },
};

export interface CustomerOverview {
  customer: { id: string; name: string };
  orders: Array<{
    id: string;
    label: string;
    isRepeat: boolean;
    totalQty: number | null;
    createdAt: number; // authoritative creation timestamp (Project.createdAt,
    // DB-backed by projects.created_at) — the only reliable signal for
    // "latest project"; never infer recency from array order.
    production: ReturnType<typeof summarizeProduction>;
    qms: ReturnType<typeof summarizeQms>;
    assignedEmployees: Array<{ id: string; name: string }>;
    drawingCount: number | null; // null while the async count hasn't been fetched
  }>;
  openInvoices: Array<{
    invNo: string;
    totalAmount: number;
    paidAmount: number;
    status: string;
  }>;
  recentDeliveries: Array<{ dcNo: string; date: string }>;
}

/**
 * The "what is the status of X" investigation, done as one deterministic
 * multi-step read: find the customer, find every order (root project +
 * its repeat-order children via parentProjectId — the Customer -> Parent
 * Project -> Orders chain already exists in the data model today, just
 * expressed as Project self-references rather than a separate table),
 * then pull production/QMS/employee/invoice/delivery facts for each.
 *
 * This is genuinely multi-step tool use, not a single query — but it is
 * still a fixed recipe, not an LLM planning freely. A real LLM would
 * call the smaller queries below (searchCustomers, getProjectStatus,
 * getEmployeeWorkload, ...) itself and decide what to fetch; this
 * function is the Phase-2 stand-in for that plus a template-based
 * synthesis, not true reasoning — see agent/investigate.ts.
 */
export const getCustomerOverview: AgentQuery<
  { customerId: string },
  CustomerOverview
> = {
  name: "getCustomerOverview",
  description:
    "Full status of a customer: their orders, production/QMS progress, assigned employees, open invoices, recent deliveries. Each order includes its authoritative createdAt timestamp (ms since epoch) — use it, not array order, to determine which order is 'latest'.",
  permission: "customers.view",
  parameters: {
    type: "object",
    properties: {
      customerId: {
        type: "string",
        description: "The customer id (resolve via searchCustomers first).",
      },
    },
    required: ["customerId"],
  },
  execute: ({ customerId }, ctx) => {
    const s = useStore.getState();
    const customer = s.customers.find((c) => c.id === customerId);
    if (!customer) return { ok: false, message: "Customer not found." };

    const canSeeProduction = hasPermission(ctx.currentUser, "production.view");
    const canSeeQms = hasPermission(ctx.currentUser, "inspection_sheets.view");
    const canSeeEmployees = hasPermission(ctx.currentUser, "employees.view");
    const canSeeInvoices = hasPermission(ctx.currentUser, "invoices.view");
    const canSeeDeliveries = hasPermission(
      ctx.currentUser,
      "delivery_challans.view",
    );

    const allOrders = s.projects.filter((p) => p.customerId === customerId);
    const caveats: string[] = [];
    if (!canSeeProduction)
      caveats.push(
        "Production stage detail hidden (no production.view permission).",
      );
    if (!canSeeQms)
      caveats.push(
        "QMS/inspection status hidden (no inspection_sheets.view permission).",
      );
    if (!canSeeEmployees)
      caveats.push(
        "Employee assignments hidden (no employees.view permission).",
      );

    const orders = allOrders.map((p) => ({
      id: p.id,
      label: orderLabel(p),
      isRepeat: Boolean(p.parentProjectId),
      totalQty: p.totalQty ?? null,
      createdAt: p.createdAt,
      production: canSeeProduction
        ? summarizeProduction(p.id)
        : { stages: [], bottleneckStage: null },
      qms: canSeeQms
        ? summarizeQms(p.id)
        : {
            sheetStatus: null,
            sheetNumber: null,
            gateInspectionCount: 0,
            gatePendingCount: 0,
          },
      assignedEmployees: canSeeEmployees
        ? (p.assignedEmployeeIds || [])
            .map((id) => s.employees.find((e) => e.id === id))
            .filter((e): e is Employee => Boolean(e))
            .map((e) => ({ id: e.id, name: e.name }))
        : [],
      drawingCount: null, // see getProjectDocuments — kept out of this aggregate to avoid an async fetch per order
    }));

    const openInvoices = canSeeInvoices
      ? s.invoices
          .filter(
            (inv) =>
              allOrders.some((p) => p.id === inv.projectId) &&
              inv.status !== "Paid",
          )
          .map((inv) => ({
            invNo: inv.invNo,
            totalAmount: inv.totalAmount,
            paidAmount: inv.paidAmount,
            status: inv.status,
          }))
      : [];
    if (!canSeeInvoices)
      caveats.push(
        "Invoice/payment status hidden (no invoices.view permission).",
      );

    const recentDeliveries = canSeeDeliveries
      ? s.deliveryChallans
          .filter((dc) => allOrders.some((p) => p.id === dc.projectId))
          .slice(-5)
          .map((dc) => ({ dcNo: dc.dcNo, date: dc.jobId || "" }))
      : [];
    if (!canSeeDeliveries)
      caveats.push(
        "Delivery history hidden (no delivery_challans.view permission).",
      );

    if (allOrders.length === 0)
      caveats.push("This customer has no projects/orders recorded yet.");
    caveats.push(
      "FabFlow does not track a per-order expected delivery date today — only actual delivery challans once dispatched.",
    );

    return {
      ok: true,
      message: `Found ${orders.length} order(s) for ${customer.name}.`,
      data: {
        customer: { id: customer.id, name: customer.name },
        orders,
        openInvoices,
        recentDeliveries,
      },
      caveats,
    };
  },
};

export interface ProjectStatusData {
  project: { id: string; label: string; totalQty: number | null };
  production: ReturnType<typeof summarizeProduction>;
  qms: ReturnType<typeof summarizeQms>;
  assignedEmployees: Array<{ id: string; name: string }>;
}

export const getProjectStatus: AgentQuery<
  { projectId: string },
  ProjectStatusData
> = {
  name: "getProjectStatus",
  description:
    "Detailed status of one order/project: production stages, QMS, assigned employees.",
  permission: "projects.view",
  parameters: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description:
          "The project/order id (resolve via searchProjects/findProject first).",
      },
    },
    required: ["projectId"],
  },
  execute: ({ projectId }, ctx) => {
    const s = useStore.getState();
    const project = s.projects.find((p) => p.id === projectId);
    if (!project) return { ok: false, message: "Project not found." };

    const canSeeProduction = hasPermission(ctx.currentUser, "production.view");
    const canSeeQms = hasPermission(ctx.currentUser, "inspection_sheets.view");
    const canSeeEmployees = hasPermission(ctx.currentUser, "employees.view");

    return {
      ok: true,
      message: `Status for ${orderLabel(project)}.`,
      data: {
        project: {
          id: project.id,
          label: orderLabel(project),
          totalQty: project.totalQty ?? null,
        },
        production: canSeeProduction
          ? summarizeProduction(project.id)
          : { stages: [], bottleneckStage: null },
        qms: canSeeQms
          ? summarizeQms(project.id)
          : {
              sheetStatus: null,
              sheetNumber: null,
              gateInspectionCount: 0,
              gatePendingCount: 0,
            },
        assignedEmployees: canSeeEmployees
          ? (project.assignedEmployeeIds || [])
              .map((id) => s.employees.find((e) => e.id === id))
              .filter((e): e is Employee => Boolean(e))
              .map((e) => ({ id: e.id, name: e.name }))
          : [],
      },
      caveats:
        canSeeProduction && canSeeQms && canSeeEmployees
          ? undefined
          : ["Some sections hidden by permission."],
    };
  },
};

export interface EmployeeWorkloadEntry {
  projectId: string;
  projectLabel: string;
  task: string;
  durationHours: number;
  piecesPerHour: number;
  targetQuantity: number;
  assignedAt: number;
}

export const getEmployeeWorkload: AgentQuery<
  { employeeId: string },
  {
    employee: { id: string; name: string };
    assignments: EmployeeWorkloadEntry[];
  }
> = {
  name: "getEmployeeWorkload",
  description:
    "What an employee is currently assigned to, and their expected output per the Agent's work-assignment notes.",
  permission: "employees.view",
  parameters: {
    type: "object",
    properties: {
      employeeId: {
        type: "string",
        description: "The employee id (resolve via findEmployee first).",
      },
    },
    required: ["employeeId"],
  },
  execute: ({ employeeId }) => {
    const s = useStore.getState();
    const employee = s.employees.find((e) => e.id === employeeId);
    if (!employee) return { ok: false, message: "Employee not found." };

    // Work-assignment "notes" are the honest Phase-1 approximation for a
    // real Work Card (see agent/actions.ts's createWorkCard) — read back
    // the same activity-log entries it writes, rather than a separate
    // parallel store.
    const assignments: EmployeeWorkloadEntry[] = [];
    for (const p of s.projects) {
      for (const a of p.activityLog || []) {
        if (a.type !== "note" || a.performedBy !== "AI Agent") continue;
        if (a.metadata?.employeeId !== employeeId) continue;
        assignments.push({
          projectId: p.id,
          projectLabel: orderLabel(p),
          task: String(a.metadata.task ?? ""),
          durationHours: Number(a.metadata.durationHours ?? 0),
          piecesPerHour: Number(a.metadata.piecesPerHour ?? 0),
          targetQuantity: Number(a.metadata.targetQuantity ?? 0),
          assignedAt: a.timestamp,
        });
      }
    }

    return {
      ok: true,
      message: `${employee.name} has ${assignments.length} recorded work assignment(s).`,
      data: { employee: { id: employee.id, name: employee.name }, assignments },
      caveats: [
        "FabFlow has no dedicated Work Card entity yet — assignments above are Agent-recorded notes, and actual quantity produced/actual hours worked are not tracked anywhere yet, only the expected target.",
      ],
    };
  },
};

// ── searchDrawings (Phase L, Track 2) ──────────────────────────────────────
// Entity-resolution prerequisite for Dies (which requires linking ≥1
// existing engineering drawing before it can be created — investigated,
// not yet implemented as its own action). Intentionally async and
// unscoped by project — Dies.tsx's own drawing picker has no project
// filter, confirming drawings are browsed from the full Drawing
// Repository, not one project — so this reuses getAllDrawings()
// (drawingEditor/api/drawings.ts) completely unchanged, exactly the way
// getProjectDocuments below reuses getDrawingsByProject unchanged. No
// file bytes are ever returned (only id/fileName/projectId — see
// getProjectDocuments's own comment on why).
export const searchDrawings: AgentQuery<
  { name?: string },
  Array<{ id: string; fileName: string; projectId?: string }>
> = {
  name: "searchDrawings",
  description:
    "Find drawings in the Drawing Repository whose file name matches the given text (or list all if no name is given) — resolve a real drawing id here before referencing one elsewhere; never invent one.",
  permission: "drawing_editor.view",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "File name or partial file name to search for, optional.",
      },
    },
    required: [],
  },
  execute: async ({ name }) => {
    const drawings = await getAllDrawings();
    const q = (name ?? "").trim().toUpperCase();
    const matches = q
      ? drawings.filter((d) => d.fileName.toUpperCase().includes(q))
      : drawings;
    return {
      ok: true,
      message: `Found ${matches.length} drawing(s).`,
      data: matches.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        projectId: d.projectId,
      })),
    };
  },
};

// Intentionally async (drawing metadata lives in Supabase, not the
// always-hydrated main store) rather than folded into getCustomerOverview
// above, so a status question never pays for an extra round-trip it
// didn't ask for. Still just a read wrapper around existing data — no
// new business logic, no new storage, no file bytes ever returned (only
// names/types/counts — see the Phase-6 file-capability audit report for
// why FabFlow has no channel to send actual file bytes through the
// Agent chat today).
//
// Merges every attachment source FabFlow already has for a project:
//   - drawingEditor's drawings table (source: "drawing")
//   - Project.poFiles, the existing inline PO-attachment field
//     (source: "po")
//   - Payment.files for payments against this project's invoices
//     (source: "payment")
// Deliberately NOT included: Quotation/QuotationPurchaseOrder files —
// those live on the Quotation, which isn't reliably linked to a Project
// until/unless it's converted, and guessing that link would be exactly
// the kind of invented relationship this tool must not make.
export interface ProjectDocumentEntry {
  source: "drawing" | "po" | "payment";
  id: string | null; // drawing id (usable with attachDocument) — null for po/payment entries, which have no separate attachable id in FabFlow today
  fileName: string;
  uploadedAt: number | null; // null where FabFlow doesn't record an upload time for this source (e.g. poFiles)
}

export const getProjectDocuments: AgentQuery<
  { projectId: string },
  ProjectDocumentEntry[]
> = {
  name: "getProjectDocuments",
  description:
    "List documents attached to a project/order: drawings, PO files, and payment evidence files. Names/types/counts only — never returns file bytes.",
  permission: "drawing_editor.view",
  parameters: {
    type: "object",
    properties: {
      projectId: { type: "string", description: "The project/order id." },
    },
    required: ["projectId"],
  },
  execute: async ({ projectId }, ctx) => {
    const s = useStore.getState();
    const project = s.projects.find((p) => p.id === projectId);
    if (!project) return { ok: false, message: "Project not found." };

    const drawings = await getDrawingsByProject(projectId);
    const entries: ProjectDocumentEntry[] = drawings.map((d) => ({
      source: "drawing" as const,
      id: d.id,
      fileName: d.fileName,
      uploadedAt: d.uploadedAt,
    }));

    for (const f of project.poFiles || []) {
      entries.push({
        source: "po",
        id: null,
        fileName: f.name,
        uploadedAt: null,
      });
    }

    if (hasPermission(ctx.currentUser, "invoices.view")) {
      const invoiceIds = new Set(
        s.invoices.filter((i) => i.projectId === projectId).map((i) => i.id),
      );
      for (const pay of s.payments) {
        if (!invoiceIds.has(pay.invoiceId)) continue;
        for (const f of pay.files || []) {
          entries.push({
            source: "payment",
            id: null,
            fileName: f.name,
            uploadedAt: pay.createdAt,
          });
        }
      }
    }

    return {
      ok: true,
      message: `${entries.length} document(s) linked to this project (${entries.filter((e) => e.source === "drawing").length} drawing, ${entries.filter((e) => e.source === "po").length} PO, ${entries.filter((e) => e.source === "payment").length} payment).`,
      data: entries,
      caveats: [
        "Quotation-level PO files are not included here — they aren't reliably linked to a specific project until conversion.",
      ],
    };
  },
};

// ── Phase 4 additions — see the capability audit in the Phase 4 report
// for exactly which existing FabFlow data each of these reads from. Every
// one is a read wrapper around fields already sitting in the hydrated
// store or an existing API — none of them invent a fact FabFlow doesn't
// already record.

export const getProjectPurchaseOrder: AgentQuery<
  { projectId: string },
  { poNumber: string | null; poDate: string | null; fileCount: number }
> = {
  name: "getProjectPurchaseOrder",
  description:
    "Whether a customer PO has been recorded for a project/order, and its number/date/attached files.",
  permission: "projects.view",
  parameters: {
    type: "object",
    properties: {
      projectId: { type: "string", description: "The project/order id." },
    },
    required: ["projectId"],
  },
  execute: ({ projectId }) => {
    const project = useStore
      .getState()
      .projects.find((p) => p.id === projectId);
    if (!project) return { ok: false, message: "Project not found." };
    const hasPo = Boolean(project.poNumber);
    return {
      ok: true,
      message: hasPo
        ? `PO ${project.poNumber} recorded, ${project.poFiles?.length ?? 0} file(s) attached.`
        : "No PO recorded for this project.",
      data: {
        poNumber: project.poNumber || null,
        poDate: project.poDate || null,
        fileCount: project.poFiles?.length ?? 0,
      },
    };
  },
};

export interface ProjectMaterialsData {
  items: Array<{ materialName: string; requiredQuantity: number }>;
  requisitions: Array<{ materialName: string; status: string }>;
}

export const getProjectMaterials: AgentQuery<
  { projectId: string },
  ProjectMaterialsData
> = {
  name: "getProjectMaterials",
  description:
    "BOM (bill of materials) items and material requisition status for a project/order.",
  permission: "material_requisitions.view",
  parameters: {
    type: "object",
    properties: {
      projectId: { type: "string", description: "The project/order id." },
    },
    required: ["projectId"],
  },
  execute: ({ projectId }) => {
    const s = useStore.getState();
    const items = s.bomItems
      .filter((b) => b.projectId === projectId)
      .map((b) => ({
        materialName: b.materialName,
        requiredQuantity: b.requiredQuantity,
      }));
    const requisitions = s.bomRequisitions
      .filter((r) => r.projectId === projectId)
      .map((r) => ({ materialName: r.materialName, status: r.status }));
    return {
      ok: true,
      message: `${items.length} BOM item(s), ${requisitions.length} requisition(s).`,
      data: { items, requisitions },
    };
  },
};

export interface InvoiceStatusData {
  invoices: Array<{
    invNo: string;
    totalAmount: number;
    paidAmount: number;
    status: string;
    dueDate: string;
  }>;
  totalOutstanding: number;
}

export const getInvoiceStatus: AgentQuery<
  { projectId: string },
  InvoiceStatusData
> = {
  name: "getInvoiceStatus",
  description:
    "Invoices raised against a project/order, their amounts, and how much is still outstanding.",
  permission: "invoices.view",
  parameters: {
    type: "object",
    properties: {
      projectId: { type: "string", description: "The project/order id." },
    },
    required: ["projectId"],
  },
  execute: ({ projectId }) => {
    const invoices = useStore
      .getState()
      .invoices.filter((inv) => inv.projectId === projectId)
      .map((inv) => ({
        invNo: inv.invNo,
        totalAmount: inv.totalAmount,
        paidAmount: inv.paidAmount,
        status: inv.status,
        dueDate: inv.dueDate,
      }));
    const totalOutstanding = invoices.reduce(
      (sum, i) => sum + (i.totalAmount - i.paidAmount),
      0,
    );
    return {
      ok: true,
      message: `${invoices.length} invoice(s), ₹${totalOutstanding.toLocaleString("en-IN")} outstanding.`,
      data: { invoices, totalOutstanding },
    };
  },
};

export interface DeliveryStatusData {
  orderedQty: number | null;
  dispatchedQty: number;
  deliveryCount: number;
}

export const getDeliveryStatus: AgentQuery<
  { projectId: string },
  DeliveryStatusData
> = {
  name: "getDeliveryStatus",
  description:
    "How much of a project/order's quantity has actually been dispatched via delivery challans.",
  permission: "delivery_challans.view",
  parameters: {
    type: "object",
    properties: {
      projectId: { type: "string", description: "The project/order id." },
    },
    required: ["projectId"],
  },
  execute: ({ projectId }) => {
    const s = useStore.getState();
    const project = s.projects.find((p) => p.id === projectId);
    // "Prepared" means created but not yet actually dispatched (see
    // DCStatus in types.ts) — only Dispatched/Delivered challans count
    // toward actually-dispatched quantity. Confirmed pre-existing bug:
    // this filter previously included Prepared DCs.
    const relevant = s.deliveryChallans.filter(
      (dc) =>
        dc.status !== "Prepared" &&
        (dc.projectEntries || []).some((e) => e.projectId === projectId),
    );
    const dispatchedQty = relevant.reduce((sum, dc) => {
      const entry = (dc.projectEntries || []).find(
        (e) => e.projectId === projectId,
      );
      return sum + (entry?.dispatchQty ?? 0);
    }, 0);
    return {
      ok: true,
      message: `${dispatchedQty} piece(s) dispatched across ${relevant.length} delivery challan(s).`,
      data: {
        orderedQty: project?.totalQty ?? null,
        dispatchedQty,
        deliveryCount: relevant.length,
      },
      caveats: [
        "This is actual dispatched quantity from delivery challans, not a promised/expected delivery date — FabFlow doesn't record one.",
      ],
    };
  },
};

export interface EmployeeOverloadEntry {
  employeeId: string;
  employeeName: string;
  activeAssignmentCount: number;
}

export const getEmployeeOverload: AgentQuery<
  Record<string, never>,
  EmployeeOverloadEntry[]
> = {
  name: "getEmployeeOverload",
  description:
    "Which employees have the most recorded work assignments right now, to spot who may be overloaded. " +
    "Counts Agent-recorded assignment notes only (FabFlow has no dedicated Work Card status/completion tracking yet).",
  permission: "employees.view",
  parameters: { type: "object", properties: {}, required: [] },
  execute: () => {
    const s = useStore.getState();
    const counts = new Map<string, number>();
    for (const p of s.projects) {
      for (const a of p.activityLog || []) {
        if (a.type !== "note" || a.performedBy !== "AI Agent") continue;
        const empId = a.metadata?.employeeId;
        if (typeof empId !== "string") continue;
        counts.set(empId, (counts.get(empId) ?? 0) + 1);
      }
    }
    const entries: EmployeeOverloadEntry[] = Array.from(counts.entries())
      .map(([employeeId, count]) => {
        const emp = s.employees.find((e) => e.id === employeeId);
        return {
          employeeId,
          employeeName: emp?.name ?? "(unknown)",
          activeAssignmentCount: count,
        };
      })
      .sort((a, b) => b.activeAssignmentCount - a.activeAssignmentCount);
    return {
      ok: true,
      message: `${entries.length} employee(s) with recorded assignments.`,
      data: entries,
      caveats: [
        "Counts recorded assignments, not actual current workload/hours — FabFlow doesn't track work-card status (in progress/completed) yet, so a high count doesn't necessarily mean currently busy.",
      ],
    };
  },
};

export interface AttentionItem {
  type:
    | "production_stalled"
    | "qms_pending"
    | "no_po"
    | "unassigned"
    | "invoice_overdue";
  projectId?: string;
  label: string;
  detail: string;
}

/**
 * A heuristic scan across every order for a handful of honestly-defined
 * risk signals — NOT a prediction, NOT a claim FabFlow itself flagged
 * these. Every item traces to a real field comparison; the message and
 * each item's `detail` are written to read as risk signals, not facts
 * (see the Phase 4 report's FACT/INFERENCE discipline). Deliberately one
 * fixed set of checks, not an open-ended "find anomalies" free scan — an
 * LLM reading the raw per-order data returned by getCustomerOverview/
 * getProjectStatus can reason about anything beyond these fixed checks.
 */
export const findAttentionItems: AgentQuery<
  Record<string, never>,
  AttentionItem[]
> = {
  name: "findAttentionItems",
  description:
    "Scan all orders for common risk signals: stalled production, pending QMS, missing PO, unassigned employees, overdue invoices. " +
    "Each result is a signal worth checking, not a confirmed problem — always explain findings as risk, not fact.",
  permission: "projects.view",
  parameters: { type: "object", properties: {}, required: [] },
  execute: (_params, ctx) => {
    const s = useStore.getState();
    const qs = useQmsStore.getState();
    const items: AttentionItem[] = [];
    const canSeeProduction = hasPermission(ctx.currentUser, "production.view");
    const canSeeQms = hasPermission(ctx.currentUser, "inspection_sheets.view");
    const canSeeInvoices = hasPermission(ctx.currentUser, "invoices.view");
    const today = new Date().toISOString().slice(0, 10);

    for (const p of s.projects) {
      const label = orderLabel(p);
      if (canSeeProduction) {
        const { bottleneckStage } = summarizeProduction(p.id);
        if (bottleneckStage) {
          items.push({
            type: "production_stalled",
            projectId: p.id,
            label,
            detail: `${bottleneckStage} has received more than it has passed OK — may be a bottleneck.`,
          });
        }
      }
      if (canSeeQms) {
        const qms = summarizeQms(p.id);
        if (qms.gatePendingCount > 0) {
          items.push({
            type: "qms_pending",
            projectId: p.id,
            label,
            detail: `${qms.gatePendingCount} QMS inspection(s) still pending.`,
          });
        }
      }
      if (!p.poNumber) {
        items.push({
          type: "no_po",
          projectId: p.id,
          label,
          detail: "No PO number recorded.",
        });
      }
      if ((p.assignedEmployeeIds || []).length === 0) {
        items.push({
          type: "unassigned",
          projectId: p.id,
          label,
          detail: "No employee assigned.",
        });
      }
    }
    if (canSeeInvoices) {
      for (const inv of s.invoices) {
        if (inv.status !== "Paid" && inv.dueDate && inv.dueDate < today) {
          const project = s.projects.find((p) => p.id === inv.projectId);
          items.push({
            type: "invoice_overdue",
            projectId: inv.projectId,
            label: project ? orderLabel(project) : inv.invNo,
            detail: `Invoice ${inv.invNo} due ${inv.dueDate}, still ${inv.status}.`,
          });
        }
      }
    }
    void qs; // reserved: gate-inspection detail already covered via summarizeQms above
    return {
      ok: true,
      message: `${items.length} item(s) worth checking.`,
      data: items,
      caveats: [
        "These are risk SIGNALS from simple field comparisons, not confirmed problems — verify before acting on any of them.",
      ],
    };
  },
};

export interface CustomerActivityEntry {
  projectId: string;
  projectLabel: string;
  type: string;
  description: string;
  performedBy: string;
  timestamp: number;
}

/** Recent activity across ALL of a customer's orders, merged and sorted —
 * FabFlow has no separate customer-level activity table, so this reads
 * the same per-project activityLog every other activity view already
 * uses and aggregates it across the customer's orders. Capped to the
 * most recent 30 entries to keep the tool result small (see
 * MAX_TOOL_RESULT_CHARS in the orchestrator) — a targeted recent-history
 * view, not a full export. */
export const getCustomerActivity: AgentQuery<
  { customerId: string },
  CustomerActivityEntry[]
> = {
  name: "getCustomerActivity",
  description:
    "Recent activity/history across all of a customer's orders (project creation, PO received, dispatch, payments, notes, etc.), most recent first.",
  permission: "customers.view",
  parameters: {
    type: "object",
    properties: {
      customerId: {
        type: "string",
        description: "The customer id (resolve via searchCustomers first).",
      },
    },
    required: ["customerId"],
  },
  execute: ({ customerId }) => {
    const s = useStore.getState();
    const customer = s.customers.find((c) => c.id === customerId);
    if (!customer) return { ok: false, message: "Customer not found." };
    const orders = s.projects.filter((p) => p.customerId === customerId);
    const entries: CustomerActivityEntry[] = [];
    for (const p of orders) {
      for (const a of p.activityLog || []) {
        entries.push({
          projectId: p.id,
          projectLabel: orderLabel(p),
          type: a.type,
          description: a.description,
          performedBy: a.performedBy,
          timestamp: a.timestamp,
        });
      }
    }
    entries.sort((a, b) => b.timestamp - a.timestamp);
    const capped = entries.slice(0, 30);
    return {
      ok: true,
      message: `${capped.length} recent activity entr${capped.length === 1 ? "y" : "ies"} for ${customer.name}${entries.length > capped.length ? ` (of ${entries.length} total)` : ""}.`,
      data: capped,
    };
  },
};

// ── getVendorLedger (Master directive — Payables now persisted) ───────────
// Same shape as getCustomerLedger, now safe to expose: payables/
// payablePayments are Supabase-hydrated as of Phase M.1 (see
// lib/payablesApi.ts, database/phase-m1/) — no longer local-only, so
// this genuinely reflects shared ERP data rather than session-local
// sample rows. Reuses buildVendorLedgerEntries/resolveDateRange/
// computeLedger completely unchanged.
export interface VendorLedgerData {
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
  outstanding: number;
  rows: Array<{
    date: string;
    docType: string;
    docNo: string;
    description: string;
    debit: number;
    credit: number;
    balance: number;
    informational: boolean;
    status?: string;
    projectId?: string;
    // Monster-1 — the row's real underlying record id (a payable's or a
    // payment's), so a write action like deletePayablePayment can resolve
    // a specific payment unambiguously instead of guessing from
    // date/amount. Was previously dropped from the exposed row shape.
    sourceId: string;
  }>;
}

export const getVendorLedger: AgentQuery<
  {
    vendorId: string;
    datePreset?: string;
    customStart?: string;
    customEnd?: string;
    projectId?: string;
  },
  VendorLedgerData
> = {
  name: "getVendorLedger",
  description:
    "A vendor's ledger: payables and payments combined into a running-balance statement. Always call searchVendors first to resolve the real vendor.",
  permission: "ledger.view",
  parameters: {
    type: "object",
    properties: {
      vendorId: {
        type: "string",
        description: "The vendor id (resolve via searchVendors first).",
      },
      datePreset: {
        type: "string",
        description:
          'One of "all" (default), "today", "this_month", "last_month", "custom".',
      },
      customStart: {
        type: "string",
        description:
          'Start date (YYYY-MM-DD), only used when datePreset is "custom".',
      },
      customEnd: {
        type: "string",
        description:
          'End date (YYYY-MM-DD), only used when datePreset is "custom".',
      },
      projectId: {
        type: "string",
        description:
          "Optional project id (resolve via findProject first) to filter the ledger to one project.",
      },
    },
    required: ["vendorId"],
  },
  execute: (
    { vendorId, datePreset, customStart, customEnd, projectId },
    ctx,
  ) => {
    const s = useStore.getState();
    const vendor = s.vendors.find((v) => v.id === vendorId);
    if (!vendor) return { ok: false, message: "Vendor not found." };

    const canSeePayables = hasPermission(ctx.currentUser, "payables.view");
    const caveats: string[] = [];
    if (!canSeePayables)
      caveats.push("Payables excluded (no payables.view permission).");

    const entries = buildVendorLedgerEntries({
      vendorId,
      vendorName: vendor.name,
      payables: canSeePayables ? s.payables : [],
      payablePayments: canSeePayables ? s.payablePayments : [],
      companyPOs: s.companyPOs,
    });
    const filtered = projectId
      ? entries.filter((e) => e.projectId === projectId)
      : entries;

    const range = resolveDateRange(
      (datePreset as DateRangePreset) || "all",
      customStart,
      customEnd,
    );
    const computation = computeLedger(filtered, range);
    const rows = computation.rows.slice(-MAX_LEDGER_ROWS);
    if (computation.rows.length > rows.length) {
      caveats.push(
        `Showing the most recent ${rows.length} of ${computation.rows.length} entries.`,
      );
    }

    return {
      ok: true,
      message: `Ledger for ${vendor.name}: ${rows.length} entr${rows.length === 1 ? "y" : "ies"}, closing balance ₹${computation.closingBalance.toLocaleString("en-IN")}.`,
      data: {
        openingBalance: computation.openingBalance,
        closingBalance: computation.closingBalance,
        totalDebit: computation.totalDebit,
        totalCredit: computation.totalCredit,
        outstanding: computation.outstanding,
        rows: rows.map((r) => ({
          date: r.date,
          docType: r.docType,
          docNo: r.docNo,
          description: r.description,
          debit: r.debit,
          credit: r.credit,
          balance: r.balance,
          informational: r.informational,
          status: r.status,
          projectId: r.projectId,
          sourceId: r.sourceId,
        })),
      },
      caveats: caveats.length > 0 ? caveats : undefined,
    };
  },
};

const DATE_PRESET_LABELS: Record<string, string> = {
  all: "All Time",
  today: "Today",
  this_month: "This Month",
  last_month: "Last Month",
};

// ── exportLedger (Phase L) ───────────────────────────────────────────────
// Reuses buildCustomerLedgerEntries/buildVendorLedgerEntries/
// resolveDateRange/computeLedger EXACTLY as getCustomerLedger/
// getVendorLedger do above — no parallel ledger computation. The only
// differences from those two queries: (1) rows are never sliced to
// MAX_LEDGER_ROWS — a downloadable file must contain the complete
// requested range; (2) the result is uploaded to Storage via
// ledgerExportRemote.ts and a signed URL is returned instead of raw
// rows; (3) permission is ledger.export (matching Ledger.tsx's own
// export buttons), not ledger.view. Vendor exports refuse cleanly if
// Payables hydration hasn't succeeded (see phase-m1 in the Phase L
// investigation report) rather than silently exporting a misleadingly
// empty ledger.
export const exportLedger: AgentQuery<
  {
    accountType: "customer" | "vendor";
    accountId: string;
    format?: "csv" | "excel";
    datePreset?: string;
    customStart?: string;
    customEnd?: string;
    projectId?: string;
  },
  { fileName: string; url: string; rowCount: number; expiresAt: string }
> = {
  name: "exportLedger",
  description:
    "Generate a downloadable CSV or Excel file of a customer's or vendor's ledger and return a link to it. Always call searchCustomers or searchVendors first to resolve the real account — never guess. If a project was named, resolve it via findProject first. The exported file contains the COMPLETE requested date range, unlike getCustomerLedger/getVendorLedger's chat display which caps at the most recent 200 entries.",
  permission: "ledger.export",
  parameters: {
    type: "object",
    properties: {
      accountType: {
        type: "string",
        description: 'One of "customer" or "vendor".',
      },
      accountId: {
        type: "string",
        description:
          "The customer id or vendor id (resolve via searchCustomers/searchVendors first).",
      },
      format: {
        type: "string",
        description: 'One of "csv" (default) or "excel".',
      },
      datePreset: {
        type: "string",
        description:
          'One of "all" (default), "today", "this_month", "last_month", "custom".',
      },
      customStart: {
        type: "string",
        description:
          'Start date (YYYY-MM-DD), only used when datePreset is "custom".',
      },
      customEnd: {
        type: "string",
        description:
          'End date (YYYY-MM-DD), only used when datePreset is "custom".',
      },
      projectId: {
        type: "string",
        description:
          "Optional project id (resolve via findProject first) to filter the export to one project.",
      },
    },
    required: ["accountType", "accountId"],
  },
  execute: async (
    {
      accountType,
      accountId,
      format,
      datePreset,
      customStart,
      customEnd,
      projectId,
    },
    ctx,
  ) => {
    const s = useStore.getState();
    const at: "customer" | "vendor" =
      accountType === "vendor" ? "vendor" : "customer";
    const fileFormat: "csv" | "excel" = format === "excel" ? "excel" : "csv";
    const caveats: string[] = [];
    let accountLabel: string;
    let entries: ReturnType<typeof buildCustomerLedgerEntries>;

    if (at === "customer") {
      const customer = s.customers.find((c) => c.id === accountId);
      if (!customer) return { ok: false, message: "Customer not found." };
      accountLabel = customer.name;
      const canSeeQuotations = hasPermission(
        ctx.currentUser,
        "quotations.view",
      );
      const canSeeInvoices = hasPermission(ctx.currentUser, "invoices.view");
      const canSeePayments = hasPermission(ctx.currentUser, "payments.view");
      if (!canSeeQuotations)
        caveats.push("Quotations excluded (no quotations.view permission).");
      if (!canSeeInvoices)
        caveats.push("Invoices excluded (no invoices.view permission).");
      if (!canSeePayments)
        caveats.push("Payments excluded (no payments.view permission).");
      entries = buildCustomerLedgerEntries({
        customerId: accountId,
        quotations: canSeeQuotations ? s.quotations : [],
        invoices: canSeeInvoices ? s.invoices : [],
        payments: canSeePayments ? s.payments : [],
      });
    } else {
      const vendor = s.vendors.find((v) => v.id === accountId);
      if (!vendor) return { ok: false, message: "Vendor not found." };
      // Fail honestly rather than exporting a misleading zero-entry
      // ledger when the underlying Payables tables aren't set up yet
      // (see phase-m1 in the Phase L investigation report).
      if (s.payablesHydration.status !== "success") {
        return {
          ok: false,
          message:
            s.payablesHydration.status === "error"
              ? `Vendor Ledger export isn't available: Payables data failed to load (${s.payablesHydration.error ?? "unknown error"}). This usually means the underlying database isn't fully set up yet — tell the user to contact their administrator rather than treating this as a zero-balance ledger.`
              : "Vendor Ledger export isn't available right now — Payables data hasn't finished loading. Try again in a moment.",
        };
      }
      accountLabel = vendor.name;
      const canSeePayables = hasPermission(ctx.currentUser, "payables.view");
      if (!canSeePayables)
        caveats.push("Payables excluded (no payables.view permission).");
      entries = buildVendorLedgerEntries({
        vendorId: accountId,
        vendorName: vendor.name,
        payables: canSeePayables ? s.payables : [],
        payablePayments: canSeePayables ? s.payablePayments : [],
        companyPOs: s.companyPOs,
      });
    }

    const filtered = projectId
      ? entries.filter((e) => e.projectId === projectId)
      : entries;
    const range = resolveDateRange(
      (datePreset as DateRangePreset) || "all",
      customStart,
      customEnd,
    );
    const computation = computeLedger(filtered, range);
    // Deliberately NOT sliced to MAX_LEDGER_ROWS, unlike
    // getCustomerLedger/getVendorLedger above — a downloadable file must
    // contain the complete requested range.
    const rows = computation.rows;

    const periodLabel =
      (datePreset || "all") === "all"
        ? "All Time"
        : datePreset === "custom"
          ? `${range.start || "…"} to ${range.end || "…"}`
          : DATE_PRESET_LABELS[datePreset || ""] || "All Time";

    const meta: LedgerExportMeta = {
      companyName: s.settings.companyName || "Company",
      accountType: at === "customer" ? "Customer" : "Vendor",
      accountLabel,
      periodLabel,
      openingBalance: computation.openingBalance,
      closingBalance: computation.closingBalance,
      totalDebit: computation.totalDebit,
      totalCredit: computation.totalCredit,
      outstanding: computation.outstanding,
    };

    const dateStamp = new Date().toISOString().split("T")[0];
    const fileBase = `Ledger_${accountLabel.replace(/\s+/g, "_")}_${dateStamp}`;
    const content =
      fileFormat === "excel"
        ? buildLedgerExcelContent(rows, meta)
        : buildLedgerCsvContent(rows, meta);
    const mimeType =
      fileFormat === "excel"
        ? "application/vnd.ms-excel"
        : "text/csv;charset=utf-8;";
    const fileName = `${fileBase}.${fileFormat === "excel" ? "xls" : "csv"}`;

    const upload = await uploadLedgerExport(content, mimeType, fileName);
    if (!upload.ok) {
      return {
        ok: false,
        message: `Could not generate the export file: ${upload.error}`,
      };
    }

    return {
      ok: true,
      message: `Generated ${meta.accountType} Ledger export for ${accountLabel} — ${rows.length} entr${rows.length === 1 ? "y" : "ies"}, ${fileFormat.toUpperCase()} format. Download: ${upload.url} (link expires in 24 hours).`,
      data: {
        fileName: upload.fileName,
        url: upload.url,
        rowCount: rows.length,
        expiresAt: upload.expiresAt,
      },
      caveats: caveats.length > 0 ? caveats : undefined,
    };
  },
};

// ── searchMachines (Master directive) ──────────────────────────────────────
export const searchMachines: AgentQuery<
  { name?: string },
  Array<{
    id: string;
    machineCode: string;
    name: string;
    type: string;
    status: string;
  }>
> = {
  name: "searchMachines",
  description:
    "Find machines by name or list all — resolve a real machine id here before referencing one elsewhere; never invent one.",
  permission: "machinery.view",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Machine name to search for, optional.",
      },
    },
    required: [],
  },
  execute: ({ name }) => {
    const q = (name ?? "").trim().toUpperCase();
    const matches = useStore
      .getState()
      .machines.filter((m) => !q || m.name.toUpperCase().includes(q));
    return {
      ok: true,
      message: `Found ${matches.length} machine(s).`,
      data: matches.map((m) => ({
        id: m.id,
        machineCode: m.machineCode,
        name: m.name,
        type: m.type,
        status: m.currentStatus,
      })),
    };
  },
};

// ── searchTools / searchDies (Monster-1) ────────────────────────────
// Same shape as searchMachines — entity resolution + general listing for
// two domains that already had write actions (createTool/createDie) but
// no dedicated search tool, so a plain "how many tools do we have" /
// "is there a punch die available" question had no read path.
export const searchTools: AgentQuery<
  { name?: string },
  Array<{
    id: string;
    toolCode: string;
    name: string;
    category?: string;
    quantity: number;
    status: string;
  }>
> = {
  name: "searchTools",
  description:
    "Find tools by name or list all — resolve a real tool id here before referencing one elsewhere; never invent one.",
  permission: "tools.view",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Tool name to search for, optional.",
      },
    },
    required: [],
  },
  execute: ({ name }) => {
    const q = (name ?? "").trim().toUpperCase();
    const matches = useStore
      .getState()
      .tools.filter((t) => !q || t.name.toUpperCase().includes(q));
    return {
      ok: true,
      message: `Found ${matches.length} tool(s).`,
      data: matches.map((t) => ({
        id: t.id,
        toolCode: t.toolCode,
        name: t.name,
        category: t.category,
        quantity: t.quantity,
        status: t.status,
      })),
    };
  },
};

export const searchDies: AgentQuery<
  { name?: string },
  Array<{
    id: string;
    dieCode: string;
    name: string;
    type?: string;
    status: string;
  }>
> = {
  name: "searchDies",
  description:
    "Find dies by name or list all — resolve a real die id here before referencing one elsewhere; never invent one.",
  permission: "tooling_dies.view",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Die name to search for, optional.",
      },
    },
    required: [],
  },
  execute: ({ name }) => {
    const q = (name ?? "").trim().toUpperCase();
    const matches = useStore
      .getState()
      .dies.filter((d) => !q || d.name.toUpperCase().includes(q));
    return {
      ok: true,
      message: `Found ${matches.length} die(s).`,
      data: matches.map((d) => ({
        id: d.id,
        dieCode: d.dieCode,
        name: d.name,
        type: d.type,
        status: d.status,
      })),
    };
  },
};

// ── searchBillableServices (Master directive) ─────────────────────────────
// Entity resolution for Machine/Service Revenue usage recording — "laser
// cutting" in a natural-language request must resolve to a real
// billableServiceId here, never be guessed.
export const searchBillableServices: AgentQuery<
  { name?: string },
  Array<{
    id: string;
    name: string;
    machineId?: string;
    chargingMethod: string;
    unitLabel?: string;
    currentRate: number;
  }>
> = {
  name: "searchBillableServices",
  description:
    "Find billable machine/service-revenue services by name (e.g. 'laser cutting') or list all active ones — resolve a real billableServiceId here before recordMachineServiceUsage; never invent one. Includes each service's current rate.",
  permission: "machine_revenue.view",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Service name to search for, optional.",
      },
    },
    required: [],
  },
  execute: ({ name }) => {
    const s = useStore.getState();
    const q = (name ?? "").trim().toUpperCase();
    const matches = (s.billableServices || []).filter(
      (svc) =>
        svc.isActive !== false && (!q || svc.name.toUpperCase().includes(q)),
    );
    return {
      ok: true,
      message: `Found ${matches.length} billable service(s).`,
      data: matches.map((svc) => ({
        id: svc.id,
        name: svc.name,
        machineId: svc.machineId,
        chargingMethod: svc.chargingMethod,
        unitLabel: svc.unitLabel,
        currentRate: getCurrentServiceRate(svc.id, s.machineServiceRates || []),
      })),
    };
  },
};

// ── findPendingQmsInspections (Master directive) ───────────────────────────
// Org-wide list, complementing findAttentionItems's single qms_pending
// signal with the actual per-project pending count — reuses
// summarizeQms() unchanged, no new QMS business logic.
export const findPendingQmsInspections: AgentQuery<
  Record<string, never>,
  Array<{
    projectId: string;
    projectLabel: string;
    gatePendingCount: number;
    sheetStatus: string | null;
  }>
> = {
  name: "findPendingQmsInspections",
  description:
    "List every project with pending QMS gate inspections (received but not yet passed), most-pending first.",
  permission: "inspection_sheets.view",
  parameters: { type: "object", properties: {}, required: [] },
  execute: () => {
    const s = useStore.getState();
    const results = s.projects
      .map((p) => ({ project: p, qms: summarizeQms(p.id) }))
      .filter((r) => r.qms.gatePendingCount > 0)
      .map((r) => ({
        projectId: r.project.id,
        projectLabel: orderLabel(r.project),
        gatePendingCount: r.qms.gatePendingCount,
        sheetStatus: r.qms.sheetStatus,
      }))
      .sort((a, b) => b.gatePendingCount - a.gatePendingCount);
    return {
      ok: true,
      message: `${results.length} project(s) with pending QMS inspections.`,
      data: results,
    };
  },
};

// ── findMyAssignedInspections (Master directive) ───────────────────────────
// "Assigned to me" — uses the existing, already-established
// InspectionStageCompletion.assignedTo field (Inspection Sheet workflow)
// exactly as the data model already defines it; no interpretation
// invented. Matches against ctx.currentUser.id, the same identity every
// other permission check in this file already uses.
export const findMyAssignedInspections: AgentQuery<
  Record<string, never>,
  Array<{
    sheetId: string;
    stageId: string;
    projectId: string | null;
    inspectionNumber: string | null;
    dueDate?: string;
  }>
> = {
  name: "findMyAssignedInspections",
  description:
    "List QMS inspection stages assigned to the current user that are not yet completed.",
  permission: "inspection_sheets.view",
  parameters: { type: "object", properties: {}, required: [] },
  execute: (_params, ctx) => {
    const qs = useQmsStore.getState();
    const mine = (qs.stageCompletions || []).filter(
      (c) => c.assignedTo === ctx.currentUser.id && !c.completedAt,
    );
    const data = mine.map((c) => {
      const sheet = qs.inspectionSheets.find((sh) => sh.id === c.sheetId);
      return {
        sheetId: c.sheetId,
        stageId: c.stageId,
        projectId: sheet?.projectId ?? null,
        inspectionNumber: sheet?.inspectionNumber ?? null,
        dueDate: c.dueDate,
      };
    });
    return {
      ok: true,
      message: `${data.length} inspection stage(s) assigned to you, not yet completed.`,
      data,
    };
  },
};

export const QUERIES: Record<string, AgentQuery<any, any>> = {
  searchCustomers,
  searchInventoryItems,
  searchMaterialRequisitions,
  searchDeliveryChallans,
  searchInvoices,
  searchQuotations,
  searchCustomerPOs,
  searchVendors,
  searchCompanyPOs,
  searchExpenseFloats,
  getCustomerLedger,
  getCustomerOverview,
  getProjectStatus,
  getEmployeeWorkload,
  getProjectPurchaseOrder,
  getProjectMaterials,
  getInvoiceStatus,
  getCustomerActivity,
  getDeliveryStatus,
  getEmployeeOverload,
  findAttentionItems,
  getProjectDocuments,
  searchDrawings,
  getVendorLedger,
  exportLedger,
  searchMachines,
  searchTools,
  searchDies,
  searchBillableServices,
  findPendingQmsInspections,
  findMyAssignedInspections,
};

/** Same shape as agent/actions.ts's runAction, deliberately: permission
 * check first, then execute, never bypassing hasPermission — a query is
 * read-only but still subject to "if the user can't see it by hand, the
 * Agent can't show it to them either." Always async (some queries need a
 * round-trip; callers should not care which). */
export async function runQuery(
  queryName: string,
  params: Record<string, unknown>,
  ctx: AgentQueryContext,
): Promise<AgentQueryResult<unknown>> {
  const query = QUERIES[queryName];
  if (!query) return { ok: false, message: `Unknown query "${queryName}".` };
  if (!hasPermission(ctx.currentUser, query.permission)) {
    return {
      ok: false,
      message: `Blocked: you don't have permission (${query.permission}) to see this.`,
    };
  }
  try {
    return await query.execute(params, ctx);
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "The query failed unexpectedly.",
    };
  }
}
