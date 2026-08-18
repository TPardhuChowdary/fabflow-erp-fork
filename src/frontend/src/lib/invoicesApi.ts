// Phase 27 Batch 5 — Invoices write persistence layer.
//
// invoice_items is a real decomposed table (Option A, confirmed via Phase
// 26 preflight E-1 and Phase 9's own committed migration doc). Every
// create/update replaces the full invoice_items set for the invoice
// (delete-all + sequential re-insert), mirroring the frontend's existing
// mental model of lineItems as a single whole-array field. Items are
// inserted one at a time (not a single bulk array) so each row's
// created_at is a distinct, increasing timestamp - the only way to
// preserve line-item order, since invoice_items has no explicit ordering
// column.
//
// invoices.total_amount is trigger-owned (update_invoice_total(), fires on
// invoice_items INSERT/UPDATE) - never trusted from the locally-sent
// payload; always re-fetched after the items write completes.
// invoices.status is trigger-owned by update_invoice_status() (fires on
// payments INSERT/UPDATE only) - untouched by anything in this file except
// updateInvoiceStatusRemote(), which mirrors the existing manual-override
// "Update Status" UI action (Invoices.tsx's updateStatus, independent of
// payment-driven status changes, preserved exactly as today).
// invoices.paid_amount is explicitly NOT trigger-derived (confirmed by
// Phase 9's own migration doc) - maintained by paymentsApi.ts instead.
//
// Excluded from InvoiceWritable (confirmed dead / not DB columns):
// bankDetails, termsAndConditions (zero write-side usage - always
// settings-driven at print time), invoiceNumber (UI-form-only duplicate of
// invNo), soId (zero occurrences anywhere in Invoices.tsx/Payments.tsx/
// store.ts, same dead-legacy-field shape as DeliveryChallan.soId/.jobId).
//
// No numbering race: inv_no carries no UNIQUE constraint (confirmed, same
// as dc_no) - the existing local duplicate-scan guard in Invoices.tsx is
// preserved exactly as today's soft, unenforced guard.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { InvLineItem, Invoice } from "@/types";
import {
  INVOICE_COLUMNS,
  INVOICE_ITEM_COLUMNS,
  transformInvoiceRow,
} from "./hydration";
import type { InvoiceRow } from "./hydration";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

export type InvoiceWritable = Omit<
  Invoice,
  | "id"
  | "createdAt"
  | "soId"
  | "invoiceNumber"
  | "bankDetails"
  | "termsAndConditions"
>;

function toInvoiceFields(v: InvoiceWritable) {
  return {
    inv_no: v.invNo,
    dc_id: v.dcId || null,
    customer_id: v.customerId,
    project_id: v.projectId || null,
    subtotal: v.subtotal,
    cgst_rate: v.cgstRate,
    sgst_rate: v.sgstRate,
    igst_rate: v.igstRate,
    cgst_amt: v.cgstAmt,
    sgst_amt: v.sgstAmt,
    igst_amt: v.igstAmt,
    total_amount: v.totalAmount,
    invoice_date: v.invoiceDate || null,
    due_date: v.dueDate || null,
    payment_terms: v.paymentTerms,
    status: v.status,
    paid_amount: v.paidAmount,
    delivery_vehicle_no: v.deliveryVehicleNo || null,
    delivery_destination: v.deliveryDestination || null,
    po_number: v.poNumber || null,
    po_date: v.poDate || null,
    buyer_gstin: v.buyerGstin || null,
    buyer_address: v.buyerAddress || null,
    buyer_state_name: v.buyerStateName || null,
    buyer_state_code: v.buyerStateCode || null,
    invoice_type: v.invoiceType ?? "tax",
    reminder_enabled: v.reminderEnabled ?? true,
    reminder_interval_days: v.reminderIntervalDays ?? 5,
    reminder_frequency_days: v.reminderFrequencyDays ?? 5,
    next_reminder_at: v.nextReminderAt || null,
    last_reminder_sent_at: v.lastReminderSentAt ?? null,
    reminder_count: v.reminderCount ?? 0,
    next_reminder_custom_date: v.nextReminderCustomDate ?? null,
    selected_email: v.selectedEmail || null,
  };
}

function toInvoiceItemFields(item: InvLineItem, invoiceId: string) {
  return {
    invoice_id: invoiceId,
    description: item.desc,
    hsn: item.hsn,
    quantity: item.qty,
    price: item.rate,
    project_id: item.projectId || null,
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

// Deletes every invoice_items row for this invoice, then sequentially
// re-inserts the given items (one insert per item, not a single bulk
// array) so line-item order survives via increasing created_at values.
async function replaceInvoiceItems(
  client: any,
  invoiceId: string,
  items: InvLineItem[],
): Promise<{ error?: string }> {
  const { error: delError } = await client
    .from("invoice_items")
    .delete()
    .eq("invoice_id", invoiceId);
  if (delError) return { error: delError.message };

  for (const item of items) {
    const { error: insError } = await client
      .from("invoice_items")
      .insert(toInvoiceItemFields(item, invoiceId));
    if (insError) return { error: insError.message };
  }
  return {};
}

async function fetchFullInvoice(
  client: any,
  invoiceId: string,
): Promise<WriteResult<Invoice>> {
  const { data, error } = await client
    .from("invoices")
    .select(`${INVOICE_COLUMNS}, invoice_items(${INVOICE_ITEM_COLUMNS})`)
    .eq("id", invoiceId)
    .single();
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: transformInvoiceRow(data as unknown as InvoiceRow),
  };
}

export async function createInvoiceRemote(
  inv: InvoiceWritable,
): Promise<WriteResult<Invoice>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("invoices")
    .insert(toInvoiceFields(inv))
    .select("id")
    .single();

  if (error) return { status: "error", error: error.message };
  const invoiceId = (data as { id: string }).id;

  for (const item of inv.lineItems) {
    const { error: itemError } = await gate.client
      .from("invoice_items")
      .insert(toInvoiceItemFields(item, invoiceId));
    if (itemError) {
      // Best-effort cleanup - remove the now-orphaned/partial invoice
      // (CASCADE removes any items already inserted) rather than leaving
      // a stray empty invoice behind.
      await gate.client.from("invoices").delete().eq("id", invoiceId);
      return { status: "error", error: itemError.message };
    }
  }

  return fetchFullInvoice(gate.client, invoiceId);
}

export async function updateInvoiceRemote(
  inv: InvoiceWritable & { id: string },
): Promise<WriteResult<Invoice>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("invoices")
    .update(toInvoiceFields(inv))
    .eq("id", inv.id)
    .select("id");

  if (error) return { status: "error", error: error.message };
  const rows = (data as { id: string }[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }

  const itemsResult = await replaceInvoiceItems(
    gate.client,
    inv.id,
    inv.lineItems,
  );
  if (itemsResult.error) {
    return { status: "error", error: itemsResult.error };
  }

  return fetchFullInvoice(gate.client, inv.id);
}

// Scalar-only status update, mirroring Invoices.tsx's existing manual
// "Update Status" action - independent of, and does not touch,
// invoice_items. Does not go through the full updateInvoiceRemote path
// since that would needlessly delete/re-insert every line item just to
// change one or two columns. `clearReminderEnabled` preserves the
// existing behavior of turning reminders off when a user manually marks
// an invoice Paid (Invoices.tsx's updateStatus).
export async function updateInvoiceStatusRemote(
  id: string,
  status: Invoice["status"],
  clearReminderEnabled = false,
): Promise<WriteResult<Invoice>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const fields: { status: Invoice["status"]; reminder_enabled?: boolean } = {
    status,
  };
  if (clearReminderEnabled) fields.reminder_enabled = false;

  const { data, error } = await gate.client
    .from("invoices")
    .update(fields)
    .eq("id", id)
    .select("id");

  if (error) return { status: "error", error: error.message };
  const rows = (data as { id: string }[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }

  return fetchFullInvoice(gate.client, id);
}

// Scalar-only reminder-field patch, mirroring Payments.tsx's existing
// reminder-tracking call sites (send reminder, change frequency, set a
// custom next-reminder date) - none of these touch invoice_items, so this
// avoids the full updateInvoiceRemote replace-all-items path.
export async function updateInvoiceReminderRemote(
  id: string,
  fields: Partial<{
    reminderEnabled: boolean;
    reminderIntervalDays: number;
    reminderFrequencyDays: number;
    nextReminderAt: string | null;
    lastReminderSentAt: string | null;
    reminderCount: number;
    nextReminderCustomDate: string | null;
  }>,
): Promise<WriteResult<Invoice>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const dbFields: Record<string, unknown> = {};
  if (fields.reminderEnabled !== undefined)
    dbFields.reminder_enabled = fields.reminderEnabled;
  if (fields.reminderIntervalDays !== undefined)
    dbFields.reminder_interval_days = fields.reminderIntervalDays;
  if (fields.reminderFrequencyDays !== undefined)
    dbFields.reminder_frequency_days = fields.reminderFrequencyDays;
  if (fields.nextReminderAt !== undefined)
    dbFields.next_reminder_at = fields.nextReminderAt;
  if (fields.lastReminderSentAt !== undefined)
    dbFields.last_reminder_sent_at = fields.lastReminderSentAt;
  if (fields.reminderCount !== undefined)
    dbFields.reminder_count = fields.reminderCount;
  if (fields.nextReminderCustomDate !== undefined)
    dbFields.next_reminder_custom_date = fields.nextReminderCustomDate;

  const { data, error } = await gate.client
    .from("invoices")
    .update(dbFields)
    .eq("id", id)
    .select("id");

  if (error) return { status: "error", error: error.message };
  const rows = (data as { id: string }[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }

  return fetchFullInvoice(gate.client, id);
}

export async function deleteInvoiceRemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("invoices")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) return { status: "error", error: error.message };
  const rows = (data as { id: string }[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was deleted (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success" };
}
