-- Fix Job Card deletion / append-only audit conflict (see chat) — NOT
-- YET APPLIED, written for review only.
--
-- PROBLEM: job_card_inspection_events.job_card_id currently uses
-- ON DELETE CASCADE from job_cards. Deleting a Job Card that has any
-- inspection history makes Postgres's own cascade issue an internal
-- `DELETE FROM job_card_inspection_events WHERE job_card_id = ...` —
-- which trg_job_card_inspection_events_append_only correctly rejects
-- (that trigger's whole job is to reject any UPDATE/DELETE on that
-- table, including one Postgres generates internally for a cascade).
-- The result: deleting such a Job Card always fails with a raw
-- P0001 trigger error, for every Job Card that has ever been
-- inspected — not a hypothetical, a Job Card has a real "Delete" menu
-- item in the UI (deleteJobCardRemote/JobCards.tsx).
--
-- FIX: change ONLY the FK's delete behavior, from CASCADE to RESTRICT.
-- A Job Card with no inspection_events rows deletes exactly as before
-- (RESTRICT has no effect when there is nothing referencing it). A Job
-- Card WITH inspection_events rows now fails its DELETE immediately
-- with a standard, well-known Postgres error (23503,
-- foreign_key_violation) instead of reaching the trigger at all —
-- the application layer (jobCardsApi.ts's deleteJobCardRemote) maps
-- that specific error code to a friendly message rather than letting
-- the trigger's raw text reach the user.
--
-- Nothing about prevent_qms_history_mutation() or
-- trg_job_card_inspection_events_append_only changes — this migration
-- does not touch either. The append-only guarantee is unaffected: it's
-- still true that no row in job_card_inspection_events can ever be
-- updated or deleted, by any path. The only thing that changes is
-- whether a Job Card ITSELF can be deleted while such rows exist for
-- it — deliberately made "no" rather than "cascade the history away",
-- since silently deleting inspection history as a side effect of
-- deleting its Job Card would be exactly the kind of audit-trail loss
-- this table exists to prevent.
--
-- Deliberately NOT introducing soft-delete on job_cards — no existing
-- soft-delete convention exists on that table (delete is a real DELETE
-- today), and RESTRICT is the smallest change that satisfies the
-- requirement: preserve the history, make the conflict impossible to
-- hit by construction, no new column/state machine needed.

alter table public.job_card_inspection_events
  drop constraint job_card_inspection_events_job_card_id_fkey;

alter table public.job_card_inspection_events
  add constraint job_card_inspection_events_job_card_id_fkey
  foreign key (job_card_id) references public.job_cards(id) on delete restrict;

comment on constraint job_card_inspection_events_job_card_id_fkey
  on public.job_card_inspection_events is
  'ON DELETE RESTRICT (changed from CASCADE, see database/20260918100000) -- a Job Card with any recorded inspection event cannot be deleted, preserving the append-only audit trail rather than cascading it away. A Job Card with zero inspection_events rows deletes exactly as before.';
