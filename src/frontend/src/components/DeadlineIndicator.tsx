// Reusable deadline display + "Update Deadline" action, used by both the
// Projects list (row/card) and Production (per-project card, active
// queue). One component so the overdue/due-today/upcoming/no-deadline
// visual language and the update-prompt behavior are defined exactly
// once — see lib/deadlinePriority.ts for the paired sorting rule.
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
  formatDeadlineDate,
  formatDeadlineRelative,
  getDeadlineInfo,
} from "@/lib/deadlinePriority";
import { useState } from "react";

interface DeadlineIndicatorProps {
  /** Project.customerCommittedDeliveryDate, unchanged. */
  deadline: string | null | undefined;
  /** Gate on the caller's own canEdit(currentUser, "projects") check —
   * this component never decides permissions itself. */
  canEdit: boolean;
  /** Persists the new deadline via the caller's existing project-update
   * path (e.g. updateProjectRemote) and logs it to the caller's existing
   * activity/history mechanism. Only called with a date the user
   * explicitly chose — never a guessed/auto-advanced one. */
  onUpdate: (newDeadline: string) => Promise<void>;
  /** Denser single-line variant for table cells — still shows the exact
   * date and status, omits the "Update Deadline" button's own label
   * padding for a tighter fit. */
  compact?: boolean;
  dataOcidPrefix?: string;
}

export function DeadlineIndicator({
  deadline,
  canEdit,
  onUpdate,
  compact,
  dataOcidPrefix = "deadline",
}: DeadlineIndicatorProps) {
  const [open, setOpen] = useState(false);
  const [newDate, setNewDate] = useState(deadline ?? "");
  const [saving, setSaving] = useState(false);
  const info = getDeadlineInfo(deadline);

  const openDialog = () => {
    setNewDate(deadline ?? "");
    setOpen(true);
  };

  const handleSave = async () => {
    if (!newDate || newDate === deadline || saving) return;
    setSaving(true);
    try {
      await onUpdate(newDate);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        className="flex flex-col gap-1 min-w-0"
        data-ocid={`${dataOcidPrefix}.indicator`}
      >
        <span
          className={compact ? "text-xs" : "text-sm font-medium"}
          data-ocid={`${dataOcidPrefix}.date_text`}
        >
          Deadline: {info.date ? formatDeadlineDate(info.date) : "—"}
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {info.category === "overdue" && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-destructive bg-destructive/10 border border-destructive/30 rounded px-1.5 py-0.5">
              🔴 Deadline Overdue
            </span>
          )}
          {info.category === "due_today" && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-warning bg-warning/15 border border-warning/30 rounded px-1.5 py-0.5">
              🟠 Due Today
            </span>
          )}
          {info.category === "upcoming" && (
            <span className="text-[10px] text-muted-foreground">
              {formatDeadlineRelative(info)}
            </span>
          )}
          {info.category === "none" && (
            <span className="text-[10px] text-muted-foreground">
              No deadline set
            </span>
          )}
          {info.category === "overdue" && canEdit && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px] border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={(e) => {
                e.stopPropagation();
                openDialog();
              }}
              data-ocid={`${dataOcidPrefix}.update_button`}
            >
              Update Deadline
            </Button>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[85vh] overflow-y-auto"
          data-ocid={`${dataOcidPrefix}.update_dialog`}
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Update Deadline</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Customer deadline has passed. Please update the deadline.
          </p>
          <p className="text-xs text-muted-foreground">
            Original deadline:{" "}
            <span className="font-medium text-foreground">
              {info.date ? formatDeadlineDate(info.date) : "—"}
            </span>
          </p>
          <div className="space-y-1.5">
            <Label htmlFor={`${dataOcidPrefix}-new-date`}>New deadline</Label>
            <Input
              id={`${dataOcidPrefix}-new-date`}
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              data-ocid={`${dataOcidPrefix}.update_input`}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSave()}
              disabled={saving || !newDate || newDate === deadline}
              data-ocid={`${dataOcidPrefix}.update_save`}
            >
              {saving ? "Saving…" : "Save New Deadline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
