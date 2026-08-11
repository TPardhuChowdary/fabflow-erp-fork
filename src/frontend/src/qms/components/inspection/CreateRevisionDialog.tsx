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
import { toast } from "sonner";
import { useQmsStore } from "../../store/useQmsStore";
import { revisionToLetter } from "../../types";
import type { InspectionSheet } from "../../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sheet: InspectionSheet;
  currentUserId: string;
  currentUserName: string;
  onCreated: (newSheetId: string) => void;
}

/** §3/§4: the only action available on a locked (Approved/Closed) sheet.
 * Freezes the current sheet as permanent history and opens a brand new
 * revision — a fresh inspection cycle, not a copy of old results (see the
 * comment above createRevision() in api/inspections.ts for why). */
export function CreateRevisionDialog({
  open,
  onOpenChange,
  sheet,
  currentUserId,
  currentUserName,
  onCreated,
}: Props) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!reason.trim()) {
      toast.error("A reason for the new revision is required");
      return;
    }
    setSaving(true);
    try {
      const newSheet = await useQmsStore
        .getState()
        .createRevision(
          sheet.id,
          reason.trim(),
          currentUserId,
          currentUserName,
        );
      toast.success(`Revision ${revisionToLetter(newSheet.revision)} created`);
      setReason("");
      onCreated(newSheet.id);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not create revision",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md"
        data-ocid="qms.inspection.create_revision_dialog"
      >
        <DialogHeader>
          <DialogTitle>
            Create Revision {revisionToLetter(sheet.revision + 1)}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {sheet.inspectionNumber} revision {revisionToLetter(sheet.revision)}{" "}
          is {sheet.status} and permanently locked. Creating a new revision
          starts a fresh inspection cycle with the same stage list, mode, and
          drawing reference — the old revision's results, signatures, and
          documents remain exactly as they are.
        </p>
        <div className="space-y-1.5">
          <Label className="text-xs">Reason for revision *</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Drawing revised to Rev C, re-inspection required"
            className="text-sm h-20"
            data-ocid="qms.inspection.revision_reason"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={saving}
            data-ocid="qms.inspection.confirm_revision"
          >
            {saving ? "Creating..." : "Create Revision"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
