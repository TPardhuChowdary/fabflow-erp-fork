-- Cleanup for 20260905161312_qa_grant_view_and_reset_password.sql and
-- 20260905161647_qa_grant_settings_view.sql — final UI verification pass
-- is complete. Removes all three temporary overrides granted to
-- ewaybill-qa-test (users.view, users.reset_password, settings.view),
-- returning it to zero users.*/settings.* permissions - its state before
-- this pass, and (aside from its own current password/must_change_password
-- state from the lifecycle test) matching how it stood after the prior
-- QA round's cleanup.
delete from public.user_permission_overrides
where user_id = '351c06d1-9400-4f04-b679-64b077bdafda'::uuid
  and permission_id in (
    select id from public.permissions
    where (module, action) in (
      ('users', 'view'),
      ('users', 'reset_password'),
      ('settings', 'view')
    )
  );
