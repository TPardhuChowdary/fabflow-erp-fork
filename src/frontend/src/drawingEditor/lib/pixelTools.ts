// Pixel Mode cleanup toolkit — magic erase (flood fill), lasso erase, brush
// erase, auto-strip dimensions (text-driven whiteout + blue/red pixel
// stripping), and nuke strip (keep-largest-connected-component). Direct
// port of the blueprint's magicEraseAt/brushEraseAt/lassoErase/
// autoStripDimensions/stripBluePixels/nukeStrip, restructured as
// stateless(ish) functions + one small session class instead of module
// globals, so the calling React component owns all state explicitly.

import { fabric } from "fabric";
import type { CropRect, PageTextItem } from "../types";

function loadFabricImage(
  url: string,
  imgOptions?: fabric.IImageOptions,
): Promise<fabric.Image> {
  return new Promise((resolve) => {
    fabric.Image.fromURL(url, (img) => resolve(img), imgOptions);
  });
}

/** Snapshots a fabric background image's current pixels into a fresh
 * off-screen canvas + ImageData for pixel-level manipulation. */
function snapshotBackground(bgImage: fabric.Image): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  data: ImageData;
  w: number;
  h: number;
} | null {
  const el = bgImage.getElement();
  if (!el) return null;
  const w = (el as HTMLImageElement).naturalWidth || el.width;
  const h = (el as HTMLImageElement).naturalHeight || el.height;
  if (!w || !h) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(el, 0, 0, w, h);
  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
  return { canvas, ctx, data, w, h };
}

async function swapBackground(
  fabricCanvas: fabric.Canvas,
  oldBg: fabric.Image,
  sourceCanvas: HTMLCanvasElement,
): Promise<fabric.Image> {
  const url = sourceCanvas.toDataURL("image/png");
  const newImg = await loadFabricImage(url, {
    left: 0,
    top: 0,
    selectable: false,
    evented: false,
    scaleX: oldBg.scaleX,
    scaleY: oldBg.scaleY,
  });
  fabricCanvas.remove(oldBg);
  fabricCanvas.add(newImg);
  fabricCanvas.sendToBack(newImg);
  fabricCanvas.renderAll();
  return newImg;
}

// ── Auto-Strip Dimensions (text-driven whiteout) ────────────────────

const KEEP_TEXT_PATTERNS = [
  /TOP\s*PLATE/i,
  /BOTTOM\s*COVER/i,
  /LEFT\s*VIEW/i,
  /RIGHT\s*VIEW/i,
  /FRONT\s*VIEW/i,
  /TOP\s*VIEW/i,
  /BOTTOM\s*VIEW/i,
  /ISOMETRIC/i,
  /SECTION/i,
  /VIEW/i,
  /SCALE/i,
];

export function shouldKeepText(str: string): boolean {
  const s = (str || "").trim();
  if (!s) return true;
  return KEEP_TEXT_PATTERNS.some((p) => p.test(s));
}

export interface StripItem {
  textItem: PageTextItem;
  white: fabric.Rect | null;
  ghost: fabric.Rect;
  erased: boolean;
}

function stripRects(
  it: PageTextItem,
  cropRect: CropRect,
  fitScale: number,
): { fx: number; fy: number; fw: number; fh: number } {
  const pad = 1;
  return {
    fx: (it.x - cropRect.x - pad) * fitScale,
    fy: (it.y - cropRect.y - pad) * fitScale,
    fw: (it.w + pad * 2) * fitScale,
    fh: (it.h + pad * 2) * fitScale,
  };
}

/** Whites out every in-crop text item except recognized view labels, each
 * with a faint dashed "ghost" the user can click to restore. Returns the
 * created items — the caller keeps this list in React state and wires
 * `onToggle` via each ghost's mousedown handler (see toggleStripItem). */
export function createAutoStripCovers(
  fabricCanvas: fabric.Canvas,
  pageTextItems: PageTextItem[],
  cropRect: CropRect,
  fitScale: number,
  onToggle: (item: StripItem) => void,
): { items: StripItem[]; strippedCount: number; keptCount: number } {
  const insideItems = pageTextItems.filter(
    (it) =>
      it.x + it.w > cropRect.x &&
      it.x < cropRect.x + cropRect.w &&
      it.y + it.h > cropRect.y &&
      it.y < cropRect.y + cropRect.h,
  );

  const items: StripItem[] = [];
  let strippedCount = 0;
  let keptCount = 0;

  for (const it of insideItems) {
    if (shouldKeepText(it.str)) {
      keptCount++;
      continue;
    }
    const { fx, fy, fw, fh } = stripRects(it, cropRect, fitScale);
    const white = new fabric.Rect({
      left: fx,
      top: fy,
      width: fw,
      height: fh,
      fill: "#ffffff",
      stroke: "#ffffff",
      strokeWidth: 0,
      selectable: false,
      evented: false,
      hoverCursor: "default",
    });
    const ghost = new fabric.Rect({
      left: fx,
      top: fy,
      width: fw,
      height: fh,
      fill: "rgba(255,184,0,0.08)",
      stroke: "#ffb800",
      strokeWidth: 1,
      strokeDashArray: [3, 3],
      selectable: false,
      evented: true,
      hoverCursor: "pointer",
      opacity: 0.6,
    });
    fabricCanvas.add(white);
    fabricCanvas.add(ghost);
    const item: StripItem = { textItem: it, white, ghost, erased: true };
    ghost.on("mousedown", () => onToggle(item));
    items.push(item);
    strippedCount++;
  }
  fabricCanvas.renderAll();
  return { items, strippedCount, keptCount };
}

export function toggleStripItem(
  fabricCanvas: fabric.Canvas,
  item: StripItem,
  cropRect: CropRect,
  fitScale: number,
  onToggle: (item: StripItem) => void,
): void {
  if (item.erased) {
    if (item.white) fabricCanvas.remove(item.white);
    fabricCanvas.remove(item.ghost);
    const it = item.textItem;
    const check = new fabric.Rect({
      left: (it.x - cropRect.x - 2) * fitScale,
      top: (it.y - cropRect.y - 2) * fitScale,
      width: (it.w + 4) * fitScale,
      height: (it.h + 4) * fitScale,
      fill: "transparent",
      stroke: "#00ff88",
      strokeWidth: 1.5,
      strokeDashArray: [2, 2],
      selectable: false,
      evented: true,
      hoverCursor: "pointer",
      opacity: 0.7,
    });
    fabricCanvas.add(check);
    item.white = null;
    item.ghost = check;
    item.erased = false;
    check.on("mousedown", () => onToggle(item));
  } else {
    fabricCanvas.remove(item.ghost);
    const { fx, fy, fw, fh } = stripRects(item.textItem, cropRect, fitScale);
    const white = new fabric.Rect({
      left: fx,
      top: fy,
      width: fw,
      height: fh,
      fill: "#ffffff",
      stroke: "#ffffff",
      strokeWidth: 0,
      selectable: false,
      evented: false,
    });
    const ghost = new fabric.Rect({
      left: fx,
      top: fy,
      width: fw,
      height: fh,
      fill: "rgba(255,184,0,0.08)",
      stroke: "#ffb800",
      strokeWidth: 1,
      strokeDashArray: [3, 3],
      selectable: false,
      evented: true,
      hoverCursor: "pointer",
      opacity: 0.6,
    });
    fabricCanvas.add(white);
    fabricCanvas.add(ghost);
    ghost.on("mousedown", () => onToggle(item));
    item.white = white;
    item.ghost = ghost;
    item.erased = true;
  }
  fabricCanvas.renderAll();
}

export function restoreAllStripped(
  fabricCanvas: fabric.Canvas,
  items: StripItem[],
): void {
  for (const item of items) {
    if (item.white) fabricCanvas.remove(item.white);
    fabricCanvas.remove(item.ghost);
  }
  fabricCanvas.renderAll();
}

export function setGhostsVisibleForExport(
  items: StripItem[],
  fabricCanvas: fabric.Canvas,
  hide: boolean,
): void {
  for (const item of items) item.ghost.set({ opacity: hide ? 0 : 0.6 });
  fabricCanvas.renderAll();
}

// ── Strip blue/red dimension pixels (second pass of auto-strip) ────

/** Whitens crisp + anti-aliased blue/red pixels, then removes small
 * leftover black "arrow stub" blobs. Preserves the (much larger) part
 * outline. Returns the new background image, or null if unreadable
 * (e.g. tainted canvas). */
export async function stripBluePixels(
  fabricCanvas: fabric.Canvas,
  bgImage: fabric.Image,
): Promise<fabric.Image | null> {
  const snap = snapshotBackground(bgImage);
  if (!snap) return null;
  const { ctx, data, w, h } = snap;
  const px = data.data;

  const mark = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      if (r > 235 && g > 235 && b > 235) continue;
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      if (b > r + 18 && b > g + 18 && b > 55) {
        mark[y * w + x] = 1;
        continue;
      }
      if (r > g + 25 && r > b + 25 && r > 75) {
        mark[y * w + x] = 1;
        continue;
      }
      if (mx - mn > 15 && (b > r || r > g + 10)) mark[y * w + x] = 2;
    }
  }
  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    if (mark[p]) {
      px[i] = 255;
      px[i + 1] = 255;
      px[i + 2] = 255;
      px[i + 3] = 255;
    }
  }

  // Arrow-stub cleanup: small connected black blobs left over after the
  // colored lines they touched were erased.
  const visited = new Uint8Array(w * h);
  const isBlack = (idx: number) => {
    const i = idx * 4;
    return px[i] < 110 && px[i + 1] < 110 && px[i + 2] < 110;
  };
  const queue = new Int32Array(w * h);
  const STUB_MAX = Math.max(40, Math.round(w * h * 0.00015));
  for (let p = 0; p < w * h; p++) {
    if (visited[p]) continue;
    if (!isBlack(p)) {
      visited[p] = 1;
      continue;
    }
    let head = 0;
    let tail = 0;
    queue[tail++] = p;
    visited[p] = 1;
    const region: number[] = [];
    while (head < tail && tail < STUB_MAX * 8) {
      const cur = queue[head++];
      region.push(cur);
      const cx = cur % w;
      const cy = (cur / w) | 0;
      const nbrs: number[] = [];
      if (cx > 0) nbrs.push(cur - 1);
      if (cx < w - 1) nbrs.push(cur + 1);
      if (cy > 0) nbrs.push(cur - w);
      if (cy < h - 1) nbrs.push(cur + w);
      for (const n of nbrs) {
        if (visited[n]) continue;
        if (isBlack(n)) {
          visited[n] = 1;
          queue[tail++] = n;
        } else visited[n] = 1;
      }
    }
    if (region.length < STUB_MAX) {
      for (const idx of region) {
        const i = idx * 4;
        px[i] = 255;
        px[i + 1] = 255;
        px[i + 2] = 255;
      }
    }
  }

  ctx.putImageData(data, 0, 0);
  return swapBackground(fabricCanvas, bgImage, snap.canvas);
}

// ── Magic Erase (flood fill by similar color) ───────────────────────

export async function magicEraseAt(
  fabricCanvas: fabric.Canvas,
  bgImage: fabric.Image,
  canvasX: number,
  canvasY: number,
  confirmLargeRegion: (pixelCount: number) => boolean,
): Promise<
  { newBg: fabric.Image; erasedPixels: number } | "white_area" | null
> {
  const snap = snapshotBackground(bgImage);
  if (!snap) return null;
  const { ctx, data, w, h } = snap;
  const px = data.data;

  const bgScaleX = bgImage.scaleX || fabricCanvas.getWidth() / w;
  const bgScaleY = bgImage.scaleY || fabricCanvas.getHeight() / h;
  const startX = Math.round(canvasX / bgScaleX);
  const startY = Math.round(canvasY / bgScaleY);
  if (startX < 0 || startY < 0 || startX >= w || startY >= h) return null;

  const ti = (startY * w + startX) * 4;
  const tr = px[ti];
  const tg = px[ti + 1];
  const tb = px[ti + 2];
  if (tr > 240 && tg > 240 && tb > 240) return "white_area";

  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const start = startY * w + startX;
  queue[tail++] = start;
  visited[start] = 1;
  const region: number[] = [];
  const MAX = Math.round(w * h * 0.05);
  const TOL = 60;
  const match = (idx: number) => {
    const i = idx * 4;
    return (
      Math.abs(px[i] - tr) < TOL &&
      Math.abs(px[i + 1] - tg) < TOL &&
      Math.abs(px[i + 2] - tb) < TOL &&
      !(px[i] > 240 && px[i + 1] > 240 && px[i + 2] > 240)
    );
  };
  while (head < tail && region.length < MAX) {
    const cur = queue[head++];
    region.push(cur);
    const cx = cur % w;
    const cy = (cur / w) | 0;
    const nbrs: number[] = [];
    if (cx > 0) nbrs.push(cur - 1);
    if (cx < w - 1) nbrs.push(cur + 1);
    if (cy > 0) nbrs.push(cur - w);
    if (cy < h - 1) nbrs.push(cur + w);
    if (cx > 0 && cy > 0) nbrs.push(cur - w - 1);
    if (cx < w - 1 && cy > 0) nbrs.push(cur - w + 1);
    if (cx > 0 && cy < h - 1) nbrs.push(cur + w - 1);
    if (cx < w - 1 && cy < h - 1) nbrs.push(cur + w + 1);
    for (const n of nbrs) {
      if (visited[n]) continue;
      visited[n] = 1;
      if (match(n)) queue[tail++] = n;
    }
  }
  if (region.length >= MAX && !confirmLargeRegion(region.length)) return null;

  for (const idx of region) {
    const i = idx * 4;
    px[i] = 255;
    px[i + 1] = 255;
    px[i + 2] = 255;
    px[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  const newBg = await swapBackground(fabricCanvas, bgImage, snap.canvas);
  return { newBg, erasedPixels: region.length };
}

// ── Nuke Strip (keep only the largest connected ink components) ────

export async function nukeStrip(
  fabricCanvas: fabric.Canvas,
  bgImage: fabric.Image,
): Promise<{ newBg: fabric.Image; keptComponents: number } | null> {
  const snap = snapshotBackground(bgImage);
  if (!snap) return null;
  const { ctx, data, w, h } = snap;
  const px = data.data;

  const ink = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      if (!(r > 225 && g > 225 && b > 225)) ink[y * w + x] = 1;
    }
  }

  const labels = new Int32Array(w * h);
  let nextLabel = 1;
  const componentSizes: number[] = [0];
  const queue = new Int32Array(w * h);
  for (let p = 0; p < w * h; p++) {
    if (!ink[p] || labels[p]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = p;
    labels[p] = nextLabel;
    let size = 0;
    while (head < tail) {
      const cur = queue[head++];
      size++;
      const cx = cur % w;
      const cy = (cur / w) | 0;
      const nbrs: number[] = [];
      if (cx > 0) nbrs.push(cur - 1);
      if (cx < w - 1) nbrs.push(cur + 1);
      if (cy > 0) nbrs.push(cur - w);
      if (cy < h - 1) nbrs.push(cur + w);
      if (cx > 0 && cy > 0) nbrs.push(cur - w - 1);
      if (cx < w - 1 && cy > 0) nbrs.push(cur - w + 1);
      if (cx > 0 && cy < h - 1) nbrs.push(cur + w - 1);
      if (cx < w - 1 && cy < h - 1) nbrs.push(cur + w + 1);
      for (const n of nbrs) {
        if (ink[n] && !labels[n]) {
          labels[n] = nextLabel;
          queue[tail++] = n;
        }
      }
    }
    componentSizes.push(size);
    nextLabel++;
  }

  const indices: number[] = [];
  for (let i = 1; i < componentSizes.length; i++) indices.push(i);
  indices.sort((a, b) => componentSizes[b] - componentSizes[a]);

  const biggest = componentSizes[indices[0]] || 1;
  const KEEP_THRESH = biggest * 0.05;
  const keepSet = new Set<number>();
  for (const idx of indices) {
    if (componentSizes[idx] >= KEEP_THRESH) keepSet.add(idx);
    else break;
  }

  for (let p = 0; p < w * h; p++) {
    if (ink[p] && !keepSet.has(labels[p])) {
      const i = p * 4;
      px[i] = 255;
      px[i + 1] = 255;
      px[i + 2] = 255;
      px[i + 3] = 255;
    } else if (ink[p]) {
      const i = p * 4;
      px[i] = 0;
      px[i + 1] = 0;
      px[i + 2] = 0;
      px[i + 3] = 255;
    }
  }

  ctx.putImageData(data, 0, 0);
  const newBg = await swapBackground(fabricCanvas, bgImage, snap.canvas);
  return { newBg, keptComponents: keepSet.size };
}

// ── Brush / Lasso erase session ─────────────────────────────────────

/** Owns a working off-screen canvas across a drag gesture so brush strokes
 * don't re-snapshot the background on every mousemove. Created once per
 * pixel-mode drag, discarded (or `flush()`ed) at mouseup. Replaces the
 * blueprint's module-level `_brushBgCanvas` globals with an instance the
 * calling component owns explicitly. */
export class BrushEraseSession {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private scaleX: number;
  private scaleY: number;

  constructor(bgImage: fabric.Image, fabricCanvas: fabric.Canvas) {
    const el = bgImage.getElement();
    const w = (el as HTMLImageElement).naturalWidth || el.width;
    const h = (el as HTMLImageElement).naturalHeight || el.height;
    this.canvas = document.createElement("canvas");
    this.canvas.width = w;
    this.canvas.height = h;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    this.ctx = ctx;
    this.ctx.drawImage(el, 0, 0, w, h);
    this.scaleX = bgImage.scaleX || fabricCanvas.getWidth() / w;
    this.scaleY = bgImage.scaleY || fabricCanvas.getHeight() / h;
  }

  eraseAt(canvasX: number, canvasY: number, sizeFabricPx: number): void {
    const px = canvasX / this.scaleX;
    const py = canvasY / this.scaleY;
    const r = Math.max(2, sizeFabricPx / this.scaleX / 2);
    this.ctx.save();
    this.ctx.fillStyle = "#ffffff";
    this.ctx.beginPath();
    this.ctx.arc(px, py, r, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  eraseLasso(fabricPoints: Array<{ x: number; y: number }>): void {
    if (fabricPoints.length < 3) return;
    const pts = fabricPoints.map((p) => ({
      x: p.x / this.scaleX,
      y: p.y / this.scaleY,
    }));
    this.ctx.save();
    this.ctx.fillStyle = "#ffffff";
    this.ctx.beginPath();
    this.ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) this.ctx.lineTo(pts[i].x, pts[i].y);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.restore();
  }

  async flush(
    fabricCanvas: fabric.Canvas,
    currentBg: fabric.Image,
  ): Promise<fabric.Image> {
    return swapBackground(fabricCanvas, currentBg, this.canvas);
  }
}
