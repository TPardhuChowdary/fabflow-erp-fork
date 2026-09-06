-- Admin-only self-service password recovery.
--
-- Scope, per explicit product decision: only is_admin=true accounts may
-- configure a recovery email and use self-service recovery. Non-admin
-- users are entirely unaffected — they keep the existing admin-driven
-- users.reset_password flow, unchanged.
--
-- recovery_email / recovery_email_verified_at: the ACTIVE, usable
-- recovery channel. Never set directly — only ever promoted from
-- recovery_email_pending once its own verification code has been
-- confirmed (see recovery-email-setup Edge Function). An unverified
-- address can never become the active channel; there is deliberately no
-- application code path that sets recovery_email_verified_at without
-- also having just checked a matching code.
--
-- recovery_email_pending: the address currently awaiting verification,
-- if any. Cleared once verified (moved into recovery_email) or replaced
-- by a newer request.
--
-- auth.users.email / the synthetic @users.fabflow.local login identity
-- are untouched by this migration and by the feature entirely - this is
-- an additional contact channel, not a change to how anyone logs in.
alter table public.profiles
  add column recovery_email text,
  add column recovery_email_verified_at timestamptz,
  add column recovery_email_pending text;

-- Single-use, short-lived, hashed codes for both steps of this feature:
-- verifying a newly-set recovery email, and completing an actual
-- password recovery. One shared table (purpose discriminates) since both
-- need identical single-use/expiry/attempt-lockout semantics.
--
-- Deliberately zero RLS policies for anon/authenticated — this table is
-- never read or written by anything except the two recovery Edge
-- Functions' service-role clients, exactly matching security_audit_log's
-- own "no client-facing policy at all" posture. Enabling RLS with no
-- policies denies every non-service-role caller outright.
create table public.password_recovery_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  purpose text not null check (purpose in ('recovery_email_verification', 'password_recovery')),
  token_hash text not null,
  attempt_count int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index password_recovery_tokens_lookup_idx
  on public.password_recovery_tokens (user_id, purpose, created_at desc);

alter table public.password_recovery_tokens enable row level security;
