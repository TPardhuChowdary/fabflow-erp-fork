// Phase 37 — Tools write persistence layer. Sibling to lib/machinesApi.ts
// (this module's template — same WriteResult contract, same remote-first
// discipline, same RLS asymmetric-UPDATE/DELETE handling described
// there). Tools is a net-new Supabase-backed module (public.tools, see
// database/phase-37) - there is no local-only predecessor to migrate,
// unlike Machinery.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type {
  MachineCondition,
  Tool,
  ToolAssignmentHistory,
  ToolStatus,
} from "@/types";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

interface ToolRow {
  id: string;
  tool_code: string;
  name: string;
  category: string | null;
  quantity: number;
  location: string | null;
  assigned_employee_id: string | null;
  condition: string | null;
  status: string;
  purchase_date: string | null;
  replacement_value: number | null;
  notes: string | null;
  photo_data: string | null;
  purchase_vendor_id: string | null;
  purchase_vendor_name: string | null;
  source_company_po_item_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// assignedEmployeeName is resolved client-side from the employees list
// (no DB join here) - same reasoning as every other *Name convenience
// field in this codebase (e.g. Machine.purchaseVendorName).
export function rowToTool(row: ToolRow): Tool {
  return {
    id: row.id,
    toolCode: row.tool_code,
    name: row.name,
    category: row.category ?? undefined,
    quantity: row.quantity,
    location: row.location ?? undefined,
    assignedEmployeeId: row.assigned_employee_id ?? undefined,
    condition: (row.condition as MachineCondition | null) ?? undefined,
    status: row.status as ToolStatus,
    purchaseDate: row.purchase_date ?? undefined,
    replacementValue: row.replacement_value ?? undefined,
    notes: row.notes ?? undefined,
    photoData: row.photo_data ?? undefined,
    purchaseVendorId: row.purchase_vendor_id ?? undefined,
    purchaseVendorName: row.purchase_vendor_name ?? undefined,
    sourceCompanyPoItemId: row.source_company_po_item_id ?? undefined,
    isActive: row.is_active,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

function toToolFields(t: Omit<Tool, "id" | "assignedEmployeeName">) {
  return {
    tool_code: t.toolCode,
    name: t.name,
    category: t.category ?? null,
    quantity: t.quantity,
    location: t.location ?? null,
    assigned_employee_id: t.assignedEmployeeId ?? null,
    condition: t.condition ?? null,
    status: t.status,
    purchase_date: t.purchaseDate ?? null,
    replacement_value: t.replacementValue ?? null,
    notes: t.notes ?? null,
    photo_data: t.photoData ?? null,
    purchase_vendor_id: t.purchaseVendorId ?? null,
    purchase_vendor_name: t.purchaseVendorName ?? null,
    source_company_po_item_id: t.sourceCompanyPoItemId ?? null,
    is_active: t.isActive,
  };
}

const SELECT_COLUMNS =
  "id, tool_code, name, category, quantity, location, assigned_employee_id, " +
  "condition, status, purchase_date, replacement_value, notes, photo_data, " +
  "purchase_vendor_id, purchase_vendor_name, " +
  "source_company_po_item_id, is_active, created_at, updated_at";

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

export async function createToolRemote(
  tool: Omit<Tool, "id" | "assignedEmployeeName">,
): Promise<WriteResult<Tool>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("tools")
    .insert(toToolFields(tool))
    .select(SELECT_COLUMNS)
    .single();

  if (error) return { status: "error", error: error.message };
  return { status: "success", data: rowToTool(data as unknown as ToolRow) };
}

export async function updateToolRemote(
  tool: Omit<Tool, "assignedEmployeeName">,
): Promise<WriteResult<Tool>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("tools")
    .update(toToolFields(tool))
    .eq("id", tool.id)
    .select(SELECT_COLUMNS);

  if (error) return { status: "error", error: error.message };
  const rows = (data as unknown as ToolRow[]) ?? [];
  if (rows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }
  return { status: "success", data: rowToTool(rows[0]) };
}

export async function deleteToolRemote(
  id: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("tools")
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

// ── tool_assignment_history (insert-only, mirrors
// machine_service_rate_history's shape/discipline exactly - see
// database/phase-43) ─────────────────────────────────────────────

interface ToolAssignmentHistoryRow {
  id: string;
  tool_id: string;
  employee_id: string | null;
  action: string;
  notes: string | null;
  recorded_by: string | null;
  recorded_at: string;
  created_at: string;
}

// employeeName is resolved client-side from the employees list, same as
// every other *Name convenience field in this codebase.
export function rowToToolAssignmentHistory(
  row: ToolAssignmentHistoryRow,
): ToolAssignmentHistory {
  return {
    id: row.id,
    toolId: row.tool_id,
    employeeId: row.employee_id ?? undefined,
    action: row.action as "issued" | "returned",
    notes: row.notes ?? undefined,
    recordedBy: row.recorded_by ?? undefined,
    recordedAt: new Date(row.recorded_at).getTime(),
    createdAt: new Date(row.created_at).getTime(),
  };
}

const HISTORY_COLUMNS =
  "id, tool_id, employee_id, action, notes, recorded_by, recorded_at, created_at";

// Issue a tool to an employee: updates tools.assigned_employee_id (the
// live "current holder" scalar, unchanged from Phase 37) and inserts one
// 'issued' history row. Also used to reassign/change-holder - issuing to
// a new employee while already assigned simply records a new 'issued'
// row; the previous holder's own 'issued' row stays in the log exactly
// as it is (never edited/deleted), and the newer row's later timestamp
// makes the handover unambiguous when read chronologically - the same
// discipline machine_service_rate_history uses for rate changes.
export async function issueToolRemote(
  toolId: string,
  employeeId: string,
  notes?: string,
): Promise<WriteResult<{ tool: Tool; history: ToolAssignmentHistory }>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data: toolData, error: toolError } = await gate.client
    .from("tools")
    .update({ assigned_employee_id: employeeId })
    .eq("id", toolId)
    .select(SELECT_COLUMNS);
  if (toolError) return { status: "error", error: toolError.message };
  const toolRows = (toolData as unknown as ToolRow[]) ?? [];
  if (toolRows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }

  const {
    data: { user },
  } = await gate.client.auth.getUser();
  const { data: historyData, error: historyError } = await gate.client
    .from("tool_assignment_history")
    .insert({
      tool_id: toolId,
      employee_id: employeeId,
      action: "issued",
      notes: notes ?? null,
      recorded_by: user?.id ?? null,
    })
    .select(HISTORY_COLUMNS)
    .single();
  if (historyError) return { status: "error", error: historyError.message };

  return {
    status: "success",
    data: {
      tool: rowToTool(toolRows[0]),
      history: rowToToolAssignmentHistory(
        historyData as unknown as ToolAssignmentHistoryRow,
      ),
    },
  };
}

// Return a tool: clears tools.assigned_employee_id back to unassigned
// and inserts one 'returned' history row (employee_id null - see schema
// header).
export async function returnToolRemote(
  toolId: string,
  notes?: string,
): Promise<WriteResult<{ tool: Tool; history: ToolAssignmentHistory }>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data: toolData, error: toolError } = await gate.client
    .from("tools")
    .update({ assigned_employee_id: null })
    .eq("id", toolId)
    .select(SELECT_COLUMNS);
  if (toolError) return { status: "error", error: toolError.message };
  const toolRows = (toolData as unknown as ToolRow[]) ?? [];
  if (toolRows.length === 0) {
    return {
      status: "denied",
      error: "No row was updated (blocked by RLS, or the row does not exist)",
    };
  }

  const {
    data: { user },
  } = await gate.client.auth.getUser();
  const { data: historyData, error: historyError } = await gate.client
    .from("tool_assignment_history")
    .insert({
      tool_id: toolId,
      employee_id: null,
      action: "returned",
      notes: notes ?? null,
      recorded_by: user?.id ?? null,
    })
    .select(HISTORY_COLUMNS)
    .single();
  if (historyError) return { status: "error", error: historyError.message };

  return {
    status: "success",
    data: {
      tool: rowToTool(toolRows[0]),
      history: rowToToolAssignmentHistory(
        historyData as unknown as ToolAssignmentHistoryRow,
      ),
    },
  };
}
