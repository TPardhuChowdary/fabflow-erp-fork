// FabFlow AI Agent — conversation context (Phase 2).
//
// Three deliberately different kinds of "memory" exist around the Agent,
// and this file is responsible for exactly ONE of them:
//
//   A. Conversation context (THIS FILE) — which entities the last few
//      turns were about, so "it"/"that"/"him" resolve. Lives only in the
//      browser tab's memory for the current session. Never written to
//      Supabase. Cleared on refresh/navigation away.
//
//   B. ERP source-of-truth data — customers/projects/employees/etc. This
//      is never duplicated or cached here; every read goes through
//      agent/queries.ts straight to useStore/useQmsStore (which are
//      themselves just a cache of Supabase, refreshed by hydration).
//      This file never stores a fact that could go stale against B —
//      only IDs ("we were just talking about project p1"), never values
//      ("that project has 60 pieces pending").
//
//   C. Long-term user preferences/memory — NOT implemented. Explicitly
//      out of scope per Phase 2 instructions: the Agent must not invent
//      or permanently remember facts that could conflict with FabFlow.
//      If this is wanted later it is a distinct, separately-approved
//      feature, not a side effect of conversation context.

export interface AgentConversationTurn {
  instruction: string;
  /** Short human-readable summary of what the Agent understood/did, for
   * the entity resolver's own reference and for future LLM prompt
   * context — never re-parsed as structured data. */
  summary: string;
}

export interface AgentConversationContext {
  currentCustomerId?: string;
  currentProjectId?: string;
  currentEmployeeId?: string;
  /** Bounded ring buffer — conversation context, not a transcript
   * archive. Old turns are simply dropped, not summarized or persisted. */
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

/** A small, fixed set of reference words — NOT a general pronoun
 * resolver. Anything not in this list is left for the parser to handle
 * as a normal (named) entity reference, or to report unrecognized. This
 * is the one deliberately-tiny piece of "natural language" handling
 * Phase 2 adds; it is not meant to grow into a grammar. */
const PROJECT_REFERENCE_WORDS = new Set([
  "it",
  "that",
  "this",
  "the order",
  "that order",
  "the project",
  "that project",
]);
const EMPLOYEE_REFERENCE_WORDS = new Set(["him", "her", "them", "he", "she"]);

export function resolveProjectReference(
  word: string,
  ctx: AgentConversationContext,
): string | undefined {
  if (!PROJECT_REFERENCE_WORDS.has(word.trim().toLowerCase())) return undefined;
  return ctx.currentProjectId;
}

export function resolveEmployeeReference(
  word: string,
  ctx: AgentConversationContext,
): string | undefined {
  if (!EMPLOYEE_REFERENCE_WORDS.has(word.trim().toLowerCase()))
    return undefined;
  return ctx.currentEmployeeId;
}
