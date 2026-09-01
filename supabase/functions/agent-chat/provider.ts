// FabFlow ERP — LLM provider boundary (Phase 4–5).
//
// The rest of this function (index.ts) depends on THIS interface, never
// on a vendor SDK directly — so switching providers means writing/
// swapping one file that implements ChatProvider, not touching auth/
// request-validation/response-shaping in index.ts. This interface has
// already been proven out by one real swap: an earlier provider
// implementation was fully replaced with OpenAIProvider (see
// openaiProvider.ts) without changing a single field here or anything
// in index.ts. Only one
// concrete provider exists at a time — that's a deliberate YAGNI call,
// not an oversight; a second concurrent provider isn't built until
// actually needed.

// "image" (Phase 8): a reference to a file the user already uploaded to
// private Storage, never raw bytes — url is a signed Storage URL (never
// a permanent/public one), generated client-side by the already-
// authenticated browser Supabase client. Only images get real vision
// input; PDFs/other types still travel as "image" metadata-wise for
// upload bookkeeping but the OpenAI translation layer (openaiProvider.ts)
// only emits actual input_image content for genuine image mimeTypes —
// see that file's own comment for why non-image files are never claimed
// to be visually read.
export interface ChatContentBlock {
  type: "text" | "tool_use" | "tool_result" | "image";
  [key: string]: unknown;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: ChatContentBlock[];
}

export interface ChatToolSchema {
  name: string;
  description: string;
  input_schema: unknown;
}

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  tools: ChatToolSchema[];
}

export interface ChatResponse {
  content: ChatContentBlock[];
  stopReason: string;
}

export interface ChatProvider {
  complete(req: ChatRequest): Promise<ChatResponse>;
}
