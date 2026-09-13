// Quantity-based production inspection (Master ERP Architecture, Part 3).
// Pure, side-effect-free computation — same style as ./productionGate.ts
// deliberately reuses: no store access, no persistence, no network here.
// Callers (a future UI, the Agent) pass in already-hydrated data and get
// back a plain answer.
//
// Decision already made (see chat): inspection frequency lives on
// project_qms_inspections.inspection_frequency_qty (nullable — NULL
// means no quantity checkpoints, ordinary single pass/fail exactly as
// getStageInspectionGate() already handles). Required checkpoints are
// ALWAYS computed from (expected quantity, frequency), never stored —
// they can never drift from the Job Card's own expected_quantity. Which
// checkpoints are done is exactly what's recorded in
// project_qms_inspections.quantity_checkpoints (jsonb array).

export interface QuantityCheckpoint {
  quantity: number;
  completedAt: number;
  result: "Pass" | "Fail";
  performedBy?: string;
  performedByName?: string;
  remarks?: string;
}

/** Every quantity point that requires an inspection for a run of
 * `expectedQuantity` pieces at `frequencyQty`-piece intervals, always
 * including a final inspection at `expectedQuantity` itself.
 *
 * computeRequiredQuantityPoints(100, 25) -> [25, 50, 75, 100]
 * computeRequiredQuantityPoints(100, 50) -> [50, 100]
 * computeRequiredQuantityPoints(100, 30) -> [30, 60, 90, 100]  (final
 *   point added even though it isn't an exact multiple — a partial last
 *   interval still gets inspected before the job is considered done)
 * computeRequiredQuantityPoints(100, null) -> []  (no quantity
 *   checkpoints configured — this inspection is plain pass/fail, exactly
 *   as it was before this column existed; callers must not treat an
 *   empty array here as "0 required inspections done wrong", it means
 *   "quantity-based checkpoints don't apply to this inspection at all")
 * computeRequiredQuantityPoints(0, 25) -> []  (nothing to inspect yet)
 */
export function computeRequiredQuantityPoints(
  expectedQuantity: number,
  frequencyQty: number | null | undefined,
): number[] {
  if (
    !frequencyQty ||
    frequencyQty <= 0 ||
    !expectedQuantity ||
    expectedQuantity <= 0
  ) {
    return [];
  }
  const points: number[] = [];
  for (let q = frequencyQty; q < expectedQuantity; q += frequencyQty) {
    points.push(q);
  }
  points.push(expectedQuantity); // final inspection, always included
  return points;
}

/** The distinct quantities already recorded as completed, regardless of
 * Pass/Fail — a failed checkpoint still "happened" (it just needs
 * rectification + a fresh attempt to actually pass; the audit's own
 * requirement is to know a checkpoint is due/completed/overdue, not to
 * re-decide pass/fail policy here). */
export function getCompletedQuantities(
  checkpoints: QuantityCheckpoint[] | undefined,
): number[] {
  return (checkpoints ?? []).map((c) => c.quantity);
}

export interface QuantityInspectionSummary {
  /** [] when frequencyQty is not configured — quantity checkpoints don't
   * apply to this inspection. */
  requiredPoints: number[];
  completedQuantities: number[];
  /** The smallest required point not yet completed, or null when every
   * required point is done (or none apply). */
  nextDueQuantity: number | null;
  /** True once actualCompletedQty has reached/passed nextDueQuantity but
   * that point isn't recorded as completed yet. False whenever
   * nextDueQuantity is null (nothing left to be due). */
  due: boolean;
  /** True once every required point (including the final one) is
   * recorded as completed. Also true when no frequency is configured —
   * there is nothing to complete, so nothing is left pending. */
  allCompleted: boolean;
  /** True specifically when the FINAL point (expectedQuantity) has not
   * been completed yet, regardless of the intermediate ones — the exact
   * "final inspection pending" the audit asked to be able to answer. */
  finalInspectionPending: boolean;
}

export function getQuantityInspectionSummary(params: {
  expectedQuantity: number;
  frequencyQty: number | null | undefined;
  actualCompletedQty: number;
  checkpoints: QuantityCheckpoint[] | undefined;
}): QuantityInspectionSummary {
  const { expectedQuantity, frequencyQty, actualCompletedQty, checkpoints } =
    params;
  const requiredPoints = computeRequiredQuantityPoints(
    expectedQuantity,
    frequencyQty,
  );
  const completedQuantities = getCompletedQuantities(checkpoints);
  const completedSet = new Set(completedQuantities);
  const nextDueQuantity =
    requiredPoints.find((q) => !completedSet.has(q)) ?? null;
  const due = nextDueQuantity !== null && actualCompletedQty >= nextDueQuantity;
  const allCompleted =
    requiredPoints.length === 0 ||
    requiredPoints.every((q) => completedSet.has(q));
  const finalInspectionPending =
    requiredPoints.length > 0 &&
    !completedSet.has(requiredPoints[requiredPoints.length - 1]);

  return {
    requiredPoints,
    completedQuantities,
    nextDueQuantity,
    due,
    allCompleted,
    finalInspectionPending,
  };
}

/** Guards against recording the same quantity checkpoint twice (the
 * audit's explicit "avoid duplicate inspection points" requirement).
 * Callers should check this before appending a new entry to
 * quantity_checkpoints. */
export function isDuplicateCheckpoint(
  checkpoints: QuantityCheckpoint[] | undefined,
  quantity: number,
): boolean {
  return (checkpoints ?? []).some((c) => c.quantity === quantity);
}
