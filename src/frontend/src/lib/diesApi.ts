// Phase 38 — Dies write persistence layer. Sibling to lib/toolsApi.ts
// (this module's template — same WriteResult contract, same remote-first
// discipline). Dies is a net-new Supabase-backed module (public.dies,
// see database/phase-38).

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { Die, DieStatus, MachineCondition } from "@/types";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

interface DieRow {
  id: string;
  die_code: string;
  name: string;
  type: string | null;
  purpose: string | null;
  compatible_machine_id: string | null;
  original_project_id: string | null;
  location: string | null;
  status: string;
  date_created: string | null;
  condition: string | null;
  notes: string | null;
  photo_data: string | null;
  purchase_date: string | null;
  purchase_cost: number | null;
  purchase_vendor_id: string | null;
  purchase_vendor_name: string | null;
  source_company_po_item_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function rowToDie(row: DieRow): Die {
  return {
    id: row.id,
    dieCode: row.die_code,
    name: row.name,
    type: row.type ?? undefined,
    purpose: row.purpose ?? undefined,
    compatibleMachineId: row.compatible_machine_id ?? undefined,
    originalProjectId: row.original_project_id ?? undefined,
    location: row.location ?? undefined,
    status: row.status as DieStatus,
    dateCreated: row.date_created ?? undefined,
    condition: (row.condition as MachineCondition | null) ?? undefined,
    notes: row.notes ?? undefined,
    photoData: row.photo_data ?? undefined,
    purchaseDate: row.purchase_date ?? undefined,
    purchaseCost: row.purchase_cost ?? undefined,
    purchaseVendorId: row.purchase_vendor_id ?? undefined,
    purchaseVendorName: row.purchase_vendor_name ?? undefined,
    sourceCompanyPoItemId: row.source_company_po_item_id ?? undefined,
    isActive: row.is_active,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

function toDieFields(d: Omit<Die, "id">) {
  return {
    die_code: d.dieCode,
    name: d.name,
    type: d.type ?? null,
    purpose: d.purpose ?? null,
    compatible_machine_id: d.compatibleMachineId ?? null,
    original_project_id: d.originalProjectId ?? null,
    location: d.location ?? null,
    status: d.status,
    date_created: d.dateCreated ?? null,
    condition: d.condition ?? null,
    notes: d.notes ?? null,
    photo_data: d.photoData ?? null,
    purchase_date: d.purchaseDate ?? null,
    purchase_cost: d.purchaseCost ?? null,
    purchase_vendor_id: d.purchaseVendorId ?? null,
    purchase_vendor_name: d.purchaseVendorName ?? null,
    source_company_po_item_id: d.sourceCompanyPoItemId ?? null,
    is_active: d.isActive,
  };
}

const SELECT_COLUMNS =
  "id, die_code, name, type, purpose, compatible_machine_id, " +
  "original_project_id, location, status, date_created, condition, " +
  "notes, photo_data, purchase_date, purchase_cost, purchase_vendor_id, " +
  "purchase_vendor_name, source_company_po_item_id, is_active, created_at, updated_at";

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

// Phase L.1 — die_code now carries a real UNIQUE (organization_id,
// die_code) constraint (see database/phase-l1/), mirroring
// uq_machines_org_code/uq_tools_org_code exactly. computeNextDieCode is
// a pure calculation over supplied existing codes, matching store.ts's
// generateDieCode() format (DIE-{n}, padded 3). store.ts's own
// generator is left unchanged; this function is only used here, to
// re-derive a fresh candidate from actual server state on a 23505
// conflict.
export function computeNextDieCode(existingCodes: string[]): string {
  const nums = existingCodes.map((c) => {
    const m = (c || "").match(/DIE-(\d+)/);
    return m ? Number.parseInt(m[1], 10) : 0;
  });
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `DIE-${String(next).padStart(3, "0")}`;
}

async function fetchExistingDieCodes(
  client: ReturnType<typeof getSupabase>,
): Promise<string[] | null> {
  const { data, error } = await client.from("dies").select("die_code");
  if (error || !data) return null;
  return (data as unknown as { die_code: string }[]).map((r) => r.die_code);
}

function isDieCodeConflict(error: { code?: string; message?: string }) {
  return (
    error.code === "23505" &&
    (error.message?.includes("uq_dies_org_code") ||
      error.message?.includes("die_code"))
  );
}

const MAX_DIE_CODE_ATTEMPTS = 3;

export async function createDieRemote(
  die: Omit<Die, "id">,
): Promise<WriteResult<Die>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { client } = gate;

  let candidate = die;

  for (let attempt = 1; attempt <= MAX_DIE_CODE_ATTEMPTS; attempt++) {
    const { data, error } = await client
      .from("dies")
      .insert(toDieFields(candidate))
      .select(SELECT_COLUMNS)
      .single();

    if (!error) {
      return { status: "success", data: rowToDie(data as unknown as DieRow) };
    }

    if (!isDieCodeConflict(error)) {
      return { status: "error", error: error.message };
    }

    if (attempt === MAX_DIE_CODE_ATTEMPTS) {
      break;
    }

    const freshCodes = await fetchExistingDieCodes(client);
    if (freshCodes === null) {
      break;
    }
    candidate = { ...candidate, dieCode: computeNextDieCode(freshCodes) };
  }

  return {
    status: "error",
    error:
      "This die code was just used by another session. Please try saving again.",
  };
}

export async function updateDieRemote(die: Die): Promise<WriteResult<Die>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("dies")
    .update(toDieFields(die))
    .eq("id", die.id)
    .select(SELECT_COLUMNS);

  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as DieRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: rowToDie(rows[0]) };
}

export async function deleteDieRemote(id: string): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("dies")
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
