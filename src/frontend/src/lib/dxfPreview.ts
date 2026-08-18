// Client-side, read-only DXF preview renderer for the generic Design Files
// Quick Look (components/DesignFilePreviewDialog.tsx) ONLY.
//
// Deliberately isolated from drawingEditor/ — this never touches the
// Drawing Editor's canvas, Zustand store, or drawing_views persistence. It
// only ever builds a throwaway, non-interactive fabric.Canvas purely for
// viewing a DXF. There is no editing, no saving, no undo/redo here — that
// is explicitly out of scope for this phase (see task spec section 2/13).
//
// Phase 1 entity scope: LINE, LWPOLYLINE/POLYLINE, CIRCLE, ARC, TEXT, plus
// a simple per-layer visibility list and the 9 standard ACI colors.
// ELLIPSE, SPLINE, DIMENSION, and BLOCK/INSERT are intentionally skipped
// (not rendered), not approximated incorrectly.
//
// Parsing (dxf-parser, CPU-heavy on large files) runs in a Web Worker via
// parseDxfInWorker — see dxfWorker.ts. Geometry conversion below runs on
// the main thread because fabric.Object construction needs a real canvas
// context; it is cheap relative to parsing.

import { fabric } from "fabric";

// NOTE: this module is only ever reached via a dynamic import() from
// DesignFilePreviewDialog.tsx (never a static top-level import) — that is
// what keeps `fabric` (and dxf-parser, imported by dxfWorker.ts) out of
// every other page's bundle. Do not add a static `import ... from
// "./dxfPreview"` anywhere; it would defeat that isolation.

export interface ParsedDxfEntity {
  type: string;
  layer?: string;
  colorIndex?: number;
  vertices?: { x: number; y: number; z?: number; bulge?: number }[];
  center?: { x: number; y: number; z?: number };
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  startPoint?: { x: number; y: number; z?: number };
  text?: string;
  textHeight?: number;
  shape?: boolean;
}

export interface ParsedDxf {
  entities: ParsedDxfEntity[];
  tables?: { layer?: { layers?: Record<string, { colorIndex?: number }> } };
}

interface WorkerResponse {
  ok: boolean;
  dxf?: ParsedDxf;
  error?: string;
}

/** Spawns one Worker per parse call and terminates it once it responds —
 * keeps DXF parsing off the main thread regardless of file size, with no
 * persistent worker pool to manage. */
export function parseDxfInWorker(text: string): Promise<ParsedDxf> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./dxfWorker.ts", import.meta.url), {
        type: "module",
      });
    } catch (err) {
      reject(
        err instanceof Error ? err : new Error("Could not start DXF worker"),
      );
      return;
    }
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      worker.terminate();
      if (e.data.ok && e.data.dxf) resolve(e.data.dxf);
      else reject(new Error(e.data.error ?? "Failed to parse DXF file"));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || "DXF worker failed"));
    };
    worker.postMessage(text);
  });
}

/** Standard AutoCAD Color Index 1-9 — the well-documented, universally
 * consistent low range every DXF file agrees on. Indices above 9 are not
 * a fixed palette across real-world files/themes; rather than fabricate
 * values, they fall back to black. This is an honest Phase-1 limitation
 * ("basic colors" per spec), not a full ACI palette. */
const ACI_BASIC: Record<number, string> = {
  1: "#FF0000",
  2: "#FFFF00",
  3: "#00FF00",
  4: "#00FFFF",
  5: "#0000FF",
  6: "#FF00FF",
  7: "#000000",
  8: "#414141",
  9: "#808080",
};

function resolveColor(entity: ParsedDxfEntity, dxf: ParsedDxf): string {
  const idx = entity.colorIndex;
  if (idx && idx !== 256 && ACI_BASIC[idx]) return ACI_BASIC[idx];
  // colorIndex 256 = ByLayer (or absent) — fall back to the layer's color.
  const layerColor =
    dxf.tables?.layer?.layers?.[entity.layer ?? "0"]?.colorIndex;
  if (layerColor && ACI_BASIC[layerColor]) return ACI_BASIC[layerColor];
  return "#000000";
}

export interface DxfSceneResult {
  objects: fabric.Object[];
  layerNames: string[];
  bbox: { minX: number; minY: number; maxX: number; maxY: number } | null;
  skippedEntityTypes: string[];
}

/** Converts parsed DXF entities into fabric.Object instances. DXF is
 * Y-up; canvas is Y-down, so every Y coordinate is negated once here
 * ("flip") rather than fighting it with a canvas-level transform. */
export function buildDxfScene(dxf: ParsedDxf): DxfSceneResult {
  const objects: fabric.Object[] = [];
  const layerSet = new Set<string>();
  const skipped = new Set<string>();
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const track = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  const flip = (y: number) => -y;
  const commonOpts = {
    selectable: false,
    evented: false,
    hoverCursor: "default",
  } as const;

  for (const entity of dxf.entities ?? []) {
    const layer = entity.layer ?? "0";
    layerSet.add(layer);
    const stroke = resolveColor(entity, dxf);
    let obj: fabric.Object | null = null;

    switch (entity.type) {
      case "LINE": {
        const [p1, p2] = entity.vertices ?? [];
        if (!p1 || !p2) break;
        const y1 = flip(p1.y);
        const y2 = flip(p2.y);
        track(p1.x, y1);
        track(p2.x, y2);
        obj = new fabric.Line([p1.x, y1, p2.x, y2], {
          stroke,
          strokeWidth: 1,
          ...commonOpts,
        });
        break;
      }
      case "LWPOLYLINE":
      case "POLYLINE": {
        const pts = (entity.vertices ?? []).map((v) => {
          const y = flip(v.y);
          track(v.x, y);
          return { x: v.x, y };
        });
        if (pts.length < 2) break;
        // Bulge (curved polyline segments) is rendered as a straight
        // segment for Phase 1 — a documented simplification, not a bug.
        const Ctor = entity.shape ? fabric.Polygon : fabric.Polyline;
        obj = new Ctor(pts, {
          stroke,
          fill: "",
          strokeWidth: 1,
          ...commonOpts,
        });
        break;
      }
      case "CIRCLE": {
        if (!entity.center || !entity.radius) break;
        const cy = flip(entity.center.y);
        track(entity.center.x - entity.radius, cy - entity.radius);
        track(entity.center.x + entity.radius, cy + entity.radius);
        obj = new fabric.Circle({
          left: entity.center.x - entity.radius,
          top: cy - entity.radius,
          radius: entity.radius,
          stroke,
          fill: "",
          strokeWidth: 1,
          ...commonOpts,
        });
        break;
      }
      case "ARC": {
        if (
          !entity.center ||
          entity.radius === undefined ||
          entity.startAngle === undefined ||
          entity.endAngle === undefined
        )
          break;
        const { center, radius, startAngle, endAngle } = entity;
        const sx = center.x + radius * Math.cos(startAngle);
        const sy = flip(center.y + radius * Math.sin(startAngle));
        const ex = center.x + radius * Math.cos(endAngle);
        const ey = flip(center.y + radius * Math.sin(endAngle));
        track(center.x - radius, flip(center.y) - radius);
        track(center.x + radius, flip(center.y) + radius);
        let sweep = endAngle - startAngle;
        while (sweep < 0) sweep += Math.PI * 2;
        const largeArc = sweep > Math.PI ? 1 : 0;
        // Y-flip reverses visual arc direction, so sweep-flag=1 here
        // matches DXF's always-CCW start->end convention on screen.
        const d = `M ${sx} ${sy} A ${radius} ${radius} 0 ${largeArc} 1 ${ex} ${ey}`;
        obj = new fabric.Path(d, {
          stroke,
          fill: "",
          strokeWidth: 1,
          ...commonOpts,
        });
        break;
      }
      case "TEXT": {
        if (!entity.startPoint || !entity.text) break;
        const y = flip(entity.startPoint.y);
        track(entity.startPoint.x, y);
        obj = new fabric.Text(entity.text, {
          left: entity.startPoint.x,
          top: y,
          fontSize: entity.textHeight || 2.5,
          fill: stroke,
          ...commonOpts,
        });
        break;
      }
      default:
        // ELLIPSE, SPLINE, DIMENSION, INSERT/BLOCK, MTEXT — deferred by
        // design (Phase 1 scope, see file header). Recorded, not rendered.
        skipped.add(entity.type);
        break;
    }
    if (obj) {
      (obj as fabric.Object & { dxfLayer?: string }).dxfLayer = layer;
      objects.push(obj);
    }
  }

  return {
    objects,
    layerNames: Array.from(layerSet).sort(),
    bbox: minX === Number.POSITIVE_INFINITY ? null : { minX, minY, maxX, maxY },
    skippedEntityTypes: Array.from(skipped).sort(),
  };
}

/** Computes the zoom that fits the scene's bounding box inside a
 * width x height viewport (with a 10% margin) and applies it — pans so the
 * bbox is centered. Pure function of the ACTUAL measured viewport size;
 * never a hard-coded zoom or a guessed canvas size. Safe to call repeatedly
 * (e.g. from a ResizeObserver) since it only sets zoom/pan, never touches
 * the object list. Returns the zoom applied, so callers (the +/- buttons)
 * can multiply against it. */
export function fitDxfCanvasToViewport(
  canvas: fabric.Canvas,
  scene: DxfSceneResult,
  width: number,
  height: number,
): number {
  canvas.setWidth(width);
  canvas.setHeight(height);
  if (!scene.bbox || width <= 0 || height <= 0) return 1;
  const w = scene.bbox.maxX - scene.bbox.minX || 1;
  const h = scene.bbox.maxY - scene.bbox.minY || 1;
  const margin = 0.9;
  const zoom = Math.min((width / w) * margin, (height / h) * margin);
  canvas.setZoom(zoom);
  const vpt = canvas.viewportTransform;
  if (vpt) {
    vpt[4] = -scene.bbox.minX * zoom + (width - w * zoom) / 2;
    vpt[5] = -scene.bbox.minY * zoom + (height - h * zoom) / 2;
    canvas.setViewportTransform(vpt);
  }
  canvas.requestRenderAll();
  return zoom;
}

/** Creates the read-only fabric.Canvas for a DXF scene and adds every
 * object, plus wires drag-to-pan (objects are non-selectable/non-evented,
 * so any drag is a pan, never an accidental edit — there is no edit path
 * here at all). Does NOT fit/zoom — the caller must call
 * fitDxfCanvasToViewport once it has the container's real measured size
 * (see the ResizeObserver in DesignFilePreviewDialog.tsx). This split
 * exists specifically so the initial fit is never computed against a
 * guessed or hard-coded size. */
export function mountDxfCanvas(
  canvasEl: HTMLCanvasElement,
  scene: DxfSceneResult,
): fabric.Canvas {
  const fc = new fabric.Canvas(canvasEl, {
    selection: false,
    skipTargetFind: true,
    backgroundColor: "#ffffff",
  });
  for (const obj of scene.objects) fc.add(obj);

  let panning = false;
  let lastX = 0;
  let lastY = 0;
  fc.on("mouse:down", (e) => {
    panning = true;
    const p = e.e as MouseEvent;
    lastX = p.clientX;
    lastY = p.clientY;
  });
  fc.on("mouse:move", (e) => {
    if (!panning) return;
    const p = e.e as MouseEvent;
    const vpt = fc.viewportTransform;
    if (!vpt) return;
    vpt[4] += p.clientX - lastX;
    vpt[5] += p.clientY - lastY;
    lastX = p.clientX;
    lastY = p.clientY;
    fc.requestRenderAll();
  });
  fc.on("mouse:up", () => {
    panning = false;
  });

  return fc;
}

/** Applies a layer-visibility map to an already-mounted DXF canvas. */
export function applyDxfLayerVisibility(
  canvas: fabric.Canvas,
  visibility: Record<string, boolean>,
): void {
  for (const obj of canvas.getObjects()) {
    const layer = (obj as fabric.Object & { dxfLayer?: string }).dxfLayer;
    if (layer && layer in visibility) obj.visible = visibility[layer];
  }
  canvas.requestRenderAll();
}
