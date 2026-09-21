-- Continuation Job Card (see chat, "Job Card print template redesign —
-- minimalist layout") — whether this Job Card is a continuation of an
-- already-printed one, and the real, user-typed Next Job Card No. when
-- it is. Grepped the whole existing Job Card data model/migration
-- history first (types.ts, every job_cards migration) — no such field
-- exists anywhere; this is genuinely additive, not a duplicate.
--
-- Two plain, nullable/defaulted columns, the same shape as every other
-- freeform Job Card field on this table (notes, start_date):
--
-- is_continuation: boolean, defaults false. Every existing Job Card
-- keeps printing exactly as it does today (Continuation Job Card:
-- checked "No") until someone explicitly marks it a continuation.
--
-- next_job_card_no: plain text, nullable, intentionally NOT a foreign
-- key to job_cards.id. A continuation's "next" card is often written
-- down before that next Job Card is created in FabFlow at all (see
-- chat's own physical workflow: print → hand off → create the next
-- one later) — the same reasoning job_cards.job_no itself is a plain
-- text column, not a generated/linked identifier. The application
-- layer never computes or guesses this value; it is only ever the
-- exact string a user typed, and only ever printed when
-- is_continuation is true (enforced client-side by
-- updateJobCardContinuation() clearing it to null whenever
-- is_continuation is set false, and by JobCardDocContent only
-- rendering it when jobCard.isContinuation is true).
--
-- RLS: no new policy needed — the existing job_cards UPDATE/SELECT
-- policies already cover every column on this table, is_continuation/
-- next_job_card_no included, same reasoning every prior additive
-- job_cards column migration in this history gives (e.g.
-- 20260917100000_job_card_planning_fields.sql).
alter table job_cards
  add column is_continuation boolean not null default false;

alter table job_cards
  add column next_job_card_no text;
