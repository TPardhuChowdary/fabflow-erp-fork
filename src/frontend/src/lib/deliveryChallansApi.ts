// Phase 27 Batch 4 — Delivery Challans write persistence layer.
//
// dc_no is confirmed the live field (frontend field dcNo, exact-name
// match); dc_number is a dead/unused duplicate column, never written
// here. project_id/quantity are also dead top-level DB columns (the
// frontend has no singular projectId/quantity on DeliveryChallan at all
// - only projectEntries: DCProjectEntry[]), never written either.
//
// Phase C.1 — dc_no now carries a real UNIQUE (organization_id, dc_no)
// constraint (see database/phase-c1/). createDeliveryChallanRemote below
// bounded-retries on a 23505 conflict against that constraint specifically,
// mirroring createProjectRemote (lib/projectsApi.ts) and
// createQuotationRemote (lib/quotationsApi.ts) exactly: re-derive the
// candidate from fresh server state on conflict, never from stale local
// state, never by re-invoking any local counter. autoRenumberOnConflict
// controls whether a conflict is silently retried with a fresh number
// (auto-generated candidates - the Agent, or an untouched UI preview) or
// surfaced as a plain error (a user explicitly typed a specific number in
// DeliveryChallans.tsx's editable Challan Number field - DC is the only
// one of FabFlow's four numbered-document create forms where the number
// is user-editable, so silently substituting a different one would be
// wrong there).

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { DeliveryChallan } from "@/types";
import {
  DELIVERY_CHALLAN_COLUMNS,
  transformDeliveryChallanRow,
} from "./hydration";
import type { DeliveryChallanRow } from "./hydration";

// Same DC-YYYY-NNN format as DeliveryChallans.tsx's own previewDcNo() —
// mirrors that exact existing client-side computation rather than
// inventing a new numbering scheme. Pure calculation over supplied
// existing numbers, never a local counter. Also used by
// createDeliveryChallanRemote to compute a fresh candidate after a
// dc_no collision (see header comment).
export function computeNextDcNumber(existingDcNumbers: string[]): string {
  const year = new Date().getFullYear();
  const nums = existingDcNumbers.map((n) => {
    const m = (n || "").match(/DC-\d{4}-(\d+)/);
    return m ? Number.parseInt(m[1], 10) : 0;
  });
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `DC-${year}-${String(next).padStart(3, "0")}`;
}

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

async function fetchExistingDcNumbers(
  client: ReturnType<typeof getSupabase>,
): Promise<string[] | null> {
  const { data, error } = await client
    .from("delivery_challans")
    .select("dc_no");
  if (error || !data) return null;
  return (data as unknown as { dc_no: string | null }[]).map(
    (r) => r.dc_no ?? "",
  );
}

// Postgres unique_violation on uq_delivery_challans_org_dcno specifically -
// same check shape as isProjectNumberConflict/isQtNumberConflict.
function isDcNumberConflict(error: { code?: string; message?: string }) {
  return (
    error.code === "23505" &&
    (error.message?.includes("uq_delivery_challans_org_dcno") ||
      error.message?.includes("dc_no"))
  );
}

const MAX_DC_NUMBER_ATTEMPTS = 3;

export async function createDeliveryChallanRemote(
  dc: DeliveryChallanWritable,
  options?: { autoRenumberOnConflict?: boolean },
): Promise<WriteResult<DeliveryChallan>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { client } = gate;
  const autoRenumberOnConflict = options?.autoRenumberOnConflict ?? true;

  let candidate = dc;

  for (let attempt = 1; attempt <= MAX_DC_NUMBER_ATTEMPTS; attempt++) {
    const { data, error } = await client
      .from("delivery_challans")
      .insert(toDeliveryChallanFields(candidate))
      .select(DELIVERY_CHALLAN_COLUMNS)
      .single();

    if (!error) {
      return {
        status: "success",
        data: transformDeliveryChallanRow(
          data as unknown as DeliveryChallanRow,
        ),
      };
    }

    if (!isDcNumberConflict(error)) {
      return { status: "error", error: error.message };
    }

    if (!autoRenumberOnConflict || attempt === MAX_DC_NUMBER_ATTEMPTS) {
      return {
        status: "error",
        error: `Challan number ${candidate.dcNo} already exists. Please use a different number.`,
      };
    }

    // Collision on dc_no specifically - re-derive the next number from
    // actual server state (never from stale local state, never by
    // re-invoking computeNextDcNumber's caller) and retry.
    const freshNumbers = await fetchExistingDcNumbers(client);
    if (freshNumbers === null) {
      return {
        status: "error",
        error: `Challan number ${candidate.dcNo} already exists. Please use a different number.`,
      };
    }
    candidate = { ...candidate, dcNo: computeNextDcNumber(freshNumbers) };
  }

  return {
    status: "error",
    error:
      "This challan number was just used by another session. Please try saving again.",
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
