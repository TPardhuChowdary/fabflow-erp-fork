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
import { Textarea } from "@/components/ui/textarea";
import {
  Download,
  Eye,
  FileText,
  Paperclip,
  Pencil,
  Plus,
  Printer,
  Share2,
  ShieldOff,
  Trash2,
  X,
} from "lucide-react";
import React, { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { CompanyPOPrintView } from "../components/CompanyPOPrintView";
import { CompanyPODocContent } from "../lib/documentRenderers";
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
  CompanyPO,
  CompanyPOItem,
  CompanyPOStatus,
  PurchaseAttachment,
} from "../types";

const STATUS_COLORS: Record<CompanyPOStatus, string> = {
  Draft: "bg-muted text-muted-foreground",
  Sent: "bg-blue-100 text-blue-700",
  Received: "bg-green-100 text-green-700",
};

type FormState = {
  vendorId: string;
  vendorName: string;
  vendorAddress: string;
  vendorGst: string;
  vendorContact: string;
  deliveryAddress: string;
  expectedDeliveryDate: string;
  status: CompanyPOStatus;
  gstPercent: number;
  termsAndConditions: string;
  notes: string;
};

const emptyForm = (): FormState => ({
  vendorId: "",
  vendorName: "",
  vendorAddress: "",
  vendorGst: "",
  vendorContact: "",
  deliveryAddress: "",
  expectedDeliveryDate: "",
  status: "Draft",
  gstPercent: 0,
  termsAndConditions: "",
  notes: "",
});

const emptyItem = (): CompanyPOItem => ({
  id: `item-${Date.now()}-${Math.random()}`,
  description: "",
  quantity: 1,
  unit: "nos",
  rate: 0,
  amount: 0,
});

class CompanyPOErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center">
          <h2 className="text-lg font-semibold mb-2">
            Company PO failed to load
          </h2>
          <p className="text-muted-foreground mb-4">
            There was a rendering error. Please refresh.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="px-4 py-2 bg-primary text-primary-foreground rounded"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function CompanyPOsInner() {
  const { currentUser } = useAuth();
  const pCreate = canCreate(currentUser, "company_po");
  const pEdit = canEdit(currentUser, "company_po");
  const pDelete = canDelete(currentUser, "company_po");
  const pPrint = canPrint(currentUser, "company_po");
  const pDownload = canDownload(currentUser, "company_po");
  const pShare = canShare(currentUser, "company_po");

  const {
    companyPOs,
    addCompanyPO,
    updateCompanyPO,
    deleteCompanyPO,
    vendors,
    settings,
  } = useStore();

  const safePos = companyPOs || [];
  const safeVendors = vendors || [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [viewPO, setViewPO] = useState<CompanyPO | null>(null);
  async function handleDownload(po: CompanyPO) {
    const container = document.createElement("div");
    container.style.cssText =
      "position:fixed;top:0;left:-9999px;width:800px;background:#fff;z-index:9999";
    document.body.appendChild(container);
    const root = createRoot(container);
    const docId = `pdf-content-${po.id}`;
    flushSync(() => {
      root.render(
        <CompanyPODocContent
          id={docId}
          po={po}
          settings={settings as unknown as Record<string, string>}
        />,
      );
    });
    try {
      triggerDownload(docId, `PO_${po.cpoNumber ?? po.id}.pdf`);
    } catch (e) {
      console.error("DOWNLOAD FAILED", e);
    } finally {
      root.unmount();
      container.remove();
    }
  }

  function handleShare(po) {
    openShareModalV2(
      () =>
        `Document No: ${po.cpoNumber}\nAmount: ₹${po.grandTotal ?? 0}\nLink: ${window.location.href}`,
    );
  }

  async function handlePrint(po: CompanyPO) {
    const container = document.createElement("div");
    container.style.cssText =
      "position:fixed;top:0;left:-9999px;width:800px;background:#fff;z-index:9999";
    document.body.appendChild(container);
    const root = createRoot(container);
    const docId = `pdf-content-${po.id}`;
    flushSync(() => {
      root.render(
        <CompanyPODocContent
          id={docId}
          po={po}
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
      `<html><head><title>Purchase Order</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#000;background:#fff;}table{border-collapse:collapse;width:100%;}@page{size:A4;margin:15mm;}@media print{body{padding:0;}}</style></head><body>${content}</body></html>`,
    );
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }
  const [editing, setEditing] = useState<CompanyPO | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formItems, setFormItems] = useState<CompanyPOItem[]>([emptyItem()]);
  const [formFile, setFormFile] = useState<PurchaseAttachment | undefined>(
    undefined,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const genCpoNumber = () => {
    const nums = safePos.map((p) => {
      const m = (p.cpoNumber || "").match(/CPO-(\d+)/);
      return m ? Number.parseInt(m[1]) : 0;
    });
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return `CPO-${String(next).padStart(3, "0")}`;
  };

  const subtotal = formItems.reduce((s, i) => s + i.quantity * i.rate, 0);
  const gstAmount = subtotal * ((form.gstPercent || 0) / 100);
  const grandTotal = subtotal + gstAmount;

  const openNew = () => {
    setEditing(null);
    const defaultForm = emptyForm();
    defaultForm.termsAndConditions = settings.companyPOTerms || "";
    setForm(defaultForm);
    setFormItems([emptyItem()]);
    setFormFile(undefined);
    setDialogOpen(true);
  };

  const openEdit = (po: CompanyPO) => {
    setEditing(po);
    setForm({
      vendorId: po.vendorId || "",
      vendorName: po.vendorName,
      vendorAddress: po.vendorAddress || "",
      vendorGst: po.vendorGst || "",
      vendorContact: po.vendorContact || "",
      deliveryAddress: po.deliveryAddress || "",
      expectedDeliveryDate: po.expectedDeliveryDate || "",
      status: po.status,
      gstPercent: po.gstPercent || 0,
      termsAndConditions: po.termsAndConditions || "",
      notes: po.notes || "",
    });
    setFormItems((po.items || []).map((i) => ({ ...i })));
    setFormFile(po.file);
    setDialogOpen(true);
  };

  const addItem = () => setFormItems((prev) => [...prev, emptyItem()]);

  const updateItem = (
    id: string,
    field: keyof CompanyPOItem,
    value: string | number,
  ) => {
    setFormItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };
        if (field === "quantity" || field === "rate") {
          updated.amount = updated.quantity * updated.rate;
        }
        return updated;
      }),
    );
  };

  const removeItem = (id: string) =>
    setFormItems((prev) => prev.filter((i) => i.id !== id));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const ref = reader.result as string;
      const type: "image" | "pdf" =
        file.type === "application/pdf" ? "pdf" : "image";
      setFormFile({ ref, type, name: file.name });
    };
    reader.readAsDataURL(file);
  };

  const openFile = (file: PurchaseAttachment) => {
    try {
      const byteString = atob(file.ref.split(",")[1]);
      const mimeString = file.ref.split(",")[0].split(":")[1].split(";")[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++)
        ia[i] = byteString.charCodeAt(i);
      const blob = new Blob([ab], { type: mimeString });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch {
      toast.error("File not available");
    }
  };

  const downloadFile = (file: PurchaseAttachment) => {
    try {
      const a = document.createElement("a");
      a.href = file.ref;
      a.download = file.name;
      a.click();
    } catch {
      toast.error("File not available");
    }
  };

  const handleSave = () => {
    console.log("FORM SUBMITTED");
    if (isSaving) return;
    setIsSaving(true);
    try {
      if (editing && !pEdit) {
        alert("Access restricted");
        return;
      }
      if (!editing && !pCreate) {
        alert("Access restricted");
        return;
      }
      if (!form.vendorName.trim()) {
        toast.error("Vendor name is required.");
        return;
      }
      if (
        formItems.length === 0 ||
        !formItems.some((i) => i.description.trim())
      ) {
        toast.error("At least one item with a description is required.");
        return;
      }

      const itemsWithAmounts = formItems.map((i) => ({
        ...i,
        amount: i.quantity * i.rate,
      }));
      const computedSubtotal = itemsWithAmounts.reduce(
        (s, i) => s + i.amount,
        0,
      );
      const computedGst = computedSubtotal * ((form.gstPercent || 0) / 100);
      const computedGrand = computedSubtotal + computedGst;

      if (editing) {
        updateCompanyPO({
          ...editing,
          ...form,
          items: itemsWithAmounts,
          subtotal: computedSubtotal,
          gstAmount: computedGst,
          grandTotal: computedGrand,
          file: formFile,
        });
        toast.success("PO updated.");
      } else {
        addCompanyPO({
          id: `cpo-${Date.now()}`,
          cpoNumber: genCpoNumber(),
          ...form,
          items: itemsWithAmounts,
          subtotal: computedSubtotal,
          gstAmount: computedGst,
          grandTotal: computedGrand,
          file: formFile,
          createdAt: Date.now(),
        });
        toast.success("PO created.");
      }
      setDialogOpen(false);
      console.log("SAVE COMPLETE");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    if (!pDelete) {
      alert("Access restricted");
      return;
    }
    if (!window.confirm("Delete this Purchase Order?")) return;
    deleteCompanyPO(id);
    toast.success("PO deleted.");
  };

  const fmt = (n: number) =>
    (Number(n) || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  if (!canView(currentUser, "company_po")) {
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
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        data-ocid="company-po.section"
      >
        <div>
          <h1 className="text-2xl font-bold">Company Purchase Orders</h1>
          <p className="text-muted-foreground text-sm">
            Manage outgoing POs issued to vendors
          </p>
        </div>
        {pCreate && (
          <Button onClick={openNew} data-ocid="company-po.primary_button">
            <Plus className="w-4 h-4 mr-2" />
            New PO
          </Button>
        )}
      </div>

      {/* List */}
      {safePos.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-20 text-muted-foreground"
          data-ocid="company-po.empty_state"
        >
          <FileText className="w-12 h-12 mb-3 opacity-30" />
          <p className="font-medium">No purchase orders yet</p>
          <p className="text-sm">
            Create your first Company PO to get started.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile card layout */}
          <div
            className="md:hidden space-y-3"
            data-ocid="company-po.list.cards"
          >
            {safePos.map((po, idx) => (
              <div
                key={po.id}
                className="rounded-lg border bg-card p-4 shadow-sm"
                data-ocid={`company-po.item.${idx + 1}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-mono font-bold text-sm">
                      {po.cpoNumber}
                    </div>
                    <div className="text-base font-semibold mt-0.5">
                      {po.vendorName}
                    </div>
                  </div>
                  <Badge
                    className={
                      STATUS_COLORS[po.status] ||
                      "bg-muted text-muted-foreground"
                    }
                  >
                    {po.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Total</div>
                    <div className="text-sm font-semibold">
                      ₹{fmt(po.grandTotal)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Items</div>
                    <div className="text-sm">
                      {(po.items || []).length} item(s)
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Delivery
                    </div>
                    <div className="text-sm">
                      {po.expectedDeliveryDate || "—"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-1 border-t pt-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10"
                    onClick={() => {
                      setViewPO(po);
                    }}
                    title="View"
                    data-ocid={`company-po.view_button.${idx + 1}`}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  {pEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10"
                      onClick={() => openEdit(po)}
                      title="Edit"
                      data-ocid={`company-po.edit_button.${idx + 1}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  )}
                  {pPrint && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10"
                      onClick={() => {
                        handlePrint(po);
                      }}
                      title="Print"
                      data-ocid={`company-po.print_button.${idx + 1}`}
                    >
                      <Printer className="w-4 h-4" />
                    </Button>
                  )}
                  {pDownload && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(po);
                      }}
                      title="Download PDF"
                      data-ocid={`company-po.download_button.${idx + 1}`}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  )}
                  {pShare && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleShare(po);
                      }}
                      title="Share"
                      data-ocid={`company-po.share_button.${idx + 1}`}
                    >
                      <Share2 className="w-4 h-4" />
                    </Button>
                  )}
                  {pDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(po.id)}
                      title="Delete"
                      data-ocid={`company-po.delete_button.${idx + 1}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="table-wrapper">
            <div
              className="hidden md:block border rounded-lg overflow-hidden"
              data-ocid="company-po.table"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO Number</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Grand Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Delivery Date</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {safePos.map((po, idx) => (
                    <TableRow
                      key={po.id}
                      data-ocid={`company-po.item.${idx + 1}`}
                    >
                      <TableCell className="font-mono font-semibold">
                        {po.cpoNumber}
                      </TableCell>
                      <TableCell>{po.vendorName}</TableCell>
                      <TableCell>{(po.items || []).length} item(s)</TableCell>
                      <TableCell>₹{fmt(po.grandTotal)}</TableCell>
                      <TableCell>
                        <Badge
                          className={
                            STATUS_COLORS[po.status] ||
                            "bg-muted text-muted-foreground"
                          }
                        >
                          {po.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{po.expectedDeliveryDate || "—"}</TableCell>
                      <TableCell>
                        {po.file ? (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openFile(po.file!)}
                              title="View file"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => downloadFile(po.file!)}
                              title="Download"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setViewPO(po);
                            }}
                            title="View"
                            data-ocid={`company-po.edit_button.${idx + 1}`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          {pEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openEdit(po)}
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {pPrint && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                handlePrint(po);
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
                                e.stopPropagation();
                                handleDownload(po);
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
                                e.stopPropagation();
                                handleShare(po);
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
                              onClick={() => handleDelete(po.id)}
                              title="Delete"
                              data-ocid={`company-po.delete_button.${idx + 1}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}

      <CompanyPOPrintView
        po={viewPO}
        open={!!viewPO}
        onClose={() => {
          setViewPO(null);
        }}
      />

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="max-w-3xl max-h-[90vh] overflow-y-auto"
          data-ocid="company-po.dialog"
        >
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Purchase Order" : "New Company Purchase Order"}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              console.log("FORM SUBMITTED");
              handleSave();
            }}
          >
            <div className="space-y-5">
              {/* Vendor Selection */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Vendor</h3>
                {safeVendors.length > 0 && (
                  <div>
                    <Label>Select Vendor</Label>
                    <Select
                      value={form.vendorId}
                      onValueChange={(val) => {
                        const v = safeVendors.find((x) => x.id === val);
                        if (v) {
                          setForm((f) => ({
                            ...f,
                            vendorId: v.id,
                            vendorName: v.name,
                            vendorAddress: v.address || "",
                            vendorGst: v.gstNumber || "",
                            vendorContact: v.phone || "",
                          }));
                        }
                      }}
                    >
                      <SelectTrigger data-ocid="company-po.select">
                        <SelectValue placeholder="Choose vendor..." />
                      </SelectTrigger>
                      <SelectContent>
                        {safeVendors.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Vendor Name *</Label>
                    <Input
                      value={form.vendorName}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, vendorName: e.target.value }))
                      }
                      placeholder="Vendor name"
                      data-ocid="company-po.input"
                    />
                  </div>
                  <div>
                    <Label>Vendor GST</Label>
                    <Input
                      value={form.vendorGst}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, vendorGst: e.target.value }))
                      }
                      placeholder="GST number"
                    />
                  </div>
                </div>
                <div>
                  <Label>Vendor Address</Label>
                  <Textarea
                    rows={2}
                    value={form.vendorAddress}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, vendorAddress: e.target.value }))
                    }
                    placeholder="Vendor address"
                    data-ocid="company-po.textarea"
                  />
                </div>
                <div>
                  <Label>Vendor Contact</Label>
                  <Input
                    value={form.vendorContact}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, vendorContact: e.target.value }))
                    }
                    placeholder="Phone / email"
                  />
                </div>
              </div>

              {/* Delivery */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Delivery Details</h3>
                <div>
                  <Label>Delivery Address</Label>
                  <Textarea
                    rows={2}
                    value={form.deliveryAddress}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        deliveryAddress: e.target.value,
                      }))
                    }
                    placeholder="Delivery address"
                  />
                </div>
                <div>
                  <Label>Expected Delivery Date</Label>
                  <Input
                    type="date"
                    value={form.expectedDeliveryDate}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        expectedDeliveryDate: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              {/* Items */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Items</h3>
                  <Button variant="outline" size="sm" onClick={addItem}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Item
                  </Button>
                </div>
                <div className="table-wrapper">
                  <div className="border rounded overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Description</TableHead>
                          <TableHead className="w-20">Qty</TableHead>
                          <TableHead className="w-20">Unit</TableHead>
                          <TableHead className="w-24">Rate</TableHead>
                          <TableHead className="w-24">Amount</TableHead>
                          <TableHead className="w-8" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {formItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="p-1">
                              <Input
                                value={item.description}
                                onChange={(e) =>
                                  updateItem(
                                    item.id,
                                    "description",
                                    e.target.value,
                                  )
                                }
                                placeholder="Description"
                                className="h-8"
                              />
                            </TableCell>
                            <TableCell className="p-1">
                              <Input
                                type="number"
                                min={0}
                                value={item.quantity}
                                onChange={(e) =>
                                  updateItem(
                                    item.id,
                                    "quantity",
                                    Number(e.target.value),
                                  )
                                }
                                className="h-8"
                              />
                            </TableCell>
                            <TableCell className="p-1">
                              <Input
                                value={item.unit}
                                onChange={(e) =>
                                  updateItem(item.id, "unit", e.target.value)
                                }
                                className="h-8"
                              />
                            </TableCell>
                            <TableCell className="p-1">
                              <Input
                                type="number"
                                min={0}
                                value={item.rate}
                                onChange={(e) =>
                                  updateItem(
                                    item.id,
                                    "rate",
                                    Number(e.target.value),
                                  )
                                }
                                className="h-8"
                              />
                            </TableCell>
                            <TableCell className="p-1 text-right text-sm">
                              ₹{fmt(item.quantity * item.rate)}
                            </TableCell>
                            <TableCell className="p-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => removeItem(item.id)}
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-72 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>₹{fmt(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">GST %</span>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={form.gstPercent}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          gstPercent: Number(e.target.value),
                        }))
                      }
                      className="h-7 w-20 text-right"
                    />
                    <span className="text-sm">₹{fmt(gstAmount)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm border-t pt-1">
                    <span>Grand Total</span>
                    <span>₹{fmt(grandTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Terms */}
              <div>
                <Label>Terms & Conditions</Label>
                <Textarea
                  rows={3}
                  value={form.termsAndConditions}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      termsAndConditions: e.target.value,
                    }))
                  }
                  placeholder="Payment terms, delivery conditions, etc."
                />
              </div>

              {/* Status */}
              <div>
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(val) =>
                    setForm((f) => ({ ...f, status: val as CompanyPOStatus }))
                  }
                >
                  <SelectTrigger data-ocid="company-po.select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Sent">Sent</SelectItem>
                    <SelectItem value="Received">Received</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* File Attachment */}
              <div>
                <Label>File Attachment (optional)</Label>
                <div className="flex items-center gap-3 mt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    data-ocid="company-po.upload_button"
                  >
                    <Paperclip className="w-3.5 h-3.5 mr-1" /> Attach File
                  </Button>
                  {formFile && (
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" />
                      {formFile.name}
                      <button
                        type="button"
                        onClick={() => setFormFile(undefined)}
                        className="ml-1 text-destructive hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <Label>Notes (optional)</Label>
                <Textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  placeholder="Internal notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                data-ocid="company-po.cancel_button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSaving}
                data-ocid="company-po.submit_button"
              >
                {editing ? "Update PO" : "Create PO"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CompanyPOs() {
  return (
    <CompanyPOErrorBoundary>
      <CompanyPOsInner />
    </CompanyPOErrorBoundary>
  );
}
