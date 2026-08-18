-- FabFlow ERP — Phase 45: activate project_production_stages /
-- production_stage_transactions (close the "Production Stage Completions"
-- local-only exception).
--
-- Both tables were built in Phase 11, fully RLS-complete, and deliberately
-- left at 0 rows pending "an explicit future request" (see
-- database/phase-28/PHASE28_INVESTIGATION.md,
-- database/phase-32/PHASE32_PERSISTENCE_ARCHITECTURE.md). That request has
-- now been made. This migration only:
--   1. Adds 5 additive columns for live frontend fields that Phase 11 did
--      not yet have (sentToVendorId/Name, sentDateTime, receivedDateTime,
--      reworkQty — confirmed live via direct grep against
--      ProjectProductionStage in src/types.ts; startTime/endTime/
--      assignedTo/the four WIP-quantity fields are confirmed dead — zero
--      read usage anywhere — and are deliberately NOT migrated).
--   2. Makes the existing (project_id, position) unique constraint
--      deferrable, so a single reconciliation call can upsert a whole
--      stage set — including reordering two stages' positions — without a
--      transient mid-transaction collision.
--   3. Adds upsert_project_production_stages(), an atomic, single-call
--      reconciliation RPC. The frontend's existing local semantics
--      (upsertProjectProduction) always replace a project's whole stage
--      set on every save; doing that against Supabase as two separate
--      client calls (delete, then insert) would be non-atomic — a network
--      failure between the two calls could leave a project showing zero
--      stages. This RPC does the whole reconciliation in one statement
--      batch, on the server, inside one transaction: remove stages no
--      longer present, then upsert every incoming stage BY ITS EXISTING
--      ID (never drop-and-regenerate), so a project's stage set is never
--      briefly empty and every stage's client-generated stageId — already
--      shared with the Phase-32 QMS-gate tables — is preserved across
--      every save.
--
-- SECURITY INVOKER (the default, stated explicitly): the RPC runs as the
-- calling user, so has_permission()/organization_id = current_organization_id()
-- on the underlying table are still the real enforcement boundary — this
-- function is a convenience wrapper for atomicity, not a permission
-- bypass. It re-checks has_permission('production','edit') itself before
-- doing anything, matching the table's own RLS insert/update policy.
--
-- No table is dropped, no existing column is altered/removed, no existing
-- constraint is dropped (only made deferrable), no existing RLS policy is
-- touched.

begin;

alter table public.project_production_stages
  add column if not exists sent_to_vendor_id uuid references public.vendors(id) on delete set null,
  add column if not exists sent_to_vendor_name text,
  add column if not exists sent_date_time timestamptz,
  add column if not exists received_date_time timestamptz,
  add column if not exists rework_qty numeric;

-- Deferred so a reconciliation batch can momentarily hold two stages at
-- the same (project_id, position) mid-statement (e.g. two stages swapping
-- order) — checked once at the end of the RPC's implicit transaction
-- instead of after every row. Postgres only supports "ALTER TABLE ...
-- ALTER CONSTRAINT" for foreign keys — a unique constraint's deferrability
-- can only be set at creation time, so this drops and re-adds it (same
-- name, same columns, purely additive in effect — no data is touched and
-- the constraint is never actually absent mid-migration since this all
-- runs inside one transaction).
alter table public.project_production_stages
  drop constraint uq_project_production_stages_project_position;
alter table public.project_production_stages
  add constraint uq_project_production_stages_project_position
  unique (project_id, position) deferrable initially deferred;

create or replace function public.upsert_project_production_stages(
  p_project_id uuid,
  -- Array of {id, stage_name, position, status, notes,
  -- requires_material_tracking, sent_qty, received_qty, ok_qty,
  -- rejected_qty, is_rework, reference_stage_id, rework_stage_name,
  -- sent_to_vendor_id, sent_to_vendor_name, sent_date_time,
  -- received_date_time, rework_qty}. `id` is required on every element —
  -- always the frontend's client-generated stageId, never omitted.
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

  -- Fail loudly on a malformed element rather than silently letting a
  -- NULL slip into the "id not in (...)" subquery below, which would
  -- otherwise make that whole DELETE a no-op (NULL-in-list poisons NOT
  -- IN) and mask the bug as "nothing got cleaned up."
  if exists (
    select 1 from jsonb_array_elements(p_stages) s
    where s->>'id' is null or s->>'stage_name' is null or s->>'position' is null
  ) then
    raise exception 'every stage in p_stages requires id, stage_name, and position';
  end if;

  -- 1. Remove stages that are no longer present in the incoming set (a
  -- real user-initiated stage deletion). ON DELETE SET NULL on
  -- reference_stage_id means any remaining rework stage that pointed at a
  -- removed stage is safely nulled here, not left dangling.
  delete from public.project_production_stages
  where project_id = p_project_id
    and organization_id = current_organization_id()
    and id not in (
      select (s->>'id')::uuid from jsonb_array_elements(p_stages) s
    );

  -- 2. Upsert every incoming stage BY ITS EXISTING ID, with
  -- reference_stage_id left null for now — deferred to pass 3 below so a
  -- rework stage can reference a sibling stage being created in this same
  -- batch without a same-statement visibility/ordering hazard.
  insert into public.project_production_stages (
    id, organization_id, project_id, stage_name, position, status, notes,
    requires_material_tracking, sent_qty, received_qty, ok_qty, rejected_qty,
    is_rework, rework_stage_name,
    sent_to_vendor_id, sent_to_vendor_name, sent_date_time, received_date_time, rework_qty
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
    (s->>'rework_qty')::numeric
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
    updated_at = now();

  -- 3. Second pass — now that every stage in the batch definitely exists,
  -- set (or clear) reference_stage_id from the incoming payload. A plain
  -- per-row assignment, including to null when the payload omits it (that
  -- correctly clears a rework reference that was removed).
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

revoke all on function public.upsert_project_production_stages(uuid, jsonb) from public;
grant execute on function public.upsert_project_production_stages(uuid, jsonb) to authenticated;

insert into public.schema_migrations (version, description, checksum)
values (
  '20260818_045_phase45_production_stages_activate',
  'Phase 45: activates the dormant Phase-11 project_production_stages/production_stage_transactions tables (closes the Production Stage Completions local-only exception). Adds 5 additive columns (sent_to_vendor_id, sent_to_vendor_name, sent_date_time, received_date_time, rework_qty) for confirmed-live frontend fields. Makes (project_id, position) deferrable to support atomic reordering. Adds upsert_project_production_stages() SECURITY INVOKER RPC — a single-call, single-transaction reconciliation that upserts a project''s whole stage set by stable stageId (never drop-and-regenerate) and removes only stages no longer present, so a partial failure can never leave a project''s stages missing. Re-enforces has_permission(''production'',''edit'') itself; does not bypass RLS.',
  'phase45-production-stages-activate-v1'
)
on conflict (version) do nothing;

commit;
