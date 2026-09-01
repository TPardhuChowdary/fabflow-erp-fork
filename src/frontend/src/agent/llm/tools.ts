// FabFlow AI Agent — tool catalog for the LLM (Phase 3–5).
//
// This is the ONLY place agent/actions.ts and agent/queries.ts get turned
// into the shape an LLM tool-calling API expects. It does not duplicate
// their logic — it just describes them. The LLM never sees anything
// beyond {name, description, input_schema}: no execute() body, no
// permission check internals, no database detail. This shape
// ({name, description, input_schema}) is deliberately provider-neutral —
// the Edge Function's provider for whichever vendor is active (currently
// OpenAIProvider, see supabase/functions/agent-chat/) does the one-time
// translation into that vendor's actual wire format; this file never
// needs to change when the provider does.

import { AGENT_ACTIONS } from "../actions";
import { QUERIES } from "../queries";
import type { ToolParameterSchema } from "../types";

export interface LlmToolSchema {
  name: string;
  description: string;
  input_schema: ToolParameterSchema;
}

/** What the orchestrator needs to know about a tool call BEFORE deciding
 * whether it can run automatically or needs user confirmation. */
export interface ToolCatalogEntry {
  name: string;
  kind: "read" | "write";
  destructive: boolean;
  permission: string;
  /** "action" -> runAction(); "query" -> runQuery(). The orchestrator
   * dispatches on this rather than guessing from `kind` alone, since both
   * registries can contain read tools. */
  registry: "action" | "query";
}

/** Merged, name-keyed catalog — the single source of truth the
 * orchestrator uses to classify and dispatch every tool call the LLM
 * requests. Built once from the two existing registries, never a
 * hand-maintained duplicate list. */
export const TOOL_CATALOG: Record<string, ToolCatalogEntry> = {
  ...Object.fromEntries(
    Object.entries(AGENT_ACTIONS).map(([name, a]) => [
      name,
      {
        name,
        kind: a.kind,
        destructive: a.destructive,
        permission: a.permission,
        registry: "action" as const,
      },
    ]),
  ),
  ...Object.fromEntries(
    Object.entries(QUERIES).map(([name, q]) => [
      name,
      {
        name,
        kind: "read" as const,
        destructive: false,
        permission: q.permission,
        registry: "query" as const,
      },
    ]),
  ),
};

/** The tool list handed to the LLM API's `tools` parameter every turn. */
export function buildToolSchemas(): LlmToolSchema[] {
  const fromActions = Object.values(AGENT_ACTIONS).map((a) => ({
    name: a.name,
    description: a.description,
    input_schema: a.parameters,
  }));
  const fromQueries = Object.values(QUERIES).map((q) => ({
    name: q.name,
    description: q.description,
    input_schema: q.parameters,
  }));
  return [...fromActions, ...fromQueries];
}
