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
  ImageIcon,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { ShieldOff } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { ConfirmDeleteDialog } from "../components/ConfirmDeleteDialog";
import { CustomerSelect } from "../components/CustomerSelect";
import { DeadlineIndicator } from "../components/DeadlineIndicator";
import { QuickAddCustomerDialog } from "../components/QuickAddCustomerDialog";
import { useUpdateProjectDeadline } from "../hooks/useUpdateProjectDeadline";
import {
  getAssetPhotoSignedUrl,
  resolveCoverStoragePath,
} from "../lib/assetPhotosApi";
import { compareByDeadlinePriority } from "../lib/deadlinePriority";
import {
  createProjectRemote,
  deleteProjectRemote,
  updateProjectRemote,
} from "../lib/projectsApi";
import { getCustomerVisibleName, getProjectSearchText } from "../lib/utils";
import { canCreate, canDelete, canEdit, canView } from "../permissions";
import { useStore } from "../store";
import type { Project } from "../types";

// Phase 57 (Group 2, Master Monster Prompt) — work type classification.
// Quantity is only genuinely optional for the three "not necessarily a
// fixed run yet" types; every other type keeps quantity required, same
// as today's behavior.
const WORK_TYPES: { value: NonNullable<Project["workType"]>; label: string }[] =
  [
    { value: "full_manufacturing", label: "Full Manufacturing" },
    { value: "sample", label: "Sample" },
    { value: "prototype", label: "Prototype" },
    { value: "trial", label: "Trial / Development" },
    { value: "production", label: "Production" },
    { value: "service", label: "Service / Processing" },
    { value: "partial_manufacturing", label: "Partial Manufacturing" },
    { value: "subcontract", label: "Subcontract / External Work" },
    { value: "other", label: "Other" },
  ];
const QUANTITY_OPTIONAL_WORK_TYPES = new Set<Project["workType"]>([
  "sample",
  "prototype",
  "trial",
]);

interface Props {
  onViewProject: (id: string) => void;
}

export function Projects({ onViewProject }: Props) {
  const { currentUser } = useAuth();

  const {
    customers,
    projects,
    assetPhotos,
    addProject,
    updateProject,
    generateDocNo,
    deleteProject,
  } = useStore();
  const pCreate = canCreate(currentUser, "projects");
  const pEdit = canEdit(currentUser, "projects");
  const pDelete = canDelete(currentUser, "projects");
  const pView = canView(currentUser, "projects");

  // Project Cover thumbnails (see AssetPhoto in types.ts). `assetPhotos`
  // above is already hydrated org-wide in one query at app load — this
  // is a client-side filter over that existing data, not a second
  // database query per row. Signed URLs still have to be resolved one
  // per cover photo (Storage API call, not a DB read) since they're
  // never cached/stored, same as every AssetPhotoGallery instance does.
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
  // biome-ignore lint/correctness/useExhaustiveDependencies: coverUrls is read only to compute `missing` (already-resolved URLs must not re-trigger this effect, or every resolved URL would immediately refetch everything again — same reasoning as AssetPhotoGallery's own signed-URL effect)
  useEffect(() => {
    const covers = (assetPhotos || []).filter(
      (p) => p.ownerType === "project" && p.isPrimary,
    );
    const missing = covers.filter((p) => !coverUrls[p.ownerId]);
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(
      missing.map(
        async (p) =>
          [
            p.ownerId,
            await getAssetPhotoSignedUrl(resolveCoverStoragePath(p)),
          ] as const,
      ),
    ).then((entries) => {
      if (cancelled) return;
      setCoverUrls((prev) => {
        const next = { ...prev };
        for (const [projectId, url] of entries) if (url) next[projectId] = url;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [assetPhotos]);
  // Master ERP Architecture — "Add Customer" from inside Add Project
  // still creates a real customer row, so it stays gated on the
  // customer module's own create permission, not the project one.
  const pCreateCustomer = canCreate(currentUser, "customers");
  const { updateDeadline } = useUpdateProjectDeadline();

  const [search, setSearch] = useState("");
  // §5/§6 — top-level project type/category filter + sort. Reuses the
  // exact same workType field/values the New Project dialog already
  // writes (WORK_TYPES above) rather than inventing a second concept.
  const [workTypeFilter, setWorkTypeFilter] = useState<
    NonNullable<Project["workType"]> | "all"
  >("all");
  const [sortBy, setSortBy] = useState<
    "newest" | "oldest" | "name" | "code" | "customer" | "deadline"
  >("newest");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [quickAddCustomerOpen, setQuickAddCustomerOpen] = useState(false);
  const [form, setForm] = useState({
    customerId: "",
    projectName: "",
    workDescription: "",
    totalQty: "",
    workType: "full_manufacturing" as NonNullable<Project["workType"]>,
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
    if (workTypeFilter !== "all" && p.workType !== workTypeFilter) return false;
    const customer = customers.find((c) => c.id === p.customerId);
    const q = search.toLowerCase();
    return (
      getProjectSearchText(p).includes(q) ||
      (customer?.name.toLowerCase().includes(q) ?? false)
    );
  });

  // §6 — sort applies on top of the search + type filter above, same
  // Supabase-backed `projects` array both already read from; nothing new
  // fetched, no new field invented.
  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case "oldest":
        return a.createdAt - b.createdAt;
      case "name":
        return getCustomerVisibleName(a).localeCompare(
          getCustomerVisibleName(b),
        );
      case "code":
        return a.projectNo.localeCompare(b.projectNo);
      case "customer": {
        const cA = customers.find((c) => c.id === a.customerId)?.name ?? "";
        const cB = customers.find((c) => c.id === b.customerId)?.name ?? "";
        return cA.localeCompare(cB);
      }
      case "deadline":
        // The one reusable deadline-priority rule (lib/deadlinePriority.ts) —
        // overdue (oldest first), then due today, then upcoming (nearest
        // first), then no deadline. createdAt is the stable tiebreaker for
        // same-day deadlines, same field every other sort here already uses.
        return compareByDeadlinePriority(
          {
            deadline: a.customerCommittedDeliveryDate,
            tiebreaker: a.createdAt,
          },
          {
            deadline: b.customerCommittedDeliveryDate,
            tiebreaker: b.createdAt,
          },
        );
      default:
        return b.createdAt - a.createdAt;
    }
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
      const qtyOptional = QUANTITY_OPTIONAL_WORK_TYPES.has(form.workType);
      if (
        !qtyOptional &&
        (!form.totalQty ||
          Number.isNaN(Number(form.totalQty)) ||
          Number(form.totalQty) <= 0)
      ) {
        toast.error("Total Quantity is required");
        return;
      }
      if (
        form.totalQty &&
        (Number.isNaN(Number(form.totalQty)) || Number(form.totalQty) < 0)
      ) {
        toast.error("Total Quantity cannot be negative");
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
        totalQty: form.totalQty ? Number(form.totalQty) : undefined,
        workType: form.workType,
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
        workType: "full_manufacturing",
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
      const editQtyOptional = QUANTITY_OPTIONAL_WORK_TYPES.has(
        editForm.workType,
      );
      if (!editQtyOptional && (!editForm.totalQty || editForm.totalQty <= 0)) {
        toast.error("Total Quantity is required");
        return;
      }
      if (editForm.totalQty !== undefined && editForm.totalQty < 0) {
        toast.error("Total Quantity cannot be negative");
        return;
      }
      const result = await updateProjectRemote(editForm);
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

      {/* Search + §5/§6 top-level project type filter and sort */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by project or customer..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-ocid="projects.search_input"
          />
        </div>
        <Select
          value={workTypeFilter}
          onValueChange={(v) => setWorkTypeFilter(v as typeof workTypeFilter)}
        >
          <SelectTrigger
            className="w-[180px]"
            data-ocid="projects.work_type_filter"
          >
            <SelectValue placeholder="Project Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {WORK_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={sortBy}
          onValueChange={(v) => setSortBy(v as typeof sortBy)}
        >
          <SelectTrigger className="w-[150px]" data-ocid="projects.sort_by">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="deadline">Deadline (earliest first)</SelectItem>
            <SelectItem value="name">Project name</SelectItem>
            <SelectItem value="code">Project code</SelectItem>
            <SelectItem value="customer">Customer</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Mobile card list (< sm) — responsive audit Fix 1. Same data,
          same actions/permissions/handlers as the table below; only the
          presentation differs. Desktop/tablet table is unchanged. */}
      <div className="sm:hidden space-y-2" data-ocid="projects.cards">
        {sorted.map((p, i) => {
          const customer = customers.find((c) => c.id === p.customerId);
          return (
            // Mouse/touch-only convenience on top of an already fully
            // keyboard-accessible control — the project-code button a few
            // lines down inside this same card. Making this wrapper itself
            // a focusable role="button" would invalidly nest it around
            // that button and the real Edit/Delete buttons further down.
            // biome-ignore lint/a11y/useKeyWithClickEvents: see comment above
            <div
              key={p.id}
              className="rounded-md border bg-card p-3 space-y-2 cursor-pointer active:bg-muted/40"
              onClick={() => onViewProject(p.id)}
              data-ocid={`projects.card.${i + 1}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  {/* Project Cover thumbnail — same compact neutral
                      placeholder as the desktop table when no cover
                      exists yet. */}
                  <div
                    className="w-9 h-9 rounded border bg-muted/40 shrink-0 overflow-hidden flex items-center justify-center"
                    data-ocid={`projects.card.${i + 1}.cover`}
                  >
                    {coverUrls[p.id] ? (
                      <img
                        src={coverUrls[p.id]}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-muted-foreground/50" />
                    )}
                  </div>
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
                  </div>
                  {/* Real focusable control, same reasoning as the desktop
                      table's primary cell above — keyboard/screen-reader
                      users get a genuine interactive element rather than
                      relying on the card's own onClick (a div is not
                      keyboard-operable, and nesting role="button" here
                      would invalidly nest it around the Edit/Delete
                      buttons below). */}
                  <button
                    type="button"
                    className="text-xs font-mono font-semibold text-primary mt-0.5 hover:underline focus-visible:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewProject(p.id);
                    }}
                    data-ocid={`projects.card_open_button.${i + 1}`}
                  >
                    {p.projectNo}
                  </button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {customer?.name ?? "—"}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Created {new Date(p.createdAt).toLocaleDateString("en-IN")}
              </div>
              {/* Stops the card's own onClick (navigate to project) from
                  firing when the user interacts with DeadlineIndicator's
                  real, keyboard-accessible button/dialog controls below -
                  same reasoning as the card wrapper's own ignore above. */}
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: see comment above */}
              <div onClick={(e) => e.stopPropagation()}>
                <DeadlineIndicator
                  deadline={p.customerCommittedDeliveryDate}
                  canEdit={pEdit}
                  onUpdate={(newDate) => updateDeadline(p, newDate)}
                  compact
                  dataOcidPrefix={`projects.card.${i + 1}.deadline`}
                />
              </div>
              {(pEdit || pDelete) && (
                <div className="flex items-center gap-1.5 pt-1">
                  {pEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2.5 text-xs flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditForm(p);
                        setEditDialogOpen(true);
                      }}
                      data-ocid={`projects.card_edit_button.${i + 1}`}
                      title="Edit project"
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                    </Button>
                  )}
                  {pDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2.5 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProject(p);
                      }}
                      data-ocid={`projects.card_delete_button.${i + 1}`}
                      title="Delete project"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {sorted.length === 0 && (
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
                <TableHead className="text-xs font-semibold w-12">
                  <span className="sr-only">Cover</span>
                </TableHead>
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
                <TableHead className="text-xs font-semibold">
                  Deadline
                </TableHead>
                <TableHead className="text-xs font-semibold w-24">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((p, i) => {
                const customer = customers.find((c) => c.id === p.customerId);
                return (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => onViewProject(p.id)}
                    data-ocid={`projects.item.${i + 1}`}
                  >
                    <TableCell>
                      {/* Project Cover thumbnail — compact neutral
                          placeholder (never a broken image) when no
                          cover exists yet. */}
                      <div
                        className="w-8 h-8 rounded border bg-muted/40 shrink-0 overflow-hidden flex items-center justify-center"
                        data-ocid={`projects.item.${i + 1}.cover`}
                      >
                        {coverUrls[p.id] ? (
                          <img
                            src={coverUrls[p.id]}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ImageIcon className="w-3.5 h-3.5 text-muted-foreground/50" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono font-semibold text-primary">
                      {/* Global record-navigation rule (§1) — the primary
                          identity cell is a real focusable control, so
                          keyboard/screen-reader users get the same
                          navigation the row-level onClick gives mouse
                          users; the row click above is the ergonomic
                          bonus, this button is the accessible baseline. */}
                      <button
                        type="button"
                        className="hover:underline focus-visible:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewProject(p.id);
                        }}
                        data-ocid={`projects.open_button.${i + 1}`}
                      >
                        {p.projectNo}
                      </button>
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
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DeadlineIndicator
                        deadline={p.customerCommittedDeliveryDate}
                        canEdit={pEdit}
                        onUpdate={(newDate) => updateDeadline(p, newDate)}
                        compact
                        dataOcidPrefix={`projects.row.${i + 1}.deadline`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
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
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
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
                  onAddNew={
                    pCreateCustomer
                      ? () => setQuickAddCustomerOpen(true)
                      : undefined
                  }
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
                <Label htmlFor="proj-worktype">Work Type</Label>
                <Select
                  value={form.workType}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      workType: v as NonNullable<Project["workType"]>,
                    }))
                  }
                >
                  <SelectTrigger
                    id="proj-worktype"
                    data-ocid="projects.work_type.select"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WORK_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <Label htmlFor="proj-totalqty">
                  Total Quantity
                  {QUANTITY_OPTIONAL_WORK_TYPES.has(form.workType) ? (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      (optional for {form.workType})
                    </span>
                  ) : (
                    " *"
                  )}
                </Label>
                <Input
                  id="proj-totalqty"
                  type="number"
                  min={0}
                  placeholder={
                    QUANTITY_OPTIONAL_WORK_TYPES.has(form.workType)
                      ? "Not decided yet — leave blank"
                      : "e.g. 100"
                  }
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
                  <Label htmlFor="edit-proj-worktype">Work Type</Label>
                  <Select
                    value={editForm.workType || "full_manufacturing"}
                    onValueChange={(v) =>
                      setEditForm((f) =>
                        f
                          ? {
                              ...f,
                              workType: v as NonNullable<Project["workType"]>,
                            }
                          : f,
                      )
                    }
                  >
                    <SelectTrigger
                      id="edit-proj-worktype"
                      data-ocid="projects.edit.work_type.select"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WORK_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <Label htmlFor="edit-proj-totalqty">
                    Total Quantity
                    {QUANTITY_OPTIONAL_WORK_TYPES.has(editForm.workType) ? (
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        (optional for {editForm.workType})
                      </span>
                    ) : (
                      " *"
                    )}
                  </Label>
                  <Input
                    id="edit-proj-totalqty"
                    type="number"
                    min={0}
                    placeholder="e.g. 100"
                    value={editForm.totalQty ?? ""}
                    onChange={(e) =>
                      setEditForm((f) =>
                        f
                          ? {
                              ...f,
                              totalQty: e.target.value
                                ? Number(e.target.value)
                                : undefined,
                            }
                          : f,
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

      <QuickAddCustomerDialog
        open={quickAddCustomerOpen}
        onOpenChange={setQuickAddCustomerOpen}
        onCreated={(customer) =>
          setForm((f) => ({ ...f, customerId: customer.id }))
        }
      />
    </div>
  );
}
