import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, ClipboardCheck, Lock } from "lucide-react";
import type { InspectionHistoryEvent, InspectionSheet } from "../../types";

interface Props {
  sheet: InspectionSheet;
  history: InspectionHistoryEvent[];
  canReview: boolean;
  canApprove: boolean;
  onReview: () => void;
  onApprove: () => void;
  onClose: () => void;
}

export function InspectionHistoryPanel({
  sheet,
  history,
  canReview,
  canApprove,
  onReview,
  onApprove,
  onClose,
}: Props) {
  return (
    <Card data-ocid="qms.inspection.history_panel">
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-semibold">
          Inspection &amp; Approval History
        </CardTitle>
        <div className="flex gap-2">
          {canReview && !sheet.reviewedAt && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={onReview}
              data-ocid="qms.inspection.review_button"
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              Mark Reviewed
            </Button>
          )}
          {canApprove && !!sheet.reviewedAt && !sheet.approvedAt && (
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={onApprove}
              data-ocid="qms.inspection.approve_button"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Approve
            </Button>
          )}
          {canApprove && !!sheet.approvedAt && sheet.status !== "Closed" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={onClose}
              data-ocid="qms.inspection.close_button"
            >
              <Lock className="w-3.5 h-3.5" />
              Close
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No history yet
          </p>
        ) : (
          <div className="space-y-2">
            {history.map((h, i) => (
              <div
                key={h.id}
                className="flex items-start gap-2 text-xs"
                data-ocid={`qms.inspection.history_row.${i + 1}`}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <div>
                  <span className="font-medium">{h.action}</span>{" "}
                  <span className="text-muted-foreground">
                    by {h.byUserName} on {new Date(h.at).toLocaleString()}
                    {h.notes ? ` — ${h.notes}` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
