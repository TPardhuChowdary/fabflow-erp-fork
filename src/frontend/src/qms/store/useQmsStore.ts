// QMS-only Zustand store — deliberately separate from the main ERP's useStore()
// (see QMS_ARCHITECTURE.md Section 1 for the documented exception to the
// "one store" rule). This store is a thin in-memory cache: IndexedDB via
// qms/api is the source of truth, this just avoids every component re-querying
// on every render.

import type { HydrationStatus } from "@/lib/hydration";
import {
  hydrateProjectQmsInspectionAttemptPhotosForAttempts,
  hydrateProjectQmsInspections,
} from "@/lib/hydration";
import * as qmsInspectionsApi from "@/lib/qmsInspectionsApi";
import type {
  CreateProjectQmsInspectionAttemptInput,
  CreateProjectQmsInspectionAttemptPhotoInput,
  CreateProjectQmsInspectionCharacteristicInput,
  CreateProjectQmsInspectionInput,
  CreateProjectQmsInspectionOverrideInput,
  UpdateProjectQmsInspectionInput,
  WriteResult,
} from "@/lib/qmsInspectionsApi";
import { create } from "zustand";
import * as qmsApi from "../api";
import type { CreateCharacteristicInput } from "../api";
import * as inspectionApi from "../api/inspections";
import type { GenerateInspectionSheetInput } from "../api/inspections";
import type {
  InspectionMethod,
  InspectionMode,
  InspectionSheet,
  InspectionStageCompletion,
  InspectionStageDefinition,
  ManufacturingProcess,
  Operation,
  ProjectQmsInspection,
  ProjectQmsInspectionAttempt,
  ProjectQmsInspectionAttemptPhoto,
  ProjectQmsInspectionCharacteristic,
  ProjectQmsInspectionOverride,
  QmsCharacteristicStatus,
  QmsTemplate,
  QualityCharacteristic,
} from "../types";

interface QmsStoreState {
  loaded: boolean;
  loading: boolean;
  processes: ManufacturingProcess[];
  operations: Operation[];
  inspectionMethods: InspectionMethod[];
  characteristics: QualityCharacteristic[];
  templates: QmsTemplate[];
  favoriteIds: string[];

  loadAll: (userId: string) => Promise<void>;

  createCharacteristic: (
    input: CreateCharacteristicInput,
  ) => Promise<QualityCharacteristic>;
  updateCharacteristic: (
    id: string,
    updates: Partial<CreateCharacteristicInput>,
  ) => Promise<QualityCharacteristic>;
  setCharacteristicStatus: (
    id: string,
    status: QmsCharacteristicStatus,
  ) => Promise<void>;
  bulkSetCharacteristicStatus: (
    ids: string[],
    status: QmsCharacteristicStatus,
  ) => Promise<void>;

  toggleFavorite: (userId: string, characteristicId: string) => Promise<void>;
  bulkAddFavorites: (
    userId: string,
    characteristicIds: string[],
  ) => Promise<void>;

  createTemplate: (input: {
    name: string;
    category: string;
    description?: string;
    characteristicIds: string[];
  }) => Promise<QmsTemplate>;
  renameTemplate: (id: string, name: string) => Promise<void>;
  addCharacteristicsToTemplate: (
    templateId: string,
    characteristicIds: string[],
  ) => Promise<void>;
  removeCharacteristicFromTemplate: (
    templateId: string,
    characteristicId: string,
  ) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;

  // ── Phase 2 — Inspection Sheets ──────────────────────────────────
  inspectionStagesLoaded: boolean;
  inspectionStages: InspectionStageDefinition[];
  inspectionSheets: InspectionSheet[];
  /** All stage completions across every sheet/project — a cross-project
   * read cache (mirrors inspectionSheets), used by ProjectDetail's
   * dispatch-readiness badge and Production Summary panel to sum
   * acceptedQty/rejectedQty without a per-sheet fetch. */
  stageCompletions: InspectionStageCompletion[];

  // Phase P1.1 — proactive app-boot hydration for the two fields above,
  // populated by hooks/useSupabaseHydration.ts on login/refresh, same
  // pattern as every other Supabase-backed list in this app (see the
  // projectQmsInspections* fields below). setX/setXHydrationStatus are
  // hydration-write-only, never called directly by UI code — the
  // loadInspectionSheets()/loadStageCompletions() actions above remain
  // the on-demand refresh path and keep working exactly as before.
  inspectionSheetsHydration: { status: HydrationStatus; error?: string };
  setInspectionSheetsHydrationStatus: (
    status: HydrationStatus,
    error?: string,
  ) => void;
  setInspectionSheetsFromServer: (sheets: InspectionSheet[]) => void;

  stageCompletionsHydration: { status: HydrationStatus; error?: string };
  setStageCompletionsHydrationStatus: (
    status: HydrationStatus,
    error?: string,
  ) => void;
  setStageCompletionsFromServer: (
    completions: InspectionStageCompletion[],
  ) => void;

  loadInspectionStages: () => Promise<void>;
  loadInspectionSheets: () => Promise<void>;
  loadStageCompletions: () => Promise<void>;

  generateInspectionSheet: (
    input: GenerateInspectionSheetInput,
  ) => Promise<InspectionSheet>;
  updateInspectionSheetStages: (
    sheetId: string,
    stageIds: string[],
    byUserId: string,
    byUserName: string,
  ) => Promise<InspectionSheet>;
  setInspectionSheetMode: (
    sheetId: string,
    mode: InspectionMode,
    byUserId: string,
    byUserName: string,
  ) => Promise<InspectionSheet>;
  markPrinted: (
    sheetId: string,
    byUserId: string,
    byUserName: string,
  ) => Promise<InspectionSheet>;
  startInspection: (
    sheetId: string,
    byUserId: string,
    byUserName: string,
  ) => Promise<InspectionSheet>;
  markCompleted: (
    sheetId: string,
    byUserId: string,
    byUserName: string,
  ) => Promise<InspectionSheet>;
  markReviewed: (
    sheetId: string,
    byUserId: string,
    byUserName: string,
    notes?: string,
  ) => Promise<InspectionSheet>;
  approveSheet: (
    sheetId: string,
    byUserId: string,
    byUserName: string,
    notes?: string,
  ) => Promise<InspectionSheet>;
  closeSheet: (
    sheetId: string,
    byUserId: string,
    byUserName: string,
  ) => Promise<InspectionSheet>;

  /** Refetches one sheet from IndexedDB and patches the cache — used after
   * sub-entity mutations (stage entries, signatures, uploads) whose effect
   * on the sheet's own status/timestamps isn't cheap to compute locally. */
  refreshInspectionSheet: (sheetId: string) => Promise<void>;

  /** §3 — creates the next revision from a locked (Approved/Closed) sheet
   * and adds it to the cache so the Project tab and search list pick up
   * the new "current" sheet immediately. */
  createRevision: (
    previousSheetId: string,
    reason: string,
    byUserId: string,
    byUserName: string,
  ) => Promise<InspectionSheet>;

  // ── Phase 32 — Production ↔ QMS gate persistence ────────────────
  // Supabase-backed (see lib/hydration.ts / lib/qmsInspectionsApi.ts),
  // NOT IndexedDB via qmsApi/inspectionApi like everything above - a
  // deliberate, disclosed exception to this store's own "IndexedDB is
  // source of truth" file-header comment. This is the new, independent,
  // per-project inspection-instance model; it runs alongside, and never
  // reads or writes, the InspectionSheet/StageCompletion/StageEntry
  // model above. The 4 bulk-loaded arrays below are populated by
  // hooks/useSupabaseHydration.ts on login/refresh, the same pattern
  // used for every one of the 26 Supabase-backed domains in the main
  // useStore() - setX/setXHydrationStatus are hydration-write-only,
  // never called directly by UI code (use the create*/update* actions
  // below for that, which keep the cache in sync themselves).
  projectQmsInspectionsHydration: { status: HydrationStatus; error?: string };
  projectQmsInspections: ProjectQmsInspection[];
  setProjectQmsInspectionsHydrationStatus: (
    status: HydrationStatus,
    error?: string,
  ) => void;
  setProjectQmsInspectionsFromServer: (
    inspections: ProjectQmsInspection[],
  ) => void;

  projectQmsInspectionCharacteristicsHydration: {
    status: HydrationStatus;
    error?: string;
  };
  projectQmsInspectionCharacteristics: ProjectQmsInspectionCharacteristic[];
  setProjectQmsInspectionCharacteristicsHydrationStatus: (
    status: HydrationStatus,
    error?: string,
  ) => void;
  setProjectQmsInspectionCharacteristicsFromServer: (
    characteristics: ProjectQmsInspectionCharacteristic[],
  ) => void;

  projectQmsInspectionAttemptsHydration: {
    status: HydrationStatus;
    error?: string;
  };
  projectQmsInspectionAttempts: ProjectQmsInspectionAttempt[];
  setProjectQmsInspectionAttemptsHydrationStatus: (
    status: HydrationStatus,
    error?: string,
  ) => void;
  setProjectQmsInspectionAttemptsFromServer: (
    attempts: ProjectQmsInspectionAttempt[],
  ) => void;

  projectQmsInspectionOverridesHydration: {
    status: HydrationStatus;
    error?: string;
  };
  projectQmsInspectionOverrides: ProjectQmsInspectionOverride[];
  setProjectQmsInspectionOverridesHydrationStatus: (
    status: HydrationStatus,
    error?: string,
  ) => void;
  setProjectQmsInspectionOverridesFromServer: (
    overrides: ProjectQmsInspectionOverride[],
  ) => void;

  /** Deliberately NOT bulk-hydrated on login (base64 photos can be large
   * and most attempts have none) - fetched on demand for a given set of
   * attempt ids and merged into this cache by id (never duplicated,
   * never dropped once fetched). */
  projectQmsInspectionAttemptPhotos: ProjectQmsInspectionAttemptPhoto[];
  loadProjectQmsInspectionAttemptPhotosForAttempts: (
    attemptIds: string[],
  ) => Promise<void>;

  /** Creates a new inspection instance (Path A or Path B). On a
   * duplicate, the returned WriteResult has status "duplicate" and
   * carries the existing row instead - the cache is updated with
   * whichever row is authoritative (new or existing) either way, never
   * both. */
  createProjectQmsInspection: (
    input: CreateProjectQmsInspectionInput,
  ) => Promise<WriteResult<ProjectQmsInspection>>;
  updateProjectQmsInspection: (
    id: string,
    updates: UpdateProjectQmsInspectionInput,
  ) => Promise<WriteResult<ProjectQmsInspection>>;
  createProjectQmsInspectionCharacteristics: (
    inputs: CreateProjectQmsInspectionCharacteristicInput[],
  ) => Promise<WriteResult<ProjectQmsInspectionCharacteristic[]>>;
  createProjectQmsInspectionAttempt: (
    input: CreateProjectQmsInspectionAttemptInput,
  ) => Promise<WriteResult<ProjectQmsInspectionAttempt>>;
  createProjectQmsInspectionAttemptPhoto: (
    input: CreateProjectQmsInspectionAttemptPhotoInput,
  ) => Promise<WriteResult<ProjectQmsInspectionAttemptPhoto>>;
  createProjectQmsInspectionOverride: (
    input: CreateProjectQmsInspectionOverrideInput,
  ) => Promise<WriteResult<ProjectQmsInspectionOverride>>;

  /** Phase 32 (Task #175) - the single entry point every inspection-
   * creation flow should use (Path A linking in
   * ProductionStageInspectionControl, Path B "Add Independent Inspection"
   * in the new QMS tab): creates the instance via
   * createProjectQmsInspection, then - only on a genuine "success" (never
   * on "duplicate", which already has its own characteristics from
   * whenever it was first created) - derives which Library characteristics
   * apply via the same processId match InspectionSheetView.tsx already
   * uses for the old model, and snapshots them via
   * createProjectQmsInspectionCharacteristics. Callers get back the
   * inspection result exactly as createProjectQmsInspection would return
   * it; characteristic creation failure is logged to the console but does
   * not change the returned status - the inspection itself did get
   * created/resolved correctly either way. */
  createProjectQmsInspectionWithCharacteristics: (
    input: CreateProjectQmsInspectionInput,
  ) => Promise<WriteResult<ProjectQmsInspection>>;
}

export const useQmsStore = create<QmsStoreState>((set, get) => ({
  loaded: false,
  loading: false,
  processes: [],
  operations: [],
  inspectionMethods: [],
  characteristics: [],
  templates: [],
  favoriteIds: [],

  loadAll: async (userId: string) => {
    if (get().loading) return;
    set({ loading: true });
    const [
      processes,
      operations,
      inspectionMethods,
      characteristics,
      templates,
      favoriteIds,
    ] = await Promise.all([
      qmsApi.getProcesses(),
      qmsApi.getOperations(),
      qmsApi.getInspectionMethods(),
      qmsApi.getCharacteristicLibrary(),
      qmsApi.getTemplates(),
      qmsApi.getFavoriteIds(userId),
    ]);
    set({
      processes,
      operations,
      inspectionMethods,
      characteristics,
      templates,
      favoriteIds,
      loaded: true,
      loading: false,
    });
  },

  createCharacteristic: async (input) => {
    const created = await qmsApi.createCharacteristic(input);
    set((s) => ({ characteristics: [...s.characteristics, created] }));
    return created;
  },

  updateCharacteristic: async (id, updates) => {
    const updated = await qmsApi.updateCharacteristic(id, updates);
    set((s) => ({
      characteristics: s.characteristics.map((c) =>
        c.id === id ? updated : c,
      ),
    }));
    return updated;
  },

  setCharacteristicStatus: async (id, status) => {
    const updated = await qmsApi.setCharacteristicStatus(id, status);
    set((s) => ({
      characteristics: s.characteristics.map((c) =>
        c.id === id ? updated : c,
      ),
    }));
  },

  bulkSetCharacteristicStatus: async (ids, status) => {
    await qmsApi.bulkSetCharacteristicStatus(ids, status);
    const idSet = new Set(ids);
    set((s) => ({
      characteristics: s.characteristics.map((c) =>
        idSet.has(c.id) ? { ...c, status, updatedAt: Date.now() } : c,
      ),
    }));
  },

  toggleFavorite: async (userId, characteristicId) => {
    const isFav = await qmsApi.toggleFavorite(userId, characteristicId);
    set((s) => ({
      favoriteIds: isFav
        ? [...s.favoriteIds, characteristicId]
        : s.favoriteIds.filter((id) => id !== characteristicId),
    }));
  },

  bulkAddFavorites: async (userId, characteristicIds) => {
    await qmsApi.bulkAddFavorites(userId, characteristicIds);
    set((s) => ({
      favoriteIds: Array.from(
        new Set([...s.favoriteIds, ...characteristicIds]),
      ),
    }));
  },

  createTemplate: async (input) => {
    const created = await qmsApi.createTemplate(input);
    set((s) => ({ templates: [...s.templates, created] }));
    return created;
  },

  renameTemplate: async (id, name) => {
    const updated = await qmsApi.renameTemplate(id, name);
    set((s) => ({
      templates: s.templates.map((t) => (t.id === id ? updated : t)),
    }));
  },

  addCharacteristicsToTemplate: async (templateId, characteristicIds) => {
    const updated = await qmsApi.addCharacteristicsToTemplate(
      templateId,
      characteristicIds,
    );
    set((s) => ({
      templates: s.templates.map((t) => (t.id === templateId ? updated : t)),
    }));
  },

  removeCharacteristicFromTemplate: async (templateId, characteristicId) => {
    const updated = await qmsApi.removeCharacteristicFromTemplate(
      templateId,
      characteristicId,
    );
    set((s) => ({
      templates: s.templates.map((t) => (t.id === templateId ? updated : t)),
    }));
  },

  deleteTemplate: async (id) => {
    await qmsApi.deleteTemplate(id);
    set((s) => ({ templates: s.templates.filter((t) => t.id !== id) }));
  },

  // ── Phase 2 — Inspection Sheets ──────────────────────────────────
  inspectionStagesLoaded: false,
  inspectionStages: [],
  inspectionSheets: [],
  stageCompletions: [],

  inspectionSheetsHydration: { status: "idle" },
  setInspectionSheetsHydrationStatus: (status, error) =>
    set({ inspectionSheetsHydration: { status, error } }),
  setInspectionSheetsFromServer: (sheets) =>
    set({
      inspectionSheets: sheets,
      inspectionSheetsHydration: { status: "success" },
    }),

  stageCompletionsHydration: { status: "idle" },
  setStageCompletionsHydrationStatus: (status, error) =>
    set({ stageCompletionsHydration: { status, error } }),
  setStageCompletionsFromServer: (completions) =>
    set({
      stageCompletions: completions,
      stageCompletionsHydration: { status: "success" },
    }),

  loadInspectionStages: async () => {
    if (get().inspectionStagesLoaded) return;
    const inspectionStages = await inspectionApi.getInspectionStages();
    set({ inspectionStages, inspectionStagesLoaded: true });
  },

  loadInspectionSheets: async () => {
    const inspectionSheets = await inspectionApi.getAllInspectionSheets();
    set({ inspectionSheets });
  },

  loadStageCompletions: async () => {
    const stageCompletions = await inspectionApi.getAllStageCompletions();
    set({ stageCompletions });
  },

  generateInspectionSheet: async (input) => {
    const sheet = await inspectionApi.generateInspectionSheet(input);
    set((s) => ({ inspectionSheets: [sheet, ...s.inspectionSheets] }));
    return sheet;
  },

  updateInspectionSheetStages: async (
    sheetId,
    stageIds,
    byUserId,
    byUserName,
  ) => {
    const updated = await inspectionApi.updateInspectionSheetStages(
      sheetId,
      stageIds,
      byUserId,
      byUserName,
    );
    set((s) => ({
      inspectionSheets: s.inspectionSheets.map((sh) =>
        sh.id === sheetId ? updated : sh,
      ),
    }));
    return updated;
  },

  setInspectionSheetMode: async (sheetId, mode, byUserId, byUserName) => {
    const updated = await inspectionApi.setInspectionSheetMode(
      sheetId,
      mode,
      byUserId,
      byUserName,
    );
    set((s) => ({
      inspectionSheets: s.inspectionSheets.map((sh) =>
        sh.id === sheetId ? updated : sh,
      ),
    }));
    return updated;
  },

  markPrinted: async (sheetId, byUserId, byUserName) => {
    const updated = await inspectionApi.markPrinted(
      sheetId,
      byUserId,
      byUserName,
    );
    set((s) => ({
      inspectionSheets: s.inspectionSheets.map((sh) =>
        sh.id === sheetId ? updated : sh,
      ),
    }));
    return updated;
  },

  startInspection: async (sheetId, byUserId, byUserName) => {
    const updated = await inspectionApi.startInspection(
      sheetId,
      byUserId,
      byUserName,
    );
    set((s) => ({
      inspectionSheets: s.inspectionSheets.map((sh) =>
        sh.id === sheetId ? updated : sh,
      ),
    }));
    return updated;
  },

  markCompleted: async (sheetId, byUserId, byUserName) => {
    const updated = await inspectionApi.markCompleted(
      sheetId,
      byUserId,
      byUserName,
    );
    set((s) => ({
      inspectionSheets: s.inspectionSheets.map((sh) =>
        sh.id === sheetId ? updated : sh,
      ),
    }));
    return updated;
  },

  markReviewed: async (sheetId, byUserId, byUserName, notes) => {
    const updated = await inspectionApi.markReviewed(
      sheetId,
      byUserId,
      byUserName,
      notes,
    );
    set((s) => ({
      inspectionSheets: s.inspectionSheets.map((sh) =>
        sh.id === sheetId ? updated : sh,
      ),
    }));
    return updated;
  },

  approveSheet: async (sheetId, byUserId, byUserName, notes) => {
    const updated = await inspectionApi.approveSheet(
      sheetId,
      byUserId,
      byUserName,
      notes,
    );
    set((s) => ({
      inspectionSheets: s.inspectionSheets.map((sh) =>
        sh.id === sheetId ? updated : sh,
      ),
    }));
    return updated;
  },

  closeSheet: async (sheetId, byUserId, byUserName) => {
    const updated = await inspectionApi.closeSheet(
      sheetId,
      byUserId,
      byUserName,
    );
    set((s) => ({
      inspectionSheets: s.inspectionSheets.map((sh) =>
        sh.id === sheetId ? updated : sh,
      ),
    }));
    return updated;
  },

  refreshInspectionSheet: async (sheetId) => {
    const all = await inspectionApi.getAllInspectionSheets();
    const found = all.find((sh) => sh.id === sheetId);
    if (!found) return;
    set((s) => ({
      inspectionSheets: s.inspectionSheets.some((sh) => sh.id === sheetId)
        ? s.inspectionSheets.map((sh) => (sh.id === sheetId ? found : sh))
        : [found, ...s.inspectionSheets],
    }));
  },

  createRevision: async (previousSheetId, reason, byUserId, byUserName) => {
    const newSheet = await inspectionApi.createRevision(
      previousSheetId,
      reason,
      byUserId,
      byUserName,
    );
    // The previous revision's status is unchanged by createRevision(), but
    // refresh it too so its history panel picks up the new "RevisionCreated"
    // log entry immediately.
    await get().refreshInspectionSheet(previousSheetId);
    set((s) => ({ inspectionSheets: [newSheet, ...s.inspectionSheets] }));
    return newSheet;
  },

  // ── Phase 32 — Production ↔ QMS gate persistence ────────────────
  projectQmsInspectionsHydration: { status: "idle" },
  projectQmsInspections: [],
  setProjectQmsInspectionsHydrationStatus: (status, error) =>
    set({ projectQmsInspectionsHydration: { status, error } }),
  setProjectQmsInspectionsFromServer: (inspections) =>
    set({
      projectQmsInspections: inspections,
      projectQmsInspectionsHydration: { status: "success" },
    }),

  projectQmsInspectionCharacteristicsHydration: { status: "idle" },
  projectQmsInspectionCharacteristics: [],
  setProjectQmsInspectionCharacteristicsHydrationStatus: (status, error) =>
    set({ projectQmsInspectionCharacteristicsHydration: { status, error } }),
  setProjectQmsInspectionCharacteristicsFromServer: (characteristics) =>
    set({
      projectQmsInspectionCharacteristics: characteristics,
      projectQmsInspectionCharacteristicsHydration: { status: "success" },
    }),

  projectQmsInspectionAttemptsHydration: { status: "idle" },
  projectQmsInspectionAttempts: [],
  setProjectQmsInspectionAttemptsHydrationStatus: (status, error) =>
    set({ projectQmsInspectionAttemptsHydration: { status, error } }),
  setProjectQmsInspectionAttemptsFromServer: (attempts) =>
    set({
      projectQmsInspectionAttempts: attempts,
      projectQmsInspectionAttemptsHydration: { status: "success" },
    }),

  projectQmsInspectionOverridesHydration: { status: "idle" },
  projectQmsInspectionOverrides: [],
  setProjectQmsInspectionOverridesHydrationStatus: (status, error) =>
    set({ projectQmsInspectionOverridesHydration: { status, error } }),
  setProjectQmsInspectionOverridesFromServer: (overrides) =>
    set({
      projectQmsInspectionOverrides: overrides,
      projectQmsInspectionOverridesHydration: { status: "success" },
    }),

  projectQmsInspectionAttemptPhotos: [],
  loadProjectQmsInspectionAttemptPhotosForAttempts: async (attemptIds) => {
    const result =
      await hydrateProjectQmsInspectionAttemptPhotosForAttempts(attemptIds);
    if (result.status !== "success" || !result.data) return;
    set((s) => {
      const byId = new Map(
        s.projectQmsInspectionAttemptPhotos.map((p) => [p.id, p]),
      );
      for (const p of result.data ?? []) byId.set(p.id, p);
      return { projectQmsInspectionAttemptPhotos: Array.from(byId.values()) };
    });
  },

  createProjectQmsInspection: async (input) => {
    const result =
      await qmsInspectionsApi.createProjectQmsInspectionRemote(input);
    // Whether a fresh row was created ("success") or an existing one was
    // returned instead ("duplicate", Decision 3-B), the cache should end
    // up holding exactly that one authoritative row - never both.
    if (result.data) {
      set((s) => {
        const withoutDuplicate = s.projectQmsInspections.filter(
          (i) => i.id !== result.data?.id,
        );
        return {
          projectQmsInspections: [
            result.data as ProjectQmsInspection,
            ...withoutDuplicate,
          ],
        };
      });
    }
    return result;
  },

  updateProjectQmsInspection: async (id, updates) => {
    const result = await qmsInspectionsApi.updateProjectQmsInspectionRemote(
      id,
      updates,
    );
    if (result.status === "success" && result.data) {
      const updated = result.data;
      set((s) => ({
        projectQmsInspections: s.projectQmsInspections.map((i) =>
          i.id === id ? updated : i,
        ),
      }));
    }
    return result;
  },

  createProjectQmsInspectionCharacteristics: async (inputs) => {
    const result =
      await qmsInspectionsApi.createProjectQmsInspectionCharacteristicsRemote(
        inputs,
      );
    if (result.status === "success" && result.data) {
      const created = result.data;
      set((s) => ({
        projectQmsInspectionCharacteristics: [
          ...s.projectQmsInspectionCharacteristics,
          ...created,
        ],
      }));
    }
    return result;
  },

  createProjectQmsInspectionAttempt: async (input) => {
    const result =
      await qmsInspectionsApi.createProjectQmsInspectionAttemptRemote(input);
    if (result.status === "success" && result.data) {
      const created = result.data;
      set((s) => ({
        projectQmsInspectionAttempts: [
          ...s.projectQmsInspectionAttempts,
          created,
        ],
      }));
      // The server recomputes project_qms_inspections.status immediately
      // after this insert (trg_qms_inspection_attempts_recompute_status) -
      // refetch just that one row so the local cache's status field
      // reflects the new Pass/Fail/InProgress/NotStarted state without
      // waiting for the next full page hydration.
      const refreshed = await hydrateProjectQmsInspections();
      if (refreshed.status === "success" && refreshed.data) {
        const updated = refreshed.data.find(
          (i) => i.id === input.projectQmsInspectionId,
        );
        if (updated) {
          set((s) => ({
            projectQmsInspections: s.projectQmsInspections.map((i) =>
              i.id === updated.id ? updated : i,
            ),
          }));
        }
      }
    }
    return result;
  },

  createProjectQmsInspectionAttemptPhoto: async (input) => {
    const result =
      await qmsInspectionsApi.createProjectQmsInspectionAttemptPhotoRemote(
        input,
      );
    if (result.status === "success" && result.data) {
      const created = result.data;
      set((s) => ({
        projectQmsInspectionAttemptPhotos: [
          ...s.projectQmsInspectionAttemptPhotos,
          created,
        ],
      }));
    }
    return result;
  },

  createProjectQmsInspectionOverride: async (input) => {
    const result =
      await qmsInspectionsApi.createProjectQmsInspectionOverrideRemote(input);
    if (result.status === "success" && result.data) {
      const created = result.data;
      set((s) => ({
        projectQmsInspectionOverrides: [
          ...s.projectQmsInspectionOverrides,
          created,
        ],
      }));
    }
    return result;
  },

  createProjectQmsInspectionWithCharacteristics: async (input) => {
    const result = await get().createProjectQmsInspection(input);
    if (result.status !== "success" || !result.data) return result;

    const inspection = result.data;
    const def = get().inspectionStages.find(
      (d) => d.id === inspection.libraryInspectionId,
    );
    const applicable = def?.processId
      ? get().characteristics.filter(
          (c) => c.processId === def.processId && c.status === "Active",
        )
      : [];
    if (applicable.length > 0) {
      const charResult = await get().createProjectQmsInspectionCharacteristics(
        applicable.map((c, idx) => ({
          projectQmsInspectionId: inspection.id,
          libraryCharacteristicId: c.id,
          nameSnapshot: c.name,
          categorySnapshot: c.category,
          sequence: idx,
        })),
      );
      if (charResult.status !== "success") {
        // The inspection instance itself was created successfully - do
        // not change the returned status for a characteristic-snapshot
        // failure, but surface it for debugging. A future re-open of this
        // inspection can retry if this ever happens (RLS-denied etc.).
        console.error(
          "createProjectQmsInspectionWithCharacteristics: characteristic snapshot failed",
          charResult.error,
        );
      }
    }
    return result;
  },
}));
