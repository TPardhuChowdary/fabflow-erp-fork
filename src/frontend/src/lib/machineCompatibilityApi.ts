// Phase 38 — Machine<->Spare Part / Machine<->Die compatibility junction
// write persistence layer. Composite PK, no surrogate id column - same
// shape as lib/projectEmployeesApi.ts (this module's template): every
// toggle is exactly one pair-INSERT or pair-DELETE, never a wholesale
// replace-all of the join table.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
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

// ── Machine <-> Spare Part (inventory_items, category = spare_part) ────

export async function addMachineSparePartRemote(
  machineId: string,
  inventoryItemId: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { error } = await gate.client
    .from("machine_spare_parts")
    .insert({ machine_id: machineId, inventory_item_id: inventoryItemId });
  if (error) return { status: "error", error: error.message };
  return { status: "success" };
}

export async function removeMachineSparePartRemote(
  machineId: string,
  inventoryItemId: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("machine_spare_parts")
    .delete()
    .eq("machine_id", machineId)
    .eq("inventory_item_id", inventoryItemId)
    .select("machine_id");
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as { machine_id: string }[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was deleted (blocked by RLS, or the pair does not exist)",
    };
  }
  return { status: "success" };
}

// ── Machine <-> Die ──────────────────────────────────────────────────

export async function addMachineDieRemote(
  machineId: string,
  dieId: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { error } = await gate.client
    .from("machine_dies")
    .insert({ machine_id: machineId, die_id: dieId });
  if (error) return { status: "error", error: error.message };
  return { status: "success" };
}

export async function removeMachineDieRemote(
  machineId: string,
  dieId: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("machine_dies")
    .delete()
    .eq("machine_id", machineId)
    .eq("die_id", dieId)
    .select("machine_id");
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as { machine_id: string }[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was deleted (blocked by RLS, or the pair does not exist)",
    };
  }
  return { status: "success" };
}
