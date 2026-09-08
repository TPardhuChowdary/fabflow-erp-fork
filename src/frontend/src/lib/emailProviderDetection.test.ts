// Phase 9F — runnable check for the provider-detection/registry logic
// (ponytail: non-trivial branching logic gets one runnable check). No
// test framework is installed in this frontend (no vitest/jest) — run
// directly with a TS-capable runtime:
//   npx tsx src/lib/emailProviderDetection.test.ts
//
// Only the PURE parts are exercised here (detectProviderLocal,
// matchKnownProvider, getKnownProviderById) — detectProviderRemote's own
// body is a thin wrapper (one network call + the same matchKnownProvider
// already tested here), verified instead by tsc + code review, the same
// way extractGmailContent (pure) was unit-tested over listMessages
// (network-bound) in googleAdapter.test.ts.

import {
  type ProviderDetectionResult,
  detectProviderLocal,
} from "./emailProviderDetection";
import {
  KNOWN_PROVIDERS,
  getKnownProviderById,
  matchKnownProvider,
} from "./emailProviderRegistry";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`PASS: ${name}`);
  } else {
    fail++;
    console.log(`FAIL: ${name}`);
  }
}

// ── detectProviderLocal: consumer webmail domains ──────────────────────

for (const domain of ["gmail.com", "googlemail.com"]) {
  const result = detectProviderLocal(
    `user@${domain}`,
  ) as ProviderDetectionResult;
  check(
    `Gmail consumer domain ${domain} detected as google`,
    result?.provider === "google",
  );
  check(
    `${domain} carries a known IMAP/SMTP fallback (gmail)`,
    result?.knownProvider?.id === "gmail",
  );
}

for (const domain of ["outlook.com", "hotmail.com", "live.com", "msn.com"]) {
  const result = detectProviderLocal(
    `user@${domain}`,
  ) as ProviderDetectionResult;
  check(
    `Microsoft consumer domain ${domain} detected as microsoft`,
    result?.provider === "microsoft",
  );
  check(
    `${domain} carries a known IMAP/SMTP fallback (microsoft365)`,
    result?.knownProvider?.id === "microsoft365",
  );
}

check(
  "an unrecognized custom domain returns null from detectProviderLocal (must fall through to remote MX lookup)",
  detectProviderLocal("user@mycompany.com") === null,
);

// ── matchKnownProvider: simulates the real MX hosts email-detect-provider
// would return for each provider, proving the registry match still works
// end-to-end for a Google Workspace / Microsoft 365 CUSTOM domain (no
// consumer-domain shortcut involved here at all). ──────────────────────

check(
  "Google Workspace custom domain (real MX aspmx.l.google.com) matches the gmail registry entry",
  matchKnownProvider(["aspmx.l.google.com"])?.id === "gmail",
);
check(
  "Microsoft 365 custom domain (real MX ...mail.protection.outlook.com) matches the microsoft365 registry entry",
  matchKnownProvider(["mail-example-com.mail.protection.outlook.com"])?.id ===
    "microsoft365",
);

// ── Regression: existing Hostinger/Zoho behavior unchanged ─────────────

check(
  "Hostinger MX still matches the hostinger entry",
  matchKnownProvider(["mx1.hostinger.com"])?.id === "hostinger",
);
check(
  "Zoho MX still matches the zoho entry",
  matchKnownProvider(["mx.zoho.com"])?.id === "zoho",
);
const hostinger = KNOWN_PROVIDERS.find((p) => p.id === "hostinger");
check(
  "Hostinger config values are unchanged",
  hostinger?.config.imapHost === "imap.hostinger.com" &&
    hostinger?.config.imapPort === 993 &&
    hostinger?.config.smtpHost === "smtp.hostinger.com" &&
    hostinger?.config.smtpPort === 465,
);
const zoho = KNOWN_PROVIDERS.find((p) => p.id === "zoho");
check(
  "Zoho config values are unchanged",
  zoho?.config.imapHost === "imap.zoho.com" &&
    zoho?.config.smtpHost === "smtp.zoho.com",
);

// ── No silent guessing: an unmatched custom domain still falls back to
// manual configuration (null, never a fabricated provider). ────────────

check(
  "an unmatched custom domain's MX never resolves to any known provider",
  matchKnownProvider(["mx.some-random-custom-domain.example"]) === null,
);
check(
  "an empty MX list resolves to null, not a guess",
  matchKnownProvider([]) === null,
);
check(
  "an undefined MX list resolves to null, not a guess",
  matchKnownProvider(undefined) === null,
);

// ── New provider configs are correct and Gmail's credential caveat is
// explicit (never implies a normal password works). ────────────────────

const gmail = getKnownProviderById("gmail");
check(
  "Gmail known-provider config matches Google's real IMAP/SMTP endpoints",
  gmail?.config.imapHost === "imap.gmail.com" &&
    gmail?.config.imapPort === 993 &&
    gmail?.config.imapEncryption === "ssl" &&
    gmail?.config.smtpHost === "smtp.gmail.com" &&
    gmail?.config.smtpPort === 587 &&
    gmail?.config.smtpEncryption === "starttls",
);
check(
  "Gmail known-provider entry explicitly warns an App Password is required (never implies a normal password works)",
  typeof gmail?.credentialHint === "string" &&
    /app password/i.test(gmail.credentialHint),
);

const microsoft365 = getKnownProviderById("microsoft365");
check(
  "Microsoft 365 known-provider config matches Microsoft's real IMAP/SMTP endpoints",
  microsoft365?.config.imapHost === "outlook.office365.com" &&
    microsoft365?.config.imapPort === 993 &&
    microsoft365?.config.imapEncryption === "ssl" &&
    microsoft365?.config.smtpHost === "smtp.office365.com" &&
    microsoft365?.config.smtpPort === 587 &&
    microsoft365?.config.smtpEncryption === "starttls",
);

check(
  "getKnownProviderById returns null for an unknown id, never a guess",
  getKnownProviderById("does-not-exist") === null,
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
