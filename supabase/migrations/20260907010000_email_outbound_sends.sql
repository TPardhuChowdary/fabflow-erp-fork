-- Phase 5 Email Operations — persisted draft/send-attempt model.
--
-- NOT YET APPLIED — written for review, per explicit instruction not to
-- push/apply without approval.
--
-- Why a new table rather than reusing anything: repo-wide search
-- confirmed zero existing concept of an email draft or outbound
-- communication record (see the Phase 5 design report). Drafts must
-- survive a page refresh (explicit product decision), which rules out
-- pure in-memory/React state; and this is a genuinely new capability
-- (FabFlow has never sent an email through this architecture), so there
-- is no existing table this could be folded into without inventing
-- business semantics that don't exist yet.
--
-- State machine (enforced by triggers below, not just application code):
--   draft -> confirmed -> sending -> {sent | failed_before_provider |
--                                      provider_rejected | unknown}
-- "unknown" means the provider may have accepted the email but FabFlow
-- never got a definitive response — it is a TERMINAL state precisely so
-- nothing ever auto-retries out of it (see the transition-validation
-- trigger: there is no legal transition out of a terminal state at all).

create table public.email_outbound_sends (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default current_organization_id(),
  created_by uuid not null default auth.uid(),
  email_account_id uuid not null references public.email_accounts(id) on delete restrict,
  kind text not null check (kind in ('reply', 'new')),
  -- Only set (and required) for kind='reply'. ON DELETE SET NULL rather
  -- than CASCADE: if the original message were ever removed, the
  -- outbound record (real audit history of what FabFlow actually sent)
  -- must survive — it just loses its back-reference, it is never itself
  -- deleted as a side effect of something else being deleted.
  reply_to_message_id uuid references public.email_messages(id) on delete set null,
  to_addresses jsonb not null default '[]'::jsonb,
  cc_addresses jsonb not null default '[]'::jsonb,
  -- No bcc_addresses column at all — BCC is explicitly out of scope for
  -- v1 (product decision), and the absence of the column is itself part
  -- of enforcing that: there is nowhere to even put one.
  subject text not null,
  body_text text not null,
  body_html text,
  -- Each element: {"type":"email_attachment","attachmentId":"<uuid>",
  -- "filename":"...","mimeType":"...","sizeBytes":123}. Only a reference
  -- (attachmentId into the existing, immutable email_attachments table)
  -- is authoritative for actually fetching bytes at send time — the
  -- other fields are a denormalized snapshot for confirmation display
  -- only, per the design report's Section 10/15: the LLM never supplies
  -- a raw Storage path, and the send path re-verifies attachmentId
  -- against email_attachments (organization-scoped) before reading
  -- anything, never trusting this JSON blob's own filename/mimeType for
  -- the actual bytes.
  attachments jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (
    status in ('draft', 'confirmed', 'sending', 'sent', 'failed_before_provider', 'provider_rejected', 'unknown')
  ),
  -- Generated and persisted BEFORE the provider is ever called (at the
  -- confirmed->sending transition) — the durable idempotency identity
  -- required so a retry (double-click, Edge Function retry, page
  -- refresh, repeated AI tool call) can recognize "this exact send
  -- attempt already exists" rather than risking a second real email.
  -- NULL for rows that never reached 'sending' (drafts, or rows that
  -- failed before that point) — multiple NULLs are fine under a unique
  -- constraint (Postgres never treats NULL as equal to NULL).
  idempotency_key text,
  provider_message_id text,
  last_error text,
  confirmed_at timestamptz,
  sending_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_outbound_sends_reply_requires_target
    check (kind <> 'reply' or reply_to_message_id is not null),
  constraint email_outbound_sends_idempotency_key_unique unique (idempotency_key)
);

create index email_outbound_sends_org_status_idx
  on public.email_outbound_sends (organization_id, status);

create index email_outbound_sends_reply_to_idx
  on public.email_outbound_sends (reply_to_message_id)
  where reply_to_message_id is not null;

comment on table public.email_outbound_sends is
  'Phase 5 Email Operations — persisted email drafts and send attempts. A row is created in "draft" status by draftEmailReply/draftNewEmail (no human confirmation required — no external side effect). Only sendEmailReply/sendNewEmail, gated by the existing AI write-confirmation mechanism and the email.send permission, may advance a row past draft. See the two triggers below for the structural (not just application-level) guarantees that the confirmed send payload cannot silently change and that only legal state transitions occur.';

-- Payload immutability: once a row has ever left 'draft' status (checked
-- on BOTH the pre- and post-image, so a same-statement draft->confirmed
-- transition cannot smuggle in a payload change), none of the fields
-- that determine what will actually be sent may change. This is the
-- structural guarantee behind "the confirmed payload cannot silently
-- change" and "do not regenerate or reinterpret the email after
-- confirmation" — enforced by the database itself, not merely by which
-- code paths the application happens to call.
create or replace function public.lock_confirmed_email_send_payload()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'draft' or new.status <> 'draft' then
    if new.to_addresses is distinct from old.to_addresses
       or new.cc_addresses is distinct from old.cc_addresses
       or new.subject is distinct from old.subject
       or new.body_text is distinct from old.body_text
       or new.body_html is distinct from old.body_html
       or new.attachments is distinct from old.attachments
       or new.email_account_id is distinct from old.email_account_id
       or new.reply_to_message_id is distinct from old.reply_to_message_id
       or new.kind is distinct from old.kind
    then
      raise exception 'Cannot modify the send payload of email_outbound_sends % once it has left draft status (current status %)', old.id, old.status;
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_lock_confirmed_email_send_payload
before update on public.email_outbound_sends
for each row
execute function public.lock_confirmed_email_send_payload();

-- State-machine enforcement: only the specific transitions below are
-- legal. Critically, there is no legal transition OUT of 'sent',
-- 'failed_before_provider', 'provider_rejected', or 'unknown' at all —
-- every one of those is terminal, which is what makes "unknown outcomes
-- require human review, never auto-retry" a database-enforced fact
-- rather than a convention the application code has to remember.
create or replace function public.validate_email_send_status_transition()
returns trigger
language plpgsql
as $$
declare
  is_allowed boolean;
begin
  if new.status = old.status then
    return new;
  end if;
  is_allowed := (old.status, new.status) in (
    ('draft', 'confirmed'),
    ('confirmed', 'sending'),
    ('sending', 'sent'),
    ('sending', 'failed_before_provider'),
    ('sending', 'provider_rejected'),
    ('sending', 'unknown')
  );
  if not is_allowed then
    raise exception 'Invalid email_outbound_sends status transition from % to % (id=%)', old.status, new.status, old.id;
  end if;
  return new;
end;
$$;

create trigger trg_validate_email_send_status_transition
before update of status on public.email_outbound_sends
for each row
when (new.status is distinct from old.status)
execute function public.validate_email_send_status_transition();

alter table public.email_outbound_sends enable row level security;

-- Same has_permission('email','send') + organization_id gate on every
-- policy, matching this app's universal RLS convention. No DELETE
-- policy at all (matches email_messages' own precedent) — an outbound
-- send record, once created, is a permanent audit artifact.
create policy email_outbound_sends_select on public.email_outbound_sends
for select
using (has_permission('email', 'send') and organization_id = current_organization_id());

create policy email_outbound_sends_insert on public.email_outbound_sends
for insert
with check (has_permission('email', 'send') and organization_id = current_organization_id());

create policy email_outbound_sends_update on public.email_outbound_sends
for update
using (has_permission('email', 'send') and organization_id = current_organization_id())
with check (organization_id = current_organization_id());
