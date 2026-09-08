// Phase 5 Email Operations — outbound send.
//
// WRITTEN, NOT DEPLOYED. Per explicit instruction: real send remains
// disabled until separately authorized. `supabase functions deploy
// email-send` has not been run.
//
// Mirrors email-sync/index.ts's exact privilege pattern:
//   - `userClient` (the caller's own forwarded JWT) does every read/
//     authorization-relevant step — reading the draft row, the target
//     email_accounts row, the original message being replied to, and
//     the attachment metadata — because RLS on each of those tables
//     (has_permission('email','send'|'view') + organization_id) is the
//     actual authorization boundary, not a hand-rolled check here.
//   - `serviceClient` is used ONLY to read encrypted_credentials (same
//     narrow reason email-sync uses it: that specific column has no
//     authenticated-user SELECT policy) and to download attachment
//     bytes from the private email-attachments bucket bypassing its
//     per-object RLS AFTER this function has already independently
//     confirmed (via userClient) that the attachment row is real,
//     belongs to this organization, and was in the confirmed draft.
//
// This function performs the ONE step that cannot happen in the browser
// at all, for a structural reason, not just a security one: actual SMTP
// (imapSmtpAdapter's nodemailer transport) requires a raw TCP socket,
// which browser JavaScript cannot open. Every other Phase 5 state
// transition (draft, confirmed, sending) happens client-side via normal
// RLS-authorized writes (see lib/emailOutboundApi.ts) — this function is
// only ever invoked once a row is already 'sending' with its
// idempotency_key already persisted.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { imapSmtpAdapter } from "../_shared/imapSmtpAdapter.ts";
import type { EmailProviderAdapter, SendMessageInput } from "../_shared/emailAdapter.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// V1 scope (explicit product decision): the currently connected
// imap_smtp mailbox is the only sendable provider. Google/Microsoft
// adapters are not wired in here even though their own sendMessage()
// code exists — enabling them is a separate, explicit decision (their
// OAuth apps aren't configured on this project at all, confirmed via
// `supabase secrets list`), not something this function should silently
// attempt.
const SENDABLE_PROVIDERS: Record<string, EmailProviderAdapter> = {
  imap_smtp: imapSmtpAdapter,
};

const SEND_TIMEOUT_MS = 25_000; // If THIS fires, we genuinely do not know
// whether the provider received the message before the connection was
// abandoned — that is exactly the "unknown outcome" case, handled
// explicitly below, never silently retried.

function withTimeout<T>(work: Promise<T>, ms: number): Promise<{ ok: true; value: T } | { ok: false; timedOut: true }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ ok: false, timedOut: true }), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve({ ok: true, value });
      },
      (err) => {
        // A real rejection (auth failure, SMTP rejection, connection
        // refused) is NOT the same as "no response" — it must propagate
        // as a rejection so the caller's own try/catch sees it and can
        // classify it as provider_rejected/failed_before_provider.
        // Resolving it here instead (as an earlier version of this
        // function did) silently reclassified every real send failure
        // as "unknown", which defeats the whole point of that status.
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

Deno.serve(async (req: Request) => {
  try {
    return await handle(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected server error.";
    return jsonResponse({ error: message }, 500);
  }
});

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ENCRYPTION_KEY = Deno.env.get("EMAIL_CREDENTIALS_ENCRYPTION_KEY");
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Server misconfigured: missing Supabase environment." }, 500);
  }
  if (!ENCRYPTION_KEY) {
    return jsonResponse({ error: "Email credential encryption is not configured." }, 501);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Missing Authorization header." }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return jsonResponse({ error: "Not authenticated." }, 401);

  let body: { draftId?: string; idempotencyKey?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }
  if (!body.draftId || !body.idempotencyKey) {
    return jsonResponse({ error: "draftId and idempotencyKey are required." }, 400);
  }

  // RLS (has_permission('email','send') + organization_id) is the real
  // authorization check — a caller without send permission, or asking
  // for a draft in a different organization, gets zero rows back.
  const { data: draft, error: draftError } = await userClient
    .from("email_outbound_sends")
    .select(
      "id, organization_id, email_account_id, kind, reply_to_message_id, to_addresses, " +
        "cc_addresses, subject, body_text, body_html, attachments, status, idempotency_key",
    )
    .eq("id", body.draftId)
    .maybeSingle();
  if (draftError) return jsonResponse({ error: draftError.message }, 400);
  if (!draft) return jsonResponse({ error: "Draft not found, or you don't have access to it." }, 404);

  // Idempotency: this function only ever proceeds for the exact
  // send-attempt that already persisted this key BEFORE calling here
  // (see markEmailOutboundSendSending). A retried/duplicate invocation
  // carrying a stale or mismatched key is refused outright rather than
  // guessed at — and a draft already past 'sending' (a genuine repeat
  // call after a prior attempt already resolved) is reported back as
  // its real current state, never re-sent.
  if (draft.status !== "sending") {
    return jsonResponse(
      { error: `Draft is not in 'sending' state (current: ${draft.status}) — refusing to send again.`, status: draft.status },
      409,
    );
  }
  if (draft.idempotency_key !== body.idempotencyKey) {
    return jsonResponse({ error: "Idempotency key does not match this draft's persisted send attempt." }, 409);
  }

  const { data: account, error: accountError } = await userClient
    .from("email_accounts")
    .select(
      "id, organization_id, provider, imap_host, imap_port, imap_encryption, smtp_host, smtp_port, " +
        "smtp_encryption, imap_username, status",
    )
    .eq("id", draft.email_account_id)
    .maybeSingle();
  if (accountError) return jsonResponse({ error: accountError.message }, 400);
  if (!account) return jsonResponse({ error: "Sending mailbox not found, or you don't have access to it." }, 404);
  if (account.status !== "connected") {
    await markTerminal(userClient, draft.id, "failed_before_provider", `Sending mailbox is not connected (status: ${account.status}).`);
    return jsonResponse({ error: "Sending mailbox is not connected." }, 409);
  }
  const adapter = SENDABLE_PROVIDERS[account.provider as string];
  if (!adapter) {
    await markTerminal(userClient, draft.id, "failed_before_provider", `Provider "${account.provider}" is not enabled for sending in this deployment.`);
    return jsonResponse({ error: `Provider "${account.provider}" is not enabled for sending.` }, 501);
  }

  // Reply-thread validation, re-checked server-side (defense in depth —
  // the AI action layer should already have refused a reply with no
  // reliable thread identity, but this function never trusts that it
  // was called correctly).
  let inReplyToInternetMessageId: string | undefined;
  if (draft.kind === "reply") {
    if (!draft.reply_to_message_id) {
      await markTerminal(userClient, draft.id, "failed_before_provider", "Reply draft has no reply_to_message_id.");
      return jsonResponse({ error: "Reply draft has no target message." }, 400);
    }
    const { data: original, error: originalError } = await userClient
      .from("email_messages")
      .select("id, provider_internet_message_id")
      .eq("id", draft.reply_to_message_id)
      .maybeSingle();
    if (originalError) return jsonResponse({ error: originalError.message }, 400);
    if (!original) {
      await markTerminal(userClient, draft.id, "failed_before_provider", "Original message for this reply is no longer accessible.");
      return jsonResponse({ error: "Original message for this reply is no longer accessible." }, 404);
    }
    if (!original.provider_internet_message_id) {
      // This should already have been refused at draft-creation time —
      // never fabricate a thread reference here either.
      await markTerminal(
        userClient,
        draft.id,
        "failed_before_provider",
        "Original message has no captured Message-ID — cannot construct a reliable reply.",
      );
      return jsonResponse({ error: "Original message has no reliable thread identity; cannot send as a reply." }, 409);
    }
    inReplyToInternetMessageId = original.provider_internet_message_id;
  }

  // Attachments: each ref is re-verified against the real
  // email_attachments row (organization-scoped via RLS) — the LLM/draft
  // JSON's own filename/mimeType/sizeBytes are never trusted for the
  // actual bytes, only attachmentId is. Bytes are fetched here,
  // server-side, and only here.
  const attachmentRefs = (draft.attachments ?? []) as Array<{ attachmentId?: string }>;
  const outboundAttachments: NonNullable<SendMessageInput["attachments"]> = [];
  for (const ref of attachmentRefs) {
    if (!ref.attachmentId) continue;
    const { data: attRow, error: attError } = await userClient
      .from("email_attachments")
      .select("id, filename, mime_type, storage_path, processing_status")
      .eq("id", ref.attachmentId)
      .maybeSingle();
    if (attError) return jsonResponse({ error: attError.message }, 400);
    if (!attRow || attRow.processing_status !== "stored") {
      await markTerminal(userClient, draft.id, "failed_before_provider", `Attachment ${ref.attachmentId} is not available (not found or not stored).`);
      return jsonResponse({ error: `Attachment ${ref.attachmentId} is not available.` }, 409);
    }
    const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: fileBlob, error: downloadError } = await serviceClient.storage
      .from("email-attachments")
      .download(attRow.storage_path);
    if (downloadError || !fileBlob) {
      await markTerminal(userClient, draft.id, "failed_before_provider", `Could not retrieve attachment ${ref.attachmentId}: ${downloadError?.message ?? "unknown error"}.`);
      return jsonResponse({ error: `Could not retrieve attachment ${ref.attachmentId}.` }, 500);
    }
    outboundAttachments.push({
      filename: attRow.filename,
      mimeType: attRow.mime_type ?? undefined,
      content: new Uint8Array(await fileBlob.arrayBuffer()),
    });
  }

  // Credentials: decrypted via userClient's own RPC call, same pattern
  // and same authorization boundary as email-sync — never via
  // serviceClient, so this still only succeeds for a user RLS already
  // proved may use this account.
  const serviceClientForCreds = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: encryptedRow, error: readCredError } = await serviceClientForCreds
    .from("email_accounts")
    .select("encrypted_credentials")
    .eq("id", account.id)
    .single();
  if (readCredError || !encryptedRow?.encrypted_credentials) {
    await markTerminal(userClient, draft.id, "failed_before_provider", "Could not read stored mailbox credentials.");
    return jsonResponse({ error: "Could not read stored credentials." }, 500);
  }
  const { data: decrypted, error: decryptError } = await userClient.rpc("decrypt_email_credentials", {
    p_ciphertext: encryptedRow.encrypted_credentials,
    p_key: ENCRYPTION_KEY,
  });
  if (decryptError || !decrypted) {
    await markTerminal(userClient, draft.id, "failed_before_provider", "Could not decrypt stored mailbox credentials.");
    return jsonResponse({ error: "Could not decrypt stored credentials." }, 500);
  }
  const credentials = JSON.parse(decrypted);

  const sendInput: SendMessageInput = {
    to: draft.to_addresses as string[],
    cc: (draft.cc_addresses as string[] | null) ?? undefined,
    subject: draft.subject,
    bodyText: draft.body_text,
    bodyHtml: draft.body_html ?? undefined,
    inReplyToInternetMessageId,
    references: inReplyToInternetMessageId ? [inReplyToInternetMessageId] : undefined,
    attachments: outboundAttachments.length > 0 ? outboundAttachments : undefined,
  };

  let sendThrew: unknown;
  let sendResult: { providerMessageId: string } | undefined;
  try {
    const raced = await withTimeout(adapter.sendMessage(credentials, sendInput), SEND_TIMEOUT_MS);
    if (raced.ok) {
      sendResult = raced.value;
    } else {
      // Our own timeout fired with no resolution either way — this is
      // the exact "provider may have accepted it, we don't know"
      // scenario. Terminal 'unknown' state; never auto-retried (the
      // status-transition trigger has no legal transition out of it).
      await markTerminal(userClient, draft.id, "unknown", `No response from provider within ${SEND_TIMEOUT_MS}ms — outcome unknown.`);
      return jsonResponse({ status: "unknown", message: "Send outcome is unknown — provider did not respond in time. This requires human review before any retry." }, 202);
    }
  } catch (err) {
    sendThrew = err;
  }

  if (sendThrew) {
    const message = sendThrew instanceof Error ? sendThrew.message : "Send failed.";
    // Heuristic, not a perfect classifier (documented as such): a real
    // SMTP rejection response code means the provider was genuinely
    // contacted and refused it; anything else (connection/auth failure
    // before any message was transmitted) is failed_before_provider.
    // Nodemailer surfaces responseCode only for the former.
    const responseCode = (sendThrew as { responseCode?: number })?.responseCode;
    const terminalStatus = typeof responseCode === "number" ? "provider_rejected" : "failed_before_provider";
    await markTerminal(userClient, draft.id, terminalStatus, message);
    return jsonResponse({ status: terminalStatus, error: message }, 502);
  }

  await userClient
    .from("email_outbound_sends")
    .update({ status: "sent", provider_message_id: sendResult?.providerMessageId ?? null, sent_at: new Date().toISOString() })
    .eq("id", draft.id);

  return jsonResponse({ status: "sent", providerMessageId: sendResult?.providerMessageId }, 200);
}

async function markTerminal(
  userClient: ReturnType<typeof createClient>,
  draftId: string,
  status: "failed_before_provider" | "provider_rejected" | "unknown",
  message: string,
): Promise<void> {
  await userClient
    .from("email_outbound_sends")
    .update({ status, last_error: message })
    .eq("id", draftId);
}
