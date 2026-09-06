// Admin-only self-service password recovery — shared helpers used by both
// recovery-email-setup (authenticated) and password-recovery (public).
// Kept in one place so the two functions can't drift on how a code is
// generated/hashed/verified.

import { type SupabaseClient, createClient } from "jsr:@supabase/supabase-js@2";
import type { EmailProviderAdapter } from "./emailAdapter.ts";
import { googleAdapter } from "./googleAdapter.ts";
import { imapSmtpAdapter } from "./imapSmtpAdapter.ts";
import { microsoftAdapter } from "./microsoftAdapter.ts";

const ADAPTERS: Record<
  "google" | "microsoft" | "imap_smtp",
  EmailProviderAdapter
> = {
  google: googleAdapter,
  microsoft: microsoftAdapter,
  imap_smtp: imapSmtpAdapter,
};

/** 6-digit numeric code, uniformly distributed (rejection sampling — no
 * modulo bias) via the Web Crypto API already available in Deno. */
export function generateOtpCode(): string {
  const range = 1_000_000; // 000000-999999
  const maxUnbiased = Math.floor(0x100000000 / range) * range;
  let n: number;
  do {
    n = new Uint32Array(crypto.getRandomValues(new Uint32Array(1)))[0];
  } while (n >= maxUnbiased);
  return String(n % range).padStart(6, "0");
}

/** Never store the raw code anywhere — only this hash. SHA-256 is enough
 * here: the secret is a random 6-digit code guarded by expiry + attempt
 * lockout, not a long-lived credential needing a slow KDF. */
export async function hashCode(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(code);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** True iff this profile currently holds an is_admin=true role. Always
 * re-checked server-side with a service-role client — never trusted from
 * the frontend, which is only ever a convenience gate. */
export async function isAdminUser(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await serviceClient
    .from("user_roles")
    .select("roles!inner(is_admin)")
    .eq("user_id", userId)
    .eq("roles.is_admin", true)
    .limit(1);
  return !!data && data.length > 0;
}

/**
 * Sends a plain-text recovery code email using this organization's own
 * connected email_accounts row (Universal Email Integration) — the only
 * real outbound-email transport this app has. Deliberately does its own
 * decrypt via the service-role client rather than the userClient path
 * email-sync uses: decrypt_email_credentials is a pure, stateless
 * pgp_sym_decrypt wrapper with no internal auth logic (verified by
 * reading its definition) — the authorization boundary here is this
 * caller having already independently verified the target is a real,
 * active, verified admin, exactly like admin-reset-password already
 * bypasses RLS on profiles/security_audit_log for the same reason.
 * Throws on any failure — callers decide how to surface that.
 */
export async function sendRecoveryCodeEmail(
  supabaseUrl: string,
  serviceRoleKey: string,
  organizationId: string,
  toEmail: string,
  subject: string,
  bodyText: string,
): Promise<void> {
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  // Always the organization's explicitly-chosen default sender - never a
  // fallback to "oldest connected" or any other implicit pick. An admin
  // sets this once via Settings -> Email Accounts -> "Make Default"; if
  // none is set (or, in the one window before the one-default-per-org
  // migration lands, more than one somehow is), this fails loudly rather
  // than silently choosing an account nobody approved for this purpose.
  const { data: accounts, error: accountError } = await serviceClient
    .from("email_accounts")
    .select(
      "id, provider, imap_host, imap_port, imap_encryption, smtp_host, " +
        "smtp_port, smtp_encryption, imap_username, encrypted_credentials",
    )
    .eq("organization_id", organizationId)
    .eq("status", "connected")
    .eq("is_default_sender", true);
  if (accountError) {
    throw new Error(
      `Could not resolve the organization's default sender: ${accountError.message}`,
    );
  }
  if (!accounts || accounts.length === 0) {
    throw new Error(
      "No default sender email account is configured for this organization. An administrator must set one in Settings → Email Accounts before recovery emails can be sent.",
    );
  }
  if (accounts.length > 1) {
    throw new Error(
      "More than one email account is marked as the default sender for this organization - an administrator must resolve this in Settings → Email Accounts before recovery emails can be sent.",
    );
  }
  const account = accounts[0];

  const encryptionKey = Deno.env.get("EMAIL_CREDENTIALS_ENCRYPTION_KEY");
  if (!encryptionKey) {
    throw new Error(
      "Server misconfigured: missing EMAIL_CREDENTIALS_ENCRYPTION_KEY.",
    );
  }
  const { data: decrypted, error: decryptError } = await serviceClient.rpc(
    "decrypt_email_credentials",
    { p_ciphertext: account.encrypted_credentials, p_key: encryptionKey },
  );
  if (decryptError || !decrypted) {
    throw new Error("Could not decrypt the organization's email credentials.");
  }
  const storedCreds = JSON.parse(decrypted);
  const credentials =
    account.provider === "imap_smtp"
      ? {
          imapHost: account.imap_host,
          imapPort: account.imap_port,
          imapEncryption: account.imap_encryption,
          smtpHost: account.smtp_host,
          smtpPort: account.smtp_port,
          smtpEncryption: account.smtp_encryption,
          username: account.imap_username,
          password: storedCreds.password,
        }
      : storedCreds;

  const adapter =
    ADAPTERS[account.provider as keyof typeof ADAPTERS] ?? imapSmtpAdapter;
  await adapter.sendMessage(credentials, {
    to: [toEmail],
    subject,
    bodyText,
  });
}
