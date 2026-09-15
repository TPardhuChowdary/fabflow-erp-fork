-- =====================================================================
-- DRAFT — NOT APPLIED. Written per explicit instruction ("write the
-- migration, do not apply it"). Do not run against the live project
-- without deciding it's wanted first.
-- =====================================================================
--
-- Phase 2 — Conversion/Application Layer, backend only. Three atomic
-- conversion RPCs, following the exact existing trusted pattern already
-- used by record_material_purchase()/settle_expense_float()/
-- receive_company_po_item() (read in full from pg_proc before writing
-- this): SECURITY DEFINER, SET search_path TO 'public', an explicit
-- has_permission() check at the top (required because SECURITY DEFINER
-- bypasses RLS), organization resolved via current_organization_id()
-- only — never trusted from the caller.
--
-- Pure function additions. Zero changes to any Phase 1 table, column,
-- constraint, index, or trigger (delivery_challan_quotations,
-- quotation_invoices, invoice_delivery_challans, check_quotation_
-- remaining(), check_dc_remaining() — all untouched).
--
-- Atomicity: each function body is one PL/pgSQL function, which
-- PostgreSQL always executes as a single transaction — the target
-- document insert(s) and the lineage-row insert happen in the same
-- transaction by construction. If the lineage insert is rejected by the
-- Phase 1 trigger (check_quotation_remaining/check_dc_remaining), the
-- exception propagates out of the function, and PostgreSQL rolls back
-- everything the function did, including the just-created invoice/DC
-- and its invoice_items rows. This is the actual mechanism satisfying
-- the "no orphan document" requirement — not application-level cleanup.
--
-- The Phase 1 triggers remain the sole authority for overflow/
-- concurrency correctness. Nothing here duplicates their row-locking
-- logic or pre-computes a competing "is there enough remaining"
-- decision that could diverge from the trigger's own live calculation
-- — each function simply attempts the lineage insert and lets the
-- trigger decide, exactly as instructed.
--
-- Numbering: mirrors the existing client-side computeNextInvNumber()/
-- computeNextDcNumber() format (PREFIX-YYYY-NNN, max+1 per
-- organization per year, zero-padded to 3 digits — read directly from
-- invoicesApi.ts/deliveryChallansApi.ts before writing this) inside a
-- bounded retry loop (3 attempts) catching unique_violation on the
-- existing uq_invoices_org_invno/uq_delivery_challans_org_dcno
-- constraints — the same bounded-retry idea the client already uses,
-- just server-side and inside the one transaction, which is strictly
-- safer (no round-trip between "compute candidate" and "insert").
--
-- Invoice total/tax math mirrors Invoices.tsx's own client-side
-- calculation exactly (subtotal = SUM(qty*rate); each of
-- cgst_amt/sgst_amt/igst_amt = round(subtotal * rate / 100)
-- independently, matching the existing rounding convention) so that
-- invoices created via these RPCs are numerically indistinguishable
-- from ones created through the existing UI path. The existing
-- update_invoice_total() trigger (Phase 9, unmodified) still fires on
-- the invoice_items inserts and recomputes total_amount from the real
-- rows — this function's own subtotal/tax numbers are written directly
-- to keep the known Phase-9 gap (that trigger doesn't touch
-- subtotal/cgst_amt/sgst_amt/igst_amt) from producing a mismatched
-- invoice, exactly as the existing client path already has to do.
--
-- T&C snapshot: preserved exactly as designed for the already-shipped
-- feature — if the caller doesn't pass explicit terms_and_conditions,
-- the function reads the organization's current company_settings
-- default (setting_key='company_profile', ->>'companyTerms') ONCE at
-- creation time and stores that snapshot on the invoice row. Never read
-- again after insert — identical semantics to the existing
-- Invoices.tsx "New Invoice" flow.
--
-- Customer/PO behavior: buyer_gstin/buyer_address/buyer_state_name/
-- buyer_state_code and selected_email are looked up live from the
-- `customers` table at conversion time (a genuine current-value
-- snapshot, same intent as the existing client path, but sourced
-- server-side rather than trusting a caller-supplied value — a
-- deliberate small improvement, not a behavior change users would
-- notice). If the source quotation (direct-invoice path) or a
-- DC-linked quotation (DC path, reference-only) has a recorded
-- Purchase Order, the most recent one is copied into
-- invoice_purchase_orders exactly as Invoices.tsx's own quotation
-- auto-fill already does — this is the "quotation used as reference
-- context" case explicitly called out for the DC path: it inserts a
-- reference PO row, never a quotation_invoices row.
--
-- Pre-flight finding (see chat): no client-side-only behavior was found
-- in the existing invoice/DC/quotation write paths that cannot be
-- reproduced here — T&C, numbering, buyer snapshot, reminder defaults,
-- and PO auto-fill are all either pure computation or a database read,
-- both reproducible server-side. Toast/UI feedback is out of scope for
-- a backend RPC and was not expected to be reproduced.
-- =====================================================================

-- ── convert_quotation_to_dc ──────────────────────────────────────────
create or replace function public.convert_quotation_to_dc(
  p_quotation_id uuid,
  p_quantity numeric,
  p_dispatch_date date default current_date,
  p_receiver_name text default '',
  p_status text default 'Prepared',
  p_dispatch_method text default null,
  p_vehicle_no text default null,
  p_driver_name text default null,
  p_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid := public.current_organization_id();
  v_qt_org uuid;
  v_customer_id uuid;
  v_project_id uuid;
  v_dc_id uuid;
  v_dc_no text;
  v_year text := to_char(current_date, 'YYYY');
  v_next int;
  v_attempt int;
  v_constraint text;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'invalid_quantity: quantity must be a positive number';
  end if;

  select organization_id, customer_id, project_id
    into v_qt_org, v_customer_id, v_project_id
    from public.quotations where id = p_quotation_id;

  if v_qt_org is null or v_qt_org <> v_org then
    raise exception 'not_found: quotation % not found', p_quotation_id;
  end if;

  if not (has_permission('quotations','view') and has_permission('delivery_challans','create')) then
    raise exception 'permission_denied: missing quotations.view or delivery_challans.create';
  end if;

  for v_attempt in 1..3 loop
    select coalesce(max((regexp_match(dc_no, '^DC-' || v_year || '-(\d+)$'))[1]::int), 0) + 1
      into v_next
      from public.delivery_challans
      where organization_id = v_org;
    v_dc_no := 'DC-' || v_year || '-' || lpad(v_next::text, 3, '0');

    begin
      insert into public.delivery_challans (
        organization_id, dc_no, customer_id, project_id, dispatch_date, receiver_name,
        status, dispatch_method, vehicle_no, driver_name, items, project_entries
      ) values (
        v_org, v_dc_no, v_customer_id, v_project_id, p_dispatch_date, p_receiver_name,
        p_status, p_dispatch_method, p_vehicle_no, p_driver_name, p_items,
        jsonb_build_array(jsonb_build_object('projectId', v_project_id, 'dispatchQty', p_quantity))
      )
      returning id into v_dc_id;
      exit;
    exception when unique_violation then
      -- Only retry the specific numbering constraint this loop is
      -- actually generating candidates for — any other unique_violation
      -- (a future constraint added to delivery_challans, a PK oddity,
      -- etc.) must surface as a real error, not be silently retried and
      -- misreported as a numbering collision.
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint <> 'uq_delivery_challans_org_dcno' then
        raise;
      end if;
      if v_attempt = 3 then
        raise exception 'duplicate_conversion: could not allocate a unique DC number after 3 attempts';
      end if;
    end;
  end loop;

  -- Lineage insert — the Phase 1 trigger (check_quotation_remaining) is
  -- the sole authority here. If it raises, this whole transaction
  -- (including the delivery_challans insert above) rolls back.
  insert into public.delivery_challan_quotations (delivery_challan_id, quotation_id, quantity, organization_id)
  values (v_dc_id, p_quotation_id, p_quantity, v_org);

  return v_dc_id;
end;
$$;

-- ── shared helper: copy the quotation's most recent recorded PO onto an
--    invoice, reference-only (never touches quotation_invoices) ───────
create or replace function public._copy_quotation_po_to_invoice(
  p_quotation_id uuid,
  p_invoice_id uuid,
  p_org uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_po_id uuid;
  v_po_number text;
  v_po_date date;
begin
  select id, po_number, po_date into v_po_id, v_po_number, v_po_date
    from public.quotation_purchase_orders
    where quotation_id = p_quotation_id
    order by created_at desc
    limit 1;

  if v_po_id is not null then
    insert into public.invoice_purchase_orders (invoice_id, quotation_purchase_order_id, po_number, po_date, organization_id)
    values (p_invoice_id, v_po_id, v_po_number, v_po_date, p_org);
  end if;
end;
$$;

-- ── convert_quotation_to_invoice ─────────────────────────────────────
create or replace function public.convert_quotation_to_invoice(
  p_quotation_id uuid,
  p_quantity numeric,
  p_line_items jsonb,
  p_cgst_rate numeric default 9,
  p_sgst_rate numeric default 9,
  p_igst_rate numeric default 0,
  p_invoice_date date default current_date,
  p_payment_terms text default '30 days',
  p_invoice_type text default 'tax',
  p_terms_and_conditions text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid := public.current_organization_id();
  v_qt_org uuid;
  v_customer_id uuid;
  v_project_id uuid;
  v_invoice_id uuid;
  v_inv_no text;
  v_year text := to_char(current_date, 'YYYY');
  v_next int;
  v_attempt int;
  v_subtotal numeric := 0;
  v_cgst_amt numeric;
  v_sgst_amt numeric;
  v_igst_amt numeric;
  v_total numeric;
  v_terms text;
  v_days int;
  v_due_date date;
  v_buyer_gstin text;
  v_buyer_address text;
  v_buyer_state_name text;
  v_buyer_state_code text;
  v_selected_email text;
  v_item jsonb;
  v_constraint text;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'invalid_quantity: quantity must be a positive number';
  end if;
  if p_line_items is null or jsonb_array_length(p_line_items) = 0 then
    raise exception 'invalid_input: at least one line item is required';
  end if;

  select organization_id, customer_id, project_id
    into v_qt_org, v_customer_id, v_project_id
    from public.quotations where id = p_quotation_id;

  if v_qt_org is null or v_qt_org <> v_org then
    raise exception 'not_found: quotation % not found', p_quotation_id;
  end if;

  if not (has_permission('quotations','view') and has_permission('invoices','create')) then
    raise exception 'permission_denied: missing quotations.view or invoices.create';
  end if;

  select gstin, address, state_name, state_code, coalesce(primary_email, email)
    into v_buyer_gstin, v_buyer_address, v_buyer_state_name, v_buyer_state_code, v_selected_email
    from public.customers where id = v_customer_id;

  select coalesce(sum(((item->>'qty')::numeric) * ((item->>'rate')::numeric)), 0)
    into v_subtotal
    from jsonb_array_elements(p_line_items) as item;

  v_cgst_amt := round(v_subtotal * coalesce(p_cgst_rate,0) / 100);
  v_sgst_amt := round(v_subtotal * coalesce(p_sgst_rate,0) / 100);
  v_igst_amt := round(v_subtotal * coalesce(p_igst_rate,0) / 100);
  v_total := v_subtotal + v_cgst_amt + v_sgst_amt + v_igst_amt;

  v_terms := p_terms_and_conditions;
  if v_terms is null then
    select setting_value->>'companyTerms' into v_terms
      from public.company_settings
      where organization_id = v_org and setting_key = 'company_profile';
  end if;

  v_days := coalesce((regexp_match(p_payment_terms, '\d+'))[1]::int, 30);
  v_due_date := p_invoice_date + v_days;

  for v_attempt in 1..3 loop
    select coalesce(max((regexp_match(inv_no, '^INV-' || v_year || '-(\d+)$'))[1]::int), 0) + 1
      into v_next
      from public.invoices
      where organization_id = v_org;
    v_inv_no := 'INV-' || v_year || '-' || lpad(v_next::text, 3, '0');

    begin
      insert into public.invoices (
        organization_id, inv_no, customer_id, project_id, subtotal,
        cgst_rate, sgst_rate, igst_rate, cgst_amt, sgst_amt, igst_amt, total_amount,
        invoice_date, due_date, payment_terms, status, paid_amount, invoice_type,
        buyer_gstin, buyer_address, buyer_state_name, buyer_state_code, selected_email,
        terms_and_conditions
      ) values (
        v_org, v_inv_no, v_customer_id, v_project_id, v_subtotal,
        p_cgst_rate, p_sgst_rate, p_igst_rate, v_cgst_amt, v_sgst_amt, v_igst_amt, v_total,
        p_invoice_date, v_due_date, p_payment_terms, 'Unpaid', 0, p_invoice_type,
        v_buyer_gstin, v_buyer_address, v_buyer_state_name, v_buyer_state_code, v_selected_email,
        v_terms
      )
      returning id into v_invoice_id;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint <> 'uq_invoices_org_invno' then
        raise;
      end if;
      if v_attempt = 3 then
        raise exception 'duplicate_conversion: could not allocate a unique invoice number after 3 attempts';
      end if;
    end;
  end loop;

  for v_item in select * from jsonb_array_elements(p_line_items) loop
    insert into public.invoice_items (invoice_id, description, hsn, quantity, price, organization_id, project_id)
    values (
      v_invoice_id,
      v_item->>'desc',
      v_item->>'hsn',
      (v_item->>'qty')::numeric,
      (v_item->>'rate')::numeric,
      v_org,
      v_project_id
    );
  end loop;

  perform public._copy_quotation_po_to_invoice(p_quotation_id, v_invoice_id, v_org);

  -- Lineage insert — the direct-quotation consumption path. The Phase 1
  -- trigger (check_quotation_remaining) is the sole authority; a
  -- rejection here rolls back the invoice and invoice_items just
  -- inserted above, in the same transaction.
  insert into public.quotation_invoices (quotation_id, invoice_id, quantity, organization_id)
  values (p_quotation_id, v_invoice_id, p_quantity, v_org);

  return v_invoice_id;
end;
$$;

-- ── convert_dc_to_invoice ─────────────────────────────────────────────
create or replace function public.convert_dc_to_invoice(
  p_dc_ids uuid[],
  p_quantities numeric[],
  p_line_items jsonb,
  p_cgst_rate numeric default 9,
  p_sgst_rate numeric default 9,
  p_igst_rate numeric default 0,
  p_invoice_date date default current_date,
  p_payment_terms text default '30 days',
  p_invoice_type text default 'tax',
  p_terms_and_conditions text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid := public.current_organization_id();
  v_invoice_id uuid;
  v_inv_no text;
  v_year text := to_char(current_date, 'YYYY');
  v_next int;
  v_attempt int;
  v_subtotal numeric := 0;
  v_cgst_amt numeric;
  v_sgst_amt numeric;
  v_igst_amt numeric;
  v_total numeric;
  v_terms text;
  v_days int;
  v_due_date date;
  v_customer_id uuid;
  v_project_id uuid;
  v_dc_org uuid;
  v_dc_customer uuid;
  v_dc_project uuid;
  v_dc_id uuid;
  v_dc_reference_dc_id uuid;
  v_buyer_gstin text;
  v_buyer_address text;
  v_buyer_state_name text;
  v_buyer_state_code text;
  v_selected_email text;
  v_item jsonb;
  i int;
  v_reference_quotation_id uuid;
  v_distinct_quotations int;
  v_constraint text;
begin
  if p_dc_ids is null or array_length(p_dc_ids,1) is null or array_length(p_dc_ids,1) = 0 then
    raise exception 'invalid_input: at least one delivery challan is required';
  end if;
  if p_quantities is null or array_length(p_quantities,1) <> array_length(p_dc_ids,1) then
    raise exception 'invalid_input: quantities array must match dc_ids array length';
  end if;
  if p_line_items is null or jsonb_array_length(p_line_items) = 0 then
    raise exception 'invalid_input: at least one line item is required';
  end if;
  if array_length(p_dc_ids,1) <> (select count(distinct x) from unnest(p_dc_ids) as x) then
    raise exception 'invalid_input: duplicate delivery challan selected';
  end if;

  if not (has_permission('delivery_challans','view') and has_permission('invoices','create')) then
    raise exception 'permission_denied: missing delivery_challans.view or invoices.create';
  end if;

  -- Validate every DC: exists, belongs to this org, positive quantity,
  -- and all DCs share the same customer (an invoice has one customer_id).
  for i in 1..array_length(p_dc_ids,1) loop
    v_dc_id := p_dc_ids[i];
    if p_quantities[i] is null or p_quantities[i] <= 0 then
      raise exception 'invalid_quantity: quantity for delivery challan % must be a positive number', v_dc_id;
    end if;

    select organization_id, customer_id, project_id
      into v_dc_org, v_dc_customer, v_dc_project
      from public.delivery_challans where id = v_dc_id;

    if v_dc_org is null or v_dc_org <> v_org then
      raise exception 'not_found: delivery challan % not found', v_dc_id;
    end if;

    if v_customer_id is null then
      v_customer_id := v_dc_customer;
      v_project_id := v_dc_project;
    elsif v_dc_customer is distinct from v_customer_id then
      raise exception 'invalid_input: all selected delivery challans must belong to the same customer';
    end if;
  end loop;

  select gstin, address, state_name, state_code, coalesce(primary_email, email)
    into v_buyer_gstin, v_buyer_address, v_buyer_state_name, v_buyer_state_code, v_selected_email
    from public.customers where id = v_customer_id;

  select coalesce(sum(((item->>'qty')::numeric) * ((item->>'rate')::numeric)), 0)
    into v_subtotal
    from jsonb_array_elements(p_line_items) as item;

  v_cgst_amt := round(v_subtotal * coalesce(p_cgst_rate,0) / 100);
  v_sgst_amt := round(v_subtotal * coalesce(p_sgst_rate,0) / 100);
  v_igst_amt := round(v_subtotal * coalesce(p_igst_rate,0) / 100);
  v_total := v_subtotal + v_cgst_amt + v_sgst_amt + v_igst_amt;

  v_terms := p_terms_and_conditions;
  if v_terms is null then
    select setting_value->>'companyTerms' into v_terms
      from public.company_settings
      where organization_id = v_org and setting_key = 'company_profile';
  end if;

  v_days := coalesce((regexp_match(p_payment_terms, '\d+'))[1]::int, 30);
  v_due_date := p_invoice_date + v_days;

  -- Legacy single-DC compatibility: populate invoices.dc_id only when
  -- exactly one DC was selected. For multi-DC invoices it stays NULL —
  -- invoice_delivery_challans is authoritative there (see chat).
  if array_length(p_dc_ids,1) = 1 then
    v_dc_reference_dc_id := p_dc_ids[1];
  else
    v_dc_reference_dc_id := null;
  end if;

  for v_attempt in 1..3 loop
    select coalesce(max((regexp_match(inv_no, '^INV-' || v_year || '-(\d+)$'))[1]::int), 0) + 1
      into v_next
      from public.invoices
      where organization_id = v_org;
    v_inv_no := 'INV-' || v_year || '-' || lpad(v_next::text, 3, '0');

    begin
      insert into public.invoices (
        organization_id, inv_no, customer_id, project_id, dc_id, subtotal,
        cgst_rate, sgst_rate, igst_rate, cgst_amt, sgst_amt, igst_amt, total_amount,
        invoice_date, due_date, payment_terms, status, paid_amount, invoice_type,
        buyer_gstin, buyer_address, buyer_state_name, buyer_state_code, selected_email,
        terms_and_conditions
      ) values (
        v_org, v_inv_no, v_customer_id, v_project_id, v_dc_reference_dc_id, v_subtotal,
        p_cgst_rate, p_sgst_rate, p_igst_rate, v_cgst_amt, v_sgst_amt, v_igst_amt, v_total,
        p_invoice_date, v_due_date, p_payment_terms, 'Unpaid', 0, p_invoice_type,
        v_buyer_gstin, v_buyer_address, v_buyer_state_name, v_buyer_state_code, v_selected_email,
        v_terms
      )
      returning id into v_invoice_id;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint <> 'uq_invoices_org_invno' then
        raise;
      end if;
      if v_attempt = 3 then
        raise exception 'duplicate_conversion: could not allocate a unique invoice number after 3 attempts';
      end if;
    end;
  end loop;

  for v_item in select * from jsonb_array_elements(p_line_items) loop
    insert into public.invoice_items (invoice_id, description, hsn, quantity, price, organization_id, project_id)
    values (
      v_invoice_id,
      v_item->>'desc',
      v_item->>'hsn',
      (v_item->>'qty')::numeric,
      (v_item->>'rate')::numeric,
      v_org,
      v_project_id
    );
  end loop;

  -- Reference-only PO copy: only when every selected DC traces back to
  -- exactly the same single quotation (unambiguous). Multiple/mixed
  -- quotations across the selected DCs is deliberately left alone here
  -- — no PO is guessed or merged. This never writes quotation_invoices;
  -- see the migration header note and the mutual-exclusion rule.
  -- min()/max() have no built-in implementation for uuid (confirmed live
  -- — this exact query previously raised "function min(uuid) does not
  -- exist" when tested against a real DC-from-a-quotation row). Since
  -- count(distinct quotation_id) already guarantees at most one distinct
  -- value when it equals 1, any arbitrary row's value is the right one —
  -- (array_agg(quotation_id))[1] picks one without needing an ordering
  -- operator uuid doesn't have.
  select count(distinct quotation_id), (array_agg(quotation_id))[1]
    into v_distinct_quotations, v_reference_quotation_id
    from public.delivery_challan_quotations
    where delivery_challan_id = any(p_dc_ids);

  if v_distinct_quotations = 1 then
    perform public._copy_quotation_po_to_invoice(v_reference_quotation_id, v_invoice_id, v_org);
  end if;

  -- Lineage insert(s) — one per selected DC. The Phase 1 trigger
  -- (check_dc_remaining) is the sole authority for each; any rejection
  -- rolls back the entire transaction, including the invoice and all
  -- invoice_items rows inserted above, and any invoice_delivery_challans
  -- rows already inserted earlier in this same loop.
  for i in 1..array_length(p_dc_ids,1) loop
    insert into public.invoice_delivery_challans (invoice_id, delivery_challan_id, quantity, organization_id)
    values (v_invoice_id, p_dc_ids[i], p_quantities[i], v_org);
  end loop;

  return v_invoice_id;
end;
$$;
