// Production ↔ Job Card ↔ Quantity integration — pure, read-only
// derivation of a stage's quantity figures. Nothing here writes anything;
// it mirrors the existing totalSent/totalReceived/pending pattern already
// computed inline in Production.tsx (Phase 11), just centralized and
// extended for the new fields. Implements the approved formulas from the
// chat design record exactly — "Processed" is never called "Produced"
// (design record §11).
//
// QMS accepted_qty/rejected_qty are read as-is from qms_stage_completions
// (qms/types.ts's own "whole-stage tally" definition) and never merged
// with or derived from Job Card quantities (design record §F).

import type { InspectionStageCompletion } from "@/qms/types";
import type { JobCard, ProjectProductionStage } from "@/types";

export interface StageProductionTotals {
  processed: number;
  workerAccepted: number;
  workerRejected: number;
  rework: number;
  /** Present only once a completed QMS inspection exists for this stage. */
  qmsAccepted?: number;
  qmsRejected?: number;
  qmsCompletedAt?: number;
  /** Worker Accepted until a completed QMS result exists, then QMS
   * Accepted — minus quantity already transferred downstream. Never
   * negative. */
  availableForNextStage: number;
  /** Σ quantity of `send` transactions, anywhere in the project, that
   * carry this stage as their sourceStageId — i.e., drawn FROM this
   * stage by any downstream stage(s). */
  downstreamConsumed: number;
  /** How much more has been drawn downstream than is currently
   * available — a live snapshot, not a per-transfer history (no new
   * ledger/history table, per the approved design). */
  downstreamShortfall: number;
  /** undefined when the stage has no targetQty set yet. */
  remaining?: number;
  overTarget: number;
}

/** Canonical QMS result for a stage: the completion with the greatest
 * completedAt among those actually completed. qms_stage_completions has
 * no uniqueness constraint on stage_id — more than one completion per
 * stage is possible and, in this database, already real — so "latest
 * completed" is the approved, explicit tie-break rule, not an inferred
 * one. Returns undefined when none is completed yet. */
export function selectCanonicalQmsCompletion(
  completions: InspectionStageCompletion[],
): InspectionStageCompletion | undefined {
  let best: InspectionStageCompletion | undefined;
  for (const c of completions) {
    if (!c.completedAt) continue;
    if (!best || c.completedAt > (best.completedAt ?? 0)) best = c;
  }
  return best;
}

/**
 * @param stage the stage to compute totals for
 * @param jobCards every Job Card for the stage's project (filtered here to
 *   this stage's Completed ones — NotStarted/InProgress/OnHold contribute
 *   zero quantity, per the approved design)
 * @param qmsCompletionsForStage every qms_stage_completions row already
 *   known to belong to this stage (caller filters by stageId)
 * @param allStagesInProject every stage in the same project, each with its
 *   own `.transactions` already attached — needed to find sends elsewhere
 *   in the project that draw FROM this stage (source_stage_id)
 */
export function computeStageProductionTotals(
  stage: ProjectProductionStage,
  jobCards: JobCard[],
  qmsCompletionsForStage: InspectionStageCompletion[],
  allStagesInProject: ProjectProductionStage[],
): StageProductionTotals {
  const completed = jobCards.filter(
    (jc) => jc.stageId === stage.stageId && jc.status === "Completed",
  );
  const workerAccepted = completed.reduce(
    (a, jc) => a + jc.actualCompletedQty,
    0,
  );
  const workerRejected = completed.reduce((a, jc) => a + jc.rejectedQty, 0);
  const rework = completed.reduce((a, jc) => a + jc.reworkQty, 0);
  const processed = workerAccepted + workerRejected + rework;

  const canonicalQms = selectCanonicalQmsCompletion(qmsCompletionsForStage);
  const qmsAccepted = canonicalQms?.acceptedQty;
  const qmsRejected = canonicalQms?.rejectedQty;

  const downstreamConsumed = allStagesInProject.reduce((sum, s) => {
    const txs = s.transactions ?? [];
    return (
      sum +
      txs
        .filter((t) => t.type === "send" && t.sourceStageId === stage.stageId)
        .reduce((a, t) => a + t.quantity, 0)
    );
  }, 0);

  // Approved rule (design record §1): before a completed QMS result
  // exists, availability is Worker Accepted; once one exists, it
  // switches to QMS Accepted. Job Card-derived Accepted is never
  // overwritten by this — qmsAccepted/workerAccepted stay two separate
  // return values above.
  const acceptedForAvailability = qmsAccepted ?? workerAccepted;
  const availableForNextStage = Math.max(
    acceptedForAvailability - downstreamConsumed,
    0,
  );
  const downstreamShortfall = Math.max(
    downstreamConsumed - acceptedForAvailability,
    0,
  );

  const target = stage.targetQty;
  const remaining =
    target !== undefined ? Math.max(target - workerAccepted, 0) : undefined;
  const overTarget =
    target !== undefined ? Math.max(workerAccepted - target, 0) : 0;

  return {
    processed,
    workerAccepted,
    workerRejected,
    rework,
    qmsAccepted,
    qmsRejected,
    qmsCompletedAt: canonicalQms?.completedAt,
    availableForNextStage,
    downstreamConsumed,
    downstreamShortfall,
    remaining,
    overTarget,
  };
}
