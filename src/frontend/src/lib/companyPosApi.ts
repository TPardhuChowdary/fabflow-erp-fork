// Phase 21B — Company POs write persistence layer. Sibling to
// lib/employeesApi.ts, lib/customersApi.ts, lib/inventoryApi.ts,
// lib/vendorsApi.ts. CompanyPOs.tsx's centralized CREATE/UPDATE/DELETE
// routes through this module instead of talking to Supabase directly.
//
// Contract every write function here follows (identical to the prior
// four domains):
//   - Checks for a real Supabase session first; returns
//     {status:"unauthenticated"} with no network call if none exists.
//   - Never fabricates success. A rejected/failed request returns
//     {status:"error", error} with the real Supabase/RLS message -
//     callers must not update Zustand on this path.
//   - Only a "success" result returns the actual persisted row (for
//     create/update) so the caller can sync Zustand from what the
//     database actually has.
//   - RLS is the only authorization boundary enforced here. This module
//     performs no permission check of its own - callers gate their UI
//     with canCreate/canEdit/canDelete(currentUser, "company_po") first.
//   - update/delete request .select() (never .single()) and check
//     data.length, because Postgres RLS silently matches zero rows on a
//     blocked UPDATE/DELETE (no thrown error) - a "denied" result
//     distinguishes that from a real thrown "error".
//
// CPO-number collision handling (Phase 21B STOP-condition resolution,
// Option 1 as explicitly approved): `company_pos` carries a genuine
// UNIQUE (organization_id, cpo_number) constraint, and cpo_number is not
// DB-generated - the frontend must supply a unique value on every
// INSERT. genCpoNumber() in CompanyPOs.tsx computes the next number from
// locally-held Zustand state, which is safe for a single session but can
// collide across concurrent sessions once persisted to a shared backend.
// createCompanyPORemote() attempts the INSERT with the caller-supplied
// number first (preserves today's behavior exactly in the normal,
// no-collision case - zero extra network calls). Only if that INSERT
// fails specifically on the cpo_number unique constraint does it
// re-fetch the current numbers directly from the server (never from
// stale Zustand) and retry with a freshly computed next number, up to
// MAX_CPO_NUMBER_ATTEMPTS total attempts. Any other error (RLS denial,
// validation, unrelated constraint) is returned immediately, unretried.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { CompanyPO } from "@/types";
import { COMPANY_PO_COLUMNS, transformCompanyPORow } from "./hydration";
import type { CompanyPORow } from "./hydration";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

function toCompanyPOFields(v: Omit<CompanyPO, "id" | "createdAt">) {
  return {
    cpo_number: v.cpoNumber,
    vendor_id: v.vendorId || null,
    vendor_name: v.vendorName,
    vendor_address: v.vendorAddress || null,
    vendor_gst: v.vendorGst || null,
    vendor_contact: v.vendorContact || null,
    items: v.items,
    delivery_address: v.deliveryAddress || null,
    expected_delivery_date: v.expectedDeliveryDate || null,
    status: v.status,
    gst_percent: v.gstPercent ?? null,
    subtotal: v.subtotal,
    gst_amount: v.gstAmount,
    grand_total: v.grandTotal,
    terms_and_conditions: v.termsAndConditions || null,
    notes: v.notes || null,
    file: v.file || null,
  };
}

// UPDATE never touches cpo_number - preserving CompanyPOs.tsx's existing
// behavior, where the edit form has no cpoNumber field at all and the
// number is immutable after creation (confirmed via investigation: the
// edit save spreads {...editing, ...form} and FormState never carries
// cpoNumber, so editing.cpoNumber always wins).
function toCompanyPOUpdateFields(v: Omit<CompanyPO, "id" | "createdAt">) {
  const { cpo_number: _cpoNumber, ...rest } = toCompanyPOFields(v);
  return rest;
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

// Same CPO-NNN parsing/incrementing rule as CompanyPOs.tsx's
// genCpoNumber() - kept in exact sync so a server-state-based retry
// produces a number in the identical format (CPO-001, CPO-002, ...).
export function computeNextCpoNumber(existingNumbers: string[]): string {
  const nums = existingNumbers.map((n) => {
    const m = (n || "").match(/CPO-(\d+)/);
    return m ? Number.parseInt(m[1], 10) : 0;
  });
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `CPO-${String(next).padStart(3, "0")}`;
}

async function fetchExistingCpoNumbers(
  client: ReturnType<typeof getSupabase>,
): Promise<string[] | null> {
  const { data, error } = await client.from("company_pos").select("cpo_number");
  if (error || !data) return null;
  return (data as unknown as { cpo_number: string }[]).map((r) => r.cpo_number);
}

// Postgres unique_violation. Confirmed via investigation: the only
// UNIQUE constraint on company_pos that a normal INSERT could hit is
// uq_company_pos_org_cpono (organization_id, cpo_number) - the primary
// key is server-generated (gen_random_uuid()), so a PK collision is not
// a realistic path here.
function isCpoNumberConflict(error: { code?: string; message?: string }) {
  return (
    error.code === "23505" &&
    (error.message?.includes("uq_company_pos_org_cpono") ||
      error.message?.includes("cpo_number"))
  );
}

const MAX_CPO_NUMBER_ATTEMPTS = 3;

export async function createCompanyPORemote(
  po: Omit<CompanyPO, "id" | "createdAt">,
): Promise<WriteResult<CompanyPO>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { client } = gate;

  let candidate = po;

  for (let attempt = 1; attempt <= MAX_CPO_NUMBER_ATTEMPTS; attempt++) {
    const { data, error } = await client
      .from("company_pos")
      .insert(toCompanyPOFields(candidate))
      .select(COMPANY_PO_COLUMNS)
      .single();

    if (!error) {
      return {
        status: "success",
        data: transformCompanyPORow(data as unknown as CompanyPORow),
      };
    }

    if (!isCpoNumberConflict(error)) {
      // Any unrelated error (RLS denial, validation, etc.) - return
      // immediately, never retried.
      return { status: "error", error: error.message };
    }

    if (attempt === MAX_CPO_NUMBER_ATTEMPTS) {
      break;
    }

    // Collision on cpo_number specifically - re-derive the next number
    // from actual server state (never from stale Zustand) and retry.
    const freshNumbers = await fetchExistingCpoNumbers(client);
    if (freshNumbers === null) {
      // Could not even read fresh state - stop retrying, report clearly.
      break;
    }
    candidate = {
      ...candidate,
      cpoNumber: computeNextCpoNumber(freshNumbers),
    };
  }

  return {
    status: "error",
    error:
      "This PO number was just used by another session. Please try saving again.",
  };
}

export async function updateCompanyPORemote(
  po: CompanyPO,
): Promise<WriteResult<CompanyPO>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("company_pos")
    .update(toCompanyPOUpdateFields(po))
    .eq("id", po.id)
    .select(COMPANY_PO_COLUMNS);

  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as CompanyPORow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: transformCompanyPORow(rows[0]) };
}

export async function deleteCompanyPORemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("company_pos")
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
