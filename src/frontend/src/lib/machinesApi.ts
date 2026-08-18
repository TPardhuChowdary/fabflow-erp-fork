// Phase 35 — Machines write persistence layer. Sibling to lib/hydration.ts
// (read-only) and lib/employeesApi.ts (this module's template — same
// WriteResult contract, same remote-first discipline, same RLS
// asymmetric-UPDATE/DELETE handling described there).
//
// Every write function here:
//   - Checks for a real Supabase session first; returns
//     {status:"unauthenticated"} with no network call if none exists.
//   - Never fabricates success. A rejected/failed request returns
//     {status:"error", error} - callers must not update Zustand on this
//     path.
//   - Only a "success" result returns the actual persisted row, so the
//     caller syncs Zustand from what the database actually has.
//
// upsertMachineRemote() is the one addition beyond the employees
// template: the one-time local->Supabase migration tool
// (lib/machinesMigration.ts) needs to write an EXISTING local id
// unchanged (never DB-generated) and be safely re-runnable — a plain
// createMachineRemote() (always .insert()) can't do either.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { Machine, MachineStatus, MachineType } from "@/types";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

interface MachineRow {
  id: string;
  machine_code: string;
  name: string;
  type: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  asset_id: string | null;
  purchase_date: string | null;
  purchase_cost: number | null;
  purchase_vendor_id: string | null;
  purchase_vendor_name: string | null;
  current_status: string;
  location: string | null;
  department: string | null;
  warranty_expiry: string | null;
  warranty_vendor: string | null;
  warranty_notes: string | null;
  amc_vendor_id: string | null;
  amc_vendor_name: string | null;
  amc_start_date: string | null;
  amc_end_date: string | null;
  amc_cost: number | null;
  amc_coverage: string | null;
  service_interval_days: number | null;
  last_service_date: string | null;
  next_service_due: string | null;
  total_running_hours: number;
  hourly_rate: number | null;
  primary_image_data: string | null;
  notes: string | null;
  source_company_po_item_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function rowToMachine(row: MachineRow): Machine {
  return {
    id: row.id,
    machineCode: row.machine_code,
    name: row.name,
    type: row.type as MachineType,
    brand: row.brand ?? undefined,
    model: row.model ?? undefined,
    serialNumber: row.serial_number ?? undefined,
    assetId: row.asset_id ?? undefined,
    purchaseDate: row.purchase_date ?? undefined,
    purchaseCost: row.purchase_cost ?? undefined,
    purchaseVendorId: row.purchase_vendor_id ?? undefined,
    purchaseVendorName: row.purchase_vendor_name ?? undefined,
    currentStatus: row.current_status as MachineStatus,
    location: row.location ?? undefined,
    department: row.department ?? undefined,
    warrantyExpiry: row.warranty_expiry ?? undefined,
    warrantyVendor: row.warranty_vendor ?? undefined,
    warrantyNotes: row.warranty_notes ?? undefined,
    amcVendorId: row.amc_vendor_id ?? undefined,
    amcVendorName: row.amc_vendor_name ?? undefined,
    amcStartDate: row.amc_start_date ?? undefined,
    amcEndDate: row.amc_end_date ?? undefined,
    amcCost: row.amc_cost ?? undefined,
    amcCoverage: row.amc_coverage ?? undefined,
    serviceIntervalDays: row.service_interval_days ?? undefined,
    lastServiceDate: row.last_service_date ?? undefined,
    nextServiceDue: row.next_service_due ?? undefined,
    totalRunningHours: row.total_running_hours,
    hourlyRate: row.hourly_rate ?? undefined,
    primaryImageData: row.primary_image_data ?? undefined,
    notes: row.notes ?? undefined,
    sourceCompanyPoItemId: row.source_company_po_item_id ?? undefined,
    isActive: row.is_active,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

function toMachineFields(m: Omit<Machine, "id">) {
  return {
    machine_code: m.machineCode,
    name: m.name,
    type: m.type,
    brand: m.brand ?? null,
    model: m.model ?? null,
    serial_number: m.serialNumber ?? null,
    asset_id: m.assetId ?? null,
    purchase_date: m.purchaseDate ?? null,
    purchase_cost: m.purchaseCost ?? null,
    purchase_vendor_id: m.purchaseVendorId ?? null,
    purchase_vendor_name: m.purchaseVendorName ?? null,
    current_status: m.currentStatus,
    location: m.location ?? null,
    department: m.department ?? null,
    warranty_expiry: m.warrantyExpiry ?? null,
    warranty_vendor: m.warrantyVendor ?? null,
    warranty_notes: m.warrantyNotes ?? null,
    amc_vendor_id: m.amcVendorId ?? null,
    amc_vendor_name: m.amcVendorName ?? null,
    amc_start_date: m.amcStartDate ?? null,
    amc_end_date: m.amcEndDate ?? null,
    amc_cost: m.amcCost ?? null,
    amc_coverage: m.amcCoverage ?? null,
    service_interval_days: m.serviceIntervalDays ?? null,
    last_service_date: m.lastServiceDate ?? null,
    next_service_due: m.nextServiceDue ?? null,
    total_running_hours: m.totalRunningHours,
    hourly_rate: m.hourlyRate ?? null,
    primary_image_data: m.primaryImageData ?? null,
    notes: m.notes ?? null,
    source_company_po_item_id: m.sourceCompanyPoItemId ?? null,
    is_active: m.isActive,
    created_at: new Date(m.createdAt).toISOString(),
    updated_at: new Date(m.updatedAt).toISOString(),
  };
}

const SELECT_COLUMNS =
  "id, machine_code, name, type, brand, model, serial_number, asset_id, " +
  "purchase_date, purchase_cost, purchase_vendor_id, purchase_vendor_name, " +
  "current_status, location, department, warranty_expiry, warranty_vendor, " +
  "warranty_notes, amc_vendor_id, amc_vendor_name, amc_start_date, " +
  "amc_end_date, amc_cost, amc_coverage, service_interval_days, " +
  "last_service_date, next_service_due, total_running_hours, hourly_rate, " +
  "primary_image_data, notes, source_company_po_item_id, is_active, " +
  "created_at, updated_at";

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

export async function createMachineRemote(
  machine: Omit<Machine, "id">,
): Promise<WriteResult<Machine>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("machines")
    .insert(toMachineFields(machine))
    .select(SELECT_COLUMNS)
    .single();

  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: rowToMachine(data as unknown as MachineRow),
  };
}

export async function updateMachineRemote(
  machine: Machine,
): Promise<WriteResult<Machine>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("machines")
    .update(toMachineFields(machine))
    .eq("id", machine.id)
    .select(SELECT_COLUMNS);

  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as MachineRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: rowToMachine(rows[0]) };
}

export async function deleteMachineRemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("machines")
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

// Migration-only: preserves the given local id (never DB-generated) and is
// safe to call repeatedly for the same id (upsert, not insert) - see
// lib/machinesMigration.ts for the one-time IndexedDB/localStorage ->
// Supabase import flow this exists for. Not used by any regular
// create/edit UI flow (those go through createMachineRemote above, which
// deliberately lets Postgres generate the id).
export async function upsertMachineRemote(
  machine: Machine,
): Promise<WriteResult<Machine>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("machines")
    .upsert(
      { id: machine.id, ...toMachineFields(machine) },
      { onConflict: "id" },
    )
    .select(SELECT_COLUMNS)
    .single();

  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: rowToMachine(data as unknown as MachineRow),
  };
}
