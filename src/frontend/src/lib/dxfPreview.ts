// Client-side, read-only DXF preview renderer for the generic Design Files
// Quick Look (components/DesignFilePreviewDialog.tsx) ONLY.
//
// Deliberately isolated from drawingEditor/ — this never touches the
// Drawing Editor's canvas, Zustand store, or drawing_views persistence. It
// only ever builds a throwaway, non-interactive fabric.Canvas purely for
// viewing a DXF. There is no editing, no saving, no undo/redo here — that
// is explicitly out of scope for this phase (see task spec section 2/13).
//
// Entity scope: LINE, LWPOLYLINE/POLYLINE, CIRCLE, ARC, TEXT, plus a simple
// per-layer visibility list and the 9 standard ACI colors. INSERT (block
// references) are resolved by recursively walking the referenced block's
// own entities through the same conversion, so a DXF built from repeated
// blocks (a very common way multi-view/multi-sheet drawings are authored)
// renders completely instead of showing only whatever wasn't a block.
// ELLIPSE, SPLINE, DIMENSION, and MTEXT are still intentionally skipped
// (not rendered), not approximated incorrectly. Model space only — DXF
// PAPER SPACE layouts are a separate, larger feature (a sheet/layout
// switcher UI) and are not part of this pass; see the block-resolution
// comment below for exactly what "layouts" means here and why it's out
// of scope for now.
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
  // INSERT (block reference) fields — matches dxf-parser's IInsertEntity.
  // `name` looks up the referenced definition in ParsedDxf.blocks;
  // `position` here is the insertion point (distinct from `startPoint`,
  // which TEXT uses) — only ever set on an INSERT entity.
  name?: string;
  xScale?: number;
  yScale?: number;
  rotation?: number;
  position?: { x: number; y: number; z?: number };
}

/** A DXF block definition — a named, reusable group of entities. dxf-parser
 * already parses these (and even flags which are paper-space); this app
 * simply hadn't been reading them until now. `position` is the block's own
 * local origin — every entity inside is defined relative to it, so an
 * INSERT must subtract it before applying the insert's own placement. */
export interface ParsedDxfBlock {
  entities: ParsedDxfEntity[];
  position?: { x: number; y: number; z?: number };
}

export interface ParsedDxf {
  entities: ParsedDxfEntity[];
  blocks?: Record<string, ParsedDxfBlock>;
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

/** A 2D point transform: block-local coordinates in, placed/world
 * coordinates out. Identity for top-level (non-block) entities. */
type XY = (x: number, y: number) => { x: number; y: number };
const IDENTITY_XY: XY = (x, y) => ({ x, y });

/** Composes the transform an INSERT applies to its block's entities:
 * subtract the block's own local origin, scale, rotate, then translate to
 * the insertion point — the standard DXF block-reference placement. Only
 * uniform-ish scale is representable on CIRCLE/ARC (a true non-uniform
 * scale turns a circle into an ellipse, which isn't one of the supported
 * primitives); this averages xScale/yScale for radius, a documented
 * simplification, not a bug, matching this file's existing approach to
 * bulge on polylines. */
function makeInsertTransform(
  block: ParsedDxfBlock,
  insert: ParsedDxfEntity,
): XY {
  const base = block.position ?? { x: 0, y: 0 };
  const ins = insert.position ?? { x: 0, y: 0 };
  const rad = ((insert.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const sx = insert.xScale ?? 1;
  const sy = insert.yScale ?? 1;
  return (x, y) => {
    const lx = (x - base.x) * sx;
    const ly = (y - base.y) * sy;
    return {
      x: lx * cos - ly * sin + ins.x,
      y: lx * sin + ly * cos + ins.y,
    };
  };
}

/** Maximum INSERT nesting depth to walk (a block referencing a block
 * referencing a block, and so on) — guards against a malformed/circular
 * DXF (block A inserts block A) hanging the parse instead of skipping the
 * offending reference. Real-world drawings are rarely more than 2-3
 * levels deep, so this is generous headroom, not a real limitation. */
const MAX_INSERT_DEPTH = 8;

/** Converts parsed DXF entities into fabric.Object instances. DXF is
 * Y-up; canvas is Y-down, so every Y coordinate is negated once here
 * ("flip") rather than fighting it with a canvas-level transform.
 *
 * INSERT entities are resolved by recursively converting the referenced
 * block's own entities through this same function, composing the block's
 * placement transform (see makeInsertTransform) with whatever transform
 * this call itself was invoked under — so a block inserted inside another
 * inserted block still lands in the right place. */
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

  function walk(entities: ParsedDxfEntity[], toWorld: XY, depth: number) {
    for (const entity of entities) {
      const layer = entity.layer ?? "0";
      layerSet.add(layer);
      const stroke = resolveColor(entity, dxf);
      let obj: fabric.Object | null = null;

      switch (entity.type) {
        case "LINE": {
          const [p1, p2] = entity.vertices ?? [];
          if (!p1 || !p2) break;
          const w1 = toWorld(p1.x, p1.y);
          const w2 = toWorld(p2.x, p2.y);
          const y1 = flip(w1.y);
          const y2 = flip(w2.y);
          track(w1.x, y1);
          track(w2.x, y2);
          obj = new fabric.Line([w1.x, y1, w2.x, y2], {
            stroke,
            strokeWidth: 1,
            ...commonOpts,
          });
          break;
        }
        case "LWPOLYLINE":
        case "POLYLINE": {
          const pts = (entity.vertices ?? []).map((v) => {
            const w = toWorld(v.x, v.y);
            const y = flip(w.y);
            track(w.x, y);
            return { x: w.x, y };
          });
          if (pts.length < 2) break;
          // Bulge (curved polyline segments) is rendered as a straight
          // segment — a documented simplification, not a bug.
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
          const wc = toWorld(entity.center.x, entity.center.y);
          const cy = flip(wc.y);
          // Radius scale under an INSERT: measure how far toWorld() moves a
          // unit vector — length is preserved by rotation, so this is
          // exactly the local-to-world scale factor along X, composed
          // through any nesting. 1 (no change) for top-level entities,
          // where toWorld is the identity transform. Only the X-scale is
          // used — see makeInsertTransform's doc comment on non-uniform
          // scale.
          const origin = toWorld(0, 0);
          const unitX = toWorld(1, 0);
          const scale = Math.hypot(unitX.x - origin.x, unitX.y - origin.y);
          const r = entity.radius * scale;
          track(wc.x - r, cy - r);
          track(wc.x + r, cy + r);
          obj = new fabric.Circle({
            left: wc.x - r,
            top: cy - r,
            radius: r,
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
          const wStart = toWorld(
            center.x + radius * Math.cos(startAngle),
            center.y + radius * Math.sin(startAngle),
          );
          const wEnd = toWorld(
            center.x + radius * Math.cos(endAngle),
            center.y + radius * Math.sin(endAngle),
          );
          const wc = toWorld(center.x, center.y);
          // Same scale derivation as CIRCLE — see that case's comment.
          const origin = toWorld(0, 0);
          const unitX = toWorld(1, 0);
          const scale = Math.hypot(unitX.x - origin.x, unitX.y - origin.y);
          const r = radius * scale;
          const sx = wStart.x;
          const sy = flip(wStart.y);
          const ex = wEnd.x;
          const ey = flip(wEnd.y);
          track(wc.x - r, flip(wc.y) - r);
          track(wc.x + r, flip(wc.y) + r);
          let sweep = endAngle - startAngle;
          while (sweep < 0) sweep += Math.PI * 2;
          const largeArc = sweep > Math.PI ? 1 : 0;
          // Y-flip reverses visual arc direction, so sweep-flag=1 here
          // matches DXF's always-CCW start->end convention on screen.
          const d = `M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey}`;
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
          const w = toWorld(entity.startPoint.x, entity.startPoint.y);
          const y = flip(w.y);
          track(w.x, y);
          obj = new fabric.Text(entity.text, {
            left: w.x,
            top: y,
            fontSize: entity.textHeight || 2.5,
            fill: stroke,
            ...commonOpts,
          });
          break;
        }
        case "INSERT": {
          const block = entity.name ? dxf.blocks?.[entity.name] : undefined;
          if (!block || depth >= MAX_INSERT_DEPTH) {
            skipped.add(
              depth >= MAX_INSERT_DEPTH
                ? "INSERT (too deep)"
                : "INSERT (block missing)",
            );
            break;
          }
          const blockToParent = makeInsertTransform(block, entity);
          const composed: XY = (x, y) => {
            const p = blockToParent(x, y);
            return toWorld(p.x, p.y);
          };
          walk(block.entities, composed, depth + 1);
          continue; // no single fabric.Object for INSERT itself
        }
        default:
          // ELLIPSE, SPLINE, DIMENSION, MTEXT — deferred by design.
          // Recorded, not rendered.
          skipped.add(entity.type);
          break;
      }
      if (obj) {
        (obj as fabric.Object & { dxfLayer?: string }).dxfLayer = layer;
        objects.push(obj);
      }
    }
  }

  walk(dxf.entities ?? [], IDENTITY_XY, 0);

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
  // setWidth/setHeight clear the canvas's backing bitmap (standard HTML
  // canvas behaviour whenever width/height attributes change) — so the
  // background is transparent again at this point regardless of scene
  // content, until the next render paints it back in. The empty-scene
  // branch below used to return before any render happened at all, which
  // left exactly that transparent, just-resized canvas on screen — the
  // single biggest concrete cause of the reported transparent background,
  // since a DXF dominated by not-yet-supported entity types (or one whose
  // renderable content is entirely inside blocks that failed to resolve)
  // produces a scene with no bbox. Rendering unconditionally, on every
  // path, fixes that class of case and removes the gap entirely rather
  // than papering over one symptom of it.
  if (!scene.bbox || width <= 0 || height <= 0) {
    canvas.renderAll();
    return 1;
  }
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
  // Synchronous render (not requestRenderAll's rAF-deferred one): callers
  // that immediately export the canvas (Edit's offscreen rasterize step
  // in DrawingEditorPage.tsx) must not race a scheduled-but-not-yet-run
  // paint. On-screen callers (Preview) still repaint correctly — this is
  // strictly more deterministic, never less.
  canvas.renderAll();
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
