// FabFlow AI Agent — intent parser (Phase 1).
//
// HONEST SCOPE NOTE (see final report): this is a deterministic,
// pattern-based parser, not a real LLM. No LLM SDK exists anywhere in
// this codebase today, and wiring one safely means a server-side
// Supabase Edge Function holding the API key (this app is a client-only
// SPA — an API key can never live in the browser bundle) — a genuinely
// new piece of infrastructure that also can't be deployed in this
// session. Building that AND a working end-to-end demo in the same pass
// would violate "make the basic action/tool execution architecture
// reliable first, don't overbuild." So Phase 1 ships a real, working
// action-execution pipeline behind a parser that recognizes the exact
// instruction shapes in the spec — and is honest below about exactly
// what it does and does not understand, both here and in the returned
// {kind:"unrecognized", reason} for anything else. Swapping this file
// for a real LLM call later requires no change to actions.ts, the audit
// layer, or the UI — they only ever see an AgentIntent.

import { useStore } from "@/store";
import { resolveEmployeeReference, resolveProjectReference } from "./context";
import type { AgentIntent } from "./types";

type Resolved =
  | { status: "one"; id: string; label: string }
  | { status: "none" }
  | { status: "many"; options: string[] };

function resolveCustomer(nameRaw: string): Resolved {
  const q = nameRaw.trim().toUpperCase();
  const matches = useStore
    .getState()
    .customers.filter((c) => c.name.toUpperCase().includes(q));
  if (matches.length === 0) return { status: "none" };
  if (matches.length > 1)
    return { status: "many", options: matches.map((c) => c.name) };
  return { status: "one", id: matches[0].id, label: matches[0].name };
}

function resolveProject(nameRaw: string, customerId?: string): Resolved {
  const q = nameRaw.trim().toUpperCase();
  let matches = useStore
    .getState()
    .projects.filter(
      (p) =>
        p.projectName.toUpperCase().includes(q) ||
        (p.customerVisibleName ?? "").toUpperCase().includes(q),
    );
  if (customerId) matches = matches.filter((p) => p.customerId === customerId);
  if (matches.length === 0) return { status: "none" };
  if (matches.length > 1) {
    return {
      status: "many",
      options: matches.map(
        (p) => `${p.customerVisibleName || p.projectName} (${p.projectNo})`,
      ),
    };
  }
  return {
    status: "one",
    id: matches[0].id,
    label: matches[0].customerVisibleName || matches[0].projectName,
  };
}

function resolveEmployee(nameRaw: string): Resolved {
  const q = nameRaw.trim().toLowerCase();
  const matches = useStore
    .getState()
    .employees.filter((e) => e.name.toLowerCase().includes(q));
  if (matches.length === 0) return { status: "none" };
  if (matches.length > 1)
    return { status: "many", options: matches.map((e) => e.name) };
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
const ASSIGN_HOURS_OF_TASK_RE =
  /assign\s+(\w+)\s+(\d+(?:\.\d+)?)\s*hours?\s+of\s+(.+?)\s+at\s+(\d+(?:\.\d+)?)\s*pieces?\s*(?:per|\/)\s*hour/i;
const ASSIGN_TASK_FOR_HOURS_RE =
  /assign\s+(\w+)\s+(.+?)\s+for\s+(\d+(?:\.\d+)?)\s*hours?\s+at\s+(\d+(?:\.\d+)?)\s*pieces?\s*(?:per|\/)\s*hour/i;
const ATTACH_DOC_RE =
  /(?:add|attach)\s+(?:this\s+)?(?:drawing|document|file)\s+to\s+(?:the\s+)?(.+?)\s+project/i;
const FIND_CUSTOMER_RE = /^find\s+customer\s+(.+)/i;
const FIND_PROJECT_RE = /^find\s+project\s+(.+)/i;
const FIND_EMPLOYEE_RE = /^find\s+employee\s+(.+)/i;
const CREATE_CUSTOMER_RE = /^create\s+(?:company|customer)?\s*(.+?)\.?$/i;

// ── Investigation / conversational-follow-up patterns (Phase 2) ───────
// Deliberately a SMALL, fixed set — this is not meant to grow into a
// general grammar (see the file header). Anything not matched here falls
// through to the existing action patterns above/below, or "unrecognized".
const STATUS_OF_RE =
  /^(?:what(?:'s| is)|show me)\s+(?:the\s+)?status\s+of\s+(.+?)\??$/i;
const HAPPENING_WITH_RE = /^what(?:'s| is)\s+happening\s+with\s+(.+?)\??$/i;
const HOW_DOING_RE = /^how\s+is\s+(.+?)\s+doing\??$/i;
const PENDING_FOR_RE = /^what(?:'s| is)\s+pending\s+for\s+(.+?)\??$/i;
const LATEST_ONE_RE = /^what\s+about\s+the\s+latest\s+one\??$/i;
const WHY_DELAYED_RE =
  /^why\s+is\s+(it|that|this|the order|that order)\s+(?:delayed|late|behind)\??$/i;
const WHO_WORKING_RE =
  /^who\s+is\s+working\s+on\s+(it|that|this|the order|that order)\??$/i;
const HOW_MUCH_COMPLETED_RE =
  /^how\s+much\s+should\s+(him|her|he|she|\w+)\s+have\s+completed(?:\s+by\s+now)?\??$/i;
const AMBIGUOUS_FIX_RE = /^(fix|resolve|correct)\s+(it|that|this)\.?$/i;

/** Extra context an already-open screen (or the conversation itself)
 * supplies so the parser doesn't have to guess an id from text alone —
 * e.g. "attach this drawing" only makes sense with a drawingId already
 * in hand, and "why is it delayed" only resolves via whatever project
 * the last few turns were about. All optional; see agent/context.ts for
 * the conversation-context/ERP-data-boundary this backs. */
export interface ParseContext {
  drawingId?: string;
  drawingName?: string;
  projectId?: string; // e.g. the project the user currently has open, OR the conversation's current project
  currentCustomerId?: string;
  currentEmployeeId?: string;
}

function parseSingle(instruction: string, ctx: ParseContext): AgentIntent {
  const text = instruction.trim();
  const convo = {
    currentProjectId: ctx.projectId,
    currentEmployeeId: ctx.currentEmployeeId,
    history: [],
  };

  // ── Investigation / status questions ─────────────────────────────
  let statusMatch =
    STATUS_OF_RE.exec(text) ||
    HAPPENING_WITH_RE.exec(text) ||
    HOW_DOING_RE.exec(text) ||
    PENDING_FOR_RE.exec(text);
  if (statusMatch) {
    const r = resolveCustomer(statusMatch[1]);
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

  let refMatch = WHY_DELAYED_RE.exec(text);
  if (refMatch) {
    const projectId = resolveProjectReference(refMatch[1], convo);
    if (!projectId) {
      return { kind: "clarify", question: "Which order are you asking about?" };
    }
    return { kind: "investigate", topic: "projectStatus", projectId };
  }

  refMatch = WHO_WORKING_RE.exec(text);
  if (refMatch) {
    const projectId = resolveProjectReference(refMatch[1], convo);
    if (!projectId) {
      return { kind: "clarify", question: "Which order are you asking about?" };
    }
    return { kind: "investigate", topic: "whoIsWorking", projectId };
  }

  const howMuchMatch = HOW_MUCH_COMPLETED_RE.exec(text);
  if (howMuchMatch) {
    const word = howMuchMatch[1];
    let employeeId = resolveEmployeeReference(word, convo);
    if (!employeeId) {
      const r = resolveEmployee(word);
      if (r.status !== "one") return clarifyFor("employee", word, r);
      employeeId = r.id;
    }
    return { kind: "investigate", topic: "expectedQuantity", employeeId };
  }

  if (AMBIGUOUS_FIX_RE.test(text)) {
    return {
      kind: "clarify",
      question:
        "Fixing what, exactly? I can, for example, assign more hours to an employee or create a new work assignment — tell me the specific action.",
    };
  }

  let m = FIND_CUSTOMER_RE.exec(text);
  if (m) {
    const r = resolveCustomer(m[1]);
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
    const r = resolveProject(m[1]);
    if (r.status !== "one") return clarifyFor("project", m[1], r);
    return {
      kind: "action",
      actionName: "attachDocument",
      params: { drawingId: ctx.drawingId, projectId: r.id },
    };
  }

  m = ASSIGN_HOURS_OF_TASK_RE.exec(text);
  if (m) {
    const [, empName, hours, task, rate] = m;
    const r = resolveEmployee(empName);
    if (r.status !== "one") return clarifyFor("employee", empName, r);
    if (!ctx.projectId) {
      return {
        kind: "clarify",
        question: `Which project is "${task.trim()}" for?`,
      };
    }
    return {
      kind: "action",
      actionName: "createWorkCard",
      params: {
        employeeId: r.id,
        projectId: ctx.projectId,
        task: task.trim(),
        durationHours: Number(hours),
        piecesPerHour: Number(rate),
      },
    };
  }

  m = ASSIGN_TASK_FOR_HOURS_RE.exec(text);
  if (m) {
    const [, empName, task, hours, rate] = m;
    const r = resolveEmployee(empName);
    if (r.status !== "one") return clarifyFor("employee", empName, r);
    if (!ctx.projectId) {
      return {
        kind: "clarify",
        question: `Which project is "${task.trim()}" for?`,
      };
    }
    return {
      kind: "action",
      actionName: "createWorkCard",
      params: {
        employeeId: r.id,
        projectId: ctx.projectId,
        task: task.trim(),
        durationHours: Number(hours),
        piecesPerHour: Number(rate),
      },
    };
  }

  m = REPEAT_ORDER_WITH_PROJECT_AND_QTY_RE.exec(text);
  if (m) {
    const r = resolveProject(m[1]);
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
    const r = resolveProject(m[1]);
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
    const r = resolveCustomer(custName);
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
      "I didn't recognize that instruction. Phase 1 understands: " +
      '"create <company>", "create the <name> project for <company>", ' +
      '"create a repeat order for <project> for <N> pieces", ' +
      '"assign <employee> <task> for <N> hours at <M> pieces per hour", ' +
      '"add this drawing to the <project> project", and "find customer/project/employee <name>".',
  };
}

/** Splits on a top-level " and " and tries to parse each half as its own
 * action — a deliberately narrow multi-step recognizer (not a general
 * planner) for exactly the "do X and Y" shape in the spec. Both halves
 * must resolve to real actions or this falls back to single-instruction
 * parsing (which will likely report "unrecognized" for a genuinely
 * compound sentence it can't split cleanly — reported honestly, not
 * guessed). */
export function parseInstruction(
  instruction: string,
  ctx: ParseContext = {},
): AgentIntent {
  const andSplit = instruction
    .split(/\.\s+|\band\s+(?=assign|create)/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (andSplit.length >= 2) {
    const parsed = andSplit.map((part) => parseSingle(part, ctx));
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
    // If exactly one part is a real action and the rest are just scene-
    // setting text ("ABC gave us another 500 Metal Rods."), parse the
    // single actionable part alone instead of failing the whole thing.
    const actionable = parsed.filter((p) => p.kind === "action");
    if (actionable.length === 1) return actionable[0];
  }
  return parseSingle(instruction, ctx);
}
