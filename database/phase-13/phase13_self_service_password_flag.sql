-- FabFlow ERP — Phase 13: Self-service must_change_password clearing.
-- One narrow, additive RPC. Extends nothing, drops nothing, does not
-- touch any table, RLS policy, trigger, or permission created by any
-- prior phase. Idempotent: safe to run multiple times.
--
-- Why this is needed: Priority 1 of the client-ready delivery wires the
-- app to real Supabase Auth. profiles.must_change_password (added in
-- Phase 1, unused until now) is set true by the new admin-user-creation
-- Edge Function so a brand-new user is forced to pick their own password
-- on first login. But profiles_write RLS
-- (phase1_auth_permissions_rls_v5_FINAL.sql) only allows updates by
-- someone who already holds users.edit — a brand-new user has no way to
-- clear their own flag once they've changed their password.
--
-- Loosening profiles_write to add `or id = auth.uid()` was rejected:
-- Postgres RLS UPDATE policies are row-scoped, not column-scoped, so
-- that would let any user rewrite *any* column on their own profile row
-- (organization_id, employee_id, is_active, etc.), not just the one flag
-- this needs. Instead: one SECURITY DEFINER function, narrowly scoped to
-- exactly one column on exactly the caller's own row.

begin;

create or replace function public.clear_own_must_change_password()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set must_change_password = false
  where id = auth.uid();
$$;

comment on function public.clear_own_must_change_password() is
  'Called by the frontend immediately after a user completes a forced password change (auth.updateUser). Clears must_change_password on the caller''s own profiles row only — cannot affect any other user or any other column. Callable by any authenticated user; no permission check needed since it can only ever touch auth.uid()''s own row.';

grant execute on function public.clear_own_must_change_password() to authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- Register this migration. Deliberately the last statement before
-- commit — its presence in schema_migrations after a run is proof the
-- entire transaction above succeeded, not just that it started.
-- Checksum is the SHA-256 of this file's content above this statement,
-- computed at authoring time.
-- ══════════════════════════════════════════════════════════════════════

insert into public.schema_migrations (version, description, checksum)
values (
  '20260811_013_phase13_self_service_password_flag',
  'Phase 13: one new SECURITY DEFINER function, clear_own_must_change_password(), granted to authenticated. Lets a user forced through a first-login password change (must_change_password, set by the new admin-create-user Edge Function as part of the real Supabase Auth wiring) clear their own flag without needing users.edit, without loosening profiles_write RLS, and without any other column on their row being touchable. No table, policy, trigger, role, or permission from any prior phase is modified.',
  '7d12d18cb9042e5124092ebea35734f8930a4f9ea2b399ed82b42e600c9167c6'
)
on conflict (version) do nothing;

commit;
