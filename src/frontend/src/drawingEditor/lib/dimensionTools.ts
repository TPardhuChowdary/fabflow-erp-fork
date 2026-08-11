// Arrow / calibrated dimension-line builders + snap-to-nearest-black-edge,
// shared by every editor mode's annotation toolset. Direct port of
// makeArrow/makeDimLine/snapToNearestEdge.

import { fabric } from "fabric";

export interface Point {
  x: number;
  y: number;
}

export function makeArrow(
  p1: Point,
  p2: Point,
  color: string,
  strokeWidth: number,
): fabric.Group {
  const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const headLen = Math.max(10, strokeWidth * 4);
  const line = new fabric.Line([p1.x, p1.y, p2.x, p2.y], {
    stroke: color,
    strokeWidth,
  });
  const h1 = new fabric.Line(
    [
      p2.x,
      p2.y,
      p2.x - headLen * Math.cos(angle - Math.PI / 7),
      p2.y - headLen * Math.sin(angle - Math.PI / 7),
    ],
    { stroke: color, strokeWidth },
  );
  const h2 = new fabric.Line(
    [
      p2.x,
      p2.y,
      p2.x - headLen * Math.cos(angle + Math.PI / 7),
      p2.y - headLen * Math.sin(angle + Math.PI / 7),
    ],
    { stroke: color, strokeWidth },
  );
  return new fabric.Group([line, h1, h2], {});
}

export function makeDimLine(
  p1: Point,
  p2: Point,
  color: string,
  strokeWidth: number,
  label: string,
): fabric.Group {
  const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const tick = Math.max(6, strokeWidth * 3);
  const perp = angle + Math.PI / 2;
  const line = new fabric.Line([p1.x, p1.y, p2.x, p2.y], {
    stroke: color,
    strokeWidth,
  });
  const t1 = new fabric.Line(
    [
      p1.x + tick * Math.cos(perp),
      p1.y + tick * Math.sin(perp),
      p1.x - tick * Math.cos(perp),
      p1.y - tick * Math.sin(perp),
    ],
    { stroke: color, strokeWidth },
  );
  const t2 = new fabric.Line(
    [
      p2.x + tick * Math.cos(perp),
      p2.y + tick * Math.sin(perp),
      p2.x - tick * Math.cos(perp),
      p2.y - tick * Math.sin(perp),
    ],
    { stroke: color, strokeWidth },
  );
  const parts: fabric.Object[] = [line, t1, t2];
  if (label) {
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;
    const off = Math.max(14, strokeWidth * 5);
    const tx = mx + off * Math.cos(perp);
    const ty = my + off * Math.sin(perp);
    const fontSize = Math.max(14, strokeWidth * 6);
    parts.push(
      new fabric.Text(label, {
        left: tx,
        top: ty,
        fontFamily: "monospace",
        fontWeight: "700" as unknown as number,
        fontSize,
        fill: color,
        backgroundColor: "#ffffff",
        originX: "center",
        originY: "center",
      }),
    );
  }
  return new fabric.Group(parts, {});
}

/** Spiral-searches out from (x,y) for the nearest black pixel in the
 * canvas's current background image, used to snap dimension-line
 * endpoints onto a drawn edge. Caches the pixel read per background image
 * via a WeakMap so repeated snaps during one drag are cheap. */
const pixelCache = new WeakMap<fabric.Image, ImageData>();

export function snapToNearestEdge(
  fabricCanvas: fabric.Canvas,
  bgImage: fabric.Image | undefined,
  x: number,
  y: number,
): Point | null {
  if (!bgImage) return null;
  const el = bgImage.getElement();
  if (!el) return null;
  const w = (el as HTMLImageElement).naturalWidth || el.width;
  const h = (el as HTMLImageElement).naturalHeight || el.height;
  const bgScaleX = bgImage.scaleX || fabricCanvas.getWidth() / w;
  const bgScaleY = bgImage.scaleY || fabricCanvas.getHeight() / h;
  const px = Math.round(x / bgScaleX);
  const py = Math.round(y / bgScaleY);
  if (px < 0 || py < 0 || px >= w || py >= h) return null;

  let data = pixelCache.get(bgImage);
  if (!data) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const cx = c.getContext("2d");
    if (!cx) return null;
    cx.drawImage(el, 0, 0, w, h);
    try {
      data = cx.getImageData(0, 0, w, h);
    } catch {
      return null;
    }
    pixelCache.set(bgImage, data);
  }
  const pxd = data.data;
  const isBlack = (qx: number, qy: number) => {
    if (qx < 0 || qy < 0 || qx >= w || qy >= h) return false;
    const i = (qy * w + qx) * 4;
    return pxd[i] < 100 && pxd[i + 1] < 100 && pxd[i + 2] < 100;
  };
  const R = 20;
  for (let r = 0; r <= R; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (isBlack(px + dx, py + dy)) {
          return { x: (px + dx) * bgScaleX, y: (py + dy) * bgScaleY };
        }
      }
    }
  }
  return null;
}
