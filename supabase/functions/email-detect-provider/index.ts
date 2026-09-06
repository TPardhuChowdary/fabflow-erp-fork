// Universal Email Integration (see chat) — provider discovery for custom
// domains.
//
// Read-only, no database access, no credentials of any kind — the browser
// cannot resolve DNS itself, so this is a thin, stateless MX-lookup relay.
// Same auth-check shape as agent-chat/index.ts (real logged-in FabFlow
// user, never an open unauthenticated proxy) even though this endpoint
// touches no business data, for consistency and to prevent this becoming
// a free DNS-lookup proxy for anyone on the internet.

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

// Known MX hostname suffixes for Google Workspace / Microsoft 365 —
// matched case-insensitively as a suffix, since real-world MX records
// often have a numbered prefix (e.g. "aspmx2.googlemail.com" or
// "mail-companyname-com.mail.protection.outlook.com"). This list is
// deliberately short and specific rather than a guess-everything
// heuristic — anything not matched here honestly falls through to
// "generic" (never assumed to be a specific generic provider like
// Hostinger merely because it's custom).
const GOOGLE_MX_SUFFIXES = ["google.com", "googlemail.com"];
const MICROSOFT_MX_SUFFIXES = ["outlook.com", "protection.outlook.com"];

interface DetectionResult {
  provider: "google" | "microsoft" | "generic";
  reason: string;
  mxHosts?: string[];
}

async function detectFromMx(domain: string): Promise<DetectionResult> {
  let mxRecords: Deno.MXRecord[];
  try {
    mxRecords = await Deno.resolveDns(domain, "MX");
  } catch (err) {
    return {
      provider: "generic",
      reason: `Could not resolve mail servers for ${domain}: ${
        err instanceof Error ? err.message : "DNS lookup failed"
      }. Connect using IMAP/SMTP.`,
    };
  }
  const mxHosts = mxRecords
    .map((r) => r.exchange.toLowerCase().replace(/\.$/, ""))
    .sort();
  if (mxHosts.length === 0) {
    return {
      provider: "generic",
      reason: `${domain} has no mail servers configured (no MX record found).`,
      mxHosts,
    };
  }
  if (mxHosts.some((h) => GOOGLE_MX_SUFFIXES.some((s) => h.endsWith(s)))) {
    return {
      provider: "google",
      reason: `${domain}'s mail servers (${mxHosts[0]}) are Google Workspace.`,
      mxHosts,
    };
  }
  if (mxHosts.some((h) => MICROSOFT_MX_SUFFIXES.some((s) => h.endsWith(s)))) {
    return {
      provider: "microsoft",
      reason: `${domain}'s mail servers (${mxHosts[0]}) are Microsoft 365.`,
      mxHosts,
    };
  }
  return {
    provider: "generic",
    reason: `${domain}'s mail servers (${mxHosts[0]}) don't match a known OAuth provider — connect using IMAP/SMTP.`,
    mxHosts,
  };
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
  if (!SUPABASE_URL || !ANON_KEY) {
    return jsonResponse({ error: "Server misconfigured: missing Supabase environment." }, 500);
  }
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing Authorization header." }, 401);
  }
  const authCheck = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: ANON_KEY },
  });
  if (!authCheck.ok) {
    return jsonResponse({ error: "Not authenticated." }, 401);
  }

  let body: { domain?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }
  const domain = body.domain?.trim().toLowerCase();
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    return jsonResponse({ error: "A valid domain is required." }, 400);
  }

  const result = await detectFromMx(domain);
  return jsonResponse(result, 200);
}
