// Company Settings (database/phase-60) — read layer. Read-only: this
// phase only needs to CHECK configured policy (evidence requirements),
// never edit it - no Settings UI exists yet to write these, so a write
// function isn't added speculatively (YAGNI; add it when that UI is
// built). RLS already scopes every row to the caller's own organization,
// so no explicit org filter is needed here.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";

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
