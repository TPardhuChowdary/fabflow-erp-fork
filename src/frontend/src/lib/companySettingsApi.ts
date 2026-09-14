// Company Settings (database/phase-60) — read layer, plus (below) the
// real read/write pair for the Settings page's own Company Profile
// section. The write function this file's original header said wasn't
// needed yet now is: Settings.tsx's "Save Company Profile" used to only
// call Zustand's updateSettings(), which writes to this browser's
// localStorage and nowhere else — confirmed root cause of company
// settings differing between devices/browsers for the same
// organization. No new table: company_settings is already a generic
// per-organization key/value store with a UNIQUE (organization_id,
// setting_key) constraint and RLS requiring has_permission('settings',
// 'view'|'edit') — exactly what one whole-profile row keyed
// "company_profile" needs, same shape getCompanySetting() below already
// reads narrower policy rows from.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { AppSettings } from "@/types";

/** Reads one company_settings row's value by key via a direct table
 * select. Gated by company_settings_select's RLS (has_permission
 * ('settings','view')) - correct for admin/Settings-page callers, but NOT
 * for the Worker-facing mobile Job Card flow, which needs
 * getEvidenceRequirements() below instead (see database/phase-63). Returns
 * undefined (not an error) if the row doesn't exist, isn't readable, or
 * Supabase isn't configured - callers fall back to a sensible default
 * rather than block on missing configuration, matching Phase 60's own
 * "ship configurable defaults" philosophy. */
export async function getCompanySetting(
  key: string,
): Promise<Record<string, unknown> | undefined> {
  if (!isSupabaseConfigured) return undefined;
  const client = getSupabase();
  const { data, error } = await client
    .from("company_settings")
    .select("setting_value")
    .eq("setting_key", key)
    .maybeSingle();
  if (error || !data) return undefined;
  return (data as { setting_value: Record<string, unknown> }).setting_value;
}

/** Database/phase-63 — narrow, read-only RPC that returns only the
 * evidence_requirements value, callable by any authenticated user
 * regardless of the settings permission module (unlike getCompanySetting
 * above, which a plain Worker cannot use since company_settings_select
 * requires settings.view). Confirmed live: a real Worker account could
 * complete a rejected job with no evidence photo because the plain-select
 * read was silently RLS-blocked and defaulted to "not required" - this
 * function exists specifically to close that gap without widening
 * company_settings RLS or granting Workers settings.view. Returns
 * undefined on any error/missing config, same non-blocking contract as
 * getCompanySetting. */
export async function getEvidenceRequirements(): Promise<
  Record<string, unknown> | undefined
> {
  if (!isSupabaseConfigured) return undefined;
  const client = getSupabase();
  const { data, error } = await client.rpc("get_evidence_requirements");
  if (error || !data) return undefined;
  return data as Record<string, unknown>;
}

// ── Company Profile (Settings page "Save Company Profile") ─────────────
// Deliberately just the genuinely organization-wide business-data subset
// of AppSettings — company identity, bank details, and the document
// footer text blocks. NOT included here, on purpose: Twilio/WhatsApp and
// Gmail SMTP credentials (sensitive secrets; this codebase already has a
// separate encrypted-credentials convention elsewhere for email, and
// mixing plaintext integration secrets into a jsonb column readable by
// anyone with settings.view is a step backward, not this fix's job) and
// aiAssistantName/voice settings (read more like a per-user/per-device
// preference than shared company data). Those keep behaving exactly as
// before — local Zustand + localStorage, unchanged by this file.
export type CompanyProfileSettings = Pick<
  AppSettings,
  | "companyName"
  | "companyAddress"
  | "companyGstin"
  | "companyStateName"
  | "companyStateCode"
  | "companyPhone"
  | "companyEmail"
  | "companyWebsite"
  | "companyLogo"
  | "bankName"
  | "accountName"
  | "accountNumber"
  | "ifscCode"
  | "bankBranch"
  | "companyTerms"
  | "companyDeclaration"
  | "quotationTerms"
  | "companyPOTerms"
>;

const COMPANY_PROFILE_KEY = "company_profile";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";
export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

async function requireSession() {
  if (!isSupabaseConfigured) {
    return {
      ok: false as const,
      result: { status: "error" as const, error: "Supabase is not configured" },
    };
  }
  const client = getSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) {
    return {
      ok: false as const,
      result: { status: "error" as const, error: error.message },
    };
  }
  if (!data.session) {
    return {
      ok: false as const,
      result: { status: "unauthenticated" as const },
    };
  }
  return { ok: true as const, client };
}

/** The authoritative read: this organization's Company Profile row, or
 * undefined if the org hasn't saved one yet (first-run — caller falls
 * back to defaultSettings, same contract as getCompanySetting above). */
export async function getCompanySettingsRemote(): Promise<
  WriteResult<CompanyProfileSettings | undefined>
> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("company_settings")
    .select("setting_value")
    .eq("setting_key", COMPANY_PROFILE_KEY)
    .maybeSingle();
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: data?.setting_value as CompanyProfileSettings | undefined,
  };
}

/** The authoritative write. Upserts on (organization_id, setting_key) —
 * organization_id is never sent by the client; it defaults to
 * current_organization_id() server-side (same trust boundary every other
 * table here uses), and the existing UNIQUE constraint plus this upsert
 * together guarantee exactly one company_profile row per organization,
 * first save or the hundredth. RLS (company_settings_insert/_update,
 * both requiring has_permission('settings','edit') AND organization_id =
 * current_organization_id()) is the real enforcement — the 42501 branch
 * below only turns that into a readable error instead of a thrown
 * exception; it is not a substitute permission check. */
export async function updateCompanySettingsRemote(
  settings: CompanyProfileSettings,
): Promise<WriteResult<CompanyProfileSettings>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data: userData } = await gate.client.auth.getUser();
  const { data, error } = await gate.client
    .from("company_settings")
    .upsert(
      {
        setting_key: COMPANY_PROFILE_KEY,
        setting_value: settings,
        updated_by: userData.user?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,setting_key" },
    )
    .select("setting_value")
    .maybeSingle();
  if (error) {
    if (error.code === "42501") {
      return {
        status: "denied",
        error: "You do not have permission to edit company settings.",
      };
    }
    return { status: "error", error: error.message };
  }
  if (!data) {
    return {
      status: "denied",
      error: "Company settings were not saved (blocked by permissions).",
    };
  }
  return {
    status: "success",
    data: data.setting_value as CompanyProfileSettings,
  };
}
