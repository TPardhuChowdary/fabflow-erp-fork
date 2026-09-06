-- ============================================================================
-- Phase 50: Universal Email Integration — foundation (see chat, "FabFlow
-- Universal Email Integration + AI Email Intelligence")
-- ============================================================================
-- Version:     20260901_050_phase50_email_integration
-- Scope:       Foundation pass only (per explicit scope decision): schema
--              for connected mailboxes, synced messages, attachments, and
--              sync bookkeeping. Deliberately NOT included this phase (see
--              plan): email_labels/email_message_labels (classification is
--              likely a plain column once AI classification lands — a
--              many-to-many labels system now would be speculative),
--              email_ai_analysis, email_erp_links, email_events. Adding
--              those later is an additive migration, not a rework of this
--              one, since nothing here assumes their absence permanently.
--
-- Design notes:
--   - email_accounts: ONE table for both "account" and "credentials" — a
--     separate email_credentials join table was considered and rejected
--     (see plan's YAGNI note): a credential's lifecycle is 1:1 with its
--     account, so splitting them adds a join for zero real benefit.
--     encrypted_credentials is bytea, populated ONLY via
--     extensions.pgp_sym_encrypt() called from the email-connect Edge
--     Function (service-role client) with a passphrase read from the
--     EMAIL_CREDENTIALS_ENCRYPTION_KEY Supabase secret — the passphrase
--     itself is never stored in any table, only ever passed as a query
--     parameter at encrypt/decrypt time from server-side code. RLS still
--     denies ordinary `select *` access to this column via application
--     policy (see email_accounts_select below, which is column-agnostic
--     since Postgres RLS is row-level, not column-level — the real
--     column-hiding boundary is `EMAIL_ACCOUNT_COLUMNS` in
--     emailAccountsApi.ts, which never lists encrypted_credentials; the
--     ciphertext is additionally useless without the passphrase secret
--     even if it were selected).
--   - provider/connection_method are `text` + `check`, not a Postgres enum
--     — matches this codebase's own established convention (see
--     job_cards.status, projects' various status columns) of plain
--     checked text over native enum types, for painless future value
--     additions without an ALTER TYPE.
--   - email_messages' dedup key is `unique (email_account_id,
--     provider_message_id)` — the provider's own stable message id is the
--     uniqueness authority, matching the explicit requirement (never a
--     synthesized hash of content, never assuming send-order).
--   - email_attachments.content_hash (sha-256, hex) is not itself unique
--     (a personally-identical file can legitimately arrive twice as two
--     truly separate business attachments) — but is indexed so the
--     Edge Function can check for an existing storage_path with the same
--     (organization_id, content_hash) before re-uploading, satisfying
--     "avoid duplicate attachment storage where possible" without forcing
--     a hard uniqueness constraint that would be wrong for genuine
--     resends.
--   - email_sync_state is a separate 1:1 table from email_accounts so
--     high-churn sync bookkeeping (updated every sync tick) doesn't rewrite
--     the account row's own columns (avoids unrelated updated_at churn on
--     the account, keeps the account row's own audit trail meaningful).
--
-- RLS/organization_id: same Phase 1 pattern as every table since —
-- column + default current_organization_id() + has_permission('email',...)
-- policies. "email" is a NEW permission module (see permissions.ts, added
-- in the same commit as this migration) — per every phase since Phase 2,
-- this migration does NOT seed public.permissions/role_permissions itself;
-- Admin bypasses granular checks as it already does for every module, and
-- any other role must be explicitly granted access via the existing
-- Settings permission-matrix UI once that UI is used to grant it (confirmed
-- by inspecting every intervening phase file — none re-seed
-- role_permissions either; grants are self-service through Settings).
--
-- Storage: one new PRIVATE bucket, `email-attachments`, with the exact
-- same org-scoped-folder RLS shape phase-14 already established for
-- `engineering-drawings` — (storage.foldername(name))[1] must equal the
-- caller's own organization_id. Never public.
--
-- Every DDL statement below is idempotent: safe to re-run this file
-- against a database that already has it applied.
-- ============================================================================

begin;

-- pgcrypto is a standard Postgres/Supabase extension providing
-- pgp_sym_encrypt/pgp_sym_decrypt (symmetric PGP encryption) — used only
-- for encrypted_credentials below. Idempotent: a no-op if already enabled
-- (Supabase projects commonly have it enabled by default already).
create extension if not exists pgcrypto with schema extensions;

-- Thin RPC wrappers around pgp_sym_encrypt/pgp_sym_decrypt — the
-- supabase-js client has no raw-SQL execution method, only .rpc(), so a
-- named function is how the Edge Function actually invokes pgcrypto.
-- Callable by any authenticated user (not revoked from PUBLIC/
-- authenticated) — deliberately: these two functions are a pure,
-- stateless crypto transform over caller-SUPPLIED plaintext/ciphertext
-- and a caller-SUPPLIED key. They touch no table, bypass no RLS, and
-- reveal nothing about any other row/user/organization — a caller can
-- only ever encrypt their own input or decrypt ciphertext+key they
-- already both possess, which is the same as saying they already have
-- the key (the real secret, which only ever lives in the
-- EMAIL_CREDENTIALS_ENCRYPTION_KEY Supabase secret, read by
-- email-connect/email-sync — never by the browser). Restricting EXECUTE
-- would add complexity without closing any actual exposure.
create or replace function public.encrypt_email_credentials(p_plaintext text, p_key text)
returns bytea
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select extensions.pgp_sym_encrypt(p_plaintext, p_key);
$$;

create or replace function public.decrypt_email_credentials(p_ciphertext bytea, p_key text)
returns text
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select extensions.pgp_sym_decrypt(p_ciphertext, p_key);
$$;

-- ── email_accounts ──────────────────────────────────────────────────────
create table if not exists public.email_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id() references public.organizations(id),
  connected_by uuid references auth.users(id) on delete set null,
  email_address text not null,
  display_name text,
  provider text not null check (provider in ('google', 'microsoft', 'imap_smtp')),
  connection_method text not null check (connection_method in ('oauth', 'imap_smtp')),
  -- Generic IMAP/SMTP connection details — null for OAuth-connected accounts.
  imap_host text,
  imap_port integer,
  imap_encryption text check (imap_encryption in ('ssl', 'starttls', 'none')),
  smtp_host text,
  smtp_port integer,
  smtp_encryption text check (smtp_encryption in ('ssl', 'starttls', 'none')),
  imap_username text,
  -- Ciphertext only — see header note. Never selected by emailAccountsApi.ts.
  encrypted_credentials bytea,
  status text not null default 'connected'
    check (status in ('connected', 'auth_required', 'sync_failed', 'disconnected')),
  status_detail text,
  last_sync_at timestamptz,
  sync_window_days integer not null default 30 check (sync_window_days > 0),
  is_default_sender boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_email_accounts_org_address
  on public.email_accounts(organization_id, email_address);

create index if not exists idx_email_accounts_org
  on public.email_accounts(organization_id);

drop trigger if exists trg_email_accounts_updated_at on public.email_accounts;
create trigger trg_email_accounts_updated_at
  before update on public.email_accounts
  for each row execute function public.set_updated_at_timestamp();

alter table public.email_accounts enable row level security;

drop policy if exists email_accounts_select on public.email_accounts;
create policy email_accounts_select on public.email_accounts
  for select using (has_permission('email','view') and organization_id = current_organization_id());

drop policy if exists email_accounts_insert on public.email_accounts;
create policy email_accounts_insert on public.email_accounts
  for insert with check (has_permission('email','create') and organization_id = current_organization_id());

drop policy if exists email_accounts_update on public.email_accounts;
create policy email_accounts_update on public.email_accounts
  for update using (has_permission('email','edit') and organization_id = current_organization_id());

drop policy if exists email_accounts_delete on public.email_accounts;
create policy email_accounts_delete on public.email_accounts
  for delete using (has_permission('email','delete') and organization_id = current_organization_id());

-- ── email_sync_state ────────────────────────────────────────────────────
create table if not exists public.email_sync_state (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id() references public.organizations(id),
  email_account_id uuid not null unique references public.email_accounts(id) on delete cascade,
  last_synced_at timestamptz,
  last_successful_sync_at timestamptz,
  cursor text,
  status text not null default 'idle' check (status in ('idle', 'syncing', 'failed')),
  last_error text,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_sync_state_org
  on public.email_sync_state(organization_id);

drop trigger if exists trg_email_sync_state_updated_at on public.email_sync_state;
create trigger trg_email_sync_state_updated_at
  before update on public.email_sync_state
  for each row execute function public.set_updated_at_timestamp();

alter table public.email_sync_state enable row level security;

drop policy if exists email_sync_state_select on public.email_sync_state;
create policy email_sync_state_select on public.email_sync_state
  for select using (has_permission('email','view') and organization_id = current_organization_id());

-- Sync state is written only by Edge Functions using the service-role
-- client (which bypasses RLS entirely) — no insert/update/delete policy
-- is defined for ordinary authenticated users, matching the principle
-- that sync bookkeeping is not a user-editable business record.

-- ── email_messages ──────────────────────────────────────────────────────
create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id() references public.organizations(id),
  email_account_id uuid not null references public.email_accounts(id) on delete cascade,
  provider_message_id text not null,
  provider_thread_id text,
  from_address text not null,
  from_name text,
  to_addresses jsonb not null default '[]'::jsonb,
  cc_addresses jsonb not null default '[]'::jsonb,
  subject text,
  body_text text,
  body_html text,
  snippet text,
  sent_at timestamptz,
  is_read boolean not null default false,
  folder text not null default 'inbox',
  has_attachments boolean not null default false,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The dedup mechanism (requirement #9): a provider's own stable message id,
-- scoped per-account (the same physical email delivered to two connected
-- mailboxes is legitimately two rows — dedup is per-mailbox, not global).
create unique index if not exists uq_email_messages_account_providerid
  on public.email_messages(email_account_id, provider_message_id);

create index if not exists idx_email_messages_org_account
  on public.email_messages(organization_id, email_account_id);

create index if not exists idx_email_messages_org_sentat
  on public.email_messages(organization_id, sent_at desc);

create index if not exists idx_email_messages_thread
  on public.email_messages(email_account_id, provider_thread_id);

drop trigger if exists trg_email_messages_updated_at on public.email_messages;
create trigger trg_email_messages_updated_at
  before update on public.email_messages
  for each row execute function public.set_updated_at_timestamp();

alter table public.email_messages enable row level security;

drop policy if exists email_messages_select on public.email_messages;
create policy email_messages_select on public.email_messages
  for select using (has_permission('email','view') and organization_id = current_organization_id());

-- Only is_read/folder are ever user-editable from the client (marking
-- read, filing) — full row insert/delete is an Edge-Function-only
-- (service-role) concern, same reasoning as email_sync_state.
drop policy if exists email_messages_update on public.email_messages;
create policy email_messages_update on public.email_messages
  for update using (has_permission('email','edit') and organization_id = current_organization_id())
  with check (has_permission('email','edit') and organization_id = current_organization_id());

-- ── email_attachments ───────────────────────────────────────────────────
create table if not exists public.email_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id() references public.organizations(id),
  email_message_id uuid not null references public.email_messages(id) on delete cascade,
  filename text not null,
  mime_type text,
  size_bytes bigint,
  storage_path text not null,
  content_hash text,
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'stored', 'failed', 'skipped_too_large', 'skipped_unsupported_type')),
  created_at timestamptz not null default now()
);

create index if not exists idx_email_attachments_org_message
  on public.email_attachments(organization_id, email_message_id);

-- Supports the "avoid duplicate attachment storage" lookup — NOT a unique
-- constraint (see header note: a genuine resend of the identical file is
-- a real, separate attachment row, just reusing the same storage object).
create index if not exists idx_email_attachments_org_hash
  on public.email_attachments(organization_id, content_hash);

alter table public.email_attachments enable row level security;

drop policy if exists email_attachments_select on public.email_attachments;
create policy email_attachments_select on public.email_attachments
  for select using (has_permission('email','view') and organization_id = current_organization_id());

-- ── Storage: email-attachments bucket ───────────────────────────────────
insert into storage.buckets (id, name, public)
values ('email-attachments', 'email-attachments', false)
on conflict (id) do nothing;

drop policy if exists email_attachments_storage_select on storage.objects;
create policy email_attachments_storage_select on storage.objects for select
  using (
    bucket_id = 'email-attachments'
    and has_permission('email', 'view')
    and (storage.foldername(name))[1] = current_organization_id()::text
  );

-- Uploads happen only from the email-sync Edge Function (service-role,
-- bypasses RLS) — no client-side insert policy is defined, matching the
-- same "server writes, client only reads via signed URL" boundary as
-- agent-documents (phase-l3).

insert into public.schema_migrations (version, description, checksum)
values (
  '20260901_050_phase50_email_integration',
  'Phase 50: Universal Email Integration foundation — email_accounts (mailbox connections, encrypted credentials via pgcrypto, OAuth or generic IMAP/SMTP), email_sync_state (1:1 sync bookkeeping), email_messages (provider-message-id deduped per account), email_attachments (org+hash indexed for dedup-aware storage), plus the private email-attachments Storage bucket with org-scoped folder RLS matching phase-14, and encrypt_email_credentials()/decrypt_email_credentials() RPC wrappers around pgcrypto (SECURITY INVOKER, stateless, no table access). New "email" permission module (see permissions.ts) — not seeded into public.permissions/role_permissions, matching every phase since Phase 2 (Admin-only until granted via Settings). AI classification, entity linking, and Agent tool tables are explicitly deferred to a later phase.',
  'phase50-email-integration-v1'
)
on conflict (version) do nothing;

commit;
