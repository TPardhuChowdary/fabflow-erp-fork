// Universal Email Integration (see chat) — email_messages/email_attachments
// read layer. Same WriteResult/requireSession() contract as
// emailAccountsApi.ts and every other <domain>Api.ts. Messages/attachments
// are written only by the email-sync Edge Function (service-role, bypasses
// RLS — see database/phase-50's header note); this file only ever reads
// them plus the one narrow client-writable field (is_read).
//
// Deliberately NOT read via the agent/queries.ts "pre-hydrated
// useStore.getState()" pattern every other Agent query uses — a mailbox's
// message/attachment volume doesn't fit bulk-loading into the Zustand
// store the way a company's customers/projects/invoices do. This is the
// same on-demand Supabase-query pattern every *Api.ts file already uses;
// it just isn't ALSO pre-hydrated into the store the way domain data the
// Agent's existing queries read is. The Agent's own email tools (a later
// phase) will call these same functions directly, not go through the
// store.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type {
  EmailAttachment,
  EmailAttachmentProcessingStatus,
  EmailMessage,
} from "@/types";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

interface EmailMessageRow {
  id: string;
  email_account_id: string;
  provider_message_id: string;
  provider_thread_id: string | null;
  from_address: string;
  from_name: string | null;
  to_addresses: string[] | null;
  cc_addresses: string[] | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  snippet: string | null;
  sent_at: string | null;
  is_read: boolean;
  folder: string;
  has_attachments: boolean;
}

function rowToEmailMessage(row: EmailMessageRow): EmailMessage {
  return {
    id: row.id,
    emailAccountId: row.email_account_id,
    providerMessageId: row.provider_message_id,
    providerThreadId: row.provider_thread_id ?? undefined,
    fromAddress: row.from_address,
    fromName: row.from_name ?? undefined,
    toAddresses: row.to_addresses ?? [],
    ccAddresses: row.cc_addresses ?? [],
    subject: row.subject ?? undefined,
    bodyText: row.body_text ?? undefined,
    bodyHtml: row.body_html ?? undefined,
    snippet: row.snippet ?? undefined,
    sentAt: row.sent_at ? new Date(row.sent_at).getTime() : undefined,
    isRead: row.is_read,
    folder: row.folder,
    hasAttachments: row.has_attachments,
  };
}

// List-view columns deliberately omit body_html/body_text (can be large;
// the message list only needs the snippet) — getEmailMessage() below
// selects the full column set for the detail view.
const EMAIL_MESSAGE_LIST_COLUMNS =
  "id, email_account_id, provider_message_id, provider_thread_id, " +
  "from_address, from_name, to_addresses, cc_addresses, subject, " +
  "snippet, sent_at, is_read, folder, has_attachments";
const EMAIL_MESSAGE_FULL_COLUMNS = `${EMAIL_MESSAGE_LIST_COLUMNS}, body_text, body_html`;

interface EmailAttachmentRow {
  id: string;
  email_message_id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string;
  processing_status: EmailAttachmentProcessingStatus;
}

function rowToEmailAttachment(row: EmailAttachmentRow): EmailAttachment {
  return {
    id: row.id,
    emailMessageId: row.email_message_id,
    filename: row.filename,
    mimeType: row.mime_type ?? undefined,
    sizeBytes: row.size_bytes ?? undefined,
    storagePath: row.storage_path,
    processingStatus: row.processing_status,
  };
}

const EMAIL_ATTACHMENT_COLUMNS =
  "id, email_message_id, filename, mime_type, size_bytes, storage_path, processing_status";

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

export interface ListEmailMessagesFilter {
  emailAccountId?: string;
  folder?: string;
  unreadOnly?: boolean;
  hasAttachmentsOnly?: boolean;
  /** Plain-text search across subject/from/snippet — a real ILIKE query,
   * not a fabricated "semantic search"; the Agent's own search_emails
   * tool (a later phase) is a thin wrapper over this same function. */
  searchText?: string;
  limit?: number;
}

export async function listEmailMessages(
  filter: ListEmailMessagesFilter = {},
): Promise<WriteResult<EmailMessage[]>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  let query = gate.client
    .from("email_messages")
    .select(EMAIL_MESSAGE_LIST_COLUMNS)
    .order("sent_at", { ascending: false })
    .limit(filter.limit ?? 100);
  if (filter.emailAccountId)
    query = query.eq("email_account_id", filter.emailAccountId);
  if (filter.folder) query = query.eq("folder", filter.folder);
  if (filter.unreadOnly) query = query.eq("is_read", false);
  if (filter.hasAttachmentsOnly) query = query.eq("has_attachments", true);
  if (filter.searchText?.trim()) {
    const term = `%${filter.searchText.trim()}%`;
    query = query.or(
      `subject.ilike.${term},from_address.ilike.${term},from_name.ilike.${term},snippet.ilike.${term}`,
    );
  }
  const { data, error } = await query;
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as EmailMessageRow[]).map(rowToEmailMessage),
  };
}

export async function getEmailMessage(
  id: string,
): Promise<WriteResult<EmailMessage>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("email_messages")
    .select(EMAIL_MESSAGE_FULL_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) return { status: "error", error: error.message };
  if (!data) return { status: "denied", error: "Message not found" };
  return {
    status: "success",
    data: rowToEmailMessage(data as unknown as EmailMessageRow),
  };
}

export async function markEmailMessageRead(
  id: string,
  isRead: boolean,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("email_messages")
    .update({ is_read: isRead })
    .eq("id", id)
    .select("id");
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as { id: string }[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success" };
}

export async function listEmailAttachments(
  emailMessageId: string,
): Promise<WriteResult<EmailAttachment[]>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("email_attachments")
    .select(EMAIL_ATTACHMENT_COLUMNS)
    .eq("email_message_id", emailMessageId)
    .order("filename", { ascending: true });
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as EmailAttachmentRow[]).map(rowToEmailAttachment),
  };
}

const ATTACHMENT_SIGNED_URL_TTL_SECONDS = 60 * 10; // 10 minutes — a viewer
// link, not a long-lived reference (contrast lib/ledgerExportRemote.ts's
// 24h export TTL and agent/documentUpload.ts's 1-year attachment-reference
// TTL): an email attachment is private business correspondence, so its
// access window should be as short as still-usable, not "convenient".

/** Signed URL for downloading/previewing one attachment — never a public
 * link (the email-attachments bucket has no public read policy at all,
 * see database/phase-50). */
export async function getEmailAttachmentSignedUrl(
  storagePath: string,
): Promise<WriteResult<string>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client.storage
    .from("email-attachments")
    .createSignedUrl(storagePath, ATTACHMENT_SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    return {
      status: "error",
      error: error?.message ?? "Could not generate an access link.",
    };
  }
  return { status: "success", data: data.signedUrl };
}
