-- Corrective migration (see chat, "Correct the Continuation Job Card
-- workflow") — the field added by 20260922090000_job_card_continuation.sql
-- (next_job_card_no) is semantically wrong. A continuation Job Card
-- points BACKWARD to the real, already-existing Job Card it continues
-- from (e.g. JC-2026-008 continuing JC-2026-007 stores a reference to
-- JC-2026-007), never forward to a not-yet-created "next" one. The
-- application never invents or calculates a Job Card number, and must
-- never ask the user to type one.
--
-- Before writing this migration, the live table was queried directly
-- for any row with is_continuation = true or next_job_card_no not
-- null: zero rows matched. The only continuation data that ever
-- existed was this session's own QA test on JC-2026-008, already
-- restored to false/null before this corrective migration was
-- written. Dropping next_job_card_no here destroys no real data.
--
-- is_continuation itself stays — it is still a correct, valid boolean
-- flag; only the "what does a continuation point at" field was wrong.
--
-- previous_job_card_id is a self-FK to job_cards(id), the same real-FK
-- pattern already used throughout this table (assigned_by_employee_id,
-- in_process_check_employee_id, work_center_machine_id, ...). No
-- separate display-name snapshot column: unlike an employee (who can
-- be renamed independently of history), the printed/displayed Job
-- Card NUMBER is always resolved live from the referenced row's own
-- job_no — one source of truth, no stale-snapshot risk, and job_no
-- itself never changes after creation. ON DELETE SET NULL: deleting
-- the previous Job Card must never delete or corrupt this one.
alter table job_cards
  drop column next_job_card_no;

alter table job_cards
  add column previous_job_card_id uuid references job_cards(id) on delete set null;

comment on column public.job_cards.previous_job_card_id is
  'Optional self-FK to job_cards(id) -- the Job Card this one is a continuation of (points BACKWARD to an existing Job Card, e.g. JC-2026-008 continuing JC-2026-007 stores JC-2026-007''s id here). ON DELETE SET NULL. The printed "Previous Job Card" number is always resolved from this relationship''s job_no, never stored as free text.';

-- RLS: no new policy needed — the existing job_cards UPDATE/SELECT
-- policies already cover every column on this table, same reasoning
-- every prior additive job_cards column migration in this history
-- gives (e.g. 20260922090000_job_card_continuation.sql itself).
