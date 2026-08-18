// Phase 41 — Purchasing integration (§15/Task #211) receiving UI.
//
// One PO line -> one receive action. Inventory/Tools support
// find-or-create-by-name (server-side, via receiveCompanyPoItemRemote)
// or linking an existing record. Machines/Dies NEVER auto-create: the
// user either links an existing record, or fills a small guided-create
// form (same required-field validation and the same createMachineRemote/
// createDieRemote functions Machinery.tsx/Dies.tsx themselves call) that
// only appears inline here - once saved, the new record is linked back
// to the PO line in the same step. See database/phase-41/
// phase41_receive_company_po_item.sql for the server-side contract this
// mirrors exactly.

import { useAuth } from "@/AuthContext";
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
import { receiveCompanyPoItemRemote } from "@/lib/companyPoReceivingApi";
import { createDieRemote } from "@/lib/diesApi";
import {
  hydrateInventoryItems,
  hydrateInventoryPurchases,
  hydrateTools,
} from "@/lib/hydration";
import { createMachineRemote } from "@/lib/machinesApi";
import { canCreate } from "@/permissions";
import { useStore } from "@/store";
import type {
  CompanyPO,
  CompanyPOItem,
  CompanyPOItemResourceType,
  DieStatus,
  MachineStatus,
  MachineType,
} from "@/types";
import { useState } from "react";
import { toast } from "sonner";

const MACHINE_TYPES: MachineType[] = [
  "Laser Cutting",
  "CNC",
  "Welding",
  "Bending",
  "Powder Coating",
  "Compressor",
  "Generator",
  "Drilling",
  "Grinding",
  "Forklift",
  "Testing",
  "Air Tool",
  "Other",
];
const MACHINE_STATUSES: MachineStatus[] = [
  "Operational",
  "Under Maintenance",
  "Breakdown",
  "Idle",
  "Decommissioned",
];
const DIE_STATUSES: DieStatus[] = [
  "Available",
  "In Use",
  "Under Maintenance",
  "Retired",
];

interface Props {
  po: CompanyPO | null;
  open: boolean;
  onClose: () => void;
}

type LinkMode = "existing" | "new";

export function ReceiveCompanyPoItemDialog({ po, open, onClose }: Props) {
  const { currentUser } = useAuth();
  const {
    updateCompanyPO,
    machines,
    dies,
    tools,
    inventoryItems,
    addMachine,
    addDie,
    setInventoryItemsFromServer,
    setInventoryPurchasesFromServer,
    setToolsFromServer,
    generateToolCode,
    generateMachineCode,
    generateDieCode,
  } = useStore();

  const pInventoryCreate = canCreate(currentUser, "inventory");
  const pToolsCreate = canCreate(currentUser, "tools");
  const pMachineryCreate = canCreate(currentUser, "machinery");
  const pDiesCreate = canCreate(currentUser, "tooling_dies");

  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [resourceType, setResourceType] =
    useState<CompanyPOItemResourceType>("inventory");
  const [linkMode, setLinkMode] = useState<LinkMode>("new");
  const [linkId, setLinkId] = useState<string>("");
  const [guidedForm, setGuidedForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (!po) return null;

  const items = po.items || [];

  const openReceive = (item: CompanyPOItem) => {
    setActiveItemId(item.id);
    setResourceType(item.resourceType || "inventory");
    setLinkMode("new");
    setLinkId("");
    setGuidedForm({ name: item.description, status: "" });
  };

  const closeReceive = () => {
    setActiveItemId(null);
    setLinkId("");
    setGuidedForm({});
  };

  const applyReceivedItems = (newItems: CompanyPOItem[]) => {
    updateCompanyPO({ ...po, items: newItems });
  };

  async function finalizeMachineOrDie(
    item: CompanyPOItem,
    kind: "machine" | "die",
    resourceItemId: string,
  ) {
    const result = await receiveCompanyPoItemRemote({
      companyPoId: po!.id,
      itemId: item.id,
      resourceType: kind,
      resourceItemId,
    });
    if (result.status === "unauthenticated") {
      toast.error("Not signed in to the server - not received.");
      return;
    }
    if (result.status === "denied" || result.status === "error") {
      toast.error(result.error ?? "Could not receive this item.");
      return;
    }
    if (!result.data) {
      toast.error("Could not receive this item.");
      return;
    }
    applyReceivedItems(result.data);
    toast.success(
      `${kind === "machine" ? "Machine" : "Die"} linked to PO line.`,
    );
    closeReceive();
  }

  async function handleReceive(item: CompanyPOItem) {
    if (busy) return;
    setBusy(true);
    try {
      if (resourceType === "inventory") {
        const result = await receiveCompanyPoItemRemote({
          companyPoId: po!.id,
          itemId: item.id,
          resourceType: "inventory",
          resourceItemId: linkMode === "existing" ? linkId : undefined,
        });
        if (result.status === "unauthenticated") {
          toast.error("Not signed in to the server - not received.");
          return;
        }
        if (result.status === "denied" || result.status === "error") {
          toast.error(result.error ?? "Could not receive this item.");
          return;
        }
        if (!result.data) {
          toast.error("Could not receive this item.");
          return;
        }
        applyReceivedItems(result.data);
        // items/inventory_purchases were written server-side by the RPC -
        // pull the fresh authoritative rows rather than guessing the
        // shape of what was just created/updated locally.
        const [itemsRes, purchasesRes] = await Promise.all([
          hydrateInventoryItems(),
          hydrateInventoryPurchases(),
        ]);
        if (itemsRes.status === "success" && itemsRes.data) {
          setInventoryItemsFromServer(itemsRes.data);
        }
        if (purchasesRes.status === "success" && purchasesRes.data) {
          setInventoryPurchasesFromServer(purchasesRes.data);
        }
        toast.success(`Stock received: +${item.quantity} ${item.unit}.`);
        closeReceive();
        return;
      }

      if (resourceType === "tool") {
        let newToolCode: string | undefined;
        if (linkMode === "new") newToolCode = generateToolCode();
        const result = await receiveCompanyPoItemRemote({
          companyPoId: po!.id,
          itemId: item.id,
          resourceType: "tool",
          resourceItemId: linkMode === "existing" ? linkId : undefined,
          newToolCode,
        });
        if (result.status === "unauthenticated") {
          toast.error("Not signed in to the server - not received.");
          return;
        }
        if (result.status === "denied" || result.status === "error") {
          toast.error(result.error ?? "Could not receive this item.");
          return;
        }
        if (!result.data) {
          toast.error("Could not receive this item.");
          return;
        }
        applyReceivedItems(result.data);
        const toolsRes = await hydrateTools();
        if (toolsRes.status === "success" && toolsRes.data) {
          setToolsFromServer(toolsRes.data);
        }
        toast.success(
          linkMode === "new"
            ? `Tool ${newToolCode} created.`
            : "Tool quantity updated.",
        );
        closeReceive();
        return;
      }

      if (resourceType === "machine") {
        if (linkMode === "existing") {
          if (!linkId) {
            toast.error("Select an existing machine to link.");
            return;
          }
          await finalizeMachineOrDie(item, "machine", linkId);
          return;
        }
        // Guided creation: same required-field validation and the same
        // createMachineRemote() call Machinery.tsx's own Add form uses -
        // never a fabricated/incomplete record.
        if (!guidedForm.name?.trim()) {
          toast.error("Machine name is required.");
          return;
        }
        if (!guidedForm.type) {
          toast.error("Machine type is required.");
          return;
        }
        const result = await createMachineRemote({
          machineCode: generateMachineCode(),
          name: guidedForm.name.trim(),
          type: guidedForm.type as MachineType,
          purchaseDate: po!.expectedDeliveryDate,
          purchaseCost: item.rate || undefined,
          purchaseVendorId: po!.vendorId,
          purchaseVendorName: po!.vendorName,
          currentStatus: (guidedForm.status as MachineStatus) || "Operational",
          totalRunningHours: 0,
          sourceCompanyPoItemId: po!.id,
          isActive: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        if (result.status === "unauthenticated") {
          toast.error("Not signed in to Supabase - machine was not saved.");
          return;
        }
        if (result.status === "error" || !result.data) {
          toast.error(
            `Could not save machine: ${result.error ?? "unknown error"}`,
          );
          return;
        }
        addMachine(result.data);
        toast.success(`Machine ${result.data.machineCode} created.`);
        await finalizeMachineOrDie(item, "machine", result.data.id);
        return;
      }

      // resourceType === "die"
      if (linkMode === "existing") {
        if (!linkId) {
          toast.error("Select an existing die to link.");
          return;
        }
        await finalizeMachineOrDie(item, "die", linkId);
        return;
      }
      if (!guidedForm.name?.trim()) {
        toast.error("Die name is required.");
        return;
      }
      const dieResult = await createDieRemote({
        dieCode: generateDieCode(),
        name: guidedForm.name.trim(),
        type: guidedForm.type || undefined,
        purpose: guidedForm.purpose || undefined,
        status: (guidedForm.status as DieStatus) || "Available",
        sourceCompanyPoItemId: po!.id,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      if (dieResult.status === "unauthenticated") {
        toast.error("Not signed in to Supabase - die was not saved.");
        return;
      }
      if (dieResult.status === "error" || !dieResult.data) {
        toast.error(
          `Could not save die: ${dieResult.error ?? "unknown error"}`,
        );
        return;
      }
      addDie(dieResult.data);
      toast.success(`Die ${dieResult.data.dieCode} created.`);
      await finalizeMachineOrDie(item, "die", dieResult.data.id);
    } finally {
      setBusy(false);
    }
  }

  const resourceLabel = (item: CompanyPOItem) => {
    if (!item.resourceType) return null;
    if (item.receivedAt) {
      return (
        <Badge className="bg-green-100 text-green-700">
          Received — {item.resourceType}
        </Badge>
      );
    }
    if (item.pendingGuidedCreation) {
      return (
        <Badge className="bg-amber-100 text-amber-700">
          Pending {item.resourceType} details
        </Badge>
      );
    }
    return null;
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          closeReceive();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receive Items — {po.cpoNumber}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="border rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-sm">
                    {item.description || "(no description)"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.quantity} {item.unit} @ ₹{item.rate}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {resourceLabel(item)}
                  {!item.receivedAt && (
                    <Button
                      size="sm"
                      variant={
                        activeItemId === item.id ? "secondary" : "outline"
                      }
                      onClick={() =>
                        activeItemId === item.id
                          ? closeReceive()
                          : openReceive(item)
                      }
                    >
                      {item.pendingGuidedCreation
                        ? "Complete Details"
                        : "Receive"}
                    </Button>
                  )}
                </div>
              </div>

              {activeItemId === item.id && (
                <div className="mt-3 border-t pt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Resource Type</Label>
                      <Select
                        value={resourceType}
                        onValueChange={(v) => {
                          setResourceType(v as CompanyPOItemResourceType);
                          setLinkMode("new");
                          setLinkId("");
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inventory">Inventory</SelectItem>
                          <SelectItem value="tool">Tool</SelectItem>
                          <SelectItem value="machine">Machine</SelectItem>
                          <SelectItem value="die">Die</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Mode</Label>
                      <Select
                        value={linkMode}
                        onValueChange={(v) => {
                          setLinkMode(v as LinkMode);
                          setLinkId("");
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">
                            {resourceType === "machine" ||
                            resourceType === "die"
                              ? "Create New (guided)"
                              : "Create New"}
                          </SelectItem>
                          <SelectItem value="existing">
                            Link Existing
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {linkMode === "existing" && (
                    <div>
                      <Label className="text-xs">
                        Select existing{" "}
                        {resourceType === "inventory"
                          ? "inventory item"
                          : resourceType}
                      </Label>
                      <Select value={linkId} onValueChange={setLinkId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose one…" />
                        </SelectTrigger>
                        <SelectContent>
                          {resourceType === "inventory" &&
                            (inventoryItems || []).map((i) => (
                              <SelectItem key={i.id} value={i.id}>
                                {i.name}
                              </SelectItem>
                            ))}
                          {resourceType === "tool" &&
                            (tools || []).map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.toolCode} — {t.name}
                              </SelectItem>
                            ))}
                          {resourceType === "machine" &&
                            (machines || []).map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.machineCode} — {m.name}
                              </SelectItem>
                            ))}
                          {resourceType === "die" &&
                            (dies || []).map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.dieCode} — {d.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {linkMode === "new" &&
                    resourceType === "machine" &&
                    pMachineryCreate && (
                      <div className="space-y-2 bg-muted/40 rounded p-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Name *</Label>
                            <Input
                              value={guidedForm.name || ""}
                              onChange={(e) =>
                                setGuidedForm((f) => ({
                                  ...f,
                                  name: e.target.value,
                                }))
                              }
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Type *</Label>
                            <Select
                              value={guidedForm.type || ""}
                              onValueChange={(v) =>
                                setGuidedForm((f) => ({ ...f, type: v }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                              <SelectContent>
                                {MACHINE_TYPES.map((t) => (
                                  <SelectItem key={t} value={t}>
                                    {t}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Status</Label>
                          <Select
                            value={guidedForm.status || "Operational"}
                            onValueChange={(v) =>
                              setGuidedForm((f) => ({ ...f, status: v }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {MACHINE_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                  {linkMode === "new" &&
                    resourceType === "die" &&
                    pDiesCreate && (
                      <div className="space-y-2 bg-muted/40 rounded p-2">
                        <div>
                          <Label className="text-xs">Name *</Label>
                          <Input
                            value={guidedForm.name || ""}
                            onChange={(e) =>
                              setGuidedForm((f) => ({
                                ...f,
                                name: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Type</Label>
                            <Input
                              value={guidedForm.type || ""}
                              onChange={(e) =>
                                setGuidedForm((f) => ({
                                  ...f,
                                  type: e.target.value,
                                }))
                              }
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Purpose</Label>
                            <Input
                              value={guidedForm.purpose || ""}
                              onChange={(e) =>
                                setGuidedForm((f) => ({
                                  ...f,
                                  purpose: e.target.value,
                                }))
                              }
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Status</Label>
                          <Select
                            value={guidedForm.status || "Available"}
                            onValueChange={(v) =>
                              setGuidedForm((f) => ({ ...f, status: v }))
                            }
                          >
                            <SelectTrigger>
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
                      </div>
                    )}

                  {linkMode === "new" &&
                    resourceType === "machine" &&
                    !pMachineryCreate && (
                      <p className="text-xs text-destructive">
                        You do not have permission to create machines.
                      </p>
                    )}
                  {linkMode === "new" &&
                    resourceType === "die" &&
                    !pDiesCreate && (
                      <p className="text-xs text-destructive">
                        You do not have permission to create dies.
                      </p>
                    )}
                  {linkMode === "new" &&
                    resourceType === "inventory" &&
                    !pInventoryCreate && (
                      <p className="text-xs text-destructive">
                        You do not have permission to create inventory items.
                      </p>
                    )}
                  {linkMode === "new" &&
                    resourceType === "tool" &&
                    !pToolsCreate && (
                      <p className="text-xs text-destructive">
                        You do not have permission to create tools.
                      </p>
                    )}

                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={closeReceive}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={
                        busy ||
                        (linkMode === "new" &&
                          ((resourceType === "machine" && !pMachineryCreate) ||
                            (resourceType === "die" && !pDiesCreate) ||
                            (resourceType === "inventory" &&
                              !pInventoryCreate) ||
                            (resourceType === "tool" && !pToolsCreate)))
                      }
                      onClick={() => handleReceive(item)}
                    >
                      Confirm Receive
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">
              This PO has no line items.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
