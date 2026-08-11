import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Clock, ShieldOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../AuthContext";
import { hasPermission } from "../../permissions";
import { useStore } from "../../store";
import * as inspectionApi from "../api/inspections";
import { InspectionStatusBadge } from "../components/inspection/InspectionStatusBadge";
import { useQmsStore } from "../store/useQmsStore";
import type { InspectionSheet, InspectionStageCompletion } from "../types";

interface Props {
  onOpenProject: (projectId: string) => void;
}

interface AssignedRow {
  sheetId: string;
  stageId: string;
  completion: InspectionStageCompletion;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/** §7 — "My Assigned Inspections": every stage assigned to the signed-in
 * inspector, bucketed into Pending / Overdue / Recently Completed, scoped
 * to only the current revision of each sheet so a superseded revision's
 * stale assignment never shows up here (see createRevision() in
 * qms/api/inspections.ts — a new revision always starts unassigned). */
export function InspectorDashboard({ onOpenProject }: Props) {
  const { currentUser } = useAuth();
  const { projects, customers } = useStore();
  const {
    loaded,
    inspectionStagesLoaded,
    inspectionStages,
    inspectionSheets,
    loadAll,
    loadInspectionStages,
    loadInspectionSheets,
  } = useQmsStore();

  const [assignments, setAssignments] = useState<AssignedRow[]>([]);
  const userId = currentUser?.id ?? "";

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount
  useEffect(() => {
    if (!loaded) loadAll(userId);
    if (!inspectionStagesLoaded) loadInspectionStages();
    loadInspectionSheets();
    inspectionApi.getAllAssignments().then(setAssignments);
  }, [loaded, inspectionStagesLoaded]);

  const canView = hasPermission(currentUser, "inspection_sheets.view");
  const myEmployeeId = currentUser?.employeeId;

  const currentSheetIds = useMemo(() => {
    const byProject = new Map<string, InspectionSheet>();
    for (const sheet of inspectionSheets) {
      const existing = byProject.get(sheet.projectId);
      if (!existing || sheet.revision > existing.revision) {
        byProject.set(sheet.projectId, sheet);
      }
    }
    return new Set(Array.from(byProject.values()).map((s) => s.id));
  }, [inspectionSheets]);

  const myRows = useMemo(() => {
    if (!myEmployeeId) return [];
    return assignments
      .filter((a) => a.completion.assignedTo === myEmployeeId)
      .filter((a) => currentSheetIds.has(a.sheetId))
      .map((a) => {
        const sheet = inspectionSheets.find((s) => s.id === a.sheetId);
        const stage = inspectionStages.find((s) => s.id === a.stageId);
        const project = sheet
          ? projects.find((p) => p.id === sheet.projectId)
          : undefined;
        const customer = sheet
          ? customers.find((c) => c.id === sheet.customerId)
          : undefined;
        return { ...a, sheet, stage, project, customer };
      })
      .filter((r) => !!r.sheet && !!r.stage);
  }, [
    assignments,
    myEmployeeId,
    currentSheetIds,
    inspectionSheets,
    inspectionStages,
    projects,
    customers,
  ]);

  const isDone = (c: InspectionStageCompletion) =>
    !!c.completedAt || !!c.signedAt;
  const isOverdue = (c: InspectionStageCompletion) =>
    !isDone(c) && !!c.dueDate && c.dueDate < todayIso();

  const pending = myRows.filter(
    (r) => !isDone(r.completion) && !isOverdue(r.completion),
  );
  const overdue = myRows.filter((r) => isOverdue(r.completion));
  const recentlyCompleted = myRows
    .filter((r) => isDone(r.completion))
    .sort(
      (a, b) =>
        (b.completion.signedAt ?? b.completion.completedAt ?? 0) -
        (a.completion.signedAt ?? a.completion.completedAt ?? 0),
    )
    .slice(0, 10);

  const assignedProjectCount = new Set(
    myRows.map((r) => r.project?.id).filter(Boolean),
  ).size;

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
          <ShieldOff className="w-8 h-8 text-destructive" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold">Access Restricted</h2>
          <p className="text-sm text-muted-foreground mt-1">
            You do not have permission to view this module.
          </p>
        </div>
      </div>
    );
  }

  if (!myEmployeeId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          Your login isn't linked to an Employee record, so no stage assignments
          can be matched to you. Ask an administrator to link your account to an
          employee.
        </p>
      </div>
    );
  }

  const Row = ({ r }: { r: (typeof myRows)[number] }) => (
    <div
      className="flex items-center justify-between gap-3 rounded-md border p-2.5 text-xs"
      data-ocid={`qms.inspector_dashboard.row.${r.sheetId}.${r.stageId}`}
    >
      <div className="min-w-0">
        <div className="font-medium truncate">
          {r.stage?.name} · {r.sheet?.inspectionNumber}
        </div>
        <div className="text-muted-foreground truncate">
          {r.project?.projectNo ?? "—"} · {r.customer?.name ?? "—"}
          {r.completion.dueDate && ` · Due ${r.completion.dueDate}`}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {r.sheet && <InspectionStatusBadge status={r.sheet.status} />}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 text-xs px-2"
          onClick={() => r.project && onOpenProject(r.project.id)}
          data-ocid={`qms.inspector_dashboard.open.${r.sheetId}.${r.stageId}`}
        >
          Open
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4" data-ocid="qms.inspector_dashboard.page">
      <div>
        <h1 className="text-xl font-bold">My Assigned Inspections</h1>
        <p className="text-sm text-muted-foreground">
          Stages assigned to you across {assignedProjectCount} project
          {assignedProjectCount === 1 ? "" : "s"}.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <Clock className="w-5 h-5 text-muted-foreground" />
            <div>
              <div className="text-lg font-bold">{pending.length}</div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <div>
              <div className="text-lg font-bold">{overdue.length}</div>
              <div className="text-xs text-muted-foreground">Overdue</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <div>
              <div className="text-lg font-bold">
                {recentlyCompleted.length}
              </div>
              <div className="text-xs text-muted-foreground">
                Recently Completed
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {overdue.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              Overdue
              <Badge
                variant="outline"
                className="text-[10px] bg-red-100 text-red-700 border-red-200"
              >
                {overdue.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overdue.map((r) => (
              <Row key={`${r.sheetId}.${r.stageId}`} r={r} />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            Pending Stages
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {pending.length === 0 && (
            <p className="text-xs text-muted-foreground py-4 text-center">
              Nothing pending — you're all caught up.
            </p>
          )}
          {pending.map((r) => (
            <Row key={`${r.sheetId}.${r.stageId}`} r={r} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            Recently Completed
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {recentlyCompleted.length === 0 && (
            <p className="text-xs text-muted-foreground py-4 text-center">
              No completed stages yet.
            </p>
          )}
          {recentlyCompleted.map((r) => (
            <Row key={`${r.sheetId}.${r.stageId}`} r={r} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
