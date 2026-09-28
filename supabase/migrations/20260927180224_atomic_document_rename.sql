-- =====================================================================
-- DRAFT — NOT APPLIED. Written per explicit instruction ("investigate
-- whether we can safely make the number update + counter advancement
-- server-authoritative/atomic... if making this fully atomic requires a
-- new RPC, write it, do NOT apply without showing me first"). Do not
-- run against the live project without separate, explicit approval.
-- =====================================================================
--
-- Task 6 hardening — atomic manual document-number rename.
--
-- PROBLEM THIS FIXES: the Task 6 manual-edit implementation had a real
-- gap, reported honestly in that phase's own summary rather than hidden
-- - renaming a document's number and advancing its document_counters
-- row were always at least two separate network calls (for Quotation/
-- Company PO/Expense Float, three: main-fields update, number-only
-- update, counter-advance; for Job Card/Project/Employee/Machine/Tool/
-- Die, two: fields+number update, then counter-advance). A failure
-- between steps could leave the number changed but the counter stale,
-- or (never observed, but theoretically) other inconsistent states.
--
-- FIX: one new SECURITY DEFINER function that does the number UPDATE
-- and the document_counters upsert in the SAME Postgres function body -
-- which Postgres already executes as a single transaction. If the
-- UPDATE fails (most commonly: the target unique constraint rejects a
-- duplicate number), the function raises and the ENTIRE transaction
-- rolls back - the counter is never touched. If the UPDATE succeeds,
-- the counter upsert cannot meaningfully fail (no constraint on it that
-- the UPDATE's success doesn't already guarantee), so both changes
-- commit together. This is the same "put the two things in one
-- SECURITY DEFINER function body" pattern already used by every other
-- RPC in this numbering system (allocate_document_number,
-- set_document_numbering) - no new architecture, just applying the
-- existing pattern to this specific gap.
--
-- SCOPE OF WHAT THIS RPC TOUCHES: only the document's own number
-- column and document_counters. It never touches any other field on
-- the document (subtotal, status, line items, etc.) - callers still
-- update those through each type's existing, unchanged
-- create/update API (updateQuotationRemote, updateJobCardRemote, etc.)
-- in a SEPARATE call, exactly as before. That separate call's own
-- atomicity/consistency relative to THIS one is unchanged from the
-- previous phase's honestly-reported limitation: the two calls (update
-- other fields, rename number) are still not atomic WITH EACH OTHER -
-- only the number-change+counter-advance pairing (what was explicitly
-- asked to be made atomic) now is. Frontend integration (a separate,
-- non-migration change) will stop sending the changed number through
-- the main fields-update call for every type and route it exclusively
-- through this RPC instead, so the number is written exactly once, by
-- exactly one atomic operation.
--
-- SECURITY: organization_id is derived server-side from the caller's
-- session (current_organization_id()), never a parameter - a caller can
-- never rename a row in a different organization, matching every other
-- RPC in this system. No special permission beyond being an
-- authenticated org member is required, matching the existing document-
-- edit permission model (each module's own canEdit(...) already gates
-- whether the UI lets a user reach this call at all - this RPC is not a
-- new privilege boundary, it is the write path for an edit the user's
-- module-level permission already allowed). The UPDATE is additionally
-- scoped by organization_id in every branch, so even a caller who
-- somehow obtained another org's row id cannot rename it.
--
-- COVERAGE: all 11 centralized-numbering document types (the 9 from
-- Task 6 plus Invoice and Delivery Challan, both audited during this
-- hardening pass and found to have their own pre-existing gaps: Invoice
-- silently discarded a typed number change on the EDIT path (the
-- payload used editingInvoice.invNo, never the form field the user
-- edited - confirmed by reading pages/Invoices.tsx directly), and
-- Delivery Challan's edit dialog showed the number as plain text with
-- no input at all. Both are fixed by the accompanying frontend change,
-- using this same RPC.
-- =====================================================================

begin;

create or replace function public.rename_document_number(
  p_counter_key text,
  p_row_id uuid,
  p_new_number text
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_org uuid := public.current_organization_id();
  v_suffix integer;
  v_rows integer;
begin
  if v_org is null then
    raise exception 'No organization for current user';
  end if;
  if p_row_id is null then
    raise exception 'row id is required';
  end if;
  if p_new_number is null or length(trim(p_new_number)) = 0 then
    raise exception 'Number is required';
  end if;

  v_suffix := (regexp_match(p_new_number, '(\d+)$'))[1]::integer;
  if v_suffix is null then
    raise exception 'Number must end in a numeric sequence';
  end if;

  case p_counter_key
    when 'INV' then
      update public.invoices set inv_no = p_new_number
        where id = p_row_id and organization_id = v_org;
    when 'QT' then
      update public.quotations set qt_no = p_new_number
        where id = p_row_id and organization_id = v_org;
    when 'JC' then
      update public.job_cards set job_no = p_new_number
        where id = p_row_id and organization_id = v_org;
    when 'CPO' then
      update public.company_pos set cpo_number = p_new_number
        where id = p_row_id and organization_id = v_org;
    when 'DC' then
      update public.delivery_challans set dc_no = p_new_number
        where id = p_row_id and organization_id = v_org;
    when 'PROJ' then
      update public.projects set project_no = p_new_number
        where id = p_row_id and organization_id = v_org;
    when 'FLT' then
      update public.expense_floats set float_no = p_new_number
        where id = p_row_id and organization_id = v_org;
    when 'EMP' then
      update public.employees set employee_code = p_new_number
        where id = p_row_id and organization_id = v_org;
    when 'MCH' then
      update public.machines set machine_code = p_new_number
        where id = p_row_id and organization_id = v_org;
    when 'TL' then
      update public.tools set tool_code = p_new_number
        where id = p_row_id and organization_id = v_org;
    when 'DIE' then
      update public.dies set die_code = p_new_number
        where id = p_row_id and organization_id = v_org;
    else
      raise exception 'Unknown counter_key: %', p_counter_key;
  end case;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'No matching document found to rename (wrong id, wrong organization, or blocked by RLS)';
  end if;

  -- Same GREATEST policy as record_manual_document_number (which this
  -- function replaces for the manual-rename path specifically) - never
  -- lowers an existing counter, only ever advances it forward.
  insert into public.document_counters (organization_id, counter_key, current_value)
  values (v_org, p_counter_key, v_suffix)
  on conflict (organization_id, counter_key)
  do update set current_value = greatest(public.document_counters.current_value, v_suffix),
                updated_at = now();
end;
$$;

commit;

-- =====================================================================
-- Rollback: `drop function public.rename_document_number(text, uuid, text);`
-- - no table change, nothing else references this function.
-- =====================================================================
