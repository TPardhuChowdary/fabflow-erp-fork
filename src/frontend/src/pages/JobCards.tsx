// Job Cards feature (see chat) — employee-assigned, time-based work.
// Complements (does not replace) ProjectProductionStage: a Job Card is
// one employee's time-based work assignment/execution; the existing
// Production system remains authoritative for its own stage-gate logic.
//
// List + Create/Edit dialog + read-only detail, built entirely from
// existing primitives (Table, Dialog, RowActions, EmployeeSelect,
// ProjectSelect, StatusBadge-style inline badge) — no new visual
// language, matching the frozen UX.
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RowActions } from "@/components/ui/row-actions";
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
import {
  ClipboardList,
  Pencil,
  Plus,
  ShieldOff,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { ConfirmDeleteDialog } from "../components/ConfirmDeleteDialog";
import { EmployeeSelect } from "../components/EmployeeSelect";
import { ProjectSelect } from "../components/ProjectSelect";
import {
  computeNextJobNo,
  createJobCardRemote,
  deleteJobCardRemote,
  updateJobCardRemote,
} from "../lib/jobCardsApi";
import { canCreate, canDelete, canEdit, canView } from "../permissions";
import { useStore } from "../store";
import type { JobCard, JobCardStatus } from "../types";

const STATUS_LABEL: Record<JobCardStatus, string> = {
  NotStarted: "Not Started",
  InProgress: "In Progress",
  Completed: "Completed",
  OnHold: "On Hold",
};

function statusCls(status: JobCardStatus) {
  const map: Record<JobCardStatus, string> = {
    NotStarted: "bg-muted text-muted-foreground",
    InProgress: "bg-info/10 text-info border-info/30",
    Completed: "bg-success/10 text-success border-success/30",
    OnHold: "bg-warning/15 text-warning border-warning/30",
  };
  return map[status];
}

const emptyForm = {
  projectId: "",
  employeeId: "",
  jobDescription: "",
  operationType: "",
  standardTimePerUnitMinutes: "",
  allocatedTimeMinutes: "",
  actualCompletedQty: "0",
  rejectedQty: "0",
  reworkQty: "0",
  startTime: "",
  endTime: "",
  status: "NotStarted" as JobCardStatus,
  notes: "",
};

export function JobCards() {
  const { currentUser } = useAuth();
  const {
    jobCards,
    employees,
    projects,
    addJobCard,
    updateJobCard,
    deleteJobCard,
  } = useStore();
  const pCreate = canCreate(currentUser, "job_cards");
  const pEdit = canEdit(currentUser, "job_cards");
  const pDelete = canDelete(currentUser, "job_cards");

  const [addOpen, setAddOpen] = useState(false);
  const [editCard, setEditCard] = useState<JobCard | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<JobCard | null>(null);
  const [viewCard, setViewCard] = useState<JobCard | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const openAdd = () => {
    setForm(emptyForm);
    setAddOpen(true);
  };

  const openEdit = (jc: JobCard) => {
    setEditCard(jc);
    setForm({
      projectId: jc.projectId,
      employeeId: jc.employeeId ?? "",
      jobDescription: jc.jobDescription,
      operationType: jc.operationType,
      standardTimePerUnitMinutes: String(jc.standardTimePerUnitMinutes),
      allocatedTimeMinutes: String(jc.allocatedTimeMinutes),
      actualCompletedQty: String(jc.actualCompletedQty),
      rejectedQty: String(jc.rejectedQty),
      reworkQty: String(jc.reworkQty),
      startTime: jc.startTime ? jc.startTime.slice(0, 16) : "",
      endTime: jc.endTime ? jc.endTime.slice(0, 16) : "",
      status: jc.status,
      notes: jc.notes ?? "",
    });
  };

  // Live preview of the same calculation the server's GENERATED column
  // performs — Expected Quantity = Allocated Time / Standard Time per
  // Unit, floored to whole pieces (no fractional physical piece; see
  // database/phase-49/ for the disclosed rounding decision). Preview
  // only — the real, authoritative value always comes back from the
  // server after save, never trusted from this client calculation.
  const standardTime = Number.parseFloat(form.standardTimePerUnitMinutes);
  const allocatedTime = Number.parseFloat(form.allocatedTimeMinutes);
  const previewExpectedQty =
    standardTime > 0 && allocatedTime >= 0
      ? Math.floor(allocatedTime / standardTime)
      : null;

  const employeeName = (id: string) =>
    employees.find((e) => e.id === id)?.name ?? "";
  const projectNo = (id: string) =>
    projects.find((p) => p.id === id)?.projectNo ?? "—";

  const validate = () => {
    if (!form.projectId) {
      toast.error("Select a project");
      return false;
    }
    if (!form.employeeId) {
      toast.error("Select an employee");
      return false;
    }
    if (!form.jobDescription.trim()) {
      toast.error("Job description is required");
      return false;
    }
    if (!form.operationType.trim()) {
      toast.error("Operation type is required");
      return false;
    }
    if (!standardTime || standardTime <= 0) {
      toast.error("Standard time per unit must be greater than 0");
      return false;
    }
    if (Number.isNaN(allocatedTime) || allocatedTime < 0) {
      toast.error("Allocated time must be 0 or more");
      return false;
    }
    return true;
  };

  const handleSaveAdd = async () => {
    if (isSaving || !validate()) return;
    setIsSaving(true);
    try {
      const jobNo = computeNextJobNo(jobCards.map((jc) => jc.jobNo));
      const result = await createJobCardRemote(
        {
          jobNo,
          projectId: form.projectId,
          employeeId: form.employeeId,
          employeeName: employeeName(form.employeeId),
          jobDescription: form.jobDescription.trim(),
          operationType: form.operationType.trim(),
          standardTimePerUnitMinutes: standardTime,
          allocatedTimeMinutes: allocatedTime,
          actualCompletedQty: Number.parseInt(form.actualCompletedQty, 10) || 0,
          rejectedQty: Number.parseInt(form.rejectedQty, 10) || 0,
          reworkQty: Number.parseInt(form.reworkQty, 10) || 0,
          startTime: form.startTime || undefined,
          endTime: form.endTime || undefined,
          status: form.status,
          notes: form.notes.trim() || undefined,
        },
        { autoRenumberOnConflict: true },
      );
      if (result.status === "unauthenticated") {
        toast.error("You must be signed in to create a Job Card");
        return;
      }
      if (result.status === "denied") {
        toast.error("You do not have permission to create Job Cards");
        return;
      }
      if (result.status === "error" || !result.data) {
        toast.error(result.error || "Failed to create Job Card");
        return;
      }
      addJobCard(result.data);
      toast.success(`${result.data.jobNo} created`);
      setAddOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (isSaving || !editCard || !validate()) return;
    setIsSaving(true);
    try {
      const result = await updateJobCardRemote({
        id: editCard.id,
        jobNo: editCard.jobNo,
        projectId: form.projectId,
        employeeId: form.employeeId,
        employeeName: employeeName(form.employeeId),
        jobDescription: form.jobDescription.trim(),
        operationType: form.operationType.trim(),
        standardTimePerUnitMinutes: standardTime,
        allocatedTimeMinutes: allocatedTime,
        actualCompletedQty: Number.parseInt(form.actualCompletedQty, 10) || 0,
        rejectedQty: Number.parseInt(form.rejectedQty, 10) || 0,
        reworkQty: Number.parseInt(form.reworkQty, 10) || 0,
        startTime: form.startTime || undefined,
        endTime: form.endTime || undefined,
        status: form.status,
        notes: form.notes.trim() || undefined,
      });
      if (result.status === "unauthenticated") {
        toast.error("You must be signed in to edit a Job Card");
        return;
      }
      if (result.status === "denied") {
        toast.error("You do not have permission to edit Job Cards");
        return;
      }
      if (result.status === "error" || !result.data) {
        toast.error(result.error || "Failed to update Job Card");
        return;
      }
      updateJobCard(result.data);
      toast.success("Job Card updated");
      setEditCard(null);
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteJobCardRemote(deleteTarget.id);
    if (result.status === "unauthenticated") {
      toast.error("You must be signed in to delete a Job Card");
      return;
    }
    if (result.status === "denied" || result.status === "error") {
      toast.error(result.error ?? "Could not delete Job Card");
      return;
    }
    deleteJobCard(deleteTarget.id);
    toast.success("Job Card deleted");
    if (viewCard?.id === deleteTarget.id) setViewCard(null);
    setDeleteTarget(null);
  };

  const formFields = (
    <div className="space-y-3 py-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Project *</Label>
          <ProjectSelect
            value={form.projectId}
            onChange={(id) => setForm((f) => ({ ...f, projectId: id }))}
            className="w-full"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Employee *</Label>
          <EmployeeSelect
            value={form.employeeId}
            onChange={(id) => setForm((f) => ({ ...f, employeeId: id }))}
            className="w-full"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Job / Task *</Label>
          <Input
            value={form.jobDescription}
            onChange={(e) =>
              setForm((f) => ({ ...f, jobDescription: e.target.value }))
            }
            placeholder="e.g. Cut 3mm MS sheet to size"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Operation Type *</Label>
          <Input
            value={form.operationType}
            onChange={(e) =>
              setForm((f) => ({ ...f, operationType: e.target.value }))
            }
            placeholder="e.g. Cutting"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Standard Time / Unit (minutes) *</Label>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={form.standardTimePerUnitMinutes}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                standardTimePerUnitMinutes: e.target.value,
              }))
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Allocated Time (minutes) *</Label>
          <Input
            type="number"
            min="0"
            step="1"
            value={form.allocatedTimeMinutes}
            onChange={(e) =>
              setForm((f) => ({ ...f, allocatedTimeMinutes: e.target.value }))
            }
          />
        </div>
      </div>
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
        Expected Quantity ={" "}
        <span className="font-semibold font-mono">
          {previewExpectedQty !== null ? previewExpectedQty : "—"}
        </span>{" "}
        pieces
        <span className="text-xs text-muted-foreground">
          {" "}
          (Allocated Time ÷ Standard Time per Unit, rounded down)
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Actual Completed Qty</Label>
          <Input
            type="number"
            min="0"
            value={form.actualCompletedQty}
            onChange={(e) =>
              setForm((f) => ({ ...f, actualCompletedQty: e.target.value }))
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Rejected Qty</Label>
          <Input
            type="number"
            min="0"
            value={form.rejectedQty}
            onChange={(e) =>
              setForm((f) => ({ ...f, rejectedQty: e.target.value }))
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Rework Qty</Label>
          <Input
            type="number"
            min="0"
            value={form.reworkQty}
            onChange={(e) =>
              setForm((f) => ({ ...f, reworkQty: e.target.value }))
            }
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Start Time</Label>
          <Input
            type="datetime-local"
            value={form.startTime}
            onChange={(e) =>
              setForm((f) => ({ ...f, startTime: e.target.value }))
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">End Time</Label>
          <Input
            type="datetime-local"
            value={form.endTime}
            onChange={(e) =>
              setForm((f) => ({ ...f, endTime: e.target.value }))
            }
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Status</Label>
        <Select
          value={form.status}
          onValueChange={(v) =>
            setForm((f) => ({ ...f, status: v as JobCardStatus }))
          }
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STATUS_LABEL) as JobCardStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Notes</Label>
        <Textarea
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={2}
        />
      </div>
    </div>
  );

  if (!canView(currentUser, "job_cards")) {
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
    <div className="space-y-4" data-ocid="jobcards.page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Job Cards</h1>
          <p className="text-sm text-muted-foreground">
            {jobCards.length} job card{jobCards.length !== 1 ? "s" : ""} —
            employee-assigned, time-based work
          </p>
        </div>
        {pCreate && (
          <Button
            size="sm"
            onClick={openAdd}
            data-ocid="jobcards.primary_button"
          >
            <Plus className="w-4 h-4 mr-1" /> New Job Card
          </Button>
        )}
      </div>

      <div className="table-wrapper">
        <div className="rounded-md border" data-ocid="jobcards.list.table">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-xs font-semibold">Job No</TableHead>
                <TableHead className="text-xs font-semibold">Project</TableHead>
                <TableHead className="text-xs font-semibold">
                  Employee
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Operation
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Expected
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Completed
                </TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="text-xs font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobCards.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center py-10 text-sm text-muted-foreground"
                    data-ocid="jobcards.list.empty_state"
                  >
                    No Job Cards yet. Click "New Job Card" to create one.
                  </TableCell>
                </TableRow>
              )}
              {jobCards.map((jc, i) => (
                <TableRow
                  key={jc.id}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => setViewCard(jc)}
                  data-ocid={`jobcards.item.${i + 1}`}
                >
                  <TableCell className="font-mono text-sm font-medium">
                    <span className="flex items-center gap-1.5">
                      <ClipboardList className="w-3.5 h-3.5 text-muted-foreground" />
                      {jc.jobNo}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {projectNo(jc.projectId)}
                  </TableCell>
                  <TableCell className="text-sm">{jc.employeeName}</TableCell>
                  <TableCell className="text-sm">{jc.operationType}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {jc.expectedQuantity}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {jc.actualCompletedQty}
                    {(jc.rejectedQty > 0 || jc.reworkQty > 0) && (
                      <span className="text-muted-foreground">
                        {" "}
                        ({jc.rejectedQty > 0 && `${jc.rejectedQty} rej.`}
                        {jc.rejectedQty > 0 && jc.reworkQty > 0 && ", "}
                        {jc.reworkQty > 0 && `${jc.reworkQty} rwk.`})
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${statusCls(jc.status)}`}>
                      {STATUS_LABEL[jc.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <RowActions
                        primary={
                          pEdit
                            ? [
                                {
                                  label: "Edit",
                                  icon: Pencil,
                                  onClick: () => openEdit(jc),
                                  "data-ocid": `jobcards.edit_button.${i + 1}`,
                                },
                              ]
                            : []
                        }
                        overflow={
                          pDelete
                            ? [
                                {
                                  label: "Delete",
                                  icon: Trash2,
                                  destructive: true,
                                  onClick: () => setDeleteTarget(jc),
                                  "data-ocid": `jobcards.delete_button.${i + 1}`,
                                },
                              ]
                            : []
                        }
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Add */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent
          className="max-w-lg max-h-[90vh] overflow-y-auto"
          data-ocid="jobcards.add.dialog"
        >
          <DialogHeader>
            <DialogTitle>New Job Card</DialogTitle>
          </DialogHeader>
          {formFields}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isSaving}
              onClick={handleSaveAdd}
              data-ocid="jobcards.add.submit_button"
            >
              {isSaving ? "Saving…" : "Create Job Card"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog
        open={!!editCard}
        onOpenChange={(o) => {
          if (!o) setEditCard(null);
        }}
      >
        <DialogContent
          className="max-w-lg max-h-[90vh] overflow-y-auto"
          data-ocid="jobcards.edit.dialog"
        >
          <DialogHeader>
            <DialogTitle>Edit {editCard?.jobNo}</DialogTitle>
          </DialogHeader>
          {formFields}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditCard(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isSaving}
              onClick={handleSaveEdit}
              data-ocid="jobcards.edit.submit_button"
            >
              {isSaving ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View detail */}
      <Dialog
        open={!!viewCard}
        onOpenChange={(o) => {
          if (!o) setViewCard(null);
        }}
      >
        <DialogContent className="max-w-md" data-ocid="jobcards.view.dialog">
          {viewCard && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-2">
                  <DialogTitle>{viewCard.jobNo}</DialogTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setViewCard(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Project</p>
                    <p className="font-mono">{projectNo(viewCard.projectId)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Employee</p>
                    <p>{viewCard.employeeName}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Job / Task</p>
                  <p>{viewCard.jobDescription}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Operation Type
                    </p>
                    <p>{viewCard.operationType}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge className={`text-xs ${statusCls(viewCard.status)}`}>
                      {STATUS_LABEL[viewCard.status]}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/30 p-2.5">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Standard Time / Unit
                    </p>
                    <p className="font-mono">
                      {viewCard.standardTimePerUnitMinutes} min
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Allocated Time
                    </p>
                    <p className="font-mono">
                      {viewCard.allocatedTimeMinutes} min
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Expected Quantity
                    </p>
                    <p className="font-mono font-semibold">
                      {viewCard.expectedQuantity} pcs
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Actual Time Spent
                    </p>
                    <p className="font-mono">
                      {viewCard.actualTimeSpentMinutes != null
                        ? `${viewCard.actualTimeSpentMinutes} min`
                        : "—"}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Completed</p>
                    <p className="font-mono">{viewCard.actualCompletedQty}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Rejected</p>
                    <p className="font-mono text-destructive">
                      {viewCard.rejectedQty}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Rework</p>
                    <p className="font-mono text-warning">
                      {viewCard.reworkQty}
                    </p>
                  </div>
                </div>
                {viewCard.notes && (
                  <div>
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p>{viewCard.notes}</p>
                  </div>
                )}
              </div>
              <DialogFooter>
                {pEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      openEdit(viewCard);
                      setViewCard(null);
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
        title="Delete Job Card"
        description={`Job Card "${deleteTarget?.jobNo}"`}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
