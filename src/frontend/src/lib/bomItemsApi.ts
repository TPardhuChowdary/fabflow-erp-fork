// Phase 27 Batch 1 — Project BOM Items + BOM Requisitions write
// persistence layer.
//
// project_bom_items: trg_project_bom_items_recompute fires
// recompute_bom_requisition() on every INSERT/UPDATE of
// required_quantity/inventory_item_id, upserting/deleting the matching
// bom_requisitions row server-side (confirmed via the function's own
// code comment to exactly mirror this app's existing
// addBomItem/updateBomItem/deleteBomItem local logic). Callers must
// re-hydrate bom_requisitions after a bom_items write to see the result
// - never compute newBomReqs locally after this.
//
// bom_requisitions itself has NO INSERT/DELETE RLS policy (system-
// managed only) - the only legitimate write is "Mark as Completed"
// (bom_requisitions_approve UPDATE policy, material_requisitions.approve
// permission), exposed here as updateBomRequisitionStatusRemote.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { BomItem, BomRequisition } from "@/types";
import {
  BOM_ITEM_COLUMNS,
  BOM_REQUISITION_COLUMNS,
  transformBomItemRow,
  transformBomRequisitionRow,
} from "./hydration";
import type { BomItemRow, BomRequisitionRow } from "./hydration";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

function toBomItemFields(v: Omit<BomItem, "id" | "createdAt">) {
  return {
    project_id: v.projectId,
    inventory_item_id: v.inventoryItemId,
    material_name: v.materialName,
    required_quantity: v.requiredQuantity,
    estimated_price: v.estimatedPrice ?? null,
  };
}

async function requireSession() {
  if (!isSupabaseConfigured) {
    return {
      ok: false as const,
      result: { status: "error" as const, error: "Supabase is not configured" },
    };
  }
  const client = getSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) {
    return {
      ok: false as const,
      result: { status: "error" as const, error: error.message },
    };
  }
  if (!data.session) {
    return {
      ok: false as const,
      result: { status: "unauthenticated" as const },
    };
  }
  return { ok: true as const, client };
}

export async function createBomItemRemote(
  item: Omit<BomItem, "id" | "createdAt">,
): Promise<WriteResult<BomItem>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("project_bom_items")
    .insert(toBomItemFields(item))
    .select(BOM_ITEM_COLUMNS)
    .single();
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: transformBomItemRow(data as unknown as BomItemRow),
  };
}

export async function updateBomItemRemote(
  item: BomItem,
): Promise<WriteResult<BomItem>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("project_bom_items")
    .update(toBomItemFields(item))
    .eq("id", item.id)
    .select(BOM_ITEM_COLUMNS);
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as BomItemRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: transformBomItemRow(rows[0]) };
}

export async function deleteBomItemRemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("project_bom_items")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as { id: string }[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was deleted (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success" };
}

// bom_requisitions - "Mark as Completed" only. Never attempts insert or
// delete (no such RLS policy exists).
export async function updateBomRequisitionStatusRemote(
  id: string,
  status: BomRequisition["status"],
): Promise<WriteResult<BomRequisition>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("bom_requisitions")
    .update({ status })
    .eq("id", id)
    .select(BOM_REQUISITION_COLUMNS);
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as BomRequisitionRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: transformBomRequisitionRow(rows[0]) };
}
