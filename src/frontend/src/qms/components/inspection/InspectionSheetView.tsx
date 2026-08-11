import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  FileClock,
  Lock,
  PlayCircle,
  Printer,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import * as inspectionApi from "../../api/inspections";
import { INSPECTION_MODE_LABELS } from "../../constants";
import { useQmsStore } from "../../store/useQmsStore";
import {
  type InspectionDocument,
  type InspectionMode,
  type InspectionSheet,
  type InspectionStageCompletion,
  type InspectionStageEntry,
  isSheetLocked,
  revisionToLetter,
} from "../../types";
import { CreateRevisionDialog } from "./CreateRevisionDialog";
import { DocumentUploadPanel } from "./DocumentUploadPanel";
import { InspectionHistoryPanel } from "./InspectionHistoryPanel";
import { InspectionSheetPdfButton } from "./InspectionSheetPdfButton";
import { InspectionSheetPrintContent } from "./InspectionSheetPrintContent";
import { InspectionStatusBadge } from "./InspectionStatusBadge";
import { InspectionStatusStepper } from "./InspectionStatusStepper";
import { RevisionHistoryDialog } from "./RevisionHistoryDialog";
import { SignatureCapture } from "./SignatureCapture";
import { StageChecklistSection } from "./StageChecklistSection";

interface Props {
  sheet: InspectionSheet;
  projectNo: string;
  customerName: string;
  companyName: string;
  companyAddress?: string;
  companyGstin?: string;
  companyLogoDataUrl?: string;
  currentUserId: string;
  currentUserName: string;
  canEditStages: boolean;
  canUpload: boolean;
  canReview: boolean;
  canApprove: boolean;
  canAssign: boolean;
  onRevisionCreated?: (newSheetId: string) => void;
}

export function InspectionSheetView({
  sheet,
  projectNo,
  customerName,
  companyName,
  companyAddress,
  companyGstin,
  companyLogoDataUrl,
  currentUserId,
  currentUserName,
  canEditStages,
  canUpload,
  canReview,
  canApprove,
  canAssign,
  onRevisionCreated,
}: Props) {
  const { inspectionStages, characteristics, refreshInspectionSheet } =
    useQmsStore();
  const [entries, setEntries] = useState<InspectionStageEntry[]>([]);
  const [completions, setCompletions] = useState<InspectionStageCompletion[]>(
    [],
  );
  const [documents, setDocuments] = useState<InspectionDocument[]>([]);
  const [history, setHistory] = useState<
    Awaited<ReturnType<typeof inspectionApi.getHistory>>
  >([]);
  const [signatureStageId, setSignatureStageId] = useState<string | null>(null);
  const [revisionDialogOpen, setRevisionDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);

  const locked = isSheetLocked(sheet.status);

  const reloadChildData = async () => {
    const [e, c, d, h] = await Promise.all([
      inspectionApi.getStageEntries(sheet.id),
      inspectionApi.getStageCompletions(sheet.id),
      inspectionApi.getDocuments(sheet.id),
      inspectionApi.getHistory(sheet.id),
    ]);
    setEntries(e);
    setCompletions(c);
    setDocuments(d);
    setHistory(h);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: reload only when the sheet identity or status changes
  useEffect(() => {
    reloadChildData();
  }, [sheet.id, sheet.status, sheet.updatedAt]);

  /** Every mutating action goes through this so an IllegalTransitionError or
   * a locked-sheet error (both thrown by qms/api/inspections.ts) surfaces as
   * a toast instead of an unhandled rejection. */
  const runAction = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  };

  const orderedStages = useMemo(
    () =>
      sheet.stageIds
        .map((id) => inspectionStages.find((s) => s.id === id))
        .filter((s): s is (typeof inspectionStages)[number] => !!s),
    [sheet.stageIds, inspectionStages],
  );

  const characteristicsByStage = useMemo(() => {
    const map: Record<string, typeof characteristics> = {};
    for (const stage of orderedStages) {
      map[stage.id] = characteristics.filter(
        (c) =>
          c.status === "Active" &&
          stage.processId &&
          c.processId === stage.processId,
      );
    }
    return map;
  }, [orderedStages, characteristics]);

  const entriesByStage = useMemo(() => {
    const map: Record<string, InspectionStageEntry[]> = {};
    for (const stage of orderedStages) {
      map[stage.id] = entries.filter((e) => e.stageId === stage.id);
    }
    return map;
  }, [orderedStages, entries]);

  const completionsByStage = useMemo(() => {
    const map: Record<string, InspectionStageCompletion | undefined> = {};
    for (const stage of orderedStages) {
      map[stage.id] = completions.find((c) => c.stageId === stage.id);
    }
    return map;
  }, [orderedStages, completions]);

  const handleEntryChange = async (
    stageId: string,
    characteristicId: string,
    updates: {
      result?: "Pass" | "Fail" | "NA";
      measuredValue?: string;
      remarks?: string;
    },
  ) =>
    runAction(async () => {
      const updated = await inspectionApi.upsertStageEntry(
        sheet.id,
        stageId,
        characteristicId,
        updates,
        currentUserId,
      );
      setEntries((prev) => [
        ...prev.filter((e) => e.id !== updated.id),
        updated,
      ]);
      await refreshInspectionSheet(sheet.id);
    });

  const handleStageModeChange = async (
    stageId: string,
    mode: "Paper" | "Digital",
  ) =>
    runAction(async () => {
      const updated = await inspectionApi.setStageCompletionMode(
        sheet.id,
        stageId,
        mode,
      );
      setCompletions((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      );
    });

  const handleQtyChange = async (
    stageId: string,
    acceptedQty: number | undefined,
    rejectedQty: number | undefined,
  ) =>
    runAction(async () => {
      const updated = await inspectionApi.setStageCompletionQty(
        sheet.id,
        stageId,
        acceptedQty,
        rejectedQty,
      );
      setCompletions((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      );
      // Refreshes the cross-project cache ProjectDetail's dispatch-readiness
      // badge/Production Summary reads, so switching back to that tab picks
      // up the new quantity without needing a full page reload.
      await useQmsStore.getState().loadStageCompletions();
    });

  const handleAssign = async (
    stageId: string,
    assigneeId: string,
    assigneeName: string,
  ) =>
    runAction(async () => {
      const updated = await inspectionApi.assignStage(
        sheet.id,
        stageId,
        assigneeId,
        assigneeName,
        currentUserId,
        currentUserName,
      );
      setCompletions((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      );
      await reloadChildData();
      toast.success(`Assigned to ${assigneeName}`);
    });

  const handleSign = async (stageId: string, signatureDataUrl: string) =>
    runAction(async () => {
      await inspectionApi.signStage(
        sheet.id,
        stageId,
        { inspectorName: currentUserName, signatureDataUrl },
        currentUserId,
        currentUserName,
      );
      await reloadChildData();
      await refreshInspectionSheet(sheet.id);
      toast.success("Stage signed");
    });

  const handleStageUpload = async (stageId: string, file: File) =>
    runAction(async () => {
      await inspectionApi.uploadDocument(
        sheet.id,
        file,
        currentUserId,
        currentUserName,
        {
          stageId,
        },
      );
      await reloadChildData();
      await refreshInspectionSheet(sheet.id);
      toast.success("Document uploaded");
    });

  const handleWholeSheetUpload = async (file: File) =>
    runAction(async () => {
      await inspectionApi.uploadDocument(
        sheet.id,
        file,
        currentUserId,
        currentUserName,
      );
      await reloadChildData();
      await refreshInspectionSheet(sheet.id);
      toast.success("Signed sheet uploaded");
    });

  const buildPrintHtml = async (): Promise<string> => {
    const container = document.createElement("div");
    container.style.cssText =
      "position:fixed;top:0;left:-9999px;width:800px;background:#fff;z-index:9999";
    document.body.appendChild(container);
    const root = createRoot(container);
    const docId = `qms-inspection-print-${sheet.id}`;
    flushSync(() => {
      root.render(
        <InspectionSheetPrintContent
          id={docId}
          companyName={companyName}
          companyAddress={companyAddress}
          companyGstin={companyGstin}
          projectNo={projectNo}
          customerName={customerName}
          sheet={sheet}
          stages={orderedStages}
          characteristicsByStage={characteristicsByStage}
          entriesByStage={entriesByStage}
          completionsByStage={completionsByStage}
        />,
      );
    });
    const el = document.getElementById(docId);
    const content = el?.innerHTML || "";
    root.unmount();
    container.remove();
    return content;
  };

  const handlePrint = async () => {
    const content = await buildPrintHtml();
    if (!content) return;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(
      `<html><head><title>${sheet.inspectionNumber}</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#000;background:#fff;}table{border-collapse:collapse;width:100%;}@page{size:A4;margin:15mm;}@media print{body{padding:0;}}</style></head><body>${content}</body></html>`,
    );
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);

    // Printing a locked (Approved/Closed) sheet is always allowed — it's
    // just producing a reference copy, not a workflow step — but the status
    // transition to "Printed" is only legal pre-lock, so skip it rather
    // than let an IllegalTransitionError interrupt the print.
    if (inspectionApi.canTransitionStatus(sheet.status, "Printed")) {
      await runAction(async () => {
        await inspectionApi.markPrinted(
          sheet.id,
          currentUserId,
          currentUserName,
        );
        await refreshInspectionSheet(sheet.id);
      });
    }
  };

  return (
    <div className="space-y-4" data-ocid="qms.inspection.sheet_view">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 pb-2">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              {sheet.inspectionNumber}
              <InspectionStatusBadge status={sheet.status} />
              {locked && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Lock className="w-3 h-3" /> Locked
                </span>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Revision {revisionToLetter(sheet.revision)} ·{" "}
              {INSPECTION_MODE_LABELS[sheet.mode]} · Created by{" "}
              {currentUserName === sheet.generatedBy
                ? "you"
                : sheet.generatedBy}{" "}
              on {new Date(sheet.generatedAt).toLocaleString()} · Last modified{" "}
              {new Date(sheet.updatedAt).toLocaleString()}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEditStages && !locked && (
              <Select
                value={sheet.mode}
                onValueChange={(v) =>
                  runAction(() =>
                    useQmsStore
                      .getState()
                      .setInspectionSheetMode(
                        sheet.id,
                        v as InspectionMode,
                        currentUserId,
                        currentUserName,
                      ),
                  )
                }
              >
                <SelectTrigger
                  className="h-7 text-xs w-28"
                  data-ocid="qms.inspection.sheet_mode_select"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["Hybrid", "Digital", "Paper"] as InspectionMode[]).map(
                    (m) => (
                      <SelectItem key={m} value={m} className="text-xs">
                        {m}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={() => setHistoryDialogOpen(true)}
              data-ocid="qms.inspection.revision_history_button"
            >
              <FileClock className="w-3.5 h-3.5" />
              Revisions
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={handlePrint}
              data-ocid="qms.inspection.print_button"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </Button>
            <InspectionSheetPdfButton
              sheet={sheet}
              projectNo={projectNo}
              customerName={customerName}
              companyName={companyName}
              companyAddress={companyAddress}
              companyGstin={companyGstin}
              companyLogoDataUrl={companyLogoDataUrl}
              stages={orderedStages}
              characteristicsByStage={characteristicsByStage}
              entriesByStage={entriesByStage}
              completionsByStage={completionsByStage}
            />
            {canEditStages &&
              !locked &&
              ![
                "InspectionStarted",
                "InProgress",
                "Completed",
                "Signed",
                "AwaitingUpload",
                "Uploaded",
                "Reviewed",
              ].includes(sheet.status) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  onClick={() =>
                    runAction(() =>
                      useQmsStore
                        .getState()
                        .startInspection(
                          sheet.id,
                          currentUserId,
                          currentUserName,
                        ),
                    )
                  }
                  data-ocid="qms.inspection.start_button"
                >
                  <PlayCircle className="w-3.5 h-3.5" />
                  Start Inspection
                </Button>
              )}
            {canEditStages &&
              !locked &&
              ![
                "Completed",
                "Signed",
                "AwaitingUpload",
                "Uploaded",
                "Reviewed",
              ].includes(sheet.status) && (
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={() =>
                    runAction(() =>
                      useQmsStore
                        .getState()
                        .markCompleted(
                          sheet.id,
                          currentUserId,
                          currentUserName,
                        ),
                    )
                  }
                  data-ocid="qms.inspection.complete_button"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Mark Completed
                </Button>
              )}
            {locked && canApprove && (
              <Button
                type="button"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => setRevisionDialogOpen(true)}
                data-ocid="qms.inspection.create_revision_button"
              >
                Create New Revision
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <div className="text-muted-foreground">Project</div>
            <div className="font-medium">{projectNo}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Customer</div>
            <div className="font-medium">{customerName}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Drawing Ref / Rev</div>
            <div className="font-medium">
              {sheet.drawingReference || "—"} / {sheet.drawingRevision || "—"}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Stages</div>
            <div className="font-medium">{sheet.stageIds.length}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Approval Status</div>
            <div className="font-medium">
              {sheet.approvedAt
                ? "Approved"
                : sheet.reviewedAt
                  ? "Under Review"
                  : "Pending"}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Current Revision</div>
            <div className="font-medium">
              {revisionToLetter(sheet.revision)}
            </div>
          </div>
        </CardContent>
        <CardContent className="pt-0">
          <InspectionStatusStepper status={sheet.status} />
        </CardContent>
      </Card>

      {orderedStages.map((stage) => (
        <StageChecklistSection
          key={stage.id}
          stage={stage}
          characteristics={characteristicsByStage[stage.id] ?? []}
          entries={entriesByStage[stage.id] ?? []}
          completion={completionsByStage[stage.id]}
          documents={documents.filter((d) => d.stageId === stage.id)}
          sheetMode={sheet.mode}
          canEdit={canUpload && !locked}
          canAssign={canAssign && !locked}
          currentUserId={currentUserId}
          onEntryChange={(characteristicId, updates) =>
            handleEntryChange(stage.id, characteristicId, updates)
          }
          onStageModeChange={(mode) => handleStageModeChange(stage.id, mode)}
          onOpenSignature={() => setSignatureStageId(stage.id)}
          onUpload={(file) => handleStageUpload(stage.id, file)}
          onAssign={(assigneeId, assigneeName) =>
            handleAssign(stage.id, assigneeId, assigneeName)
          }
          onQtyChange={(acceptedQty, rejectedQty) =>
            handleQtyChange(stage.id, acceptedQty, rejectedQty)
          }
        />
      ))}

      <DocumentUploadPanel
        documents={documents.filter((d) => !d.stageId)}
        stages={orderedStages}
        onUpload={handleWholeSheetUpload}
        canUpload={canUpload && !locked}
      />

      <InspectionHistoryPanel
        sheet={sheet}
        history={history}
        canReview={canReview}
        canApprove={canApprove}
        onReview={() =>
          runAction(async () => {
            await useQmsStore
              .getState()
              .markReviewed(sheet.id, currentUserId, currentUserName);
            await reloadChildData();
          })
        }
        onApprove={() =>
          runAction(async () => {
            await useQmsStore
              .getState()
              .approveSheet(sheet.id, currentUserId, currentUserName);
            await reloadChildData();
          })
        }
        onClose={() =>
          runAction(async () => {
            await useQmsStore
              .getState()
              .closeSheet(sheet.id, currentUserId, currentUserName);
            await reloadChildData();
          })
        }
      />

      <SignatureCapture
        open={!!signatureStageId}
        onClose={() => setSignatureStageId(null)}
        onSave={(dataUrl) => {
          if (signatureStageId) handleSign(signatureStageId, dataUrl);
        }}
        title="Inspector Signature"
        subtitle={orderedStages.find((s) => s.id === signatureStageId)?.name}
      />

      <CreateRevisionDialog
        open={revisionDialogOpen}
        onOpenChange={setRevisionDialogOpen}
        sheet={sheet}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        onCreated={(newSheetId) => {
          setRevisionDialogOpen(false);
          onRevisionCreated?.(newSheetId);
        }}
      />

      <RevisionHistoryDialog
        open={historyDialogOpen}
        onOpenChange={setHistoryDialogOpen}
        sheet={sheet}
      />
    </div>
  );
}
