// Isolated IndexedDB database for the Engineering Drawing Editor module.
// Deliberately separate from both the main ERP's localStorage store and the
// QMS module's IndexedDB — same isolation rationale as qms/db/database.ts:
// this module's data (large PDF blobs, per-drawing canvas state) doesn't
// belong mixed into another module's storage, and keeping it in its own
// database means it can be dropped/rebuilt independently.

const DB_NAME = "fabflow-drawing-editor";
const DB_VERSION = 4;

export const DRAWING_EDITOR_STORES = {
  drawings: "drawings",
  drawingViews: "drawingViews",
  userPreferences: "userPreferences",
  drawingLinks: "drawingLinks",
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDrawingEditorDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction;

      let drawingsStore: IDBObjectStore;
      if (!db.objectStoreNames.contains(DRAWING_EDITOR_STORES.drawings)) {
        drawingsStore = db.createObjectStore(DRAWING_EDITOR_STORES.drawings, {
          keyPath: "id",
        });
        drawingsStore.createIndex("projectId", "projectId");
      } else {
        drawingsStore = tx!.objectStore(DRAWING_EDITOR_STORES.drawings);
      }
      if (!drawingsStore.indexNames.contains("ownerId")) {
        drawingsStore.createIndex("ownerId", "ownerId");
      }
      if (!drawingsStore.indexNames.contains("parentDrawingId")) {
        drawingsStore.createIndex("parentDrawingId", "parentDrawingId");
      }
      if (!drawingsStore.indexNames.contains("sourceDesignFileId")) {
        drawingsStore.createIndex("sourceDesignFileId", "sourceDesignFileId");
      }
      if (!drawingsStore.indexNames.contains("originalDrawingId")) {
        drawingsStore.createIndex("originalDrawingId", "originalDrawingId");
      }

      if (!db.objectStoreNames.contains(DRAWING_EDITOR_STORES.drawingViews)) {
        const store = db.createObjectStore(DRAWING_EDITOR_STORES.drawingViews, {
          keyPath: "id",
        });
        store.createIndex("drawingId", "drawingId");
      }

      if (
        !db.objectStoreNames.contains(DRAWING_EDITOR_STORES.userPreferences)
      ) {
        db.createObjectStore(DRAWING_EDITOR_STORES.userPreferences, {
          keyPath: "id",
        });
      }

      if (!db.objectStoreNames.contains(DRAWING_EDITOR_STORES.drawingLinks)) {
        const store = db.createObjectStore(DRAWING_EDITOR_STORES.drawingLinks, {
          keyPath: "id",
        });
        store.createIndex("drawingId", "drawingId");
        store.createIndex("linkedId", "linkedId");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}
