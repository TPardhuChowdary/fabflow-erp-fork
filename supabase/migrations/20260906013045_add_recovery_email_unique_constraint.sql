-- Enforce that a verified recovery email can belong to at most one
-- FabFlow account — required before recovery-by-email can safely resolve
-- to a single, unambiguous user.
--
-- Pre-migration check performed: zero duplicate non-null recovery_email
-- values exist across public.profiles as of this writing.
--
-- Scoped to `recovery_email is not null` deliberately, not
-- `recovery_email_pending` — in this schema recovery_email is only ever
-- set at the moment it's verified (recovery-email-setup/index.ts's
-- "verify" action sets recovery_email and recovery_email_verified_at in
-- the same update), so "has a non-null recovery_email" and "has a
-- verified recovery email" are the same condition today. Two different
-- users' *pending, unverified* addresses may still collide - that's
-- fine, only one of them can ever actually verify it (unique index
-- lets the first verification through, the second violates the
-- constraint - see recovery-email-setup's verify handling for how this
-- surfaces to that second caller).
create unique index profiles_recovery_email_unique_idx
  on public.profiles (recovery_email)
  where recovery_email is not null;
