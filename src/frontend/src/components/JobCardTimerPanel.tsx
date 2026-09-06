import { Button } from "@/components/ui/button";
import { useJobCardTimer } from "@/hooks/useJobCardTimer";
import type { JobCard } from "@/types";
// Job Card live timer status + Start/Pause/Resume/Complete controls — see
// chat, database/20260906050000. One shared panel used by both the
// worker's My Jobs detail dialog and the admin Job Cards view dialog, so
// the status/timer visual language and action-availability rules exist
// exactly once rather than being reimplemented slightly differently in
// each page.
//
// Permission split (server-side authoritative via the
// enforce_job_card_timer_transition trigger — this component only
// mirrors it in the UI, it does not decide it):
//   - Start, Resume, Complete: gated on canEdit (job_cards.edit) — the
//     same permission that already gates all of My Jobs today.
//   - Pause: gated on canPause (job_cards.approve) — reused unchanged
//     from the existing job_card_exceptions approval permission, not a
//     new one. Never shown to an Employee-only user.
//
// This panel never shows both Start and Resume at once, and never shows
// Complete for a status where it isn't valid — but the trigger is what
// actually enforces this; a stale/out-of-sync client would simply get a
// rejected write, not a corrupted job card.
import { CheckCircle2, Pause, Play } from "lucide-react";

interface JobCardTimerPanelProps {
  jobCard: JobCard;
  canEdit: boolean;
  canPause: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onComplete: () => void;
  isSaving: boolean;
  dataOcidPrefix?: string;
}

export function JobCardTimerPanel({
  jobCard,
  canEdit,
  canPause,
  onStart,
  onPause,
  onResume,
  onComplete,
  isSaving,
  dataOcidPrefix = "job-card-timer",
}: JobCardTimerPanelProps) {
  const { formatted } = useJobCardTimer(jobCard);

  return (
    <div className="space-y-2" data-ocid={`${dataOcidPrefix}.panel`}>
      {jobCard.status === "InProgress" && (
        <div
          className="flex items-center justify-between rounded-md border border-success/30 bg-success/5 px-3 py-2"
          data-ocid={`${dataOcidPrefix}.status_running`}
        >
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
            🟢 In Progress
          </span>
          <span className="font-mono text-base font-semibold tabular-nums">
            ⏱ {formatted}
          </span>
        </div>
      )}
      {jobCard.status === "OnHold" && (
        <div
          className="flex items-center justify-between rounded-md border border-warning/30 bg-warning/10 px-3 py-2"
          data-ocid={`${dataOcidPrefix}.status_paused`}
        >
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-warning">
            🟡 Paused
          </span>
          <span className="font-mono text-base font-semibold tabular-nums">
            ⏸ Active Time: {formatted}
          </span>
        </div>
      )}
      {jobCard.status === "Completed" && (
        <div
          className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2"
          data-ocid={`${dataOcidPrefix}.status_completed`}
        >
          <span className="text-sm font-medium text-muted-foreground">
            Timer stopped
          </span>
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            Total Active Time: {formatted}
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {jobCard.status === "NotStarted" && canEdit && (
          <Button
            className="flex-1 h-11"
            onClick={onStart}
            disabled={isSaving}
            data-ocid={`${dataOcidPrefix}.start_button`}
          >
            <Play className="w-4 h-4 mr-1.5" />
            {isSaving ? "Starting…" : "Start"}
          </Button>
        )}
        {jobCard.status === "InProgress" && (
          <>
            {canPause && (
              <Button
                variant="outline"
                className="flex-1 h-11"
                onClick={onPause}
                disabled={isSaving}
                data-ocid={`${dataOcidPrefix}.pause_button`}
              >
                <Pause className="w-4 h-4 mr-1.5" />
                {isSaving ? "Pausing…" : "Pause"}
              </Button>
            )}
            {canEdit && (
              <Button
                className="flex-1 h-11"
                onClick={onComplete}
                disabled={isSaving}
                data-ocid={`${dataOcidPrefix}.complete_button`}
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                Complete
              </Button>
            )}
          </>
        )}
        {jobCard.status === "OnHold" && canEdit && (
          <>
            <Button
              variant="outline"
              className="flex-1 h-11"
              onClick={onResume}
              disabled={isSaving}
              data-ocid={`${dataOcidPrefix}.resume_button`}
            >
              <Play className="w-4 h-4 mr-1.5" />
              {isSaving ? "Resuming…" : "Resume"}
            </Button>
            <Button
              className="flex-1 h-11"
              onClick={onComplete}
              disabled={isSaving}
              data-ocid={`${dataOcidPrefix}.complete_button`}
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              Complete
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
