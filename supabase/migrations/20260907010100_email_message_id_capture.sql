-- Phase 5 Email Operations — RFC822 Message-ID capture.
--
-- NOT YET APPLIED — written for review, per explicit instruction not to
-- push/apply without approval.
--
-- Concrete gap identified in the Phase 5 design report: provider_message_id
-- (an IMAP UID, per imapSmtpAdapter.ts) is NOT the same thing as the
-- RFC822 "Message-ID" header a reply's In-Reply-To/References must
-- reference for real mail clients to thread it correctly — and nothing
-- in the ingestion pipeline captured the latter at all. This column adds
-- storage for it; the adapter-side capture is a separate, non-migration
-- code change (see the accompanying report).
alter table public.email_messages
  add column provider_internet_message_id text;

comment on column public.email_messages.provider_internet_message_id is
  'The RFC822 "Message-ID" header (e.g. "<abc123@mail.example.com>") — distinct from provider_message_id, which is a provider-specific id (an IMAP UID for imap_smtp) used for sync cursor/dedup, not a value any external mail client would recognize for threading. Populated going forward for the IMAP adapter (via ENVELOPE''s messageId field, already fetched at no extra cost); null for every message synced before this column existed, and never backfilled. A reply must never be constructed against a message where this is null — see the Phase 5 thread/reply rule.';
