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
  PenLine,
  UserCircle2,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { SignaturePad } from "../components/SignaturePad";
import { hasPermission } from "../permissions";
import { useStore } from "../store";
import type { AdvanceRecord, AttendanceRecord, SalaryPayment } from "../types";

interface Props {
  employeeId: string;
  onBack: () => void;
}

const DAYS_IN_MONTH = (year: number, month: number) =>
  new Date(year, month + 1, 0).getDate();

export function EmployeeDetail({ employeeId, onBack }: Props) {
  const { currentUser } = useAuth();
  const {
    employees,
    attendanceRecords,
    salaryPayments,
    advanceRecords,
    addAttendanceRecord,
    updateAttendanceRecord,
    addSalaryPayment,
    addAdvanceRecord,
    updateAdvanceRecord,
  } = useStore();

  const employee = employees.find((e) => e.id === employeeId);

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

  // Permission-based checks: any user with employees.view sees all data in read-only
  // Only employees.edit users can modify
  const canViewEmp = hasPermission(currentUser, "employees.view");
  const canEditEmp = hasPermission(currentUser, "employees.edit");
  // Keep isAdmin for backwards compat
  const isAdmin = canEditEmp;
  const isAdminOrAccountant = canViewEmp;

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
  const markAttendance = (day: number, status: AttendanceRecord["status"]) => {
    const dateStr = `${monthKey}-${String(day).padStart(2, "0")}`;
    const existing = getAttendance(day);
    if (existing) {
      updateAttendanceRecord({ ...existing, status });
    } else {
      addAttendanceRecord({
        id: `att-${Date.now()}-${day}`,
        employeeId,
        date: dateStr,
        status,
      });
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

  // Computed totals for salary dialog
  const totalDeducted = Array.from(selectedAdvanceIds).reduce((sum, id) => {
    const val = Number.parseFloat(advanceDeductions[id] || "0");
    return sum + (Number.isNaN(val) ? 0 : val);
  }, 0);
  const salaryAmount = Number.parseFloat(salaryForm.amount) || 0;
  const finalPayable = salaryAmount - totalDeducted;

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

  const handleSalarySubmit = () => {
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
      toast.error("Advance deductions exceed salary amount");
      return;
    }

    const payment: SalaryPayment = {
      id: `sal-${Date.now()}`,
      employeeId,
      month: salaryForm.month,
      amount: finalPayable,
      paymentDate: salaryForm.paymentDate,
      notes: salaryForm.notes,
      originalSalary: salaryAmount,
      deductedAdvance: totalDeducted,
      finalPaidAmount: finalPayable,
      advanceDeductions: Array.from(selectedAdvanceIds).map((id) => ({
        advanceId: id,
        deductedAmount: Number.parseFloat(advanceDeductions[id] || "0"),
      })),
    };
    addSalaryPayment(payment);

    // Update each selected advance's remainingBalance
    for (const id of selectedAdvanceIds) {
      const adv = empAdvances.find((a) => a.id === id);
      if (!adv) continue;
      const deducted = Number.parseFloat(advanceDeductions[id] || "0");
      updateAdvanceRecord({
        ...adv,
        remainingBalance: adv.remainingBalance - deducted,
      });
    }

    toast.success("Salary payment recorded");
    setSalaryDialog(false);
    setSelectedAdvanceIds(new Set());
    setAdvanceDeductions({});
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

  const handleSignatureSave = (signatureData: string) => {
    if (!pendingAdvance) return;
    const totalAdvanced = empAdvances.reduce((s, a) => s + a.amount, 0);
    const advance: AdvanceRecord = {
      id: `adv-${Date.now()}`,
      employeeId,
      amount: Number.parseFloat(pendingAdvance.amount),
      date: pendingAdvance.date,
      reason: pendingAdvance.reason,
      remainingBalance:
        totalAdvanced + Number.parseFloat(pendingAdvance.amount),
      signatureData,
    };
    addAdvanceRecord(advance);
    toast.success("Advance recorded with signature");
    setPendingAdvance(null);
    setAdvanceForm({
      amount: "",
      date: new Date().toISOString().split("T")[0],
      reason: "",
    });
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

      <Tabs defaultValue="overview" data-ocid="employee-detail.panel">
        <TabsList>
          <TabsTrigger
            value="overview"
            data-ocid="employee-detail.overview.tab"
          >
            Overview
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
        </TabsList>

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
                  onClick={() => {
                    if (!isAdmin) return;
                    const next: AttendanceRecord["status"] = !rec
                      ? "Present"
                      : rec.status === "Present"
                        ? "Absent"
                        : rec.status === "Absent"
                          ? "Half Day"
                          : (undefined as unknown as AttendanceRecord["status"]);
                    if (next) markAttendance(day, next);
                    else if (rec)
                      updateAttendanceRecord({ ...rec, status: "Present" });
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
      </Tabs>

      {/* Salary Dialog */}
      <Dialog
        open={salaryDialog}
        onOpenChange={(open) => {
          setSalaryDialog(open);
          if (!open) {
            setSelectedAdvanceIds(new Set());
            setAdvanceDeductions({});
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
            {advancesWithBalance.length > 0 && (
              <div className="space-y-2 pt-1">
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
                              {new Date(adv.date).toLocaleDateString("en-IN")}
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
                            <Label className="text-xs">Deduct Amount (₹)</Label>
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
                                {adv.remainingBalance.toLocaleString("en-IN")}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

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
                        − ₹{totalDeducted.toLocaleString("en-IN")}
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
    </div>
  );
}
