// FabFlow ERP — administrator password-reset workflow.
//
// Sibling to admin-create-user/index.ts, same shape deliberately: this is
// the second (and only other) place SUPABASE_SERVICE_ROLE_KEY is ever
// used in this app — it never reaches the browser. A dedicated function
// rather than an admin-create-user extension on purpose: different
// permission, different validation, different failure modes (org lookup,
// audit-write surfacing) — folding it into user-creation would blur an
// already-narrow, single-purpose function.
//
// Callable only via `supabase.functions.invoke("admin-reset-password", ...)`
// from an already-signed-in FabFlow session; supabase-js forwards the
// caller's own access token automatically.
//
// Authorization is re-checked HERE, server-side, against the caller's own
// JWT via has_permission('users','reset_password') — never trusted from
// the request body. organization_id is likewise always re-derived
// server-side (current_organization_id() for the caller, a fresh DB read
// of the target's own profile row for the target) — the browser's request
// body supplies only userId + newPassword, nothing else is ever trusted
// from it.

import { createClient } from "jsr:@supabase/supabase-js@2";

interface ResetPasswordRequest {
  userId: string;
  newPassword: string;
}

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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  let body: ResetPasswordRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const userId = (body.userId || "").trim();
  const newPassword = body.newPassword || "";

  if (!UUID_RE.test(userId)) {
    return jsonResponse({ error: "userId must be a valid UUID." }, 400);
  }
  // Same minimum as admin-create-user - one password-strength rule, not two.
  if (newPassword.length < 8) {
    return jsonResponse(
      { error: "Password must be at least 8 characters." },
      400,
    );
  }

  // Client scoped to the CALLER's own identity - has_permission() and
  // current_organization_id() evaluate exactly as they would for any
  // normal request from this user.
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

  const { data: canReset, error: permError } = await callerClient.rpc(
    "has_permission",
    { p_module: "users", p_action: "reset_password" },
  );
  if (permError) {
    return jsonResponse(
      { error: `Permission check failed: ${permError.message}` },
      500,
    );
  }
  if (!canReset) {
    return jsonResponse(
      { error: "You do not have permission to reset user passwords." },
      403,
    );
  }

  const { data: callerOrgId, error: orgError } = await callerClient.rpc(
    "current_organization_id",
  );
  if (orgError || !callerOrgId) {
    return jsonResponse(
      { error: "Could not resolve caller's organization." },
      500,
    );
  }

  // Service-role client — only used past this point, only for the two
  // privileged operations below plus the audit write. Never exposed to
  // the browser.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Resolve the target from the database and independently verify
  // organization membership - userId is the only thing trusted from the
  // request; organization_id is always read fresh from the row itself,
  // never accepted from the caller.
  const { data: targetProfile, error: targetLookupError } = await adminClient
    .from("profiles")
    .select("id, organization_id")
    .eq("id", userId)
    .maybeSingle();
  if (targetLookupError) {
    return jsonResponse(
      { error: `Target lookup failed: ${targetLookupError.message}` },
      500,
    );
  }
  if (!targetProfile) {
    return jsonResponse({ error: "User not found." }, 404);
  }
  if (targetProfile.organization_id !== callerOrgId) {
    return jsonResponse(
      { error: "That user does not belong to your organization." },
      403,
    );
  }

  const { error: updatePasswordError } =
    await adminClient.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
  if (updatePasswordError) {
    return jsonResponse(
      { error: `Password reset failed: ${updatePasswordError.message}` },
      500,
    );
  }

  // Force the existing "Set a New Password" screen on next login - same
  // flag admin-create-user sets at creation time, same self-service
  // clearing path (clear_own_must_change_password()) already in place.
  const { error: mustChangeError } = await adminClient
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", userId);
  if (mustChangeError) {
    // The password itself was already reset successfully - report this
    // rather than pretending the whole operation failed (there is no
    // clean rollback of a real auth.users password change, same
    // reasoning admin-create-user's employeeLinkError comment already
    // documents for its own secondary-write failure).
    return jsonResponse(
      {
        success: true,
        mustChangePasswordError: `Password was reset, but the forced-change flag could not be set: ${mustChangeError.message}`,
      },
      200,
    );
  }

  // Audit write — deliberately a direct insert via the service-role
  // client, not the client-facing log_security_event() RPC (that RPC's
  // own internal check hardcodes has_permission('users','edit'), which a
  // reset_password-only caller may not hold; auth.uid() would also
  // resolve to null under the service-role connection, misattributing the
  // actor). The Auth password change and this insert are two separate API
  // calls against two different backend services (GoTrue vs PostgREST) -
  // they are NOT transactionally atomic, matching admin-create-user's own
  // documented non-atomicity with its employee-link step. A failure here
  // is surfaced, never hidden.
  const { error: auditError } = await adminClient
    .from("security_audit_log")
    .insert({
      organization_id: callerOrgId,
      event_type: "password_reset",
      actor_user_id: callerUser.id,
      target_user_id: userId,
      metadata: {},
    });

  return jsonResponse(
    {
      success: true,
      ...(auditError
        ? { auditLogError: `Password was reset, but the audit entry could not be recorded: ${auditError.message}` }
        : {}),
    },
    200,
  );
});
