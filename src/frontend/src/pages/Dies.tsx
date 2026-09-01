import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { DrawingLinkPicker } from "@/components/DrawingLinkPicker";
import { VendorSelect } from "@/components/VendorSelect";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDrawingEditorStore } from "@/drawingEditor/store/useDrawingEditorStore";
import {
  Cog,
  Filter,
  ImagePlus,
  Pencil,
  Plus,
  ShieldOff,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import {
  createDieRemote,
  deleteDieRemote,
  updateDieRemote,
} from "../lib/diesApi";
import { canCreate, canDelete, canEdit, canView } from "../permissions";
import { useStore } from "../store";
import type { Die, DieStatus, MachineCondition } from "../types";

const DIE_STATUSES: DieStatus[] = [
  "Available",
  "In Use",
  "Under Maintenance",
  "Retired",
];
const CONDITIONS: MachineCondition[] = [
  "Excellent",
  "Good",
  "Fair",
  "Poor",
  "Critical",
];

const STATUS_COLOR: Record<DieStatus, string> = {
  Available: "bg-success/10 text-success border-success/30",
  "In Use": "bg-info/10 text-info border-info/30",
  "Under Maintenance": "bg-warning/15 text-warning border-warning/30",
  Retired: "bg-muted text-muted-foreground border-border",
};

export function Dies() {
  const { currentUser } = useAuth();
  const pCreate = canCreate(currentUser, "tooling_dies");
  const pEdit = canEdit(currentUser, "tooling_dies");
  const pDelete = canDelete(currentUser, "tooling_dies");

  const {
    dies,
    machines,
    projects,
    addDie,
    updateDie,
    deleteDie,
    generateDieCode,
  } = useStore();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [editingDie, setEditingDie] = useState<Die | null>(null);
  const [form, setForm] = useState<Partial<Die>>({});
  const [deleteTarget, setDeleteTarget] = useState<Die | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Phase 43 — mandatory Drawing Repository link, enforced on Create
  // only. Editing an existing (possibly still-unlinked) die never blocks
  // on this. See DrawingLinkPicker.tsx for why this stays purely local
  // in Create mode (the die has no id yet to link against).
  const [pendingDrawingIds, setPendingDrawingIds] = useState<string[]>([]);
  const {
    links: drawingLinks,
    linksLoaded,
    loadLinks,
    addLink: addDrawingLink,
    removeLink: removeDrawingLink,
  } = useDrawingEditorStore();

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount
  useEffect(() => {
    if (!linksLoaded) loadLinks();
  }, [linksLoaded]);

  const activeDies = useMemo(
    () => (dies || []).filter((d) => d.isActive !== false),
    [dies],
  );

  const filtered = useMemo(() => {
    return activeDies.filter((d) => {
      if (filterStatus !== "all" && d.status !== filterStatus) return false;
      if (
        search &&
        !d.name.toLowerCase().includes(search.toLowerCase()) &&
        !d.dieCode.toLowerCase().includes(search.toLowerCase())
      )
        return false;
      return true;
    });
  }, [activeDies, filterStatus, search]);

  const kpis = useMemo(
    () => ({
      total: activeDies.length,
      available: activeDies.filter((d) => d.status === "Available").length,
      inUse: activeDies.filter((d) => d.status === "In Use").length,
      underMaintenance: activeDies.filter(
        (d) => d.status === "Under Maintenance",
      ).length,
    }),
    [activeDies],
  );

  function openNew() {
    setForm({ status: "Available" });
    setEditingDie(null);
    setPendingDrawingIds([]);
    setShowForm(true);
  }

  function openEdit(d: Die) {
    setForm({ ...d });
    setEditingDie(d);
    setPendingDrawingIds([]);
    setShowForm(true);
  }

  const machineName = (id?: string) =>
    id ? (machines || []).find((m) => m.id === id)?.name : undefined;
  const projectName = (id?: string) =>
    id ? (projects || []).find((p) => p.id === id)?.projectName : undefined;

  // Phase 43 — same compress-to-JPEG-dataURL flow as MachineDetail.tsx's
  // handlePhotoUpload / Tools.tsx's handlePhotoSelect. Stored into form
  // state, submitted with the rest of the Add/Edit form on Save.
  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 800;
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL("image/jpeg", 0.75);
        setForm((p) => ({ ...p, photoData: compressed }));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  // Phase 43 — Create mode: purely local, no dieId to link against yet
  // (see DrawingLinkPicker.tsx header comment). Edit mode: immediate,
  // through the Drawing Repository's own store.
  const linkedDrawingIdsForEdit = editingDie
    ? (drawingLinks || [])
        .filter((l) => l.linkedType === "die" && l.linkedId === editingDie.id)
        .map((l) => l.drawingId)
    : [];

  function handleAddDrawingLink(drawingId: string) {
    if (editingDie) {
      addDrawingLink(drawingId, "die", editingDie.id);
    } else {
      setPendingDrawingIds((prev) =>
        prev.includes(drawingId) ? prev : [...prev, drawingId],
      );
    }
  }

  function handleRemoveDrawingLink(drawingId: string) {
    if (editingDie) {
      const link = (drawingLinks || []).find(
        (l) =>
          l.linkedType === "die" &&
          l.linkedId === editingDie.id &&
          l.drawingId === drawingId,
      );
      if (link) removeDrawingLink(link.id);
    } else {
      setPendingDrawingIds((prev) => prev.filter((id) => id !== drawingId));
    }
  }

  async function handleSave() {
    if (isSaving) return;
    if (!form.name?.trim()) {
      toast.error("Die name is required");
      return;
    }
    if (!form.status) {
      toast.error("Status is required");
      return;
    }
    // Phase 43 — mandatory Drawing Repository link, Create only (design
    // decision: never retroactively blocks Edit on a pre-existing die).
    if (!editingDie && pendingDrawingIds.length === 0) {
      toast.error("Link at least one drawing before saving.");
      return;
    }
    setIsSaving(true);
    try {
      if (editingDie) {
        const result = await updateDieRemote({
          ...editingDie,
          ...form,
          updatedAt: Date.now(),
        } as Die);
        if (result.status === "unauthenticated") {
          toast.error("Not signed in to Supabase - die was not saved.");
          return;
        }
        if (
          result.status === "error" ||
          result.status === "denied" ||
          !result.data
        ) {
          toast.error(`Could not save die: ${result.error ?? "unknown error"}`);
          return;
        }
        updateDie(result.data);
        toast.success("Die updated");
      } else {
        const result = await createDieRemote({
          dieCode: generateDieCode(),
          name: form.name!,
          type: form.type,
          purpose: form.purpose,
          compatibleMachineId: form.compatibleMachineId,
          originalProjectId: form.originalProjectId,
          location: form.location,
          status: form.status || "Available",
          dateCreated: form.dateCreated,
          condition: form.condition,
          notes: form.notes,
          photoData: form.photoData,
          purchaseDate: form.purchaseDate,
          purchaseCost: form.purchaseCost
            ? Number(form.purchaseCost)
            : undefined,
          purchaseVendorId: form.purchaseVendorId,
          purchaseVendorName: form.purchaseVendorName,
          sourceCompanyPoItemId: undefined,
          isActive: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        if (result.status === "unauthenticated") {
          toast.error("Not signed in to Supabase - die was not saved.");
          return;
        }
        if (result.status === "error" || !result.data) {
          toast.error(`Could not save die: ${result.error ?? "unknown error"}`);
          return;
        }
        addDie(result.data);
        // Now that the die has an id, flush every pending drawing link.
        for (const drawingId of pendingDrawingIds) {
          await addDrawingLink(drawingId, "die", result.data.id);
        }
        setPendingDrawingIds([]);
        toast.success(`Die ${result.data.dieCode} added`);
      }
      setShowForm(false);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    const d = deleteTarget;
    const result = await deleteDieRemote(d.id);
    if (result.status === "unauthenticated") {
      toast.error("Not signed in to Supabase - die was not deleted.");
      setDeleteTarget(null);
      return;
    }
    if (result.status === "error" || result.status === "denied") {
      toast.error(`Could not delete die: ${result.error ?? "unknown error"}`);
      setDeleteTarget(null);
      return;
    }
    deleteDie(d.id);
    toast.success("Die removed");
    setDeleteTarget(null);
  }

  if (!canView(currentUser, "tooling_dies")) {
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
    <div className="p-6 space-y-6" data-ocid="dies.panel">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Cog className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Tooling / Dies Register
            </h1>
            <p className="text-xs text-muted-foreground">
              Reusable dies and tooling — not tied to any single project
            </p>
          </div>
        </div>
        {pCreate && (
          <Button size="sm" onClick={openNew} data-ocid="dies.add_button">
            <Plus className="w-4 h-4 mr-1.5" /> Add Die
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground uppercase font-semibold">
            Total Dies
          </div>
          <div className="text-2xl font-bold mt-1">{kpis.total}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground uppercase font-semibold">
            Available
          </div>
          <div className="text-2xl font-bold mt-1 text-success">
            {kpis.available}
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground uppercase font-semibold">
            In Use
          </div>
          <div className="text-2xl font-bold mt-1 text-info">{kpis.inUse}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground uppercase font-semibold">
            Under Maintenance
          </div>
          <div className="text-2xl font-bold mt-1 text-warning">
            {kpis.underMaintenance}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search dies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
          data-ocid="dies.search.input"
        />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44" data-ocid="dies.status_filter.select">
            <Filter className="w-3.5 h-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {DIE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border p-10 text-center">
          <Cog className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm mb-3">
            No dies added yet.
          </p>
          {pCreate && (
            <Button size="sm" onClick={openNew}>
              <Plus className="w-4 h-4 mr-1.5" /> Add First Die
            </Button>
          )}
        </div>
      ) : (
        <div className="table-wrapper">
          <div className="rounded-md border" data-ocid="dies.table">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left p-2 text-xs font-semibold">Die</th>
                  <th className="text-left p-2 text-xs font-semibold">Type</th>
                  <th className="text-left p-2 text-xs font-semibold">
                    Compatible Machine
                  </th>
                  <th className="text-left p-2 text-xs font-semibold">
                    Original Project
                  </th>
                  <th className="text-left p-2 text-xs font-semibold">
                    Location
                  </th>
                  <th className="text-left p-2 text-xs font-semibold">
                    Status
                  </th>
                  <th className="text-left p-2 text-xs font-semibold w-24">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d, i) => (
                  <tr
                    key={d.id}
                    className="border-t hover:bg-muted/30"
                    data-ocid={`dies.item.${i + 1}`}
                  >
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        {d.photoData ? (
                          <img
                            src={d.photoData}
                            alt={d.name}
                            className="w-8 h-8 rounded object-cover border shrink-0"
                            data-ocid={`dies.item.${i + 1}.photo`}
                          />
                        ) : (
                          <div className="w-8 h-8 rounded border bg-muted flex items-center justify-center shrink-0">
                            <Cog className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium">{d.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {d.dieCode}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {d.type || "—"}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {machineName(d.compatibleMachineId) || "—"}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {projectName(d.originalProjectId) || "—"}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {d.location || "—"}
                    </td>
                    <td className="p-2">
                      <Badge
                        variant="outline"
                        className={`text-xs ${STATUS_COLOR[d.status]}`}
                      >
                        {d.status}
                      </Badge>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        {pEdit && (
                          <button
                            type="button"
                            className="p-1 rounded hover:bg-muted transition-colors"
                            onClick={() => openEdit(d)}
                            title="Edit die"
                            data-ocid={`dies.edit_button.${i + 1}`}
                          >
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                          </button>
                        )}
                        {pDelete && (
                          <button
                            type="button"
                            className="p-1 rounded hover:bg-muted transition-colors"
                            onClick={() => setDeleteTarget(d)}
                            title="Delete die"
                            data-ocid={`dies.delete_button.${i + 1}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Die Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingDie ? "Edit Die" : "Add Die"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2 flex items-start gap-3">
                <div className="shrink-0">
                  <Label className="text-xs">Photo</Label>
                  <label
                    className="mt-1.5 flex items-center justify-center w-16 h-16 rounded-md border border-dashed cursor-pointer hover:bg-muted/40 transition-colors overflow-hidden"
                    data-ocid="dies.form.photo.upload_label"
                  >
                    {form.photoData ? (
                      <img
                        src={form.photoData}
                        alt="Die"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImagePlus className="w-5 h-5 text-muted-foreground" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoSelect}
                      data-ocid="dies.form.photo.input"
                    />
                  </label>
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs">Die Name *</Label>
                  <Input
                    value={form.name || ""}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder="e.g. Bracket Bending Die"
                    data-ocid="dies.form.name.input"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <Input
                  value={form.type || ""}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, type: e.target.value }))
                  }
                  placeholder="e.g. Press Brake Die"
                  data-ocid="dies.form.type.input"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Purpose</Label>
                <Input
                  value={form.purpose || ""}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, purpose: e.target.value }))
                  }
                  placeholder="e.g. 90-degree bends"
                  data-ocid="dies.form.purpose.input"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status *</Label>
                <Select
                  value={form.status || "Available"}
                  onValueChange={(v) =>
                    setForm((p) => ({ ...p, status: v as DieStatus }))
                  }
                >
                  <SelectTrigger data-ocid="dies.form.status.select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Condition</Label>
                <Select
                  value={form.condition || ""}
                  onValueChange={(v) =>
                    setForm((p) => ({
                      ...p,
                      condition: v as MachineCondition,
                    }))
                  }
                >
                  <SelectTrigger data-ocid="dies.form.condition.select">
                    <SelectValue placeholder="Select condition" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Compatible Machine</Label>
                <SearchableSelect
                  value={form.compatibleMachineId || "none"}
                  onChange={(v) =>
                    setForm((p) => ({
                      ...p,
                      compatibleMachineId: v === "none" ? undefined : v,
                    }))
                  }
                  options={[
                    { value: "none", label: "None" },
                    ...(machines || []).map((m) => ({
                      value: m.id,
                      label: m.name,
                      searchText: `${m.machineCode ?? ""} ${m.type ?? ""}`,
                    })),
                  ]}
                  placeholder="None"
                  searchPlaceholder="Search by name, code, or type…"
                  emptyText="No machines found."
                  className="w-full"
                  data-ocid="dies.form.compatible_machine.select"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Original Project{" "}
                  <span className="text-muted-foreground font-normal">
                    (history only)
                  </span>
                </Label>
                <SearchableSelect
                  value={form.originalProjectId || "none"}
                  onChange={(v) =>
                    setForm((p) => ({
                      ...p,
                      originalProjectId: v === "none" ? undefined : v,
                    }))
                  }
                  options={[
                    { value: "none", label: "None" },
                    ...(projects || []).map((p) => ({
                      value: p.id,
                      label: p.projectName,
                    })),
                  ]}
                  placeholder="None"
                  searchPlaceholder="Search projects…"
                  emptyText="No projects found."
                  className="w-full"
                  data-ocid="dies.form.original_project.select"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Location</Label>
                <Input
                  value={form.location || ""}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, location: e.target.value }))
                  }
                  placeholder="e.g. Die Rack B"
                  data-ocid="dies.form.location.input"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Date Created</Label>
                <Input
                  type="date"
                  value={form.dateCreated || ""}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, dateCreated: e.target.value }))
                  }
                  data-ocid="dies.form.date_created.input"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Purchase Date</Label>
                <Input
                  type="date"
                  value={form.purchaseDate || ""}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, purchaseDate: e.target.value }))
                  }
                  data-ocid="dies.form.purchase_date.input"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Purchase Cost (₹)</Label>
                <Input
                  type="number"
                  value={form.purchaseCost ?? ""}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      purchaseCost: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    }))
                  }
                  data-ocid="dies.form.purchase_cost.input"
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">Purchase Vendor</Label>
                <VendorSelect
                  value={form.purchaseVendorId}
                  onChange={(vendorId, vendorName) =>
                    setForm((p) => ({
                      ...p,
                      purchaseVendorId: vendorId,
                      purchaseVendorName: vendorName,
                    }))
                  }
                  placeholder="Select vendor"
                  className="w-full"
                  data-ocid="dies.form.purchase_vendor.select"
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">
                  Linked Drawing{editingDie ? "" : " *"}
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    — Drawing Repository is the source of truth
                  </span>
                </Label>
                <DrawingLinkPicker
                  linkedDrawingIds={
                    editingDie ? linkedDrawingIdsForEdit : pendingDrawingIds
                  }
                  onAdd={handleAddDrawingLink}
                  onRemove={handleRemoveDrawingLink}
                  data-ocid="dies.form.drawing_link_picker"
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  value={form.notes || ""}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, notes: e.target.value }))
                  }
                  rows={2}
                  data-ocid="dies.form.notes.input"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowForm(false)}
              data-ocid="dies.form.cancel_button"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              data-ocid="dies.form.save_button"
            >
              {isSaving ? "Saving..." : editingDie ? "Save Changes" : "Add Die"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Die"
        description={
          deleteTarget
            ? `Delete "${deleteTarget.name}" (${deleteTarget.dieCode})?`
            : ""
        }
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
