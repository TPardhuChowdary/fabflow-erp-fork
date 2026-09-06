-- TEMPORARY QA SETUP — password-reset UI verification (final pass).
--
-- Grants ewaybill-qa-test exactly two overrides: users.view = true,
-- users.reset_password = true. Explicitly NOT granting users.edit —
-- the user was asked and declined, after being told this means the Edit
-- User dialog (the Reset Password control's only current entry point,
-- gated on users.edit at the row-level pencil icon, Settings.tsx:2743)
-- will be unreachable. This migration exists to empirically confirm that
-- exact blocker live (Users list reachable, edit pencil absent), not to
-- work around it.
insert into public.user_permission_overrides (user_id, permission_id, allowed)
select
  '351c06d1-9400-4f04-b679-64b077bdafda'::uuid,
  p.id,
  true
from public.permissions p
where (p.module, p.action) in (('users','view'), ('users','reset_password'))
on conflict (user_id, permission_id) do update set allowed = true;
