-- Production Material Transactions (see chat, "Production Material
-- Conversion — Migration Design", Option B approved, REVISED per
-- "Architecture Clarifications" review) — REVIEW ONLY, NOT APPLIED. Do
-- not run supabase db push against this file until explicitly approved.
--
-- Problem (full trace in the preceding read-only audit): the existing
-- production_stage_transactions ledger assumes send and receive are
-- the SAME item in the SAME quantity dimension (its own over-receipt
-- trigger literally checks received > sent on one shared `quantity`
-- column) and has no inventory_item_id at all — a Production
-- send/receive never touches inventory_items.current_stock, in either
-- direction. There is also no concept anywhere of "this output was
-- produced by consuming that input" (a conversion/consumption
-- relationship), no structured operation/performer, and no way for
-- vendor-supplied semi-finished material to enter Production as a
-- first-class event.
--
-- This migration adds ONE new table representing exactly that missing
-- relationship: INPUT ITEM -> OPERATION -> PERFORMER -> OUTPUT ITEM,
-- with optional Stage/Job Card context. It is purely additive and
-- coexists with, not replaces, the existing planning/history layer:
--
--   project_production_stages   -- planned sequence/grouping (unchanged)
--   production_stage_lines      -- outsourcing work lines (unchanged)
--   production_stage_transactions -- stage-level send/receive ledger (unchanged)
--   job_cards / job_card_time_events / job_card_employee_assignments (unchanged)
--   company_pos / receive_company_po_item() / inventory_purchases (unchanged
--     — see "F" below, the vendor-supply vs PO-receipt boundary)
--
-- ============================================================
-- F. VENDOR-SUPPLIED STOCK BOUNDARY — BUSINESS RULE, ENTER ONCE,
--    NEVER BOTH
-- ============================================================
-- A physical vendor delivery must enter inventory through exactly ONE
-- of these two paths, never both:
--
--   A. Company PO / Inventory Purchase (inventory_purchases, written
--      by receive_company_po_item() OR Inventory.tsx's own standalone
--      "Record Purchase" flow — both already exist and independently
--      trigger an increase today, confirmed live) — meaning "we
--      purchased/received this inventory."
--
--   B. Vendor-supplied Production Material Transaction (this table,
--      input_item_id IS NULL) — meaning "this vendor performed a
--      production operation and supplied the resulting output," never
--      a generic purchase/receiving mechanism.
--
-- There is no shared row, no FK, and no automatic reconciliation
-- between production_material_transactions and inventory_purchases in
-- this design — deliberately, per "do not modify the existing Company
-- PO receiving flow in this task," and per "do not add a PO
-- relationship." Both tables independently trigger an increase to the
-- SAME inventory_items.current_stock column. The migration itself does
-- NOT create an automatic duplicate — no trigger, RPC, or code path
-- here fires as a side effect of the other. A double-count can only
-- happen if a user deliberately (or mistakenly) records the SAME
-- physical delivery through both A and B — that is a workflow/process
-- discipline matter for the screens built on top of this table later,
-- not a defect in this schema. This exact same pre-existing risk
-- already exists today between receive_company_po_item() and
-- Inventory.tsx's "Record Purchase" (two independent triggers, no
-- cross-check, confirmed live) — this migration does not introduce a
-- new category of risk, it adds a third path with the same, already-
-- accepted characteristic.
--
-- The distinguishing question that decides which path to use is NOT
-- "did a vendor deliver something" (true in both cases) — it is
-- "did an operation happen": inventory_purchases (via either entry
-- point) has no `operation` concept at all and represents a pure
-- buy/receive event. production_material_transactions.operation is
-- NOT NULL — every row, including a vendor-supplied one, represents a
-- specific process (Cutting, Bending, ...) whose output is entering
-- stock. A vendor-supplied production_material_transactions row (input
-- NULL) must be used specifically for "vendor performed operation X
-- on material that was never issued from our stock, and delivered the
-- result" — e.g. Saptagiri cuts a sheet they already had and delivers
-- Cut Left Side. It must NOT be presented, in any future UI, as
-- another generic purchase mechanism, and must NOT be used as a
-- substitute for receiving
-- an ordinary Company PO line — that PO's line item, once billed and
-- received, belongs in inventory_purchases via the existing flow, not
-- here. This is a workflow/labeling rule enforced by which screen the
-- user is on, not a DB constraint — the DB cannot know whether a given
-- real-world delivery was already billed on a PO. No column has been
-- added to bridge the two tables; if you want an optional cross-
-- reference later (e.g. a nullable company_po_id on this table purely
-- for audit linking, never enforced) that is a separate, later
-- decision, not part of this migration.
--
-- ============================================================
-- I. TRACEABILITY — ITEM-LEVEL PRODUCTION LINEAGE IS QUERYABLE, BUT
--    PHYSICAL/BATCH-LEVEL LINEAGE IS NOT DETERMINISTIC
-- ============================================================
-- Confirmed as requested: given an output item B, querying this table
-- WHERE output_item_id = B finds every transaction that ever produced
-- some quantity of B, and each such row's input_item_id names the
-- input item A that transaction consumed (if any). Walking this
-- backward (B's producing transaction(s) -> input item A -> A's own
-- producing transaction(s) -> ...) is fully traversable and answers
-- "what chain of operations/items led to this item existing" — that
-- traversal is what "item-level production lineage is queryable" means
-- here.
--
-- What is NOT deterministic: if multiple transactions have produced
-- the same inventory item (e.g. two separate Cutting transactions both
-- adding to Cut Left Side's stock), the system cannot determine which
-- exact physical quantity/batch was consumed by a later transaction
-- that draws on that same item. inventory_items.current_stock is one
-- pooled number per item, not per batch — once two transactions both
-- add to it, or once some of it is later partially consumed, there is
-- no way to say which specific earlier transaction's output a specific
-- later consumption "came from." No batch/lot table is introduced here
-- — not requested, not built.

create table public.production_material_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),

  -- Planning/grouping context only -- never a hard gate. A transaction
  -- on a later stage is always allowed even while an earlier stage has
  -- pending quantity; nothing here checks project_production_stages.status.
  stage_id uuid references public.project_production_stages(id) on delete set null,
  -- Optional reference only -- job_cards' own timer/employee-assignment
  -- tables and triggers are never read or written by this migration.
  job_card_id uuid references public.job_cards(id) on delete set null,

  operation text not null,

  performer_type text not null,
  vendor_id uuid references public.vendors(id) on delete set null,
  -- Snapshot alongside vendor_id, same convention production_stage_transactions
  -- already uses for its own vendor_name -- the printed/historical
  -- record must keep reading the vendor's name as it was at the time,
  -- even if the vendor is later renamed or deleted.
  vendor_name text,

  -- Nullable: a vendor-supplied semi-finished delivery has no tracked
  -- input (see "F" above) -- must not require us to have issued raw
  -- material first.
  input_item_id uuid references public.inventory_items(id) on delete restrict,
  input_qty numeric,
  -- Snapshot of inventory_items.unit at transaction time, same
  -- reasoning as vendor_name: inventory_items.unit could be edited
  -- later, and this row must keep reading what unit was actually used
  -- when the transaction happened.
  input_uom text,

  output_item_id uuid not null references public.inventory_items(id) on delete restrict,
  output_qty numeric not null,
  output_uom text not null,

  rejected_qty numeric not null default 0,

  notes text,

  -- G/H: server-authoritative, never client-trusted -- see the
  -- enforce_production_material_transaction() trigger below, which
  -- OVERWRITES whatever the client sends here with auth.uid() and the
  -- caller's own profiles.username, exactly mirroring
  -- enforce_job_card_timer_transition()'s v_actor/v_actor_name pattern
  -- (job_card_pause_resume_timer migration). Left as ordinary
  -- (nullable, client-insertable-looking) columns only because Postgres
  -- has no way to mark "insertable but always server-overwritten" at
  -- the column-definition level; the enforcement is in the trigger.
  performed_by uuid,
  performed_by_name text,

  -- Separate from created_at (which is purely "when the row was
  -- inserted") so a transaction can be logged for when the physical
  -- event actually happened -- same event_time/created_at split
  -- production_stage_transactions already has.
  event_time timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint chk_production_material_transactions_performer_type
    check (performer_type in ('inhouse', 'vendor')),
  -- vendor_id required and non-null exactly when performer_type='vendor';
  -- must be null for 'inhouse'.
  constraint chk_production_material_transactions_performer_vendor
    check (
      (performer_type = 'vendor' and vendor_id is not null)
      or (performer_type = 'inhouse' and vendor_id is null)
    ),
  -- input_item_id/input_qty/input_uom move together: either all three
  -- are null (vendor-supplied, no tracked input) or all three are set,
  -- with a positive quantity.
  constraint chk_production_material_transactions_input_consistency
    check (
      (input_item_id is null and input_qty is null and input_uom is null)
      or (input_item_id is not null and input_qty is not null and input_qty > 0 and input_uom is not null)
    ),
  constraint chk_production_material_transactions_output_positive
    check (output_qty > 0),
  constraint chk_production_material_transactions_rejected_nonnegative
    check (rejected_qty >= 0),
  -- rejected_qty is denominated in the INPUT's own quantity (of the
  -- input_qty actually processed, how much did NOT become good
  -- output) -- bounded by input_qty, never compared to output_qty,
  -- since output can legitimately be a different unit/count entirely
  -- (100 Sheets -> 450 Pieces). When input_item_id is null
  -- (vendor-supplied), there is no input to bound rejected_qty
  -- against, so only the >=0 check above applies.
  constraint chk_production_material_transactions_rejected_within_input
    check (input_qty is null or rejected_qty <= input_qty)

  -- Deliberately NO unique constraint: two vendors performing the same
  -- operation, one vendor performing multiple operations, and the same
  -- vendor+operation repeated across multiple partial-processing
  -- transactions must all remain freely insertable. Nothing about this
  -- table's own identity (operation, vendor, item) is naturally unique
  -- per organization -- only `id` is.
);

create index idx_production_material_transactions_org_stage
  on public.production_material_transactions (organization_id, stage_id);
create index idx_production_material_transactions_input_item
  on public.production_material_transactions (input_item_id);
create index idx_production_material_transactions_output_item
  on public.production_material_transactions (output_item_id);
create index idx_production_material_transactions_job_card
  on public.production_material_transactions (job_card_id);
create index idx_production_material_transactions_vendor
  on public.production_material_transactions (vendor_id);

comment on table public.production_material_transactions is
  'Additive to, not a replacement of, project_production_stages/production_stage_lines/production_stage_transactions/job_cards/inventory_purchases. Represents one material-conversion event (input item -> operation -> performer -> output item). See this file''s own header for the full design record, including the vendor-supply-vs-PO-receipt boundary (section F) and the item-level-vs-batch-level traceability limitation (section I).';
comment on column public.production_material_transactions.input_item_id is
  'NULL means vendor-supplied semi-finished material with no tracked raw-material issue -- reserved for "a vendor performed an operation on material we never issued them", NOT a substitute for Company PO / Inventory purchase receiving (see this file''s header, section F).';

-- ============================================================
-- G. ORGANIZATION ISOLATION
-- ============================================================
-- Traced against the existing codebase before proposing this: RLS
-- alone (has_permission(...) and organization_id = current_organization_id())
-- guarantees the NEW ROW's own organization_id is correct, and every
-- normal UI dropdown (vendors, inventory items, stages, job cards) is
-- itself populated from an org-scoped SELECT, so an ordinary user of
-- the actual screens can never even see another org's id to submit.
-- But a Postgres FK constraint only verifies the referenced ROW
-- EXISTS somewhere -- not that it belongs to the same organization_id
-- as the row pointing to it. This exact gap is already present, unfixed,
-- on every other FK-bearing table in this schema (production_stage_
-- transactions.vendor_id, inventory_purchases.inventory_item_id, etc.)
-- -- confirmed live, not assumed -- and this migration does not attempt
-- to retrofit all of them (that would be exactly the "generic
-- authorization system" this review says not to invent).
--
-- What makes THIS table different, and worth a targeted fix scoped to
-- only it: unlike a plain reference column, this table's input_item_id/
-- output_item_id directly drive a numeric UPDATE against another row's
-- stock balance via the AFTER INSERT trigger below. A cross-org leak
-- here would not just show wrong data -- it would let one organization's
-- production event silently decrement or increment ANOTHER
-- organization's real inventory count. That is a correctness/security
-- issue specific to this table's stock-mutating role, not a generic
-- concern to solve everywhere.
--
-- Minimum safe enforcement: one BEFORE INSERT trigger validating that
-- every non-null FK on the new row (vendor_id, input_item_id,
-- output_item_id, stage_id, job_card_id) belongs to the SAME
-- organization_id as the row itself -- mirroring the exact style
-- validate_rework_reference() already established in this codebase for
-- project_production_stages.reference_stage_id (look up the referenced
-- row's own organization_id / project_id, raise if it differs). Folded
-- into the same trigger that sets performed_by (H) and checks negative
-- stock, in that order, all BEFORE INSERT, so a single failure of any
-- kind blocks the INSERT and nothing partial happens.
--
-- ============================================================
-- H. PERFORMED_BY -- SERVER-AUTHORITATIVE, NOT CLIENT-SUPPLIED
-- ============================================================
-- Verified: job_card_time_events' performed_by/performed_by_name are
-- NEVER settable by the client at all -- that table has no insert
-- policy for the authenticated role; only enforce_job_card_timer_
-- transition() (SECURITY DEFINER) writes to it, computing
-- v_actor := auth.uid() and v_actor_name from public.profiles itself,
-- never trusting anything the client sent (job_card_pause_resume_timer
-- migration, confirmed by reading its function body).
--
-- This table differs structurally: the client DOES insert into it
-- directly (there is no wrapping RPC for the base case). To match the
-- same "never trust the client's claimed identity" principle with that
-- structure, the trigger below unconditionally OVERWRITES
-- NEW.performed_by := auth.uid() and resolves NEW.performed_by_name
-- from public.profiles, regardless of whatever the client's INSERT
-- statement supplied for those two columns. An authenticated user can
-- no more claim another user's identity here than in job_card_time_events.
create or replace function public.enforce_production_material_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := new.organization_id;
  v_ref_org uuid;
  v_stock numeric;
begin
  -- H: server-authoritative actor, never client-trusted.
  new.performed_by := auth.uid();
  select username into new.performed_by_name from public.profiles where id = new.performed_by;

  -- G: every non-null FK must belong to this same organization.
  if new.vendor_id is not null then
    select organization_id into v_ref_org from public.vendors where id = new.vendor_id;
    if v_ref_org is null or v_ref_org <> v_org then
      raise exception 'vendor_id % does not belong to this organization', new.vendor_id;
    end if;
  end if;

  if new.input_item_id is not null then
    select organization_id into v_ref_org from public.inventory_items where id = new.input_item_id;
    if v_ref_org is null or v_ref_org <> v_org then
      raise exception 'input_item_id % does not belong to this organization', new.input_item_id;
    end if;
  end if;

  select organization_id into v_ref_org from public.inventory_items where id = new.output_item_id;
  if v_ref_org is null or v_ref_org <> v_org then
    raise exception 'output_item_id % does not belong to this organization', new.output_item_id;
  end if;

  if new.stage_id is not null then
    select organization_id into v_ref_org from public.project_production_stages where id = new.stage_id;
    if v_ref_org is null or v_ref_org <> v_org then
      raise exception 'stage_id % does not belong to this organization', new.stage_id;
    end if;
  end if;

  if new.job_card_id is not null then
    select organization_id into v_ref_org from public.job_cards where id = new.job_card_id;
    if v_ref_org is null or v_ref_org <> v_org then
      raise exception 'job_card_id % does not belong to this organization', new.job_card_id;
    end if;
  end if;

  -- Negative-stock guard for the INPUT side only -- exact mirror of
  -- the existing prevent_negative_stock() (trg_negative_stock on
  -- inventory_usages), scoped to input_item_id/input_qty, no-op when
  -- input_item_id is null (vendor-supplied transactions perform no
  -- negative-stock check at all).
  if new.input_item_id is not null then
    select current_stock into v_stock from public.inventory_items where id = new.input_item_id for update;
    if v_stock < new.input_qty then
      raise exception 'Not enough stock';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_production_material_transactions_enforce
  before insert on public.production_material_transactions
  for each row execute function public.enforce_production_material_transaction();

-- Stock mutation -- exact mirror of the existing reduce_stock()/
-- increase_stock() pair, combined into one AFTER INSERT trigger since
-- a single row here always has an output (required) and optionally an
-- input (nullable), rather than being split across two different
-- tables the way purchases/usages are. Atomicity: Postgres runs
-- BEFORE/AFTER triggers as part of the SAME transaction as the
-- triggering INSERT -- a raise in the BEFORE trigger above prevents
-- the INSERT from ever happening; any failure here rolls back the
-- entire transaction, including the INSERT and everything the BEFORE
-- trigger already validated. No separate wrapping RPC is needed for
-- this guarantee, matching how trg_negative_stock/trg_reduce_stock
-- already rely on the same two-trigger, one-transaction mechanics.
create or replace function public.apply_production_material_transaction_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.input_item_id is not null then
    update public.inventory_items
    set current_stock = current_stock - new.input_qty
    where id = new.input_item_id;
  end if;

  update public.inventory_items
  set current_stock = current_stock + new.output_qty
  where id = new.output_item_id;

  return new;
end;
$$;

create trigger trg_production_material_transactions_apply_stock
  after insert on public.production_material_transactions
  for each row execute function public.apply_production_material_transaction_stock();

-- RLS: has_permission('production', verb) + org-match, same convention
-- production_stage_lines already uses. Append-only by design: this
-- table's INSERT trigger directly mutates two different inventory
-- balances, and there is no symmetric reversal-on-DELETE/UPDATE
-- trigger (building one is a separate, bigger piece of machinery, not
-- part of this migration) -- allowing UPDATE or DELETE here would let
-- a row's stock effect silently go stale relative to the row itself.
-- No UPDATE or DELETE policy is defined for the authenticated role, so
-- both are blocked outright (RLS default-denies any command with no
-- matching policy) -- correcting a mistaken entry is expected to happen
-- by inserting a new, offsetting transaction, the same historical-
-- ledger convention accounting systems use, never by editing or
-- deleting history.
alter table public.production_material_transactions enable row level security;

create policy production_material_transactions_select on public.production_material_transactions
  for select using (
    has_permission('production', 'view') and organization_id = current_organization_id()
  );

create policy production_material_transactions_insert on public.production_material_transactions
  for insert with check (
    has_permission('production', 'edit') and organization_id = current_organization_id()
  );
