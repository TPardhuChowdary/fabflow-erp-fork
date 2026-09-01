// Phase 32 (Task #176) — supervisor/admin emergency override of a blocked
// Production Stage gate. UX shape reused from Production.tsx's existing
// material-availability override dialog (confirm-with-warning pattern),
// but the persistence is NOT reused - this writes to the approved Phase
// 32 project_qms_inspection_overrides table via useQmsStore's
// createProjectQmsInspectionOverride action, requires a reason (enforced
// here AND at the database level), and never touches the inspection's own
// status. Reused by both Production.tsx and ProjectDetail.tsx so the two
// pages can't drift on override UX or wording.

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stageName: string;
  inspectionName: string;
  blockReason: string;
  /** Should perform the actual override write (and, on success, the
   * caller's own stage-completion update) and resolve to whether it
   * succeeded. The dialog closes and resets only on true. */
  onConfirm: (reason: string) => Promise<boolean>;
}

export function QmsGateOverrideDialog({
  open,
  onOpenChange,
  stageName,
  inspectionName,
  blockReason,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!reason.trim() || submitting) return;
    setSubmitting(true);
    try {
      const ok = await onConfirm(reason.trim());
      if (ok) {
        setReason("");
        onOpenChange(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (submitting) return;
        onOpenChange(o);
        if (!o) setReason("");
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-warning">
            ⚠ Inspection Gate Blocked
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            <strong>{stageName}</strong> cannot proceed: {blockReason}.
          </p>
          <div className="space-y-1">
            <Label className="text-xs">Override Reason (required)</Label>
            <Textarea
              rows={3}
              className="text-xs"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder='e.g. "Customer accepted minor finish variation."'
              data-ocid="qms.gate_override.reason_input"
            />
          </div>
          <p className="text-xs text-warning bg-warning/15 border border-warning/30 rounded p-2">
            Supervisor override: "{inspectionName}" will remain recorded exactly
            as it is — this only allows {stageName} to proceed. The override is
            permanently recorded with your name, the time, and this reason.
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
            data-ocid="qms.gate_override.cancel_button"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={submitting || !reason.trim()}
            onClick={handleConfirm}
            data-ocid="qms.gate_override.confirm_button"
          >
            {submitting ? "Overriding..." : "Override & Proceed"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
