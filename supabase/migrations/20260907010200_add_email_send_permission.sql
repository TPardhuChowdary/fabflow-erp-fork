-- Phase 5 Email Operations — outbound send permission.
--
-- NOT YET APPLIED — written for review, per explicit instruction not to
-- push/apply without approval.
--
-- Deliberately its own action, not folded into email's existing "edit" —
-- sending an email to a real external recipient is a materially more
-- consequential capability than editing connected-mailbox settings, the
-- same reasoning that already split job_cards.approve from job_cards.edit
-- and users.reset_password from users.edit in this codebase.
--
-- Seeded with ZERO role_permissions grants, matching the exact precedent
-- already set for email.view/create/edit/delete/sync and
-- users.reset_password/audit_log.view (see permissions.ts's own
-- comments): every is_admin=true role ("admin", "Admin") already
-- bypasses has_permission() entirely via its own short-circuit, so both
-- existing admin roles can use this immediately with no grant needed.
-- No non-admin role is granted send authority by default — do not
-- change that as part of applying this migration; assign it to a
-- specific role later via Settings -> Users only if and when that is
-- explicitly decided.
insert into public.permissions (module, action)
values ('email', 'send')
on conflict (module, action) do nothing;
