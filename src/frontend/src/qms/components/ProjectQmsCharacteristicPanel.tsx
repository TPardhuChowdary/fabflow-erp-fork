// Phase 32 (Task #175) — one characteristic row inside a Project QMS
// inspection card. Shows the latest result, lets the user record a new
// attempt (Pass/Fail/NA + failure detail + rectification detail as
// applicable), and shows the full append-only history.
//
// Never overwrites: every submit creates a brand-new
// project_qms_inspection_attempts row (server-assigned round_number,
// see database/phase-12's trigger) - this component never edits an
// existing attempt, only reads them and creates new ones.

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQmsStore } from "../store/useQmsStore";
import type {
  ProjectQmsInspectionAttempt,
  ProjectQmsInspectionAttemptPhoto,
  ProjectQmsInspectionAttemptResult,
  ProjectQmsInspectionCharacteristic,
} from "../types";

const RESULT_BADGE_CLASS: Record<ProjectQmsInspectionAttemptResult, string> = {
  Pass: "bg-success/10 text-success border-success/30",
  Fail: "bg-destructive/10 text-destructive border-destructive/30",
  NA: "bg-muted text-muted-foreground border-border",
};

function readFileAsDataUrl(
  file: File,
): Promise<{ fileData: string; fileMimeType: string }> {
  return new Promise((resolve, reject) => {
    if (file.size > 2 * 1024 * 1024) {
      reject(
        new Error("File is larger than 2MB — please upload a smaller file"),
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) =>
      resolve({
        fileData: ev.target?.result as string,
        fileMimeType: file.type,
      });
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

interface Props {
  inspectionId: string;
  characteristic: ProjectQmsInspectionCharacteristic;
  attempts: ProjectQmsInspectionAttempt[];
  photosByAttemptId: Map<string, ProjectQmsInspectionAttemptPhoto[]>;
  onPhotosNeeded: (attemptIds: string[]) => void;
  canRecord: boolean;
  currentUserId: string;
  currentUserName: string;
}

export function ProjectQmsCharacteristicPanel({
  inspectionId,
  characteristic,
  attempts,
  photosByAttemptId,
  onPhotosNeeded,
  canRecord,
  currentUserId,
  currentUserName,
}: Props) {
  const createAttempt = useQmsStore((s) => s.createProjectQmsInspectionAttempt);
  const createAttemptPhoto = useQmsStore(
    (s) => s.createProjectQmsInspectionAttemptPhoto,
  );

  const [formOpen, setFormOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [result, setResult] = useState<ProjectQmsInspectionAttemptResult | "">(
    "",
  );
  const [failureReason, setFailureReason] = useState("");
  const [failureDescription, setFailureDescription] = useState("");
  const [rectificationAction, setRectificationAction] = useState("");
  const [rectificationDescription, setRectificationDescription] = useState("");
  const [failurePhoto, setFailurePhoto] = useState<{
    fileData: string;
    fileMimeType: string;
  } | null>(null);
  const [rectificationPhoto, setRectificationPhoto] = useState<{
    fileData: string;
    fileMimeType: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const sorted = [...attempts].sort((a, b) => a.roundNumber - b.roundNumber);
  const latest = sorted.length > 0 ? sorted[sorted.length - 1] : undefined;
  const priorWasFail = latest?.result === "Fail";

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetch once when history is opened
  useEffect(() => {
    if (showHistory && sorted.length > 0) {
      onPhotosNeeded(sorted.map((a) => a.id));
    }
  }, [showHistory]);

  const resetForm = () => {
    setResult("");
    setFailureReason("");
    setFailureDescription("");
    setRectificationAction("");
    setRectificationDescription("");
    setFailurePhoto(null);
    setRectificationPhoto(null);
    setFormOpen(false);
  };

  const handleSubmit = async () => {
    if (!result) {
      toast.error("Select Pass, Fail, or NA");
      return;
    }
    setSubmitting(true);
    try {
      const attemptResult = await createAttempt({
        projectQmsInspectionId: inspectionId,
        characteristicId: characteristic.id,
        result,
        failureReason:
          result === "Fail" ? failureReason || undefined : undefined,
        failureDescription:
          result === "Fail" ? failureDescription || undefined : undefined,
        rectificationAction: priorWasFail
          ? rectificationAction || undefined
          : undefined,
        rectificationDescription: priorWasFail
          ? rectificationDescription || undefined
          : undefined,
        byUserId: currentUserId,
        byUserName: currentUserName,
      });
      if (attemptResult.status !== "success" || !attemptResult.data) {
        toast.error(attemptResult.error || "Could not record attempt");
        return;
      }
      const attemptId = attemptResult.data.id;
      if (failurePhoto) {
        await createAttemptPhoto({
          attemptId,
          fileData: failurePhoto.fileData,
          fileMimeType: failurePhoto.fileMimeType,
          caption: "Failure evidence",
          byUserId: currentUserId,
          byUserName: currentUserName,
        });
      }
      if (rectificationPhoto) {
        await createAttemptPhoto({
          attemptId,
          fileData: rectificationPhoto.fileData,
          fileMimeType: rectificationPhoto.fileMimeType,
          caption: "Rectification proof",
          byUserId: currentUserId,
          byUserName: currentUserName,
        });
      }
      toast.success(`${characteristic.nameSnapshot}: ${result} recorded`);
      resetForm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="border rounded-md px-3 py-2"
      data-ocid={`qms.project_inspection.characteristic.${characteristic.id}`}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {characteristic.nameSnapshot}
          </span>
          {characteristic.categorySnapshot && (
            <span className="text-[10px] text-muted-foreground">
              {characteristic.categorySnapshot}
            </span>
          )}
          {latest ? (
            <Badge
              variant="outline"
              className={`text-[10px] ${RESULT_BADGE_CLASS[latest.result]}`}
            >
              {latest.result} (round {latest.roundNumber})
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-[10px] text-muted-foreground"
            >
              Not yet inspected
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {sorted.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              onClick={() => setShowHistory((v) => !v)}
            >
              {showHistory ? "Hide History" : `History (${sorted.length})`}
            </Button>
          )}
          {canRecord && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              onClick={() => setFormOpen((v) => !v)}
            >
              {latest ? "Re-inspect" : "Record Result"}
            </Button>
          )}
        </div>
      </div>

      {formOpen && (
        <div className="mt-2 space-y-2 border-t pt-2">
          {priorWasFail && (
            <div className="space-y-1.5 bg-warning/15 border border-warning/30 rounded p-2">
              <div className="text-[11px] font-semibold text-warning">
                Rectification (previous attempt failed)
              </div>
              <Textarea
                placeholder="Corrective action / solution"
                value={rectificationAction}
                onChange={(e) => setRectificationAction(e.target.value)}
                className="text-xs min-h-[50px]"
                data-ocid="qms.project_inspection.rectification_action"
              />
              <Textarea
                placeholder="Rectification description"
                value={rectificationDescription}
                onChange={(e) => setRectificationDescription(e.target.value)}
                className="text-xs min-h-[50px]"
                data-ocid="qms.project_inspection.rectification_description"
              />
              <input
                type="file"
                accept="image/*"
                className="text-xs"
                data-ocid="qms.project_inspection.rectification_photo_input"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    setRectificationPhoto(await readFileAsDataUrl(file));
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                }}
              />
              {rectificationPhoto && (
                <span className="text-[10px] text-success">Photo attached</span>
              )}
            </div>
          )}

          <div className="flex items-center gap-1.5">
            {(["Pass", "Fail", "NA"] as const).map((r) => (
              <Button
                key={r}
                type="button"
                size="sm"
                variant={result === r ? "default" : "outline"}
                className="h-7 text-xs px-3"
                onClick={() => setResult(r)}
                data-ocid={`qms.project_inspection.result_button.${r}`}
              >
                {r}
              </Button>
            ))}
          </div>

          {result === "Fail" && (
            <div className="space-y-1.5 bg-destructive/10 border border-destructive/30 rounded p-2">
              <div className="text-[11px] font-semibold text-destructive">
                Failure detail
              </div>
              <Textarea
                placeholder="Failure reason"
                value={failureReason}
                onChange={(e) => setFailureReason(e.target.value)}
                className="text-xs min-h-[40px]"
                data-ocid="qms.project_inspection.failure_reason"
              />
              <Textarea
                placeholder="Failure description"
                value={failureDescription}
                onChange={(e) => setFailureDescription(e.target.value)}
                className="text-xs min-h-[50px]"
                data-ocid="qms.project_inspection.failure_description"
              />
              <input
                type="file"
                accept="image/*"
                className="text-xs"
                data-ocid="qms.project_inspection.failure_photo_input"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    setFailurePhoto(await readFileAsDataUrl(file));
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                }}
              />
              {failurePhoto && (
                <span className="text-[10px] text-success">Photo attached</span>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              disabled={!result || submitting}
              onClick={handleSubmit}
              data-ocid="qms.project_inspection.submit_attempt"
            >
              {submitting ? "Saving..." : "Save Result"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={resetForm}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="mt-2 border-t pt-2 space-y-2">
          {[...sorted].reverse().map((a) => (
            <div
              key={a.id}
              className="text-xs border rounded p-2 bg-muted/20 space-y-1"
              data-ocid={`qms.project_inspection.history_entry.${a.id}`}
            >
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`text-[10px] ${RESULT_BADGE_CLASS[a.result]}`}
                >
                  Round {a.roundNumber}: {a.result}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {a.performedByName || "unknown"} ·{" "}
                  {new Date(a.performedAt).toLocaleString()}
                </span>
              </div>
              {a.rectificationAction && (
                <div className="text-[11px]">
                  <span className="font-medium text-warning">
                    Rectification:
                  </span>{" "}
                  {a.rectificationAction}
                  {a.rectificationDescription
                    ? ` — ${a.rectificationDescription}`
                    : ""}
                </div>
              )}
              {a.failureReason && (
                <div className="text-[11px]">
                  <span className="font-medium text-destructive">Failure:</span>{" "}
                  {a.failureReason}
                  {a.failureDescription ? ` — ${a.failureDescription}` : ""}
                </div>
              )}
              {(photosByAttemptId.get(a.id) ?? []).length > 0 && (
                <div className="flex gap-1.5 flex-wrap pt-1">
                  {(photosByAttemptId.get(a.id) ?? []).map((p) => (
                    <a
                      key={p.id}
                      href={p.fileData}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={p.caption || "Evidence photo"}
                    >
                      <img
                        src={p.fileData}
                        alt={p.caption || "Evidence"}
                        className="w-12 h-12 object-cover rounded border"
                      />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
