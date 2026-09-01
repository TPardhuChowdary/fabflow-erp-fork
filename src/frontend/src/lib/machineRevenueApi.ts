// Phase 40 — Machine/Service Revenue write persistence layer. Sibling
// to lib/diesApi.ts / lib/toolsApi.ts (this module's template - same
// WriteResult contract, same remote-first discipline).
//
// Structural note carried from the schema: billable_services.machineId
// is optional, machine_service_rate_history is insert-only (no update/
// delete function exists here on purpose), and
// createServiceUsageRemote/updateServiceUsageRemote both persist
// rateApplied/revenueAmount as plain values computed by the caller -
// never recomputed server-side from a "live" rate, so a later rate
// change can never alter a past usage row's revenue.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type {
  BillableService,
  ChargingMethod,
  MachineServiceRate,
  MachineServiceUsage,
} from "@/types";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

// Canonical "current rate" lookup — the latest (by effectiveFrom) rate row
// for a service. Extracted from pages/MachineRevenue.tsx's local
// currentRate() (Master directive) so the Agent (queries.ts) and the UI
// never compute this independently.
export function getCurrentServiceRate(
  serviceId: string,
  rates: MachineServiceRate[],
): number {
  const sorted = (rates || [])
    .filter((r) => r.billableServiceId === serviceId)
    .sort((a, b) => b.effectiveFrom - a.effectiveFrom);
  return sorted[0]?.rate ?? 0;
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

// ── billable_services ────────────────────────────────────────────

export interface BillableServiceRow {
  id: string;
  name: string;
  machine_id: string | null;
  charging_method: string;
  unit_label: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function rowToBillableService(row: BillableServiceRow): BillableService {
  return {
    id: row.id,
    name: row.name,
    machineId: row.machine_id ?? undefined,
    chargingMethod: row.charging_method as ChargingMethod,
    unitLabel: row.unit_label ?? undefined,
    isActive: row.is_active,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

function toBillableServiceFields(s: Omit<BillableService, "id">) {
  return {
    name: s.name,
    machine_id: s.machineId ?? null,
    charging_method: s.chargingMethod,
    unit_label: s.unitLabel ?? null,
    is_active: s.isActive,
  };
}

const BILLABLE_SERVICE_COLUMNS =
  "id, name, machine_id, charging_method, unit_label, is_active, created_at, updated_at";

export async function createBillableServiceRemote(
  service: Omit<BillableService, "id">,
): Promise<WriteResult<BillableService>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("billable_services")
    .insert(toBillableServiceFields(service))
    .select(BILLABLE_SERVICE_COLUMNS)
    .single();
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: rowToBillableService(data as unknown as BillableServiceRow),
  };
}

export async function updateBillableServiceRemote(
  service: BillableService,
): Promise<WriteResult<BillableService>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("billable_services")
    .update(toBillableServiceFields(service))
    .eq("id", service.id)
    .select(BILLABLE_SERVICE_COLUMNS);
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as BillableServiceRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: rowToBillableService(rows[0]) };
}

export async function deleteBillableServiceRemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("billable_services")
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

// ── machine_service_rate_history (insert-only) ──────────────────

export interface RateHistoryRow {
  id: string;
  billable_service_id: string;
  rate: number;
  effective_from: string;
  created_by: string | null;
  created_at: string;
}

export function rowToRate(row: RateHistoryRow): MachineServiceRate {
  return {
    id: row.id,
    billableServiceId: row.billable_service_id,
    rate: row.rate,
    effectiveFrom: new Date(row.effective_from).getTime(),
    createdBy: row.created_by ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
  };
}

const RATE_HISTORY_COLUMNS =
  "id, billable_service_id, rate, effective_from, created_by, created_at";

// Deliberately no update/delete counterpart - a rate can only ever be
// superseded by inserting a new, later-effective row (see schema
// header). This is the only write function this table has.
export async function addServiceRateRemote(
  billableServiceId: string,
  rate: number,
): Promise<WriteResult<MachineServiceRate>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const {
    data: { user },
  } = await gate.client.auth.getUser();
  const { data, error } = await gate.client
    .from("machine_service_rate_history")
    .insert({
      billable_service_id: billableServiceId,
      rate,
      created_by: user?.id ?? null,
    })
    .select(RATE_HISTORY_COLUMNS)
    .single();
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: rowToRate(data as unknown as RateHistoryRow),
  };
}

// ── machine_service_usage ────────────────────────────────────────

export interface UsageRow {
  id: string;
  project_id: string;
  billable_service_id: string;
  usage_date: string;
  quantity: number;
  unit: string | null;
  rate_applied: number;
  revenue_amount: number;
  recorded_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function rowToUsage(row: UsageRow): MachineServiceUsage {
  return {
    id: row.id,
    projectId: row.project_id,
    billableServiceId: row.billable_service_id,
    usageDate: row.usage_date,
    quantity: row.quantity,
    unit: row.unit ?? undefined,
    rateApplied: row.rate_applied,
    revenueAmount: row.revenue_amount,
    recordedBy: row.recorded_by ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

const USAGE_COLUMNS =
  "id, project_id, billable_service_id, usage_date, quantity, unit, " +
  "rate_applied, revenue_amount, recorded_by, notes, created_at, updated_at";

export async function createServiceUsageRemote(
  usage: Omit<MachineServiceUsage, "id" | "recordedBy">,
): Promise<WriteResult<MachineServiceUsage>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const {
    data: { user },
  } = await gate.client.auth.getUser();
  const { data, error } = await gate.client
    .from("machine_service_usage")
    .insert({
      project_id: usage.projectId,
      billable_service_id: usage.billableServiceId,
      usage_date: usage.usageDate,
      quantity: usage.quantity,
      unit: usage.unit ?? null,
      rate_applied: usage.rateApplied,
      revenue_amount: usage.revenueAmount,
      recorded_by: user?.id ?? null,
      notes: usage.notes ?? null,
    })
    .select(USAGE_COLUMNS)
    .single();
  if (error) return { status: "error", error: error.message };
  return { status: "success", data: rowToUsage(data as unknown as UsageRow) };
}

// Only quantity/date/unit/notes and the derived revenueAmount are
// meant to be edited - rateApplied is intentionally accepted here as
// whatever the caller passes (the UI keeps it read-only and always
// re-sends the usage row's own original rateApplied), never
// re-fetched from the service's current rate.
export async function updateServiceUsageRemote(
  usage: MachineServiceUsage,
): Promise<WriteResult<MachineServiceUsage>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("machine_service_usage")
    .update({
      usage_date: usage.usageDate,
      quantity: usage.quantity,
      unit: usage.unit ?? null,
      rate_applied: usage.rateApplied,
      revenue_amount: usage.revenueAmount,
      notes: usage.notes ?? null,
    })
    .eq("id", usage.id)
    .select(USAGE_COLUMNS);
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as UsageRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: rowToUsage(rows[0]) };
}

export async function deleteServiceUsageRemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("machine_service_usage")
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
