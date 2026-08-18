// Engineering Drawing Editor — a fully isolated ERP module. Mirrors the qms/
// module's shape (own IndexedDB database, own Zustand store, own api layer)
// deliberately: see drawingEditor/db/database.ts for why it doesn't share
// storage with either the main ERP store or QMS.

export interface DrawingDocument {
  id: string;
  fileName: string;
  /** Present only when explicitly fetched — via getDrawing(id) or the
   * dedicated getDrawingPdfBlob(id) helper (both in api/drawings.ts).
   * Every list/lookup function (getAllDrawings, getDrawingsByProject,
   * getDrawingsByOwner, getChildDrawings, and the
   * findMasterDrawingBySourceDesignFile/findWorkingDrawingByOriginal
   * lookups) returns this absent — the PDF itself lives in Supabase
   * Storage (Phase 14) and is fetched on demand, not eagerly downloaded
   * just to render a list/tree row. */
  /** Despite the name, this is now the generic *source* blob for any
   * sourceKind (Phase 34) — a PDF for "pdf", raw DXF text bytes for "dxf",
   * an image file for "image". Kept as `pdfBlob` rather than renamed to
   * minimize churn across every existing PDF-only call site; the meaning
   * is "whatever was uploaded", not literally "always a PDF". */
  pdfBlob?: Blob;
  numPages: number;
  /** Phase 34 — which kind of file this drawing was promoted from, and
   * therefore how the editor's loading step must interpret `pdfBlob`.
   * Absent = "pdf", the only kind that existed before this field — every
   * pre-Phase-34 row keeps working unchanged. DXF and image both still
   * flow through the exact same crop → mode-select → annotate → save
   * pipeline as PDF; this field only changes how the initial page raster
   * (and, for DXF, vector objects) gets produced. See
   * pages/DrawingEditorPage.tsx's openDrawing/loadPage. */
  sourceKind?: "pdf" | "dxf" | "image";
  /** Optional link to an ERP Project — kept for backward compatibility with
   * every drawing uploaded before ownerType/ownerId existed, and as the
   * convenience field for the (still most common) project-owned case.
   * When ownerType is "project", ownerId === projectId. */
  projectId?: string;
  /** Primary owner classification. Missing on legacy records — treat as
   * `ownerType ?? (projectId ? "project" : "unassigned")` at every read
   * site rather than backfilling, per this app's usual optional-field
   * convention. "library" drawings (dies, CNC programs, standard drawings,
   * templates — reusable company assets, not tied to one job) have no
   * single ownerId; `category` carries their grouping instead. */
  ownerType?: "project" | "machine" | "library";
  /** projectId or machineId depending on ownerType; undefined for library
   * drawings. */
  ownerId?: string;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: number;
  updatedAt: number;
  /** Schema-ready, no dedicated UI to set these yet. Included in search
   * now so a future metadata pass doesn't need another migration. */
  notes?: string;
  tags?: string[];
  /** For project/machine drawings this is a free-form label. For
   * ownerType "library" this is the collection the drawing lives in. */
  category?:
    | "CNC Program"
    | "Die Drawing"
    | "Tooling"
    | "Machine Setup"
    | "Standard Drawing"
    | "Template"
    | "Other";
  /** Lineage, not usage — the Master (or intermediate) drawing this one was
   * derived from via "Save as Production Drawing". undefined = root (a
   * Master, or any drawing with no parent). A single FK, not a join table,
   * because a child has exactly one parent (tree), unlike DrawingLink which
   * is genuinely many-to-many. Distinct from `duplicateDrawing`'s existing
   * Rev-A→B revision cloning — a child coexists permanently alongside its
   * parent and siblings rather than replacing a predecessor. */
  parentDrawingId?: string;
  /** True once this drawing has been promoted from (or is still linked to)
   * a Project's Design Files as its editable Master. Set the first time
   * "Edit" is clicked on a Design File — see api/drawings.ts
   * promoteDesignFile(). The source DesignFile itself is never modified or
   * removed; it remains the permanent, unedited customer reference. */
  sourceDesignFileId?: string;
  /** The Repository Original this hidden Working Drawing was created from,
   * via clicking "Edit". undefined on every other drawing (Originals,
   * Design File Masters, Production Drawings). A drawing with this set is
   * never rendered as its own row anywhere — DrawingsListPanel filters it
   * out of every list/tree pool; it exists purely as the thing the Editor
   * operates on. Distinct from parentDrawingId (Design Files' Master→
   * Production tree) and sourceDesignFileId (DesignFile→Master bridge):
   * this is Drawing→Drawing, Repository-only, and there is always at most
   * one per Original (see api/drawings.ts findWorkingDrawingByOriginal).
   * The Original's own pdfBlob is never touched by anything that creates
   * or edits this Working Drawing. */
  originalDrawingId?: string;
}

/** Optional many-to-many reference from a drawing to another entity,
 * without duplicating the drawing itself — e.g. a Die Drawing whose
 * primary owner is the Repository (ownerType "library") can still be
 * linked to several Projects and a Vendor. One row in `drawings`, N small
 * rows here. */
export interface DrawingLink {
  id: string;
  drawingId: string;
  // Phase 43 — "die" added to reuse this exact many-to-many table for the
  // Dies module's mandatory drawing linkage (database/phase-43 widened the
  // matching Postgres check constraint). No new table, no duplicate
  // drawing storage — the Drawing Repository stays the sole source of
  // truth for every drawing's actual content.
  linkedType: "project" | "machine" | "vendor" | "customer" | "die";
  linkedId: string;
  createdAt: number;
}

export type EditorMode = "vector" | "pixel" | "original";

export type AnnotationTool =
  | "select"
  | "magic"
  | "lasso"
  | "brush"
  | "whiteout"
  | "text"
  | "highlight"
  | "arrow"
  | "dimline"
  | "circle"
  | "rect";

export const ORIGINAL_MODE_ALLOWED_TOOLS: AnnotationTool[] = [
  "select",
  "text",
  "arrow",
  "circle",
  "rect",
  "highlight",
];

export const ANNOTATION_COLORS = [
  "#ff0000",
  "#0066ff",
  "#00aa00",
  "#ff9900",
  "#000000",
  "#ffffff",
] as const;

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TitleBlockFields {
  partNo: string;
  partName: string;
  operation: string;
  quantity: string;
  material: string;
  gauge: string;
  finish: string;
  tolerance: string;
  revision: string;
  jobCard: string;
  operator: string;
  machine: string;
  date: string;
}

export const EMPTY_TITLE_BLOCK: TitleBlockFields = {
  partNo: "",
  partName: "",
  operation: "",
  quantity: "",
  material: "",
  gauge: "",
  finish: "",
  tolerance: "± 0.5",
  revision: "R0",
  jobCard: "",
  operator: "",
  machine: "",
  date: "",
};

/** One produced work instruction: a page + crop region + fully edited
 * Fabric canvas state. Storing fabric.Canvas.toJSON() verbatim means this
 * doubles as the seam for future revision history — later revisions are
 * just additional DrawingView rows for the same (drawingId, pageNumber). */
export interface DrawingView {
  id: string;
  drawingId: string;
  pageNumber: number;
  cropRect: CropRect;
  editorMode: EditorMode;
  /** fabric.Canvas.toJSON() result, JSON.stringify'd. */
  fabricJSON: string;
  /** The fabric canvas's pixel width/height at the moment of this save —
   * object coordinates inside fabricJSON are absolute to this size, and it
   * varies with the saving viewer's window (see buildFabricCanvas's
   * fitScale). Needed to reconstruct pixel-accurate output headlessly
   * (Preview/Print), where there's no live canvas to inherit a size from.
   * Optional only so older saved views (from before this field existed)
   * don't break — composeLatestView falls back to a sensible default. */
  canvasWidth?: number;
  canvasHeight?: number;
  titleBlock: TitleBlockFields;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  updatedAt: number;
  exportCount: number;
}

/** Per-user "remember my choice" preference for the mode-selection modal —
 * stored inside the ERP (this DB) rather than raw localStorage. */
export interface UserEditorPreference {
  id: string; // = userId
  userId: string;
  rememberedMode?: EditorMode;
  /** Last project selected in the global (unfocused) editor — reapplied on
   * next cold open instead of resetting to "All Projects". */
  lastProjectId?: string;
  updatedAt: number;
}

// ── Vector parsing (Vector Mode) ──────────────────────────────────

export type VectorColorClass = "BLUE" | "RED" | "BLACK" | "OTHER";
export type VectorRole =
  | "GEOMETRY"
  | "DIMENSION"
  | "LEADER"
  | "DIMENSION_NUM"
  | "TEXT"
  | "LABEL";

export interface VectorPathSegment {
  type: "M" | "L" | "C" | "R" | "Z";
  pts: number[];
}

export interface VectorPathObject {
  kind: "path";
  segments: VectorPathSegment[];
  strokeColor: [number, number, number];
  fillColor: [number, number, number];
  lineWidth: number;
  hasStroke: boolean;
  hasFill: boolean;
  rect: CropRect;
  ctm: number[];
  colorClass: VectorColorClass;
  role: VectorRole;
}

export interface VectorTextObject {
  kind: "text";
  str: string;
  rect: CropRect;
  strokeColor: [number, number, number];
  colorClass: VectorColorClass;
  role: VectorRole;
}

export type VectorObject = VectorPathObject | VectorTextObject;

export interface DetectedView {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

export interface PageTextItem {
  x: number;
  y: number;
  w: number;
  h: number;
  str: string;
}
