// Vector parsing engine — extracts every drawing operator from a PDF page
// via PDF.js getOperatorList() and classifies each line/path/text by color
// (blue/red/black) and role (geometry vs. dimension vs. leader vs. text).
// Direct port of parsePageVectors/classifyVectorObject/multiplyMatrix.

import * as pdfjsLib from "pdfjs-dist";
import type { PDFPageProxy, PageViewport } from "pdfjs-dist";
import type {
  CropRect,
  PageTextItem,
  VectorColorClass,
  VectorObject,
  VectorPathObject,
  VectorPathSegment,
  VectorRole,
} from "../types";

type Mat = number[]; // [a, b, c, d, e, f]

function multiplyMatrix(a: Mat, b: Mat): Mat {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

export function colorToHex(rgb: [number, number, number]): string {
  const r = Math.round((rgb[0] || 0) * 255);
  const g = Math.round((rgb[1] || 0) * 255);
  const b = Math.round((rgb[2] || 0) * 255);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function classifyColor(col: [number, number, number]): VectorColorClass {
  const [r, g, b] = col;
  if (b > r + 0.1 && b > g + 0.1) return "BLUE";
  if (r > g + 0.15 && r > b + 0.15) return "RED";
  if (Math.max(r, g, b) < 0.3) return "BLACK";
  return "OTHER";
}

function classifyVectorObject(obj: VectorObject): void {
  const col =
    obj.kind === "path" ? obj.strokeColor || obj.fillColor : obj.strokeColor;
  obj.colorClass = classifyColor(col || [0, 0, 0]);

  if (obj.kind === "text") {
    const t = (obj.str || "").trim();
    let role: VectorRole;
    if (
      /^[-+]?\d+(\.\d+)?$/.test(t) ||
      /^[-+]?\d+(\.\d+)?\s*(mm|MM)?$/.test(t)
    ) {
      role = "DIMENSION_NUM";
    } else if (
      /(TOP\s*PLATE|BOTTOM|LEFT|RIGHT|FRONT|VIEW|SCALE|ISOMETRIC|SECTION)/i.test(
        t,
      )
    ) {
      role = "LABEL";
    } else if (
      /(MM|HIGHT|HEIGHT|INTERNAL|DIA|CLINCH|NUT|SPASER|SPACER)/i.test(t)
    ) {
      role = "LEADER";
    } else {
      role = "TEXT";
    }
    obj.role = role;
    return;
  }

  if (obj.colorClass === "BLUE") obj.role = "DIMENSION";
  else if (obj.colorClass === "RED") obj.role = "LEADER";
  else obj.role = "GEOMETRY";
}

export function countGeometryObjects(objs: VectorObject[]): number {
  return objs.filter((o) => o.role === "GEOMETRY").length;
}

export interface ParsedVectors {
  objects: VectorObject[];
  vectorMode: boolean;
}

/** Parses this page's PDF drawing operators into classified VectorObjects,
 * plus folds in the already-extracted text items. `vectorMode` mirrors the
 * blueprint's heuristic: true once there are more than 5 geometry paths,
 * which is what the Mode Selection modal recommends "Vector" from. */
export async function parsePageVectors(
  page: PDFPageProxy,
  viewport: PageViewport,
  textItems: PageTextItem[],
): Promise<ParsedVectors> {
  try {
    const ops = await page.getOperatorList();
    const OPS = pdfjsLib.OPS;
    const objects: VectorObject[] = [];

    let currentPath: {
      segments: VectorPathSegment[];
      strokeColor: [number, number, number];
      fillColor: [number, number, number];
      lineWidth: number;
    } | null = null;
    let strokeColor: [number, number, number] = [0, 0, 0];
    let fillColor: [number, number, number] = [0, 0, 0];
    let lineWidth = 1;
    const matrixStack: Array<{
      ctm: Mat;
      strokeColor: [number, number, number];
      fillColor: [number, number, number];
      lineWidth: number;
    }> = [];
    let ctm: Mat = [1, 0, 0, 1, 0, 0];

    function applyVPTransform(x: number, y: number) {
      const ux = ctm[0] * x + ctm[2] * y + ctm[4];
      const uy = ctm[1] * x + ctm[3] * y + ctm[5];
      const tx = pdfjsLib.Util.transform(viewport.transform, [
        1,
        0,
        0,
        1,
        ux,
        uy,
      ]);
      return { x: tx[4], y: tx[5] };
    }

    function startPath() {
      currentPath = {
        segments: [],
        strokeColor: [...strokeColor] as [number, number, number],
        fillColor: [...fillColor] as [number, number, number],
        lineWidth,
      };
    }
    function pushSeg(type: VectorPathSegment["type"], pts: number[]) {
      currentPath?.segments.push({ type, pts });
    }
    function finalizePath(stroke: boolean, fill: boolean) {
      if (!currentPath || currentPath.segments.length === 0) {
        currentPath = null;
        return;
      }
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      let hasPts = false;
      for (const s of currentPath.segments) {
        for (let i = 0; i < s.pts.length; i += 2) {
          const cp = applyVPTransform(s.pts[i], s.pts[i + 1]);
          hasPts = true;
          if (cp.x < minX) minX = cp.x;
          if (cp.x > maxX) maxX = cp.x;
          if (cp.y < minY) minY = cp.y;
          if (cp.y > maxY) maxY = cp.y;
        }
      }
      if (!hasPts) {
        currentPath = null;
        return;
      }
      const rect: CropRect = {
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY,
      };
      const obj: VectorPathObject = {
        kind: "path",
        segments: currentPath.segments.map((s) => ({
          type: s.type,
          pts: s.pts.slice(),
        })),
        strokeColor: currentPath.strokeColor,
        fillColor: currentPath.fillColor,
        lineWidth: currentPath.lineWidth,
        hasStroke: stroke,
        hasFill: fill,
        rect,
        ctm: ctm.slice(),
        colorClass: "OTHER",
        role: "GEOMETRY",
      };
      objects.push(obj);
      currentPath = null;
    }

    const fns = ops.fnArray;
    const args = ops.argsArray;
    for (let i = 0; i < fns.length; i++) {
      const op = fns[i];
      const a = args[i];
      switch (op) {
        case OPS.save:
          matrixStack.push({
            ctm: ctm.slice(),
            strokeColor: [...strokeColor] as [number, number, number],
            fillColor: [...fillColor] as [number, number, number],
            lineWidth,
          });
          break;
        case OPS.restore: {
          const r = matrixStack.pop();
          if (r) {
            ctm = r.ctm;
            strokeColor = r.strokeColor;
            fillColor = r.fillColor;
            lineWidth = r.lineWidth;
          }
          break;
        }
        case OPS.transform:
          ctm = multiplyMatrix(a as Mat, ctm);
          break;
        case OPS.setStrokeRGBColor:
          strokeColor = [a[0], a[1], a[2]];
          break;
        case OPS.setFillRGBColor:
          fillColor = [a[0], a[1], a[2]];
          break;
        case OPS.setLineWidth:
          lineWidth = a[0];
          break;
        case OPS.constructPath: {
          startPath();
          const subOps: number[] = a[0];
          const subArgs: number[] = a[1];
          let argIdx = 0;
          for (const sub of subOps) {
            switch (sub) {
              case OPS.moveTo:
                pushSeg("M", [subArgs[argIdx], subArgs[argIdx + 1]]);
                argIdx += 2;
                break;
              case OPS.lineTo:
                pushSeg("L", [subArgs[argIdx], subArgs[argIdx + 1]]);
                argIdx += 2;
                break;
              case OPS.curveTo:
                pushSeg("C", [
                  subArgs[argIdx],
                  subArgs[argIdx + 1],
                  subArgs[argIdx + 2],
                  subArgs[argIdx + 3],
                  subArgs[argIdx + 4],
                  subArgs[argIdx + 5],
                ]);
                argIdx += 6;
                break;
              case OPS.curveTo2:
              case OPS.curveTo3:
                pushSeg("C", [
                  subArgs[argIdx],
                  subArgs[argIdx + 1],
                  subArgs[argIdx + 2],
                  subArgs[argIdx + 3],
                ]);
                argIdx += 4;
                break;
              case OPS.rectangle:
                pushSeg("R", [
                  subArgs[argIdx],
                  subArgs[argIdx + 1],
                  subArgs[argIdx + 2],
                  subArgs[argIdx + 3],
                ]);
                argIdx += 4;
                break;
              case OPS.closePath:
                pushSeg("Z", []);
                break;
              default:
                break;
            }
          }
          break;
        }
        case OPS.stroke:
          finalizePath(true, false);
          break;
        case OPS.fill:
        case OPS.eoFill:
          finalizePath(false, true);
          break;
        case OPS.fillStroke:
        case OPS.eoFillStroke:
          finalizePath(true, true);
          break;
        case OPS.closeStroke:
          if (currentPath) pushSeg("Z", []);
          finalizePath(true, false);
          break;
        case OPS.closeFillStroke:
        case OPS.closeEOFillStroke:
          if (currentPath) pushSeg("Z", []);
          finalizePath(true, true);
          break;
        case OPS.endPath:
          currentPath = null;
          break;
        default:
          break;
      }
    }

    for (const it of textItems) {
      objects.push({
        kind: "text",
        str: it.str,
        rect: { x: it.x, y: it.y, w: it.w, h: it.h },
        strokeColor: [0, 0, 0],
        colorClass: "BLACK",
        role: "TEXT",
      });
    }

    for (const obj of objects) classifyVectorObject(obj);

    return { objects, vectorMode: countGeometryObjects(objects) > 5 };
  } catch (err) {
    console.warn("Vector parse failed:", err);
    return { objects: [], vectorMode: false };
  }
}
