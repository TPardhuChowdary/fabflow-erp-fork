import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fabric } from "fabric";
import { ArrowLeft } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy, PageViewport } from "pdfjs-dist";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../../AuthContext";
import { DesignFilePreviewDialog } from "../../components/DesignFilePreviewDialog";
import { WorkDrawingPreviewDialog } from "../../components/WorkDrawingPreviewDialog";
import { getCustomerVisibleName } from "../../lib/utils";
import { hasPermission } from "../../permissions";
import { useStore } from "../../store";
import type { DesignFile } from "../../types";
import {
  getChildDrawings,
  getDrawingPdfBlob,
  getLatestDrawingView,
} from "../api/drawings";
import { AnnotationToolPanel } from "../components/AnnotationToolPanel";
import {
  DrawingsListPanel,
  type LibraryCategory,
  type OwnerType,
  type ProjectOption,
} from "../components/DrawingsListPanel";
import {
  EditorHeaderBar,
  type GlobalEditMode,
} from "../components/EditorHeaderBar";
import { ExportPanel } from "../components/ExportPanel";
import { FloatingNumberToolbar } from "../components/FloatingNumberToolbar";
import { ModeSelectionModal } from "../components/ModeSelectionModal";
import { OriginalModePanel } from "../components/OriginalModePanel";
import { PageThumbnailList } from "../components/PageThumbnailList";
import { PixelModePanel } from "../components/PixelModePanel";
import {
  RegionSelector,
  type SelectionMode,
} from "../components/RegionSelector";
import { TitleBlockForm } from "../components/TitleBlockForm";
import { VectorModePanel } from "../components/VectorModePanel";
import {
  makeArrow,
  makeDimLine,
  snapToNearestEdge,
} from "../lib/dimensionTools";
import { findWorkingDrawing } from "../lib/drawingTree";
import { applyLockState, isNumberObject } from "../lib/numberEditMode";
import {
  type PageThumbnail,
  buildThumbnails,
  loadPdf,
  renderPageToCanvas,
} from "../lib/pdfRenderer";
import {
  BrushEraseSession,
  type StripItem,
  createAutoStripCovers,
  magicEraseAt,
  nukeStrip,
  restoreAllStripped,
  stripBluePixels,
  toggleStripItem,
} from "../lib/pixelTools";
import { colorToHex, parsePageVectors } from "../lib/vectorParser";
import { detectViews, extractPageTextItems } from "../lib/viewDetector";
import { printLatestView } from "../lib/workOrderPreview";
import { useDrawingEditorStore } from "../store/useDrawingEditorStore";
import {
  type AnnotationTool,
  type CropRect,
  type DetectedView,
  type DrawingDocument,
  type DrawingView,
  EMPTY_TITLE_BLOCK,
  type EditorMode,
  type PageTextItem,
  type TitleBlockFields,
  type VectorObject,
  type VectorPathObject,
} from "../types";

type Phase = "list" | "select" | "annotate";

const RENDER_SCALE = 1.8;

/** Bridges a Repository drawing's raw Blob storage into the data-URL
 * string DesignFilePreviewDialog expects (mirroring DesignFile.fileData's
 * shape), so that dialog can be reused unchanged for previewing Originals. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function todayDDMMYYYY(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function getCanvasPoint(e: MouseEvent, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;
  return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
}

interface VectorFabricEntry {
  obj: fabric.Object;
  role: string;
  colorClass: string;
  hidden: boolean;
  deleted: boolean;
}

interface Props {
  /** Focuses the list on this owner on entry (from a Project's or
   * Machine's Drawings tab) — seeds the filter but stays user-changeable,
   * never a hard lock, UNLESS initialDrawingId is also supplied (see
   * contextLocked below). */
  initialOwnerType?: OwnerType;
  initialOwnerId?: string;
  /** Opens this exact drawing immediately, skipping the list view. */
  initialDrawingId?: string;
  /** Context Mode's exit — return to the Project/Machine detail page this
   * drawing was opened from, instead of the unrestricted global "All
   * Drawings" list. Only rendered when contextLocked (see below); the
   * plain "All Drawings" breadcrumb is used otherwise. */
  onExitContext?: () => void;
}

export function DrawingEditorPage({
  initialOwnerType,
  initialOwnerId,
  initialDrawingId,
  onExitContext,
}: Props) {
  const { currentUser } = useAuth();
  const { addAuditLog, projects, machines, vendors, customers, settings } =
    useStore();
  const {
    drawings,
    loaded,
    loadDrawings,
    links,
    linksLoaded,
    loadLinks,
    addLink,
    removeLink,
    rememberedMode,
    loadRememberedMode,
    setRememberedMode,
    lastProjectId,
    setLastEditorProject,
    uploadDrawing,
    deleteDrawing,
    updateDrawing,
    duplicateDrawing,
    saveDrawingView,
    createProductionDrawing,
    findOrCreateWorkingDrawing,
  } = useDrawingEditorStore();

  const userId = currentUser?.id ?? "";
  const userName = currentUser?.username ?? "unknown";
  const canDelete = hasPermission(currentUser, "drawing_editor.delete");
  const canEdit = hasPermission(currentUser, "drawing_editor.edit");

  const projectOptions: ProjectOption[] = useMemo(
    () =>
      (projects || []).map((p) => ({
        id: p.id,
        label: `${p.projectNo} — ${getCustomerVisibleName(p)}`,
      })),
    [projects],
  );
  const machineOptions: ProjectOption[] = useMemo(
    () =>
      (machines || []).map((m) => ({
        id: m.id,
        label: `${m.machineCode} — ${m.name}`,
      })),
    [machines],
  );
  const vendorOptions: ProjectOption[] = useMemo(
    () => (vendors || []).map((v) => ({ id: v.id, label: v.name })),
    [vendors],
  );
  const customerOptions: ProjectOption[] = useMemo(
    () => (customers || []).map((c) => ({ id: c.id, label: c.name })),
    [customers],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount
  useEffect(() => {
    if (!loaded) loadDrawings();
    if (!linksLoaded) loadLinks();
    if (userId) loadRememberedMode(userId);
  }, [loaded, linksLoaded, userId]);

  const autoOpenedRef = useRef(false);

  /** Context Mode's hard lock: launched from a specific Project/Machine
   * with a specific drawing already resolved (e.g. "Edit" on a Design
   * File, or "Open Editor" on an already-selected drawing) — never drops
   * the engineer into the unrestricted global picker. A bare owner without
   * a drawing (e.g. a Drawings tab's plain "Open Editor") still lands on
   * the owner-filtered list, same as before. */
  const contextLocked = Boolean(
    initialOwnerType && initialOwnerId && initialDrawingId,
  );

  // ── Workspace state ────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("list");
  const [activeDrawing, setActiveDrawing] = useState<DrawingDocument | null>(
    null,
  );
  const [thumbnails, setThumbnails] = useState<PageThumbnail[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [detectedViews, setDetectedViews] = useState<DetectedView[]>([]);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("crop");
  const [vectorModeDetected, setVectorModeDetected] = useState(false);
  const [modeModalOpen, setModeModalOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode | null>(null);
  const [globalEditMode, setGlobalEditMode] = useState<GlobalEditMode>("full");
  const [tool, setTool] = useState<AnnotationTool>("select");
  const [color, setColor] = useState("#ff0000");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [brushSize, setBrushSize] = useState(30);
  const [textValue, setTextValue] = useState("");
  const [titleBlock, setTitleBlock] = useState<TitleBlockFields>({
    ...EMPTY_TITLE_BLOCK,
    date: todayDDMMYYYY(),
  });
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationStatus, setCalibrationStatus] = useState<string>();
  const [floatToolbar, setFloatToolbar] = useState<{
    position: { left: number; top: number };
    fontSize: number;
    color: string;
    bold: boolean;
  } | null>(null);
  /** Inline "Name this Work Drawing" dialog — shown on the first Save after
   * a new crop is confirmed on a Master (see sessionChildIdRef below). */
  const [namingDialogOpen, setNamingDialogOpen] = useState(false);
  const [pendingChildName, setPendingChildName] = useState("");
  const [previewWorkDrawing, setPreviewWorkDrawing] =
    useState<DrawingDocument | null>(null);
  const [previewOriginal, setPreviewOriginal] = useState<DesignFile | null>(
    null,
  );

  // ── Refs (DOM + non-visual mutable state) ───────────────────────
  const pageCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const fabricHostRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const bgImageRef = useRef<fabric.Image | undefined>(undefined);
  const fitScaleRef = useRef(1);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  /** Set by openDrawing right before activeDrawing changes; consumed once
   * by the page-load effect below to decide whether to restore a saved
   * view instead of landing on a blank crop-selection screen. A ref (not
   * state) so the async lookup can't race the effect that reads it. */
  const pendingRestoreViewRef = useRef<DrawingView | null>(null);
  /** Tracks the Work Drawing spawned from the Master's *current* crop, so
   * repeat Saves within the same crop-editing session keep updating that
   * one child instead of spawning duplicates. Reset to null in
   * enterAnnotate — every newly confirmed crop earns its own child. */
  const sessionChildIdRef = useRef<string | null>(null);
  const pageProxyRef = useRef<PDFPageProxy | null>(null);
  const pageViewportRef = useRef<PageViewport | null>(null);
  const pageTextItemsRef = useRef<PageTextItem[]>([]);
  const pageVectorObjectsRef = useRef<VectorObject[]>([]);
  const vectorFabricRef = useRef<VectorFabricEntry[]>([]);
  const stripItemsRef = useRef<StripItem[]>([]);
  const brushSessionRef = useRef<BrushEraseSession | null>(null);
  const isDraggingRef = useRef(false);
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const dragTmpObjRef = useRef<fabric.Object | null>(null);
  const lassoPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const cropDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const mmPerPixelRef = useRef<number | null>(null);
  const calibratingRef = useRef(false);
  const calibPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const toolRef = useRef<AnnotationTool>("select");
  const colorRef = useRef("#ff0000");
  const strokeRef = useRef(3);
  const brushSizeRef = useRef(30);
  const textValueRef = useRef("");
  const globalEditModeRef = useRef<GlobalEditMode>("full");

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);
  useEffect(() => {
    colorRef.current = color;
  }, [color]);
  useEffect(() => {
    strokeRef.current = strokeWidth;
  }, [strokeWidth]);
  useEffect(() => {
    brushSizeRef.current = brushSize;
  }, [brushSize]);
  useEffect(() => {
    textValueRef.current = textValue;
  }, [textValue]);
  useEffect(() => {
    globalEditModeRef.current = globalEditMode;
  }, [globalEditMode]);
  useEffect(() => {
    calibratingRef.current = calibrating;
  }, [calibrating]);

  // ── Draw the crop overlay whenever selection state changes ──────
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || phase !== "select") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (selectionMode === "auto") {
      for (const v of detectedViews) {
        ctx.strokeStyle = "rgba(0,150,255,0.6)";
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(v.x, v.y, v.w, v.h);
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(0,150,255,0.9)";
        ctx.font = "bold 12px sans-serif";
        ctx.fillText(v.label, v.x + 6, v.y + 14);
      }
    }
    if (cropRect) {
      ctx.fillStyle = "rgba(255,51,102,0.10)";
      ctx.fillRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
      ctx.strokeStyle = "#ff3366";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
      ctx.setLineDash([]);
    }
  }, [cropRect, selectionMode, detectedViews, phase]);

  // ── Loading a page ───────────────────────────────────────────────
  const loadPage = useCallback(
    async (pageNumber: number) => {
      const pdf = pdfDocRef.current;
      const pageCanvas = pageCanvasRef.current;
      const overlayCanvas = overlayCanvasRef.current;
      if (!pdf || !pageCanvas || !overlayCanvas) return;

      setPhase("select");
      setCurrentPage(pageNumber);
      setCropRect(null);

      const page = await pdf.getPage(pageNumber);
      pageProxyRef.current = page;
      const viewport = await renderPageToCanvas(
        page,
        pageCanvas,
        RENDER_SCALE * (zoom / 100),
      );
      pageViewportRef.current = viewport;
      overlayCanvas.width = viewport.width;
      overlayCanvas.height = viewport.height;

      const items = await extractPageTextItems(page, viewport);
      pageTextItemsRef.current = items;
      setDetectedViews(detectViews(items, viewport));

      const { objects, vectorMode } = await parsePageVectors(
        page,
        viewport,
        items,
      );
      pageVectorObjectsRef.current = objects;
      setVectorModeDetected(vectorMode);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [zoom],
  );

  // Load a drawing's page once its PDF is ready and canvases have mounted —
  // page 1 for a fresh/never-saved drawing, or the last-saved view's page
  // (restored straight into the annotate phase) if one exists.
  // Reads (never clears) pendingRestoreViewRef here — the ref is instead
  // reset by whichever setActiveDrawing call site sets it next (openDrawing
  // looks up a fresh view per call; handleUpload explicitly nulls it for
  // brand-new uploads), so this effect stays safe to re-run with the same
  // ref value if React ever re-invokes it for the same activeDrawing.id.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-run only on drawing change
  useEffect(() => {
    if (!activeDrawing || !pdfDocRef.current) return;
    const view = pendingRestoreViewRef.current;
    (async () => {
      await loadPage(view ? view.pageNumber : 1);
      if (view) enterAnnotateFromView(view);
    })();
  }, [activeDrawing?.id]);

  // ── Upload / open / delete drawings ─────────────────────────────
  const openDrawing = async (drawing: DrawingDocument) => {
    // drawing is almost always list-sourced (no pdfBlob attached — see
    // types.ts) — fetch the actual bytes from Storage on demand here,
    // the one place that genuinely needs to render the PDF.
    const pdfBlob = drawing.pdfBlob ?? (await getDrawingPdfBlob(drawing.id));
    const pdf = await loadPdf(pdfBlob);
    const thumbs = await buildThumbnails(pdf);
    const latestView = await getLatestDrawingView(drawing.id);
    pdfDocRef.current = pdf;
    setThumbnails(thumbs);
    pendingRestoreViewRef.current = latestView ?? null;
    setActiveDrawing(drawing);
  };

  /** Stores the uploaded file as a Repository Original and stops — no
   * auto-navigation into the editor. Uploading a company engineering
   * drawing doesn't mean editing needs to start immediately; that's what
   * the explicit "Edit" action (handleEditRepositoryDrawing) is for. */
  const handleUpload = async (
    file: File,
    ownerType: OwnerType,
    ownerId: string | undefined,
    category: LibraryCategory | undefined,
  ) => {
    const pdf = await loadPdf(file); // still needed for numPages
    const drawing = await uploadDrawing({
      fileName: file.name,
      pdfBlob: file,
      numPages: pdf.numPages,
      uploadedBy: userId,
      uploadedByName: userName,
      ownerType,
      ownerId,
      category,
    });
    addAuditLog({
      module: "drawing_editor",
      action: "create",
      entityId: drawing.id,
      entityLabel: drawing.fileName,
      changedBy: userName,
    });
    toast.success(`${drawing.fileName} uploaded`);
  };

  /** "Edit" on a row in the Repository's global list — which shows every
   * drawing across all owners, not just genuine Repository Originals (a
   * Design File's Master or a Production Drawing can appear here too,
   * since they're owned by some project/machine). Only bridge to a hidden
   * Working Drawing for an actual Original (no sourceDesignFileId,
   * parentDrawingId, or originalDrawingId of its own) — anything else
   * already has its own editing lifecycle managed elsewhere and should
   * just open directly, exactly like the old plain "Open" did. */
  const handleEditRepositoryDrawing = async (drawing: DrawingDocument) => {
    const isOriginal =
      !drawing.sourceDesignFileId &&
      !drawing.parentDrawingId &&
      !drawing.originalDrawingId;
    if (!isOriginal) {
      await openDrawing(drawing);
      return;
    }
    const working = await findOrCreateWorkingDrawing(drawing, {
      uploadedBy: userId,
      uploadedByName: userName,
    });
    await openDrawing(working);
  };

  const handleDeleteDrawing = async (drawing: DrawingDocument) => {
    const children = await getChildDrawings(drawing.id);
    if (children.length > 0) {
      toast.error(
        `Can't delete "${drawing.fileName}" — ${children.length} Production Drawing${children.length === 1 ? "" : "s"} still linked to it. Delete those first.`,
      );
      return;
    }
    if (
      !window.confirm(`Delete "${drawing.fileName}" and all its saved views?`)
    )
      return;
    await deleteDrawing(drawing.id);
    addAuditLog({
      module: "drawing_editor",
      action: "delete",
      entityId: drawing.id,
      entityLabel: drawing.fileName,
      changedBy: userName,
    });
    toast.success("Drawing deleted");
  };

  const handleRenameDrawing = async (
    drawing: DrawingDocument,
    newFileName: string,
  ) => {
    await updateDrawing(drawing.id, { fileName: newFileName });
    addAuditLog({
      module: "drawing_editor",
      action: "update",
      entityId: drawing.id,
      entityLabel: `${drawing.fileName} renamed to ${newFileName}`,
      changedBy: userName,
    });
    toast.success("Drawing renamed");
  };

  const handleChangeOwner = async (
    drawing: DrawingDocument,
    ownerType: OwnerType,
    ownerId: string | undefined,
    category: LibraryCategory | undefined,
  ) => {
    await updateDrawing(drawing.id, { ownerType, ownerId, category });
    addAuditLog({
      module: "drawing_editor",
      action: "update",
      entityId: drawing.id,
      entityLabel: `${drawing.fileName} owner changed`,
      changedBy: userName,
    });
    toast.success("Drawing owner updated");
  };

  /** Prints exactly what Preview Engineering Drawing would show — composed
   * fresh from its latest saved state, no export dialog. For a Repository
   * row this must resolve to its hidden Working Drawing first: the row
   * itself (the Original) never has any saved view, since edits never
   * touch it. Resolves to the drawing itself for anything outside the
   * Original/Working split (Design File Masters, Production Drawings),
   * preserving today's exact behavior there. */
  const handlePrintDrawing = async (drawing: DrawingDocument) => {
    const working = findWorkingDrawing(drawing.id, drawings);
    const printed = await printLatestView(working ?? drawing, {
      companyName: settings?.companyName || "Your Company",
      companyLogoDataUrl: settings?.companyLogo || undefined,
    });
    if (!printed) toast.error(`"${drawing.fileName}" hasn't been saved yet.`);
  };

  /** Read-only preview of a Repository row's pristine, never-edited
   * upload — reuses DesignFilePreviewDialog unchanged by adapting the raw
   * pdfBlob into the DesignFile-shaped prop it already expects. */
  const handlePreviewOriginal = async (drawing: DrawingDocument) => {
    const pdfBlob = drawing.pdfBlob ?? (await getDrawingPdfBlob(drawing.id));
    const fileData = await blobToDataUrl(pdfBlob);
    setPreviewOriginal({
      id: drawing.id,
      projectId: drawing.ownerId ?? drawing.projectId ?? "",
      fileName: drawing.fileName,
      fileType: "application/pdf",
      fileData,
      uploadedAt: drawing.uploadedAt,
    });
  };

  /** Preview of a Repository row's latest saved engineering state — must
   * resolve to the hidden Working Drawing, same reasoning as
   * handlePrintDrawing above. */
  const handlePreviewEngineering = (drawing: DrawingDocument) => {
    const working = findWorkingDrawing(drawing.id, drawings);
    if (!working) {
      toast.error(
        `"${drawing.fileName}" hasn't been edited yet — click Edit to create the Engineering Drawing.`,
      );
      return;
    }
    setPreviewWorkDrawing(working);
  };

  const handleAddLink = async (
    drawing: DrawingDocument,
    linkedType: "project" | "machine" | "vendor" | "customer",
    linkedId: string,
  ) => {
    await addLink(drawing.id, linkedType, linkedId);
    toast.success("Link added");
  };

  const handleRemoveLink = async (linkId: string) => {
    await removeLink(linkId);
    toast.success("Link removed");
  };

  const handleDuplicateDrawing = async (drawing: DrawingDocument) => {
    const copy = await duplicateDrawing(drawing.id, {
      duplicatedBy: userId,
      duplicatedByName: userName,
    });
    addAuditLog({
      module: "drawing_editor",
      action: "create",
      entityId: copy.id,
      entityLabel: `${copy.fileName} (duplicate of ${drawing.fileName})`,
      changedBy: userName,
    });
    toast.success("Drawing duplicated");
    return copy;
  };

  const handleOwnerFilterChange = (ownerType: string, ownerId: string) => {
    if (userId && ownerType === "project" && ownerId) {
      setLastEditorProject(userId, ownerId);
    }
  };

  // Auto-open: an explicit drawing wins; otherwise the most recently
  // updated drawing owned by the given project/machine; otherwise land on
  // the list. Runs once after the initial load, not on every change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally runs once after load, guarded by autoOpenedRef
  useEffect(() => {
    if (!loaded || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    if (initialDrawingId) {
      const match = drawings.find((d) => d.id === initialDrawingId);
      if (match) {
        openDrawing(match);
        return;
      }
    }
    if (initialOwnerType && initialOwnerId) {
      const candidates = drawings.filter((d) => {
        const type = d.ownerType ?? (d.projectId ? "project" : undefined);
        const id = d.ownerId ?? d.projectId;
        return type === initialOwnerType && id === initialOwnerId;
      });
      if (candidates.length > 0) {
        const mostRecent = candidates.reduce((a, b) =>
          b.updatedAt > a.updatedAt ? b : a,
        );
        openDrawing(mostRecent);
      }
    }
  }, [loaded, drawings, initialDrawingId, initialOwnerType, initialOwnerId]);

  const backToList = () => {
    fabricRef.current?.dispose();
    fabricRef.current = null;
    pdfDocRef.current = null;
    setActiveDrawing(null);
    setPhase("list");
    setEditorMode(null);
  };

  // ── Crop-region drag handling ────────────────────────────────────
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;

    const onDown = (e: MouseEvent) => {
      if (phase !== "select" || selectionMode !== "crop") return;
      const p = getCanvasPoint(e, canvas);
      cropDragStartRef.current = p;
      setCropRect({ x: p.x, y: p.y, w: 0, h: 0 });
    };
    const onMove = (e: MouseEvent) => {
      if (!cropDragStartRef.current) return;
      const p = getCanvasPoint(e, canvas);
      const s = cropDragStartRef.current;
      setCropRect({
        x: Math.min(s.x, p.x),
        y: Math.min(s.y, p.y),
        w: Math.abs(p.x - s.x),
        h: Math.abs(p.y - s.y),
      });
    };
    const onUp = () => {
      cropDragStartRef.current = null;
    };

    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [phase, selectionMode]);

  // ── Confirm selection → mode detection → modal / proceed ────────
  const handleConfirmSelection = () => {
    if (!cropRect || cropRect.w < 20 || cropRect.h < 20) {
      toast.error(
        "Drag a rectangle around the view you want to send to the shop floor.",
      );
      return;
    }
    if (rememberedMode) {
      proceedWithMode(rememberedMode, false);
      return;
    }
    setModeModalOpen(true);
  };

  const proceedWithMode = (mode: EditorMode, remember: boolean) => {
    let finalMode = mode;
    if (
      finalMode === "vector" &&
      !vectorModeDetected &&
      pageVectorObjectsRef.current.length === 0
    ) {
      toast.error(
        "This page has no vector data — switching to Pixel Editing instead.",
      );
      finalMode = "pixel";
    }
    setModeModalOpen(false);
    if (remember && userId) setRememberedMode(userId, finalMode);
    enterAnnotate(finalMode);
  };

  // ── Enter annotate phase: build the fabric canvas ────────────────
  /** Shared canvas-construction preamble for both a fresh crop/annotate
   * entry and a restore-from-saved-view entry — takes cr/mode as explicit
   * params (not read from cropRect state) so a restore path isn't at the
   * mercy of React state-update timing. Sizes + disposes/replaces the
   * fabric canvas and resets all the per-drawing mutable refs; does NOT
   * populate any content (background/objects) — callers do that. */
  const buildFabricCanvas = (
    cr: CropRect,
    mode: EditorMode,
  ): fabric.Canvas | null => {
    const canvasEl = fabricHostRef.current;
    if (!canvasEl) return null;

    const hostW = window.innerWidth - 240 - 300 - 80;
    const hostH = window.innerHeight - 300;
    const fitScale = Math.min(hostW / cr.w, hostH / cr.h, 3);
    fitScaleRef.current = fitScale;
    const displayW = cr.w * fitScale;
    const displayH = cr.h * fitScale;

    fabricRef.current?.dispose();
    canvasEl.width = displayW;
    canvasEl.height = displayH;
    const fc = new fabric.Canvas(canvasEl, {
      backgroundColor: "#ffffff",
      selection: true,
    });
    fabricRef.current = fc;
    bgImageRef.current = undefined;
    vectorFabricRef.current = [];
    stripItemsRef.current = [];
    mmPerPixelRef.current = null;
    setCalibrationStatus(undefined);
    setGlobalEditMode("full");
    setEditorMode(mode);
    setTool("select");
    return fc;
  };

  const enterAnnotate = (mode: EditorMode) => {
    const cr = cropRect;
    if (!cr) return;
    sessionChildIdRef.current = null;
    const fc = buildFabricCanvas(cr, mode);
    if (!fc) return;
    const fitScale = fitScaleRef.current;
    const displayW = cr.w * fitScale;
    const displayH = cr.h * fitScale;

    if (mode === "vector") {
      renderVectorObjects(fc, cr, fitScale);
    } else {
      const tmp = document.createElement("canvas");
      tmp.width = displayW;
      tmp.height = displayH;
      const tctx = tmp.getContext("2d");
      const pageCanvas = pageCanvasRef.current;
      if (tctx && pageCanvas) {
        tctx.imageSmoothingEnabled = true;
        tctx.imageSmoothingQuality = "high";
        tctx.drawImage(
          pageCanvas,
          cr.x,
          cr.y,
          cr.w,
          cr.h,
          0,
          0,
          displayW,
          displayH,
        );
      }
      fabric.Image.fromURL(tmp.toDataURL("image/png"), (img) => {
        img.set({ left: 0, top: 0, selectable: false, evented: false });
        fc.add(img);
        fc.sendToBack(img);
        bgImageRef.current = img;
        fc.renderAll();
      });
    }

    bindFabricEvents(fc);
    setPhase("annotate");
  };

  /** Resumes editing from a previously saved DrawingView — restores crop
   * region, title block, and the full fabric canvas (background + every
   * annotation/vector object) via fabric's loadFromJSON, landing directly
   * in the annotate phase instead of a blank crop-selection screen. Used
   * both for reopening any drawing a second time and for the moment right
   * after a Save spawns a new Work Drawing child. */
  const enterAnnotateFromView = (view: DrawingView) => {
    setCropRect(view.cropRect);
    setTitleBlock(view.titleBlock);
    const fc = buildFabricCanvas(view.cropRect, view.editorMode);
    if (!fc) return;

    fc.loadFromJSON(JSON.parse(view.fabricJSON), () => {
      const entries: VectorFabricEntry[] = [];
      for (const o of fc.getObjects()) {
        const tagged = o as fabric.Object & {
          role?: string;
          colorClass?: string;
        };
        if (tagged.role) {
          entries.push({
            obj: o,
            role: tagged.role,
            colorClass: tagged.colorClass || "",
            hidden: false,
            deleted: false,
          });
        }
        if (o.type === "image" && !o.selectable && !o.evented) {
          bgImageRef.current = o as fabric.Image;
        }
      }
      vectorFabricRef.current = entries;
      fc.renderAll();
    });

    bindFabricEvents(fc);
    setPhase("annotate");
  };

  function transformAndScale(
    x: number,
    y: number,
    ctm: number[],
    cr: CropRect,
    fs: number,
  ): { x: number; y: number } {
    const vp = pageViewportRef.current;
    if (!vp) return { x: 0, y: 0 };
    const ux = ctm[0] * x + ctm[2] * y + ctm[4];
    const uy = ctm[1] * x + ctm[3] * y + ctm[5];
    const tx = pdfjsLib.Util.transform(vp.transform, [1, 0, 0, 1, ux, uy]);
    return { x: (tx[4] - cr.x) * fs, y: (tx[5] - cr.y) * fs };
  }

  const renderVectorObjects = (fc: fabric.Canvas, cr: CropRect, fs: number) => {
    const bgRect = new fabric.Rect({
      left: 0,
      top: 0,
      width: cr.w * fs,
      height: cr.h * fs,
      fill: "#ffffff",
      selectable: false,
      evented: false,
    });
    fc.add(bgRect);
    bgImageRef.current = bgRect as unknown as fabric.Image;

    const entries: VectorFabricEntry[] = [];
    for (const obj of pageVectorObjectsRef.current) {
      const rect = obj.rect;
      if (rect.x + rect.w < cr.x || rect.x > cr.x + cr.w) continue;
      if (rect.y + rect.h < cr.y || rect.y > cr.y + cr.h) continue;

      let fObj: fabric.Object | null = null;
      if (obj.kind === "text") {
        const cx = (rect.x - cr.x) * fs;
        const cy = (rect.y - cr.y) * fs;
        const fontSize = Math.max(8, Math.min(20, rect.h * fs));
        fObj = new fabric.Text(obj.str || "", {
          left: cx,
          top: cy,
          fontFamily: "Helvetica",
          fontSize,
          fill: colorToHex(obj.strokeColor),
          selectable: true,
          evented: true,
          hoverCursor: "pointer",
          objectCaching: false,
        });
      } else {
        const pathObj = obj as VectorPathObject;
        let d = "";
        for (const s of pathObj.segments) {
          if (s.type === "M") {
            const p = transformAndScale(
              s.pts[0],
              s.pts[1],
              pathObj.ctm,
              cr,
              fs,
            );
            d += `M ${p.x} ${p.y} `;
          } else if (s.type === "L") {
            const p = transformAndScale(
              s.pts[0],
              s.pts[1],
              pathObj.ctm,
              cr,
              fs,
            );
            d += `L ${p.x} ${p.y} `;
          } else if (s.type === "C" && s.pts.length === 6) {
            const p1 = transformAndScale(
              s.pts[0],
              s.pts[1],
              pathObj.ctm,
              cr,
              fs,
            );
            const p2 = transformAndScale(
              s.pts[2],
              s.pts[3],
              pathObj.ctm,
              cr,
              fs,
            );
            const p3 = transformAndScale(
              s.pts[4],
              s.pts[5],
              pathObj.ctm,
              cr,
              fs,
            );
            d += `C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y} `;
          } else if (s.type === "C") {
            const p = transformAndScale(
              s.pts[s.pts.length - 2],
              s.pts[s.pts.length - 1],
              pathObj.ctm,
              cr,
              fs,
            );
            d += `L ${p.x} ${p.y} `;
          } else if (s.type === "R") {
            const p1 = transformAndScale(
              s.pts[0],
              s.pts[1],
              pathObj.ctm,
              cr,
              fs,
            );
            const p2 = transformAndScale(
              s.pts[0] + s.pts[2],
              s.pts[1] + s.pts[3],
              pathObj.ctm,
              cr,
              fs,
            );
            d += `M ${p1.x} ${p1.y} L ${p2.x} ${p1.y} L ${p2.x} ${p2.y} L ${p1.x} ${p2.y} Z `;
          } else if (s.type === "Z") {
            d += "Z ";
          }
        }
        if (!d.trim()) continue;
        const strokeW = Math.max(1, (pathObj.lineWidth || 0.5) * fs);
        fObj = new fabric.Path(d.trim(), {
          stroke: pathObj.hasStroke
            ? colorToHex(pathObj.strokeColor)
            : undefined,
          strokeWidth: strokeW,
          fill: pathObj.hasFill ? colorToHex(pathObj.fillColor) : undefined,
          selectable: true,
          evented: true,
          hoverCursor: "pointer",
          objectCaching: false,
          strokeLineCap: "round",
          strokeLineJoin: "round",
        });
      }
      if (fObj) {
        // Custom props, not standard fabric ones — tagged directly on the
        // object (rather than only in vectorFabricRef) so they round-trip
        // through fc.toJSON(["role","colorClass"])/loadFromJSON when a
        // saved view is restored (see enterAnnotateFromView).
        (fObj as fabric.Object & { role?: string; colorClass?: string }).role =
          obj.role;
        (
          fObj as fabric.Object & { role?: string; colorClass?: string }
        ).colorClass = obj.colorClass;
        fc.add(fObj);
        entries.push({
          obj: fObj,
          role: obj.role,
          colorClass: obj.colorClass,
          hidden: false,
          deleted: false,
        });
      }
    }
    vectorFabricRef.current = entries;
    fc.renderAll();
  };

  // ── Fabric mouse events: annotation drawing tools ────────────────
  const bindFabricEvents = (fc: fabric.Canvas) => {
    fc.on("mouse:down", (opt) => {
      const t = toolRef.current;
      if (t === "select") return;
      const p = fc.getPointer(opt.e);
      dragOriginRef.current = p;
      isDraggingRef.current = true;

      if (t === "magic") {
        isDraggingRef.current = false;
        runMagicErase(p.x, p.y);
        return;
      }
      if (t === "brush") {
        const bg = bgImageRef.current;
        if (bg) {
          brushSessionRef.current = new BrushEraseSession(bg, fc);
          brushSessionRef.current.eraseAt(p.x, p.y, brushSizeRef.current);
          fc.renderAll();
        }
        return;
      }
      if (t === "lasso") {
        lassoPointsRef.current = [p];
        const poly = new fabric.Polyline([p], {
          stroke: "#ff3366",
          strokeWidth: 2,
          fill: "rgba(255,51,102,0.08)",
          strokeDashArray: [6, 4],
          selectable: false,
          evented: false,
        });
        fc.add(poly);
        dragTmpObjRef.current = poly;
        return;
      }
      if (t === "text") {
        const txt = (textValueRef.current || "TEXT").toUpperCase();
        const iText = new fabric.IText(txt, {
          left: p.x,
          top: p.y,
          fontFamily: "monospace",
          fontWeight: "700" as unknown as number,
          fontSize: Math.max(12, strokeRef.current * 5),
          fill: colorRef.current,
          stroke: "#ffffff",
          strokeWidth: 0.5,
        });
        fc.add(iText);
        fc.setActiveObject(iText);
        isDraggingRef.current = false;
        return;
      }
      if (t === "whiteout") {
        dragTmpObjRef.current = new fabric.Rect({
          left: p.x,
          top: p.y,
          width: 1,
          height: 1,
          fill: "#ffffff",
          stroke: "#ffffff",
          strokeWidth: 0,
          selectable: true,
        });
        fc.add(dragTmpObjRef.current);
        return;
      }
      if (t === "highlight") {
        dragTmpObjRef.current = new fabric.Rect({
          left: p.x,
          top: p.y,
          width: 1,
          height: 1,
          fill: `${colorRef.current}55`,
          stroke: colorRef.current,
          strokeWidth: 1,
        });
        fc.add(dragTmpObjRef.current);
        return;
      }
      if (t === "rect") {
        dragTmpObjRef.current = new fabric.Rect({
          left: p.x,
          top: p.y,
          width: 1,
          height: 1,
          fill: "transparent",
          stroke: colorRef.current,
          strokeWidth: strokeRef.current,
        });
        fc.add(dragTmpObjRef.current);
        return;
      }
      if (t === "circle") {
        dragTmpObjRef.current = new fabric.Ellipse({
          left: p.x,
          top: p.y,
          rx: 1,
          ry: 1,
          fill: "transparent",
          stroke: colorRef.current,
          strokeWidth: strokeRef.current,
        });
        fc.add(dragTmpObjRef.current);
        return;
      }
      if (t === "arrow" || t === "dimline") {
        dragTmpObjRef.current = new fabric.Line([p.x, p.y, p.x, p.y], {
          stroke: colorRef.current,
          strokeWidth: strokeRef.current,
          selectable: true,
        });
        fc.add(dragTmpObjRef.current);
      }
    });

    fc.on("mouse:move", (opt) => {
      if (!isDraggingRef.current) return;
      const p = fc.getPointer(opt.e);
      const t = toolRef.current;

      if (t === "brush" && brushSessionRef.current) {
        brushSessionRef.current.eraseAt(p.x, p.y, brushSizeRef.current);
        return;
      }
      if (t === "lasso" && dragTmpObjRef.current) {
        lassoPointsRef.current.push(p);
        (dragTmpObjRef.current as fabric.Polyline).set({
          points: lassoPointsRef.current as unknown as fabric.Point[],
        });
        dragTmpObjRef.current.setCoords();
        fc.renderAll();
        return;
      }
      const tmp = dragTmpObjRef.current;
      const origin = dragOriginRef.current;
      if (!tmp || !origin) return;
      if (tmp.type === "rect") {
        tmp.set({
          width: Math.abs(p.x - origin.x),
          height: Math.abs(p.y - origin.y),
          left: Math.min(p.x, origin.x),
          top: Math.min(p.y, origin.y),
        });
      } else if (tmp.type === "ellipse") {
        (tmp as fabric.Ellipse).set({
          rx: Math.abs(p.x - origin.x) / 2,
          ry: Math.abs(p.y - origin.y) / 2,
          left: Math.min(p.x, origin.x),
          top: Math.min(p.y, origin.y),
        });
      } else if (tmp.type === "line") {
        (tmp as fabric.Line).set({ x2: p.x, y2: p.y });
      }
      fc.renderAll();
    });

    fc.on("mouse:up", async () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      const t = toolRef.current;

      if (t === "brush" && brushSessionRef.current) {
        const bg = bgImageRef.current;
        if (bg) {
          const newBg = await brushSessionRef.current.flush(fc, bg);
          bgImageRef.current = newBg;
        }
        brushSessionRef.current = null;
        return;
      }
      if (t === "lasso" && dragTmpObjRef.current) {
        const pts = lassoPointsRef.current.slice();
        fc.remove(dragTmpObjRef.current);
        dragTmpObjRef.current = null;
        if (pts.length >= 3) {
          const bg = bgImageRef.current;
          if (bg) {
            const session = new BrushEraseSession(bg, fc);
            session.eraseLasso(pts);
            const newBg = await session.flush(fc, bg);
            bgImageRef.current = newBg;
            toast.success(`Lasso erased region (${pts.length} points).`);
          }
        }
        return;
      }
      const tmp = dragTmpObjRef.current;
      if (tmp?.type === "line" && (t === "arrow" || t === "dimline")) {
        const line = tmp as fabric.Line;
        let p1 = { x: line.x1 ?? 0, y: line.y1 ?? 0 };
        let p2 = { x: line.x2 ?? 0, y: line.y2 ?? 0 };
        fc.remove(tmp);
        if (t === "arrow") {
          fc.add(makeArrow(p1, p2, colorRef.current, strokeRef.current));
        } else {
          const snapped1 = snapToNearestEdge(
            fc,
            bgImageRef.current,
            p1.x,
            p1.y,
          );
          const snapped2 = snapToNearestEdge(
            fc,
            bgImageRef.current,
            p2.x,
            p2.y,
          );
          if (snapped1) p1 = snapped1;
          if (snapped2) p2 = snapped2;
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const pixDist = Math.sqrt(dx * dx + dy * dy);
          const label = mmPerPixelRef.current
            ? (pixDist * mmPerPixelRef.current).toFixed(1)
            : textValueRef.current.trim();
          fc.add(
            makeDimLine(p1, p2, colorRef.current, strokeRef.current, label),
          );
        }
      }
      dragTmpObjRef.current = null;
    });

    fc.on("selection:created", (e) =>
      handleSelectionForNumberEdit(fc, e.selected?.[0]),
    );
    fc.on("selection:updated", (e) =>
      handleSelectionForNumberEdit(fc, e.selected?.[0]),
    );
    fc.on("selection:cleared", () => setFloatToolbar(null));

    fc.on("mouse:down", (opt) => {
      if (!calibratingRef.current) return;
      const p = fc.getPointer(opt.e);
      const snapped = snapToNearestEdge(fc, bgImageRef.current, p.x, p.y) || p;
      calibPointsRef.current.push(snapped);
      const dot = new fabric.Circle({
        left: snapped.x - 4,
        top: snapped.y - 4,
        radius: 4,
        fill: "#00cc66",
        selectable: false,
        evented: false,
      });
      fc.add(dot);
      if (calibPointsRef.current.length === 2) {
        for (const o of fc
          .getObjects()
          .filter((o) => o.fill === "#00cc66" && o.type === "circle")) {
          fc.remove(o);
        }
        const [a, b] = calibPointsRef.current;
        const pixDist = Math.hypot(b.x - a.x, b.y - a.y);
        const realMm = Number.parseFloat(
          window.prompt(
            `Pixel distance: ${pixDist.toFixed(1)}\nEnter the REAL length in mm:`,
            "80.76",
          ) || "",
        );
        if (realMm > 0) {
          mmPerPixelRef.current = realMm / pixDist;
          setCalibrationStatus(
            `✓ Calibrated: 1px = ${mmPerPixelRef.current.toFixed(4)} mm`,
          );
        }
        calibratingRef.current = false;
        setCalibrating(false);
        calibPointsRef.current = [];
      }
    });
  };

  const handleSelectionForNumberEdit = (
    fc: fabric.Canvas,
    obj: fabric.Object | undefined,
  ) => {
    if (
      globalEditModeRef.current !== "numberOnly" ||
      !obj ||
      !isNumberObject(obj)
    ) {
      setFloatToolbar(null);
      return;
    }
    const canvasEl = fc.getElement();
    const rect = canvasEl.getBoundingClientRect();
    const zoomLvl = fc.getZoom();
    const objX = (obj.left ?? 0) + ((obj.width ?? 0) * (obj.scaleX ?? 1)) / 2;
    const objY = (obj.top ?? 0) - 50;
    const screenX = rect.left + objX * zoomLvl;
    const screenY = rect.top + Math.max(60, objY * zoomLvl);
    setFloatToolbar({
      position: { left: Math.max(10, screenX - 100), top: screenY },
      fontSize: Math.round((obj as fabric.IText).fontSize || 20),
      color: ((obj as fabric.IText).fill as string) || "#ff0000",
      bold:
        (obj as fabric.IText).fontWeight === "bold" ||
        (obj as fabric.IText).fontWeight === 700,
    });
  };

  // ── Delete key removes selected objects ──────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (phase !== "annotate" || !fabricRef.current) return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const tag = (e.target as HTMLElement)?.tagName?.toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const fc = fabricRef.current;
      const active = fc.getActiveObjects();
      if (active.length === 0) return;
      e.preventDefault();
      for (const o of active) {
        if (o === (bgImageRef.current as unknown as fabric.Object)) continue;
        fc.remove(o);
        const entry = vectorFabricRef.current.find((v) => v.obj === o);
        if (entry) entry.deleted = true;
      }
      fc.discardActiveObject();
      fc.renderAll();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [phase]);

  // ── NUMBER EDIT toggle ────────────────────────────────────────────
  const handleGlobalEditModeChange = (mode: GlobalEditMode) => {
    setGlobalEditMode(mode);
    const fc = fabricRef.current;
    if (fc)
      applyLockState(
        fc,
        bgImageRef.current as unknown as fabric.Object,
        mode === "numberOnly",
      );
    if (mode === "full") setFloatToolbar(null);
  };

  // ── Vector mode bulk actions ──────────────────────────────────────
  const deleteVectorObjects = (
    predicate: (e: VectorFabricEntry) => boolean,
  ) => {
    const fc = fabricRef.current;
    if (!fc) return;
    let count = 0;
    for (const entry of vectorFabricRef.current) {
      if (entry.hidden) continue;
      if (predicate(entry)) {
        fc.remove(entry.obj);
        entry.hidden = true;
        entry.deleted = true;
        count++;
      }
    }
    fc.renderAll();
    toast.success(`Deleted ${count} vector objects`);
  };

  // ── Pixel mode actions ─────────────────────────────────────────────
  const handleAutoStrip = () => {
    const fc = fabricRef.current;
    if (!fc || !cropRect) return;
    restoreAllStripped(fc, stripItemsRef.current);
    stripItemsRef.current = [];
    const { items, strippedCount, keptCount } = createAutoStripCovers(
      fc,
      pageTextItemsRef.current,
      cropRect,
      fitScaleRef.current,
      (item) =>
        toggleStripItem(fc, item, cropRect, fitScaleRef.current, () => {}),
    );
    stripItemsRef.current = items;
    if (strippedCount === 0 && keptCount === 0) {
      toast.error(
        "No detectable text found in this region. Use the Hide Box tool manually.",
      );
      return;
    }
    toast.success(
      `Stripped ${strippedCount} dimensions · kept ${keptCount} labels`,
    );
    const bg = bgImageRef.current;
    if (bg) {
      stripBluePixels(fc, bg).then((newBg) => {
        if (newBg) bgImageRef.current = newBg;
      });
    }
  };

  const handleNukeStrip = () => {
    if (
      !window.confirm(
        "NUKE STRIP will aggressively remove everything except the thickest outlines. Continue?",
      )
    )
      return;
    const fc = fabricRef.current;
    const bg = bgImageRef.current;
    if (!fc || !bg) return;
    nukeStrip(fc, bg).then((result) => {
      if (result) {
        bgImageRef.current = result.newBg;
        toast.success(
          `Nuke complete — kept ${result.keptComponents} largest component(s)`,
        );
      }
    });
  };

  const handleRestoreAllStripped = () => {
    const fc = fabricRef.current;
    if (!fc) return;
    restoreAllStripped(fc, stripItemsRef.current);
    stripItemsRef.current = [];
    toast.success("All stripped dimensions restored");
  };

  const runMagicErase = (x: number, y: number) => {
    const fc = fabricRef.current;
    const bg = bgImageRef.current;
    if (!fc || !bg) return;
    magicEraseAt(fc, bg, x, y, (count) =>
      window.confirm(
        `This will erase ${count} pixels — looks like a big area. Continue?`,
      ),
    ).then((result) => {
      if (result === "white_area") {
        toast.error("Tap directly on a visible line/arrow, not white space.");
      } else if (result) {
        bgImageRef.current = result.newBg;
        toast.success(`Magic-erased ${result.erasedPixels} connected pixels`);
      }
    });
  };

  const handleCalibrate = () => {
    if (!fabricRef.current) return;
    if (calibratingRef.current) {
      calibratingRef.current = false;
      setCalibrating(false);
      calibPointsRef.current = [];
      return;
    }
    calibratingRef.current = true;
    setCalibrating(true);
    calibPointsRef.current = [];
    toast.info("Click 2 points on a line whose real length you know.");
  };

  // ── Undo / clear ───────────────────────────────────────────────────
  const handleUndo = () => {
    const fc = fabricRef.current;
    if (!fc) return;
    const objs = fc
      .getObjects()
      .filter((o) => o !== (bgImageRef.current as unknown as fabric.Object));
    if (objs.length > 0) fc.remove(objs[objs.length - 1]);
  };
  const handleClearAll = () => {
    const fc = fabricRef.current;
    if (!fc) return;
    if (!window.confirm("Clear all annotations?")) return;
    for (const o of fc.getObjects().slice()) {
      if (o !== (bgImageRef.current as unknown as fabric.Object)) fc.remove(o);
    }
    stripItemsRef.current = [];
  };

  // ── Save (persist progress; on a Master, also creates/updates the
  // corresponding Work Drawing child — the editor's one primary action) ──
  const handleSaveProgress = async () => {
    const fc = fabricRef.current;
    if (!fc || !activeDrawing || !cropRect || !editorMode) return;

    await saveDrawingView({
      drawingId: activeDrawing.id,
      pageNumber: currentPage,
      cropRect,
      editorMode,
      fabricJSON: JSON.stringify(fc.toJSON(["role", "colorClass"])),
      canvasWidth: fc.getWidth(),
      canvasHeight: fc.getHeight(),
      titleBlock,
      createdBy: userId,
      createdByName: userName,
    });
    addAuditLog({
      module: "drawing_editor",
      action: "update",
      entityId: activeDrawing.id,
      entityLabel: `${activeDrawing.fileName} — progress saved`,
      changedBy: userName,
    });

    if (!activeDrawing.sourceDesignFileId) {
      // Editing a Work Drawing (or any non-Master) directly — Save only
      // ever touches this one record, same as always.
      toast.success("Progress saved");
      return;
    }

    if (sessionChildIdRef.current) {
      // Continued Save on the same crop this session — update that same
      // Work Drawing rather than spawning another one.
      await saveDrawingView({
        drawingId: sessionChildIdRef.current,
        pageNumber: currentPage,
        cropRect,
        editorMode,
        fabricJSON: JSON.stringify(fc.toJSON(["role", "colorClass"])),
        canvasWidth: fc.getWidth(),
        canvasHeight: fc.getHeight(),
        titleBlock,
        createdBy: userId,
        createdByName: userName,
      });
      toast.success("Progress saved");
      return;
    }

    // First Save of a new crop on the Master — this crop needs its own
    // Work Drawing. Ask what to call it, then create + save it below.
    const existingChildren = await getChildDrawings(activeDrawing.id);
    setPendingChildName(
      `${activeDrawing.fileName.replace(/\.pdf$/i, "")} - Work Drawing ${existingChildren.length + 1}`,
    );
    setNamingDialogOpen(true);
  };

  const handleConfirmChildName = async () => {
    const fc = fabricRef.current;
    if (!fc || !activeDrawing || !cropRect || !editorMode) return;
    const name = pendingChildName.trim();
    if (!name) return;

    const child = await createProductionDrawing(activeDrawing.id, {
      newFileName: name,
      createdBy: userId,
      createdByName: userName,
    });
    await saveDrawingView({
      drawingId: child.id,
      pageNumber: currentPage,
      cropRect,
      editorMode,
      fabricJSON: JSON.stringify(fc.toJSON(["role", "colorClass"])),
      canvasWidth: fc.getWidth(),
      canvasHeight: fc.getHeight(),
      titleBlock,
      createdBy: userId,
      createdByName: userName,
    });
    sessionChildIdRef.current = child.id;
    addAuditLog({
      module: "drawing_editor",
      action: "create",
      entityId: child.id,
      entityLabel: `${child.fileName} (Work Drawing from ${activeDrawing.fileName})`,
      changedBy: userName,
    });
    setNamingDialogOpen(false);
    toast.success(`"${child.fileName}" saved`);
  };

  // ── Render ───────────────────────────────────────────────────────

  if (!activeDrawing) {
    return (
      <div className="space-y-4" data-ocid="drawing_editor.page">
        <div>
          <h1 className="text-xl font-bold">Drawing Repository</h1>
          <p className="text-sm text-muted-foreground">
            Search, browse, and administer every drawing across projects,
            machines, and the library — ownership, categories, and cross-project
            links. For day-to-day editing, open a drawing from its Project or
            Machine instead; this screen is for search/admin, not the primary
            editing workflow.
          </p>
        </div>
        <DrawingsListPanel
          drawings={drawings}
          links={links}
          projects={projectOptions}
          machines={machineOptions}
          vendors={vendorOptions}
          customers={customerOptions}
          canDelete={canDelete}
          canEdit={canEdit}
          onUpload={handleUpload}
          onOpen={handleEditRepositoryDrawing}
          openLabel="Edit"
          onDelete={handleDeleteDrawing}
          onRename={handleRenameDrawing}
          onChangeOwner={handleChangeOwner}
          onDuplicate={handleDuplicateDrawing}
          onAddLink={handleAddLink}
          onRemoveLink={handleRemoveLink}
          initialOwnerType={
            initialOwnerType ?? (lastProjectId ? "project" : undefined)
          }
          initialOwnerId={initialOwnerId ?? lastProjectId}
          onOwnerFilterChange={handleOwnerFilterChange}
          onPreview={handlePreviewEngineering}
          onPreviewOriginal={handlePreviewOriginal}
          onPrint={handlePrintDrawing}
          previewLabel="Preview Engineering Drawing"
        />
        <DesignFilePreviewDialog
          file={previewOriginal}
          open={!!previewOriginal}
          onOpenChange={(o) => !o && setPreviewOriginal(null)}
          onDownload={(f) => {
            const a = document.createElement("a");
            a.href = f.fileData;
            a.download = f.fileName;
            a.click();
          }}
        />
        <WorkDrawingPreviewDialog
          drawing={previewWorkDrawing}
          open={!!previewWorkDrawing}
          onOpenChange={(o) => !o && setPreviewWorkDrawing(null)}
          company={{
            companyName: settings?.companyName || "Your Company",
            companyLogoDataUrl: settings?.companyLogo || undefined,
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3" data-ocid="drawing_editor.page">
      <div className="flex items-center gap-2">
        {contextLocked ? (
          onExitContext && (
            <button
              type="button"
              onClick={onExitContext}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              data-ocid="drawing_editor.back_to_context"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to {initialOwnerType === "machine" ? "Machine" : "Project"}
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={backToList}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            data-ocid="drawing_editor.back_to_list"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All Drawings
          </button>
        )}
        <span className="text-xs text-muted-foreground">/</span>
        <span className="text-xs font-medium">{activeDrawing.fileName}</span>
      </div>

      {phase === "annotate" && (
        <EditorHeaderBar
          editMode={globalEditMode}
          onEditModeChange={handleGlobalEditModeChange}
          pageLabel={`${currentPage} / ${activeDrawing.numPages}`}
          editorModeLabel={
            editorMode === "vector"
              ? "📐 Vector"
              : editorMode === "pixel"
                ? "🖼 Pixel"
                : "📄 Original"
          }
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_300px] gap-3">
        <div
          className={cn(
            "border rounded-md p-2 overflow-y-auto max-h-[75vh]",
            phase === "annotate" && "hidden lg:block",
          )}
        >
          <PageThumbnailList
            thumbnails={thumbnails}
            currentPage={currentPage}
            onSelect={loadPage}
          />
        </div>

        <div className="border rounded-md bg-muted/20 overflow-auto max-h-[75vh] flex items-center justify-center p-4">
          <div
            className="relative bg-white shadow-lg"
            style={{ display: phase === "select" ? "block" : "none" }}
          >
            <canvas
              ref={pageCanvasRef}
              data-ocid="drawing_editor.page_canvas"
            />
            <canvas
              ref={overlayCanvasRef}
              className="absolute top-0 left-0 cursor-crosshair"
              data-ocid="drawing_editor.overlay_canvas"
            />
          </div>
          <div
            style={{ display: phase === "annotate" ? "block" : "none" }}
            className="bg-white shadow-lg"
          >
            <canvas
              ref={fabricHostRef}
              data-ocid="drawing_editor.fabric_canvas"
            />
          </div>
        </div>

        <div className="border rounded-md p-3 overflow-y-auto max-h-[75vh] space-y-4">
          {phase === "select" && (
            <RegionSelector
              mode={selectionMode}
              onModeChange={setSelectionMode}
              detectedViews={detectedViews}
              onDetectedViewSelect={(v: DetectedView) =>
                setCropRect({ x: v.x, y: v.y, w: v.w, h: v.h })
              }
              zoom={zoom}
              onZoomChange={(z) => {
                setZoom(z);
                loadPage(currentPage);
              }}
              onResetCrop={() => setCropRect(null)}
              onConfirm={handleConfirmSelection}
              canConfirm={!!cropRect && cropRect.w >= 20 && cropRect.h >= 20}
            />
          )}

          {phase === "annotate" && editorMode && (
            <>
              {editorMode === "vector" && (
                <VectorModePanel
                  objectCount={
                    vectorFabricRef.current.filter((e) => !e.hidden).length
                  }
                  onDeleteBlue={() =>
                    deleteVectorObjects(
                      (e) =>
                        e.colorClass === "BLUE" ||
                        e.role === "DIMENSION" ||
                        e.role === "DIMENSION_NUM",
                    )
                  }
                  onDeleteRed={() =>
                    deleteVectorObjects(
                      (e) => e.colorClass === "RED" || e.role === "LEADER",
                    )
                  }
                  onKeepBlack={() => {
                    if (
                      !window.confirm(
                        "Delete everything that is not black geometry?",
                      )
                    )
                      return;
                    deleteVectorObjects(
                      (e) => e.role !== "GEOMETRY" && e.role !== "LABEL",
                    );
                  }}
                  onInvertSelection={() => {
                    const fc = fabricRef.current;
                    if (!fc) return;
                    const sel = new Set(fc.getActiveObjects());
                    const newSel = vectorFabricRef.current
                      .filter((e) => !e.hidden && !sel.has(e.obj))
                      .map((e) => e.obj);
                    fc.discardActiveObject();
                    if (newSel.length) {
                      const grp = new fabric.ActiveSelection(newSel, {
                        canvas: fc,
                      });
                      fc.setActiveObject(grp);
                    }
                    fc.renderAll();
                  }}
                  onRestoreHidden={() => {
                    let count = 0;
                    const fc = fabricRef.current;
                    for (const entry of vectorFabricRef.current) {
                      if (entry.hidden && !entry.deleted) {
                        fc?.add(entry.obj);
                        entry.hidden = false;
                        count++;
                      }
                    }
                    fc?.renderAll();
                    toast.success(`Restored ${count} hidden objects`);
                  }}
                />
              )}
              {editorMode === "pixel" && (
                <PixelModePanel
                  onAutoStrip={handleAutoStrip}
                  onNukeStrip={handleNukeStrip}
                  onRestoreAll={handleRestoreAllStripped}
                  onCalibrate={handleCalibrate}
                  calibrating={calibrating}
                  calibrationStatus={calibrationStatus}
                />
              )}
              {editorMode === "original" && <OriginalModePanel />}

              <AnnotationToolPanel
                editorMode={editorMode}
                tool={tool}
                onToolChange={setTool}
                color={color}
                onColorChange={setColor}
                strokeWidth={strokeWidth}
                onStrokeWidthChange={setStrokeWidth}
                brushSize={brushSize}
                onBrushSizeChange={setBrushSize}
                textValue={textValue}
                onTextValueChange={setTextValue}
                onUndo={handleUndo}
                onClear={handleClearAll}
              />

              <div className="pt-2 border-t">
                <h3 className="text-xs font-semibold mb-2">Title Block</h3>
                <TitleBlockForm value={titleBlock} onChange={setTitleBlock} />
              </div>

              {canEdit && (
                <ExportPanel onSave={handleSaveProgress} canSave={canEdit} />
              )}
            </>
          )}
        </div>
      </div>

      <ModeSelectionModal
        open={modeModalOpen}
        vectorRecommended={vectorModeDetected}
        onChoose={proceedWithMode}
        onCancel={() => setModeModalOpen(false)}
      />

      <Dialog open={namingDialogOpen} onOpenChange={setNamingDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Name this Work Drawing</DialogTitle>
          </DialogHeader>
          <Input
            value={pendingChildName}
            onChange={(e) => setPendingChildName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleConfirmChildName();
            }}
            autoFocus
            data-ocid="drawing_editor.name_child_input"
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setNamingDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!pendingChildName.trim()}
              onClick={handleConfirmChildName}
              data-ocid="drawing_editor.name_child_confirm"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {globalEditMode === "numberOnly" && floatToolbar && (
        <FloatingNumberToolbar
          position={floatToolbar.position}
          fontSize={floatToolbar.fontSize}
          color={floatToolbar.color}
          bold={floatToolbar.bold}
          onFontSizeChange={(n) => {
            setFloatToolbar((s) => (s ? { ...s, fontSize: n } : s));
            const active = fabricRef.current?.getActiveObject();
            if (active) {
              (active as fabric.IText).set({ fontSize: n });
              fabricRef.current?.renderAll();
            }
          }}
          onColorChange={(c) => {
            setFloatToolbar((s) => (s ? { ...s, color: c } : s));
            const active = fabricRef.current?.getActiveObject();
            if (active) {
              active.set({ fill: c });
              fabricRef.current?.renderAll();
            }
          }}
          onToggleBold={() => {
            setFloatToolbar((s) => (s ? { ...s, bold: !s.bold } : s));
            const active = fabricRef.current?.getActiveObject() as
              | fabric.IText
              | undefined;
            if (active) {
              const isBold =
                active.fontWeight === "bold" || active.fontWeight === 700;
              active.set({ fontWeight: isBold ? "normal" : "bold" });
              fabricRef.current?.renderAll();
            }
          }}
          onClose={() => setFloatToolbar(null)}
        />
      )}
    </div>
  );
}
