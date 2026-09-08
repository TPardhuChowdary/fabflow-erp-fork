// Universal Email Integration (see chat) — email_accounts service layer.
//
// Same WriteResult/requireSession()/explicit-column-list contract as every
// other <domain>Api.ts in this codebase (see lib/payablesApi.ts). One
// deliberate difference: connecting an account is NOT a plain `.insert()`
// from this file — credentials must be encrypted server-side (see
// database/phase-50's header note), so connectEmailAccount() instead
// invokes the "email-connect" Edge Function, the same
// `supabase.functions.invoke()` pattern agent/llm/client.ts already
// established for agent-chat. EMAIL_ACCOUNT_COLUMNS never lists
// encrypted_credentials — this file can never accidentally return it to a
// caller even if a future edit adds a raw `.select("*")` somewhere else in
// the codebase; the column simply isn't part of this file's vocabulary.

import { fetchAllRows } from "@/lib/hydration";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type {
  EmailAccount,
  EmailAccountStatus,
  EmailConnectionMethod,
  EmailEncryption,
  EmailProvider,
} from "@/types";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

interface EmailAccountRow {
  id: string;
  email_address: string;
  display_name: string | null;
  provider: EmailProvider;
  connection_method: EmailConnectionMethod;
  imap_host: string | null;
  imap_port: number | null;
  imap_encryption: EmailEncryption | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_encryption: EmailEncryption | null;
  status: EmailAccountStatus;
  status_detail: string | null;
  last_sync_at: string | null;
  sync_window_days: number;
  is_default_sender: boolean;
  created_at: string;
}

function rowToEmailAccount(row: EmailAccountRow): EmailAccount {
  return {
    id: row.id,
    emailAddress: row.email_address,
    displayName: row.display_name ?? undefined,
    provider: row.provider,
    connectionMethod: row.connection_method,
    imapHost: row.imap_host ?? undefined,
    imapPort: row.imap_port ?? undefined,
    imapEncryption: row.imap_encryption ?? undefined,
    smtpHost: row.smtp_host ?? undefined,
    smtpPort: row.smtp_port ?? undefined,
    smtpEncryption: row.smtp_encryption ?? undefined,
    status: row.status,
    statusDetail: row.status_detail ?? undefined,
    lastSyncAt: row.last_sync_at
      ? new Date(row.last_sync_at).getTime()
      : undefined,
    syncWindowDays: row.sync_window_days,
    isDefaultSender: row.is_default_sender,
    createdAt: new Date(row.created_at).getTime(),
  };
}

// Deliberately never includes encrypted_credentials — see module header.
const EMAIL_ACCOUNT_COLUMNS =
  "id, email_address, display_name, provider, connection_method, " +
  "imap_host, imap_port, imap_encryption, smtp_host, smtp_port, " +
  "smtp_encryption, status, status_detail, last_sync_at, " +
  "sync_window_days, is_default_sender, created_at";

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

export async function listEmailAccounts(): Promise<
  WriteResult<EmailAccount[]>
> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  // Gap-closure fix — was a single unbounded .select(); email_accounts is
  // user-grown via connectImapSmtpAccount() below, so it gets the same
  // .range() paging as every other genuinely growable business collection.
  const { data, error } = await fetchAllRows<EmailAccountRow>(
    (from, to) =>
      gate.client
        .from("email_accounts")
        .select(EMAIL_ACCOUNT_COLUMNS)
        .order("created_at", { ascending: true })
        .range(from, to) as unknown as PromiseLike<{
        data: EmailAccountRow[] | null;
        error: { message: string } | null;
      }>,
  );
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data ?? []).map(rowToEmailAccount),
  };
}

/** Same FunctionsHttpError-unwrapping convention as agent/llm/client.ts's
 * callAgentLLM() — the real status/body lives on error.context, not
 * error.message alone. */
async function invokeEmailFunction<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<WriteResult<T>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client.functions.invoke<
    T & { error?: string }
  >(name, { body });
  if (error) {
    const context = (
      error as { context?: { json?: () => Promise<{ error?: string }> } }
    ).context;
    if (context?.json) {
      try {
        const errBody = await context.json();
        return { status: "error", error: errBody.error || error.message };
      } catch {
        // fall through to the generic error below
      }
    }
    return { status: "error", error: error.message };
  }
  if (!data || (data as { error?: string }).error) {
    return {
      status: "error",
      error: (data as { error?: string } | null)?.error || "Request failed.",
    };
  }
  return { status: "success", data };
}

export interface ConnectImapSmtpInput {
  emailAddress: string;
  displayName?: string;
  imapHost: string;
  imapPort: number;
  imapEncryption: EmailEncryption;
  smtpHost: string;
  smtpPort: number;
  smtpEncryption: EmailEncryption;
  username: string;
  password: string;
  syncWindowDays: number;
}

/** Submits IMAP/SMTP credentials once, over HTTPS, straight into the
 * email-connect Edge Function — never stored client-side, never returned.
 * The Edge Function encrypts them server-side (see database/phase-50)
 * before the row is ever written; this function never sees the ciphertext
 * either, only the same credential-free EMAIL_ACCOUNT_COLUMNS shape every
 * other read from this file uses. */
export async function connectImapSmtpAccount(
  input: ConnectImapSmtpInput,
): Promise<WriteResult<EmailAccount>> {
  const result = await invokeEmailFunction<EmailAccountRow>("email-connect", {
    connectionMethod: "imap_smtp",
    ...input,
  });
  if (result.status !== "success" || !result.data) {
    return { status: result.status, error: result.error };
  }
  return { status: "success", data: rowToEmailAccount(result.data) };
}

/** Phase 9E — starts the Google OAuth authorization-code flow: asks
 * email-oauth-start for a one-time authorization URL (bound server-side
 * to this user/org/emailAddress), for the caller to navigate the browser
 * to. Connection itself completes later, out-of-band, when Google
 * redirects to email-oauth-callback — this function never sees a token. */
export async function startGoogleOAuth(
  emailAddress: string,
): Promise<WriteResult<{ authorizeUrl: string }>> {
  return invokeEmailFunction<{ authorizeUrl: string }>("email-oauth-start", {
    emailAddress,
  });
}

export async function syncEmailAccount(
  emailAccountId: string,
): Promise<WriteResult<{ newMessages: number }>> {
  return invokeEmailFunction<{ newMessages: number }>("email-sync", {
    emailAccountId,
  });
}

export async function disconnectEmailAccount(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("email_accounts")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as { id: string }[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error:
        "No account was disconnected (blocked by RLS, or it doesn't exist).",
    };
  }
  return { status: "success" };
}

export async function updateEmailAccountSettings(
  id: string,
  updates: {
    syncWindowDays?: number;
    isDefaultSender?: boolean;
    displayName?: string;
  },
): Promise<WriteResult<EmailAccount>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const fields: Record<string, unknown> = {};
  if (updates.syncWindowDays !== undefined)
    fields.sync_window_days = updates.syncWindowDays;
  if (updates.isDefaultSender !== undefined)
    fields.is_default_sender = updates.isDefaultSender;
  if (updates.displayName !== undefined)
    fields.display_name = updates.displayName || null;
  const { data, error } = await gate.client
    .from("email_accounts")
    .update(fields)
    .eq("id", id)
    .select(EMAIL_ACCOUNT_COLUMNS);
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as EmailAccountRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: rowToEmailAccount(rows[0]) };
}
