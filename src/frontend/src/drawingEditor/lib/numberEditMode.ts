// NUMBER EDIT mode — locks every canvas object except detected dimension
// numbers, which stay selectable so a shop-floor worker can resize/recolor
// a single wrong number without risking moving/deleting anything else.
// Direct port of isNumberObject/applyLockState. The floating toolbar itself
// (size/color/bold controls) is a React component
// (components/FloatingNumberToolbar.tsx) driven by fabric's
// selection:created/updated/cleared events wired in DrawingEditorPage.

import type { fabric } from "fabric";

const NUMBER_PATTERN = /^[-+]?\d+(\.\d+)?\s*(mm|MM|°|deg)?$/;

export function isNumberObject(
  obj: fabric.Object | null | undefined,
): obj is fabric.IText {
  if (!obj) return false;
  const t = obj.type;
  if (t !== "text" && t !== "i-text" && t !== "textbox") return false;
  const txt = ((obj as fabric.IText).text || "").trim();
  return NUMBER_PATTERN.test(txt);
}

/** locked=true (NUMBER EDIT): only number objects stay selectable/evented.
 * locked=false (FULL EDIT): everything except the background is
 * selectable/evented, matching the blueprint's applyLockState. */
export function applyLockState(
  fabricCanvas: fabric.Canvas,
  bgImage: fabric.Object | undefined,
  locked: boolean,
): void {
  for (const obj of fabricCanvas.getObjects()) {
    if (obj === bgImage) continue;
    if (locked) {
      const isNumber = isNumberObject(obj);
      obj.selectable = isNumber;
      obj.evented = isNumber;
      obj.hoverCursor = isNumber ? "pointer" : "not-allowed";
    } else {
      obj.selectable = true;
      obj.evented = true;
      obj.hoverCursor = "pointer";
    }
  }
  fabricCanvas.discardActiveObject();
  fabricCanvas.renderAll();
}
