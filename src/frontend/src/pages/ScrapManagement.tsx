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
import { Package, Plus, ShieldOff, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { ConfirmDeleteDialog } from "../components/ConfirmDeleteDialog";
import { ProjectSelect } from "../components/ProjectSelect";
import {
  createScrapRecordRemote,
  deleteScrapRecordRemote,
  updateScrapRecordRemote,
} from "../lib/scrapApi";
import { canCreate, canDelete, canEdit, canView } from "../permissions";
import { useStore } from "../store";
import type { ScrapRecord, ScrapStatus } from "../types";

const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function ScrapManagement() {
  const { currentUser } = useAuth();
  const pView = canView(currentUser, "inventory");
  const pCreate = canCreate(currentUser, "inventory");
  const pEdit = canEdit(currentUser, "inventory");
  const pDelete = canDelete(currentUser, "inventory");

  const {
    scrapRecords,
    addScrapRecord,
    updateScrapRecord,
    deleteScrapRecord,
    projects,
  } = useStore();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ScrapRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ScrapRecord | null>(null);
  const [form, setForm] = useState<Partial<ScrapRecord>>({});

  function openNew() {
    setEditing(null);
    setForm({
      unit: "kg",
      generatedQty: 0,
      reusableQty: 0,
      soldQty: 0,
      disposedQty: 0,
      status: "In Stock",
    });
    setShowForm(true);
  }

  function openEdit(r: ScrapRecord) {
    setEditing(r);
    setForm({ ...r });
    setShowForm(true);
  }

  const [isSaving, setIsSaving] = useState(false);

  // Monster-1 — remote-first, same shape as every other <domain>Api.ts
  // caller in this codebase: the write goes to Supabase first, and only
  // the server-confirmed row is written into local state. id/createdAt
  // are now server-generated, never fabricated here.
  async function handleSave() {
    if (isSaving) return;
    if (!form.materialType?.trim()) {
      toast.error("Material type required");
      return;
    }
    setIsSaving(true);
    try {
      if (editing) {
        const result = await updateScrapRecordRemote({
          id: editing.id,
          materialType: form.materialType ?? "",
          unit: form.unit ?? "kg",
          generatedQty: form.generatedQty ?? 0,
          reusableQty: form.reusableQty ?? 0,
          soldQty: form.soldQty ?? 0,
          disposedQty: form.disposedQty ?? 0,
          scrapValue: form.scrapValue,
          status: form.status ?? "In Stock",
          projectId: form.projectId,
          stage: form.stage,
          notes: form.notes,
          recordedBy: editing.recordedBy,
        });
        if (result.status === "unauthenticated") {
          toast.error("Not signed in to the server - record was not saved");
          return;
        }
        if (result.status === "denied" || result.status === "error") {
          toast.error(result.error ?? "Could not update scrap record");
          return;
        }
        if (!result.data) {
          toast.error("Could not update scrap record");
          return;
        }
        updateScrapRecord({
          ...result.data,
          projectName: projects.find((p) => p.id === result.data?.projectId)
            ?.projectName,
        });
        toast.success("Scrap record updated");
      } else {
        const result = await createScrapRecordRemote({
          materialType: form.materialType ?? "",
          unit: form.unit ?? "kg",
          generatedQty: form.generatedQty ?? 0,
          reusableQty: form.reusableQty ?? 0,
          soldQty: form.soldQty ?? 0,
          disposedQty: form.disposedQty ?? 0,
          scrapValue: form.scrapValue,
          status: form.status ?? "In Stock",
          projectId: form.projectId,
          stage: form.stage,
          notes: form.notes,
          recordedBy: currentUser?.username ?? "unknown",
        });
        if (result.status === "unauthenticated") {
          toast.error("Not signed in to the server - record was not saved");
          return;
        }
        if (result.status === "denied" || result.status === "error") {
          toast.error(result.error ?? "Could not save scrap record");
          return;
        }
        if (!result.data) {
          toast.error("Could not save scrap record");
          return;
        }
        addScrapRecord({
          ...result.data,
          projectName: projects.find((p) => p.id === result.data?.projectId)
            ?.projectName,
        });
        toast.success("Scrap record added");
      }
      setShowForm(false);
    } finally {
      setIsSaving(false);
    }
  }

  // KPIs
  const totalScrap = scrapRecords.reduce((s, r) => s + r.generatedQty, 0);
  const totalReusable = scrapRecords.reduce((s, r) => s + r.reusableQty, 0);
  const totalSold = scrapRecords.reduce((s, r) => s + r.soldQty, 0);
  const totalValue = scrapRecords.reduce((s, r) => s + (r.scrapValue ?? 0), 0);

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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Scrap Management</h1>
            <p className="text-sm text-muted-foreground">
              {scrapRecords.length} records
            </p>
          </div>
        </div>
        {pCreate && (
          <Button size="sm" onClick={openNew} className="gap-2">
            <Plus className="w-4 h-4" /> Log Scrap
          </Button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Total Generated
          </p>
          <p className="text-2xl font-bold mt-1">{totalScrap} kg</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Reusable
          </p>
          <p className="text-2xl font-bold mt-1 text-success">
            {totalReusable} kg
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Sold
          </p>
          <p className="text-2xl font-bold mt-1 text-info">{totalSold} kg</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Scrap Value
          </p>
          <p className="text-2xl font-bold mt-1 text-warning">
            {fmt(totalValue)}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="text-xs font-semibold">Material</TableHead>
              <TableHead className="text-xs font-semibold">Project</TableHead>
              <TableHead className="text-xs font-semibold">Stage</TableHead>
              <TableHead className="text-xs font-semibold">Generated</TableHead>
              <TableHead className="text-xs font-semibold">Reusable</TableHead>
              <TableHead className="text-xs font-semibold">Sold</TableHead>
              <TableHead className="text-xs font-semibold">Value</TableHead>
              <TableHead className="text-xs font-semibold">Status</TableHead>
              <TableHead className="text-xs font-semibold w-20">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scrapRecords.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center text-muted-foreground py-10"
                >
                  No scrap records yet.
                </TableCell>
              </TableRow>
            ) : (
              scrapRecords.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => pEdit && openEdit(r)}
                >
                  <TableCell className="text-sm font-medium">
                    {r.materialType}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {/* Fallback resolves live in case hydration set this
                        before projects had hydrated too — see
                        setScrapRecordsFromServer in store.ts. */}
                    {r.projectName ||
                      projects.find((p) => p.id === r.projectId)?.projectName ||
                      "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.stage || "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.generatedQty} {r.unit}
                  </TableCell>
                  <TableCell className="text-sm text-success">
                    {r.reusableQty} {r.unit}
                  </TableCell>
                  <TableCell className="text-sm text-info">
                    {r.soldQty} {r.unit}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.scrapValue ? fmt(r.scrapValue) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs ${r.status === "In Stock" ? "bg-success/10 text-success border-success/30" : r.status === "Sold" ? "bg-info/10 text-info border-info/30" : "bg-muted text-muted-foreground border-border"}`}
                    >
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {pDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(r)}
                        title="Delete"
                        aria-label="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Scrap Record" : "Log Scrap"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Material Type *</Label>
                <Input
                  className="mt-1 h-8 text-sm"
                  placeholder="e.g. MS Sheet offcuts"
                  value={form.materialType ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, materialType: e.target.value })
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Unit</Label>
                <Select
                  value={form.unit ?? "kg"}
                  onValueChange={(v) => setForm({ ...form, unit: v })}
                >
                  <SelectTrigger className="mt-1 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["kg", "pcs", "sheets", "meters", "liters"].map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Project (optional)</Label>
                <ProjectSelect
                  value={form.projectId ?? ""}
                  onChange={(v) => setForm({ ...form, projectId: v })}
                  placeholder="Select project"
                  className="mt-1 w-full"
                />
              </div>
              <div>
                <Label className="text-xs">Stage (optional)</Label>
                <Input
                  className="mt-1 h-8 text-sm"
                  placeholder="e.g. Laser Cutting"
                  value={form.stage ?? ""}
                  onChange={(e) => setForm({ ...form, stage: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select
                  value={form.status ?? "In Stock"}
                  onValueChange={(v) =>
                    setForm({ ...form, status: v as ScrapStatus })
                  }
                >
                  <SelectTrigger className="mt-1 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["In Stock", "Sold", "Disposed"] as ScrapStatus[]).map(
                      (s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { field: "generatedQty", label: "Generated Qty" },
                { field: "reusableQty", label: "Reusable Qty" },
                { field: "soldQty", label: "Sold Qty" },
                { field: "disposedQty", label: "Disposed Qty" },
              ].map(({ field, label }) => (
                <div key={field}>
                  <Label className="text-xs">{label}</Label>
                  <Input
                    type="number"
                    min={0}
                    className="mt-1 h-8 text-sm"
                    value={(form as any)[field] ?? 0}
                    onChange={(e) =>
                      setForm({ ...form, [field]: Number(e.target.value) })
                    }
                  />
                </div>
              ))}
              <div>
                <Label className="text-xs">Scrap Value (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  className="mt-1 h-8 text-sm"
                  value={form.scrapValue ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      scrapValue: Number(e.target.value) || undefined,
                    })
                  }
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Input
                className="mt-1 h-8 text-sm"
                value={form.notes ?? ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete scrap record?"
        description="This scrap record will be permanently deleted."
        onConfirm={async () => {
          if (deleteTarget) {
            const result = await deleteScrapRecordRemote(deleteTarget.id);
            if (result.status === "unauthenticated") {
              toast.error(
                "Not signed in to the server - record was not deleted",
              );
            } else if (
              result.status === "denied" ||
              result.status === "error"
            ) {
              toast.error(result.error ?? "Could not delete scrap record");
            } else {
              deleteScrapRecord(deleteTarget.id);
              toast.success("Scrap record deleted");
            }
          }
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
