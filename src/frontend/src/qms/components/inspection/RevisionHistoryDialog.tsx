import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffect, useMemo, useState } from "react";
import * as inspectionApi from "../../api/inspections";
import { INSPECTION_SHEET_STATUS_LABELS } from "../../constants";
import { revisionToLetter } from "../../types";
import type { InspectionSheet, InspectionStageEntry } from "../../types";
import { InspectionStatusBadge } from "./InspectionStatusBadge";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sheet: InspectionSheet;
}

const summarize = (entries: InspectionStageEntry[]) => ({
  pass: entries.filter((e) => e.result === "Pass").length,
  fail: entries.filter((e) => e.result === "Fail").length,
  na: entries.filter((e) => e.result === "NA").length,
  pending: entries.filter((e) => !e.result).length,
});

/** §13: timeline of every revision in this document family, plus a simple
 * side-by-side comparison of two revisions' pass/fail/NA/pending counts. */
export function RevisionHistoryDialog({ open, onOpenChange, sheet }: Props) {
  const [revisions, setRevisions] = useState<InspectionSheet[]>([]);
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [leftEntries, setLeftEntries] = useState<InspectionStageEntry[]>([]);
  const [rightEntries, setRightEntries] = useState<InspectionStageEntry[]>([]);

  useEffect(() => {
    if (!open) return;
    inspectionApi.getRevisionsForSheet(sheet).then((revs) => {
      setRevisions(revs);
      if (revs.length >= 2) {
        setLeftId(revs[revs.length - 2].id);
        setRightId(revs[revs.length - 1].id);
      }
    });
  }, [open, sheet]);

  useEffect(() => {
    if (leftId) inspectionApi.getStageEntries(leftId).then(setLeftEntries);
    else setLeftEntries([]);
  }, [leftId]);

  useEffect(() => {
    if (rightId) inspectionApi.getStageEntries(rightId).then(setRightEntries);
    else setRightEntries([]);
  }, [rightId]);

  const leftSummary = useMemo(() => summarize(leftEntries), [leftEntries]);
  const rightSummary = useMemo(() => summarize(rightEntries), [rightEntries]);
  const leftRev = revisions.find((r) => r.id === leftId);
  const rightRev = revisions.find((r) => r.id === rightId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[85vh] overflow-y-auto"
        data-ocid="qms.inspection.revision_history_dialog"
      >
        <DialogHeader>
          <DialogTitle>Revision History — {sheet.inspectionNumber}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {revisions.map((rev, i) => (
            <div
              key={rev.id}
              className="flex items-center justify-between gap-2 rounded-md border p-2.5 text-xs"
              data-ocid={`qms.inspection.revision_row.${i + 1}`}
            >
              <div>
                <div className="font-medium">
                  Revision {revisionToLetter(rev.revision)}
                  {rev.id === sheet.id && (
                    <Badge variant="outline" className="ml-1.5 text-[10px]">
                      Current
                    </Badge>
                  )}
                </div>
                <div className="text-muted-foreground">
                  {rev.generatedBy} ·{" "}
                  {new Date(rev.generatedAt).toLocaleString()}
                  {rev.revisionReason && ` — ${rev.revisionReason}`}
                </div>
              </div>
              <InspectionStatusBadge status={rev.status} />
            </div>
          ))}
          {revisions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Loading revisions...
            </p>
          )}
        </div>

        {revisions.length >= 2 && (
          <div className="border-t pt-3 space-y-3">
            <div className="text-sm font-semibold">Compare Revisions</div>
            <div className="grid grid-cols-2 gap-3">
              <Select value={leftId} onValueChange={setLeftId}>
                <SelectTrigger
                  className="h-8 text-xs"
                  data-ocid="qms.inspection.compare_left"
                >
                  <SelectValue placeholder="Revision A" />
                </SelectTrigger>
                <SelectContent>
                  {revisions.map((r) => (
                    <SelectItem key={r.id} value={r.id} className="text-xs">
                      Revision {revisionToLetter(r.revision)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={rightId} onValueChange={setRightId}>
                <SelectTrigger
                  className="h-8 text-xs"
                  data-ocid="qms.inspection.compare_right"
                >
                  <SelectValue placeholder="Revision B" />
                </SelectTrigger>
                <SelectContent>
                  {revisions.map((r) => (
                    <SelectItem key={r.id} value={r.id} className="text-xs">
                      Revision {revisionToLetter(r.revision)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {leftRev && rightRev && (
              <div className="grid grid-cols-2 gap-3 text-xs">
                {[
                  { rev: leftRev, summary: leftSummary },
                  { rev: rightRev, summary: rightSummary },
                ].map(({ rev, summary }) => (
                  <div
                    key={rev.id}
                    className="rounded-md border p-2.5 space-y-1"
                  >
                    <div className="font-medium">
                      Revision {revisionToLetter(rev.revision)} —{" "}
                      {INSPECTION_SHEET_STATUS_LABELS[rev.status]}
                    </div>
                    <div>Stages: {rev.stageIds.length}</div>
                    <div className="text-green-700">Pass: {summary.pass}</div>
                    <div className="text-red-700">Fail: {summary.fail}</div>
                    <div className="text-muted-foreground">
                      N/A: {summary.na}
                    </div>
                    <div className="text-muted-foreground">
                      Pending: {summary.pending}
                    </div>
                    <div>Mode: {rev.mode}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
