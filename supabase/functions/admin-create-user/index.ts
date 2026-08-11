// FabFlow ERP — Priority 1 (Real Supabase Multi-User Authentication)
//
// Privileged, server-side-only user creation. This is the ONE place the
// service_role key is ever used for this feature — it never reaches the
// browser (see the explicit rule in src/frontend/src/lib/supabaseClient.ts).
//
// Callable only via `supabase.functions.invoke("admin-create-user", ...)`
// from an already-signed-in FabFlow session; supabase-js forwards the
// caller's own access token in the Authorization header automatically.
//
// Authorization is re-checked HERE, server-side, against the caller's own
// JWT via has_permission('users','create') — never trusted from the
// request body. A caller without that permission gets 403 regardless of
// what the request claims.
//
// Users sign in with a plain username (Priority 1 decision, approved).
// Supabase Auth requires an email, so one is synthesized as
// `${username}@users.fabflow.local` purely as an internal identifier —
// never shown to the user, never used for actual mail delivery.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SYNTHETIC_EMAIL_DOMAIN = "users.fabflow.local";
// Both naming tracks are real rows in public.roles
// (phase1_auth_permissions_rls_v5_FINAL.sql section 5): the new RBAC-style
// names used by Settings -> Users, and the legacy capitalized names that
// are also the only options in the Employees -> New Employee "Role"
// dropdown (Employees.tsx). This function is now the single provisioning
// path for both callers, so it must accept whichever set the caller uses
// rather than forcing Employees.tsx to invent a translation between two
// role vocabularies that already coexist as-is in the database.
const ALLOWED_ROLES = [
  "admin",
  "sales",
  "procurement",
  "production",
  "quality",
  "dispatch",
  "accounts",
  "employee",
  "Admin",
  "Accountant",
  "Designer",
  "Worker",
] as const;

interface CreateUserRequest {
  username: string;
  password: string;
  role: string;
  /** Optional: an existing employees.id (same organization only) to link
   * via profiles.employee_id — the 1:1 FK reserved by Phase 1 and
   * completed by Phase 2 (profiles_employee_id_fkey), never previously
   * populated by any code path. Only set from Employees.tsx's "New
   * Employee" flow; Settings -> Users' generic user creation omits it. */
  employeeId?: string;
}

// Every request from the browser SDK (supabase.functions.invoke) is a
// cross-origin fetch to *.supabase.co, so the browser sends a CORS
// preflight OPTIONS request first and then requires
// Access-Control-Allow-Origin on the real response - without both, the
// fetch fails before this function's own logic ever runs, regardless of
// whether that logic is correct. Origin is deliberately "*" (no cookies/
// credentials are used; the only credential is the Bearer token in the
// Authorization header, which CORS doesn't gate).
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

function isValidUsername(username: string): boolean {
  // Same characters PostgREST/Postgres identifiers and email local-parts
  // both tolerate cleanly; keeps the synthetic email well-formed.
  return /^[a-zA-Z0-9._-]{3,32}$/.test(username);
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

  let body: CreateUserRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const username = (body.username || "").trim();
  const password = body.password || "";
  const role = body.role || "";
  const employeeId = (body.employeeId || "").trim() || null;
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (employeeId && !UUID_RE.test(employeeId)) {
    return jsonResponse({ error: "employeeId must be a valid UUID." }, 400);
  }

  if (!isValidUsername(username)) {
    return jsonResponse(
      {
        error:
          "Username must be 3-32 characters: letters, numbers, dot, underscore, or hyphen only.",
      },
      400,
    );
  }
  if (password.length < 8) {
    return jsonResponse(
      { error: "Password must be at least 8 characters." },
      400,
    );
  }
  if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
    return jsonResponse(
      { error: `Role must be one of: ${ALLOWED_ROLES.join(", ")}` },
      400,
    );
  }

  // Client scoped to the CALLER's own identity — RLS/has_permission()
  // evaluate exactly as they would for any normal request from this user.
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

  const { data: canCreate, error: permError } = await callerClient.rpc(
    "has_permission",
    { p_module: "users", p_action: "create" },
  );
  if (permError) {
    return jsonResponse(
      { error: `Permission check failed: ${permError.message}` },
      500,
    );
  }
  if (!canCreate) {
    return jsonResponse(
      { error: "You do not have permission to create users." },
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

  // Service-role client — the only client in this whole app allowed to
  // exist with this key, and only here, only after the check above.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Pre-check username uniqueness so a duplicate fails cleanly instead of
  // leaving a partially-created auth.users row behind.
  const { data: existing, error: existingError } = await adminClient
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (existingError) {
    return jsonResponse(
      { error: `Uniqueness check failed: ${existingError.message}` },
      500,
    );
  }
  if (existing) {
    return jsonResponse({ error: "Username already taken." }, 409);
  }

  // Lowercased so a login attempt with different casing of the same
  // username still resolves to the same email. Kept in sync with
  // usernameToEmail() in src/frontend/src/lib/supabaseAuth.ts — do not
  // let these two drift apart.
  const email = `${username.toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`;

  const { data: created, error: createError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username,
        role,
        organization_id: callerOrgId,
        created_by: callerUser.id,
        must_change_password: true,
      },
    });

  if (createError || !created?.user) {
    return jsonResponse(
      {
        error: `User creation failed: ${createError?.message ?? "unknown error"}`,
      },
      500,
    );
  }

  // Optional: link this new profile to an existing employees row
  // (profiles.employee_id, the 1:1 FK reserved by Phase 1 / completed by
  // Phase 2 — profiles_employee_id_fkey — never previously populated by
  // any code path). Only ever set from Employees.tsx's "New Employee"
  // flow. The auth account has already been created successfully by this
  // point, so a failure here is reported back but does NOT fail the
  // whole request — there is no clean rollback of a real auth.users row,
  // and an unlinked-but-real account is a better failure mode than a
  // silently-orphaned one.
  let employeeLinkError: string | undefined;
  if (employeeId) {
    const { data: employeeRow, error: employeeLookupError } = await adminClient
      .from("employees")
      .select("id")
      .eq("id", employeeId)
      .eq("organization_id", callerOrgId)
      .maybeSingle();
    if (employeeLookupError) {
      employeeLinkError = `Employee lookup failed: ${employeeLookupError.message}`;
    } else if (!employeeRow) {
      employeeLinkError =
        "employeeId did not match an employee in your organization — account created without the employee link.";
    } else {
      const { error: linkError } = await adminClient
        .from("profiles")
        .update({ employee_id: employeeId })
        .eq("id", created.user.id);
      if (linkError)
        employeeLinkError = `Employee link failed: ${linkError.message}`;
    }
  }

  // Password is deliberately never included in the response.
  return jsonResponse(
    { id: created.user.id, username, employeeLinkError },
    201,
  );
});
