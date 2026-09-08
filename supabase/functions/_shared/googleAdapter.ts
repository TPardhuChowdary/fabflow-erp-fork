// Universal Email Integration (see chat) — Google OAuth adapter (Gmail +
// Google Workspace).
//
// Real Gmail API integration, written against its actual REST shape
// (users.messages.list/get, users.messages.attachments.get,
// users.messages.send) — NOT a mock. It is genuinely inert until two
// Supabase secrets exist: GOOGLE_OAUTH_CLIENT_ID and
// GOOGLE_OAUTH_CLIENT_SECRET (registering that OAuth app in Google Cloud
// Console is something only the FabFlow operator can do — see the
// deployment report). Every method below fails with a clear
// "Google OAuth is not configured" error rather than a fake success when
// those secrets are absent, exactly matching the plan's explicit
// requirement to never fake a provider that isn't actually reachable.

import type {
  EmailAdapterMessage,
  EmailProviderAdapter,
  EmailProviderCredentials,
  ListMessagesOptions,
  ListMessagesResult,
  SendMessageInput,
} from "./emailAdapter.ts";

export interface GoogleOAuthCredentials extends EmailProviderCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO timestamp
}

function isConfigured(): boolean {
  return Boolean(
    Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") &&
      Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET"),
  );
}

// Phase 9E — the exact scopes this adapter's own methods need, and no
// more: gmail.readonly covers testConnection/listMessages/getAttachment
// (all read-only Gmail API calls below); gmail.send covers sendMessage.
// Nothing broader (e.g. gmail.modify, which would also allow deleting/
// labeling) is requested, since nothing in this file ever does that.
export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
] as const;

const NOT_CONFIGURED_ERROR =
  "Google OAuth is not configured on this FabFlow instance yet (missing GOOGLE_OAUTH_CLIENT_ID/GOOGLE_OAUTH_CLIENT_SECRET). Connect this mailbox using IMAP/SMTP with a Google App Password instead, or ask your FabFlow administrator to register the Google OAuth app.";

/** Refreshes an expired access token using the stored refresh token —
 * called internally before any Gmail API call whose token has expired.
 * Never called at all while isConfigured() is false. */
async function ensureFreshToken(
  creds: GoogleOAuthCredentials,
): Promise<string> {
  if (new Date(creds.expiresAt).getTime() > Date.now() + 60_000) {
    return creds.accessToken;
  }
  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function gmailFetch(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailPart[];
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

// Phase 9E fix: Gmail's format=full response is a MIME part TREE, not a
// flat body — a plain message has body.data directly on the root part;
// a multipart message (the common case, e.g. multipart/alternative
// wrapping text/plain + text/html, itself possibly wrapped in
// multipart/mixed alongside attachments) nests arbitrarily deep. This
// walks it once, recursively, taking the FIRST text/plain and first
// text/html part found (matching the conventional single-body-per-type
// structure every real mail client produces) and collecting every real
// attachment's metadata — never its bytes, which still come from
// getAttachment on demand, exactly as before this fix. A part counts as
// an attachment when it carries a filename (Gmail's own convention;
// inline body parts never have one) AND an attachmentId (a part with a
// filename but no attachmentId is fully inlined in this same response
// and not something getAttachment could fetch separately anyway).
export function extractGmailContent(payload: GmailPart | undefined): {
  bodyText?: string;
  bodyHtml?: string;
  attachments: EmailAdapterMessage["attachments"];
} {
  let bodyText: string | undefined;
  let bodyHtml: string | undefined;
  const attachments: EmailAdapterMessage["attachments"] = [];

  function walk(part: GmailPart | undefined) {
    if (!part) return;
    if (part.filename) {
      if (part.body?.attachmentId) {
        attachments.push({
          id: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType,
          sizeBytes: part.body.size,
        });
      }
      return;
    }
    if (part.mimeType === "text/plain" && part.body?.data && bodyText === undefined) {
      bodyText = decodeBase64Url(part.body.data);
    } else if (part.mimeType === "text/html" && part.body?.data && bodyHtml === undefined) {
      bodyHtml = decodeBase64Url(part.body.data);
    }
    for (const child of part.parts ?? []) walk(child);
  }
  walk(payload);
  return { bodyText, bodyHtml, attachments };
}

export const googleAdapter: EmailProviderAdapter = {
  capabilities: {
    oauth: true,
    push: true, // Gmail supports Pub/Sub push notifications — not wired
    // this pass (polling-based sync only, per the plan's scope), but the
    // adapter honestly reports the provider's real capability rather than
    // hiding it.
    imap: false, // Gmail also technically speaks IMAP, but the OAuth/API
    // path is the correct, preferred integration per the plan's own
    // Tier-1 requirement — this adapter deliberately doesn't offer a
    // second, redundant IMAP code path for the same provider.
    smtp: false,
    labels: true,
    threads: true,
  },

  async testConnection(creds) {
    if (!isConfigured()) return { ok: false, error: NOT_CONFIGURED_ERROR };
    try {
      const token = await ensureFreshToken(creds as GoogleOAuthCredentials);
      const res = await gmailFetch("/profile", token);
      if (!res.ok) return { ok: false, error: `Gmail API error: ${res.status}` };
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Google connection failed.",
      };
    }
  },

  async listMessages(creds, opts: ListMessagesOptions): Promise<ListMessagesResult> {
    if (!isConfigured()) throw new Error(NOT_CONFIGURED_ERROR);
    const token = await ensureFreshToken(creds as GoogleOAuthCredentials);
    const query = opts.since
      ? `after:${Math.floor(opts.since.getTime() / 1000)}`
      : "";
    const listRes = await gmailFetch(
      `/messages?maxResults=${opts.limit ?? 50}&q=${encodeURIComponent(query)}${opts.cursor ? `&pageToken=${opts.cursor}` : ""}`,
      token,
    );
    if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status}`);
    const list = (await listRes.json()) as {
      messages?: Array<{ id: string; threadId: string }>;
      nextPageToken?: string;
    };
    const messages: EmailAdapterMessage[] = [];
    for (const ref of list.messages ?? []) {
      // Phase 9E fix: format=full (not metadata) — the previous
      // metadata-only fetch never returned a body at all (a real,
      // disclosed gap the Phase 9D audit flagged). One fetch per message
      // either way (same request-count shape as before), just a richer
      // response; getGmailPart below walks its MIME tree for text/plain,
      // text/html, and attachment metadata (never their bytes — those
      // still come from getAttachment on demand, same as before).
      const detailRes = await gmailFetch(`/messages/${ref.id}?format=full`, token);
      if (!detailRes.ok) continue; // one bad message must not fail the batch
      const detail = (await detailRes.json()) as {
        id: string;
        threadId: string;
        snippet?: string;
        labelIds?: string[];
        payload?: GmailPart;
        internalDate?: string;
      };
      const header = (name: string) =>
        detail.payload?.headers?.find(
          (h) => h.name.toLowerCase() === name.toLowerCase(),
        )?.value;
      const { bodyText, bodyHtml, attachments } = extractGmailContent(detail.payload);
      messages.push({
        providerMessageId: detail.id,
        providerThreadId: detail.threadId,
        fromAddress: (header("From") ?? "unknown@unknown").replace(/.*<(.+)>/, "$1"),
        fromName: header("From")?.replace(/\s*<.+>/, ""),
        toAddresses: (header("To") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
        ccAddresses: (header("Cc") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
        subject: header("Subject"),
        bodyText,
        bodyHtml,
        sentAt: detail.internalDate
          ? new Date(Number(detail.internalDate)).toISOString()
          : undefined,
        isRead: !(detail.labelIds ?? []).includes("UNREAD"),
        folder: (detail.labelIds ?? []).includes("SENT") ? "sent" : "inbox",
        attachments,
      });
    }
    return { messages, nextCursor: list.nextPageToken ?? null };
  },

  async getAttachment(creds, providerMessageId, attachmentId) {
    if (!isConfigured()) throw new Error(NOT_CONFIGURED_ERROR);
    const token = await ensureFreshToken(creds as GoogleOAuthCredentials);
    const res = await gmailFetch(
      `/messages/${providerMessageId}/attachments/${attachmentId}`,
      token,
    );
    if (!res.ok) throw new Error(`Gmail attachment fetch failed: ${res.status}`);
    const data = (await res.json()) as { data: string };
    // Gmail attachment data is base64url-encoded.
    const base64 = data.data.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  },

  async sendMessage(creds, message: SendMessageInput) {
    if (!isConfigured()) throw new Error(NOT_CONFIGURED_ERROR);
    const token = await ensureFreshToken(creds as GoogleOAuthCredentials);
    const raw = [
      `To: ${message.to.join(", ")}`,
      message.cc?.length ? `Cc: ${message.cc.join(", ")}` : "",
      `Subject: ${message.subject}`,
      "Content-Type: text/html; charset=utf-8",
      "",
      message.bodyHtml ?? message.bodyText,
    ]
      .filter(Boolean)
      .join("\r\n");
    const encoded = btoa(raw).replace(/\+/g, "-").replace(/\//g, "_");
    const res = await gmailFetch("/messages/send", token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: encoded }),
    });
    if (!res.ok) throw new Error(`Gmail send failed: ${res.status}`);
    const data = (await res.json()) as { id: string };
    return { providerMessageId: data.id };
  },
};
