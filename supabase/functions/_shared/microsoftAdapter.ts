// Universal Email Integration (see chat) — Microsoft OAuth adapter
// (Outlook.com, Microsoft 365, Exchange Online), via Microsoft Graph.
//
// Same honesty contract as googleAdapter.ts: real Graph API shapes
// (/me/messages, /me/messages/{id}/attachments/{id}, /me/sendMail), inert
// until MICROSOFT_OAUTH_CLIENT_ID/MICROSOFT_OAUTH_CLIENT_SECRET exist as
// Supabase secrets (registering the Azure/Entra app is the FabFlow
// operator's action, not something this session can do) — every method
// fails with a clear "not configured" error rather than a fake success.

import type {
  EmailAdapterMessage,
  EmailProviderAdapter,
  EmailProviderCredentials,
  ListMessagesOptions,
  ListMessagesResult,
  SendMessageInput,
} from "./emailAdapter.ts";

export interface MicrosoftOAuthCredentials extends EmailProviderCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO timestamp
  tenantId?: string; // "common" for personal + multi-tenant work/school accounts
}

function isConfigured(): boolean {
  return Boolean(
    Deno.env.get("MICROSOFT_OAUTH_CLIENT_ID") &&
      Deno.env.get("MICROSOFT_OAUTH_CLIENT_SECRET"),
  );
}

const NOT_CONFIGURED_ERROR =
  "Microsoft OAuth is not configured on this FabFlow instance yet (missing MICROSOFT_OAUTH_CLIENT_ID/MICROSOFT_OAUTH_CLIENT_SECRET). Connect this mailbox using IMAP/SMTP instead (Microsoft 365 supports this with an app password when the tenant allows it), or ask your FabFlow administrator to register the Microsoft Entra app.";

async function ensureFreshToken(
  creds: MicrosoftOAuthCredentials,
): Promise<string> {
  if (new Date(creds.expiresAt).getTime() > Date.now() + 60_000) {
    return creds.accessToken;
  }
  const clientId = Deno.env.get("MICROSOFT_OAUTH_CLIENT_ID")!;
  const clientSecret = Deno.env.get("MICROSOFT_OAUTH_CLIENT_SECRET")!;
  const tenant = creds.tenantId || "common";
  const res = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: creds.refreshToken,
        grant_type: "refresh_token",
        scope: "https://graph.microsoft.com/.default",
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Microsoft token refresh failed: ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function graphFetch(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`https://graph.microsoft.com/v1.0/me${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
}

interface GraphRecipient {
  emailAddress?: { address?: string; name?: string };
}
interface GraphMessage {
  id: string;
  conversationId?: string;
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  subject?: string;
  receivedDateTime?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  parentFolderId?: string;
  // Unlike Gmail, Graph's message resource returns the body inline — no
  // second per-message fetch or MIME parse needed, just $select it.
  body?: { contentType?: "text" | "html"; content?: string };
}

export const microsoftAdapter: EmailProviderAdapter = {
  capabilities: {
    oauth: true,
    push: true, // Graph supports webhook subscriptions — not wired this
    // pass (polling only), same honest-capability-vs-what's-wired
    // distinction as googleAdapter.ts's push:true.
    imap: false,
    smtp: false,
    labels: false, // Graph uses folders, not Gmail-style labels
    threads: true, // via conversationId
  },

  async testConnection(creds) {
    if (!isConfigured()) return { ok: false, error: NOT_CONFIGURED_ERROR };
    try {
      const token = await ensureFreshToken(creds as MicrosoftOAuthCredentials);
      const res = await graphFetch("", token);
      if (!res.ok) return { ok: false, error: `Graph API error: ${res.status}` };
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Microsoft connection failed.",
      };
    }
  },

  async listMessages(creds, opts: ListMessagesOptions): Promise<ListMessagesResult> {
    if (!isConfigured()) throw new Error(NOT_CONFIGURED_ERROR);
    const token = await ensureFreshToken(creds as MicrosoftOAuthCredentials);
    const filter = opts.since
      ? `&$filter=receivedDateTime ge ${opts.since.toISOString()}`
      : "";
    const url = opts.cursor
      ? opts.cursor // Graph's @odata.nextLink is already a full URL
      : `/messages?$top=${opts.limit ?? 50}&$select=id,conversationId,from,toRecipients,ccRecipients,subject,receivedDateTime,isRead,hasAttachments,parentFolderId,body${filter}`;
    const res = opts.cursor
      ? await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      : await graphFetch(url, token);
    if (!res.ok) throw new Error(`Graph list failed: ${res.status}`);
    const data = (await res.json()) as {
      value: GraphMessage[];
      "@odata.nextLink"?: string;
    };
    const messages: EmailAdapterMessage[] = data.value.map((m) => ({
      providerMessageId: m.id,
      providerThreadId: m.conversationId,
      fromAddress: m.from?.emailAddress?.address ?? "unknown@unknown",
      fromName: m.from?.emailAddress?.name,
      toAddresses: (m.toRecipients ?? [])
        .map((r) => r.emailAddress?.address)
        .filter((a): a is string => Boolean(a)),
      ccAddresses: (m.ccRecipients ?? [])
        .map((r) => r.emailAddress?.address)
        .filter((a): a is string => Boolean(a)),
      subject: m.subject,
      // Graph returns the body inline (unlike Gmail) — no extra fetch or
      // MIME parse needed, just read the $select'd field.
      bodyText: m.body?.contentType === "text" ? m.body.content : undefined,
      bodyHtml: m.body?.contentType === "html" ? m.body.content : undefined,
      sentAt: m.receivedDateTime,
      isRead: m.isRead ?? false,
      folder: "inbox",
      attachments: [], // listed via the on-demand full-message fetch
    }));
    return { messages, nextCursor: data["@odata.nextLink"] ?? null };
  },

  async getAttachment(creds, providerMessageId, attachmentId) {
    if (!isConfigured()) throw new Error(NOT_CONFIGURED_ERROR);
    const token = await ensureFreshToken(creds as MicrosoftOAuthCredentials);
    const res = await graphFetch(
      `/messages/${providerMessageId}/attachments/${attachmentId}`,
      token,
    );
    if (!res.ok) throw new Error(`Graph attachment fetch failed: ${res.status}`);
    const data = (await res.json()) as { contentBytes: string };
    const binary = atob(data.contentBytes);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  },

  async sendMessage(creds, message: SendMessageInput) {
    if (!isConfigured()) throw new Error(NOT_CONFIGURED_ERROR);
    const token = await ensureFreshToken(creds as MicrosoftOAuthCredentials);
    const res = await graphFetch("/sendMail", token, {
      method: "POST",
      body: JSON.stringify({
        message: {
          subject: message.subject,
          body: {
            contentType: message.bodyHtml ? "HTML" : "Text",
            content: message.bodyHtml ?? message.bodyText,
          },
          toRecipients: message.to.map((a) => ({ emailAddress: { address: a } })),
          ccRecipients: message.cc?.map((a) => ({ emailAddress: { address: a } })),
        },
      }),
    });
    if (!res.ok) throw new Error(`Graph send failed: ${res.status}`);
    // Graph's sendMail does not return the created message id in its
    // (empty, 202-Accepted) response — unlike Gmail. Honestly reporting a
    // synthetic id here would misrepresent what the API actually gives
    // back, so this is the one adapter method that returns a
    // client-generated placeholder id, clearly distinguishable from a
    // real provider id by its prefix.
    return { providerMessageId: `sent-${crypto.randomUUID()}` };
  },
};
