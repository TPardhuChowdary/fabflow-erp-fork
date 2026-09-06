// Phase 1 Option B — EXPERIMENTAL remote-execution adapter.
//
// NOT wired into production yet (see email-sync/index.ts and
// email-connect/index.ts — the ADAPTERS registry still points
// "imap_smtp" at imapSmtpAdapter.ts by default). This file exists solely
// to test one hypothesis: that the reproducible "Already logged out"
// ImapFlow uncaught-exception crash (authenticate() called from
// startSession() on an already-closed client — see the Phase 1
// investigation report) is specific to running ImapFlow under Supabase
// Edge/Deno, and does not occur when the identical IMAP logic runs in a
// real Node.js process instead (src/email-worker/ — see that package's
// imapCore.ts, a near-verbatim port of imapSmtpAdapter.ts's own logic).
//
// This file implements EmailProviderAdapter exactly, the same interface
// imapSmtpAdapter.ts implements — the only difference is that every
// method makes an authenticated HTTPS call to the Node worker instead of
// opening a raw socket itself. No IMAP logic lives here; it is
// deliberately thin, matching the Phase 1 spec's instruction.
//
// Credential flow (see the architecture spec): this file receives
// already-decrypted credentials from email-sync/email-connect exactly as
// imapSmtpAdapter.ts does today — nothing here decrypts anything, nothing
// here holds the encryption key, nothing here has database access. The
// decrypted credentials are forwarded to the worker over HTTPS, held only
// in that one request's memory, for the duration of that one call.
//
// sendMessage() is NOT implemented in this experimental path (SMTP
// sending is explicitly out of scope for the worker per the Phase 1
// spec) — it throws a clear, honest error rather than silently doing
// nothing, matching this codebase's established "never pretend a
// capability exists" convention (see emailAdapter.ts's own header note on
// this exact point).

import type {
  EmailProviderAdapter,
  EmailProviderCredentials,
  ListMessagesOptions,
  ListMessagesResult,
  SendMessageInput,
} from "./emailAdapter.ts";

const WORKER_URL = Deno.env.get("IMAP_WORKER_URL");
const WORKER_SHARED_SECRET = Deno.env.get("IMAP_WORKER_SHARED_SECRET");

const REQUEST_TIMEOUT_MS = 28_000; // slightly under the worker's own 30s
// server-level backstop, so a genuinely-hung worker request fails on
// THIS side first with a clear timeout error, rather than this adapter
// waiting indefinitely for a response that may never come.

function requireConfig(): { url: string; secret: string } {
  if (!WORKER_URL || !WORKER_SHARED_SECRET) {
    throw new Error(
      "IMAP worker is not configured (missing IMAP_WORKER_URL or IMAP_WORKER_SHARED_SECRET) — this experimental path is not usable yet.",
    );
  }
  return { url: WORKER_URL, secret: WORKER_SHARED_SECRET };
}

async function callWorker(
  path: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const { url, secret } = requireConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return res;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`IMAP worker request timed out after ${REQUEST_TIMEOUT_MS}ms.`);
    }
    throw new Error(
      `Could not reach IMAP worker: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function workerErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error || `IMAP worker returned HTTP ${res.status}.`;
  } catch {
    return `IMAP worker returned HTTP ${res.status}.`;
  }
}

// Defect fix (see the Phase 1 hardening report): a malformed worker
// response — a worker-side bug, not something that should happen in
// normal operation, but not something to trust blindly either — used to
// flow straight into email-sync/index.ts's `for (const msg of
// result.messages)` loop, which sits OUTSIDE the try/catch that marks a
// sync "failed". A shape mismatch there would leave email_sync_state
// stuck at "syncing" instead of cleanly "failed" — the exact symptom
// class this whole effort exists to eliminate, via a different,
// previously-unguarded path. This validates against the EXACT shape
// EmailAdapterMessage/ListMessagesResult (emailAdapter.ts) already
// define and email-sync/index.ts already reads — not a new contract, a
// runtime check of the existing one. Only fields email-sync actually
// dereferences unconditionally are required; fields it already reads via
// `?? null`/`??` (providerThreadId, fromName, subject, bodyText,
// bodyHtml, sentAt) are checked only when present, never required.
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function validateListMessagesResult(data: unknown): ListMessagesResult {
  const fail = (why: string): never => {
    throw new Error(`IMAP worker returned a malformed listMessages response: ${why}`);
  };
  if (!data || typeof data !== "object") fail("response is not an object");
  const d = data as Record<string, unknown>;

  if (!Array.isArray(d.messages)) fail("messages is not an array");
  const messages = d.messages as unknown[];

  messages.forEach((m, i) => {
    if (!m || typeof m !== "object") fail(`messages[${i}] is not an object`);
    const msg = m as Record<string, unknown>;
    if (typeof msg.providerMessageId !== "string") fail(`messages[${i}].providerMessageId is not a string`);
    if (typeof msg.fromAddress !== "string") fail(`messages[${i}].fromAddress is not a string`);
    if (!isStringArray(msg.toAddresses)) fail(`messages[${i}].toAddresses is not a string array`);
    if (!isStringArray(msg.ccAddresses)) fail(`messages[${i}].ccAddresses is not a string array`);
    if (typeof msg.isRead !== "boolean") fail(`messages[${i}].isRead is not a boolean`);
    if (typeof msg.folder !== "string") fail(`messages[${i}].folder is not a string`);
    if (!Array.isArray(msg.attachments)) fail(`messages[${i}].attachments is not an array`);
    (msg.attachments as unknown[]).forEach((a, j) => {
      if (!a || typeof a !== "object") fail(`messages[${i}].attachments[${j}] is not an object`);
      const att = a as Record<string, unknown>;
      if (typeof att.id !== "string") fail(`messages[${i}].attachments[${j}].id is not a string`);
      if (typeof att.filename !== "string") fail(`messages[${i}].attachments[${j}].filename is not a string`);
      if (att.mimeType !== undefined && typeof att.mimeType !== "string") {
        fail(`messages[${i}].attachments[${j}].mimeType is present but not a string`);
      }
      if (att.sizeBytes !== undefined && typeof att.sizeBytes !== "number") {
        fail(`messages[${i}].attachments[${j}].sizeBytes is present but not a number`);
      }
    });
  });

  if (d.nextCursor !== null && typeof d.nextCursor !== "string") {
    fail("nextCursor is neither a string nor null");
  }

  return data as ListMessagesResult;
}

export const imapRemoteAdapter: EmailProviderAdapter = {
  capabilities: {
    oauth: false,
    push: false,
    imap: true,
    smtp: false, // sendMessage genuinely not implemented in this
    // experimental path — reported honestly rather than claiming a
    // capability that would throw if ever invoked.
    labels: false,
    threads: false,
  },

  async testConnection(creds: EmailProviderCredentials) {
    try {
      const res = await callWorker("/test-connection", { credentials: creds });
      if (!res.ok) {
        return { ok: false, error: await workerErrorMessage(res) };
      }
      return (await res.json()) as { ok: true } | { ok: false; error: string };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "IMAP worker request failed.",
      };
    }
  },

  async listMessages(
    creds: EmailProviderCredentials,
    opts: ListMessagesOptions,
  ): Promise<ListMessagesResult> {
    const res = await callWorker("/list-messages", {
      credentials: creds,
      options: {
        since: opts.since?.toISOString(),
        cursor: opts.cursor,
        limit: opts.limit,
      },
    });
    if (!res.ok) {
      throw new Error(await workerErrorMessage(res));
    }
    const data: unknown = await res.json();
    return validateListMessagesResult(data);
  },

  async getAttachment(
    creds: EmailProviderCredentials,
    providerMessageId: string,
    attachmentId: string,
  ): Promise<Uint8Array> {
    const res = await callWorker("/get-attachment", {
      credentials: creds,
      providerMessageId,
      attachmentId,
    });
    if (!res.ok) {
      throw new Error(await workerErrorMessage(res));
    }
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  },

  async sendMessage(_creds: EmailProviderCredentials, _message: SendMessageInput) {
    throw new Error(
      "Sending is not implemented in the experimental Node IMAP worker path yet.",
    );
  },
};
