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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Bell,
  ChevronDown,
  ChevronUp,
  Loader2,
  Mail,
  MessageSquare,
  Paperclip,
  Plus,
} from "lucide-react";
import React from "react";
import { useRef } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { StatusBadge } from "../components/StatusBadge";
import {
  canCreate,
  canDelete,
  canEdit,
  canUpload,
  canView,
} from "../permissions";
import { useStore } from "../store";
import type { PaymentMode, ReminderMethod, ReminderType } from "../types";

const MODES: PaymentMode[] = ["Cash", "Cheque", "NEFT", "RTGS", "UPI"];
const REMINDER_TYPES: ReminderType[] = ["Manual", "Follow-up", "Final Notice"];
const REMINDER_METHODS: ReminderMethod[] = ["WhatsApp", "Email"];

function isOverdue(
  inv: { dueDate: string; status: string } | undefined | null,
): boolean {
  if (!inv) return false;
  return (
    !!inv.dueDate && new Date(inv.dueDate) < new Date() && inv.status !== "Paid"
  );
}
function getReminderTone(count: number): { subject: string; message: string } {
  if (count === 0) {
    return {
      subject: "Friendly Reminder",
      message:
        "Dear {name},\n\nHope you are doing well.\n\nThis is a gentle reminder that Invoice {invoice} of {amount} is due on {due}.\n\nKindly make the payment at your convenience.\n\nThank you.",
    };
  }
  if (count === 1) {
    return {
      subject: "Payment Follow-up",
      message:
        "Dear {name},\n\nThis is a follow-up regarding Invoice {invoice} of {amount}, which was due on {due}.\n\nWe request you to process the payment at the earliest.\n\nThank you.",
    };
  }
  return {
    subject: "Final Reminder",
    message:
      "Dear {name},\n\nThis is a final reminder for Invoice {invoice} of {amount}, overdue since {due}.\n\nWe request immediate payment to avoid further action.\n\nThank you.",
  };
}

function getSuggestion(inv: any): { label: string; color: string } {
  if (!inv)
    return {
      label: "Gentle Reminder",
      color: "text-green-700 bg-green-50 border-green-200",
    };
  const today = new Date();
  const due = new Date(inv.dueDate || new Date());
  const overdue = Math.floor(
    (today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24),
  );
  const count = inv.reminderCount || 0;
  if (count >= 2 || overdue > 5)
    return {
      label: "Final Notice",
      color: "text-red-700 bg-red-50 border-red-200",
    };
  if (count === 1 || overdue > 0)
    return {
      label: "Follow-up",
      color: "text-yellow-700 bg-yellow-50 border-yellow-200",
    };
  return {
    label: "Gentle Reminder",
    color: "text-green-700 bg-green-50 border-green-200",
  };
}

function isDueToday(inv: any): boolean {
  if (!inv) return false;
  if (inv.status === "Paid") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = getNextReminderDate(inv);
  next.setHours(0, 0, 0, 0);
  return next.getTime() === today.getTime();
}

function getSuggestedLabel(inv: any): { label: string; color: string } {
  return getSuggestion(inv);
}

function canSendReminder(inv: any): boolean {
  if (!inv) return false;
  const next = getNextReminderDate(inv);
  const today = new Date();
  if (today < next) {
    return window.confirm(
      `Next reminder is scheduled for ${next.toDateString()}.\n\nDo you still want to send now?`,
    );
  }
  return true;
}

function getNextReminderDate(inv: any): Date {
  if (inv.nextReminderCustomDate) {
    return new Date(inv.nextReminderCustomDate);
  }
  if (inv.nextReminderAt) {
    return new Date(inv.nextReminderAt);
  }
  if (!inv.lastReminderSentAt)
    return inv.dueDate ? new Date(inv.dueDate) : new Date();
  const last = new Date(inv.lastReminderSentAt);
  const next = new Date(last);
  const freq = inv.reminderFrequencyDays || 5;
  next.setDate(last.getDate() + freq);
  return next;
}

function isReminderDue(inv: any): boolean {
  if (!inv) return false;
  if (!inv.reminderEnabled) return false;
  if (inv.status === "Paid") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = getNextReminderDate(inv);
  next.setHours(0, 0, 0, 0);
  return today >= next;
}

function updateFrequency(
  inv: any,
  value: string,
  updateInvoiceFn: (inv: any) => void,
) {
  updateInvoiceFn({ ...inv, reminderFrequencyDays: Number(value) });
}

function sendEmailReminder(inv: any, updateInvoiceFn: (inv: any) => void) {
  if (!inv) return;
  const tone = getReminderTone(inv.reminderCount || 0);
  const subject = encodeURIComponent(`${tone.subject} - Invoice ${inv.invNo}`);
  const body = encodeURIComponent(
    tone.message
      .replace("{name}", inv.customerName || "")
      .replace("{invoice}", inv.invNo)
      .replace("{amount}", `₹${(inv.totalAmount || 0).toLocaleString("en-IN")}`)
      .replace("{due}", inv.dueDate || ""),
  );
  const email = inv.email || "";
  window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  updateInvoiceFn({
    ...inv,
    reminderCount: (inv.reminderCount || 0) + 1,
    lastReminderSentAt: new Date().toISOString(),
    nextReminderCustomDate: null,
  });
}

function getMethodIcon(method: ReminderMethod) {
  if (method === "WhatsApp") return <MessageSquare className="w-3 h-3" />;
  return <Mail className="w-3 h-3" />;
}

function getStatusColor(status: string) {
  switch (status) {
    case "Sent":
      return "bg-green-100 text-green-700 border-green-200";
    case "Failed":
      return "bg-red-100 text-red-700 border-red-200";
    case "Not Configured":
      return "bg-gray-100 text-gray-600 border-gray-200";
    default:
      return "bg-blue-100 text-blue-700 border-blue-200";
  }
}

function PaymentsInner() {
  const { currentUser } = useAuth();
  const pView = canView(currentUser, "payments");
  const pCreate = canCreate(currentUser, "payments");
  const pEdit = canEdit(currentUser, "payments");
  const pDelete = canDelete(currentUser, "payments");
  // Reserved for future edit/delete actions on payments
  void pEdit;
  void pDelete;
  const {
    payments = [],
    invoices = [],
    customers = [],
    addPayment,
    updateInvoice,
    reminderLogs = [],
    addReminderLog,
  } = useStore();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    invoiceId: "",
    amount: "",
    paymentDate: "",
    mode: "NEFT" as PaymentMode,
    referenceNo: "",
    notes: "",
  });
  const [paymentFiles, setPaymentFiles] = useState<
    Array<{ name: string; url: string; type: string }>
  >([]);
  const paymentFileRef = useRef<HTMLInputElement>(null);
  const pUpload = canUpload(currentUser, "payments");

  // Reminder modal state
  const [reminderModal, setReminderModal] = useState<{
    open: boolean;
    invoiceId: string;
    invNo: string;
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    dueDate: string;
    balance: number;
  }>({
    open: false,
    invoiceId: "",
    invNo: "",
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    dueDate: "",
    balance: 0,
  });
  const [reminderType, setReminderType] = useState<ReminderType>("Manual");
  const [reminderMethod, setReminderMethod] =
    useState<ReminderMethod>("WhatsApp");
  const [isSending, setIsSending] = useState(false);
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [customReminderDate, setCustomReminderDate] = useState<string>("");

  // Expanded rows for reminder log sub-panel
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  console.log("Invoices:", invoices);
  console.log("Payments:", payments);

  if (
    !Array.isArray(payments) ||
    !Array.isArray(invoices) ||
    !Array.isArray(reminderLogs)
  ) {
    return (
      <div className="p-4 text-muted-foreground">Loading payment data...</div>
    );
  }

  const sorted = [...payments].sort((a, b) => b.createdAt - a.createdAt);
  const unpaid = invoices.filter(
    (i) => i.status !== "Paid" && (i.invoiceType ?? "tax") !== "proforma",
  );

  const getDefaultMethod = (): ReminderMethod => "WhatsApp";

  const handleSave = () => {
    console.log("FORM SUBMITTED");
    if (isSavingPayment) return;
    setIsSavingPayment(true);
    try {
      if (!form.invoiceId || !form.amount) {
        toast.error("Invoice and amount required");
        return;
      }
      const amt = Number.parseFloat(form.amount);
      const invoiceForCheck = invoices.find((i) => i.id === form.invoiceId);
      if (invoiceForCheck) {
        const remaining =
          (invoiceForCheck.totalAmount ?? 0) -
          (invoiceForCheck.paidAmount ?? 0);
        if (amt > remaining + 0.001) {
          toast.error(
            `Amount exceeds remaining balance of ₹${remaining.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
          );
          return;
        }
      }
      addPayment({
        id: crypto.randomUUID(),
        invoiceId: form.invoiceId,
        amount: amt,
        paymentDate: form.paymentDate,
        mode: form.mode,
        referenceNo: form.referenceNo,
        notes: form.notes,
        createdAt: Date.now(),
        files: paymentFiles.length > 0 ? [...paymentFiles] : undefined,
      });
      // Update invoice paid amount & status
      const inv = invoices.find((i) => i.id === form.invoiceId);
      if (inv) {
        const newPaid = inv.paidAmount + amt;
        const status = newPaid >= inv.totalAmount ? "Paid" : "PartiallyPaid";
        updateInvoice({ ...inv, paidAmount: newPaid, status });
      }
      toast.success("Payment recorded");
      setOpen(false);
      setPaymentFiles([]);
      setForm({
        invoiceId: "",
        amount: "",
        paymentDate: "",
        mode: "NEFT",
        referenceNo: "",
        notes: "",
      });
      console.log("SAVE COMPLETE");
    } finally {
      setIsSavingPayment(false);
    }
  };

  const handleSendReminder = async () => {
    setIsSending(true);
    const {
      invoiceId,
      invNo,
      customerName,
      customerPhone,
      customerEmail,
      dueDate,
      balance,
    } = reminderModal;
    const method = reminderMethod;

    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) {
      setIsSending(false);
      return;
    }

    const invWithEmail = { ...inv, email: customerEmail, customerName };

    if (!canSendReminder(invWithEmail)) {
      setIsSending(false);
      return;
    }

    let status: "Sent" | "Failed" | "Not Configured" = "Sent";
    let errorMsg: string | undefined;

    try {
      if (method === "WhatsApp") {
        const tonePrefix =
          reminderType === "Final Notice"
            ? "FINAL NOTICE: "
            : reminderType === "Follow-up"
              ? "Follow-up: "
              : "";
        const msg = `${tonePrefix}Hi, this is a reminder for pending payment.\n\nInvoice: ${invNo}\nAmount: ₹${balance.toLocaleString("en-IN")}\nDue Date: ${dueDate}\n\nPlease clear the payment at the earliest.`;
        const url = `https://wa.me/${customerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
        window.open(url, "_blank");
      } else if (method === "Email") {
        sendEmailReminder(invWithEmail, () => {});
      }

      const freq = (inv as any).reminderFrequencyDays || 5;
      const nextAt = customReminderDate
        ? new Date(customReminderDate)
        : (() => {
            const d = new Date();
            d.setDate(d.getDate() + freq);
            return d;
          })();
      updateInvoice({
        ...inv,
        lastReminderSentAt: new Date().toISOString(),
        reminderCount: (inv.reminderCount || 0) + 1,
        nextReminderCustomDate: null,
        nextReminderAt: nextAt.toISOString(),
      } as any);

      addReminderLog({
        id: crypto.randomUUID(),
        invoiceId,
        date: new Date().toISOString().split("T")[0],
        method,
        type: reminderType,
        status,
        createdAt: Date.now(),
      });

      toast.success(`Reminder sent via ${method}`);
    } catch (err: any) {
      errorMsg = err?.message ?? "Unknown error";
      status = "Failed";
      toast.error(`Reminder failed: ${errorMsg}`);
    } finally {
      setIsSending(false);
      setReminderModal({
        open: false,
        invoiceId: "",
        invNo: "",
        customerName: "",
        customerPhone: "",
        customerEmail: "",
        dueDate: "",
        balance: 0,
      });
      setReminderType("Manual");
      setReminderMethod(getDefaultMethod());
      setCustomReminderDate("");
    }
  };

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  // Receivables stats
  const pendingCount = invoices.filter(
    (i) =>
      (i.status === "Unpaid" || i.status === "PartiallyPaid") &&
      (i.invoiceType ?? "tax") !== "proforma",
  ).length;
  const overdueCount = invoices.filter(
    (i) => isOverdue(i) && (i.invoiceType ?? "tax") !== "proforma",
  ).length;

  const nonProformaInvoices = invoices.filter(
    (i) => (i.invoiceType ?? "tax") !== "proforma",
  );
  const paidInvoicesWithCount = nonProformaInvoices.filter(
    (i) => i.status === "Paid",
  );
  const avgReminders =
    paidInvoicesWithCount.length > 0
      ? (
          paidInvoicesWithCount.reduce(
            (sum, i) => sum + ((i as any).reminderCount || 0),
            0,
          ) / paidInvoicesWithCount.length
        ).toFixed(1)
      : "0.0";
  const reminderOverdueCount = nonProformaInvoices.filter((i) =>
    isOverdue(i),
  ).length;
  const highReminderCases = nonProformaInvoices.filter(
    (i) => ((i as any).reminderCount || 0) >= 3,
  ).length;

  const getStatusBadge = (inv: (typeof invoices)[0]) => {
    if (inv.status === "Paid")
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">
          Paid
        </Badge>
      );
    if (isOverdue(inv))
      return (
        <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">
          Overdue
        </Badge>
      );
    if (inv.status === "PartiallyPaid")
      return (
        <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
          Partial
        </Badge>
      );
    return (
      <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs">
        Unpaid
      </Badge>
    );
  };

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
    <div className="space-y-4" data-ocid="payments.page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Payment Tracking</h1>
          <p className="text-sm text-muted-foreground">
            {payments.length} payments recorded
          </p>
        </div>
        {pCreate && (
          <Button
            size="sm"
            onClick={() => setOpen(true)}
            data-ocid="payments.create.primary_button"
          >
            <Plus className="w-4 h-4 mr-1" /> Record Payment
          </Button>
        )}
      </div>

      <Tabs defaultValue="payments">
        <TabsList className="h-8">
          <TabsTrigger
            value="payments"
            className="text-xs"
            data-ocid="payments.tab"
          >
            Payments
          </TabsTrigger>
          <TabsTrigger
            value="receivables"
            className="text-xs"
            data-ocid="receivables.tab"
          >
            Receivables
          </TabsTrigger>
        </TabsList>

        {/* ── Payments Tab ── */}
        <TabsContent value="payments" className="mt-3 space-y-3">
          {/* Pending invoices summary */}
          {unpaid.length > 0 && (
            <div className="rounded-md border p-3 bg-amber-50 border-amber-200">
              <div className="text-xs font-semibold text-amber-800 mb-2">
                {unpaid.length} invoice(s) with pending payment
              </div>
              <div className="flex flex-wrap gap-2">
                {unpaid.map((inv) => {
                  const cust = customers.find((c) => c.id === inv.customerId);
                  const balance =
                    (inv.totalAmount ?? 0) - (inv.paidAmount ?? 0);
                  return (
                    <div
                      key={inv.id}
                      className="text-xs bg-white rounded border border-amber-200 px-2 py-1"
                    >
                      <span className="font-mono font-semibold">
                        {inv.invNo}
                      </span>
                      <span className="text-muted-foreground ml-1">
                        {cust?.name}
                      </span>
                      <span className="text-red-600 font-semibold ml-2">
                        {fmt(balance)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Mobile card layout */}
          <div className="md:hidden space-y-3" data-ocid="payments.list.cards">
            {sorted.map((p, i) => {
              const inv = invoices.find((x) => x.id === p.invoiceId);
              const cust = customers.find((c) => c.id === inv?.customerId);
              return (
                <div
                  key={p.id}
                  className="rounded-lg border bg-card p-4 shadow-sm"
                  data-ocid={`payments.list.item.${i + 1}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {inv?.invNo ?? "—"}
                      </div>
                      <div className="text-base font-semibold">
                        {cust?.name ?? "—"}
                      </div>
                    </div>
                    {inv && <StatusBadge status={inv.status} />}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <div className="text-xs text-muted-foreground">Date</div>
                      <div className="text-sm font-medium">{p.paymentDate}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">
                        Amount
                      </div>
                      <div className="text-sm font-semibold text-green-700">
                        {fmt(p.amount)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Mode</div>
                      <div className="text-sm">
                        <span className="bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 text-xs">
                          {p.mode}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">
                        Reference
                      </div>
                      <div className="text-sm font-mono">
                        {p.referenceNo || "—"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {sorted.length === 0 && (
              <div
                className="text-center py-10 text-sm text-muted-foreground"
                data-ocid="payments.list.empty_state"
              >
                No payments recorded
              </div>
            )}
          </div>

          {/* Desktop table */}
          <div className="table-wrapper">
            <div
              className="hidden md:block rounded-md border"
              data-ocid="payments.list.table"
            >
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-xs font-semibold">
                      Date
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Invoice No.
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Customer
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Amount
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Mode
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Reference
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Invoice Status
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Proof
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((p, i) => {
                    const inv = invoices.find((x) => x.id === p.invoiceId);
                    const cust = customers.find(
                      (c) => c.id === inv?.customerId,
                    );
                    return (
                      <TableRow
                        key={p.id}
                        data-ocid={`payments.list.row.${i + 1}`}
                      >
                        <TableCell className="text-xs">
                          {p.paymentDate}
                        </TableCell>
                        <TableCell className="text-xs font-mono font-semibold">
                          {inv?.invNo ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {cust?.name ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm font-semibold text-green-700">
                          {fmt(p.amount)}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5">
                            {p.mode}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {p.referenceNo || "—"}
                        </TableCell>
                        <TableCell>
                          {inv && <StatusBadge status={inv.status} />}
                        </TableCell>
                        <TableCell>
                          {p.files && p.files.length > 0 ? (
                            <div className="flex items-center gap-1">
                              {p.files.map((f) => (
                                <a
                                  key={f.name + f.url}
                                  href={f.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
                                >
                                  <Paperclip className="w-3 h-3" />
                                  View
                                </a>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground/50">
                              No proof
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {sorted.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center py-8 text-sm text-muted-foreground"
                        data-ocid="payments.list.empty_state"
                      >
                        No payments recorded
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ── Receivables Tab ── */}
        <TabsContent value="receivables" className="mt-3 space-y-3">
          {/* Reminder Performance Summary */}
          <div
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3"
            data-ocid="receivables.performance.panel"
          >
            <div className="rounded-lg border bg-card p-3 shadow-sm">
              <div className="text-xs text-muted-foreground font-medium">
                Avg Reminders
              </div>
              <div className="text-2xl font-bold mt-1">{avgReminders}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                per paid invoice
              </div>
            </div>
            <div
              className={`rounded-lg border p-3 shadow-sm ${reminderOverdueCount > 0 ? "bg-red-50 border-red-200" : "bg-card"}`}
            >
              <div
                className={`text-xs font-medium ${reminderOverdueCount > 0 ? "text-red-700" : "text-muted-foreground"}`}
              >
                Overdue Invoices
              </div>
              <div
                className={`text-2xl font-bold mt-1 ${reminderOverdueCount > 0 ? "text-red-700" : ""}`}
              >
                {reminderOverdueCount}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                past due date
              </div>
            </div>
            <div
              className={`rounded-lg border p-3 shadow-sm ${highReminderCases > 0 ? "bg-amber-50 border-amber-200" : "bg-card"}`}
            >
              <div
                className={`text-xs font-medium ${highReminderCases > 0 ? "text-amber-700" : "text-muted-foreground"}`}
              >
                High Reminder Cases
              </div>
              <div
                className={`text-2xl font-bold mt-1 ${highReminderCases > 0 ? "text-amber-700" : ""}`}
              >
                {highReminderCases}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                3+ reminders sent
              </div>
            </div>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <div className="rounded-md border p-3 bg-muted/30">
              <div className="text-xs text-muted-foreground">
                Total Invoices
              </div>
              <div className="text-xl font-bold mt-0.5">{invoices.length}</div>
            </div>
            <div className="rounded-md border p-3 bg-amber-50 border-amber-200">
              <div className="text-xs text-amber-700">Pending / Partial</div>
              <div className="text-xl font-bold mt-0.5 text-amber-800">
                {pendingCount}
              </div>
            </div>
            <div
              className={`rounded-md border p-3 ${
                overdueCount > 0 ? "bg-red-50 border-red-200" : "bg-muted/30"
              }`}
            >
              <div
                className={`text-xs ${
                  overdueCount > 0 ? "text-red-700" : "text-muted-foreground"
                }`}
              >
                Overdue
              </div>
              <div
                className={`text-xl font-bold mt-0.5 ${
                  overdueCount > 0 ? "text-red-800" : ""
                }`}
              >
                {overdueCount}
              </div>
            </div>
          </div>

          {/* Due Today banner */}
          {(() => {
            const dueTodayCount = invoices
              .filter((inv) => (inv.invoiceType ?? "tax") !== "proforma")
              .filter(isDueToday).length;
            return dueTodayCount > 0 ? (
              <div className="mb-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <Bell className="w-4 h-4 flex-shrink-0" />
                <span>
                  🔔 <strong>{dueTodayCount}</strong> reminder
                  {dueTodayCount !== 1 ? "s" : ""} need action today
                </span>
              </div>
            ) : null;
          })()}

          {/* Reminder due banner */}
          {(() => {
            const dueCount = invoices
              .filter((inv) => (inv.invoiceType ?? "tax") !== "proforma")
              .filter(isReminderDue).length;
            return dueCount > 0 ? (
              <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <Bell className="w-4 h-4 flex-shrink-0" />
                <span>
                  You have <strong>{dueCount}</strong> pending reminder
                  {dueCount !== 1 ? "s" : ""}
                </span>
              </div>
            ) : null;
          })()}

          {/* Receivables table */}
          <div className="table-wrapper">
            <div
              className="rounded-md border"
              data-ocid="receivables.list.table"
            >
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-xs font-semibold w-6" />
                    <TableHead className="text-xs font-semibold">
                      Invoice No.
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Customer
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Amount
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Paid
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Balance
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Due Date
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Status
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Suggestion
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Reminders
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Last Reminder
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Next Reminder
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={12}
                        className="text-center py-8 text-sm text-muted-foreground"
                        data-ocid="receivables.list.empty_state"
                      >
                        No invoices found
                      </TableCell>
                    </TableRow>
                  )}
                  {invoices
                    .filter((inv) => (inv.invoiceType ?? "tax") !== "proforma")
                    .map((inv, i) => {
                      const cust = customers.find(
                        (c) => c.id === inv.customerId,
                      );
                      const balance =
                        (inv.totalAmount ?? 0) - (inv.paidAmount ?? 0);
                      const expanded = expandedRows.has(inv.id);
                      const logs = reminderLogs
                        .filter((r) => r.invoiceId === inv.id)
                        .sort((a, b) => b.createdAt - a.createdAt);

                      return (
                        <React.Fragment key={inv.id}>
                          <TableRow
                            data-ocid={`receivables.list.row.${i + 1}`}
                            className={
                              isReminderDue(inv)
                                ? isDueToday(inv)
                                  ? "bg-amber-50"
                                  : "bg-red-50"
                                : ""
                            }
                          >
                            <TableCell className="pr-0">
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-foreground transition-colors"
                                onClick={() => toggleRow(inv.id)}
                                data-ocid={`receivables.list.toggle.${i + 1}`}
                              >
                                {expanded ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </TableCell>
                            <TableCell className="text-xs font-mono font-bold">
                              {inv.invNo}
                              {isReminderDue(inv) && (
                                <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 border border-red-200">
                                  Reminder Due
                                </span>
                              )}
                              {isDueToday(inv) && (
                                <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
                                  Due Today
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              {cust?.name ?? "—"}
                            </TableCell>
                            <TableCell className="text-sm font-semibold">
                              {fmt(inv.totalAmount)}
                            </TableCell>
                            <TableCell className="text-sm text-green-700 font-semibold">
                              {fmt(inv.paidAmount)}
                            </TableCell>
                            <TableCell
                              className={`text-sm font-semibold ${
                                balance > 0
                                  ? "text-red-600"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {fmt(balance)}
                            </TableCell>
                            <TableCell className="text-xs">
                              {inv.dueDate || "—"}
                            </TableCell>
                            <TableCell>{getStatusBadge(inv)}</TableCell>
                            <TableCell>
                              {inv.status !== "Paid" && inv.dueDate ? (
                                (() => {
                                  const { label, color } = getSuggestion(inv);
                                  return (
                                    <span
                                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${color}`}
                                    >
                                      {label}
                                    </span>
                                  );
                                })()
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  —
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-center">
                              {(inv as any).reminderCount ?? 0}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {(inv as any).lastReminderSentAt
                                ? new Date(
                                    (inv as any).lastReminderSentAt,
                                  ).toLocaleDateString("en-IN", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })
                                : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {inv.dueDate
                                ? (() => {
                                    const nextDate = getNextReminderDate(
                                      inv as any,
                                    );
                                    const hasCustom = !!(inv as any)
                                      .nextReminderCustomDate;
                                    return (
                                      <span className="flex items-center gap-1 flex-wrap">
                                        {nextDate.toLocaleDateString()}
                                        {hasCustom && (
                                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
                                            Custom
                                          </span>
                                        )}
                                      </span>
                                    );
                                  })()
                                : "—"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 flex-wrap">
                                {inv.status !== "Paid" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-xs px-2 gap-1"
                                    onClick={() => {
                                      const defaultMethod = getDefaultMethod();
                                      setReminderModal({
                                        open: true,
                                        invoiceId: inv.id,
                                        invNo: inv.invNo,
                                        customerName: cust?.name ?? "",
                                        customerPhone: cust?.phone ?? "",
                                        customerEmail: cust?.email ?? "",
                                        dueDate: inv.dueDate ?? "",
                                        balance,
                                      });
                                      setReminderType("Manual");
                                      setReminderMethod(defaultMethod);
                                      setCustomReminderDate(
                                        (inv as any).nextReminderCustomDate ||
                                          "",
                                      );
                                    }}
                                    data-ocid={`receivables.list.send_reminder.${i + 1}`}
                                  >
                                    <Bell className="w-3 h-3" /> Remind
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>

                          {/* Reminders sub-panel */}
                          {expanded && (
                            <TableRow key={`${inv.id}-reminders`}>
                              <TableCell
                                colSpan={12}
                                className="bg-muted/20 px-6 py-3"
                              >
                                <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                                  Reminders
                                </div>
                                {logs.length === 0 ? (
                                  <p className="text-xs text-muted-foreground italic">
                                    No reminders sent yet
                                  </p>
                                ) : (
                                  <div className="table-wrapper">
                                    <table
                                      className="w-full text-xs"
                                      style={{ minWidth: "300px" }}
                                    >
                                      <thead>
                                        <tr className="text-muted-foreground">
                                          <th className="text-left font-medium pb-1 w-32">
                                            Date
                                          </th>
                                          <th className="text-left font-medium pb-1 w-32">
                                            Type
                                          </th>
                                          <th className="text-left font-medium pb-1 w-28">
                                            Method
                                          </th>
                                          <th className="text-left font-medium pb-1">
                                            Status
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {logs.map((log) => (
                                          <tr
                                            key={log.id}
                                            className="border-t border-border/40"
                                          >
                                            <td className="py-1 font-mono">
                                              {log.date}
                                            </td>
                                            <td className="py-1">{log.type}</td>
                                            <td className="py-1">
                                              {log.method ? (
                                                <span className="inline-flex items-center gap-1 text-muted-foreground">
                                                  {getMethodIcon(log.method)}
                                                  {log.method}
                                                </span>
                                              ) : (
                                                "—"
                                              )}
                                            </td>
                                            <td className="py-1">
                                              <span
                                                className={`inline-flex items-center text-xs px-1.5 py-0.5 rounded border ${getStatusColor(
                                                  log.status,
                                                )}`}
                                              >
                                                {log.status}
                                              </span>
                                              {log.error && (
                                                <span className="ml-1.5 text-red-500 text-[10px]">
                                                  {log.error}
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
                        </React.Fragment>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-ocid="payments.dialog">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              console.log("FORM SUBMITTED");
              if (!pCreate) {
                toast.error("Access restricted: create permission required");
                return;
              }
              handleSave();
            }}
          >
            <div className="modal-body">
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Invoice *</Label>
                  <Select
                    value={form.invoiceId}
                    onValueChange={(v) =>
                      setForm((p) => ({ ...p, invoiceId: v }))
                    }
                  >
                    <SelectTrigger
                      data-ocid="payments.form.invoice.select"
                      className="mt-1 h-8 text-sm"
                    >
                      <SelectValue placeholder="Select invoice" />
                    </SelectTrigger>
                    <SelectContent>
                      {invoices
                        .filter(
                          (i) =>
                            i.status !== "Paid" &&
                            (i.invoiceType ?? "tax") !== "proforma",
                        )
                        .map((inv) => {
                          const cust = customers.find(
                            (c) => c.id === inv.customerId,
                          );
                          const balance =
                            (inv.totalAmount ?? 0) - (inv.paidAmount ?? 0);
                          return (
                            <SelectItem
                              key={inv.id}
                              value={inv.id}
                              className="text-sm"
                            >
                              {inv.invNo} — {cust?.name} (Balance:{" "}
                              {fmt(balance)})
                            </SelectItem>
                          );
                        })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="form-grid">
                  <div>
                    <Label className="text-xs">Amount (₹) *</Label>
                    <Input
                      data-ocid="payments.form.amount.input"
                      type="number"
                      className="mt-1 h-8 text-sm"
                      value={form.amount}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, amount: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Payment Date</Label>
                    <Input
                      data-ocid="payments.form.paymentDate.input"
                      type="date"
                      className="mt-1 h-8 text-sm"
                      value={form.paymentDate}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, paymentDate: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Mode</Label>
                    <Select
                      value={form.mode}
                      onValueChange={(v) =>
                        setForm((p) => ({ ...p, mode: v as PaymentMode }))
                      }
                    >
                      <SelectTrigger
                        data-ocid="payments.form.mode.select"
                        className="mt-1 h-8 text-sm"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MODES.map((m) => (
                          <SelectItem key={m} value={m} className="text-sm">
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Reference No.</Label>
                    <Input
                      data-ocid="payments.form.reference.input"
                      className="mt-1 h-8 text-sm"
                      value={form.referenceNo}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, referenceNo: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Notes</Label>
                  <Textarea
                    data-ocid="payments.form.notes.textarea"
                    className="mt-1 text-sm"
                    rows={2}
                    value={form.notes}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, notes: e.target.value }))
                    }
                  />
                </div>
                {pUpload && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs flex items-center gap-1.5">
                        <Paperclip className="w-3.5 h-3.5" />
                        Proof of Payment (optional)
                      </Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => paymentFileRef.current?.click()}
                        data-ocid="payments.form.upload_button"
                      >
                        <Plus className="w-3 h-3 mr-1" /> Add Files
                      </Button>
                      <input
                        ref={paymentFileRef}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          const files = Array.from(e.target.files ?? []);
                          if (!files.length) return;
                          Promise.all(
                            files.map(
                              (file) =>
                                new Promise<{
                                  name: string;
                                  url: string;
                                  type: string;
                                }>((resolve) => {
                                  const reader = new FileReader();
                                  reader.onload = () =>
                                    resolve({
                                      name: file.name,
                                      url: reader.result as string,
                                      type: file.type,
                                    });
                                  reader.readAsDataURL(file);
                                }),
                            ),
                          ).then((newFiles) => {
                            setPaymentFiles((prev) => [...prev, ...newFiles]);
                          });
                          if (paymentFileRef.current)
                            paymentFileRef.current.value = "";
                        }}
                      />
                    </div>
                    {paymentFiles.length > 0 && (
                      <div className="space-y-1">
                        {paymentFiles.map((f, idx) => (
                          <div
                            key={f.name + String(idx)}
                            className="flex items-center gap-2 p-1.5 rounded bg-muted/40 text-xs"
                          >
                            <Paperclip className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className="flex-1 truncate">{f.name}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setPaymentFiles((prev) =>
                                  prev.filter((_, i) => i !== idx),
                                )
                              }
                              className="text-muted-foreground hover:text-destructive"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {/* end modal-body */}
            <div className="modal-footer">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                data-ocid="payments.form.cancel_button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSavingPayment}
                data-ocid="payments.form.submit_button"
              >
                {isSavingPayment ? "Saving..." : "Record Payment"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={reminderModal.open}
        onOpenChange={(v) => setReminderModal((p) => ({ ...p, open: v }))}
      >
        <DialogContent className="max-w-sm" data-ocid="reminder.dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-4 h-4" /> Send Reminder
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-1">
            <p className="text-sm text-muted-foreground">
              <span className="font-mono font-semibold text-foreground">
                {reminderModal.invNo}
              </span>
              {reminderModal.customerName && (
                <> &mdash; {reminderModal.customerName}</>
              )}
            </p>

            {/* Auto-suggestion label */}
            {(() => {
              const modalInv = invoices.find(
                (i) => i.id === reminderModal.invoiceId,
              );
              const { label, color } = getSuggestedLabel(modalInv);
              return (
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium ${color}`}
                >
                  <span>🧠</span>
                  <span>Suggested: {label}</span>
                </div>
              );
            })()}

            {/* Reminder context info */}
            {(() => {
              const modalInv = invoices.find(
                (i) => i.id === reminderModal.invoiceId,
              );
              if (!modalInv) return null;
              return (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Last Reminder:
                    </span>
                    <span className="font-medium">
                      {(modalInv as any).lastReminderSentAt
                        ? new Date(
                            (modalInv as any).lastReminderSentAt,
                          ).toLocaleDateString()
                        : "Not sent yet"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Next Reminder:
                    </span>
                    <span className="font-medium">
                      {modalInv.dueDate
                        ? getNextReminderDate(
                            modalInv as any,
                          ).toLocaleDateString()
                        : "—"}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Reminder Type */}
            <div>
              <Label className="text-xs font-semibold mb-2 block">
                Reminder Type
              </Label>
              <RadioGroup
                value={reminderType}
                onValueChange={(v) => setReminderType(v as ReminderType)}
                className="space-y-2"
                data-ocid="reminder.type.radio"
              >
                {REMINDER_TYPES.map((rt) => (
                  <div key={rt} className="flex items-center gap-2">
                    <RadioGroupItem value={rt} id={`rt-${rt}`} />
                    <Label
                      htmlFor={`rt-${rt}`}
                      className="text-sm cursor-pointer font-normal"
                    >
                      {rt}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Send Method */}
            <div>
              <Label className="text-xs font-semibold mb-2 block">
                Send via
              </Label>
              <RadioGroup
                value={reminderMethod}
                onValueChange={(v) => setReminderMethod(v as ReminderMethod)}
                className="space-y-2"
                data-ocid="reminder.method.radio"
              >
                {REMINDER_METHODS.map((m) => (
                  <div key={m} className="flex items-center gap-2">
                    <RadioGroupItem value={m} id={`rm-${m}`} />
                    <Label
                      htmlFor={`rm-${m}`}
                      className="text-sm cursor-pointer font-normal flex items-center gap-1.5"
                    >
                      {getMethodIcon(m)}
                      {m === "WhatsApp"
                        ? "WhatsApp (Instant)"
                        : m === "Email"
                          ? "Email (Manual)"
                          : m}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Reminder Frequency */}
            <div>
              <Label className="text-xs font-semibold mb-2 block">
                Reminder Frequency
              </Label>
              <select
                className="w-full h-8 text-sm border border-input rounded px-2 bg-background"
                value={(() => {
                  const modalInv = invoices.find(
                    (i) => i.id === reminderModal.invoiceId,
                  );
                  return (modalInv as any)?.reminderFrequencyDays || 5;
                })()}
                onChange={(e) => {
                  const inv = invoices.find(
                    (i) => i.id === reminderModal.invoiceId,
                  );
                  if (inv)
                    updateFrequency(inv, e.target.value, updateInvoice as any);
                }}
              >
                <option value={5}>Every 5 days</option>
                <option value={10}>Every 10 days</option>
                <option value={15}>Every 15 days</option>
              </select>
            </div>

            {/* Custom Reminder Date */}
            <div>
              <Label className="text-xs font-semibold mb-2 block">
                Schedule Next Reminder (Optional)
              </Label>
              <input
                type="date"
                className="w-full h-8 text-sm border border-input rounded px-2 bg-background"
                value={customReminderDate}
                onChange={(e) => {
                  const date = e.target.value;
                  setCustomReminderDate(date);
                  const inv = invoices.find(
                    (i) => i.id === reminderModal.invoiceId,
                  );
                  if (inv) {
                    updateInvoice({
                      ...inv,
                      nextReminderCustomDate: date || null,
                    });
                  }
                }}
                data-ocid="reminder.custom_date_input"
              />
              {customReminderDate && (
                <p className="text-xs text-blue-600 mt-1">
                  Custom date set — overrides frequency schedule
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setReminderModal({
                  open: false,
                  invoiceId: "",
                  invNo: "",
                  customerName: "",
                  customerPhone: "",
                  customerEmail: "",
                  dueDate: "",
                  balance: 0,
                })
              }
              data-ocid="reminder.cancel_button"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSendReminder}
              disabled={isSending}
              data-ocid="reminder.confirm_button"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Reminder"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

class PaymentsErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  componentDidCatch(error: Error) {
    console.error("Payments render error:", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8">
          <div className="text-center">
            <h2 className="text-lg font-bold text-destructive">
              Something went wrong
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {this.state.error}
            </p>
            <button
              type="button"
              className="mt-4 text-sm text-primary underline"
              onClick={() => this.setState({ hasError: false, error: "" })}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function Payments() {
  return (
    <PaymentsErrorBoundary>
      <PaymentsInner />
    </PaymentsErrorBoundary>
  );
}
