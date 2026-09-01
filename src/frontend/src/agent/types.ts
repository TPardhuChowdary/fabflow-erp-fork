// FabFlow AI Agent — Phase 1 foundation.
//
// The Agent is a CALLER of the existing ERP, not a parallel implementation
// of it. Every action below wraps an already-existing, already-verified
// API function or store action (customersApi.ts, projectsApi.ts,
// store.repeatProject, employeesApi.ts, store.addProjectActivity,
// drawingEditor/api/drawings.ts's addLink) — no new business logic, no
// new tables, no direct Supabase/SQL access from here.
//
// Permission model: each action names the exact `module.action` key from
// permissions.ts it requires, and execute() re-checks that with the SAME
// hasPermission() the rest of the app uses, against the currently
// authenticated user. If the logged-in user couldn't do this by hand in
// the normal UI, the Agent can't do it either — RLS is still the final,
// unbypassable enforcement point underneath all of this.

import type { AuthUser } from "@/types";

export type AgentRiskLevel = "low" | "high";

/** A minimal JSON Schema subset — just enough to describe this registry's
 * actual parameters and to hand to an LLM's tool-calling API (every
 * major vendor's function-calling `parameters` field is plain JSON
 * Schema, so this one shape works regardless of which provider is
 * active — see supabase/functions/agent-chat/provider.ts).
 * Deliberately not a full JSON Schema
 * type or a new dependency (no such library exists in this repo, and the
 * registry's real parameter shapes are simple enough not to need one —
 * see the ponytail ladder). This is the ONLY thing the LLM ever sees
 * about a tool's shape; it never sees the execute()/validate() bodies or
 * any database detail. */
export interface JsonSchemaProperty {
  type: "string" | "number" | "boolean";
  description: string;
}
export interface ToolParameterSchema {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
}

export interface AgentActionContext {
  currentUser: AuthUser;
}

export interface AgentActionOutcome {
  ok: boolean;
  /** Human-readable summary shown in the transcript, e.g.
   * "Created customer ABC Industries (id abc-123)." or
   * "Blocked: you don't have permission to create projects." */
  message: string;
  /** The persisted entity/entities this action produced, if any — for
   * chaining (a later step in a multi-step instruction can read an
   * earlier step's created id). */
  data?: Record<string, unknown>;
}

export interface AgentAction<TParams = Record<string, unknown>> {
  name: string;
  description: string;
  /** Exact permissions.ts key, e.g. "customers.create". Checked with the
   * same hasPermission() every other page in the app uses — never a
   * separate "agent" permission. */
  permission: string;
  riskLevel: AgentRiskLevel;
  /** "read" actions (findCustomer, findProject, findEmployee) execute
   * immediately with no confirmation step, matching the product spec's
   * READ vs WRITE split. "write" actions always show "Agent wants to
   * perform: ..." and wait for Confirm/Cancel, regardless of riskLevel —
   * riskLevel only affects presentation/urgency, never whether
   * confirmation happens at all for a write. */
  kind: "read" | "write";
  /** True only for actions that destroy or irreversibly change data
   * (delete, cancel, finalize). None of the current registry's write
   * actions are destructive — every one is an additive create — but the
   * field exists so a future delete/cancel tool has somewhere honest to
   * declare it, and so the LLM-facing layer can require the stronger
   * confirmation copy your spec calls for on destructive operations. */
  destructive: boolean;
  /** True only for actions whose underlying business record requires a
   * captured signature (e.g. Salary Advance — see EmployeeDetail.tsx's
   * SignaturePad flow). When true, the Agent UI must collect
   * `signatureData` via the same SignaturePad component before this
   * action's confirm step runs, and inject it into `input` — the LLM
   * never sees or supplies this field itself (it is not part of
   * `parameters` below). */
  requiresSignature?: boolean;
  /** LLM-facing parameter schema — see ToolParameterSchema. The single
   * source of truth for what the tool accepts; validate() below enforces
   * the same shape at runtime regardless of who calls it (parser or LLM). */
  parameters: ToolParameterSchema;
  /** Validates and normalizes raw parsed params. Throws a plain Error
   * with a message safe to show the user directly (e.g. "customerId is
   * required") on invalid input — never silently guesses or fills in a
   * missing required field. */
  validate: (params: TParams) => TParams;
  execute: (
    params: TParams,
    ctx: AgentActionContext,
  ) => Promise<AgentActionOutcome>;
}

/** What FabFlow-specific "topic" an investigate intent is asking about —
 * see agent/investigate.ts for the corresponding read+synthesize logic.
 * A future LLM replaces the parser that PRODUCES this, not the topics
 * themselves or how they're answered. */
export type AgentInvestigationTopic =
  | { topic: "customerStatus"; customerId: string }
  | { topic: "projectStatus"; projectId: string }
  | { topic: "whoIsWorking"; projectId: string }
  | { topic: "expectedQuantity"; employeeId: string };

/** What the intent parser hands back to the UI: either a resolved,
 * ready-to-confirm action call, a read-only investigation to answer
 * immediately, a request for the user to disambiguate (never a guess),
 * a multi-step plan, or "didn't understand". */
export type AgentIntent =
  | { kind: "action"; actionName: string; params: Record<string, unknown> }
  | {
      kind: "plan";
      steps: Array<{ actionName: string; params: Record<string, unknown> }>;
    }
  | ({ kind: "investigate" } & AgentInvestigationTopic)
  | { kind: "clarify"; question: string; options?: string[] }
  | { kind: "unrecognized"; reason: string };
