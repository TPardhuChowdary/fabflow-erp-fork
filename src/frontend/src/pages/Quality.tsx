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
import { Textarea } from "@/components/ui/textarea";
import { ShieldOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { StatusBadge } from "../components/StatusBadge";
import { canEdit, canView } from "../permissions";
import { useStore } from "../store";
import type { QCStatus, QualityInspection } from "../types";

const INSPECTION_STAGES = [
  "Incoming",
  "Mid-Production",
  "Pre-Dispatch",
  "Final QC",
];

export function Quality() {
  const { currentUser } = useAuth();
  const {
    projects,
    customers,
    qualityInspections,
    addQualityInspection,
    updateQualityInspection,
  } = useStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [editApprovedQty, setEditApprovedQty] = useState<number>(0);
  const [editRejectedQty, setEditRejectedQty] = useState<number>(0);
  const [editRemarks, setEditRemarks] = useState("");

  const getInspection = (projectId: string): QualityInspection | undefined =>
    (qualityInspections || []).find((q) => q.projectId === projectId);

  const upsertQC = (
    projectId: string,
    updates: Partial<Omit<QualityInspection, "id" | "projectId">>,
  ) => {
    const existing = getInspection(projectId);
    if (existing) {
      updateQualityInspection({
        ...existing,
        ...updates,
        updatedAt: Date.now(),
      });
    } else {
      addQualityInspection({
        id: crypto.randomUUID(),
        projectId,
        stage: updates.stage ?? "Final QC",
        qcStatus: updates.qcStatus ?? "Pending",
        qcNotes: updates.qcNotes ?? "",
        approvedQty: updates.approvedQty ?? 0,
        rejectedQty: updates.rejectedQty ?? 0,
        remarks: updates.remarks ?? "",
        updatedAt: Date.now(),
      });
    }
  };

  const updateQCStatus = (projectId: string, status: QCStatus) => {
    if (!pEdit) {
      toast.error("No permission to edit Quality Inspection");
      return;
    }
    upsertQC(projectId, { qcStatus: status });
    toast.success("QC status updated");
  };

  const updateStage = (projectId: string, stage: string) => {
    if (!pEdit) {
      toast.error("No permission to edit Quality Inspection");
      return;
    }
    upsertQC(projectId, { stage });
  };

  const startEditNotes = (projectId: string) => {
    if (!pEdit) {
      toast.error("No permission to edit Quality Inspection");
      return;
    }
    const inspection = getInspection(projectId);
    setNotes(inspection?.qcNotes ?? "");
    setEditApprovedQty(inspection?.approvedQty ?? 0);
    setEditRejectedQty(inspection?.rejectedQty ?? 0);
    setEditRemarks(inspection?.remarks ?? "");
    setEditingId(projectId);
  };

  const saveNotes = (projectId: string) => {
    if (!pEdit) {
      toast.error("No permission to edit Quality Inspection");
      return;
    }
    upsertQC(projectId, {
      qcNotes: notes,
      approvedQty: editApprovedQty,
      rejectedQty: editRejectedQty,
      remarks: editRemarks,
    });
    toast.success("QC record saved");
    setEditingId(null);
  };

  const sorted = [...(projects || [])].sort(
    (a, b) => b.createdAt - a.createdAt,
  );

  const pEdit = canEdit(currentUser, "quality_inspection");

  if (!canView(currentUser, "quality_inspection")) {
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
    <div className="space-y-4" data-ocid="quality.page">
      <div>
        <h1 className="text-xl font-bold">Quality Inspection</h1>
        <p className="text-sm text-muted-foreground">
          Manage QC status for all projects
        </p>
      </div>

      <div className="table-wrapper">
        <div className="rounded-md border" data-ocid="quality.list.table">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-xs font-semibold">
                  Project ID
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Project Name
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Customer
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Inspection Stage
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  QC Status
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Approved Qty
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Rejected Qty
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Update QC
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Notes / Remarks
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center text-muted-foreground py-8"
                    data-ocid="quality.empty_state"
                  >
                    No projects for inspection
                  </TableCell>
                </TableRow>
              )}
              {sorted.map((project, i) => {
                const customer = (customers || []).find(
                  (c) => c.id === project.customerId,
                );
                const inspection = getInspection(project.id);
                const currentStage = inspection?.stage ?? "Final QC";
                const currentStatus: QCStatus =
                  inspection?.qcStatus ?? "Pending";
                const hasReworkRequired =
                  (inspection?.rejectedQty ?? 0) > 0 &&
                  (inspection?.approvedQty ?? 0) === 0;

                return (
                  <TableRow
                    key={project.id}
                    data-ocid={`quality.list.row.${i + 1}`}
                  >
                    <TableCell className="text-xs font-mono font-semibold">
                      {project.projectNo}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      <div className="flex items-center gap-2">
                        {project.projectName}
                        {hasReworkRequired && (
                          <Badge className="text-[10px] h-4 px-1.5 bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-100">
                            Rework Required
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {customer?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={currentStage}
                        onValueChange={(v) => updateStage(project.id, v)}
                        disabled={!pEdit}
                      >
                        <SelectTrigger
                          className="h-7 text-xs w-36"
                          disabled={!pEdit}
                          data-ocid={`quality.stage.select.${i + 1}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INSPECTION_STAGES.map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={currentStatus} />
                    </TableCell>
                    {/* Approved Qty */}
                    <TableCell className="text-sm">
                      {editingId === project.id ? (
                        <Input
                          type="number"
                          min={0}
                          className="h-7 text-xs w-20"
                          value={editApprovedQty}
                          onChange={(e) =>
                            setEditApprovedQty(Number(e.target.value))
                          }
                          data-ocid={`quality.approved_qty.input.${i + 1}`}
                        />
                      ) : (
                        <span className="text-green-700 font-medium">
                          {inspection?.approvedQty ?? 0}
                        </span>
                      )}
                    </TableCell>
                    {/* Rejected Qty */}
                    <TableCell className="text-sm">
                      {editingId === project.id ? (
                        <Input
                          type="number"
                          min={0}
                          className="h-7 text-xs w-20"
                          value={editRejectedQty}
                          onChange={(e) =>
                            setEditRejectedQty(Number(e.target.value))
                          }
                          data-ocid={`quality.rejected_qty.input.${i + 1}`}
                        />
                      ) : (
                        <span
                          className={
                            (inspection?.rejectedQty ?? 0) > 0
                              ? "text-destructive font-medium"
                              : ""
                          }
                        >
                          {inspection?.rejectedQty ?? 0}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={currentStatus}
                        onValueChange={(v) =>
                          updateQCStatus(project.id, v as QCStatus)
                        }
                        disabled={!pEdit}
                      >
                        <SelectTrigger
                          className="h-7 text-xs w-28"
                          disabled={!pEdit}
                          data-ocid={`quality.qcstatus.select.${i + 1}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(
                            ["Pending", "Pass", "Fail", "Rework"] as QCStatus[]
                          ).map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="min-w-[220px]">
                      {editingId === project.id ? (
                        <div className="space-y-1.5">
                          <Textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="text-xs h-14"
                            placeholder="QC notes..."
                            data-ocid={`quality.notes.textarea.${i + 1}`}
                          />
                          <Input
                            value={editRemarks}
                            onChange={(e) => setEditRemarks(e.target.value)}
                            className="h-7 text-xs"
                            placeholder="Remarks..."
                            data-ocid={`quality.remarks.input.${i + 1}`}
                          />
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              className="h-6 text-xs px-2"
                              onClick={() => saveNotes(project.id)}
                              data-ocid={`quality.notes.save_button.${i + 1}`}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-xs px-2"
                              onClick={() => setEditingId(null)}
                              data-ocid={`quality.notes.cancel_button.${i + 1}`}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground truncate">
                              {inspection?.qcNotes || "—"}
                            </p>
                            {inspection?.remarks && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                <span className="font-medium">Remarks:</span>{" "}
                                {inspection.remarks}
                              </p>
                            )}
                          </div>
                          {pEdit && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-xs px-2 shrink-0"
                              onClick={() => startEditNotes(project.id)}
                              data-ocid={`quality.notes.edit_button.${i + 1}`}
                            >
                              Edit
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
