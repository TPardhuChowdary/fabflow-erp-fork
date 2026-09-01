// Phase 32 (Task #175) — one Project QMS inspection card: header (name,
// mode, status, independent-vs-linked) + its characteristics, each
// rendered by ProjectQmsCharacteristicPanel.

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import { INSPECTION_MODE_LABELS } from "../constants";
import { useQmsStore } from "../store/useQmsStore";
import type {
  ProjectQmsInspection,
  ProjectQmsInspectionAttempt,
  ProjectQmsInspectionAttemptPhoto,
  ProjectQmsInspectionCharacteristic,
  ProjectQmsInspectionStatus,
} from "../types";
import { ProjectQmsCharacteristicPanel } from "./ProjectQmsCharacteristicPanel";

const STATUS_BADGE_CLASS: Record<ProjectQmsInspectionStatus, string> = {
  NotStarted: "bg-muted text-muted-foreground border-border",
  InProgress: "bg-info/10 text-info border-info/30",
  Failed: "bg-destructive/10 text-destructive border-destructive/30",
  Passed: "bg-success/10 text-success border-success/30",
};

interface Props {
  inspection: ProjectQmsInspection;
  /** The local Production Stage's display name for
   * inspection.requiredProductionStageId, resolved by the caller (this
   * component has no access to the local Zustand production data) - null
   * when independent, undefined while the stage can't be resolved (e.g.
   * a stage that was since deleted - the link persists per Task #174's
   * design, only the display name becomes unavailable). */
  linkedStageName: string | null | undefined;
  characteristics: ProjectQmsInspectionCharacteristic[];
  attempts: ProjectQmsInspectionAttempt[];
  canRecord: boolean;
  currentUserId: string;
  currentUserName: string;
  defaultExpanded?: boolean;
}

export function ProjectQmsInspectionCard({
  inspection,
  linkedStageName,
  characteristics,
  attempts,
  canRecord,
  currentUserId,
  currentUserName,
  defaultExpanded,
}: Props) {
  const [expanded, setExpanded] = useState(!!defaultExpanded);
  const attemptPhotos = useQmsStore((s) => s.projectQmsInspectionAttemptPhotos);
  const loadPhotosForAttempts = useQmsStore(
    (s) => s.loadProjectQmsInspectionAttemptPhotosForAttempts,
  );

  const attemptsByCharacteristic = new Map<
    string,
    ProjectQmsInspectionAttempt[]
  >();
  for (const a of attempts) {
    const list = attemptsByCharacteristic.get(a.characteristicId) ?? [];
    list.push(a);
    attemptsByCharacteristic.set(a.characteristicId, list);
  }

  const photosByAttemptId = new Map<
    string,
    ProjectQmsInspectionAttemptPhoto[]
  >();
  for (const p of attemptPhotos) {
    const list = photosByAttemptId.get(p.attemptId) ?? [];
    list.push(p);
    photosByAttemptId.set(p.attemptId, list);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once when the card first opens
  useEffect(() => {
    if (expanded && attempts.length > 0) {
      loadPhotosForAttempts(attempts.map((a) => a.id));
    }
  }, [expanded]);

  return (
    <div
      className={`rounded-lg border ${expanded ? "border-primary/40 shadow-sm" : ""}`}
      data-ocid={`qms.project_inspection.card.${inspection.id}`}
    >
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold">
            {inspection.libraryInspectionName}
          </span>
          <Badge
            variant="outline"
            className={`text-[10px] ${STATUS_BADGE_CLASS[inspection.status]}`}
          >
            {inspection.status}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {INSPECTION_MODE_LABELS[inspection.mode]}
          </Badge>
          {linkedStageName ? (
            <Badge className="text-[10px] bg-info/10 text-info border-info/30">
              Linked: {linkedStageName}
            </Badge>
          ) : inspection.requiredProductionStageId ? (
            <Badge
              variant="outline"
              className="text-[10px] text-muted-foreground"
            >
              Linked (stage removed)
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-[10px] text-muted-foreground"
            >
              Independent
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground">
            {characteristics.length} characteristic
            {characteristics.length === 1 ? "" : "s"}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="border-t px-4 py-3 space-y-2">
          {characteristics.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No characteristics found for this inspection's Library definition
              (no matching Manufacturing Process, or no Active characteristics
              defined for it).
            </p>
          ) : (
            characteristics
              .sort((a, b) => a.sequence - b.sequence)
              .map((c) => (
                <ProjectQmsCharacteristicPanel
                  key={c.id}
                  inspectionId={inspection.id}
                  characteristic={c}
                  attempts={attemptsByCharacteristic.get(c.id) ?? []}
                  photosByAttemptId={photosByAttemptId}
                  onPhotosNeeded={loadPhotosForAttempts}
                  canRecord={canRecord}
                  currentUserId={currentUserId}
                  currentUserName={currentUserName}
                />
              ))
          )}
        </div>
      )}
    </div>
  );
}
