import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ArrowLeft,
  CalendarDays,
  CreditCard,
  Download,
  Eye,
  FileText,
  Loader2,
  PenLine,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Trash2,
  UserCircle2,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { EmployeeIdCardPreview } from "../components/EmployeeIdCardPreview";
import { SignaturePad } from "../components/SignaturePad";
import {
  createAdvanceRecordRemote,
  updateAdvanceRecordRemote,
} from "../lib/advanceRecordsApi";
import {
  createAttendanceRecordRemote,
  updateAttendanceRecordRemote,
} from "../lib/attendanceRecordsApi";
import { printDocument } from "../lib/documentUtils";
import {
  createEmployeeDocumentRemote,
  deleteEmployeeDocumentRemote,
  updateEmployeeDocumentRemote,
} from "../lib/employeeDocumentsApi";
import { updateEmployeeRemote } from "../lib/employeesApi";
import { generateEmployeeIdCardPdf } from "../lib/generateEmployeeIdCardPdf";
import { createSalaryPaymentRemote } from "../lib/salaryPaymentsApi";
import { canUpload, hasPermission } from "../permissions";
import { useStore } from "../store";
import type {
  AdvanceRecord,
  AttendanceRecord,
  EmployeeDocument,
  EmployeeDocumentType,
  EmployeeType,
  SalaryPayment,
} from "../types";

interface Props {
  employeeId: string;
  onBack: () => void;
  /** Which tab to land on — defaults to "overview" (today's behavior)
   * when omitted. */
  initialTab?: string;
}

const DAYS_IN_MONTH = (year: number, month: number) =>
  new Date(year, month + 1, 0).getDate();

const EMPLOYEE_DOCUMENT_TYPES: EmployeeDocumentType[] = [
  "Aadhaar",
  "PAN",
  "Passport",
  "Driving License",
  "Offer Letter",
  "Appointment Letter",
  "Salary Documents",
  "Educational Certificates",
  "Experience Certificates",
  "Bank Documents",
  "Medical Certificate",
  "Identity Card",
  "Other",
];

type DocSortKey = "name" | "type" | "uploadDate" | "expiryDate";

const emptyDocForm = () => ({
  documentName: "",
  documentType: "Other" as EmployeeDocumentType,
  expiryDate: "",
  notes: "",
});

export function EmployeeDetail({ employeeId, onBack, initialTab }: Props) {
  const { currentUser } = useAuth();
  const {
    employees,
    attendanceRecords,
    salaryPayments,
    advanceRecords,
    pettyExpenses,
    employeeDocuments,
    addAttendanceRecord,
    updateAttendanceRecord,
    addSalaryPayment,
    addAdvanceRecord,
    updateAdvanceRecord,
    updatePettyExpense,
    addEmployeeDocument,
    updateEmployeeDocument,
    deleteEmployeeDocument,
    updateEmployee,
    settings,
    generateDocNo,
  } = useStore();

  const employee = employees.find((e) => e.id === employeeId);

  // Permission-based checks: any user with employees.view sees all data in read-only.
  // Only employees.edit users can modify. Computed here (rather than lower
  // down, where these were originally defined) because the employee-code
  // lazy-generation effect below needs canEditEmp before it can decide
  // whether to write.
  const canViewEmp = hasPermission(currentUser, "employees.view");
  const canEditEmp = hasPermission(currentUser, "employees.edit");

  // Lazily resolve-or-create the employee's display ID code, the first time
  // the ID Card tab is opened for a record that doesn't have one yet — the
  // same "generate once, reuse forever" shape as Repository Working
  // Drawings, just a single field instead of a second record.
  //
  // Phase 18C: this is now a real remote write (employees_update RLS
  // requires employees.edit), so it's gated to canEditEmp - a view-only
  // user opening this tab must not trigger a write that RLS will silently
  // deny every time. Zustand is only updated after Supabase confirms the
  // write actually persisted; a denied/error result leaves the record
  // (and its missing employeeCode) untouched, to be generated the next
  // time an edit-permitted user visits.
  useEffect(() => {
    if (!canEditEmp) return;
    if (employee && !employee.employeeCode) {
      const code = generateDocNo("EMP");
      updateEmployeeRemote({ ...employee, employeeCode: code }).then(
        (result) => {
          if (result.status === "success" && result.data) {
            updateEmployee({ ...result.data, userId: employee.userId });
          }
          // unauthenticated/error/denied: leave Zustand untouched, no
          // fabricated success. The effect will simply retry on the next
          // mount/employee change since employeeCode is still unset.
        },
      );
    }
  }, [employee, canEditEmp, updateEmployee, generateDocNo]);

  const [idCardGenerating, setIdCardGenerating] = useState(false);
  const [idCardSide, setIdCardSide] = useState<"front" | "back" | "both">(
    "both",
  );

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());

  // Dialogs
  const [salaryDialog, setSalaryDialog] = useState(false);
  const [advanceDialog, setAdvanceDialog] = useState(false);
  const [sigPadOpen, setSigPadOpen] = useState(false);
  const [pendingAdvance, setPendingAdvance] = useState<{
    amount: string;
    date: string;
    reason: string;
  } | null>(null);
  const [salaryForm, setSalaryForm] = useState({
    month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    amount: "",
    paymentDate: new Date().toISOString().split("T")[0],
    notes: "",
  });
  const [advanceForm, setAdvanceForm] = useState({
    amount: "",
    date: new Date().toISOString().split("T")[0],
    reason: "",
  });

  // Advance deduction state (separate from salaryForm)
  const [selectedAdvanceIds, setSelectedAdvanceIds] = useState<Set<string>>(
    new Set(),
  );
  const [advanceDeductions, setAdvanceDeductions] = useState<
    Record<string, string>
  >({});
  const [selectedPersonalExpenseIds, setSelectedPersonalExpenseIds] = useState<
    Set<string>
  >(new Set());

  // canViewEmp/canEditEmp are computed earlier now (see above the
  // employee-code lazy-generation effect).
  // Keep isAdmin for backwards compat
  const isAdmin = canEditEmp;
  const isAdminOrAccountant = canViewEmp;
  const docUpload = canUpload(currentUser, "employees");
  const docDelete = hasPermission(currentUser, "employees.delete");

  // The "salary" trigger/content pair only renders for isAdminOrAccountant
  // users — clamp to "overview" for anyone else so a controlled Tabs value
  // of "salary" never resolves to a blank tab body.
  const [activeTab, setActiveTab] = useState(
    initialTab === "salary" && !isAdminOrAccountant
      ? "overview"
      : (initialTab ?? "overview"),
  );

  // Documents state
  const [docSearch, setDocSearch] = useState("");
  const [docSort, setDocSort] = useState<DocSortKey>("uploadDate");
  const docFileInputRef = useRef<HTMLInputElement>(null);
  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const [docDialogMode, setDocDialogMode] = useState<
    "upload" | "replace" | "edit"
  >("upload");
  const [activeDoc, setActiveDoc] = useState<EmployeeDocument | null>(null);
  const [pendingFile, setPendingFile] = useState<{
    fileData: string;
    fileMimeType: string;
  } | null>(null);
  const [docForm, setDocForm] = useState(emptyDocForm());
  const [previewDoc, setPreviewDoc] = useState<EmployeeDocument | null>(null);

  // Employee Documents
  const empDocuments = (employeeDocuments || []).filter(
    (d) => d.employeeId === employeeId && d.supersededAt == null,
  );

  const visibleDocuments = useMemo(() => {
    const q = docSearch.trim().toLowerCase();
    const filtered = q
      ? empDocuments.filter((d) =>
          [d.documentName, d.documentType, d.notes, d.uploadedBy]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q),
        )
      : empDocuments;
    const sorted = [...filtered].sort((a, b) => {
      switch (docSort) {
        case "name":
          return a.documentName.localeCompare(b.documentName);
        case "type":
          return a.documentType.localeCompare(b.documentType);
        case "expiryDate":
          return (b.expiryDate || "").localeCompare(a.expiryDate || "");
        default:
          return b.uploadedAt - a.uploadedAt;
      }
    });
    return sorted;
  }, [empDocuments, docSearch, docSort]);

  if (!employee) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        Employee not found
      </div>
    );
  }

  // Attendance
  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}`;
  const daysCount = DAYS_IN_MONTH(selectedYear, selectedMonth);
  const monthAttendance = attendanceRecords.filter(
    (r) => r.employeeId === employeeId && r.date.startsWith(monthKey),
  );
  const getAttendance = (day: number) => {
    const dateStr = `${monthKey}-${String(day).padStart(2, "0")}`;
    return monthAttendance.find((r) => r.date === dateStr);
  };
  const markAttendance = async (
    day: number,
    status: AttendanceRecord["status"],
  ) => {
    const dateStr = `${monthKey}-${String(day).padStart(2, "0")}`;
    const existing = getAttendance(day);
    if (existing) {
      const result = await updateAttendanceRecordRemote({
        ...existing,
        status,
      });
      if (result.status === "unauthenticated") {
        toast.error("Not signed in to the server - attendance was not saved");
        return;
      }
      if (result.status === "denied" || result.status === "error") {
        toast.error(result.error ?? "Could not save attendance");
        return;
      }
      if (!result.data) {
        toast.error("Could not save attendance");
        return;
      }
      updateAttendanceRecord(result.data);
    } else {
      const result = await createAttendanceRecordRemote({
        employeeId,
        date: dateStr,
        status,
      });
      if (result.status === "unauthenticated") {
        toast.error("Not signed in to the server - attendance was not saved");
        return;
      }
      if (result.status === "denied" || result.status === "error") {
        toast.error(result.error ?? "Could not save attendance");
        return;
      }
      if (!result.data) {
        toast.error("Could not save attendance");
        return;
      }
      addAttendanceRecord(result.data);
    }
  };

  const presentCount = monthAttendance.filter(
    (r) => r.status === "Present",
  ).length;
  const absentCount = monthAttendance.filter(
    (r) => r.status === "Absent",
  ).length;
  const halfDayCount = monthAttendance.filter(
    (r) => r.status === "Half Day",
  ).length;

  // Salary & Advances
  const empSalaryPayments = salaryPayments.filter(
    (p) => p.employeeId === employeeId,
  );
  const empAdvances = advanceRecords.filter((a) => a.employeeId === employeeId);
  const advancesWithBalance = empAdvances.filter((a) => a.remainingBalance > 0);
  const recoverablePersonalExpenses = (pettyExpenses || []).filter(
    (e) =>
      e.employeeId === employeeId &&
      e.expenseType === "Employee Personal Expense" &&
      !e.recoveredInSalaryPaymentId,
  );

  // Computed totals for salary dialog
  const totalAdvanceDeducted = Array.from(selectedAdvanceIds).reduce(
    (sum, id) => {
      const val = Number.parseFloat(advanceDeductions[id] || "0");
      return sum + (Number.isNaN(val) ? 0 : val);
    },
    0,
  );
  const totalPersonalExpenseDeducted = Array.from(
    selectedPersonalExpenseIds,
  ).reduce((sum, id) => {
    const exp = recoverablePersonalExpenses.find((e) => e.id === id);
    return sum + (exp?.amount || 0);
  }, 0);
  const totalDeducted = totalAdvanceDeducted + totalPersonalExpenseDeducted;
  const salaryAmount = Number.parseFloat(salaryForm.amount) || 0;
  const finalPayable = salaryAmount - totalDeducted;

  const togglePersonalExpenseSelection = (id: string) => {
    setSelectedPersonalExpenseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAdvanceSelection = (id: string, remainingBalance: number) => {
    setSelectedAdvanceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        setAdvanceDeductions((d) => ({
          ...d,
          [id]: String(remainingBalance),
        }));
      }
      return next;
    });
  };

  const handleSalarySubmit = async () => {
    if (!salaryForm.amount || !salaryForm.paymentDate) {
      toast.error("Amount and payment date are required");
      return;
    }

    // Validate each deduction
    for (const id of selectedAdvanceIds) {
      const adv = empAdvances.find((a) => a.id === id);
      if (!adv) continue;
      const deducted = Number.parseFloat(advanceDeductions[id] || "0");
      if (Number.isNaN(deducted) || deducted < 0) {
        toast.error("Deduct amount must be a positive number");
        return;
      }
      if (deducted > adv.remainingBalance) {
        toast.error(
          `Deduct amount for advance on ${new Date(adv.date).toLocaleDateString("en-IN")} cannot exceed balance ₹${adv.remainingBalance.toLocaleString("en-IN")}`,
        );
        return;
      }
    }

    if (totalDeducted > salaryAmount) {
      toast.error("Deductions exceed salary amount");
      return;
    }

    const paymentFields: Omit<SalaryPayment, "id"> = {
      employeeId,
      month: salaryForm.month,
      amount: finalPayable,
      paymentDate: salaryForm.paymentDate,
      notes: salaryForm.notes,
      originalSalary: salaryAmount,
      deductedAdvance: totalAdvanceDeducted,
      finalPaidAmount: finalPayable,
      advanceDeductions: Array.from(selectedAdvanceIds).map((id) => ({
        advanceId: id,
        deductedAmount: Number.parseFloat(advanceDeductions[id] || "0"),
      })),
    };
    const paymentResult = await createSalaryPaymentRemote(paymentFields);
    if (paymentResult.status === "unauthenticated") {
      toast.error("Not signed in to the server - salary payment was not saved");
      return;
    }
    if (paymentResult.status === "denied" || paymentResult.status === "error") {
      toast.error(paymentResult.error ?? "Could not save salary payment");
      return;
    }
    if (!paymentResult.data) {
      toast.error("Could not save salary payment");
      return;
    }
    const payment = paymentResult.data;
    addSalaryPayment(payment);

    // Update each selected advance's remainingBalance
    for (const id of selectedAdvanceIds) {
      const adv = empAdvances.find((a) => a.id === id);
      if (!adv) continue;
      const deducted = Number.parseFloat(advanceDeductions[id] || "0");
      const advResult = await updateAdvanceRecordRemote({
        ...adv,
        remainingBalance: adv.remainingBalance - deducted,
      });
      if (advResult.status === "success" && advResult.data) {
        updateAdvanceRecord(advResult.data);
      } else {
        toast.error(
          `Salary payment recorded, but could not update advance balance: ${advResult.error ?? advResult.status}`,
        );
      }
    }

    // Mark each selected personal expense as recovered through this payment
    // (petty_expenses is not yet migrated - stays local-only this phase).
    for (const id of selectedPersonalExpenseIds) {
      const exp = recoverablePersonalExpenses.find((e) => e.id === id);
      if (!exp) continue;
      updatePettyExpense({ ...exp, recoveredInSalaryPaymentId: payment.id });
    }

    toast.success("Salary payment recorded");
    setSalaryDialog(false);
    setSelectedAdvanceIds(new Set());
    setAdvanceDeductions({});
    setSelectedPersonalExpenseIds(new Set());
  };

  const handleAdvanceOpen = () => {
    if (!advanceForm.amount) {
      toast.error("Amount is required");
      return;
    }
    setPendingAdvance({ ...advanceForm });
    setAdvanceDialog(false);
    setSigPadOpen(true);
  };

  const handleSignatureSave = async (signatureData: string) => {
    if (!pendingAdvance) return;
    const totalAdvanced = empAdvances.reduce((s, a) => s + a.amount, 0);
    const result = await createAdvanceRecordRemote({
      employeeId,
      amount: Number.parseFloat(pendingAdvance.amount),
      date: pendingAdvance.date,
      reason: pendingAdvance.reason,
      remainingBalance:
        totalAdvanced + Number.parseFloat(pendingAdvance.amount),
      signatureData,
    });
    if (result.status === "unauthenticated") {
      toast.error("Not signed in to the server - advance was not saved");
      return;
    }
    if (result.status === "denied" || result.status === "error") {
      toast.error(result.error ?? "Could not save advance");
      return;
    }
    if (!result.data) {
      toast.error("Could not save advance");
      return;
    }
    addAdvanceRecord(result.data);
    toast.success("Advance recorded with signature");
    setPendingAdvance(null);
    setAdvanceForm({
      amount: "",
      date: new Date().toISOString().split("T")[0],
      reason: "",
    });
  };

  const openUploadDialog = () => {
    setDocDialogMode("upload");
    setActiveDoc(null);
    setDocForm(emptyDocForm());
    docFileInputRef.current?.click();
  };

  const openReplaceDialog = (doc: EmployeeDocument) => {
    setDocDialogMode("replace");
    setActiveDoc(doc);
    setDocForm({
      documentName: doc.documentName,
      documentType: doc.documentType,
      expiryDate: doc.expiryDate || "",
      notes: doc.notes || "",
    });
    docFileInputRef.current?.click();
  };

  const openRenameDialog = (doc: EmployeeDocument) => {
    setDocDialogMode("edit");
    setActiveDoc(doc);
    setPendingFile(null);
    setDocForm({
      documentName: doc.documentName,
      documentType: doc.documentType,
      expiryDate: doc.expiryDate || "",
      notes: doc.notes || "",
    });
    setDocDialogOpen(true);
  };

  const handleDocFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File is larger than 2MB — please upload a smaller file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPendingFile({
        fileData: ev.target?.result as string,
        fileMimeType: file.type,
      });
      if (docDialogMode === "upload") {
        const nameNoExt = file.name.replace(/\.[^./]+$/, "");
        setDocForm({ ...emptyDocForm(), documentName: nameNoExt });
      }
      setDocDialogOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveDocMeta = async () => {
    if (!docForm.documentName.trim()) {
      toast.error("Document name is required");
      return;
    }
    const now = Date.now();
    // Local display username only - never sent to the DB (see
    // lib/employeeDocumentsApi.ts). The DB's uploaded_by is populated
    // from the real Supabase session user id instead.
    const uploadedBy = currentUser?.username || "admin";

    if (docDialogMode === "edit") {
      if (!activeDoc) return;
      const result = await updateEmployeeDocumentRemote(activeDoc.id, {
        documentName: docForm.documentName.trim(),
        documentType: docForm.documentType,
        expiryDate: docForm.expiryDate || undefined,
        notes: docForm.notes || undefined,
      });
      if (result.status === "unauthenticated") {
        toast.error("Not signed in to the server - document was not saved");
        return;
      }
      if (result.status === "denied" || result.status === "error") {
        toast.error(result.error ?? "Could not save document");
        return;
      }
      if (!result.data) {
        toast.error("Could not save document");
        return;
      }
      updateEmployeeDocument({
        ...result.data,
        uploadedBy: activeDoc.uploadedBy,
      });
      toast.success("Document updated");
    } else if (docDialogMode === "replace") {
      if (!activeDoc || !pendingFile) return;
      const supersedeResult = await updateEmployeeDocumentRemote(activeDoc.id, {
        supersededAt: now,
      });
      if (supersedeResult.status === "unauthenticated") {
        toast.error("Not signed in to the server - document was not saved");
        return;
      }
      if (
        supersedeResult.status === "denied" ||
        supersedeResult.status === "error"
      ) {
        toast.error(supersedeResult.error ?? "Could not replace document");
        return;
      }
      if (supersedeResult.data) {
        updateEmployeeDocument({
          ...supersedeResult.data,
          uploadedBy: activeDoc.uploadedBy,
        });
      }
      const createResult = await createEmployeeDocumentRemote({
        employeeId,
        documentGroupId: activeDoc.documentGroupId,
        documentName: docForm.documentName.trim(),
        documentType: docForm.documentType,
        fileData: pendingFile.fileData,
        fileMimeType: pendingFile.fileMimeType,
        uploadDate: new Date().toISOString().split("T")[0],
        expiryDate: docForm.expiryDate || undefined,
        notes: docForm.notes || undefined,
        uploadedAt: now,
      });
      if (createResult.status === "unauthenticated") {
        toast.error("Not signed in to the server - document was not saved");
        return;
      }
      if (createResult.status === "denied" || createResult.status === "error") {
        toast.error(createResult.error ?? "Could not replace document");
        return;
      }
      if (!createResult.data) {
        toast.error("Could not replace document");
        return;
      }
      addEmployeeDocument({ ...createResult.data, uploadedBy });
      toast.success("Document replaced");
    } else {
      if (!pendingFile) return;
      // document_group_id is NOT NULL - unlike the old local scheme
      // (documentGroupId = the row's own locally-generated id), the DB
      // generates the row's real id server-side, so a fresh, independent
      // UUID is used as the group anchor instead. Still stable across
      // Replace (which reuses activeDoc.documentGroupId unchanged) - the
      // "group" semantics are identical, just not numerically equal to
      // this row's own id anymore.
      const result = await createEmployeeDocumentRemote({
        employeeId,
        documentGroupId: crypto.randomUUID(),
        documentName: docForm.documentName.trim(),
        documentType: docForm.documentType,
        fileData: pendingFile.fileData,
        fileMimeType: pendingFile.fileMimeType,
        uploadDate: new Date().toISOString().split("T")[0],
        expiryDate: docForm.expiryDate || undefined,
        notes: docForm.notes || undefined,
        uploadedAt: now,
      });
      if (result.status === "unauthenticated") {
        toast.error("Not signed in to the server - document was not saved");
        return;
      }
      if (result.status === "denied" || result.status === "error") {
        toast.error(result.error ?? "Could not save document");
        return;
      }
      if (!result.data) {
        toast.error("Could not save document");
        return;
      }
      addEmployeeDocument({ ...result.data, uploadedBy });
      toast.success("Document uploaded");
    }
    setDocDialogOpen(false);
    setPendingFile(null);
    setActiveDoc(null);
  };

  const downloadDoc = (doc: EmployeeDocument) => {
    const a = document.createElement("a");
    a.href = doc.fileData;
    a.download = doc.documentName;
    a.click();
  };

  const handleDeleteDoc = async (doc: EmployeeDocument) => {
    const result = await deleteEmployeeDocumentRemote(doc.id);
    if (result.status === "unauthenticated") {
      toast.error("Not signed in to the server - document was not deleted");
      return;
    }
    if (result.status === "denied" || result.status === "error") {
      toast.error(result.error ?? "Could not delete document");
      return;
    }
    deleteEmployeeDocument(doc.id);
    toast.success("Document deleted");
  };

  const handleEmployeeTypeChange = async (value: EmployeeType) => {
    if (!employee) return;
    // This handler is only reachable via the Employee Type <Select>, which
    // is already rendered only for canEditEmp users (see the "ID Card"
    // tab JSX below) - matches the employees_update RLS policy
    // (has_permission('employees','edit')) exactly, so no separate gate
    // is needed here.
    const result = await updateEmployeeRemote({
      ...employee,
      employeeType: value,
    });
    if (result.status === "success" && result.data) {
      updateEmployee({ ...result.data, userId: employee.userId });
    } else if (result.status === "unauthenticated") {
      toast.error("Sign in required to update employee type");
    } else {
      toast.error(result.error || "Failed to update employee type");
    }
  };

  const handleDownloadIdCard = async () => {
    if (!employee) return;
    setIdCardGenerating(true);
    try {
      const blob = await generateEmployeeIdCardPdf({
        employee,
        companyName: settings.companyName,
        companyAddress: settings.companyAddress,
        companyPhone: settings.companyPhone,
        companyEmail: settings.companyEmail,
        companyWebsite: settings.companyWebsite,
        companyLogoDataUrl: settings.companyLogo || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${employee.employeeCode || employee.name}-IDCard.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (_err) {
      toast.error("Failed to generate ID card PDF");
    } finally {
      setIdCardGenerating(false);
    }
  };

  const handlePrintIdCard = () => {
    printDocument("employee-idcard-print-content");
  };

  // The preview is already always rendered live from the current employee
  // record — there's no cached PDF/image anywhere to go stale. This is a
  // lightweight explicit refresh: re-confirm the employee code exists and
  // give the user visible confirmation, matching the ERP flow's
  // "Regenerate (if the template changes)" action without inventing
  // caching machinery that isn't needed here.
  //
  // Phase 18C: real remote write, same reasoning as the lazy-generation
  // effect above - only reachable by canEditEmp users (button is gated in
  // the JSX below), matching the employees_update RLS policy.
  const handleRegenerateIdCard = async () => {
    if (employee && !employee.employeeCode) {
      const code = generateDocNo("EMP");
      const result = await updateEmployeeRemote({
        ...employee,
        employeeCode: code,
      });
      if (result.status === "success" && result.data) {
        updateEmployee({ ...result.data, userId: employee.userId });
      } else {
        toast.error(result.error || "Failed to refresh employee code");
        return;
      }
    }
    toast.success("ID card refreshed from the latest employee data");
  };

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  return (
    <div className="space-y-5" data-ocid="employee-detail.page">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          data-ocid="employee-detail.link"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <Avatar className="h-14 w-14">
          <AvatarImage
            src={employee.photoRef}
            alt={employee.name}
            className="object-cover"
          />
          <AvatarFallback className="text-lg">
            <UserCircle2 className="h-7 w-7" />
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-xl font-bold">{employee.name}</h1>
          <p className="text-sm text-muted-foreground">{employee.role}</p>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        data-ocid="employee-detail.panel"
      >
        <TabsList>
          <TabsTrigger
            value="overview"
            data-ocid="employee-detail.overview.tab"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger value="idcard" data-ocid="employee-detail.idcard.tab">
            <CreditCard className="w-3.5 h-3.5 mr-1" /> ID Card
          </TabsTrigger>
          <TabsTrigger
            value="attendance"
            data-ocid="employee-detail.attendance.tab"
          >
            <CalendarDays className="w-3.5 h-3.5 mr-1" /> Attendance
          </TabsTrigger>
          {isAdminOrAccountant && (
            <TabsTrigger value="salary" data-ocid="employee-detail.salary.tab">
              <Wallet className="w-3.5 h-3.5 mr-1" /> Salary & Advances
            </TabsTrigger>
          )}
          {isAdminOrAccountant && (
            <TabsTrigger
              value="signatures"
              data-ocid="employee-detail.signatures.tab"
            >
              <PenLine className="w-3.5 h-3.5 mr-1" /> Signatures
            </TabsTrigger>
          )}
          {isAdminOrAccountant && (
            <TabsTrigger
              value="documents"
              data-ocid="employee-detail.documents.tab"
            >
              <FileText className="w-3.5 h-3.5 mr-1" /> Documents
            </TabsTrigger>
          )}
        </TabsList>

        {/* ID Card */}
        <TabsContent value="idcard" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="w-4 h-4" /> Employee ID Card
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {canEditEmp && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                    Employee Type
                  </Label>
                  <Select
                    value={employee.employeeType ?? "Permanent"}
                    onValueChange={(v) =>
                      handleEmployeeTypeChange(v as EmployeeType)
                    }
                  >
                    <SelectTrigger
                      className="w-44"
                      data-ocid="employee-detail.idcard.type_select"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Permanent">Permanent</SelectItem>
                      <SelectItem value="Temporary">Temporary</SelectItem>
                      <SelectItem value="Supervisor">Supervisor</SelectItem>
                      <SelectItem value="Management">Management</SelectItem>
                      <SelectItem value="Visitor">Visitor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                  Live Preview
                </Label>
                <div className="flex rounded-md border overflow-hidden">
                  {(["front", "back", "both"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setIdCardSide(opt)}
                      className={`px-2.5 py-1 text-xs capitalize ${
                        idCardSide === opt
                          ? "bg-primary text-primary-foreground"
                          : "bg-transparent hover:bg-muted"
                      }`}
                      data-ocid={`employee-detail.idcard.preview_${opt}_button`}
                    >
                      {opt === "both" ? "Both Sides" : `Preview ${opt}`}
                    </button>
                  ))}
                </div>
              </div>

              <div
                id="employee-idcard-print-content"
                className="flex flex-wrap gap-4"
              >
                {(idCardSide === "front" || idCardSide === "both") && (
                  <EmployeeIdCardPreview
                    employee={employee}
                    settings={settings}
                    side="front"
                  />
                )}
                {(idCardSide === "back" || idCardSide === "both") && (
                  <EmployeeIdCardPreview
                    employee={employee}
                    settings={settings}
                    side="back"
                  />
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={idCardGenerating}
                  onClick={handleDownloadIdCard}
                  data-ocid="employee-detail.idcard.download_button"
                >
                  {idCardGenerating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  Download PDF
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={handlePrintIdCard}
                  data-ocid="employee-detail.idcard.print_button"
                >
                  <Printer className="w-3.5 h-3.5" /> Print PVC Card
                </Button>
                {canEditEmp && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={handleRegenerateIdCard}
                    data-ocid="employee-detail.idcard.regenerate_button"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Regenerate
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Overview */}
        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <UserCircle2 className="w-4 h-4" /> Employee Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {employee.photoRef && (
                <div className="col-span-2 flex justify-center">
                  <img
                    src={employee.photoRef}
                    alt={employee.name}
                    className="h-32 w-32 rounded-full object-cover border-2 border-border"
                  />
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Name
                </p>
                <p className="font-medium mt-0.5">{employee.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Role
                </p>
                <p className="font-medium mt-0.5">{employee.role}</p>
              </div>
              {isAdminOrAccountant && (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Phone
                    </p>
                    <p className="mt-0.5">{employee.phone || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Monthly Salary
                    </p>
                    <p className="font-medium mt-0.5">
                      ₹{employee.monthlySalary.toLocaleString("en-IN")}
                    </p>
                  </div>
                </>
              )}
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Joining Date
                </p>
                <p className="mt-0.5">
                  {employee.joiningDate
                    ? new Date(employee.joiningDate).toLocaleDateString("en-IN")
                    : "—"}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Attendance */}
        <TabsContent value="attendance" className="mt-4 space-y-4">
          {/* Month picker */}
          <div className="flex items-center gap-3">
            <select
              className="text-sm border border-border rounded px-2 py-1.5 bg-background"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
            >
              {monthNames.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>
            <select
              className="text-sm border border-border rounded px-2 py-1.5 bg-background"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              {[2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-2xl font-bold text-green-600">
                  {presentCount}
                </p>
                <p className="text-xs text-muted-foreground">Present</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-2xl font-bold text-red-600">{absentCount}</p>
                <p className="text-xs text-muted-foreground">Absent</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-2xl font-bold text-amber-600">
                  {halfDayCount}
                </p>
                <p className="text-xs text-muted-foreground">Half Day</p>
              </CardContent>
            </Card>
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-7 gap-1.5">
            {Array.from({ length: daysCount }, (_, i) => i + 1).map((day) => {
              const rec = getAttendance(day);
              const statusClass =
                rec?.status === "Present"
                  ? "border-green-400 bg-green-50 text-green-700"
                  : rec?.status === "Absent"
                    ? "border-red-400 bg-red-50 text-red-700"
                    : rec?.status === "Half Day"
                      ? "border-amber-400 bg-amber-50 text-amber-700"
                      : "border-border bg-muted/30 text-muted-foreground";
              return (
                <button
                  type="button"
                  key={day}
                  className={`rounded border p-1 text-center cursor-pointer hover:shadow-sm transition-shadow ${statusClass}`}
                  onClick={async () => {
                    if (!isAdmin) return;
                    const next: AttendanceRecord["status"] = !rec
                      ? "Present"
                      : rec.status === "Present"
                        ? "Absent"
                        : rec.status === "Absent"
                          ? "Half Day"
                          : "Present";
                    await markAttendance(day, next);
                  }}
                  data-ocid={`employee-detail.attendance.item.${day}`}
                >
                  <p className="text-xs font-semibold">{day}</p>
                  <p className="text-[9px] leading-tight">
                    {rec?.status === "Present"
                      ? "P"
                      : rec?.status === "Absent"
                        ? "A"
                        : rec?.status === "Half Day"
                          ? "H"
                          : "—"}
                  </p>
                </button>
              );
            })}
          </div>
          {isAdmin && (
            <p className="text-xs text-muted-foreground">
              Click a day to cycle: — → Present → Absent → Half Day
            </p>
          )}
        </TabsContent>

        {/* Salary & Advances */}
        {isAdminOrAccountant && (
          <TabsContent value="salary" className="mt-4 space-y-6">
            {/* Salary Payments */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Salary Payments</h3>
                {isAdmin && (
                  <Button
                    size="sm"
                    onClick={() => setSalaryDialog(true)}
                    data-ocid="employee-detail.open_modal_button"
                  >
                    Record Payment
                  </Button>
                )}
              </div>
              <div className="table-wrapper">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="text-xs">Month</TableHead>
                        <TableHead className="text-xs">Gross Salary</TableHead>
                        <TableHead className="text-xs">
                          Advance Deducted
                        </TableHead>
                        <TableHead className="text-xs">Final Paid</TableHead>
                        <TableHead className="text-xs">Payment Date</TableHead>
                        <TableHead className="text-xs">Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {empSalaryPayments.map((p, i) => (
                        <TableRow
                          key={p.id}
                          data-ocid={`employee-detail.salary.item.${i + 1}`}
                        >
                          <TableCell className="text-sm">{p.month}</TableCell>
                          <TableCell className="text-sm font-medium">
                            ₹
                            {(p.originalSalary ?? p.amount).toLocaleString(
                              "en-IN",
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {p.deductedAdvance != null && p.deductedAdvance > 0
                              ? `₹${p.deductedAdvance.toLocaleString("en-IN")}`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-sm font-medium">
                            ₹
                            {(p.finalPaidAmount ?? p.amount).toLocaleString(
                              "en-IN",
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {new Date(p.paymentDate).toLocaleDateString(
                              "en-IN",
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {p.notes || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                      {empSalaryPayments.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="text-center py-8 text-sm text-muted-foreground"
                            data-ocid="employee-detail.salary.empty_state"
                          >
                            No salary payments recorded
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>

            {/* Advances */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Advances</h3>
                {isAdmin && (
                  <Button
                    size="sm"
                    onClick={() => setAdvanceDialog(true)}
                    data-ocid="employee-detail.open_modal_button"
                  >
                    Record Advance
                  </Button>
                )}
              </div>
              <div className="table-wrapper">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Amount</TableHead>
                        <TableHead className="text-xs">Reason</TableHead>
                        <TableHead className="text-xs">Balance</TableHead>
                        <TableHead className="text-xs">Signature</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {empAdvances.map((a, i) => (
                        <TableRow
                          key={a.id}
                          data-ocid={`employee-detail.advance.item.${i + 1}`}
                        >
                          <TableCell className="text-sm">
                            {new Date(a.date).toLocaleDateString("en-IN")}
                          </TableCell>
                          <TableCell className="text-sm font-medium">
                            ₹{a.amount.toLocaleString("en-IN")}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {a.reason || "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            ₹{a.remainingBalance.toLocaleString("en-IN")}
                          </TableCell>
                          <TableCell>
                            {a.signatureData && (
                              <img
                                src={a.signatureData}
                                alt="signature"
                                className="h-8 w-16 object-contain border rounded"
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {empAdvances.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="text-center py-8 text-sm text-muted-foreground"
                            data-ocid="employee-detail.advance.empty_state"
                          >
                            No advances recorded
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </TabsContent>
        )}

        {/* Signatures Gallery */}
        {isAdminOrAccountant && (
          <TabsContent value="signatures" className="mt-4">
            {empAdvances.filter((a) => a.signatureData).length === 0 ? (
              <div
                className="text-center py-12 text-sm text-muted-foreground"
                data-ocid="employee-detail.signatures.empty_state"
              >
                No signatures recorded
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {empAdvances
                  .filter((a) => a.signatureData)
                  .map((a, i) => (
                    <Card
                      key={a.id}
                      data-ocid={`employee-detail.signature.item.${i + 1}`}
                    >
                      <CardContent className="pt-4">
                        <div className="text-xs text-muted-foreground mb-2 flex justify-between">
                          <span>
                            {new Date(a.date).toLocaleDateString("en-IN")}
                          </span>
                          <span className="font-medium text-foreground">
                            ₹{a.amount.toLocaleString("en-IN")}
                          </span>
                        </div>
                        <img
                          src={a.signatureData}
                          alt="advance signature"
                          className="w-full border rounded bg-white object-contain"
                          style={{ height: "80px" }}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {a.reason || "—"}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            )}
          </TabsContent>
        )}

        {/* Documents Tab */}
        {isAdminOrAccountant && (
          <TabsContent
            value="documents"
            className="mt-4 space-y-4"
            data-ocid="employee-detail.documents.panel"
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Input
                  placeholder="Search documents..."
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  className="max-w-xs"
                  data-ocid="employee-detail.documents.search_input"
                />
                <Select
                  value={docSort}
                  onValueChange={(v) => setDocSort(v as DocSortKey)}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="uploadDate">Upload Date</SelectItem>
                    <SelectItem value="name">Document Name</SelectItem>
                    <SelectItem value="type">Document Type</SelectItem>
                    <SelectItem value="expiryDate">Expiry Date</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {docUpload && (
                <Button
                  type="button"
                  size="sm"
                  onClick={openUploadDialog}
                  className="gap-1.5"
                  data-ocid="employee-detail.documents.upload_button"
                >
                  <Plus className="w-3.5 h-3.5" /> Upload Document
                </Button>
              )}
              <input
                ref={docFileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                className="hidden"
                onChange={handleDocFileSelected}
              />
            </div>

            {visibleDocuments.length === 0 ? (
              <div
                className="text-center py-12 text-muted-foreground text-sm border rounded-lg border-dashed"
                data-ocid="employee-detail.documents.empty_state"
              >
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>No documents uploaded yet.</p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-xs">Document Name</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Upload Date</TableHead>
                      <TableHead className="text-xs">Expiry Date</TableHead>
                      <TableHead className="text-xs">Uploaded By</TableHead>
                      <TableHead className="text-xs text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleDocuments.map((doc, i) => (
                      <TableRow
                        key={doc.id}
                        data-ocid={`employee-detail.documents.item.${i + 1}`}
                      >
                        <TableCell className="text-sm font-medium">
                          {doc.documentName}
                        </TableCell>
                        <TableCell className="text-sm">
                          {doc.documentType}
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(doc.uploadDate).toLocaleDateString("en-IN")}
                        </TableCell>
                        <TableCell className="text-sm">
                          {doc.expiryDate
                            ? new Date(doc.expiryDate).toLocaleDateString(
                                "en-IN",
                              )
                            : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {doc.uploadedBy}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => setPreviewDoc(doc)}
                              title="Preview"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => downloadDoc(doc)}
                              title="Download"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </Button>
                            {docUpload && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  onClick={() => openRenameDialog(doc)}
                                  title="Rename / Edit"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  onClick={() => openReplaceDialog(doc)}
                                  title="Replace"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            )}
                            {docDelete && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                onClick={() => handleDeleteDoc(doc)}
                                title="Delete"
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
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Salary Dialog */}
      <Dialog
        open={salaryDialog}
        onOpenChange={(open) => {
          setSalaryDialog(open);
          if (!open) {
            setSelectedAdvanceIds(new Set());
            setAdvanceDeductions({});
            setSelectedPersonalExpenseIds(new Set());
          }
        }}
      >
        <DialogContent
          className="max-w-lg max-h-[90vh] overflow-y-auto"
          data-ocid="employee-detail.salary.dialog"
        >
          <DialogHeader>
            <DialogTitle>Record Salary Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Month (YYYY-MM)</Label>
              <Input
                type="month"
                value={salaryForm.month}
                onChange={(e) =>
                  setSalaryForm((f) => ({ ...f, month: e.target.value }))
                }
                data-ocid="employee-detail.salary.input"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Amount (₹) *</Label>
              <Input
                type="number"
                placeholder={String(employee.monthlySalary)}
                value={salaryForm.amount}
                onChange={(e) =>
                  setSalaryForm((f) => ({ ...f, amount: e.target.value }))
                }
                data-ocid="employee-detail.salary.input"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Payment Date *</Label>
              <Input
                type="date"
                value={salaryForm.paymentDate}
                onChange={(e) =>
                  setSalaryForm((f) => ({ ...f, paymentDate: e.target.value }))
                }
                data-ocid="employee-detail.salary.input"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                placeholder="Optional notes..."
                value={salaryForm.notes}
                onChange={(e) =>
                  setSalaryForm((f) => ({ ...f, notes: e.target.value }))
                }
                data-ocid="employee-detail.salary.textarea"
              />
            </div>

            {/* Advance Deduction Section */}
            {(advancesWithBalance.length > 0 ||
              recoverablePersonalExpenses.length > 0) && (
              <div className="space-y-3 pt-1">
                {advancesWithBalance.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      Adjust Advances (Optional)
                    </p>
                    <div className="space-y-2">
                      {advancesWithBalance.map((adv) => {
                        const isSelected = selectedAdvanceIds.has(adv.id);
                        const deductVal = advanceDeductions[adv.id] ?? "";
                        const deductNum = Number.parseFloat(deductVal || "0");
                        const exceedsBalance =
                          !Number.isNaN(deductNum) &&
                          deductNum > adv.remainingBalance;
                        return (
                          <div
                            key={adv.id}
                            className="rounded-md border border-border bg-muted/20 p-2.5 space-y-2"
                          >
                            <div className="flex items-start gap-2">
                              <Checkbox
                                id={`adv-chk-${adv.id}`}
                                checked={isSelected}
                                onCheckedChange={() =>
                                  toggleAdvanceSelection(
                                    adv.id,
                                    adv.remainingBalance,
                                  )
                                }
                                data-ocid="employee-detail.salary.checkbox"
                              />
                              <label
                                htmlFor={`adv-chk-${adv.id}`}
                                className="text-sm cursor-pointer leading-tight"
                              >
                                <span className="font-medium">
                                  {new Date(adv.date).toLocaleDateString(
                                    "en-IN",
                                  )}
                                </span>
                                {" — "}
                                Original: ₹{adv.amount.toLocaleString("en-IN")}
                                {" — "}
                                <span className="text-muted-foreground">
                                  Balance: ₹
                                  {adv.remainingBalance.toLocaleString("en-IN")}
                                </span>
                              </label>
                            </div>
                            {isSelected && (
                              <div className="pl-6 space-y-1">
                                <Label className="text-xs">
                                  Deduct Amount (₹)
                                </Label>
                                <Input
                                  type="number"
                                  min={0}
                                  max={adv.remainingBalance}
                                  value={deductVal}
                                  onChange={(e) =>
                                    setAdvanceDeductions((d) => ({
                                      ...d,
                                      [adv.id]: e.target.value,
                                    }))
                                  }
                                  className="h-8 text-sm"
                                  data-ocid="employee-detail.salary.input"
                                />
                                {exceedsBalance && (
                                  <p className="text-xs text-red-500">
                                    Cannot exceed balance ₹
                                    {adv.remainingBalance.toLocaleString(
                                      "en-IN",
                                    )}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Recover Personal Expenses Section */}
                {recoverablePersonalExpenses.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      Recover Personal Expenses (Optional)
                    </p>
                    <div className="space-y-2">
                      {recoverablePersonalExpenses.map((exp) => {
                        const isSelected = selectedPersonalExpenseIds.has(
                          exp.id,
                        );
                        return (
                          <div
                            key={exp.id}
                            className="rounded-md border border-border bg-muted/20 p-2.5"
                          >
                            <div className="flex items-start gap-2">
                              <Checkbox
                                id={`pe-chk-${exp.id}`}
                                checked={isSelected}
                                onCheckedChange={() =>
                                  togglePersonalExpenseSelection(exp.id)
                                }
                                data-ocid="employee-detail.salary.personal_expense_checkbox"
                              />
                              <label
                                htmlFor={`pe-chk-${exp.id}`}
                                className="text-sm cursor-pointer leading-tight"
                              >
                                <span className="font-medium">
                                  {new Date(exp.date).toLocaleDateString(
                                    "en-IN",
                                  )}
                                </span>
                                {" — "}
                                {exp.itemName}
                                {" — "}
                                <span className="text-muted-foreground">
                                  ₹{exp.amount.toLocaleString("en-IN")}
                                </span>
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Calculation Summary */}
                {salaryForm.amount && (
                  <div
                    className={`rounded-md border p-3 text-sm space-y-1 ${
                      finalPayable < 0
                        ? "border-red-300 bg-red-50"
                        : "border-border bg-muted/30"
                    }`}
                  >
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Gross Salary
                      </span>
                      <span className="font-medium">
                        ₹{salaryAmount.toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Advance Deduction
                      </span>
                      <span className="font-medium text-amber-700">
                        − ₹{totalAdvanceDeducted.toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Personal Expense Recovery
                      </span>
                      <span className="font-medium text-amber-700">
                        − ₹
                        {totalPersonalExpenseDeducted.toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div
                      className={`flex justify-between border-t pt-1 font-semibold ${
                        finalPayable < 0 ? "text-red-600" : ""
                      }`}
                    >
                      <span>Final Payable</span>
                      <span>₹{finalPayable.toLocaleString("en-IN")}</span>
                    </div>
                    {finalPayable < 0 && (
                      <p className="text-xs text-red-500 pt-0.5">
                        Deductions exceed salary — reduce deduction amounts
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSalaryDialog(false);
                setSelectedAdvanceIds(new Set());
                setAdvanceDeductions({});
                setSelectedPersonalExpenseIds(new Set());
              }}
              data-ocid="employee-detail.salary.cancel_button"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSalarySubmit}
              data-ocid="employee-detail.salary.submit_button"
            >
              Save Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Advance Dialog */}
      <Dialog open={advanceDialog} onOpenChange={setAdvanceDialog}>
        <DialogContent data-ocid="employee-detail.advance.dialog">
          <DialogHeader>
            <DialogTitle>Record Advance</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Amount (₹) *</Label>
              <Input
                type="number"
                placeholder="5000"
                value={advanceForm.amount}
                onChange={(e) =>
                  setAdvanceForm((f) => ({ ...f, amount: e.target.value }))
                }
                data-ocid="employee-detail.advance.input"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input
                type="date"
                value={advanceForm.date}
                onChange={(e) =>
                  setAdvanceForm((f) => ({ ...f, date: e.target.value }))
                }
                data-ocid="employee-detail.advance.input"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea
                rows={2}
                placeholder="Reason for advance..."
                value={advanceForm.reason}
                onChange={(e) =>
                  setAdvanceForm((f) => ({ ...f, reason: e.target.value }))
                }
                data-ocid="employee-detail.advance.textarea"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              You will be asked to capture the employee's signature on the next
              step.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAdvanceDialog(false)}
              data-ocid="employee-detail.advance.cancel_button"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAdvanceOpen}
              data-ocid="employee-detail.advance.submit_button"
            >
              Next: Capture Signature
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Signature Pad */}
      <SignaturePad
        open={sigPadOpen}
        onClose={() => setSigPadOpen(false)}
        onSave={handleSignatureSave}
        employeeName={employee.name}
        amount={Number.parseFloat(pendingAdvance?.amount ?? "0")}
        date={pendingAdvance?.date ?? ""}
      />

      {/* Document Metadata Dialog (Upload / Replace / Rename) */}
      <Dialog
        open={docDialogOpen}
        onOpenChange={(open) => {
          setDocDialogOpen(open);
          if (!open) {
            setPendingFile(null);
            setActiveDoc(null);
          }
        }}
      >
        <DialogContent data-ocid="employee-detail.documents.dialog">
          <DialogHeader>
            <DialogTitle>
              {docDialogMode === "upload"
                ? "Upload Document"
                : docDialogMode === "replace"
                  ? "Replace Document"
                  : "Rename / Edit Document"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Document Name *</Label>
              <Input
                value={docForm.documentName}
                onChange={(e) =>
                  setDocForm((f) => ({ ...f, documentName: e.target.value }))
                }
                data-ocid="employee-detail.documents.name_input"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Document Type *</Label>
              <Select
                value={docForm.documentType}
                onValueChange={(v) =>
                  setDocForm((f) => ({
                    ...f,
                    documentType: v as EmployeeDocumentType,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYEE_DOCUMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Expiry Date (optional)</Label>
              <Input
                type="date"
                value={docForm.expiryDate}
                onChange={(e) =>
                  setDocForm((f) => ({ ...f, expiryDate: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={docForm.notes}
                onChange={(e) =>
                  setDocForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDocDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveDocMeta}
              data-ocid="employee-detail.documents.save_button"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Preview Dialog */}
      <Dialog
        open={!!previewDoc}
        onOpenChange={(open) => !open && setPreviewDoc(null)}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewDoc?.documentName}</DialogTitle>
          </DialogHeader>
          {previewDoc && (
            <div className="space-y-3">
              {previewDoc.fileMimeType.startsWith("image/") ? (
                <img
                  src={previewDoc.fileData}
                  alt={previewDoc.documentName}
                  className="w-full rounded border object-contain max-h-[60vh]"
                />
              ) : previewDoc.fileMimeType === "application/pdf" ? (
                <iframe
                  src={previewDoc.fileData}
                  title={previewDoc.documentName}
                  className="w-full h-[60vh] rounded border"
                />
              ) : (
                <div className="text-center py-10 text-sm text-muted-foreground border rounded-lg border-dashed">
                  Preview isn't available for this file type.
                  <div className="mt-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => downloadDoc(previewDoc)}
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" /> Download
                    </Button>
                  </div>
                </div>
              )}
              <div className="text-xs text-muted-foreground grid grid-cols-2 gap-2">
                <p>Type: {previewDoc.documentType}</p>
                <p>
                  Uploaded:{" "}
                  {new Date(previewDoc.uploadDate).toLocaleDateString("en-IN")}
                </p>
                {previewDoc.expiryDate && (
                  <p>
                    Expires:{" "}
                    {new Date(previewDoc.expiryDate).toLocaleDateString(
                      "en-IN",
                    )}
                  </p>
                )}
                <p>By: {previewDoc.uploadedBy}</p>
                {previewDoc.notes && (
                  <p className="col-span-2">Notes: {previewDoc.notes}</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
