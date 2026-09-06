-- Final cleanup for the Reset Password UI-reachability fix's QA pass.
-- Removes every override touched across this pass (settings.view,
-- users.view, users.reset_password, users.edit) for ewaybill-qa-test,
-- returning it to zero users.*/settings.* permissions - its exact
-- pre-test state.
delete from public.user_permission_overrides
where user_id = '351c06d1-9400-4f04-b679-64b077bdafda'::uuid
  and permission_id in (
    select id from public.permissions
    where (module, action) in (
      ('settings', 'view'),
      ('users', 'view'),
      ('users', 'reset_password'),
      ('users', 'edit')
    )
  );
