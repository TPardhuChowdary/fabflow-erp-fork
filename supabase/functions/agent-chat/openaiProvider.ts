// FabFlow ERP — OpenAI implementation of ChatProvider (Phase 5).
//
// The only file in this function that knows OpenAI's specific request/
// response shape or endpoint. index.ts never imports this directly —
// it imports ChatProvider from provider.ts and receives an
// OpenAIProvider instance, so this file is a straight swap for the
// earlier provider implementation; nothing outside this file changed shape.
//
// Uses the OpenAI Responses API (POST /v1/responses) via raw fetch — no
// SDK dependency, matching the house convention this function's provider
// implementations already used (this repo's Edge Functions don't take on
// a vendor SDK dependency for a single HTTP call).
//
// Generic ChatMessage/ChatContentBlock (see provider.ts) uses
// tool_use/tool_result vocabulary; OpenAI's Responses API instead uses
// function_call/function_call_output items. All translation between the
// two happens ONLY in this file's toResponsesInput()/fromResponsesOutput().

import type { ChatContentBlock, ChatProvider, ChatRequest, ChatResponse } from "./provider.ts";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.6-luna";
const DEFAULT_REASONING_EFFORT = "medium";
// Same rationale as the previous provider: a malformed loop sending an
// enormous conversation is a bug, not a real request — fail loudly
// rather than pay for (and send) it.
const MAX_REQUEST_BYTES = 500_000;
const REQUEST_TIMEOUT_MS = 30_000;

// ── Responses API request/response item shapes actually used here ─────
// (only the fields this function reads or writes — not the full API surface)

interface ResponsesInputTextPart {
  type: "input_text";
  text: string;
}
// Real vision input (Phase 8) — image_url points at a signed Storage URL
// the browser generated, never base64. Only emitted for genuine image
// mimeTypes (see imageBlockToPart below) — a PDF or other document never
// becomes an input_image, matching "do not pretend the model can visually
// inspect a file type it can't."
interface ResponsesInputImagePart {
  type: "input_image";
  image_url: string;
}
type ResponsesInputUserPart = ResponsesInputTextPart | ResponsesInputImagePart;
interface ResponsesOutputTextPart {
  type: "output_text";
  text: string;
}
type ResponsesInputItem =
  | { type: "message"; role: "user"; content: ResponsesInputUserPart[] }
  | { type: "message"; role: "assistant"; content: ResponsesOutputTextPart[] }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  | { type: "function_call_output"; call_id: string; output: string };

const VISION_CAPABLE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

interface ResponsesFunctionTool {
  type: "function";
  name: string;
  description: string;
  parameters: unknown;
}

interface ResponsesOutputMessageItem {
  type: "message";
  role: "assistant";
  content: Array<{ type: "output_text"; text: string } | { type: string; [k: string]: unknown }>;
}
interface ResponsesOutputFunctionCallItem {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
}
// "reasoning" items (opaque, internal model deliberation) and any other
// unrecognized item types are deliberately dropped in fromResponsesOutput
// — never surfaced to the user, matching "do not expose chain-of-thought."
type ResponsesOutputItem =
  | ResponsesOutputMessageItem
  | ResponsesOutputFunctionCallItem
  | { type: string; [k: string]: unknown };

function toResponsesInput(messages: ChatRequest["messages"]): ResponsesInputItem[] {
  const items: ResponsesInputItem[] = [];
  for (const msg of messages) {
    // Text and image blocks in one ChatMessage are one conversational
    // turn — grouped into a single Responses "message" item's content
    // array (mixed input_text/input_image parts), not pushed as separate
    // items, so the model sees them together the way the user sent them.
    const userParts: ResponsesInputUserPart[] = [];
    for (const block of msg.content) {
      if (block.type === "text") {
        const text = String((block as unknown as { text?: unknown }).text ?? "");
        if (msg.role === "assistant") {
          items.push({ type: "message", role: "assistant", content: [{ type: "output_text", text }] });
        } else {
          userParts.push({ type: "input_text", text });
        }
      } else if (block.type === "image") {
        // Only genuine image mimeTypes become real vision input — a PDF
        // or other document is never claimed to be visually inspected
        // (see VISION_CAPABLE_MIME_TYPES above and this file's header).
        const b = block as unknown as { url: string; mimeType: string; fileName: string };
        if (VISION_CAPABLE_MIME_TYPES.has(b.mimeType)) {
          userParts.push({ type: "input_image", image_url: b.url });
        } else {
          userParts.push({
            type: "input_text",
            text: `[Attached file: ${b.fileName} (${b.mimeType}) — not a visually-inspectable image type; its content was not read by the model.]`,
          });
        }
      } else if (block.type === "tool_use") {
        const b = block as unknown as { id: string; name: string; input: Record<string, unknown> };
        items.push({ type: "function_call", call_id: b.id, name: b.name, arguments: JSON.stringify(b.input) });
      } else if (block.type === "tool_result") {
        const b = block as unknown as { tool_use_id: string; content: string };
        items.push({ type: "function_call_output", call_id: b.tool_use_id, output: b.content });
      }
    }
    if (userParts.length > 0) {
      items.push({ type: "message", role: "user", content: userParts });
    }
  }
  return items;
}

function fromResponsesOutput(output: ResponsesOutputItem[]): ChatContentBlock[] {
  const blocks: ChatContentBlock[] = [];
  for (const item of output) {
    if (item.type === "message") {
      const msg = item as ResponsesOutputMessageItem;
      for (const part of msg.content) {
        if (part.type === "output_text" && "text" in part) {
          blocks.push({ type: "text", text: String(part.text) });
        }
      }
    } else if (item.type === "function_call") {
      const call = item as ResponsesOutputFunctionCallItem;
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(call.arguments || "{}");
      } catch {
        // Malformed arguments from the model — surface as an empty object;
        // the tool's own validate() will reject missing required fields
        // with a clear message rather than this silently guessing.
      }
      blocks.push({ type: "tool_use", id: call.call_id, name: call.name, input });
    }
    // "reasoning" and any other item types are intentionally dropped.
  }
  return blocks;
}

export class OpenAIProvider implements ChatProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_MODEL,
    private readonly reasoningEffort: string = DEFAULT_REASONING_EFFORT,
    private readonly maxOutputTokens: number = 2048,
  ) {}

  async complete(req: ChatRequest): Promise<ChatResponse> {
    const tools: ResponsesFunctionTool[] = req.tools.map((t) => ({
      type: "function",
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    }));

    const body = JSON.stringify({
      model: this.model,
      instructions: req.system,
      input: toResponsesInput(req.messages),
      tools,
      tool_choice: "auto",
      max_output_tokens: this.maxOutputTokens,
      reasoning: { effort: this.reasoningEffort },
      // Stateless by design (the client resends full history every call,
      // same as the previous provider) — no need for OpenAI to retain
      // this ERP conversation server-side between calls.
      store: false,
    });
    if (body.length > MAX_REQUEST_BYTES) {
      throw new Error("Conversation has grown too large for one request — this usually means a tool-call loop went wrong.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body,
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("The LLM API did not respond in time.");
      }
      throw new Error(`Could not reach the LLM API: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      clearTimeout(timeout);
    }

    const parsed = await res.json().catch(() => null);
    if (!res.ok || !parsed) {
      throw new Error(`LLM API error: ${parsed?.error?.message ?? res.statusText}`);
    }
    if (parsed.status === "failed") {
      throw new Error(`LLM API error: ${parsed?.error?.message ?? "request failed"}`);
    }

    return {
      content: fromResponsesOutput(parsed.output ?? []),
      stopReason: parsed.status ?? "completed",
    };
  }
}
