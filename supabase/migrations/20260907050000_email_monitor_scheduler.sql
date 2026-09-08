-- Phase 8K — scheduler PREPARATION only.
--
-- NOT YET APPLIED. NOT YET ENABLED. Per explicit instruction: writing
-- this migration is approved; applying/enabling a recurring production
-- schedule is a separate production behavior change requiring its own
-- explicit approval, even after the rest of Phase 8 is approved and
-- applied. Do not run `supabase db push` (or otherwise apply this file)
-- until that separate approval is given.
--
-- Both extensions are confirmed AVAILABLE but not installed on this
-- project (see the Phase 8A audit) — enabling them is a normal,
-- supported Supabase operation, not exotic infrastructure.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Credentials the cron job needs to call the Edge Function live ONLY in
-- Supabase Vault, never as plaintext in migration source or in the cron
-- job definition itself (cron.schedule's `command` text is otherwise
-- visible to anyone who can read cron.job) — this satisfies 8J's
-- "service-role credentials never reach the frontend, kept server-side
-- only" for the scheduler's OWN credential, same as the Edge Function's
-- own env-var secrets already are.
--
-- Run once, manually, AFTER approval, before enabling the schedule below
-- (not part of this migration's own DO block, because the actual key
-- values must never be committed to a migration file):
--   select vault.create_secret('<the project anon key>', 'email_monitor_anon_key');
--   select vault.create_secret('<a newly generated random secret>', 'email_monitor_invoke_secret');
-- The second secret is a DISTINCT credential from every Supabase API
-- key — it is the thing that actually authorizes triggering a monitor
-- run (checked inside email-monitor/index.ts against its own
-- EMAIL_MONITOR_SECRET environment variable), decoupled from "holds a
-- valid Supabase key" so that a leaked anon key alone can never trigger
-- a run. It must also be set as the email-monitor function's own
-- EMAIL_MONITOR_SECRET secret (`supabase secrets set`) with the SAME
-- value, or every invocation will be rejected with 401.

-- The actual schedule (commented out — this is the "prepared, not
-- enabled" artifact itself). Uncommenting and applying this block is
-- the literal "enable a recurring production schedule" action that
-- needs its own separate explicit approval:
--
-- select cron.schedule(
--   'email-monitor-scan',
--   -- Every 15 minutes — conservative default, not "every minute
--   -- without a verified business need" (explicit instruction). Adjust
--   -- once real mailbox volume/cost data exists.
--   '*/15 * * * *',
--   $$
--   select net.http_post(
--     url := 'https://znfczdkexmsgmedafhgz.supabase.co/functions/v1/email-monitor',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'email_monitor_anon_key'),
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'email_monitor_anon_key'),
--       'x-monitor-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_monitor_invoke_secret')
--     ),
--     body := '{}'::jsonb,
--     timeout_milliseconds := 60000
--   );
--   $$
-- );
--
-- To disable later: select cron.unschedule('email-monitor-scan');

comment on extension pg_cron is
  'Phase 8K — enabled in preparation for the email-monitor schedule; the actual cron.schedule(...) call stays commented out in this migration until separately approved (see this file''s own header).';
