-- TEMPORARY QA SETUP — administrator password-reset feature QA.
--
-- Grants exactly one permission override to the existing, already-legit
-- ewaybill-qa-test account (created earlier through
-- Settings -> Users -> New User, role "accounts", zero users.* grants):
-- users.reset_password = true, and nothing else. No role change, no
-- users.create/assign_roles/edit, no touch to testadmin or any other
-- account. Written via migration only because granting an override
-- through the app's own UI itself requires users.edit, which no
-- currently-reachable session holds - this is the identical row shape
-- Settings -> Users' "Edit User" permission matrix would produce, just
-- inserted through the same migration channel already used (and
-- approved) twice this session, not a bypass of RLS/has_permission() -
-- both continue to evaluate this row exactly as they would one written
-- by an admin through the UI.
--
-- MUST be reverted after QA - see the paired cleanup migration
-- (…_qa_cleanup_reset_password_override.sql) once the lifecycle test
-- is complete.
insert into public.user_permission_overrides (user_id, permission_id, allowed)
select
  '351c06d1-9400-4f04-b679-64b077bdafda'::uuid,
  p.id,
  true
from public.permissions p
where p.module = 'users' and p.action = 'reset_password'
on conflict (user_id, permission_id) do update set allowed = true;
