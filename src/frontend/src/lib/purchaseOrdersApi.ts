// Phase 27 Batch 2 — MasterPO + QuotationPurchaseOrder +
// ProjectPurchaseOrder write persistence layer. These three tables are
// always written together (Quotations.tsx's "Record PO" flow creates one
// master_pos row, then one project_purchase_orders row per matched
// project, then one quotation_purchase_orders row), so they're batched
// in one module for the same cross-table-verification reason Batch 1
// batched project_bom_items+bom_requisitions.
//
// sharedPoId: confirmed no real DB gap (Phase 26 preflight) - the actual
// cross-table link is the real FK master_po_id. Every write function
// here returns the DB row shaped through hydration.ts's transforms,
// which already derive sharedPoId from master_po_id (or, for MasterPO
// itself, from its own id) - callers never fabricate a local id for it.
//
// No po_number uniqueness constraint exists on any of these three
// tables (confirmed via \d) - unlike qt_no/project_number/cpo_number,
// plain inserts need no bounded-retry numbering dance here.
//
// created_by (quotation_purchase_orders only): DB uuid FK to
// auth.users. Stamped with the real session user id unconditionally on
// create - same treatment as quotation_revisions.created_by.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { MasterPO, ProjectPO, QuotationPurchaseOrder } from "@/types";
import {
  MASTER_PO_COLUMNS,
  PROJECT_PURCHASE_ORDER_COLUMNS,
  QUOTATION_PURCHASE_ORDER_COLUMNS,
  transformMasterPORow,
  transformProjectPurchaseOrderRow,
  transformQuotationPurchaseOrderRow,
} from "./hydration";
import type {
  MasterPORow,
  ProjectPurchaseOrderRow,
  QuotationPurchaseOrderRow,
} from "./hydration";

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

// ── master_pos ──────────────────────────────────────────────────────

export type MasterPOWritable = Omit<
  MasterPO,
  "id" | "createdAt" | "sharedPoId"
>;

function toMasterPOFields(v: MasterPOWritable) {
  return {
    po_number: v.poNumber,
    po_date: v.poDate,
    customer_id: v.customerId,
    quotation_id: v.quotationId,
    files: v.files ?? [],
    status: v.status,
  };
}

export async function createMasterPORemote(
  po: MasterPOWritable,
): Promise<WriteResult<MasterPO>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("master_pos")
    .insert(toMasterPOFields(po))
    .select(MASTER_PO_COLUMNS)
    .single();

  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: transformMasterPORow(data as unknown as MasterPORow),
  };
}

export async function updateMasterPORemote(
  po: MasterPOWritable & { id: string },
): Promise<WriteResult<MasterPO>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("master_pos")
    .update(toMasterPOFields(po))
    .eq("id", po.id)
    .select(MASTER_PO_COLUMNS);

  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as MasterPORow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: transformMasterPORow(rows[0]) };
}

// RESTRICT from quotation_purchase_orders/project_purchase_orders - a
// master PO with recorded child PO records cannot be deleted. Same
// protective intent as the old local hasProjects check in store.ts's
// deleteMasterPO, now a real DB constraint on both children.
function isMasterPOHasChildren(error: { code?: string; message?: string }) {
  return (
    error.code === "23503" &&
    (error.message?.includes("quotation_purchase_orders") ||
      error.message?.includes("project_purchase_orders"))
  );
}

export async function deleteMasterPORemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("master_pos")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    if (isMasterPOHasChildren(error)) {
      return {
        status: "error",
        error: "Cannot delete PO. Linked project/quotation PO records exist.",
      };
    }
    return { status: "error", error: error.message };
  }
  const rows = (data as unknown as { id: string }[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was deleted (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success" };
}

// ── quotation_purchase_orders ──────────────────────────────────────

export type QuotationPurchaseOrderWritable = Omit<
  QuotationPurchaseOrder,
  "id" | "createdAt" | "createdBy" | "sharedPoId"
> & { masterPoId: string };

function toQuotationPurchaseOrderFields(v: QuotationPurchaseOrderWritable) {
  return {
    quotation_id: v.quotationId,
    revision_id: v.revisionId,
    master_po_id: v.masterPoId,
    po_number: v.poNumber,
    po_date: v.poDate,
    customer_id: v.customerId,
    files: v.files ?? [],
    remarks: v.remarks || null,
    status: v.status,
  };
}

export async function createQuotationPurchaseOrderRemote(
  po: QuotationPurchaseOrderWritable,
): Promise<WriteResult<QuotationPurchaseOrder>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("quotation_purchase_orders")
    .insert({
      ...toQuotationPurchaseOrderFields(po),
      created_by: gate.userId,
    })
    .select(QUOTATION_PURCHASE_ORDER_COLUMNS)
    .single();

  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: transformQuotationPurchaseOrderRow(
      data as unknown as QuotationPurchaseOrderRow,
    ),
  };
}

// ── project_purchase_orders ────────────────────────────────────────

export type ProjectPurchaseOrderWritable = Omit<
  ProjectPO,
  "id" | "sharedPoId"
> & { projectId: string; masterPoId: string };

function toProjectPurchaseOrderFields(v: ProjectPurchaseOrderWritable) {
  return {
    project_id: v.projectId,
    master_po_id: v.masterPoId,
    quotation_id: v.quotationId || null,
    po_number: v.poNumber,
    po_date: v.poDate,
    quantity: v.quantity,
    status: v.status,
    file: v.file || null,
  };
}

export async function createProjectPurchaseOrderRemote(
  po: ProjectPurchaseOrderWritable,
): Promise<WriteResult<{ projectId: string; po: ProjectPO }>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("project_purchase_orders")
    .insert(toProjectPurchaseOrderFields(po))
    .select(PROJECT_PURCHASE_ORDER_COLUMNS)
    .single();

  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: transformProjectPurchaseOrderRow(
      data as unknown as ProjectPurchaseOrderRow,
    ),
  };
}

// Status-only update - the live UI (ProjectDetail.tsx's
// handleUpdatePOStatus) only ever changes status after creation, never
// po_number/po_date/quantity/file.
export async function updateProjectPurchaseOrderStatusRemote(
  id: string,
  status: ProjectPO["status"],
): Promise<WriteResult<{ projectId: string; po: ProjectPO }>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("project_purchase_orders")
    .update({ status })
    .eq("id", id)
    .select(PROJECT_PURCHASE_ORDER_COLUMNS);

  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as ProjectPurchaseOrderRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return {
    status: "success",
    data: transformProjectPurchaseOrderRow(rows[0]),
  };
}
