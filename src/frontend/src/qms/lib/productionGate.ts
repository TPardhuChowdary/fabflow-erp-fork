// Phase 32 (Task #176) — Production Stage ↔ QMS inspection gate. Pure,
// side-effect-free decision logic shared by every place that can move a
// Production Stage to "Completed" (Production.tsx and ProjectDetail.tsx).
// Deliberately reads only already-hydrated Zustand state passed in by the
// caller — no store access, no persistence, no network here.
//
// Approved rules this encodes (Task #176 brief):
//  §3 - no linked inspection => never blocks, Production behaves exactly
//       as it does today.
//  §4 - a linked inspection is compulsory for its stage: the stage cannot
//       proceed until it has PASSED.
//  §6 - follows the inspection's server-derived `status` only. Never
//       recomputes a competing status here.
//  Override - a permanent project_qms_inspection_overrides row for this
//       exact (inspection, stage) pair releases the gate WITHOUT changing
//       the inspection's stored status - `passed` and `canProceed` are
//       reported separately so callers never confuse "overridden" with
//       "actually passed".

import type {
  ProjectQmsInspection,
  ProjectQmsInspectionOverride,
} from "../types";

export type StageGateResult =
  | { linked: false }
  | {
      linked: true;
      inspection: ProjectQmsInspection;
      /** The inspection's server-derived status, verbatim - never
       * recalculated here (rule §6). */
      status: ProjectQmsInspection["status"];
      /** True only when status === "Passed". */
      passed: boolean;
      /** True when a permanent override row exists for this exact
       * (inspection, stage) pair. Never implies `passed`. */
      overridden: boolean;
      activeOverride: ProjectQmsInspectionOverride | null;
      /** passed || overridden - the actual answer to "can this stage move
       * to Completed". */
      canProceed: boolean;
      /** Human-readable reason the stage is blocked, or null when it can
       * proceed. */
      blockReason: string | null;
    };

/** Decides whether `stageId` (Task #173's stable local Production Stage
 * id) is gated by a linked QMS inspection, and if so, whether it may
 * proceed. `inspections`/`overrides` should already be filtered/scoped to
 * the relevant project by the caller (cheap either way - both lists are
 * small). */
export function getStageInspectionGate(
  stageId: string | undefined,
  inspections: ProjectQmsInspection[],
  overrides: ProjectQmsInspectionOverride[],
): StageGateResult {
  if (!stageId) return { linked: false };

  const inspection = inspections.find(
    (i) => i.requiredProductionStageId === stageId,
  );
  if (!inspection) return { linked: false };

  const status = inspection.status;
  const passed = status === "Passed";

  const activeOverride =
    overrides.find(
      (o) =>
        o.projectQmsInspectionId === inspection.id &&
        o.requiredProductionStageId === stageId,
    ) ?? null;
  const overridden = !!activeOverride;
  const canProceed = passed || overridden;

  const blockReason = canProceed
    ? null
    : status === "Failed"
      ? `"${inspection.libraryInspectionName}" inspection failed`
      : status === "InProgress"
        ? `"${inspection.libraryInspectionName}" inspection is in progress`
        : `"${inspection.libraryInspectionName}" inspection has not started`;

  return {
    linked: true,
    inspection,
    status,
    passed,
    overridden,
    activeOverride,
    canProceed,
    blockReason,
  };
}
