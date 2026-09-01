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
// Phase D.1 - inv_no now carries a real UNIQUE (organization_id, inv_no)
// constraint (see database/phase-d1/), mirroring uq_delivery_challans_org_dcno
// (Phase C.1) exactly. createInvoiceRemote below bounded-retries on a 23505
// conflict against that constraint specifically, re-deriving the candidate
// from fresh server state on conflict, never from stale local state, never
// by re-invoking any local counter - same pattern as
// createDeliveryChallanRemote (lib/deliveryChallansApi.ts),
// createProjectRemote (lib/projectsApi.ts), and createQuotationRemote
// (lib/quotationsApi.ts). autoRenumberOnConflict controls whether a
// conflict is silently retried with a fresh number (auto-generated
// candidates - the Agent, or an untouched UI preview) or surfaced as a
// plain error (a user explicitly typed a specific number in Invoices.tsx's
// editable Invoice Number field - same user-editable-number wrinkle dc_no
// had, so silently substituting a different one would be wrong there too).
// Only the invoice-row insert is retried; the line-items insert loop
// (and its existing best-effort orphan cleanup) runs unchanged once a
// candidate succeeds.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { InvLineItem, Invoice, InvoicePurchaseOrder } from "@/types";
import {
  INVOICE_COLUMNS,
  INVOICE_ITEM_COLUMNS,
  INVOICE_PO_COLUMNS,
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

// Same INV-YYYY-NNN format as Invoices.tsx's own previewInvNo() - mirrors
// that exact existing client-side computation rather than inventing a new
// numbering scheme. Pure calculation over supplied existing numbers, never
// a local counter. Used by createInvoiceRemote to compute a fresh
// candidate after an inv_no collision (see header comment).
export function computeNextInvNumber(existingInvNumbers: string[]): string {
  const year = new Date().getFullYear();
  const nums = existingInvNumbers.map((n) => {
    const m = (n || "").match(/INV-\d{4}-(\d+)/);
    return m ? Number.parseInt(m[1], 10) : 0;
  });
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `INV-${year}-${String(next).padStart(3, "0")}`;
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

// Invoice multi-PO feature (see chat) — Phase 48.
function toInvoicePOFields(po: InvoicePurchaseOrder, invoiceId: string) {
  return {
    invoice_id: invoiceId,
    quotation_purchase_order_id: po.quotationPurchaseOrderId || null,
    po_number: po.poNumber,
    po_date: po.poDate || null,
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

// Invoice multi-PO feature (see chat) — Phase 48. Same delete-all +
// sequential re-insert pattern as replaceInvoiceItems above, for exactly
// the same reason (order preserved via increasing created_at; no
// explicit ordering column on invoice_purchase_orders either).
async function replaceInvoicePurchaseOrders(
  client: any,
  invoiceId: string,
  purchaseOrders: InvoicePurchaseOrder[],
): Promise<{ error?: string }> {
  const { error: delError } = await client
    .from("invoice_purchase_orders")
    .delete()
    .eq("invoice_id", invoiceId);
  if (delError) return { error: delError.message };

  for (const po of purchaseOrders) {
    const { error: insError } = await client
      .from("invoice_purchase_orders")
      .insert(toInvoicePOFields(po, invoiceId));
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
    .select(
      `${INVOICE_COLUMNS}, invoice_items(${INVOICE_ITEM_COLUMNS}), invoice_purchase_orders(${INVOICE_PO_COLUMNS})`,
    )
    .eq("id", invoiceId)
    .single();
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: transformInvoiceRow(data as unknown as InvoiceRow),
  };
}

async function fetchExistingInvNumbers(
  client: ReturnType<typeof getSupabase>,
): Promise<string[] | null> {
  const { data, error } = await client.from("invoices").select("inv_no");
  if (error || !data) return null;
  return (data as unknown as { inv_no: string | null }[]).map(
    (r) => r.inv_no ?? "",
  );
}

// Postgres unique_violation on uq_invoices_org_invno specifically - same
// check shape as isDcNumberConflict/isProjectNumberConflict/isQtNumberConflict.
function isInvNumberConflict(error: { code?: string; message?: string }) {
  return (
    error.code === "23505" &&
    (error.message?.includes("uq_invoices_org_invno") ||
      error.message?.includes("inv_no"))
  );
}

const MAX_INV_NUMBER_ATTEMPTS = 3;

export async function createInvoiceRemote(
  inv: InvoiceWritable,
  options?: { autoRenumberOnConflict?: boolean },
): Promise<WriteResult<Invoice>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;
  const { client } = gate;
  const autoRenumberOnConflict = options?.autoRenumberOnConflict ?? true;

  let candidate = inv;
  let invoiceId: string | null = null;

  for (let attempt = 1; attempt <= MAX_INV_NUMBER_ATTEMPTS; attempt++) {
    const { data, error } = await client
      .from("invoices")
      .insert(toInvoiceFields(candidate))
      .select("id")
      .single();

    if (!error) {
      invoiceId = (data as { id: string }).id;
      break;
    }

    if (!isInvNumberConflict(error)) {
      return { status: "error", error: error.message };
    }

    if (!autoRenumberOnConflict || attempt === MAX_INV_NUMBER_ATTEMPTS) {
      return {
        status: "error",
        error: `Invoice number ${candidate.invNo} already exists. Please use a different number.`,
      };
    }

    // Collision on inv_no specifically - re-derive the next number from
    // actual server state (never from stale local state, never by
    // re-invoking computeNextInvNumber's caller) and retry.
    const freshNumbers = await fetchExistingInvNumbers(client);
    if (freshNumbers === null) {
      return {
        status: "error",
        error: `Invoice number ${candidate.invNo} already exists. Please use a different number.`,
      };
    }
    candidate = { ...candidate, invNo: computeNextInvNumber(freshNumbers) };
  }

  if (invoiceId === null) {
    return {
      status: "error",
      error:
        "This invoice number was just used by another session. Please try saving again.",
    };
  }

  for (const item of candidate.lineItems) {
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

  for (const po of candidate.purchaseOrders ?? []) {
    const { error: poError } = await gate.client
      .from("invoice_purchase_orders")
      .insert(toInvoicePOFields(po, invoiceId));
    if (poError) {
      await gate.client.from("invoices").delete().eq("id", invoiceId);
      return { status: "error", error: poError.message };
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

  const poResult = await replaceInvoicePurchaseOrders(
    gate.client,
    inv.id,
    inv.purchaseOrders ?? [],
  );
  if (poResult.error) {
    return { status: "error", error: poResult.error };
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
