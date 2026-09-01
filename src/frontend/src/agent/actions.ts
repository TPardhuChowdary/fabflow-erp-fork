// FabFlow AI Agent — Action Registry (Phase 1).
//
// Every action below is a thin wrapper around an already-existing,
// already-verified ERP write path — the same functions Customers.tsx,
// Projects.tsx, ProjectDetail.tsx and the Drawing Repository already call.
// Nothing here talks to Supabase directly, nothing here re-implements
// business logic (project numbering, repeat-order sequencing, activity
// logging), and nothing here can do anything the currently logged-in user
// couldn't already do by hand in the normal UI — see each action's
// `permission` and the hasPermission() check in runAction() below.

import { addLink } from "@/drawingEditor/api/drawings";
import { createAdvanceRecordRemote } from "@/lib/advanceRecordsApi";
import {
  recordMaterialPurchaseRemote,
  updateBomRequisitionStatusRemote,
} from "@/lib/bomItemsApi";
import {
  computeNextCpoNumber,
  createCompanyPORemote,
} from "@/lib/companyPosApi";
import { createCustomerRemote } from "@/lib/customersApi";
import {
  computeNextDcNumber,
  createDeliveryChallanRemote,
} from "@/lib/deliveryChallansApi";
import { computeNextDieCode, createDieRemote } from "@/lib/diesApi";
import { createEmployeeRemote } from "@/lib/employeesApi";
import {
  computeNextFloatNumber,
  createExpenseFloatRemote,
  createPettyExpenseRemote,
} from "@/lib/expenseFloatsApi";
import { hydrateBomRequisitions } from "@/lib/hydration";
import { createInventoryPurchaseRemote } from "@/lib/inventoryPurchasesApi";
import { createInventoryUsageRemote } from "@/lib/inventoryUsagesApi";
import { createInvoiceRemote } from "@/lib/invoicesApi";
import {
  createBillableServiceRemote,
  createServiceUsageRemote,
  getCurrentServiceRate,
} from "@/lib/machineRevenueApi";
import { computeNextMachineCode, createMachineRemote } from "@/lib/machinesApi";
import { checkMaterialAvailability } from "@/lib/materialAvailability";
import {
  createPayablePaymentRemote,
  createPayableRemote,
  deletePayablePaymentRemote,
  getPayableRemote,
  updatePayableRemote,
} from "@/lib/payablesApi";
import { createPaymentRemote } from "@/lib/paymentsApi";
import { addProjectEmployeeRemote } from "@/lib/projectEmployeesApi";
import {
  computeNextProjectNumber,
  createProjectRemote,
  updateProjectRemote,
} from "@/lib/projectsApi";
import {
  createMasterPORemote,
  createProjectPurchaseOrderRemote,
  createQuotationPurchaseOrderRemote,
} from "@/lib/purchaseOrdersApi";
import {
  computeNextQtNumber,
  createQuotationRemote,
  createQuotationRevisionRemote,
} from "@/lib/quotationsApi";
import { createScrapRecordRemote } from "@/lib/scrapApi";
import { getSupabase } from "@/lib/supabaseClient";
import { computeNextToolCode, createToolRemote } from "@/lib/toolsApi";
import { createVendorRemote } from "@/lib/vendorsApi";
import { hasPermission } from "@/permissions";
import { assignStage, getAllStageCompletions } from "@/qms/api/inspections";
import { getStageInspectionGate } from "@/qms/lib/productionGate";
import { useQmsStore } from "@/qms/store/useQmsStore";
import { resolveFloatLink, useStore } from "@/store";
import type {
  ChargingMethod,
  CompanyPOItem,
  CompanyPOStatus,
  DCStatus,
  DieStatus,
  InvLineItem,
  LineItem,
  MachineStatus,
  MachineType,
  PaymentMode,
  PettyExpenseMode,
  PettyExpenseType,
  ProjectStageStatus,
  ScrapStatus,
  StageTransaction,
  ToolStatus,
} from "@/types";
import type {
  AgentAction,
  AgentActionContext,
  AgentActionOutcome,
} from "./types";

const PAYMENT_MODES: PaymentMode[] = ["Cash", "Cheque", "NEFT", "RTGS", "UPI"];
const DC_STATUSES: DCStatus[] = ["Prepared", "Dispatched", "Delivered"];

function required(params: Record<string, unknown>, key: string): string {
  const v = params[key];
  if (typeof v !== "string" || !v.trim()) {
    throw new Error(
      `"${key}" is required and was not understood — please specify it.`,
    );
  }
  return v.trim();
}

function requiredNumber(params: Record<string, unknown>, key: string): number {
  const v = Number(params[key]);
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(`"${key}" must be a positive number.`);
  }
  return v;
}

// ── findCustomer ──────────────────────────────────────────────────────
export const findCustomer: AgentAction = {
  name: "findCustomer",
  description: "Search existing customers by name.",
  permission: "customers.view",
  riskLevel: "low",
  kind: "read",
  destructive: false,
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
  validate: (p) => ({ name: required(p, "name") }),
  execute: async ({ name }): Promise<AgentActionOutcome> => {
    const q = String(name).trim().toUpperCase();
    const matches = useStore
      .getState()
      .customers.filter((c) => c.name.toUpperCase().includes(q));
    if (matches.length === 0) {
      return { ok: false, message: `No customer found matching "${name}".` };
    }
    return {
      ok: true,
      message: `Found ${matches.length} customer(s) matching "${name}".`,
      data: { matches: matches.map((c) => ({ id: c.id, name: c.name })) },
    };
  },
};

// ── createCustomer ────────────────────────────────────────────────────
export const createCustomer: AgentAction = {
  name: "createCustomer",
  description: "Create a new customer (company).",
  permission: "customers.create",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Company/customer name." },
      contactPerson: {
        type: "string",
        description: "Primary contact person's name (optional).",
      },
      phone: {
        type: "string",
        description: "Contact phone number (optional).",
      },
      email: {
        type: "string",
        description: "Contact email address (optional).",
      },
      address: {
        type: "string",
        description: "Billing/business address (optional).",
      },
      gstin: { type: "string", description: "GSTIN, if known (optional)." },
    },
    required: ["name"],
  },
  validate: (p) => ({
    name: required(p, "name"),
    contactPerson: (p.contactPerson as string) || "",
    phone: (p.phone as string) || "",
    email: (p.email as string) || "",
    address: (p.address as string) || "",
    gstin: (p.gstin as string) || "",
  }),
  execute: async (p): Promise<AgentActionOutcome> => {
    const result = await createCustomerRemote({
      name: p.name as string,
      contactPerson: p.contactPerson as string,
      phone: p.phone as string,
      email: p.email as string,
      address: p.address as string,
      gstin: p.gstin as string,
    });
    if (result.status !== "success" || !result.data) {
      return {
        ok: false,
        message: `Could not create customer: ${result.error ?? result.status}`,
      };
    }
    useStore.getState().addCustomer(result.data);
    return {
      ok: true,
      message: `Created customer "${result.data.name}" (id ${result.data.id}).`,
      data: { id: result.data.id, name: result.data.name },
    };
  },
};

// ── findProject ───────────────────────────────────────────────────────
export const findProject: AgentAction = {
  name: "findProject",
  description:
    "Search existing projects by name or project number (e.g. PROJ-2026-012), optionally scoped to a customer.",
  permission: "projects.view",
  riskLevel: "low",
  kind: "read",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description:
          "Project/order name, partial name, or project number to search for.",
      },
      customerId: {
        type: "string",
        description: "Optional customer id to scope the search to.",
      },
    },
    required: ["name"],
  },
  validate: (p) => ({
    name: required(p, "name"),
    customerId: (p.customerId as string) || undefined,
  }),
  execute: async ({ name, customerId }): Promise<AgentActionOutcome> => {
    const q = String(name).trim().toUpperCase();
    // Monster-1: previously matched projectName/customerVisibleName only,
    // so a request naming a real project by its own project number (its
    // most natural identifier, e.g. "PROJ-2026-012") failed with "not
    // found" even though that exact project existed — confirmed live in
    // Phase P1.3 and again in the Production pass. projectNo is now
    // matched too, exact (case-insensitive) since it's a structured code,
    // not free text — a partial/substring match on it would be more
    // likely to mislead than help.
    let matches = useStore
      .getState()
      .projects.filter(
        (proj) =>
          proj.projectName.toUpperCase().includes(q) ||
          (proj.customerVisibleName ?? "").toUpperCase().includes(q) ||
          proj.projectNo.toUpperCase() === q,
      );
    if (customerId)
      matches = matches.filter((proj) => proj.customerId === customerId);
    if (matches.length === 0) {
      return { ok: false, message: `No project found matching "${name}".` };
    }
    return {
      ok: true,
      message: `Found ${matches.length} project(s) matching "${name}".`,
      data: {
        matches: matches.map((proj) => ({
          id: proj.id,
          name: proj.customerVisibleName || proj.projectName,
          projectNo: proj.projectNo,
          customerId: proj.customerId,
        })),
      },
    };
  },
};

// ── createProject ─────────────────────────────────────────────────────
export const createProject: AgentAction = {
  name: "createProject",
  description: "Create a new project for a customer.",
  permission: "projects.create",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      customerId: {
        type: "string",
        description:
          "The customer this project belongs to (resolve via findCustomer/searchCustomers first).",
      },
      projectName: { type: "string", description: "Project/order name." },
      workDescription: {
        type: "string",
        description: "Short description of the work (optional).",
      },
      totalQty: {
        type: "number",
        description: "Total quantity for this order, in pieces (optional).",
      },
    },
    required: ["customerId", "projectName"],
  },
  validate: (p) => ({
    customerId: required(p, "customerId"),
    projectName: required(p, "projectName"),
    workDescription: (p.workDescription as string) || "",
    totalQty: p.totalQty ? Number(p.totalQty) : undefined,
  }),
  execute: async (p): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    const customer = s.customers.find((c) => c.id === p.customerId);
    if (!customer) return { ok: false, message: "Customer not found." };
    const projectNo = computeNextProjectNumber(
      s.projects.map((proj) => proj.projectNo),
    );
    const result = await createProjectRemote({
      projectNo,
      customerId: p.customerId as string,
      projectName: p.projectName as string,
      workDescription: p.workDescription as string,
      totalQty: p.totalQty as number | undefined,
    });
    if (result.status !== "success" || !result.data) {
      return {
        ok: false,
        message: `Could not create project: ${result.error ?? result.status}`,
      };
    }
    s.addProject(result.data);
    return {
      ok: true,
      message: `Created project ${result.data.projectNo} "${result.data.projectName}" for ${customer.name}.`,
      data: { id: result.data.id, projectNo: result.data.projectNo },
    };
  },
};

// ── createRepeatOrder ─────────────────────────────────────────────────
export const createRepeatOrder: AgentAction = {
  name: "createRepeatOrder",
  description: "Create a repeat order from an existing project.",
  permission: "projects.create",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description:
          "The existing project/order to repeat (resolve via findProject/searchProjects first).",
      },
      newName: {
        type: "string",
        description: "Optional override name for the new order.",
      },
      quantity: {
        type: "number",
        description:
          "Quantity for the new order, in pieces (optional — otherwise inherits the source order's quantity).",
      },
    },
    required: ["projectId"],
  },
  validate: (p) => ({
    projectId: required(p, "projectId"),
    newName: (p.newName as string) || "",
    quantity: p.quantity ? Number(p.quantity) : undefined,
  }),
  execute: async (p): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    const source = s.projects.find((proj) => proj.id === p.projectId);
    if (!source) return { ok: false, message: "Source project not found." };

    const newId = await s.repeatProject(p.projectId as string, {
      newName: (p.newName as string) || "",
      copyDesignFiles: false,
      copyBOM: false,
      copyCosting: false,
      copyStages: false,
      copyQC: false,
      copyNotes: false,
    });
    if (!newId) {
      return { ok: false, message: "Could not create the repeat order." };
    }

    // repeatProject inherits the source project's quantity as-is (existing,
    // unmodified behaviour) — if the instruction named a specific quantity,
    // apply it as one additional, ordinary update through the same generic
    // project-update path every edit form already uses, rather than
    // changing repeatProject's own logic.
    let finalQty: number | undefined;
    if (p.quantity) {
      const created = useStore
        .getState()
        .projects.find((proj) => proj.id === newId);
      if (created) {
        const updateResult = await updateProjectRemote({
          ...created,
          totalQty: p.quantity as number,
        });
        if (updateResult.status === "success" && updateResult.data) {
          useStore.getState().updateProject(updateResult.data);
          finalQty = updateResult.data.totalQty;
        }
      }
    }

    const created = useStore
      .getState()
      .projects.find((proj) => proj.id === newId);
    return {
      ok: true,
      message: `Created repeat order ${created?.internalOrderCode ?? ""} from ${source.customerVisibleName || source.projectName}${finalQty ? `, quantity set to ${finalQty}.` : "."}`,
      data: { id: newId, internalOrderCode: created?.internalOrderCode },
    };
  },
};

// ── findEmployee ──────────────────────────────────────────────────────
export const findEmployee: AgentAction = {
  name: "findEmployee",
  description: "Search existing employees by name.",
  permission: "employees.view",
  riskLevel: "low",
  kind: "read",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Employee name or partial name to search for.",
      },
    },
    required: ["name"],
  },
  validate: (p) => ({ name: required(p, "name") }),
  execute: async ({ name }): Promise<AgentActionOutcome> => {
    const q = String(name).trim().toLowerCase();
    const matches = useStore
      .getState()
      .employees.filter((e) => e.name.toLowerCase().includes(q));
    if (matches.length === 0) {
      return { ok: false, message: `No employee found matching "${name}".` };
    }
    return {
      ok: true,
      message: `Found ${matches.length} employee(s) matching "${name}".`,
      data: { matches: matches.map((e) => ({ id: e.id, name: e.name })) },
    };
  },
};

// ── createWorkCard ────────────────────────────────────────────────────
// IMPORTANT LIMITATION (see final report): FabFlow has no dedicated Work
// Card entity today — no table with employee/task/duration/rate/target
// columns. `project_employees` is a bare assignment link (no task/hours/
// rate at all); ProjectActivity is a free-form note log. Per instructions,
// no new table was created. This action does the most honest real thing
// available: links the employee to the project (if not already linked,
// via the existing project_employees API) and records a structured note
// on the project's existing activity log — genuinely persisted, visible
// in ProjectDetail's Activity tab today, but NOT a trackable/status
// record the way a real Work Card would be.
export const createWorkCard: AgentAction = {
  name: "createWorkCard",
  description:
    "Record a work assignment (employee, task, duration, rate) against a project. " +
    "NOTE: FabFlow has no dedicated Work Card table yet — this records a project activity note, not a trackable work-card record.",
  permission: "projects.edit",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      employeeId: {
        type: "string",
        description:
          "The employee to assign (resolve via findEmployee/searchProjects first).",
      },
      projectId: {
        type: "string",
        description: "The project/order this work is for.",
      },
      task: {
        type: "string",
        description: 'Short description of the task, e.g. "box welding".',
      },
      durationHours: {
        type: "number",
        description: "Allocated hours for this assignment.",
      },
      piecesPerHour: {
        type: "number",
        description: "Expected production rate, in pieces per hour.",
      },
    },
    required: [
      "employeeId",
      "projectId",
      "task",
      "durationHours",
      "piecesPerHour",
    ],
  },
  validate: (p) => ({
    employeeId: required(p, "employeeId"),
    projectId: required(p, "projectId"),
    task: required(p, "task"),
    durationHours: requiredNumber(p, "durationHours"),
    piecesPerHour: requiredNumber(p, "piecesPerHour"),
  }),
  execute: async (p): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    const project = s.projects.find((proj) => proj.id === p.projectId);
    if (!project) return { ok: false, message: "Project not found." };
    const employee = s.employees.find((e) => e.id === p.employeeId);
    if (!employee) return { ok: false, message: "Employee not found." };

    const durationHours = p.durationHours as number;
    const piecesPerHour = p.piecesPerHour as number;
    const targetQuantity = Math.round(durationHours * piecesPerHour);

    if (!(project.assignedEmployeeIds || []).includes(p.employeeId as string)) {
      const linkResult = await addProjectEmployeeRemote(
        p.projectId as string,
        p.employeeId as string,
      );
      if (linkResult.status === "error") {
        return {
          ok: false,
          message: `Could not assign ${employee.name} to the project: ${linkResult.error}`,
        };
      }
    }

    const description =
      `Work assignment: ${employee.name} — ${p.task}, ${durationHours}h ` +
      `at ${piecesPerHour} pcs/hr (target ${targetQuantity} pcs)`;
    await s.addProjectActivity(
      p.projectId as string,
      "note",
      description,
      "AI Agent",
      {
        employeeId: p.employeeId as string,
        employeeName: employee.name,
        task: p.task as string,
        durationHours,
        piecesPerHour,
        targetQuantity,
      },
    );

    return {
      ok: true,
      message:
        `Recorded work assignment for ${employee.name}: ${p.task}, ${durationHours}h @ ${piecesPerHour} pcs/hr ` +
        `→ target ${targetQuantity} pcs. Logged as a project activity note (FabFlow has no dedicated Work Card entity yet).`,
      data: {
        projectId: p.projectId,
        employeeId: p.employeeId,
        targetQuantity,
      },
    };
  },
};

// ── recordStageTransaction (Monster-1, QMS/Production pass) ─────────
// Production.tsx's own "Send Material" / "Receive Material" dialogs,
// exposed to the Agent. addStageTransaction is already an atomic,
// single-insert store action (unlike upsertProjectProduction's whole-
// array replace) — the safe half of the Production Stages write
// surface to expose here. Stage completion / status transitions are
// deliberately NOT exposed: they go through the whole-stage-array
// upsert, and getting a partial natural-language edit right there
// without silently touching every other stage is real, unbuilt scope,
// not a quick wire-up — flagged, not attempted.
export const recordStageTransaction: AgentAction = {
  name: "recordStageTransaction",
  description:
    'Record material sent to (or received back from) a production stage. Always call findProject first to resolve the real project; use searchVendors to resolve a real vendor for a "send" if one applies, or pass vendorName "In-house" for in-house work.',
  permission: "production.edit",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description: "Project id (resolve via findProject first — required).",
      },
      stageName: {
        type: "string",
        description:
          'The exact stage name as it appears on the project\'s production stages (e.g. "Cutting", "Bending").',
      },
      type: {
        type: "string",
        description: '"send" or "receive".',
      },
      quantity: {
        type: "number",
        description: "Quantity, must be greater than 0.",
      },
      vendorId: {
        type: "string",
        description:
          'Vendor id for a "send", optional — resolve via searchVendors first if a real vendor applies.',
      },
      vendorName: {
        type: "string",
        description:
          'Vendor name for a "send", optional — use "In-house" for in-house work.',
      },
      dateTime: {
        type: "string",
        description: "ISO date/time, optional — defaults to now.",
      },
    },
    required: ["projectId", "stageName", "type", "quantity"],
  },
  validate: (p) => {
    const type = String(p.type ?? "");
    if (type !== "send" && type !== "receive") {
      throw new Error('"type" must be "send" or "receive".');
    }
    return {
      projectId: required(p, "projectId"),
      stageName: required(p, "stageName"),
      type: type as "send" | "receive",
      quantity: requiredNumber(p, "quantity"),
      vendorId: (p.vendorId as string) || "",
      vendorName: (p.vendorName as string) || "",
      dateTime: (p.dateTime as string) || new Date().toISOString(),
    };
  },
  execute: async (p): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    const project = s.projects.find((proj) => proj.id === p.projectId);
    if (!project) {
      return {
        ok: false,
        message: "Project not found — resolve it with findProject first.",
      };
    }
    const prod = s.projectProductions.find(
      (pp) => pp.projectId === p.projectId,
    );
    if (!prod || (prod.stages || []).length === 0) {
      return {
        ok: false,
        message: `${project.projectName} has no production stages set up.`,
      };
    }
    const stageName = (p.stageName as string).trim().toLowerCase();
    const stageIdx = (prod.stages || []).findIndex(
      (st) => st.stageName.trim().toLowerCase() === stageName,
    );
    if (stageIdx === -1) {
      const available = (prod.stages || [])
        .map((st) => st.stageName)
        .join(", ");
      return {
        ok: false,
        message: `No stage named "${p.stageName}" on this project. Available stages: ${available || "(none)"}.`,
      };
    }
    const stage = prod.stages[stageIdx];
    const type = p.type as "send" | "receive";
    const quantity = p.quantity as number;
    if (type === "receive") {
      const totalSent = (stage.transactions || [])
        .filter((t) => t.type === "send")
        .reduce((a, t) => a + t.quantity, 0);
      const totalReceived = (stage.transactions || [])
        .filter((t) => t.type === "receive")
        .reduce((a, t) => a + t.quantity, 0);
      // Same guard as Production.tsx's own handleReceiveMaterial —
      // replicated, not bypassed.
      if (totalReceived + quantity > totalSent) {
        return {
          ok: false,
          message: `Cannot receive ${quantity} — only ${totalSent - totalReceived} is outstanding for "${stage.stageName}".`,
        };
      }
    }
    const vendorId = p.vendorId as string;
    if (
      vendorId &&
      vendorId !== "inhouse" &&
      !s.vendors.find((v) => v.id === vendorId)
    ) {
      return {
        ok: false,
        message: "Vendor not found — resolve it with searchVendors first.",
      };
    }
    const tx: StageTransaction = {
      id: `tx-${Date.now()}`,
      type,
      quantity,
      dateTime: p.dateTime as string,
      sentToVendorId: type === "send" ? vendorId || undefined : undefined,
      sentToVendorName:
        type === "send" ? (p.vendorName as string) || undefined : undefined,
    };
    const ok = await s.addStageTransaction(p.projectId as string, stageIdx, tx);
    if (!ok) {
      return {
        ok: false,
        message: `Could not record the ${type === "send" ? "material sent" : "material received"} — please try again.`,
      };
    }
    return {
      ok: true,
      message: `Recorded ${quantity} unit(s) ${type === "send" ? "sent to" : "received back for"} "${stage.stageName}" on ${project.projectName}${
        type === "send" && p.vendorName ? ` (${p.vendorName})` : ""
      }.`,
      data: { projectId: p.projectId, stageName: stage.stageName },
    };
  },
};

// ── updateProductionStageStatus ─────────────────────────────────────────
const PROJECT_STAGE_STATUSES: ProjectStageStatus[] = [
  "NotStarted",
  "Sent",
  "InProgress",
  "Completed",
  "Received",
];

export const updateProductionStageStatus: AgentAction = {
  name: "updateProductionStageStatus",
  description:
    'Change a production stage\'s status (e.g. mark "Cutting" as InProgress, Completed, or Received). Always call findProject first to resolve the real project. Enforces the exact same material-availability check and QMS inspection gate the normal UI enforces (reused, not re-derived) — never overrides a blocked transition. If blocked, explain why and tell the user an authorized user can override it in the app.',
  permission: "production.edit",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description: "Project id (resolve via findProject first — required).",
      },
      stageName: {
        type: "string",
        description:
          'The exact stage name as it appears on the project\'s production stages (e.g. "Cutting", "Bending").',
      },
      status: {
        type: "string",
        description:
          'New status: one of "NotStarted", "Sent", "InProgress", "Completed", "Received".',
      },
    },
    required: ["projectId", "stageName", "status"],
  },
  validate: (p) => {
    const status = String(p.status ?? "");
    if (!PROJECT_STAGE_STATUSES.includes(status as ProjectStageStatus)) {
      throw new Error(
        `"status" must be one of: ${PROJECT_STAGE_STATUSES.join(", ")}.`,
      );
    }
    return {
      projectId: required(p, "projectId"),
      stageName: required(p, "stageName"),
      status: status as ProjectStageStatus,
    };
  },
  execute: async (p): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    const project = s.projects.find((proj) => proj.id === p.projectId);
    if (!project) {
      return {
        ok: false,
        message: "Project not found — resolve it with findProject first.",
      };
    }
    const prod = s.projectProductions.find(
      (pp) => pp.projectId === p.projectId,
    );
    if (!prod || (prod.stages || []).length === 0) {
      return {
        ok: false,
        message: `${project.projectName} has no production stages set up.`,
      };
    }
    const stageNameQuery = (p.stageName as string).trim().toLowerCase();
    const stageIdx = (prod.stages || []).findIndex(
      (st) => st.stageName.trim().toLowerCase() === stageNameQuery,
    );
    if (stageIdx === -1) {
      const available = (prod.stages || [])
        .map((st) => st.stageName)
        .join(", ");
      return {
        ok: false,
        message: `No stage named "${p.stageName}" on this project. Available stages: ${available || "(none)"}.`,
      };
    }
    const stage = prod.stages[stageIdx];
    const newStatus = p.status as ProjectStageStatus;

    if (stage.status === newStatus) {
      return {
        ok: true,
        message: `"${stage.stageName}" on ${project.projectName} is already ${newStatus}.`,
        data: { projectId: p.projectId, stageName: stage.stageName },
      };
    }

    // Same material-shortage guard as Production.tsx's own
    // handleStatusChange — replicated via the shared checkMaterialAvailability
    // helper, never bypassed. The Agent has no admin-override path (that
    // stays a deliberate, in-app-only action).
    if (newStatus === "InProgress") {
      const { ok, shortages } = checkMaterialAvailability(
        p.projectId as string,
        s.bomItems,
        s.inventoryItems,
      );
      if (!ok) {
        return {
          ok: false,
          message: `Cannot start "${stage.stageName}" — material shortage: ${shortages.join("; ")}. An admin can override this in the app if needed.`,
        };
      }
    }

    // Same QMS inspection gate Production.tsx/ProjectDetail.tsx enforce
    // before "Completed" — follows the inspection's server-derived status
    // only (never recomputed here), same as getStageInspectionGate's own
    // contract. No Agent-side override path.
    if (newStatus === "Completed") {
      const qs = useQmsStore.getState();
      const gate = getStageInspectionGate(
        stage.stageId,
        qs.projectQmsInspections.filter((i) => i.projectId === p.projectId),
        qs.projectQmsInspectionOverrides,
      );
      if (gate.linked && !gate.canProceed) {
        return {
          ok: false,
          message: `Cannot complete "${stage.stageName}": ${gate.blockReason}. An authorized user can override this gate in the app if needed.`,
        };
      }
    }

    const updated = (prod.stages || []).map((st, i) =>
      i === stageIdx ? { ...st, status: newStatus } : st,
    );
    const ok = await s.updateProjectStagesV2(p.projectId as string, updated);
    if (!ok) {
      return {
        ok: false,
        message: "Could not save the stage status — please try again.",
      };
    }
    return {
      ok: true,
      message: `Updated "${stage.stageName}" on ${project.projectName} to ${newStatus}.`,
      data: { projectId: p.projectId, stageName: stage.stageName },
    };
  },
};

// ── assignQmsInspectionStage ────────────────────────────────────────────
// Monster-1 — assignStage() (qms/api/inspections.ts) is a complete,
// tested function backing InspectionStageCompletion's already-established
// assignedTo/assignedToName/assignedBy/assignedAt fields (the same fields
// findMyAssignedInspections already reads), but had zero callers anywhere
// in the frontend — no UI page ever wired up a control to actually assign
// a QMS inspection stage to an inspector, confirmed via full-repo grep
// before writing this. Same defect class as record_material_purchase()
// earlier this session.
export const assignQmsInspectionStage: AgentAction = {
  name: "assignQmsInspectionStage",
  description:
    "Assign a QMS inspection stage to an employee (the inspector responsible for completing it). Always call findProject first to resolve the real project and findEmployee to resolve the real assignee.",
  permission: "inspection_sheets.assign",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description: "Project id (resolve via findProject first — required).",
      },
      stageName: {
        type: "string",
        description:
          'The exact inspection stage name (e.g. "Cutting", "Bending") — required.',
      },
      assigneeId: {
        type: "string",
        description:
          "Employee id to assign as inspector (resolve via findEmployee first — required).",
      },
    },
    required: ["projectId", "stageName", "assigneeId"],
  },
  validate: (p) => ({
    projectId: required(p, "projectId"),
    stageName: required(p, "stageName"),
    assigneeId: required(p, "assigneeId"),
  }),
  execute: async (p, ctx): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    const project = s.projects.find((proj) => proj.id === p.projectId);
    if (!project) {
      return {
        ok: false,
        message: "Project not found — resolve it with findProject first.",
      };
    }
    const assignee = s.employees.find((e) => e.id === p.assigneeId);
    if (!assignee) {
      return {
        ok: false,
        message: "Employee not found — resolve them with findEmployee first.",
      };
    }

    const qmsStore = useQmsStore.getState();
    if (!qmsStore.inspectionStagesLoaded) {
      await qmsStore.loadInspectionStages();
    }
    const stages = useQmsStore.getState().inspectionStages;
    const stageNameQuery = (p.stageName as string).trim().toLowerCase();
    const stageDef = stages.find(
      (st) => st.name.trim().toLowerCase() === stageNameQuery,
    );
    if (!stageDef) {
      const available = stages.map((st) => st.name).join(", ");
      return {
        ok: false,
        message: `No inspection stage named "${p.stageName}". Available stages: ${available || "(none)"}.`,
      };
    }

    // Same "highest revision in the document family" rule as
    // getInspectionSheetByProject — replicated over already-hydrated
    // state rather than re-fetching.
    const sheets = qmsStore.inspectionSheets.filter(
      (sh) => sh.projectId === p.projectId,
    );
    if (sheets.length === 0) {
      return {
        ok: false,
        message: `${project.projectName} has no inspection sheet generated yet.`,
      };
    }
    const sheet = sheets.reduce((latest, sh) =>
      sh.revision > latest.revision ? sh : latest,
    );
    if (!sheet.stageIds.includes(stageDef.id)) {
      return {
        ok: false,
        message: `"${stageDef.name}" is not part of ${project.projectName}'s inspection sheet.`,
      };
    }

    try {
      await assignStage(
        sheet.id,
        stageDef.id,
        assignee.id,
        assignee.name,
        ctx.currentUser.id,
        ctx.currentUser.username,
      );
    } catch (err) {
      return {
        ok: false,
        message:
          err instanceof Error
            ? err.message
            : "Could not assign the inspection stage.",
      };
    }

    // Refresh the local cache so the UI (Inspector Dashboard, etc.)
    // reflects the new assignment without a page reload.
    const completions = await getAllStageCompletions();
    qmsStore.setStageCompletionsFromServer(completions);

    return {
      ok: true,
      message: `Assigned "${stageDef.name}" inspection on ${project.projectName} to ${assignee.name}.`,
      data: {
        projectId: p.projectId,
        stageName: stageDef.name,
        assigneeName: assignee.name,
      },
    };
  },
};

// ── attachDocument ────────────────────────────────────────────────────
export const attachDocument: AgentAction = {
  name: "attachDocument",
  description: "Link an existing drawing/document to a project.",
  permission: "drawing_editor.create",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      drawingId: {
        type: "string",
        description:
          "The drawing/document id to attach (from getProjectDocuments or the Drawing Repository).",
      },
      projectId: {
        type: "string",
        description: "The project/order to attach it to.",
      },
    },
    required: ["drawingId", "projectId"],
  },
  validate: (p) => ({
    drawingId: required(p, "drawingId"),
    projectId: required(p, "projectId"),
  }),
  execute: async (p): Promise<AgentActionOutcome> => {
    try {
      const link = await addLink(
        p.drawingId as string,
        "project",
        p.projectId as string,
      );
      return {
        ok: true,
        message: "Attached drawing to the project.",
        data: { linkId: link.id },
      };
    } catch (err) {
      return {
        ok: false,
        message:
          err instanceof Error ? err.message : "Could not attach the document.",
      };
    }
  },
};

// ── createEmployee (small extra — used only if the parser needs it) ──
export const createEmployeeAction: AgentAction = {
  name: "createEmployee",
  description: "Create a new employee record.",
  permission: "employees.create",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Employee's full name." },
      phone: { type: "string", description: "Phone number (optional)." },
      role: {
        type: "string",
        description:
          'FabFlow role, e.g. "employee", "production", "quality" (optional, defaults to "employee").',
      },
      monthlySalary: {
        type: "number",
        description: "Monthly salary (optional).",
      },
      joiningDate: {
        type: "string",
        description: "Joining date, YYYY-MM-DD (optional, defaults to today).",
      },
    },
    required: ["name"],
  },
  validate: (p) => ({
    name: required(p, "name"),
    phone: (p.phone as string) || "",
    role: (p.role as string) || "employee",
    monthlySalary: p.monthlySalary ? Number(p.monthlySalary) : 0,
    joiningDate:
      (p.joiningDate as string) || new Date().toISOString().slice(0, 10),
  }),
  execute: async (p): Promise<AgentActionOutcome> => {
    const result = await createEmployeeRemote({
      name: p.name as string,
      phone: p.phone as string,
      role: p.role as never,
      monthlySalary: p.monthlySalary as number,
      joiningDate: p.joiningDate as string,
      userId: "",
    });
    if (result.status !== "success" || !result.data) {
      return {
        ok: false,
        message: `Could not create employee: ${result.error ?? result.status}`,
      };
    }
    useStore.getState().addEmployee(result.data);
    return {
      ok: true,
      message: `Created employee "${result.data.name}" (id ${result.data.id}).`,
      data: { id: result.data.id, name: result.data.name },
    };
  },
};

// ── recordPayment (Phase 8) ─────────────────────────────────────────────
// The ONE genuinely safe write destination found in the Phase 8 file-
// architecture audit: createPaymentRemote() already persists a `files`
// array to a real DB column (payments.files) at creation time — this
// reuses that exact, already-working function, nothing new invented.
// Two other candidate destinations were investigated and found NOT
// safely reusable, so they are deliberately unsupported here:
//   - Project.poFiles has no DB column at all (local-only per an
//     explicitly approved earlier decision, see lib/projectsApi.ts's own
//     header comment) — writing to it would not be a real, durable
//     attachment, so the Agent must not offer it.
//   - Payment.files has no update-existing-payment path (only create();
//     confirmed via paymentsApi.ts's own header comment) — attaching
//     evidence to an ALREADY-EXISTING payment is not supported; only
//     attaching evidence while recording a NEW payment is.
export const recordPayment: AgentAction = {
  name: "recordPayment",
  description:
    "Record a new payment against an invoice, optionally with evidence file(s) the user already uploaded via the Agent's file picker. Use the exact fileName/mimeType/url the user's attached-file message showed you — never invent a file that was not actually uploaded, and never invent an amount/date/reference the user has not confirmed.",
  permission: "payments.create",
  riskLevel: "high",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      invoiceId: {
        type: "string",
        description:
          "The invoice this payment is against — resolve via searchInvoices first (by customerId and/or projectId) to get its real id; getInvoiceStatus does not return an id and cannot be used for this.",
      },
      amount: {
        type: "number",
        description:
          "Payment amount, confirmed by the user — never inferred from an image with certainty.",
      },
      mode: {
        type: "string",
        description: "Payment mode: Cash, Cheque, NEFT, RTGS, or UPI.",
      },
      paymentDate: {
        type: "string",
        description: "Payment date (YYYY-MM-DD), optional.",
      },
      referenceNo: {
        type: "string",
        description: "Reference/transaction number, optional.",
      },
      notes: { type: "string", description: "Notes, optional." },
      // A JSON-stringified array rather than a real array/object schema
      // type: the registry's shared JsonSchemaProperty type deliberately
      // only supports string/number/boolean (see agent/types.ts's own
      // comment on why) — widening it for one tool's sake would be an
      // unrelated, repo-wide schema change, not a focused one. The model
      // can produce valid JSON text fine; validate() below parses it.
      filesJson: {
        type: "string",
        description:
          'JSON array of evidence file(s) already uploaded via the file picker in THIS conversation, e.g. [{"fileName":"receipt.jpg","mimeType":"image/jpeg","url":"..."}] — reuse the exact fileName/mimeType/url already shown to you. Omit or use "[]" if no file was uploaded.',
      },
    },
    required: ["invoiceId", "amount", "mode"],
  },
  validate: (p) => {
    const mode = String(p.mode ?? "");
    if (!PAYMENT_MODES.includes(mode as PaymentMode)) {
      throw new Error(`"mode" must be one of: ${PAYMENT_MODES.join(", ")}.`);
    }
    let rawFiles: unknown[] = [];
    if (typeof p.filesJson === "string" && p.filesJson.trim()) {
      try {
        const parsed = JSON.parse(p.filesJson);
        if (Array.isArray(parsed)) rawFiles = parsed;
      } catch {
        // Malformed JSON from the model — treated as no files, never
        // thrown, since files are optional and a parse failure here
        // must not block a legitimate payment record.
      }
    }
    const files = rawFiles
      .filter(
        (f): f is Record<string, unknown> =>
          Boolean(f) && typeof f === "object",
      )
      .map((f) => ({
        name: String(f.fileName ?? "").trim(),
        type: String(f.mimeType ?? "").trim(),
        url: String(f.url ?? "").trim(),
      }))
      .filter((f) => f.name && f.url);
    return {
      invoiceId: required(p, "invoiceId"),
      amount: requiredNumber(p, "amount"),
      mode: mode as PaymentMode,
      paymentDate: (p.paymentDate as string) || "",
      referenceNo: (p.referenceNo as string) || "",
      notes: (p.notes as string) || "",
      files,
    };
  },
  execute: async (p): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    const invoice = s.invoices.find((i) => i.id === p.invoiceId);
    if (!invoice) return { ok: false, message: "Invoice not found." };
    const files = p.files as Array<{ name: string; type: string; url: string }>;
    const result = await createPaymentRemote({
      invoiceId: p.invoiceId as string,
      amount: p.amount as number,
      paymentDate: p.paymentDate as string,
      mode: p.mode as PaymentMode,
      referenceNo: p.referenceNo as string,
      notes: p.notes as string,
      files,
    });
    if (result.status !== "success" || !result.data) {
      return {
        ok: false,
        message: `Could not record payment: ${result.error ?? result.status}`,
      };
    }
    s.addPayment(result.data.payment);
    return {
      ok: true,
      message: `Recorded payment of ${p.amount} against invoice ${invoice.invNo}${
        files.length > 0
          ? `, with ${files.length} evidence file(s) attached`
          : ""
      }.`,
      data: { id: result.data.payment.id },
    };
  },
};

// ── Inventory (Phase B) ──────────────────────────────────────────────
//
// Fresh audit before writing this (re-verified against the actual
// migration SQL and both lib/inventory*Api.ts files' real write
// contracts, not the prior report alone):
//   - trg_increase_stock (AFTER INSERT on inventory_purchases) and
//     trg_negative_stock/trg_reduce_stock (BEFORE/AFTER INSERT on
//     inventory_usages) are real, confirmed directly in
//     supabase/migrations/20260811070452_remote_schema.sql — the DB is
//     authoritative for stock, not this file. Neither action below
//     computes current_stock; both re-read it fresh from Supabase after
//     a successful insert and reflect that real value locally.
//   - createInventoryPurchaseRemote/createInventoryUsageRemote both
//     technically tolerate inventory_item_id being sent as null
//     (`v.inventoryItemId || null`) — but the Agent must never exercise
//     that tolerance. Both validate() below require a real, resolved,
//     non-empty inventoryItemId or throw before ever reaching the API.
//   - store.ts's existing addInventoryPurchase()/addMaterialUsage() are
//     the LEGACY local-computation path (they recompute
//     inventoryItems locally) — deliberately NOT called here, since
//     doing so would be exactly the "duplicate stock arithmetic in
//     frontend code" this phase must not introduce. Only
//     updateInventoryItem() (a plain replace-by-id, no arithmetic) is
//     used, and only with a value just read fresh from the database.

async function readCurrentStock(
  inventoryItemId: string,
): Promise<number | null> {
  const client = getSupabase();
  const { data, error } = await client
    .from("inventory_items")
    .select("current_stock")
    .eq("id", inventoryItemId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { current_stock: number | null }).current_stock ?? 0;
}

export const recordInventoryPurchase: AgentAction = {
  name: "recordInventoryPurchase",
  description:
    "Record a purchase/receipt of material into inventory — increases stock via FabFlow's own database trigger. Always call searchInventoryItems first to resolve the real item; never invent an inventoryItemId. Use this for material coming INTO inventory (purchases, receipts) — never for material going out (see recordInventoryUsage).",
  permission: "inventory.create",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      inventoryItemId: {
        type: "string",
        description:
          "The inventory item id (resolve via searchInventoryItems first — required, never guessed).",
      },
      quantityPurchased: {
        type: "number",
        description: "Quantity purchased/received, in the item's own unit.",
      },
      supplierName: {
        type: "string",
        description: "Supplier/vendor name, optional.",
      },
      purchaseDate: {
        type: "string",
        description: "Purchase date (YYYY-MM-DD), optional.",
      },
      cost: { type: "number", description: "Total cost, optional." },
      unitCost: { type: "number", description: "Cost per unit, optional." },
    },
    required: ["inventoryItemId", "quantityPurchased"],
  },
  validate: (p) => ({
    inventoryItemId: required(p, "inventoryItemId"),
    quantityPurchased: requiredNumber(p, "quantityPurchased"),
    supplierName: (p.supplierName as string) || "",
    purchaseDate: (p.purchaseDate as string) || "",
    cost: p.cost !== undefined ? Number(p.cost) : undefined,
    unitCost: p.unitCost !== undefined ? Number(p.unitCost) : undefined,
  }),
  execute: async (p): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    const item = s.inventoryItems.find((i) => i.id === p.inventoryItemId);
    if (!item) {
      return {
        ok: false,
        message:
          "Inventory item not found — resolve it with searchInventoryItems first.",
      };
    }
    const result = await createInventoryPurchaseRemote({
      inventoryItemId: p.inventoryItemId as string,
      materialName: item.name,
      quantityPurchased: p.quantityPurchased as number,
      supplierName: p.supplierName as string,
      purchaseDate: p.purchaseDate as string,
      cost: (p.cost as number) ?? 0,
      unitCost: p.unitCost as number | undefined,
    });
    if (result.status !== "success" || !result.data) {
      return {
        ok: false,
        message: `Could not record the purchase: ${result.error ?? result.status}`,
      };
    }
    const freshStock = await readCurrentStock(item.id);
    if (freshStock !== null) {
      s.updateInventoryItem({ ...item, quantityAvailable: freshStock });
    }
    return {
      ok: true,
      message: `Recorded purchase of ${p.quantityPurchased} ${item.unit} of "${item.name}".${
        freshStock !== null
          ? ` Stock is now ${freshStock} ${item.unit}.`
          : " (Could not confirm the updated stock figure — the purchase itself was recorded.)"
      }`,
      data: { id: result.data.id },
    };
  },
};

export const recordInventoryUsage: AgentAction = {
  name: "recordInventoryUsage",
  description:
    "Record material CONSUMED/ISSUED from inventory for a project — decreases stock via FabFlow's own database trigger, which also rejects the request server-side if there isn't enough stock. Always call searchInventoryItems first to resolve the real item; never invent an inventoryItemId. Use this for material going OUT of inventory — never for material coming in (see recordInventoryPurchase).",
  permission: "inventory.create",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      inventoryItemId: {
        type: "string",
        description:
          "The inventory item id (resolve via searchInventoryItems first — required, never guessed).",
      },
      projectId: {
        type: "string",
        description:
          "The project this material is being used for (resolve via findProject first — required).",
      },
      quantityUsed: {
        type: "number",
        description: "Quantity used/issued, in the item's own unit.",
      },
      usedDate: {
        type: "string",
        description: "Usage date (YYYY-MM-DD), optional.",
      },
      notes: { type: "string", description: "Notes, optional." },
    },
    required: ["inventoryItemId", "projectId", "quantityUsed"],
  },
  validate: (p) => ({
    inventoryItemId: required(p, "inventoryItemId"),
    projectId: required(p, "projectId"),
    quantityUsed: requiredNumber(p, "quantityUsed"),
    usedDate: (p.usedDate as string) || "",
    notes: (p.notes as string) || "",
  }),
  execute: async (p): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    const item = s.inventoryItems.find((i) => i.id === p.inventoryItemId);
    if (!item) {
      return {
        ok: false,
        message:
          "Inventory item not found — resolve it with searchInventoryItems first.",
      };
    }
    const project = s.projects.find((proj) => proj.id === p.projectId);
    if (!project) {
      return {
        ok: false,
        message: "Project not found — resolve it with findProject first.",
      };
    }
    const result = await createInventoryUsageRemote({
      inventoryItemId: p.inventoryItemId as string,
      projectId: p.projectId as string,
      materialName: item.name,
      quantityUsed: p.quantityUsed as number,
      usedDate: p.usedDate as string,
      notes: p.notes as string,
    });
    if (result.status !== "success" || !result.data) {
      // The DB's own "Not enough stock" exception (trg_negative_stock)
      // surfaces here verbatim via result.error — never overwritten with
      // a friendlier-sounding but less accurate message.
      return {
        ok: false,
        message: `Could not record the usage: ${result.error ?? result.status}`,
      };
    }
    const freshStock = await readCurrentStock(item.id);
    if (freshStock !== null) {
      s.updateInventoryItem({ ...item, quantityAvailable: freshStock });
    }
    return {
      ok: true,
      message: `Recorded usage of ${p.quantityUsed} ${item.unit} of "${item.name}" for ${project.projectName}.${
        freshStock !== null
          ? ` Stock is now ${freshStock} ${item.unit}.`
          : " (Could not confirm the updated stock figure — the usage itself was recorded.)"
      }`,
      data: { id: result.data.id },
    };
  },
};

// ── Material Requisitions (Monster-1) ───────────────────────────────
//
// Real, current-state finding before writing this (full-repo grep, not
// assumed): Material Requisitions is entirely system-generated from BOM
// shortages (recompute_bom_requisition(), already Supabase-backed via
// bomRequisitions/hydrateBomRequisitions) — there is no create action
// anywhere, human or Agent, and none should be added (bom_requisitions
// has no INSERT/DELETE RLS policy at all). The only human action is
// "Mark as Completed" on a requisition already "Ready to Complete".
//
// But nothing in the live app could ever REACH "Ready to Complete":
// the one function that sets it, record_material_purchase() (an RPC
// already written, permission-checked, and correct), had zero callers
// anywhere in the frontend — confirmed via grep before writing this.
// recordMaterialPurchase below is that missing caller, not a new
// capability; completeMaterialRequisition exposes the existing "Mark as
// Completed" action, mirroring its own status precondition exactly.

export const recordMaterialPurchase: AgentAction = {
  name: "recordMaterialPurchase",
  description:
    "Record a material purchase against a project's shortage — finds or creates the inventory item by name, records the purchase (increasing stock), and flips the matching Pending material requisition to Ready to Complete once the new stock covers its shortage. Always call findProject first to resolve the real project; never invent one.",
  permission: "inventory.create",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description: "Project id (resolve via findProject first — required).",
      },
      materialType: {
        type: "string",
        description:
          "Material name — matches or creates an inventory item by this exact name.",
      },
      thickness: { type: "string", description: "Thickness, optional." },
      quantity: {
        type: "number",
        description: "Quantity purchased, must be greater than 0.",
      },
      unit: { type: "string", description: "Unit (e.g. kg, sheets, pcs)." },
      supplierName: {
        type: "string",
        description: "Supplier name, optional.",
      },
      vendorId: {
        type: "string",
        description:
          "Vendor id, optional — resolve via searchVendors first if a real vendor record applies.",
      },
      purchaseDate: {
        type: "string",
        description:
          "Purchase date (YYYY-MM-DD), optional — defaults to today.",
      },
    },
    required: ["projectId", "materialType", "quantity", "unit"],
  },
  validate: (p) => ({
    projectId: required(p, "projectId"),
    materialType: required(p, "materialType"),
    thickness: (p.thickness as string) || "",
    quantity: requiredNumber(p, "quantity"),
    unit: required(p, "unit"),
    supplierName: (p.supplierName as string) || "",
    vendorId: (p.vendorId as string) || "",
    purchaseDate:
      (p.purchaseDate as string) || new Date().toISOString().slice(0, 10),
  }),
  execute: async (p): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    const project = s.projects.find((proj) => proj.id === p.projectId);
    if (!project) {
      return {
        ok: false,
        message: "Project not found — resolve it with findProject first.",
      };
    }
    const vendorId = p.vendorId as string;
    if (vendorId && !s.vendors.find((v) => v.id === vendorId)) {
      return {
        ok: false,
        message: "Vendor not found — resolve it with searchVendors first.",
      };
    }
    const before = new Set(
      s.bomRequisitions
        .filter((r) => r.projectId === p.projectId && r.status === "Pending")
        .map((r) => r.id),
    );
    const result = await recordMaterialPurchaseRemote({
      projectId: p.projectId as string,
      materialType: p.materialType as string,
      thickness: (p.thickness as string) || undefined,
      quantity: p.quantity as number,
      unit: p.unit as string,
      supplierName: (p.supplierName as string) || undefined,
      vendorId: vendorId || undefined,
      purchaseDate: p.purchaseDate as string,
    });
    if (result.status !== "success" || !result.data) {
      return {
        ok: false,
        message: `Could not record the material purchase: ${result.error ?? result.status}`,
      };
    }
    // Re-hydrate — the RPC may have flipped a requisition's status
    // server-side; never guess which one or compute it locally.
    const refreshed = await hydrateBomRequisitions();
    let flippedNote = "";
    if (refreshed.status === "success" && refreshed.data) {
      s.setBomRequisitionsFromServer(refreshed.data);
      const flipped = refreshed.data.find(
        (r) => before.has(r.id) && r.status === "Ready to Complete",
      );
      if (flipped) {
        flippedNote = ` The "${flipped.materialName}" requisition for this project is now Ready to Complete.`;
      }
    }
    return {
      ok: true,
      message: `Recorded purchase of ${p.quantity} ${p.unit} of "${p.materialType}" for ${project.projectName}.${flippedNote}`,
      data: { id: result.data.purchaseId },
    };
  },
};

export const completeMaterialRequisition: AgentAction = {
  name: "completeMaterialRequisition",
  description:
    "Mark a material requisition as completed. Only valid when the requisition's status is already 'Ready to Complete' — always call searchMaterialRequisitions first to resolve a real requisition id and confirm its status.",
  // Monster-1 — matches bom_requisitions_approve's actual RLS requirement
  // (material_requisitions.approve, not .edit — see bomItemsApi.ts's
  // header comment and MaterialRequisitions.tsx's own pApprove gate).
  permission: "material_requisitions.approve",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      requisitionId: {
        type: "string",
        description: "The material requisition id — required.",
      },
    },
    required: ["requisitionId"],
  },
  validate: (p) => ({ requisitionId: required(p, "requisitionId") }),
  execute: async (p): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    const req = s.bomRequisitions.find((r) => r.id === p.requisitionId);
    if (!req) {
      return {
        ok: false,
        message:
          "Material requisition not found — resolve it with searchMaterialRequisitions first.",
      };
    }
    // Same precondition as the real page's own button (only rendered
    // when status === "Ready to Complete") — replicated, not bypassed.
    if (req.status !== "Ready to Complete") {
      return {
        ok: false,
        message: `This requisition is "${req.status}", not "Ready to Complete" — it cannot be marked completed yet.`,
      };
    }
    const result = await updateBomRequisitionStatusRemote(
      p.requisitionId as string,
      "Completed",
    );
    if (result.status !== "success" || !result.data) {
      return {
        ok: false,
        message: `Could not complete the requisition: ${result.error ?? result.status}`,
      };
    }
    s.updateBomRequisition(p.requisitionId as string, result.data);
    return {
      ok: true,
      message: `Marked the "${req.materialName}" requisition as completed.`,
      data: { id: p.requisitionId as string },
    };
  },
};

// ── createScrapRecord (Monster-1) ────────────────────────────────────
// Scrap Management was 100% local-only Zustand state, no Supabase table
// at all (confirmed via schema query before building any of this — not
// assumed) — same underlying gap class as Material Requisitions, but a
// clean single-table shape with no ambiguity, so this one was a
// straightforward build once the migration was approved and applied.
const SCRAP_STATUSES: ScrapStatus[] = ["In Stock", "Sold", "Disposed"];

export const createScrapRecord: AgentAction = {
  name: "createScrapRecord",
  description:
    "Log a new scrap record (offcuts, rejects, or waste material generated during production). Always call findProject first if a project applies — never invent a projectId.",
  permission: "inventory.create",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      materialType: {
        type: "string",
        description: 'Material type/name, e.g. "MS Sheet Offcuts".',
      },
      generatedQty: {
        type: "number",
        description: "Quantity generated, must be greater than 0.",
      },
      unit: {
        type: "string",
        description: "Unit, optional — defaults to kg.",
      },
      reusableQty: {
        type: "number",
        description: "Quantity that's reusable, optional — defaults to 0.",
      },
      scrapValue: {
        type: "number",
        description: "Estimated scrap value in rupees, optional.",
      },
      status: {
        type: "string",
        description: `One of: ${SCRAP_STATUSES.join(", ")}. Defaults to "In Stock".`,
      },
      projectId: {
        type: "string",
        description:
          "Optional project id (resolve via findProject first) this scrap came from.",
      },
      stage: {
        type: "string",
        description: "Optional production stage name this scrap came from.",
      },
      notes: { type: "string", description: "Notes, optional." },
    },
    required: ["materialType", "generatedQty"],
  },
  validate: (p) => {
    const status = (p.status as string) || "In Stock";
    if (!SCRAP_STATUSES.includes(status as ScrapStatus)) {
      throw new Error(`"status" must be one of: ${SCRAP_STATUSES.join(", ")}.`);
    }
    return {
      materialType: required(p, "materialType"),
      generatedQty: requiredNumber(p, "generatedQty"),
      unit: (p.unit as string) || "kg",
      reusableQty: (p.reusableQty as number) || 0,
      scrapValue: p.scrapValue !== undefined ? Number(p.scrapValue) : undefined,
      status: status as ScrapStatus,
      projectId: (p.projectId as string) || "",
      stage: (p.stage as string) || "",
      notes: (p.notes as string) || "",
    };
  },
  execute: async (p, ctx): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    const projectId = p.projectId as string;
    if (projectId && !s.projects.find((proj) => proj.id === projectId)) {
      return {
        ok: false,
        message: "Project not found — resolve it with findProject first.",
      };
    }
    const result = await createScrapRecordRemote({
      materialType: p.materialType as string,
      unit: p.unit as string,
      generatedQty: p.generatedQty as number,
      reusableQty: p.reusableQty as number,
      soldQty: 0,
      disposedQty: 0,
      scrapValue: p.scrapValue as number | undefined,
      status: p.status as ScrapStatus,
      projectId: projectId || undefined,
      stage: (p.stage as string) || undefined,
      notes: (p.notes as string) || undefined,
      recordedBy: ctx.currentUser.username ?? "AI Agent",
    });
    if (result.status !== "success" || !result.data) {
      return {
        ok: false,
        message: `Could not log the scrap record: ${result.error ?? result.status}`,
      };
    }
    s.addScrapRecord({
      ...result.data,
      projectName: projectId
        ? s.projects.find((proj) => proj.id === projectId)?.projectName
        : undefined,
    });
    return {
      ok: true,
      message: `Logged ${p.generatedQty} ${p.unit} of "${p.materialType}" scrap (${p.status}).`,
      data: { id: result.data.id },
    };
  },
};

// ── createDeliveryChallan (Phase C) ─────────────────────────────────────
//
// Fresh audit before writing this (re-verified against the actual
// deliveryChallansApi.ts write contract and DeliveryChallans.tsx's real
// create form, not the prior report alone):
//   - createDeliveryChallanRemote already persists fully to Supabase —
//     no new API, no schema change.
//   - "Prepared" is confirmed, from the real create form itself, to be
//     the exact status a DC gets on creation before dispatch — not
//     reinterpreted here, just reused.
//   - dc_no has no DB unique constraint and no server-side numbering;
//     computeNextDcNumber() (deliveryChallansApi.ts) mirrors the real
//     UI's own previewDcNo() exactly.
//   - customerId is nullable at the write layer but validate() below
//     never lets that path be exercised.
//   - dispatchDate and at least one real project + positive dispatch
//     quantity are practically mandatory — confirmed directly from the
//     real create form's own validation messages ("Dispatch date is
//     required", "Select at least one project", "Enter dispatch
//     quantity for at least one project") — not merely DB-nullable
//     fields treated as optional.
//   - No Invoice dependency exists: DeliveryChallan has no invoiceId/
//     reference to Invoice at all, confirmed from the type itself — a
//     DC is legitimately standalone, so Phase C needs nothing from the
//     Invoice module.
// Deliberately out of scope for this smallest-safe-change pass: the
// dispatch-method-specific sub-fields (vehicleNo, courierCompany,
// trackingNumber, etc.) — all optional in the schema and not needed for
// a valid DC; can be added later without touching what's built here.
export const createDeliveryChallan: AgentAction = {
  name: "createDeliveryChallan",
  description:
    "Create a delivery challan (DC) for dispatching pieces to a customer. Always call searchCustomers first to resolve the real customer, and searchDeliveryChallans to check for a plausible existing match before creating a new one. Uses FabFlow's real 'Prepared' status (the same status the normal UI assigns on creation, before actual dispatch) unless the user says the goods are already dispatched/delivered.",
  permission: "delivery_challans.create",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      customerId: {
        type: "string",
        description:
          "The customer id (resolve via searchCustomers first — required, never guessed).",
      },
      dispatchDate: {
        type: "string",
        description: "Dispatch date (YYYY-MM-DD) — required.",
      },
      receiverName: {
        type: "string",
        description: "Name of the person/party receiving the goods — required.",
      },
      projectEntriesJson: {
        type: "string",
        description:
          'Required. JSON array of {"projectId","dispatchQty"} — at least one entry, each dispatchQty > 0, e.g. [{"projectId":"...","dispatchQty":100}]. Resolve each projectId via findProject first.',
      },
      status: {
        type: "string",
        description:
          'DC status: "Prepared" (default — goods prepared, not yet dispatched), "Dispatched", or "Delivered". Only use something other than "Prepared" if the user says so explicitly.',
      },
    },
    required: [
      "customerId",
      "dispatchDate",
      "receiverName",
      "projectEntriesJson",
    ],
  },
  validate: (p) => {
    const status = (p.status as string) || "Prepared";
    if (!DC_STATUSES.includes(status as DCStatus)) {
      throw new Error(`"status" must be one of: ${DC_STATUSES.join(", ")}.`);
    }
    let rawEntries: unknown[] = [];
    try {
      const parsed = JSON.parse(String(p.projectEntriesJson ?? ""));
      if (Array.isArray(parsed)) rawEntries = parsed;
    } catch {
      throw new Error(
        '"projectEntriesJson" must be a valid JSON array, e.g. [{"projectId":"...","dispatchQty":100}].',
      );
    }
    const projectEntries = rawEntries
      .filter(
        (e): e is Record<string, unknown> =>
          Boolean(e) && typeof e === "object",
      )
      .map((e) => ({
        projectId: String(e.projectId ?? "").trim(),
        dispatchQty: Number(e.dispatchQty),
      }))
      .filter(
        (e) =>
          e.projectId && Number.isFinite(e.dispatchQty) && e.dispatchQty > 0,
      );
    if (projectEntries.length === 0) {
      throw new Error(
        "At least one project with a dispatch quantity greater than 0 is required.",
      );
    }
    return {
      customerId: required(p, "customerId"),
      dispatchDate: required(p, "dispatchDate"),
      receiverName: required(p, "receiverName"),
      projectEntries,
      status: status as DCStatus,
    };
  },
  execute: async (p): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    const customer = s.customers.find((c) => c.id === p.customerId);
    if (!customer) {
      return {
        ok: false,
        message: "Customer not found — resolve it with searchCustomers first.",
      };
    }
    const projectEntries = p.projectEntries as Array<{
      projectId: string;
      dispatchQty: number;
    }>;
    const unresolvedProject = projectEntries.find(
      (e) => !s.projects.some((proj) => proj.id === e.projectId),
    );
    if (unresolvedProject) {
      return {
        ok: false,
        message: `Project not found (id ${unresolvedProject.projectId}) — resolve it with findProject first.`,
      };
    }
    const dcNo = computeNextDcNumber(s.deliveryChallans.map((dc) => dc.dcNo));
    const result = await createDeliveryChallanRemote({
      dcNo,
      customerId: p.customerId as string,
      projectEntries,
      dispatchDate: p.dispatchDate as string,
      receiverName: p.receiverName as string,
      status: p.status as DCStatus,
    });
    if (result.status !== "success" || !result.data) {
      return {
        ok: false,
        message: `Could not create the delivery challan: ${result.error ?? result.status}`,
      };
    }
    s.addDeliveryChallan(result.data);
    const totalQty = projectEntries.reduce((sum, e) => sum + e.dispatchQty, 0);
    return {
      ok: true,
      message: `Created delivery challan ${result.data.dcNo} for ${customer.name} — ${totalQty} piece(s) across ${projectEntries.length} project(s), status ${result.data.status}.`,
      data: { id: result.data.id, dcNo: result.data.dcNo },
    };
  },
};

// Same DC-YYYY-NNN-shaped preview as computeNextDcNumber/
// computeNextProjectNumber, but for invoices — mirrors Invoices.tsx's own
// previewInvNo() exactly (INV-{year}-{max+1}, padded 3). Deliberately kept
// local to actions.ts rather than added to invoicesApi.ts (Phase D's
// explicit scope excludes touching that file) — a pure calculation over
// supplied existing numbers, never a local counter. inv_no carries no DB
// unique constraint (same unresolved state dc_no was in before Phase
// C.1 — flagged, not fixed here; see Phase D final report) — this is
// only ever a candidate the Agent proposes, never authoritative; the
// actual persisted value always comes back from createInvoiceRemote.
function computeNextInvNumber(existingInvNumbers: string[]): string {
  const year = new Date().getFullYear();
  const nums = existingInvNumbers.map((n) => {
    const m = (n || "").match(/INV-\d{4}-(\d+)/);
    return m ? Number.parseInt(m[1], 10) : 0;
  });
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `INV-${year}-${String(next).padStart(3, "0")}`;
}

// ── createInvoice (Phase D) ──────────────────────────────────────────────
//
// Fresh audit before writing this (re-verified against the actual
// invoicesApi.ts write contract and Invoices.tsx's real create form):
//   - createInvoiceRemote already persists fully to Supabase (invoice +
//     line items) — no new API, no schema change. Reused unmodified.
//   - Only customerId is genuinely hard-required by the real UI. projectId
//     and dcId are both optional — a live production Invoice with
//     dc_id: null already exists, confirmed directly from the database.
//   - If projectId is given, the real UI requires that project to have
//     totalQty set — reproduced here with the identical message.
//   - If dcId is given, the real UI caps total invoiced quantity at the
//     DC's total dispatched quantity (sum of ALL its projectEntries'
//     dispatchQty, status-blind) — reproduced here exactly; no new
//     Dispatched/Delivered requirement is invented.
//   - status is always "Unpaid" and paidAmount always 0 on create, exactly
//     as Invoices.tsx hardcodes both — never accepted as input here.
//   - cgstRate/sgstRate/igstRate default 9/9/0 (Invoices.tsx's own
//     defaults) — no interstate/intrastate auto-switching exists anywhere
//     in the real app, so none is invented here either.
//   - dueDate, when not supplied, is derived from invoiceDate +
//     parseInt(paymentTerms) days — mirrors Invoices.tsx's
//     resolvedDueDate exactly.
//   - invNo is a soft, unenforced preview (computeNextInvNumber above),
//     duplicate-checked against currently-hydrated invoices before
//     submit — same soft-guard shape as Invoices.tsx's own previewInvNo()
//     + duplicate check. No DB constraint exists to retry against.
//   - total_amount/subtotal/tax amounts sent on the initial insert are
//     never trusted afterward — createInvoiceRemote's own contract
//     re-fetches the full row once items are inserted (trigger-owned),
//     and this action's reported message/data always uses that returned
//     value, never its own locally computed one.
//   - addProjectActivity("invoice_generated") is fired when projectId is
//     given, mirroring Invoices.tsx's own side effect exactly — reusing
//     the same store action findProject/recordInventoryUsage already use.
export const createInvoice: AgentAction = {
  name: "createInvoice",
  description:
    "Create an invoice for a customer. Always call searchCustomers first to resolve the real customer, and searchInvoices to check for a plausible existing match before creating a new one. A delivery challan is NOT required — only attach one (dcId) if the user names one; resolve it via searchDeliveryChallans to a real id, never by dc_no.",
  permission: "invoices.create",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      customerId: {
        type: "string",
        description:
          "The customer id (resolve via searchCustomers first — required, never guessed).",
      },
      projectId: {
        type: "string",
        description:
          "Optional project/order id (resolve via findProject first). Omit if the user didn't name one.",
      },
      dcId: {
        type: "string",
        description:
          "Optional delivery challan id (resolve via searchDeliveryChallans first — use its real id, never dc_no). Omit if the user didn't name one; an invoice without a DC is normal and allowed.",
      },
      lineItemsJson: {
        type: "string",
        description:
          'Required. JSON array of {"desc","qty","rate","hsn"} — at least one entry, each qty > 0 and rate >= 0, e.g. [{"desc":"Fabrication work","qty":10,"rate":500,"hsn":"7308"}]. hsn is optional.',
      },
      invoiceDate: {
        type: "string",
        description: "Invoice date (YYYY-MM-DD), optional — defaults to today.",
      },
      dueDate: {
        type: "string",
        description:
          "Due date (YYYY-MM-DD), optional — if omitted, derived from invoiceDate + paymentTerms.",
      },
      paymentTerms: {
        type: "string",
        description:
          'Payment terms, e.g. "30 days". Optional, defaults to "30 days".',
      },
      cgstRate: {
        type: "number",
        description: "CGST %, optional, defaults to 9.",
      },
      sgstRate: {
        type: "number",
        description: "SGST %, optional, defaults to 9.",
      },
      igstRate: {
        type: "number",
        description: "IGST %, optional, defaults to 0.",
      },
    },
    required: ["customerId", "lineItemsJson"],
  },
  validate: (p) => {
    let rawItems: unknown[] = [];
    try {
      const parsed = JSON.parse(String(p.lineItemsJson ?? ""));
      if (Array.isArray(parsed)) rawItems = parsed;
    } catch {
      throw new Error(
        '"lineItemsJson" must be a valid JSON array, e.g. [{"desc":"...","qty":1,"rate":100}].',
      );
    }
    const lineItems: InvLineItem[] = rawItems
      .filter(
        (it): it is Record<string, unknown> =>
          Boolean(it) && typeof it === "object",
      )
      .map((it) => ({
        desc: String(it.desc ?? "").trim(),
        hsn: String(it.hsn ?? "").trim(),
        qty: Number(it.qty),
        rate: Number(it.rate),
        amount: 0, // computed below, once every item has passed validation
      }))
      .filter(
        (it) =>
          it.desc &&
          Number.isFinite(it.qty) &&
          it.qty > 0 &&
          Number.isFinite(it.rate) &&
          it.rate >= 0,
      );
    if (lineItems.length === 0) {
      throw new Error(
        "At least one line item with a description, a positive quantity, and a non-negative rate is required.",
      );
    }
    for (const it of lineItems) it.amount = it.qty * it.rate;
    return {
      customerId: required(p, "customerId"),
      projectId: (p.projectId as string) || "",
      dcId: (p.dcId as string) || "",
      lineItems,
      invoiceDate: (p.invoiceDate as string) || "",
      dueDate: (p.dueDate as string) || "",
      paymentTerms: (p.paymentTerms as string) || "30 days",
      cgstRate: p.cgstRate !== undefined ? Number(p.cgstRate) : 9,
      sgstRate: p.sgstRate !== undefined ? Number(p.sgstRate) : 9,
      igstRate: p.igstRate !== undefined ? Number(p.igstRate) : 0,
    };
  },
  execute: async (p): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    const customer = s.customers.find((c) => c.id === p.customerId);
    if (!customer) {
      return {
        ok: false,
        message: "Customer not found — resolve it with searchCustomers first.",
      };
    }

    let projectId = "";
    if (p.projectId) {
      const project = s.projects.find((proj) => proj.id === p.projectId);
      if (!project) {
        return {
          ok: false,
          message: `Project not found (id ${p.projectId}) — resolve it with findProject first.`,
        };
      }
      if (project.totalQty == null) {
        return {
          ok: false,
          message:
            "Selected project has no Total Quantity set. Please update the project first.",
        };
      }
      projectId = project.id;
    }

    let dcId = "";
    if (p.dcId) {
      const dc = s.deliveryChallans.find((d) => d.id === p.dcId);
      if (!dc) {
        return {
          ok: false,
          message: `Delivery challan not found (id ${p.dcId}) — resolve it with searchDeliveryChallans first.`,
        };
      }
      // Same status-blind ceiling the real UI applies — not scoped to a
      // project, not filtered by DCStatus, matching Invoices.tsx exactly.
      const availableQty = (dc.projectEntries || []).reduce(
        (sum, e) => sum + ((e as { dispatchQty?: number }).dispatchQty || 0),
        0,
      );
      const lineItems = p.lineItems as InvLineItem[];
      const totalInvoiceQty = lineItems.reduce((sum, it) => sum + it.qty, 0);
      if (totalInvoiceQty > availableQty) {
        return {
          ok: false,
          message: "Cannot invoice more than dispatched quantity.",
        };
      }
      dcId = dc.id;
    }

    const lineItems = p.lineItems as InvLineItem[];
    const subtotal = lineItems.reduce((sum, it) => sum + it.amount, 0);
    const cgstRate = p.cgstRate as number;
    const sgstRate = p.sgstRate as number;
    const igstRate = p.igstRate as number;
    const cgstAmt = Math.round((subtotal * cgstRate) / 100);
    const sgstAmt = Math.round((subtotal * sgstRate) / 100);
    const igstAmt = Math.round((subtotal * igstRate) / 100);
    const totalAmount = subtotal + cgstAmt + sgstAmt + igstAmt;

    const invoiceDate = (p.invoiceDate as string) || "";
    const paymentTerms = p.paymentTerms as string;
    const dueDate =
      (p.dueDate as string) ||
      (() => {
        const daysMatch = paymentTerms.match(/\d+/);
        const days = daysMatch ? Number.parseInt(daysMatch[0], 10) : 30;
        const base = new Date(
          invoiceDate || new Date().toISOString().split("T")[0],
        );
        if (Number.isNaN(base.getTime())) return "";
        base.setDate(base.getDate() + days);
        return base.toISOString().split("T")[0];
      })();

    const invNo = computeNextInvNumber(s.invoices.map((inv) => inv.invNo));
    if (s.invoices.some((inv) => inv.invNo === invNo)) {
      return {
        ok: false,
        message: `Invoice number ${invNo} already exists. Please use a different number.`,
      };
    }

    const result = await createInvoiceRemote({
      invNo,
      dcId,
      customerId: p.customerId as string,
      projectId,
      lineItems,
      subtotal,
      cgstRate,
      sgstRate,
      igstRate,
      cgstAmt,
      sgstAmt,
      igstAmt,
      totalAmount,
      invoiceDate,
      dueDate,
      paymentTerms,
      status: "Unpaid",
      paidAmount: 0,
      deliveryVehicleNo: "",
      deliveryDestination: "",
      poNumber: "",
      poDate: "",
      buyerGstin: customer.gstin || "",
      buyerAddress: customer.address || "",
      buyerStateName: customer.stateName || "",
      buyerStateCode: customer.stateCode || "",
      invoiceType: "tax",
      selectedEmail: customer.primaryEmail || customer.email || "",
      reminderEnabled: true,
      reminderIntervalDays: 5,
      reminderFrequencyDays: 5,
      nextReminderAt: dueDate || new Date().toISOString(),
      lastReminderSentAt: null,
      reminderCount: 0,
      nextReminderCustomDate: null,
    });
    if (result.status !== "success" || !result.data) {
      return {
        ok: false,
        message: `Could not create the invoice: ${result.error ?? result.status}`,
      };
    }

    s.addInvoice(result.data);
    if (projectId) {
      await s.addProjectActivity(
        projectId,
        "invoice_generated",
        `Invoice ${result.data.invNo} generated — ₹${result.data.totalAmount.toLocaleString("en-IN")}`,
        "AI Agent",
      );
    }

    return {
      ok: true,
      message: `Created invoice ${result.data.invNo} for ${customer.name} — ₹${result.data.totalAmount.toLocaleString("en-IN")}, ${lineItems.length} item(s)${dcId ? ", linked to a delivery challan" : ""}.`,
      data: { id: result.data.id, invNo: result.data.invNo },
    };
  },
};

// ── createQuotation (Phase E) ────────────────────────────────────────────
//
// Fresh audit before writing this (re-verified against the actual
// quotationsApi.ts write contract and Quotations.tsx's real create form):
//   - createQuotationRemote already persists fully to Supabase, and
//     qt_no already carries a real UNIQUE (organization_id, qt_no)
//     constraint with a working, unconditional bounded retry already
//     built in — unlike dc_no/inv_no, no numbering-hardening follow-up
//     is needed here. Reused unmodified.
//   - Only customerId is hard-required by the real UI. projectId is
//     never set on create (form.projectId is not even read there —
//     the real create call passes projectId: undefined) — reproduced
//     here exactly, never invented as required.
//   - status is always "Draft" on create, exactly as Quotations.tsx
//     hardcodes it — never accepted as input here.
//   - applyGST/applyIGST both default false (no tax) exactly as
//     Quotations.tsx's emptyForm() does — no interstate/intrastate
//     auto-switching exists anywhere in the real app, so none is
//     invented here either; rates are the same fixed 9%/9%/18%
//     constants Quotations.tsx uses.
//   - Every quotation gets a Revision 1, created via
//     createQuotationRevisionRemote right after the quotation row
//     succeeds — mirrors Quotations.tsx's own create handler exactly,
//     including its real, disclosed, non-atomic behavior: if the
//     revision insert fails, the real UI does NOT roll back the
//     quotation — it leaves the quotation row standing and shows a
//     partial-success message. Reproduced honestly here, never hidden
//     and never "fixed" by inventing a transaction FabFlow itself
//     doesn't have. Note the RLS asymmetry this can surface: revision
//     insert requires quotations.edit, not quotations.create — a user
//     with only quotations.create will legitimately hit this path.
//   - total_amount/tax amounts sent are computed the same way
//     Quotations.tsx computes them (computeQuotationTax's exact
//     formula) — but the action's reported message/data always uses
//     the value createQuotationRemote actually returns, never its own
//     locally computed one.
export const createQuotation: AgentAction = {
  name: "createQuotation",
  description:
    "Create a quotation (Draft) for a customer, with an initial Revision 1. Always call searchCustomers first to resolve the real customer, and searchQuotations to check for a plausible existing match before creating a new one. A quotation is not linked to a project at creation.",
  permission: "quotations.create",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      customerId: {
        type: "string",
        description:
          "The customer id (resolve via searchCustomers first — required, never guessed).",
      },
      lineItemsJson: {
        type: "string",
        description:
          'Required. JSON array of {"desc","qty","unitPrice","hsn"} — at least one entry, each qty > 0 and unitPrice >= 0, e.g. [{"desc":"Fabrication work","qty":10,"unitPrice":500,"hsn":"7308"}]. hsn is optional.',
      },
      validUntil: {
        type: "string",
        description:
          "Quotation valid-until date (YYYY-MM-DD) — required; FabFlow's own database requires every quotation to have one.",
      },
      terms: { type: "string", description: "Terms, optional." },
      notes: { type: "string", description: "Notes, optional." },
      applyGST: {
        type: "boolean",
        description:
          "Apply 9% CGST + 9% SGST, optional, defaults to false (no tax unless the user asks for it).",
      },
      applyIGST: {
        type: "boolean",
        description:
          "Apply 18% IGST, optional, defaults to false (no tax unless the user asks for it).",
      },
    },
    required: ["customerId", "lineItemsJson", "validUntil"],
  },
  validate: (p) => {
    let rawItems: unknown[] = [];
    try {
      const parsed = JSON.parse(String(p.lineItemsJson ?? ""));
      if (Array.isArray(parsed)) rawItems = parsed;
    } catch {
      throw new Error(
        '"lineItemsJson" must be a valid JSON array, e.g. [{"desc":"...","qty":1,"unitPrice":100}].',
      );
    }
    const lineItems: LineItem[] = rawItems
      .filter(
        (it): it is Record<string, unknown> =>
          Boolean(it) && typeof it === "object",
      )
      .map((it) => ({
        desc: String(it.desc ?? "").trim(),
        hsn: String(it.hsn ?? "").trim(),
        qty: Number(it.qty),
        unitPrice: Number(it.unitPrice),
        amount: 0, // computed below, once every item has passed validation
      }))
      .filter(
        (it) =>
          it.desc &&
          Number.isFinite(it.qty) &&
          it.qty > 0 &&
          Number.isFinite(it.unitPrice) &&
          it.unitPrice >= 0,
      );
    if (lineItems.length === 0) {
      throw new Error(
        "At least one line item with a description, a positive quantity, and a non-negative unit price is required.",
      );
    }
    for (const it of lineItems) it.amount = it.qty * it.unitPrice;
    return {
      customerId: required(p, "customerId"),
      lineItems,
      // quotations.valid_until is a real NOT NULL DB column - enforce it
      // here rather than letting a blank value reach the server as an
      // unhelpful date-syntax error (Phase E.1).
      validUntil: required(p, "validUntil"),
      terms: (p.terms as string) || "",
      notes: (p.notes as string) || "",
      applyGST: Boolean(p.applyGST),
      applyIGST: Boolean(p.applyIGST),
    };
  },
  execute: async (p): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    const customer = s.customers.find((c) => c.id === p.customerId);
    if (!customer) {
      return {
        ok: false,
        message: "Customer not found — resolve it with searchCustomers first.",
      };
    }

    const lineItems = p.lineItems as LineItem[];
    const subtotal = lineItems.reduce((sum, it) => sum + it.amount, 0);
    const applyGST = p.applyGST as boolean;
    const applyIGST = p.applyIGST as boolean;
    const cgstRate = applyGST ? 9 : 0;
    const sgstRate = applyGST ? 9 : 0;
    const igstRate = applyIGST ? 18 : 0;
    const cgstAmt = Math.round((subtotal * cgstRate) / 100);
    const sgstAmt = Math.round((subtotal * sgstRate) / 100);
    const igstAmt = Math.round((subtotal * igstRate) / 100);
    const totalAmount = subtotal + cgstAmt + sgstAmt + igstAmt;

    const qtNo = computeNextQtNumber(s.quotations.map((q) => q.qtNo));

    const result = await createQuotationRemote({
      qtNo,
      customerId: p.customerId as string,
      projectId: undefined,
      lineItems,
      subtotal,
      applyGST,
      applyIGST,
      cgstRate,
      sgstRate,
      igstRate,
      cgstAmt,
      sgstAmt,
      igstAmt,
      totalAmount,
      validUntil: p.validUntil as string,
      terms: p.terms as string,
      notes: p.notes as string,
      status: "Draft",
      history: [],
    });
    if (result.status !== "success" || !result.data) {
      return {
        ok: false,
        message: `Could not create the quotation: ${result.error ?? result.status}`,
      };
    }
    s.addQuotation(result.data);

    const revResult = await createQuotationRevisionRemote({
      quotationId: result.data.id,
      revisionNumber: 1,
      revisionDate: new Date().toISOString().split("T")[0],
      lineItems,
      subtotal,
      applyGST,
      applyIGST,
      cgstRate,
      sgstRate,
      igstRate,
      cgstAmt,
      sgstAmt,
      igstAmt,
      totalAmount,
      validUntil: p.validUntil as string,
      terms: p.terms as string,
      notes: p.notes as string,
      status: "Draft",
      isCurrent: true,
    });
    if (revResult.status !== "success" || !revResult.data) {
      // Same honest partial-success shape as the real UI: the quotation
      // row genuinely exists, but its Revision 1 could not be saved —
      // never hide this, never pretend it fully succeeded.
      return {
        ok: true,
        message: `Quotation ${result.data.qtNo} was created, but its Revision 1 could not be saved: ${revResult.error ?? revResult.status}`,
        data: { id: result.data.id, qtNo: result.data.qtNo },
      };
    }
    s.addQuotationRevision(revResult.data);

    return {
      ok: true,
      message: `Created quotation ${result.data.qtNo} for ${customer.name} — ₹${result.data.totalAmount.toLocaleString("en-IN")}, ${lineItems.length} item(s), status Draft.`,
      data: { id: result.data.id, qtNo: result.data.qtNo },
    };
  },
};

// ── recordCustomerPO (Phase F) ───────────────────────────────────────────
//
// Fresh audit before writing this (re-verified against the actual live
// schema and purchaseOrdersApi.ts write contract, and Quotations.tsx's
// real "Record PO" flow):
//   - master_pos/project_purchase_orders/quotation_purchase_orders are
//     three separate tables, always written together, with no DB
//     transaction wrapping them — createMasterPORemote,
//     createProjectPurchaseOrderRemote (called once per project),
//     createQuotationPurchaseOrderRemote are three independent inserts.
//     Reused unmodified.
//   - The real UI's own behavior on a partial failure is NOT atomic and
//     NOT rolled back: if a project-link insert fails it just counts the
//     failure and continues; if the quotation-side insert fails after
//     the master PO succeeded, it reports "PO recorded, but ..." rather
//     than pretending the whole thing failed. Reproduced exactly here -
//     never silently hidden, never invented as atomic.
//   - The real UI auto-matches quotation line-item text against project
//     names to decide which projects/quantities to record. That fuzzy
//     matching is deliberately NOT reproduced here (per Phase F's own
//     approved scope) - the caller must supply an explicit, already-
//     resolved {projectId, quantity} list instead, exactly like every
//     other Agent action's entity-resolution rule (resolve via a real
//     tool, never guess from text).
//   - quotation_purchase_orders.revision_id is a real NOT NULL DB column
//     the real UI fills from the quotation's CURRENT revision
//     (getCurrentRevision - falls back to the first revision if none is
//     marked current). Resolved here the same way from the already-
//     hydrated quotationRevisions store array - never asked of the
//     caller, since a revision id isn't something a natural-language
//     request would ever reasonably name.
//   - master_pos.status/project_purchase_orders.status ("Open") and
//     quotation_purchase_orders.status ("Received") are two genuinely
//     different status vocabularies (ProjectPOStatus vs POStatus) -
//     hardcoded here exactly as Quotations.tsx hardcodes them, never
//     accepted as input.
//   - Duplicate check mirrors the real UI exactly: a case-insensitive
//     poNumber match against quotationPurchaseOrders already recorded
//     for this SAME quotation only - not a global uniqueness rule (there
//     is no DB constraint on po_number, confirmed via live schema, same
//     unenforced shape dc_no/inv_no/qt_no all had before their own
//     numbering work - not addressed here, out of Phase F's scope).
export const recordCustomerPO: AgentAction = {
  name: "recordCustomerPO",
  description:
    "Record that a customer has confirmed a quotation with a real purchase order. Always call searchQuotations first to resolve the real quotation, and searchCustomerPOs to check for a plausible existing match before recording a new one. Every project the PO covers must be resolved via findProject first and supplied explicitly — never guess project allocation from the quotation's line-item text.",
  permission: "quotations.edit",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      quotationId: {
        type: "string",
        description:
          "The quotation this PO confirms (resolve via searchQuotations first — required, never guessed).",
      },
      poNumber: {
        type: "string",
        description: "The customer's PO number — required.",
      },
      poDate: {
        type: "string",
        description: "PO date (YYYY-MM-DD) — required.",
      },
      projectEntriesJson: {
        type: "string",
        description:
          'Required. JSON array of {"projectId","quantity"} — at least one entry, each quantity > 0, e.g. [{"projectId":"...","quantity":100}]. Resolve each projectId via findProject first — never derive this from the quotation\'s line-item text.',
      },
    },
    required: ["quotationId", "poNumber", "poDate", "projectEntriesJson"],
  },
  validate: (p) => {
    let rawEntries: unknown[] = [];
    try {
      const parsed = JSON.parse(String(p.projectEntriesJson ?? ""));
      if (Array.isArray(parsed)) rawEntries = parsed;
    } catch {
      throw new Error(
        '"projectEntriesJson" must be a valid JSON array, e.g. [{"projectId":"...","quantity":100}].',
      );
    }
    const projectEntries = rawEntries
      .filter(
        (e): e is Record<string, unknown> =>
          Boolean(e) && typeof e === "object",
      )
      .map((e) => ({
        projectId: String(e.projectId ?? "").trim(),
        quantity: Number(e.quantity),
      }))
      .filter(
        (e) => e.projectId && Number.isFinite(e.quantity) && e.quantity > 0,
      );
    if (projectEntries.length === 0) {
      throw new Error(
        "At least one project with a quantity greater than 0 is required.",
      );
    }
    return {
      quotationId: required(p, "quotationId"),
      poNumber: required(p, "poNumber"),
      poDate: required(p, "poDate"),
      projectEntries,
    };
  },
  execute: async (p): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    const quotation = s.quotations.find((q) => q.id === p.quotationId);
    if (!quotation) {
      return {
        ok: false,
        message:
          "Quotation not found — resolve it with searchQuotations first.",
      };
    }

    const projectEntries = p.projectEntries as Array<{
      projectId: string;
      quantity: number;
    }>;
    const unresolvedProject = projectEntries.find(
      (e) => !s.projects.some((proj) => proj.id === e.projectId),
    );
    if (unresolvedProject) {
      return {
        ok: false,
        message: `Project not found (id ${unresolvedProject.projectId}) — resolve it with findProject first.`,
      };
    }

    // Same current-revision resolution as Quotations.tsx's getCurrentRevision
    // — never asked of the caller.
    const revision =
      s.quotationRevisions.find(
        (r) => r.quotationId === quotation.id && r.isCurrent,
      ) ?? s.quotationRevisions.find((r) => r.quotationId === quotation.id);
    if (!revision) {
      return {
        ok: false,
        message: "This quotation has no revision to record a PO against.",
      };
    }

    // Same soft duplicate guard as the real UI: a poNumber already
    // recorded for this same quotation.
    const poNumber = (p.poNumber as string).trim();
    const duplicate = s.quotationPurchaseOrders.some(
      (po) =>
        po.quotationId === quotation.id &&
        po.poNumber.trim().toLowerCase() === poNumber.toLowerCase(),
    );
    if (duplicate) {
      return {
        ok: false,
        message: `PO number "${poNumber}" is already recorded for this quotation.`,
      };
    }

    const poDate = p.poDate as string;

    const masterResult = await createMasterPORemote({
      poNumber,
      poDate,
      customerId: quotation.customerId,
      quotationId: quotation.id,
      files: [],
      status: "Open",
    });
    if (masterResult.status !== "success" || !masterResult.data) {
      return {
        ok: false,
        message: `Could not record the PO: ${masterResult.error ?? masterResult.status}`,
      };
    }
    s.addMasterPO(masterResult.data);

    let projectFailures = 0;
    for (const entry of projectEntries) {
      const ppoResult = await createProjectPurchaseOrderRemote({
        projectId: entry.projectId,
        masterPoId: masterResult.data.id,
        quotationId: quotation.id,
        poNumber,
        poDate,
        quantity: entry.quantity,
        status: "Open",
      });
      if (ppoResult.status === "success" && ppoResult.data) {
        s.addProjectPO(ppoResult.data.projectId, ppoResult.data.po);
      } else {
        projectFailures++;
      }
    }

    const qpoResult = await createQuotationPurchaseOrderRemote({
      quotationId: quotation.id,
      revisionId: revision.id,
      masterPoId: masterResult.data.id,
      poNumber,
      poDate,
      customerId: quotation.customerId,
      files: [],
      status: "Received",
    });
    if (qpoResult.status === "success" && qpoResult.data) {
      s.addQuotationPurchaseOrder(qpoResult.data);
    }

    // Honest partial-success reporting, matching Quotations.tsx exactly -
    // the master PO genuinely exists even if a child record failed.
    const problems: string[] = [];
    if (!(qpoResult.status === "success" && qpoResult.data)) {
      problems.push(
        `the quotation-side record failed: ${qpoResult.error ?? qpoResult.status}`,
      );
    }
    if (projectFailures > 0) {
      problems.push(`${projectFailures} project link(s) could not be saved`);
    }
    if (problems.length > 0) {
      return {
        ok: true,
        message: `PO ${poNumber} recorded, but ${problems.join(" and ")}.`,
        data: { id: masterResult.data.id, poNumber },
      };
    }

    return {
      ok: true,
      message: `Recorded PO ${poNumber} for ${quotation.qtNo} — ${projectEntries.length} project(s).`,
      data: { id: masterResult.data.id, poNumber },
    };
  },
};

// ── createVendor (Phase G) ────────────────────────────────────────────────
//
// Fresh audit before writing this (re-verified against the actual live
// schema, vendorsApi.ts's write contract, and Vendors.tsx's real create
// form, not the prior audit alone):
//   - createVendorRemote already persists fully to Supabase — no new API,
//     no schema change. Reused unmodified.
//   - Only `name` is genuinely required — confirmed both from the live
//     `vendors` table (only `name`/`id`/`organization_id` are NOT NULL)
//     and from Vendors.tsx's own form validation.
//   - Vendors.tsx's real create handler has a HARD, case-insensitive
//     exact-name duplicate block (not merely a soft warning) — it never
//     even calls createVendorRemote if a same-name vendor already exists.
//     Reproduced here exactly, matching the standing "the Agent replicates
//     the real UI's actual behavior" rule rather than inventing a
//     stricter or looser check.
//   - No numbering, no revision/status vocabulary, no multi-table write —
//     the simplest write in the whole registry, on par with createCustomer.
export const createVendor: AgentAction = {
  name: "createVendor",
  description:
    "Create a new vendor. Always call searchVendors first to check for a plausible existing match — never create a duplicate merely because the user's phrasing sounded confident.",
  permission: "vendors.create",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Vendor/company name." },
      phone: {
        type: "string",
        description: "Contact phone number (optional).",
      },
      address: { type: "string", description: "Address (optional)." },
      gstin: { type: "string", description: "GSTIN, if known (optional)." },
    },
    required: ["name"],
  },
  validate: (p) => ({
    name: required(p, "name"),
    phone: (p.phone as string) || "",
    address: (p.address as string) || "",
    gstin: (p.gstin as string) || "",
  }),
  execute: async (p): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    const name = p.name as string;
    // Same hard, case-insensitive exact-name duplicate block as
    // Vendors.tsx's own handleSaveAdd — never even attempts the insert.
    const duplicate = s.vendors.find(
      (v) => v.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (duplicate) {
      return {
        ok: false,
        message: `A vendor named "${duplicate.name}" already exists (id ${duplicate.id}).`,
      };
    }
    const result = await createVendorRemote({
      name,
      phone: p.phone as string,
      address: p.address as string,
      gstNumber: (p.gstin as string) || undefined,
    });
    if (result.status !== "success" || !result.data) {
      return {
        ok: false,
        message: `Could not create vendor: ${result.error ?? result.status}`,
      };
    }
    s.addVendor(result.data);
    return {
      ok: true,
      message: `Created vendor "${result.data.name}" (id ${result.data.id}).`,
      data: { id: result.data.id, name: result.data.name },
    };
  },
};

// ── Payables (Monster-1) ────────────────────────────────────────────
//
// Read side (getVendorLedger) already derives entirely from
// s.payables/s.payablePayments, which are already Supabase-backed
// (Phase M.1) — confirmed by reading queries.ts before writing this,
// not assumed. The gap was purely on the write side: no Agent action
// existed to create a payable or record a payment against one, even
// though lib/payablesApi.ts's remote functions were already complete.
// Both actions below replicate Payables.tsx's own validation exactly
// (same required fields, same "amount cannot exceed balance" guard)
// rather than inventing new business rules.

const PAYABLE_TYPES = [
  "Material",
  "CNC",
  "Transport",
  "Salary",
  "Outsourcing",
  "Other",
];

export const createPayable: AgentAction = {
  name: "createPayable",
  description:
    "Create a new vendor payable (an amount owed to a vendor). Always call searchVendors first to resolve a real vendor when possible — vendorName may still be freeform text for a vendor not yet in the system, matching the Payables page's own tolerance.",
  permission: "payables.create",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      vendorName: {
        type: "string",
        description: "Vendor name (required, even if vendorId is also given).",
      },
      vendorId: {
        type: "string",
        description:
          "Vendor id, optional — resolve via searchVendors first if the vendor is a real existing record.",
      },
      paymentType: {
        type: "string",
        description: `Type of payable, one of: ${PAYABLE_TYPES.join(", ")}. Defaults to "Material".`,
      },
      totalAmount: {
        type: "number",
        description: "Total amount owed, must be greater than 0.",
      },
      dueDate: {
        type: "string",
        description: "Due date (YYYY-MM-DD), optional.",
      },
      projectId: {
        type: "string",
        description:
          "Optional project id (resolve via findProject first) to associate this payable with a project.",
      },
      notes: { type: "string", description: "Notes, optional." },
    },
    required: ["vendorName", "totalAmount"],
  },
  validate: (p) => {
    const paymentType = (p.paymentType as string) || "Material";
    if (!PAYABLE_TYPES.includes(paymentType)) {
      throw new Error(
        `"paymentType" must be one of: ${PAYABLE_TYPES.join(", ")}.`,
      );
    }
    return {
      vendorName: required(p, "vendorName"),
      vendorId: (p.vendorId as string) || "",
      paymentType,
      totalAmount: requiredNumber(p, "totalAmount"),
      dueDate: (p.dueDate as string) || "",
      projectId: (p.projectId as string) || "",
      notes: (p.notes as string) || "",
    };
  },
  execute: async (p): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    const vendorId = p.vendorId as string;
    if (vendorId && !s.vendors.find((v) => v.id === vendorId)) {
      return {
        ok: false,
        message: "Vendor not found — resolve it with searchVendors first.",
      };
    }
    const projectId = p.projectId as string;
    if (projectId && !s.projects.find((proj) => proj.id === projectId)) {
      return {
        ok: false,
        message: "Project not found — resolve it with findProject first.",
      };
    }
    const result = await createPayableRemote({
      vendorName: p.vendorName as string,
      vendorId: vendorId || undefined,
      paymentType: p.paymentType as string,
      totalAmount: p.totalAmount as number,
      dueDate: p.dueDate as string,
      projectId: projectId || undefined,
      notes: (p.notes as string) || undefined,
    });
    if (result.status !== "success" || !result.data) {
      return {
        ok: false,
        message: `Could not create payable: ${result.error ?? result.status}`,
      };
    }
    s.addPayable(result.data);
    return {
      ok: true,
      message: `Created payable of ₹${(p.totalAmount as number).toLocaleString("en-IN")} for ${result.data.vendorName} (${result.data.paymentType}).`,
      data: { id: result.data.id },
    };
  },
};

// ── updatePayable ─────────────────────────────────────────────────────
// Monster-1 — updatePayableRemote() (lib/payablesApi.ts) is a complete,
// RLS-matched (payables.edit, same policy the payment-recording action
// already uses) function with zero callers anywhere in the frontend — no
// UI page ever built an edit form for an existing payable, confirmed via
// full-repo grep before writing this. The total_amount-below-paid_amount
// guard now lives inside updatePayableRemote itself (protects every
// caller, not just this one) — this action re-checks it up front only to
// give a clear message instead of a generic write-failure.
export const updatePayable: AgentAction = {
  name: "updatePayable",
  description:
    "Edit an existing vendor payable's total amount, due date, payment type, or notes. Always resolve the real payable first (via getVendorLedger or a payableId already known from context) — never invent one. The new total amount can never be reduced below the amount already paid against this payable — call getVendorLedger first if you need the current paid/balance figures.",
  permission: "payables.edit",
  riskLevel: "high",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      payableId: {
        type: "string",
        description:
          "The payable id to edit (required, never guessed — resolve via getVendorLedger first).",
      },
      totalAmount: {
        type: "number",
        description:
          "New total amount, optional — cannot be less than the amount already paid against this payable.",
      },
      dueDate: {
        type: "string",
        description: "New due date (YYYY-MM-DD), optional.",
      },
      paymentType: {
        type: "string",
        description: `New payable type, optional, one of: ${PAYABLE_TYPES.join(", ")}.`,
      },
      notes: {
        type: "string",
        description: "New notes, optional — replaces the existing notes.",
      },
    },
    required: ["payableId"],
  },
  validate: (p) => {
    if (
      p.totalAmount === undefined &&
      p.dueDate === undefined &&
      p.paymentType === undefined &&
      p.notes === undefined
    ) {
      throw new Error(
        "Specify at least one field to change (totalAmount, dueDate, paymentType, or notes).",
      );
    }
    if (
      p.paymentType !== undefined &&
      !PAYABLE_TYPES.includes(p.paymentType as string)
    ) {
      throw new Error(
        `"paymentType" must be one of: ${PAYABLE_TYPES.join(", ")}.`,
      );
    }
    return {
      payableId: required(p, "payableId"),
      totalAmount:
        p.totalAmount !== undefined
          ? requiredNumber(p, "totalAmount")
          : undefined,
      dueDate: p.dueDate as string | undefined,
      paymentType: p.paymentType as string | undefined,
      notes: p.notes as string | undefined,
    };
  },
  execute: async (p): Promise<AgentActionOutcome> => {
    // Authoritative re-read — the paid_amount this validation depends on
    // is trigger-derived and can change between sessions; never trust
    // useStore's potentially-stale local snapshot for it.
    const refreshed = await getPayableRemote(p.payableId as string);
    if (refreshed.status !== "success" || !refreshed.data) {
      return {
        ok: false,
        message: "Payable not found — resolve it with getVendorLedger first.",
      };
    }
    const current = refreshed.data;
    const newTotal =
      (p.totalAmount as number | undefined) ?? current.totalAmount;
    if (newTotal < current.paidAmount) {
      return {
        ok: false,
        message: `Cannot set the total to ₹${newTotal.toLocaleString("en-IN")} — ₹${current.paidAmount.toLocaleString("en-IN")} has already been paid against this payable.`,
      };
    }
    const result = await updatePayableRemote({
      ...current,
      totalAmount: newTotal,
      dueDate: (p.dueDate as string | undefined) ?? current.dueDate,
      paymentType: (p.paymentType as string | undefined) ?? current.paymentType,
      notes: (p.notes as string | undefined) ?? current.notes,
    });
    if (result.status !== "success" || !result.data) {
      return {
        ok: false,
        message: `Could not update the payable: ${result.error ?? result.status}`,
      };
    }
    useStore.getState().updatePayable(result.data);
    const balance = result.data.totalAmount - result.data.paidAmount;
    return {
      ok: true,
      message: `Updated ${result.data.vendorName}'s payable — total ₹${result.data.totalAmount.toLocaleString("en-IN")}, balance ₹${balance.toLocaleString("en-IN")}.`,
      data: { id: result.data.id },
    };
  },
};

export const recordPayablePayment: AgentAction = {
  name: "recordPayablePayment",
  description:
    "Record a payment against an existing vendor payable. Always resolve the real payable first (via getVendorLedger or the payable's id already known from context) — never invent a payableId.",
  permission: "payables.edit",
  riskLevel: "high",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      payableId: {
        type: "string",
        description: "The payable id this payment is against — required.",
      },
      amount: {
        type: "number",
        description:
          "Payment amount, must be greater than 0 and cannot exceed the remaining balance.",
      },
      mode: {
        type: "string",
        description: "Payment mode: Cash, Cheque, NEFT, RTGS, or UPI.",
      },
      paymentDate: {
        type: "string",
        description: "Payment date (YYYY-MM-DD), optional — defaults to today.",
      },
      referenceNo: {
        type: "string",
        description: "Reference/transaction number, optional.",
      },
      notes: { type: "string", description: "Notes, optional." },
    },
    required: ["payableId", "amount", "mode"],
  },
  validate: (p) => {
    const mode = String(p.mode ?? "");
    if (!PAYMENT_MODES.includes(mode as PaymentMode)) {
      throw new Error(`"mode" must be one of: ${PAYMENT_MODES.join(", ")}.`);
    }
    return {
      payableId: required(p, "payableId"),
      amount: requiredNumber(p, "amount"),
      mode: mode as PaymentMode,
      paymentDate:
        (p.paymentDate as string) || new Date().toISOString().slice(0, 10),
      referenceNo: (p.referenceNo as string) || "",
      notes: (p.notes as string) || "",
    };
  },
  execute: async (p): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    const payable = s.payables.find((pa) => pa.id === p.payableId);
    if (!payable) {
      return { ok: false, message: "Payable not found." };
    }
    const amount = p.amount as number;
    const balance = payable.totalAmount - payable.paidAmount;
    // Same guard as Payables.tsx's own handleAddPayment — replicated,
    // not bypassed.
    if (amount > balance) {
      return {
        ok: false,
        message: `Amount ₹${amount.toLocaleString("en-IN")} exceeds the remaining balance of ₹${balance.toLocaleString("en-IN")}.`,
      };
    }
    const result = await createPayablePaymentRemote({
      payableId: p.payableId as string,
      amount,
      paymentDate: p.paymentDate as string,
      mode: p.mode as PaymentMode,
      referenceNo: p.referenceNo as string,
      notes: p.notes as string,
    });
    if (result.status !== "success" || !result.data) {
      return {
        ok: false,
        message: `Could not record payment: ${result.error ?? result.status}`,
      };
    }
    s.addPayablePayment(result.data);
    // paid_amount is trigger-derived — re-read the parent payable so the
    // store reflects the real DB value, never a locally-guessed one.
    const refreshed = await getPayableRemote(p.payableId as string);
    if (refreshed.status === "success" && refreshed.data) {
      s.updatePayable(refreshed.data);
    }
    return {
      ok: true,
      message: `Recorded payment of ₹${amount.toLocaleString("en-IN")} against ${payable.vendorName}'s payable.`,
      data: { id: result.data.id },
    };
  },
};

// ── deletePayablePayment ────────────────────────────────────────────────
// Monster-1 — deletePayablePaymentRemote() (lib/payablesApi.ts) is a
// complete, RLS-matched (payables.delete, same as deletePayableRemote)
// function with zero callers anywhere in the frontend — no UI page ever
// wired up a way to remove a mistakenly-recorded or duplicate vendor
// payment, confirmed via full-repo grep before writing this. paid_amount
// on the parent payable is trigger-derived
// (trg_recompute_payable_paid_amount), so deleting the payment row alone
// is enough — the same re-fetch-after-write pattern recordPayablePayment
// already uses keeps the store's paidAmount correct, never guessed here.
export const deletePayablePayment: AgentAction = {
  name: "deletePayablePayment",
  description:
    'Delete a mistakenly-recorded or duplicate payment against a vendor payable. Always call getVendorLedger first to find the real payment and its sourceId (a row with docType "Payment") — never invent a paymentId. This is destructive and cannot be undone; confirm the exact amount/date with the user before calling.',
  permission: "payables.delete",
  riskLevel: "high",
  kind: "write",
  destructive: true,
  parameters: {
    type: "object",
    properties: {
      paymentId: {
        type: "string",
        description:
          'The payment\'s real id — the sourceId of a getVendorLedger row with docType "Payment" (required, never guessed).',
      },
    },
    required: ["paymentId"],
  },
  validate: (p) => ({
    paymentId: required(p, "paymentId"),
  }),
  execute: async (p): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    const payment = s.payablePayments.find((pp) => pp.id === p.paymentId);
    if (!payment) {
      return {
        ok: false,
        message: "Payment not found — resolve it with getVendorLedger first.",
      };
    }
    const payable = s.payables.find((pa) => pa.id === payment.payableId);
    const result = await deletePayablePaymentRemote(p.paymentId as string);
    if (result.status !== "success") {
      return {
        ok: false,
        message: `Could not delete the payment: ${result.error ?? result.status}`,
      };
    }
    s.deletePayablePayment(p.paymentId as string);
    // paid_amount is trigger-derived — re-read the parent payable so the
    // store reflects the real DB value, never a locally-guessed one.
    if (payable) {
      const refreshed = await getPayableRemote(payable.id);
      if (refreshed.status === "success" && refreshed.data) {
        s.updatePayable(refreshed.data);
      }
    }
    return {
      ok: true,
      message: `Deleted the ₹${payment.amount.toLocaleString("en-IN")} payment${payable ? ` against ${payable.vendorName}'s payable` : ""} dated ${payment.paymentDate}.`,
      data: { id: p.paymentId },
    };
  },
};

const MACHINE_TYPES: MachineType[] = [
  "Laser Cutting",
  "CNC",
  "Welding",
  "Bending",
  "Powder Coating",
  "Compressor",
  "Generator",
  "Drilling",
  "Grinding",
  "Forklift",
  "Testing",
  "Air Tool",
  "Other",
];

export const createMachine: AgentAction = {
  name: "createMachine",
  description:
    "Register a new machine in Machinery Management. Always call searchMachines first to check for a plausible existing match before creating a duplicate. machineCode is generated automatically (MCH-nnn), never supply one.",
  permission: "machinery.create",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Machine name." },
      type: {
        type: "string",
        description: `Machine type — one of: ${MACHINE_TYPES.join(", ")}.`,
      },
      brand: { type: "string", description: "Brand, optional." },
      model: { type: "string", description: "Model, optional." },
      serialNumber: { type: "string", description: "Serial number, optional." },
      location: { type: "string", description: "Location, optional." },
      department: { type: "string", description: "Department, optional." },
      purchaseCost: {
        type: "number",
        description: "Purchase cost, optional.",
      },
      hourlyRate: {
        type: "number",
        description: "Hourly operating rate, optional.",
      },
      notes: { type: "string", description: "Notes, optional." },
    },
    required: ["name", "type"],
  },
  validate: (p) => {
    const type = required(p, "type");
    if (!MACHINE_TYPES.includes(type as MachineType)) {
      throw new Error(`type must be one of: ${MACHINE_TYPES.join(", ")}.`);
    }
    return {
      name: required(p, "name"),
      type,
      brand: (p.brand as string) || "",
      model: (p.model as string) || "",
      serialNumber: (p.serialNumber as string) || "",
      location: (p.location as string) || "",
      department: (p.department as string) || "",
      purchaseCost: p.purchaseCost as number | undefined,
      hourlyRate: p.hourlyRate as number | undefined,
      notes: (p.notes as string) || "",
    };
  },
  execute: async (p): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    const machineCode = computeNextMachineCode(
      (s.machines || []).map((m) => m.machineCode),
    );
    const now = Date.now();
    const result = await createMachineRemote({
      machineCode,
      name: p.name as string,
      type: p.type as MachineType,
      brand: (p.brand as string) || undefined,
      model: (p.model as string) || undefined,
      serialNumber: (p.serialNumber as string) || undefined,
      location: (p.location as string) || undefined,
      department: (p.department as string) || undefined,
      purchaseCost: p.purchaseCost as number | undefined,
      currentStatus: "Operational" as MachineStatus,
      totalRunningHours: 0,
      hourlyRate: p.hourlyRate as number | undefined,
      notes: (p.notes as string) || undefined,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    if (result.status !== "success" || !result.data) {
      return {
        ok: false,
        message: `Could not create machine: ${result.error ?? result.status}`,
      };
    }
    s.addMachine(result.data);
    return {
      ok: true,
      message: `Registered machine ${result.data.machineCode} — ${result.data.name}.`,
      data: { id: result.data.id, machineCode: result.data.machineCode },
    };
  },
};

export const createTool: AgentAction = {
  name: "createTool",
  description:
    "Register a new tool in Tools inventory. Always call searchDrawings or check existing records first to avoid an obvious duplicate. toolCode is generated automatically (TL-nnn). This only creates the tool record — issuing/returning a tool to an employee is a separate workflow not exposed to the Agent.",
  permission: "tools.create",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Tool name." },
      category: { type: "string", description: "Category, optional." },
      quantity: {
        type: "number",
        description: "Quantity on hand, optional — defaults to 1.",
      },
      location: { type: "string", description: "Location, optional." },
      replacementValue: {
        type: "number",
        description: "Replacement value, optional.",
      },
      notes: { type: "string", description: "Notes, optional." },
    },
    required: ["name"],
  },
  validate: (p) => ({
    name: required(p, "name"),
    category: (p.category as string) || "",
    quantity: (p.quantity as number) || 1,
    location: (p.location as string) || "",
    replacementValue: p.replacementValue as number | undefined,
    notes: (p.notes as string) || "",
  }),
  execute: async (p): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    const toolCode = computeNextToolCode(
      (s.tools || []).map((t) => t.toolCode),
    );
    const now = Date.now();
    const result = await createToolRemote({
      toolCode,
      name: p.name as string,
      category: (p.category as string) || undefined,
      quantity: (p.quantity as number) || 1,
      location: (p.location as string) || undefined,
      status: "Available" as ToolStatus,
      replacementValue: p.replacementValue as number | undefined,
      notes: (p.notes as string) || undefined,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    if (result.status !== "success" || !result.data) {
      return {
        ok: false,
        message: `Could not create tool: ${result.error ?? result.status}`,
      };
    }
    s.addTool(result.data);
    return {
      ok: true,
      message: `Registered tool ${result.data.toolCode} — ${result.data.name}.`,
      data: { id: result.data.id, toolCode: result.data.toolCode },
    };
  },
};

export const createDie: AgentAction = {
  name: "createDie",
  description:
    "Register a new die in Dies inventory. dieCode is generated automatically (DIE-nnn). Optionally links the die to one or more existing engineering drawings — resolve real drawing ids with searchDrawings first, never invent one; pass them as a comma-separated list in drawingIds.",
  permission: "tooling_dies.create",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Die name." },
      type: { type: "string", description: "Die type, optional." },
      purpose: { type: "string", description: "Purpose, optional." },
      compatibleMachineId: {
        type: "string",
        description:
          "Compatible machine id, optional — resolve via searchMachines first.",
      },
      location: { type: "string", description: "Location, optional." },
      notes: { type: "string", description: "Notes, optional." },
      drawingIds: {
        type: "string",
        description:
          "Comma-separated engineering drawing ids to link, optional — resolve via searchDrawings first, never invent one.",
      },
    },
    required: ["name"],
  },
  validate: (p) => ({
    name: required(p, "name"),
    type: (p.type as string) || "",
    purpose: (p.purpose as string) || "",
    compatibleMachineId: (p.compatibleMachineId as string) || "",
    location: (p.location as string) || "",
    notes: (p.notes as string) || "",
    drawingIds: (p.drawingIds as string) || "",
  }),
  execute: async (p): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    if (p.compatibleMachineId) {
      const machine = s.machines.find((m) => m.id === p.compatibleMachineId);
      if (!machine) {
        return {
          ok: false,
          message: `Machine not found (id ${p.compatibleMachineId}) — resolve it with searchMachines first.`,
        };
      }
    }
    const dieCode = computeNextDieCode((s.dies || []).map((d) => d.dieCode));
    const now = Date.now();
    const result = await createDieRemote({
      dieCode,
      name: p.name as string,
      type: (p.type as string) || undefined,
      purpose: (p.purpose as string) || undefined,
      compatibleMachineId: (p.compatibleMachineId as string) || undefined,
      location: (p.location as string) || undefined,
      status: "Available" as DieStatus,
      notes: (p.notes as string) || undefined,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    if (result.status !== "success" || !result.data) {
      return {
        ok: false,
        message: `Could not create die: ${result.error ?? result.status}`,
      };
    }
    s.addDie(result.data);

    const drawingIds = ((p.drawingIds as string) || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const linkFailures: string[] = [];
    for (const drawingId of drawingIds) {
      try {
        await addLink(drawingId, "die", result.data.id);
      } catch {
        linkFailures.push(drawingId);
      }
    }

    const base = `Registered die ${result.data.dieCode} — ${result.data.name}.`;
    if (drawingIds.length === 0) {
      return {
        ok: true,
        message: base,
        data: { id: result.data.id, dieCode: result.data.dieCode },
      };
    }
    const linked = drawingIds.length - linkFailures.length;
    const linkMsg =
      linkFailures.length === 0
        ? ` Linked ${linked} drawing(s).`
        : ` Linked ${linked}/${drawingIds.length} drawing(s) — failed to link: ${linkFailures.join(", ")}.`;
    return {
      ok: true,
      message: base + linkMsg,
      data: { id: result.data.id, dieCode: result.data.dieCode },
    };
  },
};

export const createBillableService: AgentAction = {
  name: "createBillableService",
  description:
    "Create a new billable machine/service-revenue service. Always call searchBillableServices first to check for a plausible existing match. This creates the service only — set its rate afterwards via the Machine/Service Revenue page (rate-setting is not exposed to the Agent).",
  permission: "machine_revenue.create",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Service name." },
      machineId: {
        type: "string",
        description:
          "Machine id this service runs on, optional — resolve via searchMachines first. Omit for process-level services with no single machine.",
      },
      chargingMethod: {
        type: "string",
        description: "One of: hour, piece, bend, kg, other.",
      },
      unitLabel: {
        type: "string",
        description: "Display unit, e.g. 'hrs', 'pcs', 'kg' — optional.",
      },
    },
    required: ["name", "chargingMethod"],
  },
  validate: (p) => {
    const chargingMethod = required(p, "chargingMethod");
    const valid: ChargingMethod[] = ["hour", "piece", "bend", "kg", "other"];
    if (!valid.includes(chargingMethod as ChargingMethod)) {
      throw new Error(`chargingMethod must be one of: ${valid.join(", ")}.`);
    }
    return {
      name: required(p, "name"),
      machineId: (p.machineId as string) || "",
      chargingMethod,
      unitLabel: (p.unitLabel as string) || "",
    };
  },
  execute: async (p): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    if (p.machineId) {
      const machine = s.machines.find((m) => m.id === p.machineId);
      if (!machine) {
        return {
          ok: false,
          message: `Machine not found (id ${p.machineId}) — resolve it with searchMachines first.`,
        };
      }
    }
    const now = Date.now();
    const result = await createBillableServiceRemote({
      name: p.name as string,
      machineId: (p.machineId as string) || undefined,
      chargingMethod: p.chargingMethod as ChargingMethod,
      unitLabel: (p.unitLabel as string) || undefined,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    if (result.status !== "success" || !result.data) {
      return {
        ok: false,
        message: `Could not create billable service: ${result.error ?? result.status}`,
      };
    }
    s.addBillableServiceLocal(result.data);
    return {
      ok: true,
      message: `Created billable service "${result.data.name}" (id ${result.data.id}). Set its rate via the Machine/Service Revenue page before recording usage.`,
      data: { id: result.data.id, name: result.data.name },
    };
  },
};

export const recordMachineServiceUsage: AgentAction = {
  name: "recordMachineServiceUsage",
  description:
    "Record billable machine/service usage against a project. Always call findProject and searchBillableServices first to resolve real ids — never guess. The rate applied is the service's current rate at the time of recording (from searchBillableServices); revenueAmount = quantity × rate, both frozen permanently on this record and never recomputed later even if the rate changes.",
  permission: "machine_revenue.create",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description: "Project id (resolve via findProject first — required).",
      },
      billableServiceId: {
        type: "string",
        description:
          "Billable service id (resolve via searchBillableServices first — required).",
      },
      quantity: {
        type: "number",
        description: "Quantity/duration used, must be greater than 0.",
      },
      usageDate: {
        type: "string",
        description: "Usage date (YYYY-MM-DD), optional — defaults to today.",
      },
      notes: { type: "string", description: "Notes, optional." },
    },
    required: ["projectId", "billableServiceId", "quantity"],
  },
  validate: (p) => ({
    projectId: required(p, "projectId"),
    billableServiceId: required(p, "billableServiceId"),
    quantity: requiredNumber(p, "quantity"),
    usageDate: (p.usageDate as string) || new Date().toISOString().slice(0, 10),
    notes: (p.notes as string) || "",
  }),
  execute: async (p): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    const project = s.projects.find((proj) => proj.id === p.projectId);
    if (!project) {
      return {
        ok: false,
        message: `Project not found (id ${p.projectId}) — resolve it with findProject first.`,
      };
    }
    const service = (s.billableServices || []).find(
      (svc) => svc.id === p.billableServiceId,
    );
    if (!service) {
      return {
        ok: false,
        message: `Billable service not found (id ${p.billableServiceId}) — resolve it with searchBillableServices first.`,
      };
    }
    const rateApplied = getCurrentServiceRate(
      service.id,
      s.machineServiceRates || [],
    );
    const quantity = p.quantity as number;
    const revenueAmount = quantity * rateApplied;
    const result = await createServiceUsageRemote({
      projectId: project.id,
      billableServiceId: service.id,
      usageDate: p.usageDate as string,
      quantity,
      unit: service.unitLabel,
      rateApplied,
      revenueAmount,
      notes: (p.notes as string) || undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    if (result.status !== "success" || !result.data) {
      return {
        ok: false,
        message: `Could not record machine service usage: ${result.error ?? result.status}`,
      };
    }
    s.addMachineServiceUsageLocal(result.data);
    return {
      ok: true,
      message: `Recorded ${quantity} ${service.unitLabel || ""} of "${service.name}" on project ${project.projectNo ?? project.id} — revenue ₹${revenueAmount.toLocaleString("en-IN")} at ₹${rateApplied}/${service.unitLabel || "unit"}.`,
      data: { id: result.data.id, revenueAmount },
    };
  },
};

const COMPANY_PO_STATUSES: CompanyPOStatus[] = ["Draft", "Sent", "Received"];

// ── createCompanyPO (Phase H) ─────────────────────────────────────────────
//
// Fresh audit before writing this (re-verified against the actual live
// schema, companyPosApi.ts's write contract, and CompanyPOs.tsx's real
// create form, not the Phase H investigation report alone):
//   - createCompanyPORemote already persists fully to Supabase (single
//     table, company_pos) — no new API, no schema change. Reused
//     unmodified, including its own bounded retry-on-conflict for
//     cpo_number (a genuine UNIQUE(organization_id, cpo_number)
//     constraint) — computeNextCpoNumber is imported from
//     companyPosApi.ts, never duplicated locally (the mistake found in
//     createInvoice's own local helper is not repeated here).
//   - VendorSelect (the real widget) only ever produces a real, resolved
//     (vendorId, vendorName) pair — never free text alone. Reproduced
//     here by requiring vendorId to resolve against the store's vendors
//     (via searchVendors first), even though the DB column itself is
//     nullable and two live production rows exist with vendor_id: null —
//     the Agent replicates the widget's strictness, not the save
//     handler's looser tolerance.
//   - Selecting a vendor in the real UI auto-populates vendorName/
//     vendorAddress/vendorGst/vendorContact as an editable snapshot of
//     the vendor record at that moment — reproduced exactly here from
//     the resolved vendor, never asked of the caller separately.
//   - Line items are free text (description/quantity/unit/rate) — no
//     inventory-item resolution exists or is required at creation
//     (resourceType/resourceItemId are populated only by a separate,
//     later receive_company_po_item() RPC, out of scope here).
//   - The real UI does not enforce quantity > 0 (rate = 0 is normal and
//     confirmed in live data) — quantity > 0 is a deliberate, approved
//     Agent-side tightening beyond what the human UI allows, not a
//     reproduction of existing business logic.
//   - status defaults to "Draft" exactly like CompanyPOs.tsx's
//     emptyForm(), but (unlike Quotation) the real form does allow
//     choosing Sent/Received at creation too — so it's accepted here as
//     an optional parameter, validated against the same 3-value set.
//   - gstPercent is a single flat percentage (not split CGST/SGST/IGST)
//     — matches the real form's simpler tax model exactly.
//   - Creation is single-table — no partial-write/atomicity concern.
export const createCompanyPO: AgentAction = {
  name: "createCompanyPO",
  description:
    "Create a company purchase order (an outgoing PO to a vendor). Always call searchVendors first to resolve the real vendor, and searchCompanyPOs to check for a plausible existing match before creating a new one. Line items are free text — no inventory-item resolution needed.",
  permission: "company_po.create",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      vendorId: {
        type: "string",
        description:
          "The vendor id (resolve via searchVendors first — required, never guessed). The vendor's name/address/GSTIN/contact are populated automatically from this — do not ask for them separately unless overriding.",
      },
      itemsJson: {
        type: "string",
        description:
          'Required. JSON array of {"description","quantity","unit","rate"} — at least one entry, each description non-empty, each quantity > 0, rate may be 0, e.g. [{"description":"MS Sheet 2mm","quantity":50,"unit":"kg","rate":65}]. "unit" is optional (defaults to "nos").',
      },
      expectedDeliveryDate: {
        type: "string",
        description: "Expected delivery date (YYYY-MM-DD), optional.",
      },
      deliveryAddress: {
        type: "string",
        description: "Delivery address, optional.",
      },
      gstPercent: {
        type: "number",
        description: "GST percentage, optional, defaults to 0.",
      },
      status: {
        type: "string",
        description:
          'PO status: "Draft" (default), "Sent", or "Received". Only use something other than "Draft" if the user says so explicitly.',
      },
      termsAndConditions: {
        type: "string",
        description: "Terms and conditions, optional.",
      },
      notes: { type: "string", description: "Notes, optional." },
    },
    required: ["vendorId", "itemsJson"],
  },
  validate: (p) => {
    const status = (p.status as string) || "Draft";
    if (!COMPANY_PO_STATUSES.includes(status as CompanyPOStatus)) {
      throw new Error(
        `"status" must be one of: ${COMPANY_PO_STATUSES.join(", ")}.`,
      );
    }
    let rawItems: unknown[] = [];
    try {
      const parsed = JSON.parse(String(p.itemsJson ?? ""));
      if (Array.isArray(parsed)) rawItems = parsed;
    } catch {
      throw new Error(
        '"itemsJson" must be a valid JSON array, e.g. [{"description":"...","quantity":1,"rate":100}].',
      );
    }
    const items = rawItems
      .filter(
        (it): it is Record<string, unknown> =>
          Boolean(it) && typeof it === "object",
      )
      .map((it) => ({
        id: `item-${Date.now()}-${Math.random()}`,
        description: String(it.description ?? "").trim(),
        quantity: Number(it.quantity),
        unit: String(it.unit ?? "").trim() || "nos",
        rate: Number(it.rate),
        amount: 0, // computed below, once every item has passed validation
      }))
      .filter(
        (it) =>
          it.description &&
          Number.isFinite(it.quantity) &&
          it.quantity > 0 &&
          Number.isFinite(it.rate) &&
          it.rate >= 0,
      );
    if (items.length === 0) {
      throw new Error(
        "At least one item with a description and a quantity greater than 0 is required.",
      );
    }
    for (const it of items) it.amount = it.quantity * it.rate;
    return {
      vendorId: required(p, "vendorId"),
      items,
      expectedDeliveryDate: (p.expectedDeliveryDate as string) || "",
      deliveryAddress: (p.deliveryAddress as string) || "",
      gstPercent: p.gstPercent !== undefined ? Number(p.gstPercent) : 0,
      status: status as CompanyPOStatus,
      termsAndConditions: (p.termsAndConditions as string) || "",
      notes: (p.notes as string) || "",
    };
  },
  execute: async (p): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    const vendor = s.vendors.find((v) => v.id === p.vendorId);
    if (!vendor) {
      return {
        ok: false,
        message: "Vendor not found — resolve it with searchVendors first.",
      };
    }

    const items = p.items as CompanyPOItem[];
    const subtotal = items.reduce((sum, it) => sum + it.amount, 0);
    const gstPercent = p.gstPercent as number;
    const gstAmount = subtotal * (gstPercent / 100);
    const grandTotal = subtotal + gstAmount;

    const cpoNumber = computeNextCpoNumber(
      s.companyPOs.map((po) => po.cpoNumber),
    );

    const result = await createCompanyPORemote({
      cpoNumber,
      vendorId: vendor.id,
      vendorName: vendor.name,
      vendorAddress: vendor.address || "",
      vendorGst: vendor.gstNumber || "",
      vendorContact: vendor.phone || "",
      items,
      deliveryAddress: p.deliveryAddress as string,
      expectedDeliveryDate: p.expectedDeliveryDate as string,
      status: p.status as CompanyPOStatus,
      gstPercent,
      subtotal,
      gstAmount,
      grandTotal,
      termsAndConditions: p.termsAndConditions as string,
      notes: p.notes as string,
    });
    if (result.status !== "success" || !result.data) {
      return {
        ok: false,
        message: `Could not create company PO: ${result.error ?? result.status}`,
      };
    }
    s.addCompanyPO(result.data);
    return {
      ok: true,
      message: `Created company PO ${result.data.cpoNumber} for ${vendor.name} — ₹${result.data.grandTotal.toLocaleString("en-IN")}, ${items.length} item(s), status ${result.data.status}.`,
      data: { id: result.data.id, cpoNumber: result.data.cpoNumber },
    };
  },
};

// ── createExpenseFloat (Phase I) ──────────────────────────────────────────
//
// Fresh audit before writing this (re-verified against the actual live
// schema, expenseFloatsApi.ts's write contract, and PettyExpenses.tsx's
// real "New Float" form, not the Phase I investigation report alone):
//   - createExpenseFloatRemote already persists fully to Supabase (single
//     table, expense_floats) — no new API, no schema change. Reused
//     unmodified, including its own bounded retry-on-conflict for
//     float_no (a genuine UNIQUE(organization_id, float_no) constraint) —
//     computeNextFloatNumber is imported from expenseFloatsApi.ts, never
//     duplicated locally.
//   - Only employeeId and issuedAmount (> 0) are genuinely required —
//     matches the real form's own validation ("Select employee",
//     "Enter issued amount") exactly.
//   - issuedDate defaults to today, matching emptyFloatForm() exactly.
//   - status/spentAmount/balanceAmount/returnedAmount/issuedBy/settledAt
//     are never accepted as input — the DB defaults status to "Open" and
//     the remaining amounts to 0; issuedBy is stamped server-side from
//     the session inside createExpenseFloatRemote itself.
//   - Settling/reconciling a float (purchases, inventory/machine
//     resolution) is a separate, later workflow — explicitly out of
//     scope here, never proposed by this action.
export const createExpenseFloat: AgentAction = {
  name: "createExpenseFloat",
  description:
    "Issue a new expense float (cash advance for purchases) to an employee. Always call findEmployee first to resolve the real employee, and searchExpenseFloats to check whether they already have a relevant open float before creating a new one. Settling/reconciling an existing float is not supported here.",
  permission: "expense_float.create",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      employeeId: {
        type: "string",
        description:
          "The employee id (resolve via findEmployee first — required, never guessed).",
      },
      issuedAmount: {
        type: "number",
        description: "Amount issued, must be greater than 0.",
      },
      issuedDate: {
        type: "string",
        description: "Issue date (YYYY-MM-DD), optional — defaults to today.",
      },
      purpose: { type: "string", description: "Purpose, optional." },
      notes: { type: "string", description: "Notes, optional." },
      projectId: {
        type: "string",
        description:
          "Optional project id (resolve via findProject first). Omit if the user didn't name one.",
      },
    },
    required: ["employeeId", "issuedAmount"],
  },
  validate: (p) => ({
    employeeId: required(p, "employeeId"),
    issuedAmount: requiredNumber(p, "issuedAmount"),
    issuedDate:
      (p.issuedDate as string) || new Date().toISOString().slice(0, 10),
    purpose: (p.purpose as string) || "",
    notes: (p.notes as string) || "",
    projectId: (p.projectId as string) || "",
  }),
  execute: async (p): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    const employee = s.employees.find((e) => e.id === p.employeeId);
    if (!employee) {
      return {
        ok: false,
        message: "Employee not found — resolve them with findEmployee first.",
      };
    }
    let projectId: string | undefined;
    if (p.projectId) {
      const project = s.projects.find((proj) => proj.id === p.projectId);
      if (!project) {
        return {
          ok: false,
          message: `Project not found (id ${p.projectId}) — resolve it with findProject first.`,
        };
      }
      projectId = project.id;
    }

    const floatNo = computeNextFloatNumber(
      s.expenseFloats.map((f) => f.floatNo),
    );
    const result = await createExpenseFloatRemote({
      floatNo,
      employeeId: employee.id,
      issuedDate: p.issuedDate as string,
      issuedAmount: p.issuedAmount as number,
      purpose: p.purpose as string,
      notes: p.notes as string,
      projectId,
    });
    if (result.status !== "success" || !result.data) {
      return {
        ok: false,
        message: `Could not create expense float: ${result.error ?? result.status}`,
      };
    }
    s.addExpenseFloat(result.data);
    return {
      ok: true,
      message: `Issued expense float ${result.data.floatNo} to ${employee.name} — ₹${result.data.issuedAmount.toLocaleString("en-IN")}, status ${result.data.status}.`,
      data: { id: result.data.id, floatNo: result.data.floatNo },
    };
  },
};

const SIMPLE_EXPENSE_TYPES: PettyExpenseType[] = [
  "Material",
  "Tools",
  "Labour",
  "Maintenance",
  "Food",
  "Transport",
  "Misc",
];
// The 5 "smart" categories (Inventory Purchase, Machine Service, Vehicle
// Expense, Employee Personal Expense, Courier / Delivery) only carry real
// meaning through the Float Settlement dialog's "Purchased Items" flow,
// which on Finish Settlement fans out to other modules' own store actions
// (inventory, machinery, etc — see PettyExpenseType's own type comment in
// types.ts). The standalone "Add Expense" dialog technically lets a human
// pick one of those 5 too, but doing so records the label with none of
// that real integration effect — a pre-existing app quirk, not something
// this action should reproduce. Deliberately restricted to the 7 simple
// categories, approved as an intentional Agent-side tightening.
const EXPENSE_MODES: PettyExpenseMode[] = [
  "Company Expense",
  "Personal Expense",
];

// ── createPettyExpense (Phase J) ──────────────────────────────────────────
//
// Fresh audit before writing this (re-verified against the actual live
// schema, expenseFloatsApi.ts's write contract, and PettyExpenses.tsx's
// real standalone "Add Expense" form, not the Phase J investigation
// report alone):
//   - createPettyExpenseRemote already persists fully to Supabase (single
//     table, petty_expenses) — no new API, no schema change. Reused
//     unmodified. This is the standalone ad-hoc path, distinct from the
//     Settlement "Purchased Items" flow's createPettyExpensesBatchRemote,
//     which this action does not touch.
//   - Only employeeId and amount (> 0) are genuinely required — matches
//     the real form's own validation exactly.
//   - date defaults to today, expenseType defaults to "Misc",
//     expenseMode defaults to "Company Expense" — matches emptyForm()
//     exactly.
//   - floatId validity is delegated entirely to resolveFloatLink
//     (imported unchanged from store.ts) — a float that doesn't belong
//     to this employee, or is already Fully Settled, is silently
//     dropped exactly as the real UI does, never surfaced as an error.
//     When a float genuinely attaches, expenseMode is forced to
//     "Company Expense", exactly like Fix logic in handleSave.
//   - spent_amount/balance_amount on the linked float are never computed
//     here — trg_recompute_petty_expense_floats owns that entirely,
//     confirmed live.
export const createPettyExpense: AgentAction = {
  name: "createPettyExpense",
  description:
    "Record a standalone petty-cash expense for an employee (not tied to Float Settlement's Purchased Items flow). Always call findEmployee first to resolve the real employee. Only the 7 simple expense categories are supported here — Material, Tools, Labour, Maintenance, Food, Transport, Misc; the 5 'smart' categories (Inventory Purchase, Machine Service, Vehicle Expense, Employee Personal Expense, Courier / Delivery) belong to the Settlement workflow and are not supported by this action.",
  permission: "petty_expenses.create",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  parameters: {
    type: "object",
    properties: {
      employeeId: {
        type: "string",
        description:
          "The employee id (resolve via findEmployee first — required, never guessed).",
      },
      amount: {
        type: "number",
        description: "Expense amount, must be greater than 0.",
      },
      date: {
        type: "string",
        description: "Expense date (YYYY-MM-DD), optional — defaults to today.",
      },
      expenseType: {
        type: "string",
        description:
          'One of: "Material", "Tools", "Labour", "Maintenance", "Food", "Transport", "Misc". Optional, defaults to "Misc". The 5 Settlement-only "smart" categories are not accepted here.',
      },
      expenseMode: {
        type: "string",
        description:
          'PettyExpense mode: "Company Expense" (default) or "Personal Expense". Forced to "Company Expense" if a valid floatId is supplied.',
      },
      projectId: {
        type: "string",
        description:
          "Optional project id (resolve via findProject first). Omit if the user didn't name one.",
      },
      floatId: {
        type: "string",
        description:
          "Optional expense float id (resolve via searchExpenseFloats first, scoped to the employee). Omit if the user didn't name one — never guessed.",
      },
      notes: { type: "string", description: "Notes, optional." },
    },
    required: ["employeeId", "amount"],
  },
  validate: (p) => {
    const expenseType = (p.expenseType as string) || "Misc";
    if (!SIMPLE_EXPENSE_TYPES.includes(expenseType as PettyExpenseType)) {
      throw new Error(
        `"expenseType" must be one of: ${SIMPLE_EXPENSE_TYPES.join(", ")}. The Settlement-only categories (Inventory Purchase, Machine Service, Vehicle Expense, Employee Personal Expense, Courier / Delivery) are not supported by standalone Agent expense creation — use the Petty Expenses page's Settlement flow for those.`,
      );
    }
    const expenseMode = (p.expenseMode as string) || "Company Expense";
    if (!EXPENSE_MODES.includes(expenseMode as PettyExpenseMode)) {
      throw new Error(
        `"expenseMode" must be one of: ${EXPENSE_MODES.join(", ")}.`,
      );
    }
    return {
      employeeId: required(p, "employeeId"),
      amount: requiredNumber(p, "amount"),
      date: (p.date as string) || new Date().toISOString().slice(0, 10),
      expenseType: expenseType as PettyExpenseType,
      expenseMode: expenseMode as PettyExpenseMode,
      projectId: (p.projectId as string) || "",
      floatId: (p.floatId as string) || "",
      notes: (p.notes as string) || "",
    };
  },
  execute: async (p): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    const employee = s.employees.find((e) => e.id === p.employeeId);
    if (!employee) {
      return {
        ok: false,
        message: "Employee not found — resolve them with findEmployee first.",
      };
    }
    let projectId: string | undefined;
    if (p.projectId) {
      const project = s.projects.find((proj) => proj.id === p.projectId);
      if (!project) {
        return {
          ok: false,
          message: `Project not found (id ${p.projectId}) — resolve it with findProject first.`,
        };
      }
      projectId = project.id;
    }

    // Same silent-drop rule as PettyExpenses.tsx's handleSave: a floatId
    // only sticks if it genuinely belongs to this employee and isn't
    // already Fully Settled — never surfaced as an error, exactly as the
    // real UI's own resolveFloatLink behaves.
    const floatId = resolveFloatLink(
      (p.floatId as string) || undefined,
      employee.id,
      s.expenseFloats,
    );
    const expenseMode = floatId
      ? "Company Expense"
      : (p.expenseMode as PettyExpenseMode);

    const result = await createPettyExpenseRemote({
      date: p.date as string,
      employeeId: employee.id,
      amount: p.amount as number,
      expenseType: p.expenseType as PettyExpenseType,
      expenseMode,
      projectId,
      floatId,
      notes: p.notes as string,
    });
    if (result.status !== "success" || !result.data) {
      return {
        ok: false,
        message: `Could not record the expense: ${result.error ?? result.status}`,
      };
    }
    s.addPettyExpense(result.data);
    return {
      ok: true,
      message: `Recorded ${result.data.expenseType} expense of ₹${result.data.amount.toLocaleString("en-IN")} for ${employee.name}${floatId ? " against float" : ""} — ${result.data.expenseMode}.`,
      data: { id: result.data.id },
    };
  },
};

// createSalaryAdvance — Master directive. signatureData is deliberately
// NOT part of the LLM-facing `parameters` schema below: the LLM never
// sees or supplies it. AgentPage.tsx (requiresSignature: true) must open
// the same SignaturePad component EmployeeDetail.tsx uses, capture it,
// and inject it into the pending call's input before this action's
// confirm step runs. validate() enforces its presence either way — this
// action can never persist an advance with no captured signature,
// matching the existing UI's own requirement exactly (never deleted, per
// the master directive).
export const createSalaryAdvance: AgentAction = {
  name: "createSalaryAdvance",
  description:
    "Record a new salary advance for an employee. Always call findEmployee first to resolve the real employee. Requires a captured signature — the Agent UI collects this, never guess or omit it. remainingBalance is computed the same way the Employee Detail page does: the sum of the employee's prior advance amounts plus this new amount.",
  permission: "salary_advance.create",
  riskLevel: "low",
  kind: "write",
  destructive: false,
  requiresSignature: true,
  parameters: {
    type: "object",
    properties: {
      employeeId: {
        type: "string",
        description:
          "The employee id (resolve via findEmployee first — required, never guessed).",
      },
      amount: {
        type: "number",
        description: "Advance amount, must be greater than 0.",
      },
      date: {
        type: "string",
        description: "Advance date (YYYY-MM-DD), optional — defaults to today.",
      },
      reason: { type: "string", description: "Reason, optional." },
    },
    required: ["employeeId", "amount"],
  },
  validate: (p) => {
    const signatureData = p.signatureData as string;
    if (!signatureData) {
      throw new Error(
        "A captured signature is required to record a salary advance.",
      );
    }
    return {
      employeeId: required(p, "employeeId"),
      amount: requiredNumber(p, "amount"),
      date: (p.date as string) || new Date().toISOString().slice(0, 10),
      reason: (p.reason as string) || "",
      signatureData,
    };
  },
  execute: async (p): Promise<AgentActionOutcome> => {
    const s = useStore.getState();
    const employee = s.employees.find((e) => e.id === p.employeeId);
    if (!employee) {
      return {
        ok: false,
        message: "Employee not found — resolve them with findEmployee first.",
      };
    }
    const empAdvances = s.advanceRecords.filter(
      (a) => a.employeeId === employee.id,
    );
    const totalAdvanced = empAdvances.reduce((sum, a) => sum + a.amount, 0);
    const amount = p.amount as number;
    const result = await createAdvanceRecordRemote({
      employeeId: employee.id,
      amount,
      date: p.date as string,
      reason: p.reason as string,
      remainingBalance: totalAdvanced + amount,
      signatureData: p.signatureData as string,
    });
    if (result.status !== "success" || !result.data) {
      return {
        ok: false,
        message: `Could not record salary advance: ${result.error ?? result.status}`,
      };
    }
    s.addAdvanceRecord(result.data);
    return {
      ok: true,
      message: `Recorded a signed salary advance of ₹${amount.toLocaleString("en-IN")} for ${employee.name}.`,
      data: { id: result.data.id },
    };
  },
};

export const AGENT_ACTIONS: Record<string, AgentAction> = {
  findCustomer,
  createCustomer,
  findProject,
  createProject,
  createRepeatOrder,
  findEmployee,
  createWorkCard,
  recordStageTransaction,
  updateProductionStageStatus,
  assignQmsInspectionStage,
  attachDocument,
  createEmployee: createEmployeeAction,
  recordPayment,
  recordInventoryPurchase,
  recordInventoryUsage,
  recordMaterialPurchase,
  completeMaterialRequisition,
  createScrapRecord,
  createDeliveryChallan,
  createInvoice,
  createQuotation,
  recordCustomerPO,
  createVendor,
  createPayable,
  updatePayable,
  recordPayablePayment,
  deletePayablePayment,
  createCompanyPO,
  createExpenseFloat,
  createPettyExpense,
  createMachine,
  createTool,
  createDie,
  createBillableService,
  recordMachineServiceUsage,
  createSalaryAdvance,
};

/** The single execution gate every action call goes through: re-checks
 * the SAME permission the real UI checks, using the SAME hasPermission()
 * function — the Agent gets no permission the logged-in user doesn't
 * already have, and RLS at the database level is unaffected either way. */
export async function runAction(
  actionName: string,
  rawParams: Record<string, unknown>,
  ctx: AgentActionContext,
): Promise<AgentActionOutcome> {
  const action = AGENT_ACTIONS[actionName];
  if (!action) {
    return { ok: false, message: `Unknown action "${actionName}".` };
  }
  if (!hasPermission(ctx.currentUser, action.permission)) {
    return {
      ok: false,
      message: `Blocked: you don't have permission (${action.permission}) to do this.`,
    };
  }
  let params: Record<string, unknown>;
  try {
    params = action.validate(rawParams);
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Invalid input.",
    };
  }
  try {
    return await action.execute(params, ctx);
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "The action failed unexpectedly.",
    };
  }
}
