// Universal Email Integration (see chat) — connects one mailbox.
//
// The ONLY place a raw IMAP/SMTP password or OAuth token is ever visible
// in plaintext outside the provider itself: it arrives in this request
// body (over HTTPS, from an already-authenticated browser), is verified
// with a real testConnection() round-trip against the actual provider,
// and is handed to Postgres's pgp_sym_encrypt() to become
// encrypted_credentials — never written to any table in plaintext, never
// echoed back in the response, never logged.
//
// Uses the CALLING USER's own JWT (forwarded, not a service-role client)
// for the actual database write — RLS's normal email_accounts_insert
// policy (has_permission('email','create') and
// organization_id = current_organization_id()) is the real authorization
// boundary here, exactly like every other write in this codebase. No
// service-role bypass is needed or used for this step.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { googleAdapter } from "../_shared/googleAdapter.ts";
import { imapSmtpAdapter } from "../_shared/imapSmtpAdapter.ts";
import { microsoftAdapter } from "../_shared/microsoftAdapter.ts";
import type { EmailProviderAdapter } from "../_shared/emailAdapter.ts";

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

interface ConnectRequest {
  connectionMethod: "imap_smtp";
  emailAddress?: string;
  displayName?: string;
  imapHost?: string;
  imapPort?: number;
  imapEncryption?: "ssl" | "starttls" | "none";
  smtpHost?: string;
  smtpPort?: number;
  smtpEncryption?: "ssl" | "starttls" | "none";
  username?: string;
  password?: string;
  syncWindowDays?: number;
}

// The full adapter registry, even though this endpoint only currently
// accepts "imap_smtp" bodies (OAuth account-connect is a separate future
// flow — an OAuth redirect callback, not this same-request-body shape).
// Keeping the registry real and complete, rather than importing only what
// today's one reachable branch needs, means adding the OAuth callback
// route later is "add a case", not "first go build the registry".
const ADAPTERS: Record<"google" | "microsoft" | "imap_smtp", EmailProviderAdapter> = {
  google: googleAdapter,
  microsoft: microsoftAdapter,
  imap_smtp: imapSmtpAdapter,
};

function pickAdapter(body: ConnectRequest): EmailProviderAdapter {
  return ADAPTERS[body.connectionMethod] ?? imapSmtpAdapter;
}

// See email-sync/index.ts's identical comment: an unhandled exception must
// still come back as a real JSON error with CORS headers, never a bare
// platform-level crash that the browser can only report as an opaque
// "blocked by CORS policy" error.
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
  const ENCRYPTION_KEY = Deno.env.get("EMAIL_CREDENTIALS_ENCRYPTION_KEY");
  if (!SUPABASE_URL || !ANON_KEY) {
    return jsonResponse({ error: "Server misconfigured: missing Supabase environment." }, 500);
  }
  if (!ENCRYPTION_KEY) {
    return jsonResponse(
      { error: "Email credential encryption is not configured yet (missing EMAIL_CREDENTIALS_ENCRYPTION_KEY secret)." },
      501,
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing Authorization header." }, 401);
  }
  // Forwards the CALLER's own JWT on every query this client makes, so
  // Postgres sees the real user (auth.uid()) and RLS applies exactly as
  // it does for any other write in the app — never a service-role client.
  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: "Not authenticated." }, 401);
  }

  let body: ConnectRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }
  if (body.connectionMethod !== "imap_smtp") {
    return jsonResponse({ error: "Unsupported connection method." }, 400);
  }
  const required: Array<keyof ConnectRequest> = [
    "emailAddress",
    "imapHost",
    "imapPort",
    "imapEncryption",
    "smtpHost",
    "smtpPort",
    "smtpEncryption",
    "username",
    "password",
  ];
  const missing = required.filter((k) => !body[k]);
  if (missing.length > 0) {
    return jsonResponse({ error: `Missing required field(s): ${missing.join(", ")}` }, 400);
  }

  const adapter = pickAdapter(body);
  const testResult = await adapter.testConnection({
    imapHost: body.imapHost,
    imapPort: body.imapPort,
    imapEncryption: body.imapEncryption,
    smtpHost: body.smtpHost,
    smtpPort: body.smtpPort,
    smtpEncryption: body.smtpEncryption,
    username: body.username,
    password: body.password,
  });
  if (!testResult.ok) {
    return jsonResponse({ error: `Could not connect: ${testResult.error}` }, 400);
  }

  // The credential payload actually encrypted — deliberately a minimal,
  // adapter-shaped object (not "the whole request body") so nothing
  // beyond genuine secrets (e.g. a future stray field) ever ends up
  // inside encrypted_credentials.
  const credentialPayload = JSON.stringify({
    imapHost: body.imapHost,
    imapPort: body.imapPort,
    imapEncryption: body.imapEncryption,
    smtpHost: body.smtpHost,
    smtpPort: body.smtpPort,
    smtpEncryption: body.smtpEncryption,
    username: body.username,
    password: body.password,
  });

  // pgp_sym_encrypt runs inside Postgres itself — the plaintext travels
  // from this function to Postgres once, over the same TLS connection
  // every other Supabase query already uses, and is never written
  // anywhere unencrypted. The encryption key is bound at call time from
  // this function's own environment, never stored in any table.
  const { data: encryptedRow, error: encryptError } = await supabase.rpc(
    "encrypt_email_credentials",
    { p_plaintext: credentialPayload, p_key: ENCRYPTION_KEY },
  );
  if (encryptError || !encryptedRow) {
    return jsonResponse(
      { error: `Could not securely store credentials: ${encryptError?.message ?? "unknown error"}` },
      500,
    );
  }

  const { data: inserted, error: insertError } = await supabase
    .from("email_accounts")
    .insert({
      connected_by: userData.user.id,
      email_address: body.emailAddress,
      display_name: body.displayName || null,
      provider: "imap_smtp",
      connection_method: "imap_smtp",
      imap_host: body.imapHost,
      imap_port: body.imapPort,
      imap_encryption: body.imapEncryption,
      smtp_host: body.smtpHost,
      smtp_port: body.smtpPort,
      smtp_encryption: body.smtpEncryption,
      imap_username: body.username,
      encrypted_credentials: encryptedRow,
      status: "connected",
      sync_window_days: body.syncWindowDays || 30,
    })
    .select(
      "id, email_address, display_name, provider, connection_method, " +
        "imap_host, imap_port, imap_encryption, smtp_host, smtp_port, " +
        "smtp_encryption, status, status_detail, last_sync_at, " +
        "sync_window_days, is_default_sender, created_at",
    )
    .single();
  if (insertError) {
    // Postgres unique_violation on (organization_id, email_address).
    if (insertError.code === "23505") {
      return jsonResponse({ error: "This mailbox is already connected." }, 409);
    }
    return jsonResponse({ error: insertError.message }, 400);
  }

  return jsonResponse(inserted, 200);
}
