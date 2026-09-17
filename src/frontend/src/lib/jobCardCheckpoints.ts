// Job Card Inspection Checkpoint generation/status (see chat, Part 2-7,
// database/20260917180000) — pure, side-effect-free computation, same
// style qms/lib/quantityInspection.ts already establishes for the
// near-identical Project-QMS-grain concept: callers pass in
// already-hydrated data and get back a plain answer, no store access,
// no persistence, no network here.
//
// Deliberately NOT built on top of quantityInspection.ts's own
// computeRequiredQuantityPoints — that function assumes ONE fixed
// interval and always emits equally-spaced points; Job Card checkpoints
// must support freeform manual points AND an optional interval AND a
// mandatory Final point that a manual/automatic point may coincide
// with (never duplicate), which is a different enough shape to warrant
// its own small set of functions rather than bending that one to fit.

import type {
  JobCardCheckpointSource,
  JobCardInspectionCheckpoint,
  JobCardInspectionEvent,
} from "@/types";

const ORDINAL_WORDS = [
  "First",
  "Second",
  "Third",
  "Fourth",
  "Fifth",
  "Sixth",
  "Seventh",
  "Eighth",
  "Ninth",
  "Tenth",
];

/** "First Inspection" / "Second Inspection" / ... / "11th Inspection"
 * for anything past the named list — still human-friendly, never
 * "Inspection 1". `position` is 1-based (the 1st manual checkpoint). */
function ordinalLabel(position: number): string {
  const word = ORDINAL_WORDS[position - 1];
  if (word) return `${word} Inspection`;
  const suffix =
    position % 10 === 1 && position % 100 !== 11
      ? "st"
      : position % 10 === 2 && position % 100 !== 12
        ? "nd"
        : position % 10 === 3 && position % 100 !== 13
          ? "rd"
          : "th";
  return `${position}${suffix} Inspection`;
}

export const FINAL_INSPECTION_LABEL = "Final Inspection";

/** The label the NEXT "+ Add Inspection" click should use — based purely
 * on how many non-final checkpoints already exist (deleting one never
 * produces a duplicate label, since this is recomputed from the current
 * count each time, not a running counter). */
export function nextCheckpointLabel(
  rows: JobCardInspectionCheckpoint[],
): string {
  const nonFinalCount = rows.filter((r) => r.source !== "final").length;
  return ordinalLabel(nonFinalCount + 1);
}

/** Every automatic-interval point strictly between 0 and totalQuantity
 * (the Final checkpoint at totalQuantity itself is handled separately
 * by reconcileFinalCheckpoint — never duplicated here).
 *
 * generateAutomaticPoints(150, 25) -> [25, 50, 75, 100, 125]
 * generateAutomaticPoints(150, 40) -> [40, 80, 120]  (150 itself is Final's job) */
export function generateAutomaticPoints(
  totalQuantity: number,
  interval: number,
): number[] {
  if (!totalQuantity || totalQuantity <= 0 || !interval || interval <= 0) {
    return [];
  }
  const points: number[] = [];
  for (let q = interval; q < totalQuantity; q += interval) {
    points.push(q);
  }
  return points;
}

/** Add one manual checkpoint at `cumulativeQty`, auto-labeled by
 * position. Rejects (returns the unchanged array + an error) a quantity
 * that is <=0, >= totalQuantity (that's Final's job, see Part 6), or a
 * duplicate of any existing row's cumulativeQty (Part 3/Test E — no two
 * checkpoints at the same quantity). */
export function addManualCheckpoint(
  rows: JobCardInspectionCheckpoint[],
  cumulativeQty: number,
  totalQuantity: number | undefined,
  sampleQty = 1,
): { rows: JobCardInspectionCheckpoint[]; error?: string } {
  if (!Number.isFinite(cumulativeQty) || cumulativeQty <= 0) {
    return { rows, error: "Checkpoint quantity must be greater than 0." };
  }
  if (totalQuantity && cumulativeQty >= totalQuantity) {
    return {
      rows,
      error:
        "Checkpoint quantity must be less than Total Quantity — the Final Inspection already covers the total.",
    };
  }
  if (rows.some((r) => r.cumulativeQty === cumulativeQty)) {
    return {
      rows,
      error: `A checkpoint already exists at ${cumulativeQty}.`,
    };
  }
  const newRow: JobCardInspectionCheckpoint = {
    id: `insp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: nextCheckpointLabel(rows),
    triggerQty: 0, // recomputed by relabelCheckpoints below
    cumulativeQty,
    sampleQty,
    source: "manual",
  };
  return { rows: relabelCheckpoints([...rows, newRow], totalQuantity) };
}

/** Merge freshly-generated automatic points into the existing rows,
 * skipping any quantity that already has a row (manual, automatic, or
 * final) — Part 3's explicit "must only be one checkpoint at 75"
 * requirement, regardless of which source got there first. */
export function mergeAutomaticPoints(
  rows: JobCardInspectionCheckpoint[],
  totalQuantity: number,
  interval: number,
): JobCardInspectionCheckpoint[] {
  const points = generateAutomaticPoints(totalQuantity, interval);
  const existingQtys = new Set(rows.map((r) => r.cumulativeQty));
  const added: JobCardInspectionCheckpoint[] = points
    .filter((q) => !existingQtys.has(q))
    .map((q) => ({
      id: `insp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${q}`,
      label: "", // assigned by relabelCheckpoints below
      triggerQty: 0,
      cumulativeQty: q,
      sampleQty: 1,
      source: "automatic" as JobCardCheckpointSource,
    }));
  return relabelCheckpoints([...rows, ...added], totalQuantity);
}

/** Ensures there is EXACTLY ONE checkpoint at totalQuantity, labeled
 * "Final Inspection" and source "final" — the mandatory, non-deletable
 * checkpoint (Part 2/6). If a manual/automatic row already sits at
 * totalQuantity, that row is CONVERTED in place (never duplicated). If
 * totalQuantity is unset/0, no Final row is added (nothing to compute
 * it from) and any previously-added final row is left untouched (its
 * own historical inspection events, if any, must never be silently
 * discarded by a later configuration change — see Part 16). */
export function reconcileFinalCheckpoint(
  rows: JobCardInspectionCheckpoint[],
  totalQuantity: number | undefined,
): JobCardInspectionCheckpoint[] {
  if (!totalQuantity || totalQuantity <= 0) return rows;

  const existingAtTotal = rows.find((r) => r.cumulativeQty === totalQuantity);
  const withoutOldFinals = rows.filter(
    (r) => r.source !== "final" || r.cumulativeQty === totalQuantity,
  );

  if (existingAtTotal) {
    return relabelCheckpoints(
      withoutOldFinals.map((r) =>
        r.cumulativeQty === totalQuantity
          ? { ...r, label: FINAL_INSPECTION_LABEL, source: "final" as const }
          : r,
      ),
      totalQuantity,
    );
  }

  const finalRow: JobCardInspectionCheckpoint = {
    id: `insp-final-${totalQuantity}`,
    label: FINAL_INSPECTION_LABEL,
    triggerQty: 0,
    cumulativeQty: totalQuantity,
    sampleQty: 1,
    source: "final",
  };
  return relabelCheckpoints([...withoutOldFinals, finalRow], totalQuantity);
}

/** Recomputes, for every row in ascending cumulativeQty order: the
 * ordinal label for non-final rows (position among non-final rows
 * only), and triggerQty as "how many more pieces since the previous
 * checkpoint" (0 for the first row = triggerQty === cumulativeQty). The
 * Final row's label is always FINAL_INSPECTION_LABEL regardless of
 * position. Call this after ANY structural change (add/remove/merge/
 * reconcile) so labels/deltas never drift. */
export function relabelCheckpoints(
  rows: JobCardInspectionCheckpoint[],
  _totalQuantity?: number,
): JobCardInspectionCheckpoint[] {
  const sorted = [...rows].sort((a, b) => a.cumulativeQty - b.cumulativeQty);
  let nonFinalPosition = 0;
  let previousQty = 0;
  return sorted.map((row) => {
    const triggerQty = row.cumulativeQty - previousQty;
    previousQty = row.cumulativeQty;
    if (row.source === "final") {
      return { ...row, label: FINAL_INSPECTION_LABEL, triggerQty };
    }
    nonFinalPosition += 1;
    return { ...row, label: ordinalLabel(nonFinalPosition), triggerQty };
  });
}

export type CheckpointStatus = "Upcoming" | "Due" | "Passed" | "Failed";

/** The checkpoint's current status, derived from (never stored as) the
 * LATEST job_card_inspection_events row matching this checkpoint's id
 * (see database/20260917180000) — an earlier Fail is never overwritten
 * in the historical record even once a later Pass exists for the same
 * checkpoint (Part 7); "current status" simply reflects the most recent
 * attempt. Never auto-marks Passed (Part 5's explicit rule) — Due only
 * means "production has reached this quantity and no result is
 * recorded yet". */
export function getCheckpointStatus(
  checkpoint: JobCardInspectionCheckpoint,
  actualCompletedQty: number,
  events: JobCardInspectionEvent[],
): CheckpointStatus {
  const matching = events.filter((e) => e.checkpointId === checkpoint.id);
  const latest = matching.length > 0 ? matching[matching.length - 1] : null;
  if (latest) return latest.result === "Pass" ? "Passed" : "Failed";
  return actualCompletedQty >= checkpoint.cumulativeQty ? "Due" : "Upcoming";
}

/** All checkpoints simultaneously due for a given production quantity —
 * Part 5's explicit "production jumps 20 -> 80, both 25 and 75 must be
 * due" requirement. Never returns an already-Passed/Failed checkpoint. */
export function getDueCheckpoints(
  rows: JobCardInspectionCheckpoint[],
  actualCompletedQty: number,
  events: JobCardInspectionEvent[],
): JobCardInspectionCheckpoint[] {
  return rows.filter(
    (r) => getCheckpointStatus(r, actualCompletedQty, events) === "Due",
  );
}
