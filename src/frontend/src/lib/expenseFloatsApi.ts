// Phase 27 Batch 3 — Expense Floats + Petty Expenses write persistence
// layer. Batched together (same reasoning as Batch 1's project_bom_items+
// bom_requisitions and Batch 2's master_pos+quotation_purchase_orders+
// project_purchase_orders): petty_expenses writes always trigger a
// server-side recompute of their linked expense_floats row
// (trg_recompute_petty_expense_floats), so both tables need coordinated
// verification.
//
// spent_amount/balance_amount/status/settled_at on expense_floats are
// 100% trigger-owned (confirmed via pg_get_functiondef of
// expense_floats_before_write()/expense_float_recompute() - byte-for-
// byte the same formula store.ts's own deriveFloatTotals() already used
// locally). Never included in any write payload here - the DB always
// overwrites them on INSERT/UPDATE regardless, and the caller must read
// the returned row rather than assume its own optimistic values.
//
// float_no collision handling: same bounded-retry Option 1 pattern as
// qt_no/project_number/cpo_number. expense_floats carries a genuine
// UNIQUE (organization_id, float_no) constraint; float_no is not DB-
// generated.
//
// issued_by: DB uuid FK to auth.users. Stamped with the real session
// user id unconditionally on create (same treatment as quotation_
// revisions.created_by) - the frontend's issuedBy display username stays
// local-only, merged back in by store.ts's hydration setter.
//
// No numbering race on petty_expenses - no unique constraint on any
// business-meaningful column, confirmed via \d. Plain inserts.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { ExpenseFloat, PettyExpense } from "@/types";
import {
  EXPENSE_FLOAT_COLUMNS,
  PETTY_EXPENSE_COLUMNS,
  transformExpenseFloatRow,
  transformPettyExpenseRow,
} from "./hydration";
import type { ExpenseFloatRow, PettyExpenseRow } from "./hydration";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
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
  return { ok: true as const, client, userId: data.session.user.id };
}

// ── expense_floats ──────────────────────────────────────────────────

export type ExpenseFloatWritable = Omit<
  ExpenseFloat,
  | "id"
  | "createdAt"
  | "floatNo"
  | "spentAmount"
  | "balanceAmount"
  | "status"
  | "settledAt"
  | "issuedBy"
  // returnedAmount is exclusively settleExpenseFloatRemote's concern -
  // create always starts at the DB default (0) and plain update never
  // touches it, same "each write function only touches what it needs"
  // rule as toProjectUpdateFields excluding project_number.
  | "returnedAmount"
>;

function toExpenseFloatFields(v: ExpenseFloatWritable) {
  return {
    employee_id: v.employeeId,
    issued_date: v.issuedDate,
    issued_amount: v.issuedAmount,
    purpose: v.purpose || null,
    notes: v.notes || null,
    project_id: v.projectId || null,
  };
}

// Same FLT-YYYY-NNN format as the existing local floatCounter-based
// generator in PettyExpenses.tsx, but a pure calculation over supplied
// server-side numbers - mirrors computeNextProjectNumber/
// computeNextQtNumber's monotonic-across-years semantics exactly.
export function computeNextFloatNumber(existingNumbers: string[]): string {
  const year = new Date().getFullYear();
  const nums = existingNumbers.map((n) => {
    const m = (n || "").match(/^FLT-\d{4}-(\d+)$/);
    return m ? Number.parseInt(m[1], 10) : 0;
  });
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `FLT-${year}-${String(next).padStart(3, "0")}`;
}

async function fetchExistingFloatNumbers(
  client: ReturnType<typeof getSupabase>,
): Promise<string[] | null> {
  const { data, error } = await client
    .from("expense_floats")
    .select("float_no");
  if (error || !data) return null;
  return (data as unknown as { float_no: string }[]).map((r) => r.float_no);
}

function isFloatNumberConflict(error: { code?: string; message?: string }) {
  return (
    error.code === "23505" &&
    (error.message?.includes("expense_floats_organization_id_float_no_key") ||
      error.message?.includes("float_no"))
  );
}

const MAX_FLOAT_NUMBER_ATTEMPTS = 3;

export async function createExpenseFloatRemote(
  float: ExpenseFloatWritable & { floatNo: string },
): Promise<WriteResult<ExpenseFloat>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { client } = gate;

  let candidateNumber = float.floatNo;

  for (let attempt = 1; attempt <= MAX_FLOAT_NUMBER_ATTEMPTS; attempt++) {
    const { data, error } = await client
      .from("expense_floats")
      .insert({
        ...toExpenseFloatFields(float),
        float_no: candidateNumber,
        issued_by: gate.userId,
      })
      .select(EXPENSE_FLOAT_COLUMNS)
      .single();

    if (!error) {
      return {
        status: "success",
        data: transformExpenseFloatRow(data as unknown as ExpenseFloatRow),
      };
    }

    if (!isFloatNumberConflict(error)) {
      return { status: "error", error: error.message };
    }

    if (attempt === MAX_FLOAT_NUMBER_ATTEMPTS) break;

    const freshNumbers = await fetchExistingFloatNumbers(client);
    if (freshNumbers === null) break;
    candidateNumber = computeNextFloatNumber(freshNumbers);
  }

  return {
    status: "error",
    error:
      "This float number was just used by another session. Please try saving again.",
  };
}

export async function updateExpenseFloatRemote(
  float: ExpenseFloatWritable & { id: string },
): Promise<WriteResult<ExpenseFloat>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("expense_floats")
    .update(toExpenseFloatFields(float))
    .eq("id", float.id)
    .select(EXPENSE_FLOAT_COLUMNS);

  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as ExpenseFloatRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: transformExpenseFloatRow(rows[0]) };
}

// Settle Float — delegates to the settle_expense_float(p_float_id,
// p_delta, p_notes) RPC (database/phase-04/phase4_petty_expenses_FINAL.sql
// §6), which existed, was tested, and had zero callers anywhere in the
// frontend (same defect class as Monster-1's record_material_purchase).
// This function used to read returned_amount client-side and write back
// an absolute new total — exactly the lost-update race the RPC's own
// header comment calls out by name: two concurrent settlements of the
// same float would silently clobber each other, since each writes an
// absolute value computed from whatever it last hydrated, not the DB's
// current value at write time. The RPC takes p_delta (the amount
// returned in *this* action — already what callers had on hand, see
// PettyExpenses.tsx's `returned` local) and applies it atomically under
// a row-level FOR UPDATE lock, so this is a strict simplification for
// callers too, not just a safety fix. The RPC returns void (it's a
// side-effecting primitive, not a query), so the fresh row is read back
// with a follow-up select — the same two-step shape a plain .update()
// with .select() already was, just split across two round-trips instead
// of one PostgREST call.
export async function settleExpenseFloatRemote(
  id: string,
  delta: number,
  notes?: string,
): Promise<WriteResult<ExpenseFloat>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { error: rpcError } = await gate.client.rpc("settle_expense_float", {
    p_float_id: id,
    p_delta: delta,
    p_notes: notes || null,
  });
  if (rpcError) return { status: "error", error: rpcError.message };

  const { data, error } = await gate.client
    .from("expense_floats")
    .select(EXPENSE_FLOAT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) return { status: "error", error: error.message };
  if (!data) {
    return {
      status: "denied",
      error:
        "Settlement recorded, but the updated float is not visible to you (blocked by RLS)",
    };
  }
  return {
    status: "success",
    data: transformExpenseFloatRow(data as unknown as ExpenseFloatRow),
  };
}

export async function deleteExpenseFloatRemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("expense_floats")
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

// ── petty_expenses ──────────────────────────────────────────────────

export type PettyExpenseWritable = Omit<PettyExpense, "id" | "createdAt">;

function toPettyExpenseFields(v: PettyExpenseWritable) {
  return {
    date: v.date,
    employee_id: v.employeeId,
    amount: v.amount,
    expense_type: v.expenseType,
    expense_mode: v.expenseMode,
    project_id: v.projectId || null,
    float_id: v.floatId || null,
    notes: v.notes || null,
    item_name: v.itemName || null,
    quantity: v.quantity ?? null,
    unit_price: v.unitPrice ?? null,
    vendor: v.vendor || null,
    vendor_id: v.vendorId || null,
    bill_number: v.billNumber || null,
    attachments: v.attachments ?? null,
    inventory_item_id: v.inventoryItemId || null,
    added_to_inventory: v.addedToInventory ?? null,
    machine_id: v.machineId || null,
    service_type: v.serviceType || null,
    vehicle_expense_type: v.vehicleExpenseType || null,
    service_provider_type: v.serviceProviderType || null,
    pickup_location: v.pickupLocation || null,
    drop_location: v.dropLocation || null,
    recovered_in_salary_payment_id: v.recoveredInSalaryPaymentId || null,
  };
}

export async function createPettyExpenseRemote(
  item: PettyExpenseWritable,
): Promise<WriteResult<PettyExpense>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("petty_expenses")
    .insert(toPettyExpenseFields(item))
    .select(PETTY_EXPENSE_COLUMNS)
    .single();

  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: transformPettyExpenseRow(data as unknown as PettyExpenseRow),
  };
}

// Float Settlement's "Purchased Items" flow creates several PettyExpense
// rows in one user action - a single bulk INSERT keeps that atomic at
// the network-call level and lets the AFTER INSERT trigger recompute the
// linked float exactly once per row, same net effect as the old local
// addPettyExpensesBatch's single-state-update.
export async function createPettyExpensesBatchRemote(
  items: PettyExpenseWritable[],
): Promise<WriteResult<PettyExpense[]>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  if (items.length === 0) return { status: "success", data: [] };

  const { data, error } = await gate.client
    .from("petty_expenses")
    .insert(items.map(toPettyExpenseFields))
    .select(PETTY_EXPENSE_COLUMNS);

  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: ((data as unknown as PettyExpenseRow[]) ?? []).map(
      transformPettyExpenseRow,
    ),
  };
}

export async function updatePettyExpenseRemote(
  item: PettyExpenseWritable & { id: string },
): Promise<WriteResult<PettyExpense>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("petty_expenses")
    .update(toPettyExpenseFields(item))
    .eq("id", item.id)
    .select(PETTY_EXPENSE_COLUMNS);

  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as PettyExpenseRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: transformPettyExpenseRow(rows[0]) };
}

export async function deletePettyExpenseRemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("petty_expenses")
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
