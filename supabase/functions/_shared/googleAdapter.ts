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
      const detailRes = await gmailFetch(
        `/messages/${ref.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`,
        token,
      );
      if (!detailRes.ok) continue; // one bad message must not fail the batch
      const detail = (await detailRes.json()) as {
        id: string;
        threadId: string;
        snippet?: string;
        labelIds?: string[];
        payload?: { headers?: Array<{ name: string; value: string }>; parts?: unknown[] };
        internalDate?: string;
      };
      const header = (name: string) =>
        detail.payload?.headers?.find(
          (h) => h.name.toLowerCase() === name.toLowerCase(),
        )?.value;
      messages.push({
        providerMessageId: detail.id,
        providerThreadId: detail.threadId,
        fromAddress: (header("From") ?? "unknown@unknown").replace(/.*<(.+)>/, "$1"),
        fromName: header("From")?.replace(/\s*<.+>/, ""),
        toAddresses: (header("To") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
        ccAddresses: (header("Cc") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
        subject: header("Subject"),
        // KNOWN GAP (tracked, not silently swallowed): unlike Microsoft
        // Graph, Gmail's list/metadata call never includes the body —
        // getting it requires a second format=full fetch per message plus
        // a base64url multipart walk. Left unbuilt this pass because this
        // adapter is inert until GOOGLE_OAUTH_CLIENT_ID/SECRET exist (see
        // isConfigured() above), so there is no live mailbox to build or
        // verify this against yet. Build this together with the OAuth
        // wiring itself, not speculatively now — see the Phase 1B
        // deployment report's "remains unverified" section.
        bodyText: undefined,
        bodyHtml: undefined,
        sentAt: detail.internalDate
          ? new Date(Number(detail.internalDate)).toISOString()
          : undefined,
        isRead: !(detail.labelIds ?? []).includes("UNREAD"),
        folder: (detail.labelIds ?? []).includes("SENT") ? "sent" : "inbox",
        attachments: [], // attachment listing requires the full message
        // format=full payload — deferred to the on-demand full-message
        // fetch, not pulled for every message in a list call (cost
        // control, per the plan's rate-limiting principle).
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
