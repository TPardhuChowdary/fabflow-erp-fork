// Final Unified Prototype — AI Agent intent parser ("Classic mode").
//
// Ported from the real agent/intentParser.ts (see PARITY_TRACKER.md
// #30), adapted to this lab's own DataState shape (Project.name instead
// of projectName/customerVisibleName, no assignedEmployees). Production's
// own header comment on that file explains exactly why this deterministic
// parser — not a real LLM — is what a user actually drives: no LLM SDK
// exists in that codebase, and wiring one safely needs a server-side key
// holder, which is a form of infrastructure that codebase could at least
// theoretically add later (a Supabase Edge Function). This lab has no
// backend AT ALL — not even that theoretical path — so the same
// reasoning applies with even less room to grow: this parser (and the
// real ERP mutations it calls) IS the Agent here, not a placeholder for
// one. The real LLM chat panel (agent/llm/orchestrator.ts) is disclosed
// as a gap in PARITY_TRACKER.md rather than faked with a canned-response
// chatbot.
//
// Also dropped versus the real parser (disclosed, not silently cut): the
// "assign <employee> <task> for <hours> at <rate>" patterns and "who is
// working on it" / "how much should X have completed" — all four depend
// on employee work-assignment data (WorkCard-equivalent) that lives in
// EmployeeDetail.tsx's ~2,100-line HR/payroll subsystem, already
// disclosed as not reproduced in Module 13 (Employees).
import type { DataState } from "../data";
import { resolveProjectReference } from "./context";
import type { AgentIntent } from "./types";

type Resolved =
  | { status: "one"; id: string; label: string }
  | { status: "none" }
  | { status: "many"; options: string[] };

function resolveCustomer(data: DataState, nameRaw: string): Resolved {
  const q = nameRaw.trim().toUpperCase();
  const matches = data.customers.filter((c) =>
    c.name.toUpperCase().includes(q),
  );
  if (matches.length === 0) return { status: "none" };
  if (matches.length > 1)
    return { status: "many", options: matches.map((c) => c.name) };
  return { status: "one", id: matches[0].id, label: matches[0].name };
}

function resolveProject(data: DataState, nameRaw: string): Resolved {
  const q = nameRaw.trim().toUpperCase();
  const matches = data.projects.filter((p) => p.name.toUpperCase().includes(q));
  if (matches.length === 0) return { status: "none" };
  if (matches.length > 1)
    return {
      status: "many",
      options: matches.map((p) => `${p.name} (${p.no})`),
    };
  return { status: "one", id: matches[0].id, label: matches[0].name };
}

function clarifyFor(kind: string, name: string, r: Resolved): AgentIntent {
  if (r.status === "none") {
    return {
      kind: "clarify",
      question: `I couldn't find a ${kind} matching "${name}". Could you check the spelling, or say "create ${kind} ${name}"?`,
    };
  }
  return {
    kind: "clarify",
    question: `Multiple ${kind}s match "${name}" — which one did you mean?`,
    options: (r as { status: "many"; options: string[] }).options,
  };
}

const CREATE_PROJECT_RE =
  /create\s+(?:the\s+)?(.+?)\s+project\s+for\s+(.+?)\.?$/i;
const REPEAT_ORDER_WITH_PROJECT_AND_QTY_RE =
  /repeat\s+order\s+for\s+(.+?)\s+for\s+(\d+)\s*(?:pieces|pcs)/i;
const REPEAT_ORDER_WITH_QTY_RE =
  /repeat\s+order\s+for\s+(\d+)\s*(?:pieces|pcs)/i;
const REPEAT_ORDER_WITH_PROJECT_RE = /repeat\s+order\s+for\s+(.+?)\.?$/i;
const ATTACH_DOC_RE =
  /(?:add|attach)\s+(?:this\s+)?(?:drawing|document|file)\s+to\s+(?:the\s+)?(.+?)\s+project/i;
const FIND_CUSTOMER_RE = /^find\s+customer\s+(.+)/i;
const FIND_PROJECT_RE = /^find\s+project\s+(.+)/i;
const FIND_EMPLOYEE_RE = /^find\s+employee\s+(.+)/i;
const CREATE_CUSTOMER_RE = /^create\s+(?:company|customer)?\s*(.+?)\.?$/i;

const STATUS_OF_RE =
  /^(?:what(?:'s| is)|show me)\s+(?:the\s+)?status\s+of\s+(.+?)\??$/i;
const HAPPENING_WITH_RE = /^what(?:'s| is)\s+happening\s+with\s+(.+?)\??$/i;
const HOW_DOING_RE = /^how\s+is\s+(.+?)\s+doing\??$/i;
const PENDING_FOR_RE = /^what(?:'s| is)\s+pending\s+for\s+(.+?)\??$/i;
const LATEST_ONE_RE = /^what\s+about\s+the\s+latest\s+one\??$/i;
const WHY_DELAYED_RE =
  /^why\s+is\s+(it|that|this|the order|that order)\s+(?:delayed|late|behind)\??$/i;
const AMBIGUOUS_FIX_RE = /^(fix|resolve|correct)\s+(it|that|this)\.?$/i;

export interface ParseContext {
  drawingId?: string;
  drawingName?: string;
  projectId?: string;
  currentCustomerId?: string;
}

function parseSingle(
  data: DataState,
  instruction: string,
  ctx: ParseContext,
): AgentIntent {
  const text = instruction.trim();
  const convo = { currentProjectId: ctx.projectId, history: [] };

  let statusMatch =
    STATUS_OF_RE.exec(text) ||
    HAPPENING_WITH_RE.exec(text) ||
    HOW_DOING_RE.exec(text) ||
    PENDING_FOR_RE.exec(text);
  if (statusMatch) {
    const r = resolveCustomer(data, statusMatch[1]);
    if (r.status !== "one") return clarifyFor("customer", statusMatch[1], r);
    return { kind: "investigate", topic: "customerStatus", customerId: r.id };
  }

  if (LATEST_ONE_RE.test(text)) {
    if (!ctx.currentCustomerId) {
      return {
        kind: "clarify",
        question: "The latest order for which customer?",
      };
    }
    return {
      kind: "investigate",
      topic: "customerStatus",
      customerId: ctx.currentCustomerId,
    };
  }

  const refMatch = WHY_DELAYED_RE.exec(text);
  if (refMatch) {
    const projectId = resolveProjectReference(refMatch[1], convo);
    if (!projectId) {
      return { kind: "clarify", question: "Which order are you asking about?" };
    }
    return { kind: "investigate", topic: "projectStatus", projectId };
  }

  if (AMBIGUOUS_FIX_RE.test(text)) {
    return {
      kind: "clarify",
      question:
        "Fixing what, exactly? I can, for example, create a repeat order or attach a drawing — tell me the specific action.",
    };
  }

  let m = FIND_CUSTOMER_RE.exec(text);
  if (m) {
    const r = resolveCustomer(data, m[1]);
    if (r.status !== "one") return clarifyFor("customer", m[1], r);
    return {
      kind: "action",
      actionName: "findCustomer",
      params: { name: m[1] },
    };
  }

  m = FIND_PROJECT_RE.exec(text);
  if (m)
    return {
      kind: "action",
      actionName: "findProject",
      params: { name: m[1] },
    };

  m = FIND_EMPLOYEE_RE.exec(text);
  if (m)
    return {
      kind: "action",
      actionName: "findEmployee",
      params: { name: m[1] },
    };

  m = ATTACH_DOC_RE.exec(text);
  if (m) {
    if (!ctx.drawingId) {
      return {
        kind: "clarify",
        question:
          "Which drawing should I attach? (open it from the Drawing Repository first)",
      };
    }
    const r = resolveProject(data, m[1]);
    if (r.status !== "one") return clarifyFor("project", m[1], r);
    return {
      kind: "action",
      actionName: "attachDocument",
      params: { drawingId: ctx.drawingId, projectId: r.id },
    };
  }

  m = REPEAT_ORDER_WITH_PROJECT_AND_QTY_RE.exec(text);
  if (m) {
    const r = resolveProject(data, m[1]);
    if (r.status !== "one") return clarifyFor("project", m[1], r);
    return {
      kind: "action",
      actionName: "createRepeatOrder",
      params: { projectId: r.id, quantity: Number(m[2]) },
    };
  }

  m = REPEAT_ORDER_WITH_QTY_RE.exec(text);
  if (m) {
    if (!ctx.projectId) {
      return {
        kind: "clarify",
        question: "Which project should this repeat order be for?",
      };
    }
    return {
      kind: "action",
      actionName: "createRepeatOrder",
      params: { projectId: ctx.projectId, quantity: Number(m[1]) },
    };
  }

  m = REPEAT_ORDER_WITH_PROJECT_RE.exec(text);
  if (m) {
    const r = resolveProject(data, m[1]);
    if (r.status !== "one") return clarifyFor("project", m[1], r);
    return {
      kind: "action",
      actionName: "createRepeatOrder",
      params: { projectId: r.id },
    };
  }

  m = CREATE_PROJECT_RE.exec(text);
  if (m) {
    const [, projName, custName] = m;
    const r = resolveCustomer(data, custName);
    if (r.status !== "one") return clarifyFor("customer", custName, r);
    return {
      kind: "action",
      actionName: "createProject",
      params: { customerId: r.id, projectName: projName.trim() },
    };
  }

  m = CREATE_CUSTOMER_RE.exec(text);
  if (m?.[1].trim()) {
    return {
      kind: "action",
      actionName: "createCustomer",
      params: { name: m[1].trim() },
    };
  }

  return {
    kind: "unrecognized",
    reason:
      "I didn't recognize that instruction. Classic mode understands: " +
      '"create <company>", "create the <name> project for <company>", ' +
      '"create a repeat order for <project> for <N> pieces", ' +
      '"add this drawing to the <project> project", and "find customer/project/employee <name>".',
  };
}

export function parseInstruction(
  data: DataState,
  instruction: string,
  ctx: ParseContext = {},
): AgentIntent {
  const andSplit = instruction
    .split(/\.\s+|\band\s+(?=create)/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (andSplit.length >= 2) {
    const parsed = andSplit.map((part) => parseSingle(data, part, ctx));
    const allActions = parsed.every((p) => p.kind === "action");
    if (allActions) {
      return {
        kind: "plan",
        steps: parsed.map((p) => {
          const a = p as Extract<AgentIntent, { kind: "action" }>;
          return { actionName: a.actionName, params: a.params };
        }),
      };
    }
    const actionable = parsed.filter((p) => p.kind === "action");
    if (actionable.length === 1) return actionable[0];
  }
  return parseSingle(data, instruction, ctx);
}
