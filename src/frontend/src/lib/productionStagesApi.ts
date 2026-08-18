// Phase 45 — Production Stage persistence layer (closes the "Production
// Stage Completions" local-only exception). Sibling to lib/machinesApi.ts
// (this module's template — same WriteResult contract, same RLS
// asymmetric-UPDATE/DELETE handling, same "row transform lives in the API
// file, column list lives in hydration.ts" split).
//
// A project's stage set is always saved as a whole (matches the frontend's
// existing local semantics — store.ts's upsertProjectProduction/
// updateProjectStagesV2 always replace ProjectProduction.stages in full).
// Doing that against Supabase as separate delete+insert calls would be
// non-atomic, so every write here goes through the single
// upsert_project_production_stages() RPC (database/phase-45) instead —
// one network round-trip, one transaction, upserts every stage BY ITS
// EXISTING stageId (never drop-and-regenerate), removes only stages no
// longer present. See that migration file's header for the full rationale.
//
// production_stage_transactions (the independent Send/Receive ledger) is
// NOT part of that reconciliation — it's append-only and written
// incrementally via recordStageTransactionRemote, one call per
// send/receive event, matching store.ts's addStageTransaction action.
//
// Every ProjectProductionStage MUST already carry a stable stageId before
// it reaches this file (store.ts's migrateProjectProductionStageIds
// backfills this for every local stage — Phase 32 Task #173, already
// shipped). A stage missing one is a pre-existing invariant violation,
// not something this file silently papers over — it's skipped and logged,
// never assigned a fresh id here (that would break referential continuity
// with the QMS-gate tables, which already point at the existing stageId
// space).

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type {
  ProjectProduction,
  ProjectProductionStage,
  ProjectStageStatus,
  StageTransaction,
} from "@/types";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

export interface ProjectProductionStageRow {
  id: string;
  project_id: string;
  stage_name: string;
  position: number;
  status: string;
  notes: string | null;
  requires_material_tracking: boolean;
  sent_qty: number | null;
  received_qty: number | null;
  ok_qty: number | null;
  rejected_qty: number | null;
  is_rework: boolean;
  reference_stage_id: string | null;
  rework_stage_name: string | null;
  sent_to_vendor_id: string | null;
  sent_to_vendor_name: string | null;
  sent_date_time: string | null;
  received_date_time: string | null;
  rework_qty: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProductionStageTransactionRow {
  id: string;
  stage_id: string;
  type: "send" | "receive";
  quantity: number;
  event_time: string;
  vendor_id: string | null;
  vendor_name: string | null;
  created_at: string;
}

// Reconstructs one stage. `transactions` is deliberately not filled in
// here — production_stage_transactions is a separate table, joined and
// attached by the caller (hydration.ts's hydrateProjectProductionStages,
// which fetches both tables and groups transactions onto their stage).
export function rowToProjectProductionStage(
  row: ProjectProductionStageRow,
): ProjectProductionStage {
  return {
    stageName: row.stage_name,
    status: row.status as ProjectStageStatus,
    notes: row.notes ?? "",
    quantitySent: row.sent_qty ?? 0,
    sentDateTime: row.sent_date_time ?? "",
    sentToVendorId: row.sent_to_vendor_id ?? "",
    sentToVendorName: row.sent_to_vendor_name ?? "",
    receivedQuantity: row.received_qty ?? 0,
    receivedDateTime: row.received_date_time ?? "",
    // Dead fields (zero read usage anywhere, confirmed via grep before
    // this migration) — never persisted, always reconstructed empty.
    startTime: "",
    endTime: "",
    requiresMaterialTracking: row.requires_material_tracking,
    transactions: [],
    stageId: row.id,
    sentQty: row.sent_qty ?? undefined,
    receivedQty: row.received_qty ?? undefined,
    okQty: row.ok_qty ?? undefined,
    rejectedQty: row.rejected_qty ?? undefined,
    reworkQty: row.rework_qty ?? undefined,
    isRework: row.is_rework,
    referenceId: row.reference_stage_id ?? undefined,
    reworkStage: row.rework_stage_name ?? undefined,
  };
}

export function rowToStageTransaction(
  row: ProductionStageTransactionRow,
): StageTransaction {
  return {
    id: row.id,
    type: row.type,
    quantity: row.quantity,
    dateTime: row.event_time,
    sentToVendorId: row.vendor_id ?? undefined,
    sentToVendorName: row.vendor_name ?? undefined,
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// sentToVendorId's local convention is "vendor id, or the literal string
// 'inhouse'" (see types.ts's own comment on ProjectProductionStage) — only
// a real UUID can be written to the FK column; "inhouse" (or anything
// else non-UUID) is dropped here and carried by sent_to_vendor_name alone,
// which already holds the human-readable "In-house" label.
function sanitizeVendorId(v: string | undefined): string | null {
  return v && UUID_RE.test(v) ? v : null;
}

function toStageJsonField(stage: ProjectProductionStage, position: number) {
  return {
    id: stage.stageId,
    stage_name: stage.stageName,
    position,
    status: stage.status,
    notes: stage.notes || null,
    requires_material_tracking: stage.requiresMaterialTracking ?? false,
    // v2 field wins when present; legacy field is the fallback — same
    // underlying fact, dual frontend names for pre/post-Phase-15 data.
    sent_qty: stage.sentQty ?? stage.quantitySent ?? null,
    received_qty: stage.receivedQty ?? stage.receivedQuantity ?? null,
    ok_qty: stage.okQty ?? null,
    rejected_qty: stage.rejectedQty ?? null,
    is_rework: stage.isRework ?? false,
    reference_stage_id: stage.referenceId || null,
    rework_stage_name: stage.reworkStage || null,
    sent_to_vendor_id: sanitizeVendorId(stage.sentToVendorId),
    sent_to_vendor_name: stage.sentToVendorName || null,
    sent_date_time: stage.sentDateTime || null,
    received_date_time: stage.receivedDateTime || null,
    rework_qty: stage.reworkQty ?? null,
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

// Atomic whole-set reconciliation — see file header. Silently drops (with
// a console warning, not a thrown error — one bad stage shouldn't block
// saving the rest of a project's legitimate stages) any stage missing a
// stageId, since the RPC requires an id for every element.
export async function upsertProjectionStagesRemote(
  projectId: string,
  stages: ProjectProductionStage[],
): Promise<WriteResult<ProjectProductionStage[]>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const payload = stages
    .map((s, i) => ({ stage: s, position: i }))
    .filter(({ stage }) => {
      if (!stage.stageId) {
        console.error(
          `[productionStagesApi] stage "${stage.stageName}" has no stageId — skipped, not persisted to Supabase. This indicates migrateProjectProductionStageIds did not run for this stage.`,
        );
        return false;
      }
      return true;
    })
    .map(({ stage, position }) => toStageJsonField(stage, position));

  const { data, error } = await gate.client.rpc(
    "upsert_project_production_stages",
    { p_project_id: projectId, p_stages: payload },
  );

  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: (data as unknown as ProjectProductionStageRow[]).map(
      rowToProjectProductionStage,
    ),
  };
}

// Deletes every stage for a project via the same atomic path (empty
// incoming set = "remove everything currently present").
export async function deleteProjectStagesRemote(
  projectId: string,
): Promise<WriteResult<never>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { error } = await gate.client.rpc("upsert_project_production_stages", {
    p_project_id: projectId,
    p_stages: [],
  });
  if (error) return { status: "error", error: error.message };
  return { status: "success" };
}

// Append-only — one call per send/receive event, matching store.ts's
// addStageTransaction. Independent of the stage-set reconciliation above
// (Phase 11 Part 5's own design: no relation to outsourced_works or
// inventory_usages, deliberately not re-litigated here).
export async function recordStageTransactionRemote(
  stageId: string,
  tx: Omit<StageTransaction, "id">,
): Promise<WriteResult<StageTransaction>> {
  const gate = await requireSession();
  if (!gate.ok) return gate.result;

  const { data, error } = await gate.client
    .from("production_stage_transactions")
    .insert({
      stage_id: stageId,
      type: tx.type,
      quantity: tx.quantity,
      event_time: tx.dateTime,
      vendor_id: sanitizeVendorId(tx.sentToVendorId),
      vendor_name: tx.sentToVendorName || null,
    })
    .select(
      "id, stage_id, type, quantity, event_time, vendor_id, vendor_name, created_at",
    )
    .single();

  if (error) return { status: "error", error: error.message };
  return {
    status: "success",
    data: rowToStageTransaction(
      data as unknown as ProductionStageTransactionRow,
    ),
  };
}

// Migration-only: pushes one local ProjectProduction's whole stage set
// through the same atomic upsert path, preserving every stageId exactly.
// See lib/productionStagesMigration.ts for the one-time IndexedDB/
// localStorage -> Supabase import flow this exists for.
export async function migrateProjectProductionRemote(
  production: ProjectProduction,
): Promise<WriteResult<ProjectProductionStage[]>> {
  return upsertProjectionStagesRemote(
    production.projectId,
    production.stages || [],
  );
}
