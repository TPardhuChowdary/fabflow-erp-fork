// Auto-Pick heuristic: cluster the page's text-item positions into
// rectangular groups, returning bounding rects as candidate "views". Works
// well on CAD drawings where each view forms a visually-separate cluster of
// dimension text. Direct port of detectViews/rectIntersect/unionInto.

import * as pdfjsLib from "pdfjs-dist";
import type { PDFPageProxy, PageViewport } from "pdfjs-dist";
import type { DetectedView, PageTextItem } from "../types";

/** pdfjs-dist's TextContent.items is `(TextItem | TextMarkedContent)[]`, but
 * TextItem isn't re-exported from the package root — duck-type instead of
 * depending on its internal module path. */
interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

function isTextItem(it: unknown): it is PdfTextItem {
  return (
    typeof it === "object" &&
    it !== null &&
    "str" in it &&
    typeof (it as PdfTextItem).str === "string"
  );
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rectIntersect(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.w < b.x ||
    b.x + b.w < a.x ||
    a.y + a.h < b.y ||
    b.y + b.h < a.y
  );
}

function unionInto(a: Rect, b: Rect): void {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.w, b.x + b.w);
  const y2 = Math.max(a.y + a.h, b.y + b.h);
  a.x = x1;
  a.y = y1;
  a.w = x2 - x1;
  a.h = y2 - y1;
}

/** Extracts every text item on the page as canvas-pixel rects, in the given
 * viewport's coordinate space. Shared by view detection and vector parsing
 * (text items double as VectorTextObject sources there). */
export async function extractPageTextItems(
  page: PDFPageProxy,
  viewport: PageViewport,
): Promise<PageTextItem[]> {
  const txt = await page.getTextContent();
  return (txt.items as unknown[])
    .filter(isTextItem)
    .filter((it) => it.str.trim().length > 0)
    .map((it) => {
      const tx = pdfjsLib.Util.transform(viewport.transform, it.transform);
      const x = tx[4];
      const y = tx[5] - it.height * Math.abs(tx[3] || 1);
      return {
        x,
        y,
        w: it.width * Math.abs(tx[0] || 1),
        h: it.height * Math.abs(tx[3] || 1),
        str: it.str,
      };
    });
}

export function detectViews(
  items: PageTextItem[],
  viewport: PageViewport,
): DetectedView[] {
  if (items.length === 0) return [];

  const pad = Math.min(viewport.width, viewport.height) * 0.04;
  const groups: Rect[] = [];
  for (const it of items) {
    const r: Rect = {
      x: it.x - pad,
      y: it.y - pad,
      w: it.w + pad * 2,
      h: it.h + pad * 2,
    };
    let merged = false;
    for (const g of groups) {
      if (rectIntersect(g, r)) {
        unionInto(g, r);
        merged = true;
        break;
      }
    }
    if (!merged) groups.push(r);
  }

  // Second pass: merge overlapping groups.
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        if (rectIntersect(groups[i], groups[j])) {
          unionInto(groups[i], groups[j]);
          groups.splice(j, 1);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }

  const minA = viewport.width * viewport.height * 0.005;
  const maxA = viewport.width * viewport.height * 0.85;
  return groups
    .filter((g) => g.w * g.h > minA && g.w * g.h < maxA)
    .sort((a, b) => b.w * b.h - a.w * a.h)
    .slice(0, 8)
    .map((g, idx) => ({
      x: Math.max(0, g.x - 8),
      y: Math.max(0, g.y - 8),
      w: Math.min(viewport.width, g.w + 16),
      h: Math.min(viewport.height, g.h + 16),
      label: `VIEW ${String.fromCharCode(65 + idx)}`,
    }));
}
