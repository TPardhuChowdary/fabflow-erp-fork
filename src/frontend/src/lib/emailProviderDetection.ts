// Universal Email Integration (see chat) — provider detection.
//
// Three tiers:
//   1. A free, instant, client-side lookup table for the handful of
//      domains that are unambiguously Google or Microsoft consumer
//      webmail (gmail.com, outlook.com, ...) — no network call needed.
//   2. For everything else (any custom business domain), the browser
//      cannot resolve DNS/MX records itself, so detectProviderRemote()
//      calls the read-only "email-detect-provider" Edge Function, which
//      does the real MX lookup server-side and pattern-matches known
//      Google Workspace / Microsoft 365 MX hosts.
//   3. When the MX lookup doesn't match Google/Microsoft either, the real
//      MX hostnames are matched against emailProviderRegistry.ts's known
//      custom-provider registry (Hostinger, Zoho, ...) — if matched, that
//      provider's known IMAP/SMTP settings are attached so the user never
//      has to type them in. Only a domain matching NEITHER tier falls
//      through to a bare "generic" result with the real MX hostname shown
//      and manual configuration required — never a guess (e.g. never
//      assuming Hostinger merely because a domain is custom).

import {
  type KnownProviderEntry,
  getKnownProviderById,
  matchKnownProvider,
} from "@/lib/emailProviderRegistry";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { EmailProvider } from "@/types";

export interface ProviderDetectionResult {
  provider: EmailProvider | "generic";
  /** Human-readable reason, shown to the user so detection never feels
   * like an opaque guess — e.g. "Matched known Google Workspace mail
   * servers (aspmx.l.google.com)" or "No known provider's mail servers
   * matched — connect using IMAP/SMTP". */
  reason: string;
  /** The domain's actual MX hostnames, when a lookup was performed —
   * shown in the "Configure manually" UI for transparency even on a
   * generic-provider result. */
  mxHosts?: string[];
  /** Set when the domain's real MX records matched a known custom
   * provider in the registry (Hostinger, Zoho, ...) — carries that
   * provider's label and ready-to-use IMAP/SMTP settings, so the connect
   * dialog can skip asking the user for server details entirely. */
  knownProvider?: KnownProviderEntry;
}

const GOOGLE_CONSUMER_DOMAINS = new Set(["gmail.com", "googlemail.com"]);
const MICROSOFT_CONSUMER_DOMAINS = new Set([
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
]);

/** Instant, offline, zero-network-call detection for the unambiguous
 * consumer-webmail domains. Returns null for anything else (including
 * every custom business domain) — the caller must fall back to
 * detectProviderRemote() for those. */
export function detectProviderLocal(
  emailAddress: string,
): ProviderDetectionResult | null {
  const domain = emailAddress.split("@")[1]?.toLowerCase().trim();
  if (!domain) return null;
  if (GOOGLE_CONSUMER_DOMAINS.has(domain)) {
    return {
      provider: "google",
      reason: `${domain} is a Google consumer webmail domain.`,
      // Phase 9F — OAuth is preferred for Google, but attaching the known
      // IMAP/SMTP fallback here too means "Configure manually" never
      // dead-ends in a blank form when a user needs an app-password path
      // instead. No MX lookup happened for this exact-domain match, but
      // an exact consumer-domain match is at least as certain as one.
      knownProvider: getKnownProviderById("gmail") ?? undefined,
    };
  }
  if (MICROSOFT_CONSUMER_DOMAINS.has(domain)) {
    return {
      provider: "microsoft",
      reason: `${domain} is a Microsoft consumer webmail domain.`,
      knownProvider: getKnownProviderById("microsoft365") ?? undefined,
    };
  }
  return null;
}

/** Custom-domain detection via the email-detect-provider Edge Function's
 * real MX lookup. Never throws — a network/DNS failure resolves to a
 * "generic" result with the failure reason shown, so the user always has
 * the manual IMAP/SMTP fallback available rather than being stuck. */
export async function detectProviderRemote(
  emailAddress: string,
): Promise<ProviderDetectionResult> {
  const domain = emailAddress.split("@")[1]?.toLowerCase().trim();
  if (!domain) {
    return { provider: "generic", reason: "Not a valid email address." };
  }
  if (!isSupabaseConfigured) {
    return {
      provider: "generic",
      reason: "Provider detection is unavailable in this environment.",
    };
  }
  const supabase = getSupabase();
  const { data, error } =
    await supabase.functions.invoke<ProviderDetectionResult>(
      "email-detect-provider",
      { body: { domain } },
    );
  if (error || !data) {
    return {
      provider: "generic",
      reason:
        "Could not look up this domain's mail servers — connect using IMAP/SMTP.",
    };
  }
  // The Edge Function only ever knows Google/Microsoft — matching against
  // the rest of the known-provider registry happens here, client-side,
  // against the REAL mxHosts it returned (never against the domain name),
  // so adding a new known provider never requires redeploying the MX
  // lookup function itself.
  //
  // Phase 9F — this match is attempted regardless of whether the Edge
  // Function itself recognized the provider as "google"/"microsoft" (an
  // OAuth candidate) or left it "generic": the SAME real mxHosts that made
  // it "google"/"microsoft" also match the registry's gmail/microsoft365
  // entries (identical suffixes, see emailProviderRegistry.ts), so a
  // Google/Microsoft custom domain gets a ready IMAP/SMTP fallback
  // alongside its detected provider, never a blank manual form.
  const known = matchKnownProvider(data.mxHosts);
  if (known && data.provider === "generic") {
    return {
      provider: "generic",
      reason: `${domain}'s mail servers (${data.mxHosts?.[0]}) match ${known.label} — using its known settings automatically.`,
      mxHosts: data.mxHosts,
      knownProvider: known,
    };
  }
  if (known) {
    return { ...data, knownProvider: known };
  }
  return data;
}

export const DEFAULT_IMAP_PORTS: Record<EmailEncryptionGuess, number> = {
  ssl: 993,
  starttls: 143,
  none: 143,
};
export const DEFAULT_SMTP_PORTS: Record<EmailEncryptionGuess, number> = {
  ssl: 465,
  starttls: 587,
  none: 25,
};
type EmailEncryptionGuess = "ssl" | "starttls" | "none";
