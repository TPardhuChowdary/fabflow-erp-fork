// FabFlow AI Agent — LLM relay client (Phase 3).
//
// Calls the "agent-chat" Supabase Edge Function (supabase/functions/
// agent-chat/index.ts) exactly the way settingsUsersApi.ts's
// createOrgUser() calls "admin-create-user" — same supabase.functions.invoke
// convention, same error-unwrapping shape. See that Edge Function's own
// header comment for what it does and does not have access to.
//
// IMPORTANT: this file never holds an LLM API key. The key lives ONLY as
// a Supabase Function secret, server-side. If the Edge Function has not
// been deployed (see the final report), every call here fails cleanly
// with a clear error — it does not silently fall back to fabricating a
// response.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";

export type LlmContentBlock =
  | { type: "text"; text: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    }
  | {
      // Phase 8 — a file the user already uploaded to private Storage
      // (see agent/documentUpload.ts). url is a signed Storage URL, never
      // raw file bytes and never a permanent/public link. Only genuine
      // image mimeTypes get real vision input from the model — see
      // openaiProvider.ts's translation for why non-image files are
      // carried as metadata only, never claimed to be visually read.
      type: "image";
      url: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    };

export interface LlmMessage {
  role: "user" | "assistant";
  content: LlmContentBlock[];
}

export interface AgentChatRequest {
  system: string;
  messages: LlmMessage[];
  tools: Array<{ name: string; description: string; input_schema: unknown }>;
}

export interface AgentChatResponse {
  content: LlmContentBlock[];
  stopReason: string;
}

export type AgentChatResult =
  | { ok: true; data: AgentChatResponse }
  | { ok: false; error: string };

export async function callAgentLLM(
  req: AgentChatRequest,
): Promise<AgentChatResult> {
  if (!isSupabaseConfigured) {
    return {
      ok: false,
      error: "Supabase is not configured in this environment.",
    };
  }
  const supabase = getSupabase();
  const { data, error } = await supabase.functions.invoke<
    AgentChatResponse & { error?: string }
  >("agent-chat", { body: req });

  if (error) {
    // Same FunctionsHttpError unwrapping settingsUsersApi.ts uses — the
    // real status/body is on error.context, not error.message alone.
    const context = (
      error as { context?: { json?: () => Promise<{ error?: string }> } }
    ).context;
    if (context?.json) {
      try {
        const body = await context.json();
        return { ok: false, error: body.error || error.message };
      } catch {
        // fall through
      }
    }
    return { ok: false, error: error.message };
  }
  if (!data || data.error) {
    return {
      ok: false,
      error: data?.error || "The Agent's LLM call failed with no details.",
    };
  }
  return { ok: true, data };
}
