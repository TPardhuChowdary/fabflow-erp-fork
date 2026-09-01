// FabFlow ERP — AI Agent LLM relay (Phase 3–5).
//
// The ONLY job of this function is to hold the LLM API key server-side
// and forward a conversation + tool schemas to it, through the
// ChatProvider boundary (see provider.ts) — this file never talks to a
// vendor's API shape directly, only to whatever ChatProvider it's given
// (currently OpenAIProvider, calling the OpenAI Responses API; swapping
// providers again means a new file implementing ChatProvider, not a
// rewrite of this one — see openaiProvider.ts's own header for why the
// translation between the generic wire format and a vendor's actual
// request/response shape lives entirely inside the provider file).
//
// It is a stateless relay, not a FabFlow operation:
//
//   - It never touches the FabFlow database (no Supabase client is even
//     constructed for data access — see the auth check below, which uses
//     the caller's own client purely to confirm they're a real logged-in
//     user, never to read/write any table).
//   - It never executes an Agent tool call itself. Tool EXECUTION happens
//     entirely in the browser (agent/llm/orchestrator.ts), through the
//     same runAction()/runQuery() -> hasPermission() -> Supabase RLS path
//     every other write in FabFlow goes through. This function only ever
//     sees tool NAMES and ARGUMENTS the LLM wants to call, and the tool
//     RESULTS the browser already computed — never raw ERP data beyond
//     what's already in the conversation, and never a service-role key.
//
// Deployment note (see the Phase 5 report): this file exists in the repo
// but has NOT been deployed (`supabase functions deploy agent-chat` was
// not run), and no OPENAI_API_KEY secret has been set on the project.
// Both require an explicit decision from the project owner. The prior
// ANTHROPIC_API_KEY/ANTHROPIC_MODEL secrets, if still present on the
// project, are simply unused by this file now — nothing here reads them,
// and nothing here deletes them (that's a manual decision, not this
// migration's job).

import { OpenAIProvider } from "./openaiProvider.ts";
import type { ChatMessage, ChatProvider, ChatToolSchema } from "./provider.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

interface AgentChatRequest {
  system: string;
  messages: ChatMessage[];
  tools: ChatToolSchema[];
}

const MAX_MESSAGES = 60; // sanity cap — a genuine conversation/tool-loop
// should never need more than this; a runaway client-side loop would.

// ponytail: best-effort, single-instance, resets on cold start — a real
// multi-instance rate limit needs a shared store (KV/DB table), which is
// new infrastructure not built here without approval. Good enough to
// blunt an accidental tight client-side loop; not a security boundary.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const requestLog = new Map<string, number[]>();
function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (requestLog.get(userId) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  requestLog.set(userId, recent);
  return recent.length > RATE_LIMIT_MAX_REQUESTS;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  const MODEL = Deno.env.get("OPENAI_MODEL") || undefined;

  if (!SUPABASE_URL || !ANON_KEY) {
    return jsonResponse({ error: "Server misconfigured: missing Supabase environment." }, 500);
  }
  if (!OPENAI_API_KEY) {
    // Deliberately explicit rather than silently degrading — see the
    // file header. This is the exact "stop condition" the Phase 3–5
    // reports discuss: the code path is real, but no key is provisioned.
    return jsonResponse(
      { error: "The Agent's AI backend is not configured yet (no OPENAI_API_KEY secret set on this project)." },
      501,
    );
  }

  // Auth check only — proves the caller is a real, currently logged-in
  // FabFlow user (so this relay can't be used as an open, unauthenticated
  // proxy to burn the API key). This client is never used for anything
  // else; no table is ever queried here.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing Authorization header." }, 401);
  }
  const authCheck = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: ANON_KEY },
  });
  if (!authCheck.ok) {
    return jsonResponse({ error: "Not authenticated." }, 401);
  }
  const authUser = await authCheck.json().catch(() => null);
  const userId = authUser?.id;
  if (!userId) {
    return jsonResponse({ error: "Not authenticated." }, 401);
  }
  if (isRateLimited(userId)) {
    return jsonResponse({ error: "Too many Agent requests — please wait a moment and try again." }, 429);
  }

  let body: AgentChatRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }
  if (!body.system || !Array.isArray(body.messages) || !Array.isArray(body.tools)) {
    return jsonResponse({ error: "Request must include system, messages, and tools." }, 400);
  }
  if (body.messages.length > MAX_MESSAGES) {
    return jsonResponse({ error: "Conversation is too long for one Agent turn — please start a new conversation." }, 400);
  }

  const provider: ChatProvider = new OpenAIProvider(OPENAI_API_KEY, MODEL);
  try {
    const result = await provider.complete({ system: body.system, messages: body.messages, tools: body.tools });
    return jsonResponse(result, 200);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "The LLM request failed." }, 502);
  }
});
