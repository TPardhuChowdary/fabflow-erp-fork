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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CheckCircle2,
  ClipboardList,
  Clock,
  PackageCheck,
  ShoppingCart,
} from "lucide-react";
import { ShieldOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import {
  recordMaterialPurchaseRemote,
  updateBomRequisitionStatusRemote,
} from "../lib/bomItemsApi";
import { hydrateBomRequisitions } from "../lib/hydration";
import { canApprove, canCreate, canDelete, canView } from "../permissions";
import { useStore } from "../store";
import type { BomRequisition, BomRequisitionStatus } from "../types";

type FilterTab = "All" | BomRequisitionStatus;

const STATUS_CONFIG: Record<
  BomRequisitionStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  Pending: {
    label: "Pending",
    className: "bg-warning/15 text-warning border-warning/30",
    icon: <Clock className="h-3 w-3" />,
  },
  "Ready to Complete": {
    label: "Ready to Complete",
    className: "bg-info/10 text-info border-info/30",
    icon: <PackageCheck className="h-3 w-3" />,
  },
  Completed: {
    label: "Completed",
    className: "bg-success/10 text-success border-success/30",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
};

export function MaterialRequisitions() {
  const { currentUser } = useAuth();
  const pView = canView(currentUser, "material_requisitions");
  const pCreate = canCreate(currentUser, "material_requisitions");
  const pDelete = canDelete(currentUser, "material_requisitions");
  // Monster-1 — bom_requisitions_approve's RLS policy gates this specific
  // write on material_requisitions.approve, not .edit (see bomItemsApi.ts's
  // header comment). Was gated on canEdit, which meant a user granted
  // .edit but not .approve would see this button succeed the client-side
  // check and then be silently denied by RLS with a generic error toast.
  const pApprove = canApprove(currentUser, "material_requisitions");
  // record_material_purchase() itself checks inventory.create OR
  // production.create OR projects.create (see the RPC's own definition) -
  // mirrored here client-side only as a fast-fail UX check, never the
  // real enforcement (RLS/the RPC's internal check is that).
  const pPurchase =
    canCreate(currentUser, "inventory") ||
    canCreate(currentUser, "production") ||
    canCreate(currentUser, "projects");
  const {
    bomRequisitions,
    updateBomRequisition,
    projects,
    inventoryItems,
    setBomRequisitionsFromServer,
    setBomRequisitionsHydrationStatus,
  } = useStore();
  const [activeTab, setActiveTab] = useState<FilterTab>("All");
  const [purchaseTarget, setPurchaseTarget] = useState<BomRequisition | null>(
    null,
  );
  const [purchaseForm, setPurchaseForm] = useState({
    quantity: "",
    supplierName: "",
    vendorId: "",
    purchaseDate: new Date().toISOString().split("T")[0],
  });
  const [isPurchasing, setIsPurchasing] = useState(false);

  const filtered =
    activeTab === "All"
      ? bomRequisitions
      : bomRequisitions.filter((r) => r.status === activeTab);

  const counts: Record<FilterTab, number> = {
    All: bomRequisitions.length,
    Pending: bomRequisitions.filter((r) => r.status === "Pending").length,
    "Ready to Complete": bomRequisitions.filter(
      (r) => r.status === "Ready to Complete",
    ).length,
    Completed: bomRequisitions.filter((r) => r.status === "Completed").length,
  };

  const tabs: FilterTab[] = [
    "All",
    "Pending",
    "Ready to Complete",
    "Completed",
  ];

  async function handleMarkCompleted(id: string) {
    if (!pApprove) {
      toast.error("Access restricted: approve permission required");
      return;
    }
    const result = await updateBomRequisitionStatusRemote(id, "Completed");
    if (result.status === "unauthenticated") {
      toast.error("Not signed in to the server - requisition was not updated");
      return;
    }
    if (result.status === "denied" || result.status === "error") {
      toast.error(result.error ?? "Could not update requisition");
      return;
    }
    if (!result.data) {
      toast.error("Could not update requisition");
      return;
    }
    updateBomRequisition(id, result.data);
    toast.success("Requisition marked as completed");
  }

  function getProjectLabel(projectId: string) {
    const project = projects.find((p) => p.id === projectId);
    return project?.projectNo ?? projectId;
  }

  // Phase 9 — the "Purchase" action for a Pending requisition. Reuses
  // record_material_purchase(), a complete, already-existing, permission-
  // checked RPC (find-or-create the inventory item by name, record the
  // purchase through the exact same inventory_purchases + stock-increase
  // trigger every other purchase path already uses, and flip this
  // requisition to "Ready to Complete" once the new stock covers its
  // shortage) that had zero callers anywhere in the frontend until now -
  // not a second purchasing system, the missing wiring for the one that
  // was already built for exactly this. Matched by materialName
  // (case-insensitive, same as the RPC's own find-or-create), never by
  // re-deriving a new item - this requisition's shortage already IS that
  // existing item's shortage.
  function openPurchase(req: BomRequisition) {
    setPurchaseTarget(req);
    setPurchaseForm({
      quantity: String(req.shortageQty || req.requiredQty || ""),
      supplierName: "",
      vendorId: "",
      purchaseDate: new Date().toISOString().split("T")[0],
    });
  }

  function closePurchase() {
    setPurchaseTarget(null);
    setPurchaseForm({
      quantity: "",
      supplierName: "",
      vendorId: "",
      purchaseDate: new Date().toISOString().split("T")[0],
    });
  }

  async function handleRecordPurchase() {
    if (isPurchasing || !purchaseTarget) return;
    const qty = Number(purchaseForm.quantity);
    if (!qty || qty <= 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }
    const item = inventoryItems.find(
      (i) => i.id === purchaseTarget.inventoryItemId,
    );
    setIsPurchasing(true);
    try {
      const result = await recordMaterialPurchaseRemote({
        projectId: purchaseTarget.projectId,
        materialType: purchaseTarget.materialName,
        quantity: qty,
        unit: item?.unit || "units",
        supplierName: purchaseForm.supplierName || undefined,
        vendorId: purchaseForm.vendorId || undefined,
        purchaseDate: purchaseForm.purchaseDate,
      });
      if (result.status === "unauthenticated") {
        toast.error("Not signed in to the server - purchase was not recorded");
        return;
      }
      if (result.status === "denied" || result.status === "error") {
        toast.error(result.error ?? "Could not record purchase");
        return;
      }
      // The RPC updates bom_requisitions server-side (status flip) and
      // inventory_items (stock) - re-hydrate rather than guess the new
      // state locally, same discipline ProjectDetail.tsx's own
      // refreshBomRequisitions() already established.
      const hydrated = await hydrateBomRequisitions();
      if (hydrated.status === "success" && hydrated.data) {
        setBomRequisitionsFromServer(hydrated.data);
      } else {
        setBomRequisitionsHydrationStatus(hydrated.status, hydrated.error);
      }
      toast.success("Purchase recorded");
      closePurchase();
    } finally {
      setIsPurchasing(false);
    }
  }

  // Suppress unused-variable warnings — reserved for future create/delete actions
  void pCreate;
  void pDelete;

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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">
              Material Requisitions
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Auto-generated from BOM shortages
          </p>
        </div>
        <div className="text-sm text-muted-foreground bg-muted/50 border rounded-md px-3 py-1.5">
          {counts.All} total &bull; {counts.Pending} pending
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 bg-muted/40 border rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab}
            data-ocid={`mr.${tab.toLowerCase().replace(/ /g, "_")}.tab`}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
            <span
              className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-xs font-semibold ${
                activeTab === tab
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}
            >
              {counts[tab]}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="font-semibold">Material</TableHead>
                <TableHead className="font-semibold">Available Qty</TableHead>
                <TableHead className="font-semibold">Required Qty</TableHead>
                <TableHead className="font-semibold">Est. Price</TableHead>
                <TableHead className="font-semibold">Project</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Updated</TableHead>
                <TableHead className="font-semibold">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-16">
                    <div
                      data-ocid="mr.empty_state"
                      className="flex flex-col items-center gap-3 text-muted-foreground"
                    >
                      <ClipboardList className="h-10 w-10 opacity-30" />
                      <div>
                        <p className="font-medium text-foreground">
                          No material requisitions yet
                        </p>
                        <p className="text-sm mt-1">
                          Add BOM items to projects to auto-generate
                          requisitions when shortages are detected.
                        </p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((req, idx) => {
                  const statusCfg = STATUS_CONFIG[req.status];
                  return (
                    <TableRow
                      key={req.id}
                      data-ocid={`mr.item.${idx + 1}`}
                      className="hover:bg-muted/20"
                    >
                      <TableCell className="font-medium">
                        {req.materialName}
                      </TableCell>
                      <TableCell
                        className={
                          req.availableQty === 0 ||
                          req.availableQty === undefined
                            ? "text-destructive/70 text-sm"
                            : "text-sm"
                        }
                      >
                        {req.availableQty ?? 0}
                      </TableCell>
                      <TableCell className="text-sm">
                        {req.requiredQty ?? req.shortageQty}
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        ₹{Number(req.estimatedPrice || 0).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-mono text-muted-foreground">
                          {getProjectLabel(req.projectId)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`flex items-center gap-1 w-fit ${statusCfg.className}`}
                        >
                          {statusCfg.icon}
                          {statusCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(req.updatedAt).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell>
                        {pApprove && req.status === "Ready to Complete" && (
                          <Button
                            size="sm"
                            variant="default"
                            data-ocid={`mr.confirm_button.${idx + 1}`}
                            onClick={() => handleMarkCompleted(req.id)}
                            className="h-7 text-xs"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                            Mark as Completed
                          </Button>
                        )}
                        {req.status === "Pending" && pPurchase && (
                          <Button
                            size="sm"
                            variant="outline"
                            data-ocid={`mr.purchase_button.${idx + 1}`}
                            onClick={() => openPurchase(req)}
                            className="h-7 text-xs"
                          >
                            <ShoppingCart className="h-3.5 w-3.5 mr-1" />
                            Purchase
                          </Button>
                        )}
                        {req.status === "Pending" && !pPurchase && (
                          <span className="text-xs text-muted-foreground italic">
                            Waiting for purchase
                          </span>
                        )}
                        {req.status === "Completed" && (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog
        open={!!purchaseTarget}
        onOpenChange={(o) => !o && closePurchase()}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Purchase</DialogTitle>
          </DialogHeader>
          {purchaseTarget && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <p className="font-medium">{purchaseTarget.materialName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Project {getProjectLabel(purchaseTarget.projectId)} · Short by{" "}
                  {purchaseTarget.shortageQty}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Quantity *</Label>
                <Input
                  type="number"
                  value={purchaseForm.quantity}
                  onChange={(e) =>
                    setPurchaseForm((p) => ({ ...p, quantity: e.target.value }))
                  }
                  data-ocid="mr.purchase.quantity"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Supplier Name</Label>
                <Input
                  value={purchaseForm.supplierName}
                  onChange={(e) =>
                    setPurchaseForm((p) => ({
                      ...p,
                      supplierName: e.target.value,
                    }))
                  }
                  data-ocid="mr.purchase.supplier_name"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Vendor</Label>
                <VendorSelect
                  value={purchaseForm.vendorId}
                  onChange={(vendorId, vendorName) =>
                    setPurchaseForm((p) => ({
                      ...p,
                      vendorId,
                      supplierName: p.supplierName || vendorName,
                    }))
                  }
                  placeholder="Select vendor (optional)"
                  className="w-full"
                  data-ocid="mr.purchase.vendor"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Purchase Date</Label>
                <Input
                  type="date"
                  value={purchaseForm.purchaseDate}
                  onChange={(e) =>
                    setPurchaseForm((p) => ({
                      ...p,
                      purchaseDate: e.target.value,
                    }))
                  }
                  data-ocid="mr.purchase.date"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closePurchase}>
              Cancel
            </Button>
            <Button
              onClick={handleRecordPurchase}
              disabled={isPurchasing}
              data-ocid="mr.purchase.save"
            >
              {isPurchasing ? "Recording…" : "Record Purchase"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
