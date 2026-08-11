// Drawing Editor-only Zustand store — isolated from the main ERP's
// useStore() and from qms/store/useQmsStore, same documented exception as
// QMS. This is a thin cache over IndexedDB (drawingEditor/api): it holds
// only what's already persisted (the drawing + view lists). All transient
// editing state (crop rect, active tool, the fabric.Canvas instance,
// undo stack) lives as local React state inside DrawingEditorPage — never
// here — matching how QMS keeps ephemeral canvas/signature work local.

import { create } from "zustand";
import * as api from "../api/drawings";
import type {
  DrawingDocument,
  DrawingLink,
  DrawingView,
  EditorMode,
} from "../types";

interface DrawingEditorStoreState {
  loaded: boolean;
  loading: boolean;
  drawings: DrawingDocument[];
  viewsByDrawing: Record<string, DrawingView[]>;
  /** Full link list — small dataset, same "load once, filter client-side"
   * pattern as `drawings`. Lets any list view show "linked to X" drawings
   * alongside "owned by X" ones without a query per filter change. */
  links: DrawingLink[];
  linksLoaded: boolean;
  rememberedMode?: EditorMode;
  lastProjectId?: string;
  /** Production Drawings, keyed by their parent (Master) drawing id. */
  childDrawingsByParent: Record<string, DrawingDocument[]>;

  loadDrawings: () => Promise<void>;
  loadViewsForDrawing: (drawingId: string) => Promise<void>;
  loadRememberedMode: (userId: string) => Promise<void>;

  uploadDrawing: (input: api.UploadDrawingInput) => Promise<DrawingDocument>;
  /** Returns every drawing id actually removed (the drawing itself, plus
   * its hidden Working Drawing if it had one). */
  deleteDrawing: (id: string) => Promise<string[]>;
  updateDrawing: (
    id: string,
    patch: Partial<
      Pick<
        DrawingDocument,
        "fileName" | "projectId" | "ownerType" | "ownerId" | "category"
      >
    >,
  ) => Promise<DrawingDocument>;
  duplicateDrawing: (
    id: string,
    opts: api.DuplicateDrawingOptions,
  ) => Promise<DrawingDocument>;

  /** Design File → Master Drawing bridge. Returns the existing Master if
   * this DesignFile was already promoted, otherwise creates it — so
   * clicking "Edit" a second time on the same Design File always reopens
   * the same working copy instead of creating a duplicate. */
  findOrCreateMasterDrawing: (
    input: api.PromoteDesignFileInput,
  ) => Promise<DrawingDocument>;
  /** Repository Original → hidden Working Drawing bridge. Returns the
   * existing Working Drawing if this Original was already edited before,
   * otherwise creates it — so clicking "Edit" a second time on the same
   * Original always reopens the same hidden copy instead of creating a
   * duplicate. */
  findOrCreateWorkingDrawing: (
    original: DrawingDocument,
    opts: { uploadedBy: string; uploadedByName: string },
  ) => Promise<DrawingDocument>;
  loadChildDrawings: (parentDrawingId: string) => Promise<void>;
  createProductionDrawing: (
    parentDrawingId: string,
    opts: api.CreateProductionDrawingOptions,
  ) => Promise<DrawingDocument>;

  saveDrawingView: (input: api.SaveDrawingViewInput) => Promise<DrawingView>;
  deleteDrawingView: (id: string, drawingId: string) => Promise<void>;

  setRememberedMode: (userId: string, mode: EditorMode) => Promise<void>;
  clearRememberedMode: (userId: string) => Promise<void>;
  setLastEditorProject: (userId: string, projectId: string) => Promise<void>;

  loadLinks: () => Promise<void>;
  addLink: (
    drawingId: string,
    linkedType: DrawingLink["linkedType"],
    linkedId: string,
  ) => Promise<void>;
  removeLink: (id: string) => Promise<void>;
}

export const useDrawingEditorStore = create<DrawingEditorStoreState>(
  (set, get) => ({
    loaded: false,
    loading: false,
    drawings: [],
    viewsByDrawing: {},
    links: [],
    linksLoaded: false,
    rememberedMode: undefined,
    lastProjectId: undefined,
    childDrawingsByParent: {},

    loadDrawings: async () => {
      if (get().loading) return;
      set({ loading: true });
      const drawings = await api.getAllDrawings();
      set({ drawings, loaded: true, loading: false });
    },

    loadViewsForDrawing: async (drawingId) => {
      const views = await api.getViewsForDrawing(drawingId);
      set((s) => ({
        viewsByDrawing: { ...s.viewsByDrawing, [drawingId]: views },
      }));
    },

    loadRememberedMode: async (userId) => {
      const pref = await api.getUserEditorPreference(userId);
      set({
        rememberedMode: pref?.rememberedMode,
        lastProjectId: pref?.lastProjectId,
      });
    },

    uploadDrawing: async (input) => {
      const drawing = await api.uploadDrawing(input);
      set((s) => ({ drawings: [drawing, ...s.drawings] }));
      return drawing;
    },

    deleteDrawing: async (id) => {
      const deletedIds = await api.deleteDrawing(id);
      set((s) => ({
        drawings: s.drawings.filter((d) => !deletedIds.includes(d.id)),
        links: s.links.filter((l) => !deletedIds.includes(l.drawingId)),
      }));
      return deletedIds;
    },

    updateDrawing: async (id, patch) => {
      const updated = await api.updateDrawing(id, patch);
      set((s) => ({
        drawings: s.drawings.map((d) => (d.id === id ? updated : d)),
      }));
      return updated;
    },

    duplicateDrawing: async (id, opts) => {
      const copy = await api.duplicateDrawing(id, opts);
      set((s) => ({ drawings: [copy, ...s.drawings] }));
      return copy;
    },

    findOrCreateMasterDrawing: async (input) => {
      const existing = await api.findMasterDrawingBySourceDesignFile(
        input.sourceDesignFileId,
      );
      if (existing) return existing;
      const created = await api.promoteDesignFileToMasterDrawing(input);
      set((s) => ({ drawings: [created, ...s.drawings] }));
      return created;
    },

    findOrCreateWorkingDrawing: async (original, opts) => {
      const existing = await api.findWorkingDrawingByOriginal(original.id);
      if (existing) return existing;
      const created = await api.createWorkingDrawing({
        originalDrawingId: original.id,
        fileName: original.fileName,
        numPages: original.numPages,
        uploadedBy: opts.uploadedBy,
        uploadedByName: opts.uploadedByName,
        projectId: original.projectId,
        ownerType: original.ownerType,
        ownerId: original.ownerId,
        category: original.category,
      });
      set((s) => ({ drawings: [created, ...s.drawings] }));
      return created;
    },

    loadChildDrawings: async (parentDrawingId) => {
      const children = await api.getChildDrawings(parentDrawingId);
      set((s) => ({
        childDrawingsByParent: {
          ...s.childDrawingsByParent,
          [parentDrawingId]: children,
        },
      }));
    },

    createProductionDrawing: async (parentDrawingId, opts) => {
      const child = await api.createProductionDrawing(parentDrawingId, opts);
      set((s) => ({
        drawings: [child, ...s.drawings],
        childDrawingsByParent: {
          ...s.childDrawingsByParent,
          [parentDrawingId]: [
            child,
            ...(s.childDrawingsByParent[parentDrawingId] || []),
          ],
        },
      }));
      return child;
    },

    saveDrawingView: async (input) => {
      const view = await api.saveDrawingView(input);
      await get().loadViewsForDrawing(input.drawingId);
      return view;
    },

    deleteDrawingView: async (id, drawingId) => {
      await api.deleteDrawingView(id);
      await get().loadViewsForDrawing(drawingId);
    },

    setRememberedMode: async (userId, mode) => {
      await api.setRememberedMode(userId, mode);
      set({ rememberedMode: mode });
    },

    clearRememberedMode: async (userId) => {
      await api.clearRememberedMode(userId);
      set({ rememberedMode: undefined });
    },

    setLastEditorProject: async (userId, projectId) => {
      await api.setLastEditorProject(userId, projectId);
      set({ lastProjectId: projectId });
    },

    loadLinks: async () => {
      const links = await api.getAllLinks();
      set({ links, linksLoaded: true });
    },

    addLink: async (drawingId, linkedType, linkedId) => {
      const link = await api.addLink(drawingId, linkedType, linkedId);
      set((s) => ({ links: [...s.links, link] }));
    },

    removeLink: async (id) => {
      await api.removeLink(id);
      set((s) => ({ links: s.links.filter((l) => l.id !== id) }));
    },
  }),
);
