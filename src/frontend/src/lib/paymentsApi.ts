// Phase 27 Batch 5 — Payments write persistence layer.
//
// Only create exists - confirmed via repo-wide grep, `updatePayment`/
// `deletePayment` do not exist anywhere in store.ts or any page (no UI,
// no store action). Nothing invented here beyond what the app already
// does.
//
// Two DB triggers fire on payments INSERT: trg_overpayment (BEFORE
// INSERT, raises a Postgres exception - not RLS - if this payment would
// exceed the invoice's total_amount) and update_invoice_status() (AFTER
// INSERT, recomputes invoices.status from SUM(payments.amount) vs
// total_amount). Neither trigger maintains invoices.paid_amount - Phase
// 9's own migration doc confirms it is frontend-written, not
// trigger-derivable - so this file explicitly recomputes and writes it
// (SUM of all payments for the invoice, a real DB round-trip, not a
// locally-incremented guess) immediately after the payment insert
// succeeds, then re-fetches the invoice so the caller gets the
// trigger-computed status and the just-written paid_amount together in
// one authoritative row - replacing the old inline
// `updateInvoice({...inv, paidAmount: newPaid, status})` local patch in
// Payments.tsx, which becomes dead code.
//
// The client-side overpayment pre-check in Payments.tsx (fast UX
// feedback) is preserved as-is; this layer additionally surfaces
// trg_overpayment's Postgres exception as a normal WriteResult error for
// the case a pre-check races a concurrent tab/session.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { Invoice, Payment } from "@/types";
import {
  INVOICE_COLUMNS,
  INVOICE_ITEM_COLUMNS,
  PAYMENT_COLUMNS,
  transformInvoiceRow,
  transformPaymentRow,
} from "./hydration";
import type { InvoiceRow, PaymentRow } from "./hydration";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

export type PaymentWritable = Omit<Payment, "id" | "createdAt">;

function toPaymentFields(v: PaymentWritable) {
  return {
    invoice_id: v.invoiceId,
    amount: v.amount,
    payment_date: v.paymentDate || null,
    mode: v.mode,
    reference_no: v.referenceNo || null,
    notes: v.notes || null,
    files: v.files ?? [],
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

export interface CreatePaymentResult {
  payment: Payment;
  invoice: Invoice;
}

export async function createPaymentRemote(
  p: PaymentWritable,
): Promise<WriteResult<CreatePaymentResult>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data: paymentData, error: paymentError } = await gate.client
    .from("payments")
    .insert(toPaymentFields(p))
    .select(PAYMENT_COLUMNS)
    .single();

  if (paymentError) {
    // trg_overpayment raises a plain Postgres exception (not RLS) when
    // this payment would exceed the invoice's remaining balance -
    // surfaced here exactly like every other thrown-error case already
    // handled elsewhere in this migration (e.g. inventory_usages' stock
    // check).
    return { status: "error", error: paymentError.message };
  }

  const payment = transformPaymentRow(paymentData as unknown as PaymentRow);

  // paid_amount is not trigger-maintained - recompute it as a real SUM
  // over the DB's own payments rows (authoritative, not a local guess),
  // then write it explicitly.
  const { data: sumRows, error: sumError } = await gate.client
    .from("payments")
    .select("amount")
    .eq("invoice_id", p.invoiceId);
  if (sumError) return { status: "error", error: sumError.message };
  const paidAmount = ((sumRows as { amount: number }[]) ?? []).reduce(
    (sum, row) => sum + (row.amount ?? 0),
    0,
  );

  const { error: updateError } = await gate.client
    .from("invoices")
    .update({ paid_amount: paidAmount })
    .eq("id", p.invoiceId);
  if (updateError) return { status: "error", error: updateError.message };

  const { data: invoiceData, error: invoiceError } = await gate.client
    .from("invoices")
    .select(`${INVOICE_COLUMNS}, invoice_items(${INVOICE_ITEM_COLUMNS})`)
    .eq("id", p.invoiceId)
    .single();
  if (invoiceError) return { status: "error", error: invoiceError.message };

  return {
    status: "success",
    data: {
      payment,
      invoice: transformInvoiceRow(invoiceData as unknown as InvoiceRow),
    },
  };
}
