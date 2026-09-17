// Employee Job Card Mobile Workflow — "My Jobs".
//
// Deliberately NOT a new job-card data model: reads the exact same
// job_cards rows JobCards.tsx (the admin list) already reads, filtered
// client-side to the logged-in user's own employeeId - the same
// established pattern this app already uses for "assigned to me" views
// (see qms-my-inspections, gated on the same inspection_sheets module as
// the full list; Projects.tsx's own assignedEmployeeIds filter). Job
// cards remain gated on the existing job_cards permission module - an
// org admin grants Workers job_cards.view (+ .edit to actually use this
// page) via the existing Settings > Users permission editor, same as
// every other module.
//
// Start/Complete write through the exact same updateJobCardRemote/
// job_cards columns JobCards.tsx's own edit dialog writes - no second
// timing system, no parallel status vocabulary. Exceptions reuse
// job_card_exceptions (database/phase-58) unchanged. Evidence photos
// reuse AssetPhotoGallery/assetPhotosApi.ts unchanged (ownerType
// "job_card" - see database/phase-62, not yet applied as of this build;
// the photo step degrades to "no photos yet, contact your admin" until
// then rather than erroring).
//
// This phase records data only - it does not calculate performance,
// incentives, or compensation. reject_root_cause is captured here so a
// later, separate phase can use it fairly; nothing here scores anyone.

import { AssetPhotoGallery } from "@/components/AssetPhotoGallery";
import {
  CompleteJobCardDialog,
  ROOT_CAUSE_LABEL,
} from "@/components/CompleteJobCardDialog";
import { JobCardTimerPanel } from "@/components/JobCardTimerPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  formatJobCardTimestamp,
  useJobCardTimer,
} from "@/hooks/useJobCardTimer";
import { getEvidenceRequirements } from "@/lib/companySettingsApi";
import { createJobCardExceptionRemote } from "@/lib/jobCardExceptionsApi";
import type { WriteResult } from "@/lib/jobCardsApi";
import {
  pauseJobCardRemote,
  resumeJobCardRemote,
  startJobCardRemote,
} from "@/lib/jobCardsApi";
import { canApprove, canEdit } from "@/permissions";
import { useStore } from "@/store";
import type {
  JobCard,
  JobCardException,
  JobCardExceptionReason,
  JobCardStatus,
} from "@/types";
import { AlertTriangle, ClipboardList, Clock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";

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

export function MyJobs() {
  const { currentUser } = useAuth();
  const {
    jobCards,
    projects,
    jobCardExceptions,
    updateJobCard,
    addJobCardExceptionLocal,
  } = useStore();
  const pEdit = canEdit(currentUser, "job_cards");
  // Pause is Admin/Supervisor-only - reuses the existing job_cards.approve
  // permission (already used, unmodified, for job_card_exceptions
  // approval) rather than introducing a new one. Enforced server-side by
  // the enforce_job_card_timer_transition trigger regardless of this
  // check; this only controls whether the button is shown.
  const pPause = canApprove(currentUser, "job_cards");

  const myJobCards = useMemo(
    () =>
      currentUser?.employeeId
        ? jobCards.filter((jc) => jc.employeeId === currentUser.employeeId)
        : [],
    [jobCards, currentUser?.employeeId],
  );

  const projectLabel = (id: string) => {
    const p = projects.find((x) => x.id === id);
    return p ? `${p.projectNo} — ${p.projectName}` : "—";
  };

  const exceptionsFor = (jobCardId: string) =>
    jobCardExceptions.filter((e) => e.jobCardId === jobCardId);

  const [activeJob, setActiveJob] = useState<JobCard | null>(null);
  // Live-ticking Active Time for the persisted Start/End block in the
  // detail dialog below — called unconditionally (Rules of Hooks), stays
  // in sync with JobCardTimerPanel's own identical computation.
  const { formatted: activeJobActiveTime } = useJobCardTimer({
    status: activeJob?.status ?? "NotStarted",
    activeSeconds: activeJob?.activeSeconds ?? 0,
    currentRunStartedAt: activeJob?.currentRunStartedAt,
  });
  const [completeOpen, setCompleteOpen] = useState(false);
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Evidence policy, read once - see database/phase-62. Falls back to
  // "not required" (the least surprising default) if the row doesn't
  // exist yet, matching Phase 60's own "ship configurable defaults"
  // philosophy rather than blocking submission on missing configuration.
  const [evidencePolicy, setEvidencePolicy] = useState<{
    job_card_completion?: boolean;
    quality_rejection?: boolean;
  }>({});
  // database/phase-63 — a plain getCompanySetting() select is
  // settings.view-gated and silently returns nothing for a Worker
  // account, which used to make this policy read as "not required" for
  // exactly the population it's meant to govern. getEvidenceRequirements
  // is a narrow RPC any authenticated user can call.
  useEffect(() => {
    getEvidenceRequirements().then((v) => {
      if (v) setEvidencePolicy(v);
    });
  }, []);

  const groups: { label: string; status: JobCardStatus; jobs: JobCard[] }[] = (
    [
      { label: "Not Started", status: "NotStarted" },
      { label: "In Progress", status: "InProgress" },
      { label: "Completed", status: "Completed" },
      { label: "On Hold", status: "OnHold" },
    ] as { label: string; status: JobCardStatus }[]
  )
    .map((g) => ({
      ...g,
      jobs: myJobCards.filter((jc) => jc.status === g.status),
    }))
    .filter((g) => g.jobs.length > 0);

  // Start/Pause/Resume all follow the same shape: a minimal {status}-only
  // remote call (database/20260906050000's trigger does the real
  // validation, permission check, and timestamp stamping), then update
  // both the shared store and the open detail dialog with whatever the
  // server actually persisted.
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
      setActiveJob(result.data);
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

  return (
    <div className="space-y-5 pb-8" data-ocid="my-jobs.page">
      <div>
        <h1 className="text-xl font-bold">My Jobs</h1>
        <p className="text-sm text-muted-foreground">
          {myJobCards.length} job{myJobCards.length !== 1 ? "s" : ""} assigned
          to you
        </p>
      </div>

      {!currentUser?.employeeId && (
        <div className="rounded-lg border bg-warning/10 border-warning/30 p-4 text-sm">
          Your login isn't linked to an employee record, so no jobs can be
          shown. Ask your administrator to link your account under Employees.
        </div>
      )}

      {currentUser?.employeeId && myJobCards.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No jobs assigned to you yet.
        </div>
      )}

      {groups.map((g) => (
        <div key={g.status} className="space-y-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {g.label} ({g.jobs.length})
          </h2>
          <div className="space-y-2">
            {g.jobs.map((jc) => {
              const pending = exceptionsFor(jc.id).some(
                (e) => e.status === "pending",
              );
              return (
                <button
                  key={jc.id}
                  type="button"
                  onClick={() => setActiveJob(jc)}
                  className="w-full text-left rounded-lg border bg-card p-4 active:bg-muted/50 transition-colors"
                  data-ocid={`my-jobs.card.${jc.jobNo}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-muted-foreground">
                        {jc.jobNo}
                      </p>
                      <p className="font-semibold text-sm truncate">
                        {jc.jobDescription}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {projectLabel(jc.projectId)}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="shrink-0 text-xs"
                      data-ocid={`my-jobs.card.${jc.jobNo}.status`}
                    >
                      {STATUS_LABEL[jc.status]}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />{" "}
                      {jc.allocatedTimeMinutes}
                      min
                    </span>
                    <span>Target: {jc.expectedQuantity} pcs</span>
                    {jc.status === "Completed" && (
                      <span className="tabular-nums">
                        Done: {jc.actualCompletedQty}
                        {jc.rejectedQty > 0 && ` · Rej ${jc.rejectedQty}`}
                        {jc.reworkQty > 0 && ` · Rwk ${jc.reworkQty}`}
                      </span>
                    )}
                    {pending && (
                      <span className="flex items-center gap-1 text-warning">
                        <AlertTriangle className="w-3.5 h-3.5" /> Exception
                        pending review
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Job detail / actions */}
      <Dialog
        open={!!activeJob && !completeOpen && !exceptionOpen}
        onOpenChange={(o) => {
          if (!o) setActiveJob(null);
        }}
      >
        <DialogContent
          className="max-w-md max-h-[90vh] overflow-y-auto"
          data-ocid="my-jobs.detail.dialog"
        >
          {activeJob && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-primary" />
                  {activeJob.jobNo}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p className="font-medium">{activeJob.jobDescription}</p>
                <p className="text-muted-foreground">
                  {projectLabel(activeJob.projectId)}
                </p>
                <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Standard Time
                    </p>
                    <p className="font-mono">
                      {activeJob.standardTimePerUnitMinutes} min/pc
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Allocated Time
                    </p>
                    <p className="font-mono">
                      {activeJob.allocatedTimeMinutes} min
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Target Quantity
                    </p>
                    <p className="font-mono font-semibold">
                      {activeJob.expectedQuantity} pcs
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge variant="outline" className="text-xs">
                      {STATUS_LABEL[activeJob.status]}
                    </Badge>
                  </div>
                </div>

                {activeJob.status === "Completed" && (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md border p-2">
                      <p className="text-xs text-muted-foreground">Completed</p>
                      <p className="font-mono font-semibold">
                        {activeJob.actualCompletedQty}
                      </p>
                    </div>
                    <div className="rounded-md border p-2">
                      <p className="text-xs text-muted-foreground">Rejected</p>
                      <p className="font-mono font-semibold text-destructive">
                        {activeJob.rejectedQty}
                      </p>
                    </div>
                    <div className="rounded-md border p-2">
                      <p className="text-xs text-muted-foreground">Rework</p>
                      <p className="font-mono font-semibold text-warning">
                        {activeJob.reworkQty}
                      </p>
                    </div>
                  </div>
                )}
                {activeJob.rejectRootCause && (
                  <p className="text-xs text-muted-foreground">
                    Cause: {ROOT_CAUSE_LABEL[activeJob.rejectRootCause]}
                  </p>
                )}

                {exceptionsFor(activeJob.id).length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Reported Exceptions
                    </p>
                    {exceptionsFor(activeJob.id).map((e) => (
                      <div
                        key={e.id}
                        className="rounded-md border p-2 text-xs space-y-0.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            {REASON_LABEL[e.reasonType]}
                          </span>
                          <Badge
                            variant="outline"
                            className={
                              e.status === "approved"
                                ? "bg-success/10 text-success border-success/30"
                                : e.status === "rejected"
                                  ? "bg-destructive/10 text-destructive border-destructive/30"
                                  : "bg-warning/15 text-warning border-warning/30"
                            }
                          >
                            {e.status}
                          </Badge>
                        </div>
                        {e.description && (
                          <p className="text-muted-foreground">
                            {e.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Persisted timer timestamps — server-set only, never a
                    form field. Reopening this dialog after a reload
                    always reads these straight from the database row. */}
                <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted/30 p-2.5">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Start Date &amp; Time
                    </p>
                    <p className="text-xs font-medium">
                      {activeJob.startTime
                        ? formatJobCardTimestamp(activeJob.startTime)
                        : "Not started yet"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      End Date &amp; Time
                    </p>
                    <p className="text-xs font-medium">
                      {activeJob.endTime
                        ? formatJobCardTimestamp(activeJob.endTime)
                        : "Not completed yet"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Active Time</p>
                    <p className="text-xs font-mono font-semibold">
                      {activeJobActiveTime}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    Evidence Photos
                  </p>
                  <AssetPhotoGallery
                    ownerType="job_card"
                    ownerId={activeJob.id}
                    canEdit={pEdit}
                    excludeIds={
                      activeJob.referencePhotoId
                        ? [activeJob.referencePhotoId]
                        : undefined
                    }
                    data-ocid="my-jobs.detail.photos"
                  />
                </div>
              </div>
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                {pEdit && (
                  <JobCardTimerPanel
                    jobCard={activeJob}
                    canEdit={pEdit}
                    canPause={pPause}
                    onStart={() => handleStart(activeJob)}
                    onPause={() => handlePause(activeJob)}
                    onResume={() => handleResume(activeJob)}
                    onComplete={() => setCompleteOpen(true)}
                    isSaving={isSaving}
                    dataOcidPrefix="my-jobs.detail.timer"
                  />
                )}
                {activeJob.status !== "Completed" && pEdit && (
                  <Button
                    variant="outline"
                    className="w-full h-11"
                    onClick={() => setExceptionOpen(true)}
                    data-ocid="my-jobs.detail.exception_button"
                  >
                    <AlertTriangle className="w-4 h-4 mr-1.5" />
                    Report an Issue
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {activeJob && (
        <CompleteJobCardDialog
          job={activeJob}
          open={completeOpen}
          onOpenChange={setCompleteOpen}
          evidenceRequired={evidencePolicy.job_card_completion === true}
          requirePhotoOnReject={evidencePolicy.quality_rejection === true}
          onSaved={(jc) => {
            updateJobCard(jc);
            setActiveJob(jc);
            setCompleteOpen(false);
          }}
          dataOcidPrefix="my-jobs.complete"
        />
      )}

      {activeJob && (
        <ReportExceptionDialog
          job={activeJob}
          open={exceptionOpen}
          onOpenChange={setExceptionOpen}
          onSaved={(e) => {
            addJobCardExceptionLocal(e);
            setExceptionOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ── Report an operational exception ─────────────────────────────────

function ReportExceptionDialog({
  job,
  open,
  onOpenChange,
  onSaved,
}: {
  job: JobCard;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (e: JobCardException) => void;
}) {
  const [reason, setReason] = useState<JobCardExceptionReason | "">("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit() {
    if (isSaving) return;
    if (!reason) {
      toast.error("Select a reason");
      return;
    }
    setIsSaving(true);
    try {
      const result = await createJobCardExceptionRemote({
        jobCardId: job.id,
        reasonType: reason,
        description: description.trim() || undefined,
      });
      if (result.status === "unauthenticated") {
        toast.error("Not signed in - exception was not recorded.");
        return;
      }
      if (result.status === "denied" || result.status === "error") {
        toast.error(result.error ?? "Could not record exception.");
        return;
      }
      if (!result.data) return;
      toast.success("Exception reported — awaiting supervisor review");
      onSaved(result.data);
      setReason("");
      setDescription("");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-ocid="my-jobs.exception.dialog">
        <DialogHeader>
          <DialogTitle>Report an Issue — {job.jobNo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Use this when assigned work can't be completed for a genuine
            operational reason. This is evidence for review, not a penalty.
          </p>
          <div className="space-y-1.5">
            <Label>Reason *</Label>
            <Select
              value={reason}
              onValueChange={(v) => setReason(v as JobCardExceptionReason)}
            >
              <SelectTrigger data-ocid="my-jobs.exception.reason.select">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(REASON_LABEL) as JobCardExceptionReason[]).map(
                  (k) => (
                    <SelectItem key={k} value={k}>
                      {REASON_LABEL[k]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Details (optional)</Label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSaving}
            data-ocid="my-jobs.exception.submit_button"
          >
            {isSaving ? "Reporting…" : "Report Issue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
