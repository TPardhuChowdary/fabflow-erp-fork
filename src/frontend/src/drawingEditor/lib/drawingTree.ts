// Pure parent/child tree-building over DrawingDocument.parentDrawingId — no
// DB/store access. Used by DrawingsListPanel (Project/Machine tabs render a
// tree instead of a flat table) and by the Global Repository's "View
// Lineage" dialog (a one-off subtree rooted at a clicked drawing's ultimate
// ancestor).

import type { DrawingDocument } from "../types";

export interface DrawingTreeNode {
  drawing: DrawingDocument;
  children: DrawingTreeNode[];
}

function childrenOf(
  parentId: string,
  pool: DrawingDocument[],
): DrawingDocument[] {
  return pool.filter((d) => d.parentDrawingId === parentId);
}

function buildNode(
  drawing: DrawingDocument,
  pool: DrawingDocument[],
): DrawingTreeNode {
  return {
    drawing,
    children: childrenOf(drawing.id, pool).map((c) => buildNode(c, pool)),
  };
}

/** One tree per independent root within `pool`. A root is any drawing whose
 * parentDrawingId is absent, or points outside `pool` itself (e.g. a
 * focused Project/Machine list whose true parent lives elsewhere) — a
 * focused tree never reaches outside its own visible set. Order is
 * inherited from `pool`'s existing order, so roots and children both
 * respect the caller's chosen sort with no extra comparator needed. */
export function buildDrawingForest(pool: DrawingDocument[]): DrawingTreeNode[] {
  const ids = new Set(pool.map((d) => d.id));
  return pool
    .filter((d) => !d.parentDrawingId || !ids.has(d.parentDrawingId))
    .map((root) => buildNode(root, pool));
}

/** Walks parentDrawingId up from `drawing` to its ultimate ancestor (a
 * Master, or any drawing with no parent), using the full unfiltered
 * `allDrawings` list. Guards against a dangling/cyclic chain by stopping at
 * the first unresolvable or already-seen id. */
export function findRootDrawing(
  drawing: DrawingDocument,
  allDrawings: DrawingDocument[],
): DrawingDocument {
  const byId = new Map(allDrawings.map((d) => [d.id, d]));
  const seen = new Set<string>();
  let current = drawing;
  while (current.parentDrawingId && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = byId.get(current.parentDrawingId);
    if (!parent) break;
    current = parent;
  }
  return current;
}

/** Builds the single tree rooted at `root`, descending through the full
 * `allDrawings` list — used by "View Lineage" where the subtree must
 * include every descendant regardless of the panel's current search/owner
 * filter. */
export function buildDrawingSubtree(
  root: DrawingDocument,
  allDrawings: DrawingDocument[],
): DrawingTreeNode {
  return buildNode(root, allDrawings);
}

/** The hidden Working Drawing for a Repository Original, if one has been
 * created yet (Edit was clicked at least once). Client-side lookup over an
 * already-loaded drawings array — used for Preview/Print resolution and
 * for the "Edited" badge; the authoritative, DB-level equivalent used at
 * Edit-click time is api/drawings.ts findWorkingDrawingByOriginal. */
export function findWorkingDrawing(
  originalId: string,
  allDrawings: DrawingDocument[],
): DrawingDocument | undefined {
  return allDrawings.find((d) => d.originalDrawingId === originalId);
}
