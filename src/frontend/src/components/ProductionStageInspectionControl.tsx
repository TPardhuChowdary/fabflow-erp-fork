// Phase 32 (Task #174) — Production-side QMS inspection linking control.
// One instance per Production Stage row (ProjectDetail.tsx's Production
// tab). Reads/writes exclusively through useQmsStore's Phase 32 actions
// (lib/qmsInspectionsApi.ts under the hood) — no separate persistence,
// no local-only shadow state. The link itself is a soft reference
// (ProjectQmsInspection.requiredProductionStageId === stage.stageId, the
// stable id from Task #173), never an array index.
//
// Task #176 extended this with read-only gate status display (Passed/
// Blocked/Overridden, why, who/when if overridden) and an "Open
// Inspection" action — the actual gate ENFORCEMENT (blocking "Mark
// Complete") and the override dialog itself live in the caller
// (ProjectDetail.tsx), since only the caller owns the stage-completion
// handlers. This component never decides whether Production may proceed
// — it only displays what getStageInspectionGate() decided.

import { getStageInspectionGate } from "@/qms/lib/productionGate";
import { useQmsStore } from "@/qms/store/useQmsStore";
import type {
  InspectionStageDefinition,
  ProjectQmsInspection,
  ProjectQmsInspectionOverride,
} from "@/qms/types";
import { useState } from "react";
import { toast } from "sonner";
import { ProductionGateStatusBadge } from "../qms/components/ProductionGateStatusBadge";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Switch } from "./ui/switch";

interface Props {
  projectId: string;
  /** Task #173's stable per-stage identity — never an array index. */
  stageId: string;
  stageName: string;
  libraryInspections: InspectionStageDefinition[];
  /** Every project_qms_inspections row for this project (all statuses,
   * linked and independent alike) — used both to find this stage's own
   * link and to detect duplicates/conflicts against the rest of the
   * project. */
  projectInspections: ProjectQmsInspection[];
  /** Every project_qms_inspection_overrides row for this project (Task
   * #176) — used only to display an already-recorded override; this
   * component never creates one itself. */
  projectOverrides: ProjectQmsInspectionOverride[];
  currentUserId: string;
  currentUserName: string;
  /** Gates the interactive controls only — matches the RLS policies on
   * project_qms_inspections (insert needs inspection_sheets.generate,
   * update needs inspection_sheets.complete); this prop is passed
   * `canGenerate || canComplete` from the caller so the control still
   * renders (read-only) for view-only users. */
  canManage: boolean;
  /** Task #176 — switches ProjectDetail's tab to "qms" so the user can
   * actually go record/review the linked inspection. Omitted renders no
   * button (e.g. if a future caller has nowhere to send the user). */
  onOpenInspection?: () => void;
}

export function ProductionStageInspectionControl({
  projectId,
  stageId,
  stageName,
  libraryInspections,
  projectInspections,
  projectOverrides,
  currentUserId,
  currentUserName,
  canManage,
  onOpenInspection,
}: Props) {
  // Phase 32 (Task #175) - uses the combined action so a brand-new
  // inspection linked from Production also gets its characteristic
  // snapshot created immediately (needed by the QMS tab's characteristics
  // view), not just the bare instance row.
  const createProjectQmsInspection = useQmsStore(
    (s) => s.createProjectQmsInspectionWithCharacteristics,
  );
  const updateProjectQmsInspection = useQmsStore(
    (s) => s.updateProjectQmsInspection,
  );

  const [showPicker, setShowPicker] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const linked = projectInspections.find(
    (i) => i.requiredProductionStageId === stageId,
  );

  // Every other project_qms_inspections row keyed by library id, so the
  // picker can show "(already used)" annotations and the selection
  // handler can decide reuse vs. create vs. conflict without a second
  // pass over the array.
  const byLibraryId = new Map(
    projectInspections.map((i) => [i.libraryInspectionId, i]),
  );

  const applySelection = async (libraryInspectionId: string) => {
    const def = libraryInspections.find((d) => d.id === libraryInspectionId);
    if (!def) return;
    setSaving(true);
    try {
      const existing = byLibraryId.get(libraryInspectionId);

      if (!existing) {
        const result = await createProjectQmsInspection({
          projectId,
          libraryInspectionId: def.id,
          libraryInspectionName: def.name,
          requiredProductionStageId: stageId,
          mode: "Digital",
          byUserId: currentUserId,
          byUserName: currentUserName,
        });
        if (result.status === "success") {
          toast.success(`"${def.name}" linked to ${stageName}`);
          setShowPicker(false);
        } else if (result.status === "duplicate" && result.data) {
          // The DB's unique(project_id, library_inspection_id) constraint
          // caught a race - another write created it between our read and
          // this insert. Fall through to the same reuse/conflict logic
          // below using the row it actually returned.
          await handleExisting(result.data, def);
        } else {
          toast.error(result.error || "Could not link inspection");
        }
        return;
      }

      await handleExisting(existing, def);
    } finally {
      setSaving(false);
    }
  };

  const handleExisting = async (
    existing: ProjectQmsInspection,
    def: InspectionStageDefinition,
  ) => {
    if (
      !existing.requiredProductionStageId ||
      existing.requiredProductionStageId === stageId
    ) {
      // Independent (Path B) or already linked to this exact stage -
      // reuse it, per the approved duplicate-prevention rule: never
      // create a second instance of the same Library inspection for one
      // Project.
      const result = await updateProjectQmsInspection(existing.id, {
        requiredProductionStageId: stageId,
      });
      if (result.status === "success") {
        toast.success(`"${def.name}" linked to ${stageName}`);
        setShowPicker(false);
      } else {
        toast.error(result.error || "Could not link inspection");
      }
      return;
    }

    // Already linked to a DIFFERENT stage in this project - show the
    // existing inspection rather than silently creating a duplicate or
    // silently moving it (an inspection can only gate one stage).
    toast.error(
      `"${def.name}" already exists for this project and is linked to a different Production Stage. Remove that link first if you want to move it.`,
    );
  };

  const handleRemoveLink = async () => {
    if (!linked) return;
    setSaving(true);
    try {
      const result = await updateProjectQmsInspection(linked.id, {
        requiredProductionStageId: null,
      });
      if (result.status === "success") {
        toast.success(
          `"${linked.libraryInspectionName}" unlinked - it remains available independently for this project`,
        );
      } else {
        toast.error(result.error || "Could not remove link");
      }
    } finally {
      setSaving(false);
    }
  };

  if (linked) {
    // Task #176 - read-only gate decision for display only. Enforcement
    // (blocking "Mark Complete") happens in the caller, which owns the
    // stage-completion handlers this component has no access to.
    const gate = getStageInspectionGate(
      stageId,
      projectInspections,
      projectOverrides,
    );

    return (
      <div
        className="flex flex-col gap-2"
        data-ocid={`project-detail.production.inspection_required.${stageId}`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {gate.linked ? (
            <ProductionGateStatusBadge gate={gate} />
          ) : (
            <Badge
              variant="outline"
              className="text-[11px] gap-1 border-info/30 bg-info/10 text-info"
            >
              Inspection Required: {linked.libraryInspectionName}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {onOpenInspection && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              onClick={onOpenInspection}
              data-ocid={`project-detail.production.open_inspection.${stageId}`}
            >
              Open Inspection →
            </Button>
          )}
          {canManage && (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px]"
                disabled={saving}
                onClick={() => {
                  setPendingSelection(linked.libraryInspectionId);
                  setShowPicker(true);
                }}
              >
                Change
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px] text-destructive hover:text-destructive/80"
                disabled={saving}
                onClick={handleRemoveLink}
              >
                Remove
              </Button>
            </>
          )}
        </div>
        {showPicker && (
          <div className="flex items-center gap-2 w-full mt-1">
            <Select
              value={pendingSelection}
              onValueChange={setPendingSelection}
            >
              <SelectTrigger className="h-7 text-xs w-56">
                <SelectValue placeholder="Select QMS inspection..." />
              </SelectTrigger>
              <SelectContent>
                {libraryInspections.map((def) => {
                  const existing = byLibraryId.get(def.id);
                  const usedElsewhere =
                    existing?.requiredProductionStageId &&
                    existing.requiredProductionStageId !== stageId;
                  return (
                    <SelectItem key={def.id} value={def.id} className="text-xs">
                      {def.name}
                      {usedElsewhere ? " (linked to another stage)" : ""}
                      {existing && !usedElsewhere && existing.id !== linked.id
                        ? " (already used on this project)"
                        : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              disabled={!pendingSelection || saving}
              onClick={() => applySelection(pendingSelection)}
            >
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setShowPicker(false)}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 flex-wrap"
      data-ocid={`project-detail.production.inspection_required.${stageId}`}
    >
      <Switch
        checked={showPicker}
        disabled={!canManage || saving}
        onCheckedChange={(checked) => {
          setShowPicker(checked);
          if (!checked) setPendingSelection("");
        }}
      />
      <span className="text-xs text-muted-foreground">Inspection Required</span>
      {showPicker && (
        <>
          <Select value={pendingSelection} onValueChange={setPendingSelection}>
            <SelectTrigger className="h-7 text-xs w-56">
              <SelectValue placeholder="Select QMS inspection..." />
            </SelectTrigger>
            <SelectContent>
              {libraryInspections.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  No QMS Library inspections defined yet.
                </div>
              )}
              {libraryInspections.map((def) => {
                const existing = byLibraryId.get(def.id);
                const usedElsewhere = existing?.requiredProductionStageId;
                return (
                  <SelectItem key={def.id} value={def.id} className="text-xs">
                    {def.name}
                    {usedElsewhere
                      ? " (linked to another stage)"
                      : existing
                        ? " (already used on this project)"
                        : ""}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs"
            disabled={!pendingSelection || saving}
            onClick={() => applySelection(pendingSelection)}
          >
            Save
          </Button>
        </>
      )}
    </div>
  );
}
