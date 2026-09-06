-- Phase 63 (Employee Job Card Mobile Workflow — evidence-policy RLS fix) —
-- confirmed live defect: MyJobs.tsx's CompleteJobDialog reads
-- company_settings.evidence_requirements via getCompanySetting(), a plain
-- table select gated by company_settings_select's RLS, which requires
-- has_permission('settings','view'). A real Worker account (testemployee,
-- holding job_cards.view/edit but no settings grant) was live-tested
-- completing a job with rejected_qty > 0 and NO evidence photo while the
-- live config had quality_rejection:true — the read was silently blocked
-- by RLS, getCompanySetting() returned undefined (its own documented
-- "never blocks" fallback), so evidencePolicy stayed {} and the
-- evidence-required guard evaluated false. Confirmed this affects every
-- account without settings.view, i.e. exactly the shop-floor-worker
-- population the rule exists to govern — admin sessions never surfaced
-- it because is_admin bypasses has_permission entirely.
--
-- This migration does NOT touch that finding's root RLS policy. Per
-- explicit instruction: do not widen company_settings SELECT RLS, do not
-- grant Workers settings.view, do not expose the rest of company_settings.
-- Instead: one narrow, read-only SECURITY DEFINER function that returns
-- exactly the evidence_requirements value for the caller's own
-- organization - nothing else in company_settings is reachable through
-- it. Organization is derived from current_organization_id() (itself
-- SECURITY DEFINER, reads auth.uid()->profiles.organization_id) exactly
-- like every other org-scoped function in this schema - never a
-- client-supplied organization id, so a caller can only ever read their
-- own organization's value regardless of what they pass (this function
-- takes no parameters at all, which is the strongest form of that
-- guarantee).
--
-- Matches this project's existing SECURITY DEFINER conventions exactly:
-- STABLE (pure read, no side effects), SET search_path = public (same as
-- has_permission/current_organization_id), explicit
-- "revoke all ... from public; grant execute ... to authenticated;" (same
-- pattern as Phase 45's upsert_project_production_stages) rather than
-- relying on default PUBLIC execute privileges.
--
-- company_settings itself, its RLS, and the settings permission module
-- are completely unchanged by this migration - admin/settings.view access
-- to the full table works exactly as before. The frontend change (a new
-- getEvidenceRequirements() in companySettingsApi.ts calling this RPC,
-- used only by MyJobs.tsx) ships alongside this migration but is not part
-- of it.

begin;

create or replace function public.get_evidence_requirements()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select setting_value
  from public.company_settings
  where organization_id = current_organization_id()
    and setting_key = 'evidence_requirements';
$$;

comment on function public.get_evidence_requirements() is
  'Employee Job Card Mobile Workflow (Phase 62/63) - narrow, read-only accessor for exactly the evidence_requirements company_settings value, callable by any authenticated user regardless of the settings permission module. Exists because company_settings is settings.view-gated (an admin configuration screen), but the Worker-facing mobile Job Card completion flow also needs to read this one specific policy to correctly enforce photo-evidence requirements - a Worker legitimately needs to know the rule despite never being expected to hold settings.view. Organization is derived from current_organization_id() (the caller''s own auth.uid()), never a client-supplied id, and no parameter accepts one - a caller can only ever read their own organization''s value. Returns null if the key/row does not exist for that organization; callers already treat a missing/null result as "not required" (Phase 62''s own documented default). Exposes nothing else in company_settings - no other key, no write path.';

revoke all on function public.get_evidence_requirements() from public;
grant execute on function public.get_evidence_requirements() to authenticated;

insert into public.schema_migrations (version, description, checksum)
values (
  '20260905_063_phase63_evidence_requirements_reader',
  'Fixes a confirmed live defect found during the real-worker Job Card acceptance test: a Worker account with job_cards.edit but no settings.view could complete a rejected job with no evidence photo, because getCompanySetting() reading company_settings.evidence_requirements was silently RLS-blocked and defaulted to "not required" for exactly the population the rule is meant to govern. Adds one narrow, read-only, SECURITY DEFINER function (get_evidence_requirements) that returns only that one setting value, scoped to the caller''s own organization via current_organization_id() - never a client-supplied org id - with no changes to company_settings RLS, no settings permission grants to any role, and no other company_settings key exposed. Matches existing SECURITY DEFINER conventions (has_permission, current_organization_id, upsert_project_production_stages): STABLE, SET search_path = public, explicit revoke-from-public then grant-to-authenticated rather than default PUBLIC execute.',
  'phase63-v1'
)
on conflict (version) do nothing;

commit;
