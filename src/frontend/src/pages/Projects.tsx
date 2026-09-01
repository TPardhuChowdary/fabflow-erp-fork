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
  FolderKanban,
  FolderOpen,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { ShieldOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { ConfirmDeleteDialog } from "../components/ConfirmDeleteDialog";
import { CustomerSelect } from "../components/CustomerSelect";
import {
  createProjectRemote,
  deleteProjectRemote,
  updateProjectRemote,
} from "../lib/projectsApi";
import { getCustomerVisibleName, getProjectSearchText } from "../lib/utils";
import { canCreate, canDelete, canEdit, canView } from "../permissions";
import { useStore } from "../store";
import type { Project } from "../types";

interface Props {
  onViewProject: (id: string) => void;
}

export function Projects({ onViewProject }: Props) {
  const { currentUser } = useAuth();

  const {
    customers,
    projects,
    addProject,
    updateProject,
    generateDocNo,
    deleteProject,
  } = useStore();
  const pCreate = canCreate(currentUser, "projects");
  const pEdit = canEdit(currentUser, "projects");
  const pDelete = canDelete(currentUser, "projects");
  const pView = canView(currentUser, "projects");

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    customerId: "",
    projectName: "",
    workDescription: "",
    totalQty: "",
  });

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState<Project | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteProjectTarget, setDeleteProjectTarget] =
    useState<Project | null>(null);
  // Users with any permission (view/create/edit) see all projects
  // Only users with NO project permissions at all see just their assigned projects
  const visibleProjects =
    pView || pCreate || pEdit
      ? projects
      : projects.filter((p) =>
          p.assignedEmployeeIds?.includes(currentUser?.employeeId ?? ""),
        );

  const filtered = visibleProjects.filter((p) => {
    const customer = customers.find((c) => c.id === p.customerId);
    const q = search.toLowerCase();
    return (
      getProjectSearchText(p).includes(q) ||
      (customer?.name.toLowerCase().includes(q) ?? false)
    );
  });

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      if (!pCreate) {
        toast.error("Access restricted: create permission required");
        return;
      }
      if (!form.customerId || !form.projectName.trim()) {
        toast.error("Customer and Project Name are required");
        return;
      }
      if (
        !form.totalQty ||
        Number.isNaN(Number(form.totalQty)) ||
        Number(form.totalQty) <= 0
      ) {
        toast.error("Total Quantity is required");
        return;
      }
      // Phase 22 — remote-first, with bounded retry-on-conflict for the
      // project number handled inside createProjectRemote(). The number
      // generated here from the local counter is only the *initial*
      // attempt - on a collision the API module re-derives it from
      // actual server state, never calling generateDocNo() again.
      // productionVersion is forced to "v2" here to match what the local
      // addProject() action already forces unconditionally, so the DB
      // row and the resulting local state never disagree on it.
      const result = await createProjectRemote({
        projectNo: generateDocNo("PROJ"),
        customerId: form.customerId,
        projectName: form.projectName.trim(),
        workDescription: form.workDescription.trim(),
        totalQty: Number(form.totalQty),
        productionVersion: "v2",
      });
      if (result.status === "unauthenticated") {
        toast.error("Not signed in to the server - project was not saved");
        return;
      }
      if (result.status === "denied" || result.status === "error") {
        toast.error(result.error ?? "Could not save project");
        return;
      }
      if (!result.data) {
        toast.error("Could not save project");
        return;
      }
      // addProject() also seeds the local-only projectProductions stage
      // state (DEFAULT_V2_STAGES) exactly as before, keyed off
      // result.data.id - the real DB UUID. That local stage seeding is
      // explicitly out of scope this phase and is left untouched.
      addProject(result.data);
      toast.success(`Project ${result.data.projectNo} created`);
      setDialogOpen(false);
      setForm({
        customerId: "",
        projectName: "",
        workDescription: "",
        totalQty: "",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      if (!pEdit) {
        toast.error("Access restricted: edit permission required");
        return;
      }
      if (!editForm) return;
      if (!editForm.customerId || !editForm.projectName.trim()) {
        toast.error("Customer and Project Name are required");
        return;
      }
      if (!editForm.totalQty || Number(editForm.totalQty) <= 0) {
        toast.error("Total Quantity is required");
        return;
      }
      const result = await updateProjectRemote({
        ...editForm,
        totalQty: Number(editForm.totalQty),
      });
      if (result.status === "unauthenticated") {
        toast.error("Not signed in to the server - project was not updated");
        return;
      }
      if (result.status === "denied" || result.status === "error") {
        toast.error(result.error ?? "Could not update project");
        return;
      }
      if (!result.data) {
        toast.error("Could not update project");
        return;
      }
      // updateProjectRemote's returned row never carries the local-only
      // fields (assignedEmployeeIds/pos/poNumber/poDate/poFiles, per the
      // explicitly approved decisions) - re-attach them from the
      // pre-update local object, since this update never touches them
      // and they must not be silently wiped.
      updateProject({
        ...result.data,
        assignedEmployeeIds: editForm.assignedEmployeeIds,
        pos: editForm.pos,
        poNumber: editForm.poNumber,
        poDate: editForm.poDate,
        poFiles: editForm.poFiles,
      });
      toast.success("Project updated");
      setEditDialogOpen(false);
      setEditForm(null);
    } finally {
      setIsSaving(false);
    }
  };

  // Shared by the desktop table row and the mobile card (Fix 1) so this
  // logic exists exactly once rather than being duplicated per layout.
  // Split into a "request" step (permission + linked-record guard, then
  // opens the confirm dialog) and a "confirmed" step (the actual remote
  // delete) so the destructive action itself only ever runs from the
  // dialog's own Delete button, never from a native confirm().
  const handleDeleteProject = (p: Project) => {
    // Local linked-record guard, fail-fast BEFORE even offering the
    // confirm dialog - same check store.ts's deleteProject runs,
    // duplicated here so we never attempt a delete for a project with
    // linked local records (mirrors Customers.tsx's established pattern).
    const s = useStore.getState();
    const hasInvoices = (s.invoices || []).some(
      (inv) => inv.projectId === p.id,
    );
    const hasDCs = (s.deliveryChallans || []).some((dc) =>
      (dc.projectEntries || []).some((entry) => entry.projectId === p.id),
    );
    const hasUsages = (s.materialUsages || []).some(
      (u) => u.projectId === p.id,
    );
    if (hasInvoices || hasDCs || hasUsages) {
      toast.error(
        "Cannot delete project. Linked records exist (invoices, delivery challans, or material usage).",
      );
      return;
    }
    setDeleteProjectTarget(p);
  };

  const handleConfirmDeleteProject = async () => {
    const p = deleteProjectTarget;
    if (!p) return;
    const result = await deleteProjectRemote(p.id);
    if (result.status === "unauthenticated") {
      toast.error("Not signed in to the server - project was not deleted");
      setDeleteProjectTarget(null);
      return;
    }
    if (result.status === "denied" || result.status === "error") {
      toast.error(result.error ?? "Could not delete project");
      setDeleteProjectTarget(null);
      return;
    }
    deleteProject(p.id);
    toast.success("Project deleted");
    setDeleteProjectTarget(null);
  };

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
    <div className="space-y-5" data-ocid="projects.page">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-primary" />
            Projects
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </p>
        </div>
        {pCreate && (
          <Button
            onClick={() => setDialogOpen(true)}
            data-ocid="projects.open_modal_button"
          >
            <Plus className="w-4 h-4 mr-1.5" /> New Project
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by project or customer..."
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-ocid="projects.search_input"
        />
      </div>

      {/* Mobile card list (< sm) — responsive audit Fix 1. Same data,
          same actions/permissions/handlers as the table below; only the
          presentation differs. Desktop/tablet table is unchanged. */}
      <div className="sm:hidden space-y-2" data-ocid="projects.cards">
        {filtered.map((p, i) => {
          const customer = customers.find((c) => c.id === p.customerId);
          return (
            <div
              key={p.id}
              className="rounded-md border bg-card p-3 space-y-2"
              data-ocid={`projects.card.${i + 1}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium truncate">
                      {getCustomerVisibleName(p)}
                    </span>
                    {p.projectType === "REPEAT_ORDER" &&
                      p.internalOrderCode && (
                        <span className="font-mono text-[10px] text-info bg-info/10 border border-info/30 px-1.5 py-0.5 rounded shrink-0">
                          Repeat · {p.internalOrderCode}
                        </span>
                      )}
                  </div>
                  <div className="text-xs font-mono font-semibold text-primary mt-0.5">
                    {p.projectNo}
                  </div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {customer?.name ?? "—"}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Created {new Date(p.createdAt).toLocaleDateString("en-IN")}
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs flex-1"
                  onClick={() => onViewProject(p.id)}
                  data-ocid={`projects.card_view_button.${i + 1}`}
                >
                  <FolderOpen className="w-3.5 h-3.5 mr-1" /> View
                </Button>
                {pEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5 text-xs"
                    onClick={() => {
                      setEditForm(p);
                      setEditDialogOpen(true);
                    }}
                    data-ocid={`projects.card_edit_button.${i + 1}`}
                    title="Edit project"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                )}
                {pDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-destructive hover:text-destructive"
                    onClick={() => handleDeleteProject(p)}
                    data-ocid={`projects.card_delete_button.${i + 1}`}
                    title="Delete project"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p
            className="text-center py-10 text-sm text-muted-foreground"
            data-ocid="projects.cards_empty_state"
          >
            No projects found
          </p>
        )}
      </div>

      {/* Table (>= sm) — unchanged from before Fix 1 except the delete
          handler now calls the shared handleDeleteProject function. */}
      <div className="hidden sm:block table-wrapper">
        <div className="rounded-md border" data-ocid="projects.table">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-xs font-semibold">
                  Project No
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Customer
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Project Name
                </TableHead>
                <TableHead className="text-xs font-semibold">
                  Description
                </TableHead>
                <TableHead className="text-xs font-semibold">Created</TableHead>
                <TableHead className="text-xs font-semibold w-24">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p, i) => {
                const customer = customers.find((c) => c.id === p.customerId);
                return (
                  <TableRow key={p.id} data-ocid={`projects.item.${i + 1}`}>
                    <TableCell className="text-xs font-mono font-semibold text-primary">
                      {p.projectNo}
                    </TableCell>
                    <TableCell className="text-sm">
                      {customer?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{getCustomerVisibleName(p)}</span>
                        {p.projectType === "REPEAT_ORDER" &&
                          p.internalOrderCode && (
                            <span className="font-mono text-[10px] text-info bg-info/10 border border-info/30 px-1.5 py-0.5 rounded shrink-0">
                              Repeat · {p.internalOrderCode}
                            </span>
                          )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">
                      {p.workDescription || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(p.createdAt).toLocaleDateString("en-IN")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => onViewProject(p.id)}
                          data-ocid={`projects.edit_button.${i + 1}`}
                        >
                          <FolderOpen className="w-3.5 h-3.5 mr-1" /> View
                        </Button>
                        {pEdit && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditForm(p);
                              setEditDialogOpen(true);
                            }}
                            data-ocid={`projects.edit_button_edit.${i + 1}`}
                            title="Edit project"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {pDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteProject(p);
                            }}
                            data-ocid={`projects.delete_button.${i + 1}`}
                            title="Delete project"
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
                    colSpan={6}
                    className="text-center py-10 text-sm text-muted-foreground"
                    data-ocid="projects.empty_state"
                  >
                    No projects found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* New Project Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-ocid="projects.dialog">
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="proj-customer">Customer *</Label>
                <CustomerSelect
                  value={form.customerId}
                  onChange={(v) => setForm((f) => ({ ...f, customerId: v }))}
                  className="w-full"
                  data-ocid="projects.select"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-name">Project Name *</Label>
                <Input
                  id="proj-name"
                  placeholder="e.g. MS Enclosure Set"
                  value={form.projectName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, projectName: e.target.value }))
                  }
                  data-ocid="projects.input"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-desc">Work Description</Label>
                <Textarea
                  id="proj-desc"
                  placeholder="Describe the work to be done..."
                  rows={3}
                  value={form.workDescription}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, workDescription: e.target.value }))
                  }
                  data-ocid="projects.textarea"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-totalqty">Total Quantity *</Label>
                <Input
                  id="proj-totalqty"
                  type="number"
                  min={1}
                  placeholder="e.g. 100"
                  value={form.totalQty}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, totalQty: e.target.value }))
                  }
                  data-ocid="projects.totalqty.input"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                data-ocid="projects.cancel_button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSaving}
                data-ocid="projects.submit_button"
              >
                {isSaving ? "Saving..." : "Create Project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* Edit Project Dialog */}
      {editForm && (
        <Dialog
          open={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open);
            if (!open) setEditForm(null);
          }}
        >
          <DialogContent data-ocid="projects.edit_dialog">
            <DialogHeader>
              <DialogTitle>Edit Project</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleEditSave();
              }}
            >
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-proj-customer">Customer *</Label>
                  <CustomerSelect
                    value={editForm.customerId}
                    onChange={(v) =>
                      setEditForm((f) => (f ? { ...f, customerId: v } : f))
                    }
                    className="w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-proj-name">Project Name *</Label>
                  <Input
                    id="edit-proj-name"
                    placeholder="e.g. MS Enclosure Set"
                    value={editForm.projectName}
                    onChange={(e) =>
                      setEditForm((f) =>
                        f ? { ...f, projectName: e.target.value } : f,
                      )
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-proj-desc">Work Description</Label>
                  <Textarea
                    id="edit-proj-desc"
                    placeholder="Describe the work to be done..."
                    rows={3}
                    value={editForm.workDescription || ""}
                    onChange={(e) =>
                      setEditForm((f) =>
                        f ? { ...f, workDescription: e.target.value } : f,
                      )
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-proj-totalqty">Total Quantity *</Label>
                  <Input
                    id="edit-proj-totalqty"
                    type="number"
                    min={1}
                    placeholder="e.g. 100"
                    value={editForm.totalQty ?? ""}
                    onChange={(e) =>
                      setEditForm((f) =>
                        f ? { ...f, totalQty: Number(e.target.value) } : f,
                      )
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditDialogOpen(false);
                    setEditForm(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      <ConfirmDeleteDialog
        open={!!deleteProjectTarget}
        onOpenChange={(o) => !o && setDeleteProjectTarget(null)}
        title="Delete project?"
        description={`Project "${deleteProjectTarget?.projectName}" will be permanently deleted.`}
        onConfirm={handleConfirmDeleteProject}
      />
    </div>
  );
}
