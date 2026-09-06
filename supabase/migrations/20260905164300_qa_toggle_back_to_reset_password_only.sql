-- TEMPORARY QA SETUP — revert to the primary positive-path state
-- (users.reset_password = true, users.edit = false) for the mobile
-- viewport check of the actual Reset Password control.
update public.user_permission_overrides
set allowed = true
where user_id = '351c06d1-9400-4f04-b679-64b077bdafda'::uuid
  and permission_id = (
    select id from public.permissions where module = 'users' and action = 'reset_password'
  );

update public.user_permission_overrides
set allowed = false
where user_id = '351c06d1-9400-4f04-b679-64b077bdafda'::uuid
  and permission_id = (
    select id from public.permissions where module = 'users' and action = 'edit'
  );
