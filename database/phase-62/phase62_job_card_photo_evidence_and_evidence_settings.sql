-- Phase 62 (Employee Job Card Mobile Workflow) — two small, additive
-- prerequisites confirmed necessary by a live schema audit before
-- writing any frontend code:
--
-- 1. asset_photos does not yet support job_card as an owner_type.
--    Confirmed live: asset_photos_owner_type_check only allows
--    'machine'/'die'/'tool'/'inventory_item', and has_asset_permission()
--    is a CASE statement with no 'job_card' branch (falls through to
--    `else false`, meaning even an admin would be silently denied - not
--    an oversight-proof default, a real gap). Both are widened here, in
--    exactly the same shape as every previous widening of this pattern
--    (Phase 51's original design, Phase 61's dies_status_check). No new
--    table, no new component - the existing AssetPhotoGallery component
--    and assetPhotosApi.ts work unmodified once these two objects allow
--    'job_card'.
--
-- 2. company_settings has no evidence-requirement configuration yet.
--    Confirmed live: Phase 60 seeded attendance_policy/
--    quality_adjustment_factors/performance_weights/
--    incentive_thresholds/extra_work_policy only. Per the standing rule
--    that evidence requirements must be configurable, not hardcoded,
--    this adds one more seeded key (per existing organization, same
--    "ship the example values as an editable starting point" pattern
--    Phase 60 already established) rather than a hardcoded constant in
--    the mobile workflow's code.

begin;

alter table public.asset_photos drop constraint if exists asset_photos_owner_type_check;
alter table public.asset_photos add constraint asset_photos_owner_type_check
  check (owner_type = any (array['machine', 'die', 'tool', 'inventory_item', 'job_card']));

create or replace function public.has_asset_permission(p_asset_type text, p_action text)
returns boolean
language sql
stable
as $function$
  select case p_asset_type
    when 'machine'        then has_permission('machinery', p_action)
    when 'die'             then has_permission('tooling_dies', p_action)
    when 'tool'             then has_permission('tools', p_action)
    when 'inventory_item'  then has_permission('inventory', p_action)
    when 'job_card'         then has_permission('job_cards', p_action)
    else false
  end;
$function$;

insert into public.company_settings (organization_id, setting_key, setting_value, description)
select
  o.id,
  'evidence_requirements',
  '{"job_card_completion":false,"quality_rejection":true,"first_piece_inspection":true,"special_tooling_completion":true,"maintenance_completion":true}'::jsonb,
  'Whether a photo is required before a Job Card can be submitted, per context. Example values from the original workflow spec - edit via Settings, no migration required.'
from public.organizations o
on conflict (organization_id, setting_key) do nothing;

insert into public.schema_migrations (version, description, checksum)
values (
  '20260905_062_phase62_job_card_photo_evidence_and_evidence_settings',
  'Employee Job Card Mobile Workflow prerequisites: widens asset_photos_owner_type_check and has_asset_permission() to support job_card as an owner type (reuses the existing AssetPhotoGallery component/assetPhotosApi.ts unmodified - no new photo subsystem), and seeds a new evidence_requirements key into company_settings (per organization, on conflict do nothing) so evidence rules are configurable rather than hardcoded in the workflow.',
  'phase62-v1'
)
on conflict (version) do nothing;

commit;
