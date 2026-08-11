import { ShieldOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../../AuthContext";
import { hasPermission } from "../../permissions";
import { useStore } from "../../store";
import { InspectionSheetView } from "../components/inspection/InspectionSheetView";
import { StageSelector } from "../components/inspection/StageSelector";
import { useQmsStore } from "../store/useQmsStore";

interface Props {
  projectId: string;
}

export function ProjectInspectionTab({ projectId }: Props) {
  const { currentUser } = useAuth();
  const { projects, customers, settings } = useStore();
  const {
    loaded,
    characteristics,
    templates,
    inspectionStagesLoaded,
    inspectionStages,
    inspectionSheets,
    loadAll,
    loadInspectionStages,
    loadInspectionSheets,
    generateInspectionSheet,
  } = useQmsStore();

  const [generating, setGenerating] = useState(false);

  const userId = currentUser?.id ?? "";
  const userName = currentUser?.username ?? "unknown";

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount, re-run only if not yet loaded
  useEffect(() => {
    if (!loaded) loadAll(userId);
    if (!inspectionStagesLoaded) loadInspectionStages();
    loadInspectionSheets();
  }, [loaded, inspectionStagesLoaded]);

  const canView = hasPermission(currentUser, "inspection_sheets.view");
  const canGenerate = hasPermission(currentUser, "inspection_sheets.generate");
  const canComplete = hasPermission(currentUser, "inspection_sheets.complete");
  const canUpload = hasPermission(currentUser, "inspection_sheets.upload");
  const canReview = hasPermission(currentUser, "inspection_sheets.review");
  const canApprove = hasPermission(currentUser, "inspection_sheets.approve");
  const canAssign = hasPermission(currentUser, "inspection_sheets.assign");

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
        <ShieldOff className="w-8 h-8 text-destructive" />
        <p className="text-sm text-muted-foreground">
          You do not have permission to view inspections.
        </p>
      </div>
    );
  }

  const project = projects.find((p) => p.id === projectId);
  const customer = customers.find((c) => c.id === project?.customerId);
  // A project can have multiple inspection sheet rows once revisions exist
  // (§3 — each revision is its own row); the one to show is always the
  // highest-revision row, matching inspectionApi.getInspectionSheetByProject().
  const projectSheets = inspectionSheets.filter(
    (s) => s.projectId === projectId,
  );
  const sheet =
    projectSheets.length === 0
      ? undefined
      : projectSheets.reduce((latest, s) =>
          s.revision > latest.revision ? s : latest,
        );

  if (!project) return null;

  if (!sheet) {
    if (!canGenerate) {
      return (
        <p
          className="text-sm text-muted-foreground text-center py-8"
          data-ocid="qms.inspection.no_sheet_no_permission"
        >
          No inspection sheet has been generated for this project yet.
        </p>
      );
    }
    return (
      <StageSelector
        stages={inspectionStages}
        templates={templates}
        characteristics={characteristics}
        generating={generating}
        onGenerate={async (input) => {
          setGenerating(true);
          try {
            await generateInspectionSheet({
              projectId,
              stageIds: input.stageIds,
              mode: input.mode,
              customerId: project.customerId,
              drawingReference: input.drawingReference,
              drawingRevision: input.drawingRevision,
              generatedBy: userId,
              generatedByName: userName,
            });
          } finally {
            setGenerating(false);
          }
        }}
      />
    );
  }

  return (
    <InspectionSheetView
      sheet={sheet}
      projectNo={project.projectNo}
      customerName={customer?.name ?? "—"}
      companyName={settings?.companyName || "Your Company"}
      companyAddress={settings?.companyAddress}
      companyGstin={settings?.companyGstin}
      companyLogoDataUrl={settings?.companyLogo}
      currentUserId={userId}
      currentUserName={userName}
      canEditStages={canGenerate}
      canUpload={canComplete || canUpload}
      canReview={canReview}
      canApprove={canApprove}
      canAssign={canAssign}
    />
  );
}
