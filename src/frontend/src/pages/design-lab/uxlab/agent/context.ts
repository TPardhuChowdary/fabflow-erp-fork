// Final Unified Prototype — AI Agent conversation context.
//
// Ported near-verbatim from the real agent/context.ts (see
// PARITY_TRACKER.md #30). Which entities the last few turns were about,
// so "it"/"that"/"him" resolve — lives only in this tab's memory for the
// current session, never persisted. The real file's own A/B/C boundary
// comment applies unchanged here: this never stores a fact that could go
// stale against the store (only ids, never values).
export interface AgentConversationTurn {
  instruction: string;
  summary: string;
}

export interface AgentConversationContext {
  currentCustomerId?: string;
  currentProjectId?: string;
  history: AgentConversationTurn[];
}

const MAX_HISTORY = 10;

export function emptyContext(): AgentConversationContext {
  return { history: [] };
}

export function pushTurn(
  ctx: AgentConversationContext,
  turn: AgentConversationTurn,
): AgentConversationContext {
  const history = [...ctx.history, turn].slice(-MAX_HISTORY);
  return { ...ctx, history };
}

// Real production also resolves "him"/"her"/"them" against an
// EMPLOYEE_REFERENCE_WORDS set backed by employee work-assignment data
// (agent/context.ts + agent/investigate.ts's answerExpectedQuantity) —
// not reproduced here. That data lives in EmployeeDetail.tsx's ~2,100-
// line HR/payroll subsystem, already disclosed as not reproduced back in
// Module 13 (Employees) — this file inherits that same disclosed gap
// rather than building a second, parallel work-assignment model just for
// the Agent to reference.
const PROJECT_REFERENCE_WORDS = new Set([
  "it",
  "that",
  "this",
  "the order",
  "that order",
  "the project",
  "that project",
]);

export function resolveProjectReference(
  word: string,
  ctx: AgentConversationContext,
): string | undefined {
  if (!PROJECT_REFERENCE_WORDS.has(word.trim().toLowerCase())) return undefined;
  return ctx.currentProjectId;
}
