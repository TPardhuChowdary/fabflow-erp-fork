import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Pencil, Plus, Trash2 } from "lucide-react";
import React, { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { canView, hasPermission } from "../permissions";
import { useStore } from "../store";
import type {
  PettyExpense,
  PettyExpenseMode,
  PettyExpenseType,
} from "../types";

const EXPENSE_TYPES: PettyExpenseType[] = [
  "Material",
  "Tools",
  "Labour",
  "Maintenance",
  "Food",
  "Transport",
  "Misc",
];

const EXPENSE_MODES: PettyExpenseMode[] = [
  "Company Expense",
  "Personal Expense",
];

const fmt = (n: number) =>
  `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

class PettyExpenseErrorBoundary extends React.Component<
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
            Petty Expenses failed to load
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

function PettyExpensesInner() {
  const {
    pettyExpenses,
    addPettyExpense,
    updatePettyExpense,
    deletePettyExpense,
    addAdvanceRecord,
    employees,
    projects,
    advanceRecords,
  } = useStore();
  const { currentUser } = useAuth();

  const canCreate = hasPermission(currentUser, "petty_expenses.create");
  const canEdit = hasPermission(currentUser, "petty_expenses.edit");
  const canDelete = hasPermission(currentUser, "petty_expenses.delete");

  // Fix 1: emptyForm with safe defaults (amount=0, not "")
  const emptyForm = () => ({
    date: new Date().toISOString().split("T")[0],
    employeeId: "",
    amount: 0 as string | number,
    expenseType: "Misc" as PettyExpenseType,
    expenseMode: "Company Expense" as PettyExpenseMode,
    projectId: "",
    notes: "",
    transactionType: "Expense" as "Advance Given" | "Expense",
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PettyExpense | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Fix 7: Reset form BEFORE opening modal
  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setErrors({});
    setDialogOpen(true);
  };

  const openEdit = (e: PettyExpense) => {
    setEditing(e);
    setForm({
      date: e.date,
      employeeId: e.employeeId,
      amount: e.amount,
      expenseType: e.expenseType,
      expenseMode: e.expenseMode,
      projectId: e.projectId || "",
      notes: e.notes || "",
      transactionType: "Expense" as "Advance Given" | "Expense",
    });
    setErrors({});
    setDialogOpen(true);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.employeeId) errs.employeeId = "Employee is required";
    if (!form.amount || Number(form.amount) <= 0)
      errs.amount = "Amount must be greater than 0";
    if (!form.expenseMode) errs.expenseMode = "Expense mode is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    if (isSaving) return;
    setIsSaving(true);
    try {
      console.log("Saving petty expense:", form);
      const now = new Date().toISOString();
      if (form.transactionType === "Advance Given") {
        addAdvanceRecord({
          id: `adv-${Date.now()}`,
          employeeId: form.employeeId,
          amount: Number(form.amount),
          date: form.date,
          reason: form.notes || "Advance Given",
          remainingBalance: Number(form.amount),
          signatureData: "",
        });
        toast.success("Advance recorded");
      } else if (editing) {
        updatePettyExpense({
          ...editing,
          date: form.date,
          employeeId: form.employeeId,
          amount: Number(form.amount),
          expenseType: form.expenseType,
          expenseMode: form.expenseMode,
          projectId: form.projectId || undefined,
          notes: form.notes || undefined,
        });
        toast.success("Expense updated");
      } else {
        addPettyExpense({
          id: `pe-${Date.now()}`,
          date: form.date,
          employeeId: form.employeeId,
          amount: Number(form.amount),
          expenseType: form.expenseType,
          expenseMode: form.expenseMode,
          projectId: form.projectId || undefined,
          notes: form.notes || undefined,
          createdAt: now,
        });
        toast.success("Expense added");
      }
      setDialogOpen(false);
      console.log("SAVE COMPLETE");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    deletePettyExpense(id);
    toast.success("Expense deleted");
  };

  // Summary calculations
  const totalCompany = (pettyExpenses || [])
    .filter((e) => e.expenseMode === "Company Expense")
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const totalPersonal = (pettyExpenses || [])
    .filter((e) => e.expenseMode === "Personal Expense")
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  // Employee balance calculations
  const employeeBalances = (employees || [])
    .map((emp) => {
      const empExpenses = (pettyExpenses || []).filter(
        (e) => e.employeeId === emp.id,
      );
      const totalSpent = empExpenses.reduce(
        (s, e) => s + (Number(e.amount) || 0),
        0,
      );
      const totalAdvance = (advanceRecords || [])
        .filter((a) => a.employeeId === emp.id)
        .reduce((s, a) => s + (Number(a.amount) || 0), 0);
      const companySpent = empExpenses
        .filter((e) => e.expenseMode === "Company Expense")
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const personalDue = empExpenses
        .filter((e) => e.expenseMode === "Personal Expense")
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const remainingBalance =
        totalAdvance === 0 && companySpent === 0
          ? 0
          : Math.max(0, totalAdvance - companySpent);
      return {
        employee: emp,
        totalAdvance,
        totalSpent,
        remainingBalance,
        personalDue,
      };
    })
    .filter((eb) => eb.totalAdvance > 0 || eb.totalSpent > 0);

  const getEmployeeName = (id: string) =>
    (employees || []).find((e) => e.id === id)?.name ?? "Unknown";

  const getProjectName = (id?: string) =>
    id ? ((projects || []).find((p) => p.id === id)?.projectName ?? id) : "";

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Petty Expenses</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track employee petty cash and expense reimbursements
          </p>
        </div>
        {canCreate && (
          <Button
            onClick={openAdd}
            data-ocid="petty-expenses.open_modal_button"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Add Expense
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Total Expenses
            </p>
            <p className="text-2xl font-bold mt-1">
              {fmt(totalCompany + totalPersonal)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {(pettyExpenses || []).length} records
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Company Expenses
            </p>
            <p className="text-2xl font-bold mt-1 text-blue-600">
              {fmt(totalCompany)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Affects project cost
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Personal Expenses
            </p>
            <p className="text-2xl font-bold mt-1 text-orange-600">
              {fmt(totalPersonal)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Employee personal due
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Expense List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Expense Records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Desktop Table */}
          <div className="hidden md:block table-wrapper">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(pettyExpenses || []).length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center text-muted-foreground py-10"
                      data-ocid="petty-expenses.empty_state"
                    >
                      No expenses recorded yet. Click &quot;Add Expense&quot; to
                      get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  (pettyExpenses || []).map((expense, idx) => (
                    <TableRow
                      key={expense.id}
                      data-ocid={`petty-expenses.item.${idx + 1}`}
                    >
                      <TableCell className="text-sm">{expense.date}</TableCell>
                      <TableCell className="font-medium">
                        {getEmployeeName(expense.employeeId)}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {fmt(expense.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {expense.expenseType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            expense.expenseMode === "Company Expense"
                              ? "bg-blue-100 text-blue-700 hover:bg-blue-100"
                              : "bg-orange-100 text-orange-700 hover:bg-orange-100"
                          }
                        >
                          {expense.expenseMode}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {getProjectName(expense.projectId)}
                      </TableCell>
                      <TableCell
                        className="text-sm text-muted-foreground max-w-[180px] truncate"
                        title={expense.notes}
                      >
                        {expense.notes || "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-3">
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => openEdit(expense)}
                              className="text-muted-foreground hover:text-foreground"
                              data-ocid={`petty-expenses.edit_button.${idx + 1}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDelete(expense.id)}
                              className="text-destructive hover:text-destructive/80"
                              data-ocid={`petty-expenses.delete_button.${idx + 1}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden p-4 space-y-3">
            {(pettyExpenses || []).length === 0 ? (
              <p
                className="text-center text-muted-foreground py-6 text-sm"
                data-ocid="petty-expenses.empty_state"
              >
                No expenses recorded yet.
              </p>
            ) : (
              (pettyExpenses || []).map((expense, idx) => (
                <div
                  key={expense.id}
                  className="border rounded-lg p-4 space-y-2"
                  data-ocid={`petty-expenses.item.${idx + 1}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">
                        {getEmployeeName(expense.employeeId)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {expense.date}
                      </p>
                    </div>
                    <p className="text-lg font-bold">{fmt(expense.amount)}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-xs">
                      {expense.expenseType}
                    </Badge>
                    <Badge
                      className={
                        expense.expenseMode === "Company Expense"
                          ? "bg-blue-100 text-blue-700 hover:bg-blue-100 text-xs"
                          : "bg-orange-100 text-orange-700 hover:bg-orange-100 text-xs"
                      }
                    >
                      {expense.expenseMode}
                    </Badge>
                  </div>
                  {(expense.projectId || expense.notes) && (
                    <p className="text-xs text-muted-foreground">
                      {getProjectName(expense.projectId)}
                      {expense.notes && ` — ${expense.notes}`}
                    </p>
                  )}
                  <div className="flex gap-3 pt-1">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => openEdit(expense)}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                        data-ocid={`petty-expenses.edit_button.${idx + 1}`}
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(expense.id)}
                        className="text-xs text-destructive flex items-center gap-1"
                        data-ocid={`petty-expenses.delete_button.${idx + 1}`}
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Employee Balance Summary */}
      {employeeBalances.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Employee Balance Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="table-wrapper">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Total Advance</TableHead>
                    <TableHead className="text-right">Total Spent</TableHead>
                    <TableHead className="text-right">
                      Remaining Balance
                    </TableHead>
                    <TableHead className="text-right">Personal Due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employeeBalances.map((eb, idx) => (
                    <TableRow
                      key={eb.employee.id}
                      data-ocid={`petty-expenses.row.${idx + 1}`}
                    >
                      <TableCell className="font-medium">
                        {eb.employee.name}
                      </TableCell>
                      <TableCell className="text-right">
                        {fmt(eb.totalAdvance)}
                      </TableCell>
                      <TableCell className="text-right">
                        {fmt(eb.totalSpent)}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        {fmt(eb.remainingBalance)}
                      </TableCell>
                      <TableCell className="text-right text-orange-600">
                        {eb.personalDue > 0 ? fmt(eb.personalDue) : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" data-ocid="petty-expenses.dialog">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Expense" : "Add Petty Expense"}
            </DialogTitle>
          </DialogHeader>
          {/* Fix 2: Guard — render nothing if form is not ready */}
          {!form ? null : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                console.log("FORM SUBMITTED");
                handleSave();
              }}
            >
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Transaction Type</Label>
                  <Select
                    value={form.transactionType || "Expense"}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        transactionType: v as "Advance Given" | "Expense",
                      }))
                    }
                  >
                    <SelectTrigger data-ocid="petty-expenses.transaction_type.select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Expense">Expense</SelectItem>
                      <SelectItem value="Advance Given">
                        Advance Given
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="form-grid">
                  <div className="space-y-1.5">
                    <Label htmlFor="pe-date">Date</Label>
                    <Input
                      id="pe-date"
                      type="date"
                      value={form?.date || ""}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, date: e.target.value }))
                      }
                      data-ocid="petty-expenses.input"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pe-amount">
                      Amount (₹) <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="pe-amount"
                      type="number"
                      min={0.01}
                      step={0.01}
                      placeholder="0.00"
                      value={form?.amount ?? 0}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          amount: e.target.value as unknown as number,
                        }))
                      }
                      data-ocid="petty-expenses.input"
                    />
                    {errors.amount && (
                      <p
                        className="text-xs text-destructive"
                        data-ocid="petty-expenses.error_state"
                      >
                        {errors.amount}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>
                    Employee <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={form.employeeId || ""}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, employeeId: v }))
                    }
                  >
                    <SelectTrigger data-ocid="petty-expenses.select">
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {(employees || []).map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.employeeId && (
                    <p
                      className="text-xs text-destructive"
                      data-ocid="petty-expenses.error_state"
                    >
                      {errors.employeeId}
                    </p>
                  )}
                </div>

                {form.transactionType !== "Advance Given" && (
                  <div className="form-grid">
                    <div className="space-y-1.5">
                      <Label>Expense Type</Label>
                      {/* Fix 4: safe value binding */}
                      <Select
                        value={form.expenseType || "Misc"}
                        onValueChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            expenseType: v as PettyExpenseType,
                          }))
                        }
                      >
                        <SelectTrigger data-ocid="petty-expenses.select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EXPENSE_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>
                        Expense Mode <span className="text-destructive">*</span>
                      </Label>
                      {/* Fix 4: safe value binding */}
                      <Select
                        value={form.expenseMode || "Company Expense"}
                        onValueChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            expenseMode: v as PettyExpenseMode,
                          }))
                        }
                      >
                        <SelectTrigger data-ocid="petty-expenses.select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EXPENSE_MODES.map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.expenseMode && (
                        <p
                          className="text-xs text-destructive"
                          data-ocid="petty-expenses.error_state"
                        >
                          {errors.expenseMode}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Project (optional)</Label>
                  {/* Fix 3: sentinel value __none__ instead of empty string */}
                  <Select
                    value={form.projectId || "__none__"}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        projectId: v === "__none__" ? "" : v,
                      }))
                    }
                  >
                    <SelectTrigger data-ocid="petty-expenses.select">
                      <SelectValue placeholder="Select project (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {(projects || []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.projectName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pe-notes">Notes (optional)</Label>
                  <Textarea
                    id="pe-notes"
                    placeholder="Brief description of the expense..."
                    rows={2}
                    value={form?.notes || ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, notes: e.target.value }))
                    }
                    data-ocid="petty-expenses.textarea"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDialogOpen(false)}
                  data-ocid="petty-expenses.cancel_button"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving}
                  data-ocid="petty-expenses.submit_button"
                >
                  {editing ? "Update" : "Add Expense"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PettyExpenses() {
  const { currentUser } = useAuth();
  const pView = canView(currentUser, "petty_expenses");
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
    <PettyExpenseErrorBoundary>
      <PettyExpensesInner />
    </PettyExpenseErrorBoundary>
  );
}
