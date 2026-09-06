-- TEMPORARY QA SETUP — password-reset UI verification (final pass),
-- continued. Adds settings.view to ewaybill-qa-test alongside the
-- already-granted users.view + users.reset_password — a separate module
-- permission gating the Settings sidebar link itself (Layout.tsx:174-177,
-- `canView(currentUser,'settings') || role is Admin`), discovered only
-- when navigation to Settings failed with the first two overrides alone.
-- Still explicitly NOT granting users.edit — confirming only that the
-- Users list itself is reachable and the edit-pencil entry point is
-- genuinely absent, not opening the Edit User dialog.
insert into public.user_permission_overrides (user_id, permission_id, allowed)
select
  '351c06d1-9400-4f04-b679-64b077bdafda'::uuid,
  p.id,
  true
from public.permissions p
where p.module = 'settings' and p.action = 'view'
on conflict (user_id, permission_id) do update set allowed = true;
