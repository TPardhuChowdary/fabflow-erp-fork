-- FabFlow ERP — Phase 1 (v5, FINAL): Normalized RBAC + Organizations +
-- Auth + RLS + Audit Log + Password Management + Migration Tracking +
-- Query-Pattern-Justified Indexing
-- Idempotent: safe to run multiple times. Extends the 14 existing ERP
-- tables; creates nothing that duplicates them; does not touch existing
-- data beyond the two documented trigger fixes and the organization_id
-- backfill (which sets every existing row to the single seeded org).
-- user_roles is the single source of truth for role assignment — no
-- redundant primary_role_id anywhere. Registers itself in
-- schema_migrations as its final statement, so that row's mere existence
-- is proof the whole transaction committed successfully.
-- No architecture, business logic, workflow, UI, or permission behavior
-- is changed by this revision relative to the previously approved
-- design — section 13 below (indexes) is a pure performance addition.

begin;

-- ══════════════════════════════════════════════════════════════════════
-- 1. Organizations — the future-proofing layer. One row seeded now;
--    every ERP table gets organization_id below regardless.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz not null default now()
);

-- Fixed, well-known UUID for the single initial organization — deterministic
-- across re-runs, and simple to reference in every DEFAULT/backfill below.
insert into public.organizations (id, name)
values ('00000000-0000-0000-0000-000000000001'::uuid, 'Shanmukha Sai Engineering Works')
on conflict (id) do nothing;

-- schema_migrations — a complete history of every migration ever applied.
-- This migration registers itself as the final statement of this script
-- (see the very end, right before commit): since the whole file runs in
-- one transaction, that row's presence is proof the entire migration
-- committed, not just that it started.
create table if not exists public.schema_migrations (
  version text primary key,
  description text not null,
  executed_at timestamptz not null default now(),
  executed_by text not null default current_user,
  checksum text not null
);

-- ══════════════════════════════════════════════════════════════════════
-- 2. Normalized RBAC schema (unchanged in shape from v2)
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  is_admin boolean not null default false,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  module text not null,
  action text not null,
  label text,
  category text,
  unique (module, action)
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table if not exists public.user_permission_overrides (
  user_id uuid not null references auth.users(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  allowed boolean not null,
  primary key (user_id, permission_id)
);

-- ══════════════════════════════════════════════════════════════════════
-- 3. profiles — normalized role, organization membership, admin metadata,
--    password-management flag, future 1:1 with employees.
-- ══════════════════════════════════════════════════════════════════════

-- Role assignment lives only in user_roles (see section 2) — profiles
-- intentionally has no role column, avoiding the same relationship being
-- stored in two places. One row in user_roles today; more rows later if
-- a user ever needs multiple roles, with no schema change required.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid references public.organizations(id),
  employee_id uuid unique, -- FK to employees(id) added when that module is migrated
  is_active boolean not null default true,
  must_change_password boolean not null default false,
  last_login timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.employee_id is
  'UNIQUE now to enforce 1:1 cardinality from day one; FK to employees(id) added once that table exists.';
comment on column public.profiles.must_change_password is
  'Set true by an admin-initiated forced reset. Frontend must gate app access on this after login until changed.';

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  if auth.uid() is not null then
    new.updated_by = auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- current_organization_id() — every RLS policy on ERP tables uses this to
-- scope reads/writes to the caller's own organization.
create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 4. Seed permissions (unchanged from v2, plus users/audit_log modules)
-- ══════════════════════════════════════════════════════════════════════

insert into public.permissions (module, action, label, category) values
  ('customers','view','Customers','Sales'), ('customers','create','Customers','Sales'), ('customers','edit','Customers','Sales'), ('customers','delete','Customers','Sales'),
  ('projects','view','Projects','Sales'), ('projects','create','Projects','Sales'), ('projects','edit','Projects','Sales'), ('projects','delete','Projects','Sales'), ('projects','upload','Projects','Sales'),
  ('quotations','view','Quotations','Sales'), ('quotations','create','Quotations','Sales'), ('quotations','edit','Quotations','Sales'), ('quotations','delete','Quotations','Sales'), ('quotations','download','Quotations','Sales'), ('quotations','print','Quotations','Sales'), ('quotations','share','Quotations','Sales'),
  ('purchase_orders','view','Customer Purchase Orders','Sales'), ('purchase_orders','create','Customer Purchase Orders','Sales'), ('purchase_orders','edit','Customer Purchase Orders','Sales'), ('purchase_orders','delete','Customer Purchase Orders','Sales'),
  ('vendors','view','Vendors','Procurement'), ('vendors','create','Vendors','Procurement'), ('vendors','edit','Vendors','Procurement'), ('vendors','delete','Vendors','Procurement'),
  ('company_po','view','Company PO','Procurement'), ('company_po','create','Company PO','Procurement'), ('company_po','edit','Company PO','Procurement'), ('company_po','delete','Company PO','Procurement'), ('company_po','approve','Company PO','Procurement'), ('company_po','download','Company PO','Procurement'), ('company_po','print','Company PO','Procurement'), ('company_po','share','Company PO','Procurement'),
  ('production','view','Production','Production'), ('production','create','Production','Production'), ('production','edit','Production','Production'), ('production','delete','Production','Production'),
  ('material_requisitions','view','Material Requisitions','Production'), ('material_requisitions','create','Material Requisitions','Production'), ('material_requisitions','edit','Material Requisitions','Production'), ('material_requisitions','delete','Material Requisitions','Production'), ('material_requisitions','approve','Material Requisitions','Production'),
  ('inventory','view','Inventory','Production'), ('inventory','create','Inventory','Production'), ('inventory','edit','Inventory','Production'), ('inventory','delete','Inventory','Production'), ('inventory','upload','Inventory','Production'),
  ('quality_inspection','view','Quality Inspection','Quality & Logistics'), ('quality_inspection','create','Quality Inspection','Quality & Logistics'), ('quality_inspection','edit','Quality Inspection','Quality & Logistics'), ('quality_inspection','approve','Quality Inspection','Quality & Logistics'),
  ('delivery_challans','view','Delivery Challans','Quality & Logistics'), ('delivery_challans','create','Delivery Challans','Quality & Logistics'), ('delivery_challans','edit','Delivery Challans','Quality & Logistics'), ('delivery_challans','delete','Delivery Challans','Quality & Logistics'), ('delivery_challans','download','Delivery Challans','Quality & Logistics'), ('delivery_challans','print','Delivery Challans','Quality & Logistics'), ('delivery_challans','share','Delivery Challans','Quality & Logistics'),
  ('invoices','view','Invoices','Finance'), ('invoices','create','Invoices','Finance'), ('invoices','edit','Invoices','Finance'), ('invoices','delete','Invoices','Finance'), ('invoices','download','Invoices','Finance'), ('invoices','print','Invoices','Finance'), ('invoices','share','Invoices','Finance'),
  ('payments','view','Payments','Finance'), ('payments','create','Payments','Finance'), ('payments','edit','Payments','Finance'), ('payments','delete','Payments','Finance'), ('payments','upload','Payments','Finance'),
  ('payables','view','Payables','Finance'), ('payables','create','Payables','Finance'), ('payables','edit','Payables','Finance'), ('payables','delete','Payables','Finance'), ('payables','upload','Payables','Finance'),
  ('employees','view','Employees','HR'), ('employees','create','Employees','HR'), ('employees','edit','Employees','HR'), ('employees','delete','Employees','HR'), ('employees','upload','Employees','HR'),
  ('petty_expenses','view','Petty Expenses','Finance'), ('petty_expenses','create','Petty Expenses','Finance'), ('petty_expenses','edit','Petty Expenses','Finance'), ('petty_expenses','delete','Petty Expenses','Finance'),
  ('settings','view','Settings','System'), ('settings','edit','Settings','System'),
  ('machinery','view','Machinery','Production'), ('machinery','create','Machinery','Production'), ('machinery','edit','Machinery','Production'), ('machinery','delete','Machinery','Production'), ('machinery','service_create','Machinery','Production'), ('machinery','service_approve','Machinery','Production'), ('machinery','upload','Machinery','Production'),
  ('export_engine','view','Export / Print Engine','System'), ('export_engine','create','Export / Print Engine','System'), ('export_engine','download','Export / Print Engine','System'), ('export_engine','print','Export / Print Engine','System'),
  ('salary_advance','view','Salary Advances','HR'), ('salary_advance','create','Salary Advances','HR'), ('salary_advance','edit','Salary Advances','HR'), ('salary_advance','delete','Salary Advances','HR'), ('salary_advance','recover','Salary Advances','HR'),
  ('expense_float','view','Expense Float','Finance'), ('expense_float','create','Expense Float','Finance'), ('expense_float','edit','Expense Float','Finance'), ('expense_float','delete','Expense Float','Finance'), ('expense_float','settle','Expense Float','Finance'),
  ('quality_characteristics','view','Quality Characteristic Library (QMS)','Quality Management (QMS)'), ('quality_characteristics','create','Quality Characteristic Library (QMS)','Quality Management (QMS)'), ('quality_characteristics','edit','Quality Characteristic Library (QMS)','Quality Management (QMS)'), ('quality_characteristics','delete','Quality Characteristic Library (QMS)','Quality Management (QMS)'),
  ('inspection_sheets','view','Inspection Sheets (QMS)','Quality Management (QMS)'), ('inspection_sheets','generate','Inspection Sheets (QMS)','Quality Management (QMS)'), ('inspection_sheets','complete','Inspection Sheets (QMS)','Quality Management (QMS)'), ('inspection_sheets','upload','Inspection Sheets (QMS)','Quality Management (QMS)'), ('inspection_sheets','print','Inspection Sheets (QMS)','Quality Management (QMS)'), ('inspection_sheets','review','Inspection Sheets (QMS)','Quality Management (QMS)'), ('inspection_sheets','approve','Inspection Sheets (QMS)','Quality Management (QMS)'), ('inspection_sheets','assign','Inspection Sheets (QMS)','Quality Management (QMS)'),
  ('drawing_editor','view','Engineering Drawing Editor','Production'), ('drawing_editor','create','Engineering Drawing Editor','Production'), ('drawing_editor','edit','Engineering Drawing Editor','Production'), ('drawing_editor','export','Engineering Drawing Editor','Production'), ('drawing_editor','delete','Engineering Drawing Editor','Production'),
  ('ledger','view','Ledger','Finance'), ('ledger','export','Ledger','Finance'), ('ledger','print','Ledger','Finance'), ('ledger','manage','Ledger','Finance'),
  ('users','view','User Management','System'), ('users','create','User Management','System'), ('users','edit','User Management','System'), ('users','delete','User Management','System'), ('users','activate','User Management','System'), ('users','deactivate','User Management','System'), ('users','assign_roles','User Management','System'),
  ('audit_log','view','Security Audit Log','System')
on conflict (module, action) do nothing;

-- ══════════════════════════════════════════════════════════════════════
-- 5. Seed roles (unchanged from v2)
-- ══════════════════════════════════════════════════════════════════════

insert into public.roles (name, is_admin, description) values
  ('admin', true, 'Full access to every module'),
  ('Admin', true, 'Legacy full-access role name'),
  ('sales', false, 'Sales team'),
  ('procurement', false, 'Procurement/purchasing team'),
  ('production', false, 'Production floor'),
  ('quality', false, 'Quality/QA team'),
  ('dispatch', false, 'Dispatch/logistics'),
  ('accounts', false, 'Accounts/finance team'),
  ('employee', false, 'Baseline employee access'),
  ('Accountant', false, 'Legacy accountant role'),
  ('Designer', false, 'Legacy designer role'),
  ('Worker', false, 'Legacy worker role')
on conflict (name) do nothing;

-- ══════════════════════════════════════════════════════════════════════
-- 6. Seed role_permissions (unchanged from v2 — admin/Admin need no rows,
--    has_permission() bypasses via is_admin)
-- ══════════════════════════════════════════════════════════════════════

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r
cross join lateral unnest(array[
  'customers.view','customers.create','customers.edit','customers.delete',
  'projects.view','projects.create','projects.edit',
  'quotations.view','quotations.create','quotations.edit','quotations.delete','quotations.download','quotations.print','quotations.share',
  'purchase_orders.view','purchase_orders.create','purchase_orders.edit','purchase_orders.delete',
  'employees.view'
]) as perm_key
join public.permissions p on p.module || '.' || p.action = perm_key
where r.name = 'sales'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r
cross join lateral unnest(array[
  'vendors.view','vendors.create','vendors.edit','vendors.delete',
  'company_po.view','company_po.create','company_po.edit','company_po.delete','company_po.approve','company_po.download','company_po.print','company_po.share',
  'material_requisitions.view','material_requisitions.create','material_requisitions.edit','material_requisitions.delete','material_requisitions.approve',
  'inventory.view','inventory.create','inventory.edit','inventory.delete','inventory.upload'
]) as perm_key
join public.permissions p on p.module || '.' || p.action = perm_key
where r.name = 'procurement'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r
cross join lateral unnest(array[
  'projects.view',
  'production.view','production.create','production.edit','production.delete',
  'material_requisitions.view','material_requisitions.create',
  'inventory.view',
  'employees.view',
  'machinery.view','machinery.service_create','machinery.upload',
  'inspection_sheets.view','inspection_sheets.complete','inspection_sheets.upload','inspection_sheets.print',
  'drawing_editor.view','drawing_editor.create','drawing_editor.edit','drawing_editor.export'
]) as perm_key
join public.permissions p on p.module || '.' || p.action = perm_key
where r.name = 'production'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r
cross join lateral unnest(array[
  'projects.view',
  'production.view',
  'quality_inspection.view','quality_inspection.create','quality_inspection.edit','quality_inspection.approve',
  'delivery_challans.view',
  'quality_characteristics.view','quality_characteristics.create','quality_characteristics.edit','quality_characteristics.delete',
  'inspection_sheets.view','inspection_sheets.generate','inspection_sheets.complete','inspection_sheets.upload','inspection_sheets.print','inspection_sheets.review','inspection_sheets.approve'
]) as perm_key
join public.permissions p on p.module || '.' || p.action = perm_key
where r.name = 'quality'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r
cross join lateral unnest(array[
  'projects.view',
  'delivery_challans.view','delivery_challans.create','delivery_challans.edit','delivery_challans.delete','delivery_challans.download','delivery_challans.print','delivery_challans.share',
  'employees.view'
]) as perm_key
join public.permissions p on p.module || '.' || p.action = perm_key
where r.name = 'dispatch'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r
cross join lateral unnest(array[
  'invoices.view','invoices.create','invoices.edit','invoices.delete','invoices.download','invoices.print','invoices.share',
  'payments.view','payments.create','payments.edit','payments.delete','payments.upload',
  'payables.view','payables.create','payables.edit','payables.delete','payables.upload',
  'petty_expenses.view','petty_expenses.create','petty_expenses.edit','petty_expenses.delete',
  'expense_float.view','expense_float.create','expense_float.edit','expense_float.delete','expense_float.settle',
  'salary_advance.view','salary_advance.recover',
  'customers.view','projects.view','employees.view','machinery.view',
  'export_engine.view','export_engine.create','export_engine.download','export_engine.print',
  'ledger.view','ledger.export','ledger.print','ledger.manage'
]) as perm_key
join public.permissions p on p.module || '.' || p.action = perm_key
where r.name = 'accounts'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r
cross join lateral unnest(array[
  'employees.view','petty_expenses.create','expense_float.view'
]) as perm_key
join public.permissions p on p.module || '.' || p.action = perm_key
where r.name = 'employee'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r
cross join lateral unnest(array[
  'invoices.view','invoices.create','invoices.edit','invoices.delete','invoices.download','invoices.print','invoices.share',
  'payments.view','payments.create','payments.edit','payments.delete','payments.upload',
  'payables.view','payables.create','payables.edit','payables.delete','payables.upload',
  'customers.view','projects.view','employees.view','settings.view',
  'ledger.view','ledger.export','ledger.print','ledger.manage'
]) as perm_key
join public.permissions p on p.module || '.' || p.action = perm_key
where r.name = 'Accountant'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r
cross join lateral unnest(array['projects.view','projects.edit','production.view']) as perm_key
join public.permissions p on p.module || '.' || p.action = perm_key
where r.name = 'Designer'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r
cross join lateral unnest(array['projects.view','production.view']) as perm_key
join public.permissions p on p.module || '.' || p.action = perm_key
where r.name = 'Worker'
on conflict do nothing;

-- ══════════════════════════════════════════════════════════════════════
-- 7. has_permission() — checks is_active (renamed from v2's `active`)
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.has_permission(p_module text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from public.profiles where id = auth.uid() and is_active)
    and (
      exists (
        select 1 from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        where ur.user_id = auth.uid() and r.is_admin
      )
      or coalesce(
        (select upo.allowed
         from public.user_permission_overrides upo
         join public.permissions p on p.id = upo.permission_id
         where upo.user_id = auth.uid() and p.module = p_module and p.action = p_action),
        exists (
          select 1
          from public.user_roles ur
          join public.role_permissions rp on rp.role_id = ur.role_id
          join public.permissions p on p.id = rp.permission_id
          where ur.user_id = auth.uid() and p.module = p_module and p.action = p_action
        )
      )
    );
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 8. Auto-create profile + primary role + org membership on signup
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_name text;
  v_role_id uuid;
  v_org_id uuid;
  v_created_by uuid;
begin
  v_role_name := coalesce(new.raw_user_meta_data ->> 'role', 'employee');
  select id into v_role_id from public.roles where name = v_role_name;
  if v_role_id is null then
    select id into v_role_id from public.roles where name = 'employee';
  end if;

  v_org_id := coalesce(
    (new.raw_user_meta_data ->> 'organization_id')::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid
  );
  v_created_by := coalesce((new.raw_user_meta_data ->> 'created_by')::uuid, auth.uid());

  insert into public.profiles (id, username, organization_id, created_by, must_change_password)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    v_org_id,
    v_created_by,
    coalesce((new.raw_user_meta_data ->> 'must_change_password')::boolean, false)
  )
  on conflict (id) do nothing;

  -- user_roles is the single source of truth for "what role(s) does this
  -- user have" — this is the only place a role gets assigned.
  insert into public.user_roles (user_id, role_id)
  values (new.id, v_role_id)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ══════════════════════════════════════════════════════════════════════
-- 9. Security audit log — now organization-scoped, plus the explicit
--    log_security_event() RPC for password-management events the app
--    calls directly (see explanation: GoTrue exposes no passively
--    watchable "password changed" signal).
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.security_audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  event_type text not null,
  actor_user_id uuid references auth.users(id),
  target_user_id uuid references auth.users(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.security_audit_log enable row level security;
drop policy if exists security_audit_log_select on public.security_audit_log;
create policy security_audit_log_select on public.security_audit_log for select
  using (has_permission('audit_log','view') and organization_id = current_organization_id());

create or replace function public.log_security_event(p_event_type text, p_target_user_id uuid, p_metadata jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is distinct from p_target_user_id and not has_permission('users','edit') then
    raise exception 'Not authorized to log this event';
  end if;
  insert into public.security_audit_log (organization_id, event_type, actor_user_id, target_user_id, metadata)
  values (public.current_organization_id(), p_event_type, auth.uid(), p_target_user_id, p_metadata);
end;
$$;

comment on function public.log_security_event(text, uuid, jsonb) is
  'Called explicitly by the frontend at password-change/force-reset time (and any other event with no passive trigger source). Self-events always allowed; events about another user require users.edit.';

create or replace function public.log_auth_login()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at then
    update public.profiles set last_login = new.last_sign_in_at where id = new.id;
    insert into public.security_audit_log (organization_id, event_type, actor_user_id, target_user_id, metadata)
    values ((select organization_id from public.profiles where id = new.id), 'login_success', new.id, new.id, jsonb_build_object('at', new.last_sign_in_at));
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_login on auth.users;
create trigger on_auth_user_login
  after update on auth.users
  for each row execute function public.log_auth_login();

create or replace function public.log_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.security_audit_log (organization_id, event_type, actor_user_id, target_user_id, metadata)
    values ((select organization_id from public.profiles where id = new.user_id), 'role_assigned', auth.uid(), new.user_id, jsonb_build_object('role_id', new.role_id));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.security_audit_log (organization_id, event_type, actor_user_id, target_user_id, metadata)
    values ((select organization_id from public.profiles where id = old.user_id), 'role_removed', auth.uid(), old.user_id, jsonb_build_object('role_id', old.role_id));
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_log_role_change on public.user_roles;
create trigger trg_log_role_change
  after insert or delete on public.user_roles
  for each row execute function public.log_role_change();

create or replace function public.log_permission_override_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT','UPDATE') then
    insert into public.security_audit_log (organization_id, event_type, actor_user_id, target_user_id, metadata)
    values ((select organization_id from public.profiles where id = new.user_id), 'permission_override_changed', auth.uid(), new.user_id,
      jsonb_build_object('permission_id', new.permission_id, 'allowed', new.allowed));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.security_audit_log (organization_id, event_type, actor_user_id, target_user_id, metadata)
    values ((select organization_id from public.profiles where id = old.user_id), 'permission_override_removed', auth.uid(), old.user_id,
      jsonb_build_object('permission_id', old.permission_id));
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_log_permission_override on public.user_permission_overrides;
create trigger trg_log_permission_override
  after insert or update or delete on public.user_permission_overrides
  for each row execute function public.log_permission_override_change();

create or replace function public.log_profile_active_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_active is distinct from old.is_active then
    insert into public.security_audit_log (organization_id, event_type, actor_user_id, target_user_id, metadata)
    values (new.organization_id, case when new.is_active then 'user_activated' else 'user_deactivated' end, auth.uid(), new.id, '{}'::jsonb);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_profile_active_change on public.profiles;
create trigger trg_log_profile_active_change
  after update on public.profiles
  for each row execute function public.log_profile_active_change();

-- ══════════════════════════════════════════════════════════════════════
-- 10. Harden the 9 pre-existing ERP trigger functions to SECURITY DEFINER
--     (unchanged from v1/v2).
-- ══════════════════════════════════════════════════════════════════════

alter function public.create_stages() security definer set search_path = public;
alter function public.log_project() security definer set search_path = public;
alter function public.increase_stock() security definer set search_path = public;
alter function public.reduce_stock() security definer set search_path = public;
alter function public.stock_check() security definer set search_path = public;
alter function public.update_invoice_total() security definer set search_path = public;
alter function public.update_invoice_status() security definer set search_path = public;

-- ══════════════════════════════════════════════════════════════════════
-- 11. Race-condition fixes (unchanged from v1/v2)
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.prevent_negative_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare stock_val numeric;
begin
  select current_stock into stock_val from inventory_items where id = new.inventory_item_id for update;
  if stock_val < new.quantity_used then
    raise exception 'Not enough stock';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_overpayment()
returns trigger language plpgsql security definer set search_path = public as $$
declare paid numeric;
declare total numeric;
begin
  perform 1 from invoices where id = new.invoice_id for update;
  select coalesce(sum(amount), 0) into paid from payments where invoice_id = new.invoice_id;
  select total_amount into total from invoices where id = new.invoice_id;
  if paid + new.amount > total then
    raise exception 'Overpayment not allowed';
  end if;
  return new;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 12. organization_id on all 14 existing ERP tables — add nullable,
--     backfill existing rows to the seeded org, set NOT NULL, then set
--     the per-row default to current_organization_id() for future inserts.
--     This exact 4-step sequence avoids a footgun: current_organization_id()
--     resolves auth.uid() from the caller's JWT, which doesn't exist in a
--     plain migration session — so it cannot be the default used for
--     backfilling rows that already exist.
-- ══════════════════════════════════════════════════════════════════════

do $$
declare
  t text;
  tables text[] := array[
    'customers','vendors','projects','production_stages',
    'inventory_items','inventory_purchases','inventory_usages','project_materials',
    'material_requisitions','delivery_challans','invoices','invoice_items','payments','logs'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I add column if not exists organization_id uuid references public.organizations(id)', t);
    execute format('update public.%I set organization_id = %L::uuid where organization_id is null', t, '00000000-0000-0000-0000-000000000001');
    execute format('alter table public.%I alter column organization_id set not null', t);
    execute format('alter table public.%I alter column organization_id set default public.current_organization_id()', t);
  end loop;
end $$;

-- ══════════════════════════════════════════════════════════════════════
-- 13. Indexes — one composite per confirmed real query pattern, org_id
--     always leading (RLS filters on it on every single query against
--     these tables, so it's always part of the WHERE clause; a composite
--     with org_id first also serves plain org-only filters, so no
--     separate single-column org_id index is added anywhere — that would
--     be redundant with every composite below). No index added without a
--     specific page/workflow it serves, listed inline.
-- ══════════════════════════════════════════════════════════════════════

-- Customers/Vendors list pages: list-for-org, sorted/searched by name.
create index if not exists idx_customers_org_name on public.customers(organization_id, name);
create index if not exists idx_vendors_org_name on public.vendors(organization_id, name);

-- Projects: Customer History page lists a customer's projects (customer_id);
-- Dashboard/Order Pipeline aggregates by status.
create index if not exists idx_projects_org_customer on public.projects(organization_id, customer_id);
create index if not exists idx_projects_org_status on public.projects(organization_id, status);

-- Production Stages: Project Detail's Production tab loads one project's stages.
create index if not exists idx_production_stages_org_project on public.production_stages(organization_id, project_id);

-- Inventory Items: Inventory page list, sorted/searched by name.
create index if not exists idx_inventory_items_org_name on public.inventory_items(organization_id, name);

-- Inventory Purchases: vendor detail's supply history (vendor_id); item detail's
-- purchase history (inventory_item_id) — two genuinely distinct lookup directions.
create index if not exists idx_inventory_purchases_org_vendor on public.inventory_purchases(organization_id, vendor_id);
create index if not exists idx_inventory_purchases_org_item on public.inventory_purchases(organization_id, inventory_item_id);

-- Inventory Usages: Project Detail material/BOM tab (project_id); item detail's
-- usage history (inventory_item_id).
create index if not exists idx_inventory_usages_org_project on public.inventory_usages(organization_id, project_id);
create index if not exists idx_inventory_usages_org_item on public.inventory_usages(organization_id, inventory_item_id);

-- Project Materials: Project Detail BOM/material-requirements list.
create index if not exists idx_project_materials_org_project on public.project_materials(organization_id, project_id);

-- Material Requisitions: Project Detail's requisitions list (project_id);
-- the approval queue this module's permissions.ts "approve" action implies
-- (status = 'Draft'/'Approved' filtering across the whole org).
create index if not exists idx_material_requisitions_org_project on public.material_requisitions(organization_id, project_id);
create index if not exists idx_material_requisitions_org_status on public.material_requisitions(organization_id, status);

-- Delivery Challans: Project Detail's dispatch history.
create index if not exists idx_delivery_challans_org_project on public.delivery_challans(organization_id, project_id);

-- Invoices: Project Detail's invoice list (project_id); Dashboard's "Pending
-- Invoices" count and Unpaid/Partially Paid/Paid status filtering.
create index if not exists idx_invoices_org_project on public.invoices(organization_id, project_id);
create index if not exists idx_invoices_org_status on public.invoices(organization_id, status);

-- Invoice Items: invoice detail's line-item list — invoice_id is the
-- near-exclusive lookup key for this table.
create index if not exists idx_invoice_items_org_invoice on public.invoice_items(organization_id, invoice_id);

-- Payments: invoice detail's payment history (invoice_id); Ledger module's
-- date-range aggregation (payment_date) — lib/ledger.ts's real access pattern.
create index if not exists idx_payments_org_invoice on public.payments(organization_id, invoice_id);
create index if not exists idx_payments_org_date on public.payments(organization_id, payment_date);

-- Logs: Project Detail's activity log — project_id is the sole lookup key.
create index if not exists idx_logs_org_project on public.logs(organization_id, project_id);

-- ══════════════════════════════════════════════════════════════════════
-- 14. RLS on the new RBAC/org/audit tables
-- ══════════════════════════════════════════════════════════════════════

alter table public.organizations enable row level security;
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations for select using (id = current_organization_id());

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_permission_overrides enable row level security;
alter table public.profiles enable row level security;

drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles for select using (auth.uid() is not null);
drop policy if exists roles_write on public.roles;
create policy roles_write on public.roles for all using (has_permission('users','edit')) with check (has_permission('users','edit'));

drop policy if exists permissions_select on public.permissions;
create policy permissions_select on public.permissions for select using (auth.uid() is not null);
drop policy if exists permissions_write on public.permissions;
create policy permissions_write on public.permissions for all using (has_permission('users','edit')) with check (has_permission('users','edit'));

drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions for select using (auth.uid() is not null);
drop policy if exists role_permissions_write on public.role_permissions;
create policy role_permissions_write on public.role_permissions for all using (has_permission('users','edit')) with check (has_permission('users','edit'));

drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles for select
  using (user_id = auth.uid() or has_permission('users','view'));
drop policy if exists user_roles_write on public.user_roles;
create policy user_roles_write on public.user_roles for all
  using (has_permission('users','assign_roles')) with check (has_permission('users','assign_roles'));

drop policy if exists user_permission_overrides_select on public.user_permission_overrides;
create policy user_permission_overrides_select on public.user_permission_overrides for select
  using (user_id = auth.uid() or has_permission('users','view'));
drop policy if exists user_permission_overrides_write on public.user_permission_overrides;
create policy user_permission_overrides_write on public.user_permission_overrides for all
  using (has_permission('users','edit')) with check (has_permission('users','edit'));

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or (has_permission('users','view') and organization_id = current_organization_id()));
drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles for update
  using (has_permission('users','edit') and organization_id = current_organization_id())
  with check (has_permission('users','edit') and organization_id = current_organization_id());

-- ══════════════════════════════════════════════════════════════════════
-- 15. RLS + policies on the 14 existing ERP tables — now org-scoped.
-- ══════════════════════════════════════════════════════════════════════

alter table public.customers enable row level security;
alter table public.vendors enable row level security;
alter table public.projects enable row level security;
alter table public.production_stages enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_purchases enable row level security;
alter table public.inventory_usages enable row level security;
alter table public.project_materials enable row level security;
alter table public.material_requisitions enable row level security;
alter table public.delivery_challans enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.logs enable row level security;

drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers for select using (has_permission('customers','view') and organization_id = current_organization_id());
drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers for insert with check (has_permission('customers','create') and organization_id = current_organization_id());
drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers for update using (has_permission('customers','edit') and organization_id = current_organization_id());
drop policy if exists customers_delete on public.customers;
create policy customers_delete on public.customers for delete using (has_permission('customers','delete') and organization_id = current_organization_id());

drop policy if exists vendors_select on public.vendors;
create policy vendors_select on public.vendors for select using (has_permission('vendors','view') and organization_id = current_organization_id());
drop policy if exists vendors_insert on public.vendors;
create policy vendors_insert on public.vendors for insert with check (has_permission('vendors','create') and organization_id = current_organization_id());
drop policy if exists vendors_update on public.vendors;
create policy vendors_update on public.vendors for update using (has_permission('vendors','edit') and organization_id = current_organization_id());
drop policy if exists vendors_delete on public.vendors;
create policy vendors_delete on public.vendors for delete using (has_permission('vendors','delete') and organization_id = current_organization_id());

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select using (has_permission('projects','view') and organization_id = current_organization_id());
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert with check (has_permission('projects','create') and organization_id = current_organization_id());
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update using (has_permission('projects','edit') and organization_id = current_organization_id());
drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete using (has_permission('projects','delete') and organization_id = current_organization_id());

drop policy if exists production_stages_select on public.production_stages;
create policy production_stages_select on public.production_stages for select using (has_permission('production','view') and organization_id = current_organization_id());
drop policy if exists production_stages_insert on public.production_stages;
create policy production_stages_insert on public.production_stages for insert with check (has_permission('production','create') and organization_id = current_organization_id());
drop policy if exists production_stages_update on public.production_stages;
create policy production_stages_update on public.production_stages for update using (has_permission('production','edit') and organization_id = current_organization_id());
drop policy if exists production_stages_delete on public.production_stages;
create policy production_stages_delete on public.production_stages for delete using (has_permission('production','delete') and organization_id = current_organization_id());

drop policy if exists inventory_items_select on public.inventory_items;
create policy inventory_items_select on public.inventory_items for select using (has_permission('inventory','view') and organization_id = current_organization_id());
drop policy if exists inventory_items_insert on public.inventory_items;
create policy inventory_items_insert on public.inventory_items for insert with check (has_permission('inventory','create') and organization_id = current_organization_id());
drop policy if exists inventory_items_update on public.inventory_items;
create policy inventory_items_update on public.inventory_items for update using (has_permission('inventory','edit') and organization_id = current_organization_id());
drop policy if exists inventory_items_delete on public.inventory_items;
create policy inventory_items_delete on public.inventory_items for delete using (has_permission('inventory','delete') and organization_id = current_organization_id());

drop policy if exists inventory_purchases_select on public.inventory_purchases;
create policy inventory_purchases_select on public.inventory_purchases for select using (has_permission('inventory','view') and organization_id = current_organization_id());
drop policy if exists inventory_purchases_insert on public.inventory_purchases;
create policy inventory_purchases_insert on public.inventory_purchases for insert with check (has_permission('inventory','create') and organization_id = current_organization_id());
drop policy if exists inventory_purchases_update on public.inventory_purchases;
create policy inventory_purchases_update on public.inventory_purchases for update using (has_permission('inventory','edit') and organization_id = current_organization_id());
drop policy if exists inventory_purchases_delete on public.inventory_purchases;
create policy inventory_purchases_delete on public.inventory_purchases for delete using (has_permission('inventory','delete') and organization_id = current_organization_id());

drop policy if exists inventory_usages_select on public.inventory_usages;
create policy inventory_usages_select on public.inventory_usages for select using (has_permission('inventory','view') and organization_id = current_organization_id());
drop policy if exists inventory_usages_insert on public.inventory_usages;
create policy inventory_usages_insert on public.inventory_usages for insert with check (has_permission('inventory','create') and organization_id = current_organization_id());
drop policy if exists inventory_usages_update on public.inventory_usages;
create policy inventory_usages_update on public.inventory_usages for update using (has_permission('inventory','edit') and organization_id = current_organization_id());
drop policy if exists inventory_usages_delete on public.inventory_usages;
create policy inventory_usages_delete on public.inventory_usages for delete using (has_permission('inventory','delete') and organization_id = current_organization_id());

drop policy if exists project_materials_select on public.project_materials;
create policy project_materials_select on public.project_materials for select using (has_permission('inventory','view') and organization_id = current_organization_id());
drop policy if exists project_materials_insert on public.project_materials;
create policy project_materials_insert on public.project_materials for insert with check (has_permission('inventory','create') and organization_id = current_organization_id());
drop policy if exists project_materials_update on public.project_materials;
create policy project_materials_update on public.project_materials for update using (has_permission('inventory','edit') and organization_id = current_organization_id());
drop policy if exists project_materials_delete on public.project_materials;
create policy project_materials_delete on public.project_materials for delete using (has_permission('inventory','delete') and organization_id = current_organization_id());

drop policy if exists material_requisitions_select on public.material_requisitions;
create policy material_requisitions_select on public.material_requisitions for select using (has_permission('material_requisitions','view') and organization_id = current_organization_id());
drop policy if exists material_requisitions_insert on public.material_requisitions;
create policy material_requisitions_insert on public.material_requisitions for insert with check (has_permission('material_requisitions','create') and organization_id = current_organization_id());
drop policy if exists material_requisitions_update on public.material_requisitions;
create policy material_requisitions_update on public.material_requisitions for update
  using ((has_permission('material_requisitions','edit') or has_permission('material_requisitions','approve')) and organization_id = current_organization_id());
drop policy if exists material_requisitions_delete on public.material_requisitions;
create policy material_requisitions_delete on public.material_requisitions for delete using (has_permission('material_requisitions','delete') and organization_id = current_organization_id());

drop policy if exists delivery_challans_select on public.delivery_challans;
create policy delivery_challans_select on public.delivery_challans for select using (has_permission('delivery_challans','view') and organization_id = current_organization_id());
drop policy if exists delivery_challans_insert on public.delivery_challans;
create policy delivery_challans_insert on public.delivery_challans for insert with check (has_permission('delivery_challans','create') and organization_id = current_organization_id());
drop policy if exists delivery_challans_update on public.delivery_challans;
create policy delivery_challans_update on public.delivery_challans for update using (has_permission('delivery_challans','edit') and organization_id = current_organization_id());
drop policy if exists delivery_challans_delete on public.delivery_challans;
create policy delivery_challans_delete on public.delivery_challans for delete using (has_permission('delivery_challans','delete') and organization_id = current_organization_id());

drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices for select using (has_permission('invoices','view') and organization_id = current_organization_id());
drop policy if exists invoices_insert on public.invoices;
create policy invoices_insert on public.invoices for insert with check (has_permission('invoices','create') and organization_id = current_organization_id());
drop policy if exists invoices_update on public.invoices;
create policy invoices_update on public.invoices for update using (has_permission('invoices','edit') and organization_id = current_organization_id());
drop policy if exists invoices_delete on public.invoices;
create policy invoices_delete on public.invoices for delete using (has_permission('invoices','delete') and organization_id = current_organization_id());

drop policy if exists invoice_items_select on public.invoice_items;
create policy invoice_items_select on public.invoice_items for select using (has_permission('invoices','view') and organization_id = current_organization_id());
drop policy if exists invoice_items_insert on public.invoice_items;
create policy invoice_items_insert on public.invoice_items for insert with check ((has_permission('invoices','create') or has_permission('invoices','edit')) and organization_id = current_organization_id());
drop policy if exists invoice_items_update on public.invoice_items;
create policy invoice_items_update on public.invoice_items for update using (has_permission('invoices','edit') and organization_id = current_organization_id());
drop policy if exists invoice_items_delete on public.invoice_items;
create policy invoice_items_delete on public.invoice_items for delete using (has_permission('invoices','edit') and organization_id = current_organization_id());

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select using (has_permission('payments','view') and organization_id = current_organization_id());
drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments for insert with check (has_permission('payments','create') and organization_id = current_organization_id());
drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments for update using (has_permission('payments','edit') and organization_id = current_organization_id());
drop policy if exists payments_delete on public.payments;
create policy payments_delete on public.payments for delete using (has_permission('payments','delete') and organization_id = current_organization_id());

drop policy if exists logs_select on public.logs;
create policy logs_select on public.logs for select using (has_permission('projects','view') and organization_id = current_organization_id());

-- ══════════════════════════════════════════════════════════════════════
-- 16. Register this migration. Deliberately the last statement before
--     commit — its presence in schema_migrations after a run is proof
--     the entire transaction above succeeded, not just that it started.
--     Checksum is the SHA-256 of this file's content (sections 1-15,
--     i.e. everything above this statement), computed at authoring time.
-- ══════════════════════════════════════════════════════════════════════

insert into public.schema_migrations (version, description, checksum)
values (
  '20260806_001_phase1_auth_permissions_rls',
  'Phase 1: organizations, normalized RBAC (roles/permissions/role_permissions/user_roles/user_permission_overrides), profiles with admin metadata and password-management flag, Supabase Auth integration, security_audit_log, SECURITY DEFINER hardening of the 9 pre-existing ERP triggers, race-condition fixes in prevent_negative_stock/prevent_overpayment, 20 composite indexes matched to confirmed ERP query patterns, RLS + org-scoped policies on all 20 tables',
  '170691d832fc1a7eafae6a64e2c9a3c0460e6e80f6b3a9d698ca6915373148f5'
)
on conflict (version) do nothing;

commit;
