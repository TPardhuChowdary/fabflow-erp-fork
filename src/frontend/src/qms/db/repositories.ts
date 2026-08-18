// Phase 48 — the 7 Characteristic Library IndexedDB repo exports this file
// used to hold (processRepo, operationRepo, inspectionMethodRepo,
// characteristicRepo, templateRepo, favoriteRepo, inspectionStageRepo)
// were removed here. Discovery (Phase 48 audit) confirmed they were
// already 100% dead: qms/api/index.ts has been Supabase-backed for these
// 6 domains since Phase 15 (manufacturing_processes, operations,
// inspection_methods, quality_characteristics, qms_templates,
// qms_favorites), and inspection_stage_definitions has been Supabase-
// backed since the same phase via qms/api/inspections.ts's
// getInspectionStages(). qms/store/useQmsStore.ts — the only store any
// Characteristic Library page reads from — has only ever imported
// `qms/api` (Supabase), never this file, for those 7 entities. A repo-
// wide grep for every one of the 7 export names, and a live check of
// this browser's actual IndexedDB store row counts (all 0), confirmed
// zero live consumers and zero at-risk local data before removal. The
// sibling file that only existed to seed these dead repos
// (qms/db/seed.ts) was deleted for the same reason — it was never
// imported by anything either.
//
// qms/db/database.ts's store definitions for these 7 entities are left
// untouched (structural IndexedDB schema, not business-data code) —
// removing them isn't necessary now that nothing writes to or reads from
// them, and leaving the schema in place costs nothing.

import {
  inspectionDocumentRepoSupabase,
  inspectionHistoryRepoSupabase,
  inspectionSheetRepoSupabase,
  inspectionStageCompletionRepoSupabase,
  inspectionStageEntryRepoSupabase,
} from "@/lib/qmsInspectionWorkflowApi";

// ── Phase 2 — Inspection Sheets ──────────────────────────────────
// The five per-sheet workflow entities (Sheet, StageEntry,
// StageCompletion, Document, History) are Phase 46 — Supabase-backed via
// lib/qmsInspectionWorkflowApi.ts, exported here under their original
// names so qms/api/inspections.ts (the sole consumer) needed zero
// changes: it only ever calls the shared Repository method shape, never
// IndexedDB directly.

export const inspectionSheetRepo = inspectionSheetRepoSupabase;
export const inspectionStageEntryRepo = inspectionStageEntryRepoSupabase;
export const inspectionStageCompletionRepo =
  inspectionStageCompletionRepoSupabase;
export const inspectionDocumentRepo = inspectionDocumentRepoSupabase;
export const inspectionHistoryRepo = inspectionHistoryRepoSupabase;
