-- FabFlow ERP - Phase 4: Petty Expenses + Expense Floats
-- Adds: expense_floats, petty_expenses. Reuses Phase 2's document_counters
-- (unmodified) for float numbering and set_updated_at_timestamp()
-- (unmodified) for updated_at maintenance. Zero changes to any frozen
-- Phase 1, 2, or 3 table, column, policy, index, or trigger.
-- Idempotent: safe to run multiple times. Registers itself in
-- schema_migrations as its final statement, so that row's mere existence
-- is proof the whole transaction committed successfully.
--
-- Confirmed dead code correctly excluded: SalaryAdvance (superseded by
-- Phase 2's advance_records; zero live call sites found anywhere).
--
-- Derived-field design: expense_floats.spent_amount/balance_amount/
-- status/settled_at are a pure function of issued_amount, returned_amount,
-- and the live sum of linked petty_expenses rows - never independently
-- entered. Two trigger entry points share one computation function
-- (expense_float_recompute), so the formula lives in exactly one place
-- and cannot drift between the petty_expenses-driven path and the
-- direct issued_amount/returned_amount-edit path. See sections 3-5.
--
-- Permission-module mapping (confirmed against the live frontend):
-- petty_expenses INSERT accepts petty_expenses.create OR
-- expense_float.settle (the float-settlement flow creates PettyExpense
-- rows under expense_float.settle alone, with no separate
-- petty_expenses.create check on that path). petty_expenses UPDATE
-- accepts petty_expenses.edit OR employees.edit (EmployeeDetail.tsx's
-- payroll dialog marks personal expenses recovered via updatePettyExpense
-- under an employees.edit-gated context, not petty_expenses.edit).
-- expense_floats UPDATE accepts expense_float.edit OR expense_float.settle
-- (settleExpenseFloat, called from the same settlement flow, writes
-- returned_amount directly).
--
-- ON DELETE design: petty_expenses.float_id, vendor_id, and
-- inventory_item_id are all SET NULL. Confirmed live: deleteExpenseFloat,
-- deleteInventoryItem, and deleteVendor are all unconditional in the
-- current app (no guard checks petty_expenses at all) - RESTRICT on any
-- of these would make the database stricter than the live app in an
-- undisclosed way. SET NULL preserves today's actual deletability exactly
-- and matches the data model's own redundant-storage design (vendor/
-- itemName text fields already exist independently of vendor_id/
-- inventory_item_id specifically so the record stays meaningful without
-- the live link). machine_id is deliberately left without an FK -
-- Machinery has no live table yet; a future Machinery phase should add
-- that FK as its own additive, forward-fix touch to this (by-then-frozen)
-- table.

begin;

-- ============================================================
-- 1. expense_floats
-- ============================================================

create table if not exists public.expense_floats (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  float_no text not null,
  unique (organization_id, float_no),
  employee_id uuid not null references public.employees(id),
  issued_date date not null,
  issued_amount numeric not null check (issued_amount > 0),
  -- spent_amount / balance_amount / status / settled_at are trigger-
  -- maintained (section 4/5 below) - never written directly by the
  -- application once this migration is live. The defaults here only
  -- matter for the instant before the BEFORE INSERT trigger overwrites
  -- them.
  spent_amount numeric not null default 0,
  returned_amount numeric not null default 0,
  balance_amount numeric not null default 0,
  status text not null default 'Open',
  purpose text,
  notes text,
  project_id uuid references public.projects(id),
  issued_by uuid references auth.users(id),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_expense_floats_org_employee
  on public.expense_floats (organization_id, employee_id);

-- ============================================================
-- 2. petty_expenses
-- ============================================================

create table if not exists public.petty_expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  date date not null,
  employee_id uuid not null references public.employees(id),
  amount numeric not null check (amount > 0),
  expense_type text not null,
  expense_mode text not null,
  project_id uuid references public.projects(id),
  -- SET NULL: see header note. deleteExpenseFloat has no guard today.
  float_id uuid references public.expense_floats(id) on delete set null,
  notes text,
  -- Itemized purchase detail (set only when created via the Float
  -- Settlement "Purchased Items" flow). amount above remains
  -- authoritative either way.
  item_name text,
  quantity numeric,
  unit_price numeric,
  vendor text,
  -- SET NULL: see header note. deleteVendor has no guard today, and the
  -- app already keeps `vendor` (text, above) as an independent display
  -- value decoupled from this FK for exactly this reason.
  vendor_id uuid references public.vendors(id) on delete set null,
  bill_number text,
  -- Array of {id, fileName, fileMimeType, fileData, uploadedAt} - jsonb,
  -- same rationale as Phase 3's line_items/items: always read as a whole
  -- embedded array, never queried independently, no DB-side aggregation
  -- need over the attachments themselves.
  attachments jsonb,
  -- SET NULL: see header note. deleteInventoryItem has no guard today
  -- (not even against its own inventory_purchases/material_usages), and
  -- `item_name` (text, above) already stands independently of this FK.
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  added_to_inventory boolean,
  -- No FK yet - Machinery module has no live table. See header note.
  machine_id uuid,
  service_type text,
  vehicle_expense_type text,
  service_provider_type text,
  pickup_location text,
  drop_location text,
  -- Standard default (no special ON DELETE): confirmed live that
  -- deleteSalaryPayment does not exist anywhere in the app, so this FK's
  -- delete behavior is currently unreachable regardless of choice.
  recovered_in_salary_payment_id uuid references public.salary_payments(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_petty_expenses_org_employee
  on public.petty_expenses (organization_id, employee_id);
create index if not exists idx_petty_expenses_org_float
  on public.petty_expenses (organization_id, float_id);
create index if not exists idx_petty_expenses_org_project
  on public.petty_expenses (organization_id, project_id);

-- ============================================================
-- 3. generate_float_number() - reuses Phase 2's document_counters
--    table completely unmodified, new counter_key 'FLT'. Same atomic
--    INSERT..ON CONFLICT DO UPDATE..RETURNING pattern as
--    generate_employee_code()/generate_quotation_number(), proven
--    concurrency-safe under genuine concurrent load in both prior
--    phases' verification. Format mirrors the frontend's own
--    floatNo generation exactly: FLT-YYYY-NNN, sequence never resets
--    per calendar year.
-- ============================================================

create or replace function public.generate_float_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value integer;
begin
  insert into public.document_counters (organization_id, counter_key, current_value)
  values (p_organization_id, 'FLT', 1)
  on conflict (organization_id, counter_key)
  do update set current_value = public.document_counters.current_value + 1
  returning current_value into v_value;

  return 'FLT-' || extract(year from now())::text || '-' || lpad(v_value::text, 3, '0');
end;
$$;

-- ============================================================
-- 4. expense_float_recompute() - the single shared derivation formula.
--    Both trigger entry points (section 7 and 8) and settle_expense_
--    float() (section 6) call this and only this, so the formula lives
--    in exactly one place. Always re-queries spent_amount fresh from
--    petty_expenses rather than trusting a cached column value, so
--    correctness never depends on call order between any of the three
--    write paths.
-- ============================================================

create or replace function public.expense_float_recompute(
  p_float_id uuid,
  p_issued_amount numeric,
  p_returned_amount numeric,
  p_current_settled_at timestamptz
)
returns table (
  spent_amount numeric,
  balance_amount numeric,
  status text,
  settled_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spent numeric;
  v_balance numeric;
  v_status text;
begin
  select coalesce(sum(amount), 0) into v_spent
  from public.petty_expenses
  where float_id = p_float_id;

  v_balance := greatest(0, p_issued_amount - v_spent - p_returned_amount);

  if p_issued_amount - v_spent - p_returned_amount <= 0 then
    v_status := 'Fully Settled';
  elsif v_spent > 0 or p_returned_amount > 0 then
    v_status := 'Partially Settled';
  else
    v_status := 'Open';
  end if;

  return query select
    v_spent,
    v_balance,
    v_status,
    case when v_status = 'Fully Settled'
         then coalesce(p_current_settled_at, now())
         else null end;
end;
$$;

-- ============================================================
-- 5. expense_float_apply_recompute() - helper used by the
--    petty_expenses-side trigger (section 7). Locks the target float
--    row with FOR UPDATE *before* summing petty_expenses, so a second
--    concurrent call for the same float blocks until the first commits
--    and then reads the fully up-to-date row - the same
--    lock-before-read pattern Phase 1's prevent_negative_stock() and
--    prevent_overpayment() already use, preventing a lost-update race
--    where two concurrent settlements against the same float could
--    otherwise each compute spent_amount from a stale snapshot and the
--    second write silently overwrite the first's contribution.
-- ============================================================

create or replace function public.expense_float_apply_recompute(p_float_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f record;
  r record;
begin
  select issued_amount, returned_amount, settled_at into f
  from public.expense_floats
  where id = p_float_id
  for update;

  if not found then
    return;
  end if;

  select * into r from public.expense_float_recompute(
    p_float_id, f.issued_amount, f.returned_amount, f.settled_at
  );

  update public.expense_floats
  set spent_amount = r.spent_amount,
      balance_amount = r.balance_amount,
      status = r.status,
      settled_at = r.settled_at
  where id = p_float_id;
end;
$$;

-- ============================================================
-- 6. settle_expense_float() - the sanctioned entry point for recording a
--    settlement/return against a float. Takes p_delta (the amount being
--    returned in *this* action, matching the frontend's existing
--    settleExpenseFloat(id, returnedAmount, notes) call shape exactly -
--    returnedAmount there is already a delta, not a target total: see
--    PettyExpenses.tsx's handleFinishSettlement, which validates it
--    against the float's current remaining balance before calling
--    settleExpenseFloat, and store.ts's settleExpenseFloat, which does
--    newReturned = f.returnedAmount + returnedAmount). This function
--    exists so that whichever future phase wires this action to
--    Supabase has one safe, atomic primitive to call instead of reading
--    returned_amount client-side and writing an absolute new value back
--    (which would reintroduce a lost-update race under two concurrent
--    settlements of the same float). Locks the float row with FOR
--    UPDATE before incrementing, exactly like expense_float_apply_
--    recompute() above, and reuses expense_float_recompute() for the
--    derived fields - the formula is still defined in exactly one
--    place. Unlike expense_float_apply_recompute() (only ever invoked
--    from the petty_expenses trigger, never called directly by a user),
--    this function is meant to be called directly as an RPC, so it does
--    NOT inherit RLS the way a plain table UPDATE would - it re-checks
--    the identical permission condition used by the expense_floats
--    UPDATE policy (section 10) and organization_id itself, rather than
--    relying on the caller already having passed RLS.
-- ============================================================

create or replace function public.settle_expense_float(
  p_float_id uuid,
  p_delta numeric,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f record;
  r record;
begin
  if not (has_permission('expense_float','edit') or has_permission('expense_float','settle')) then
    raise exception 'permission denied for settle_expense_float';
  end if;

  select issued_amount, returned_amount, settled_at into f
  from public.expense_floats
  where id = p_float_id
    and organization_id = current_organization_id()
  for update;

  if not found then
    raise exception 'expense float % not found in this organization', p_float_id;
  end if;

  select * into r from public.expense_float_recompute(
    p_float_id, f.issued_amount, f.returned_amount + p_delta, f.settled_at
  );

  update public.expense_floats
  set returned_amount = f.returned_amount + p_delta,
      spent_amount = r.spent_amount,
      balance_amount = r.balance_amount,
      status = r.status,
      settled_at = r.settled_at,
      notes = coalesce(p_notes, notes)
  where id = p_float_id;
end;
$$;

-- ============================================================
-- 7. Trigger entry point 1: petty_expenses side. Fires on every INSERT,
--    UPDATE (including a float_id reassignment - recomputes both the
--    old and new float, not just one), and DELETE. Does not depend on
--    the float's own row already being locked by anything else -
--    expense_float_apply_recompute() takes that lock itself.
-- ============================================================

create or replace function public.recompute_petty_expense_floats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    if OLD.float_id is not null then
      perform public.expense_float_apply_recompute(OLD.float_id);
    end if;
    return OLD;
  end if;

  if TG_OP = 'INSERT' then
    if NEW.float_id is not null then
      perform public.expense_float_apply_recompute(NEW.float_id);
    end if;
    return NEW;
  end if;

  -- UPDATE
  if OLD.float_id is not null then
    perform public.expense_float_apply_recompute(OLD.float_id);
  end if;
  if NEW.float_id is not null and NEW.float_id is distinct from OLD.float_id then
    perform public.expense_float_apply_recompute(NEW.float_id);
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_recompute_petty_expense_floats on public.petty_expenses;
create trigger trg_recompute_petty_expense_floats
  after insert or update or delete on public.petty_expenses
  for each row execute function public.recompute_petty_expense_floats();

-- ============================================================
-- 8. Trigger entry point 2: expense_floats side. Split into two
--    separate triggers (INSERT and UPDATE) rather than one combined
--    "before insert or update" trigger, because a WHEN clause cannot
--    reference OLD for an INSERT event - referencing OLD in a WHEN
--    clause is only valid when every event the trigger fires for is
--    UPDATE or DELETE. The INSERT trigger always recomputes (a brand
--    new float has no prior derived state to compare against); the
--    UPDATE trigger is scoped by its WHEN clause to fire only when
--    issued_amount or returned_amount actually changes - this is what
--    prevents it from re-firing during expense_float_apply_recompute()'s
--    own UPDATE (section 5), which only ever touches the four derived
--    columns and never issued_amount/returned_amount. No recursion
--    guard is needed beyond this WHEN clause: a BEFORE trigger that
--    sets NEW.* and returns NEW does not cause the triggering statement
--    to re-fire.
-- ============================================================

create or replace function public.expense_floats_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  select * into r from public.expense_float_recompute(
    NEW.id, NEW.issued_amount, NEW.returned_amount, NEW.settled_at
  );
  NEW.spent_amount := r.spent_amount;
  NEW.balance_amount := r.balance_amount;
  NEW.status := r.status;
  NEW.settled_at := r.settled_at;
  return NEW;
end;
$$;

drop trigger if exists trg_expense_floats_before_insert on public.expense_floats;
create trigger trg_expense_floats_before_insert
  before insert on public.expense_floats
  for each row execute function public.expense_floats_before_write();

drop trigger if exists trg_expense_floats_before_update on public.expense_floats;
create trigger trg_expense_floats_before_update
  before update on public.expense_floats
  for each row
  when (
    NEW.issued_amount is distinct from OLD.issued_amount
    or NEW.returned_amount is distinct from OLD.returned_amount
  )
  execute function public.expense_floats_before_write();

-- ============================================================
-- 9. updated_at maintenance - reuses Phase 2's
--    set_updated_at_timestamp() completely unmodified.
-- ============================================================

drop trigger if exists trg_expense_floats_updated_at on public.expense_floats;
create trigger trg_expense_floats_updated_at
  before update on public.expense_floats
  for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_petty_expenses_updated_at on public.petty_expenses;
create trigger trg_petty_expenses_updated_at
  before update on public.petty_expenses
  for each row execute function public.set_updated_at_timestamp();

-- ============================================================
-- 10. RLS + policies. Permission-module mapping confirmed against the
--    live frontend directly (see header comment).
-- ============================================================

alter table public.expense_floats enable row level security;
drop policy if exists expense_floats_select on public.expense_floats;
create policy expense_floats_select on public.expense_floats for select using (has_permission('expense_float','view') and organization_id = current_organization_id());
drop policy if exists expense_floats_insert on public.expense_floats;
create policy expense_floats_insert on public.expense_floats for insert with check (has_permission('expense_float','create') and organization_id = current_organization_id());
drop policy if exists expense_floats_update on public.expense_floats;
create policy expense_floats_update on public.expense_floats for update using ((has_permission('expense_float','edit') or has_permission('expense_float','settle')) and organization_id = current_organization_id()) with check ((has_permission('expense_float','edit') or has_permission('expense_float','settle')) and organization_id = current_organization_id());
drop policy if exists expense_floats_delete on public.expense_floats;
create policy expense_floats_delete on public.expense_floats for delete using (has_permission('expense_float','delete') and organization_id = current_organization_id());

alter table public.petty_expenses enable row level security;
drop policy if exists petty_expenses_select on public.petty_expenses;
create policy petty_expenses_select on public.petty_expenses for select using (has_permission('petty_expenses','view') and organization_id = current_organization_id());
drop policy if exists petty_expenses_insert on public.petty_expenses;
create policy petty_expenses_insert on public.petty_expenses for insert with check ((has_permission('petty_expenses','create') or has_permission('expense_float','settle')) and organization_id = current_organization_id());
drop policy if exists petty_expenses_update on public.petty_expenses;
create policy petty_expenses_update on public.petty_expenses for update using ((has_permission('petty_expenses','edit') or has_permission('employees','edit')) and organization_id = current_organization_id()) with check ((has_permission('petty_expenses','edit') or has_permission('employees','edit')) and organization_id = current_organization_id());
drop policy if exists petty_expenses_delete on public.petty_expenses;
create policy petty_expenses_delete on public.petty_expenses for delete using (has_permission('petty_expenses','delete') and organization_id = current_organization_id());

-- ============================================================
-- 11. Register this migration. Deliberately the last statement before
--     commit - its presence in schema_migrations after a run is proof
--     the entire transaction above succeeded, not just that it started.
--     Checksum is the SHA-256 of this file's content (sections 1-10,
--     i.e. everything above this statement), computed at authoring time.
-- ============================================================

insert into public.schema_migrations (version, description, checksum)
values (
  '20260806_004_phase4_petty_expenses',
  'Phase 4: expense_floats, petty_expenses. Reuses Phase 2''s document_counters (unmodified) for float numbering (FLT prefix) and set_updated_at_timestamp() (unmodified) for updated_at maintenance. Derived fields (spent_amount/balance_amount/status/settled_at) maintained via two trigger entry points sharing one computation function (expense_float_recompute), with FOR UPDATE locking on the concurrent-recompute path to prevent lost updates. settle_expense_float(p_float_id, p_delta, p_notes) is the sanctioned atomic entry point for recording a settlement, taking a delta (matching the frontend''s existing settleExpenseFloat call shape) and reusing expense_float_recompute under the same FOR UPDATE lock pattern, with its own internal permission check since it is SECURITY DEFINER and callable directly as an RPC, bypassing table RLS. petty_expenses.float_id/vendor_id/inventory_item_id all ON DELETE SET NULL, confirmed against live unconditional-delete behavior in deleteExpenseFloat/deleteVendor/deleteInventoryItem. CHECK (amount > 0) and CHECK (issued_amount > 0) formalize existing frontend validation. Cross-module RLS: petty_expenses INSERT accepts petty_expenses.create OR expense_float.settle; petty_expenses UPDATE accepts petty_expenses.edit OR employees.edit; expense_floats UPDATE accepts expense_float.edit OR expense_float.settle - all confirmed against actual frontend gating code. Zero changes to any frozen Phase 1-3 object.',
  '12636bfe3485755098eadb47004eff67259ae6fe42ecac0e66324cf86fbd8630'
)
on conflict (version) do nothing;

commit;
