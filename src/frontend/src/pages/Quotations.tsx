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
  Download,
  Edit2,
  Eye,
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
  MasterPO,
  PurchaseAttachment,
  Quotation,
  QuotationHistoryEntry,
  QuotationStatus,
} from "../types";

const newItem = (): LineItem => ({
  desc: "",
  hsn: "",
  qty: 1,
  unitPrice: 0,
  amount: 0,
});

const emptyForm = (defaultTerms = "") => ({
  customerId: "",
  lineItems: [newItem()],
  gstRate: 18,
  validUntil: "",
  quotationDate: "",
  terms: defaultTerms,
  notes: defaultTerms,
});

export function Quotations() {
  const {
    quotations,
    customers,
    projects,
    generateDocNo,
    addQuotation,
    updateQuotation,
    deleteQuotation,
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

  // All project names for Description dropdown
  const projectNames = (projects || [])
    .map((p) => p.projectName)
    .filter(Boolean);

  const sorted = [...(quotations || [])].sort(
    (a, b) => b.createdAt - a.createdAt,
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
  const gstAmt = Math.round((subtotal * form.gstRate) / 100);
  const total = subtotal + gstAmt;

  const openEdit = (q: Quotation) => {
    setForm({
      customerId: q.customerId,
      lineItems: (q.lineItems || []).map((li) => ({ ...li })),
      gstRate: q.gstRate || 18,
      validUntil: q.validUntil || "",
      quotationDate: (q as any).quotationDate || "",
      terms: q.terms || "",
      notes: (q as any).notes || q.terms || "",
    });
    setEditingId(q.id);
    setEditMode(true);
    setForceEdit(false);
    setOpen(true);
  };

  const resetForm = () => {
    setForm(emptyForm());
    setEditMode(false);
    setEditingId(null);
    setForceEdit(false);
  };

  const handleSave = () => {
    console.log("FORM SUBMITTED");
    if (isSaving) return;
    setIsSaving(true);
    try {
      console.log("Saving quotation:", form);
      if (editMode && !pEdit) {
        alert("Access restricted");
        return;
      }
      if (!editMode && !pCreate) {
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
      const gstAmtVal = Math.round((subtotalVal * form.gstRate) / 100);
      const totalVal = subtotalVal + gstAmtVal;

      if (editMode && editingId) {
        const existing = (quotations || []).find((q) => q.id === editingId);
        if (!existing) return;
        const currentVersion = (existing as any).version || 1;
        const historyEntry: QuotationHistoryEntry = {
          version: currentVersion,
          updatedAt: Date.now(),
          snapshot: { ...existing } as Record<string, unknown>,
        };
        const updated = {
          ...existing,
          customerId: form.customerId,
          lineItems: form.lineItems,
          subtotal: subtotalVal,
          gstRate: form.gstRate,
          gstAmount: gstAmtVal,
          totalAmount: totalVal,
          validUntil: form.validUntil,
          quotationDate: form.quotationDate,
          terms: form.notes || form.terms,
          notes: form.notes,
          version: currentVersion + 1,
          history: [...((existing as any).history || []), historyEntry],
        };
        updateQuotation(updated as any);
        toast.success("Quotation updated");
      } else {
        const qtNo = generateDocNo("QT");
        addQuotation({
          id: crypto.randomUUID(),
          qtNo,
          enqId: "",
          customerId: form.customerId,
          projectId: "",
          lineItems: form.lineItems,
          subtotal: subtotalVal,
          gstRate: form.gstRate,
          gstAmount: gstAmtVal,
          totalAmount: totalVal,
          validUntil: form.validUntil,
          quotationDate: form.quotationDate,
          terms: form.notes || form.terms,
          notes: form.notes,
          status: "Draft",
          createdAt: Date.now(),
          version: 1,
          history: [],
        } as any);
        toast.success(`Quotation ${qtNo} created`);
      }

      setOpen(false);
      resetForm();
      console.log("SAVE COMPLETE");
    } finally {
      setIsSaving(false);
    }
  };

  const updateStatus = (id: string, status: QuotationStatus) => {
    if (!pEdit) {
      toast.error("Access restricted: edit permission required");
      return;
    }
    const q = (quotations || []).find((x) => x.id === id);
    if (q) {
      updateQuotation({ ...q, status });
      toast.success("Status updated");
    }
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

  const handleRecordPO = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isSavingPO) return;
    setIsSavingPO(true);
    if (!pEdit) {
      alert("Access restricted");
      setIsSavingPO(false);
      return;
    }
    if (!poTargetQuotation || !poForm.poNumber.trim() || !poForm.poDate) {
      setPoFormError("PO Number and PO Date are required.");
      setIsSavingPO(false);
      return;
    }

    // Find all projects that match line item descriptions
    const matchedItems = (poTargetQuotation!.lineItems || []).filter((item) =>
      (projects || []).some(
        (p) =>
          p.projectName.trim().toLowerCase() === item.desc.trim().toLowerCase(),
      ),
    );

    if (matchedItems.length === 0) {
      setPoFormError(
        "No matching projects found for the items in this quotation.",
      );
      setIsSavingPO(false);
      return;
    }

    // Duplicate check across matched projects
    for (const item of matchedItems) {
      const matchedProject = (projects || []).find(
        (p) =>
          p.projectName.trim().toLowerCase() === item.desc.trim().toLowerCase(),
      );
      if (!matchedProject) continue;
      const duplicate = (matchedProject.pos || []).some(
        (po) =>
          po.poNumber.trim().toLowerCase() ===
            poForm.poNumber.trim().toLowerCase() &&
          po.quotationId === poTargetQuotation!.id,
      );
      if (duplicate) {
        setPoFormError(
          `PO already exists for this quotation in project "${matchedProject.projectName}".`,
        );
        setIsSavingPO(false);
        return;
      }
    }

    const sharedPoId = `spo-${Date.now()}`;

    // Create master PO
    const masterPO: MasterPO = {
      id: crypto.randomUUID(),
      poNumber: poForm.poNumber.trim(),
      poDate: poForm.poDate,
      customerId: poTargetQuotation!.customerId,
      quotationId: poTargetQuotation!.id,
      files: poFiles,
      sharedPoId,
      status: "Open",
      createdAt: Date.now(),
    };
    console.log({ poNumber: poForm.poNumber, poDate: poForm.poDate });
    addMasterPO(masterPO);

    // Create derived project PO entries
    for (const item of matchedItems) {
      const matchedProject = (projects || []).find(
        (p) =>
          p.projectName.trim().toLowerCase() === item.desc.trim().toLowerCase(),
      );
      if (!matchedProject) continue;
      addProjectPO(matchedProject.id, {
        id: `po-${Date.now()}-${matchedProject.id}`,
        poNumber: poForm.poNumber.trim(),
        poDate: poForm.poDate,
        quantity: item.qty,
        status: "Open",
        quotationId: poTargetQuotation!.id,
        sharedPoId,
      });
    }

    // Attach PO info to quotation record
    updateQuotation({
      ...poTargetQuotation!,
      recordedPO: {
        poNumber: poForm.poNumber.trim(),
        poDate: poForm.poDate,
        sharedPoId,
        files: poFiles,
      },
    } as Quotation & {
      recordedPO: {
        poNumber: string;
        poDate: string;
        sharedPoId: string;
        files: PurchaseAttachment[];
      };
    });

    toast.success(`PO recorded for ${matchedItems.length} project(s).`);
    setShowRecordPO(false);
    setPoTargetQuotation(null);
    setTimeout(() => {
      setShowRecordPO(false);
      setIsSavingPO(false);
    }, 50);
    setPoForm({ poNumber: "", poDate: "" });
    setPoFiles([]);
    setPoFormError("");
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
  const hasRecordedPO = !!(editingQuotation as any)?.recordedPO;
  const isLocked = hasRecordedPO && !forceEdit;

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
              setForceEdit(false);
              setOpen(true);
            }}
            data-ocid="quotations.create.primary_button"
          >
            <Plus className="w-4 h-4 mr-1" /> New Quotation
          </Button>
        )}
      </div>

      <div className="table-wrapper">
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
                      {rPO ? (
                        <span className="font-mono text-green-700 font-semibold">
                          {rPO.poNumber}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">\u2014</span>
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setPrintQuotation(q);
                          }}
                          title="View"
                          data-ocid={`quotations.view_button.${i + 1}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        {pEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEdit(q)}
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {pPrint && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handlePrint(q);
                            }}
                            title="Print"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {pDownload && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDownload(q);
                            }}
                            title="Download PDF"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {pShare && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleShare(q);
                            }}
                            title="Share"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {pDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => {
                              if (confirm("Delete this quotation?"))
                                deleteQuotation(q.id);
                            }}
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {pEdit &&
                          q.status === "Accepted" &&
                          !(q as any).recordedPO && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-green-700 hover:text-green-900"
                              title="Record PO"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setPoTargetQuotation(q);
                                setShowRecordPO(true);
                              }}
                              data-ocid={`quotations.record_po.button.${i + 1}`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </Button>
                          )}
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
              {editMode ? "Edit Quotation" : "New Quotation"}
              {editMode && editingQuotation && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  v{(editingQuotation as any).version || 1}
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
                  <Select
                    value={form.customerId}
                    onValueChange={(v) =>
                      setForm((p) => ({ ...p, customerId: v }))
                    }
                    disabled={isLocked}
                  >
                    <SelectTrigger
                      data-ocid="quotations.form.customer.select"
                      className="mt-1 h-8 text-sm"
                    >
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {(customers || []).map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-sm">
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                    <Button
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
                        {projectNames.length > 0 && !isLocked ? (
                          <Select
                            value={li.desc}
                            onValueChange={(val) =>
                              updateItem(idx, "desc", val)
                            }
                          >
                            <SelectTrigger className="h-7 text-xs w-full">
                              <SelectValue placeholder="Select project name" />
                            </SelectTrigger>
                            <SelectContent>
                              {projectNames.map((name) => (
                                <SelectItem
                                  key={name}
                                  value={name}
                                  className="text-xs"
                                >
                                  {name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
                <div className="flex items-center gap-2">
                  <Label className="text-xs">GST %</Label>
                  <Input
                    data-ocid="quotations.form.gst.input"
                    className="h-7 w-16 text-xs"
                    type="number"
                    value={form.gstRate}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, gstRate: +e.target.value }))
                    }
                  />
                </div>
                <div className="text-right text-sm space-y-0.5">
                  <div className="text-muted-foreground">
                    Subtotal: {fmt(subtotal)}
                  </div>
                  <div className="text-muted-foreground">
                    GST ({form.gstRate}%): {fmt(gstAmt)}
                  </div>
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
                {editMode ? "Update Quotation" : "Create Quotation"}
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
              const rPO = (
                selectedQuotation as Quotation & {
                  recordedPO?: {
                    poNumber: string;
                    poDate: string;
                    sharedPoId: string;
                    files: PurchaseAttachment[];
                  };
                }
              ).recordedPO;
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

                  {/* Recorded PO Info */}
                  {rPO && (
                    <div className="rounded-md border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 p-3">
                      <p className="text-xs font-semibold text-green-800 dark:text-green-400 mb-2">
                        Customer PO Recorded
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                        <div>
                          <span className="text-muted-foreground">
                            PO Number
                          </span>
                          <p className="font-mono font-semibold">
                            {rPO.poNumber}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">PO Date</span>
                          <p className="font-semibold">{rPO.poDate}</p>
                        </div>
                      </div>
                      {(rPO.files || []).length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {(rPO.files || []).map((f, fi) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: file list
                            <div key={fi} className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                                {f.name}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1"
                                onClick={() => openFile(f)}
                              >
                                <Eye className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1"
                                onClick={() => downloadFile(f)}
                              >
                                <Download className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

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
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          GST ({selectedQuotation.gstRate}%)
                        </span>
                        <span>{fmt(selectedQuotation.gstAmount)}</span>
                      </div>
                      <div className="flex justify-between font-bold border-t pt-1">
                        <span>Total</span>
                        <span>{fmt(selectedQuotation.totalAmount)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Audit trail — version history count */}
                  {(selectedQuotation as any).history &&
                    (selectedQuotation as any).history.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {(selectedQuotation as any).history.length} edit(s)
                        recorded in history
                      </p>
                    )}
                </div>
              );
            })()}

          <DialogFooter className="flex flex-wrap justify-end items-center gap-2">
            <div className="flex gap-2">
              {/* Record PO — only for Accepted quotations without PO, requires edit */}
              {pEdit &&
                selectedQuotation?.status === "Accepted" &&
                !(
                  selectedQuotation as Quotation & {
                    recordedPO?: { poNumber: string };
                  }
                ).recordedPO && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setPoTargetQuotation(selectedQuotation);
                      setSelectedQuotation(null);
                      setShowRecordPO(true);
                    }}
                    data-ocid="quotations.detail.record_po.primary_button"
                  >
                    Record PO
                  </Button>
                )}
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
    </div>
  );
}
