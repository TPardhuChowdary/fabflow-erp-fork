import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, ShieldOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../AuthContext";
import { hasPermission } from "../../permissions";
import { useStore } from "../../store";
import * as inspectionApi from "../api/inspections";
import { InspectionStatusBadge } from "../components/inspection/InspectionStatusBadge";
import { INSPECTION_MODE_LABELS } from "../constants";
import { useQmsStore } from "../store/useQmsStore";
import { INSPECTION_SHEET_STATUS_ORDER, revisionToLetter } from "../types";
import type {
  InspectionSheetStatus,
  InspectionStageCompletion,
} from "../types";

const ALL = "__all__";

interface Props {
  onViewProject: (projectId: string) => void;
}

export function InspectionSheetsList({ onViewProject }: Props) {
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

  const userId = currentUser?.id ?? "";

  const [completions, setCompletions] = useState<InspectionStageCompletion[]>(
    [],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount
  useEffect(() => {
    if (!loaded) loadAll(userId);
    if (!inspectionStagesLoaded) loadInspectionStages();
    loadInspectionSheets();
    inspectionApi.getAllStageCompletions().then(setCompletions);
  }, [loaded, inspectionStagesLoaded]);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<InspectionSheetStatus | "All">("All");
  const [stageId, setStageId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const canView = hasPermission(currentUser, "inspection_sheets.view");

  // §15 — inspector / assigned inspector names live on InspectionStageCompletion,
  // one level below the sheet, so they're joined in for search purposes only.
  const completionsBySheet = useMemo(() => {
    const map = new Map<string, InspectionStageCompletion[]>();
    for (const c of completions) {
      const list = map.get(c.sheetId) ?? [];
      list.push(c);
      map.set(c.sheetId, list);
    }
    return map;
  }, [completions]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inspectionSheets
      .map((sheet) => {
        const project = projects.find((p) => p.id === sheet.projectId);
        const customer = customers.find((c) => c.id === sheet.customerId);
        return { sheet, project, customer };
      })
      .filter(({ sheet, project, customer }) => {
        if (status !== "All" && sheet.status !== status) return false;
        if (stageId && !sheet.stageIds.includes(stageId)) return false;
        if (dateFrom && sheet.generatedAt < new Date(dateFrom).getTime())
          return false;
        if (
          dateTo &&
          sheet.generatedAt > new Date(dateTo).getTime() + 86400000 - 1
        )
          return false;
        if (q) {
          const sheetCompletions = completionsBySheet.get(sheet.id) ?? [];
          const haystack = [
            sheet.inspectionNumber,
            project?.projectNo,
            project?.customerVisibleName,
            project?.projectName,
            customer?.name,
            sheet.status,
            sheet.drawingReference,
            sheet.drawingRevision,
            `revision ${revisionToLetter(sheet.revision)}`,
            ...sheetCompletions.map((c) => c.inspectorName),
            ...sheetCompletions.map((c) => c.assignedToName),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      });
  }, [
    inspectionSheets,
    projects,
    customers,
    search,
    status,
    stageId,
    dateFrom,
    dateTo,
    completionsBySheet,
  ]);

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

  return (
    <div className="space-y-4" data-ocid="qms.inspection_sheets.page">
      <div>
        <h1 className="text-xl font-bold">Inspection Sheets</h1>
        <p className="text-sm text-muted-foreground">
          Search and track every generated inspection sheet across all projects.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search number, project, customer, drawing, revision, inspector..."
            className="h-8 text-sm pl-8"
            data-ocid="qms.inspection_sheets.search"
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as InspectionSheetStatus | "All")}
        >
          <SelectTrigger
            className="h-8 text-xs w-40"
            data-ocid="qms.inspection_sheets.status_filter"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All" className="text-xs">
              All Statuses
            </SelectItem>
            {INSPECTION_SHEET_STATUS_ORDER.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={stageId || ALL}
          onValueChange={(v) => setStageId(v === ALL ? "" : v)}
        >
          <SelectTrigger
            className="h-8 text-xs w-40"
            data-ocid="qms.inspection_sheets.stage_filter"
          >
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL} className="text-xs">
              All Stages
            </SelectItem>
            {inspectionStages.map((s) => (
              <SelectItem key={s.id} value={s.id} className="text-xs">
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="h-8 text-xs w-36"
          title="Generated from"
          data-ocid="qms.inspection_sheets.date_from"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="h-8 text-xs w-36"
          title="Generated to"
          data-ocid="qms.inspection_sheets.date_to"
        />
      </div>

      <div className="text-xs text-muted-foreground">
        {rows.length} of {inspectionSheets.length} sheets shown
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="text-xs font-semibold">
                Inspection No
              </TableHead>
              <TableHead className="text-xs font-semibold">Rev</TableHead>
              <TableHead className="text-xs font-semibold">Project</TableHead>
              <TableHead className="text-xs font-semibold">Customer</TableHead>
              <TableHead className="text-xs font-semibold">Mode</TableHead>
              <TableHead className="text-xs font-semibold">Status</TableHead>
              <TableHead className="text-xs font-semibold">Generated</TableHead>
              <TableHead className="text-xs font-semibold">Approval</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center text-muted-foreground py-8"
                  data-ocid="qms.inspection_sheets.empty_state"
                >
                  No inspection sheets match the current filters
                </TableCell>
              </TableRow>
            )}
            {rows.map(({ sheet, project, customer }, i) => (
              <TableRow
                key={sheet.id}
                data-ocid={`qms.inspection_sheets.row.${i + 1}`}
              >
                <TableCell className="text-xs font-mono font-medium">
                  {sheet.inspectionNumber}
                </TableCell>
                <TableCell className="text-xs">
                  {revisionToLetter(sheet.revision)}
                </TableCell>
                <TableCell className="text-xs">
                  {project?.projectNo ?? "—"}
                </TableCell>
                <TableCell className="text-xs">
                  {customer?.name ?? "—"}
                </TableCell>
                <TableCell className="text-xs">
                  {INSPECTION_MODE_LABELS[sheet.mode]}
                </TableCell>
                <TableCell>
                  <InspectionStatusBadge status={sheet.status} />
                </TableCell>
                <TableCell className="text-xs">
                  {new Date(sheet.generatedAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  {sheet.approvedAt ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-green-100 text-green-700 border-green-200"
                    >
                      Approved
                    </Badge>
                  ) : sheet.reviewedAt ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-orange-100 text-orange-700 border-orange-200"
                    >
                      Reviewed
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-gray-100 text-gray-600 border-gray-200"
                    >
                      Pending
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs px-2"
                    onClick={() => onViewProject(sheet.projectId)}
                    data-ocid={`qms.inspection_sheets.open.${i + 1}`}
                  >
                    Open
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
