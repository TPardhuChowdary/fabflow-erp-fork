// Phase 19 — Customers write persistence layer. Sibling to
// lib/employeesApi.ts (Phase 18B/18C) and lib/hydration.ts (read-only).
// Customers.tsx calls into this module instead of talking to Supabase
// directly.
//
// Contract every write function here follows (identical to
// employeesApi.ts - see that file's header for the full RLS-asymmetry
// rationale this mirrors):
//   - Checks for a real Supabase session first; returns
//     {status:"unauthenticated"} with no network call if none exists.
//   - Never fabricates success. A rejected/failed request returns
//     {status:"error", error} with the real Supabase/RLS message -
//     callers must not update Zustand on this path.
//   - Only a "success" result returns the actual persisted row (for
//     create/update) so the caller can sync Zustand from what the
//     database actually has, not from what was optimistically assumed.
//   - RLS is the only authorization boundary enforced here. This module
//     performs no permission check of its own.
//   - update/delete request .select() (never .single()) and check
//     data.length, because Postgres RLS silently matches zero rows on a
//     blocked UPDATE/DELETE (no thrown error) - a "denied" result
//     distinguishes that from a real thrown "error".

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { Customer } from "@/types";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

interface CustomerRow {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gstin: string | null;
  state_name: string | null;
  state_code: string | null;
  additional_details: Array<{ key: string; value: string }> | null;
  emails: Array<{ email: string; type: string }> | null;
  primary_email: string | null;
  created_at: string;
}

function rowToCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    contactPerson: row.contact_person ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    address: row.address ?? "",
    gstin: row.gstin ?? "",
    stateName: row.state_name ?? undefined,
    stateCode: row.state_code ?? undefined,
    additionalDetails: row.additional_details ?? undefined,
    emails: row.emails ?? undefined,
    primaryEmail: row.primary_email ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
  };
}

// Frontend -> DB payload. Omits id (DB-generated on insert, path param on
// update/delete - same convention as employeesApi.ts) and createdAt
// (DB-managed created_at; there is no legitimate client-side update of a
// row's creation time).
function toCustomerFields(c: Omit<Customer, "id" | "createdAt">) {
  return {
    name: c.name,
    contact_person: c.contactPerson || null,
    phone: c.phone || null,
    email: c.email || null,
    address: c.address || null,
    gstin: c.gstin || null,
    state_name: c.stateName ?? null,
    state_code: c.stateCode ?? null,
    additional_details: c.additionalDetails ?? null,
    emails: c.emails ?? null,
    primary_email: c.primaryEmail ?? null,
  };
}

const SELECT_COLUMNS =
  "id, name, contact_person, phone, email, address, gstin, state_name, " +
  "state_code, additional_details, emails, primary_email, created_at";

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

export async function createCustomerRemote(
  customer: Omit<Customer, "id" | "createdAt">,
): Promise<WriteResult<Customer>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("customers")
    .insert(toCustomerFields(customer))
    .select(SELECT_COLUMNS)
    .single();

  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: rowToCustomer(data as unknown as CustomerRow),
  };
}

export async function updateCustomerRemote(
  customer: Customer,
): Promise<WriteResult<Customer>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("customers")
    .update(toCustomerFields(customer))
    .eq("id", customer.id)
    .select(SELECT_COLUMNS);

  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as CustomerRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: rowToCustomer(rows[0]) };
}

export async function deleteCustomerRemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("customers")
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
