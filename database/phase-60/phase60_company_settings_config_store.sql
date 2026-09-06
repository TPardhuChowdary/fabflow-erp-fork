-- Phase 60 (Master Monster Prompt, Phase 30 + your "ship configurable
-- defaults" decision) — company_settings: the Supabase-backed
-- configuration store the rest of the performance/attendance/rewards
-- work reads from, instead of hard-coding company policy into React.
--
-- Confirmed via live audit: no such table exists today. The only
-- existing "settings" concept is AppSettings, a client-side Zustand
-- blob that no backend logic reads (same dead-end pattern already
-- flagged for the old Gmail/Twilio settings) - Phase 30's core
-- requirement ("store configuration in Supabase, not React") has zero
-- foundation to build on before this.
--
-- Deliberately a small, generic key/value(jsonb) store rather than one
-- bespoke table per rule category. The Master Monster Prompt's own
-- Phase 30 "rule engine" wishlist (trigger/condition/calculation/
-- points/etc as a full interpreted DSL) is speculative until a concrete
-- rule needs that generality - building it now would be inventing
-- structure nobody has actually asked for yet. This table is the
-- pragmatic middle ground: every number the prompt itself labels "an
-- example only, must be configurable" (quality-adjustment factors,
-- performance weights, incentive thresholds, attendance policy,
-- extra-work gaming rule) lives here as one jsonb row per setting per
-- organization, editable by an admin through Settings without a
-- migration, and read by application/calculation logic instead of a
-- literal in a .tsx file. If a genuinely generic rule engine is needed
-- later, this table is exactly what it would sit on top of.
--
-- Reuses the EXISTING 'settings' permission module (view/edit) - no new
-- permission rows needed, matching "reuse existing patterns."
--
-- Seed values below are copied verbatim from the numbers the Master
-- Monster Prompt itself gave as examples (Phases 13/20/22/23) - per
-- your "ship as admin-editable configuration defaulting to the
-- prompt's own example values" decision. They are a starting point,
-- not a claim about your actual company policy - change them any time
-- via Settings once that UI exists, no migration required.

begin;

create table if not exists public.company_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id()
    references public.organizations(id),
  setting_key text not null,
  setting_value jsonb not null,
  description text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, setting_key)
);

create index if not exists idx_company_settings_org_id
  on public.company_settings(organization_id);

alter table public.company_settings enable row level security;

drop policy if exists company_settings_select on public.company_settings;
create policy company_settings_select on public.company_settings
  for select using (
    has_permission('settings', 'view')
    and organization_id = current_organization_id()
  );
drop policy if exists company_settings_insert on public.company_settings;
create policy company_settings_insert on public.company_settings
  for insert with check (
    has_permission('settings', 'edit')
    and organization_id = current_organization_id()
  );
drop policy if exists company_settings_update on public.company_settings;
create policy company_settings_update on public.company_settings
  for update using (
    has_permission('settings', 'edit')
    and organization_id = current_organization_id()
  );
drop policy if exists company_settings_delete on public.company_settings;
create policy company_settings_delete on public.company_settings
  for delete using (
    has_permission('settings', 'edit')
    and organization_id = current_organization_id()
  );

-- Seed one row per existing organization per setting - works regardless
-- of how many organizations exist today, not hardcoded to one org id.
insert into public.company_settings (organization_id, setting_key, setting_value, description)
select
  o.id,
  s.setting_key,
  s.setting_value,
  s.description
from public.organizations o
cross join (
  values
    (
      'attendance_policy',
      '{"shift_start":"09:00","shift_end":"18:00","grace_period_minutes":10,"late_threshold_minutes":15,"half_day_threshold_hours":4,"overtime_after_hours":9,"break_minutes_standard":60}'::jsonb,
      'Shift timing, grace period, and thresholds used to derive late/half-day/overtime from raw attendance_events (Master Monster Prompt Phase 13 example values).'
    ),
    (
      'quality_adjustment_factors',
      '{"first_pass_accepted":1.0,"minor_rework":0.75,"significant_rework":0.25,"rejected":0.0}'::jsonb,
      'Multiplier applied to a produced unit''s credit based on its quality outcome, when computing quality-adjusted performance (Phase 20 example values).'
    ),
    (
      'performance_weights',
      '{"productivity":0.40,"quality":0.30,"reliability_attendance":0.15,"process_discipline":0.15}'::jsonb,
      'How the four performance components combine into one overall score. Must sum to 1.0 (Phase 22 example weighting).'
    ),
    (
      'incentive_thresholds',
      '[{"min_score":95,"max_score":100,"tier":"maximum"},{"min_score":90,"max_score":94.99,"tier":"high"},{"min_score":80,"max_score":89.99,"tier":"moderate"},{"min_score":70,"max_score":79.99,"tier":"low"},{"min_score":0,"max_score":69.99,"tier":"review"}]'::jsonb,
      'Overall-score bands mapped to an incentive tier (Phase 23 example bands). The actual amount/action per tier is a separate company decision, not encoded here.'
    ),
    (
      'extra_work_policy',
      '{"require_assigned_complete_or_excepted":true}'::jsonb,
      'Anti-gaming rule (Phase 19/31): an employee''s assigned workload must be fully completed or covered by an approved exception before any additional job card can count toward extra-work incentives.'
    )
) as s(setting_key, setting_value, description)
on conflict (organization_id, setting_key) do nothing;

insert into public.schema_migrations (version, description, checksum)
values (
  '20260903_060_phase60_company_settings_config_store',
  'Master Monster Prompt Phase 30 (per your "ship configurable defaults" decision): new company_settings key/value(jsonb) config store, org-scoped, reusing the existing settings permission module (view/edit, no new permission rows). Seeded per existing organization with attendance_policy, quality_adjustment_factors, performance_weights, incentive_thresholds, and extra_work_policy - all copied verbatim from the example values the Master Monster Prompt itself supplied, admin-editable later without a migration. Deliberately a generic config store rather than a full trigger/condition/calculation rule-engine DSL, which remains speculative until a concrete rule needs that generality.',
  'phase60-mmp-v1'
)
on conflict (version) do nothing;

commit;
