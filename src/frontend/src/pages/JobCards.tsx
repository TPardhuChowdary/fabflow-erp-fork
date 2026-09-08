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
  Printer,
  ShieldOff,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { CompleteJobCardDialog } from "../components/CompleteJobCardDialog";
import { ConfirmDeleteDialog } from "../components/ConfirmDeleteDialog";
import { EmployeeSelect } from "../components/EmployeeSelect";
import { JobCardTimerPanel } from "../components/JobCardTimerPanel";
import { ProjectSelect } from "../components/ProjectSelect";
import {
  formatJobCardTimestamp,
  useJobCardTimer,
} from "../hooks/useJobCardTimer";
import { getEvidenceRequirements } from "../lib/companySettingsApi";
import { JobCardDocContent } from "../lib/documentRenderers";
import { setJobCardExceptionStatusRemote } from "../lib/jobCardExceptionsApi";
import type { WriteResult } from "../lib/jobCardsApi";
import {
  computeNextJobNo,
  createJobCardRemote,
  deleteJobCardRemote,
  pauseJobCardRemote,
  resumeJobCardRemote,
  startJobCardRemote,
  updateJobCardRemote,
} from "../lib/jobCardsApi";
import {
  canApprove,
  canCreate,
  canDelete,
  canEdit,
  canView,
} from "../permissions";
import { useStore } from "../store";
import type { JobCard, JobCardExceptionReason, JobCardStatus } from "../types";

const REASON_LABEL: Record<JobCardExceptionReason, string> = {
  machine_breakdown: "Machine breakdown",
  material_unavailable: "Material unavailable",
  incorrect_material: "Incorrect material",
  design_specification_change: "Design/specification change",
  supervisor_delay: "Supervisor delay",
  customer_change: "Customer change",
  technical_difficulty: "Technical difficulty",
  safety_delay: "Safety issue",
  other: "Other approved reason",
};

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
  stageId: "",
  standardTimePerUnitMinutes: "",
  allocatedTimeMinutes: "",
  actualCompletedQty: "0",
  rejectedQty: "0",
  reworkQty: "0",
  // Start/End Date-Time are deliberately NOT form fields — they are
  // owned by the server-authoritative timer (enforce_job_card_timer_
  // transition) and set only by Start/Complete. The New/Edit form must
  // never ask a user to type them (see chat, Job Card timer UX
  // correction) — handleSaveEdit passes the existing job card's own
  // startTime/endTime straight through unchanged so an edit to any other
  // field can never reset or destroy them.
  status: "NotStarted" as JobCardStatus,
  notes: "",
};

export function JobCards() {
  const { currentUser } = useAuth();
  const {
    jobCards,
    employees,
    projects,
    projectProductions,
    jobCardExceptions,
    settings,
    addJobCard,
    updateJobCard,
    deleteJobCard,
    updateJobCardExceptionLocal,
  } = useStore();
  const pCreate = canCreate(currentUser, "job_cards");
  const pEdit = canEdit(currentUser, "job_cards");
  const pDelete = canDelete(currentUser, "job_cards");
  const pApprove = canApprove(currentUser, "job_cards");
  const pendingExceptions = jobCardExceptions.filter(
    (e) => e.status === "pending",
  );
  const [resolvingException, setResolvingException] = useState(false);

  async function resolveException(id: string, status: "approved" | "rejected") {
    if (resolvingException) return;
    setResolvingException(true);
    try {
      const result = await setJobCardExceptionStatusRemote(id, status);
      if (result.status === "unauthenticated") {
        toast.error("Not signed in - exception was not updated.");
        return;
      }
      if (result.status === "denied" || result.status === "error") {
        toast.error(result.error ?? "Could not update exception.");
        return;
      }
      if (!result.data) return;
      updateJobCardExceptionLocal(result.data);
      toast.success(
        status === "approved" ? "Exception approved" : "Exception rejected",
      );
    } finally {
      setResolvingException(false);
    }
  }

  const [addOpen, setAddOpen] = useState(false);
  const [editCard, setEditCard] = useState<JobCard | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<JobCard | null>(null);
  const [viewCard, setViewCard] = useState<JobCard | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  // Live-ticking Active Time for the View dialog's persisted Start/End
  // block below — called unconditionally (Rules of Hooks) with a no-op
  // fallback while the dialog is closed, so it stays in sync with
  // JobCardTimerPanel's own identical computation for the same card.
  const { formatted: viewCardActiveTime } = useJobCardTimer({
    status: viewCard?.status ?? "NotStarted",
    activeSeconds: viewCard?.activeSeconds ?? 0,
    currentRunStartedAt: viewCard?.currentRunStartedAt,
  });

  // Job Card live timer (Start/Pause/Resume/Complete) — same evidence
  // policy read and Complete flow as My Jobs (MyJobs.tsx), reused via
  // CompleteJobCardDialog rather than a second copy of that logic.
  const [completeOpen, setCompleteOpen] = useState(false);
  const [evidencePolicy, setEvidencePolicy] = useState<{
    job_card_completion?: boolean;
    quality_rejection?: boolean;
  }>({});
  useEffect(() => {
    getEvidenceRequirements().then((v) => {
      if (v) setEvidencePolicy(v);
    });
  }, []);

  async function handleTransition(
    action: (id: string) => Promise<WriteResult<JobCard>>,
    jc: JobCard,
    successMessage: string,
    failureMessage: string,
  ) {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const result = await action(jc.id);
      if (result.status === "unauthenticated") {
        toast.error(`Not signed in - ${failureMessage}`);
        return;
      }
      if (result.status === "denied" || result.status === "error") {
        toast.error(result.error ?? `Could not ${failureMessage}`);
        return;
      }
      if (!result.data) return;
      updateJobCard(result.data);
      setViewCard(result.data);
      toast.success(successMessage);
    } finally {
      setIsSaving(false);
    }
  }
  const handleStart = (jc: JobCard) =>
    handleTransition(startJobCardRemote, jc, "Job started", "start job");
  const handlePause = (jc: JobCard) =>
    handleTransition(pauseJobCardRemote, jc, "Job paused", "pause job");
  const handleResume = (jc: JobCard) =>
    handleTransition(resumeJobCardRemote, jc, "Job resumed", "resume job");

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
      stageId: jc.stageId ?? "",
      standardTimePerUnitMinutes: String(jc.standardTimePerUnitMinutes),
      allocatedTimeMinutes: String(jc.allocatedTimeMinutes),
      actualCompletedQty: String(jc.actualCompletedQty),
      rejectedQty: String(jc.rejectedQty),
      reworkQty: String(jc.reworkQty),
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
  const stageName = (stageId: string | undefined) =>
    stageId
      ? projectProductions
          .flatMap((pp) => pp.stages)
          .find((s) => s.stageId === stageId)?.stageName
      : undefined;
  const projectLabel = (id: string) => {
    const p = projects.find((x) => x.id === id);
    return p ? `${p.projectNo} — ${p.projectName}` : "—";
  };

  // Feature: Printable Job Card — physical/paper copy of this exact,
  // existing Job Card record for shop-floor employees without a phone or
  // FabFlow login. Same off-screen-render → popup-window → window.print()
  // pattern already used for Invoices/Quotations/Company POs/Delivery
  // Challans (see lib/documentUtils.ts, pages/CompanyPOs.tsx's own
  // handlePrint) — not a new print mechanism. The popup is a completely
  // separate document (no sidebar/nav/app chrome can ever appear in it),
  // and nothing here writes to the Job Card or any other table — it only
  // reads the same fields the View dialog above already reads.
  async function handlePrintJobCard(jc: JobCard) {
    const container = document.createElement("div");
    container.style.cssText =
      "position:fixed;top:0;left:-9999px;width:800px;background:#fff;z-index:9999";
    document.body.appendChild(container);
    const root = createRoot(container);
    const docId = `job-card-print-${jc.id}`;
    // Print Date requirement: the moment of printing, not the Job Card's
    // own createdAt — computed here, once, right before rendering the
    // print document, and never written back to `jc` or Supabase.
    const printedAt = Date.now();
    flushSync(() => {
      root.render(
        <JobCardDocContent
          id={docId}
          jobCard={jc}
          projectLabel={projectLabel(jc.projectId)}
          stageLabel={stageName(jc.stageId) ?? null}
          settings={settings as unknown as Record<string, string>}
          printedAt={printedAt}
        />,
      );
    });
    const el = document.getElementById(docId);
    const content = el?.innerHTML || "";
    root.unmount();
    container.remove();
    if (!content) return;
    const win = window.open("", "_blank", "width=900,height=650");
    if (!win) {
      toast.error("Please allow popups for this site to print Job Cards.");
      return;
    }
    win.document.write(
      `<html><head><title>Job Card ${jc.jobNo}</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#000;background:#fff;}table{border-collapse:collapse;width:100%;}@page{size:A4;margin:15mm;}@media print{body{padding:0;}}</style></head><body>${content}</body></html>`,
    );
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

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
          stageId: form.stageId || undefined,
          standardTimePerUnitMinutes: standardTime,
          allocatedTimeMinutes: allocatedTime,
          actualCompletedQty: Number.parseInt(form.actualCompletedQty, 10) || 0,
          rejectedQty: Number.parseInt(form.rejectedQty, 10) || 0,
          reworkQty: Number.parseInt(form.reworkQty, 10) || 0,
          // Never sent from this form — a new Job Card always starts with
          // no timer data; Start/Complete are what set these, server-side.
          startTime: undefined,
          endTime: undefined,
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
        stageId: form.stageId || undefined,
        standardTimePerUnitMinutes: standardTime,
        allocatedTimeMinutes: allocatedTime,
        actualCompletedQty: Number.parseInt(form.actualCompletedQty, 10) || 0,
        rejectedQty: Number.parseInt(form.rejectedQty, 10) || 0,
        reworkQty: Number.parseInt(form.reworkQty, 10) || 0,
        // Passed through unchanged, never from form state — this edit
        // form has no Start/End Date-Time inputs (the timer owns them),
        // so editing any other field here must never reset or destroy
        // whatever the timer has already persisted.
        startTime: editCard.startTime,
        endTime: editCard.endTime,
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

  // Scoped to the form's currently-selected project only — matches the
  // server's own same-project validation (trg_validate_job_card_stage_
  // reference, database/20260906060000) so the picker never offers a
  // choice the save would reject.
  const stagesForSelectedProject =
    projectProductions.find((pp) => pp.projectId === form.projectId)?.stages ??
    [];

  const formFields = (
    <div className="space-y-3 py-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Project *</Label>
          <ProjectSelect
            value={form.projectId}
            onChange={(id) =>
              // Clearing stageId on project change: a stage picked for a
              // different project would fail the server's same-project
              // validation trigger (database/20260906060000) — reset it
              // here rather than let the user hit that error blind.
              setForm((f) => ({ ...f, projectId: id, stageId: "" }))
            }
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
          <Label className="text-xs">Production Stage</Label>
          <Select
            value={form.stageId || "__none__"}
            onValueChange={(v) =>
              setForm((f) => ({ ...f, stageId: v === "__none__" ? "" : v }))
            }
            disabled={!form.projectId}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="No stage (ad-hoc)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No stage (ad-hoc)</SelectItem>
              {stagesForSelectedProject.map((s) => (
                <SelectItem key={s.stageId} value={s.stageId ?? ""}>
                  {s.stageName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
      {/* Start/End Date-Time are deliberately not editable here — the
          server-authoritative timer (Start/Pause/Resume/Complete) owns
          them entirely. See the read-only Start/End/Active Time block in
          the View dialog below for the persisted values. */}
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

      {pApprove && pendingExceptions.length > 0 && (
        <div
          className="rounded-lg border bg-warning/10 border-warning/30 p-4 space-y-3"
          data-ocid="jobcards.pending_exceptions"
        >
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            Pending Exceptions ({pendingExceptions.length})
          </h2>
          {pendingExceptions.map((e) => {
            const jc = jobCards.find((x) => x.id === e.jobCardId);
            return (
              <div
                key={e.id}
                className="flex items-start justify-between gap-3 rounded-md border bg-card p-3 text-sm"
                data-ocid={`jobcards.pending_exceptions.${e.id}`}
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {jc?.jobNo ?? "—"} — {REASON_LABEL[e.reasonType]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {jc?.employeeName ?? "Unknown employee"}
                    {jc && ` · ${jc.jobDescription}`}
                  </p>
                  {e.description && (
                    <p className="text-xs mt-1">{e.description}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={resolvingException}
                    onClick={() => resolveException(e.id, "rejected")}
                    data-ocid={`jobcards.pending_exceptions.${e.id}.reject`}
                  >
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    disabled={resolvingException}
                    onClick={() => resolveException(e.id, "approved")}
                    data-ocid={`jobcards.pending_exceptions.${e.id}.approve`}
                  >
                    Approve
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
                    <div className="flex items-center gap-1.5">
                      <Badge className={`text-xs ${statusCls(jc.status)}`}>
                        {STATUS_LABEL[jc.status]}
                      </Badge>
                      {/* Live timer glance right in the list — Admin
                          doesn't need to open the row to see it ticking. */}
                      {(jc.status === "InProgress" ||
                        jc.status === "OnHold") && (
                        <JobCardListTimerChip jc={jc} />
                      )}
                    </div>
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
              {/* Feature: Printable Job Card — physical/paper copy for a
                  shop-floor employee without a phone/login. Reuses this
                  exact Job Card's own data; nothing here writes to it. */}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => handlePrintJobCard(viewCard)}
                data-ocid="jobcards.view.print_button"
              >
                <Printer className="w-4 h-4 mr-2" /> Print Job Card
              </Button>
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
                    <p className="text-xs text-muted-foreground">
                      Production Stage
                    </p>
                    <p>{stageName(viewCard.stageId) ?? "Ad-hoc (no stage)"}</p>
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
                {/* Persisted timer timestamps — server-set only, never a
                    form field (see JobCardTimerPanel below for the
                    Start/Pause/Resume/Complete controls that set them).
                    Reopening this dialog after a reload always reads
                    these straight from the database row. */}
                <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted/30 p-2.5">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Start Date &amp; Time
                    </p>
                    <p className="text-xs font-medium">
                      {viewCard.startTime
                        ? formatJobCardTimestamp(viewCard.startTime)
                        : "Not started yet"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      End Date &amp; Time
                    </p>
                    <p className="text-xs font-medium">
                      {viewCard.endTime
                        ? formatJobCardTimestamp(viewCard.endTime)
                        : "Not completed yet"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Active Time</p>
                    <p className="text-xs font-mono font-semibold">
                      {viewCardActiveTime}
                    </p>
                  </div>
                </div>
                <JobCardTimerPanel
                  jobCard={viewCard}
                  canEdit={pEdit}
                  canPause={pApprove}
                  onStart={() => handleStart(viewCard)}
                  onPause={() => handlePause(viewCard)}
                  onResume={() => handleResume(viewCard)}
                  onComplete={() => setCompleteOpen(true)}
                  isSaving={isSaving}
                  dataOcidPrefix="jobcards.view.timer"
                />
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

      {viewCard && (
        <CompleteJobCardDialog
          job={viewCard}
          open={completeOpen}
          onOpenChange={setCompleteOpen}
          evidenceRequired={evidencePolicy.job_card_completion === true}
          requirePhotoOnReject={evidencePolicy.quality_rejection === true}
          onSaved={(jc) => {
            updateJobCard(jc);
            setViewCard(jc);
            setCompleteOpen(false);
          }}
          dataOcidPrefix="jobcards.complete"
        />
      )}

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

// Tiny live-ticking chip for the list row — full status/actions live in
// the JobCardTimerPanel inside the View dialog; this is just the
// "visible without opening the row" glance.
function JobCardListTimerChip({ jc }: { jc: JobCard }) {
  const { formatted } = useJobCardTimer(jc);
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded ${
        jc.status === "InProgress"
          ? "bg-success/10 text-success"
          : "bg-warning/15 text-warning"
      }`}
    >
      {jc.status === "InProgress" ? "⏱" : "⏸"} {formatted}
    </span>
  );
}
