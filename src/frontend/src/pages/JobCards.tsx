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
import {
  getDrawingPdfBlob,
  getViewsForDrawing,
} from "@/drawingEditor/api/drawings";
import { findWorkingDrawing } from "@/drawingEditor/lib/drawingTree";
import { loadPdf, renderPageToCanvas } from "@/drawingEditor/lib/pdfRenderer";
import {
  composeAllPageViews,
  composeOntoA4Page,
} from "@/drawingEditor/lib/workOrderPreview";
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
import {
  getCompletedJobCardDocumentSignedUrl,
  removeCompletedJobCardDocument,
  uploadCompletedJobCardDocument,
  validateCompletedJobCardDocumentFile,
} from "../lib/completedJobCardDocumentApi";
import { JobCardDocContent } from "../lib/documentRenderers";
import {
  addManualCheckpoint,
  getCheckpointStatus,
  mergeAutomaticPoints,
  reconcileFinalCheckpoint,
  relabelCheckpoints,
} from "../lib/jobCardCheckpoints";
import { setJobCardExceptionStatusRemote } from "../lib/jobCardExceptionsApi";
import type { WriteResult } from "../lib/jobCardsApi";
import {
  computeNextJobNo,
  createJobCardRemote,
  deleteJobCardRemote,
  fetchJobCardInspectionEvents,
  pauseJobCardRemote,
  recordJobCardInspectionEvent,
  resumeJobCardRemote,
  startJobCardRemote,
  updateJobCardProductionProgress,
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
  JobCardInspectionEvent,
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

// Rasterizes an image Blob onto a canvas so it can go through
// composeOntoA4Page the same way a rendered PDF page does (see chat,
// "compose all drawings cleanly on A4") — an image drawing needs the
// same proportional-fit treatment a PDF page gets, not just an
// unconstrained <img>.
function blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")?.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

// "To Be Fulfilled" fulfillment check (see chat) — the exact same
// predicate the Edit form's own reminder already used (Assigned By/
// In-Process Check/QC Approved By all set), extracted so the list/View
// dialog can show the same reminder next to a Job Card's identity
// instead of inside the Create form, without duplicating the rule.
// Status only, never validation — these three fields stay optional.
function needsSignOffFulfillment(
  jc: Pick<
    JobCard,
    | "assignedByEmployeeId"
    | "inProcessCheckEmployeeId"
    | "qcApprovedByEmployeeId"
  >,
): boolean {
  return !(
    jc.assignedByEmployeeId &&
    jc.inProcessCheckEmployeeId &&
    jc.qcApprovedByEmployeeId
  );
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
  priority: "Normal" as JobCardPriority,
  startDate: "",
  // Job Card Inspection Checkpoint Execution + Sign-off (see chat,
  // database/20260917180000). Inspection events are NOT a form field at
  // all (never were, in the corrected design) — they live in the real
  // child table job_card_inspection_events, fetched separately (see
  // viewCardEvents state) and written via recordJobCardInspectionEvent,
  // never through this form's save payload. completedDocument* are
  // similarly never edited through this form directly (upload-driven —
  // see the Completed Job Card upload section) but the writable payload
  // still needs to carry the CURRENT value through unchanged on every
  // save. preparedBy* is likewise never a form field — set once,
  // automatically, from the authenticated session in handleSaveAdd.
  preparedById: "",
  preparedByName: "",
  assignedByEmployeeId: "",
  assignedByEmployeeName: "",
  inProcessCheckEmployeeId: "",
  inProcessCheckEmployeeName: "",
  qcApprovedByEmployeeId: "",
  qcApprovedByEmployeeName: "",
  completedDocumentStoragePath: "",
  completedDocumentFilename: "",
  completedDocumentMimeType: "",
  completedDocumentSizeBytes: undefined as number | undefined,
  completedDocumentUploadedBy: "",
  completedDocumentUploadedByName: "",
  completedDocumentUploadedAt: undefined as number | undefined,
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
  // Create-mode preview enlargement (see chat, "Reference Photo should
  // use Project Photo workflow") — AssetPhotoGallery's own preview
  // dialog operates on a persisted AssetPhoto row (photo.id), which a
  // staged pre-save File genuinely doesn't have yet, so it can't be
  // reused directly here. This is the smallest safe adapter: the same
  // enlarge-on-click affordance, built from the same Dialog primitive
  // already used throughout this file, with none of the AI/cover-variant
  // actions that require a real row — those become available the moment
  // Create flushes this file into a real asset_photos row and the user
  // reopens Edit, which already renders the full AssetPhotoGallery.
  const [
    pendingReferencePhotoPreviewOpen,
    setPendingReferencePhotoPreviewOpen,
  ] = useState(false);
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

  // Inspection Checkpoint Execution + Production Progress + Completed
  // Document (see chat, Parts 4-5/12-13, database/20260917180000) — all
  // View-dialog-only state, reset whenever viewCard changes (see the
  // reset effect below) so reopening a different Job Card never carries
  // over a half-filled inspect/upload form from the previous one.
  const [recordingCheckpointId, setRecordingCheckpointId] = useState<
    string | null
  >(null);
  const [checkpointRemarks, setCheckpointRemarks] = useState("");
  const [savingCheckpoint, setSavingCheckpoint] = useState(false);
  const [progressInput, setProgressInput] = useState("");
  const [savingProgress, setSavingProgress] = useState(false);
  const [savingDocument, setSavingDocument] = useState(false);
  const [completedDocSignedUrl, setCompletedDocSignedUrl] = useState<
    string | null
  >(null);
  // The View dialog's own copy of this Job Card's inspection events —
  // fetched separately from job_card_inspection_events (see chat,
  // database/20260917180000), never embedded on JobCard itself. A
  // successful recordJobCardInspectionEvent() appends its one new row
  // here directly (no need to refetch the whole list — an INSERT can't
  // conflict with anything already loaded).
  const [viewCardEvents, setViewCardEvents] = useState<
    JobCardInspectionEvent[]
  >([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the OPEN card changes, not on every field of it
  useEffect(() => {
    setRecordingCheckpointId(null);
    setCheckpointRemarks("");
    setProgressInput(viewCard ? String(viewCard.actualCompletedQty ?? 0) : "");
    setCompletedDocSignedUrl(null);
    setViewCardEvents([]);
    if (viewCard?.completedDocumentStoragePath) {
      getCompletedJobCardDocumentSignedUrl(
        viewCard.completedDocumentStoragePath,
      ).then(setCompletedDocSignedUrl);
    }
    if (viewCard) {
      fetchJobCardInspectionEvents(viewCard.id).then(setViewCardEvents);
    }
  }, [viewCard?.id]);

  async function handleRecordCheckpoint(
    checkpoint: JobCardInspectionCheckpoint,
    result: "Pass" | "Fail",
  ) {
    if (!viewCard || savingCheckpoint) return;
    setSavingCheckpoint(true);
    try {
      const res = await recordJobCardInspectionEvent(viewCard.id, {
        checkpointId: checkpoint.id,
        checkpointLabel: checkpoint.label,
        checkpointQty: checkpoint.cumulativeQty,
        source: checkpoint.source,
        result,
        inspectedBy: currentUser?.id,
        inspectedByName: currentUser?.username,
        remarks: checkpointRemarks.trim() || undefined,
      });
      if (res.status === "unauthenticated") {
        toast.error("Not signed in — inspection was not recorded.");
        return;
      }
      if (res.status === "denied" || res.status === "error") {
        toast.error(res.error ?? "Could not record inspection");
        return;
      }
      if (!res.data) return;
      // Append locally — a successful INSERT can't conflict with
      // anything already loaded, so there's no need to refetch the
      // whole list (see chat, database/20260917180000).
      setViewCardEvents((prev) => [
        ...prev,
        res.data as JobCardInspectionEvent,
      ]);
      setRecordingCheckpointId(null);
      setCheckpointRemarks("");
      toast.success(`${checkpoint.label}: ${result}`);
    } finally {
      setSavingCheckpoint(false);
    }
  }

  async function handleSaveProgress() {
    if (!viewCard || savingProgress) return;
    const qty = Number.parseInt(progressInput, 10);
    if (Number.isNaN(qty) || qty < 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    setSavingProgress(true);
    try {
      const res = await updateJobCardProductionProgress(viewCard.id, qty);
      if (res.status === "unauthenticated") {
        toast.error("Not signed in — progress was not saved.");
        return;
      }
      if (res.status === "denied" || res.status === "error") {
        toast.error(res.error ?? "Could not update progress");
        return;
      }
      if (!res.data) return;
      updateJobCard(res.data);
      setViewCard(res.data);
      toast.success("Production progress updated");
    } finally {
      setSavingProgress(false);
    }
  }

  async function handleUploadCompletedDocument(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !viewCard || savingDocument) return;
    const validation = validateCompletedJobCardDocumentFile(file);
    if (!validation.ok) {
      toast.error(validation.reason);
      return;
    }
    setSavingDocument(true);
    try {
      const res = await uploadCompletedJobCardDocument(
        viewCard.id,
        file,
        currentUser?.username || "Unknown",
        viewCard.completedDocumentStoragePath,
      );
      if (res.status === "unauthenticated") {
        toast.error("Not signed in — file was not uploaded.");
        return;
      }
      if (res.status === "denied" || res.status === "error") {
        toast.error(res.error ?? "Could not upload file");
        return;
      }
      if (!res.data) return;
      updateJobCard(res.data);
      setViewCard(res.data);
      toast.success("Completed Job Card uploaded");
    } finally {
      setSavingDocument(false);
    }
  }

  async function handleRemoveCompletedDocument() {
    if (!viewCard || !viewCard.completedDocumentStoragePath || savingDocument)
      return;
    setSavingDocument(true);
    try {
      const res = await removeCompletedJobCardDocument(
        viewCard.id,
        viewCard.completedDocumentStoragePath,
      );
      if (res.status === "unauthenticated") {
        toast.error("Not signed in — file was not removed.");
        return;
      }
      if (res.status === "denied" || res.status === "error") {
        toast.error(res.error ?? "Could not remove file");
        return;
      }
      if (!res.data) return;
      updateJobCard(res.data);
      setViewCard(res.data);
      toast.success("Completed Job Card removed");
    } finally {
      setSavingDocument(false);
    }
  }

  useEffect(() => {
    if (!highlightJobCardId) return;
    const match = jobCards.find((jc) => jc.id === highlightJobCardId);
    if (match) setViewCard(match);
  }, [highlightJobCardId, jobCards]);

  // Final Inspection reconciliation (see chat, Part 6/16) — runs
  // whenever Total Quantity changes, ensuring exactly one checkpoint
  // sits at totalQuantity, auto-labeled "Final Inspection" and
  // non-deletable. Converts an existing manual/automatic checkpoint at
  // that exact quantity in place rather than duplicating it. A quantity
  // CHANGE never discards any OTHER checkpoint's configuration or
  // history (see Part 16) — it only ever adds/updates the one Final row.
  // Deliberately keyed on form.totalQuantity only — including
  // form.inspectionPlan in the deps would re-run this on every manual
  // add/remove/edit too, fighting those actions instead of only
  // reacting to the Total Quantity itself changing.
  useEffect(() => {
    const totalQuantity =
      form.totalQuantity !== ""
        ? Number.parseInt(form.totalQuantity, 10)
        : undefined;
    setForm((f) => {
      const reconciled = reconcileFinalCheckpoint(
        f.inspectionPlan,
        totalQuantity,
      );
      const changed =
        reconciled.length !== f.inspectionPlan.length ||
        reconciled.some(
          (r, i) =>
            r.label !== f.inspectionPlan[i]?.label ||
            r.source !== f.inspectionPlan[i]?.source ||
            r.cumulativeQty !== f.inspectionPlan[i]?.cumulativeQty,
        );
      return changed ? { ...f, inspectionPlan: reconciled } : f;
    });
  }, [form.totalQuantity]);

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
      priority: jc.priority ?? "Normal",
      startDate: jc.startDate ?? "",
      // Carried through unchanged, never edited by this form (see their
      // own emptyForm comment) — completedDocument*/preparedBy* must
      // survive a save untouched. inspectionEvents is not a form field
      // at all (see viewCardEvents state, fetched separately).
      preparedById: jc.preparedById ?? "",
      preparedByName: jc.preparedByName ?? "",
      assignedByEmployeeId: jc.assignedByEmployeeId ?? "",
      assignedByEmployeeName: jc.assignedByEmployeeName ?? "",
      inProcessCheckEmployeeId: jc.inProcessCheckEmployeeId ?? "",
      inProcessCheckEmployeeName: jc.inProcessCheckEmployeeName ?? "",
      qcApprovedByEmployeeId: jc.qcApprovedByEmployeeId ?? "",
      qcApprovedByEmployeeName: jc.qcApprovedByEmployeeName ?? "",
      completedDocumentStoragePath: jc.completedDocumentStoragePath ?? "",
      completedDocumentFilename: jc.completedDocumentFilename ?? "",
      completedDocumentMimeType: jc.completedDocumentMimeType ?? "",
      completedDocumentSizeBytes: jc.completedDocumentSizeBytes,
      completedDocumentUploadedBy: jc.completedDocumentUploadedBy ?? "",
      completedDocumentUploadedByName: jc.completedDocumentUploadedByName ?? "",
      completedDocumentUploadedAt: jc.completedDocumentUploadedAt,
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
    // Job Card print/layout (see chat) — resolves THREE independent,
    // optional images, all BEFORE the synchronous flushSync render below
    // (an <img> written into a popup via innerHTML has no chance to
    // await anything itself, same reasoning settings.companyLogo is
    // already ready-to-use by the time it reaches JobCardDocContent):
    //
    // 1. Project Reference Photo — always resolved when the Project has
    //    one (Page 1, large, right side of the upper band); never
    //    duplicated into the Job Card's own asset_photos. Found directly
    //    here (not via the shared resolveProjectPhotoUrl) because the
    //    print layout also needs the photo's own caption, which that
    //    shared resolver's other two callers (Create/Edit form, View
    //    dialog) don't need.
    const projectPhoto = (assetPhotos || []).find(
      (p) =>
        p.ownerType === "project" && p.ownerId === jc.projectId && p.isPrimary,
    );
    const projectPhotoUrl = projectPhoto
      ? await getAssetPhotoSignedUrl(resolveCoverStoragePath(projectPhoto))
      : null;
    const projectPhotoCaption =
      projectPhoto?.caption || projectPhoto?.originalFilename || undefined;

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

    // 3. Linked Drawing(s) — reuses the Drawing Editor's own existing
    //    composeAllPageViews (one composed image PER PAGE of each
    //    drawing, no second drawing renderer, no duplicated drawing
    //    data), same Original -> Working Drawing resolution
    //    DrawingEditorPage.tsx's own handlePrintDrawing performs before
    //    printing. Only attempted when printDrawing is on AND at least
    //    one link exists; a drawing that was never saved (no views at
    //    all) just contributes zero pages, not an error. Title/number/
    //    revision are read straight off each drawing's own first page's
    //    title block (partName/partNo/revision) — the same fields
    //    already baked into its composed page images — so each printed
    //    drawing page heading shows its real identity instead of a
    //    generic label.
    //
    //    BUG FIX #1 (see chat, "linked drawings not printing") — the
    //    Drawing Repository's own `drawings` list is only ever loaded by
    //    DrawingLinkPicker's own mount effect, which only mounts while
    //    the Create/Edit form is open. Printing from the View dialog
    //    (the normal path — a user opens a Job Card, clicks Print,
    //    having never opened Edit this session) read
    //    useDrawingEditorStore.getState().drawings while it was still
    //    the empty initial array, so every drawing lookup below always
    //    silently failed. Load on demand here so printing never depends
    //    on which dialogs happened to be opened first.
    //
    //    BUG FIX #2 — a Job Card can have MULTIPLE linked drawings (the
    //    same DrawingLinkPicker used elsewhere always supported this;
    //    linkedDrawingIds is an array). The previous code only ever
    //    resolved the FIRST link found, silently dropping every other
    //    linked drawing. All matching links are now resolved and
    //    printed, in link order.
    const drawingSheets: {
      url: string;
      title?: string;
      number?: string;
      revision?: string;
      sheetIndex: number;
      sheetCount: number;
    }[] = [];
    if (jc.printDrawing) {
      const store = useDrawingEditorStore.getState();
      if (!store.loaded) await store.loadDrawings();
      const allDrawings = useDrawingEditorStore.getState().drawings || [];
      const links = (drawingLinks || []).filter(
        (l) => l.linkedType === "job_card" && l.linkedId === jc.id,
      );
      for (const link of links) {
        const drawing = allDrawings.find((d) => d.id === link.drawingId);
        if (!drawing) continue;
        const working = findWorkingDrawing(drawing.id, allDrawings);
        const target = working ?? drawing;

        // 1. Preferred path — the engineered, title-blocked output from
        //    a saved drawing_views row (crop + annotations + title
        //    block), exactly as before.
        const canvases = await composeAllPageViews(target, {
          companyName: settings.companyName || "Your Company",
          companyLogoDataUrl: settings.companyLogo || undefined,
        });

        let pageUrls: string[];
        let title: string | undefined;
        let number: string | undefined;
        let revision: string | undefined;

        if (canvases.length > 0) {
          pageUrls = canvases.map((c) => c.toDataURL("image/png"));
          const views = await getViewsForDrawing(target.id);
          const firstPageView = [...views].sort(
            (a, b) => a.pageNumber - b.pageNumber,
          )[0];
          title = firstPageView?.titleBlock.partName || undefined;
          number = firstPageView?.titleBlock.partNo || undefined;
          revision = firstPageView?.titleBlock.revision || undefined;
        } else {
          // 2. Fallback — a drawing linked straight from Project Design
          //    Files/Drawing Repository Search that's never been opened
          //    in the Editor has no saved view at all (see chat, "linked
          //    drawings not printing" — this is the actual majority
          //    case for a normally-attached drawing, not an edge case).
          //    Reuses the SAME utilities DesignFilePreviewDialog/
          //    handlePreviewOriginal already use to show a pristine
          //    original: getDrawingPdfBlob (private-bucket download, no
          //    signed URL, no duplicated file) + loadPdf/
          //    renderPageToCanvas (the exact pair buildThumbnails uses
          //    to rasterize every page of a PDF). No title block exists
          //    for an unedited original, so the fallback title is just
          //    the drawing's own fileName — number/revision stay
          //    undefined (nothing to preserve that was never set).
          //    DXF originals are not rasterizable this way and are
          //    skipped (pageUrls stays empty) rather than producing a
          //    blank page.
          pageUrls = [];
          title = drawing.fileName;
          try {
            const blob = target.pdfBlob ?? (await getDrawingPdfBlob(target.id));
            if (target.sourceKind === "image") {
              const imgCanvas = await blobToCanvas(blob);
              pageUrls = [composeOntoA4Page(imgCanvas).toDataURL("image/png")];
            } else if (target.sourceKind !== "dxf") {
              // Absent sourceKind means "pdf" (pre-Phase-34 rows), same
              // convention DrawingDocument.sourceKind's own doc comment
              // establishes.
              const pdf = await loadPdf(blob);
              for (let p = 1; p <= pdf.numPages; p++) {
                const page = await pdf.getPage(p);
                const rawCanvas = document.createElement("canvas");
                await renderPageToCanvas(page, rawCanvas, 2);
                // Composed onto a fixed A4 portrait page (see chat,
                // "compose all drawings cleanly on A4") — a source PDF
                // page can be any sheet size/orientation (A1-A4,
                // portrait or landscape); this fits it proportionally
                // inside a consistent printable rectangle instead of
                // letting the raw page dimensions dictate how large or
                // small it prints relative to the rest of the document.
                pageUrls.push(
                  composeOntoA4Page(rawCanvas).toDataURL("image/png"),
                );
              }
            }
          } catch {
            // Original file missing/unreadable — contributes zero
            // pages, same as "never saved", never a print-blocking
            // error for the rest of the Job Card.
            pageUrls = [];
          }
        }

        if (pageUrls.length === 0) continue;
        pageUrls.forEach((url, idx) => {
          drawingSheets.push({
            url,
            title,
            number,
            revision,
            sheetIndex: idx + 1,
            sheetCount: pageUrls.length,
          });
        });
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
    // Page 1 (Job Card core) + Work Reference (if included) + one page
    // per composed drawing sheet, across every linked drawing (if
    // included) — computed here since this is the one place that
    // already knows the final resolved state of all three.
    const totalPages = 1 + (referencePhotoUrl ? 1 : 0) + drawingSheets.length;
    const project = projects.find((p) => p.id === jc.projectId);
    flushSync(() => {
      root.render(
        <JobCardDocContent
          id={docId}
          jobCard={jc}
          projectCode={project?.projectNo || "—"}
          projectName={project?.projectName || "—"}
          settings={settings as unknown as Record<string, string>}
          printedAt={printedAt}
          totalPages={totalPages}
          projectPhotoUrl={projectPhotoUrl ?? undefined}
          projectPhotoCaption={projectPhotoCaption}
          referencePhotoUrl={referencePhotoUrl ?? undefined}
          drawingSheets={drawingSheets.length > 0 ? drawingSheets : undefined}
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
    priority: form.priority,
    startDate: form.startDate || undefined,
  });

  // Sign-off fields payload (see chat, Part 9, database/20260917180000)
  // — shared the same way. preparedById/preparedByName are NOT here:
  // they're set exactly once, automatically, in handleSaveAdd from the
  // authenticated session, and passed straight through unchanged from
  // `form` (populated by openEdit from the existing Job Card) in
  // handleSaveEdit — this form never lets the user type/select them.
  const signOffFieldsPayload = () => ({
    assignedByEmployeeId: form.assignedByEmployeeId || undefined,
    assignedByEmployeeName: form.assignedByEmployeeName || undefined,
    inProcessCheckEmployeeId: form.inProcessCheckEmployeeId || undefined,
    inProcessCheckEmployeeName: form.inProcessCheckEmployeeName || undefined,
    qcApprovedByEmployeeId: form.qcApprovedByEmployeeId || undefined,
    qcApprovedByEmployeeName: form.qcApprovedByEmployeeName || undefined,
  });

  // Carried through unchanged on every save (see their own emptyForm
  // comment) — never edited by this form. Create always starts with
  // none of these; Edit passes through what openEdit populated from the
  // existing Job Card.
  const passthroughFieldsPayload = () => ({
    completedDocumentStoragePath:
      form.completedDocumentStoragePath || undefined,
    completedDocumentFilename: form.completedDocumentFilename || undefined,
    completedDocumentMimeType: form.completedDocumentMimeType || undefined,
    completedDocumentSizeBytes: form.completedDocumentSizeBytes,
    completedDocumentUploadedBy: form.completedDocumentUploadedBy || undefined,
    completedDocumentUploadedByName:
      form.completedDocumentUploadedByName || undefined,
    completedDocumentUploadedAt: form.completedDocumentUploadedAt,
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
          ...signOffFieldsPayload(),
          ...passthroughFieldsPayload(),
          // Prepared By (see chat, Part 9) — automatically the
          // authenticated user creating this Job Card, never a manual
          // selection. Set exactly once, here, at creation.
          preparedById: currentUser?.id || undefined,
          preparedByName: currentUser?.username || undefined,
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
      // Option A (see chat, "Reference Photo should use Project Photo
      // workflow") — a staged Reference Photo has no AI/background-
      // editing available yet (requestAssetPhotoProcessing needs a real
      // asset_photos.id, which doesn't exist until the flush below
      // succeeds). Rather than build a second, pre-save-capable
      // processing path, the smallest safe fix is continuing straight
      // into the EXISTING Edit flow — the exact same AssetPhotoGallery
      // Edit already renders — the moment a real, persisted photo
      // exists. Only set true once the photo has actually been
      // uploaded AND linked; a failed attach must never open Edit as
      // though the workflow completed (the existing error toast below,
      // "You can retry from Edit," already tells the user how to finish
      // manually in that case).
      const hadPendingReferencePhoto = !!pendingReferencePhotoFile;
      let referencePhotoAttached = false;

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
              priority: created.priority,
              startDate: created.startDate,
              preparedById: created.preparedById,
              preparedByName: created.preparedByName,
              assignedByEmployeeId: created.assignedByEmployeeId,
              assignedByEmployeeName: created.assignedByEmployeeName,
              inProcessCheckEmployeeId: created.inProcessCheckEmployeeId,
              inProcessCheckEmployeeName: created.inProcessCheckEmployeeName,
              qcApprovedByEmployeeId: created.qcApprovedByEmployeeId,
              qcApprovedByEmployeeName: created.qcApprovedByEmployeeName,
              completedDocumentStoragePath:
                created.completedDocumentStoragePath,
              completedDocumentFilename: created.completedDocumentFilename,
              completedDocumentMimeType: created.completedDocumentMimeType,
              completedDocumentSizeBytes: created.completedDocumentSizeBytes,
              completedDocumentUploadedBy: created.completedDocumentUploadedBy,
              completedDocumentUploadedByName:
                created.completedDocumentUploadedByName,
              completedDocumentUploadedAt: created.completedDocumentUploadedAt,
            });
            if (patched.status === "success" && patched.data) {
              created = patched.data;
              updateJobCard(created);
              referencePhotoAttached = true;
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

      // Option A transition (see chat) — only once the Reference Photo
      // has genuinely been persisted (uploaded AND linked to this Job
      // Card); a failed/absent attach falls through to the ordinary
      // "just created" state, exactly as before this change, with the
      // error toast above (when applicable) already telling the user
      // they can finish from Edit themselves. openEdit(created) is the
      // SAME function every existing "Edit" click already calls — no
      // new dialog, no new AssetPhotoGallery usage, just reached
      // automatically instead of requiring a manual click.
      if (hadPendingReferencePhoto && referencePhotoAttached) {
        openEdit(created);
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
        ...signOffFieldsPayload(),
        ...passthroughFieldsPayload(),
        // Prepared By is immutable once set — always carried through
        // from the existing Job Card (openEdit populated `form` with
        // it), never re-derived from the CURRENT session (editing a
        // card someone else prepared must not silently reassign it).
        preparedById: form.preparedById || undefined,
        preparedByName: form.preparedByName || undefined,
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
          <Label className="text-xs">Employee *</Label>
          <EmployeeSelect
            value={form.employeeId}
            onChange={(id) => setForm((f) => ({ ...f, employeeId: id }))}
            className="w-full"
          />
        </div>
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
          {/* "To Be Fulfilled" reminder (see chat) — Edit-only. A brand
              new Job Card trivially has all three fields blank, so
              showing this in the Create flow is never useful — it's
              purely a calculated hint, once the Job Card exists, that a
              supervisor can glance at while editing. Never validation:
              Assigned By/In-Process Check/QC Approved By stay optional
              and this never blocks Create or Save either way. The same
              reminder now also shows beside the Job Card's own number
              wherever Job Cards are listed/identified (list rows, View
              dialog) — see needsSignOffFulfillment. */}
          {editCard &&
            (needsSignOffFulfillment(form) ? (
              <p
                className="text-[10px] text-warning mt-1"
                data-ocid="jobcards.form.to_be_fulfilled"
              >
                ⚠ To Be Fulfilled — some sign-off details are still pending
              </p>
            ) : (
              <p
                className="text-[10px] text-success mt-1"
                data-ocid="jobcards.form.to_be_fulfilled"
              >
                ✓ Sign-off details complete
              </p>
            ))}
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
        totalQuantity={
          form.totalQuantity !== ""
            ? Number.parseInt(form.totalQuantity, 10)
            : undefined
        }
        onChange={(rows) => setForm((f) => ({ ...f, inspectionPlan: rows }))}
      />

      {sectionLabel("Sign-off")}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Prepared By</Label>
          <div className="h-9 flex items-center px-3 rounded-md border bg-muted/30 text-sm text-muted-foreground">
            {editCard
              ? form.preparedByName || "—"
              : currentUser?.username || "—"}
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Assigned By</Label>
          <EmployeeSelect
            value={form.assignedByEmployeeId}
            onChange={(id) =>
              setForm((f) => ({
                ...f,
                assignedByEmployeeId: id,
                assignedByEmployeeName:
                  employees.find((e) => e.id === id)?.name ?? "",
              }))
            }
            className="w-full"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">In-Process Check</Label>
          <EmployeeSelect
            value={form.inProcessCheckEmployeeId}
            onChange={(id) =>
              setForm((f) => ({
                ...f,
                inProcessCheckEmployeeId: id,
                inProcessCheckEmployeeName:
                  employees.find((e) => e.id === id)?.name ?? "",
              }))
            }
            className="w-full"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">QC Approved By</Label>
          <EmployeeSelect
            value={form.qcApprovedByEmployeeId}
            onChange={(id) =>
              setForm((f) => ({
                ...f,
                qcApprovedByEmployeeId: id,
                qcApprovedByEmployeeName:
                  employees.find((e) => e.id === id)?.name ?? "",
              }))
            }
            className="w-full"
          />
        </div>
      </div>

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
                  <button
                    type="button"
                    onClick={() => setPendingReferencePhotoPreviewOpen(true)}
                    className="rounded border overflow-hidden"
                    title="Click to preview"
                    data-ocid="jobcards.form.pending_reference_photo_preview_trigger"
                  >
                    <img
                      src={pendingReferencePhotoPreviewUrl}
                      alt="Staged work reference"
                      className="h-16 w-16 object-contain"
                    />
                  </button>
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
              <Dialog
                open={pendingReferencePhotoPreviewOpen}
                onOpenChange={setPendingReferencePhotoPreviewOpen}
              >
                <DialogContent
                  className="max-w-2xl"
                  data-ocid="jobcards.form.pending_reference_photo_preview_dialog"
                >
                  <DialogHeader>
                    <DialogTitle>Reference Photo Preview</DialogTitle>
                  </DialogHeader>
                  {pendingReferencePhotoPreviewUrl && (
                    <img
                      src={pendingReferencePhotoPreviewUrl}
                      alt="Staged work reference — full preview"
                      className="max-h-[70vh] w-full object-contain rounded border"
                    />
                  )}
                </DialogContent>
              </Dialog>
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
          projectId={form.projectId || undefined}
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
                      {needsSignOffFulfillment(jc) && (
                        <span
                          className="text-[10px] font-sans font-normal text-warning whitespace-nowrap"
                          data-ocid="jobcards.list.to_be_fulfilled"
                          title="Some sign-off details are still pending"
                        >
                          ⚠ To Be Fulfilled
                        </span>
                      )}
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
                  <div className="flex items-center gap-2">
                    <DialogTitle>{viewCard.jobNo}</DialogTitle>
                    {needsSignOffFulfillment(viewCard) && (
                      <span
                        className="text-[10px] font-normal text-warning whitespace-nowrap"
                        data-ocid="jobcards.view.to_be_fulfilled"
                        title="Some sign-off details are still pending"
                      >
                        ⚠ To Be Fulfilled
                      </span>
                    )}
                  </div>
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

                {/* Production Progress (see chat, Part 5) — reuses the
                    EXISTING actual_completed_qty column, just widens
                    WHEN it can be written (also while InProgress/
                    OnHold, not only at Complete) so checkpoints below
                    can react to it as production happens, not only at
                    the very end. Never auto-marks any checkpoint
                    Passed — this only moves the quantity the checkpoint
                    list compares against. */}
                {(viewCard.status === "InProgress" ||
                  viewCard.status === "OnHold") &&
                  pEdit && (
                    <div
                      className="rounded-md border p-2.5 space-y-1.5"
                      data-ocid="jobcards.view.production_progress"
                    >
                      <Label className="text-xs">Production Progress</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          className="h-8 w-28 text-xs"
                          value={progressInput}
                          onChange={(e) => setProgressInput(e.target.value)}
                        />
                        <span className="text-xs text-muted-foreground">
                          of {viewCard.totalQuantity ?? "—"} pcs
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={savingProgress}
                          onClick={handleSaveProgress}
                          data-ocid="jobcards.view.production_progress.save"
                        >
                          Update
                        </Button>
                      </div>
                    </div>
                  )}

                {/* Inspection Checkpoints (see chat, Part 4-8) — each
                    row is an INDEPENDENT inspection event; recording one
                    never touches any other checkpoint's own state. */}
                {viewCard.inspectionPlan.length > 0 && (
                  <div
                    className="rounded-md border p-2.5 space-y-2"
                    data-ocid="jobcards.view.checkpoints"
                  >
                    <Label className="text-xs">Inspection Checkpoints</Label>
                    {[...viewCard.inspectionPlan]
                      .sort((a, b) => a.cumulativeQty - b.cumulativeQty)
                      .map((cp) => {
                        const status = getCheckpointStatus(
                          cp,
                          viewCard.actualCompletedQty,
                          viewCardEvents,
                        );
                        const cls =
                          status === "Passed"
                            ? "bg-success/10 text-success border-success/30"
                            : status === "Failed"
                              ? "bg-destructive/10 text-destructive border-destructive/30"
                              : status === "Due"
                                ? "bg-warning/15 text-warning border-warning/30"
                                : "bg-muted text-muted-foreground";
                        return (
                          <div
                            key={cp.id}
                            className="rounded border p-2 space-y-1.5"
                            data-ocid={`jobcards.view.checkpoints.${cp.id}`}
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium">
                                  {cp.label}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={`text-[9px] px-1.5 py-0 ${CHECKPOINT_SOURCE_CLS[cp.source]}`}
                                >
                                  {CHECKPOINT_SOURCE_LABEL[cp.source]}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground">
                                  @ {cp.cumulativeQty} pcs
                                </span>
                              </div>
                              <Badge className={`text-[10px] ${cls}`}>
                                {status}
                              </Badge>
                            </div>
                            {pEdit &&
                              (status === "Due" ||
                                status === "Upcoming" ||
                                status === "Failed") &&
                              (recordingCheckpointId === cp.id ? (
                                <div className="space-y-1.5">
                                  <Textarea
                                    className="text-xs"
                                    placeholder="Remarks (optional)"
                                    rows={2}
                                    value={checkpointRemarks}
                                    onChange={(e) =>
                                      setCheckpointRemarks(e.target.value)
                                    }
                                  />
                                  <div className="flex gap-1.5">
                                    <Button
                                      type="button"
                                      size="sm"
                                      disabled={savingCheckpoint}
                                      onClick={() =>
                                        handleRecordCheckpoint(cp, "Pass")
                                      }
                                      data-ocid={`jobcards.view.checkpoints.${cp.id}.pass`}
                                    >
                                      Pass
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="destructive"
                                      disabled={savingCheckpoint}
                                      onClick={() =>
                                        handleRecordCheckpoint(cp, "Fail")
                                      }
                                      data-ocid={`jobcards.view.checkpoints.${cp.id}.fail`}
                                    >
                                      Fail
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => {
                                        setRecordingCheckpointId(null);
                                        setCheckpointRemarks("");
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setRecordingCheckpointId(cp.id)
                                  }
                                  data-ocid={`jobcards.view.checkpoints.${cp.id}.inspect`}
                                >
                                  Inspect
                                </Button>
                              ))}
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* Completed Job Card attachment (see chat, Parts 12-14)
                    — the scanned/photographed, manually completed and
                    signed physical Job Card. Distinct from Reference
                    Photo/Project Reference Photo/Evidence Photo. */}
                <div
                  className="rounded-md border p-2.5 space-y-1.5"
                  data-ocid="jobcards.view.completed_document"
                >
                  <Label className="text-xs">Completed Job Card</Label>
                  {viewCard.completedDocumentStoragePath ? (
                    <div className="space-y-1.5">
                      <p className="text-xs">
                        {viewCard.completedDocumentFilename}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Uploaded by{" "}
                        {viewCard.completedDocumentUploadedByName ?? "—"}
                        {viewCard.completedDocumentUploadedAt &&
                          ` on ${new Date(viewCard.completedDocumentUploadedAt).toLocaleString("en-IN")}`}
                      </p>
                      <div className="flex gap-1.5">
                        {completedDocSignedUrl && (
                          <Button
                            asChild
                            type="button"
                            size="sm"
                            variant="outline"
                          >
                            <a
                              href={completedDocSignedUrl}
                              target="_blank"
                              rel="noreferrer"
                              data-ocid="jobcards.view.completed_document.view"
                            >
                              View
                            </a>
                          </Button>
                        )}
                        {pEdit && (
                          <>
                            <input
                              type="file"
                              accept="application/pdf,image/jpeg,image/png"
                              id="jc-completed-doc-replace"
                              className="hidden"
                              onChange={handleUploadCompletedDocument}
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={savingDocument}
                              onClick={() =>
                                document
                                  .getElementById("jc-completed-doc-replace")
                                  ?.click()
                              }
                              data-ocid="jobcards.view.completed_document.replace"
                            >
                              Replace
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={savingDocument}
                              onClick={handleRemoveCompletedDocument}
                              data-ocid="jobcards.view.completed_document.remove"
                            >
                              Remove
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ) : pEdit ? (
                    <div>
                      <input
                        type="file"
                        accept="application/pdf,image/jpeg,image/png"
                        id="jc-completed-doc-upload"
                        className="hidden"
                        onChange={handleUploadCompletedDocument}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={savingDocument}
                        onClick={() =>
                          document
                            .getElementById("jc-completed-doc-upload")
                            ?.click()
                        }
                        data-ocid="jobcards.view.completed_document.upload"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Upload Completed
                        Job Card
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Not uploaded yet.
                    </p>
                  )}
                </div>
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
const CHECKPOINT_SOURCE_LABEL: Record<
  JobCardInspectionCheckpoint["source"],
  string
> = {
  manual: "Manual",
  automatic: "Automatic",
  final: "Final",
};
const CHECKPOINT_SOURCE_CLS: Record<
  JobCardInspectionCheckpoint["source"],
  string
> = {
  manual: "bg-muted text-muted-foreground",
  automatic: "bg-info/10 text-info border-info/30",
  final: "bg-primary/10 text-primary border-primary/30 font-semibold",
};

// Inspection Plan configuration editor (Section 7, see chat, Part 2-3,
// database/20260917180000) — labels are ALWAYS auto-generated
// (First/Second/Third Inspection...), never manually typed (Part 2);
// supports both manual ("+ Add Inspection" at a quantity you type) and
// automatic (interval "Generate") checkpoints, de-duplicated by
// quantity (Part 3); Final Inspection is mandatory, auto-derived from
// Total Quantity, and cannot be added/removed through this UI (Part 6)
// — it appears/updates automatically via the totalQuantity effect in
// the parent form. All structural changes go through
// jobCardCheckpoints.ts's pure functions so labels/deltas/final-row
// dedup can never drift out of sync with each other.
function InspectionPlanEditor({
  rows,
  totalQuantity,
  onChange,
}: {
  rows: JobCardInspectionCheckpoint[];
  totalQuantity: number | undefined;
  onChange: (rows: JobCardInspectionCheckpoint[]) => void;
}) {
  const [manualQty, setManualQty] = useState("");
  const [interval, setIntervalQty] = useState("");

  const addRow = () => {
    const qty = Number.parseInt(manualQty, 10);
    const { rows: next, error } = addManualCheckpoint(rows, qty, totalQuantity);
    if (error) {
      toast.error(error);
      return;
    }
    onChange(next);
    setManualQty("");
  };

  const generateAutomatic = () => {
    const iv = Number.parseInt(interval, 10);
    if (!totalQuantity) {
      toast.error("Set Total Quantity first.");
      return;
    }
    if (!iv || iv <= 0) {
      toast.error("Enter a valid interval.");
      return;
    }
    onChange(mergeAutomaticPoints(rows, totalQuantity, iv));
  };

  const removeRow = (id: string) => onChange(rows.filter((r) => r.id !== id));
  const patchSampleQty = (id: string, sampleQty: number) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, sampleQty } : r)));

  const sorted = [...rows].sort((a, b) => a.cumulativeQty - b.cumulativeQty);

  return (
    <div className="space-y-2 rounded-md border p-3">
      {sorted.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No inspection checkpoints configured. Not printed if left empty.
        </p>
      )}
      {sorted.map((row, i) => (
        <div
          key={row.id}
          className="grid grid-cols-2 gap-1.5 items-end sm:grid-cols-[1fr_5rem_5rem_auto_auto]"
        >
          <div className="col-span-2 space-y-1 sm:col-span-1">
            {i === 0 && <Label className="text-[10px]">Checkpoint</Label>}
            <div className="flex items-center gap-1.5 h-8">
              <span className="text-xs font-medium">{row.label}</span>
              <Badge
                variant="outline"
                className={`text-[9px] px-1.5 py-0 ${CHECKPOINT_SOURCE_CLS[row.source]}`}
              >
                {CHECKPOINT_SOURCE_LABEL[row.source]}
              </Badge>
            </div>
          </div>
          <div className="space-y-1">
            {i === 0 && <Label className="text-[10px]">Cumulative Qty</Label>}
            <Input
              type="number"
              min="0"
              className="h-8 text-xs"
              value={row.cumulativeQty}
              disabled={row.source === "final"}
              onChange={(e) => {
                const qty = Number.parseInt(e.target.value, 10);
                if (!Number.isFinite(qty) || qty <= 0) return;
                if (totalQuantity && qty >= totalQuantity) {
                  toast.error(
                    "Checkpoint quantity must be less than Total Quantity.",
                  );
                  return;
                }
                if (
                  rows.some((r) => r.id !== row.id && r.cumulativeQty === qty)
                ) {
                  toast.error(`A checkpoint already exists at ${qty}.`);
                  return;
                }
                onChange(
                  relabelCheckpoints(
                    rows.map((r) =>
                      r.id === row.id ? { ...r, cumulativeQty: qty } : r,
                    ),
                  ),
                );
              }}
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
                patchSampleQty(row.id, Number.parseInt(e.target.value, 10) || 0)
              }
            />
          </div>
          <div className="space-y-1">
            {i === 0 && (
              <Label className="text-[10px] block">Inspect After</Label>
            )}
            <div className="h-8 flex items-center text-[11px] text-muted-foreground">
              Next {row.triggerQty} Nos
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={row.source === "final"}
            title={
              row.source === "final"
                ? "Final Inspection is mandatory and cannot be removed"
                : "Remove checkpoint"
            }
            onClick={() => removeRow(row.id)}
            data-ocid={`jobcards.form.inspection_plan.${i}.remove`}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-1.5 pt-1">
        <div className="space-y-1">
          <Label className="text-[10px]">Add checkpoint at qty</Label>
          <Input
            type="number"
            min="0"
            className="h-8 w-24 text-xs"
            value={manualQty}
            onChange={(e) => setManualQty(e.target.value)}
            placeholder="e.g. 25"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRow}
          data-ocid="jobcards.form.inspection_plan.add"
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Inspection
        </Button>
        <div className="space-y-1">
          <Label className="text-[10px]">Automatic interval</Label>
          <Input
            type="number"
            min="0"
            className="h-8 w-24 text-xs"
            value={interval}
            onChange={(e) => setIntervalQty(e.target.value)}
            placeholder="e.g. 25"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={generateAutomatic}
          data-ocid="jobcards.form.inspection_plan.generate"
        >
          Generate
        </Button>
      </div>
      {!totalQuantity && (
        <p className="text-[10px] text-muted-foreground">
          Set Total Quantity above to enable Final Inspection and the automatic
          interval generator.
        </p>
      )}
    </div>
  );
}
