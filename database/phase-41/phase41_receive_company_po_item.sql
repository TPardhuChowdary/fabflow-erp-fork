-- FabFlow ERP — Phase 41: Purchasing Integration (master scope §15).
--
-- CompanyPO -> Inventory / Tools / Machines / Dies receiving. Mirrors
-- record_material_purchase()'s shape (database/phase-11/...FINAL.sql):
-- one atomic, permission-checked, SECURITY DEFINER function per receive
-- action, never a second purchasing/inventory/asset system.
--
-- Confirmed architecture fact this migration is built around:
-- company_pos.items is a JSONB array (see database/phase-03/
-- phase3_quotations_company_pos_FINAL.sql), NOT a normalized
-- company_po_items table. So "receiving a PO item" means atomically
-- mutating one element of that array plus (for inventory/tool) the
-- existing inventory_purchases/tools write paths - never a parallel
-- table.
--
-- Per-resource-type behavior (approved plan §C.14/§F):
--   - inventory: find-or-create inventory_items by name (exact same
--     org-scoped case-insensitive upsert record_material_purchase()
--     already uses), then insert inventory_purchases - the existing
--     trg_increase_stock AFTER INSERT trigger fires unchanged, exactly
--     as if the purchase had been recorded manually from Inventory.tsx.
--   - tool: link (increment existing tool's quantity) or auto-create a
--     new tools row (name/quantity/status from the PO line; tool_code
--     is generated CLIENT-SIDE via the existing generateToolCode()
--     Zustand counter - the one and only authority for that sequence -
--     and passed in, never re-derived here, so there is never a second
--     numbering source that could drift out of sync).
--   - machine / die: NEVER auto-created here. If p_resource_item_id is
--     given (either an already-existing record, or one the caller just
--     created via the existing Add-Machine/Add-Die form's own
--     createMachineRemote/createDieRemote), this function only marks
--     the PO line as received/linked - zero writes to machines/dies.
--     If p_resource_item_id is null, the PO line is flagged
--     pending_guided_creation = true and the function returns
--     immediately - never receivedAt, never a fabricated incomplete
--     record. The frontend surfaces this as "Complete Machine/Die
--     Details ->", opening the existing Add form pre-filled; on save,
--     the caller invokes this function again with the new id to
--     finalize.
--
-- Duplicate/re-receiving safety: a line with received_at already set
-- raises an exception rather than silently re-running (which would
-- double stock/tool-quantity). A line merely flagged
-- pending_guided_creation (not yet received_at) can safely be called
-- again to finalize - that is the intended second step of the guided
-- flow, not a duplicate.
--
-- source_company_po_item_id on tools/machines/dies is populated by the
-- CALLER (frontend) with the parent company_pos.id, not by this
-- function - company_pos.items has no normalized per-line id to
-- reference (each element's own "id" is a client-generated string, not
-- a table row), so PO-level provenance is the correct and only
-- meaningful grain here, matching how source_company_po_item_id was
-- already documented as a "soft reference" when added in Phases 35/37/38.
--
-- Idempotent to re-run (create-or-replace function); NOT idempotent to
-- call twice on an already-received line (by design, see above).

begin;

create or replace function public.receive_company_po_item(
  p_company_po_id uuid,
  p_item_id text,
  p_resource_type text,
  p_resource_item_id uuid default null,
  p_new_tool_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_po record;
  v_items jsonb;
  v_item jsonb;
  v_idx int;
  v_i int;
  v_found boolean := false;
  v_description text;
  v_quantity numeric;
  v_unit text;
  v_rate numeric;
  v_amount numeric;
  v_resolved_id uuid;
  v_updated_item jsonb;
  v_new_items jsonb;
begin
  if not has_permission('company_po', 'edit') then
    raise exception 'permission denied for receive_company_po_item';
  end if;

  if p_resource_type not in ('inventory', 'tool', 'machine', 'die') then
    raise exception 'invalid resource_type: %', p_resource_type;
  end if;

  select * into v_po
  from public.company_pos
  where id = p_company_po_id and organization_id = v_org
  for update;

  if not found then
    raise exception 'Company PO not found';
  end if;

  v_items := coalesce(v_po.items, '[]'::jsonb);

  -- Locate the target item by its own client-generated "id" and its
  -- array index (needed to splice the rebuilt array back together).
  -- NOTE: the "for v_i in ..." loop variable is scoped to the loop
  -- itself and does not persist afterward, even though v_i is also
  -- declared above - PL/pgSQL always creates the loop variable fresh
  -- for an integer-range FOR loop. v_idx is a plain outer variable,
  -- explicitly assigned inside the loop body, so it correctly survives
  -- past "end loop" for use in the splice below.
  for v_i in 0 .. jsonb_array_length(v_items) - 1 loop
    if v_items -> v_i ->> 'id' = p_item_id then
      v_item := v_items -> v_i;
      v_idx := v_i;
      v_found := true;
      exit;
    end if;
  end loop;

  if not v_found then
    raise exception 'PO item not found';
  end if;

  if (v_item ->> 'receivedAt') is not null then
    raise exception 'This PO item has already been received.';
  end if;

  v_description := v_item ->> 'description';
  v_quantity := coalesce((v_item ->> 'quantity')::numeric, 0);
  v_unit := v_item ->> 'unit';
  v_rate := coalesce((v_item ->> 'rate')::numeric, 0);
  v_amount := coalesce((v_item ->> 'amount')::numeric, 0);

  if p_resource_type = 'machine' or p_resource_type = 'die' then
    if p_resource_item_id is null then
      -- Guided-creation not completed yet: flag only, never fabricate.
      v_updated_item := v_item || jsonb_build_object(
        'resourceType', p_resource_type,
        'pendingGuidedCreation', true
      );
    else
      -- Either an existing record the user picked, or one the caller
      -- just created via the real Add-Machine/Add-Die form. Either
      -- way: pure traceability, zero mutation of machines/dies here.
      if p_resource_type = 'machine' then
        if not exists (
          select 1 from public.machines
          where id = p_resource_item_id and organization_id = v_org
        ) then
          raise exception 'Machine not found';
        end if;
      else
        if not exists (
          select 1 from public.dies
          where id = p_resource_item_id and organization_id = v_org
        ) then
          raise exception 'Die not found';
        end if;
      end if;
      v_updated_item := v_item || jsonb_build_object(
        'resourceType', p_resource_type,
        'resourceItemId', p_resource_item_id::text,
        'pendingGuidedCreation', false,
        'receivedAt', (extract(epoch from now()) * 1000)::bigint
      );
    end if;

  elsif p_resource_type = 'inventory' then
    if not has_permission('inventory', 'create') then
      raise exception 'permission denied for inventory receiving';
    end if;

    if p_resource_item_id is not null then
      if not exists (
        select 1 from public.inventory_items
        where id = p_resource_item_id and organization_id = v_org
      ) then
        raise exception 'Inventory item not found';
      end if;
      v_resolved_id := p_resource_item_id;
    else
      insert into public.inventory_items (organization_id, name, unit, current_stock)
      values (v_org, v_description, coalesce(v_unit, 'units'), 0)
      on conflict (organization_id, lower(name)) do nothing;

      select id into v_resolved_id
      from public.inventory_items
      where organization_id = v_org and lower(name) = lower(v_description);
    end if;

    insert into public.inventory_purchases (
      organization_id, vendor_id, inventory_item_id, quantity,
      material_name, supplier_name, purchase_date, unit_cost, cost
    ) values (
      v_org, v_po.vendor_id, v_resolved_id, v_quantity,
      v_description, v_po.vendor_name,
      coalesce(v_po.expected_delivery_date, current_date),
      v_rate, v_amount
    );
    -- trg_increase_stock (AAFTER INSERT on inventory_purchases) fires
    -- automatically here - same server-side trigger every other
    -- purchase path already relies on. No stock math done in this
    -- function.

    v_updated_item := v_item || jsonb_build_object(
      'resourceType', p_resource_type,
      'resourceItemId', v_resolved_id::text,
      'pendingGuidedCreation', false,
      'receivedAt', (extract(epoch from now()) * 1000)::bigint
    );

  else -- p_resource_type = 'tool'
    if not has_permission('tools', 'create') then
      raise exception 'permission denied for tool receiving';
    end if;

    if p_resource_item_id is not null then
      update public.tools
      set quantity = quantity + v_quantity, updated_at = now()
      where id = p_resource_item_id and organization_id = v_org
      returning id into v_resolved_id;

      if v_resolved_id is null then
        raise exception 'Tool not found';
      end if;
    else
      if p_new_tool_code is null or length(trim(p_new_tool_code)) = 0 then
        raise exception 'A tool code is required to create a new tool';
      end if;

      insert into public.tools (
        organization_id, tool_code, name, quantity, status,
        source_company_po_item_id, is_active
      ) values (
        v_org, p_new_tool_code, v_description, v_quantity, 'Available',
        p_company_po_id, true
      )
      returning id into v_resolved_id;
    end if;

    v_updated_item := v_item || jsonb_build_object(
      'resourceType', p_resource_type,
      'resourceItemId', v_resolved_id::text,
      'pendingGuidedCreation', false,
      'receivedAt', (extract(epoch from now()) * 1000)::bigint
    );
  end if;

  -- Splice the updated element back into the array at the same index
  -- and persist the whole array in one update (items is JSONB, not a
  -- normalized table - this is the only way to "update one row" of it).
  -- jsonb_set() with a single-element path replaces exactly that array
  -- index in place - simpler and more reliable than a generate_series/
  -- jsonb_agg reconstruction.
  v_new_items := jsonb_set(v_items, array[v_idx::text], v_updated_item, true);

  update public.company_pos
  set items = v_new_items, updated_at = now()
  where id = p_company_po_id;

  return v_new_items;
end;
$$;

insert into public.schema_migrations (version, description, checksum)
values (
  '20260817_041_phase41_receive_company_po_item',
  'Phase 41: create public.receive_company_po_item() - atomic, permission-checked RPC mirroring record_material_purchase()''s shape, receiving a single CompanyPO line (company_pos.items is JSONB, not a normalized table) into Inventory (find-or-create + inventory_purchases insert, reusing the existing trg_increase_stock trigger), Tools (link-and-increment or create-with-caller-supplied-code), or Machine/Die (link-only traceability; auto-creation is explicitly refused - unlinked lines are flagged pending_guided_creation for the frontend''s existing Add-Machine/Add-Die guided flow to finish). Re-receiving an already-received line raises an exception (duplicate-safety).',
  'phase41-receive-company-po-item-v1'
)
on conflict (version) do nothing;

commit;
