// Phase 5 Email Operations — persisted draft/send-attempt read+write
// layer, over database/20260907010000_email_outbound_sends.sql (written,
// NOT applied). Same WriteResult/requireSession() contract as
// emailMessagesApi.ts and every other <domain>Api.ts.
//
// This file owns exactly the transitions that are legitimately client-
// initiated: create a draft, edit it while still a draft, and mark it
// confirmed/sending immediately before handing off to the email-send
// Edge Function (written, NOT deployed — see supabase/functions/
// email-send/index.ts) for the one step that requires server-side
// credential decryption and an actual provider call. The terminal
// transitions (sent/failed_before_provider/provider_rejected/unknown)
// are written by that Edge Function itself, not here — this file has no
// function that can mark a row "sent".
//
// Every transition still goes through the same RLS
// (has_permission('email','send') + organization_id = current_organization_id())
// as any other write in this app, and the database's own
// trg_validate_email_send_status_transition / trg_lock_confirmed_email_send_payload
// triggers are the actual, structural backstop — this file cannot bypass
// them even if it had a bug.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { EmailOutboundAttachmentRef, EmailOutboundSend } from "@/types";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

interface EmailOutboundSendRow {
  id: string;
  organization_id: string;
  created_by: string;
  email_account_id: string;
  kind: "reply" | "new";
  reply_to_message_id: string | null;
  to_addresses: string[];
  cc_addresses: string[];
  subject: string;
  body_text: string;
  body_html: string | null;
  attachments: EmailOutboundAttachmentRef[];
  status: EmailOutboundSend["status"];
  idempotency_key: string | null;
  provider_message_id: string | null;
  last_error: string | null;
  confirmed_at: string | null;
  sending_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToEmailOutboundSend(row: EmailOutboundSendRow): EmailOutboundSend {
  return {
    id: row.id,
    emailAccountId: row.email_account_id,
    kind: row.kind,
    replyToMessageId: row.reply_to_message_id ?? undefined,
    toAddresses: row.to_addresses ?? [],
    ccAddresses: row.cc_addresses ?? [],
    subject: row.subject,
    bodyText: row.body_text,
    bodyHtml: row.body_html ?? undefined,
    attachments: row.attachments ?? [],
    status: row.status,
    idempotencyKey: row.idempotency_key ?? undefined,
    providerMessageId: row.provider_message_id ?? undefined,
    lastError: row.last_error ?? undefined,
    confirmedAt: row.confirmed_at
      ? new Date(row.confirmed_at).getTime()
      : undefined,
    sendingAt: row.sending_at ? new Date(row.sending_at).getTime() : undefined,
    sentAt: row.sent_at ? new Date(row.sent_at).getTime() : undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

const EMAIL_OUTBOUND_SEND_COLUMNS =
  "id, organization_id, created_by, email_account_id, kind, reply_to_message_id, " +
  "to_addresses, cc_addresses, subject, body_text, body_html, attachments, status, " +
  "idempotency_key, provider_message_id, last_error, confirmed_at, sending_at, " +
  "sent_at, created_at, updated_at";

async function requireSession() {
  if (!isSupabaseConfigured) {
    return {
      ok: false as const,
      result: { status: "error" as const, error: "Supabase is not configured" },
    };
  }
  const client = getSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) {
    return {
      ok: false as const,
      result: { status: "error" as const, error: error.message },
    };
  }
  if (!data.session) {
    return {
      ok: false as const,
      result: { status: "unauthenticated" as const },
    };
  }
  return { ok: true as const, client };
}

export interface CreateEmailOutboundSendInput {
  emailAccountId: string;
  kind: "reply" | "new";
  replyToMessageId?: string;
  toAddresses: string[];
  ccAddresses?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  attachments?: EmailOutboundAttachmentRef[];
}

/** Creates a new draft row (status='draft'). No confirmation required to
 * call this — drafting has no external side effect (Phase 5 product
 * decision) — but it is still permission- and RLS-gated on
 * has_permission('email','send'), same as every other write here;
 * "no confirmation" is a UI/orchestrator property, not an authorization
 * bypass. */
export async function createEmailOutboundSend(
  input: CreateEmailOutboundSendInput,
): Promise<WriteResult<EmailOutboundSend>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("email_outbound_sends")
    .insert({
      email_account_id: input.emailAccountId,
      kind: input.kind,
      reply_to_message_id: input.replyToMessageId ?? null,
      to_addresses: input.toAddresses,
      cc_addresses: input.ccAddresses ?? [],
      subject: input.subject,
      body_text: input.bodyText,
      body_html: input.bodyHtml ?? null,
      attachments: input.attachments ?? [],
    })
    .select(EMAIL_OUTBOUND_SEND_COLUMNS)
    .single();
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: rowToEmailOutboundSend(data as unknown as EmailOutboundSendRow),
  };
}

export async function getEmailOutboundSend(
  id: string,
): Promise<WriteResult<EmailOutboundSend>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("email_outbound_sends")
    .select(EMAIL_OUTBOUND_SEND_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) return { status: "error", error: error.message };
  if (!data)
    return {
      status: "denied",
      error: "Draft not found, or you don't have access to it.",
    };
  return {
    status: "success",
    data: rowToEmailOutboundSend(data as unknown as EmailOutboundSendRow),
  };
}

export interface ListEmailOutboundSendsFilter {
  status?: EmailOutboundSend["status"];
  emailAccountId?: string;
  limit?: number;
}

/** Email Center Outbox — read-only history of every send attempt this
 * org has made, across every terminal and non-terminal status. Same
 * RLS boundary as every other function in this file (organization_id +
 * has_permission — see the migration that adds this table's SELECT
 * policy: viewing is gated on 'email.view', separate from 'send',
 * which still gates every write here). No pagination cursor yet — send
 * volume is orders of magnitude below email_messages, so a plain
 * limit/order is enough today. */
export async function listEmailOutboundSends(
  filter: ListEmailOutboundSendsFilter = {},
): Promise<WriteResult<EmailOutboundSend[]>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  let query = gate.client
    .from("email_outbound_sends")
    .select(EMAIL_OUTBOUND_SEND_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(filter.limit ?? 200);
  if (filter.status) query = query.eq("status", filter.status);
  if (filter.emailAccountId)
    query = query.eq("email_account_id", filter.emailAccountId);
  const { data, error } = await query;
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as EmailOutboundSendRow[]).map(
      rowToEmailOutboundSend,
    ),
  };
}

/** Edits a draft's own content — the database's own
 * trg_lock_confirmed_email_send_payload trigger rejects this outright
 * (a real DB error, surfaced as status:"error" here) once the row has
 * left 'draft' status, so this function cannot be used to smuggle a
 * change into an already-confirmed send even if called incorrectly. */
export async function updateEmailOutboundSendDraft(
  id: string,
  updates: Partial<
    Omit<CreateEmailOutboundSendInput, "kind" | "replyToMessageId">
  >,
): Promise<WriteResult<EmailOutboundSend>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const fields: Record<string, unknown> = {};
  if (updates.emailAccountId !== undefined)
    fields.email_account_id = updates.emailAccountId;
  if (updates.toAddresses !== undefined)
    fields.to_addresses = updates.toAddresses;
  if (updates.ccAddresses !== undefined)
    fields.cc_addresses = updates.ccAddresses;
  if (updates.subject !== undefined) fields.subject = updates.subject;
  if (updates.bodyText !== undefined) fields.body_text = updates.bodyText;
  if (updates.bodyHtml !== undefined) fields.body_html = updates.bodyHtml;
  if (updates.attachments !== undefined)
    fields.attachments = updates.attachments;
  const { data, error } = await gate.client
    .from("email_outbound_sends")
    .update(fields)
    .eq("id", id)
    .select(EMAIL_OUTBOUND_SEND_COLUMNS)
    .single();
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: rowToEmailOutboundSend(data as unknown as EmailOutboundSendRow),
  };
}

/** draft -> confirmed. Called ONLY from inside sendEmailReply/
 * sendNewEmail's execute() — i.e. only after the orchestrator's own
 * write-confirmation gate has already been satisfied by a real
 * authenticated UI click (see agent/actions.ts). This function itself
 * has no knowledge of confirmation state beyond that it was called. */
export async function confirmEmailOutboundSend(
  id: string,
): Promise<WriteResult<EmailOutboundSend>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("email_outbound_sends")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "draft") // extra guard: only a genuine draft can be confirmed — a
    // retried/duplicate call landing here after the row already moved on
    // updates zero rows instead of erroring or double-confirming.
    .select(EMAIL_OUTBOUND_SEND_COLUMNS)
    .maybeSingle();
  if (error) return { status: "error", error: error.message };
  if (!data)
    return {
      status: "denied",
      error:
        "Draft is not in a confirmable state (already confirmed/sent, or not found).",
    };
  return {
    status: "success",
    data: rowToEmailOutboundSend(data as unknown as EmailOutboundSendRow),
  };
}

/** confirmed -> sending, generating and persisting the durable
 * idempotency key BEFORE any provider call is ever made (Phase 5
 * idempotency requirement). Returns the key so the caller passes the
 * exact same value to the email-send Edge Function. */
export async function markEmailOutboundSendSending(
  id: string,
): Promise<WriteResult<{ idempotencyKey: string }>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const idempotencyKey = crypto.randomUUID();
  const { data, error } = await gate.client
    .from("email_outbound_sends")
    .update({
      status: "sending",
      sending_at: new Date().toISOString(),
      idempotency_key: idempotencyKey,
    })
    .eq("id", id)
    .eq("status", "confirmed") // same retry-safety guard as confirmEmailOutboundSend
    .select("id")
    .maybeSingle();
  if (error) return { status: "error", error: error.message };
  if (!data)
    return {
      status: "denied",
      error: "Draft is not in a confirmed state ready to send.",
    };
  return { status: "success", data: { idempotencyKey } };
}

/** sending -> unknown, used ONLY when requestEmailOutboundSend itself
 * could not be completed (the Edge Function call failed at the
 * transport/invoke level — not deployed, network error, timeout before
 * any response) rather than returning a real provider outcome. This is
 * genuinely the "unknown" case, not a made-up one: a client that never
 * got a response has no way to tell "never reached the function" apart
 * from "reached it, and the function's own response was lost in
 * transit" — both leave the real provider outcome unresolved. Without
 * this, a row would sit in 'sending' forever with no idempotency-based
 * retry path and no way for a human to even find it. Guarded to only
 * ever leave 'sending' (never touches a row some other path has already
 * resolved), matching every other transition function's retry-safety
 * pattern. */
export async function markEmailOutboundSendUnreachable(
  id: string,
  message: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { error } = await gate.client
    .from("email_outbound_sends")
    .update({ status: "unknown", last_error: message })
    .eq("id", id)
    .eq("status", "sending");
  if (error) return { status: "error", error: error.message };
  return { status: "success" };
}

/** Same FunctionsHttpError-unwrapping convention as
 * emailAccountsApi.ts's own (private) invokeEmailFunction — duplicated
 * rather than imported, matching this codebase's established
 * one-small-helper-per-<domain>Api.ts-file convention (emailMessagesApi.ts
 * also keeps its own requireSession rather than importing another
 * file's). Calls the email-send Edge Function — written, NOT deployed;
 * this call will fail with a real "function not found" error until it
 * is, which is the correct, honest behavior rather than pretending. */
async function invokeEmailSendFunction(body: Record<string, unknown>): Promise<
  WriteResult<{
    status: string;
    providerMessageId?: string;
    error?: string;
    message?: string;
  }>
> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client.functions.invoke<{
    status: string;
    providerMessageId?: string;
    error?: string;
    message?: string;
  }>("email-send", { body });
  if (error) {
    const context = (
      error as { context?: { json?: () => Promise<{ error?: string }> } }
    ).context;
    if (context?.json) {
      try {
        const errBody = await context.json();
        return { status: "error", error: errBody.error || error.message };
      } catch {
        // fall through
      }
    }
    return { status: "error", error: error.message };
  }
  if (!data) return { status: "error", error: "No response from email-send." };
  return { status: "success", data };
}

/** The one function that actually calls the email-send Edge Function —
 * i.e. the one function that would result in a real outbound email if
 * that function were deployed and this were invoked against a real
 * mailbox. Only ever called from sendEmailReply/sendNewEmail's
 * execute(), which only runs after the orchestrator's own write-
 * confirmation gate already required a real authenticated UI click. */
export async function requestEmailOutboundSend(
  draftId: string,
  idempotencyKey: string,
): Promise<
  WriteResult<{
    status: string;
    providerMessageId?: string;
    error?: string;
    message?: string;
  }>
> {
  return invokeEmailSendFunction({ draftId, idempotencyKey });
}
