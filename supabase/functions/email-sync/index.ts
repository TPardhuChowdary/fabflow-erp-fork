// Universal Email Integration (see chat) — syncs one connected mailbox,
// on behalf of the logged-in human who clicked "Sync now" (or any other
// authenticated caller acting on their own account). This is the
// user-authenticated entry point; the unattended, all-mailboxes entry
// point is email-sync-scan (Phase 9B) — both call the exact same
// per-mailbox logic in _shared/emailSyncCore.ts, so there is only ever
// one synchronization implementation.
//
// Two Supabase clients, deliberately different privilege levels:
//   - `userClient` (the caller's own forwarded JWT) does the ONE thing
//     that must be authorization-checked against the real user: reading
//     the target email_accounts row. RLS's normal email_accounts_select
//     policy (has_permission('email','view') and
//     organization_id = current_organization_id()) is what actually
//     proves this user is allowed to touch this mailbox — there is no
//     separate, hand-rolled authorization check duplicating that logic
//     here.
//   - `serviceClient` (service-role, bypasses RLS) does everything after
//     that authorization is established: credential decryption (Phase
//     9B — read decryptAccountCredentials's own comment for why this is
//     safe; the RPC itself is identity-agnostic), the lock claim, and
//     every write email_messages/email_attachments/email_sync_state
//     already gave no authenticated-user INSERT policy to.
//
// CONCURRENCY (Phase 9B): this endpoint now claims the same per-mailbox
// lease lock (email_sync_state.locked_until) that email-sync-scan uses,
// closing the race between a manual "Sync now" click and an automatic
// scheduled sync landing on the same mailbox at once — previously
// nothing prevented that. If the mailbox is already locked, this
// returns 409 rather than silently double-processing it.
//
// Deduplication (requirement #9): `email_messages` has
// UNIQUE(email_account_id, provider_message_id) — this function always
// upserts `on_conflict` that pair, so re-running a sync (restart,
// double-trigger, etc.) can never create a duplicate row, regardless of
// how many times a given provider message is returned. Unchanged by
// Phase 9B.

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  LOCK_LEASE_MS,
  claimSyncLock,
  decryptAccountCredentials,
  ensureSyncStateRow,
  releaseSyncLock,
  syncOneMailbox,
} from "../_shared/emailSyncCore.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// Requirement: Edge Functions must handle failures cleanly — an unhandled
// exception anywhere below (a bad import, an unexpected provider response
// shape, ...) must still come back as a real JSON error with CORS headers,
// never a bare platform-level crash. A crash without CORS headers shows up
// in the browser as an opaque "blocked by CORS policy" error, which hides
// the actual failure from both the user and whoever is debugging it — so
// this top-level try/catch is a correctness requirement, not just
// politeness.
Deno.serve(async (req: Request) => {
  try {
    return await handle(req);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
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
    return jsonResponse(
      { error: "Server misconfigured: missing Supabase environment." },
      500,
    );
  }
  if (!ENCRYPTION_KEY) {
    return jsonResponse(
      {
        error:
          "Email credential encryption is not configured yet (missing EMAIL_CREDENTIALS_ENCRYPTION_KEY secret).",
      },
      501,
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing Authorization header." }, 401);
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: "Not authenticated." }, 401);
  }

  let body: { emailAccountId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }
  if (!body.emailAccountId) {
    return jsonResponse({ error: "emailAccountId is required." }, 400);
  }

  // RLS (on userClient) is the real authorization check here — a user
  // without has_permission('email','view') on their own org, or asking
  // for an account in a different org, gets zero rows back, exactly as
  // if the account didn't exist. No account, no data, no distinction
  // between "not yours" and "doesn't exist" leaked to the caller.
  const { data: account, error: accountError } = await userClient
    .from("email_accounts")
    .select(
      "id, organization_id, provider, imap_host, imap_port, imap_encryption, " +
        "smtp_host, smtp_port, smtp_encryption, imap_username, sync_window_days",
    )
    .eq("id", body.emailAccountId)
    .maybeSingle();
  if (accountError) return jsonResponse({ error: accountError.message }, 400);
  if (!account) return jsonResponse({ error: "Email account not found." }, 404);

  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const credResult = await decryptAccountCredentials(
    serviceClient,
    account.id,
    ENCRYPTION_KEY,
  );
  if (!credResult.ok) {
    return jsonResponse({ error: credResult.error }, 500);
  }

  await ensureSyncStateRow(serviceClient, account.id, account.organization_id);
  const claimed = await claimSyncLock(serviceClient, account.id, LOCK_LEASE_MS);
  if (!claimed) {
    return jsonResponse(
      {
        error:
          "This mailbox is already being synced (by another request or the automatic scheduler) — try again shortly.",
      },
      409,
    );
  }

  try {
    const result = await syncOneMailbox(
      serviceClient,
      account,
      credResult.credentials,
    );
    return jsonResponse(result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed.";
    return jsonResponse({ error: message }, 502);
  } finally {
    await releaseSyncLock(serviceClient, account.id);
  }
}
