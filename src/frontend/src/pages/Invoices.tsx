import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
  Eye,
  Pencil,
  Plus,
  Printer,
  Search,
  Share2,
  Trash2,
} from "lucide-react";
import { ShieldOff } from "lucide-react";
import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { InvoicePrintView } from "../components/InvoicePrintView";
import { StatusBadge } from "../components/StatusBadge";
import { InvoiceDocContent } from "../lib/documentRenderers";
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
import type { InvLineItem, Invoice, InvoiceStatus } from "../types";

const newItem = (): InvLineItem => ({
  desc: "",
  hsn: "",
  qty: 1,
  rate: 0,
  amount: 0,
});

const emptyForm = () => ({
  customerId: "",
  projectId: "",
  dcId: "",
  lineItems: [newItem()],
  cgstRate: 9,
  sgstRate: 9,
  igstRate: 0,
  invoiceDate: "",
  dueDate: "",
  paymentTerms: "30 days",
  deliveryVehicleNo: "",
  deliveryDestination: "",
  poNumber: "",
  poDate: "",
  linkedPoId: "",
  invoiceType: "tax" as "tax" | "proforma",
  buyerGstin: "",
  buyerAddress: "",
  buyerStateName: "",
  buyerStateCode: "",
  reminderEnabled: true,
  reminderIntervalDays: 5,
  reminderFrequencyDays: 5,
  invoiceNumber: "",
  selectedEmail: "",
});

export function Invoices() {
  function daysBetween(date?: string): number {
    if (!date) return 0;
    const now = new Date();
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return 0;
    return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  }

  function previewInvNo(): string {
    const year = new Date().getFullYear();
    const maxNum = (invoices || []).reduce((max, inv) => {
      const match = inv.invNo?.match(/INV-\d{4}-(\d+)/);
      return match ? Math.max(max, Number.parseInt(match[1])) : max;
    }, 0);
    return `INV-${year}-${String(maxNum + 1).padStart(3, "0")}`;
  }

  const { currentUser } = useAuth();
  const pCreate = canCreate(currentUser, "invoices");
  const pEdit = canEdit(currentUser, "invoices");
  const pDelete = canDelete(currentUser, "invoices");
  const pView = canView(currentUser, "invoices");
  const pPrint = canPrint(currentUser, "invoices");
  const pDownload = canDownload(currentUser, "invoices");
  const pShare = canShare(currentUser, "invoices");

  const {
    invoices,
    deliveryChallans,
    customers,
    projects,
    quotations,
    addInvoice,
    updateInvoice,
    deleteInvoice,
    settings,
  } = useStore();
  const [open, setOpen] = useState(false);
  const [selectedQuotationId, setSelectedQuotationId] = useState("");
  const [form, setForm] = useState(emptyForm());
  const [search, setSearch] = useState("");
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  async function handleDownload(inv: Invoice) {
    const container = document.createElement("div");
    container.style.cssText =
      "position:fixed;top:0;left:-9999px;width:800px;background:#fff;z-index:9999";
    document.body.appendChild(container);
    const root = createRoot(container);
    const docId = `pdf-content-${inv.id}`;
    const cust = (customers || []).find((c) => c.id === inv.customerId) ?? null;
    flushSync(() => {
      root.render(
        <InvoiceDocContent
          id={docId}
          invoice={inv}
          customer={cust}
          settings={settings as unknown as Record<string, string>}
        />,
      );
    });
    try {
      triggerDownload(docId, `Invoice_${inv.invNo ?? inv.id}.pdf`);
    } catch (e) {
      console.error("DOWNLOAD FAILED", e);
    } finally {
      root.unmount();
      container.remove();
    }
  }

  function handleShare(inv) {
    openShareModalV2(
      () =>
        `Document No: ${inv.invNo}\nAmount: ₹${inv.totalAmount ?? 0}\nLink: ${window.location.href}`,
    );
  }

  async function handlePrint(inv: Invoice) {
    const container = document.createElement("div");
    container.style.cssText =
      "position:fixed;top:0;left:-9999px;width:800px;background:#fff;z-index:9999";
    document.body.appendChild(container);
    const root = createRoot(container);
    const docId = `pdf-content-${inv.id}`;
    const cust = (customers || []).find((c) => c.id === inv.customerId) ?? null;
    flushSync(() => {
      root.render(
        <InvoiceDocContent
          id={docId}
          invoice={inv}
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
      `<html><head><title>Invoice</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#000;background:#fff;}table{border-collapse:collapse;width:100%;}@page{size:A4;margin:15mm;}@media print{body{padding:0;}}</style></head><body>${content}</body></html>`,
    );
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleAfterSave = () => {
    setOpen(false);
    setForm(emptyForm());
    setEditingInvoice(null);
    setIsSaving(false);
    setTimeout(() => setOpen(false), 0);
  };

  // All project names for Description dropdown
  const projectNames = (projects || [])
    .map((p) => p.projectName)
    .filter(Boolean);

  const sorted = [...(invoices || [])].sort(
    (a, b) => b.createdAt - a.createdAt,
  );

  const filtered = sorted.filter((inv) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const cust = customers.find((c) => c.id === inv.customerId);
    return (
      (cust?.name.toLowerCase().includes(q) ?? false) ||
      (inv.invNo?.toLowerCase().includes(q) ?? false) ||
      (inv.poNumber?.toLowerCase().includes(q) ?? false)
    );
  });

  const updateItem = (
    i: number,
    field: keyof InvLineItem,
    val: string | number,
  ) => {
    setForm((p) => {
      const items = [...p.lineItems];
      items[i] = { ...items[i], [field]: val };
      if (field === "qty" || field === "rate")
        items[i].amount = items[i].qty * items[i].rate;
      return { ...p, lineItems: items };
    });
  };

  const subtotal = form.lineItems.reduce((s, li) => s + li.amount, 0);

  // Part 3: DC quantity control
  const selectedDC = (deliveryChallans || []).find((dc) => dc.id === form.dcId);
  const availableQty = selectedDC
    ? (selectedDC.projectEntries || []).reduce(
        (sum, e) => sum + ((e as { dispatchQty?: number }).dispatchQty || 0),
        0,
      )
    : null;
  const cgstAmt = Math.round((subtotal * form.cgstRate) / 100);
  const sgstAmt = Math.round((subtotal * form.sgstRate) / 100);
  const igstAmt = Math.round((subtotal * form.igstRate) / 100);
  const total = subtotal + cgstAmt + sgstAmt + igstAmt;

  const handleEdit = (inv: Invoice) => {
    setForm({
      customerId: inv.customerId ?? "",
      projectId: inv.projectId ?? "",
      dcId: inv.dcId ?? "",
      lineItems: inv.lineItems ?? [newItem()],
      cgstRate: inv.cgstRate ?? 9,
      sgstRate: inv.sgstRate ?? 9,
      igstRate: inv.igstRate ?? 0,
      invoiceDate: inv.invoiceDate ?? "",
      dueDate: inv.dueDate ?? "",
      paymentTerms: inv.paymentTerms ?? "30 days",
      deliveryVehicleNo: inv.deliveryVehicleNo ?? "",
      deliveryDestination: inv.deliveryDestination ?? "",
      poNumber: inv.poNumber ?? "",
      poDate: inv.poDate ?? "",
      linkedPoId: (inv as any).linkedPoId ?? "",
      invoiceType: inv.invoiceType ?? "tax",
      buyerGstin: inv.buyerGstin ?? "",
      buyerAddress: inv.buyerAddress ?? "",
      buyerStateName: inv.buyerStateName ?? "",
      buyerStateCode: inv.buyerStateCode ?? "",
      reminderEnabled: inv.reminderEnabled ?? true,
      reminderIntervalDays: inv.reminderIntervalDays ?? 5,
      reminderFrequencyDays: (inv as any).reminderFrequencyDays ?? 5,
      invoiceNumber: inv.invNo ?? "",
      selectedEmail: inv.selectedEmail ?? "",
    });
    setEditingInvoice(inv);
    setOpen(true);
  };

  const handleSave = () => {
    console.log("FORM SUBMITTED");
    if (isSaving) return;
    setIsSaving(true);
    try {
      console.log("Creating invoice:", form);
      if (!form.customerId) {
        toast.error("Select customer");
        setIsSaving(false);
        return;
      }
      // Validate against DC quantity
      if (form.dcId && availableQty !== null) {
        const totalInvoiceQty = form.lineItems.reduce(
          (s, li) => s + (li.qty || 0),
          0,
        );
        if (totalInvoiceQty > availableQty) {
          toast.error("Cannot invoice more than dispatched quantity");
          setIsSaving(false);
          return;
        }
      }
      if (form.projectId) {
        const selectedProj = (projects || []).find(
          (p) => p.id === form.projectId,
        );
        if (selectedProj && selectedProj.totalQty == null) {
          toast.error(
            "Selected project has no Total Quantity set. Please update the project first.",
          );
          setIsSaving(false);
          return;
        }
      }
      // Derive invoice number: use user-provided or generate preview
      const invNoToUse = (form as any).invoiceNumber?.trim() || previewInvNo();
      // Validate no duplicate (only on create)
      if (!editingInvoice) {
        const duplicate = (invoices || []).find((i) => i.invNo === invNoToUse);
        if (duplicate) {
          toast.error(
            `Invoice number ${invNoToUse} already exists. Please use a different number.`,
          );
          setIsSaving(false);
          return;
        }
      }
      // Derive selectedEmail
      const selectedCust =
        (customers || []).find((c) => c.id === form.customerId) ?? null;
      const selectedEmailToSave =
        (form as any).selectedEmail ||
        selectedCust?.primaryEmail ||
        selectedCust?.email ||
        "";

      if (editingInvoice) {
        updateInvoice({
          ...editingInvoice,
          dcId: form.dcId,
          customerId: form.customerId,
          projectId: form.projectId,
          lineItems: form.lineItems,
          subtotal,
          cgstRate: form.cgstRate,
          sgstRate: form.sgstRate,
          igstRate: form.igstRate,
          cgstAmt,
          sgstAmt,
          igstAmt,
          totalAmount: total,
          invoiceDate: form.invoiceDate,
          dueDate: form.dueDate,
          paymentTerms: form.paymentTerms,
          deliveryVehicleNo: form.deliveryVehicleNo,
          deliveryDestination: form.deliveryDestination,
          poNumber: form.poNumber,
          poDate: form.poDate,
          buyerGstin: form.buyerGstin,
          buyerAddress: form.buyerAddress,
          buyerStateName: form.buyerStateName,
          buyerStateCode: form.buyerStateCode,
          invoiceType: form.invoiceType ?? "tax",
          selectedEmail: selectedEmailToSave,
        });
        toast.success("Invoice updated");
      } else {
        addInvoice({
          id: crypto.randomUUID(),
          invNo: invNoToUse,
          invoiceNumber: invNoToUse,
          dcId: form.dcId,
          customerId: form.customerId,
          projectId: form.projectId,
          lineItems: form.lineItems,
          subtotal,
          cgstRate: form.cgstRate,
          sgstRate: form.sgstRate,
          igstRate: form.igstRate,
          cgstAmt,
          sgstAmt,
          igstAmt,
          totalAmount: total,
          invoiceDate: form.invoiceDate,
          dueDate: form.dueDate,
          paymentTerms: form.paymentTerms,
          status: "Unpaid",
          paidAmount: 0,
          deliveryVehicleNo: form.deliveryVehicleNo,
          deliveryDestination: form.deliveryDestination,
          poNumber: form.poNumber,
          poDate: form.poDate,
          buyerGstin: form.buyerGstin,
          buyerAddress: form.buyerAddress,
          buyerStateName: form.buyerStateName,
          buyerStateCode: form.buyerStateCode,
          invoiceType: form.invoiceType ?? "tax",
          selectedEmail: selectedEmailToSave,
          createdAt: Date.now(),
          reminderEnabled: (form as any).reminderEnabled ?? true,
          reminderIntervalDays: (form as any).reminderIntervalDays ?? 5,
          reminderFrequencyDays: (form as any).reminderFrequencyDays ?? 5,
          nextReminderAt: form.dueDate || new Date().toISOString(),
          lastReminderSentAt: null,
          reminderCount: 0,
        });
        toast.success(`Invoice ${invNoToUse} created`);
      }
      handleAfterSave();
      console.log("SAVE COMPLETE");
    } finally {
      setIsSaving(false);
    }
  };

  const updateStatus = (id: string, status: InvoiceStatus) => {
    if (!pEdit) {
      toast.error("Access restricted: edit permission required");
      return;
    }
    const inv = (invoices || []).find((x) => x.id === id);
    if (inv) {
      updateInvoice({
        ...inv,
        status,
        ...(status === "Paid" ? { reminderEnabled: false } : {}),
      });
      toast.success("Status updated");
    }
  };

  const fmt = (n: number) => `₹${(n ?? 0).toLocaleString("en-IN")}`;

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
    <div className="space-y-4" data-ocid="invoices.page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">GST Invoices</h1>
          <p className="text-sm text-muted-foreground">
            {(invoices || []).length} invoices
          </p>
        </div>
        {pCreate && (
          <Button
            size="sm"
            onClick={() => {
              setForm({ ...emptyForm(), invoiceNumber: previewInvNo() });
              setOpen(true);
            }}
            data-ocid="invoices.create.primary_button"
          >
            <Plus className="w-4 h-4 mr-1" /> New Invoice
          </Button>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          data-ocid="invoices.search_input"
          className="pl-8 h-8 text-sm"
          placeholder="Search by customer, invoice no, PO no..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Mobile card layout (< md) */}
      <div className="md:hidden space-y-3" data-ocid="invoices.list.cards">
        {filtered.map((inv, i) => {
          const cust = customers.find((c) => c.id === inv.customerId);
          return (
            <div
              key={inv.id}
              className="rounded-lg border bg-card p-4 shadow-sm"
              data-ocid={`invoices.list.item.${i + 1}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-mono font-bold text-sm">
                    {inv.invNo ?? "—"}
                  </div>
                  <div className="text-base font-semibold mt-0.5">
                    {cust?.name ?? "—"}
                  </div>
                </div>
                <StatusBadge status={inv.status} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                <div>
                  <div className="text-xs text-muted-foreground">Date</div>
                  <div className="text-sm font-medium">
                    {inv.invoiceDate ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Amount</div>
                  <div className="text-sm font-semibold">
                    {fmt(inv.totalAmount ?? 0)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Paid</div>
                  <div className="text-sm font-medium text-green-600">
                    {fmt(inv.paidAmount ?? 0)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">PO No.</div>
                  <div className="text-sm font-mono">{inv.poNumber || "—"}</div>
                </div>
              </div>
              {(() => {
                const daysAfterDue = daysBetween(inv.dueDate);
                if (daysAfterDue > 0 && inv.status !== "Paid") {
                  return (
                    <div className="text-xs text-red-600 font-medium mt-1">
                      {daysAfterDue} days overdue
                    </div>
                  );
                }
                return null;
              })()}
              <div className="flex items-center justify-between border-t pt-3">
                {inv.invoiceType !== "proforma" && (
                  <Select
                    value={inv.status}
                    disabled={!pEdit}
                    onValueChange={(v) =>
                      updateStatus(inv.id, v as InvoiceStatus)
                    }
                  >
                    <SelectTrigger
                      className="h-8 text-xs w-32"
                      disabled={!pEdit}
                      data-ocid={`invoices.status.select.${i + 1}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        ["Unpaid", "PartiallyPaid", "Paid"] as InvoiceStatus[]
                      ).map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">
                          {s === "PartiallyPaid" ? "Partially Paid" : s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <div className="flex gap-1 ml-auto">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setViewInvoice(inv);
                    }}
                    title="View"
                    data-ocid={`invoices.view_button.${i + 1}`}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  {pEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10"
                      onClick={() => handleEdit(inv)}
                      title="Edit"
                      data-ocid={`invoices.edit_button.${i + 1}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  )}
                  {pPrint && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handlePrint(inv);
                      }}
                      title="Print"
                      data-ocid={`invoices.print_button.${i + 1}`}
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
                        e.preventDefault();
                        e.stopPropagation();
                        handleDownload(inv);
                      }}
                      title="Download PDF"
                      data-ocid={`invoices.download_button.${i + 1}`}
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
                        e.preventDefault();
                        e.stopPropagation();
                        handleShare(inv);
                      }}
                      title="Share"
                      data-ocid={`invoices.share_button.${i + 1}`}
                    >
                      <Share2 className="w-4 h-4" />
                    </Button>
                  )}
                  {pDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (window.confirm("Delete this invoice?"))
                          deleteInvoice(inv.id);
                      }}
                      title="Delete"
                      data-ocid={`invoices.delete_button.${i + 1}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div
            className="text-center py-10 text-sm text-muted-foreground"
            data-ocid="invoices.list.empty_state"
          >
            No invoices found
          </div>
        )}
      </div>

      {/* Desktop table (>= md) */}
      <div className="table-wrapper">
        <div
          className="hidden md:block rounded-md border"
          data-ocid="invoices.list.table"
        >
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-xs font-semibold">INV No.</TableHead>
                <TableHead className="text-xs font-semibold">
                  Customer
                </TableHead>
                <TableHead className="text-xs font-semibold">PO No.</TableHead>
                <TableHead className="text-xs font-semibold">
                  Invoice Date
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Due Date
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Delay Info
                </TableHead>
                <TableHead className="text-xs font-semibold">Total</TableHead>
                <TableHead className="text-xs font-semibold">Paid</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="text-xs font-semibold w-36">
                  Update
                </TableHead>
                <TableHead className="text-xs font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((inv, i) => {
                const cust = customers.find((c) => c.id === inv.customerId);
                return (
                  <TableRow
                    key={inv.id}
                    data-ocid={`invoices.list.row.${i + 1}`}
                  >
                    <TableCell className="text-xs font-mono font-semibold">
                      {inv.invNo ?? "\u2014"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {cust?.name ?? "\u2014"}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {inv.poNumber || "\u2014"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {inv.invoiceDate ?? "\u2014"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {inv.dueDate ?? "\u2014"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {(() => {
                        const daysAfterDelivery = daysBetween(
                          (inv as any).deliveryDate,
                        );
                        const daysAfterDue = daysBetween(inv.dueDate);
                        return (
                          <div className="space-y-0.5">
                            {daysAfterDelivery > 0 && (
                              <div className="text-muted-foreground">
                                {daysAfterDelivery}d since delivery
                              </div>
                            )}
                            {daysAfterDue > 0 && inv.status !== "Paid" && (
                              <div className="text-red-600 font-medium">
                                {daysAfterDue}d overdue
                              </div>
                            )}
                            {daysAfterDelivery === 0 && daysAfterDue === 0 && (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-sm font-semibold">
                      {fmt(inv.totalAmount ?? 0)}
                    </TableCell>
                    <TableCell className="text-sm text-green-600">
                      {fmt(inv.paidAmount ?? 0)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={inv.status} />
                    </TableCell>
                    <TableCell>
                      {inv.invoiceType === "proforma" ? (
                        <span className="text-xs text-muted-foreground italic">
                          Document only
                        </span>
                      ) : (
                        <Select
                          value={inv.status}
                          disabled={!pEdit}
                          onValueChange={(v) =>
                            updateStatus(inv.id, v as InvoiceStatus)
                          }
                        >
                          <SelectTrigger
                            className="h-6 text-xs w-32"
                            disabled={!pEdit}
                            data-ocid={`invoices.status.select.${i + 1}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(
                              [
                                "Unpaid",
                                "PartiallyPaid",
                                "Paid",
                              ] as InvoiceStatus[]
                            ).map((s) => (
                              <SelectItem key={s} value={s} className="text-xs">
                                {s === "PartiallyPaid" ? "Partially Paid" : s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
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
                            setViewInvoice(inv);
                          }}
                          title="View"
                          data-ocid={`invoices.list.edit_button.${i + 1}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        {pEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleEdit(inv)}
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
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handlePrint(inv);
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
                              handleDownload(inv);
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
                              handleShare(inv);
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
                              if (confirm("Delete this invoice?"))
                                deleteInvoice(inv.id);
                            }}
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="text-center py-8 text-sm text-muted-foreground"
                    data-ocid="invoices.list.empty_state"
                  >
                    No invoices
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Print View Dialog */}
      <InvoicePrintView
        invoice={viewInvoice}
        customer={
          customers.find((c) => c.id === viewInvoice?.customerId) ?? null
        }
        open={!!viewInvoice}
        onClose={() => {
          setViewInvoice(null);
        }}
      />

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setEditingInvoice(null);
            setForm(emptyForm());
          }
        }}
      >
        <DialogContent
          className="max-w-4xl w-[95vw]"
          data-ocid="invoices.dialog"
        >
          <DialogHeader>
            <DialogTitle>
              {editingInvoice ? "Edit Invoice" : "New GST Invoice"}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              console.log("FORM SUBMITTED");
              handleSave();
            }}
          >
            <div className="modal-body">
              <div className="form-grid mt-2">
                {/* Invoice Number */}
                <div>
                  <Label className="text-xs">Invoice Number</Label>
                  <Input
                    data-ocid="invoices.form.invoiceNumber.input"
                    className="mt-1 h-8 text-sm"
                    value={(form as any).invoiceNumber || ""}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, invoiceNumber: e.target.value }))
                    }
                    placeholder="INV-2026-001"
                  />
                </div>

                {/* Invoice Type Toggle */}
                <div className="col-span-2">
                  <Label className="text-xs">Invoice Type</Label>
                  <div className="flex gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() =>
                        setForm((p) => ({ ...p, invoiceType: "tax" }))
                      }
                      className={`px-4 py-1.5 rounded text-xs font-semibold border transition-colors ${(form.invoiceType ?? "tax") === "tax" ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:bg-muted"}`}
                      data-ocid="invoices.form.tax_invoice.toggle"
                    >
                      Tax Invoice
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((p) => ({ ...p, invoiceType: "proforma" }))
                      }
                      className={`px-4 py-1.5 rounded text-xs font-semibold border transition-colors ${form.invoiceType === "proforma" ? "bg-orange-500 text-white border-orange-500" : "bg-background text-muted-foreground border-border hover:bg-muted"}`}
                      data-ocid="invoices.form.proforma_invoice.toggle"
                    >
                      Proforma Invoice
                    </button>
                  </div>
                </div>
                {/* Quotation — optional, auto-fills PO + line items */}
                <div className="col-span-3">
                  <Label className="text-xs">Select Quotation (optional)</Label>
                  <Select
                    value={selectedQuotationId}
                    onValueChange={(v) => {
                      setSelectedQuotationId(v);
                      const qt = (quotations || []).find((q) => q.id === v);
                      if (!qt) return;
                      const poNumber = qt.recordedPO?.poNumber || "";
                      const poDate = qt.recordedPO?.poDate || "";
                      const newItems =
                        (qt.lineItems || []).length > 0
                          ? (qt.lineItems || []).map((li) => ({
                              desc: li.desc,
                              hsn: li.hsn || "",
                              qty: li.qty,
                              rate: li.unitPrice || 0,
                              amount: li.qty * (li.unitPrice || 0),
                            }))
                          : undefined;
                      setForm((p) => {
                        const custId =
                          p.customerId || qt.customerId || p.customerId;
                        const cust = (customers || []).find(
                          (c) => c.id === custId,
                        );
                        return {
                          ...p,
                          poNumber,
                          poDate,
                          lineItems: newItems ?? p.lineItems,
                          customerId: custId,
                          deliveryDestination:
                            p.deliveryDestination || cust?.address || "",
                          buyerGstin: cust?.gstin || p.buyerGstin,
                          buyerAddress: cust?.address || p.buyerAddress,
                          buyerStateName: cust?.stateName || p.buyerStateName,
                          buyerStateCode: cust?.stateCode || p.buyerStateCode,
                        };
                      });
                    }}
                  >
                    <SelectTrigger
                      data-ocid="invoices.form.quotation.select"
                      className="mt-1 h-8 text-sm"
                    >
                      <SelectValue placeholder="Select quotation to auto-fill..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(quotations || [])
                        .filter(
                          (q) =>
                            q.status === "Accepted" ||
                            q.status === "Sent" ||
                            q.status === "Draft",
                        )
                        .map((q) => {
                          const cust = (customers || []).find(
                            (c) => c.id === q.customerId,
                          );
                          return (
                            <SelectItem
                              key={q.id}
                              value={q.id}
                              className="text-sm"
                            >
                              {q.qtNo} — {cust?.name || "Unknown"}{" "}
                              {q.status !== "Accepted" ? `(${q.status})` : ""}
                            </SelectItem>
                          );
                        })}
                    </SelectContent>
                  </Select>
                </div>
                {/* Customer — full width, auto-fills buyer fields */}
                <div className="col-span-3">
                  <Label className="text-xs">Customer *</Label>
                  <Select
                    value={form.customerId}
                    onValueChange={(v) => {
                      const cust = customers.find((c) => c.id === v);
                      setForm((p) => ({
                        ...p,
                        customerId: v,
                        deliveryDestination:
                          p.deliveryDestination || cust?.address || "",
                        buyerGstin: cust?.gstin || "",
                        buyerAddress: cust?.address || "",
                        buyerStateName: cust?.stateName || "",
                        buyerStateCode: cust?.stateCode || "",
                        selectedEmail: cust?.primaryEmail || cust?.email || "",
                      }));
                    }}
                  >
                    <SelectTrigger
                      data-ocid="invoices.form.customer.select"
                      className="mt-1 h-8 text-sm"
                    >
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-sm">
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Email selector — shown when customer has emails[] */}
                {(() => {
                  const selectedCustomer =
                    (customers || []).find((c) => c.id === form.customerId) ??
                    null;
                  if (
                    !selectedCustomer ||
                    !selectedCustomer.emails ||
                    selectedCustomer.emails.length === 0
                  )
                    return null;
                  return (
                    <div className="col-span-3">
                      <Label className="text-xs">Send Invoice To (Email)</Label>
                      <select
                        className="mt-1 flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={
                          (form as any).selectedEmail ||
                          selectedCustomer.primaryEmail ||
                          ""
                        }
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            selectedEmail: e.target.value,
                          }))
                        }
                        data-ocid="invoices.form.email.select"
                      >
                        {(selectedCustomer.emails || []).map((e) => (
                          <option key={e.email} value={e.email}>
                            {e.email} ({e.type})
                            {e.email === selectedCustomer.primaryEmail
                              ? " — Primary"
                              : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })()}
                <div>
                  <Label className="text-xs">Project (optional)</Label>
                  <Select
                    value={form.projectId || ""}
                    onValueChange={(v) => {
                      setForm((p) => ({
                        ...p,
                        projectId: v,
                        linkedPoId: "",
                        poNumber: "",
                        poDate: "",
                      }));
                    }}
                  >
                    <SelectTrigger
                      data-ocid="invoices.form.project.select"
                      className="mt-1 h-8 text-sm"
                    >
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {(projects || []).map((p) => (
                        <SelectItem key={p.id} value={p.id} className="text-sm">
                          {p.projectName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.projectId &&
                    (() => {
                      const selectedProj = (projects || []).find(
                        (p) => p.id === form.projectId,
                      );
                      if (selectedProj && selectedProj.totalQty == null) {
                        return (
                          <p className="text-xs text-yellow-600 mt-1">
                            ⚠ This project has no Total Quantity set. Invoice
                            creation is blocked.
                          </p>
                        );
                      }
                      return null;
                    })()}
                </div>
                <div>
                  <Label className="text-xs">Delivery Challan</Label>
                  <Select
                    value={form.dcId}
                    onValueChange={(v) => setForm((p) => ({ ...p, dcId: v }))}
                  >
                    <SelectTrigger
                      data-ocid="invoices.form.dc.select"
                      className="mt-1 h-8 text-sm"
                    >
                      <SelectValue placeholder="Select DC" />
                    </SelectTrigger>
                    <SelectContent>
                      {(deliveryChallans || []).map((d) => (
                        <SelectItem key={d.id} value={d.id} className="text-sm">
                          {d.dcNo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Invoice Date</Label>
                  <Input
                    data-ocid="invoices.form.invoiceDate.input"
                    type="date"
                    className="mt-1 h-8 text-sm"
                    value={form.invoiceDate}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, invoiceDate: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Due Date (internal)</Label>
                  <Input
                    data-ocid="invoices.form.dueDate.input"
                    type="date"
                    className="mt-1 h-8 text-sm"
                    value={form.dueDate}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, dueDate: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Delivery Vehicle No.</Label>
                  <Input
                    data-ocid="invoices.form.deliveryVehicleNo.input"
                    className="mt-1 h-8 text-sm"
                    placeholder="e.g. MH12AB1234"
                    value={form.deliveryVehicleNo}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        deliveryVehicleNo: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Delivery Destination</Label>
                  <Input
                    data-ocid="invoices.form.deliveryDestination.input"
                    className="mt-1 h-8 text-sm"
                    placeholder="Delivery address"
                    value={form.deliveryDestination}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        deliveryDestination: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">PO Number</Label>
                  <Input
                    data-ocid="invoices.form.poNumber.input"
                    className="mt-1 h-8 text-sm"
                    placeholder="Customer PO number"
                    value={form.poNumber}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, poNumber: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">PO Date</Label>
                  <Input
                    data-ocid="invoices.form.poDate.input"
                    type="date"
                    className="mt-1 h-8 text-sm"
                    value={form.poDate}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, poDate: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Reminder Frequency</Label>
                  <Select
                    value={String((form as any).reminderFrequencyDays || 5)}
                    onValueChange={(v) =>
                      setForm((f: any) => ({
                        ...f,
                        reminderFrequencyDays: Number(v),
                      }))
                    }
                  >
                    <SelectTrigger
                      className="mt-1 h-8 text-xs"
                      data-ocid="invoices.form.reminderFrequency.select"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">Every 5 days</SelectItem>
                      <SelectItem value="10">Every 10 days</SelectItem>
                      <SelectItem value="15">Every 15 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Customer Additional Details — read-only display */}
              {form.customerId &&
                (() => {
                  const selectedCust = (customers || []).find(
                    (c) => c.id === form.customerId,
                  );
                  const details = selectedCust?.additionalDetails || [];
                  if (details.length === 0) return null;
                  return (
                    <div className="mt-2 rounded-md border px-3 py-2 bg-muted/30">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                        Additional Details
                      </p>
                      <div className="flex gap-4 flex-wrap">
                        {details.map((entry, i) => (
                          <div
                            // biome-ignore lint/suspicious/noArrayIndexKey: stable list
                            key={i}
                            className="flex gap-1 text-xs"
                          >
                            <span className="text-muted-foreground">
                              {entry.key}:
                            </span>
                            <span>{entry.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

              <div className="mt-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-semibold">Line Items</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() =>
                      setForm((p) => ({
                        ...p,
                        lineItems: [...p.lineItems, newItem()],
                      }))
                    }
                    data-ocid="invoices.form.add_item.button"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add
                  </Button>
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
                    <span>Rate</span>
                    <span>Amount</span>
                  </div>

                  {form.lineItems.map((li, idx) => (
                    <div
                      // biome-ignore lint/suspicious/noArrayIndexKey: form items use index
                      key={`row-form-${idx}`}
                      className="line-item"
                      data-ocid={`invoices.form.item.${idx + 1}`}
                    >
                      {/* Description */}
                      <div>
                        <span className="line-item-label">Description</span>
                        {projectNames.length > 0 ? (
                          <Select
                            value={li.desc}
                            onValueChange={(v) => updateItem(idx, "desc", v)}
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
                              updateItem(idx, "desc", e.target.value)
                            }
                            placeholder="Description"
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
                            updateItem(idx, "hsn", e.target.value)
                          }
                          placeholder="HSN"
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
                            updateItem(idx, "qty", +e.target.value)
                          }
                        />
                      </div>
                      {/* Rate */}
                      <div>
                        <span className="line-item-label">Rate</span>
                        <Input
                          className="h-7 text-xs"
                          type="number"
                          value={li.rate ?? ""}
                          onChange={(e) =>
                            updateItem(idx, "rate", +e.target.value)
                          }
                        />
                      </div>
                      {/* Amount + Delete */}
                      <div className="flex items-end gap-1 justify-between sm:flex-col sm:items-end">
                        <span className="text-xs font-semibold">
                          {fmt(li.amount)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-1"
                          onClick={() =>
                            setForm((p) => ({
                              ...p,
                              lineItems: p.lineItems.filter(
                                (_, j) => j !== idx,
                              ),
                            }))
                          }
                          data-ocid={`invoices.form.delete_item.${idx + 1}`}
                        >
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-4 items-end mt-2">
                <div className="flex gap-2">
                  <div>
                    <Label className="text-[10px]">CGST%</Label>
                    <Input
                      data-ocid="invoices.form.cgst.input"
                      className="h-7 w-14 text-xs mt-0.5"
                      type="number"
                      value={form.cgstRate}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, cgstRate: +e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">SGST%</Label>
                    <Input
                      data-ocid="invoices.form.sgst.input"
                      className="h-7 w-14 text-xs mt-0.5"
                      type="number"
                      value={form.sgstRate}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, sgstRate: +e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">IGST%</Label>
                    <Input
                      data-ocid="invoices.form.igst.input"
                      className="h-7 w-14 text-xs mt-0.5"
                      type="number"
                      value={form.igstRate}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, igstRate: +e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="ml-auto text-right text-sm space-y-0.5">
                  <div className="text-muted-foreground">
                    Subtotal: {fmt(subtotal)}
                  </div>
                  {cgstAmt > 0 && (
                    <div className="text-muted-foreground">
                      CGST: {fmt(cgstAmt)}
                    </div>
                  )}
                  {sgstAmt > 0 && (
                    <div className="text-muted-foreground">
                      SGST: {fmt(sgstAmt)}
                    </div>
                  )}
                  {igstAmt > 0 && (
                    <div className="text-muted-foreground">
                      IGST: {fmt(igstAmt)}
                    </div>
                  )}
                  <div className="font-bold text-base">Total: {fmt(total)}</div>
                  {total > 50000 && (
                    <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <span className="mt-0.5 text-base leading-none">
                        &#9888;&#65039;
                      </span>
                      <div className="flex-1">
                        <p className="font-semibold">E-Way Bill Required</p>
                        <p className="mt-0.5 text-amber-700">
                          Invoice amount exceeds ₹50,000. An E-Way Bill is
                          mandatory for this shipment.
                        </p>
                      </div>
                      <a
                        href="https://ewaybillgst.gov.in"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 shrink-0 rounded bg-amber-600 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-700"
                      >
                        Generate E-Way Bill ↗
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* end modal-body */}
            <div className="modal-footer">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setOpen(false)}
                data-ocid="invoices.form.cancel_button"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                type="submit"
                disabled={isSaving}
                data-ocid="invoices.form.submit_button"
              >
                {isSaving ? "Saving..." : "Create Invoice"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
