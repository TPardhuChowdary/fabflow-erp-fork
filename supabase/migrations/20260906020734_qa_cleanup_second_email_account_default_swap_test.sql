-- Cleanup for 20260906020112 — removes the disposable, never-connectable
-- QA fixture used to prove the default-sender auto-swap trigger and the
-- one-default-per-org unique index actually work. The real account was
-- already restored as the org's default via the real Settings UI before
-- this runs.
delete from public.email_accounts
where id = 'a1a2a3a4-e5e6-4e7e-8e9e-eaebecedeeef'::uuid;
