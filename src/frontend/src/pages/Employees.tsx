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
import { hashPassword } from "../authUtils";
import {
  canCreate,
  canDelete,
  canEdit,
  canView,
  hasPermission,
} from "../permissions";
import { useStore } from "../store";
import type { AuthUser, Employee, UserRole } from "../types";
import { uploadPhoto } from "../utils/photoStorage";

const ROLE_COLORS: Record<string, string> = {
  Admin: "bg-red-100 text-red-700",
  Accountant: "bg-blue-100 text-blue-700",
  Designer: "bg-purple-100 text-purple-700",
  Worker: "bg-green-100 text-green-700",
};

interface Props {
  onViewEmployee: (id: string) => void;
}

export function Employees({ onViewEmployee }: Props) {
  const { currentUser } = useAuth();
  const {
    employees,
    addEmployee,
    addAuthUser,
    updateEmployee,
    deleteEmployee,
  } = useStore();

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
  });
  const [editForm, setEditForm] = useState({
    name: "",
    phone: "",
    role: "Worker" as UserRole,
    monthlySalary: "",
    joiningDate: "",
    photo: null as string | null,
  });
  const [newPhotoFile, setNewPhotoFile] = useState<File | null>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("FORM SUBMITTED");
    if (isSaving) return;
    setIsSaving(true);
    try {
      await handleSave();
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.username.trim() || !form.password.trim()) {
      toast.error("Name, Username, and Password are required");
      return;
    }
    const empId = `emp-${Date.now()}`;
    const userId = `user-${Date.now()}`;
    let passwordHash: string;
    try {
      passwordHash = await hashPassword(form.password);
    } catch (err) {
      console.error("Password hash failed", err);
      toast.error("Failed to process password. Please try again.");
      return;
    }

    const newUser: AuthUser = {
      id: userId,
      username: form.username.trim(),
      passwordHash,
      role: form.role,
      employeeId: empId,
    };
    const newEmp: Employee = {
      id: empId,
      name: form.name.trim(),
      phone: form.phone.trim(),
      role: form.role,
      monthlySalary: Number.parseFloat(form.monthlySalary) || 0,
      joiningDate: form.joiningDate,
      userId,
    };

    if (photoFile) {
      setUploading(true);
      try {
        const url = await uploadPhoto(photoFile);
        newEmp.photoRef = url;
      } catch (_err) {
        console.error(_err);
        toast.error(
          "Photo upload failed. Employee will be saved without photo.",
        );
      } finally {
        setUploading(false);
      }
    }

    addAuthUser(newUser);
    addEmployee(newEmp);
    console.log("SAVE COMPLETE");
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
    console.log("FORM SUBMITTED");
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
    if (!editForm.name.trim()) {
      toast.error("Name is required");
      return;
    }
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
    updateEmployee({
      ...editingEmployee,
      name: editForm.name.trim(),
      phone: editForm.phone.trim(),
      role: editForm.role,
      monthlySalary: Number.parseFloat(editForm.monthlySalary) || 0,
      joiningDate: editForm.joiningDate,
      photoRef: photoUrl || editingEmployee.photoRef,
    });
    console.log("SAVE COMPLETE");
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
            onClick={() => setDialogOpen(true)}
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
                            if (
                              !window.confirm(
                                `Are you sure you want to delete employee "${emp.name}"? This cannot be undone.`,
                              )
                            )
                              return;
                            deleteEmployee(emp.id);
                            toast.success("Employee deleted");
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
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                    data-ocid="employees.input"
                  />
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
                    value={form.joiningDate}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, joiningDate: e.target.value }))
                    }
                    data-ocid="employees.input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Username *</Label>
                  <Input
                    placeholder="login username"
                    value={form.username}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, username: e.target.value }))
                    }
                    data-ocid="employees.input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Password *</Label>
                  <Input
                    type="password"
                    placeholder="set password"
                    value={form.password}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, password: e.target.value }))
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
                    value={editForm.joiningDate}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        joiningDate: e.target.value,
                      }))
                    }
                    data-ocid="employees.edit.joiningdate.input"
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
    </div>
  );
}
