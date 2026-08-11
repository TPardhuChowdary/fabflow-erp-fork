// Phase 32 (Task #175) — Project QMS area: every project_qms_inspections
// row for this Project (independent and Production-linked alike), each
// expandable into its characteristics/results/failure/rectification/
// history. Runs entirely alongside the existing one-sheet-per-project
// ProjectInspectionTab (QMS Phase 2) - that screen, its data, and its
// IndexedDB persistence are completely untouched by this file.
//
// Persistence: exclusively through useQmsStore's Phase 32 actions
// (lib/qmsInspectionsApi.ts -> Supabase). No local-only shadow state for
// inspection data - the arrays read here (projectQmsInspections etc.) are
// the same Supabase-hydrated caches Task #172 built and Task #174 already
// uses.

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShieldOff } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../../AuthContext";
import { hasPermission } from "../../permissions";
import { useStore } from "../../store";
import { ProjectQmsInspectionCard } from "../components/ProjectQmsInspectionCard";
import { INSPECTION_MODE_LABELS } from "../constants";
import { useQmsStore } from "../store/useQmsStore";
import type { InspectionMode } from "../types";

interface Props {
  projectId: string;
}

export function ProjectQmsInspectionsTab({ projectId }: Props) {
  const { currentUser } = useAuth();
  const userId = currentUser?.id ?? "";
  const userName = currentUser?.username ?? "unknown";

  const canView = hasPermission(currentUser, "inspection_sheets.view");
  const canManage =
    hasPermission(currentUser, "inspection_sheets.generate") ||
    hasPermission(currentUser, "inspection_sheets.complete");

  const {
    inspectionStages,
    inspectionStagesLoaded,
    loadInspectionStages,
    projectQmsInspections,
    projectQmsInspectionsHydration,
    projectQmsInspectionCharacteristics,
    projectQmsInspectionAttempts,
    createProjectQmsInspectionWithCharacteristics,
  } = useQmsStore();

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount
  useEffect(() => {
    if (!inspectionStagesLoaded) loadInspectionStages();
  }, [inspectionStagesLoaded]);

  // Production Stages are local/Zustand (Task #173's stable stageId) -
  // read directly from the main store, purely for display (resolving a
  // linked inspection's stage NAME). Never written to from here.
  const projectProductions = useStore((s) => s.projectProductions);
  const production = projectProductions.find(
    (pp) => pp.projectId === projectId,
  );
  const stageNameById = new Map(
    (production?.stages ?? [])
      .filter((s) => !!s.stageId)
      .map((s) => [s.stageId as string, s.stageName]),
  );

  const inspections = projectQmsInspections.filter(
    (i) => i.projectId === projectId,
  );

  const [selectedLibraryId, setSelectedLibraryId] = useState("");
  const [selectedMode, setSelectedMode] = useState<InspectionMode>("Digital");
  const [adding, setAdding] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[30vh] gap-3">
        <ShieldOff className="w-8 h-8 text-destructive" />
        <p className="text-sm text-muted-foreground">
          You do not have permission to view QMS inspections.
        </p>
      </div>
    );
  }

  const byLibraryId = new Map(
    inspections.map((i) => [i.libraryInspectionId, i]),
  );

  const handleAddIndependent = async () => {
    const def = inspectionStages.find((d) => d.id === selectedLibraryId);
    if (!def) {
      toast.error("Select a QMS inspection");
      return;
    }
    setAdding(true);
    try {
      const existing = byLibraryId.get(def.id);
      if (existing) {
        toast.info(
          `"${def.name}" already exists for this project — showing it below.`,
        );
        setHighlightId(existing.id);
        setSelectedLibraryId("");
        return;
      }
      const result = await createProjectQmsInspectionWithCharacteristics({
        projectId,
        libraryInspectionId: def.id,
        libraryInspectionName: def.name,
        mode: selectedMode,
        byUserId: userId,
        byUserName: userName,
      });
      if (result.status === "success" && result.data) {
        toast.success(`"${def.name}" added to this project's QMS`);
        setHighlightId(result.data.id);
        setSelectedLibraryId("");
      } else if (result.status === "duplicate" && result.data) {
        // A race - another client added it between our read and this
        // insert. Same as the "already exists" branch above.
        toast.info(`"${def.name}" already exists for this project.`);
        setHighlightId(result.data.id);
        setSelectedLibraryId("");
      } else {
        toast.error(result.error || "Could not add inspection");
      }
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-3" data-ocid="qms.project_inspection.tab">
      <div>
        <h3 className="text-sm font-semibold">Project QMS</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Every QMS inspection for this project — independent ones and those
          linked as a Production Stage's Required Inspection alike.
          Linking/unlinking a Production Stage happens from the Production tab;
          this screen is for recording results.
        </p>
      </div>

      {canManage && (
        <div className="flex items-center gap-2 flex-wrap border rounded-md p-2 bg-muted/20">
          <Select
            value={selectedLibraryId}
            onValueChange={setSelectedLibraryId}
          >
            <SelectTrigger className="h-8 text-xs w-64">
              <SelectValue placeholder="Add an independent inspection..." />
            </SelectTrigger>
            <SelectContent>
              {inspectionStages.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  No QMS Library inspections defined yet.
                </div>
              )}
              {inspectionStages.map((def) => {
                const existing = byLibraryId.get(def.id);
                return (
                  <SelectItem key={def.id} value={def.id} className="text-xs">
                    {def.name}
                    {existing ? " (already on this project)" : ""}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Select
            value={selectedMode}
            onValueChange={(v) => setSelectedMode(v as InspectionMode)}
          >
            <SelectTrigger className="h-8 text-xs w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["Digital", "Paper", "Hybrid"] as InspectionMode[]).map((m) => (
                <SelectItem key={m} value={m} className="text-xs">
                  {INSPECTION_MODE_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs"
            disabled={!selectedLibraryId || adding}
            onClick={handleAddIndependent}
            data-ocid="qms.project_inspection.add_independent_button"
          >
            {adding ? "Adding..." : "Add Inspection"}
          </Button>
        </div>
      )}

      {projectQmsInspectionsHydration.status === "loading" && (
        <p className="text-xs text-muted-foreground">Loading...</p>
      )}
      {projectQmsInspectionsHydration.status === "unauthenticated" && (
        <p className="text-xs text-muted-foreground">
          Sign in to view this project's QMS data.
        </p>
      )}
      {projectQmsInspectionsHydration.status === "error" && (
        <p className="text-xs text-destructive">
          Could not load QMS inspections
          {projectQmsInspectionsHydration.error
            ? `: ${projectQmsInspectionsHydration.error}`
            : "."}
        </p>
      )}

      {inspections.length === 0 &&
      projectQmsInspectionsHydration.status === "success" ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No QMS inspections for this project yet.
        </p>
      ) : (
        <div className="space-y-2">
          {inspections.map((insp) => (
            <ProjectQmsInspectionCard
              key={insp.id}
              inspection={insp}
              linkedStageName={
                insp.requiredProductionStageId
                  ? (stageNameById.get(insp.requiredProductionStageId) ?? null)
                  : null
              }
              characteristics={projectQmsInspectionCharacteristics.filter(
                (c) => c.projectQmsInspectionId === insp.id,
              )}
              attempts={projectQmsInspectionAttempts.filter(
                (a) => a.projectQmsInspectionId === insp.id,
              )}
              canRecord={canManage}
              currentUserId={userId}
              currentUserName={userName}
              defaultExpanded={insp.id === highlightId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
