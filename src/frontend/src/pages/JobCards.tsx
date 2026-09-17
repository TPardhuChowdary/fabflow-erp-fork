// Job Cards feature (see chat) — employee-assigned, time-based work.
// Complements (does not replace) ProjectProductionStage: a Job Card is
// one employee's time-based work assignment/execution; the existing
// Production system remains authoritative for its own stage-gate logic.
//
// List + Create/Edit dialog + read-only detail, built entirely from
// existing primitives (Table, Dialog, RowActions, EmployeeSelect,
// ProjectSelect, StatusBadge-style inline badge) — no new visual
// language, matching the frozen UX.
import { AssetPhotoGallery } from "@/components/AssetPhotoGallery";
import { DrawingLinkPicker } from "@/components/DrawingLinkPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RowActions } from "@/components/ui/row-actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { findWorkingDrawing } from "@/drawingEditor/lib/drawingTree";
import { composeLatestView } from "@/drawingEditor/lib/workOrderPreview";
import { useDrawingEditorStore } from "@/drawingEditor/store/useDrawingEditorStore";
import {
  ClipboardList,
  Pencil,
  Plus,
  Printer,
  ShieldOff,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { CompleteJobCardDialog } from "../components/CompleteJobCardDialog";
import { ConfirmDeleteDialog } from "../components/ConfirmDeleteDialog";
import { EmployeeSelect } from "../components/EmployeeSelect";
import { JobCardTimerPanel } from "../components/JobCardTimerPanel";
import { MachineSelect } from "../components/MachineSelect";
import { ProjectSelect } from "../components/ProjectSelect";
import {
  formatJobCardTimestamp,
  useJobCardTimer,
} from "../hooks/useJobCardTimer";
import {
  getAssetPhotoSignedUrl,
  resolveCoverStoragePath,
  uploadAssetPhoto,
  validateAssetPhotoFile,
} from "../lib/assetPhotosApi";
import { getEvidenceRequirements } from "../lib/companySettingsApi";
import { JobCardDocContent } from "../lib/documentRenderers";
import { setJobCardExceptionStatusRemote } from "../lib/jobCardExceptionsApi";
import type { WriteResult } from "../lib/jobCardsApi";
import {
  computeNextJobNo,
  createJobCardRemote,
  deleteJobCardRemote,
  pauseJobCardRemote,
  resumeJobCardRemote,
  startJobCardRemote,
  updateJobCardRemote,
} from "../lib/jobCardsApi";
import {
  canApprove,
  canCreate,
  canDelete,
  canEdit,
  canView,
} from "../permissions";
import { useStore } from "../store";
import type {
  AssetPhoto,
  JobCard,
  JobCardExceptionReason,
  JobCardInspectionCheckpoint,
  JobCardPriority,
  JobCardStatus,
} from "../types";

const REASON_LABEL: Record<JobCardExceptionReason, string> = {
  machine_breakdown: "Machine breakdown",
  material_unavailable: "Material unavailable",
  incorrect_material: "Incorrect material",
  design_specification_change: "Design/specification change",
  supervisor_delay: "Supervisor delay",
  customer_change: "Customer change",
  technical_difficulty: "Technical difficulty",
  safety_delay: "Safety issue",
  other: "Other approved reason",
};

const STATUS_LABEL: Record<JobCardStatus, string> = {
  NotStarted: "Not Started",
  InProgress: "In Progress",
  Completed: "Completed",
  OnHold: "On Hold",
};

// Project Reference Photo resolver (see chat) — the one place that
// turns "a project id + the org's already-loaded asset_photos" into a
// signed URL for that project's primary photo. Shared by the View
// dialog, the Create/Edit form, and handlePrintJobCard so there is
// exactly one implementation of "which photo, which URL rule" rather
// than three near-identical copies. Never copies/duplicates the photo
// into the Job Card's own asset_photos — always resolved fresh from the
// Project's own row, same resolveCoverStoragePath processed/original
// preference Projects.tsx's own cover thumbnails use.
async function resolveProjectPhotoUrl(
  projectId: string | undefined,
  photos: AssetPhoto[] | undefined,
): Promise<string | null> {
  if (!projectId) return null;
  const photo = (photos || []).find(
    (p) => p.ownerType === "project" && p.ownerId === projectId && p.isPrimary,
  );
  if (!photo) return null;
  return getAssetPhotoSignedUrl(resolveCoverStoragePath(photo));
}

function statusCls(status: JobCardStatus) {
  const map: Record<JobCardStatus, string> = {
    NotStarted: "bg-muted text-muted-foreground",
    InProgress: "bg-info/10 text-info border-info/30",
    Completed: "bg-success/10 text-success border-success/30",
    OnHold: "bg-warning/15 text-warning border-warning/30",
  };
  return map[status];
}

const emptyForm = {
  projectId: "",
  employeeId: "",
  jobDescription: "",
  operationType: "",
  stageId: "",
  standardTimePerUnitMinutes: "",
  allocatedTimeMinutes: "",
  actualCompletedQty: "0",
  rejectedQty: "0",
  reworkQty: "0",
  // Start/End Date-Time are deliberately NOT form fields — they are
  // owned by the server-authoritative timer (enforce_job_card_timer_
  // transition) and set only by Start/Complete. The New/Edit form must
  // never ask a user to type them (see chat, Job Card timer UX
  // correction) — handleSaveEdit passes the existing job card's own
  // startTime/endTime straight through unchanged so an edit to any other
  // field can never reset or destroy them.
  status: "NotStarted" as JobCardStatus,
  notes: "",
  // Job Card print/layout options (see chat) — edit-only (Section 8's own
  // scope decision: a not-yet-saved Job Card has no id to attach
  // asset_photos/drawing_links rows to). "" means "no Reference Photo
  // selected", matching the emptyForm string-field convention used
  // throughout this file (e.g. stageId) rather than undefined.
  referencePhotoId: "",
  printReferencePhoto: false,
  printDrawing: false,
  // Job Card planning fields (see chat, database/20260917100000). All
  // plain columns — no create-mode staging needed (unlike Reference
  // Photo/Drawing above, none of these need a real job_cards.id first).
  totalQuantity: "",
  // "" = use the automatic calculation (previewExpectedQty). A non-empty
  // string is the user's deliberate override. expectedQuantityTouched
  // distinguishes "the user has interacted with this field" from "it's
  // just empty" so the auto-recompute effect below never overwrites a
  // value the user is actively editing, including editing it back to "".
  expectedQuantityOverride: "",
  expectedQuantityTouched: false,
  inspectionPlan: [] as JobCardInspectionCheckpoint[],
  workCenterMachineId: "",
  workCenterName: "",
  priority: "Normal" as JobCardPriority,
  startDate: "",
};

interface JobCardsProps {
  /** Universal cross-module linking (Master ERP Architecture, Phase 2)
   * — same moduleNavContext.highlightId pattern Invoices.tsx already
   * uses, opening this job card in the existing view dialog. */
  highlightJobCardId?: string;
  onViewProject?: (projectId: string) => void;
}

export function JobCards({
  highlightJobCardId,
  onViewProject,
}: JobCardsProps = {}) {
  const { currentUser } = useAuth();
  const {
    jobCards,
    employees,
    projects,
    projectProductions,
    jobCardExceptions,
    settings,
    assetPhotos,
    assetPhotosHydration,
    addJobCard,
    updateJobCard,
    deleteJobCard,
    updateJobCardExceptionLocal,
    addAssetPhotoLocal,
  } = useStore();
  const pCreate = canCreate(currentUser, "job_cards");
  const pEdit = canEdit(currentUser, "job_cards");
  const pDelete = canDelete(currentUser, "job_cards");
  const pApprove = canApprove(currentUser, "job_cards");
  const pendingExceptions = jobCardExceptions.filter(
    (e) => e.status === "pending",
  );
  const [resolvingException, setResolvingException] = useState(false);

  async function resolveException(id: string, status: "approved" | "rejected") {
    if (resolvingException) return;
    setResolvingException(true);
    try {
      const result = await setJobCardExceptionStatusRemote(id, status);
      if (result.status === "unauthenticated") {
        toast.error("Not signed in - exception was not updated.");
        return;
      }
      if (result.status === "denied" || result.status === "error") {
        toast.error(result.error ?? "Could not update exception.");
        return;
      }
      if (!result.data) return;
      updateJobCardExceptionLocal(result.data);
      toast.success(
        status === "approved" ? "Exception approved" : "Exception rejected",
      );
    } finally {
      setResolvingException(false);
    }
  }

  const [addOpen, setAddOpen] = useState(false);
  const [editCard, setEditCard] = useState<JobCard | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<JobCard | null>(null);
  const [viewCard, setViewCard] = useState<JobCard | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  // Create/Edit consistency (see chat) — a not-yet-saved Job Card has no
  // id for AssetPhotoGallery/DrawingLinkPicker to attach rows to, so
  // Create mode stages these purely locally, exactly like Dies.tsx's own
  // pendingDrawingIds does for its mandatory drawing link, and flushes
  // them in handleSaveAdd right after createJobCardRemote() returns a
  // real id. pendingReferencePhotoFile is the photo equivalent — a raw
  // File, uploaded via uploadAssetPhoto() only once that id exists.
  const [pendingReferencePhotoFile, setPendingReferencePhotoFile] =
    useState<File | null>(null);
  const [pendingReferencePhotoPreviewUrl, setPendingReferencePhotoPreviewUrl] =
    useState<string | null>(null);
  const [pendingDrawingIds, setPendingDrawingIds] = useState<string[]>([]);

  // Reference Photo vs Evidence Photo separation (Edit mode) — asset_photos
  // has no "kind" column, so the only reliable signal for "this is an
  // Evidence Photo, not a Reference Photo candidate" is the same rule
  // CompleteJobCardDialog/MyJobs already use: any job_card-owned photo
  // other than the current reference_photo_id. Snapshotted once when
  // openEdit() runs (not recomputed live) so a brand-new photo uploaded
  // during THIS edit session — replacing the Reference Photo — is never
  // in the snapshot and stays visible/selectable; everything that
  // already existed at open time and isn't the current reference photo
  // is treated as Evidence and hidden from this gallery/picker.
  const [referencePhotoExcludeIds, setReferencePhotoExcludeIds] = useState<
    string[]
  >([]);

  // Job Card Drawing Link (Section 4, see chat) — same Drawing Repository
  // store Dies.tsx/MachineDetail.tsx/ProjectDetail.tsx already use, now
  // also linking through linkedType "job_card" (drawingEditor/types.ts).
  const {
    links: drawingLinks,
    linksLoaded,
    loadLinks,
    addLink: addDrawingLink,
    removeLink: removeDrawingLink,
  } = useDrawingEditorStore();
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount
  useEffect(() => {
    if (!linksLoaded) loadLinks();
  }, [linksLoaded]);
  const linkedDrawingIdsForEdit = editCard
    ? (drawingLinks || [])
        .filter(
          (l) => l.linkedType === "job_card" && l.linkedId === editCard.id,
        )
        .map((l) => l.drawingId)
    : [];
  // Create-mode reads pendingDrawingIds, Edit-mode reads the real linked
  // rows — same split Dies.tsx uses for its own picker.
  const currentLinkedDrawingIds = editCard
    ? linkedDrawingIdsForEdit
    : pendingDrawingIds;

  function handleAddDrawingLink(drawingId: string) {
    if (editCard) {
      addDrawingLink(drawingId, "job_card", editCard.id);
    } else {
      setPendingDrawingIds((prev) =>
        prev.includes(drawingId) ? prev : [...prev, drawingId],
      );
    }
  }

  function handleRemoveDrawingLink(drawingId: string) {
    if (editCard) {
      const link = (drawingLinks || []).find(
        (l) =>
          l.linkedType === "job_card" &&
          l.linkedId === editCard.id &&
          l.drawingId === drawingId,
      );
      if (link) removeDrawingLink(link.id);
    } else {
      setPendingDrawingIds((prev) => prev.filter((id) => id !== drawingId));
    }
  }

  function handlePendingReferencePhotoSelect(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const validation = validateAssetPhotoFile(file);
    if (!validation.ok) {
      toast.error(validation.reason);
      return;
    }
    if (pendingReferencePhotoPreviewUrl) {
      URL.revokeObjectURL(pendingReferencePhotoPreviewUrl);
    }
    setPendingReferencePhotoFile(file);
    setPendingReferencePhotoPreviewUrl(URL.createObjectURL(file));
  }

  function clearPendingReferencePhoto() {
    if (pendingReferencePhotoPreviewUrl) {
      URL.revokeObjectURL(pendingReferencePhotoPreviewUrl);
    }
    setPendingReferencePhotoFile(null);
    setPendingReferencePhotoPreviewUrl(null);
  }

  // Live-ticking Active Time for the View dialog's persisted Start/End
  // block below — called unconditionally (Rules of Hooks) with a no-op
  // fallback while the dialog is closed, so it stays in sync with
  // JobCardTimerPanel's own identical computation for the same card.
  const { formatted: viewCardActiveTime } = useJobCardTimer({
    status: viewCard?.status ?? "NotStarted",
    activeSeconds: viewCard?.activeSeconds ?? 0,
    currentRunStartedAt: viewCard?.currentRunStartedAt,
  });

  // Project Reference Photo (Section 1, see chat) — small, identifies
  // "the product/project you are working on", NOT evidence. Resolved
  // from the Project's own primary asset_photos row (never copied into
  // the Job Card's own photos), same processed/original preference
  // Projects.tsx's own cover thumbnails use via resolveCoverStoragePath.
  // Shared by the View dialog, the Create/Edit form (so the photo
  // appears the moment a Project is selected, before the Job Card is
  // saved), and handlePrintJobCard below — one resolver, three callers.
  const [viewProjectPhotoUrl, setViewProjectPhotoUrl] = useState<string | null>(
    null,
  );
  useEffect(() => {
    let cancelled = false;
    resolveProjectPhotoUrl(viewCard?.projectId, assetPhotos).then((url) => {
      if (!cancelled) setViewProjectPhotoUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [viewCard, assetPhotos]);

  const [formProjectPhotoUrl, setFormProjectPhotoUrl] = useState<string | null>(
    null,
  );
  useEffect(() => {
    let cancelled = false;
    resolveProjectPhotoUrl(form.projectId, assetPhotos).then((url) => {
      if (!cancelled) setFormProjectPhotoUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [form.projectId, assetPhotos]);

  // Print Options invariant (see chat) — printReferencePhoto/printDrawing
  // must never stay checked once their dependency disappears. The
  // checkbox's own `disabled` state only blocks a NEW check; it can
  // never uncheck a box the user already checked earlier (staged Create
  // photo removed, Edit reference photo deleted/unselected, last linked
  // drawing removed in either mode). One effect per dependency, run at
  // the actual state-transition point rather than only gating the
  // checkbox — covers Create and Edit uniformly since both read the
  // same form.printReferencePhoto/printDrawing fields.
  //
  // Gated on assetPhotosHydration having actually finished ("success")
  // so this can never fire on the transient empty-array state before
  // assetPhotos has hydrated and wrongly wipe out a legitimately-set
  // printReferencePhoto for a Job Card that really does have one.
  //
  // Also clears the dangling form.referencePhotoId itself (Edit mode),
  // not just printReferencePhoto — deleting the photo via
  // AssetPhotoGallery only updates the local assetPhotos list; it never
  // patches the job_cards row's own referencePhotoId in local state (the
  // server-side FK ON DELETE SET NULL only takes effect on the row, not
  // this in-memory form), so the stale id would otherwise still be sent
  // on Save and get rejected by trg_validate_job_card_reference_photo
  // ("reference_photo_id must belong to this job card").
  useEffect(() => {
    if (assetPhotosHydration.status !== "success") return;
    const referencePhotoStillExists =
      !!form.referencePhotoId &&
      (assetPhotos || []).some(
        (p) => p.ownerType === "job_card" && p.id === form.referencePhotoId,
      );
    const hasReferencePhoto = editCard
      ? referencePhotoStillExists
      : !!pendingReferencePhotoFile;
    if (!hasReferencePhoto && form.printReferencePhoto) {
      setForm((f) => ({ ...f, printReferencePhoto: false }));
    }
    if (editCard && form.referencePhotoId && !referencePhotoStillExists) {
      setForm((f) => ({ ...f, referencePhotoId: "" }));
    }
  }, [
    editCard,
    form.referencePhotoId,
    form.printReferencePhoto,
    pendingReferencePhotoFile,
    assetPhotos,
    assetPhotosHydration.status,
  ]);

  // Same invariant for the Drawing dependency — gated on linksLoaded so
  // this can't fire on the transient empty-links state before
  // drawing_links has actually loaded for this session.
  useEffect(() => {
    if (!linksLoaded) return;
    if (currentLinkedDrawingIds.length === 0 && form.printDrawing) {
      setForm((f) => ({ ...f, printDrawing: false }));
    }
  }, [linksLoaded, currentLinkedDrawingIds.length, form.printDrawing]);

  // Job Card live timer (Start/Pause/Resume/Complete) — same evidence
  // policy read and Complete flow as My Jobs (MyJobs.tsx), reused via
  // CompleteJobCardDialog rather than a second copy of that logic.
  const [completeOpen, setCompleteOpen] = useState(false);
  const [evidencePolicy, setEvidencePolicy] = useState<{
    job_card_completion?: boolean;
    quality_rejection?: boolean;
  }>({});
  useEffect(() => {
    getEvidenceRequirements().then((v) => {
      if (v) setEvidencePolicy(v);
    });
  }, []);

  useEffect(() => {
    if (!highlightJobCardId) return;
    const match = jobCards.find((jc) => jc.id === highlightJobCardId);
    if (match) setViewCard(match);
  }, [highlightJobCardId, jobCards]);

  async function handleTransition(
    action: (id: string) => Promise<WriteResult<JobCard>>,
    jc: JobCard,
    successMessage: string,
    failureMessage: string,
  ) {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const result = await action(jc.id);
      if (result.status === "unauthenticated") {
        toast.error(`Not signed in - ${failureMessage}`);
        return;
      }
      if (result.status === "denied" || result.status === "error") {
        toast.error(result.error ?? `Could not ${failureMessage}`);
        return;
      }
      if (!result.data) return;
      updateJobCard(result.data);
      setViewCard(result.data);
      toast.success(successMessage);
    } finally {
      setIsSaving(false);
    }
  }
  const handleStart = (jc: JobCard) =>
    handleTransition(startJobCardRemote, jc, "Job started", "start job");
  const handlePause = (jc: JobCard) =>
    handleTransition(pauseJobCardRemote, jc, "Job paused", "pause job");
  const handleResume = (jc: JobCard) =>
    handleTransition(resumeJobCardRemote, jc, "Job resumed", "resume job");

  const openAdd = () => {
    setForm(emptyForm);
    clearPendingReferencePhoto();
    setPendingDrawingIds([]);
    setReferencePhotoExcludeIds([]);
    setAddOpen(true);
  };

  const openEdit = (jc: JobCard) => {
    setEditCard(jc);
    clearPendingReferencePhoto();
    setPendingDrawingIds([]);
    setReferencePhotoExcludeIds(
      (assetPhotos || [])
        .filter(
          (p) =>
            p.ownerType === "job_card" &&
            p.ownerId === jc.id &&
            p.id !== (jc.referencePhotoId || ""),
        )
        .map((p) => p.id),
    );
    setForm({
      projectId: jc.projectId,
      employeeId: jc.employeeId ?? "",
      jobDescription: jc.jobDescription,
      operationType: jc.operationType,
      stageId: jc.stageId ?? "",
      standardTimePerUnitMinutes: String(jc.standardTimePerUnitMinutes),
      allocatedTimeMinutes: String(jc.allocatedTimeMinutes),
      actualCompletedQty: String(jc.actualCompletedQty),
      rejectedQty: String(jc.rejectedQty),
      reworkQty: String(jc.reworkQty),
      status: jc.status,
      notes: jc.notes ?? "",
      referencePhotoId: jc.referencePhotoId ?? "",
      printReferencePhoto: jc.printReferencePhoto,
      printDrawing: jc.printDrawing,
      totalQuantity: jc.totalQuantity != null ? String(jc.totalQuantity) : "",
      expectedQuantityOverride:
        jc.expectedQuantityOverride != null
          ? String(jc.expectedQuantityOverride)
          : "",
      // Loading an already-overridden card counts as "touched" — the
      // auto-recompute effect must never clear a persisted override just
      // because the dialog was reopened.
      expectedQuantityTouched: jc.expectedQuantityOverride != null,
      inspectionPlan: jc.inspectionPlan ?? [],
      workCenterMachineId: jc.workCenterMachineId ?? "",
      workCenterName: jc.workCenterName ?? "",
      priority: jc.priority ?? "Normal",
      startDate: jc.startDate ?? "",
    });
  };

  // Live preview of the same calculation the server's GENERATED column
  // performs — Expected Quantity = Allocated Time / Standard Time per
  // Unit, floored to whole pieces (no fractional physical piece; see
  // database/phase-49/ for the disclosed rounding decision). Preview
  // only — the real, authoritative value always comes back from the
  // server after save, never trusted from this client calculation.
  const standardTime = Number.parseFloat(form.standardTimePerUnitMinutes);
  const allocatedTime = Number.parseFloat(form.allocatedTimeMinutes);
  const previewExpectedQty =
    standardTime > 0 && allocatedTime >= 0
      ? Math.floor(allocatedTime / standardTime)
      : null;

  // Effective Expected Quantity (see chat) = the override when the user
  // has deliberately set one, else the automatic calculation above.
  // Never silently overwritten: Standard/Allocated Time changing only
  // recomputes previewExpectedQty (an independent value) — it never
  // touches form.expectedQuantityOverride itself. autoValueChanged
  // surfaces when the two have diverged so the "Use automatic value"
  // reset action only appears when it would actually change anything.
  const overrideQty =
    form.expectedQuantityOverride !== ""
      ? Number.parseInt(form.expectedQuantityOverride, 10)
      : null;
  const effectiveExpectedQty =
    overrideQty !== null && !Number.isNaN(overrideQty)
      ? overrideQty
      : previewExpectedQty;
  const autoValueChanged =
    form.expectedQuantityTouched &&
    overrideQty !== null &&
    !Number.isNaN(overrideQty) &&
    previewExpectedQty !== null &&
    overrideQty !== previewExpectedQty;

  const employeeName = (id: string) =>
    employees.find((e) => e.id === id)?.name ?? "";
  const projectNo = (id: string) =>
    projects.find((p) => p.id === id)?.projectNo ?? "—";
  const stageName = (stageId: string | undefined) =>
    stageId
      ? projectProductions
          .flatMap((pp) => pp.stages)
          .find((s) => s.stageId === stageId)?.stageName
      : undefined;
  const projectLabel = (id: string) => {
    const p = projects.find((x) => x.id === id);
    return p ? `${p.projectNo} — ${p.projectName}` : "—";
  };

  // Feature: Printable Job Card — physical/paper copy of this exact,
  // existing Job Card record for shop-floor employees without a phone or
  // FabFlow login. Same off-screen-render → popup-window → window.print()
  // pattern already used for Invoices/Quotations/Company POs/Delivery
  // Challans (see lib/documentUtils.ts, pages/CompanyPOs.tsx's own
  // handlePrint) — not a new print mechanism. The popup is a completely
  // separate document (no sidebar/nav/app chrome can ever appear in it),
  // and nothing here writes to the Job Card or any other table — it only
  // reads the same fields the View dialog above already reads.
  async function handlePrintJobCard(jc: JobCard) {
    // Job Card print/layout (see chat, Sections 1/3/4/5/9) — resolves
    // THREE independent, optional images, all BEFORE the synchronous
    // flushSync render below (an <img> written into a popup via
    // innerHTML has no chance to await anything itself, same reasoning
    // settings.companyLogo is already ready-to-use by the time it
    // reaches JobCardDocContent):
    //
    // 1. Project Reference Photo — always resolved when the Project has
    //    one (Page 1, small); never duplicated into the Job Card's own
    //    asset_photos. Same resolveProjectPhotoUrl the Create/Edit form
    //    and View dialog use above — one resolver, not a third copy.
    const projectPhotoUrl = await resolveProjectPhotoUrl(
      jc.projectId,
      assetPhotos,
    );

    // 2. Job Card Reference Photo ("Work Reference") — only resolved
    //    when both a photo is selected AND printReferencePhoto is on;
    //    otherwise Page 2 simply never renders (no blank page).
    const referencePhoto =
      jc.printReferencePhoto && jc.referencePhotoId
        ? (assetPhotos || []).find((p) => p.id === jc.referencePhotoId)
        : undefined;
    const referencePhotoUrl = referencePhoto
      ? await getAssetPhotoSignedUrl(resolveCoverStoragePath(referencePhoto))
      : null;

    // 3. Linked Drawing — reuses the Drawing Editor's own existing
    //    composeLatestView (no second drawing renderer, no duplicated
    //    drawing data), same Original -> Working Drawing resolution
    //    DrawingEditorPage.tsx's own handlePrintDrawing performs before
    //    printing. Only attempted when printDrawing is on AND a link
    //    exists; a drawing that was never saved (composeLatestView
    //    returns null) just means no Page 3, not an error.
    let drawingImageDataUrl: string | undefined;
    if (jc.printDrawing) {
      const link = (drawingLinks || []).find(
        (l) => l.linkedType === "job_card" && l.linkedId === jc.id,
      );
      const drawing = link
        ? (useDrawingEditorStore.getState().drawings || []).find(
            (d) => d.id === link.drawingId,
          )
        : undefined;
      if (drawing) {
        const working = findWorkingDrawing(
          drawing.id,
          useDrawingEditorStore.getState().drawings,
        );
        const canvas = await composeLatestView(working ?? drawing, {
          companyName: settings.companyName || "Your Company",
          companyLogoDataUrl: settings.companyLogo || undefined,
        });
        if (canvas) drawingImageDataUrl = canvas.toDataURL("image/png");
      }
    }

    const container = document.createElement("div");
    container.style.cssText =
      "position:fixed;top:0;left:-9999px;width:800px;background:#fff;z-index:9999";
    document.body.appendChild(container);
    const root = createRoot(container);
    const docId = `job-card-print-${jc.id}`;
    // Print Date requirement: the moment of printing, not the Job Card's
    // own createdAt — computed here, once, right before rendering the
    // print document, and never written back to `jc` or Supabase.
    const printedAt = Date.now();
    flushSync(() => {
      root.render(
        <JobCardDocContent
          id={docId}
          jobCard={jc}
          projectLabel={projectLabel(jc.projectId)}
          stageLabel={stageName(jc.stageId) ?? null}
          settings={settings as unknown as Record<string, string>}
          printedAt={printedAt}
          projectPhotoUrl={projectPhotoUrl ?? undefined}
          referencePhotoUrl={referencePhotoUrl ?? undefined}
          drawingImageDataUrl={drawingImageDataUrl}
        />,
      );
    });
    const el = document.getElementById(docId);
    const content = el?.innerHTML || "";
    root.unmount();
    container.remove();
    if (!content) return;
    const win = window.open("", "_blank", "width=900,height=650");
    if (!win) {
      toast.error("Please allow popups for this site to print Job Cards.");
      return;
    }
    win.document.write(
      `<html><head><title>Job Card ${jc.jobNo}</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#000;background:#fff;}table{border-collapse:collapse;width:100%;}@page{size:A4;margin:15mm;}@media print{body{padding:0;}}</style></head><body>${content}</body></html>`,
    );
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

  // Job Card planning fields payload (see chat) — shared by the initial
  // insert, the post-upload patch, and the edit update below, so the 7
  // new fields are computed from `form` in exactly one place.
  const planningFieldsPayload = () => ({
    totalQuantity:
      form.totalQuantity !== ""
        ? Number.parseInt(form.totalQuantity, 10)
        : undefined,
    expectedQuantityOverride:
      overrideQty !== null && !Number.isNaN(overrideQty)
        ? overrideQty
        : undefined,
    inspectionPlan: form.inspectionPlan,
    workCenterMachineId: form.workCenterMachineId || undefined,
    workCenterName: form.workCenterName || undefined,
    priority: form.priority,
    startDate: form.startDate || undefined,
  });

  const validate = () => {
    if (!form.projectId) {
      toast.error("Select a project");
      return false;
    }
    if (!form.employeeId) {
      toast.error("Select an employee");
      return false;
    }
    if (!form.jobDescription.trim()) {
      toast.error("Job description is required");
      return false;
    }
    if (!form.operationType.trim()) {
      toast.error("Operation type is required");
      return false;
    }
    if (!standardTime || standardTime <= 0) {
      toast.error("Standard time per unit must be greater than 0");
      return false;
    }
    if (Number.isNaN(allocatedTime) || allocatedTime < 0) {
      toast.error("Allocated time must be 0 or more");
      return false;
    }
    return true;
  };

  const handleSaveAdd = async () => {
    if (isSaving || !validate()) return;
    setIsSaving(true);
    try {
      const jobNo = computeNextJobNo(jobCards.map((jc) => jc.jobNo));
      const result = await createJobCardRemote(
        {
          jobNo,
          projectId: form.projectId,
          employeeId: form.employeeId,
          employeeName: employeeName(form.employeeId),
          jobDescription: form.jobDescription.trim(),
          operationType: form.operationType.trim(),
          stageId: form.stageId || undefined,
          standardTimePerUnitMinutes: standardTime,
          allocatedTimeMinutes: allocatedTime,
          actualCompletedQty: Number.parseInt(form.actualCompletedQty, 10) || 0,
          rejectedQty: Number.parseInt(form.rejectedQty, 10) || 0,
          reworkQty: Number.parseInt(form.reworkQty, 10) || 0,
          // Never sent from this form — a new Job Card always starts with
          // no timer data; Start/Complete are what set these, server-side.
          startTime: undefined,
          endTime: undefined,
          status: form.status,
          notes: form.notes.trim() || undefined,
          // Print options are plain booleans — sent directly. referencePhotoId
          // is left unset here: it depends on the staged photo upload below,
          // which needs this Job Card's real id and so can only happen after
          // this insert returns (Create/Edit consistency, see chat — no fake
          // Job Card record, just a second real write after the first).
          referencePhotoId: undefined,
          printReferencePhoto: form.printReferencePhoto,
          printDrawing: form.printDrawing,
          ...planningFieldsPayload(),
        },
        { autoRenumberOnConflict: true },
      );
      if (result.status === "unauthenticated") {
        toast.error("You must be signed in to create a Job Card");
        return;
      }
      if (result.status === "denied") {
        toast.error("You do not have permission to create Job Cards");
        return;
      }
      if (result.status === "error" || !result.data) {
        toast.error(result.error || "Failed to create Job Card");
        return;
      }
      // The Job Card now exists as a real backend row with a real id.
      // Add it to local state and close the dialog immediately — same
      // placement as Dies.tsx's own addDie(result.data), right after
      // creation and BEFORE the pending-attachment flush below — so a
      // failure in either attachment step can never leave a
      // successfully-created, already-persisted Job Card invisible in
      // the UI (previously addJobCard was called only after both flush
      // steps, so an uncaught throw from the drawing-link loop meant the
      // real, already-inserted row never appeared and the user got no
      // feedback at all). Everything past this point is "attach optional
      // extras to an already-real record," never "finish creating the
      // record" — no second Job Card is ever created, and a failure here
      // is reported, never silently swallowed.
      let created = result.data;
      addJobCard(created);
      setAddOpen(false);

      const attachmentErrors: string[] = [];

      // Flush the staged Reference Photo, then attach its real asset_photos
      // id to the Job Card. A failure never rolls back or duplicates the
      // already-created Job Card — it's collected and reported below.
      if (pendingReferencePhotoFile) {
        try {
          const photoResult = await uploadAssetPhoto(
            "job_card",
            created.id,
            pendingReferencePhotoFile,
          );
          if (photoResult.status === "success" && photoResult.data) {
            addAssetPhotoLocal(photoResult.data);
            const patched = await updateJobCardRemote({
              id: created.id,
              jobNo: created.jobNo,
              projectId: created.projectId,
              employeeId: created.employeeId,
              employeeName: created.employeeName,
              jobDescription: created.jobDescription,
              operationType: created.operationType,
              stageId: created.stageId,
              standardTimePerUnitMinutes: created.standardTimePerUnitMinutes,
              allocatedTimeMinutes: created.allocatedTimeMinutes,
              actualCompletedQty: created.actualCompletedQty,
              rejectedQty: created.rejectedQty,
              reworkQty: created.reworkQty,
              rejectRootCause: created.rejectRootCause,
              startTime: created.startTime,
              endTime: created.endTime,
              status: created.status,
              notes: created.notes,
              referencePhotoId: photoResult.data.id,
              printReferencePhoto: created.printReferencePhoto,
              printDrawing: created.printDrawing,
              totalQuantity: created.totalQuantity,
              expectedQuantityOverride: created.expectedQuantityOverride,
              inspectionPlan: created.inspectionPlan,
              workCenterMachineId: created.workCenterMachineId,
              workCenterName: created.workCenterName,
              priority: created.priority,
              startDate: created.startDate,
            });
            if (patched.status === "success" && patched.data) {
              created = patched.data;
              updateJobCard(created);
            } else {
              attachmentErrors.push(
                patched.error || "the reference photo could not be linked",
              );
            }
          } else {
            attachmentErrors.push(
              photoResult.error || "the reference photo failed to upload",
            );
          }
        } catch (err) {
          attachmentErrors.push(
            err instanceof Error
              ? err.message
              : "the reference photo could not be attached",
          );
        }
      }

      // Flush pending Drawing Links — same pending-until-saved pattern
      // Dies.tsx already establishes for its own mandatory drawing link,
      // just now for job_card-linked rows. Guarded: addDrawingLink can
      // throw (drawingEditor/api/drawings.ts addLink throws a real Error
      // on any Supabase failure) and must never abort this function
      // silently or leave the user without feedback.
      for (const drawingId of pendingDrawingIds) {
        try {
          await addDrawingLink(drawingId, "job_card", created.id);
        } catch (err) {
          attachmentErrors.push(
            err instanceof Error
              ? err.message
              : "a drawing could not be linked",
          );
        }
      }

      if (attachmentErrors.length > 0) {
        toast.error(
          `${created.jobNo} was created, but some attachments could not be completed: ${attachmentErrors.join("; ")}. You can retry from Edit.`,
        );
      } else {
        toast.success(`${created.jobNo} created`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (isSaving || !editCard || !validate()) return;
    setIsSaving(true);
    try {
      const result = await updateJobCardRemote({
        id: editCard.id,
        jobNo: editCard.jobNo,
        projectId: form.projectId,
        employeeId: form.employeeId,
        employeeName: employeeName(form.employeeId),
        jobDescription: form.jobDescription.trim(),
        operationType: form.operationType.trim(),
        stageId: form.stageId || undefined,
        standardTimePerUnitMinutes: standardTime,
        allocatedTimeMinutes: allocatedTime,
        actualCompletedQty: Number.parseInt(form.actualCompletedQty, 10) || 0,
        rejectedQty: Number.parseInt(form.rejectedQty, 10) || 0,
        reworkQty: Number.parseInt(form.reworkQty, 10) || 0,
        // Passed through unchanged, never from form state — this edit
        // form has no Start/End Date-Time inputs (the timer owns them),
        // so editing any other field here must never reset or destroy
        // whatever the timer has already persisted.
        startTime: editCard.startTime,
        endTime: editCard.endTime,
        status: form.status,
        notes: form.notes.trim() || undefined,
        referencePhotoId: form.referencePhotoId || undefined,
        printReferencePhoto: form.printReferencePhoto,
        printDrawing: form.printDrawing,
        ...planningFieldsPayload(),
      });
      if (result.status === "unauthenticated") {
        toast.error("You must be signed in to edit a Job Card");
        return;
      }
      if (result.status === "denied") {
        toast.error("You do not have permission to edit Job Cards");
        return;
      }
      if (result.status === "error" || !result.data) {
        toast.error(result.error || "Failed to update Job Card");
        return;
      }
      updateJobCard(result.data);
      toast.success("Job Card updated");
      setEditCard(null);
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteJobCardRemote(deleteTarget.id);
    if (result.status === "unauthenticated") {
      toast.error("You must be signed in to delete a Job Card");
      return;
    }
    if (result.status === "denied" || result.status === "error") {
      toast.error(result.error ?? "Could not delete Job Card");
      return;
    }
    deleteJobCard(deleteTarget.id);
    toast.success("Job Card deleted");
    if (viewCard?.id === deleteTarget.id) setViewCard(null);
    setDeleteTarget(null);
  };

  // Scoped to the form's currently-selected project only — matches the
  // server's own same-project validation (trg_validate_job_card_stage_
  // reference, database/20260906060000) so the picker never offers a
  // choice the save would reject.
  const stagesForSelectedProject =
    projectProductions.find((pp) => pp.projectId === form.projectId)?.stages ??
    [];

  const sectionLabel = (text: string) => (
    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground pt-2 first:pt-0">
      {text}
    </div>
  );

  const formFields = (
    <div className="space-y-3 py-2">
      {sectionLabel("Job Identification")}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Project *</Label>
          <ProjectSelect
            value={form.projectId}
            onChange={(id) =>
              // Clearing stageId on project change: a stage picked for a
              // different project would fail the server's same-project
              // validation trigger (database/20260906060000) — reset it
              // here rather than let the user hit that error blind.
              setForm((f) => ({ ...f, projectId: id, stageId: "" }))
            }
            className="w-full"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Operation Type *</Label>
          <Input
            value={form.operationType}
            onChange={(e) =>
              setForm((f) => ({ ...f, operationType: e.target.value }))
            }
            placeholder="e.g. Cutting"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Work Center</Label>
          <MachineSelect
            value={form.workCenterMachineId}
            onChange={(id) =>
              setForm((f) => ({
                ...f,
                workCenterMachineId: id,
                workCenterName:
                  useStore.getState().machines.find((m) => m.id === id)?.name ??
                  "",
              }))
            }
            className="w-full"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Employee *</Label>
          <EmployeeSelect
            value={form.employeeId}
            onChange={(id) => setForm((f) => ({ ...f, employeeId: id }))}
            className="w-full"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Start Date</Label>
          <Input
            type="date"
            value={form.startDate}
            onChange={(e) =>
              setForm((f) => ({ ...f, startDate: e.target.value }))
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Priority</Label>
          <Select
            value={form.priority}
            onValueChange={(v) =>
              setForm((f) => ({ ...f, priority: v as JobCardPriority }))
            }
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["Low", "Normal", "High", "Urgent"] as JobCardPriority[]).map(
                (p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {sectionLabel("Project Reference")}
      {/* Project Reference Photo (Section 1/2, see chat) — automatically
          resolved from the selected Project's own primary asset_photos
          row the moment a Project is picked, in Create as well as Edit.
          Purely informational: identifies "the product/project you are
          working on", never uploaded again here, never copied into the
          Job Card's own photos. Absent entirely when the Project has no
          photo — no broken image, no placeholder box. */}
      {form.projectId && formProjectPhotoUrl && (
        <div className="rounded-md border p-2 flex items-center gap-3">
          <img
            src={formProjectPhotoUrl}
            alt="Project reference"
            className="h-16 w-16 object-contain rounded border shrink-0"
            data-ocid="jobcards.form.project_photo"
          />
          <div className="text-xs text-muted-foreground">
            Project Reference Photo
            <br />
            Identifies the overall product — shown for reference only.
          </div>
        </div>
      )}

      {sectionLabel("Production Planning")}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Total Quantity</Label>
          <Input
            type="number"
            min="0"
            value={form.totalQuantity}
            onChange={(e) =>
              setForm((f) => ({ ...f, totalQuantity: e.target.value }))
            }
            placeholder="Overall required output"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Production Stage</Label>
          <Select
            value={form.stageId || "__none__"}
            onValueChange={(v) =>
              setForm((f) => ({ ...f, stageId: v === "__none__" ? "" : v }))
            }
            disabled={!form.projectId}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="No stage (ad-hoc)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No stage (ad-hoc)</SelectItem>
              {stagesForSelectedProject.map((s) => (
                <SelectItem key={s.stageId} value={s.stageId ?? ""}>
                  {s.stageName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Time per Piece (minutes) *</Label>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={form.standardTimePerUnitMinutes}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                standardTimePerUnitMinutes: e.target.value,
              }))
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Allocated Time (minutes) *</Label>
          <Input
            type="number"
            min="0"
            step="1"
            value={form.allocatedTimeMinutes}
            onChange={(e) =>
              setForm((f) => ({ ...f, allocatedTimeMinutes: e.target.value }))
            }
          />
        </div>
      </div>
      {/* Expected Quantity / Target (see chat) — effective value =
          override ?? automatic. Editable directly: typing a value sets
          the override and marks the field touched; the automatic
          calculation keeps running underneath (previewExpectedQty) so a
          later Standard/Allocated Time change is never lost — it just
          shows up as "auto value is now X" without clobbering what the
          user typed. */}
      <div className="rounded-md border bg-muted/30 px-3 py-2 space-y-1.5">
        <Label className="text-xs">Expected Quantity / Target</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min="0"
            className="h-8 w-28 font-mono"
            value={
              effectiveExpectedQty !== null ? String(effectiveExpectedQty) : ""
            }
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                expectedQuantityOverride: e.target.value,
                expectedQuantityTouched: true,
              }))
            }
          />
          <span className="text-xs text-muted-foreground">pieces</span>
          {form.expectedQuantityTouched &&
            form.expectedQuantityOverride !== "" && (
              <span className="text-[10px] text-muted-foreground italic">
                Edited target
              </span>
            )}
        </div>
        {autoValueChanged && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            Automatic value is now{" "}
            <span className="font-mono">{previewExpectedQty}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  expectedQuantityOverride: "",
                  expectedQuantityTouched: false,
                }))
              }
            >
              Use automatic value
            </Button>
          </div>
        )}
      </div>

      {sectionLabel("Work Instruction")}
      <div className="space-y-1">
        <Label className="text-xs">Job / Task *</Label>
        <Input
          value={form.jobDescription}
          onChange={(e) =>
            setForm((f) => ({ ...f, jobDescription: e.target.value }))
          }
          placeholder="e.g. Cut 3mm MS sheet to size"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Actual Completed Qty</Label>
          <Input
            type="number"
            min="0"
            value={form.actualCompletedQty}
            onChange={(e) =>
              setForm((f) => ({ ...f, actualCompletedQty: e.target.value }))
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Rejected Qty</Label>
          <Input
            type="number"
            min="0"
            value={form.rejectedQty}
            onChange={(e) =>
              setForm((f) => ({ ...f, rejectedQty: e.target.value }))
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Rework Qty</Label>
          <Input
            type="number"
            min="0"
            value={form.reworkQty}
            onChange={(e) =>
              setForm((f) => ({ ...f, reworkQty: e.target.value }))
            }
          />
        </div>
      </div>
      {/* Start/End Date-Time are deliberately not editable here — the
          server-authoritative timer (Start/Pause/Resume/Complete) owns
          them entirely. See the read-only Start/End/Active Time block in
          the View dialog below for the persisted values. */}
      <div className="space-y-1">
        <Label className="text-xs">Status</Label>
        <Select
          value={form.status}
          onValueChange={(v) =>
            setForm((f) => ({ ...f, status: v as JobCardStatus }))
          }
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STATUS_LABEL) as JobCardStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Notes</Label>
        <Textarea
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={2}
        />
      </div>

      {sectionLabel("Inspection Plan")}
      <InspectionPlanEditor
        rows={form.inspectionPlan}
        onChange={(rows) => setForm((f) => ({ ...f, inspectionPlan: rows }))}
      />

      {sectionLabel("Work Reference")}
      {/* Job Card print/layout (Sections 2/3/4/8, see chat) — Create and
          Edit consistency: the same configuration is available in both.
          Reference Photo/Drawing Link need a real job_cards.id to attach
          asset_photos/drawing_links rows to, so Create mode stages them
          locally (pendingReferencePhotoFile/pendingDrawingIds, flushed by
          handleSaveAdd right after the Job Card gets its real id — same
          pending-until-saved pattern Dies.tsx already uses for its own
          mandatory drawing link) while Edit mode writes them immediately
          through the existing AssetPhotoGallery/DrawingLinkPicker. */}
      <div className="space-y-3 rounded-md border p-3">
        <div className="space-y-1">
          <Label className="text-xs">
            Reference Photo
            <span className="text-muted-foreground font-normal">
              {" "}
              — the expected visual result for this operation, not an
              evidence/completion photo
            </span>
          </Label>
          {editCard ? (
            <>
              <AssetPhotoGallery
                ownerType="job_card"
                ownerId={editCard.id}
                canEdit={pEdit}
                excludeIds={referencePhotoExcludeIds}
                data-ocid="jobcards.form.reference_photo_gallery"
              />
              {(assetPhotos || []).filter(
                (p) =>
                  p.ownerType === "job_card" &&
                  p.ownerId === editCard.id &&
                  !referencePhotoExcludeIds.includes(p.id),
              ).length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(assetPhotos || [])
                    .filter(
                      (p) =>
                        p.ownerType === "job_card" &&
                        p.ownerId === editCard.id &&
                        !referencePhotoExcludeIds.includes(p.id),
                    )
                    .map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`text-xs rounded-md border px-2 py-1 ${
                          form.referencePhotoId === p.id
                            ? "border-primary bg-primary/10 font-semibold"
                            : "border-input"
                        }`}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            referencePhotoId:
                              f.referencePhotoId === p.id ? "" : p.id,
                          }))
                        }
                        data-ocid={`jobcards.form.reference_photo_select.${p.id}`}
                      >
                        {form.referencePhotoId === p.id ? "✓ " : ""}
                        {p.originalFilename ?? p.id.slice(0, 8)}
                      </button>
                    ))}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-1.5">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                id="jc-pending-reference-photo"
                className="hidden"
                onChange={handlePendingReferencePhotoSelect}
              />
              {pendingReferencePhotoPreviewUrl ? (
                <div className="flex items-center gap-2">
                  <img
                    src={pendingReferencePhotoPreviewUrl}
                    alt="Staged work reference"
                    className="h-16 w-16 object-contain rounded border"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={clearPendingReferencePhoto}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    document
                      .getElementById("jc-pending-reference-photo")
                      ?.click()
                  }
                  data-ocid="jobcards.form.pending_reference_photo_button"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Photo
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {sectionLabel("Engineering Drawing")}
      <div className="space-y-1.5 rounded-md border p-3">
        <Label className="text-xs">
          Drawing Link
          <span className="text-muted-foreground font-normal">
            {" "}
            — Drawing Repository is the source of truth
          </span>
        </Label>
        <DrawingLinkPicker
          linkedDrawingIds={currentLinkedDrawingIds}
          onAdd={handleAddDrawingLink}
          onRemove={handleRemoveDrawingLink}
          data-ocid="jobcards.form.drawing_link_picker"
        />
      </div>

      {sectionLabel("Print Options")}
      <div className="space-y-2 rounded-md border p-3">
        <div className="space-y-2">
          <Label className="text-xs">Print Reference Photo / Drawing</Label>
          <div className="flex items-center gap-2">
            <Checkbox
              id="jc-print-reference"
              checked={form.printReferencePhoto}
              disabled={
                editCard ? !form.referencePhotoId : !pendingReferencePhotoFile
              }
              onCheckedChange={(v) =>
                setForm((f) => ({ ...f, printReferencePhoto: v === true }))
              }
            />
            <Label htmlFor="jc-print-reference" className="text-xs font-normal">
              Print Reference Photo (adds a dedicated page)
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="jc-print-drawing"
              checked={form.printDrawing}
              disabled={currentLinkedDrawingIds.length === 0}
              onCheckedChange={(v) =>
                setForm((f) => ({ ...f, printDrawing: v === true }))
              }
            />
            <Label htmlFor="jc-print-drawing" className="text-xs font-normal">
              Print Drawing (adds the linked drawing as additional pages)
            </Label>
          </div>
        </div>
      </div>
    </div>
  );

  if (!canView(currentUser, "job_cards")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
          <ShieldOff className="w-8 h-8 text-destructive" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold">Access Restricted</h2>
          <p className="text-sm text-muted-foreground mt-1">
            You do not have permission to view this module.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-ocid="jobcards.page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Job Cards</h1>
          <p className="text-sm text-muted-foreground">
            {jobCards.length} job card{jobCards.length !== 1 ? "s" : ""} —
            employee-assigned, time-based work
          </p>
        </div>
        {pCreate && (
          <Button
            size="sm"
            onClick={openAdd}
            data-ocid="jobcards.primary_button"
          >
            <Plus className="w-4 h-4 mr-1" /> New Job Card
          </Button>
        )}
      </div>

      {pApprove && pendingExceptions.length > 0 && (
        <div
          className="rounded-lg border bg-warning/10 border-warning/30 p-4 space-y-3"
          data-ocid="jobcards.pending_exceptions"
        >
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            Pending Exceptions ({pendingExceptions.length})
          </h2>
          {pendingExceptions.map((e) => {
            const jc = jobCards.find((x) => x.id === e.jobCardId);
            return (
              <div
                key={e.id}
                className="flex items-start justify-between gap-3 rounded-md border bg-card p-3 text-sm"
                data-ocid={`jobcards.pending_exceptions.${e.id}`}
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {jc?.jobNo ?? "—"} — {REASON_LABEL[e.reasonType]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {jc?.employeeName ?? "Unknown employee"}
                    {jc && ` · ${jc.jobDescription}`}
                  </p>
                  {e.description && (
                    <p className="text-xs mt-1">{e.description}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={resolvingException}
                    onClick={() => resolveException(e.id, "rejected")}
                    data-ocid={`jobcards.pending_exceptions.${e.id}.reject`}
                  >
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    disabled={resolvingException}
                    onClick={() => resolveException(e.id, "approved")}
                    data-ocid={`jobcards.pending_exceptions.${e.id}.approve`}
                  >
                    Approve
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="table-wrapper">
        <div className="rounded-md border" data-ocid="jobcards.list.table">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-xs font-semibold">Job No</TableHead>
                <TableHead className="text-xs font-semibold">Project</TableHead>
                <TableHead className="text-xs font-semibold">
                  Employee
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Operation
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Expected
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Completed
                </TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="text-xs font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobCards.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center py-10 text-sm text-muted-foreground"
                    data-ocid="jobcards.list.empty_state"
                  >
                    No Job Cards yet. Click "New Job Card" to create one.
                  </TableCell>
                </TableRow>
              )}
              {jobCards.map((jc, i) => (
                <TableRow
                  key={jc.id}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => setViewCard(jc)}
                  data-ocid={`jobcards.item.${i + 1}`}
                >
                  <TableCell className="font-mono text-sm font-medium">
                    <span className="flex items-center gap-1.5">
                      <ClipboardList className="w-3.5 h-3.5 text-muted-foreground" />
                      {jc.jobNo}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {projectNo(jc.projectId)}
                  </TableCell>
                  <TableCell className="text-sm">{jc.employeeName}</TableCell>
                  <TableCell className="text-sm">{jc.operationType}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {jc.expectedQuantity}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {jc.actualCompletedQty}
                    {(jc.rejectedQty > 0 || jc.reworkQty > 0) && (
                      <span className="text-muted-foreground">
                        {" "}
                        ({jc.rejectedQty > 0 && `${jc.rejectedQty} rej.`}
                        {jc.rejectedQty > 0 && jc.reworkQty > 0 && ", "}
                        {jc.reworkQty > 0 && `${jc.reworkQty} rwk.`})
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge className={`text-xs ${statusCls(jc.status)}`}>
                        {STATUS_LABEL[jc.status]}
                      </Badge>
                      {/* Live timer glance right in the list — Admin
                          doesn't need to open the row to see it ticking. */}
                      {(jc.status === "InProgress" ||
                        jc.status === "OnHold") && (
                        <JobCardListTimerChip jc={jc} />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <RowActions
                        primary={
                          pEdit
                            ? [
                                {
                                  label: "Edit",
                                  icon: Pencil,
                                  onClick: () => openEdit(jc),
                                  "data-ocid": `jobcards.edit_button.${i + 1}`,
                                },
                              ]
                            : []
                        }
                        overflow={
                          pDelete
                            ? [
                                {
                                  label: "Delete",
                                  icon: Trash2,
                                  destructive: true,
                                  onClick: () => setDeleteTarget(jc),
                                  "data-ocid": `jobcards.delete_button.${i + 1}`,
                                },
                              ]
                            : []
                        }
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Add */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent
          className="max-w-lg max-h-[90vh] overflow-y-auto"
          data-ocid="jobcards.add.dialog"
        >
          <DialogHeader>
            <DialogTitle>New Job Card</DialogTitle>
          </DialogHeader>
          {formFields}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isSaving}
              onClick={handleSaveAdd}
              data-ocid="jobcards.add.submit_button"
            >
              {isSaving ? "Saving…" : "Create Job Card"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog
        open={!!editCard}
        onOpenChange={(o) => {
          if (!o) setEditCard(null);
        }}
      >
        <DialogContent
          className="max-w-lg max-h-[90vh] overflow-y-auto"
          data-ocid="jobcards.edit.dialog"
        >
          <DialogHeader>
            <DialogTitle>Edit {editCard?.jobNo}</DialogTitle>
          </DialogHeader>
          {formFields}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditCard(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isSaving}
              onClick={handleSaveEdit}
              data-ocid="jobcards.edit.submit_button"
            >
              {isSaving ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View detail */}
      <Dialog
        open={!!viewCard}
        onOpenChange={(o) => {
          if (!o) setViewCard(null);
        }}
      >
        <DialogContent className="max-w-md" data-ocid="jobcards.view.dialog">
          {viewCard && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-2">
                  <DialogTitle>{viewCard.jobNo}</DialogTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setViewCard(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </DialogHeader>
              {/* Project Reference Photo — small, identifies the
                  product/project (Section 1, see chat), not an evidence
                  photo. Entirely absent when the Project has no photo —
                  no empty/broken image, no space-consuming placeholder. */}
              {viewProjectPhotoUrl && (
                <img
                  src={viewProjectPhotoUrl}
                  alt="Project reference"
                  className="w-full max-h-32 object-contain rounded-md border"
                  data-ocid="jobcards.view.project_photo"
                />
              )}
              {/* Feature: Printable Job Card — physical/paper copy for a
                  shop-floor employee without a phone/login. Reuses this
                  exact Job Card's own data; nothing here writes to it. */}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => handlePrintJobCard(viewCard)}
                data-ocid="jobcards.view.print_button"
              >
                <Printer className="w-4 h-4 mr-2" /> Print Job Card
              </Button>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Project</p>
                    {onViewProject ? (
                      <button
                        type="button"
                        className="font-mono hover:underline text-left"
                        onClick={() => onViewProject(viewCard.projectId)}
                        data-ocid="jobcards.view.project_link"
                      >
                        {projectNo(viewCard.projectId)}
                      </button>
                    ) : (
                      <p className="font-mono">
                        {projectNo(viewCard.projectId)}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Employee</p>
                    <p>{viewCard.employeeName}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Job / Task</p>
                  <p>{viewCard.jobDescription}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Operation Type
                    </p>
                    <p>{viewCard.operationType}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Production Stage
                    </p>
                    <p>{stageName(viewCard.stageId) ?? "Ad-hoc (no stage)"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge className={`text-xs ${statusCls(viewCard.status)}`}>
                      {STATUS_LABEL[viewCard.status]}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/30 p-2.5">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Standard Time / Unit
                    </p>
                    <p className="font-mono">
                      {viewCard.standardTimePerUnitMinutes} min
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Allocated Time
                    </p>
                    <p className="font-mono">
                      {viewCard.allocatedTimeMinutes} min
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Expected Quantity
                    </p>
                    <p className="font-mono font-semibold">
                      {viewCard.expectedQuantity} pcs
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Actual Time Spent
                    </p>
                    <p className="font-mono">
                      {viewCard.actualTimeSpentMinutes != null
                        ? `${viewCard.actualTimeSpentMinutes} min`
                        : "—"}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Completed</p>
                    <p className="font-mono">{viewCard.actualCompletedQty}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Rejected</p>
                    <p className="font-mono text-destructive">
                      {viewCard.rejectedQty}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Rework</p>
                    <p className="font-mono text-warning">
                      {viewCard.reworkQty}
                    </p>
                  </div>
                </div>
                {viewCard.notes && (
                  <div>
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p>{viewCard.notes}</p>
                  </div>
                )}
                {/* Persisted timer timestamps — server-set only, never a
                    form field (see JobCardTimerPanel below for the
                    Start/Pause/Resume/Complete controls that set them).
                    Reopening this dialog after a reload always reads
                    these straight from the database row. */}
                <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted/30 p-2.5">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Start Date &amp; Time
                    </p>
                    <p className="text-xs font-medium">
                      {viewCard.startTime
                        ? formatJobCardTimestamp(viewCard.startTime)
                        : "Not started yet"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      End Date &amp; Time
                    </p>
                    <p className="text-xs font-medium">
                      {viewCard.endTime
                        ? formatJobCardTimestamp(viewCard.endTime)
                        : "Not completed yet"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Active Time</p>
                    <p className="text-xs font-mono font-semibold">
                      {viewCardActiveTime}
                    </p>
                  </div>
                </div>
                <JobCardTimerPanel
                  jobCard={viewCard}
                  canEdit={pEdit}
                  canPause={pApprove}
                  onStart={() => handleStart(viewCard)}
                  onPause={() => handlePause(viewCard)}
                  onResume={() => handleResume(viewCard)}
                  onComplete={() => setCompleteOpen(true)}
                  isSaving={isSaving}
                  dataOcidPrefix="jobcards.view.timer"
                />
              </div>
              <DialogFooter>
                {pEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      openEdit(viewCard);
                      setViewCard(null);
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {viewCard && (
        <CompleteJobCardDialog
          job={viewCard}
          open={completeOpen}
          onOpenChange={setCompleteOpen}
          evidenceRequired={evidencePolicy.job_card_completion === true}
          requirePhotoOnReject={evidencePolicy.quality_rejection === true}
          onSaved={(jc) => {
            updateJobCard(jc);
            setViewCard(jc);
            setCompleteOpen(false);
          }}
          dataOcidPrefix="jobcards.complete"
        />
      )}

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
        title="Delete Job Card"
        description={`Job Card "${deleteTarget?.jobNo}"`}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

// Tiny live-ticking chip for the list row — full status/actions live in
// the JobCardTimerPanel inside the View dialog; this is just the
// "visible without opening the row" glance.
function JobCardListTimerChip({ jc }: { jc: JobCard }) {
  const { formatted } = useJobCardTimer(jc);
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded ${
        jc.status === "InProgress"
          ? "bg-success/10 text-success"
          : "bg-warning/15 text-warning"
      }`}
    >
      {jc.status === "InProgress" ? "⏱" : "⏸"} {formatted}
    </span>
  );
}

// Inspection Plan row editor (Section 7, see chat) — fully freeform:
// add/remove/edit any number of rows, no hard-coded default rows, not
// connected to project_qms_inspections. Empty array is a valid, common
// state (nothing configured — the print renderer omits the section
// entirely rather than showing an empty table).
function InspectionPlanEditor({
  rows,
  onChange,
}: {
  rows: JobCardInspectionCheckpoint[];
  onChange: (rows: JobCardInspectionCheckpoint[]) => void;
}) {
  const addRow = () => {
    onChange([
      ...rows,
      {
        id: `insp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label: "",
        triggerQty: 0,
        cumulativeQty: 0,
        sampleQty: 0,
      },
    ]);
  };
  const removeRow = (id: string) => onChange(rows.filter((r) => r.id !== id));
  const patchRow = (id: string, patch: Partial<JobCardInspectionCheckpoint>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-2 rounded-md border p-3">
      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No inspection checkpoints configured. Not printed if left empty.
        </p>
      )}
      {rows.map((row, i) => (
        <div
          key={row.id}
          className="grid grid-cols-2 gap-1.5 items-end sm:grid-cols-[1fr_5rem_5rem_5rem_auto]"
        >
          <div className="col-span-2 space-y-1 sm:col-span-1">
            {i === 0 && <Label className="text-[10px]">Label</Label>}
            <Input
              className="h-8 text-xs"
              value={row.label}
              onChange={(e) => patchRow(row.id, { label: e.target.value })}
              placeholder="e.g. First off"
              data-ocid={`jobcards.form.inspection_plan.${i}.label`}
            />
          </div>
          <div className="space-y-1">
            {i === 0 && <Label className="text-[10px]">Trigger Qty</Label>}
            <Input
              type="number"
              min="0"
              className="h-8 text-xs"
              value={row.triggerQty}
              onChange={(e) =>
                patchRow(row.id, {
                  triggerQty: Number.parseInt(e.target.value, 10) || 0,
                })
              }
            />
          </div>
          <div className="space-y-1">
            {i === 0 && <Label className="text-[10px]">Cumulative Qty</Label>}
            <Input
              type="number"
              min="0"
              className="h-8 text-xs"
              value={row.cumulativeQty}
              onChange={(e) =>
                patchRow(row.id, {
                  cumulativeQty: Number.parseInt(e.target.value, 10) || 0,
                })
              }
            />
          </div>
          <div className="space-y-1">
            {i === 0 && <Label className="text-[10px]">Sample Qty</Label>}
            <Input
              type="number"
              min="0"
              className="h-8 text-xs"
              value={row.sampleQty}
              onChange={(e) =>
                patchRow(row.id, {
                  sampleQty: Number.parseInt(e.target.value, 10) || 0,
                })
              }
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => removeRow(row.id)}
            data-ocid={`jobcards.form.inspection_plan.${i}.remove`}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addRow}
        data-ocid="jobcards.form.inspection_plan.add"
      >
        <Plus className="w-3.5 h-3.5 mr-1" /> Add Inspection
      </Button>
    </div>
  );
}
