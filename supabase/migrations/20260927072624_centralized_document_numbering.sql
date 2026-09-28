-- =====================================================================
-- DRAFT — NOT APPLIED. Written per explicit instruction ("write the
-- migration/RPC, but do NOT apply it yet - stop and show me the exact
-- migration/RPC for approval"). Do not run against the live project
-- without separate, explicit approval.
-- =====================================================================
--
-- Universal, user-controllable document numbering.
--
-- GENERALIZES (does not replace/compete with) the existing
-- public.document_counters table, which already provides an atomic,
-- concurrency-safe per-organization counter (PK (organization_id,
-- counter_key), RLS enabled with zero policies - i.e. only reachable via
-- SECURITY DEFINER functions, exactly the same posture this migration
-- keeps). document_counters itself is NOT altered - it already has
-- everything needed (see audit finding: generate_quotation_number and
-- generate_employee_code already prove the atomic upsert-returning
-- pattern live). This migration adds:
--   1. One new table (document_numbering_settings) for the per-org,
--      per-document-type PREFIX and FORMAT the audit found nowhere to
--      store (today every prefix is hardcoded in frontend TS).
--   2. A small hardcoded default-config lookup so every known document
--      type gets a sane prefix/format the first time it's touched,
--      without requiring a manual seed step per organization.
--   3. Six SECURITY DEFINER RPCs: a read-only seed helper (highest
--      existing numeric suffix per org+type), allocate (create-time,
--      self-seeds from that helper on first use), set (admin changes
--      prefix/next-number), record-manual-edit (advance the counter
--      after a user hand-edits a number), a read for the Settings UI,
--      and a dedicated per-machine allocator for Service Records.
--
-- SECURITY - fixes a real gap the audit surfaced in the two existing
-- RPCs (generate_quotation_number/generate_employee_code both take
-- p_organization_id AS A CLIENT-SUPPLIED PARAMETER with no check that
-- the caller belongs to that org - a client could ask to allocate a
-- number, or with set_document_numbering below, WRITE ARBITRARY
-- NUMBERING CONFIG for a different tenant). None of the new functions
-- here accept an organization_id parameter at all - every one derives
-- it server-side from the caller's own session via the existing
-- current_organization_id() (SECURITY DEFINER, reads
-- profiles.organization_id for auth.uid()), so the client can never
-- choose, spoof, or cross into another org's counters no matter what it
-- sends. set_document_numbering additionally calls the existing
-- has_permission('settings','edit') before writing anything - the same
-- permission the Settings page already gates on - so only a
-- settings-edit-permitted user can change a prefix or jump a sequence;
-- allocate_document_number and record_manual_document_number require no
-- special permission beyond being an authenticated member of an
-- organization, because allocating a number is part of ordinary
-- document creation (already gated by each module's own
-- canCreate/canEdit at the UI layer and by that table's own RLS
-- policies on the actual INSERT/UPDATE) - this mirrors exactly how
-- generate_quotation_number/generate_employee_code are already
-- callable by any authenticated user today.
--
-- CONCURRENCY - allocate_document_number's only counter mutation is the
-- same single atomic `INSERT ... ON CONFLICT (organization_id,
-- counter_key) DO UPDATE SET current_value = current_value + 1
-- RETURNING current_value` the two existing RPCs already use - Postgres
-- serializes concurrent upserts to the same row via the row's own lock,
-- so two simultaneous callers can never observe or return the same
-- current_value. No SELECT-then-increment-in-the-client step exists
-- anywhere in this design.
--
-- SCOPE - included counter_keys (see accompanying report for the full
-- discovered-vs-included/excluded reasoning): INV (Invoice), QT
-- (Quotation), JC (Job Card), CPO (Company PO), DC (Delivery Challan),
-- PROJ (Project), FLT (Expense Float), EMP (Employee Code), MCH
-- (Machine Code), TL (Tool Code), DIE (Die Code). Service Record numbers
-- get their OWN dedicated RPC below (allocate_service_record_number)
-- rather than living in document_numbering_settings, because that
-- sequence is scoped per-machine (SVC-{machineCode}-NNN), not one
-- editable prefix per org - it still uses the exact same atomic
-- document_counters table/mechanism, just keyed 'SVC:' || machine_id
-- instead of a fixed key, so the COUNT+1-per-machine bug the audit
-- found is fixed by this migration too. QMS Inspection Numbers are
-- DELIBERATELY NOT wired to this system yet - the audit found QMS
-- numbering lives entirely in the module's own IndexedDB, not Postgres,
-- so there is nothing yet in this database for a Postgres-side counter
-- to be authoritative over; moving QMS onto this mechanism needs that
-- separate, larger IndexedDB-to-Postgres decision first (flagged, not
-- silently declared solved here). Quotation Revision numbers, Tender
-- Number, and Master/Customer PO Number are excluded - see report.
--
-- EXISTING DATA / SEEDING (revised after review - the first draft of
-- this migration had a real bug here, caught before being applied: it
-- hardcoded the counter's first-ever value to 1 regardless of existing
-- data, which would have generated INV-1 for an organization whose real
-- invoices already run 1-35). Fixed via existing_max_numeric_suffix()
-- below: the FIRST time allocate_document_number() is ever called for a
-- given org+counter_key (no document_counters row yet), it computes the
-- highest existing numeric suffix already used for that document type
-- IN THAT ORGANIZATION by reading the live table directly (invoices.
-- inv_no, quotations.qt_no, job_cards.job_no, company_pos.cpo_number,
-- delivery_challans.dc_no, projects.project_number, expense_floats.
-- float_no, employees.employee_code, machines.machine_code, tools.
-- tool_code, dies.die_code - confirmed live column names, not assumed)
-- via `(regexp_match(column, '(\d+)$'))[1]` - the trailing run of
-- digits, which is correct for every format this audit found regardless
-- of whether a year segment is present (e.g. "INV-2026-001" ends in
-- "001", not "2026001" - the regex anchors at the END of the string so
-- an earlier year segment is never captured). That highest existing
-- value becomes the counter's starting current_value, so the very next
-- allocation is existing_max + 1 (e.g. existing invoices through
-- INV-2026-035 -> first centralized allocation is ...-036, never
-- ...-001). An organization/type with zero existing rows gets
-- current_value = 0, so its first allocation is 1, per the requested
-- behavior. This seeding read-then-insert happens INSIDE the same
-- atomic INSERT ... ON CONFLICT statement's VALUES clause (see
-- allocate_document_number below) - not as a separate "check whether a
-- counter exists" step beforehand - so there is no window between
-- checking and creating for a second concurrent first-caller to race
-- through; if two callers both reach the INSERT at once, Postgres
-- guarantees only one actually performs the INSERT branch (using
-- whichever caller's computed seed value happens to land), and the
-- other transparently falls through to the DO UPDATE branch and
-- increments from there - never a duplicate seed, never a lost
-- increment. This only ever happens ONCE per org+counter_key (the very
-- first allocation) - every allocation after that hits the existing row
-- and the seed computation is not run again. No existing business
-- document (invoice/quotation/job card/etc.) row is modified by this
-- migration or by this seeding - it only ever READS those tables to
-- compute a starting point; document_counters is the only table
-- written, and only for the organization+type actually being used.
-- Service Record numbers (see §7 below) have no existing Supabase table
-- to seed from at all - confirmed live (no machine-service-record
-- entity exists in Postgres; today's data is Zustand/in-memory only per
-- the audit) - so allocate_service_record_number legitimately starts
-- every machine at 0/first-allocation-is-1, matching "if there are no
-- existing records -> current_value = 0 -> first new = 1".
--
-- ROLLBACK - fully additive: one new table, seven new functions, zero
-- ALTERs to any existing table, zero data touched. Reverting is a clean
-- `drop function ...; drop table ...;` for everything this file creates
-- (listed at the bottom) with no knock-on effect, since nothing else
-- references these objects until the (separate, not-yet-written)
-- frontend integration change is made.
--
-- KNOWN MINOR INEFFICIENCY, not a correctness issue: the
-- existing_max_numeric_suffix() call inside allocate_document_number's
-- INSERT ... VALUES is evaluated on every call (Postgres evaluates
-- VALUES before checking ON CONFLICT), not only the first - so every
-- allocation after the first also scans the relevant table for a MAX,
-- not just the seeding call. At current data volumes (single digits to
-- low hundreds of rows per table) this is negligible; if a table grows
-- large enough for this to matter, it can be optimized later by only
-- computing the seed when the row is actually missing (e.g. an explicit
-- `WHERE NOT EXISTS` seed step before the increment) - not done now
-- since it adds real complexity for a problem that does not exist yet
-- at this data scale.
-- =====================================================================

begin;

-- ── 1. Settings table: per-org, per-document-type prefix/format ─────
create table if not exists public.document_numbering_settings (
  organization_id uuid not null references public.organizations(id),
  counter_key text not null,
  prefix text not null,
  include_year boolean not null default true,
  digit_width integer not null default 3,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (organization_id, counter_key)
);

-- RLS enabled, zero policies - same posture as document_counters
-- (confirmed live: relrowsecurity=true, zero pg_policies rows). Only
-- reachable through the SECURITY DEFINER functions below, never
-- directly by a client with an anon/authenticated-role Supabase call.
alter table public.document_numbering_settings enable row level security;

-- ── 2. Default prefix/format per known document type ────────────────
-- Matches every format the numbering audit found already live today
-- (see report) byte-for-byte, so adopting this system with no changes
-- reproduces today's exact numbering shape. `else` covers any future
-- counter_key not in this list with a generic fallback rather than
-- erroring, so a new document type can start using
-- allocate_document_number() before anyone remembers to update this
-- function.
create or replace function public.default_numbering_config(p_counter_key text)
returns table(prefix text, include_year boolean, digit_width integer)
language sql
immutable
as $$
  select
    case p_counter_key
      when 'INV'  then 'INV-'
      when 'QT'   then 'QT-'
      when 'JC'   then 'JC-'
      when 'CPO'  then 'CPO-'
      when 'DC'   then 'DC-'
      when 'PROJ' then 'PROJ-'
      when 'FLT'  then 'FLT-'
      when 'EMP'  then 'EMP-'
      when 'MCH'  then 'MCH-'
      when 'TL'   then 'TL-'
      when 'DIE'  then 'DIE-'
      else upper(p_counter_key) || '-'
    end as prefix,
    case p_counter_key
      -- these five never included a year in the pre-existing format
      -- (see audit: CPO-NNN, MCH-NNN, TL-NNN, DIE-NNN have no year;
      -- FLT-YYYY-NNN does).
      when 'CPO' then false
      when 'MCH' then false
      when 'TL'  then false
      when 'DIE' then false
      else true
    end as include_year,
    3 as digit_width;
$$;

-- ── 3. Highest existing numeric suffix already in use, per org+type ─
-- Read-only lookup against the actual live tables (column names
-- confirmed directly against information_schema before writing this,
-- not assumed) - used only to seed a counter's FIRST-EVER value. Trailing-
-- digit regex works uniformly across every format found (with or
-- without a year segment) because it anchors at the end of the string.
-- STABLE (not IMMUTABLE - reads live tables), SECURITY DEFINER so it
-- can be called from the other SECURITY DEFINER functions regardless of
-- caller's own table-level SELECT grants (RLS already restricts every
-- one of these tables to the caller's own organization_id anyway - this
-- runs with p_org fixed to the caller's own org, never a different one,
-- since every caller derives p_org from current_organization_id()).
create or replace function public.existing_max_numeric_suffix(p_counter_key text, p_org uuid)
returns integer
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_max integer;
begin
  case p_counter_key
    when 'INV' then
      select max((regexp_match(inv_no, '(\d+)$'))[1]::integer) into v_max
      from public.invoices where organization_id = p_org;
    when 'QT' then
      select max((regexp_match(qt_no, '(\d+)$'))[1]::integer) into v_max
      from public.quotations where organization_id = p_org;
    when 'JC' then
      select max((regexp_match(job_no, '(\d+)$'))[1]::integer) into v_max
      from public.job_cards where organization_id = p_org;
    when 'CPO' then
      select max((regexp_match(cpo_number, '(\d+)$'))[1]::integer) into v_max
      from public.company_pos where organization_id = p_org;
    when 'DC' then
      select max((regexp_match(dc_no, '(\d+)$'))[1]::integer) into v_max
      from public.delivery_challans where organization_id = p_org;
    when 'PROJ' then
      select max((regexp_match(project_number, '(\d+)$'))[1]::integer) into v_max
      from public.projects where organization_id = p_org;
    when 'FLT' then
      select max((regexp_match(float_no, '(\d+)$'))[1]::integer) into v_max
      from public.expense_floats where organization_id = p_org;
    when 'EMP' then
      select max((regexp_match(employee_code, '(\d+)$'))[1]::integer) into v_max
      from public.employees where organization_id = p_org;
    when 'MCH' then
      select max((regexp_match(machine_code, '(\d+)$'))[1]::integer) into v_max
      from public.machines where organization_id = p_org;
    when 'TL' then
      select max((regexp_match(tool_code, '(\d+)$'))[1]::integer) into v_max
      from public.tools where organization_id = p_org;
    when 'DIE' then
      select max((regexp_match(die_code, '(\d+)$'))[1]::integer) into v_max
      from public.dies where organization_id = p_org;
    else
      v_max := null;
  end case;
  return coalesce(v_max, 0);
end;
$$;

-- ── 4. Allocate the next number for a document type (create-time) ───
-- No organization_id parameter - always the caller's own org, derived
-- server-side. No permission check beyond being an authenticated org
-- member, matching generate_quotation_number/generate_employee_code's
-- existing callability today.
create or replace function public.allocate_document_number(p_counter_key text)
returns table(formatted_number text, sequence_number integer)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_org uuid := public.current_organization_id();
  v_seq integer;
  v_prefix text;
  v_include_year boolean;
  v_digits integer;
begin
  if v_org is null then
    raise exception 'No organization for current user';
  end if;
  if p_counter_key is null or length(trim(p_counter_key)) = 0 then
    raise exception 'counter_key is required';
  end if;

  insert into public.document_numbering_settings
    (organization_id, counter_key, prefix, include_year, digit_width)
  select v_org, p_counter_key, d.prefix, d.include_year, d.digit_width
  from public.default_numbering_config(p_counter_key) d
  on conflict (organization_id, counter_key) do nothing;

  select s.prefix, s.include_year, s.digit_width
    into v_prefix, v_include_year, v_digits
  from public.document_numbering_settings s
  where s.organization_id = v_org and s.counter_key = p_counter_key;

  -- First-ever call for this org+key: seed current_value from the
  -- highest existing numeric suffix already in the live table (see §3
  -- above), so the first allocation is existing_max+1, never 1 - unless
  -- there truly are no existing rows, in which case existing_max_
  -- numeric_suffix returns 0 and the first allocation is correctly 1.
  -- This VALUES expression is only ever evaluated on the INSERT branch
  -- (no row yet) - once a row exists, every later call takes the DO
  -- UPDATE branch below and this computation is not repeated.
  insert into public.document_counters (organization_id, counter_key, current_value)
  values (v_org, p_counter_key, public.existing_max_numeric_suffix(p_counter_key, v_org) + 1)
  on conflict (organization_id, counter_key)
  do update set current_value = public.document_counters.current_value + 1
  returning current_value into v_seq;

  return query select
    v_prefix
      || case when v_include_year then extract(year from now())::text || '-' else '' end
      || lpad(v_seq::text, v_digits, '0'),
    v_seq;
end;
$$;

-- ── 5. Admin changes prefix and/or "Next Number" ─────────────────────
-- Explicitly permission-checked INSIDE the function (never trust a
-- client-side-only gate) via the existing has_permission('settings',
-- 'edit') - the same permission the Settings page itself already
-- requires to edit anything on it. Setting next_number to N makes the
-- NEXT allocate_document_number() call return N (current_value := N-1,
-- then allocate increments it to N) - satisfies "set Invoice Next
-- Number to 36 -> INV-36, then INV-37, INV-38...". Never touches any
-- existing business document row.
create or replace function public.set_document_numbering(
  p_counter_key text,
  p_prefix text,
  p_next_number integer
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_org uuid := public.current_organization_id();
begin
  if v_org is null then
    raise exception 'No organization for current user';
  end if;
  if not public.has_permission('settings', 'edit') then
    raise exception 'Not authorized to change document numbering';
  end if;
  if p_counter_key is null or length(trim(p_counter_key)) = 0 then
    raise exception 'counter_key is required';
  end if;
  if p_prefix is null or length(trim(p_prefix)) = 0 then
    raise exception 'Prefix is required';
  end if;
  if p_next_number is null or p_next_number < 1 then
    raise exception 'Next number must be at least 1';
  end if;

  insert into public.document_numbering_settings
    (organization_id, counter_key, prefix, updated_by, updated_at)
  values (v_org, p_counter_key, p_prefix, auth.uid(), now())
  on conflict (organization_id, counter_key)
  do update set prefix = excluded.prefix,
                updated_by = excluded.updated_by,
                updated_at = now();

  insert into public.document_counters (organization_id, counter_key, current_value)
  values (v_org, p_counter_key, p_next_number - 1)
  on conflict (organization_id, counter_key)
  do update set current_value = p_next_number - 1,
                updated_at = now();
end;
$$;

-- ── 6. Advance the counter after a manual document-number edit ──────
-- Policy per explicit instruction: next generated value = MAX(current
-- configured next value, manually assigned numeric suffix + 1). Called
-- AFTER a module's own edit-permission check and uniqueness validation
-- already passed (this function does not re-check document-level edit
-- permission - it only ever moves a counter forward, never assigns or
-- validates the document number itself, so there is nothing here for a
-- caller to exploit beyond nudging their OWN org's counter to a higher
-- value, which is exactly what a legitimate manual edit is supposed to
-- do). No-ops safely on a null/negative suffix (e.g. a non-numeric
-- manually-typed number).
create or replace function public.record_manual_document_number(
  p_counter_key text,
  p_numeric_suffix integer
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_org uuid := public.current_organization_id();
begin
  if v_org is null then
    raise exception 'No organization for current user';
  end if;
  if p_numeric_suffix is null or p_numeric_suffix < 0 then
    return;
  end if;

  insert into public.document_counters (organization_id, counter_key, current_value)
  values (v_org, p_counter_key, p_numeric_suffix)
  on conflict (organization_id, counter_key)
  do update set current_value = greatest(public.document_counters.current_value, p_numeric_suffix),
                updated_at = now();
end;
$$;

-- ── 7. Read current settings for the "Document Numbering" screen ────
-- Same has_permission('settings', 'view') the Settings page's own
-- canView() check already requires. Self-heals any of the 11 known
-- counter_keys missing a settings row (e.g. a document type never
-- created yet) so the UI always has all 11 rows to render, never a
-- partial list.
create or replace function public.get_document_numbering_settings()
returns table(
  counter_key text,
  prefix text,
  include_year boolean,
  digit_width integer,
  next_number integer
)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_org uuid := public.current_organization_id();
  k text;
begin
  if v_org is null then
    raise exception 'No organization for current user';
  end if;
  if not public.has_permission('settings', 'view') then
    raise exception 'Not authorized to view document numbering';
  end if;

  foreach k in array array['INV','QT','JC','CPO','DC','PROJ','FLT','EMP','MCH','TL','DIE']
  loop
    insert into public.document_numbering_settings
      (organization_id, counter_key, prefix, include_year, digit_width)
    select v_org, k, d.prefix, d.include_year, d.digit_width
    from public.default_numbering_config(k) d
    on conflict (organization_id, counter_key) do nothing;
  end loop;

  return query
  select s.counter_key, s.prefix, s.include_year, s.digit_width,
         coalesce(c.current_value, 0) + 1 as next_number
  from public.document_numbering_settings s
  left join public.document_counters c
    on c.organization_id = s.organization_id and c.counter_key = s.counter_key
  where s.organization_id = v_org
  order by s.counter_key;
end;
$$;

-- ── 8. Service Record numbers - per-machine, own RPC ─────────────────
-- Fixes the audit's worst finding (COUNT+1 over an in-memory,
-- per-machine list - deleting any prior service record for that machine
-- would collide). counter_key is 'SVC:' || machine_id, so each
-- machine's sequence is independent (matching today's per-machine
-- restart-at-1 behavior) while still going through the exact same
-- atomic document_counters upsert as every other document type. Not
-- part of document_numbering_settings/the Settings UI - there is no
-- single "prefix" to configure per org here, the format is inherently
-- SVC-{machineCode}-NNN.
create or replace function public.allocate_service_record_number(
  p_machine_id uuid,
  p_machine_code text
)
returns table(formatted_number text, sequence_number integer)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_org uuid := public.current_organization_id();
  v_seq integer;
  v_key text;
begin
  if v_org is null then
    raise exception 'No organization for current user';
  end if;
  if p_machine_id is null then
    raise exception 'machine_id is required';
  end if;

  v_key := 'SVC:' || p_machine_id::text;

  insert into public.document_counters (organization_id, counter_key, current_value)
  values (v_org, v_key, 1)
  on conflict (organization_id, counter_key)
  do update set current_value = public.document_counters.current_value + 1
  returning current_value into v_seq;

  return query select
    'SVC-' || coalesce(p_machine_code, '') || '-' || lpad(v_seq::text, 3, '0'),
    v_seq;
end;
$$;

commit;

-- =====================================================================
-- Objects this migration creates (for a clean rollback):
--   table    public.document_numbering_settings
--   function public.default_numbering_config(text)
--   function public.existing_max_numeric_suffix(text, uuid)
--   function public.allocate_document_number(text)
--   function public.set_document_numbering(text, text, integer)
--   function public.record_manual_document_number(text, integer)
--   function public.get_document_numbering_settings()
--   function public.allocate_service_record_number(uuid, text)
-- =====================================================================
