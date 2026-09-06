-- TEMPORARY QA SETUP — negative-path security test: users.view (+
-- settings.view) present, users.reset_password removed, users.edit still
-- absent. Confirms the Reset Password row action disappears when its own
-- permission is denied, independent of view/edit.
update public.user_permission_overrides
set allowed = false
where user_id = '351c06d1-9400-4f04-b679-64b077bdafda'::uuid
  and permission_id = (
    select id from public.permissions where module = 'users' and action = 'reset_password'
  );
