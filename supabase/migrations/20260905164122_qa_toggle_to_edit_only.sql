-- TEMPORARY QA SETUP — negative-path security test, second combination:
-- users.edit granted, users.reset_password remains denied. Confirms the
-- Edit User pencil appears and the Reset Password action stays absent -
-- the two controls are independently responsible for their own
-- permission, neither leaks into the other.
insert into public.user_permission_overrides (user_id, permission_id, allowed)
select
  '351c06d1-9400-4f04-b679-64b077bdafda'::uuid,
  p.id,
  true
from public.permissions p
where p.module = 'users' and p.action = 'edit'
on conflict (user_id, permission_id) do update set allowed = true;
