// Final Unified Prototype — AI Agent, "Classic mode" foundation.
//
// Ported from the real agent/types.ts's AgentIntent shape (see
// PARITY_TRACKER.md #30). What the intent parser hands back to the UI:
// either a resolved, ready-to-confirm action call, a read-only
// investigation to answer immediately, a request for the user to
// disambiguate (never a guess), a multi-step plan, or "didn't
// understand" — identical taxonomy to production.
export type AgentInvestigationTopic =
  | { topic: "customerStatus"; customerId: string }
  | { topic: "projectStatus"; projectId: string };

export type AgentIntent =
  | { kind: "action"; actionName: string; params: Record<string, unknown> }
  | {
      kind: "plan";
      steps: Array<{ actionName: string; params: Record<string, unknown> }>;
    }
  | ({ kind: "investigate" } & AgentInvestigationTopic)
  | { kind: "clarify"; question: string; options?: string[] }
  | { kind: "unrecognized"; reason: string };

export type AgentActionKind = "read" | "write";
