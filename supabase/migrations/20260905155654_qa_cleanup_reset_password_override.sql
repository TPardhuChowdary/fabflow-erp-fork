-- Cleanup for 20260905154908_qa_grant_reset_password_override.sql — the
-- administrator password-reset feature's QA is complete; this removes the
-- one temporary override row it granted (ewaybill-qa-test's
-- users.reset_password = true), returning that account to zero users.*
-- permissions, exactly its state before this QA pass. Nothing else about
-- the account (username, role "accounts", organization, its own
-- unrelated invoices.edit=false override from the earlier E-Way Bill QA
-- pass, is_active) is touched.
delete from public.user_permission_overrides
where user_id = '351c06d1-9400-4f04-b679-64b077bdafda'::uuid
  and permission_id = (
    select id from public.permissions where module = 'users' and action = 'reset_password'
  );
