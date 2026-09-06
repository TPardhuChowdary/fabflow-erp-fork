-- TEMPORARY QA FIXTURE — verifies the default-sender auto-swap trigger
-- (trg_enforce_single_default_email_sender) and the one-default-per-org
-- unique index actually work, since no second real/connectable mailbox
-- is available in this environment to test with a genuine account.
--
-- status='disconnected' and fabricated host/credential-free fields mean
-- this row can never be selected by sendRecoveryCodeEmail() (which
-- requires status='connected') even during the brief window it may be
-- marked is_default_sender=true — it exists purely to exercise the
-- trigger/index at the database level. Deleted by a paired cleanup
-- migration immediately after the test.
insert into public.email_accounts (
  id, organization_id, email_address, provider, connection_method,
  status, sync_window_days, is_default_sender
) values (
  'a1a2a3a4-e5e6-4e7e-8e9e-eaebecedeeef'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  'qa-default-swap-test@example.invalid',
  'imap_smtp',
  'imap_smtp',
  'disconnected',
  30,
  false
);
