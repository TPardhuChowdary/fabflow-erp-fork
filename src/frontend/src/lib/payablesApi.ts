// Phase M.1 — Payables write persistence layer. Sibling to every other
// <domain>Api.ts module in this codebase; same WriteResult contract, same
// requireSession() shape, same affected-row semantics for UPDATE/DELETE
// (never .single(), check rows.length).
//
// paid_amount is trigger-derived (trg_recompute_payable_paid_amount, see
// database/phase-m1/) — never sent on insert/update, always re-read from
// what the row actually has after a payment write.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { Payable, PayablePayment } from "@/types";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

interface PayableRow {
  id: string;
  vendor_name: string;
  payment_type: string;
  total_amount: number;
  paid_amount: number;
  due_date: string | null;
  vendor_id: string | null;
  project_id: string | null;
  company_po_id: string | null;
  notes: string | null;
  created_at: string;
}

function rowToPayable(row: PayableRow): Payable {
  return {
    id: row.id,
    vendorName: row.vendor_name,
    paymentType: row.payment_type,
    totalAmount: row.total_amount,
    paidAmount: row.paid_amount,
    dueDate: row.due_date ?? "",
    vendorId: row.vendor_id ?? undefined,
    projectId: row.project_id ?? undefined,
    companyPoId: row.company_po_id ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
  };
}

function toPayableFields(v: Omit<Payable, "id" | "createdAt" | "paidAmount">) {
  return {
    vendor_name: v.vendorName,
    payment_type: v.paymentType,
    total_amount: v.totalAmount,
    due_date: v.dueDate || null,
    vendor_id: v.vendorId || null,
    project_id: v.projectId || null,
    company_po_id: v.companyPoId || null,
    notes: v.notes || null,
  };
}

const PAYABLE_COLUMNS =
  "id, vendor_name, payment_type, total_amount, paid_amount, due_date, " +
  "vendor_id, project_id, company_po_id, notes, created_at";

interface PayablePaymentRow {
  id: string;
  payable_id: string;
  amount: number;
  payment_date: string;
  mode: string;
  reference_no: string | null;
  notes: string | null;
  attachment_ref: string | null;
  attachment_type: string | null;
  attachment_name: string | null;
  created_at: string;
}

function rowToPayablePayment(row: PayablePaymentRow): PayablePayment {
  return {
    id: row.id,
    payableId: row.payable_id,
    amount: row.amount,
    paymentDate: row.payment_date,
    mode: row.mode as PayablePayment["mode"],
    referenceNo: row.reference_no ?? "",
    notes: row.notes ?? "",
    attachmentRef: row.attachment_ref ?? undefined,
    attachmentType:
      (row.attachment_type as "image" | "pdf" | null) ?? undefined,
    attachmentName: row.attachment_name ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
  };
}

const PAYABLE_PAYMENT_COLUMNS =
  "id, payable_id, amount, payment_date, mode, reference_no, notes, " +
  "attachment_ref, attachment_type, attachment_name, created_at";

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

export async function createPayableRemote(
  payable: Omit<Payable, "id" | "createdAt" | "paidAmount">,
): Promise<WriteResult<Payable>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("payables")
    .insert(toPayableFields(payable))
    .select(PAYABLE_COLUMNS)
    .single();
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: rowToPayable(data as unknown as PayableRow),
  };
}

// Monster-1 — total_amount must never drop below what's already been
// paid (paid_amount is trigger-derived, see the module header): that
// state has no valid meaning (a payable can't owe less than what's
// already been received against it) and nothing downstream — the ledger,
// the balance display — is designed to represent it. There's no DB CHECK
// constraint for this (paid_amount only exists as a trigger output, not a
// column the constraint could reference declaratively without a
// migration), so it's enforced here, in the one function that can change
// total_amount, protecting every caller (Agent today, any future UI)
// rather than duplicated at each call site. paid_amount is re-read fresh
// right before the update — never trusted from the caller's payload
// (impossible anyway, see the Omit) or from any locally-cached value —
// since it can change between when a caller last saw it and now (e.g.
// another session recorded a payment). This is a check-then-write, not a
// single atomic statement; the window is small and this is a low-
// frequency, human-confirmed correction action, not a hot path.
export async function updatePayableRemote(
  payable: Omit<Payable, "createdAt" | "paidAmount">,
): Promise<WriteResult<Payable>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data: current, error: readError } = await gate.client
    .from("payables")
    .select("paid_amount")
    .eq("id", payable.id)
    .maybeSingle();
  if (readError) return { status: "error", error: readError.message };
  if (!current) {
    return { status: "denied", error: "Payable not found" };
  }
  const currentPaidAmount = (current as { paid_amount: number }).paid_amount;
  if (payable.totalAmount < currentPaidAmount) {
    return {
      status: "error",
      error: `New total (₹${payable.totalAmount.toLocaleString("en-IN")}) cannot be less than the amount already paid (₹${currentPaidAmount.toLocaleString("en-IN")}).`,
    };
  }

  const { data, error } = await gate.client
    .from("payables")
    .update(toPayableFields(payable))
    .eq("id", payable.id)
    .select(PAYABLE_COLUMNS);
  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as PayableRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: rowToPayable(rows[0]) };
}

export async function deletePayableRemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("payables")
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

// Re-reads the parent payable after a payment write so the caller gets the
// trigger-recomputed paid_amount, never a locally-guessed value.
export async function getPayableRemote(
  id: string,
): Promise<WriteResult<Payable>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("payables")
    .select(PAYABLE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) return { status: "error", error: error.message };
  if (!data) return { status: "denied", error: "Payable not found" };
  return {
    status: "success",
    data: rowToPayable(data as unknown as PayableRow),
  };
}

export async function createPayablePaymentRemote(
  payment: Omit<PayablePayment, "id" | "createdAt">,
): Promise<WriteResult<PayablePayment>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("payable_payments")
    .insert({
      payable_id: payment.payableId,
      amount: payment.amount,
      payment_date: payment.paymentDate,
      mode: payment.mode,
      reference_no: payment.referenceNo || null,
      notes: payment.notes || null,
      attachment_ref: payment.attachmentRef || null,
      attachment_type: payment.attachmentType || null,
      attachment_name: payment.attachmentName || null,
    })
    .select(PAYABLE_PAYMENT_COLUMNS)
    .single();
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: rowToPayablePayment(data as unknown as PayablePaymentRow),
  };
}

export async function deletePayablePaymentRemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("payable_payments")
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
