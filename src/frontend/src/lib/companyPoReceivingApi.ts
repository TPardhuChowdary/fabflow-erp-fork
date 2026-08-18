// Phase 41 — Purchasing integration (§15/Task #211) write layer.
//
// Thin wrapper around the receive_company_po_item() RPC
// (database/phase-41/phase41_receive_company_po_item.sql). One call =
// one PO line received into Inventory/Tools (auto-create-or-link) or
// linked to an existing Machine/Die (or flagged pending_guided_creation
// when the caller has no id yet). The RPC returns the PO's full,
// already-updated items[] array; callers persist that straight into
// local store state - no separate re-fetch needed.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { CompanyPOItem, CompanyPOItemResourceType } from "@/types";

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
  return { ok: true as const, client };
}

interface ReceiveCompanyPoItemRow {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  resourceType?: string;
  resourceItemId?: string;
  pendingGuidedCreation?: boolean;
  receivedAt?: number;
}

function toCompanyPOItems(raw: unknown): CompanyPOItem[] {
  if (!Array.isArray(raw)) return [];
  return (raw as ReceiveCompanyPoItemRow[]).map((row) => ({
    id: row.id,
    description: row.description,
    quantity: row.quantity,
    unit: row.unit,
    rate: row.rate,
    amount: row.amount,
    resourceType: row.resourceType as CompanyPOItemResourceType | undefined,
    resourceItemId: row.resourceItemId,
    pendingGuidedCreation: row.pendingGuidedCreation,
    receivedAt: row.receivedAt,
  }));
}

export interface ReceiveCompanyPoItemParams {
  companyPoId: string;
  itemId: string;
  resourceType: CompanyPOItemResourceType;
  // Existing resource to link (Inventory/Tool/Machine/Die), or the id
  // of one just created via the guided-creation Add form. Omit to
  // auto-create (Inventory/Tool) or to flag pending_guided_creation
  // (Machine/Die).
  resourceItemId?: string;
  // Required only when creating a brand-new Tool with no
  // resourceItemId - the client-generated code from generateToolCode(),
  // the one and only authority for that sequence.
  newToolCode?: string;
}

// Receives one CompanyPO line item into Inventory, Tools, or links it
// to an existing/newly-created Machine or Die. Returns the PO's full
// updated items[] array on success.
export async function receiveCompanyPoItemRemote(
  params: ReceiveCompanyPoItemParams,
): Promise<WriteResult<CompanyPOItem[]>> {
  const auth = await requireSession();
  if (!auth.ok) return auth.result;

  const { data, error } = await auth.client.rpc("receive_company_po_item", {
    p_company_po_id: params.companyPoId,
    p_item_id: params.itemId,
    p_resource_type: params.resourceType,
    p_resource_item_id: params.resourceItemId ?? null,
    p_new_tool_code: params.newToolCode ?? null,
  });

  if (error) {
    if (error.code === "42501" || /permission denied/i.test(error.message)) {
      return { status: "denied", error: error.message };
    }
    return { status: "error", error: error.message };
  }

  return { status: "success", data: toCompanyPOItems(data) };
}
