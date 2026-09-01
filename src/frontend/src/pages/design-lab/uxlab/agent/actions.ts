// Final Unified Prototype — AI Agent action registry ("Classic mode").
//
// Ported from the real agent/actions.ts (4,290 lines, 31 real actions —
// see PARITY_TRACKER.md #30). Real production's own header comment
// applies unchanged: "The Agent is a CALLER of the existing ERP, not a
// parallel implementation of it" — every action below wraps this lab's
// own already-built, already-verified store actions (addCustomer,
// createProjectDirect, addDrawingLinkFull), no new business logic.
//
// Scope: only the 7 actions genuinely reachable through Classic mode's
// deterministic parser are reproduced (findCustomer, createCustomer,
// findProject, createProject, createRepeatOrder, findEmployee,
// attachDocument) — real production's OTHER 24 write actions
// (recordPayment, createInvoice, createQuotation, createVendor,
// createPayable, createMachine, createTool, createDie,
// createBillableService, recordMachineServiceUsage, createCompanyPO,
// createExpenseFloat, createPettyExpense, createSalaryAdvance,
// recordInventoryPurchase, recordInventoryUsage, recordMaterialPurchase,
// completeMaterialRequisition, createScrapRecord, createDeliveryChallan,
// recordCustomerPO, updatePayable, recordPayablePayment,
// deletePayablePayment, recordStageTransaction,
// updateProductionStageStatus, assignQmsInspectionStage) are ONLY
// reachable in real production through the real LLM chat's tool-calling
// — never through its own Classic-mode parser either. Since the LLM chat
// itself is a disclosed infeasible gap here (no backend to hold an API
// key at all, not even a Supabase Edge Function), those 24 actions have
// no path to be exercised honestly and are not stubbed out — every
// action registered below is fully real and actually executes against
// the live store, exactly as production's Classic mode does.
import type { Customer, DataState, Drawing, Project } from "../data";

export interface AgentActionOutcome {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export interface AgentActionDef {
  name: string;
  description: string;
  kind: "read" | "write";
}

export const AGENT_ACTIONS: Record<string, AgentActionDef> = {
  findCustomer: {
    name: "findCustomer",
    description: "Search existing customers by name.",
    kind: "read",
  },
  createCustomer: {
    name: "createCustomer",
    description: "Create a new customer (company).",
    kind: "write",
  },
  findProject: {
    name: "findProject",
    description: "Search existing projects/orders by name.",
    kind: "read",
  },
  createProject: {
    name: "createProject",
    description: "Create a new project for a customer.",
    kind: "write",
  },
  createRepeatOrder: {
    name: "createRepeatOrder",
    description: "Create a repeat order from an existing project.",
    kind: "write",
  },
  findEmployee: {
    name: "findEmployee",
    description: "Search existing employees by name.",
    kind: "read",
  },
  attachDocument: {
    name: "attachDocument",
    description: "Link an existing drawing/document to a project.",
    kind: "write",
  },
};

// The subset of useUxLabStore()'s value this registry actually calls —
// named explicitly rather than importing the whole Ctx type, so this
// file's real dependency surface stays honest and small.
export interface AgentActionStore {
  data: DataState;
  addCustomer: (fields: Omit<Customer, "id" | "contact" | "since">) => Customer;
  createProjectDirect: (
    customerId: string,
    name: string,
    qty: number,
    value: number,
    workDescription?: string,
  ) => Project;
  addDrawingLinkFull: (
    drawingId: string,
    linkedType: "project" | "machine" | "vendor" | "customer" | "die",
    linkedId: string,
  ) => void;
}

export async function runAction(
  actionName: string,
  params: Record<string, unknown>,
  store: AgentActionStore,
): Promise<AgentActionOutcome> {
  switch (actionName) {
    case "findCustomer": {
      const q = String(params.name ?? "").toUpperCase();
      const matches = store.data.customers.filter((c) =>
        c.name.toUpperCase().includes(q),
      );
      return {
        ok: true,
        message:
          matches.length === 0
            ? `No customers matching "${params.name}".`
            : `Found ${matches.length}: ${matches.map((c) => c.name).join(", ")}.`,
        data: { matches: matches.map((c) => ({ id: c.id, name: c.name })) },
      };
    }
    case "createCustomer": {
      const name = String(params.name ?? "").trim();
      if (!name) return { ok: false, message: "customer name is required" };
      const created = store.addCustomer({
        name,
        contactPerson: "",
        phone: "",
        email: "",
        gstin: "",
        stateName: "",
        stateCode: "",
        address: "",
        emails: [],
        primaryEmail: "",
        additionalDetails: [],
      });
      return {
        ok: true,
        message: `Created customer "${created.name}" (id ${created.id}).`,
        data: { id: created.id, name: created.name },
      };
    }
    case "findProject": {
      const q = String(params.name ?? "").toUpperCase();
      const matches = store.data.projects.filter((p) =>
        p.name.toUpperCase().includes(q),
      );
      return {
        ok: true,
        message:
          matches.length === 0
            ? `No projects matching "${params.name}".`
            : `Found ${matches.length}: ${matches.map((p) => `${p.name} (${p.no})`).join(", ")}.`,
        data: { matches: matches.map((p) => ({ id: p.id, no: p.no })) },
      };
    }
    case "createProject": {
      const customerId = String(params.customerId ?? "");
      const projectName = String(params.projectName ?? "").trim();
      if (!customerId || !projectName) {
        return {
          ok: false,
          message: "customerId and projectName are required",
        };
      }
      const customer = store.data.customers.find((c) => c.id === customerId);
      if (!customer) return { ok: false, message: "Customer not found." };
      const totalQty = params.totalQty ? Number(params.totalQty) : 0;
      const created = store.createProjectDirect(
        customerId,
        projectName,
        totalQty,
        0,
        String(params.workDescription ?? ""),
      );
      return {
        ok: true,
        message: `Created project ${created.no} "${created.name}" for ${customer.name}.`,
        data: { id: created.id, no: created.no },
      };
    }
    case "createRepeatOrder": {
      const projectId = String(params.projectId ?? "");
      const source = store.data.projects.find((p) => p.id === projectId);
      if (!source) return { ok: false, message: "Source project not found." };
      const quantity = params.quantity ? Number(params.quantity) : source.qty;
      const newName = String(params.newName ?? "").trim() || source.name;
      const created = store.createProjectDirect(
        source.customerId,
        newName,
        quantity,
        source.value,
        source.workDescription,
      );
      return {
        ok: true,
        message: `Created repeat order ${created.no} from ${source.name}, quantity ${quantity}.`,
        data: { id: created.id, no: created.no },
      };
    }
    case "findEmployee": {
      const q = String(params.name ?? "").toLowerCase();
      const matches = store.data.employees.filter((e) =>
        e.name.toLowerCase().includes(q),
      );
      return {
        ok: true,
        message:
          matches.length === 0
            ? `No employees matching "${params.name}".`
            : `Found ${matches.length}: ${matches.map((e) => e.name).join(", ")}.`,
        data: { matches: matches.map((e) => ({ id: e.id, name: e.name })) },
      };
    }
    case "attachDocument": {
      const drawingId = String(params.drawingId ?? "");
      const projectId = String(params.projectId ?? "");
      const drawing: Drawing | undefined = store.data.drawings.find(
        (d) => d.id === drawingId,
      );
      const project = store.data.projects.find((p) => p.id === projectId);
      if (!drawing || !project) {
        return { ok: false, message: "Drawing or project not found." };
      }
      store.addDrawingLinkFull(drawingId, "project", projectId);
      return {
        ok: true,
        message: `Attached "${drawing.fileName}" to ${project.name}.`,
        data: { drawingId, projectId },
      };
    }
    default:
      return { ok: false, message: `Unknown action "${actionName}".` };
  }
}
