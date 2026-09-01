// Phase 20 — Inventory Items write persistence layer. Sibling to
// lib/employeesApi.ts (Phase 18B/18C) and lib/customersApi.ts (Phase 19).
// Inventory.tsx (and ProjectDetail.tsx's gated quick-add) call into this
// module instead of talking to Supabase directly.
//
// Contract every write function here follows (identical to
// employeesApi.ts/customersApi.ts - see those files' headers for the
// full RLS-asymmetry rationale this mirrors):
//   - Checks for a real Supabase session first; returns
//     {status:"unauthenticated"} with no network call if none exists.
//   - Never fabricates success. A rejected/failed request returns
//     {status:"error", error} with the real Supabase/RLS message -
//     callers must not update Zustand on this path.
//   - Only a "success" result returns the actual persisted row (for
//     create/update) so the caller can sync Zustand from what the
//     database actually has, not from what was optimistically assumed.
//   - RLS is the only authorization boundary enforced here. This module
//     performs no permission check of its own (the UI gates create/edit/
//     delete affordances with inventory.create/edit/delete first).
//   - update/delete request .select() (never .single()) and check
//     data.length, because Postgres RLS silently matches zero rows on a
//     blocked UPDATE/DELETE (no thrown error) - a "denied" result
//     distinguishes that from a real thrown "error".
//
// IMPORTANT, Phase 20 scope boundary (see the Phase 20 report): this
// module's write functions NEVER send current_stock, quantity_reserved,
// last_purchase_price, or updated_at. Those columns are trigger-owned
// (increase_stock()/reduce_stock(), fired only by inventory_purchases/
// inventory_usages INSERTs - both project-dependent and out of scope
// this phase). Only name, unit, reorder_level, cost_per_unit, and
// estimated_price are ever written by createInventoryItemRemote/
// updateInventoryItemRemote - matching exactly what Inventory.tsx's real
// "Edit Material" dialog already restricted itself to before this phase.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { normalizeBusinessName } from "@/lib/utils";
import type { InventoryItem, InventoryItemCategory } from "@/types";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

interface InventoryItemRow {
  id: string;
  name: string;
  unit: string | null;
  current_stock: number | null;
  cost_per_unit: number | null;
  quantity_reserved: number | null;
  reorder_level: number | null;
  last_purchase_price: number | null;
  estimated_price: number | null;
  updated_at: string;
  category: string | null;
  brand: string | null;
  shade: string | null;
  ral_code: string | null;
  finish: string | null;
  powder_type: string | null;
  pretreatment_tank: string | null;
}

function rowToInventoryItem(row: InventoryItemRow): InventoryItem {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit ?? "",
    quantityAvailable: row.current_stock ?? 0,
    quantityReserved: row.quantity_reserved ?? undefined,
    reorderLevel: row.reorder_level ?? undefined,
    unitCost: row.cost_per_unit ?? undefined,
    lastPurchasePrice: row.last_purchase_price ?? undefined,
    estimatedPrice: row.estimated_price ?? undefined,
    lastUpdated: new Date(row.updated_at).getTime(),
    category: (row.category as InventoryItemCategory | null) ?? "raw_material",
    brand: row.brand ?? undefined,
    shade: row.shade ?? undefined,
    ralCode: row.ral_code ?? undefined,
    finish: row.finish ?? undefined,
    powderType: row.powder_type ?? undefined,
    pretreatmentTank: row.pretreatment_tank ?? undefined,
  };
}

// Master-data write whitelist. Deliberately excludes id (DB-generated on
// insert, path param on update/delete), current_stock, quantity_reserved,
// last_purchase_price, updated_at, and organization_id - see the module
// header for why. Phase 36 adds category + the 5 Powder Coating Powder
// fields + the 1 Pretreatment Chemical field to the whitelist - all
// plain master-data, same write discipline as name/unit.
function toInventoryItemFields(
  item: Pick<
    InventoryItem,
    | "name"
    | "unit"
    | "reorderLevel"
    | "unitCost"
    | "estimatedPrice"
    | "category"
    | "brand"
    | "shade"
    | "ralCode"
    | "finish"
    | "powderType"
    | "pretreatmentTank"
  >,
) {
  return {
    name: normalizeBusinessName(item.name),
    unit: item.unit || null,
    reorder_level: item.reorderLevel ?? null,
    cost_per_unit: item.unitCost ?? null,
    estimated_price: item.estimatedPrice ?? null,
    category: item.category ?? "raw_material",
    brand: item.brand ?? null,
    shade: item.shade ?? null,
    ral_code: item.ralCode ?? null,
    finish: item.finish ?? null,
    powder_type: item.powderType ?? null,
    pretreatment_tank: item.pretreatmentTank ?? null,
  };
}

const SELECT_COLUMNS =
  "id, name, unit, current_stock, cost_per_unit, quantity_reserved, " +
  "reorder_level, last_purchase_price, estimated_price, updated_at, " +
  "category, brand, shade, ral_code, finish, powder_type, pretreatment_tank";

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

export async function createInventoryItemRemote(
  item: Pick<
    InventoryItem,
    | "name"
    | "unit"
    | "reorderLevel"
    | "unitCost"
    | "estimatedPrice"
    | "category"
    | "brand"
    | "shade"
    | "ralCode"
    | "finish"
    | "powderType"
    | "pretreatmentTank"
  >,
): Promise<WriteResult<InventoryItem>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("inventory_items")
    .insert(toInventoryItemFields(item))
    .select(SELECT_COLUMNS)
    .single();

  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: rowToInventoryItem(data as unknown as InventoryItemRow),
  };
}

export async function updateInventoryItemRemote(
  id: string,
  item: Pick<
    InventoryItem,
    | "name"
    | "unit"
    | "reorderLevel"
    | "unitCost"
    | "estimatedPrice"
    | "category"
    | "brand"
    | "shade"
    | "ralCode"
    | "finish"
    | "powderType"
    | "pretreatmentTank"
  >,
): Promise<WriteResult<InventoryItem>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("inventory_items")
    .update(toInventoryItemFields(item))
    .eq("id", id)
    .select(SELECT_COLUMNS);

  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as InventoryItemRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: rowToInventoryItem(rows[0]) };
}

export async function deleteInventoryItemRemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("inventory_items")
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
