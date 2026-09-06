-- Post-audit cleanup, explicitly requested by the user: deactivate the
-- ewaybill-qa-test account (role "accounts") now that the password-reset
-- feature work and its final regression audit are both complete.
--
-- No live admin UI session was available in this environment to use the
-- normal Settings -> Users -> Deactivate control, so this is applied
-- directly here. It is NOT an RLS bypass: `trg_enforce_profile_activation_permission`
-- still fires on this UPDATE and takes its documented `auth.uid() IS NULL`
-- trusted-server-context carve-out (the same one admin-create-user and
-- admin-reset-password rely on for their own service-role writes) - the
-- resulting row state is identical to what the UI control would produce.
-- Reversible: flip is_active back to true (via the UI, once an admin
-- session is available) to reactivate.
update public.profiles
set is_active = false
where id = '351c06d1-9400-4f04-b679-64b077bdafda'::uuid;
