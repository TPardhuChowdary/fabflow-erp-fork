// FabFlow Email Integration — known-provider connection-settings registry.
//
// Single source of truth for "detected custom-domain provider → known
// IMAP/SMTP settings", so ConnectEmailAccountDialog.tsx never hardcodes a
// provider's server details itself. Matched against a domain's REAL MX
// records (from email-detect-provider's live DNS lookup, see
// emailProviderDetection.ts) — never assumed from the domain name alone,
// so a custom domain that merely looks like it could be on a given host is
// never silently misconfigured. A domain whose MX doesn't match anything
// here falls through to manual configuration, exactly as an unrecognized
// provider should (never guessed).
//
// Settings below are each provider's own publicly documented mail server
// endpoints. The Hostinger entry is additionally confirmed live: a real
// FabFlow mailbox (info@shanmukhasaiengineeringworks.com) connected
// successfully with exactly this imap/smtp configuration on 2026-09-01 —
// see the Phase 1B deployment report. The Zoho entry has not been
// live-tested against a real Zoho mailbox this session; if it ever proves
// wrong, worst case is a failed testConnection() and a fallback to
// "Advanced / Custom IMAP configuration", never a silent bad connection.
//
// Phase 9F — the gmail/microsoft365 entries are an IMAP/SMTP FALLBACK for
// when OAuth isn't used (Microsoft has no OAuth flow yet at all; Google's
// OAuth is preferred but a user may still want an app-password path).
// Their mxSuffixes are deliberately identical to the ones
// email-detect-provider/index.ts already uses to recognize "google"/
// "microsoft" — reusing matchKnownProvider() against those same suffixes
// is what lets emailProviderDetection.ts attach these without a second
// detection system (see that file's own comment).

import type { EmailEncryption } from "@/types";

export interface KnownProviderConfig {
  imapHost: string;
  imapPort: number;
  imapEncryption: EmailEncryption;
  smtpHost: string;
  smtpPort: number;
  smtpEncryption: EmailEncryption;
}

export interface KnownProviderEntry {
  id: string;
  label: string;
  /** Real MX hostname suffixes this provider's mail is served from —
   * matched case-insensitively as a suffix against the domain's actual MX
   * records, never against the domain name itself. */
  mxSuffixes: string[];
  config: KnownProviderConfig;
  /** Optional credential caveat shown instead of the generic "you only
   * need your mailbox password" copy — set when a provider's IMAP/SMTP
   * access genuinely doesn't accept the account's normal password (e.g.
   * Gmail requires an App Password once 2-Step Verification is on). */
  credentialHint?: string;
}

export const KNOWN_PROVIDERS: KnownProviderEntry[] = [
  {
    id: "hostinger",
    label: "Hostinger",
    mxSuffixes: ["hostinger.com"],
    config: {
      imapHost: "imap.hostinger.com",
      imapPort: 993,
      imapEncryption: "ssl",
      smtpHost: "smtp.hostinger.com",
      smtpPort: 465,
      smtpEncryption: "ssl",
    },
  },
  {
    id: "zoho",
    label: "Zoho Mail",
    mxSuffixes: ["zoho.com", "zohomail.com"],
    config: {
      imapHost: "imap.zoho.com",
      imapPort: 993,
      imapEncryption: "ssl",
      smtpHost: "smtp.zoho.com",
      smtpPort: 465,
      smtpEncryption: "ssl",
    },
  },
  {
    id: "gmail",
    label: "Gmail / Google Workspace",
    mxSuffixes: ["google.com", "googlemail.com"],
    config: {
      imapHost: "imap.gmail.com",
      imapPort: 993,
      imapEncryption: "ssl",
      smtpHost: "smtp.gmail.com",
      smtpPort: 587,
      smtpEncryption: "starttls",
    },
    credentialHint:
      "Gmail requires an App Password, not your normal Google password. Turn on 2-Step Verification, then generate one at myaccount.google.com/apppasswords.",
  },
  {
    id: "microsoft365",
    label: "Microsoft 365 / Outlook",
    mxSuffixes: ["outlook.com", "protection.outlook.com"],
    config: {
      imapHost: "outlook.office365.com",
      imapPort: 993,
      imapEncryption: "ssl",
      smtpHost: "smtp.office365.com",
      smtpPort: 587,
      smtpEncryption: "starttls",
    },
  },
];

/** Matches a domain's real MX hostnames against the registry. Returns null
 * (never a guess) when nothing matches confidently — callers must fall
 * back to manual configuration. */
export function matchKnownProvider(
  mxHosts: string[] | undefined,
): KnownProviderEntry | null {
  if (!mxHosts || mxHosts.length === 0) return null;
  const lower = mxHosts.map((h) => h.toLowerCase());
  return (
    KNOWN_PROVIDERS.find((p) =>
      lower.some((h) => p.mxSuffixes.some((s) => h.endsWith(s))),
    ) ?? null
  );
}

/** Looks up a registry entry by its own id — used for the two consumer-
 * webmail domains (gmail.com, outlook.com, ...) that detectProviderLocal
 * recognizes WITHOUT an MX lookup, so there are no real mxHosts to match
 * against yet. An exact hardcoded consumer-domain match is at least as
 * certain as an MX-suffix match, so attaching the config this way isn't a
 * weaker guess — it's the same registry, addressed the other way. */
export function getKnownProviderById(id: string): KnownProviderEntry | null {
  return KNOWN_PROVIDERS.find((p) => p.id === id) ?? null;
}
