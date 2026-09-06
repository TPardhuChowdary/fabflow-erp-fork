// FabFlow ERP — admin self-service recovery-email configuration.
//
// Sibling to admin-create-user/admin-reset-password: same shape, same
// discipline (server re-verifies everything, service-role key never
// leaves this runtime). The one thing genuinely different here: the
// caller acts on THEIR OWN account only (auth.uid() is always the
// target — there is no userId in the request body at all), so there is
// no cross-account authorization question, only "is this caller an
// administrator at all" - re-checked here, never trusted from the
// frontend, which only ever hides the control as a convenience.
//
// Two actions, one function, because they're two steps of the same
// protocol (request a code -> submit that code) and share every helper:
//   action: "request" - caller sets a NEW recovery_email_pending and is
//     emailed a 6-digit code at that (new) address.
//   action: "verify"  - caller submits that code; on match,
//     recovery_email_pending is promoted to the real, active
//     recovery_email and stamped recovery_email_verified_at. An
//     unverified address can never become the active channel — this is
//     the only code path that ever sets recovery_email_verified_at, and
//     it only runs after a code match.

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  generateOtpCode,
  hashCode,
  isAdminUser,
  sendRecoveryCodeEmail,
} from "../_shared/recovery.ts";

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_TTL_MS = 15 * 60 * 1000;
const REQUEST_COOLDOWN_MS = 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

interface RequestBody {
  action: "request" | "verify";
  newRecoveryEmail?: string;
  code?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return jsonResponse(
      { error: "Server misconfigured: missing Supabase environment/secrets." },
      500,
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing Authorization header." }, 401);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user: callerUser },
    error: callerError,
  } = await callerClient.auth.getUser();
  if (callerError || !callerUser) {
    return jsonResponse({ error: "Not authenticated." }, 401);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Server-side re-check — the frontend only ever hides this control for
  // non-admins as a convenience; this is the real boundary.
  if (!(await isAdminUser(adminClient, callerUser.id))) {
    return jsonResponse(
      { error: "Only administrator accounts can configure a recovery email." },
      403,
    );
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, organization_id, is_active")
    .eq("id", callerUser.id)
    .maybeSingle();
  if (profileError || !profile) {
    return jsonResponse({ error: "Could not load your profile." }, 500);
  }
  if (!profile.is_active) {
    return jsonResponse({ error: "This account is deactivated." }, 403);
  }

  if (body.action === "request") {
    const newRecoveryEmail = (body.newRecoveryEmail || "").trim().toLowerCase();
    if (!EMAIL_RE.test(newRecoveryEmail)) {
      return jsonResponse({ error: "Enter a valid email address." }, 400);
    }

    // Cooldown — one outstanding, non-expired, unused request per user
    // is enough; refuse to spam the mailbox owner with repeats.
    const { data: recent } = await adminClient
      .from("password_recovery_tokens")
      .select("created_at")
      .eq("user_id", callerUser.id)
      .eq("purpose", "recovery_email_verification")
      .is("used_at", null)
      .gt(
        "created_at",
        new Date(Date.now() - REQUEST_COOLDOWN_MS).toISOString(),
      )
      .limit(1);
    if (recent && recent.length > 0) {
      return jsonResponse(
        {
          error:
            "A verification code was already sent recently. Please wait a moment and try again.",
        },
        429,
      );
    }

    // Any older pending codes for this purpose are now moot - only the
    // newest one this call is about to create should ever verify.
    await adminClient
      .from("password_recovery_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", callerUser.id)
      .eq("purpose", "recovery_email_verification")
      .is("used_at", null);

    const code = generateOtpCode();
    const tokenHash = await hashCode(code);
    const { error: insertError } = await adminClient
      .from("password_recovery_tokens")
      .insert({
        user_id: callerUser.id,
        purpose: "recovery_email_verification",
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      });
    if (insertError) {
      return jsonResponse({ error: "Could not start verification." }, 500);
    }

    const { error: pendingError } = await adminClient
      .from("profiles")
      .update({ recovery_email_pending: newRecoveryEmail })
      .eq("id", callerUser.id);
    if (pendingError) {
      return jsonResponse(
        { error: "Could not save the pending recovery email." },
        500,
      );
    }

    try {
      await sendRecoveryCodeEmail(
        SUPABASE_URL,
        SERVICE_ROLE_KEY,
        profile.organization_id,
        newRecoveryEmail,
        "FabFlow ERP — verify your recovery email",
        `Your FabFlow account recovery-email verification code is: ${code}\n\nThis code expires in 15 minutes. If you didn't request this, you can ignore this email.`,
      );
    } catch (sendError) {
      return jsonResponse(
        {
          error: `Could not send the verification email: ${(sendError as Error).message}`,
        },
        500,
      );
    }

    return jsonResponse({ success: true }, 200);
  }

  if (body.action === "verify") {
    const code = (body.code || "").trim();
    if (!code) {
      return jsonResponse({ error: "Enter the verification code." }, 400);
    }

    const { data: tokenRow, error: tokenError } = await adminClient
      .from("password_recovery_tokens")
      .select("id, token_hash, attempt_count, expires_at, used_at")
      .eq("user_id", callerUser.id)
      .eq("purpose", "recovery_email_verification")
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (tokenError || !tokenRow) {
      return jsonResponse({ error: "Invalid or expired code." }, 400);
    }
    if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
      return jsonResponse({ error: "Invalid or expired code." }, 400);
    }
    if (tokenRow.attempt_count >= MAX_VERIFY_ATTEMPTS) {
      return jsonResponse(
        { error: "Too many attempts. Request a new code." },
        400,
      );
    }

    const submittedHash = await hashCode(code);
    if (submittedHash !== tokenRow.token_hash) {
      await adminClient
        .from("password_recovery_tokens")
        .update({ attempt_count: tokenRow.attempt_count + 1 })
        .eq("id", tokenRow.id);
      return jsonResponse({ error: "Invalid or expired code." }, 400);
    }

    const { data: pendingProfile } = await adminClient
      .from("profiles")
      .select("recovery_email_pending")
      .eq("id", callerUser.id)
      .maybeSingle();
    if (!pendingProfile?.recovery_email_pending) {
      return jsonResponse(
        { error: "No pending recovery email to verify." },
        400,
      );
    }

    const nowIso = new Date().toISOString();
    const { error: promoteError } = await adminClient
      .from("profiles")
      .update({
        recovery_email: pendingProfile.recovery_email_pending,
        recovery_email_verified_at: nowIso,
        recovery_email_pending: null,
      })
      .eq("id", callerUser.id);
    if (promoteError) {
      // profiles_recovery_email_unique_idx - another account already
      // verified this exact address first. Surface clearly rather than
      // a generic 500; the caller's own pending state is left as-is so
      // they can try a different address without losing their place.
      if (promoteError.code === "23505") {
        return jsonResponse(
          {
            error:
              "This email is already the verified recovery email for another account.",
          },
          409,
        );
      }
      return jsonResponse(
        { error: "Could not confirm the recovery email." },
        500,
      );
    }

    await adminClient
      .from("password_recovery_tokens")
      .update({ used_at: nowIso })
      .eq("id", tokenRow.id);

    await adminClient.from("security_audit_log").insert({
      organization_id: profile.organization_id,
      event_type: "recovery_email_verified",
      actor_user_id: callerUser.id,
      target_user_id: callerUser.id,
      metadata: {},
    });

    return jsonResponse({ success: true }, 200);
  }

  return jsonResponse({ error: "Unknown action." }, 400);
});
