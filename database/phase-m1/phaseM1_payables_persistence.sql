-- FabFlow ERP — Phase M.1: persist Payables / Payable Payments.
--
-- Root cause: `payables`/`payablePayments` are local-only today — store.ts
-- seeds them from a hardcoded sample array (samplePayables/
-- samplePayablePayments), never hydrated from or written to Supabase.
-- lib/ledger.ts's buildVendorLedgerEntries() reads them directly, so
-- Vendor Ledger has been showing session-local, non-shared data — never a
-- real, authoritative ERP fact. This migration gives Payables a genuine
-- persisted home so Vendor Ledger (and the Agent) can finally treat it as
-- real data, without inventing any new business meaning: every column
-- below maps 1:1 to the existing `Payable`/`PayablePayment` types
-- (types.ts) that Payables.tsx and ledger.ts already use today.
--
-- Permission reuse: the `payables` permission module already exists
-- (permissions.ts: view/create/edit/delete/upload) — no permission
-- changes needed, this migration only adds the table + RLS that module
-- was always meant to gate.
--
-- paid_amount is trigger-derived (sum of payable_payments.amount for
-- that payable), matching the exact precedent already proven for
-- expense_floats (trg_recompute_petty_expense_floats) — the DB stays
-- authoritative, the frontend never computes or trusts a locally-summed
-- value. `status` (Paid/Overdue/Partial/Pending) is deliberately NOT a
-- stored column — it's derived client-side today (getPayableDerivedStatus
-- in lib/ledger.ts) from paid_amount/total_amount/due_date, and this
-- migration does not invent a new stored-status concept the app doesn't
-- already have.

begin;

create table if not exists public.payables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id() references public.organizations(id),
  vendor_name text not null,
  payment_type text not null,
  total_amount numeric not null,
  paid_amount numeric not null default 0,
  due_date date,
  vendor_id uuid references public.vendors(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  company_po_id uuid references public.company_pos(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payable_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id() references public.organizations(id),
  payable_id uuid not null references public.payables(id) on delete cascade,
  amount numeric not null,
  payment_date date not null,
  mode text not null,
  reference_no text,
  notes text,
  attachment_ref text,
  attachment_type text,
  attachment_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_payables_org_vendor on public.payables (organization_id, vendor_id);
create index if not exists idx_payable_payments_org_payable on public.payable_payments (organization_id, payable_id);

alter table public.payables enable row level security;
alter table public.payable_payments enable row level security;

create policy "payables_select" on public.payables
  as permissive for select to public
  using (public.has_permission('payables', 'view') and organization_id = public.current_organization_id());

create policy "payables_insert" on public.payables
  as permissive for insert to public
  with check (public.has_permission('payables', 'create') and organization_id = public.current_organization_id());

create policy "payables_update" on public.payables
  as permissive for update to public
  using (public.has_permission('payables', 'edit') and organization_id = public.current_organization_id());

create policy "payables_delete" on public.payables
  as permissive for delete to public
  using (public.has_permission('payables', 'delete') and organization_id = public.current_organization_id());

create policy "payable_payments_select" on public.payable_payments
  as permissive for select to public
  using (public.has_permission('payables', 'view') and organization_id = public.current_organization_id());

create policy "payable_payments_insert" on public.payable_payments
  as permissive for insert to public
  with check (public.has_permission('payables', 'create') and organization_id = public.current_organization_id());

create policy "payable_payments_delete" on public.payable_payments
  as permissive for delete to public
  using (public.has_permission('payables', 'delete') and organization_id = public.current_organization_id());

create trigger trg_payables_updated_at
  before update on public.payables
  for each row execute function public.set_updated_at_timestamp();

-- Same "DB stays authoritative" pattern as trg_recompute_petty_expense_floats.
create or replace function public.recompute_payable_paid_amount()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_payable_id uuid;
begin
  target_payable_id := coalesce(new.payable_id, old.payable_id);
  update public.payables
  set paid_amount = coalesce((
    select sum(amount) from public.payable_payments where payable_id = target_payable_id
  ), 0)
  where id = target_payable_id;
  return coalesce(new, old);
end;
$$;

create trigger trg_recompute_payable_paid_amount
  after insert or update or delete on public.payable_payments
  for each row execute function public.recompute_payable_paid_amount();

commit;
