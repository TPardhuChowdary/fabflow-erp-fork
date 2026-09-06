-- TEMPORARY QA SETUP — verifying the new independent Reset Password UI
-- entry point (row-level action, separate from the users.edit-gated
-- pencil icon). Grants ewaybill-qa-test exactly the three permissions
-- needed to reach it: settings.view, users.view, users.reset_password.
-- Explicitly NOT users.edit - the entire point of this pass is proving
-- the new action works and the edit-pencil stays absent without it.
insert into public.user_permission_overrides (user_id, permission_id, allowed)
select
  '351c06d1-9400-4f04-b679-64b077bdafda'::uuid,
  p.id,
  true
from public.permissions p
where (p.module, p.action) in (
  ('settings', 'view'),
  ('users', 'view'),
  ('users', 'reset_password')
)
on conflict (user_id, permission_id) do update set allowed = true;
