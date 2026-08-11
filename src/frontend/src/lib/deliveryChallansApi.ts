// Phase 27 Batch 4 — Delivery Challans write persistence layer.
//
// dc_no is confirmed the live field (frontend field dcNo, exact-name
// match); dc_number is a dead/unused duplicate column, never written
// here. project_id/quantity are also dead top-level DB columns (the
// frontend has no singular projectId/quantity on DeliveryChallan at all
// - only projectEntries: DCProjectEntry[]), never written either.
//
// No numbering race: dc_no carries no UNIQUE constraint (confirmed via
// \d), so there is nothing to bounded-retry against. The frontend's
// existing local duplicate-scan (checked against currently-hydrated
// state before calling createDeliveryChallanRemote) is preserved exactly
// as today's soft, unenforced guard - not upgraded, since there is no
// DB constraint to retry on a real collision.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { DeliveryChallan } from "@/types";
import {
  DELIVERY_CHALLAN_COLUMNS,
  transformDeliveryChallanRow,
} from "./hydration";
import type { DeliveryChallanRow } from "./hydration";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

// Excludes id/createdAt (DB-managed) and soId/jobId (legacy, no DB
// column, confirmed zero live write sites).
export type DeliveryChallanWritable = Omit<
  DeliveryChallan,
  "id" | "createdAt" | "soId" | "jobId"
>;

function toDeliveryChallanFields(v: DeliveryChallanWritable) {
  return {
    dc_no: v.dcNo,
    customer_id: v.customerId || null,
    items: v.items ?? [],
    project_entries: v.projectEntries ?? [],
    dispatch_method: v.dispatchMethod ?? null,
    vehicle_no: v.vehicleNo || null,
    driver_name: v.driverName || null,
    courier_company: v.courierCompany || null,
    tracking_number: v.trackingNumber || null,
    transport_company: v.transportCompany || null,
    lr_number: v.lrNumber || null,
    collected_by: v.collectedBy || null,
    mobile_number: v.mobileNumber || null,
    dispatch_date: v.dispatchDate,
    receiver_name: v.receiverName,
    status: v.status,
    delivery_address: v.deliveryAddress ?? null,
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

export async function createDeliveryChallanRemote(
  dc: DeliveryChallanWritable,
): Promise<WriteResult<DeliveryChallan>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("delivery_challans")
    .insert(toDeliveryChallanFields(dc))
    .select(DELIVERY_CHALLAN_COLUMNS)
    .single();

  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: transformDeliveryChallanRow(data as unknown as DeliveryChallanRow),
  };
}

export async function updateDeliveryChallanRemote(
  dc: DeliveryChallanWritable & { id: string },
): Promise<WriteResult<DeliveryChallan>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("delivery_challans")
    .update(toDeliveryChallanFields(dc))
    .eq("id", dc.id)
    .select(DELIVERY_CHALLAN_COLUMNS);

  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as DeliveryChallanRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: transformDeliveryChallanRow(rows[0]) };
}

export async function deleteDeliveryChallanRemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("delivery_challans")
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
