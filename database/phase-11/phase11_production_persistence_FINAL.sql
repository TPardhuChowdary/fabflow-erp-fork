-- ============================================================================
-- Phase 11 (SQL numbering): Production Persistence Model
-- ============================================================================
-- Version:     20260807_011_phase11_production_persistence
--
-- Disclosed incident: this archived file reflects a CORRECTED design, not
-- the briefly-live original. A real defect was caught during this same
-- session's own behavioral verification (not before): the original
-- section 6 added a trigger that reactively ran a full BOM-shortage
-- recompute (deleting the requisition once shortage reached zero) on ANY
-- inventory_items.current_stock change, including one caused by a
-- purchase. A live test - purchasing enough material to fully cover a
-- shortage - showed the requisition row being deleted instead of flipped
-- to "Ready to Complete", which does not match addMaterialPurchase()'s
-- actual, confirmed frontend behavior (store.ts): a purchase only flips a
-- Pending requisition's status when new stock covers its own
-- already-recorded shortage_qty, and never recomputes or deletes that
-- number. The reactive trigger was removed entirely and
-- record_material_purchase() (section 9) was rewritten to the corrected
-- rule, then re-verified with the same real scenario, which passed. Full
-- incident record: phase11_completion_report.md.
--
-- Scope:       Implements the persistence architecture designed in the
--              Phase 11-15 business investigation record (a separate,
--              conversation-level "Phase" numbering unrelated to this SQL
--              migration sequence, which continues 01-10). That record is
--              the sole source of truth for every design decision below;
--              nothing here invents new business behavior.
--
-- What this migration does NOT do (explicitly, per the authoritative
-- record):
--   - Does not make production_stages, material_requisitions,
--     project_materials, or logs authoritative. None is touched, dropped,
--     or altered. They remain exactly as they are - orphaned, not deleted.
--   - Does not merge Stage Send/Receive Material with Outsourced Work.
--   - Does not add a reconciliation relationship between Material Usage
--     and either Stage Send/Receive or Outsourced Work.
--   - Does not retire or remove the legacy stage-level quantity fields;
--     they persist independently of QMS stage completions.
--   - Does not add the material-availability gate to any ProjectDetail.tsx
--     code path (no frontend code is touched by this migration at all).
--   - Does not implement Material Reservation, WIP, project-level
--     Production Completion, automatic Activity Logging, a Production ->
--     Delivery Challan gate, or a Production -> Invoice dependency.
--   - Does not wire the Delivery Challan total-ordered-quantity dependency.
--     See section 0 below for the disclosed reason this was stopped.
--
-- Pre-implementation verification performed live against this database
-- before writing this file (read-only only, no writes):
--   A. projects.quantity vs frontend total-ordered-quantity: DISCREPANCY
--      FOUND, not reused. See section 0.
--   B. inventory_items / inventory_purchases+increase_stock() /
--      inventory_usages+prevent_negative_stock()+reduce_stock(): all
--      confirmed live, correct, and reused unmodified except for two
--      additive columns on inventory_purchases (section 2) and one
--      additive unique index on inventory_items (section 1).
--   C. invoices / invoice_items / payments and their functions: confirmed
--      live and correct; completely untouched by this migration.
--   D. delivery_challans: confirmed live and unchanged since Phase 10;
--      completely untouched by this migration (see section 0).
--   E. projects.customer_id: confirmed NOT NULL, FK to customers(id);
--      reused unmodified as the ownership link for every new project-level
--      table below.
--
-- Baseline captured before this migration (this session, read-only):
--   38 tables, 30 functions, 42 non-internal triggers (pg_trigger,
--   tgisinternal = false), 123 policies, 88 indexes, 10 schema_migrations
--   rows. (Note: a prior phase's own report cited "49/50" triggers using a
--   differently-scoped count; this file's own baseline/delta comparison
--   uses the tgisinternal-excluded count captured fresh this session, to
--   avoid comparing two different counting methodologies against each
--   other.)
--
-- Permission-module mapping (confirmed and disclosed, not silently
-- assumed):
--   A genuine, pre-existing frontend inconsistency was found while
--   preparing this migration: Production.tsx gates its stage actions on
--   the 'production' permission module (canEdit(currentUser,"production"),
--   confirmed live at Production.tsx:187), while ProjectDetail.tsx gates
--   its own, separate implementation of the same real-world actions
--   (status change, complete stage, send/receive material) on the
--   'projects' module (canEdit(currentUser,"projects"), confirmed live at
--   ProjectDetail.tsx:318). This is a distinct finding from, and consistent
--   with, the already-documented ProjectDetail material-gate inconsistency
--   (Decision 4, unresolved). Since both entry points are confirmed live
--   today, RLS policies for project_production_stages and
--   production_stage_transactions OR both modules together - this
--   preserves both currently-working paths exactly as they are, and
--   resolves neither this new module discrepancy nor Decision 4 by
--   guessing. Outsourced Work has only one confirmed implementation
--   (ProjectDetail.tsx, pAddOutsourced = pCreate = canCreate(currentUser,
--   "projects"), confirmed live at ProjectDetail.tsx:322) so its RLS uses
--   'projects' alone, with no ambiguity to OR against. BOM/Requisition RLS
--   reuses the pre-existing 'material_requisitions' permission module
--   (seeded in Phase 1) as the closest confirmed domain match; this
--   specific mapping was not independently re-traced to a specific
--   frontend permission check this session and is disclosed as inferred,
--   not confirmed. QMS stage completions RLS reuses the pre-existing
--   'inspection_sheets' permission module (seeded in Phase 1) for the same
--   reason - disclosed as inferred.
--
-- Idempotent: every statement below is safe to re-run against a database
-- that already has this migration applied.
-- ============================================================================

begin;

-- ============================================================================
-- 0. Delivery Challan total-ordered-quantity: STOPPED, disclosed here rather
--    than silently skipped.
-- ============================================================================
-- Phase 15 flagged projects.quantity as a "strong candidate, not
-- independently verified" match for the frontend's total-ordered-quantity
-- concept. Verified this session, read-only, against both sides:
--
--   DB:       projects.quantity  numeric NOT NULL, CHECK (quantity > 0)
--             (required at project creation, always positive)
--
--   Frontend: Project.totalQty?: number (types.ts) - CONFIRMED OPTIONAL.
--             DeliveryChallans.tsx's own getProjectTotalQty() returns
--             `project.totalQty ?? 0`, and the same file explicitly blocks
--             challan creation when a selected project's totalQty is null
--             ("Some selected projects do not have Total Quantity set.
--             Please update those projects first." - confirmed live at
--             DeliveryChallans.tsx, the projectsMissingQty check), which
--             only makes sense if a project can exist, today, with no
--             totalQty set at all.
--
-- These are not the same value: projects.quantity cannot be null and is
-- enforced positive from the moment a project is created; Project.totalQty
-- is confirmed optional, and the frontend has a real, reachable code path
-- for "a project exists but totalQty is unset." Reusing projects.quantity
-- would either force every project to have this value at creation
-- (changing today's confirmed-reachable "unset" state) or require
-- inventing a placeholder meaning for null, which was explicitly
-- prohibited. Per Phase 16 Part 16's own instruction, this portion is
-- stopped and reported rather than guessed. delivery_challans itself is
-- not touched by this migration - it was already fully built in Phase 10
-- and needs no new columns; only the dependency wiring for the
-- total-ordered-quantity check is withheld.

-- ============================================================================
-- 1. inventory_items - one additive unique index only.
--    Confirmed live this session: zero existing case-insensitive duplicate
--    names exist today (safe to add without any data conflict). This
--    index is what makes the find-or-create-by-name step in section 4
--    concurrency-safe (via INSERT ... ON CONFLICT), directly answering
--    Phase 16 Part 20 item 1.
-- ============================================================================

create unique index if not exists uq_inventory_items_org_name_ci
  on public.inventory_items (organization_id, lower(name));

-- ============================================================================
-- 2. inventory_purchases - two additive columns, needed to avoid losing
--    frontend-confirmed MaterialPurchase fields (thickness, project
--    linkage) that this table did not previously carry. increase_stock()
--    itself is reused completely unmodified.
-- ============================================================================

alter table public.inventory_purchases add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.inventory_purchases add column if not exists thickness text;

create index if not exists idx_inventory_purchases_org_project
  on public.inventory_purchases (organization_id, project_id);

-- ============================================================================
-- 3. project_production_stages - the authoritative per-project stage list.
--    Deliberately NOT named production_stages, to avoid ever being
--    confused with, or accidentally treated as, the orphaned table of that
--    name (left completely untouched - see section 10).
-- ============================================================================

create table if not exists public.project_production_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_name text not null,
  -- Explicit ordering, independent of stage identity - required so that
  -- insertion, deletion, and reordering can each happen without changing
  -- any other stage's identity (Phase 15 Part 4).
  position integer not null,
  status text not null default 'NotStarted',
  notes text,
  requires_material_tracking boolean not null default false,
  -- Legacy stage-level quantity fields (Phase 15 Part 7/11) - persisted
  -- independently of, and not merged with, qms_stage_completions
  -- (section 8). Nullable individually; the invariant in section 3b only
  -- applies once all three are set.
  sent_qty numeric,
  received_qty numeric,
  ok_qty numeric,
  rejected_qty numeric,
  -- Rework (Phase 15 Part 6): unified with the stage entity itself, not a
  -- parallel table - no compelling persistence reason was found to deviate
  -- from the frontend's own confirmed unified design.
  is_rework boolean not null default false,
  reference_stage_id uuid references public.project_production_stages(id) on delete set null,
  rework_stage_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_project_production_stages_project_position unique (project_id, position),
  constraint chk_project_production_stages_status check (status in ('NotStarted','Sent','InProgress','Completed','Received')),
  constraint chk_project_production_stages_qty_invariant check (
    ok_qty is null or rejected_qty is null or received_qty is null
    or (ok_qty + rejected_qty = received_qty)
  )
);

create index if not exists idx_project_production_stages_org_project
  on public.project_production_stages (organization_id, project_id);
create index if not exists idx_project_production_stages_reference
  on public.project_production_stages (reference_stage_id);

-- Rework must reference a stage in the same project (Phase 16 Part 8).
-- A plain self-referencing FK cannot express "same project" on its own,
-- so this is enforced with a small BEFORE trigger rather than a table
-- constraint (Postgres CHECK constraints cannot subquery another row).

create or replace function public.validate_rework_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref_project uuid;
begin
  if NEW.reference_stage_id is not null then
    select project_id into v_ref_project
    from public.project_production_stages
    where id = NEW.reference_stage_id;

    if v_ref_project is null then
      raise exception 'reference_stage_id % does not exist', NEW.reference_stage_id;
    end if;

    if v_ref_project <> NEW.project_id then
      raise exception 'rework reference_stage_id must belong to the same project (stage project %, reference project %)', NEW.project_id, v_ref_project;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_validate_rework_reference on public.project_production_stages;
create trigger trg_validate_rework_reference
  before insert or update of reference_stage_id, project_id
  on public.project_production_stages
  for each row execute function public.validate_rework_reference();

drop trigger if exists trg_project_production_stages_updated_at on public.project_production_stages;
create trigger trg_project_production_stages_updated_at
  before update on public.project_production_stages
  for each row execute function public.set_updated_at_timestamp();

-- ============================================================================
-- 4. production_stage_transactions - the independent Send/Receive ledger
--    (Phase 15 Part 5). Deliberately no FK/reference of any kind to
--    outsourced_works or inventory_usages - that relationship remains
--    Phase 14 Decision 1/2, unresolved, not guessed here.
-- ============================================================================

create table if not exists public.production_stage_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  stage_id uuid not null references public.project_production_stages(id) on delete cascade,
  type text not null,
  quantity numeric not null,
  event_time timestamptz not null default now(),
  vendor_id uuid references public.vendors(id) on delete set null,
  vendor_name text,
  created_at timestamptz not null default now(),
  constraint chk_production_stage_transactions_type check (type in ('send','receive')),
  constraint chk_production_stage_transactions_quantity check (quantity > 0)
);

create index if not exists idx_production_stage_transactions_org_stage
  on public.production_stage_transactions (organization_id, stage_id);

-- Cumulative received <= cumulative sent, safe under concurrency (Phase 16
-- Part 7 / Part 20 item 5). Locks the parent stage row FOR UPDATE before
-- aggregating - the same lock-before-aggregate pattern already
-- established in this database by prevent_negative_stock() and Phase 4's
-- expense_float_apply_recompute()/settle_expense_float() - so two
-- concurrent "receive" inserts against the same stage serialize on the
-- stage row lock instead of racing on a stale read of the running totals.

create or replace function public.enforce_stage_transaction_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_sent numeric;
  v_total_received numeric;
begin
  -- Lock the parent stage row first - this is what makes the check below
  -- safe under concurrent inserts targeting the same stage.
  perform 1 from public.project_production_stages where id = NEW.stage_id for update;

  if NEW.type = 'receive' then
    select coalesce(sum(quantity), 0) into v_total_sent
    from public.production_stage_transactions
    where stage_id = NEW.stage_id and type = 'send';

    select coalesce(sum(quantity), 0) into v_total_received
    from public.production_stage_transactions
    where stage_id = NEW.stage_id and type = 'receive';

    if v_total_received + NEW.quantity > v_total_sent then
      raise exception 'cannot receive % - cumulative received (%) would exceed cumulative sent (%) for stage %',
        NEW.quantity, v_total_received + NEW.quantity, v_total_sent, NEW.stage_id;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_enforce_stage_transaction_limit on public.production_stage_transactions;
create trigger trg_enforce_stage_transaction_limit
  before insert on public.production_stage_transactions
  for each row execute function public.enforce_stage_transaction_limit();

-- ============================================================================
-- 5. project_bom_items - project-specific material requirements (Phase 15
--    Part 3 #7). Deliberately NOT project_materials (orphaned, untouched -
--    see section 10) and not connected to stock_check() in any way.
-- ============================================================================

create table if not exists public.project_bom_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  project_id uuid not null references public.projects(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id),
  material_name text not null,
  required_quantity numeric not null,
  estimated_price numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_project_bom_items_required_quantity check (required_quantity >= 0)
);

create index if not exists idx_project_bom_items_org_project
  on public.project_bom_items (organization_id, project_id);
create index if not exists idx_project_bom_items_inventory_item
  on public.project_bom_items (inventory_item_id);

drop trigger if exists trg_project_bom_items_updated_at on public.project_bom_items;
create trigger trg_project_bom_items_updated_at
  before update on public.project_bom_items
  for each row execute function public.set_updated_at_timestamp();

-- ============================================================================
-- 6. bom_requisitions - the derived shortage/requisition (Phase 15 Part 7).
--    One requisition per BOM item (one-to-one-or-zero, matching the
--    frontend's confirmed derivation model). Deliberately NOT
--    material_requisitions (orphaned, untouched) and not fed by
--    stock_check() in any way.
-- ============================================================================

create table if not exists public.bom_requisitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  bom_item_id uuid not null references public.project_bom_items(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id),
  material_name text,
  required_qty numeric,
  available_qty numeric,
  shortage_qty numeric not null,
  estimated_price numeric,
  status text not null default 'Pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_bom_requisitions_bom_item unique (bom_item_id),
  constraint chk_bom_requisitions_shortage check (shortage_qty >= 0),
  constraint chk_bom_requisitions_status check (status in ('Pending','Ready to Complete','Completed'))
);

create index if not exists idx_bom_requisitions_org_project_status
  on public.bom_requisitions (organization_id, project_id, status);

-- Derivation function: recomputes shortage = max(required - available, 0)
-- for one BOM item, and applies the confirmed status-preservation rule
-- (a Completed requisition that develops a new shortage reopens as
-- Pending, never Ready to Complete - matching the frontend's own
-- updateBomItem logic exactly, Phase 13/15).

create or replace function public.recompute_bom_requisition(p_bom_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  v_available numeric;
  v_shortage numeric;
  v_existing record;
  v_new_status text;
begin
  select id, organization_id, project_id, inventory_item_id, material_name, required_quantity, estimated_price
  into b
  from public.project_bom_items
  where id = p_bom_item_id;

  if not found then
    -- BOM item itself was deleted; its requisition cascades via FK, nothing to do.
    return;
  end if;

  select coalesce(current_stock, 0) into v_available
  from public.inventory_items
  where id = b.inventory_item_id;

  v_shortage := greatest(coalesce(b.required_quantity, 0) - coalesce(v_available, 0), 0);

  select * into v_existing from public.bom_requisitions where bom_item_id = p_bom_item_id;

  if v_shortage > 0 then
    if found then
      v_new_status := case
        when v_existing.status = 'Completed' then 'Pending'
        when v_existing.status = 'Ready to Complete' then 'Pending'
        else v_existing.status
      end;

      update public.bom_requisitions
      set shortage_qty = v_shortage,
          required_qty = b.required_quantity,
          available_qty = v_available,
          estimated_price = b.estimated_price,
          material_name = b.material_name,
          status = v_new_status,
          updated_at = now()
      where bom_item_id = p_bom_item_id;
    else
      insert into public.bom_requisitions (
        organization_id, bom_item_id, project_id, inventory_item_id,
        material_name, required_qty, available_qty, shortage_qty,
        estimated_price, status
      ) values (
        b.organization_id, b.id, b.project_id, b.inventory_item_id,
        b.material_name, b.required_quantity, v_available, v_shortage,
        b.estimated_price, 'Pending'
      );
    end if;
  else
    -- No shortage: remove the requisition unless it is Completed, exactly
    -- matching the frontend's deleteBomItem/updateBomItem filter
    -- (r.status !== "Completed").
    if found and v_existing.status <> 'Completed' then
      delete from public.bom_requisitions where bom_item_id = p_bom_item_id;
    end if;
  end if;
end;
$$;

create or replace function public.trg_recompute_bom_requisition_on_bom_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    -- Requisition cascades via FK on delete of the BOM item; nothing
    -- further to recompute.
    return OLD;
  end if;
  perform public.recompute_bom_requisition(NEW.id);
  return NEW;
end;
$$;

drop trigger if exists trg_project_bom_items_recompute on public.project_bom_items;
create trigger trg_project_bom_items_recompute
  after insert or update of required_quantity, inventory_item_id
  on public.project_bom_items
  for each row execute function public.trg_recompute_bom_requisition_on_bom_item();

-- CORRECTED during this session's own behavioral verification (disclosed
-- in full, not hidden - see phase11_completion_report.md for the incident
-- record). The original version of this file added a reactive trigger
-- here that ran a FULL shortage recompute (deleting the requisition once
-- shortage reached zero) on ANY inventory_items.current_stock change,
-- including one caused by a purchase. A real behavioral test caught this:
-- purchasing enough material to cover a shortage caused the requisition
-- row to be deleted instead of flipped to "Ready to Complete" - not
-- matching addMaterialPurchase()'s actual, confirmed frontend behavior
-- (store.ts), which never recomputes or deletes shortage_qty from a
-- purchase - it only flips status when new stock covers the requisition's
-- own already-recorded shortage_qty. That reactive trigger has been
-- removed entirely; the corrected resolution logic now lives solely
-- inside record_material_purchase() (section 9), which is the only
-- place a purchase-driven resolution happens. project_bom_items' own
-- insert/update trigger above (matching addBomItem/updateBomItem's real
-- full-recompute-and-delete-if-zero behavior) is unaffected by this
-- correction and remains exactly as designed.

-- ============================================================================
-- 7. outsourced_works - independent, project-level (Phase 15 Part 10).
--    No FK/reference of any kind to production_stage_transactions.
-- ============================================================================

create table if not exists public.outsourced_works (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  project_id uuid not null references public.projects(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete set null,
  vendor_name text not null,
  material_sent text,
  quantity_sent numeric not null,
  date_sent date,
  date_received date,
  process_cost numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_outsourced_works_quantity check (quantity_sent > 0),
  constraint chk_outsourced_works_cost check (process_cost >= 0)
);

create index if not exists idx_outsourced_works_org_project
  on public.outsourced_works (organization_id, project_id);

drop trigger if exists trg_outsourced_works_updated_at on public.outsourced_works;
create trigger trg_outsourced_works_updated_at
  before update on public.outsourced_works
  for each row execute function public.set_updated_at_timestamp();

-- ============================================================================
-- 8. qms_stage_completions - independent persistence for QMS's confirmed
--    fields (Phase 16 Part 14), coexisting with, not replacing, the
--    legacy fields on project_production_stages (section 3).
--
--    Evidence basis: read live this session from
--    src/frontend/src/qms/types.ts, InspectionStageCompletion (fields
--    below) and InspectionSheet (confirming sheetId's owning project via
--    InspectionSheet.projectId, and confirming stageIds references
--    InspectionStageDefinition ids - QMS's own, independent stage-
--    definition id space, NOT project_production_stages.id).
--
--    Because inspection_sheets and inspection_stage_definitions tables do
--    not exist and were never in scope for this migration (only "QMS
--    Stage Completions" was named across Phase 15/16), sheet_id and
--    stage_id below are stored as plain reference columns, not foreign
--    keys - this is a disclosed scope boundary, not a silently-accepted
--    gap. project_id is a real FK, since Project ownership is directly
--    confirmed via the InspectionSheet.projectId chain.
-- ============================================================================

create table if not exists public.qms_stage_completions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  project_id uuid not null references public.projects(id) on delete cascade,
  sheet_id uuid not null,
  stage_id uuid not null,
  mode text not null,
  inspector_name text,
  signature_data_url text,
  remarks text,
  completed_at timestamptz,
  signed_at timestamptz,
  assigned_to text,
  assigned_to_name text,
  assigned_by text,
  assigned_at timestamptz,
  due_date date,
  accepted_qty numeric,
  rejected_qty numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_qms_stage_completions_mode check (mode in ('Paper','Digital'))
);

create index if not exists idx_qms_stage_completions_org_project
  on public.qms_stage_completions (organization_id, project_id);
create index if not exists idx_qms_stage_completions_sheet_stage
  on public.qms_stage_completions (sheet_id, stage_id);

drop trigger if exists trg_qms_stage_completions_updated_at on public.qms_stage_completions;
create trigger trg_qms_stage_completions_updated_at
  before update on public.qms_stage_completions
  for each row execute function public.set_updated_at_timestamp();

-- ============================================================================
-- 9. Material Purchase atomic operation (Phase 16 Part 11) and Activity
--    Log write path (Phase 16 Part 15).
-- ============================================================================

-- record_material_purchase(): the single sanctioned entry point that
-- reproduces addMaterialPurchase()'s full confirmed fan-out atomically -
-- find-or-create the inventory item by case-insensitive name (using the
-- unique index from section 1 via ON CONFLICT, safe under concurrent
-- calls for the same material name - Phase 16 Part 20 item 1), insert the
-- purchase (firing the existing, unmodified increase_stock() trigger -
-- Phase 16 Part 20 item 2), and resolve any covered BOM requisition. As a
-- single PL/pgSQL function call this executes as one atomic unit - it
-- either fully commits or fully rolls back, matching the frontend's own
-- single set() call.

create or replace function public.record_material_purchase(
  p_project_id uuid,
  p_material_type text,
  p_thickness text,
  p_quantity numeric,
  p_unit text,
  p_supplier_name text,
  p_vendor_id uuid,
  p_purchase_date date,
  p_attachments jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_item_id uuid;
  v_purchase_id uuid;
  v_new_stock numeric;
begin
  if not (has_permission('inventory','create') or has_permission('production','create') or has_permission('projects','create')) then
    raise exception 'permission denied for record_material_purchase';
  end if;

  -- Find-or-create by case-insensitive name, race-safe via the unique
  -- index added in section 1.
  insert into public.inventory_items (organization_id, name, unit, current_stock)
  values (v_org, p_material_type, coalesce(p_unit, 'units'), 0)
  on conflict (organization_id, lower(name)) do nothing;

  select id into v_item_id
  from public.inventory_items
  where organization_id = v_org and lower(name) = lower(p_material_type);

  -- Purchase record + stock increase: reuses inventory_purchases +
  -- increase_stock() completely unmodified.
  insert into public.inventory_purchases (
    organization_id, vendor_id, inventory_item_id, quantity,
    material_name, supplier_name, purchase_date, attachments,
    project_id, thickness
  ) values (
    v_org, p_vendor_id, v_item_id, p_quantity,
    p_material_type, p_supplier_name, p_purchase_date, p_attachments,
    p_project_id, p_thickness
  )
  returning id into v_purchase_id;

  -- CORRECTED (see section 6's header note and phase11_completion_report.md
  -- for the disclosed incident): matches addMaterialPurchase() exactly -
  -- flip a Pending requisition to Ready to Complete only when the NEW
  -- stock level covers its OWN already-recorded shortage_qty. Never
  -- recomputes or deletes shortage_qty here - that full recomputation
  -- belongs only to project_bom_items edits (section 6's own trigger).
  select current_stock into v_new_stock from public.inventory_items where id = v_item_id;

  update public.bom_requisitions
  set status = 'Ready to Complete', updated_at = now()
  where project_id = p_project_id
    and inventory_item_id = v_item_id
    and status = 'Pending'
    and v_new_stock >= shortage_qty;

  return v_purchase_id;
end;
$$;

-- add_project_activity(): the sanctioned manual-note write path (Phase 16
-- Part 15). Reuses projects.activity_log jsonb directly. Deliberately the
-- ONLY write path created by this migration for activity_log - no trigger
-- anywhere in this file calls this function automatically. Matches
-- addProjectActivity()'s confirmed parameter shape exactly.

create or replace function public.add_project_activity(
  p_project_id uuid,
  p_type text,
  p_description text,
  p_performed_by text,
  p_metadata jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry jsonb;
begin
  if not (has_permission('projects','edit') or has_permission('production','edit')) then
    raise exception 'permission denied for add_project_activity';
  end if;

  v_entry := jsonb_build_object(
    'id', gen_random_uuid()::text,
    'type', p_type,
    'description', p_description,
    'performedBy', p_performed_by,
    'metadata', p_metadata,
    'timestamp', extract(epoch from now()) * 1000
  );

  update public.projects
  set activity_log = coalesce(activity_log, '[]'::jsonb) || jsonb_build_array(v_entry)
  where id = p_project_id
    and organization_id = public.current_organization_id();
end;
$$;

-- ============================================================================
-- 10. RLS + policies for every new table.
--     Existing orphaned objects (production_stages, material_requisitions,
--     project_materials, logs) are NOT touched anywhere in this file -
--     their existing RLS/policies remain exactly as they were.
-- ============================================================================

alter table public.project_production_stages enable row level security;
drop policy if exists project_production_stages_select on public.project_production_stages;
create policy project_production_stages_select on public.project_production_stages for select
  using ((has_permission('production','view') or has_permission('projects','view')) and organization_id = current_organization_id());
drop policy if exists project_production_stages_insert on public.project_production_stages;
create policy project_production_stages_insert on public.project_production_stages for insert
  with check ((has_permission('production','edit') or has_permission('projects','edit') or has_permission('production','create') or has_permission('projects','create')) and organization_id = current_organization_id());
drop policy if exists project_production_stages_update on public.project_production_stages;
create policy project_production_stages_update on public.project_production_stages for update
  using ((has_permission('production','edit') or has_permission('projects','edit')) and organization_id = current_organization_id())
  with check ((has_permission('production','edit') or has_permission('projects','edit')) and organization_id = current_organization_id());
drop policy if exists project_production_stages_delete on public.project_production_stages;
create policy project_production_stages_delete on public.project_production_stages for delete
  using ((has_permission('production','delete') or has_permission('projects','delete')) and organization_id = current_organization_id());

alter table public.production_stage_transactions enable row level security;
drop policy if exists production_stage_transactions_select on public.production_stage_transactions;
create policy production_stage_transactions_select on public.production_stage_transactions for select
  using ((has_permission('production','view') or has_permission('projects','view')) and organization_id = current_organization_id());
drop policy if exists production_stage_transactions_insert on public.production_stage_transactions;
create policy production_stage_transactions_insert on public.production_stage_transactions for insert
  with check ((has_permission('production','edit') or has_permission('projects','edit')) and organization_id = current_organization_id());
drop policy if exists production_stage_transactions_delete on public.production_stage_transactions;
create policy production_stage_transactions_delete on public.production_stage_transactions for delete
  using ((has_permission('production','delete') or has_permission('projects','delete')) and organization_id = current_organization_id());

alter table public.project_bom_items enable row level security;
drop policy if exists project_bom_items_select on public.project_bom_items;
create policy project_bom_items_select on public.project_bom_items for select
  using (has_permission('material_requisitions','view') and organization_id = current_organization_id());
drop policy if exists project_bom_items_insert on public.project_bom_items;
create policy project_bom_items_insert on public.project_bom_items for insert
  with check (has_permission('material_requisitions','create') and organization_id = current_organization_id());
drop policy if exists project_bom_items_update on public.project_bom_items;
create policy project_bom_items_update on public.project_bom_items for update
  using (has_permission('material_requisitions','edit') and organization_id = current_organization_id())
  with check (has_permission('material_requisitions','edit') and organization_id = current_organization_id());
drop policy if exists project_bom_items_delete on public.project_bom_items;
create policy project_bom_items_delete on public.project_bom_items for delete
  using (has_permission('material_requisitions','delete') and organization_id = current_organization_id());

alter table public.bom_requisitions enable row level security;
drop policy if exists bom_requisitions_select on public.bom_requisitions;
create policy bom_requisitions_select on public.bom_requisitions for select
  using (has_permission('material_requisitions','view') and organization_id = current_organization_id());
-- No direct insert/update/delete policies for ordinary users: requisitions
-- are derived-only (Phase 13/15/16 rule - "users must not manually create
-- arbitrary requisitions"). All writes happen through
-- recompute_bom_requisition(), a SECURITY DEFINER function that bypasses
-- RLS by design, exactly like Phase 4's expense_float_apply_recompute().
drop policy if exists bom_requisitions_approve on public.bom_requisitions;
create policy bom_requisitions_approve on public.bom_requisitions for update
  using (has_permission('material_requisitions','approve') and organization_id = current_organization_id())
  with check (has_permission('material_requisitions','approve') and organization_id = current_organization_id());

alter table public.outsourced_works enable row level security;
drop policy if exists outsourced_works_select on public.outsourced_works;
create policy outsourced_works_select on public.outsourced_works for select
  using (has_permission('projects','view') and organization_id = current_organization_id());
drop policy if exists outsourced_works_insert on public.outsourced_works;
create policy outsourced_works_insert on public.outsourced_works for insert
  with check (has_permission('projects','create') and organization_id = current_organization_id());
drop policy if exists outsourced_works_update on public.outsourced_works;
create policy outsourced_works_update on public.outsourced_works for update
  using (has_permission('projects','edit') and organization_id = current_organization_id())
  with check (has_permission('projects','edit') and organization_id = current_organization_id());
drop policy if exists outsourced_works_delete on public.outsourced_works;
create policy outsourced_works_delete on public.outsourced_works for delete
  using (has_permission('projects','delete') and organization_id = current_organization_id());

alter table public.qms_stage_completions enable row level security;
drop policy if exists qms_stage_completions_select on public.qms_stage_completions;
create policy qms_stage_completions_select on public.qms_stage_completions for select
  using (has_permission('inspection_sheets','view') and organization_id = current_organization_id());
drop policy if exists qms_stage_completions_insert on public.qms_stage_completions;
create policy qms_stage_completions_insert on public.qms_stage_completions for insert
  with check (has_permission('inspection_sheets','complete') and organization_id = current_organization_id());
drop policy if exists qms_stage_completions_update on public.qms_stage_completions;
create policy qms_stage_completions_update on public.qms_stage_completions for update
  using (has_permission('inspection_sheets','complete') and organization_id = current_organization_id())
  with check (has_permission('inspection_sheets','complete') and organization_id = current_organization_id());

-- inventory_purchases already has correct RLS from prior phases; the two
-- new nullable columns added in section 2 require no policy changes.

-- ============================================================================
-- 11. Register this migration.
-- ============================================================================

insert into public.schema_migrations (version, description, checksum)
values (
  '20260807_011_phase11_production_persistence',
  'Production persistence model per the Phase 11-15 business investigation record: project_production_stages (per-project ordered stages, unified rework via self-referencing reference_stage_id, legacy quantity fields), production_stage_transactions (independent Send/Receive ledger with concurrency-safe cumulative-limit trigger), project_bom_items + bom_requisitions (derived-only, recomputed on BOM edit only - see correction below), outsourced_works (independent, no relation to stage transactions), qms_stage_completions (independent, evidence-based on qms/types.ts, sheet_id/stage_id deliberately unFK-d - inspection_sheets/stage_definitions tables out of scope), record_material_purchase() (atomic find-or-create + purchase + stock increase + requisition resolution), add_project_activity() (manual-only write path to projects.activity_log, no automatic triggers). inventory_purchases extended with project_id/thickness. One unique index added to inventory_items (org, lower(name)) for race-safe find-or-create. Delivery Challan total-ordered-quantity dependency deliberately NOT wired: projects.quantity (NOT NULL) does not match the frontend''s confirmed-optional Project.totalQty - discrepancy disclosed in section 0, not guessed. production_stages/material_requisitions/project_materials/logs left completely untouched, still orphaned, not deleted. No frontend code modified. CORRECTED during this session''s own behavioral verification: removed a reactive on-any-stock-change trigger that incorrectly deleted covered requisitions instead of flipping them to Ready to Complete; record_material_purchase() rewritten to match addMaterialPurchase()''s real behavior exactly (flip status only, never recompute/delete shortage_qty). Full incident disclosed in this file''s header and in phase11_completion_report.md.',
  'e2a8e8daf5a1cd884bf7bc01310affe511049de1d80923688ac2201af7964986'
)
on conflict (version) do nothing;

commit;
