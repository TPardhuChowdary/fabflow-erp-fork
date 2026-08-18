-- FabFlow ERP — Phase 43: Six additive enhancements over the completed
-- 53-item master scope (Tools/Dies photos + purchase history + tool
-- issue/return log, Dies mandatory Drawing Repository link, Employee
-- employment type). Machinery drawing linkage needs zero schema change
-- (already correct — see plan §A). Machine/Service rate-history UX and
-- Invoice multi-project lines are pure frontend — no schema here either.
--
-- Every change below is additive/nullable/defaulted; no existing row's
-- data or behavior is touched. Idempotent: safe to run multiple times.

begin;

-- ══════════════════════════════════════════════════════════════════════
-- 1. tools — photo + vendor (purchase_date/replacement_value already
--    existed since Phase 37; only the vendor was missing, mirroring the
--    purchase_vendor_id/purchase_vendor_name pair Machines already have).
-- ══════════════════════════════════════════════════════════════════════

alter table public.tools add column if not exists photo_data text;
alter table public.tools add column if not exists purchase_vendor_id uuid references public.vendors(id) on delete set null;
alter table public.tools add column if not exists purchase_vendor_name text;

-- ══════════════════════════════════════════════════════════════════════
-- 2. tool_assignment_history — insert-only audit log of who has/had a
--    tool, mirroring machine_service_rate_history's shape exactly
--    (Phase 40): no update/delete policy exists, so a past issue/return
--    record can never be edited or removed. tools.assigned_employee_id
--    (Phase 37) is NOT replaced — it stays the live "current holder"
--    scalar, kept in sync by the same write that inserts a history row
--    (see lib/toolsApi.ts issueToolRemote/returnToolRemote). This table
--    only adds the auditable "who/when" trail on top of the existing
--    column — never a second source of truth for who has it right now.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.tool_assignment_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_organization_id(),
  tool_id uuid not null references public.tools(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null, -- null = returned/unassigned
  action text not null check (action in ('issued', 'returned')),
  notes text,
  recorded_by uuid references auth.users(id),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_tool_assignment_history_org on public.tool_assignment_history (organization_id);
create index if not exists idx_tool_assignment_history_tool on public.tool_assignment_history (tool_id, recorded_at desc);

alter table public.tool_assignment_history enable row level security;

drop policy if exists tool_assignment_history_select on public.tool_assignment_history;
create policy tool_assignment_history_select on public.tool_assignment_history for select
  using (has_permission('tools', 'view') and organization_id = current_organization_id());

drop policy if exists tool_assignment_history_insert on public.tool_assignment_history;
create policy tool_assignment_history_insert on public.tool_assignment_history for insert
  with check (has_permission('tools', 'assign') and organization_id = current_organization_id());

-- ══════════════════════════════════════════════════════════════════════
-- 3. dies — photo + full purchase info (Phase 38 had none of these;
--    mirrors the same purchase_date/purchase_cost/purchase_vendor_id/
--    purchase_vendor_name shape Machines already carry from Phase 35).
-- ══════════════════════════════════════════════════════════════════════

alter table public.dies add column if not exists photo_data text;
alter table public.dies add column if not exists purchase_date date;
alter table public.dies add column if not exists purchase_cost numeric;
alter table public.dies add column if not exists purchase_vendor_id uuid references public.vendors(id) on delete set null;
alter table public.dies add column if not exists purchase_vendor_name text;

-- ══════════════════════════════════════════════════════════════════════
-- 4. drawing_links.linked_type — widen the existing check constraint
--    (Phase 14) to add 'die', reusing the exact same many-to-many
--    linking table/API (addLink/removeLink/getLinksForEntity) already
--    used for machine/project/vendor/customer. No new table, no
--    duplicate drawing storage — Drawing Repository stays the sole
--    source of truth for every drawing's actual content.
-- ══════════════════════════════════════════════════════════════════════

alter table public.drawing_links drop constraint if exists drawing_links_linked_type_check;
alter table public.drawing_links add constraint drawing_links_linked_type_check
  check (linked_type in ('project', 'machine', 'vendor', 'customer', 'die'));

-- ══════════════════════════════════════════════════════════════════════
-- 5. employees — new, distinct employment_type classification. Kept
--    fully separate from the pre-existing employee_type column (Phase 2,
--    ID-card accent color only) to avoid conflating two unrelated
--    concerns. Every existing employee silently defaults to
--    'Permanent' with temp_start_date/temp_end_date/daily_wage_rate
--    left null — zero behavior change for any current record.
--    "Who worked on a particular day" is answered entirely by the
--    already-existing attendance_records table (Phase 2) — no new
--    schema needed for that part.
-- ══════════════════════════════════════════════════════════════════════

alter table public.employees add column if not exists employment_type text
  check (employment_type in ('Permanent', 'Temporary', 'Daily Wage'))
  default 'Permanent';
alter table public.employees add column if not exists temp_start_date date;
alter table public.employees add column if not exists temp_end_date date;
alter table public.employees add column if not exists daily_wage_rate numeric;

insert into public.schema_migrations (version, description, checksum)
values (
  '20260817_043_phase43_tools_dies_photos_purchase_history_employee_type',
  'Phase 43: tools.photo_data/purchase_vendor_id/purchase_vendor_name; new insert-only tool_assignment_history log (mirrors machine_service_rate_history); dies.photo_data/purchase_date/purchase_cost/purchase_vendor_id/purchase_vendor_name; drawing_links.linked_type widened to include ''die'' (reuses existing DrawingLink table/API, no duplicate drawing storage); employees.employment_type/temp_start_date/temp_end_date/daily_wage_rate (new field, kept distinct from the pre-existing ID-card-only employee_type column). All additive/nullable/defaulted, zero existing data touched.',
  'phase43-tools-dies-employee-v1'
)
on conflict (version) do nothing;

commit;
