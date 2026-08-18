// Phase 46 — one-time local (IndexedDB) -> Supabase migration tool for the
// full QMS Inspection workflow (Sheet, StageEntry, StageCompletion,
// Document, History). User-triggered only (Settings -> Backup & Restore
// area, mirroring lib/machinesMigration.ts / lib/productionStagesMigration.ts);
// never runs automatically. Local IndexedDB data is never written to or
// cleared by this file, even after a fully successful migration.
//
// Reads directly from fresh IndexedDB Repository instances constructed
// here — NOT from qms/db/repositories.ts's exports, since Phase 46
// repointed those 5 names at Supabase (see that file's own comment). This
// is the one place in the codebase still allowed to touch the old
// IndexedDB stores directly, precisely because migrating away from them
// is this file's entire purpose.
//
// Order matters: sheets are migrated first (every other table's sheet_id
// is a real FK to inspection_sheets), then entries/completions/documents/
// history in any order — none of the four reference each other.
//
// Idempotent: every write goes through the same upsert-by-id path used by
// regular saves, so re-running this tool for already-migrated data simply
// re-writes identical values - safe to retry after a partial failure.
// Documents are the one entity where a failure is independently possible
// per-item (Storage upload can fail separately from the metadata write),
// so they get their own itemized report exactly like the other two
// migration tools' per-item results.

import { QMS_STORES } from "@/qms/db/database";
import { Repository } from "@/qms/db/repository";
import type {
  InspectionDocument,
  InspectionHistoryEvent,
  InspectionSheet,
  InspectionStageCompletion,
  InspectionStageEntry,
} from "@/qms/types";
import {
  inspectionDocumentRepoSupabase,
  inspectionHistoryRepoSupabase,
  inspectionSheetRepoSupabase,
  inspectionStageCompletionRepoSupabase,
  inspectionStageEntryRepoSupabase,
} from "./qmsInspectionWorkflowApi";
import { getSupabase } from "./supabaseClient";

// Fresh, direct IndexedDB access — deliberately bypasses qms/db/repositories.ts.
const localSheetRepo = new Repository<InspectionSheet>(
  QMS_STORES.inspectionSheets,
);
const localStageEntryRepo = new Repository<InspectionStageEntry>(
  QMS_STORES.inspectionStageEntries,
);
const localStageCompletionRepo = new Repository<InspectionStageCompletion>(
  QMS_STORES.inspectionStageCompletions,
);
const localDocumentRepo = new Repository<InspectionDocument>(
  QMS_STORES.inspectionDocuments,
);
const localHistoryRepo = new Repository<InspectionHistoryEvent>(
  QMS_STORES.inspectionHistory,
);

export type QmsMigrationItemStatus = "migrated" | "failed";

export interface QmsMigrationItemResult {
  id: string;
  label: string;
  status: QmsMigrationItemStatus;
  error?: string;
}

export interface QmsInspectionMigrationReport {
  startedAt: string;
  finishedAt: string;
  sheets: QmsMigrationItemResult[];
  stageEntries: QmsMigrationItemResult[];
  stageCompletions: QmsMigrationItemResult[];
  documents: QmsMigrationItemResult[];
  history: QmsMigrationItemResult[];
}

async function migrateAll<T extends { id: string }>(
  localItems: T[],
  label: (item: T) => string,
  put: (item: T) => Promise<unknown>,
  onProgress?: (message: string) => void,
): Promise<QmsMigrationItemResult[]> {
  const results: QmsMigrationItemResult[] = [];
  for (const item of localItems) {
    const itemLabel = label(item);
    onProgress?.(itemLabel);
    try {
      await put(item);
      results.push({ id: item.id, label: itemLabel, status: "migrated" });
    } catch (e) {
      results.push({
        id: item.id,
        label: itemLabel,
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return results;
}

export async function migrateQmsInspectionsToSupabase(
  onProgress?: (message: string) => void,
): Promise<QmsInspectionMigrationReport> {
  const client = getSupabase();
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) {
    throw new Error(
      "Not signed in — sign in before migrating local QMS inspection data.",
    );
  }

  const startedAt = new Date().toISOString();

  const [
    localSheets,
    localStageEntries,
    localStageCompletions,
    localDocuments,
    localHistory,
  ] = await Promise.all([
    localSheetRepo.getAll(),
    localStageEntryRepo.getAll(),
    localStageCompletionRepo.getAll(),
    localDocumentRepo.getAll(),
    localHistoryRepo.getAll(),
  ]);

  // Sheets first — every other table's sheet_id FK depends on the sheet
  // row already existing.
  const sheets = await migrateAll(
    localSheets,
    (s) => `${s.inspectionNumber} (rev ${s.revision})`,
    (s) => inspectionSheetRepoSupabase.put(s),
    onProgress,
  );

  const stageEntries = await migrateAll(
    localStageEntries,
    (e) => `Entry ${e.characteristicId} (stage ${e.stageId})`,
    (e) => inspectionStageEntryRepoSupabase.put(e),
    onProgress,
  );

  const stageCompletions = await migrateAll(
    localStageCompletions,
    (c) => `Completion for stage ${c.stageId}`,
    (c) => inspectionStageCompletionRepoSupabase.put(c),
    onProgress,
  );

  // Documents: the local IndexedDB row still carries `.blob` (a real
  // Blob) — inspectionDocumentRepoSupabase.put() uploads it to Storage as
  // part of the same write, exactly like a fresh upload would.
  const documents = await migrateAll(
    localDocuments,
    (d) => d.fileName,
    (d) => inspectionDocumentRepoSupabase.put(d),
    onProgress,
  );

  const history = await migrateAll(
    localHistory,
    (h) => `${h.action} — ${new Date(h.at).toLocaleString()}`,
    (h) => inspectionHistoryRepoSupabase.put(h),
    onProgress,
  );

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    sheets,
    stageEntries,
    stageCompletions,
    documents,
    history,
  };
}
