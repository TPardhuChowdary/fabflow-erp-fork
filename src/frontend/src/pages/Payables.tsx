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
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Paperclip,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { VendorSelect } from "../components/VendorSelect";
import { canCreate, canDelete, canEdit, canView } from "../permissions";
import { useStore } from "../store";
import type { Payable, PayablePayment, PaymentMode } from "../types";

const PAYMENT_TYPES = [
  "Material",
  "CNC",
  "Transport",
  "Salary",
  "Outsourcing",
  "Other",
];
const PAYMENT_MODES: PaymentMode[] = ["Cash", "Cheque", "NEFT", "RTGS", "UPI"];

function isOverdue(p: Payable): boolean {
  return (
    !!p.dueDate &&
    new Date(p.dueDate) < new Date() &&
    p.paidAmount < p.totalAmount
  );
}

function getPayableStatus(p: Payable): string {
  if (p.paidAmount >= p.totalAmount) return "Paid";
  if (isOverdue(p)) return "Overdue";
  if (p.paidAmount > 0) return "Partial";
  return "Pending";
}

function StatusBadge({ payable }: { payable: Payable }) {
  const status = getPayableStatus(payable);
  const cls: Record<string, string> = {
    Paid: "bg-green-100 text-green-800 border-green-200",
    Partial: "bg-amber-100 text-amber-800 border-amber-200",
    Pending: "bg-blue-100 text-blue-800 border-blue-200",
    Overdue: "bg-red-100 text-red-800 border-red-200",
  };
  return (
    <Badge className={`text-xs ${cls[status] ?? cls.Pending}`}>{status}</Badge>
  );
}

const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const today = () => new Date().toISOString().split("T")[0];

export function Payables() {
  const { currentUser } = useAuth();
  const pView = canView(currentUser, "payables");
  const pCreate = canCreate(currentUser, "payables");
  const pEdit = canEdit(currentUser, "payables");
  const pDelete = canDelete(currentUser, "payables");
  const {
    payables,
    payablePayments,
    projects,
    addPayable,
    deletePayable,
    addPayablePayment,
  } = useStore();

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Add Payable modal
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    vendorId: "",
    vendorName: "",
    paymentType: "Material",
    totalAmount: "",
    dueDate: "",
    projectId: "",
    notes: "",
  });

  // Add Payment modal
  const [paymentModal, setPaymentModal] = useState<{
    open: boolean;
    payable: Payable | null;
  }>({ open: false, payable: null });
  const [payForm, setPayForm] = useState({
    amount: "",
    paymentDate: today(),
    mode: "NEFT" as PaymentMode,
    referenceNo: "",
    notes: "",
  });
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(
    null,
  );
  const [attachmentType, setAttachmentType] = useState<"image" | "pdf" | null>(
    null,
  );

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isSavingPayable, setIsSavingPayable] = useState(false);
  const [isSavingPayment, setIsSavingPayment] = useState(false);

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Stats
  const totalPayables = payables.reduce((s, p) => s + p.totalAmount, 0);
  const totalPaid = payables.reduce((s, p) => s + p.paidAmount, 0);
  const totalOutstanding = totalPayables - totalPaid;
  const overdueCount = payables.filter(isOverdue).length;

  const handleAddPayable = () => {
    console.log("FORM SUBMITTED");
    if (isSavingPayable) return;
    setIsSavingPayable(true);
    try {
      if (
        (!addForm.vendorName.trim() && !addForm.vendorId) ||
        !addForm.totalAmount
      ) {
        toast.error("Vendor and total amount are required");
        return;
      }
      const total = Number.parseFloat(addForm.totalAmount);
      if (Number.isNaN(total) || total <= 0) {
        toast.error("Invalid amount");
        return;
      }
      const newPayable: Payable = {
        id: crypto.randomUUID(),
        vendorId: addForm.vendorId || undefined,
        vendorName: addForm.vendorName.trim(),
        paymentType: addForm.paymentType,
        totalAmount: total,
        paidAmount: 0,
        dueDate: addForm.dueDate,
        projectId: addForm.projectId || undefined,
        notes: addForm.notes.trim() || undefined,
        createdAt: Date.now(),
      };
      addPayable(newPayable);
      toast.success("Payable added");
      setAddOpen(false);
      setAddForm({
        vendorId: "",
        vendorName: "",
        paymentType: "Material",
        totalAmount: "",
        dueDate: "",
        projectId: "",
        notes: "",
      });
      console.log("SAVE COMPLETE");
    } finally {
      setIsSavingPayable(false);
    }
  };

  const openPaymentModal = (payable: Payable) => {
    setPaymentModal({ open: true, payable });
    setPayForm({
      amount: "",
      paymentDate: today(),
      mode: "NEFT",
      referenceNo: "",
      notes: "",
    });
    setAttachmentFile(null);
    setAttachmentPreview(null);
    setAttachmentType(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isPdf = file.type === "application/pdf";
    setAttachmentFile(file);
    setAttachmentType(isPdf ? "pdf" : "image");
    const reader = new FileReader();
    reader.onload = () => {
      setAttachmentPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleAddPayment = () => {
    console.log("FORM SUBMITTED");
    if (isSavingPayment) return;
    setIsSavingPayment(true);
    try {
      const { payable } = paymentModal;
      if (!payable) return;
      const amt = Number.parseFloat(payForm.amount);
      const balance = payable.totalAmount - payable.paidAmount;
      if (!payForm.amount || Number.isNaN(amt) || amt <= 0) {
        toast.error("Enter a valid amount");
        return;
      }
      if (amt > balance) {
        toast.error(`Amount exceeds balance of ${fmt(balance)}`);
        return;
      }
      const payment: PayablePayment = {
        id: crypto.randomUUID(),
        payableId: payable.id,
        amount: amt,
        paymentDate: payForm.paymentDate,
        mode: payForm.mode,
        referenceNo: payForm.referenceNo.trim(),
        notes: payForm.notes.trim(),
        attachmentRef: attachmentPreview ?? undefined,
        attachmentType: attachmentType ?? undefined,
        attachmentName: attachmentFile?.name ?? undefined,
        createdAt: Date.now(),
      };
      addPayablePayment(payment);
      toast.success("Payment recorded");
      setPaymentModal({ open: false, payable: null });
      console.log("SAVE COMPLETE");
    } finally {
      setIsSavingPayment(false);
    }
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    deletePayable(deleteId);
    toast.success("Payable deleted");
    setDeleteId(null);
  };

  const sorted = [...payables].sort((a, b) => b.createdAt - a.createdAt);

  if (!pView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
          <span className="text-2xl">🔒</span>
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
    <div className="space-y-4" data-ocid="payables.page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Payables</h1>
          <p className="text-sm text-muted-foreground">
            {payables.length} vendor payment{payables.length !== 1 ? "s" : ""}{" "}
            tracked
          </p>
        </div>
        {pCreate && (
          <Button
            size="sm"
            onClick={() => setAddOpen(true)}
            data-ocid="payables.primary_button"
          >
            <Plus className="w-4 h-4 mr-1" /> Add Payable
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-md border p-3 bg-muted/30">
          <div className="text-xs text-muted-foreground">Total Payables</div>
          <div className="text-lg font-bold mt-0.5">{fmt(totalPayables)}</div>
        </div>
        <div className="rounded-md border p-3 bg-green-50 border-green-200">
          <div className="text-xs text-green-700">Total Paid</div>
          <div className="text-lg font-bold mt-0.5 text-green-800">
            {fmt(totalPaid)}
          </div>
        </div>
        <div className="rounded-md border p-3 bg-amber-50 border-amber-200">
          <div className="text-xs text-amber-700">Outstanding Balance</div>
          <div className="text-lg font-bold mt-0.5 text-amber-800">
            {fmt(totalOutstanding)}
          </div>
        </div>
        <div
          className={`rounded-md border p-3 ${
            overdueCount > 0 ? "bg-red-50 border-red-200" : "bg-muted/30"
          }`}
        >
          <div
            className={`text-xs ${overdueCount > 0 ? "text-red-700" : "text-muted-foreground"}`}
          >
            Overdue
          </div>
          <div
            className={`text-lg font-bold mt-0.5 ${overdueCount > 0 ? "text-red-800" : ""}`}
          >
            {overdueCount}
          </div>
        </div>
      </div>

      {/* Overdue alert */}
      {overdueCount > 0 && (
        <div
          className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2"
          data-ocid="payables.error_state"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-700">
            <span className="font-semibold">
              {overdueCount} payable{overdueCount > 1 ? "s are" : " is"}{" "}
              overdue.
            </span>{" "}
            Please clear outstanding vendor payments at the earliest.
          </p>
        </div>
      )}

      {/* Main table */}
      <div className="table-wrapper">
        <div className="rounded-md border" data-ocid="payables.list.table">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-xs font-semibold w-6" />
                <TableHead className="text-xs font-semibold">Vendor</TableHead>
                <TableHead className="text-xs font-semibold">Type</TableHead>
                <TableHead className="text-xs font-semibold">
                  Total (₹)
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Paid (₹)
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Balance (₹)
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Due Date
                </TableHead>
                <TableHead className="text-xs font-semibold">Project</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="text-xs font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="text-center py-10 text-sm text-muted-foreground"
                    data-ocid="payables.list.empty_state"
                  >
                    No payables recorded. Click "Add Payable" to get started.
                  </TableCell>
                </TableRow>
              )}
              {sorted.map((payable, i) => {
                const balance = payable.totalAmount - payable.paidAmount;
                const expanded = expandedRows.has(payable.id);
                const project = projects.find(
                  (p) => p.id === payable.projectId,
                );
                const payments = payablePayments
                  .filter((p) => p.payableId === payable.id)
                  .sort((a, b) => b.createdAt - a.createdAt);

                return (
                  <>
                    <TableRow
                      key={payable.id}
                      data-ocid={`payables.list.row.${i + 1}`}
                    >
                      <TableCell className="pr-0">
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => toggleRow(payable.id)}
                          data-ocid={`payables.list.toggle.${i + 1}`}
                        >
                          {expanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {payable.vendorName}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs bg-muted rounded px-1.5 py-0.5 text-muted-foreground">
                          {payable.paymentType}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm font-semibold">
                        {fmt(payable.totalAmount)}
                      </TableCell>
                      <TableCell className="text-sm text-green-700 font-semibold">
                        {fmt(payable.paidAmount)}
                      </TableCell>
                      <TableCell
                        className={`text-sm font-semibold ${
                          balance > 0 ? "text-red-600" : "text-muted-foreground"
                        }`}
                      >
                        {fmt(balance)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {payable.dueDate || "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {project ? (
                          <span className="font-mono">{project.projectNo}</span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge payable={payable} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {pEdit &&
                            payable.paidAmount < payable.totalAmount && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-xs px-2 gap-1"
                                onClick={() => openPaymentModal(payable)}
                                data-ocid={`payables.list.open_modal_button.${i + 1}`}
                              >
                                <Plus className="w-3 h-3" /> Add Payment
                              </Button>
                            )}
                          {pDelete && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600"
                              onClick={() => setDeleteId(payable.id)}
                              data-ocid={`payables.list.delete_button.${i + 1}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Expanded payment history */}
                    {expanded && (
                      <TableRow key={`${payable.id}-payments`}>
                        <TableCell
                          colSpan={10}
                          className="bg-muted/20 px-6 py-3"
                        >
                          <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                            Payment History
                          </div>
                          {payable.notes && (
                            <p className="text-xs text-muted-foreground italic mb-2">
                              Note: {payable.notes}
                            </p>
                          )}
                          {payments.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">
                              No payments recorded yet
                            </p>
                          ) : (
                            <div className="table-wrapper">
                              <table
                                className="w-full text-xs"
                                style={{ minWidth: "300px" }}
                              >
                                <thead>
                                  <tr className="text-muted-foreground">
                                    <th className="text-left font-medium pb-1 w-28">
                                      Date
                                    </th>
                                    <th className="text-left font-medium pb-1 w-24">
                                      Mode
                                    </th>
                                    <th className="text-left font-medium pb-1 w-28">
                                      Amount
                                    </th>
                                    <th className="text-left font-medium pb-1 w-36">
                                      Reference
                                    </th>
                                    <th className="text-left font-medium pb-1">
                                      Attachment
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {payments.map((pay) => (
                                    <tr
                                      key={pay.id}
                                      className="border-t border-border/40"
                                    >
                                      <td className="py-1 font-mono">
                                        {pay.paymentDate}
                                      </td>
                                      <td className="py-1">
                                        <span className="bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5">
                                          {pay.mode}
                                        </span>
                                      </td>
                                      <td className="py-1 font-semibold text-green-700">
                                        {fmt(pay.amount)}
                                      </td>
                                      <td className="py-1 font-mono text-muted-foreground">
                                        {pay.referenceNo || "—"}
                                      </td>
                                      <td className="py-1">
                                        {pay.attachmentRef ? (
                                          pay.attachmentType === "image" ? (
                                            <a
                                              href={pay.attachmentRef}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                            >
                                              <img
                                                src={pay.attachmentRef}
                                                alt="attachment"
                                                className="w-12 h-12 object-cover rounded border border-border cursor-pointer hover:opacity-80 transition-opacity"
                                              />
                                            </a>
                                          ) : (
                                            <a
                                              href={pay.attachmentRef}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                                            >
                                              <Paperclip className="w-3 h-3" />
                                              {pay.attachmentName ?? "View PDF"}
                                            </a>
                                          )
                                        ) : (
                                          <span className="text-muted-foreground">
                                            —
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Add Payable Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent data-ocid="payables.dialog">
          <DialogHeader>
            <DialogTitle>Add Payable</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              console.log("FORM SUBMITTED");
              handleAddPayable();
            }}
          >
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs">Vendor *</Label>
                <VendorSelect
                  value={addForm.vendorId || undefined}
                  onChange={(id, name) =>
                    setAddForm((f) => ({
                      ...f,
                      vendorId: id,
                      vendorName: name,
                    }))
                  }
                  placeholder="Select vendor"
                  data-ocid="payables.vendor.input"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Payment Type *</Label>
                <Select
                  value={addForm.paymentType}
                  onValueChange={(v) =>
                    setAddForm((f) => ({ ...f, paymentType: v }))
                  }
                >
                  <SelectTrigger data-ocid="payables.type.select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Total Amount ₹ *</Label>
                <Input
                  type="number"
                  value={addForm.totalAmount}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, totalAmount: e.target.value }))
                  }
                  placeholder="0"
                  min="0"
                  data-ocid="payables.amount.input"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Due Date</Label>
                <Input
                  type="date"
                  value={addForm.dueDate}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, dueDate: e.target.value }))
                  }
                  data-ocid="payables.due_date.input"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Link to Project (optional)</Label>
                <Select
                  value={addForm.projectId || "none"}
                  onValueChange={(v) =>
                    setAddForm((f) => ({
                      ...f,
                      projectId: v === "none" ? "" : v,
                    }))
                  }
                >
                  <SelectTrigger data-ocid="payables.project.select">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.projectNo} — {p.projectName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  value={addForm.notes}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  placeholder="Additional notes..."
                  className="resize-none h-20"
                  data-ocid="payables.notes.textarea"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddOpen(false)}
                data-ocid="payables.dialog.cancel_button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSavingPayable}
                data-ocid="payables.dialog.submit_button"
              >
                Add Payable
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={paymentModal.open}
        onOpenChange={(o) => setPaymentModal((m) => ({ ...m, open: o }))}
      >
        <DialogContent data-ocid="payables.payment.dialog">
          <DialogHeader>
            <DialogTitle>
              Record Payment —{" "}
              <span className="font-normal text-muted-foreground">
                {paymentModal.payable?.vendorName}
              </span>
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              console.log("FORM SUBMITTED");
              handleAddPayment();
            }}
          >
            {paymentModal.payable && (
              <div className="space-y-3 py-2">
                <div className="rounded-md bg-muted/40 border px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Balance: </span>
                  <span className="font-bold text-red-600">
                    {fmt(
                      paymentModal.payable.totalAmount -
                        paymentModal.payable.paidAmount,
                    )}
                  </span>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Amount ₹ *</Label>
                  <Input
                    type="number"
                    value={payForm.amount}
                    onChange={(e) =>
                      setPayForm((f) => ({ ...f, amount: e.target.value }))
                    }
                    placeholder="0"
                    min="0"
                    max={
                      paymentModal.payable.totalAmount -
                      paymentModal.payable.paidAmount
                    }
                    data-ocid="payables.payment.amount.input"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Payment Date *</Label>
                  <Input
                    type="date"
                    value={payForm.paymentDate}
                    onChange={(e) =>
                      setPayForm((f) => ({ ...f, paymentDate: e.target.value }))
                    }
                    data-ocid="payables.payment.date.input"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Payment Mode</Label>
                  <Select
                    value={payForm.mode}
                    onValueChange={(v) =>
                      setPayForm((f) => ({ ...f, mode: v as PaymentMode }))
                    }
                  >
                    <SelectTrigger data-ocid="payables.payment.mode.select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_MODES.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Reference No.</Label>
                  <Input
                    value={payForm.referenceNo}
                    onChange={(e) =>
                      setPayForm((f) => ({ ...f, referenceNo: e.target.value }))
                    }
                    placeholder="UTR / Cheque No."
                    data-ocid="payables.payment.reference.input"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Notes</Label>
                  <Textarea
                    value={payForm.notes}
                    onChange={(e) =>
                      setPayForm((f) => ({ ...f, notes: e.target.value }))
                    }
                    placeholder="Optional notes..."
                    className="resize-none h-16"
                    data-ocid="payables.payment.notes.textarea"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">
                    Attachment (PDF / JPG / PNG)
                  </Label>
                  <Input
                    type="file"
                    accept=".pdf,image/jpeg,image/png,.jpg,.png"
                    onChange={handleFileSelect}
                    className="text-xs"
                    data-ocid="payables.payment.upload_button"
                  />
                  {attachmentPreview && attachmentType === "image" && (
                    <img
                      src={attachmentPreview}
                      alt="preview"
                      className="mt-1 w-24 h-24 object-cover rounded border border-border"
                    />
                  )}
                  {attachmentPreview && attachmentType === "pdf" && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-blue-600">
                      <Paperclip className="w-3 h-3" />
                      {attachmentFile?.name}
                    </div>
                  )}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPaymentModal({ open: false, payable: null })}
                data-ocid="payables.payment.cancel_button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSavingPayment}
                data-ocid="payables.payment.submit_button"
              >
                Record Payment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleteId}
        onOpenChange={(o) => {
          if (!o) setDeleteId(null);
        }}
      >
        <DialogContent data-ocid="payables.delete.dialog">
          <DialogHeader>
            <DialogTitle>Delete Payable</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Are you sure you want to delete this payable? All associated payment
            records will also be removed.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteId(null)}
              data-ocid="payables.delete.cancel_button"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={confirmDelete}
              data-ocid="payables.delete.confirm_button"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
