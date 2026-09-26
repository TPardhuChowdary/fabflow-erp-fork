// Material Families — persistence layer for material_families +
// material_family_specifications (database/20260925100000, applied).
// Sibling to vendorsApi.ts (same WriteResult contract, same session-gate
// pattern). Grouping/metadata only — no stock lives here; inventory_items
// remains the sole stock-holding entity, referencing a family only via
// its optional material_family_id.
//
// Not wired into the global Zustand store: both consumers (Inventory.tsx,
// ProductionMaterialTransactions.tsx) fetch this small, rarely-changing
// list locally on mount, the same pattern ProductionMaterialTransactions
// already uses for its own transaction list — avoids threading a new
// global-store domain through store.ts/useSupabaseHydration.ts for what
// is a small, infrequently-updated master-data list.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { MaterialFamily, MaterialFamilySpecField } from "@/types";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

interface FamilyRow {
  id: string;
  name: string;
  notes: string | null;
}

interface SpecRow {
  id: string;
  material_family_id: string;
  spec_name: string;
  position: number;
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

/** Every family with its spec template attached, ordered by position. */
export async function fetchMaterialFamilies(): Promise<
  WriteResult<MaterialFamily[]>
> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const [families, specs] = await Promise.all([
    gate.client.from("material_families").select("id, name, notes").order("name"),
    gate.client
      .from("material_family_specifications")
      .select("id, material_family_id, spec_name, position")
      .order("position"),
  ]);

  if (families.error) return { status: "error", error: families.error.message };
  if (specs.error) return { status: "error", error: specs.error.message };

  const specRows = (specs.data ?? []) as unknown as SpecRow[];
  const data = ((families.data ?? []) as unknown as FamilyRow[]).map(
    (f): MaterialFamily => ({
      id: f.id,
      name: f.name,
      notes: f.notes ?? undefined,
      specFields: specRows
        .filter((s) => s.material_family_id === f.id)
        .map(
          (s): MaterialFamilySpecField => ({
            id: s.id,
            specName: s.spec_name,
            position: s.position,
          }),
        ),
    }),
  );

  return { status: "success", data };
}

export async function createMaterialFamilyRemote(input: {
  name: string;
  notes?: string;
}): Promise<WriteResult<MaterialFamily>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("material_families")
    .insert({ name: input.name.trim(), notes: input.notes?.trim() || null })
    .select("id, name, notes")
    .single();

  if (error) return { status: "error", error: error.message };
  const row = data as unknown as FamilyRow;
  return {
    status: "success",
    data: { id: row.id, name: row.name, notes: row.notes ?? undefined, specFields: [] },
  };
}

export async function updateMaterialFamilyRemote(
  id: string,
  input: { name: string; notes?: string },
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("material_families")
    .update({ name: input.name.trim(), notes: input.notes?.trim() || null })
    .eq("id", id)
    .select("id");

  if (error) return { status: "error", error: error.message };
  if (!data || data.length === 0) {
    return { status: "denied", error: "No row was updated (blocked by RLS, or the row does not exist)" };
  }
  return { status: "success" };
}

/** Appends one spec field to a family's template, after its current
 * highest position (append-to-end — matches how the Add dialog's "Add
 * specification field" affordance is used). */
export async function addMaterialFamilySpecRemote(
  familyId: string,
  specName: string,
  position: number,
): Promise<WriteResult<MaterialFamilySpecField>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("material_family_specifications")
    .insert({ material_family_id: familyId, spec_name: specName.trim(), position })
    .select("id, material_family_id, spec_name, position")
    .single();

  if (error) return { status: "error", error: error.message };
  const row = data as unknown as SpecRow;
  return {
    status: "success",
    data: { id: row.id, specName: row.spec_name, position: row.position },
  };
}

/** Reassigns positions for a family's spec fields (drag/reorder) — one
 * update per field, since the table has no bulk-position RPC. Callers
 * pass the full desired order; this writes 0..n-1 as positions. */
export async function reorderMaterialFamilySpecsRemote(
  orderedSpecIds: string[],
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  for (let i = 0; i < orderedSpecIds.length; i++) {
    const { error } = await gate.client
      .from("material_family_specifications")
      .update({ position: i })
      .eq("id", orderedSpecIds[i]);
    if (error) return { status: "error", error: error.message };
  }
  return { status: "success" };
}
