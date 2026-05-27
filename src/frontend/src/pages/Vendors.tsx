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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Building2, Edit2, Plus, Trash2, X } from "lucide-react";
import { ShieldOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { canCreate, canDelete, canEdit, canView } from "../permissions";
import { useStore } from "../store";
import type { Page, Vendor } from "../types";

const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

interface Props {
  onNavigate: (page: Page) => void;
}

function statusCls(status: string) {
  const map: Record<string, string> = {
    Paid: "bg-green-100 text-green-800 border-green-200",
    Partial: "bg-amber-100 text-amber-800 border-amber-200",
    Pending: "bg-blue-100 text-blue-800 border-blue-200",
    Overdue: "bg-red-100 text-red-800 border-red-200",
  };
  return map[status] ?? "bg-muted text-muted-foreground";
}

function getPayableStatus(
  totalAmount: number,
  paidAmount: number,
  dueDate: string,
): string {
  if (paidAmount >= totalAmount) return "Paid";
  if (dueDate && new Date(dueDate) < new Date() && paidAmount < totalAmount)
    return "Overdue";
  if (paidAmount > 0) return "Partial";
  return "Pending";
}

const emptyForm = { name: "", phone: "", address: "", gstNumber: "" };

export function Vendors({ onNavigate: _onNavigate }: Props) {
  const {
    vendors,
    addVendor,
    updateVendor,
    deleteVendor,
    payables,
    materialPurchases,
    inventoryPurchases,
    projects,
  } = useStore();
  const { currentUser } = useAuth();
  const pCreate = canCreate(currentUser, "vendors");
  const pEdit = canEdit(currentUser, "vendors");
  const pDelete = canDelete(currentUser, "vendors");

  const [addOpen, setAddOpen] = useState(false);
  const [editVendor, setEditVendor] = useState<Vendor | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [form, setForm] = useState(emptyForm);

  const openAdd = () => {
    setForm(emptyForm);
    setAddOpen(true);
  };

  const openEdit = (v: Vendor) => {
    setEditVendor(v);
    setForm({
      name: v.name,
      phone: v.phone,
      address: v.address,
      gstNumber: v.gstNumber ?? "",
    });
  };

  const handleSaveAdd = () => {
    console.log("FORM SUBMITTED");
    if (isSaving) return;
    setIsSaving(true);
    try {
      console.log("Saving vendor:", form);
      if (!form.name.trim()) {
        toast.error("Vendor name is required");
        return;
      }
      const dup = vendors.find(
        (v) => v.name.trim().toLowerCase() === form.name.trim().toLowerCase(),
      );
      if (dup) {
        toast.error("A vendor with this name already exists");
        return;
      }
      addVendor({
        id: crypto.randomUUID(),
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        gstNumber: form.gstNumber.trim() || undefined,
        createdAt: Date.now(),
      });
      toast.success("Vendor added");
      setAddOpen(false);
      console.log("SAVE COMPLETE");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEdit = () => {
    console.log("FORM SUBMITTED");
    if (isSaving) return;
    setIsSaving(true);
    try {
      console.log("Saving vendor:", form);
      if (!editVendor) return;
      if (!form.name.trim()) {
        toast.error("Vendor name is required");
        return;
      }
      updateVendor({
        ...editVendor,
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        gstNumber: form.gstNumber.trim() || undefined,
      });
      toast.success("Vendor updated");
      setEditVendor(null);
      console.log("SAVE COMPLETE");
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    deleteVendor(deleteId);
    toast.success("Vendor deleted");
    if (selectedVendor?.id === deleteId) setSelectedVendor(null);
    setDeleteId(null);
  };

  // Vendor detail calculations
  const getVendorDetails = (vendor: Vendor) => {
    const vPayables = payables.filter(
      (p) => p.vendorId === vendor.id || p.vendorName === vendor.name,
    );
    const vMatPurchases = materialPurchases.filter(
      (p) => p.vendorId === vendor.id || p.supplierName === vendor.name,
    );
    const vInvPurchases = inventoryPurchases.filter(
      (p) => p.vendorId === vendor.id || p.supplierName === vendor.name,
    );

    const totalPayablesAmt = vPayables.reduce((s, p) => s + p.totalAmount, 0);
    const pendingBalance = vPayables.reduce(
      (s, p) => s + (p.totalAmount - p.paidAmount),
      0,
    );
    const totalPurchaseCount = vMatPurchases.length + vInvPurchases.length;

    return {
      vPayables,
      vMatPurchases,
      vInvPurchases,
      totalPayablesAmt,
      pendingBalance,
      totalPurchaseCount,
    };
  };

  const vendorFormFields = (
    <div className="form-grid py-2">
      <div className="space-y-1">
        <Label className="text-xs">Vendor Name *</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Steel India Pvt Ltd"
          data-ocid="vendors.name.input"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Phone</Label>
        <Input
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          placeholder="9876543210"
          data-ocid="vendors.phone.input"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Address</Label>
        <Input
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          placeholder="City / Area"
          data-ocid="vendors.address.input"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">GST Number (optional)</Label>
        <Input
          value={form.gstNumber}
          onChange={(e) =>
            setForm((f) => ({ ...f, gstNumber: e.target.value }))
          }
          placeholder="27ABCDE1234F1Z5"
          data-ocid="vendors.gst.input"
        />
      </div>
    </div>
  );

  if (!canView(currentUser, "vendors")) {
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
    <div className="flex gap-4 h-full" data-ocid="vendors.page">
      {/* Main list */}
      <div className="flex-1 space-y-4 min-w-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Vendors</h1>
            <p className="text-sm text-muted-foreground">
              {vendors.length} vendor{vendors.length !== 1 ? "s" : ""}{" "}
              registered
            </p>
          </div>
          {pCreate && (
            <Button
              size="sm"
              onClick={openAdd}
              data-ocid="vendors.primary_button"
            >
              <Plus className="w-4 h-4 mr-1" /> Add Vendor
            </Button>
          )}
        </div>

        <div className="table-wrapper">
          <div className="rounded-md border" data-ocid="vendors.list.table">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs font-semibold">
                    Vendor Name
                  </TableHead>
                  <TableHead className="text-xs font-semibold">Phone</TableHead>
                  <TableHead className="text-xs font-semibold">
                    Address
                  </TableHead>
                  <TableHead className="text-xs font-semibold">
                    GST Number
                  </TableHead>
                  <TableHead className="text-xs font-semibold">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-10 text-sm text-muted-foreground"
                      data-ocid="vendors.list.empty_state"
                    >
                      No vendors yet. Click "Add Vendor" to create one.
                    </TableCell>
                  </TableRow>
                )}
                {vendors.map((v, i) => (
                  <TableRow
                    key={v.id}
                    data-ocid={`vendors.list.row.${i + 1}`}
                    className={`cursor-pointer transition-colors ${selectedVendor?.id === v.id ? "bg-muted/50" : "hover:bg-muted/30"}`}
                    onClick={() =>
                      setSelectedVendor(selectedVendor?.id === v.id ? null : v)
                    }
                  >
                    <TableCell className="font-medium text-sm">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        {v.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{v.phone || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {v.address || "—"}
                    </TableCell>
                    <TableCell>
                      {v.gstNumber ? (
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                          {v.gstNumber}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        {pEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                            onClick={() => openEdit(v)}
                            data-ocid={`vendors.list.edit_button.${i + 1}`}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {pDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600"
                            onClick={() => setDeleteId(v.id)}
                            data-ocid={`vendors.list.delete_button.${i + 1}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Detail slide-over panel */}
      {selectedVendor &&
        (() => {
          const {
            vPayables,
            vMatPurchases,
            vInvPurchases,
            totalPayablesAmt,
            pendingBalance,
            totalPurchaseCount,
          } = getVendorDetails(selectedVendor);
          return (
            <div
              className="w-96 shrink-0 border-l border-border bg-card flex flex-col overflow-hidden rounded-lg shadow-md"
              data-ocid="vendors.detail.panel"
            >
              <div className="flex items-start justify-between px-4 py-3 border-b border-border bg-muted/30">
                <div>
                  <div className="font-semibold text-sm">
                    {selectedVendor.name}
                  </div>
                  {selectedVendor.phone && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {selectedVendor.phone}
                    </div>
                  )}
                  {selectedVendor.address && (
                    <div className="text-xs text-muted-foreground">
                      {selectedVendor.address}
                    </div>
                  )}
                  {selectedVendor.gstNumber && (
                    <div className="text-xs font-mono text-muted-foreground mt-0.5">
                      GST: {selectedVendor.gstNumber}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setSelectedVendor(null)}
                  data-ocid="vendors.detail.close_button"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Summary cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  <div className="rounded-md border p-2 text-center">
                    <div className="text-lg font-bold">
                      {totalPurchaseCount}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      Purchases
                    </div>
                  </div>
                  <div className="rounded-md border p-2 text-center">
                    <div className="text-sm font-bold">
                      {fmt(totalPayablesAmt)}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      Payables
                    </div>
                  </div>
                  <div className="rounded-md border p-2 text-center bg-amber-50 border-amber-200">
                    <div className="text-sm font-bold text-amber-800">
                      {fmt(pendingBalance)}
                    </div>
                    <div className="text-[10px] text-amber-600 uppercase tracking-wide">
                      Pending
                    </div>
                  </div>
                </div>

                {/* Purchase History */}
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Purchase History
                  </div>
                  {vMatPurchases.length === 0 && vInvPurchases.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      No purchases recorded for this vendor.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {vMatPurchases.map((p) => {
                        const project = projects.find(
                          (pr) => pr.id === p.projectId,
                        );
                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between text-xs border rounded px-2 py-1.5 bg-muted/20"
                          >
                            <div>
                              <div className="font-medium">
                                {p.materialType}
                                {p.thickness ? ` (${p.thickness})` : ""}
                              </div>
                              <div className="text-muted-foreground">
                                {project?.projectNo ?? "—"} · {p.purchaseDate}
                              </div>
                            </div>
                            <div className="font-mono">{p.quantity} units</div>
                          </div>
                        );
                      })}
                      {vInvPurchases.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between text-xs border rounded px-2 py-1.5 bg-muted/20"
                        >
                          <div>
                            <div className="font-medium">{p.materialName}</div>
                            <div className="text-muted-foreground">
                              Inventory · {p.purchaseDate}
                            </div>
                          </div>
                          <div className="font-mono">
                            {p.quantityPurchased} units
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Payables */}
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Payables
                  </div>
                  {vPayables.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      No payables for this vendor.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {vPayables.map((p) => {
                        const status = getPayableStatus(
                          p.totalAmount,
                          p.paidAmount,
                          p.dueDate,
                        );
                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between text-xs border rounded px-2 py-1.5 bg-muted/20"
                          >
                            <div>
                              <div className="font-medium">{p.paymentType}</div>
                              <div className="text-muted-foreground">
                                Due: {p.dueDate || "—"}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <div className="font-semibold">
                                {fmt(p.totalAmount)}
                              </div>
                              <Badge
                                className={`text-[10px] ${statusCls(status)}`}
                              >
                                {status}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent data-ocid="vendors.add.dialog">
          <DialogHeader>
            <DialogTitle>Add Vendor</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              console.log("FORM SUBMITTED");
              handleSaveAdd();
            }}
          >
            {vendorFormFields}
            <DialogFooter className="flex justify-end gap-2 mt-4 min-h-[52px] items-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddOpen(false)}
                data-ocid="vendors.add.cancel_button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSaving}
                data-ocid="vendors.add.submit_button"
              >
                {isSaving ? "Saving..." : "Add Vendor"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={!!editVendor}
        onOpenChange={(o) => {
          if (!o) setEditVendor(null);
        }}
      >
        <DialogContent data-ocid="vendors.edit.dialog">
          <DialogHeader>
            <DialogTitle>Edit Vendor</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              console.log("FORM SUBMITTED");
              handleSaveEdit();
            }}
          >
            {vendorFormFields}
            <DialogFooter className="flex justify-end gap-2 mt-4 min-h-[52px] items-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditVendor(null)}
                data-ocid="vendors.edit.cancel_button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSaving}
                data-ocid="vendors.edit.submit_button"
              >
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog
        open={!!deleteId}
        onOpenChange={(o) => {
          if (!o) setDeleteId(null);
        }}
      >
        <DialogContent data-ocid="vendors.delete.dialog">
          <DialogHeader>
            <DialogTitle>Delete Vendor</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Are you sure? Existing purchase and payable records linked to this
            vendor will retain the vendor name but lose the link.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteId(null)}
              data-ocid="vendors.delete.cancel_button"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={confirmDelete}
              data-ocid="vendors.delete.confirm_button"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
