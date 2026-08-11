// Phase 21A — Vendors write persistence layer. Sibling to
// lib/employeesApi.ts, lib/customersApi.ts, lib/inventoryApi.ts. Every
// real vendor mutation path (Vendors.tsx's centralized CRUD, plus the 4
// scattered quick-add call sites) routes through this module instead of
// talking to Supabase directly.
//
// Contract every write function here follows (identical to the prior
// three domains):
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
//     with canCreate/canEdit/canDelete(currentUser, "vendors") first.
//   - update/delete request .select() (never .single()) and check
//     data.length, because Postgres RLS silently matches zero rows on a
//     blocked UPDATE/DELETE (no thrown error) - a "denied" result
//     distinguishes that from a real thrown "error".

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { Vendor } from "@/types";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

interface VendorRow {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  gstin: string | null;
  created_at: string;
}

function rowToVendor(row: VendorRow): Vendor {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? "",
    address: row.address ?? "",
    gstNumber: row.gstin ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
  };
}

// Frontend -> DB payload. Omits id (DB-generated on insert, path param on
// update/delete) and createdAt (DB-managed created_at).
function toVendorFields(v: Omit<Vendor, "id" | "createdAt">) {
  return {
    name: v.name,
    phone: v.phone || null,
    address: v.address || null,
    gstin: v.gstNumber ?? null,
  };
}

const SELECT_COLUMNS = "id, name, phone, address, gstin, created_at";

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

export async function createVendorRemote(
  vendor: Omit<Vendor, "id" | "createdAt">,
): Promise<WriteResult<Vendor>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("vendors")
    .insert(toVendorFields(vendor))
    .select(SELECT_COLUMNS)
    .single();

  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: rowToVendor(data as unknown as VendorRow),
  };
}

export async function updateVendorRemote(
  vendor: Vendor,
): Promise<WriteResult<Vendor>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("vendors")
    .update(toVendorFields(vendor))
    .eq("id", vendor.id)
    .select(SELECT_COLUMNS);

  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as VendorRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: rowToVendor(rows[0]) };
}

export async function deleteVendorRemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("vendors")
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
