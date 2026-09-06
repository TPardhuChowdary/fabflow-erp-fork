-- FabFlow ERP — Production ↔ Job Card ↔ Quantity integration.
--
-- Adds the one new relationship (job_cards.stage_id), the one genuinely
-- new quantity concept (project_production_stages.target_qty), the
-- workflow-type discriminator (project_production_stages.stage_type),
-- and the stage-to-stage material-flow provenance column
-- (production_stage_transactions.source_stage_id) — approved design,
-- see chat "Production ↔ Job Card ↔ Quantity Architecture Design".
--
-- REVISION 2 — four fixes made after your review of revision 1, before
-- any application:
--   1. upsert_project_production_stages(): target_qty/stage_type on
--      conflict now COALESCE(excluded.<col>, project_production_stages.<col>)
--      instead of a bare `= excluded.<col>` assignment. A bare assignment
--      would silently NULL out an already-saved target_qty/stage_type
--      whenever any other, unrelated stage save runs through this same
--      whole-set RPC without the calling code yet sending these two new
--      fields (true today, since no UI sends them yet). Verified this is
--      the ONLY exposure: job_cards.stage_id goes through a plain
--      PostgREST .update() (an omitted JS key never touches that column
--      in SQL — no analogous risk), and production_stage_transactions.
--      source_stage_id is only ever written via a fresh INSERT (no
--      existing value to erase). Known, accepted limitation of this
--      minimal fix: an already-set target_qty/stage_type cannot be
--      explicitly cleared back to NULL through this whole-set path
--      (JSON `null` and "key omitted" are indistinguishable once read via
--      ->>) — acceptable since no caller has a reason to null either
--      field out today; a future explicit "clear target" action would
--      need its own narrow update, not a change to this RPC.
--   2. validate_stage_transaction_source() now checks organization_id
--      equality between the source and destination stage, in addition to
--      the existing project_id check — mirrors
--      validate_job_card_stage_reference()'s own dual project+org check
--      exactly, rather than leaving this trigger asymmetric with it.
--   3. enforce_job_card_completed_quantity_approval()'s gating condition
--      widened from `OLD.stage_id is not null` to
--      `OLD.stage_id is not null or NEW.stage_id is not null` — closes a
--      real bypass: assigning a stage (and changing quantities in the
--      same UPDATE) to a legacy Completed card that currently has
--      stage_id NULL previously skipped the gate entirely, since only
--      OLD.stage_id was checked. A truly legacy Completed card that
--      stays stage-less (OLD and NEW stage_id both null) is unaffected —
--      its gated fields remain as freely editable as they are today.
--   4. New CHECK constraint on production_stage_transactions:
--      source_stage_id is null or type = 'send' — a receive transaction
--      can never carry stage-to-stage provenance, since "receiving from
--      another production stage" is not a real-world event this ledger
--      represents (only a downstream stage's `send` can be sourced from
--      an upstream stage's accepted output). Prevents a malformed
--      row from ever being written, rather than relying on application
--      code alone to avoid it.
--
-- Every addition is additive and nullable. No existing table, column,
-- policy, or trigger is dropped or altered, except one CREATE OR REPLACE
-- of upsert_project_production_stages() — required because that function
-- explicitly enumerates its own column list (not SELECT *); without this
-- replace, target_qty/stage_type would silently never persist through
-- the app's existing whole-stage-set save path. This revision's rewrite
-- was diffed, line by line, against the LIVE function body pulled
-- directly from the database via `supabase db query --linked` (not
-- assumed from a prior migration file) — confirmed identical except for
-- the two new columns and this revision's COALESCE change.
--
-- Backward compatibility, verified live before writing this file:
--   - 3 existing job_cards (2 InProgress, 1 NotStarted, 0 Completed),
--     across 3 different projects — all get stage_id = NULL, no backfill,
--     no inference from operation_type text.
--   - 12 existing project_production_stages, 0 with any
--     sent_to_vendor_id/sent_to_vendor_name set — all get
--     stage_type = NULL, no backfill, no inference from the vendor
--     sentinel convention (which is left completely untouched).
--   - 3 existing production_stage_transactions (2 send, 1 receive) — all
--     get source_stage_id = NULL, so the existing
--     pending = sum(send) - sum(receive) calculation is byte-for-byte
--     unchanged for every existing row (the new formula scopes `send` to
--     source_stage_id IS NULL for the "pending" figure specifically —
--     an application-layer read concern, not a schema change here); the
--     new CHECK constraint (fix 4) is satisfied trivially by every
--     existing row (source_stage_id already null on all of them).
--   - qms_stage_completions confirmed live to already hold more than one
--     completion row for the same stage_id (2 of its 3 rows share one
--     stage_id today) — the canonical "latest completed" selection rule
--     (MAX(completed_at) WHERE completed_at IS NOT NULL) is implemented
--     application-side, not by a new column/constraint here.
--
-- Idempotent throughout: every statement is safe to re-run.

begin;

-- ============================================================================
-- 1. job_cards.stage_id — the core new relationship.
-- ============================================================================

alter table public.job_cards
  add column if not exists stage_id uuid references public.project_production_stages(id) on delete set null;

create index if not exists idx_job_cards_org_stage
  on public.job_cards (organization_id, stage_id);

-- Enforces, at the database layer, that a job card's stage (when set)
-- belongs to the same project AND the same organization as the job card
-- itself — closes the "UI-only filtering is insufficient" requirement.
-- Structurally identical to the existing validate_rework_reference()
-- trigger on project_production_stages (Phase 11), extended with an
-- explicit organization check since job_cards.stage_id crosses two
-- independently-writable tables rather than one self-referencing column.
create or replace function public.validate_job_card_stage_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage_project uuid;
  v_stage_org uuid;
begin
  if NEW.stage_id is not null then
    select project_id, organization_id into v_stage_project, v_stage_org
    from public.project_production_stages
    where id = NEW.stage_id;

    if v_stage_project is null then
      raise exception 'stage_id % does not exist', NEW.stage_id;
    end if;

    if v_stage_project <> NEW.project_id then
      raise exception 'job card stage_id must belong to the same project (job card project %, stage project %)',
        NEW.project_id, v_stage_project;
    end if;

    if v_stage_org <> NEW.organization_id then
      raise exception 'job card stage_id must belong to the same organization (job card org %, stage org %)',
        NEW.organization_id, v_stage_org;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_validate_job_card_stage_reference on public.job_cards;
create trigger trg_validate_job_card_stage_reference
  before insert or update of stage_id, project_id
  on public.job_cards
  for each row execute function public.validate_job_card_stage_reference();

-- ============================================================================
-- 2. project_production_stages.target_qty / stage_type.
-- ============================================================================

alter table public.project_production_stages
  add column if not exists target_qty numeric check (target_qty > 0),
  add column if not exists stage_type text check (stage_type in ('inhouse','external'));

-- ============================================================================
-- 3. production_stage_transactions.source_stage_id — stage-to-stage
--    material flow, using the existing ledger (no new table).
-- ============================================================================

alter table public.production_stage_transactions
  add column if not exists source_stage_id uuid references public.project_production_stages(id) on delete set null;

-- Fix 4: a receive can never carry stage-to-stage provenance — only a
-- downstream stage's own `send` can be sourced from an upstream stage's
-- accepted output. Every existing row satisfies this trivially
-- (source_stage_id already null on all 3 of them).
alter table public.production_stage_transactions
  add constraint chk_production_stage_transactions_source_send_only
  check (source_stage_id is null or type = 'send');

create index if not exists idx_production_stage_transactions_source_stage
  on public.production_stage_transactions (source_stage_id)
  where source_stage_id is not null;

-- Same-project AND same-organization integrity for the source stage,
-- plus a self-reference guard (a stage cannot consume from itself).
-- Fix 2: now checks organization_id in addition to project_id, mirroring
-- validate_job_card_stage_reference()'s own dual check exactly.
create or replace function public.validate_stage_transaction_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dest_project uuid;
  v_dest_org uuid;
  v_source_project uuid;
  v_source_org uuid;
begin
  if NEW.source_stage_id is not null then
    if NEW.source_stage_id = NEW.stage_id then
      raise exception 'a stage cannot consume from itself (source_stage_id = stage_id)';
    end if;

    select project_id, organization_id into v_dest_project, v_dest_org
    from public.project_production_stages where id = NEW.stage_id;

    select project_id, organization_id into v_source_project, v_source_org
    from public.project_production_stages where id = NEW.source_stage_id;

    if v_source_project is null then
      raise exception 'source_stage_id % does not exist', NEW.source_stage_id;
    end if;

    if v_dest_project is null then
      raise exception 'stage_id % does not exist', NEW.stage_id;
    end if;

    if v_source_project <> v_dest_project then
      raise exception 'source_stage_id must belong to the same project as the destination stage (destination project %, source project %)',
        v_dest_project, v_source_project;
    end if;

    if v_source_org <> v_dest_org then
      raise exception 'source_stage_id must belong to the same organization as the destination stage (destination org %, source org %)',
        v_dest_org, v_source_org;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_validate_stage_transaction_source on public.production_stage_transactions;
create trigger trg_validate_stage_transaction_source
  before insert or update of source_stage_id, stage_id
  on public.production_stage_transactions
  for each row execute function public.validate_stage_transaction_source();

-- ============================================================================
-- 4. Completed Job Card quantity/stage approval gate + audit.
--    One merged BEFORE UPDATE trigger — validate-then-log in the same
--    pass, matching enforce_job_card_timer_transition's own established
--    shape.
--    Fix 3: gates on (OLD.stage_id is not null OR NEW.stage_id is not
--    null) — not OLD alone — so assigning a stage to a previously
--    stage-less Completed card in the same UPDATE that changes
--    quantities cannot bypass the gate. A card that stays stage-less
--    (OLD and NEW stage_id both null) keeps today's ungated behavior.
-- ============================================================================

create or replace function public.enforce_job_card_completed_quantity_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_changed boolean;
begin
  if OLD.status = 'Completed' and (OLD.stage_id is not null or NEW.stage_id is not null) then
    v_changed :=
      NEW.actual_completed_qty is distinct from OLD.actual_completed_qty
      or NEW.rejected_qty is distinct from OLD.rejected_qty
      or NEW.rework_qty is distinct from OLD.rework_qty
      or NEW.stage_id is distinct from OLD.stage_id;

    if v_changed then
      if not has_permission('job_cards', 'approve') then
        raise exception 'permission denied: changing quantities or stage on a completed job card (linked to a stage before or after this change) requires job_cards.approve';
      end if;

      select username into v_actor_name from public.profiles where id = v_actor;

      perform public.add_project_activity(
        NEW.project_id,
        'production_stage_update',
        format(
          'Job Card %s corrected after completion — accepted %s to %s, rejected %s to %s, rework %s to %s, stage %s to %s',
          NEW.job_no,
          OLD.actual_completed_qty, NEW.actual_completed_qty,
          OLD.rejected_qty, NEW.rejected_qty,
          OLD.rework_qty, NEW.rework_qty,
          coalesce(OLD.stage_id::text, 'none'), coalesce(NEW.stage_id::text, 'none')
        ),
        coalesce(v_actor_name, 'Unknown user'),
        jsonb_build_object(
          'jobCardId', NEW.id, 'jobNo', NEW.job_no,
          'oldActualCompletedQty', OLD.actual_completed_qty, 'newActualCompletedQty', NEW.actual_completed_qty,
          'oldRejectedQty', OLD.rejected_qty, 'newRejectedQty', NEW.rejected_qty,
          'oldReworkQty', OLD.rework_qty, 'newReworkQty', NEW.rework_qty,
          'oldStageId', OLD.stage_id, 'newStageId', NEW.stage_id
        )
      );
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_enforce_job_card_completed_quantity_approval on public.job_cards;
create trigger trg_enforce_job_card_completed_quantity_approval
  before update on public.job_cards
  for each row execute function public.enforce_job_card_completed_quantity_approval();

-- ============================================================================
-- 5. upsert_project_production_stages() — CREATE OR REPLACE to carry
--    target_qty/stage_type through the existing whole-set reconciliation.
--    Diffed against the LIVE function (pulled via
--    `supabase db query --linked 'select pg_get_functiondef(...)'`) before
--    writing this: identical except for target_qty/stage_type in the
--    INSERT column list and SELECT list, and fix 1's COALESCE-based
--    ON CONFLICT assignment for those same two columns (every other
--    ON CONFLICT assignment is untouched, still a bare `= excluded.*`,
--    exactly as live today).
-- ============================================================================

create or replace function public.upsert_project_production_stages(
  p_project_id uuid,
  p_stages jsonb
) returns setof public.project_production_stages
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not has_permission('production', 'edit') then
    raise exception 'permission denied';
  end if;

  if p_stages is null or jsonb_typeof(p_stages) <> 'array' then
    raise exception 'p_stages must be a jsonb array';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_stages) s
    where s->>'id' is null or s->>'stage_name' is null or s->>'position' is null
  ) then
    raise exception 'every stage in p_stages requires id, stage_name, and position';
  end if;

  delete from public.project_production_stages
  where project_id = p_project_id
    and organization_id = current_organization_id()
    and id not in (
      select (s->>'id')::uuid from jsonb_array_elements(p_stages) s
    );

  insert into public.project_production_stages (
    id, organization_id, project_id, stage_name, position, status, notes,
    requires_material_tracking, sent_qty, received_qty, ok_qty, rejected_qty,
    is_rework, rework_stage_name,
    sent_to_vendor_id, sent_to_vendor_name, sent_date_time, received_date_time, rework_qty,
    target_qty, stage_type
  )
  select
    (s->>'id')::uuid, current_organization_id(), p_project_id,
    s->>'stage_name', (s->>'position')::int,
    coalesce(s->>'status', 'NotStarted'), s->>'notes',
    coalesce((s->>'requires_material_tracking')::boolean, false),
    (s->>'sent_qty')::numeric, (s->>'received_qty')::numeric,
    (s->>'ok_qty')::numeric, (s->>'rejected_qty')::numeric,
    coalesce((s->>'is_rework')::boolean, false), s->>'rework_stage_name',
    (s->>'sent_to_vendor_id')::uuid, s->>'sent_to_vendor_name',
    (s->>'sent_date_time')::timestamptz, (s->>'received_date_time')::timestamptz,
    (s->>'rework_qty')::numeric,
    (s->>'target_qty')::numeric, s->>'stage_type'
  from jsonb_array_elements(p_stages) s
  on conflict (id) do update set
    stage_name = excluded.stage_name,
    position = excluded.position,
    status = excluded.status,
    notes = excluded.notes,
    requires_material_tracking = excluded.requires_material_tracking,
    sent_qty = excluded.sent_qty,
    received_qty = excluded.received_qty,
    ok_qty = excluded.ok_qty,
    rejected_qty = excluded.rejected_qty,
    is_rework = excluded.is_rework,
    rework_stage_name = excluded.rework_stage_name,
    sent_to_vendor_id = excluded.sent_to_vendor_id,
    sent_to_vendor_name = excluded.sent_to_vendor_name,
    sent_date_time = excluded.sent_date_time,
    received_date_time = excluded.received_date_time,
    rework_qty = excluded.rework_qty,
    -- Fix 1: preserve the existing value whenever the incoming payload
    -- doesn't carry this field (jsonb ->> returns NULL both when the key
    -- is absent and when it is explicitly null — indistinguishable here,
    -- so an already-set value is never silently erased by a save that
    -- doesn't know about these two fields yet).
    target_qty = coalesce(excluded.target_qty, project_production_stages.target_qty),
    stage_type = coalesce(excluded.stage_type, project_production_stages.stage_type),
    updated_at = now();

  update public.project_production_stages t
  set reference_stage_id = (s->>'reference_stage_id')::uuid
  from jsonb_array_elements(p_stages) s
  where t.id = (s->>'id')::uuid
    and t.project_id = p_project_id;

  return query
    select * from public.project_production_stages
    where project_id = p_project_id and organization_id = current_organization_id()
    order by position;
end;
$$;

-- ============================================================================
-- 6. Register migration.
-- ============================================================================

insert into public.schema_migrations (version, description, checksum)
values (
  '20260906060000_job_card_stage_link_and_quantities',
  'Production <-> Job Card <-> Quantity integration: adds job_cards.stage_id (nullable FK to project_production_stages, ON DELETE SET NULL, no backfill) with a same-project/same-org validating trigger; project_production_stages.target_qty and stage_type (both nullable, no backfill/inference); production_stage_transactions.source_stage_id (nullable FK, same-project/same-org validating trigger, CHECK source_stage_id is null or type=send) for stage-to-stage material flow via the existing ledger (no new table); a merged BEFORE UPDATE trigger on job_cards requiring job_cards.approve for actual_completed_qty/rejected_qty/rework_qty/stage_id edits on a Completed card linked to a stage before OR after the change, auditing via the existing add_project_activity()/production_stage_update mechanism; and a CREATE OR REPLACE of upsert_project_production_stages() (diffed against the live function via pg_get_functiondef before writing) to carry target_qty/stage_type through its existing whole-set reconciliation using COALESCE against the existing row so an unrelated stage save can never silently erase an already-set value. No existing table, column, policy, or trigger dropped or altered beyond that one function replace. No new table, no new permission, no RLS policy changes. Pre-flight verified live: 3 existing job_cards (0 Completed), 12 existing stages (0 with a vendor set), 3 existing transactions, qms_stage_completions already has 2 rows sharing one stage_id (confirms the app-layer MAX(completed_at) canonical-result rule is genuinely needed).',
  'job-card-stage-link-v2'
)
on conflict (version) do nothing;

commit;
