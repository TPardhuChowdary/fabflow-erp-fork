-- Phase 61 (item 1 of your final clarifications - not part of the
-- original Phase 57-60 scope, kept as its own small focused migration
-- rather than folded into Phase 57) — dies/special tooling require a
-- linked drawing before they can become operational; ordinary tools are
-- completely untouched (already correctly drawing-free per the audit).
--
-- WHY THIS TABLE, NOT A NEW COLUMN: `dies` and `tools` are already two
-- separate tables in this schema - the "ordinary tool vs. die/special
-- tooling" split you're asking for already exists at the table level,
-- it doesn't need a type discriminator. This migration only ever
-- touches `dies`; `tools` is not referenced anywhere below.
--
-- WHY A TRIGGER, NOT A CHECK CONSTRAINT: Postgres CHECK constraints
-- cannot reference another table, and "does this die have a linked
-- drawing" is inherently a cross-table question (drawing_links is a
-- separate polymorphic join table). A trigger is the correct mechanism
-- here, same reasoning already applied elsewhere in this schema (e.g.
-- Phase 47's qms_stage_completions project_id trigger).
--
-- WHY THE TRIGGER ONLY FIRES ON UPDATE, NEVER ON INSERT - THIS IS
-- IMPORTANT, READ BEFORE APPLYING: a brand-new die cannot possibly have
-- a drawing_link yet, because drawing_links.linked_id has to reference
-- the die's own id, which does not exist until the INSERT completes.
-- Live-audited before writing this: today's "Add Die" flow creates every
-- new die with status = 'Available' immediately (confirmed live - all 3
-- of today's real dies were created this way, and one of them,
-- DIE-008, has zero linked drawings despite being 'Available' right
-- now). If this trigger fired on INSERT, applying this migration would
-- make it impossible to create a single new die from that moment on -
-- a real, immediate regression, not a hypothetical one.
--
-- So this migration:
--   1. Widens dies_status_check to add 'Draft' as a valid status - a
--      genuine non-operational state a die can be created in.
--   2. Per your clarification, changes the COLUMN DEFAULT itself from
--      'Available' to 'Draft' - confirmed live before writing this that
--      dies.status currently defaults to 'Available' at the database
--      level (column_default = 'Available'::text), not just something
--      the frontend happens to send. Any insert path that omits status
--      - a future API call, an Agent action, a corrected frontend form -
--      now lands in Draft automatically, with no drawing required yet.
--   3. Adds the enforcement trigger, firing ONLY when an UPDATE
--      actually changes status TO 'Available' or 'In Use' (the two
--      operational statuses) FROM something else. It does not fire on
--      INSERT, and does not fire on an UPDATE that leaves status
--      unchanged - so DIE-008 (already Available, no drawing today)
--      is grandfathered exactly as-is and stays freely editable; only a
--      genuine future transition INTO an operational status is checked.
--
-- WHAT THIS MEANS UNTIL THE FRONTEND CATCHES UP (disclosed, not hidden):
-- the database now defaults to Draft, but today's "Add Die" form
-- (Dies.tsx) explicitly initializes its own local form state to
-- status: "Available" and sends `form.status || "Available"` on
-- create - so it overrides this new database default rather than
-- relying on it, and a newly created die can still be saved directly
-- as 'Available' with no drawing, exactly like today, until that one
-- line in Dies.tsx is changed (planned as part of the frontend stage,
-- per your own implementation order). This migration alone already
-- closes the other half regardless of when that frontend change lands:
-- no EXISTING die can be moved out of Draft/In-Use/Under-Maintenance/
-- Retired back into Available/In Use without a drawing, from the
-- moment this is applied - and any insert path that does NOT explicitly
-- override status (unlike today's Dies.tsx form) already gets Draft
-- automatically, right now.
--
-- Both 'Available' and 'In Use' count as "operational" (a die actually
-- usable in production); 'Under Maintenance' and 'Retired' do not, so
-- taking a die out of service never requires a drawing.

begin;

alter table public.dies drop constraint if exists dies_status_check;
alter table public.dies add constraint dies_status_check
  check (status = any (array['Draft', 'Available', 'In Use', 'Under Maintenance', 'Retired']));

-- Existing rows are completely unaffected by a DEFAULT change - this
-- only changes what a future INSERT gets when it omits status.
alter table public.dies alter column status set default 'Draft';

create or replace function public.enforce_die_drawing_required()
returns trigger
language plpgsql
security invoker
as $$
begin
  if tg_op = 'UPDATE'
     and new.status in ('Available', 'In Use')
     and old.status is distinct from new.status
     and not exists (
       select 1 from public.drawing_links
       where linked_type = 'die' and linked_id = new.id
     )
  then
    raise exception
      'This die/special tooling item needs at least one linked drawing before it can become %. Attach a drawing first.',
      new.status;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_die_drawing_required on public.dies;
create trigger trg_enforce_die_drawing_required
  before update on public.dies
  for each row
  execute function public.enforce_die_drawing_required();

insert into public.schema_migrations (version, description, checksum)
values (
  '20260903_061_phase61_die_drawing_mandatory_enforcement',
  'Master Monster Prompt final clarification item 1: dies (not tools - already a separate table) now require a linked drawing_links row before status can transition to Available or In Use. Widens dies_status_check to add a genuine Draft state and changes the column DEFAULT from Available to Draft (confirmed live: dies.status previously defaulted to Available at the database level). Trigger fires only on UPDATE where status actually changes into an operational value, never on INSERT (a new die cannot possibly have a drawing yet) and never when status is unchanged - so the existing DIE-008 (Available, zero drawings today) is grandfathered and stays editable. Dies.tsx currently overrides the new database default by explicitly sending status: "Available" on create - full enforcement at creation time requires that one line to change, tracked as part of the frontend implementation stage.',
  'phase61-mmp-v1'
)
on conflict (version) do nothing;

commit;
