// Phase 24 — Outsourced Works write persistence layer. Sibling to
// lib/vendorsApi.ts, lib/companyPosApi.ts, lib/projectsApi.ts.
// ProjectDetail.tsx's Outsourced Works CREATE/UPDATE/DELETE routes through
// this module instead of talking to Supabase directly.
//
// Contract every write function here follows (identical to every prior
// domain):
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
//     with canCreate/canEdit/canDelete(currentUser, "projects") first
//     (outsourced_works RLS keys off the `projects` module, not its own -
//     confirmed in Phase 23, re-confirmed in Phase 24's targeted
//     verification).
//   - update/delete request .select() (never .single()) and check
//     data.length, because Postgres RLS silently matches zero rows on a
//     blocked UPDATE/DELETE (no thrown error) - a "denied" result
//     distinguishes that from a real thrown "error".
//
// No local-only fields in this domain (unlike Projects) - every
// OutsourcedWork field has a direct DB column, so no merge-exception is
// needed anywhere in this module or its caller.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { OutsourcedWork } from "@/types";
import {
  OUTSOURCED_WORK_COLUMNS,
  transformOutsourcedWorkRow,
} from "./hydration";
import type { OutsourcedWorkRow } from "./hydration";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

// Frontend -> DB payload. Omits id (DB-generated on insert, path param on
// update/delete) and organization_id/created_at/updated_at (DB-managed).
// Exact mapping per the explicitly approved Phase 24 field table.
function toOutsourcedWorkFields(v: Omit<OutsourcedWork, "id">) {
  return {
    project_id: v.projectId,
    vendor_id: v.vendorId ?? null,
    vendor_name: v.vendorName,
    material_sent: v.materialSent,
    quantity_sent: v.quantitySent,
    date_sent: v.dateSent || null,
    date_received: v.dateReceived || null,
    process_cost: v.processCost,
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

export async function createOutsourcedWorkRemote(
  work: Omit<OutsourcedWork, "id">,
): Promise<WriteResult<OutsourcedWork>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("outsourced_works")
    .insert(toOutsourcedWorkFields(work))
    .select(OUTSOURCED_WORK_COLUMNS)
    .single();

  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: transformOutsourcedWorkRow(data as unknown as OutsourcedWorkRow),
  };
}

export async function updateOutsourcedWorkRemote(
  work: OutsourcedWork,
): Promise<WriteResult<OutsourcedWork>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("outsourced_works")
    .update(toOutsourcedWorkFields(work))
    .eq("id", work.id)
    .select(OUTSOURCED_WORK_COLUMNS);

  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as OutsourcedWorkRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: transformOutsourcedWorkRow(rows[0]) };
}

export async function deleteOutsourcedWorkRemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("outsourced_works")
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
