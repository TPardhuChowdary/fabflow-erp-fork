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
import { SearchableSelect } from "@/components/ui/searchable-select";
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
import {
  Copy,
  Download,
  Edit2,
  Eye,
  GitBranch,
  Layers,
  Plus,
  Printer,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { ShieldOff } from "lucide-react";
import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { ConfirmDeleteDialog } from "../components/ConfirmDeleteDialog";
import { CustomerSelect } from "../components/CustomerSelect";
import { ProjectMultiSelect } from "../components/ProjectMultiSelect";
import { QuotationPrintView } from "../components/QuotationPrintView";
import ShareButton from "../components/ShareButton";
import { StatusBadge } from "../components/StatusBadge";
import { QuotationDocContent } from "../lib/documentRenderers";
import {
  openShareModalV2,
  printDocument,
  handleDownload as triggerDownload,
} from "../lib/documentUtils";

import {
  createMasterPORemote,
  createProjectPurchaseOrderRemote,
  createQuotationPurchaseOrderRemote,
} from "../lib/purchaseOrdersApi";
import {
  createQuotationRemote,
  createQuotationRevisionRemote,
  deleteQuotationRemote,
  updateQuotationRemote,
  updateQuotationRevisionRemote,
} from "../lib/quotationsApi";
import {
  cn,
  getCustomerVisibleName,
  projectsNeedingNewLineItems,
} from "../lib/utils";
import {
  canCreate,
  canDelete,
  canDownload,
  canEdit,
  canPrint,
  canShare,
  canView,
} from "../permissions";
import { useStore } from "../store";
import type {
  LineItem,
  PurchaseAttachment,
  Quotation,
  QuotationHistoryEntry,
  QuotationRevision,
  QuotationStatus,
} from "../types";

const newItem = (): LineItem => ({
  desc: "",
  hsn: "",
  qty: 1,
  unitPrice: 0,
  amount: 0,
});

const todayStr = () => new Date().toISOString().split("T")[0];

// §29-31: GST/IGST are opt-in and mutually exclusive; neither applies by
// default (both false → 0 tax, matching "do not auto-apply 18% or any
// tax when neither is selected"). Rates are fixed standard rates (18%
// GST split evenly as 9% CGST + 9% SGST for intra-state, 18% IGST for
// inter-state) - same numbers Invoice already defaults to - never
// user-edited, since the checkboxes replace the old free-typed % input
// entirely.
const GST_HALF_RATE = 9;
const IGST_RATE = 18;

function computeQuotationTax(
  applyGST: boolean,
  applyIGST: boolean,
  subtotal: number,
) {
  const cgstRate = applyGST ? GST_HALF_RATE : 0;
  const sgstRate = applyGST ? GST_HALF_RATE : 0;
  const igstRate = applyIGST ? IGST_RATE : 0;
  const cgstAmt = Math.round((subtotal * cgstRate) / 100);
  const sgstAmt = Math.round((subtotal * sgstRate) / 100);
  const igstAmt = Math.round((subtotal * igstRate) / 100);
  return {
    cgstRate,
    sgstRate,
    igstRate,
    cgstAmt,
    sgstAmt,
    igstAmt,
    total: subtotal + cgstAmt + sgstAmt + igstAmt,
  };
}

const emptyForm = (defaultTerms = "") => ({
  customerId: "",
  lineItems: [newItem()],
  applyGST: false,
  applyIGST: false,
  validUntil: "",
  quotationDate: todayStr(),
  terms: defaultTerms,
  notes: defaultTerms,
});

export function Quotations() {
  const {
    quotations,
    quotationRevisions,
    quotationPurchaseOrders,
    customers,
    projects,
    generateDocNo,
    addQuotation,
    updateQuotation,
    deleteQuotation,
    addQuotationRevision,
    updateQuotationRevision,
    addQuotationPurchaseOrder,
    addProjectPO,
    addMasterPO,
    settings,
  } = useStore();
  const { currentUser } = useAuth();

  const isAdmin = currentUser?.role === "Admin";
  const pCreate = canCreate(currentUser, "quotations");
  const pEdit = canEdit(currentUser, "quotations");
  const pDelete = canDelete(currentUser, "quotations");
  const pView = canView(currentUser, "quotations");
  const pPrint = canPrint(currentUser, "quotations");
  const pDownload = canDownload(currentUser, "quotations");
  const pShare = canShare(currentUser, "quotations");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [forceEdit, setForceEdit] = useState(false);

  // Quotation detail + Record PO state
  const [printQuotation, setPrintQuotation] = useState<Quotation | null>(null);

  async function handleDownload(q: Quotation) {
    const container = document.createElement("div");
    container.style.cssText =
      "position:fixed;top:0;left:-9999px;width:800px;background:#fff;z-index:9999";
    document.body.appendChild(container);
    const root = createRoot(container);
    const docId = `pdf-content-${q.id}`;
    const cust = (customers || []).find((c) => c.id === q.customerId) ?? null;
    flushSync(() => {
      root.render(
        <QuotationDocContent
          id={docId}
          quotation={q}
          customer={cust}
          settings={settings as unknown as Record<string, string>}
        />,
      );
    });
    try {
      triggerDownload(docId, `Quotation_${q.qtNo ?? q.id}.pdf`);
    } catch (e) {
      console.error("DOWNLOAD FAILED", e);
    } finally {
      root.unmount();
      container.remove();
    }
  }

  function handleShare(q) {
    openShareModalV2(
      () =>
        `Document No: ${q.qtNo}\nAmount: ₹${q.totalAmount ?? 0}\nLink: ${window.location.href}`,
    );
  }

  async function handlePrint(q: Quotation) {
    const container = document.createElement("div");
    container.style.cssText =
      "position:fixed;top:0;left:-9999px;width:800px;background:#fff;z-index:9999";
    document.body.appendChild(container);
    const root = createRoot(container);
    const docId = `pdf-content-${q.id}`;
    const cust = (customers || []).find((c) => c.id === q.customerId) ?? null;
    flushSync(() => {
      root.render(
        <QuotationDocContent
          id={docId}
          quotation={q}
          customer={cust}
          settings={settings as unknown as Record<string, string>}
        />,
      );
    });
    const el = document.getElementById(docId);
    const content = el?.innerHTML || "";
    root.unmount();
    container.remove();
    if (!content) return;
    const win = window.open("", "_blank", "width=900,height=650");
    if (!win) return;
    win.document.write(
      `<html><head><title>Quotation</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#000;background:#fff;}table{border-collapse:collapse;width:100%;}@page{size:A4;margin:15mm;}@media print{body{padding:0;}}</style></head><body>${content}</body></html>`,
    );
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(
    null,
  );
  const [showRecordPO, setShowRecordPO] = useState(false);
  const [deleteQuotationTarget, setDeleteQuotationTarget] =
    useState<Quotation | null>(null);
  const [poTargetQuotation, setPoTargetQuotation] = useState<Quotation | null>(
    null,
  );
  const [poFiles, setPoFiles] = useState<PurchaseAttachment[]>([]);
  const [poForm, setPoForm] = useState<{ poNumber: string; poDate: string }>({
    poNumber: "",
    poDate: "",
  });
  const [poFormError, setPoFormError] = useState("");
  const [isSavingPO, setIsSavingPO] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [poTargetRevisionId, setPoTargetRevisionId] = useState<string | null>(
    null,
  );

  // Revision-create mode: reuses the New/Edit dialog, but on save it creates
  // a new QuotationRevision instead of updating the quotation in place.
  const [revisionMode, setRevisionMode] = useState(false);

  // All project names for Description dropdown — use customer-visible names
  const projectNames = (projects || [])
    .map((p) => getCustomerVisibleName(p))
    .filter(Boolean);

  const sorted = [...(quotations || [])].sort(
    (a, b) => b.createdAt - a.createdAt,
  );

  // Revisions & Purchase Orders — Quotation -> Revisions -> Purchase Orders
  const getRevisionsForQuotation = (quotationId: string) =>
    [...(quotationRevisions || [])]
      .filter((r) => r.quotationId === quotationId)
      .sort((a, b) => b.revisionNumber - a.revisionNumber);
  const getCurrentRevision = (quotationId: string) =>
    (quotationRevisions || []).find(
      (r) => r.quotationId === quotationId && r.isCurrent,
    ) || getRevisionsForQuotation(quotationId)[0];
  const getPOsForRevision = (revisionId: string) =>
    (quotationPurchaseOrders || []).filter(
      (po) => po.revisionId === revisionId,
    );
  const getPOsForQuotation = (quotationId: string) =>
    (quotationPurchaseOrders || []).filter(
      (po) => po.quotationId === quotationId,
    );

  const updateItem = (
    i: number,
    field: keyof LineItem,
    val: string | number,
  ) => {
    setForm((p) => {
      const items = [...p.lineItems];
      items[i] = { ...items[i], [field]: val };
      if (field === "qty" || field === "unitPrice") {
        items[i].amount = items[i].qty * items[i].unitPrice;
      }
      return { ...p, lineItems: items };
    });
  };

  const subtotal = (form.lineItems || []).reduce((s, li) => s + li.amount, 0);
  const { cgstRate, sgstRate, igstRate, cgstAmt, sgstAmt, igstAmt, total } =
    computeQuotationTax(form.applyGST, form.applyIGST, subtotal);

  const openEdit = (q: Quotation) => {
    setForm({
      customerId: q.customerId,
      lineItems: (q.lineItems || []).map((li) => ({ ...li })),
      applyGST: q.applyGST ?? false,
      applyIGST: q.applyIGST ?? false,
      validUntil: q.validUntil || "",
      quotationDate: (q as any).quotationDate || "",
      terms: q.terms || "",
      notes: (q as any).notes || q.terms || "",
    });
    setEditingId(q.id);
    setEditMode(true);
    setRevisionMode(false);
    setForceEdit(false);
    setOpen(true);
  };

  const openDuplicate = (q: Quotation) => {
    setForm({
      customerId: q.customerId,
      lineItems: (q.lineItems || []).map((li) => ({ ...li })),
      applyGST: q.applyGST ?? false,
      applyIGST: q.applyIGST ?? false,
      validUntil: q.validUntil || "",
      quotationDate: todayStr(),
      terms: q.terms || "",
      notes: (q as any).notes || q.terms || "",
    });
    setEditingId(null);
    setEditMode(false);
    setRevisionMode(false);
    setForceEdit(false);
    setOpen(true);
  };

  const openCreateRevision = (q: Quotation) => {
    const current = getCurrentRevision(q.id);
    setForm({
      customerId: q.customerId,
      lineItems: (current?.lineItems ?? q.lineItems ?? []).map((li) => ({
        ...li,
      })),
      applyGST: current?.applyGST ?? q.applyGST ?? false,
      applyIGST: current?.applyIGST ?? q.applyIGST ?? false,
      validUntil: current?.validUntil ?? q.validUntil ?? "",
      quotationDate: todayStr(),
      terms: current?.terms ?? q.terms ?? "",
      notes: current?.notes ?? (q as any).notes ?? q.terms ?? "",
    });
    setEditingId(q.id);
    setEditMode(false);
    setRevisionMode(true);
    setForceEdit(false);
    setOpen(true);
  };

  const resetForm = () => {
    setForm(emptyForm());
    setEditMode(false);
    setEditingId(null);
    setRevisionMode(false);
    setForceEdit(false);
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      if ((editMode || revisionMode) && !pEdit) {
        alert("Access restricted");
        return;
      }
      if (!editMode && !revisionMode && !pCreate) {
        alert("Access restricted");
        return;
      }
      if (!form.customerId) {
        toast.error("Select a customer");
        return;
      }

      const subtotalVal = (form.lineItems || []).reduce(
        (s, li) => s + li.amount,
        0,
      );
      const taxVal = computeQuotationTax(
        form.applyGST,
        form.applyIGST,
        subtotalVal,
      );
      const totalVal = taxVal.total;

      if (revisionMode && editingId) {
        const existing = (quotations || []).find((q) => q.id === editingId);
        if (!existing) return;
        const previousRevision = getCurrentRevision(editingId);
        const nextRevisionNumber = (previousRevision?.revisionNumber ?? 0) + 1;

        if (previousRevision) {
          const flipResult = await updateQuotationRevisionRemote({
            ...previousRevision,
            isCurrent: false,
          });
          if (flipResult.status === "unauthenticated") {
            toast.error("Not signed in to the server - revision was not saved");
            return;
          }
          if (flipResult.status === "denied" || flipResult.status === "error") {
            toast.error(flipResult.error ?? "Could not save revision");
            return;
          }
          if (flipResult.data) {
            updateQuotationRevision({
              ...flipResult.data,
              createdBy: previousRevision.createdBy,
            });
          }
        }

        const revResult = await createQuotationRevisionRemote({
          quotationId: editingId,
          revisionNumber: nextRevisionNumber,
          revisionDate: todayStr(),
          lineItems: form.lineItems,
          subtotal: subtotalVal,
          applyGST: form.applyGST,
          applyIGST: form.applyIGST,
          cgstRate: taxVal.cgstRate,
          sgstRate: taxVal.sgstRate,
          igstRate: taxVal.igstRate,
          cgstAmt: taxVal.cgstAmt,
          sgstAmt: taxVal.sgstAmt,
          igstAmt: taxVal.igstAmt,
          totalAmount: totalVal,
          validUntil: form.validUntil,
          terms: form.notes || form.terms,
          notes: form.notes,
          status: "Draft",
          isCurrent: true,
        });
        if (revResult.status === "unauthenticated") {
          toast.error("Not signed in to the server - revision was not saved");
          return;
        }
        if (revResult.status === "denied" || revResult.status === "error") {
          toast.error(revResult.error ?? "Could not create revision");
          return;
        }
        if (!revResult.data) {
          toast.error("Could not create revision");
          return;
        }
        addQuotationRevision({
          ...revResult.data,
          createdBy: currentUser?.username,
        });

        // Mirror the new current revision onto the Quotation record itself
        // so printing, PDF export, and duplicate keep reading unchanged.
        const qResult = await updateQuotationRemote({
          id: editingId,
          customerId: existing.customerId,
          projectId: existing.projectId,
          lineItems: form.lineItems,
          subtotal: subtotalVal,
          applyGST: form.applyGST,
          applyIGST: form.applyIGST,
          cgstRate: taxVal.cgstRate,
          sgstRate: taxVal.sgstRate,
          igstRate: taxVal.igstRate,
          cgstAmt: taxVal.cgstAmt,
          sgstAmt: taxVal.sgstAmt,
          igstAmt: taxVal.igstAmt,
          totalAmount: totalVal,
          validUntil: form.validUntil,
          quotationDate: existing.quotationDate,
          terms: form.notes || form.terms,
          notes: form.notes,
          status: "Draft",
          history: existing.history,
          approvedAt: undefined,
        });
        if (qResult.status === "success" && qResult.data) {
          updateQuotation({
            ...qResult.data,
            approvedBy: undefined,
            recordedPO: existing.recordedPO,
          });
        }
        toast.success(`Revision ${nextRevisionNumber} created`);
      } else if (editMode && editingId) {
        const existing = (quotations || []).find((q) => q.id === editingId);
        if (!existing) return;
        const currentVersion = existing.version || 1;
        const historyEntry: QuotationHistoryEntry = {
          version: currentVersion,
          updatedAt: Date.now(),
          snapshot: { ...existing } as Record<string, unknown>,
        };
        const newHistory = [...(existing.history || []), historyEntry].slice(
          -10,
        );

        const result = await updateQuotationRemote({
          id: editingId,
          customerId: form.customerId,
          projectId: existing.projectId,
          lineItems: form.lineItems,
          subtotal: subtotalVal,
          applyGST: form.applyGST,
          applyIGST: form.applyIGST,
          cgstRate: taxVal.cgstRate,
          sgstRate: taxVal.sgstRate,
          igstRate: taxVal.igstRate,
          cgstAmt: taxVal.cgstAmt,
          sgstAmt: taxVal.sgstAmt,
          igstAmt: taxVal.igstAmt,
          totalAmount: totalVal,
          validUntil: form.validUntil,
          quotationDate: form.quotationDate,
          terms: form.notes || form.terms,
          notes: form.notes,
          status: existing.status,
          history: newHistory,
          approvedAt: existing.approvedAt,
        });
        if (result.status === "unauthenticated") {
          toast.error("Not signed in to the server - quotation was not saved");
          return;
        }
        if (result.status === "denied" || result.status === "error") {
          toast.error(result.error ?? "Could not save quotation");
          return;
        }
        if (!result.data) {
          toast.error("Could not save quotation");
          return;
        }
        updateQuotation({
          ...result.data,
          approvedBy: existing.approvedBy,
          recordedPO: existing.recordedPO,
        });

        // Keep the current revision's snapshot in sync with the same edit
        // (dates/notes/tax-rate corrections on the current, unaccepted
        // revision) so the Revisions panel never shows stale data.
        const current = getCurrentRevision(editingId);
        if (current) {
          const revUpdateResult = await updateQuotationRevisionRemote({
            ...current,
            lineItems: form.lineItems,
            subtotal: subtotalVal,
            applyGST: form.applyGST,
            applyIGST: form.applyIGST,
            cgstRate: taxVal.cgstRate,
            sgstRate: taxVal.sgstRate,
            igstRate: taxVal.igstRate,
            cgstAmt: taxVal.cgstAmt,
            sgstAmt: taxVal.sgstAmt,
            igstAmt: taxVal.igstAmt,
            totalAmount: totalVal,
            validUntil: form.validUntil,
            terms: form.notes || form.terms,
            notes: form.notes,
          });
          if (revUpdateResult.status === "success" && revUpdateResult.data) {
            updateQuotationRevision({
              ...revUpdateResult.data,
              createdBy: current.createdBy,
            });
          }
        }
        toast.success("Quotation updated");
      } else {
        const qtNo = generateDocNo("QT");
        const createResult = await createQuotationRemote({
          qtNo,
          customerId: form.customerId,
          projectId: undefined,
          lineItems: form.lineItems,
          subtotal: subtotalVal,
          applyGST: form.applyGST,
          applyIGST: form.applyIGST,
          cgstRate: taxVal.cgstRate,
          sgstRate: taxVal.sgstRate,
          igstRate: taxVal.igstRate,
          cgstAmt: taxVal.cgstAmt,
          sgstAmt: taxVal.sgstAmt,
          igstAmt: taxVal.igstAmt,
          totalAmount: totalVal,
          validUntil: form.validUntil,
          quotationDate: form.quotationDate,
          terms: form.notes || form.terms,
          notes: form.notes,
          status: "Draft",
          history: [],
        });
        if (createResult.status === "unauthenticated") {
          toast.error(
            "Not signed in to the server - quotation was not created",
          );
          return;
        }
        if (
          createResult.status === "denied" ||
          createResult.status === "error"
        ) {
          toast.error(createResult.error ?? "Could not create quotation");
          return;
        }
        if (!createResult.data) {
          toast.error("Could not create quotation");
          return;
        }
        const newQuotation = createResult.data;
        addQuotation(newQuotation);

        // Every quotation always has Revision 1.
        const revResult = await createQuotationRevisionRemote({
          quotationId: newQuotation.id,
          revisionNumber: 1,
          revisionDate: form.quotationDate || todayStr(),
          lineItems: form.lineItems,
          subtotal: subtotalVal,
          applyGST: form.applyGST,
          applyIGST: form.applyIGST,
          cgstRate: taxVal.cgstRate,
          sgstRate: taxVal.sgstRate,
          igstRate: taxVal.igstRate,
          cgstAmt: taxVal.cgstAmt,
          sgstAmt: taxVal.sgstAmt,
          igstAmt: taxVal.igstAmt,
          totalAmount: totalVal,
          validUntil: form.validUntil,
          terms: form.notes || form.terms,
          notes: form.notes,
          status: "Draft",
          isCurrent: true,
        });
        if (revResult.status === "success" && revResult.data) {
          addQuotationRevision({
            ...revResult.data,
            createdBy: currentUser?.username,
          });
        } else {
          toast.error(
            `Quotation ${qtNo} was created, but its Revision 1 could not be saved: ${revResult.error ?? revResult.status}`,
          );
        }
        toast.success(`Quotation ${qtNo} created`);
      }

      setOpen(false);
      resetForm();
    } finally {
      setIsSaving(false);
    }
  };

  const updateStatus = async (id: string, status: QuotationStatus) => {
    if (!pEdit) {
      toast.error("Access restricted: edit permission required");
      return;
    }
    const q = (quotations || []).find((x) => x.id === id);
    if (!q) return;
    const recordApproval = status === "Accepted";
    const approvedAt = recordApproval ? Date.now() : q.approvedAt;
    const result = await updateQuotationRemote(
      {
        id,
        customerId: q.customerId,
        projectId: q.projectId,
        lineItems: q.lineItems,
        subtotal: q.subtotal,
        applyGST: q.applyGST,
        applyIGST: q.applyIGST,
        cgstRate: q.cgstRate,
        sgstRate: q.sgstRate,
        igstRate: q.igstRate,
        cgstAmt: q.cgstAmt,
        sgstAmt: q.sgstAmt,
        igstAmt: q.igstAmt,
        totalAmount: q.totalAmount,
        validUntil: q.validUntil,
        quotationDate: q.quotationDate,
        terms: q.terms,
        notes: q.notes,
        status,
        history: q.history,
        approvedAt,
      },
      recordApproval,
    );
    if (result.status === "unauthenticated") {
      toast.error("Not signed in to the server - status was not updated");
      return;
    }
    if (result.status === "denied" || result.status === "error") {
      toast.error(result.error ?? "Could not update status");
      return;
    }
    if (!result.data) {
      toast.error("Could not update status");
      return;
    }
    updateQuotation({
      ...result.data,
      approvedBy: recordApproval
        ? currentUser?.username || "unknown"
        : q.approvedBy,
      recordedPO: q.recordedPO,
    });
    toast.success("Status updated");
  };

  const fmt = (n: number) => `\u20b9${n.toLocaleString("en-IN")}`;

  // Handle multi-file PO upload — convert each to base64
  const handlePoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const readers = files.map(
      (file) =>
        new Promise<PurchaseAttachment>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              ref: reader.result as string,
              type: file.type === "application/pdf" ? "pdf" : "image",
              name: file.name,
            });
          };
          reader.readAsDataURL(file);
        }),
    );
    Promise.all(readers).then((attachments) => {
      setPoFiles((prev) => [...prev, ...attachments]);
    });
  };

  const handleRecordPO = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isSavingPO) return;
    setIsSavingPO(true);
    try {
      if (!pEdit) {
        alert("Access restricted");
        return;
      }
      if (!poTargetQuotation || !poForm.poNumber.trim() || !poForm.poDate) {
        setPoFormError("PO Number and PO Date are required.");
        return;
      }

      const targetRevisionId =
        poTargetRevisionId || getCurrentRevision(poTargetQuotation.id)?.id;
      if (!targetRevisionId) {
        setPoFormError(
          "This quotation has no active revision to record a PO against.",
        );
        return;
      }

      // Find all projects that match line item descriptions
      const matchedItems = (poTargetQuotation.lineItems || []).filter((item) =>
        (projects || []).some(
          (p) =>
            getCustomerVisibleName(p).trim().toLowerCase() ===
              item.desc.trim().toLowerCase() ||
            p.projectName.trim().toLowerCase() ===
              item.desc.trim().toLowerCase(),
        ),
      );

      if (matchedItems.length === 0) {
        setPoFormError(
          "No matching projects found for the items in this quotation.",
        );
        return;
      }

      // Duplicate check: this exact PO number already recorded for this
      // quotation (independent PO records now allow many POs per quotation —
      // this only blocks re-entering the same PO number twice).
      const duplicatePoNumber = getPOsForQuotation(poTargetQuotation.id).some(
        (po) =>
          po.poNumber.trim().toLowerCase() ===
          poForm.poNumber.trim().toLowerCase(),
      );
      if (duplicatePoNumber) {
        setPoFormError(
          `PO number "${poForm.poNumber.trim()}" is already recorded for this quotation.`,
        );
        return;
      }

      // Create master PO first - its real DB id is the FK every child
      // row below links through (replaces the old fabricated sharedPoId).
      const masterResult = await createMasterPORemote({
        poNumber: poForm.poNumber.trim(),
        poDate: poForm.poDate,
        customerId: poTargetQuotation.customerId,
        quotationId: poTargetQuotation.id,
        files: poFiles,
        status: "Open",
      });
      if (masterResult.status === "unauthenticated") {
        toast.error("Not signed in to the server - PO was not recorded");
        return;
      }
      if (masterResult.status === "denied" || masterResult.status === "error") {
        toast.error(masterResult.error ?? "Could not record PO");
        return;
      }
      if (!masterResult.data) {
        toast.error("Could not record PO");
        return;
      }
      const masterPO = masterResult.data;
      addMasterPO(masterPO);

      // Create derived project PO entries
      let projectPoFailures = 0;
      for (const item of matchedItems) {
        const matchedProject = (projects || []).find(
          (p) =>
            getCustomerVisibleName(p).trim().toLowerCase() ===
              item.desc.trim().toLowerCase() ||
            p.projectName.trim().toLowerCase() ===
              item.desc.trim().toLowerCase(),
        );
        if (!matchedProject) continue;
        const ppoResult = await createProjectPurchaseOrderRemote({
          projectId: matchedProject.id,
          masterPoId: masterPO.id,
          quotationId: poTargetQuotation.id,
          poNumber: poForm.poNumber.trim(),
          poDate: poForm.poDate,
          quantity: item.qty,
          status: "Open",
        });
        if (ppoResult.status === "success" && ppoResult.data) {
          addProjectPO(ppoResult.data.projectId, ppoResult.data.po);
        } else {
          projectPoFailures++;
        }
      }

      // Independent PO record, permanently linked to the revision it was
      // recorded under — later revisions (different prices) never touch it.
      const qpoResult = await createQuotationPurchaseOrderRemote({
        quotationId: poTargetQuotation.id,
        revisionId: targetRevisionId,
        masterPoId: masterPO.id,
        poNumber: poForm.poNumber.trim(),
        poDate: poForm.poDate,
        customerId: poTargetQuotation.customerId,
        files: poFiles,
        status: "Received",
      });
      if (qpoResult.status === "success" && qpoResult.data) {
        addQuotationPurchaseOrder({
          ...qpoResult.data,
          createdBy: currentUser?.username,
        });
      } else {
        toast.error(
          `PO recorded, but the quotation-side record failed: ${qpoResult.error ?? qpoResult.status}`,
        );
      }

      if (projectPoFailures > 0) {
        toast.error(
          `PO recorded, but ${projectPoFailures} project link(s) could not be saved.`,
        );
      } else {
        toast.success(`PO recorded for ${matchedItems.length} project(s).`);
      }
      setShowRecordPO(false);
      setPoTargetQuotation(null);
      setPoTargetRevisionId(null);
      setPoForm({ poNumber: "", poDate: "" });
      setPoFiles([]);
      setPoFormError("");
    } finally {
      setIsSavingPO(false);
    }
  };

  const openFile = (file: PurchaseAttachment) => {
    if (!file?.ref) {
      alert("File not available");
      return;
    }
    const byteString = atob(file.ref.split(",")[1]);
    const mimeType = file.type === "pdf" ? "application/pdf" : "image/jpeg";
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++)
      ia[i] = byteString.charCodeAt(i);
    const blob = new Blob([ab], { type: mimeType });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  };

  const downloadFile = (file: PurchaseAttachment) => {
    const a = document.createElement("a");
    a.href = file.ref;
    a.download = file.name;
    a.click();
  };

  // Post-PO locking logic (computed when dialog is open in edit mode)
  const editingQuotation = editingId
    ? (quotations || []).find((q) => q.id === editingId)
    : null;
  const hasRecordedPO =
    !!(editingQuotation as any)?.recordedPO ||
    (editingId ? getPOsForQuotation(editingId).length > 0 : false);
  // Creating a Revision is explicitly how price changes are made after a
  // PO is recorded, so it's never subject to the post-PO lock.
  const isLocked = hasRecordedPO && !forceEdit && !revisionMode;

  // The full action set for one quotation row — extracted so it renders
  // identically (same handlers, same permission gates) from both the
  // desktop table cell and the mobile card (Fix 1), instead of having
  // two copies of ~140 lines of button JSX to keep in sync. `compact`
  // only changes button sizing (table = tight icon buttons, card =
  // touch-sized) via the existing size conventions already used for
  // each layout elsewhere on this page.
  const QuotationRowActions = ({
    q,
    i,
    compact,
  }: {
    q: Quotation;
    i: number;
    compact: boolean;
  }) => {
    const btnSize = compact ? "h-7 w-7" : "h-9 w-9";
    const iconSize = compact ? "w-3.5 h-3.5" : "w-4 h-4";
    return (
      <>
        <Button
          variant="ghost"
          size="icon"
          className={btnSize}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setPrintQuotation(q);
          }}
          title="View"
          data-ocid={`quotations.view_button.${i + 1}`}
        >
          <Eye className={iconSize} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={btnSize}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setSelectedQuotation(q);
          }}
          title="Revisions & Purchase Orders"
          data-ocid={`quotations.revisions_button.${i + 1}`}
        >
          <Layers className={iconSize} />
        </Button>
        {pEdit && (
          <Button
            variant="ghost"
            size="icon"
            className={btnSize}
            onClick={() => openEdit(q)}
            title="Edit"
          >
            <Edit2 className={iconSize} />
          </Button>
        )}
        {pCreate && (
          <Button
            variant="ghost"
            size="icon"
            className={btnSize}
            onClick={() => openDuplicate(q)}
            title="Duplicate"
            data-ocid={`quotations.duplicate_button.${i + 1}`}
          >
            <Copy className={iconSize} />
          </Button>
        )}
        {pEdit && (
          <Button
            variant="ghost"
            size="icon"
            className={btnSize}
            onClick={() => openCreateRevision(q)}
            title="Create Revision"
            data-ocid={`quotations.create_revision.button.${i + 1}`}
          >
            <GitBranch className={iconSize} />
          </Button>
        )}
        {pPrint && (
          <Button
            variant="ghost"
            size="icon"
            className={btnSize}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handlePrint(q);
            }}
            title="Print"
          >
            <Printer className={iconSize} />
          </Button>
        )}
        {pDownload && (
          <Button
            variant="ghost"
            size="icon"
            className={btnSize}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleDownload(q);
            }}
            title="Download PDF"
          >
            <Download className={iconSize} />
          </Button>
        )}
        {pShare && (
          <Button
            variant="ghost"
            size="icon"
            className={btnSize}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleShare(q);
            }}
            title="Share"
          >
            <Share2 className={iconSize} />
          </Button>
        )}
        {pDelete && (
          <Button
            variant="ghost"
            size="icon"
            className={cn(btnSize, "text-destructive hover:text-destructive")}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDeleteQuotationTarget(q);
            }}
            title="Delete"
          >
            <Trash2 className={iconSize} />
          </Button>
        )}
        {pEdit && q.status === "Accepted" && (
          <Button
            variant="ghost"
            size="icon"
            className={cn(btnSize, "text-green-700 hover:text-green-900")}
            title="Record Purchase Order"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setPoTargetQuotation(q);
              setPoTargetRevisionId(getCurrentRevision(q.id)?.id || null);
              setShowRecordPO(true);
            }}
            data-ocid={`quotations.record_po.button.${i + 1}`}
          >
            <Plus className={iconSize} />
          </Button>
        )}
      </>
    );
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
    <div className="space-y-4" data-ocid="quotations.page">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Quotations</h1>
          <p className="text-sm text-muted-foreground">
            {(quotations || []).length} quotations
          </p>
        </div>
        {pCreate && (
          <Button
            size="sm"
            onClick={() => {
              const defaultTerms = settings.quotationTerms || "";
              setForm(emptyForm(defaultTerms));
              setEditMode(false);
              setEditingId(null);
              setRevisionMode(false);
              setForceEdit(false);
              setOpen(true);
            }}
            data-ocid="quotations.create.primary_button"
          >
            <Plus className="w-4 h-4 mr-1" /> New Quotation
          </Button>
        )}
      </div>

      {/* Mobile cards (Fix 1, < sm/640px): the desktop table's 8 columns +
          10 possible action buttons don't fit a phone width. Shows the
          curated fields (QT No., Customer, Amount, Status, Valid Until/PO)
          plus the same QuotationRowActions used by the desktop table, so
          every action stays reachable and in sync with one implementation. */}
      <div className="sm:hidden space-y-2" data-ocid="quotations.list.cards">
        {sorted.map((q, i) => {
          const cust = customers.find((c) => c.id === q.customerId);
          const rPO = (q as Quotation & { recordedPO?: { poNumber: string } })
            .recordedPO;
          const qPOCount = getPOsForQuotation(q.id).length;
          return (
            <div
              key={q.id}
              className="rounded-md border p-3 space-y-2"
              data-ocid={`quotations.list.card.${i + 1}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-mono font-semibold">
                    {q.qtNo}
                  </div>
                  <div className="text-sm text-muted-foreground truncate">
                    {cust?.name ?? "—"}
                  </div>
                </div>
                <StatusBadge status={q.status} />
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                <div>
                  <span className="text-muted-foreground">Amount: </span>
                  <span className="font-semibold">{fmt(q.totalAmount)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Valid Until: </span>
                  {q.validUntil || "—"}
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">PO: </span>
                  {qPOCount > 0 ? (
                    <span className="font-mono text-green-700 font-semibold">
                      {qPOCount} PO{qPOCount > 1 ? "s" : ""}
                    </span>
                  ) : rPO ? (
                    <span className="font-mono text-green-700 font-semibold">
                      {rPO.poNumber}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-wrap pt-1 border-t">
                <QuotationRowActions q={q} i={i} compact={false} />
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && (
          <p
            className="text-center py-8 text-sm text-muted-foreground"
            data-ocid="quotations.list.cards.empty_state"
          >
            No quotations
          </p>
        )}
      </div>

      <div className="hidden sm:block table-wrapper">
        <div className="rounded-md border" data-ocid="quotations.list.table">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-xs font-semibold">QT No.</TableHead>
                <TableHead className="text-xs font-semibold">
                  Customer
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Total Amount
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Valid Until
                </TableHead>
                <TableHead className="text-xs font-semibold">PO</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="text-xs font-semibold w-32">
                  Update
                </TableHead>
                <TableHead className="text-xs font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((q, i) => {
                const cust = customers.find((c) => c.id === q.customerId);
                const rPO = (
                  q as Quotation & { recordedPO?: { poNumber: string } }
                ).recordedPO;
                const qPOCount = getPOsForQuotation(q.id).length;
                return (
                  <TableRow
                    key={q.id}
                    data-ocid={`quotations.list.row.${i + 1}`}
                    onClick={() => {
                      setPrintQuotation(q);
                    }}
                    className="cursor-pointer hover:bg-muted/50"
                  >
                    <TableCell className="text-xs font-mono font-semibold">
                      {q.qtNo}
                    </TableCell>
                    <TableCell className="text-sm">
                      {cust?.name ?? "\u2014"}
                    </TableCell>
                    <TableCell className="text-sm font-semibold">
                      {fmt(q.totalAmount)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {q.validUntil || "\u2014"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {qPOCount > 0 ? (
                        <span className="font-mono text-green-700 font-semibold">
                          {qPOCount} PO{qPOCount > 1 ? "s" : ""}
                        </span>
                      ) : rPO ? (
                        <span className="font-mono text-green-700 font-semibold">
                          {rPO.poNumber}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={q.status} />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={q.status}
                        disabled={!pEdit}
                        onValueChange={(v) =>
                          updateStatus(q.id, v as QuotationStatus)
                        }
                      >
                        <SelectTrigger
                          className="h-6 text-xs w-28"
                          disabled={!pEdit}
                          data-ocid={`quotations.status.select.${i + 1}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(
                            [
                              "Draft",
                              "Sent",
                              "Accepted",
                              "Rejected",
                            ] as QuotationStatus[]
                          ).map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <QuotationRowActions q={q} i={i} compact />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center py-8 text-sm text-muted-foreground"
                    data-ocid="quotations.list.empty_state"
                  >
                    No quotations
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* New / Edit Quotation Dialog */}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            setOpen(false);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-3xl" data-ocid="quotations.dialog">
          <DialogHeader>
            <DialogTitle>
              {revisionMode
                ? `Create Revision — ${editingQuotation?.qtNo ?? ""}`
                : editMode
                  ? "Edit Quotation"
                  : "New Quotation"}
              {editMode && editingQuotation && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  v{(editingQuotation as any).version || 1}
                </span>
              )}
              {revisionMode && editingId && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  Revision{" "}
                  {(getCurrentRevision(editingId)?.revisionNumber ?? 0) + 1}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* Admin Force Edit banner (shown when PO is recorded and editing) */}
          {editMode && hasRecordedPO && isAdmin && (
            <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              <p className="font-semibold">PO Already Recorded</p>
              <p>
                Customer and line items are locked. You can edit dates, tax, and
                notes.
              </p>
              {!forceEdit && (
                <button
                  type="button"
                  className="mt-1 text-xs underline text-amber-900"
                  onClick={() => setForceEdit(true)}
                  data-ocid="quotations.form.force_edit.toggle"
                >
                  Force Edit (Admin Override)
                </button>
              )}
              {forceEdit && (
                <p className="mt-1 font-semibold text-red-700">
                  \u26a0 Force edit active. Editing will not affect existing PO
                  or invoices.
                </p>
              )}
            </div>
          )}

          {/* Non-admin locked info */}
          {editMode && hasRecordedPO && !isAdmin && (
            <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              <p className="font-semibold">PO Already Recorded</p>
              <p>
                Customer and line items are locked. You may edit dates, tax, and
                notes.
              </p>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              console.log("FORM SUBMITTED");
              handleSave();
            }}
          >
            <div className="modal-body">
              <div className="form-grid mt-2">
                <div>
                  <Label className="text-xs">
                    Customer <span className="text-destructive">*</span>
                  </Label>
                  <CustomerSelect
                    value={form.customerId}
                    onChange={(v) => setForm((p) => ({ ...p, customerId: v }))}
                    disabled={isLocked}
                    placeholder="Select"
                    className="mt-1 w-full"
                    data-ocid="quotations.form.customer.select"
                  />
                </div>
                <div>
                  <Label className="text-xs">Quotation Date</Label>
                  <Input
                    data-ocid="quotations.form.quotation_date.input"
                    type="date"
                    className="mt-1 h-8 text-sm"
                    value={form.quotationDate}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, quotationDate: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Valid Until</Label>
                  <Input
                    data-ocid="quotations.form.validUntil.input"
                    type="date"
                    className="mt-1 h-8 text-sm"
                    value={form.validUntil}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, validUntil: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-semibold">Line Items</Label>
                  {!isLocked && (
                    <div className="flex items-center gap-2">
                      <ProjectMultiSelect
                        customerId={form.customerId}
                        className="h-6"
                        data-ocid="quotations.form.add_projects.button"
                        onAdd={(selected) => {
                          const toAdd = projectsNeedingNewLineItems(
                            selected,
                            form.lineItems || [],
                          );
                          if (toAdd.length === 0) return;
                          const newLines: LineItem[] = toAdd.map((proj) => ({
                            ...newItem(),
                            desc: getCustomerVisibleName(proj),
                            projectId: proj.id,
                          }));
                          setForm((p) => ({
                            ...p,
                            lineItems: [...(p.lineItems || []), ...newLines],
                          }));
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() =>
                          setForm((p) => ({
                            ...p,
                            lineItems: [...(p.lineItems || []), newItem()],
                          }))
                        }
                        data-ocid="quotations.form.add_item.button"
                      >
                        <Plus className="w-3 h-3 mr-1" /> Add Row
                      </Button>
                    </div>
                  )}
                </div>
                {/* Line items — responsive stacked grid, no fixed width, no overflow */}
                <div className="space-y-2">
                  {/* Header row — only visible on sm+ screens */}
                  <div
                    className="hidden sm:grid sm:gap-1 sm:text-[10px] sm:font-semibold sm:text-muted-foreground sm:px-2 sm:pb-1"
                    style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr auto" }}
                  >
                    <span>Description</span>
                    <span>HSN</span>
                    <span>Qty</span>
                    <span>Unit Price</span>
                    <span>Amount</span>
                  </div>

                  {(form.lineItems || []).map((li, idx) => (
                    <div
                      // biome-ignore lint/suspicious/noArrayIndexKey: stable form list managed by index
                      key={`row-form-${idx}`}
                      className="line-item"
                      data-ocid={`quotations.form.item.${idx + 1}`}
                    >
                      {/* Description */}
                      <div>
                        <span className="line-item-label">Description</span>
                        {li.projectId &&
                          (() => {
                            const linkedProject = (projects || []).find(
                              (p) => p.id === li.projectId,
                            );
                            if (!linkedProject) return null;
                            return (
                              <Badge
                                variant="secondary"
                                className="mb-1 block w-fit truncate text-[10px] font-normal"
                                data-ocid={`quotations.form.item.${idx + 1}.project_chip`}
                              >
                                {getCustomerVisibleName(linkedProject)}
                              </Badge>
                            );
                          })()}
                        {!isLocked ? (
                          <SearchableSelect
                            value={li.desc}
                            onChange={(val) => updateItem(idx, "desc", val)}
                            options={projectNames.map((name) => ({
                              value: name,
                              label: name,
                            }))}
                            creatable
                            createLabel={(text) => `Use "${text}"`}
                            placeholder="Description"
                            searchPlaceholder="Search project names or type…"
                            emptyText="No matching project names — type to use free text."
                            className="h-7 text-xs w-full"
                            data-ocid={`quotations.form.item.${idx + 1}.description.select`}
                          />
                        ) : (
                          <Input
                            className="h-7 text-xs"
                            value={li.desc}
                            onChange={(e) =>
                              !isLocked &&
                              updateItem(idx, "desc", e.target.value)
                            }
                            placeholder="Description"
                            readOnly={isLocked}
                          />
                        )}
                      </div>
                      {/* HSN */}
                      <div>
                        <span className="line-item-label">HSN</span>
                        <Input
                          className="h-7 text-xs"
                          value={li.hsn}
                          onChange={(e) =>
                            !isLocked && updateItem(idx, "hsn", e.target.value)
                          }
                          placeholder="HSN"
                          readOnly={isLocked}
                        />
                      </div>
                      {/* Qty */}
                      <div>
                        <span className="line-item-label">Qty</span>
                        <Input
                          className="h-7 text-xs"
                          type="number"
                          value={li.qty ?? ""}
                          onChange={(e) =>
                            !isLocked && updateItem(idx, "qty", +e.target.value)
                          }
                          readOnly={isLocked}
                        />
                      </div>
                      {/* Unit Price */}
                      <div>
                        <span className="line-item-label">Unit Price</span>
                        <Input
                          className="h-7 text-xs"
                          type="number"
                          value={li.unitPrice ?? ""}
                          onChange={(e) =>
                            !isLocked &&
                            updateItem(idx, "unitPrice", +e.target.value)
                          }
                          readOnly={isLocked}
                        />
                      </div>
                      {/* Amount + Delete */}
                      <div className="flex items-end gap-1 justify-between sm:flex-col sm:items-end">
                        <span className="text-xs font-semibold">
                          {fmt(li.amount)}
                        </span>
                        {!isLocked && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-1"
                            onClick={() =>
                              setForm((p) => ({
                                ...p,
                                lineItems: (p.lineItems || []).filter(
                                  (_, j) => j !== idx,
                                ),
                              }))
                            }
                            data-ocid={`quotations.form.delete_item.${idx + 1}`}
                          >
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {(form.lineItems || []).length === 0 && (
                    <p className="text-xs text-muted-foreground py-2 px-1">
                      No items added
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-end mt-3">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="quotation-apply-gst"
                      data-ocid="quotations.form.gst.checkbox"
                      checked={form.applyGST}
                      onCheckedChange={(v) =>
                        setForm((p) => ({
                          ...p,
                          applyGST: !!v,
                          applyIGST: v ? false : p.applyIGST,
                        }))
                      }
                    />
                    <Label htmlFor="quotation-apply-gst" className="text-xs">
                      Apply GST (CGST {GST_HALF_RATE}% + SGST {GST_HALF_RATE}
                      %)
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="quotation-apply-igst"
                      data-ocid="quotations.form.igst.checkbox"
                      checked={form.applyIGST}
                      onCheckedChange={(v) =>
                        setForm((p) => ({
                          ...p,
                          applyIGST: !!v,
                          applyGST: v ? false : p.applyGST,
                        }))
                      }
                    />
                    <Label htmlFor="quotation-apply-igst" className="text-xs">
                      Apply IGST ({IGST_RATE}%)
                    </Label>
                  </div>
                </div>
                <div className="text-right text-sm space-y-0.5">
                  <div className="text-muted-foreground">
                    Subtotal: {fmt(subtotal)}
                  </div>
                  {form.applyGST && (
                    <>
                      <div className="text-muted-foreground">
                        CGST ({cgstRate}%): {fmt(cgstAmt)}
                      </div>
                      <div className="text-muted-foreground">
                        SGST ({sgstRate}%): {fmt(sgstAmt)}
                      </div>
                    </>
                  )}
                  {form.applyIGST && (
                    <div className="text-muted-foreground">
                      IGST ({igstRate}%): {fmt(igstAmt)}
                    </div>
                  )}
                  <div className="font-bold text-base">Total: {fmt(total)}</div>
                </div>
              </div>

              {/* Notes / Terms */}
              <div className="mt-3">
                <Label className="text-xs">
                  Notes / Terms &amp; Conditions
                </Label>
                <textarea
                  data-ocid="quotations.form.notes.textarea"
                  className="mt-1 w-full text-sm border rounded p-2 min-h-[60px] resize-none bg-background"
                  value={form.notes || form.terms}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      notes: e.target.value,
                      terms: e.target.value,
                    }))
                  }
                  placeholder="Payment terms, notes..."
                />
              </div>
            </div>
            {/* end modal-body */}
            <div className="modal-footer">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  resetForm();
                }}
                data-ocid="quotations.form.cancel_button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSaving}
                data-ocid="quotations.form.submit_button"
              >
                {revisionMode
                  ? "Save Revision"
                  : editMode
                    ? "Update Quotation"
                    : "Create Quotation"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Quotation Detail Dialog */}
      <Dialog
        open={!!selectedQuotation}
        onOpenChange={(o) => !o && setSelectedQuotation(null)}
      >
        <DialogContent
          className="max-w-2xl"
          data-ocid="quotations.detail.dialog"
        >
          <DialogHeader>
            <div className="flex items-center gap-3">
              <DialogTitle className="font-mono">
                {selectedQuotation?.qtNo}
              </DialogTitle>
              {selectedQuotation && (
                <Badge
                  variant={
                    selectedQuotation.status === "Accepted"
                      ? "default"
                      : selectedQuotation.status === "Rejected"
                        ? "destructive"
                        : "secondary"
                  }
                  className="text-xs"
                >
                  {selectedQuotation.status}
                </Badge>
              )}
              {selectedQuotation && (selectedQuotation as any).version && (
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  v{(selectedQuotation as any).version}
                </span>
              )}
              {selectedQuotation?.approvedBy && (
                <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded">
                  Approved by {selectedQuotation.approvedBy}
                  {selectedQuotation.approvedAt
                    ? ` · ${new Date(selectedQuotation.approvedAt).toLocaleDateString("en-IN")}`
                    : ""}
                </span>
              )}
            </div>
          </DialogHeader>

          {selectedQuotation &&
            (() => {
              const cust = customers.find(
                (c) => c.id === selectedQuotation.customerId,
              );
              const qtSubtotal = (selectedQuotation.lineItems || []).reduce(
                (s, li) => s + li.amount,
                0,
              );
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs">
                        Customer
                      </span>
                      <p className="font-medium">{cust?.name ?? "\u2014"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">
                        Valid Until
                      </span>
                      <p className="font-medium">
                        {selectedQuotation.validUntil || "\u2014"}
                      </p>
                    </div>
                    {(selectedQuotation as any).quotationDate && (
                      <div>
                        <span className="text-muted-foreground text-xs">
                          Quotation Date
                        </span>
                        <p className="font-medium">
                          {(selectedQuotation as any).quotationDate}
                        </p>
                      </div>
                    )}
                    {((selectedQuotation as any).notes ||
                      selectedQuotation.terms) && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground text-xs">
                          Notes / Terms
                        </span>
                        <p className="text-sm mt-0.5 whitespace-pre-wrap">
                          {(selectedQuotation as any).notes ||
                            selectedQuotation.terms}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Revisions & Purchase Orders */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Revisions &amp; Purchase Orders
                      </p>
                      {pEdit && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs gap-1"
                          onClick={() => {
                            const q = selectedQuotation;
                            setSelectedQuotation(null);
                            openCreateRevision(q);
                          }}
                          data-ocid="quotations.detail.create_revision.button"
                        >
                          <GitBranch className="w-3 h-3" /> Create Revision
                        </Button>
                      )}
                    </div>
                    {getRevisionsForQuotation(selectedQuotation.id).map(
                      (rev) => {
                        const revPOs = getPOsForRevision(rev.id);
                        return (
                          <div
                            key={rev.id}
                            className={`rounded-md border p-3 ${
                              rev.isCurrent
                                ? "border-primary/40 bg-primary/5"
                                : "border-border bg-muted/20"
                            }`}
                            data-ocid={`quotations.detail.revision.${rev.revisionNumber}`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold">
                                  Revision {rev.revisionNumber}
                                  {rev.isCurrent ? " (Current)" : ""}
                                </span>
                                {!rev.isCurrent && (
                                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                    Read Only
                                  </span>
                                )}
                              </div>
                              <span className="text-sm font-semibold">
                                {fmt(rev.totalAmount)}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground mb-2">
                              {rev.revisionDate} · {rev.status}
                            </div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-muted-foreground">
                                Purchase Orders ({revPOs.length})
                              </span>
                              {rev.isCurrent && pEdit && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-xs gap-1"
                                  onClick={() => {
                                    setPoTargetQuotation(selectedQuotation);
                                    setPoTargetRevisionId(rev.id);
                                    setSelectedQuotation(null);
                                    setShowRecordPO(true);
                                  }}
                                  data-ocid="quotations.detail.record_po.button"
                                >
                                  <Plus className="w-3 h-3" /> Record Purchase
                                  Order
                                </Button>
                              )}
                            </div>
                            {revPOs.length === 0 ? (
                              <p className="text-xs text-muted-foreground italic">
                                No purchase orders recorded yet.
                              </p>
                            ) : (
                              <div className="space-y-1">
                                {revPOs.map((po) => (
                                  <div
                                    key={po.id}
                                    className="flex items-center justify-between text-xs bg-background border rounded px-2 py-1.5"
                                  >
                                    <div>
                                      <span className="font-mono font-semibold">
                                        {po.poNumber}
                                      </span>
                                      <span className="text-muted-foreground ml-2">
                                        {po.poDate}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Badge
                                        variant="secondary"
                                        className="text-[10px]"
                                      >
                                        {po.status}
                                      </Badge>
                                      {(po.files || []).map((f, fi) => (
                                        <span
                                          key={`${f.name}-${fi}`}
                                          className="flex items-center"
                                        >
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-5 px-1"
                                            onClick={() => openFile(f)}
                                          >
                                            <Eye className="w-3 h-3" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-5 px-1"
                                            onClick={() => downloadFile(f)}
                                          >
                                            <Download className="w-3 h-3" />
                                          </Button>
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      },
                    )}
                  </div>

                  {/* Line Items Table */}
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="text-xs">Description</TableHead>
                          <TableHead className="text-xs">HSN</TableHead>
                          <TableHead className="text-xs text-right">
                            Qty
                          </TableHead>
                          <TableHead className="text-xs text-right">
                            Unit Price
                          </TableHead>
                          <TableHead className="text-xs text-right">
                            Amount
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(selectedQuotation.lineItems || []).length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={5}
                              className="text-center text-xs text-muted-foreground py-4"
                            >
                              No items
                            </TableCell>
                          </TableRow>
                        ) : (
                          (selectedQuotation.lineItems || []).map((li, idx) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: read-only view
                            <TableRow key={idx}>
                              <TableCell className="text-sm">
                                {li.desc}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {li.hsn || "\u2014"}
                              </TableCell>
                              <TableCell className="text-sm text-right">
                                {li.qty}
                              </TableCell>
                              <TableCell className="text-sm text-right">
                                {fmt(li.unitPrice)}
                              </TableCell>
                              <TableCell className="text-sm text-right font-semibold">
                                {fmt(li.amount)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Summary */}
                  <div className="flex justify-end">
                    <div className="text-sm space-y-1 min-w-[200px]">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>{fmt(qtSubtotal)}</span>
                      </div>
                      {selectedQuotation.applyGST && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              CGST ({selectedQuotation.cgstRate}%)
                            </span>
                            <span>{fmt(selectedQuotation.cgstAmt)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              SGST ({selectedQuotation.sgstRate}%)
                            </span>
                            <span>{fmt(selectedQuotation.sgstAmt)}</span>
                          </div>
                        </>
                      )}
                      {selectedQuotation.applyIGST && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            IGST ({selectedQuotation.igstRate}%)
                          </span>
                          <span>{fmt(selectedQuotation.igstAmt)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold border-t pt-1">
                        <span>Total</span>
                        <span>{fmt(selectedQuotation.totalAmount)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Revision History */}
                  {(selectedQuotation as any).history &&
                    (selectedQuotation as any).history.length > 0 && (
                      <div className="border-t pt-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                          Revision History
                        </p>
                        <div className="space-y-1.5">
                          {[...(selectedQuotation as any).history]
                            .reverse()
                            .map((h: any) => (
                              <div
                                key={`${h.version}-${h.updatedAt}`}
                                className="flex items-center justify-between text-xs text-muted-foreground px-2 py-1 bg-muted/30 rounded"
                              >
                                <span className="font-mono">v{h.version}</span>
                                <span>
                                  Amount: {fmt(h.snapshot?.totalAmount ?? 0)}
                                </span>
                                <span>
                                  {new Date(h.updatedAt).toLocaleDateString(
                                    "en-IN",
                                  )}
                                </span>
                              </div>
                            ))}
                          <div className="flex items-center justify-between text-xs font-medium px-2 py-1 bg-primary/5 border border-primary/20 rounded">
                            <span className="font-mono">
                              v{(selectedQuotation as any).version ?? 1}{" "}
                              (current)
                            </span>
                            <span>
                              Amount: {fmt(selectedQuotation.totalAmount)}
                            </span>
                            <span>
                              {selectedQuotation.quotationDate || "—"}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                </div>
              );
            })()}

          <DialogFooter className="flex flex-wrap justify-end items-center gap-2">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedQuotation(null)}
                data-ocid="quotations.detail.close_button"
              >
                <X className="w-4 h-4 mr-1" /> Close
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quotation Print View */}
      <QuotationPrintView
        quotation={printQuotation}
        customer={
          printQuotation
            ? (customers.find((c) => c.id === printQuotation.customerId) ??
              null)
            : null
        }
        open={!!printQuotation}
        onClose={() => {
          setPrintQuotation(null);
        }}
        onEdit={
          printQuotation
            ? () => {
                const q = printQuotation;
                setPrintQuotation(null);
                openEdit(q);
              }
            : undefined
        }
        onRecordPO={
          printQuotation?.status === "Accepted" &&
          !(printQuotation as any).recordedPO
            ? () => {
                setPoTargetQuotation(printQuotation);
                setPrintQuotation(null);
                setShowRecordPO(true);
              }
            : undefined
        }
      />

      {/* Record PO Dialog */}
      <Dialog
        open={showRecordPO}
        onOpenChange={(o) => {
          if (!o) {
            setShowRecordPO(false);
            setPoForm({ poNumber: "", poDate: "" });
            setPoFiles([]);
            setPoFormError("");
          }
        }}
      >
        <DialogContent
          className="max-w-md"
          data-ocid="quotations.record_po.dialog"
        >
          <DialogHeader>
            <DialogTitle>Record Customer PO</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRecordPO}>
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-xs">
                  PO Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  className="mt-1 h-8 text-sm"
                  placeholder="e.g. PO-2026-001"
                  value={poForm.poNumber}
                  onChange={(e) =>
                    setPoForm((p) => ({ ...p, poNumber: e.target.value }))
                  }
                  data-ocid="quotations.record_po.po_number.input"
                />
              </div>

              <div>
                <Label className="text-xs">
                  PO Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  className="mt-1 h-8 text-sm"
                  type="date"
                  value={poForm.poDate}
                  onChange={(e) =>
                    setPoForm((p) => ({ ...p, poDate: e.target.value }))
                  }
                  data-ocid="quotations.record_po.po_date.input"
                />
              </div>

              <div>
                <Label className="text-xs">
                  Upload PO Files (PDF/JPG/PNG, multiple allowed)
                </Label>
                <Input
                  className="mt-1 h-8 text-sm"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  multiple
                  onChange={handlePoFileChange}
                  data-ocid="quotations.record_po.upload_button"
                />
                {poFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {poFiles.map((f, fi) => (
                      <div
                        key={`${f.name}-${fi}`}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-muted-foreground truncate max-w-[200px]">
                          {f.name}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1 text-destructive"
                          onClick={() =>
                            setPoFiles((prev) =>
                              prev.filter((_, i) => i !== fi),
                            )
                          }
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {poFormError && (
                <p
                  className="text-xs text-destructive"
                  data-ocid="quotations.record_po.error_state"
                >
                  {poFormError}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => {
                  setShowRecordPO(false);
                  setPoForm({ poNumber: "", poDate: "" });
                  setPoFiles([]);
                  setPoFormError("");
                }}
                data-ocid="quotations.record_po.cancel_button"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                type="submit"
                disabled={isSavingPO}
                data-ocid="quotations.record_po.submit_button"
              >
                Save PO
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteQuotationTarget}
        onOpenChange={(o) => !o && setDeleteQuotationTarget(null)}
        title="Delete quotation?"
        description={`Quotation "${deleteQuotationTarget?.qtNo}" will be permanently deleted.`}
        onConfirm={async () => {
          const q = deleteQuotationTarget;
          if (!q) return;
          const result = await deleteQuotationRemote(q.id);
          if (result.status === "unauthenticated") {
            toast.error(
              "Not signed in to the server - quotation was not deleted",
            );
            setDeleteQuotationTarget(null);
            return;
          }
          if (result.status === "denied" || result.status === "error") {
            toast.error(result.error ?? "Could not delete quotation");
            setDeleteQuotationTarget(null);
            return;
          }
          deleteQuotation(q.id);
          toast.success("Quotation deleted");
          setDeleteQuotationTarget(null);
        }}
      />
    </div>
  );
}
