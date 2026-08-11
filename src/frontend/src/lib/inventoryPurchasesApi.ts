// Phase 27 Batch 1 — Inventory Purchases write persistence layer.
// trg_increase_stock (AFTER INSERT) adds NEW.quantity to
// inventory_items.current_stock server-side - same "DB authoritative for
// stock" pattern already proven for the completed Inventory Items
// domain. This module never touches inventory_items directly; callers
// must re-hydrate Inventory Items (already-established pattern) to see
// the updated stock, never compute it locally.
//
// project_id/thickness DB columns are confirmed unused by every current
// frontend call site - never written here.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { InventoryPurchase } from "@/types";
import {
  INVENTORY_PURCHASE_COLUMNS,
  transformInventoryPurchaseRow,
} from "./hydration";
import type { InventoryPurchaseRow } from "./hydration";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

function toInventoryPurchaseFields(
  v: Omit<InventoryPurchase, "id" | "createdAt">,
) {
  return {
    inventory_item_id: v.inventoryItemId || null,
    material_name: v.materialName || null,
    quantity: v.quantityPurchased ?? null,
    supplier_name: v.supplierName || null,
    vendor_id: v.vendorId ?? null,
    purchase_date: v.purchaseDate || null,
    cost: v.cost ?? null,
    unit_cost: v.unitCost ?? null,
    apply_gst: v.applyGST ?? null,
    gst_percent: v.gstPercent ?? null,
    subtotal: v.subtotal ?? null,
    gst_amount: v.gstAmount ?? null,
    final_total: v.finalTotal ?? null,
    attachments: v.attachments ?? [],
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

export async function createInventoryPurchaseRemote(
  purchase: Omit<InventoryPurchase, "id" | "createdAt">,
): Promise<WriteResult<InventoryPurchase>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("inventory_purchases")
    .insert(toInventoryPurchaseFields(purchase))
    .select(INVENTORY_PURCHASE_COLUMNS)
    .single();
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: transformInventoryPurchaseRow(
      data as unknown as InventoryPurchaseRow,
    ),
  };
}

export async function updateInventoryPurchaseRemote(
  purchase: InventoryPurchase,
): Promise<WriteResult<InventoryPurchase>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("inventory_purchases")
    .update(toInventoryPurchaseFields(purchase))
    .eq("id", purchase.id)
    .select(INVENTORY_PURCHASE_COLUMNS);
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as InventoryPurchaseRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: transformInventoryPurchaseRow(rows[0]) };
}

// Disclosed mechanical gap (Phase 27 Batch 1), mirrors the identical gap
// in inventoryUsagesApi.ts: inventory_purchases has NO compensating
// trigger on DELETE - trg_increase_stock only fires on INSERT. The
// existing local deleteInventoryPurchase action fully RECONCILES stock
// from scratch (sum of remaining purchases minus sum of all usages, not
// a simple subtraction) rather than a plain delta - this function
// preserves that exact existing user-facing behavior ("This will
// recalculate stock", per the confirm dialog) server-side.
async function reconcileInventoryItemStock(
  client: ReturnType<typeof getSupabase>,
  inventoryItemId: string,
): Promise<WriteResult<never>> {
  const { data: purchases, error: purchasesError } = await client
    .from("inventory_purchases")
    .select("quantity")
    .eq("inventory_item_id", inventoryItemId);
  if (purchasesError) return { status: "error", error: purchasesError.message };
  const { data: usages, error: usagesError } = await client
    .from("inventory_usages")
    .select("quantity_used")
    .eq("inventory_item_id", inventoryItemId);
  if (usagesError) return { status: "error", error: usagesError.message };
  const totalPurchased = (
    (purchases as unknown as { quantity: number | null }[]) ?? []
  ).reduce((sum, p) => sum + (p.quantity ?? 0), 0);
  const totalUsed = (
    (usages as unknown as { quantity_used: number | null }[]) ?? []
  ).reduce((sum, u) => sum + (u.quantity_used ?? 0), 0);
  const newStock = Math.max(0, totalPurchased - totalUsed);
  const { data, error } = await client
    .from("inventory_items")
    .update({ current_stock: newStock })
    .eq("id", inventoryItemId)
    .select("id");
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as { id: string }[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the item does not exist)",
    };
  }
  return { status: "success" };
}

export async function deleteInventoryPurchaseRemote(
  id: string,
  inventoryItemId: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("inventory_purchases")
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
  return reconcileInventoryItemStock(gate.client, inventoryItemId);
}
