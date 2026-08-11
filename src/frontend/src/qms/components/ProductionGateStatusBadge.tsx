// Phase 32 (Task #176) — read-only display of a linked Production Stage's
// QMS gate state. Pure presentational component reused by both
// ProductionStageInspectionControl.tsx (ProjectDetail's Production tab)
// and Production.tsx (the cross-project Production page), so the two
// pages never drift on what "blocked"/"overridden" looks like. Renders
// nothing meaningful when the gate isn't linked - callers should simply
// not mount this for unlinked stages (per the "don't clutter unlinked
// stages" requirement).

import { Badge } from "@/components/ui/badge";
import type { StageGateResult } from "@/qms/lib/productionGate";

const STATUS_BADGE_CLASS: Record<string, string> = {
  NotStarted: "bg-gray-100 text-gray-600 border-gray-300",
  InProgress: "bg-blue-100 text-blue-700 border-blue-300",
  Failed: "bg-red-100 text-red-700 border-red-300",
  Passed: "bg-green-100 text-green-700 border-green-300",
};

interface Props {
  gate: Extract<StageGateResult, { linked: true }>;
}

export function ProductionGateStatusBadge({ gate }: Props) {
  return (
    <div className="flex flex-col gap-1" data-ocid="qms.gate_status_badge">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge
          variant="outline"
          className="text-[11px] gap-1 border-blue-300 bg-blue-50 text-blue-700"
        >
          Inspection Required: {gate.inspection.libraryInspectionName}
        </Badge>
        <Badge
          variant="outline"
          className={`text-[10px] ${STATUS_BADGE_CLASS[gate.status] ?? ""}`}
        >
          {gate.status}
        </Badge>
        {gate.canProceed ? (
          <Badge
            variant="outline"
            className="text-[10px] bg-green-100 text-green-700 border-green-300"
          >
            {gate.overridden ? "Gate: Overridden" : "Gate: Passed"}
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="text-[10px] bg-red-100 text-red-700 border-red-300"
          >
            Gate: Blocked
          </Badge>
        )}
      </div>
      {!gate.canProceed && gate.blockReason && (
        <span className="text-[10px] text-red-600">
          Blocking Production: {gate.blockReason}
        </span>
      )}
      {gate.overridden && gate.activeOverride && (
        <span className="text-[10px] text-amber-700">
          Overridden by {gate.activeOverride.overriddenByName} on{" "}
          {new Date(gate.activeOverride.overriddenAt).toLocaleString("en-IN")}
          {" — "}"{gate.activeOverride.reason}"
        </span>
      )}
    </div>
  );
}
