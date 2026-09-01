import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
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
import { RowActions } from "@/components/ui/row-actions";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Filter,
  History,
  ImagePlus,
  Pencil,
  Plus,
  ShieldOff,
  Trash2,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import {
  createToolRemote,
  deleteToolRemote,
  issueToolRemote,
  returnToolRemote,
  updateToolRemote,
} from "../lib/toolsApi";
import {
  canCreate,
  canDelete,
  canEdit,
  canView,
  hasPermission,
} from "../permissions";
import { useStore } from "../store";
import type { MachineCondition, Tool, ToolStatus } from "../types";

const TOOL_STATUSES: ToolStatus[] = [
  "Available",
  "In Use",
  "Under Repair",
  "Lost",
  "Retired",
];
const CONDITIONS: MachineCondition[] = [
  "Excellent",
  "Good",
  "Fair",
  "Poor",
  "Critical",
];

const STATUS_COLOR: Record<ToolStatus, string> = {
  Available: "bg-success/10 text-success border-success/30",
  "In Use": "bg-info/10 text-info border-info/30",
  "Under Repair": "bg-warning/15 text-warning border-warning/30",
  Lost: "bg-destructive/10 text-destructive border-destructive/30",
  Retired: "bg-muted text-muted-foreground border-border",
};

export function Tools() {
  const { currentUser } = useAuth();
  const pCreate = canCreate(currentUser, "tools");
  const pEdit = canEdit(currentUser, "tools");
  const pDelete = canDelete(currentUser, "tools");

  const {
    tools,
    employees,
    addTool,
    updateTool,
    deleteTool,
    generateToolCode,
    toolAssignmentHistory,
    addToolAssignmentHistoryLocal,
  } = useStore();
  const pAssign = hasPermission(currentUser, "tools.assign");

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [editingTool, setEditingTool] = useState<Tool | null>(null);
  const [form, setForm] = useState<Partial<Tool>>({});
  const [deleteTarget, setDeleteTarget] = useState<Tool | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<Tool | null>(null);
  const [issueEmployeeId, setIssueEmployeeId] = useState<string>("");
  const [isIssuing, setIsIssuing] = useState(false);

  const activeTools = useMemo(
    () => (tools || []).filter((t) => t.isActive !== false),
    [tools],
  );

  const filtered = useMemo(() => {
    return activeTools.filter((t) => {
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (
        search &&
        !t.name.toLowerCase().includes(search.toLowerCase()) &&
        !t.toolCode.toLowerCase().includes(search.toLowerCase())
      )
        return false;
      return true;
    });
  }, [activeTools, filterStatus, search]);

  const kpis = useMemo(
    () => ({
      total: activeTools.length,
      available: activeTools.filter((t) => t.status === "Available").length,
      inUse: activeTools.filter((t) => t.status === "In Use").length,
      underRepair: activeTools.filter((t) => t.status === "Under Repair")
        .length,
    }),
    [activeTools],
  );

  function openNew() {
    setForm({ status: "Available", quantity: 1 });
    setEditingTool(null);
    setShowForm(true);
  }

  function openEdit(t: Tool) {
    setForm({ ...t });
    setEditingTool(t);
    setShowForm(true);
  }

  const employeeName = (id?: string) =>
    id ? (employees || []).find((e) => e.id === id)?.name : undefined;

  // Phase 43 — same compress-to-JPEG-dataURL flow as MachineDetail.tsx's
  // handlePhotoUpload (canvas-resize-to-800px, quality 0.75). Stored into
  // form state here rather than saved immediately, since Tools has no
  // dedicated detail page - the photo is submitted with the rest of the
  // Add/Edit form on Save, exactly like every other field in this dialog.
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

  function openHistory(t: Tool) {
    setHistoryTarget(t);
    setIssueEmployeeId("");
  }

  const historyForTool = (toolId: string) =>
    (toolAssignmentHistory || [])
      .filter((h) => h.toolId === toolId)
      .sort((a, b) => b.recordedAt - a.recordedAt);

  async function handleIssue() {
    if (!historyTarget || !issueEmployeeId || isIssuing) return;
    setIsIssuing(true);
    try {
      const result = await issueToolRemote(historyTarget.id, issueEmployeeId);
      if (result.status === "unauthenticated") {
        toast.error("Not signed in to Supabase - tool was not issued.");
        return;
      }
      if (
        result.status === "error" ||
        result.status === "denied" ||
        !result.data
      ) {
        toast.error(`Could not issue tool: ${result.error ?? "unknown error"}`);
        return;
      }
      updateTool(result.data.tool);
      addToolAssignmentHistoryLocal(result.data.history);
      setHistoryTarget(result.data.tool);
      setIssueEmployeeId("");
      toast.success(`Issued to ${employeeName(issueEmployeeId) ?? "employee"}`);
    } finally {
      setIsIssuing(false);
    }
  }

  async function handleReturn() {
    if (!historyTarget || isIssuing) return;
    setIsIssuing(true);
    try {
      const result = await returnToolRemote(historyTarget.id);
      if (result.status === "unauthenticated") {
        toast.error("Not signed in to Supabase - tool was not returned.");
        return;
      }
      if (
        result.status === "error" ||
        result.status === "denied" ||
        !result.data
      ) {
        toast.error(
          `Could not return tool: ${result.error ?? "unknown error"}`,
        );
        return;
      }
      updateTool(result.data.tool);
      addToolAssignmentHistoryLocal(result.data.history);
      setHistoryTarget(result.data.tool);
      toast.success("Tool returned");
    } finally {
      setIsIssuing(false);
    }
  }

  async function handleSave() {
    if (isSaving) return;
    if (!form.name?.trim()) {
      toast.error("Tool name is required");
      return;
    }
    if (!form.status) {
      toast.error("Status is required");
      return;
    }
    setIsSaving(true);
    try {
      if (editingTool) {
        const result = await updateToolRemote({
          ...editingTool,
          ...form,
          updatedAt: Date.now(),
        } as Tool);
        if (result.status === "unauthenticated") {
          toast.error("Not signed in to Supabase - tool was not saved.");
          return;
        }
        if (
          result.status === "error" ||
          result.status === "denied" ||
          !result.data
        ) {
          toast.error(
            `Could not save tool: ${result.error ?? "unknown error"}`,
          );
          return;
        }
        updateTool(result.data);
        toast.success("Tool updated");
      } else {
        const result = await createToolRemote({
          toolCode: generateToolCode(),
          name: form.name!,
          category: form.category,
          quantity: form.quantity ? Number(form.quantity) : 1,
          location: form.location,
          assignedEmployeeId: form.assignedEmployeeId,
          condition: form.condition,
          status: form.status || "Available",
          purchaseDate: form.purchaseDate,
          replacementValue: form.replacementValue
            ? Number(form.replacementValue)
            : undefined,
          notes: form.notes,
          photoData: form.photoData,
          purchaseVendorId: form.purchaseVendorId,
          purchaseVendorName: form.purchaseVendorName,
          sourceCompanyPoItemId: undefined,
          isActive: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        if (result.status === "unauthenticated") {
          toast.error("Not signed in to Supabase - tool was not saved.");
          return;
        }
        if (result.status === "error" || !result.data) {
          toast.error(
            `Could not save tool: ${result.error ?? "unknown error"}`,
          );
          return;
        }
        addTool(result.data);
        toast.success(`Tool ${result.data.toolCode} added`);
      }
      setShowForm(false);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    const t = deleteTarget;
    const result = await deleteToolRemote(t.id);
    if (result.status === "unauthenticated") {
      toast.error("Not signed in to Supabase - tool was not deleted.");
      setDeleteTarget(null);
      return;
    }
    if (result.status === "error" || result.status === "denied") {
      toast.error(`Could not delete tool: ${result.error ?? "unknown error"}`);
      setDeleteTarget(null);
      return;
    }
    deleteTool(t.id);
    toast.success("Tool removed");
    setDeleteTarget(null);
  }

  if (!canView(currentUser, "tools")) {
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

  const ToolRowActions = ({ t, i }: { t: Tool; i: number }) => (
    <RowActions
      primary={[
        {
          label: "History",
          icon: History,
          onClick: () => openHistory(t),
          "data-ocid": `tools.history_button.${i + 1}`,
        },
        ...(pEdit
          ? [
              {
                label: "Edit",
                icon: Pencil,
                onClick: () => openEdit(t),
                "data-ocid": `tools.edit_button.${i + 1}`,
              },
            ]
          : []),
      ]}
      overflow={[
        ...(pDelete
          ? [
              {
                label: "Delete",
                icon: Trash2,
                destructive: true,
                onClick: () => setDeleteTarget(t),
                "data-ocid": `tools.delete_button.${i + 1}`,
              },
            ]
          : []),
      ]}
    />
  );

  return (
    <div className="p-6 space-y-6" data-ocid="tools.panel">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Wrench className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Tool Register
            </h1>
            <p className="text-xs text-muted-foreground">
              Track hand tools, measuring instruments, and shop assets
            </p>
          </div>
        </div>
        {pCreate && (
          <Button size="sm" onClick={openNew} data-ocid="tools.add_button">
            <Plus className="w-4 h-4 mr-1.5" /> Add Tool
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground uppercase font-semibold">
            Total Tools
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
            Under Repair
          </div>
          <div className="text-2xl font-bold mt-1 text-warning">
            {kpis.underRepair}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search tools..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
          data-ocid="tools.search.input"
        />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger
            className="w-44"
            data-ocid="tools.status_filter.select"
          >
            <Filter className="w-3.5 h-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {TOOL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border p-10 text-center">
          <Wrench className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm mb-3">
            No tools added yet.
          </p>
          {pCreate && (
            <Button size="sm" onClick={openNew}>
              <Plus className="w-4 h-4 mr-1.5" /> Add First Tool
            </Button>
          )}
        </div>
      ) : (
        <div className="table-wrapper">
          <div className="rounded-md border" data-ocid="tools.table">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left p-2 text-xs font-semibold">Tool</th>
                  <th className="text-left p-2 text-xs font-semibold">
                    Category
                  </th>
                  <th className="text-left p-2 text-xs font-semibold">Qty</th>
                  <th className="text-left p-2 text-xs font-semibold">
                    Location
                  </th>
                  <th className="text-left p-2 text-xs font-semibold">
                    Assigned To
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
                {filtered.map((t, i) => (
                  <tr
                    key={t.id}
                    className="border-t hover:bg-muted/30"
                    data-ocid={`tools.item.${i + 1}`}
                  >
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        {t.photoData ? (
                          <img
                            src={t.photoData}
                            alt={t.name}
                            className="w-8 h-8 rounded object-cover border shrink-0"
                            data-ocid={`tools.item.${i + 1}.photo`}
                          />
                        ) : (
                          <div className="w-8 h-8 rounded border bg-muted flex items-center justify-center shrink-0">
                            <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium">{t.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {t.toolCode}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {t.category || "—"}
                    </td>
                    <td className="p-2 font-mono text-xs">{t.quantity}</td>
                    <td className="p-2 text-muted-foreground">
                      {t.location || "—"}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {employeeName(t.assignedEmployeeId) || "—"}
                    </td>
                    <td className="p-2">
                      <Badge
                        variant="outline"
                        className={`text-xs ${STATUS_COLOR[t.status]}`}
                      >
                        {t.status}
                      </Badge>
                    </td>
                    <td className="p-2">
                      <ToolRowActions t={t} i={i} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Tool Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTool ? "Edit Tool" : "Add Tool"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2 flex items-start gap-3">
                <div className="shrink-0">
                  <Label className="text-xs">Photo</Label>
                  <label
                    className="mt-1.5 flex items-center justify-center w-16 h-16 rounded-md border border-dashed cursor-pointer hover:bg-muted/40 transition-colors overflow-hidden"
                    data-ocid="tools.form.photo.upload_label"
                  >
                    {form.photoData ? (
                      <img
                        src={form.photoData}
                        alt="Tool"
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
                      data-ocid="tools.form.photo.input"
                    />
                  </label>
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs">Tool Name *</Label>
                  <Input
                    value={form.name || ""}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder="e.g. Digital Vernier Caliper"
                    data-ocid="tools.form.name.input"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Category</Label>
                <Input
                  value={form.category || ""}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, category: e.target.value }))
                  }
                  placeholder="e.g. Measuring"
                  data-ocid="tools.form.category.input"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Quantity</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.quantity ?? 1}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      quantity: Number(e.target.value),
                    }))
                  }
                  data-ocid="tools.form.quantity.input"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status *</Label>
                <Select
                  value={form.status || "Available"}
                  onValueChange={(v) =>
                    setForm((p) => ({ ...p, status: v as ToolStatus }))
                  }
                >
                  <SelectTrigger data-ocid="tools.form.status.select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TOOL_STATUSES.map((s) => (
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
                  <SelectTrigger data-ocid="tools.form.condition.select">
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
                <Label className="text-xs">Location</Label>
                <Input
                  value={form.location || ""}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, location: e.target.value }))
                  }
                  placeholder="e.g. Tool Crib A"
                  data-ocid="tools.form.location.input"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Assigned To</Label>
                <SearchableSelect
                  value={form.assignedEmployeeId || "none"}
                  onChange={(v) =>
                    setForm((p) => ({
                      ...p,
                      assignedEmployeeId: v === "none" ? undefined : v,
                    }))
                  }
                  options={[
                    { value: "none", label: "Unassigned" },
                    ...(employees || []).map((e) => ({
                      value: e.id,
                      label: e.name,
                      searchText: `${e.designation ?? ""} ${e.phone ?? ""}`,
                    })),
                  ]}
                  placeholder="Unassigned"
                  searchPlaceholder="Search employees…"
                  emptyText="No employees found."
                  className="w-full"
                  data-ocid="tools.form.assigned.select"
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
                  data-ocid="tools.form.purchase_date.input"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Replacement Value (₹)</Label>
                <Input
                  type="number"
                  value={form.replacementValue ?? ""}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      replacementValue: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    }))
                  }
                  data-ocid="tools.form.replacement_value.input"
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
                  data-ocid="tools.form.purchase_vendor.select"
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
                  data-ocid="tools.form.notes.input"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowForm(false)}
              data-ocid="tools.form.cancel_button"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              data-ocid="tools.form.save_button"
            >
              {isSaving
                ? "Saving..."
                : editingTool
                  ? "Save Changes"
                  : "Add Tool"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Tool"
        description={
          deleteTarget
            ? `Delete "${deleteTarget.name}" (${deleteTarget.toolCode})?`
            : ""
        }
        onConfirm={handleConfirmDelete}
      />

      {/* Tool History dialog (Phase 43) — current holder, purchase recap,
          issue/return controls, and the full insert-only assignment log. */}
      <Dialog
        open={!!historyTarget}
        onOpenChange={(open) => !open && setHistoryTarget(null)}
      >
        <DialogContent
          className="max-w-lg max-h-[90vh] overflow-y-auto"
          data-ocid="tools.history_dialog"
        >
          <DialogHeader>
            <DialogTitle>
              {historyTarget ? `${historyTarget.name} — History` : "History"}
            </DialogTitle>
          </DialogHeader>
          {historyTarget && (
            <div className="space-y-4 py-2">
              <div className="rounded-md border p-3 space-y-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Current Holder</span>
                  <span
                    className="font-medium"
                    data-ocid="tools.history_dialog.current_holder"
                  >
                    {employeeName(historyTarget.assignedEmployeeId) ||
                      "Unassigned"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Purchase Vendor</span>
                  <span>{historyTarget.purchaseVendorName || "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Purchase Date</span>
                  <span>{historyTarget.purchaseDate || "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Replacement Value
                  </span>
                  <span>
                    {historyTarget.replacementValue
                      ? `₹${historyTarget.replacementValue}`
                      : "—"}
                  </span>
                </div>
              </div>

              {pAssign && (
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    {historyTarget.assignedEmployeeId
                      ? "Change Holder / Reassign"
                      : "Issue To"}
                  </Label>
                  <div className="flex items-center gap-2">
                    <SearchableSelect
                      value={issueEmployeeId || "none"}
                      onChange={(v) =>
                        setIssueEmployeeId(v === "none" ? "" : v)
                      }
                      options={[
                        { value: "none", label: "Select employee…" },
                        ...(employees || []).map((e) => ({
                          value: e.id,
                          label: e.name,
                          searchText: `${e.designation ?? ""} ${e.phone ?? ""}`,
                        })),
                      ]}
                      placeholder="Select employee…"
                      searchPlaceholder="Search employees…"
                      emptyText="No employees found."
                      className="flex-1"
                      data-ocid="tools.history_dialog.issue_to.select"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={!issueEmployeeId || isIssuing}
                      onClick={handleIssue}
                      data-ocid="tools.history_dialog.issue_button"
                    >
                      {historyTarget.assignedEmployeeId ? "Reassign" : "Issue"}
                    </Button>
                  </div>
                  {historyTarget.assignedEmployeeId && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isIssuing}
                      onClick={handleReturn}
                      data-ocid="tools.history_dialog.return_button"
                    >
                      Return
                    </Button>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">Assignment Log</Label>
                <div
                  className="rounded-md border max-h-56 overflow-y-auto"
                  data-ocid="tools.history_dialog.log"
                >
                  {historyForTool(historyTarget.id).length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground text-center">
                      No assignment history yet.
                    </div>
                  ) : (
                    <table className="w-full text-xs">
                      <tbody>
                        {historyForTool(historyTarget.id).map((h) => (
                          <tr key={h.id} className="border-t first:border-t-0">
                            <td className="p-2 whitespace-nowrap text-muted-foreground">
                              {new Date(h.recordedAt).toLocaleDateString(
                                "en-GB",
                                {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                },
                              )}
                            </td>
                            <td className="p-2">
                              <Badge
                                variant="outline"
                                className={
                                  h.action === "issued"
                                    ? "bg-info/10 text-info border-info/30"
                                    : "bg-muted text-muted-foreground border-border"
                                }
                              >
                                {h.action === "issued" ? "Issued" : "Returned"}
                              </Badge>
                            </td>
                            <td className="p-2">
                              {h.action === "issued"
                                ? employeeName(h.employeeId) || "—"
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setHistoryTarget(null)}
              data-ocid="tools.history_dialog.close_button"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
