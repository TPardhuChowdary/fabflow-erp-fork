-- Phase 5 — Email Center Outbox. WRITTEN, NOT APPLIED (Section 11).
--
-- Discovered while writing the Outbox's SELECT policy: 'email'/'view' has
-- never existed as a row in public.permissions, even though both
-- email_messages_select AND (this phase's new) email_outbound_sends_select
-- reference has_permission('email','view'). Since has_permission() joins
-- permissions on (module, action), a nonexistent row means that check
-- can never pass for anyone except an is_admin role's own unconditional
-- bypass — Email Center's Inbox has been admin-only this entire time as
-- a result, silently, regardless of anyone's actual role_permissions or
-- overrides. Not a defect introduced by this phase; it predates it.
--
-- This migration only adds the missing catalog row so 'email view' is a
-- grantable permission at all — same zero-role-grants precedent as
-- every other sensitive permission in this app (see
-- 20260907010200_add_email_send_permission.sql and
-- 20260905153359_add_users_reset_password_permission.sql's own
-- comments). It changes nothing for any existing user: is_admin roles
-- already bypass every check regardless, and no role/user gets this
-- granted automatically. Assign it via Settings -> Users' permission
-- overrides only when a non-admin user should see the Inbox and/or
-- Outbox without also being able to send.
insert into public.permissions (module, action)
values ('email', 'view')
on conflict (module, action) do nothing;
