// Production Material Transactions — persistence layer for
// production_material_transactions (database/20260925110000). Sibling to
// productionStageLinesApi.ts (same WriteResult contract, same
// session-gate pattern). The database is the sole authority for stock
// mutation, negative-stock protection, vendor/in-house consistency,
// organization isolation, and performed_by — this module only ever
// inserts a row and reads rows back. It never computes, decrements, or
// increments inventory_items.current_stock itself, and never sends
// performed_by/performed_by_name/organization_id (all three are
// server-set, ignored or overwritten by the DB trigger even if sent).
//
// No update/delete function exists here on purpose — the table is
// append-only (no UPDATE/DELETE RLS policy for the authenticated role),
// confirmed live during this feature's own database testing.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { ProductionMaterialTransaction } from "@/types";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

interface ProductionMaterialTransactionRow {
  id: string;
  stage_id: string | null;
  job_card_id: string | null;
  operation: string;
  performer_type: "inhouse" | "vendor";
  vendor_id: string | null;
  vendor_name: string | null;
  input_item_id: string | null;
  input_qty: number | null;
  input_uom: string | null;
  output_item_id: string;
  output_qty: number;
  output_uom: string;
  rejected_qty: number;
  notes: string | null;
  performed_by: string | null;
  performed_by_name: string | null;
  event_time: string;
  created_at: string;
}

const COLUMNS =
  "id, stage_id, job_card_id, operation, performer_type, vendor_id, vendor_name, " +
  "input_item_id, input_qty, input_uom, output_item_id, output_qty, output_uom, " +
  "rejected_qty, notes, performed_by, performed_by_name, event_time, created_at";

function rowToTransaction(
  row: ProductionMaterialTransactionRow,
): ProductionMaterialTransaction {
  return {
    id: row.id,
    stageId: row.stage_id ?? undefined,
    jobCardId: row.job_card_id ?? undefined,
    operation: row.operation,
    performerType: row.performer_type,
    vendorId: row.vendor_id ?? undefined,
    vendorName: row.vendor_name ?? undefined,
    inputItemId: row.input_item_id ?? undefined,
    inputQty: row.input_qty ?? undefined,
    inputUom: row.input_uom ?? undefined,
    outputItemId: row.output_item_id,
    outputQty: row.output_qty,
    outputUom: row.output_uom,
    rejectedQty: row.rejected_qty,
    notes: row.notes ?? undefined,
    performedBy: row.performed_by ?? undefined,
    performedByName: row.performed_by_name ?? undefined,
    eventTime: row.event_time,
    createdAt: row.created_at,
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

/** Recent transactions, newest first. Scoped by projectId's own stage
 * set when provided (joins through stage_id) — omit to fetch every
 * transaction the caller's RLS can see (already org-scoped server-side). */
export async function fetchProductionMaterialTransactions(
  stageIds?: string[],
): Promise<WriteResult<ProductionMaterialTransaction[]>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  let query = gate.client
    .from("production_material_transactions")
    .select(COLUMNS)
    .order("created_at", { ascending: false });

  if (stageIds && stageIds.length > 0) {
    query = query.in("stage_id", stageIds);
  }

  const { data, error } = await query;
  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as ProductionMaterialTransactionRow[]).map(
      rowToTransaction,
    ),
  };
}

export async function createProductionMaterialTransactionRemote(input: {
  stageId?: string;
  jobCardId?: string;
  operation: string;
  performerType: "inhouse" | "vendor";
  vendorId?: string;
  vendorName?: string;
  inputItemId?: string;
  inputQty?: number;
  inputUom?: string;
  outputItemId: string;
  outputQty: number;
  outputUom: string;
  rejectedQty?: number;
  notes?: string;
  eventTime?: string;
}): Promise<WriteResult<ProductionMaterialTransaction>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("production_material_transactions")
    .insert({
      stage_id: input.stageId || null,
      job_card_id: input.jobCardId || null,
      operation: input.operation,
      performer_type: input.performerType,
      vendor_id: input.vendorId || null,
      vendor_name: input.vendorName || null,
      input_item_id: input.inputItemId || null,
      input_qty: input.inputQty ?? null,
      input_uom: input.inputUom || null,
      output_item_id: input.outputItemId,
      output_qty: input.outputQty,
      output_uom: input.outputUom,
      rejected_qty: input.rejectedQty ?? 0,
      notes: input.notes || null,
      event_time: input.eventTime || new Date().toISOString(),
      // performed_by/performed_by_name intentionally omitted — the DB
      // trigger overwrites whatever is sent here with auth.uid() and
      // the caller's own profiles.username, so there is nothing for
      // the client to correctly supply.
    })
    .select(COLUMNS)
    .single();

  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: rowToTransaction(data as unknown as ProductionMaterialTransactionRow),
  };
}
