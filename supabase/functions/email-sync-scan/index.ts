// Phase 9B — the dedicated, unattended multi-mailbox sync Edge Function.
// Same architecture as email-monitor (Phase 8), and deliberately
// independent of it — this function never calls email-monitor and vice
// versa; each is its own pg_cron -> pg_net -> Edge Function job. A
// message this function just synced simply becomes eligible on
// email-monitor's own next tick, via its existing eligibility logic —
// no direct coupling needed.
//
//   trigger (pg_cron -> pg_net, once approved/enabled)
//     -> this function (service-role, no user session, no LLM at all)
//     -> trusted mailbox discovery (email_accounts, status='connected',
//        every organization — never scoped to one org or one mailbox)
//     -> scanMailboxes (_shared/emailSyncLock.ts) — the same loop shape
//        as email-monitor's own: ensure state row -> claim lock -> per
//        mailbox try/catch/isolate -> release lock, plus the overall
//        wall-clock budget email-monitor's own loop doesn't need (no
//        per-account I/O there is as expensive as a full provider sync)
//     -> per mailbox: decrypt credentials (service-role — confirmed
//        identity-agnostic, see emailSyncCore.ts) -> syncOneMailbox (the
//        SAME per-mailbox logic email-sync's human-triggered endpoint
//        uses — one synchronization implementation, not two)
//
// There is no LLM anywhere in this function — trivially satisfies "the
// LLM must never choose organization_id/email_account_id/message
// scope" for this function, since no model is ever invoked here at all.
// Every id used below comes from this function's own trusted queries.

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  decryptAccountCredentials,
  syncOneMailbox,
} from "../_shared/emailSyncCore.ts";
import { scanMailboxes } from "../_shared/emailSyncLock.ts";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Overall budget across ALL mailboxes in one invocation — the gap
// identified in the Phase 9A audit (email-sync's own
// SYNC_WALL_CLOCK_BUDGET_MS only ever bounded one mailbox at a time).
//
// Pre-deployment review correction: the deadline check in scanMailboxes
// runs BEFORE starting a mailbox, not preemptively during one — so the
// real worst-case wall-clock time is this budget PLUS however long the
// one mailbox already in flight when the deadline trips takes to finish:
// up to SYNC_WALL_CLOCK_BUDGET_MS (25s) for its own message loop, plus
// one attachment upload already past that check's own withTimeout cap
// (20s) if a slow upload was mid-flight, plus whatever headroom the
// adapter's own internal IMAP/API timeouts need beyond that (claimed
// bounded by imapSmtpAdapter.ts's own comments, not independently
// re-verified against real numbers this session). 90s left too little
// margin against the scheduler's own net.http_post timeout_milliseconds
// (120000ms, see the scheduler-preparation migration) once that tail is
// added — 60s leaves a full 60s of headroom instead of ~30s.
const OVERALL_BUDGET_MS = 60_000;

Deno.serve(async (req: Request) => {
  try {
    return await handle(req);
  } catch (err) {
    return jsonResponse(
      {
        error: err instanceof Error ? err.message : "Unexpected server error.",
      },
      500,
    );
  }
});

async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ENCRYPTION_KEY = Deno.env.get("EMAIL_CREDENTIALS_ENCRYPTION_KEY");
  const SYNC_SECRET = Deno.env.get("EMAIL_SYNC_SECRET");

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse(
      { error: "Server misconfigured: missing Supabase environment." },
      500,
    );
  }
  if (!SYNC_SECRET) {
    // Fail closed rather than silently accepting any caller — same
    // reasoning as email-monitor's own EMAIL_MONITOR_SECRET: this
    // function has no user JWT to check, so its own shared secret IS
    // the authorization boundary, distinct from holding any Supabase API key.
    return jsonResponse(
      { error: "Server misconfigured: EMAIL_SYNC_SECRET is not set." },
      500,
    );
  }
  if (req.headers.get("x-sync-secret") !== SYNC_SECRET) {
    return jsonResponse({ error: "Not authorized." }, 401);
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

  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Trusted mailbox discovery — every organization's every connected
  // mailbox, in one query, exactly like email-monitor's own. No fixed
  // count, no org filter, no LLM involvement anywhere in this function.
  const { data: accounts, error: accountsError } = await serviceClient
    .from("email_accounts")
    .select(
      "id, organization_id, provider, imap_host, imap_port, imap_encryption, " +
        "smtp_host, smtp_port, smtp_encryption, imap_username, sync_window_days",
    )
    .eq("status", "connected");
  if (accountsError) {
    return jsonResponse(
      { error: `Could not list connected mailboxes: ${accountsError.message}` },
      500,
    );
  }

  const summary = await scanMailboxes(
    serviceClient,
    accounts ?? [],
    OVERALL_BUDGET_MS,
    async (account) => {
      const credResult = await decryptAccountCredentials(
        serviceClient,
        account.id,
        ENCRYPTION_KEY,
      );
      if (!credResult.ok) {
        throw new Error(credResult.error);
      }
      // deno-lint-ignore no-explicit-any
      return syncOneMailbox(
        serviceClient,
        account as any,
        credResult.credentials,
      );
    },
  );

  return jsonResponse(summary, 200);
}
