-- DEFECT-4 — make users.activate / users.deactivate real.
--
-- BEFORE: profiles_write was the ONLY authorization on profile updates:
--     has_permission('users','edit') AND organization_id = current_organization_id()
-- so the catalog's users.activate / users.deactivate permissions were never
-- consulted, and anyone holding users.view + users.edit could deactivate any
-- user in their organization — administrators included (proven live).
--
-- AFTER: the permission catalog is authoritative.
--   * changing is_active false -> true  requires users.activate
--   * changing is_active true  -> false requires users.deactivate
--   * changing any other profile field  requires users.edit
--   * users.edit ALONE can no longer activate or deactivate anybody
--
-- Why a trigger and not pure RLS: an UPDATE policy sees OLD in USING and NEW
-- in WITH CHECK, never both, so it cannot express "this column may not
-- CHANGE unless you hold permission X". A BEFORE UPDATE trigger has OLD and
-- NEW together. Same shape as the existing
-- enforce_job_card_evidence_required() trigger on job_cards.
--
-- Two existing server-side writers must keep working, and are exempted
-- deliberately (verified before writing this):
--   * log_auth_login()  -> sets profiles.last_login on every sign-in
--   * clear_own_must_change_password() -> a user clearing their OWN
--     forced-password-change flag on first login
-- Neither holds users.edit, and breaking either would lock users out.

begin;

-- 1. RLS: admit the UPDATE if the caller holds ANY user-management write
--    capability. Which specific change is legal is decided by the trigger.
--    (Org scoping is unchanged.)
alter policy profiles_write on public.profiles
  using (
    organization_id = current_organization_id()
    and (
      has_permission('users', 'edit')
      or has_permission('users', 'activate')
      or has_permission('users', 'deactivate')
    )
  )
  with check (
    organization_id = current_organization_id()
    and (
      has_permission('users', 'edit')
      or has_permission('users', 'activate')
      or has_permission('users', 'deactivate')
    )
  );

-- 2. Transition-aware enforcement.
create or replace function public.enforce_profile_activation_permission()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Trusted server context (service_role, superuser, migrations, the
  -- auth-side log_auth_login trigger) has no JWT subject. Those callers are
  -- not app users and are already gated by RLS, which requires
  -- has_permission() for every authenticated caller — an anon request has
  -- no permissions and so never reaches this trigger. Without this guard a
  -- DBA or the service role could not correct profile data at all.
  if auth.uid() is null then
    return new;
  end if;

  -- Activation state is governed by its own dedicated permissions.
  if new.is_active is distinct from old.is_active then
    if new.is_active then
      if not has_permission('users', 'activate') then
        raise exception
          'Reactivating a user requires the users.activate permission.'
          using errcode = '42501';
      end if;
    else
      if not has_permission('users', 'deactivate') then
        raise exception
          'Deactivating a user requires the users.deactivate permission.'
          using errcode = '42501';
      end if;
    end if;
  end if;

  -- Every other profile field still requires users.edit. last_login and
  -- updated_at are system-maintained; must_change_password is handled
  -- separately below so the first-login self-service path keeps working.
  if (
       to_jsonb(new) - 'is_active' - 'last_login' - 'updated_at'
         - 'must_change_password'
     ) is distinct from (
       to_jsonb(old) - 'is_active' - 'last_login' - 'updated_at'
         - 'must_change_password'
     )
     and not has_permission('users', 'edit')
  then
    raise exception
      'Editing a user profile requires the users.edit permission.'
      using errcode = '42501';
  end if;

  -- Clearing your OWN must_change_password is self-service
  -- (clear_own_must_change_password); doing it to someone else is an edit.
  if new.must_change_password is distinct from old.must_change_password
     and new.id is distinct from auth.uid()
     and not has_permission('users', 'edit')
  then
    raise exception
      'Changing another user''s password-reset flag requires the users.edit permission.'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_enforce_profile_activation_permission
  on public.profiles;

create trigger trg_enforce_profile_activation_permission
  before update on public.profiles
  for each row
  execute function public.enforce_profile_activation_permission();

commit;
