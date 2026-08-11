// Isolated IndexedDB database for the QMS module.
// Deliberately separate from the main ERP's localStorage["fabflow-erp-store"] —
// see QMS_ARCHITECTURE.md Section 1 for why (scale ceiling + module isolation).

const DB_NAME = "fabflow-qms";
// v2 (Phase 2): adds inspection sheet stores. Bumping this fires
// onupgradeneeded for browsers that already have v1 data — every block below
// is guarded by objectStoreNames.contains(), so re-running it against an
// existing v1 database is a no-op for the original 6 stores and only creates
// the new ones. No existing data is touched.
const DB_VERSION = 2;

export const QMS_STORES = {
  processes: "processes",
  operations: "operations",
  inspectionMethods: "inspectionMethods",
  characteristics: "characteristics",
  templates: "templates",
  favorites: "favorites",
  inspectionStages: "inspectionStages",
  inspectionSheets: "inspectionSheets",
  inspectionStageEntries: "inspectionStageEntries",
  inspectionStageCompletions: "inspectionStageCompletions",
  inspectionDocuments: "inspectionDocuments",
  inspectionHistory: "inspectionHistory",
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openQmsDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(QMS_STORES.processes)) {
        db.createObjectStore(QMS_STORES.processes, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(QMS_STORES.operations)) {
        const store = db.createObjectStore(QMS_STORES.operations, {
          keyPath: "id",
        });
        store.createIndex("processId", "processId");
      }

      if (!db.objectStoreNames.contains(QMS_STORES.inspectionMethods)) {
        db.createObjectStore(QMS_STORES.inspectionMethods, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(QMS_STORES.characteristics)) {
        const store = db.createObjectStore(QMS_STORES.characteristics, {
          keyPath: "id",
        });
        store.createIndex("processId", "processId");
        store.createIndex("operationId", "operationId");
        store.createIndex("criticality", "criticality");
        store.createIndex("status", "status");
        store.createIndex("category", "category");
        store.createIndex("customerScope", "customerScope");
      }

      if (!db.objectStoreNames.contains(QMS_STORES.templates)) {
        db.createObjectStore(QMS_STORES.templates, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(QMS_STORES.favorites)) {
        const store = db.createObjectStore(QMS_STORES.favorites, {
          keyPath: "id",
        });
        store.createIndex("userId", "userId");
      }

      if (!db.objectStoreNames.contains(QMS_STORES.inspectionStages)) {
        db.createObjectStore(QMS_STORES.inspectionStages, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(QMS_STORES.inspectionSheets)) {
        const store = db.createObjectStore(QMS_STORES.inspectionSheets, {
          keyPath: "id",
        });
        store.createIndex("projectId", "projectId");
        store.createIndex("status", "status");
        store.createIndex("inspectionNumber", "inspectionNumber");
      }

      if (!db.objectStoreNames.contains(QMS_STORES.inspectionStageEntries)) {
        const store = db.createObjectStore(QMS_STORES.inspectionStageEntries, {
          keyPath: "id",
        });
        store.createIndex("sheetId", "sheetId");
        store.createIndex("characteristicId", "characteristicId");
      }

      if (
        !db.objectStoreNames.contains(QMS_STORES.inspectionStageCompletions)
      ) {
        const store = db.createObjectStore(
          QMS_STORES.inspectionStageCompletions,
          { keyPath: "id" },
        );
        store.createIndex("sheetId", "sheetId");
      }

      if (!db.objectStoreNames.contains(QMS_STORES.inspectionDocuments)) {
        const store = db.createObjectStore(QMS_STORES.inspectionDocuments, {
          keyPath: "id",
        });
        store.createIndex("sheetId", "sheetId");
      }

      if (!db.objectStoreNames.contains(QMS_STORES.inspectionHistory)) {
        const store = db.createObjectStore(QMS_STORES.inspectionHistory, {
          keyPath: "id",
        });
        store.createIndex("sheetId", "sheetId");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}
