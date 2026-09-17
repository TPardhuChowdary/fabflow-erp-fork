import { AssetPhotoGallery } from "@/components/AssetPhotoGallery";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateJobCardRemote } from "@/lib/jobCardsApi";
import { useStore } from "@/store";
import type { JobCard, RejectRootCause } from "@/types";
// Job Card completion form — extracted from MyJobs.tsx (worker) so
// JobCards.tsx (admin) can reuse the exact same quantity/rejection/
// evidence-photo logic rather than forking a second completion flow.
// Behavior unchanged from the original, with one deliberate fix: the
// submit payload no longer sends its own client-computed endTime. The
// enforce_job_card_timer_transition trigger (database/20260906050000)
// now stamps end_time = now() server-side whenever it sees the incoming
// end_time is unchanged from before — omitting it here is what makes
// that happen, giving "actual completion timestamp recorded
// automatically using server time" for real, instead of trusting the
// browser's clock.
//
// Existing evidence-requirement enforcement (client-side check here,
// database/phase-62's trg_enforce_job_card_evidence_required
// server-side) is completely unchanged.
import { Camera } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const ROOT_CAUSE_LABEL: Record<RejectRootCause, string> = {
  employee_workmanship: "Employee workmanship",
  material: "Material",
  machine_equipment: "Machine/equipment",
  design_specification: "Design/specification",
  previous_process: "Previous process",
  supervisor_instruction: "Supervisor/instruction",
  customer_change: "Customer change",
  other: "Other",
};

export function CompleteJobCardDialog({
  job,
  open,
  onOpenChange,
  evidenceRequired,
  requirePhotoOnReject,
  onSaved,
  dataOcidPrefix = "complete-job-card",
}: {
  job: JobCard;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  evidenceRequired: boolean;
  requirePhotoOnReject: boolean;
  onSaved: (jc: JobCard) => void;
  dataOcidPrefix?: string;
}) {
  const { assetPhotos } = useStore();
  const [completedQty, setCompletedQty] = useState(
    String(job.actualCompletedQty || job.expectedQuantity || ""),
  );
  const [rejectedQty, setRejectedQty] = useState(String(job.rejectedQty || 0));
  const [reworkQty, setReworkQty] = useState(String(job.reworkQty || 0));
  const [rootCause, setRootCause] = useState<RejectRootCause | "">(
    job.rejectRootCause || "",
  );
  const [isSaving, setIsSaving] = useState(false);

  // Evidence Photo (proof of completion) must never be conflated with
  // this job card's Reference Photo (expected result, set before work
  // starts) even though both are asset_photos rows owned by the same
  // job_card — exclude job.referencePhotoId from both the "photo
  // present" check and the gallery below.
  const hasPhoto = assetPhotos.some(
    (p) =>
      p.ownerType === "job_card" &&
      p.ownerId === job.id &&
      p.id !== job.referencePhotoId,
  );

  const accepted =
    Number(completedQty) - Number(rejectedQty) - Number(reworkQty);

  async function handleSubmit() {
    if (isSaving) return;
    const completed = Number(completedQty);
    const rejected = Number(rejectedQty);
    const rework = Number(reworkQty);
    if ([completed, rejected, rework].some((n) => Number.isNaN(n) || n < 0)) {
      toast.error("Quantities cannot be negative");
      return;
    }
    if (rejected + rework > completed) {
      toast.error("Rejected + Rework cannot exceed the Completed quantity");
      return;
    }
    if ((rejected > 0 || rework > 0) && !rootCause) {
      toast.error("Select a root cause for the rejected/rework quantity");
      return;
    }
    const needsPhoto =
      evidenceRequired || (requirePhotoOnReject && rejected > 0);
    if (needsPhoto && !hasPhoto) {
      toast.error("A photo is required before you can submit this job");
      return;
    }
    setIsSaving(true);
    try {
      const result = await updateJobCardRemote({
        ...job,
        status: "Completed",
        actualCompletedQty: completed,
        rejectedQty: rejected,
        reworkQty: rework,
        rejectRootCause:
          rejected > 0 || rework > 0
            ? (rootCause as RejectRootCause)
            : undefined,
      });
      if (result.status === "unauthenticated") {
        toast.error("Not signed in - job was not submitted.");
        return;
      }
      if (result.status === "denied" || result.status === "error") {
        toast.error(result.error ?? "Could not submit job.");
        return;
      }
      if (!result.data) return;
      toast.success("Job submitted");
      onSaved(result.data);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md"
        data-ocid={`${dataOcidPrefix}.dialog`}
      >
        <DialogHeader>
          <DialogTitle>Complete {job.jobNo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Completed Quantity *</Label>
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              className="h-11 text-base"
              value={completedQty}
              onChange={(e) => setCompletedQty(e.target.value)}
              data-ocid={`${dataOcidPrefix}.completed_input`}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Rejected</Label>
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                className="h-11 text-base"
                value={rejectedQty}
                onChange={(e) => setRejectedQty(e.target.value)}
                data-ocid={`${dataOcidPrefix}.rejected_input`}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rework</Label>
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                className="h-11 text-base"
                value={reworkQty}
                onChange={(e) => setReworkQty(e.target.value)}
                data-ocid={`${dataOcidPrefix}.rework_input`}
              />
            </div>
          </div>
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            Accepted ={" "}
            <span className="font-mono font-semibold">
              {Number.isNaN(accepted) ? "—" : Math.max(accepted, 0)}
            </span>
          </div>

          {(Number(rejectedQty) > 0 || Number(reworkQty) > 0) && (
            <div className="space-y-1.5">
              <Label>Root Cause *</Label>
              <Select
                value={rootCause}
                onValueChange={(v) => setRootCause(v as RejectRootCause)}
              >
                <SelectTrigger
                  data-ocid={`${dataOcidPrefix}.root_cause.select`}
                >
                  <SelectValue placeholder="Why was this rejected/reworked?" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROOT_CAUSE_LABEL) as RejectRootCause[]).map(
                    (k) => (
                      <SelectItem key={k} value={k}>
                        {ROOT_CAUSE_LABEL[k]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                This records the cause for fair review later — it does not by
                itself affect your performance.
              </p>
            </div>
          )}

          <div>
            <Label className="flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5" /> Evidence Photo
              {(evidenceRequired ||
                (requirePhotoOnReject && Number(rejectedQty) > 0)) &&
                !hasPhoto && (
                  <span className="text-destructive text-xs">
                    (required to submit)
                  </span>
                )}
            </Label>
            <AssetPhotoGallery
              ownerType="job_card"
              ownerId={job.id}
              canEdit
              excludeIds={
                job.referencePhotoId ? [job.referencePhotoId] : undefined
              }
              data-ocid={`${dataOcidPrefix}.photos`}
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
            data-ocid={`${dataOcidPrefix}.submit_button`}
          >
            {isSaving ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
