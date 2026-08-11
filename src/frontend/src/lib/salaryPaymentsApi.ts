// Phase 27 Batch 1 — Salary Payments write persistence layer. Create
// only - store.ts exposes no update/delete for SalaryPayment (payments
// are immutable once recorded, matching the existing UI's one-way
// "Record Salary Payment" flow).

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { SalaryPayment } from "@/types";
import { SALARY_PAYMENT_COLUMNS, transformSalaryPaymentRow } from "./hydration";
import type { SalaryPaymentRow } from "./hydration";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

function toSalaryPaymentFields(v: Omit<SalaryPayment, "id">) {
  return {
    employee_id: v.employeeId,
    month: v.month,
    amount: v.amount,
    payment_date: v.paymentDate,
    notes: v.notes || null,
    original_salary: v.originalSalary ?? null,
    deducted_advance: v.deductedAdvance ?? null,
    final_paid_amount: v.finalPaidAmount ?? null,
    advance_deductions: v.advanceDeductions ?? null,
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

export async function createSalaryPaymentRemote(
  payment: Omit<SalaryPayment, "id">,
): Promise<WriteResult<SalaryPayment>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { data, error } = await gate.client
    .from("salary_payments")
    .insert(toSalaryPaymentFields(payment))
    .select(SALARY_PAYMENT_COLUMNS)
    .single();
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: transformSalaryPaymentRow(data as unknown as SalaryPaymentRow),
  };
}
