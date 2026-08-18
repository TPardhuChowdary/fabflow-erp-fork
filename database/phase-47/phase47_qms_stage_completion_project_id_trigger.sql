-- FabFlow ERP — Phase 47: auto-derive qms_stage_completions.project_id.
--
-- qms_stage_completions.project_id is `not null references public.projects`
-- (Phase 11), but the frontend's InspectionStageCompletion type carries no
-- projectId field at all — every write site in qms/api/inspections.ts only
-- ever has a sheetId in scope. Rather than threading projectId through
-- every one of those call sites (a much larger, riskier change), this adds
-- a BEFORE INSERT trigger that derives it server-side from
-- inspection_sheets.project_id via the row's own sheet_id — the client
-- simply never sends project_id, and Postgres fills it in.
--
-- SECURITY DEFINER only to read inspection_sheets for the lookup itself
-- (the row being inserted is still fully subject to qms_stage_completions'
-- own RLS insert policy beforehand — this trigger does not bypass or
-- widen who can insert, it only fills in one column on an insert that was
-- already permitted).
--
-- BEFORE INSERT only (not UPDATE) is sufficient: sheet_id is immutable
-- once a completion row exists (nothing in the frontend ever changes it),
-- so project_id never needs to be re-derived after creation. Fires
-- correctly for both a plain INSERT and the INSERT-then-conflict path of
-- an upsert (Postgres runs BEFORE INSERT triggers before conflict
-- resolution either way).

begin;

create or replace function public.set_qms_stage_completion_project_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.project_id is null then
    select project_id into NEW.project_id
    from public.inspection_sheets
    where id = NEW.sheet_id;

    if NEW.project_id is null then
      raise exception 'sheet_id % does not reference an existing inspection_sheets row', NEW.sheet_id;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_qms_stage_completions_set_project_id on public.qms_stage_completions;
create trigger trg_qms_stage_completions_set_project_id
  before insert on public.qms_stage_completions
  for each row execute function public.set_qms_stage_completion_project_id();

insert into public.schema_migrations (version, description, checksum)
values (
  '20260818_047_phase47_qms_stage_completion_project_id_trigger',
  'Phase 47: adds a BEFORE INSERT trigger on qms_stage_completions that derives project_id from inspection_sheets.project_id via sheet_id, since the frontend InspectionStageCompletion type carries no projectId field and every write site only has a sheetId in scope. Client never sends project_id; Postgres fills it in. SECURITY DEFINER only for the internal lookup - does not widen who can insert (RLS insert policy still applies to the row as submitted).',
  'phase47-qms-stage-completion-project-id-trigger-v1'
)
on conflict (version) do nothing;

commit;
