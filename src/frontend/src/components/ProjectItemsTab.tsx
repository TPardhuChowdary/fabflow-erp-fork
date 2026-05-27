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
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { ProjectItem, ProjectItemStatus } from "../types";

interface Props {
  projectId: string;
  projectItems: ProjectItem[];
  addProjectItem: (item: Omit<ProjectItem, "id" | "createdAt">) => void;
  updateProjectItem: (id: string, updates: Partial<ProjectItem>) => void;
  deleteProjectItem: (id: string) => void;
  canAdd?: boolean;
  canEditItem?: boolean;
  canDelete?: boolean;
}

const STATUS_COLORS: Record<ProjectItemStatus, string> = {
  Accepted: "bg-green-100 text-green-700 border-green-300",
  Pending: "bg-amber-100 text-amber-700 border-amber-300",
  Rejected: "bg-red-100 text-red-700 border-red-300",
};

const emptyForm = () => ({
  name: "",
  description: "",
  unit: "",
  unitPrice: "",
  status: "Pending" as ProjectItemStatus,
});

export function ProjectItemsTab({
  projectId,
  projectItems,
  addProjectItem,
  updateProjectItem,
  deleteProjectItem,
  canAdd = true,
  canEditItem = true,
  canDelete = true,
}: Props) {
  const items = (projectItems || []).filter((pi) => pi.projectId === projectId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (item: ProjectItem) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      description: item.description || "",
      unit: item.unit || "",
      unitPrice: item.unitPrice != null ? String(item.unitPrice) : "",
      status: item.status,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Item name is required");
      return;
    }
    const payload = {
      projectId,
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      unit: form.unit.trim() || undefined,
      unitPrice: form.unitPrice !== "" ? Number(form.unitPrice) : undefined,
      status: form.status,
    };
    if (editingId) {
      updateProjectItem(editingId, payload);
      toast.success("Item updated");
    } else {
      addProjectItem(payload);
      toast.success("Item added");
    }
    setDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    if (!canDelete) {
      alert("Access restricted");
      return;
    }
    deleteProjectItem(id);
    setDeleteConfirm(null);
    toast.success("Item removed");
  };

  return (
    <div className="space-y-3" data-ocid="project-detail.items.section">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Project Items</h3>
          <p className="text-xs text-muted-foreground">
            Items available for selection in quotations and invoices. Only
            Accepted and Pending items appear in dropdowns; Rejected items are
            excluded.
          </p>
        </div>
        {canAdd && (
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={openAdd}
            data-ocid="project-detail.items.primary_button"
          >
            <Plus className="w-3 h-3 mr-1" /> Add Item
          </Button>
        )}
      </div>

      <div className="rounded-md border" data-ocid="project-detail.items.table">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="text-xs font-semibold">Name</TableHead>
              <TableHead className="text-xs font-semibold">
                Description
              </TableHead>
              <TableHead className="text-xs font-semibold">Unit</TableHead>
              <TableHead className="text-xs font-semibold">
                Unit Price
              </TableHead>
              <TableHead className="text-xs font-semibold">Status</TableHead>
              <TableHead className="text-xs font-semibold w-20">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, i) => (
              <TableRow
                key={item.id}
                data-ocid={`project-detail.items.row.${i + 1}`}
              >
                <TableCell className="text-sm font-medium">
                  {item.name}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {item.description || "\u2014"}
                </TableCell>
                <TableCell className="text-xs">
                  {item.unit || "\u2014"}
                </TableCell>
                <TableCell className="text-xs">
                  {item.unitPrice != null
                    ? `\u20b9${item.unitPrice.toLocaleString("en-IN")}`
                    : "\u2014"}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[item.status]}`}
                  >
                    {item.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {canEditItem && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => openEdit(item)}
                        data-ocid={`project-detail.items.edit_button.${i + 1}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        onClick={() => setDeleteConfirm(item.id)}
                        data-ocid={`project-detail.items.delete_button.${i + 1}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center py-8 text-xs text-muted-foreground"
                  data-ocid="project-detail.items.empty_state"
                >
                  No items added yet. Click &ldquo;Add Item&rdquo; to get
                  started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-ocid="project-detail.items.dialog">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Item" : "Add Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label className="text-xs">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                data-ocid="project-detail.items.name.input"
                className="mt-1 h-8 text-sm"
                placeholder="e.g. MS Sheet Enclosure 2mm"
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, name: e.target.value }))
                }
              />
            </div>
            <div>
              <Label className="text-xs">Description (optional)</Label>
              <Input
                data-ocid="project-detail.items.description.input"
                className="mt-1 h-8 text-sm"
                placeholder="Short description"
                value={form.description}
                onChange={(e) =>
                  setForm((p) => ({ ...p, description: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Unit (optional)</Label>
                <Input
                  data-ocid="project-detail.items.unit.input"
                  className="mt-1 h-8 text-sm"
                  placeholder="e.g. pcs, kg, m"
                  value={form.unit}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, unit: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Unit Price (optional)</Label>
                <Input
                  data-ocid="project-detail.items.unitPrice.input"
                  type="number"
                  className="mt-1 h-8 text-sm"
                  placeholder="0"
                  value={form.unitPrice}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, unitPrice: e.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  setForm((p) => ({ ...p, status: v as ProjectItemStatus }))
                }
              >
                <SelectTrigger
                  data-ocid="project-detail.items.status.select"
                  className="mt-1 h-8 text-sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Accepted" className="text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      Accepted
                    </span>
                  </SelectItem>
                  <SelectItem value="Pending" className="text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      Pending
                    </span>
                  </SelectItem>
                  <SelectItem value="Rejected" className="text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      Rejected
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogOpen(false)}
              data-ocid="project-detail.items.cancel_button"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              data-ocid="project-detail.items.save_button"
            >
              {editingId ? "Save Changes" : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog
        open={!!deleteConfirm}
        onOpenChange={() => setDeleteConfirm(null)}
      >
        <DialogContent data-ocid="project-detail.items.delete.dialog">
          <DialogHeader>
            <DialogTitle>Remove Item?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This item will be removed from the project. Existing quotations and
            invoices using this item will not be affected.
          </p>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteConfirm(null)}
              data-ocid="project-detail.items.delete.cancel_button"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              data-ocid="project-detail.items.delete.confirm_button"
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
