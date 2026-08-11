-- ============================================================================
-- Phase 11 (SQL) - disclosed correction, applied during the same session's
-- Stage 7-equivalent behavioral verification (not before).
-- ============================================================================
-- Defect found: the original file's trg_inventory_items_recompute_bom
-- trigger reactively ran a FULL shortage recompute (required - available,
-- deleting the requisition if the result reached zero) on ANY current_stock
-- change, including one caused by a purchase. This does not match the
-- frontend's actual, confirmed behavior: addMaterialPurchase() (store.ts,
-- read again live this session) never recomputes or deletes shortage_qty -
-- it only flips a Pending requisition to Ready to Complete when the new
-- stock level covers the requisition's EXISTING recorded shortageQty,
-- leaving that number untouched. Full recompute-and-delete-if-zero is
-- confirmed to happen ONLY from updateBomItem()/addBomItem() (i.e. a BOM
-- requirement edit), never from a stock change alone. This was caught by a
-- real behavioral test: purchasing enough Steel to fully cover a shortage
-- caused the requisition row to be deleted instead of flipped to
-- "Ready to Complete" - disclosed here in full, not hidden.
--
-- Correction: remove the reactive on-any-stock-change trigger entirely
-- (nothing in the frontend justifies it), and rewrite
-- record_material_purchase()'s resolution step to match addMaterialPurchase
-- exactly - flip status only, never touch shortage_qty, never delete.
-- project_bom_items' own insert/update trigger (full recompute, matching
-- addBomItem/updateBomItem) is unchanged and correct.
-- ============================================================================

begin;

drop trigger if exists trg_inventory_items_recompute_bom on public.inventory_items;
drop function if exists public.trg_recompute_bom_requisitions_on_stock_change();

create or replace function public.record_material_purchase(
  p_project_id uuid,
  p_material_type text,
  p_thickness text,
  p_quantity numeric,
  p_unit text,
  p_supplier_name text,
  p_vendor_id uuid,
  p_purchase_date date,
  p_attachments jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_organization_id();
  v_item_id uuid;
  v_purchase_id uuid;
  v_new_stock numeric;
begin
  if not (has_permission('inventory','create') or has_permission('production','create') or has_permission('projects','create')) then
    raise exception 'permission denied for record_material_purchase';
  end if;

  insert into public.inventory_items (organization_id, name, unit, current_stock)
  values (v_org, p_material_type, coalesce(p_unit, 'units'), 0)
  on conflict (organization_id, lower(name)) do nothing;

  select id into v_item_id
  from public.inventory_items
  where organization_id = v_org and lower(name) = lower(p_material_type);

  insert into public.inventory_purchases (
    organization_id, vendor_id, inventory_item_id, quantity,
    material_name, supplier_name, purchase_date, attachments,
    project_id, thickness
  ) values (
    v_org, p_vendor_id, v_item_id, p_quantity,
    p_material_type, p_supplier_name, p_purchase_date, p_attachments,
    p_project_id, p_thickness
  )
  returning id into v_purchase_id;

  -- Corrected resolution: matches addMaterialPurchase() exactly - flip
  -- status only when the NEW stock level covers the requisition's own
  -- already-recorded shortage_qty; never recompute or delete shortage_qty
  -- here (that recomputation belongs only to project_bom_items edits).
  select current_stock into v_new_stock from public.inventory_items where id = v_item_id;

  update public.bom_requisitions
  set status = 'Ready to Complete', updated_at = now()
  where project_id = p_project_id
    and inventory_item_id = v_item_id
    and status = 'Pending'
    and v_new_stock >= shortage_qty;

  return v_purchase_id;
end;
$$;

commit;
