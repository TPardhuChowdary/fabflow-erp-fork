-- Production Stage Lines (see chat, "Production Stage Lines" schema
-- proposal) — REVIEW ONLY, NOT APPLIED. Do not run supabase db push
-- against this file until explicitly approved.
--
-- Problem: one project_production_stages row (e.g. "CNC Cutting") today
-- has exactly one implicit work stream. Real jobs split one stage across
-- multiple outsourced/work lines (Side Panel -> Vendor A, Top Panel ->
-- Vendor A, Bracket -> Vendor B), each with its own planned qty and its
-- own send/receive history. production_stage_transactions is already a
-- clean append-only send/receive ledger scoped to stage_id; it just has
-- no way to say WHICH line within the stage a transaction belongs to.
--
-- Design: add production_stage_lines as a child of project_production_stages,
-- and an ADDITIVE nullable line_id FK on the existing
-- production_stage_transactions table. Every existing transaction gets
-- line_id = null after this migration, which is defined here to mean
-- exactly what it means today: a stage-wide transaction, not tied to a
-- line. The pre-existing enforce_stage_transaction_limit() stage-wide
-- guard is untouched and keeps validating every transaction (line-tagged
-- or not) at the stage level. A second, new trigger adds a PER-LINE
-- guard that only fires when line_id is set, so a line can't over-receive
-- just because the stage-wide total hasn't been exceeded yet.
--
-- Stages that don't adopt lines keep working exactly as before: zero
-- lines, zero line-tagged transactions, same trigger, same behavior.
-- Stages that DO adopt lines simply never populate
-- project_production_stages.sent_qty/received_qty/ok_qty/rejected_qty
-- (those stay at their column defaults for such stages) — aggregation
-- for a line-based stage is computed by summing its lines' transactions,
-- not duplicated into the parent row. This avoids a second place that
-- has to be kept in sync and matches "prefer the normalized structure."

create table public.production_stage_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  stage_id uuid not null references public.project_production_stages(id) on delete cascade,
  work_type text not null,
  material text,
  vendor_id uuid references public.vendors(id) on delete set null,
  vendor_name text,
  planned_qty numeric not null,
  uom text not null default 'pcs',
  status text not null default 'NotStarted',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_production_stage_lines_planned_qty check (planned_qty > 0),
  constraint chk_production_stage_lines_status check (
    status in ('NotStarted', 'PartiallySent', 'Sent', 'PartiallyReceived', 'Completed')
  )
);

create index idx_production_stage_lines_org_stage
  on public.production_stage_lines (organization_id, stage_id);
create index idx_production_stage_lines_vendor
  on public.production_stage_lines (vendor_id);

create trigger trg_production_stage_lines_updated_at
  before update on public.production_stage_lines
  for each row execute function public.set_updated_at_timestamp();

-- Additive: existing rows all get line_id = null (unchanged meaning).
alter table public.production_stage_transactions
  add column line_id uuid references public.production_stage_lines(id) on delete set null;

create index idx_production_stage_transactions_line
  on public.production_stage_transactions (line_id);

comment on column public.production_stage_transactions.line_id is
  'Optional FK to production_stage_lines(id) -- which outsourcing/work line within the stage this send or receive belongs to. NULL (the value on every pre-existing row) means a stage-wide transaction, exactly as before this column existed. ON DELETE SET NULL so deleting a line never deletes its transaction history.';

-- Per-line over-receipt guard. Mirrors enforce_stage_transaction_limit's
-- own logic exactly, scoped to line_id instead of stage_id, and only
-- runs when a transaction is tagged with a line (line_id is null ->
-- no-op, the existing stage-wide trigger is the sole guard for those).
-- Also validates the line actually belongs to the stage named on the
-- same transaction row, since a CHECK constraint can't cross tables.
create or replace function public.enforce_stage_line_transaction_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line_stage_id uuid;
  v_total_sent numeric;
  v_total_received numeric;
begin
  if new.line_id is null then
    return new;
  end if;

  select stage_id into v_line_stage_id
  from public.production_stage_lines
  where id = new.line_id
  for update;

  if v_line_stage_id is null then
    raise exception 'line % does not exist', new.line_id;
  end if;

  if v_line_stage_id <> new.stage_id then
    raise exception 'line % belongs to stage %, not stage %', new.line_id, v_line_stage_id, new.stage_id;
  end if;

  if new.type = 'receive' then
    select coalesce(sum(quantity), 0) into v_total_sent
    from public.production_stage_transactions
    where line_id = new.line_id and type = 'send';

    select coalesce(sum(quantity), 0) into v_total_received
    from public.production_stage_transactions
    where line_id = new.line_id and type = 'receive';

    if v_total_received + new.quantity > v_total_sent then
      raise exception 'cannot receive % for line % - cumulative received (%) would exceed cumulative sent (%)',
        new.quantity, new.line_id, v_total_received + new.quantity, v_total_sent;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_enforce_stage_line_transaction_limit
  before insert on public.production_stage_transactions
  for each row execute function public.enforce_stage_line_transaction_limit();

-- RLS: exact mirror of production_stage_transactions'/project_production_stages'
-- own has_permission('production'|'projects', verb) + org-match pattern.
alter table public.production_stage_lines enable row level security;

create policy production_stage_lines_select on public.production_stage_lines
  for select using (
    (has_permission('production', 'view') or has_permission('projects', 'view'))
    and organization_id = current_organization_id()
  );

create policy production_stage_lines_insert on public.production_stage_lines
  for insert with check (
    (has_permission('production', 'edit') or has_permission('projects', 'edit'))
    and organization_id = current_organization_id()
  );

create policy production_stage_lines_update on public.production_stage_lines
  for update using (
    (has_permission('production', 'edit') or has_permission('projects', 'edit'))
    and organization_id = current_organization_id()
  ) with check (
    (has_permission('production', 'edit') or has_permission('projects', 'edit'))
    and organization_id = current_organization_id()
  );

create policy production_stage_lines_delete on public.production_stage_lines
  for delete using (
    (has_permission('production', 'delete') or has_permission('projects', 'delete'))
    and organization_id = current_organization_id()
  );
