// Monster-2 — Internal Costing ("Internal Costing" tab) write persistence.
// Sibling to every other <domain>Api.ts module in this codebase; same
// WriteResult contract, same requireSession() shape. Was 100% local-only
// Zustand state (internal_costings table + RLS added in
// database/monster-2/monster2_project_items_and_internal_costing.sql).
//
// One row per project — the table carries a real UNIQUE (project_id)
// constraint, matching upsertInternalCosting()'s own local "exists for
// this project ? update : insert" semantics exactly. upsertInternalCostingRemote
// below is a genuine upsert keyed on project_id (not id), so the caller
// never needs to know whether a row already exists — the same contract
// the local action already gave the UI.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type {
  CustomCostEntry,
  InternalCosting,
  ManualAdjustment,
} from "@/types";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

interface InternalCostingRow {
  id: string;
  project_id: string;
  raw_material_cost: number;
  cnc_cost: number;
  hardware_cost: number;
  powder_coating_cost: number;
  assembly_cost: number;
  packing_cost: number;
  labour_cost: number | null;
  transport_cost: number | null;
  machine_cost: number | null;
  outsource_cost: number | null;
  consumables_cost: number | null;
  electricity_cost: number | null;
  scrap_loss_cost: number | null;
  extra_costs: CustomCostEntry[] | null;
  manual_adjustments: ManualAdjustment[] | null;
}

function rowToInternalCosting(row: InternalCostingRow): InternalCosting {
  return {
    id: row.id,
    projectId: row.project_id,
    rawMaterialCost: row.raw_material_cost,
    cncCost: row.cnc_cost,
    hardwareCost: row.hardware_cost,
    powderCoatingCost: row.powder_coating_cost,
    assemblyCost: row.assembly_cost,
    packingCost: row.packing_cost,
    labourCost: row.labour_cost ?? undefined,
    transportCost: row.transport_cost ?? undefined,
    machineCost: row.machine_cost ?? undefined,
    outsourceCost: row.outsource_cost ?? undefined,
    consumablesCost: row.consumables_cost ?? undefined,
    electricityCost: row.electricity_cost ?? undefined,
    scrapLossCost: row.scrap_loss_cost ?? undefined,
    extraCosts: row.extra_costs ?? undefined,
    manualAdjustments: row.manual_adjustments ?? undefined,
  };
}

function toInternalCostingFields(v: Omit<InternalCosting, "id">) {
  return {
    project_id: v.projectId,
    raw_material_cost: v.rawMaterialCost || 0,
    cnc_cost: v.cncCost || 0,
    hardware_cost: v.hardwareCost || 0,
    powder_coating_cost: v.powderCoatingCost || 0,
    assembly_cost: v.assemblyCost || 0,
    packing_cost: v.packingCost || 0,
    labour_cost: v.labourCost ?? null,
    transport_cost: v.transportCost ?? null,
    machine_cost: v.machineCost ?? null,
    outsource_cost: v.outsourceCost ?? null,
    consumables_cost: v.consumablesCost ?? null,
    electricity_cost: v.electricityCost ?? null,
    scrap_loss_cost: v.scrapLossCost ?? null,
    extra_costs: v.extraCosts ?? [],
    manual_adjustments: v.manualAdjustments ?? [],
  };
}

const INTERNAL_COSTING_COLUMNS =
  "id, project_id, raw_material_cost, cnc_cost, hardware_cost, " +
  "powder_coating_cost, assembly_cost, packing_cost, labour_cost, " +
  "transport_cost, machine_cost, outsource_cost, consumables_cost, " +
  "electricity_cost, scrap_loss_cost, extra_costs, manual_adjustments";

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

export async function upsertInternalCostingRemote(
  costing: Omit<InternalCosting, "id">,
): Promise<WriteResult<InternalCosting>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("internal_costings")
    .upsert(toInternalCostingFields(costing), { onConflict: "project_id" })
    .select(INTERNAL_COSTING_COLUMNS)
    .single();
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: rowToInternalCosting(data as unknown as InternalCostingRow),
  };
}
