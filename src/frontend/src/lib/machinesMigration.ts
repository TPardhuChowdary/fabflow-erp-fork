// Phase 35 — one-time local (Zustand/localStorage) -> Supabase migration
// tool for the Machinery module. User-triggered only (Settings -> Backup &
// Restore area, mirroring the Drawing Repository migration at
// drawingEditor/lib/migrateToSupabase.ts); never runs automatically. Local
// state is never written to or cleared by this file, even after a fully
// successful migration - it stays a dormant backup.
//
// Safety properties (load-bearing, per the approved plan's explicit
// data-preservation requirement):
// - IDs are preserved exactly: every local Machine.id is already a
//   crypto.randomUUID() (see store.ts addMachine call sites), so the
//   `machines` table's `uuid primary key` accepts existing local ids
//   unchanged - no regeneration, no re-linking needed elsewhere.
// - Idempotent + safely retryable: every machine is checked against what
//   already exists in Supabase (by id) before writing; already-migrated
//   ids are reported "already_migrated" and left untouched - never
//   re-inserted, never duplicated. A prior partial/failed run can always
//   be re-run.
// - organization_id is never guessed or passed in - it comes from the
//   table's own `default current_organization_id()`, resolved server-side
//   from whoever is currently signed in.
// - Every machine's outcome (migrated / already migrated / failed + why)
//   is reported individually - nothing is silently dropped.

import { upsertMachineRemote } from "@/lib/machinesApi";
import { getSupabase } from "@/lib/supabaseClient";
import type { Machine } from "@/types";

export type MigrationItemStatus = "migrated" | "already_migrated" | "failed";

export interface MachineMigrationItemResult {
  id: string;
  label: string;
  status: MigrationItemStatus;
  error?: string;
}

export interface MachineMigrationReport {
  startedAt: string;
  finishedAt: string;
  machines: MachineMigrationItemResult[];
}

export async function migrateMachinesToSupabase(
  localMachines: Machine[],
  onProgress?: (message: string) => void,
): Promise<MachineMigrationReport> {
  const client = getSupabase();
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) {
    throw new Error(
      "Not signed in — sign in before migrating local machine data.",
    );
  }

  const startedAt = new Date().toISOString();
  const report: MachineMigrationReport = {
    startedAt,
    finishedAt: "",
    machines: [],
  };

  const { data: existingRows, error: existingErr } = await client
    .from("machines")
    .select("id");
  if (existingErr) {
    throw new Error(
      `Failed to check already-migrated machines: ${existingErr.message}`,
    );
  }
  const existingIds = new Set(
    ((existingRows as { id: string }[]) ?? []).map((r) => r.id),
  );

  for (const m of localMachines) {
    const label = `${m.machineCode} — ${m.name}`;
    onProgress?.(label);
    if (existingIds.has(m.id)) {
      report.machines.push({ id: m.id, label, status: "already_migrated" });
      continue;
    }
    const result = await upsertMachineRemote(m);
    if (result.status === "success") {
      report.machines.push({ id: m.id, label, status: "migrated" });
    } else {
      report.machines.push({
        id: m.id,
        label,
        status: "failed",
        error: result.error ?? `status: ${result.status}`,
      });
    }
  }

  report.finishedAt = new Date().toISOString();
  return report;
}
