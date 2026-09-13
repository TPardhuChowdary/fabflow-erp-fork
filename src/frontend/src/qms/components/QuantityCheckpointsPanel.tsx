// Quantity-based inspection (Master ERP Architecture, Part 3) — view and
// record the required quantity checkpoints for one inspection. Purely
// additive alongside ProjectQmsCharacteristicPanel's pass/fail attempts:
// this never touches status, project_qms_inspection_attempts, or
// getStageInspectionGate() (see quantityInspection.ts's own header for
// why). Rendered only when the inspection has inspectionFrequencyQty
// set — otherwise this feature doesn't apply to it at all.

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  computeRequiredQuantityPoints,
  isDuplicateCheckpoint,
} from "@/qms/lib/quantityInspection";
import { useState } from "react";
import { toast } from "sonner";
import { useQmsStore } from "../store/useQmsStore";
import type { ProjectQmsInspection } from "../types";

interface Props {
  inspection: ProjectQmsInspection;
  /** The owning production stage's planned quantity (targetQty) — the
   * fixed total the checkpoint set is computed against. Undefined when
   * the stage has no target set yet, or the inspection isn't linked to a
   * stage at all (quantity checkpoints need a real quantity to check
   * against; an independent inspection has none). */
  expectedQuantity: number | undefined;
  /** How much has actually been produced so far (Worker Accepted, same
   * figure Production.tsx's own stage cards show) — used only to decide
   * which checkpoint is "due" for display, never to change what's
   * required. */
  actualCompletedQty: number;
  canRecord: boolean;
  currentUserId: string;
  currentUserName: string;
}

export function QuantityCheckpointsPanel({
  inspection,
  expectedQuantity,
  actualCompletedQty,
  canRecord,
  currentUserId,
  currentUserName,
}: Props) {
  const recordQuantityCheckpoint = useQmsStore(
    (s) => s.recordQuantityCheckpoint,
  );
  const [recordingQty, setRecordingQty] = useState<number | null>(null);
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  if (!inspection.inspectionFrequencyQty) return null;

  if (!expectedQuantity) {
    return (
      <div className="rounded-md border border-dashed p-2.5 text-xs text-muted-foreground">
        Quantity checkpoints every {inspection.inspectionFrequencyQty} pieces
        are configured, but this stage has no target quantity set yet — set one
        on the Production tab to see the required checkpoints.
      </div>
    );
  }

  const requiredPoints = computeRequiredQuantityPoints(
    expectedQuantity,
    inspection.inspectionFrequencyQty,
  );
  const checkpoints = inspection.quantityCheckpoints ?? [];
  const completedByQty = new Map(checkpoints.map((c) => [c.quantity, c]));

  const submit = async (quantity: number, result: "Pass" | "Fail") => {
    if (isDuplicateCheckpoint(checkpoints, quantity)) {
      toast.error(`Quantity ${quantity} was already recorded.`);
      return;
    }
    setSaving(true);
    try {
      const res = await recordQuantityCheckpoint(inspection.id, {
        quantity,
        result,
        performedBy: currentUserId,
        performedByName: currentUserName,
        remarks: remarks.trim() || undefined,
      });
      if (res.status === "success") {
        toast.success(`Checkpoint at ${quantity} recorded: ${result}`);
        setRecordingQty(null);
        setRemarks("");
      } else if (res.status === "duplicate") {
        toast.error(res.error || `Quantity ${quantity} was already recorded.`);
      } else {
        toast.error(res.error || "Could not record checkpoint");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="rounded-md border p-2.5 space-y-2"
      data-ocid={`qms.project_inspection.quantity_checkpoints.${inspection.id}`}
    >
      <p className="text-xs font-semibold">
        Quantity Checkpoints — every {inspection.inspectionFrequencyQty} pcs of{" "}
        {expectedQuantity}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {requiredPoints.map((qty) => {
          const done = completedByQty.get(qty);
          const due = !done && actualCompletedQty >= qty;
          if (done) {
            return (
              <Badge
                key={qty}
                variant="outline"
                className={
                  done.result === "Pass"
                    ? "text-[10px] bg-success/10 text-success border-success/30"
                    : "text-[10px] bg-destructive/10 text-destructive border-destructive/30"
                }
                title={done.remarks || undefined}
              >
                {qty}: {done.result}
              </Badge>
            );
          }
          return (
            <Badge
              key={qty}
              variant="outline"
              className={
                due
                  ? "text-[10px] bg-warning/10 text-warning border-warning/30"
                  : "text-[10px] text-muted-foreground"
              }
            >
              {qty}: {due ? "Due" : "Pending"}
            </Badge>
          );
        })}
      </div>

      {canRecord && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {requiredPoints
            .filter((qty) => !completedByQty.has(qty))
            .map((qty) => (
              <Button
                key={qty}
                type="button"
                size="sm"
                variant={recordingQty === qty ? "secondary" : "outline"}
                className="h-6 px-2 text-[11px]"
                onClick={() => setRecordingQty((v) => (v === qty ? null : qty))}
                data-ocid={`qms.project_inspection.quantity_checkpoint.record.${inspection.id}.${qty}`}
              >
                Record {qty}
              </Button>
            ))}
        </div>
      )}

      {canRecord && recordingQty !== null && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t mt-1">
          <Input
            placeholder="Remarks (optional)"
            className="h-7 text-xs w-56"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs bg-success text-success-foreground hover:bg-success/90"
            disabled={saving}
            onClick={() => submit(recordingQty, "Pass")}
          >
            Pass
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="h-7 text-xs"
            disabled={saving}
            onClick={() => submit(recordingQty, "Fail")}
          >
            Fail
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setRecordingQty(null)}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
