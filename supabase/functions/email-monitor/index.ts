// Phase 8 Email Operations — the dedicated, unattended email-monitor
// Edge Function. See this repo's Phase 8 report for the full design
// rationale; the short version:
//
//   trigger (pg_cron -> pg_net, once approved/enabled)
//     -> this function (service-role, no user session)
//     -> trusted mailbox discovery (email_accounts, status='connected')
//     -> per mailbox: claim lock (email_monitor_state) -> find eligible
//        messages (email_monitor_find_eligible_messages) -> for each,
//        run the same read-only MATCHING/confidence analysis Phase 6-7
//        already established, via a narrow 8-tool lookup surface
//        (erpLookups.ts) -> record exactly one durable outcome per
//        message (email_operational_alerts row, or
//        email_monitor_considered row) -> release lock, write run stats
//
// What this function can NEVER do, by construction (no code path exists
// for any of these, not just a policy saying not to): send email, write
// to any ERP business table, modify permissions, or let a message's
// content pick which organization/mailbox/message it scopes to (every
// id used below comes from this function's own trusted queries, never
// from model output — see the "NEVER FROM MODEL OUTPUT" markers in
// runner.ts). This file itself owns only the Deno-platform glue (HTTP
// server, env vars, the real service-role client) — the actual
// per-mailbox/per-message orchestration lives in runner.ts, split out
// specifically so it has no Deno-only import and can be exercised by a
// plain Node/tsx test (see the Phase 8 report's TESTING section).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { OpenAIProvider } from "../_shared/openaiProvider.ts";
import type { ChatProvider } from "../_shared/provider.ts";
import { LOCK_LEASE_MS } from "./analysis.ts";
import { claimMailboxLock, processMailbox, type RunCounters } from "./runner.ts";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  try {
    return await handle(req);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Unexpected server error." }, 500);
  }
});

async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || undefined;
  const MONITOR_SECRET = Deno.env.get("EMAIL_MONITOR_SECRET");

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Server misconfigured: missing Supabase environment." }, 500);
  }
  if (!MONITOR_SECRET) {
    // Fail closed rather than silently accepting any caller — this
    // function has no user JWT to check (it is never invoked with one),
    // so its OWN shared secret IS the authorization boundary (distinct
    // from, and narrower than, holding any valid Supabase API key). See
    // the scheduler-preparation migration for how this is provisioned.
    return jsonResponse({ error: "Server misconfigured: EMAIL_MONITOR_SECRET is not set." }, 500);
  }
  if (req.headers.get("x-monitor-secret") !== MONITOR_SECRET) {
    return jsonResponse({ error: "Not authorized." }, 401);
  }
  if (!OPENAI_API_KEY) {
    return jsonResponse({ error: "The monitor's AI backend is not configured (no OPENAI_API_KEY secret set)." }, 501);
  }

  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const provider: ChatProvider = new OpenAIProvider(OPENAI_API_KEY, OPENAI_MODEL);

  // Trusted mailbox discovery (8D) — this list comes ONLY from the
  // database, scoped ONLY by connection status; nothing about which
  // mailboxes get processed is ever influenced by model output, because
  // this query runs BEFORE any model call in this entire invocation.
  const { data: accounts, error: accountsError } = await serviceClient
    .from("email_accounts")
    .select("id, organization_id")
    .eq("status", "connected");
  if (accountsError) {
    return jsonResponse({ error: `Could not list connected mailboxes: ${accountsError.message}` }, 500);
  }

  const results: Array<{ emailAccountId: string; status: string; counters?: RunCounters; error?: string }> = [];

  for (const account of accounts ?? []) {
    // Ensure a state row exists (safe under concurrency: ON CONFLICT DO
    // NOTHING via ignoreDuplicates — two racing invocations both trying
    // to create the first-ever row for this mailbox is not an error).
    await serviceClient
      .from("email_monitor_state")
      .upsert(
        { email_account_id: account.id, organization_id: account.organization_id },
        { onConflict: "email_account_id", ignoreDuplicates: true },
      );

    const runId = crypto.randomUUID();

    // CONCURRENCY (8E): atomic conditional UPDATE — see claimMailboxLock's
    // own comment and the migration's comment for why this is safe under
    // two near-simultaneous invocations without any advisory lock. false
    // means another invocation already holds this mailbox's lock right now.
    let claimed: boolean;
    try {
      claimed = await claimMailboxLock(serviceClient, account.id, runId, LOCK_LEASE_MS);
    } catch (err) {
      results.push({
        emailAccountId: account.id,
        status: "error",
        error: err instanceof Error ? err.message : "Could not claim mailbox lock.",
      });
      continue; // one mailbox's DB error must not block the others (8D)
    }
    if (!claimed) {
      results.push({ emailAccountId: account.id, status: "locked" });
      continue;
    }

    try {
      const counters = await processMailbox(serviceClient, provider, account, runId);
      const finishedAt = new Date().toISOString();
      const runStatus = counters.failures === 0 ? "success" : counters.analyzed > 0 ? "partial" : "failed";
      const baseUpdate = {
        status: "idle",
        run_id: null,
        locked_at: null,
        locked_until: null,
        last_run_finished_at: finishedAt,
        last_run_status: runStatus,
        last_run_messages_considered: counters.considered,
        last_run_messages_analyzed: counters.analyzed,
        last_run_alerts_created: counters.alertsCreated,
        last_run_messages_marked_no_alert: counters.noAlertMarked,
        last_run_failures: counters.failures,
        last_error:
          counters.failures > 0
            ? `${counters.failures} message(s) failed analysis and remain eligible for retry.`
            : null,
      };
      if (runStatus === "failed") {
        // Read-then-increment (same idiom as email_sync_state's own
        // consecutive_failures) — a small race window here is harmless,
        // this is a purely informational counter, never a correctness
        // signal anything else depends on.
        const { data: state } = await serviceClient
          .from("email_monitor_state")
          .select("consecutive_failures")
          .eq("email_account_id", account.id)
          .maybeSingle();
        await serviceClient
          .from("email_monitor_state")
          .update({ ...baseUpdate, consecutive_failures: ((state?.consecutive_failures as number) ?? 0) + 1 })
          .eq("email_account_id", account.id);
      } else {
        await serviceClient
          .from("email_monitor_state")
          .update({ ...baseUpdate, consecutive_failures: 0 })
          .eq("email_account_id", account.id);
      }
      results.push({ emailAccountId: account.id, status: runStatus, counters });
    } catch (err) {
      // Whole-mailbox failure (e.g. the eligibility RPC itself errored) —
      // release the lock and record it, then move on to the next mailbox
      // (8D: one mailbox's failure must not block others).
      const message = err instanceof Error ? err.message : "Unexpected mailbox processing error.";
      await serviceClient
        .from("email_monitor_state")
        .update({
          status: "failed",
          run_id: null,
          locked_at: null,
          locked_until: null,
          last_run_finished_at: new Date().toISOString(),
          last_run_status: "failed",
          last_error: message,
        })
        .eq("email_account_id", account.id);
      results.push({ emailAccountId: account.id, status: "failed", error: message });
    }
  }

  return jsonResponse({ processedMailboxes: results.length, results }, 200);
}
