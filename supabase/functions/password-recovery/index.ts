// FabFlow ERP — admin self-service password recovery.
//
// The ONE deliberately-unauthenticated Auth-adjacent function in this
// app - by design, since its entire purpose is recovering access when
// NO authenticated session (privileged or otherwise) exists at all.
// Every other Auth-adjacent function (admin-create-user,
// admin-reset-password, recovery-email-setup) requires a caller; this
// one categorically cannot, or it wouldn't solve the sole-admin lockout
// case it exists for.
//
// Because there's no caller to authorize against, the security boundary
// moves entirely into: (1) never revealing anything about whether a
// username/recovery email exists/is admin/is verified — every branch of
// both actions returns one identical shape regardless of the real
// reason, and (2) the recovery code itself — hashed, short-lived,
// single-use, attempt-limited, exactly like recovery-email-setup's
// codes.
//
// Scope, per explicit product decision: only is_admin=true accounts are
// eligible. A non-admin identifier always gets the same generic response
// as a nonexistent one - this function must never be usable as an
// oracle for "is this account an admin", by username OR by email.
//
// Accepts EITHER identifier, on both actions - exactly one of the two
// must be present; whichever is used still resolves to the same
// eligibility checks and the same per-account token binding, since a
// verified recovery_email is unique per account (enforced by
// profiles_recovery_email_unique_idx) and only ever populated once that
// exact address round-trips through recovery-email-setup's own OTP
// verification.
//
//   action: "request"  - {username|recoveryEmail} -> always
//     {success:true}. Internally a no-op unless the resolved account
//     exists, is_admin, is_active, and has a VERIFIED recovery email -
//     in which case a 6-digit code is emailed there.
//   action: "complete" - {username|recoveryEmail, code, newPassword} ->
//     resets the password via the same auth.admin.updateUserById call
//     admin-reset-password already uses (same refresh-token invalidation
//     guarantee), then marks the code used, and returns the account's
//     FabFlow username - deliberately revealed only at this point,
//     since by here the caller has already proven control of the
//     account's verified recovery inbox. Never sets
//     must_change_password - the caller just deliberately chose this
//     password themselves, unlike an admin-issued temporary one.

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

const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 3;
const REQUEST_WINDOW_MS = 15 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const GENERIC_REQUEST_RESPONSE = {
  success: true,
  message:
    "If that account exists and is eligible for self-service recovery, a code has been sent to its registered recovery email.",
};
const GENERIC_FAILURE = { error: "Invalid or expired code." };

interface RequestBody {
  action: "request" | "complete";
  username?: string;
  recoveryEmail?: string;
  code?: string;
  newPassword?: string;
}

type Identifier =
  | { type: "username"; value: string }
  | { type: "recoveryEmail"; value: string };

function parseIdentifier(body: RequestBody): Identifier | null {
  const username = (body.username || "").trim();
  const recoveryEmail = (body.recoveryEmail || "").trim();
  // Exactly one of the two - never both, never neither. Ambiguous input
  // is treated the same as "not found" further down, not as an error
  // that would leak which field was malformed.
  if (username && !recoveryEmail) return { type: "username", value: username };
  if (recoveryEmail && !username)
    return { type: "recoveryEmail", value: recoveryEmail };
  return null;
}

async function resolveEligibleAdmin(
  serviceClient: ReturnType<typeof createClient>,
  identifier: Identifier,
) {
  const normalized = identifier.value.trim().toLowerCase();
  if (!normalized) return null;

  const column = identifier.type === "username" ? "username" : "recovery_email";
  const { data: profile } = await serviceClient
    .from("profiles")
    .select(
      "id, username, organization_id, is_active, recovery_email, recovery_email_verified_at",
    )
    .eq(column, normalized)
    .maybeSingle();
  if (!profile) return null;

  if (!profile.is_active) return { profile, eligible: false as const };
  if (!(await isAdminUser(serviceClient, profile.id))) {
    return { profile, eligible: false as const };
  }
  // A recoveryEmail lookup already matched a non-null recovery_email
  // column by construction; a username lookup still needs this check.
  if (!profile.recovery_email || !profile.recovery_email_verified_at) {
    return { profile, eligible: false as const };
  }
  return { profile, eligible: true as const };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse(
      { error: "Server misconfigured: missing Supabase environment/secrets." },
      500,
    );
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  // Service-role only — there is no caller session to scope a userClient
  // to. Every lookup below is by exact username/recovery_email/id, never
  // by a client-supplied organization or user id.
  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  if (body.action === "request") {
    const identifier = parseIdentifier(body);
    const found = identifier
      ? await resolveEligibleAdmin(serviceClient, identifier)
      : null;

    if (found?.eligible) {
      const { profile } = found;

      const { data: recentRequests } = await serviceClient
        .from("password_recovery_tokens")
        .select("id")
        .eq("user_id", profile.id)
        .eq("purpose", "password_recovery")
        .gt(
          "created_at",
          new Date(Date.now() - REQUEST_WINDOW_MS).toISOString(),
        );
      const withinLimit =
        (recentRequests?.length ?? 0) < MAX_REQUESTS_PER_WINDOW;

      let sendError: string | undefined;
      if (withinLimit) {
        // Superseded by this new one - only the latest should ever
        // verify, regardless of which identifier requested it.
        await serviceClient
          .from("password_recovery_tokens")
          .update({ used_at: new Date().toISOString() })
          .eq("user_id", profile.id)
          .eq("purpose", "password_recovery")
          .is("used_at", null);

        const code = generateOtpCode();
        const tokenHash = await hashCode(code);
        await serviceClient.from("password_recovery_tokens").insert({
          user_id: profile.id,
          purpose: "password_recovery",
          token_hash: tokenHash,
          expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
        });

        try {
          await sendRecoveryCodeEmail(
            SUPABASE_URL,
            SERVICE_ROLE_KEY,
            profile.organization_id,
            profile.recovery_email as string,
            "FabFlow ERP — password recovery code",
            `Your FabFlow password recovery code is: ${code}\n\nThis code expires in 15 minutes. If you didn't request this, you can ignore this email — your password has not been changed.`,
          );
        } catch (err) {
          // Never surfaced to the caller — a send failure (most likely:
          // no default sender configured) must stay indistinguishable
          // from "not eligible"/"no such account" from their side. But
          // it must not be silently lost either: this is exactly the
          // "fail safely with a clear admin-facing error" case, so it's
          // logged and recorded on the audit event an admin can already
          // see in Settings → Security Audit Log.
          sendError = err instanceof Error ? err.message : String(err);
          console.error(
            "password-recovery: failed to send OTP email:",
            sendError,
          );
        }
      }

      await serviceClient.from("security_audit_log").insert({
        organization_id: profile.organization_id,
        event_type: "password_recovery_requested",
        actor_user_id: null,
        target_user_id: profile.id,
        metadata: {
          eligible: true,
          rate_limited: !withinLimit,
          via: identifier?.type,
          ...(sendError ? { sendError } : {}),
        },
      });
    } else if (found && !found.eligible) {
      // A real account was found but isn't eligible (not admin, not
      // active, or no verified recovery email) - worth an internal
      // audit signal (repeated attempts against one account is a probe
      // worth an admin's attention), never surfaced to the caller.
      await serviceClient.from("security_audit_log").insert({
        organization_id: found.profile.organization_id,
        event_type: "password_recovery_requested",
        actor_user_id: null,
        target_user_id: found.profile.id,
        metadata: { eligible: false, via: identifier?.type },
      });
    }

    return jsonResponse(GENERIC_REQUEST_RESPONSE, 200);
  }

  if (body.action === "complete") {
    const identifier = parseIdentifier(body);
    const code = (body.code || "").trim();
    const newPassword = body.newPassword || "";

    if (!identifier || !code || newPassword.length < 8) {
      return jsonResponse(
        {
          error:
            "A username or recovery email, a code, and a password of at least 8 characters are required.",
        },
        400,
      );
    }

    const found = await resolveEligibleAdmin(serviceClient, identifier);
    if (!found?.eligible) {
      return jsonResponse(GENERIC_FAILURE, 400);
    }
    const { profile } = found;

    const { data: tokenRow } = await serviceClient
      .from("password_recovery_tokens")
      .select("id, token_hash, attempt_count, expires_at, used_at")
      .eq("user_id", profile.id)
      .eq("purpose", "password_recovery")
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!tokenRow || new Date(tokenRow.expires_at).getTime() < Date.now()) {
      return jsonResponse(GENERIC_FAILURE, 400);
    }
    if (tokenRow.attempt_count >= MAX_VERIFY_ATTEMPTS) {
      return jsonResponse(GENERIC_FAILURE, 400);
    }

    const submittedHash = await hashCode(code);
    if (submittedHash !== tokenRow.token_hash) {
      await serviceClient
        .from("password_recovery_tokens")
        .update({ attempt_count: tokenRow.attempt_count + 1 })
        .eq("id", tokenRow.id);
      return jsonResponse(GENERIC_FAILURE, 400);
    }

    const { error: updatePasswordError } =
      await serviceClient.auth.admin.updateUserById(profile.id, {
        password: newPassword,
      });
    if (updatePasswordError) {
      return jsonResponse(
        { error: `Password reset failed: ${updatePasswordError.message}` },
        500,
      );
    }

    const nowIso = new Date().toISOString();
    // This code, and any other still-outstanding password_recovery code
    // for this account, are now spent.
    await serviceClient
      .from("password_recovery_tokens")
      .update({ used_at: nowIso })
      .eq("user_id", profile.id)
      .eq("purpose", "password_recovery")
      .is("used_at", null);

    // Deliberately NOT must_change_password: the caller just chose this
    // password themselves, unlike an admin-issued temporary one.
    await serviceClient.from("security_audit_log").insert({
      organization_id: profile.organization_id,
      event_type: "password_recovery_completed",
      actor_user_id: null,
      target_user_id: profile.id,
      metadata: { via: identifier.type },
    });

    // The username is revealed here, and only here - the caller has
    // just proven control of the account's verified recovery inbox by
    // supplying a matching code, so this is no longer an enumeration
    // risk, and the Login screen needs it to show what was recovered.
    return jsonResponse({ success: true, username: profile.username }, 200);
  }

  return jsonResponse({ error: "Unknown action." }, 400);
});
