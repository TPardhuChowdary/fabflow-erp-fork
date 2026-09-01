import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  Edit2,
  Loader2,
  Plus,
  Trash2,
  Upload,
  UserCircle2,
} from "lucide-react";
import { ShieldOff } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { ConfirmDeleteDialog } from "../components/ConfirmDeleteDialog";
import {
  createEmployeeRemote,
  deleteEmployeeRemote,
  updateEmployeeRemote,
} from "../lib/employeesApi";
import { createOrgUser } from "../lib/settingsUsersApi";
import {
  canCreate,
  canDelete,
  canEdit,
  canView,
  hasPermission,
} from "../permissions";
import { useStore } from "../store";
import type { Employee, EmploymentType, UserRole } from "../types";
import { uploadPhoto } from "../utils/photoStorage";

// Same chart-token role-identity mapping as components/Layout.tsx's
// ROLE_BADGE — one consistent set of role colors across the whole app,
// not the severity (success/warning/destructive) set, since a role isn't
// good or bad.
const ROLE_COLORS: Record<string, string> = {
  Admin: "bg-chart-4/15 text-chart-4",
  Accountant: "bg-chart-2/15 text-chart-2",
  Designer: "bg-chart-5/15 text-chart-5",
  Worker: "bg-chart-3/15 text-chart-3",
};

// A joining date has no business being more than a year out — catches a
// mistyped year (e.g. "2345") at the source rather than letting it save
// silently. Not a hard historical floor: a real re-hire could legitimately
// have a joining date from years ago.
const MAX_JOINING_DATE = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
})();

interface Props {
  onViewEmployee: (id: string) => void;
}

export function Employees({ onViewEmployee }: Props) {
  const { currentUser } = useAuth();
  const { employees, addEmployee, updateEmployee, deleteEmployee } = useStore();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditSaving, setIsEditSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    role: "Worker" as UserRole,
    monthlySalary: "",
    joiningDate: "",
    username: "",
    password: "",
    designation: "",
    bloodGroup: "",
    emergencyContactName: "",
    emergencyContactRelation: "",
    emergencyContactPhone: "",
    // Phase 43 — Employment Type. Permanent is the default and needs no
    // extra fields; Temporary/Daily Wage reveal their own conditional
    // inputs below (see the form JSX).
    employmentType: "Permanent" as EmploymentType,
    tempStartDate: "",
    tempEndDate: "",
    dailyWageRate: "",
  });
  const [editForm, setEditForm] = useState({
    name: "",
    phone: "",
    role: "Worker" as UserRole,
    monthlySalary: "",
    joiningDate: "",
    photo: null as string | null,
    designation: "",
    bloodGroup: "",
    emergencyContactName: "",
    emergencyContactRelation: "",
    emergencyContactPhone: "",
    employmentType: "Permanent" as EmploymentType,
    tempStartDate: "",
    tempEndDate: "",
    dailyWageRate: "",
  });
  const [newPhotoFile, setNewPhotoFile] = useState<File | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [editFormErrors, setEditFormErrors] = useState<Record<string, string>>(
    {},
  );
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);

  const canSeeSalary = hasPermission(currentUser, "employees.view");
  const pCreate = canCreate(currentUser, "employees");
  const pEdit = canEdit(currentUser, "employees");
  const pDelete = canDelete(currentUser, "employees");

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.match(/image\/(jpeg|jpg|png)/)) {
      toast.error("Only JPG and PNG files are supported");
      return;
    }
    setPhotoFile(file);
    const previewUrl = URL.createObjectURL(file);
    setPhotoPreview(previewUrl);
  };

  const handleConfirmDeleteEmployee = async () => {
    if (!deleteTarget) return;
    const emp = deleteTarget;
    // Phase 18B: remote-first, same discipline as create/update.
    const result = await deleteEmployeeRemote(emp.id);
    if (result.status === "unauthenticated") {
      toast.error("Not signed in to Supabase - employee was not deleted.");
      setDeleteTarget(null);
      return;
    }
    if (result.status === "error" || result.status === "denied") {
      toast.error(
        `Could not delete employee: ${result.error ?? "unknown error"}`,
      );
      setDeleteTarget(null);
      return;
    }
    deleteEmployee(emp.id);
    toast.success("Employee deleted");
    setDeleteTarget(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      await handleSave();
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = "Name is required";
    if (!form.username.trim()) errors.username = "Username is required";
    if (!form.password.trim()) {
      errors.password = "Temporary password is required";
    } else if (form.password.trim().length < 8) {
      errors.password = "Temporary password must be at least 8 characters";
    }
    if (form.joiningDate && form.joiningDate > MAX_JOINING_DATE) {
      errors.joiningDate = "Joining date can't be more than a year out";
    }
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.error(Object.values(errors)[0]);
      return;
    }
    setFormErrors({});

    // Not a hard block — a genuine re-hire can legitimately share a name
    // and phone with an existing record — but the app previously had no
    // way to even notice, which is how duplicate records accumulated
    // unnoticed. Surfacing it here means a typo/double-submit gets caught
    // before it becomes a second, silently-duplicate row.
    const dup = employees.find(
      (e) =>
        e.name.trim().toLowerCase() === form.name.trim().toLowerCase() &&
        e.phone.trim() === form.phone.trim() &&
        form.phone.trim().length > 0,
    );
    if (dup) {
      toast.warning(
        `An employee named "${dup.name}" with this phone number already exists. Saving anyway as a new record.`,
      );
    }

    let photoRef: string | undefined;
    if (photoFile) {
      setUploading(true);
      try {
        photoRef = await uploadPhoto(photoFile);
      } catch (_err) {
        console.error(_err);
        toast.error(
          "Photo upload failed. Employee will be saved without photo.",
        );
      } finally {
        setUploading(false);
      }
    }

    // Phase 18B: Supabase is now authoritative for the employees table.
    // No Zustand mutation happens until the remote write actually
    // succeeds - a rejected/failed write must leave local state exactly
    // as it was, not fake success.
    const result = await createEmployeeRemote({
      name: form.name.trim(),
      phone: form.phone.trim(),
      role: form.role,
      monthlySalary: Number.parseFloat(form.monthlySalary) || 0,
      joiningDate: form.joiningDate,
      // No DB representation for userId - left unset here, filled in
      // below from the real Supabase Auth account created via
      // createOrgUser() (same provisioning path as Settings -> Users;
      // see settingsUsersApi.ts). employees has no user_id column, so
      // this stays a local/Zustand-only field - the real, DB-enforced
      // link is profiles.employee_id, set by the Edge Function.
      userId: "",
      photoRef,
      designation: form.designation.trim() || undefined,
      bloodGroup: form.bloodGroup.trim() || undefined,
      emergencyContactName: form.emergencyContactName.trim() || undefined,
      emergencyContactRelation:
        form.emergencyContactRelation.trim() || undefined,
      emergencyContactPhone: form.emergencyContactPhone.trim() || undefined,
      employmentType: form.employmentType,
      tempStartDate:
        form.employmentType === "Temporary" && form.tempStartDate
          ? form.tempStartDate
          : undefined,
      tempEndDate:
        form.employmentType === "Temporary" && form.tempEndDate
          ? form.tempEndDate
          : undefined,
      dailyWageRate:
        form.employmentType === "Daily Wage" && form.dailyWageRate
          ? Number.parseFloat(form.dailyWageRate)
          : undefined,
    });

    if (result.status === "unauthenticated") {
      toast.error("Not signed in to Supabase - employee was not saved.");
      return;
    }
    if (result.status === "error" || !result.data) {
      toast.error(
        `Could not save employee: ${result.error ?? "unknown error"}`,
      );
      return;
    }

    const newEmp = result.data;

    // Single, real account-provisioning path — the same Edge Function
    // Settings -> Users uses. The employee record above is already saved
    // remotely; a failure here is reported but does not undo it (there is
    // no clean way to "roll back" a Supabase Auth account, so a saved
    // employee with no login yet is the correct failure mode, not a
    // silently-created local-only account - see settingsUsersApi.ts).
    const accountResult = await createOrgUser(
      form.username.trim(),
      form.password.trim(),
      form.role,
      newEmp.id,
    );
    if (accountResult.status === "success" && accountResult.data) {
      newEmp.userId = accountResult.data.id;
      if (accountResult.data.employeeLinkError) {
        toast.error(
          `Login account created, but could not be linked to this employee: ${accountResult.data.employeeLinkError}`,
        );
      }
    } else {
      toast.error(
        `Employee saved, but the login account could not be created: ${accountResult.error ?? "unknown error"}. You can create it separately from Settings → Users.`,
      );
    }

    addEmployee(newEmp);
    toast.success(`Employee ${newEmp.name} added`);
    setDialogOpen(false);
    setPhotoFile(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    setForm({
      name: "",
      phone: "",
      role: "Worker",
      monthlySalary: "",
      joiningDate: "",
      username: "",
      password: "",
      designation: "",
      bloodGroup: "",
      emergencyContactName: "",
      emergencyContactRelation: "",
      emergencyContactPhone: "",
      employmentType: "Permanent",
      tempStartDate: "",
      tempEndDate: "",
      dailyWageRate: "",
    });
  };

  const openEditDialog = (emp: Employee) => {
    setEditingEmployee(emp);
    setEditForm({
      name: emp.name,
      phone: emp.phone || "",
      role: emp.role as UserRole,
      monthlySalary: String(emp.monthlySalary || ""),
      joiningDate: emp.joiningDate || "",
      photo: emp.photoRef || null,
      designation: emp.designation || "",
      bloodGroup: emp.bloodGroup || "",
      emergencyContactName: emp.emergencyContactName || "",
      emergencyContactRelation: emp.emergencyContactRelation || "",
      emergencyContactPhone: emp.emergencyContactPhone || "",
      employmentType: emp.employmentType || "Permanent",
      tempStartDate: emp.tempStartDate || "",
      tempEndDate: emp.tempEndDate || "",
      dailyWageRate:
        emp.dailyWageRate !== undefined ? String(emp.dailyWageRate) : "",
    });
    setNewPhotoFile(null);
    setEditDialogOpen(true);
  };

  function handleEditPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewPhotoFile(file);
    const preview = URL.createObjectURL(file);
    setEditForm((prev) => ({ ...prev, photo: preview }));
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditSaving) return;
    setIsEditSaving(true);
    try {
      await handleEditSave();
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setIsEditSaving(false);
    }
  };

  const handleEditSave = async () => {
    if (!pEdit) {
      toast.error("Access restricted: edit permission required");
      return;
    }
    if (!editingEmployee) return;
    const errors: Record<string, string> = {};
    if (!editForm.name.trim()) errors.name = "Name is required";
    if (editForm.joiningDate && editForm.joiningDate > MAX_JOINING_DATE) {
      errors.joiningDate = "Joining date can't be more than a year out";
    }
    if (Object.keys(errors).length > 0) {
      setEditFormErrors(errors);
      toast.error(Object.values(errors)[0]);
      return;
    }
    setEditFormErrors({});
    let photoUrl = editForm.photo;
    try {
      if (newPhotoFile) {
        // If uploadPhoto is available, use it; otherwise keep the object URL as preview
        try {
          const { uploadPhoto: up } = await import("../utils/photoStorage");
          photoUrl = await up(newPhotoFile);
        } catch {
          // Keep the object URL if upload fails
          photoUrl = editForm.photo;
          console.warn("Photo upload failed, keeping existing photo");
        }
      }
    } catch (_err) {
      console.warn("Photo update failed, keeping old photo");
    }
    // Phase 18B: remote-first, same discipline as create - Zustand is
    // only updated with what Supabase actually persisted, never before.
    const result = await updateEmployeeRemote({
      ...editingEmployee,
      name: editForm.name.trim(),
      phone: editForm.phone.trim(),
      role: editForm.role,
      monthlySalary: Number.parseFloat(editForm.monthlySalary) || 0,
      joiningDate: editForm.joiningDate,
      photoRef: photoUrl || editingEmployee.photoRef,
      designation: editForm.designation.trim() || undefined,
      bloodGroup: editForm.bloodGroup.trim() || undefined,
      emergencyContactName: editForm.emergencyContactName.trim() || undefined,
      emergencyContactRelation:
        editForm.emergencyContactRelation.trim() || undefined,
      emergencyContactPhone: editForm.emergencyContactPhone.trim() || undefined,
      employmentType: editForm.employmentType,
      tempStartDate:
        editForm.employmentType === "Temporary" && editForm.tempStartDate
          ? editForm.tempStartDate
          : undefined,
      tempEndDate:
        editForm.employmentType === "Temporary" && editForm.tempEndDate
          ? editForm.tempEndDate
          : undefined,
      dailyWageRate:
        editForm.employmentType === "Daily Wage" && editForm.dailyWageRate
          ? Number.parseFloat(editForm.dailyWageRate)
          : undefined,
    });

    if (result.status === "unauthenticated") {
      toast.error("Not signed in to Supabase - changes were not saved.");
      return;
    }
    if (result.status === "error" || !result.data) {
      toast.error(
        `Could not update employee: ${result.error ?? "unknown error"}`,
      );
      return;
    }

    // Preserve the local-only userId link (no DB representation - Phase
    // 18A/18B mapping) since the returned row can't carry it.
    updateEmployee({ ...result.data, userId: editingEmployee.userId });
    toast.success("Employee updated");
    setEditDialogOpen(false);
    setEditingEmployee(null);
    setNewPhotoFile(null);
  };

  if (!canView(currentUser, "employees")) {
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
    <div className="space-y-5" data-ocid="employees.page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <UserCircle2 className="w-5 h-5 text-primary" />
            Employees
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {employees.length} employee{employees.length !== 1 ? "s" : ""}
          </p>
        </div>
        {pCreate && (
          <Button
            onClick={() => {
              setFormErrors({});
              setDialogOpen(true);
            }}
            data-ocid="employees.open_modal_button"
          >
            <Plus className="w-4 h-4 mr-1.5" /> New Employee
          </Button>
        )}
      </div>

      <div className="table-wrapper">
        <div className="rounded-md border" data-ocid="employees.table">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-10" />
                <TableHead className="text-xs font-semibold">Name</TableHead>
                <TableHead className="text-xs font-semibold">Role</TableHead>
                {canSeeSalary && (
                  <>
                    <TableHead className="text-xs font-semibold">
                      Phone
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Monthly Salary
                    </TableHead>
                  </>
                )}
                <TableHead className="text-xs font-semibold">
                  Joining Date
                </TableHead>
                <TableHead className="text-xs font-semibold w-32">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((emp, i) => (
                <TableRow key={emp.id} data-ocid={`employees.item.${i + 1}`}>
                  <TableCell className="w-10">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={emp.photoRef} alt={emp.name} />
                      <AvatarFallback className="text-xs">
                        {emp.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {emp.name}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        ROLE_COLORS[emp.role]
                      }`}
                    >
                      {emp.role}
                    </span>
                  </TableCell>
                  {canSeeSalary && (
                    <>
                      <TableCell className="text-sm">
                        {emp.phone || "—"}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        ₹{emp.monthlySalary.toLocaleString("en-IN")}
                      </TableCell>
                    </>
                  )}
                  <TableCell className="text-sm text-muted-foreground">
                    {emp.joiningDate
                      ? new Date(emp.joiningDate).toLocaleDateString("en-IN")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => onViewEmployee(emp.id)}
                        data-ocid={`employees.view_button.${i + 1}`}
                      >
                        View
                      </Button>
                      {pEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => openEditDialog(emp)}
                          data-ocid={`employees.edit_button.${i + 1}`}
                          title="Edit employee"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {pDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => {
                            // Same local-only guard the store's own
                            // deleteEmployee() already enforces, checked
                            // first so a blocked delete never even offers
                            // the confirm dialog.
                            const s = useStore.getState();
                            const hasSalary = (s.salaryPayments || []).some(
                              (sp) => sp.employeeId === emp.id,
                            );
                            const hasAdvance = (s.advanceRecords || []).some(
                              (ar) => ar.employeeId === emp.id,
                            );
                            if (hasSalary || hasAdvance) {
                              toast.error(
                                "Cannot delete employee. Linked salary payments or advance records exist.",
                              );
                              return;
                            }
                            setDeleteTarget(emp);
                          }}
                          data-ocid={`employees.delete_button.${i + 1}`}
                          title="Delete employee"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {employees.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={canSeeSalary ? 7 : 5}
                    className="text-center py-10 text-sm text-muted-foreground"
                    data-ocid="employees.empty_state"
                  >
                    No employees found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Add Employee Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-ocid="employees.dialog">
          <DialogHeader>
            <DialogTitle>New Employee</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-2">
              {/* Photo upload */}
              <div className="space-y-1.5">
                <Label>Profile Photo (JPG/PNG)</Label>
                <div className="flex items-center gap-3">
                  <Avatar className="h-14 w-14">
                    <AvatarImage
                      src={photoPreview ?? undefined}
                      alt="Preview"
                    />
                    <AvatarFallback>
                      <UserCircle2 className="h-7 w-7 text-muted-foreground" />
                    </AvatarFallback>
                  </Avatar>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    data-ocid="employees.upload_button"
                  >
                    <Upload className="w-3.5 h-3.5 mr-1.5" />
                    {photoFile ? "Change Photo" : "Upload Photo"}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpg,image/jpeg,image/png"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                </div>
              </div>

              <div className="form-grid">
                <div className="space-y-1.5 col-span-2">
                  <Label>Full Name *</Label>
                  <Input
                    placeholder="e.g. Ravi Sharma"
                    value={form.name}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, name: e.target.value }));
                      setFormErrors((p) => ({ ...p, name: "" }));
                    }}
                    className={formErrors.name ? "border-destructive" : ""}
                    aria-invalid={!!formErrors.name}
                    data-ocid="employees.input"
                  />
                  {formErrors.name && (
                    <p className="text-xs text-destructive">
                      {formErrors.name}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input
                    placeholder="9876543210"
                    value={form.phone}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, phone: e.target.value }))
                    }
                    data-ocid="employees.input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Role *</Label>
                  <Select
                    value={form.role}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, role: v as UserRole }))
                    }
                  >
                    <SelectTrigger data-ocid="employees.select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Admin">Admin</SelectItem>
                      <SelectItem value="Accountant">Accountant</SelectItem>
                      <SelectItem value="Designer">Designer</SelectItem>
                      <SelectItem value="Worker">Worker</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Monthly Salary (₹)</Label>
                  <Input
                    type="number"
                    placeholder="25000"
                    value={form.monthlySalary}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, monthlySalary: e.target.value }))
                    }
                    data-ocid="employees.input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Joining Date</Label>
                  <Input
                    type="date"
                    max={MAX_JOINING_DATE}
                    value={form.joiningDate}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, joiningDate: e.target.value }));
                      setFormErrors((p) => ({ ...p, joiningDate: "" }));
                    }}
                    className={
                      formErrors.joiningDate ? "border-destructive" : ""
                    }
                    aria-invalid={!!formErrors.joiningDate}
                    data-ocid="employees.input"
                  />
                  {formErrors.joiningDate && (
                    <p className="text-xs text-destructive">
                      {formErrors.joiningDate}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Username *</Label>
                  <Input
                    placeholder="login username"
                    value={form.username}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, username: e.target.value }));
                      setFormErrors((p) => ({ ...p, username: "" }));
                    }}
                    className={formErrors.username ? "border-destructive" : ""}
                    aria-invalid={!!formErrors.username}
                    data-ocid="employees.input"
                  />
                  {formErrors.username && (
                    <p className="text-xs text-destructive">
                      {formErrors.username}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Temporary Password *</Label>
                  <Input
                    type="password"
                    placeholder="At least 8 characters"
                    value={form.password}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, password: e.target.value }));
                      setFormErrors((p) => ({ ...p, password: "" }));
                    }}
                    className={formErrors.password ? "border-destructive" : ""}
                    aria-invalid={!!formErrors.password}
                    data-ocid="employees.input"
                  />
                  {formErrors.password && (
                    <p className="text-xs text-destructive">
                      {formErrors.password}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Designation</Label>
                  <Input
                    placeholder="e.g. Senior Fabricator"
                    value={form.designation}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, designation: e.target.value }))
                    }
                    data-ocid="employees.input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Blood Group</Label>
                  <Select
                    value={form.bloodGroup}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, bloodGroup: v }))
                    }
                  >
                    <SelectTrigger data-ocid="employees.select">
                      <SelectValue placeholder="Select blood group" />
                    </SelectTrigger>
                    <SelectContent>
                      {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(
                        (bg) => (
                          <SelectItem key={bg} value={bg}>
                            {bg}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Employment Type</Label>
                  <Select
                    value={form.employmentType}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        employmentType: v as EmploymentType,
                      }))
                    }
                  >
                    <SelectTrigger data-ocid="employees.form.employment_type.select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Permanent">Permanent</SelectItem>
                      <SelectItem value="Temporary">Temporary</SelectItem>
                      <SelectItem value="Daily Wage">Daily Wage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.employmentType === "Temporary" && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Temp. Start Date</Label>
                      <Input
                        type="date"
                        value={form.tempStartDate}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            tempStartDate: e.target.value,
                          }))
                        }
                        data-ocid="employees.form.temp_start_date.input"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Temp. End Date</Label>
                      <Input
                        type="date"
                        value={form.tempEndDate}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            tempEndDate: e.target.value,
                          }))
                        }
                        data-ocid="employees.form.temp_end_date.input"
                      />
                    </div>
                  </>
                )}
                {form.employmentType === "Daily Wage" && (
                  <div className="space-y-1.5">
                    <Label>Daily Wage Rate (₹)</Label>
                    <Input
                      type="number"
                      value={form.dailyWageRate}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          dailyWageRate: e.target.value,
                        }))
                      }
                      data-ocid="employees.form.daily_wage_rate.input"
                    />
                  </div>
                )}
                <div className="space-y-1.5 col-span-2 pt-1">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                    Emergency Contact
                  </Label>
                </div>
                <div className="space-y-1.5">
                  <Label>Contact Name</Label>
                  <Input
                    placeholder="e.g. Sunita Sharma"
                    value={form.emergencyContactName}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        emergencyContactName: e.target.value,
                      }))
                    }
                    data-ocid="employees.input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Relationship</Label>
                  <Input
                    placeholder="e.g. Spouse"
                    value={form.emergencyContactRelation}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        emergencyContactRelation: e.target.value,
                      }))
                    }
                    data-ocid="employees.input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Emergency Phone</Label>
                  <Input
                    placeholder="9876543210"
                    value={form.emergencyContactPhone}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        emergencyContactPhone: e.target.value,
                      }))
                    }
                    data-ocid="employees.input"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={uploading}
                data-ocid="employees.cancel_button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSaving || uploading}
                data-ocid="employees.submit_button"
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Add Employee"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Employee Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent data-ocid="employees.edit.dialog">
          <DialogHeader>
            <DialogTitle>Edit Employee</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit}>
            <div className="space-y-4 py-2">
              <div className="mb-3">
                <Label className="text-sm font-medium mb-1 block">
                  Profile Photo
                </Label>
                {editForm.photo && (
                  <img
                    src={editForm.photo}
                    alt="Profile"
                    className="w-16 h-16 rounded-full object-cover mb-2"
                  />
                )}
                {!editForm.photo && editingEmployee?.photoRef && (
                  <img
                    src={editingEmployee.photoRef}
                    alt="Profile"
                    className="w-16 h-16 rounded-full object-cover mb-2"
                  />
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleEditPhotoChange}
                  className="block text-sm text-muted-foreground"
                />
                {editForm.photo && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditForm((prev) => ({ ...prev, photo: null }));
                      setNewPhotoFile(null);
                    }}
                    className="text-xs text-destructive mt-1 hover:underline"
                  >
                    Remove Photo
                  </button>
                )}
              </div>
              <div className="form-grid">
                <div className="space-y-1.5 col-span-2">
                  <Label>Full Name *</Label>
                  <Input
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, name: e.target.value }))
                    }
                    data-ocid="employees.edit.name.input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input
                    value={editForm.phone}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, phone: e.target.value }))
                    }
                    data-ocid="employees.edit.phone.input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select
                    value={editForm.role}
                    onValueChange={(v) =>
                      setEditForm((f) => ({ ...f, role: v as UserRole }))
                    }
                  >
                    <SelectTrigger data-ocid="employees.edit.role.select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Admin">Admin</SelectItem>
                      <SelectItem value="Accountant">Accountant</SelectItem>
                      <SelectItem value="Designer">Designer</SelectItem>
                      <SelectItem value="Worker">Worker</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Monthly Salary (₹)</Label>
                  <Input
                    type="number"
                    value={editForm.monthlySalary}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        monthlySalary: e.target.value,
                      }))
                    }
                    data-ocid="employees.edit.salary.input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Joining Date</Label>
                  <Input
                    type="date"
                    max={MAX_JOINING_DATE}
                    value={editForm.joiningDate}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        joiningDate: e.target.value,
                      }))
                    }
                    data-ocid="employees.edit.joiningdate.input"
                    className={
                      editFormErrors.joiningDate ? "border-destructive" : ""
                    }
                  />
                  {editFormErrors.joiningDate && (
                    <p className="text-xs text-destructive">
                      {editFormErrors.joiningDate}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Designation</Label>
                  <Input
                    placeholder="e.g. Senior Fabricator"
                    value={editForm.designation}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        designation: e.target.value,
                      }))
                    }
                    data-ocid="employees.edit.designation.input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Blood Group</Label>
                  <Select
                    value={editForm.bloodGroup}
                    onValueChange={(v) =>
                      setEditForm((f) => ({ ...f, bloodGroup: v }))
                    }
                  >
                    <SelectTrigger data-ocid="employees.edit.bloodgroup.select">
                      <SelectValue placeholder="Select blood group" />
                    </SelectTrigger>
                    <SelectContent>
                      {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(
                        (bg) => (
                          <SelectItem key={bg} value={bg}>
                            {bg}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Employment Type</Label>
                  <Select
                    value={editForm.employmentType}
                    onValueChange={(v) =>
                      setEditForm((f) => ({
                        ...f,
                        employmentType: v as EmploymentType,
                      }))
                    }
                  >
                    <SelectTrigger data-ocid="employees.edit.employment_type.select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Permanent">Permanent</SelectItem>
                      <SelectItem value="Temporary">Temporary</SelectItem>
                      <SelectItem value="Daily Wage">Daily Wage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editForm.employmentType === "Temporary" && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Temp. Start Date</Label>
                      <Input
                        type="date"
                        value={editForm.tempStartDate}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            tempStartDate: e.target.value,
                          }))
                        }
                        data-ocid="employees.edit.temp_start_date.input"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Temp. End Date</Label>
                      <Input
                        type="date"
                        value={editForm.tempEndDate}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            tempEndDate: e.target.value,
                          }))
                        }
                        data-ocid="employees.edit.temp_end_date.input"
                      />
                    </div>
                  </>
                )}
                {editForm.employmentType === "Daily Wage" && (
                  <div className="space-y-1.5">
                    <Label>Daily Wage Rate (₹)</Label>
                    <Input
                      type="number"
                      value={editForm.dailyWageRate}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          dailyWageRate: e.target.value,
                        }))
                      }
                      data-ocid="employees.edit.daily_wage_rate.input"
                    />
                  </div>
                )}
                <div className="space-y-1.5 col-span-2 pt-1">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                    Emergency Contact
                  </Label>
                </div>
                <div className="space-y-1.5">
                  <Label>Contact Name</Label>
                  <Input
                    placeholder="e.g. Sunita Sharma"
                    value={editForm.emergencyContactName}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        emergencyContactName: e.target.value,
                      }))
                    }
                    data-ocid="employees.edit.emergency_name.input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Relationship</Label>
                  <Input
                    placeholder="e.g. Spouse"
                    value={editForm.emergencyContactRelation}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        emergencyContactRelation: e.target.value,
                      }))
                    }
                    data-ocid="employees.edit.emergency_relation.input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Emergency Phone</Label>
                  <Input
                    placeholder="9876543210"
                    value={editForm.emergencyContactPhone}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        emergencyContactPhone: e.target.value,
                      }))
                    }
                    data-ocid="employees.edit.emergency_phone.input"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditDialogOpen(false)}
                data-ocid="employees.edit.cancel_button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isEditSaving}
                data-ocid="employees.edit.save_button"
              >
                {isEditSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete employee?"
        description={`Employee "${deleteTarget?.name}" will be permanently deleted.`}
        onConfirm={handleConfirmDeleteEmployee}
      />
    </div>
  );
}
