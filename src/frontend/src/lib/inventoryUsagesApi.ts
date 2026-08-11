// Phase 27 Batch 1 — Inventory Usages (Material Usage) write persistence
// layer. Two triggers on insert:
//   - trg_negative_stock (BEFORE INSERT, raises a plain Postgres
//     exception "Not enough stock" if the requested quantity_used
//     exceeds inventory_items.current_stock) - a thrown error, not an
//     RLS denial. Caught and surfaced as status:"error" with the DB's
//     own message, same "catch and surface" shape already used for
//     RLS-thrown INSERT errors elsewhere.
//   - trg_reduce_stock (AFTER INSERT, decrements current_stock) - DB
//     authoritative, same pattern as the completed Inventory Items
//     domain's stock handling. Never computed locally after this.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { MaterialUsage } from "@/types";
import {
  INVENTORY_USAGE_COLUMNS,
  transformInventoryUsageRow,
} from "./hydration";
import type { InventoryUsageRow } from "./hydration";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

function toInventoryUsageFields(v: Omit<MaterialUsage, "id" | "createdAt">) {
  return {
    project_id: v.projectId || null,
    inventory_item_id: v.inventoryItemId || null,
    material_name: v.materialName || null,
    quantity_used: v.quantityUsed ?? null,
    used_date: v.usedDate || null,
    notes: v.notes || null,
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

export async function createInventoryUsageRemote(
  usage: Omit<MaterialUsage, "id" | "createdAt">,
): Promise<WriteResult<MaterialUsage>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("inventory_usages")
    .insert(toInventoryUsageFields(usage))
    .select(INVENTORY_USAGE_COLUMNS)
    .single();
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: transformInventoryUsageRow(data as unknown as InventoryUsageRow),
  };
}

export async function updateInventoryUsageRemote(
  usage: MaterialUsage,
): Promise<WriteResult<MaterialUsage>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("inventory_usages")
    .update(toInventoryUsageFields(usage))
    .eq("id", usage.id)
    .select(INVENTORY_USAGE_COLUMNS);
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as InventoryUsageRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: transformInventoryUsageRow(rows[0]) };
}

export async function deleteInventoryUsageRemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("inventory_usages")
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

// Disclosed mechanical gap (Phase 27 Batch 1): unlike trg_increase_stock/
// trg_reduce_stock on INSERT, inventory_usages has NO compensating
// trigger on DELETE - deleting a usage row does not restore
// inventory_items.current_stock server-side. The existing local
// deleteMaterialUsage action DOES restore stock today (see store.ts) -
// this function preserves that exact existing user-facing behavior by
// explicitly re-adding the deleted quantity after the row is confirmed
// deleted. This is a narrow, disclosed extension of the Inventory Items
// write surface (which otherwise never writes current_stock - see
// lib/inventoryApi.ts) used ONLY for this one documented compensation,
// not a general-purpose stock-editing API. Read-then-write, same
// race-safety level as the local Zustand action it replaces (not a
// regression). updateMaterialUsage does NOT adjust stock even locally
// today (a pre-existing gap, not introduced by this migration) - the
// remote update path below intentionally mirrors that, not "fixing" it.
export async function restoreInventoryStockRemote(
  inventoryItemId: string,
  quantity: number,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data: current, error: readError } = await gate.client
    .from("inventory_items")
    .select("current_stock")
    .eq("id", inventoryItemId)
    .single();
  if (readError) return { status: "error", error: readError.message };
  const newStock = (current?.current_stock ?? 0) + quantity;
  const { data, error } = await gate.client
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
