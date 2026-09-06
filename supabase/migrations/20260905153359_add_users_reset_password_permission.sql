-- Administrator password-reset workflow — adds the one permission the new
-- admin-reset-password Edge Function checks server-side
-- (has_permission('users','reset_password')). Additive only: no RLS
-- policy, no table, no column changes.
--
-- Deliberately seeded with ZERO role_permissions grants, matching the
-- exact precedent already set for this app's other sensitive users.*
-- actions (users.activate / users.deactivate / audit_log.view — see
-- permissions.ts's own comments). Every role with is_admin=true ("admin",
-- "Admin") already bypasses has_permission() entirely via its own
-- short-circuit, so both existing admin roles can use this immediately
-- with no grant needed; no other role is administrative enough today to
-- warrant a default grant of "can take over any user's login" — that's a
-- deliberate, narrower judgment than "edit", consistent with why
-- activate/deactivate were split out from edit in the first place. Assign
-- it to a specific non-admin role later via Settings -> Users' permission
-- overrides if a narrower "help-desk" style role is ever introduced.
insert into public.permissions (module, action)
values ('users', 'reset_password')
on conflict (module, action) do nothing;
