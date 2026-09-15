// Phase 2 — Conversion/Application Layer (backend only, see chat).
// Thin wrappers over the three atomic conversion RPCs added in
// supabase/migrations/20260915120000_document_conversion_rpcs.sql
// (convert_quotation_to_dc / convert_quotation_to_invoice /
// convert_dc_to_invoice). Same shape as every other RPC wrapper in this
// codebase (settleExpenseFloatRemote, recordMaterialPurchase, etc.):
// call .rpc(), map errors, then re-fetch the created row through the
// existing hydration columns/transform so callers get back exactly the
// same shape createInvoiceRemote/createDeliveryChallanRemote already
// return — no parallel type, no parallel fetch shape.
//
// Not wired into any UI yet (out of scope this phase) — these are pure
// service-layer primitives for the future "Create From" UI to call.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { DeliveryChallan, InvLineItem, Invoice } from "@/types";
import {
  DELIVERY_CHALLAN_COLUMNS,
  INVOICE_COLUMNS,
  INVOICE_ITEM_COLUMNS,
  INVOICE_PO_COLUMNS,
  transformDeliveryChallanRow,
  transformInvoiceRow,
} from "./hydration";
import type { DeliveryChallanRow, InvoiceRow } from "./hydration";

export type ConversionErrorCategory =
  | "permission_denied"
  | "not_found"
  | "insufficient_quantity"
  | "invalid_quantity"
  | "invalid_input"
  | "duplicate_conversion"
  | "unexpected";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface ConversionResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
  errorCategory?: ConversionErrorCategory;
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

// The three RPCs raise with a stable "category: message" prefix for
// every explicit check they do themselves (see the migration's own
// declared categories); the two Phase 1 triggers this session already
// shipped (check_quotation_remaining/check_dc_remaining) were NOT
// modified to match that convention (out of scope — Phase 1 migration
// is frozen), so their distinct wording is pattern-matched here instead
// of requiring a schema change to unify it.
function categorizeError(message: string): ConversionErrorCategory {
  const prefixMatch = message.match(
    /^(permission_denied|not_found|invalid_quantity|invalid_input|duplicate_conversion):/,
  );
  if (prefixMatch) return prefixMatch[1] as ConversionErrorCategory;
  if (
    message.includes("over-consumption") ||
    message.includes("over-invoicing")
  ) {
    return "insufficient_quantity";
  }
  return "unexpected";
}

function stripCategoryPrefix(message: string): string {
  return message.replace(
    /^(permission_denied|not_found|invalid_quantity|invalid_input|duplicate_conversion):\s*/,
    "",
  );
}

export interface QuotationToDcInput {
  quotationId: string;
  quantity: number;
  dispatchDate?: string;
  receiverName?: string;
  status?: DeliveryChallan["status"];
  dispatchMethod?: DeliveryChallan["dispatchMethod"];
  vehicleNo?: string;
  driverName?: string;
  items?: DeliveryChallan["items"];
}

export async function convertQuotationToDcRemote(
  input: QuotationToDcInput,
): Promise<ConversionResult<DeliveryChallan>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data: dcId, error: rpcError } = await gate.client.rpc(
    "convert_quotation_to_dc",
    {
      p_quotation_id: input.quotationId,
      p_quantity: input.quantity,
      p_dispatch_date: input.dispatchDate || undefined,
      p_receiver_name: input.receiverName ?? "",
      p_status: input.status ?? "Prepared",
      p_dispatch_method: input.dispatchMethod || null,
      p_vehicle_no: input.vehicleNo || null,
      p_driver_name: input.driverName || null,
      p_items: input.items ?? [],
    },
  );
  if (rpcError) {
    return {
      status: "error",
      error: stripCategoryPrefix(rpcError.message),
      errorCategory: categorizeError(rpcError.message),
    };
  }

  const { data, error } = await gate.client
    .from("delivery_challans")
    .select(DELIVERY_CHALLAN_COLUMNS)
    .eq("id", dcId as string)
    .single();
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: transformDeliveryChallanRow(data as unknown as DeliveryChallanRow),
  };
}

async function fetchFullInvoice(
  client: ReturnType<typeof getSupabase>,
  invoiceId: string,
): Promise<ConversionResult<Invoice>> {
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

export interface QuotationToInvoiceInput {
  quotationId: string;
  quantity: number;
  lineItems: Pick<InvLineItem, "desc" | "hsn" | "qty" | "rate">[];
  cgstRate?: number;
  sgstRate?: number;
  igstRate?: number;
  invoiceDate?: string;
  paymentTerms?: string;
  invoiceType?: "tax" | "proforma";
  termsAndConditions?: string;
}

export async function convertQuotationToInvoiceRemote(
  input: QuotationToInvoiceInput,
): Promise<ConversionResult<Invoice>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data: invoiceId, error: rpcError } = await gate.client.rpc(
    "convert_quotation_to_invoice",
    {
      p_quotation_id: input.quotationId,
      p_quantity: input.quantity,
      p_line_items: input.lineItems,
      p_cgst_rate: input.cgstRate ?? 9,
      p_sgst_rate: input.sgstRate ?? 9,
      p_igst_rate: input.igstRate ?? 0,
      p_invoice_date: input.invoiceDate || undefined,
      p_payment_terms: input.paymentTerms ?? "30 days",
      p_invoice_type: input.invoiceType ?? "tax",
      p_terms_and_conditions: input.termsAndConditions ?? null,
    },
  );
  if (rpcError) {
    return {
      status: "error",
      error: stripCategoryPrefix(rpcError.message),
      errorCategory: categorizeError(rpcError.message),
    };
  }

  return fetchFullInvoice(gate.client, invoiceId as string);
}

export interface DcAllocation {
  deliveryChallanId: string;
  quantity: number;
}

export interface DcToInvoiceInput {
  dcs: DcAllocation[];
  lineItems: Pick<InvLineItem, "desc" | "hsn" | "qty" | "rate">[];
  cgstRate?: number;
  sgstRate?: number;
  igstRate?: number;
  invoiceDate?: string;
  paymentTerms?: string;
  invoiceType?: "tax" | "proforma";
  termsAndConditions?: string;
}

// Phase 3 — UI layer read-only helpers. Never cached, never trusted as
// authoritative: computed live from the same source-of-truth the Phase 1
// triggers themselves use (quotations.line_items / delivery_challans.
// project_entries for totals, the lineage tables for consumption), every
// time a conversion dialog opens. The database (via the RPCs' own
// triggers) remains the only real enforcement point — this is purely for
// showing the user a number before they submit, so they aren't guessing.
export interface RemainingQuantity {
  total: number;
  consumed: number;
  remaining: number;
}

function sumJsonbQty(rows: unknown, key: string): number {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((sum: number, row) => {
    const v = (row as Record<string, unknown>)?.[key];
    return sum + (typeof v === "number" ? v : Number(v) || 0);
  }, 0);
}

export async function getQuotationRemainingRemote(
  quotationId: string,
): Promise<ConversionResult<RemainingQuantity>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data: qt, error: qtError } = await gate.client
    .from("quotations")
    .select("line_items")
    .eq("id", quotationId)
    .single();
  if (qtError) return { status: "error", error: qtError.message };

  const total = sumJsonbQty(qt?.line_items, "qty");

  const [dcqRes, qiRes] = await Promise.all([
    gate.client
      .from("delivery_challan_quotations")
      .select("quantity")
      .eq("quotation_id", quotationId),
    gate.client
      .from("quotation_invoices")
      .select("quantity")
      .eq("quotation_id", quotationId),
  ]);
  if (dcqRes.error) return { status: "error", error: dcqRes.error.message };
  if (qiRes.error) return { status: "error", error: qiRes.error.message };

  const consumed =
    (dcqRes.data ?? []).reduce((s, r) => s + Number(r.quantity), 0) +
    (qiRes.data ?? []).reduce((s, r) => s + Number(r.quantity), 0);

  return {
    status: "success",
    data: { total, consumed, remaining: total - consumed },
  };
}

export async function getDcRemainingRemote(
  dcId: string,
): Promise<ConversionResult<RemainingQuantity>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data: dc, error: dcError } = await gate.client
    .from("delivery_challans")
    .select("project_entries")
    .eq("id", dcId)
    .single();
  if (dcError) return { status: "error", error: dcError.message };

  const total = sumJsonbQty(dc?.project_entries, "dispatchQty");

  const { data: idc, error: idcError } = await gate.client
    .from("invoice_delivery_challans")
    .select("quantity")
    .eq("delivery_challan_id", dcId);
  if (idcError) return { status: "error", error: idcError.message };

  const consumed = (idc ?? []).reduce((s, r) => s + Number(r.quantity), 0);

  return {
    status: "success",
    data: { total, consumed, remaining: total - consumed },
  };
}

export async function convertDcToInvoiceRemote(
  input: DcToInvoiceInput,
): Promise<ConversionResult<Invoice>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data: invoiceId, error: rpcError } = await gate.client.rpc(
    "convert_dc_to_invoice",
    {
      p_dc_ids: input.dcs.map((d) => d.deliveryChallanId),
      p_quantities: input.dcs.map((d) => d.quantity),
      p_line_items: input.lineItems,
      p_cgst_rate: input.cgstRate ?? 9,
      p_sgst_rate: input.sgstRate ?? 9,
      p_igst_rate: input.igstRate ?? 0,
      p_invoice_date: input.invoiceDate || undefined,
      p_payment_terms: input.paymentTerms ?? "30 days",
      p_invoice_type: input.invoiceType ?? "tax",
      p_terms_and_conditions: input.termsAndConditions ?? null,
    },
  );
  if (rpcError) {
    return {
      status: "error",
      error: stripCategoryPrefix(rpcError.message),
      errorCategory: categorizeError(rpcError.message),
    };
  }

  return fetchFullInvoice(gate.client, invoiceId as string);
}
