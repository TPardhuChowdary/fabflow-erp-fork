import type {
  InspectionDocument,
  InspectionHistoryEvent,
  InspectionMethod,
  InspectionSheet,
  InspectionStageCompletion,
  InspectionStageDefinition,
  InspectionStageEntry,
  ManufacturingProcess,
  Operation,
  QmsFavorite,
  QmsTemplate,
  QualityCharacteristic,
} from "../types";
import { QMS_STORES } from "./database";
import { Repository } from "./repository";

export const processRepo = new Repository<ManufacturingProcess>(
  QMS_STORES.processes,
);
export const operationRepo = new Repository<Operation>(QMS_STORES.operations);
export const inspectionMethodRepo = new Repository<InspectionMethod>(
  QMS_STORES.inspectionMethods,
);
export const characteristicRepo = new Repository<QualityCharacteristic>(
  QMS_STORES.characteristics,
);
export const templateRepo = new Repository<QmsTemplate>(QMS_STORES.templates);
export const favoriteRepo = new Repository<QmsFavorite>(QMS_STORES.favorites);

// ── Phase 2 — Inspection Sheets ──────────────────────────────────

export const inspectionStageRepo = new Repository<InspectionStageDefinition>(
  QMS_STORES.inspectionStages,
);
export const inspectionSheetRepo = new Repository<InspectionSheet>(
  QMS_STORES.inspectionSheets,
);
export const inspectionStageEntryRepo = new Repository<InspectionStageEntry>(
  QMS_STORES.inspectionStageEntries,
);
export const inspectionStageCompletionRepo =
  new Repository<InspectionStageCompletion>(
    QMS_STORES.inspectionStageCompletions,
  );
export const inspectionDocumentRepo = new Repository<InspectionDocument>(
  QMS_STORES.inspectionDocuments,
);
export const inspectionHistoryRepo = new Repository<InspectionHistoryEvent>(
  QMS_STORES.inspectionHistory,
);
