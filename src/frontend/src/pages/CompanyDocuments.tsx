// Phase 55 (Group 2) / Phase 17 — Company Document Library. A reusable,
// company-wide document repository (GST/PAN/MSME/ISO/Work Orders/Vendor
// Certificates/Machinery lists/etc.), distinct from every per-project or
// per-employee document store already in this app. See
// lib/companyDocumentsApi.ts and database/phase-55.

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
import { Textarea } from "@/components/ui/textarea";
import {
  deleteCompanyDocument,
  getCompanyDocumentSignedUrl,
  uploadCompanyDocument,
  validateCompanyDocumentFile,
} from "@/lib/companyDocumentsApi";
import { canCreate, canDelete, canView } from "@/permissions";
import { useStore } from "@/store";
import type { CompanyDocument, CompanyDocumentStatus } from "@/types";
import {
  AlertTriangle,
  Download,
  FileBox,
  Plus,
  ShieldOff,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";

const COMMON_CATEGORIES = [
  "Registration",
  "Certification",
  "Compliance",
  "Financial",
  "Machinery",
  "Other",
];

const STATUS_COLOR: Record<CompanyDocumentStatus, string> = {
  Active: "bg-success/10 text-success border-success/30",
  Superseded: "bg-muted text-muted-foreground border-border",
  Draft: "bg-warning/15 text-warning border-warning/30",
};

// Phase 18 (Group 2) — Expiry / Document Health. Five states, all derived
// from data the library already has (expiry_date + status), nothing
// fabricated: Available (a real, current, unexpiring-soon document
// exists), Expiring Soon / Expired (from expiry_date), Needs Review (a
// Draft — uploaded but not yet confirmed), Missing (one of the common
// categories has zero real documents at all — the one state that isn't
// per-document but per-category, since "missing" only means something
// relative to what's expected).
export type DocumentHealthState =
  | "Available"
  | "Missing"
  | "Expired"
  | "Needs Review"
  | "Expiring Soon";

const HEALTH_COLOR: Record<DocumentHealthState, string> = {
  Available: "bg-success/10 text-success border-success/30",
  "Expiring Soon": "bg-warning/15 text-warning border-warning/30",
  Expired: "bg-destructive/10 text-destructive border-destructive/30",
  "Needs Review": "bg-info/10 text-info border-info/30",
  Missing: "bg-muted text-muted-foreground border-border",
};

function daysUntil(dateStr: string): number {
  return Math.ceil(
    (new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
}

function documentHealth(
  doc: CompanyDocument,
): Exclude<DocumentHealthState, "Missing"> {
  if (doc.status === "Draft") return "Needs Review";
  if (doc.expiryDate) {
    const days = daysUntil(doc.expiryDate);
    if (days < 0) return "Expired";
    if (days <= 30) return "Expiring Soon";
  }
  return "Available";
}

function expiryBadge(
  expiryDate?: string,
): { label: string; cls: string } | null {
  if (!expiryDate) return null;
  const days = daysUntil(expiryDate);
  if (days < 0)
    return {
      label: "Expired",
      cls: "bg-destructive/10 text-destructive border-destructive/30",
    };
  if (days <= 30)
    return {
      label: `Expires in ${days}d`,
      cls: "bg-warning/15 text-warning border-warning/30",
    };
  return null;
}

const emptyForm = () => ({
  category: "",
  documentType: "",
  title: "",
  issueDate: "",
  expiryDate: "",
  version: "",
  status: "Active" as CompanyDocumentStatus,
  isTenderEligible: false,
  notes: "",
});

export function CompanyDocuments() {
  const { currentUser } = useAuth();
  const pView = canView(currentUser, "company_documents");
  const pCreate = canCreate(currentUser, "company_documents");
  const pDelete = canDelete(currentUser, "company_documents");

  const {
    companyDocuments,
    addCompanyDocumentLocal,
    removeCompanyDocumentLocal,
  } = useStore();

  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [file, setFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CompanyDocument | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const categories = useMemo(() => {
    const set = new Set(COMMON_CATEGORIES);
    for (const d of companyDocuments || []) set.add(d.category);
    return Array.from(set);
  }, [companyDocuments]);

  const filtered = useMemo(
    () =>
      (companyDocuments || []).filter(
        (d) => categoryFilter === "all" || d.category === categoryFilter,
      ),
    [companyDocuments, categoryFilter],
  );

  // Phase 18 (Group 2) — Document Health summary, computed entirely from
  // companyDocuments + the common-categories list above.
  const healthCounts = useMemo(() => {
    const counts: Record<DocumentHealthState, number> = {
      Available: 0,
      "Expiring Soon": 0,
      Expired: 0,
      "Needs Review": 0,
      Missing: 0,
    };
    for (const d of companyDocuments || []) {
      counts[documentHealth(d)]++;
    }
    const coveredCategories = new Set(
      (companyDocuments || [])
        .filter((d) => d.status !== "Superseded")
        .map((d) => d.category),
    );
    counts.Missing = COMMON_CATEGORIES.filter(
      (c) => !coveredCategories.has(c),
    ).length;
    return counts;
  }, [companyDocuments]);

  const handleUpload = async () => {
    if (isSaving) return;
    if (
      !form.category.trim() ||
      !form.documentType.trim() ||
      !form.title.trim()
    ) {
      toast.error("Category, Document Type, and Title are required");
      return;
    }
    if (!file) {
      toast.error("Select a file to upload");
      return;
    }
    const validation = validateCompanyDocumentFile(file);
    if (!validation.ok) {
      toast.error(validation.reason);
      return;
    }
    setIsSaving(true);
    try {
      const result = await uploadCompanyDocument(
        {
          category: form.category.trim(),
          documentType: form.documentType.trim(),
          title: form.title.trim(),
          issueDate: form.issueDate || undefined,
          expiryDate: form.expiryDate || undefined,
          version: form.version || undefined,
          status: form.status,
          isTenderEligible: form.isTenderEligible,
          notes: form.notes || undefined,
        },
        file,
      );
      if (result.status === "unauthenticated") {
        toast.error("Not signed in to the server - document was not saved");
        return;
      }
      if (
        result.status === "denied" ||
        result.status === "error" ||
        !result.data
      ) {
        toast.error(result.error ?? "Could not save document");
        return;
      }
      addCompanyDocumentLocal(result.data);
      toast.success("Document added");
      setForm(emptyForm());
      setFile(null);
      setAddOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleView = async (doc: CompanyDocument) => {
    const url = await getCompanyDocumentSignedUrl(doc.storagePath);
    if (!url) {
      toast.error("Could not generate a link for this document");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    try {
      const result = await deleteCompanyDocument(deleteTarget);
      if (result.status === "unauthenticated") {
        toast.error("Not signed in to the server - document was not deleted");
        return;
      }
      if (result.status === "denied" || result.status === "error") {
        toast.error(result.error ?? "Could not delete document");
        return;
      }
      removeCompanyDocumentLocal(deleteTarget.id);
      toast.success("Document deleted");
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

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

  return (
    <div className="p-6 space-y-4" data-ocid="company-documents.panel">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <FileBox className="w-5 h-5 text-primary" />
            Company Document Library
          </h1>
          <p className="text-sm text-muted-foreground">
            Reusable company-wide documents — registrations, certifications,
            compliance records.
          </p>
        </div>
        {pCreate && (
          <Button
            onClick={() => setAddOpen(true)}
            data-ocid="company-documents.add_button"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Add Document
          </Button>
        )}
      </div>

      {/* Phase 18 (Group 2) — Document Health summary */}
      <div
        className="flex flex-wrap gap-2"
        data-ocid="company-documents.health_summary"
      >
        {(Object.keys(healthCounts) as DocumentHealthState[]).map((state) => (
          <Badge
            key={state}
            variant="outline"
            className={`text-xs ${HEALTH_COLOR[state]}`}
          >
            {state}: {healthCounts[state]}
          </Badge>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Category</Label>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger
            className="w-48"
            data-ocid="company-documents.category_filter"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          No documents in the library yet.
        </div>
      ) : (
        <div
          className="rounded-lg border divide-y"
          data-ocid="company-documents.table"
        >
          {filtered.map((d) => {
            const expiry = expiryBadge(d.expiryDate);
            return (
              <div
                key={d.id}
                className="flex items-center justify-between gap-3 p-3"
                data-ocid="company-documents.row"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{d.title}</span>
                    <Badge
                      variant="outline"
                      className={`text-xs ${STATUS_COLOR[d.status]}`}
                    >
                      {d.status}
                    </Badge>
                    {d.isTenderEligible && (
                      <Badge
                        variant="outline"
                        className="text-xs bg-info/10 text-info border-info/30"
                      >
                        Tender Eligible
                      </Badge>
                    )}
                    {expiry && (
                      <Badge
                        variant="outline"
                        className={`text-xs ${expiry.cls}`}
                      >
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        {expiry.label}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {d.category} · {d.documentType}
                    {d.version ? ` · ${d.version}` : ""}
                    {d.expiryDate ? ` · Expires ${d.expiryDate}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleView(d)}
                    data-ocid="company-documents.view_button"
                  >
                    <Download className="w-3.5 h-3.5 mr-1" /> View
                  </Button>
                  {pDelete && (
                    <RowActions
                      primary={[]}
                      overflow={[
                        {
                          label: "Delete",
                          icon: Trash2,
                          onClick: () => setDeleteTarget(d),
                          destructive: true,
                          "data-ocid": "company-documents.delete_button",
                        },
                      ]}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Company Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Category *</Label>
              <Input
                list="company-doc-categories"
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category: e.target.value }))
                }
                placeholder="e.g. Registration"
                data-ocid="company-documents.form.category"
              />
              <datalist id="company-doc-categories">
                {COMMON_CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Document Type *</Label>
              <Input
                value={form.documentType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, documentType: e.target.value }))
                }
                placeholder="e.g. GST Certificate"
                data-ocid="company-documents.form.document_type"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Title *</Label>
              <Input
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder="e.g. GST Registration Certificate"
                data-ocid="company-documents.form.title"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Issue Date</Label>
                <Input
                  type="date"
                  value={form.issueDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, issueDate: e.target.value }))
                  }
                  data-ocid="company-documents.form.issue_date"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Expiry Date</Label>
                <Input
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, expiryDate: e.target.value }))
                  }
                  data-ocid="company-documents.form.expiry_date"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Version</Label>
                <Input
                  value={form.version}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, version: e.target.value }))
                  }
                  placeholder="Optional"
                  data-ocid="company-documents.form.version"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      status: v as CompanyDocumentStatus,
                    }))
                  }
                >
                  <SelectTrigger data-ocid="company-documents.form.status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Superseded">Superseded</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isTenderEligible}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isTenderEligible: e.target.checked }))
                }
                data-ocid="company-documents.form.tender_eligible"
              />
              Eligible to attach to tender submissions
            </label>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                rows={2}
                data-ocid="company-documents.form.notes"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">File (PDF, JPG, PNG) *</Label>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                data-ocid="company-documents.form.file"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={isSaving}
              data-ocid="company-documents.form.save"
            >
              {isSaving ? "Saving…" : "Add Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Document"
        description={deleteTarget ? `Delete "${deleteTarget.title}"?` : ""}
      />
    </div>
  );
}
