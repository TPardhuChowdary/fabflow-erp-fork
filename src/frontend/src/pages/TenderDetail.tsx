// Phase 56 (Group 2) / Phases 19, 21, 22, 23 — Tender Detail: the real
// hub. Overview (basic info + source document), Requirements (the
// checklist — Phase 21's match-against-Company-Document-Library flow),
// Readiness (Phase 22's priority-ordered submission-readiness view),
// Document Pack (Phase 23's real, working PDF assembly via
// lib/tenderPackApi.ts).
//
// Phase 20 (AI extraction) / Phase 24 (Agent action-registry
// integration) are deliberately NOT wired into this pass — the
// underlying agent architecture only sends genuine image mimeTypes as
// real model input today (see supabase/functions/agent-chat/
// openaiProvider.ts's own header comment); PDF input needs that Edge
// Function extended and redeployed first, which needs your explicit
// go-ahead per the standing deployment-approval rule. Everything in this
// page is fully usable with manual entry today, and is exactly the data
// model/UI the AI layer would populate once wired in — no rearchitecture
// needed later.

import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { Badge } from "@/components/ui/badge";
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
import { RowActions } from "@/components/ui/row-actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { getCompanyDocumentSignedUrl } from "@/lib/companyDocumentsApi";
import {
  assembleTenderPackBytes,
  generateAndSaveTenderPack,
} from "@/lib/tenderPackApi";
import {
  createTenderRequirementRemote,
  deleteTenderRemote,
  deleteTenderRequirementRemote,
  getTenderDocumentSignedUrl,
  setTenderRequirementMatch,
  updateTenderRemote,
  uploadTenderSourceDocument,
} from "@/lib/tendersApi";
import { canDelete, canEdit, canView } from "@/permissions";
import { useStore } from "@/store";
import type {
  CompanyDocument,
  TenderRequirement,
  TenderRequirementCategory,
  TenderStatus,
} from "@/types";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  Info,
  Package,
  Plus,
  ShieldOff,
  Trash2,
  Upload,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";

const STATUS_COLOR: Record<TenderStatus, string> = {
  Draft: "bg-muted text-muted-foreground border-border",
  "In Progress": "bg-info/10 text-info border-info/30",
  Submitted: "bg-warning/15 text-warning border-warning/30",
  Won: "bg-success/10 text-success border-success/30",
  Lost: "bg-destructive/10 text-destructive border-destructive/30",
  Withdrawn: "bg-muted text-muted-foreground border-border",
};

const REQ_STATUS_COLOR: Record<TenderRequirement["status"], string> = {
  AVAILABLE: "bg-success/10 text-success border-success/30",
  MISSING: "bg-destructive/10 text-destructive border-destructive/30",
  EXPIRED: "bg-destructive/10 text-destructive border-destructive/30",
  EXPIRING_SOON: "bg-warning/15 text-warning border-warning/30",
  NEEDS_REVIEW: "bg-info/10 text-info border-info/30",
};

const CATEGORIES: TenderRequirementCategory[] = [
  "Eligibility",
  "Technical",
  "Financial",
  "Document",
  "Certificate",
  "Declaration",
  "Schedule",
  "EMD",
  "Portal",
  "Format",
  "Other",
];

// Phase 22's explicit priority order, mapped to a numeric weight so
// readiness/sort logic derives from real data (mandatory + status),
// never a hand-maintained label.
function priorityWeight(req: TenderRequirement): number {
  if (req.isMandatory && req.status === "MISSING") return 0;
  if (req.isMandatory && req.status === "EXPIRED") return 1;
  if (req.isMandatory && req.status === "NEEDS_REVIEW") return 2;
  if (req.category === "Technical") return 3;
  if (!req.isMandatory && req.status !== "AVAILABLE") return 4;
  return 5;
}

const PRIORITY_LABEL: Record<number, string> = {
  0: "Mandatory — Missing",
  1: "Mandatory — Expired",
  2: "Mandatory — Needs Review",
  3: "Technical",
  4: "Supporting / Optional",
  5: "Ready",
};

function computeStatusFromMatch(
  doc: CompanyDocument | undefined,
): TenderRequirement["status"] {
  if (!doc) return "MISSING";
  if (doc.status === "Draft") return "NEEDS_REVIEW";
  if (doc.expiryDate) {
    const days = Math.ceil(
      (new Date(doc.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    if (days < 0) return "EXPIRED";
    if (days <= 30) return "EXPIRING_SOON";
  }
  return "AVAILABLE";
}

interface TenderDetailProps {
  tenderId: string | null;
  onBack: () => void;
  // Phase 20 (Group 2) — jumps to the AI Agent with this tender's source
  // document pre-attached and the extraction prompt pre-filled.
  onExtractWithAI?: (tenderId: string) => void;
}

export function TenderDetail({
  tenderId,
  onBack,
  onExtractWithAI,
}: TenderDetailProps) {
  const { currentUser } = useAuth();
  const pEdit = canEdit(currentUser, "tenders");
  const pDelete = canDelete(currentUser, "tenders");
  const pView = canView(currentUser, "tenders");

  const {
    tenders,
    tenderRequirements,
    companyDocuments,
    updateTenderLocal,
    removeTenderLocal,
    addTenderRequirementLocal,
    updateTenderRequirementLocal,
    removeTenderRequirementLocal,
  } = useStore();

  const tender = tenders.find((t) => t.id === tenderId);
  const requirements = useMemo(
    () =>
      (tenderRequirements || [])
        .filter((r) => r.tenderId === tenderId)
        .sort(
          (a, b) => a.priority - b.priority || a.displayOrder - b.displayOrder,
        ),
    [tenderRequirements, tenderId],
  );

  const [reqDialogOpen, setReqDialogOpen] = useState(false);
  const [reqForm, setReqForm] = useState<{
    requirementText: string;
    category: TenderRequirementCategory;
    isMandatory: boolean;
  }>({ requirementText: "", category: "Document", isMandatory: true });
  const [isSavingReq, setIsSavingReq] = useState(false);
  const [matchTarget, setMatchTarget] = useState<TenderRequirement | null>(
    null,
  );
  const [isUploadingSource, setIsUploadingSource] = useState(false);
  const [isGeneratingPack, setIsGeneratingPack] = useState(false);
  const [packPreview, setPackPreview] = useState<{
    includedCount: number;
    missingCount: number;
  } | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeletingTender, setIsDeletingTender] = useState(false);

  if (!pView) {
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

  if (!tender) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <p className="text-sm text-muted-foreground">Tender not found.</p>
      </div>
    );
  }

  const handleStatusChange = async (status: TenderStatus) => {
    const result = await updateTenderRemote(tender.id, {
      tenderNumber: tender.tenderNumber,
      title: tender.title,
      customerId: tender.customerId,
      authorityName: tender.authorityName,
      portal: tender.portal,
      bidType: tender.bidType,
      submissionDeadline: tender.submissionDeadline,
      openingDate: tender.openingDate,
      technicalRequirementsSummary: tender.technicalRequirementsSummary,
      financialRequirementsSummary: tender.financialRequirementsSummary,
      emdAmount: tender.emdAmount,
      emdDetails: tender.emdDetails,
      status,
    });
    if (result.status !== "success" || !result.data) {
      toast.error(result.error ?? "Could not update status");
      return;
    }
    updateTenderLocal(result.data);
    toast.success("Status updated");
  };

  const handleUploadSource = async (file: File) => {
    setIsUploadingSource(true);
    try {
      const result = await uploadTenderSourceDocument(tender.id, file);
      if (result.status !== "success" || !result.data) {
        toast.error(result.error ?? "Could not upload document");
        return;
      }
      updateTenderLocal(result.data);
      toast.success("Tender document uploaded");
    } finally {
      setIsUploadingSource(false);
    }
  };

  const handleViewSource = async () => {
    if (!tender.sourceDocumentStoragePath) return;
    const url = await getTenderDocumentSignedUrl(
      tender.sourceDocumentStoragePath,
    );
    if (!url) {
      toast.error("Could not generate a link for this document");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleAddRequirement = async () => {
    if (isSavingReq || !reqForm.requirementText.trim()) return;
    setIsSavingReq(true);
    try {
      const result = await createTenderRequirementRemote({
        tenderId: tender.id,
        requirementText: reqForm.requirementText.trim(),
        category: reqForm.category,
        isMandatory: reqForm.isMandatory,
        priority: reqForm.isMandatory ? 2 : 4,
        displayOrder: requirements.length,
      });
      if (result.status !== "success" || !result.data) {
        toast.error(result.error ?? "Could not add requirement");
        return;
      }
      addTenderRequirementLocal(result.data);
      toast.success("Requirement added");
      setReqForm({
        requirementText: "",
        category: "Document",
        isMandatory: true,
      });
      setReqDialogOpen(false);
    } finally {
      setIsSavingReq(false);
    }
  };

  const handleDeleteRequirement = async (id: string) => {
    const result = await deleteTenderRequirementRemote(id);
    if (result.status !== "success") {
      toast.error(result.error ?? "Could not delete requirement");
      return;
    }
    removeTenderRequirementLocal(id);
    toast.success("Requirement deleted");
  };

  const handleMatch = async (doc: CompanyDocument | null) => {
    if (!matchTarget) return;
    const status = computeStatusFromMatch(doc ?? undefined);
    const result = await setTenderRequirementMatch(
      matchTarget.id,
      doc ? { id: doc.id, title: doc.title, expiryDate: doc.expiryDate } : null,
      status,
    );
    if (result.status !== "success" || !result.data) {
      toast.error(result.error ?? "Could not update match");
      return;
    }
    updateTenderRequirementLocal(result.data);
    toast.success(doc ? "Matched" : "Match cleared");
    setMatchTarget(null);
  };

  const handleGeneratePack = async () => {
    if (isGeneratingPack) return;
    setIsGeneratingPack(true);
    try {
      const preview = await assembleTenderPackBytes({
        tender,
        requirements,
        companyDocuments: companyDocuments || [],
      });
      setPackPreview({
        includedCount: preview.includedCount,
        missingCount: preview.missingCount,
      });
      const result = await generateAndSaveTenderPack({
        tender,
        requirements,
        companyDocuments: companyDocuments || [],
      });
      if (result.status !== "success" || !result.data) {
        toast.error(result.error ?? "Could not generate the document pack");
        return;
      }
      updateTenderLocal(result.data);
      toast.success("Final pack generated");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Could not generate the document pack",
      );
    } finally {
      setIsGeneratingPack(false);
    }
  };

  const handleViewPack = async () => {
    if (!tender.finalPackStoragePath) return;
    const url = await getTenderDocumentSignedUrl(tender.finalPackStoragePath);
    if (!url) {
      toast.error("Could not generate a link for the pack");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDeleteTender = async () => {
    if (isDeletingTender) return;
    setIsDeletingTender(true);
    try {
      const result = await deleteTenderRemote(tender.id);
      if (result.status !== "success") {
        toast.error(result.error ?? "Could not delete tender");
        return;
      }
      // tender_requirements cascade-deletes server-side (on delete cascade
      // in database/phase-56); the local store doesn't need a per-row
      // cleanup call.
      removeTenderLocal(tender.id);
      toast.success("Tender deleted");
      setDeleteConfirmOpen(false);
      onBack();
    } finally {
      setIsDeletingTender(false);
    }
  };

  const mandatoryOutstanding = requirements.filter(
    (r) => r.isMandatory && r.status !== "AVAILABLE",
  );
  const readinessLabel =
    mandatoryOutstanding.length === 0
      ? requirements.length > 0
        ? "Ready to submit"
        : "No requirements added yet"
      : `${mandatoryOutstanding.length} mandatory requirement${mandatoryOutstanding.length === 1 ? "" : "s"} outstanding`;

  return (
    <div className="p-6 space-y-6" data-ocid="tender-detail.panel">
      <div className="flex items-start gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="mt-0.5 shrink-0"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {tender.tenderNumber}
            </span>
            {pEdit ? (
              <Select
                value={tender.status}
                onValueChange={(v) => handleStatusChange(v as TenderStatus)}
              >
                <SelectTrigger className="h-6 w-auto text-xs border-0 p-0 gap-1">
                  <Badge
                    variant="outline"
                    className={`text-xs ${STATUS_COLOR[tender.status]}`}
                  >
                    {tender.status}
                  </Badge>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Draft">Draft</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Submitted">Submitted</SelectItem>
                  <SelectItem value="Won">Won</SelectItem>
                  <SelectItem value="Lost">Lost</SelectItem>
                  <SelectItem value="Withdrawn">Withdrawn</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge
                variant="outline"
                className={`text-xs ${STATUS_COLOR[tender.status]}`}
              >
                {tender.status}
              </Badge>
            )}
          </div>
          <h1 className="text-xl font-semibold tracking-tight mt-1">
            {tender.title}
          </h1>
          <p className="text-xs text-muted-foreground">
            {tender.authorityName || "—"}
            {tender.submissionDeadline
              ? ` · Deadline ${new Date(tender.submissionDeadline).toLocaleString("en-IN")}`
              : ""}
          </p>
        </div>
        {pDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
            onClick={() => setDeleteConfirmOpen(true)}
            data-ocid="tender-detail.delete_button"
          >
            <Trash2 className="w-4 h-4 mr-1" /> Delete
          </Button>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" data-ocid="tender-detail.overview.tab">
            <Info className="w-3.5 h-3.5 mr-1.5" /> Overview
          </TabsTrigger>
          <TabsTrigger
            value="requirements"
            data-ocid="tender-detail.requirements.tab"
          >
            <ClipboardList className="w-3.5 h-3.5 mr-1.5" /> Requirements (
            {requirements.length})
          </TabsTrigger>
          <TabsTrigger
            value="readiness"
            data-ocid="tender-detail.readiness.tab"
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Readiness
          </TabsTrigger>
          <TabsTrigger value="pack" data-ocid="tender-detail.pack.tab">
            <Package className="w-3.5 h-3.5 mr-1.5" /> Document Pack
          </TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="pt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <h3 className="font-semibold text-sm">Tender Details</h3>
              {[
                { label: "Portal", value: tender.portal },
                { label: "Bid Type", value: tender.bidType },
                {
                  label: "Opening Date",
                  value: tender.openingDate
                    ? new Date(tender.openingDate).toLocaleString("en-IN")
                    : undefined,
                },
                {
                  label: "EMD Amount",
                  value: tender.emdAmount
                    ? `₹${tender.emdAmount.toLocaleString("en-IN")}`
                    : undefined,
                },
                { label: "EMD Details", value: tender.emdDetails },
              ]
                .filter((f) => f.value)
                .map((f) => (
                  <div
                    key={f.label}
                    className="flex justify-between text-sm gap-3"
                  >
                    <span className="text-muted-foreground">{f.label}</span>
                    <span className="font-medium text-right">{f.value}</span>
                  </div>
                ))}
            </div>
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" /> Tender Source
                Document
              </h3>
              {tender.sourceDocumentFilename ? (
                <div className="flex items-center justify-between text-sm gap-2">
                  <span className="truncate">
                    {tender.sourceDocumentFilename}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleViewSource}
                    >
                      <Download className="w-3.5 h-3.5 mr-1" /> View
                    </Button>
                    {pEdit && onExtractWithAI && (
                      <Button
                        size="sm"
                        onClick={() => onExtractWithAI(tender.id)}
                        data-ocid="tender-detail.overview.extract_with_ai_button"
                      >
                        Extract Requirements with AI
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No document uploaded yet.
                </p>
              )}
              {pEdit && (
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    {tender.sourceDocumentFilename ? "Replace" : "Upload"}{" "}
                    (PDF/image)
                  </Label>
                  <Input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    disabled={isUploadingSource}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUploadSource(f);
                    }}
                    data-ocid="tender-detail.overview.upload_source"
                  />
                </div>
              )}
            </div>
          </div>
          {(tender.technicalRequirementsSummary ||
            tender.financialRequirementsSummary) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {tender.technicalRequirementsSummary && (
                <div className="rounded-lg border bg-card p-4 space-y-1">
                  <h3 className="font-semibold text-sm">
                    Technical Requirements
                  </h3>
                  <p className="text-sm whitespace-pre-wrap">
                    {tender.technicalRequirementsSummary}
                  </p>
                </div>
              )}
              {tender.financialRequirementsSummary && (
                <div className="rounded-lg border bg-card p-4 space-y-1">
                  <h3 className="font-semibold text-sm">
                    Financial Requirements
                  </h3>
                  <p className="text-sm whitespace-pre-wrap">
                    {tender.financialRequirementsSummary}
                  </p>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* Requirements */}
        <TabsContent value="requirements" className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Preserve actual tender wording — never paraphrase a requirement
              away.
            </p>
            {pEdit && (
              <Button
                size="sm"
                onClick={() => setReqDialogOpen(true)}
                data-ocid="tender-detail.requirements.add_button"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Requirement
              </Button>
            )}
          </div>
          {requirements.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No requirements recorded yet.
            </p>
          ) : (
            <div className="space-y-2">
              {requirements.map((r) => (
                <div
                  key={r.id}
                  className="flex items-start justify-between gap-3 rounded-md border bg-card p-3"
                  data-ocid="tender-detail.requirements.row"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className={`text-xs ${REQ_STATUS_COLOR[r.status]}`}
                      >
                        {r.status}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {r.category}
                      </Badge>
                      {r.isMandatory && (
                        <Badge
                          variant="outline"
                          className="text-xs bg-warning/15 text-warning border-warning/30"
                        >
                          Mandatory
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm">{r.requirementText}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.matchedDocumentTitle
                        ? `Matched: ${r.matchedDocumentTitle}${r.matchedDocumentExpiry ? ` (expires ${r.matchedDocumentExpiry})` : ""}`
                        : "Not matched to a document yet."}
                    </p>
                  </div>
                  {pEdit && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setMatchTarget(r)}
                      >
                        Match
                      </Button>
                      {pDelete && (
                        <RowActions
                          primary={[]}
                          overflow={[
                            {
                              label: "Delete",
                              icon: Trash2,
                              onClick: () => handleDeleteRequirement(r.id),
                              destructive: true,
                              "data-ocid":
                                "tender-detail.requirements.delete_button",
                            },
                          ]}
                        />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Readiness */}
        <TabsContent value="readiness" className="pt-4 space-y-4">
          <div
            className={`rounded-lg border p-4 flex items-center gap-3 ${
              mandatoryOutstanding.length === 0 && requirements.length > 0
                ? "bg-success/10 border-success/30"
                : "bg-warning/15 border-warning/30"
            }`}
            data-ocid="tender-detail.readiness.banner"
          >
            {mandatoryOutstanding.length === 0 && requirements.length > 0 ? (
              <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
            )}
            <span className="text-sm font-medium">{readinessLabel}</span>
          </div>
          {requirements.length > 0 && (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4, 5].map((weight) => {
                const items = requirements.filter(
                  (r) => priorityWeight(r) === weight,
                );
                if (items.length === 0) return null;
                return (
                  <div key={weight} className="rounded-lg border bg-card p-3">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      {PRIORITY_LABEL[weight]} ({items.length})
                    </h4>
                    <div className="space-y-1">
                      {items.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between text-sm gap-2"
                        >
                          <span className="truncate">{r.requirementText}</span>
                          <Badge
                            variant="outline"
                            className={`text-xs shrink-0 ${REQ_STATUS_COLOR[r.status]}`}
                          >
                            {r.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Document Pack */}
        <TabsContent value="pack" className="pt-4 space-y-4">
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h3 className="font-semibold text-sm">
              Final Tender Document Pack
            </h3>
            <p className="text-xs text-muted-foreground">
              Assembles a cover page, index, and every matched document's real
              file in priority order. Anything mandatory but unmatched is listed
              on the index as missing — never fabricated or substituted.
            </p>
            {tender.finalPackStoragePath && (
              <div className="flex items-center justify-between text-sm bg-muted/30 rounded px-3 py-2">
                <span>
                  Last generated{" "}
                  {tender.finalPackGeneratedAt
                    ? new Date(tender.finalPackGeneratedAt).toLocaleString(
                        "en-IN",
                      )
                    : ""}
                </span>
                <Button size="sm" variant="outline" onClick={handleViewPack}>
                  <Download className="w-3.5 h-3.5 mr-1" /> View
                </Button>
              </div>
            )}
            {packPreview && (
              <p className="text-xs text-muted-foreground">
                Included {packPreview.includedCount} document(s),{" "}
                {packPreview.missingCount} still missing.
              </p>
            )}
            {pEdit && (
              <Button
                onClick={handleGeneratePack}
                disabled={isGeneratingPack || requirements.length === 0}
                data-ocid="tender-detail.pack.generate_button"
              >
                <Upload className="w-4 h-4 mr-1.5" />
                {isGeneratingPack ? "Generating…" : "Generate Final Pack"}
              </Button>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Requirement dialog */}
      <Dialog open={reqDialogOpen} onOpenChange={setReqDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Requirement</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">
                Requirement Text (verbatim from the tender)
              </Label>
              <Textarea
                value={reqForm.requirementText}
                onChange={(e) =>
                  setReqForm((f) => ({ ...f, requirementText: e.target.value }))
                }
                rows={3}
                data-ocid="tender-detail.requirements.form.text"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Category</Label>
                <Select
                  value={reqForm.category}
                  onValueChange={(v) =>
                    setReqForm((f) => ({
                      ...f,
                      category: v as TenderRequirementCategory,
                    }))
                  }
                >
                  <SelectTrigger data-ocid="tender-detail.requirements.form.category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Mandatory?</Label>
                <Select
                  value={reqForm.isMandatory ? "yes" : "no"}
                  onValueChange={(v) =>
                    setReqForm((f) => ({ ...f, isMandatory: v === "yes" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Mandatory</SelectItem>
                    <SelectItem value="no">Optional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReqDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddRequirement}
              disabled={isSavingReq || !reqForm.requirementText.trim()}
              data-ocid="tender-detail.requirements.form.save"
            >
              {isSavingReq ? "Saving…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Match dialog */}
      <Dialog
        open={!!matchTarget}
        onOpenChange={(o) => !o && setMatchTarget(null)}
      >
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Match Against Company Document Library</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            A document in the library isn't automatically attached to the bid —
            matching it here only records that it satisfies this requirement.
          </p>
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {(companyDocuments || []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No documents in the library yet.
              </p>
            ) : (
              (companyDocuments || []).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={async () => {
                    const url = await getCompanyDocumentSignedUrl(
                      d.storagePath,
                    );
                    if (url) window.open(url, "_blank", "noopener,noreferrer");
                  }}
                  className="w-full text-left text-sm bg-muted/30 hover:bg-muted rounded px-3 py-2 flex items-center justify-between"
                >
                  <span className="truncate">
                    {d.title} ({d.category})
                  </span>
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMatch(d);
                    }}
                  >
                    Select
                  </Button>
                </button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleMatch(null)}>
              Clear Match
            </Button>
            <Button variant="outline" onClick={() => setMatchTarget(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={handleDeleteTender}
        title="Delete Tender"
        description={`Delete "${tender.tenderNumber} — ${tender.title}"? All of its requirements and its document pack will be removed too.`}
      />
    </div>
  );
}
