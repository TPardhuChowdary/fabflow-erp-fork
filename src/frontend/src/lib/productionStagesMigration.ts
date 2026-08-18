// Phase 45 — one-time local (Zustand/localStorage) -> Supabase migration
// tool for Production Stages. User-triggered only (Settings -> Backup &
// Restore area, mirroring lib/machinesMigration.ts); never runs
// automatically. Local state is never written to or cleared by this file,
// even after a fully successful migration - it stays a dormant backup.
//
// Unlike machinesMigration.ts (per-machine upsert with an existence
// pre-check), this migrates per-PROJECT: each ProjectProduction's whole
// stage set goes through upsertProjectionStagesRemote() - the same atomic
// RPC every regular save now uses - which is already upsert-by-id
// internally, so no separate "already migrated" pre-check is needed here;
// re-running this tool for an already-migrated project is a safe no-op
// (every stage upserts to the same row, same data).
//
// Safety properties:
// - stageIds are preserved exactly (every local stage already carries a
//   stable stageId - Phase 32 Task #173 - so upsertProjectionStagesRemote
//   writes them unchanged, never regenerated).
// - organization_id is never guessed or passed in - it comes from the
//   table's own `default current_organization_id()`.
// - Every project's outcome (migrated / failed + why) is reported
//   individually - nothing is silently dropped.

import { upsertProjectionStagesRemote } from "@/lib/productionStagesApi";
import { getSupabase } from "@/lib/supabaseClient";
import type { ProjectProduction } from "@/types";

export type ProductionMigrationItemStatus = "migrated" | "failed";

export interface ProductionMigrationItemResult {
  projectId: string;
  label: string;
  status: ProductionMigrationItemStatus;
  stageCount: number;
  error?: string;
}

export interface ProductionMigrationReport {
  startedAt: string;
  finishedAt: string;
  productions: ProductionMigrationItemResult[];
}

export async function migrateProjectProductionsToSupabase(
  localProductions: ProjectProduction[],
  onProgress?: (message: string) => void,
): Promise<ProductionMigrationReport> {
  const client = getSupabase();
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) {
    throw new Error(
      "Not signed in — sign in before migrating local production stage data.",
    );
  }

  const startedAt = new Date().toISOString();
  const report: ProductionMigrationReport = {
    startedAt,
    finishedAt: "",
    productions: [],
  };

  for (const p of localProductions) {
    const stageCount = (p.stages || []).length;
    const label = `Project ${p.projectId} (${stageCount} stage${stageCount === 1 ? "" : "s"})`;
    onProgress?.(label);
    if (stageCount === 0) continue; // nothing to migrate for this project

    const result = await upsertProjectionStagesRemote(
      p.projectId,
      p.stages || [],
    );
    if (result.status === "success") {
      report.productions.push({
        projectId: p.projectId,
        label,
        status: "migrated",
        stageCount,
      });
    } else {
      report.productions.push({
        projectId: p.projectId,
        label,
        status: "failed",
        stageCount,
        error: result.error ?? `status: ${result.status}`,
      });
    }
  }

  report.finishedAt = new Date().toISOString();
  return report;
}
