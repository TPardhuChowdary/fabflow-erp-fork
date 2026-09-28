-- =====================================================================
-- Fix: get_document_numbering_settings() failed with
-- "column reference counter_key is ambiguous" (Postgres 42702) the
-- first time it was actually exercised as a real authenticated user
-- (caught during post-apply verification, not by static review).
--
-- Cause: the function's own RETURNS TABLE(counter_key text, ...) output
-- columns become implicitly-declared PL/pgSQL variables inside the
-- function body. The self-heal INSERT's
-- `on conflict (organization_id, counter_key)` target list is a bare
-- identifier that collides with that implicit variable, and PL/pgSQL's
-- default resolution order raises an error rather than silently
-- guessing. allocate_document_number/set_document_numbering do not have
-- this problem (neither returns a column literally named counter_key),
-- so they were unaffected - this fix only touches
-- get_document_numbering_settings().
--
-- Fix: `#variable_conflict use_column` - a standard PL/pgSQL directive
-- telling the function to prefer the table's actual column over a
-- same-named PL/pgSQL variable whenever a bare identifier is ambiguous
-- inside an embedded SQL command. No logic change otherwise.
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
#variable_conflict use_column
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
