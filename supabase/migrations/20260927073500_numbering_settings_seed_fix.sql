-- =====================================================================
-- Fix: get_document_numbering_settings() must show the correct
-- next_number even before the FIRST allocate_document_number() call.
--
-- Found during post-apply verification of
-- 20260927072624_centralized_document_numbering.sql (already applied):
-- get_document_numbering_settings() self-heals a
-- document_numbering_settings row (prefix/format) but never seeds
-- document_counters, unlike allocate_document_number(). So visiting the
-- Settings page before anyone creates a document via the new allocator
-- would display "Next Number: 1" for a type that already has real
-- documents (e.g. Job Card already has 10) - wrong, and exactly the bug
-- class the whole seeding fix was meant to prevent. This migration adds
-- the identical existing_max_numeric_suffix()-based seed to
-- get_document_numbering_settings()'s self-heal loop. CREATE OR REPLACE
-- only - no table change, no data touched, safe to apply immediately.
-- =====================================================================

begin;

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

    -- same seed as allocate_document_number's first-ever-call path, but
    -- WITHOUT incrementing - this only makes the displayed next_number
    -- correct, it must never consume a number just by being viewed.
    insert into public.document_counters (organization_id, counter_key, current_value)
    values (v_org, k, public.existing_max_numeric_suffix(k, v_org))
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

commit;
