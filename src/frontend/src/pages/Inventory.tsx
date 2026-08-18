import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  FileText,
  Info,
  Paperclip,
  Pencil,
  Plus,
  ShieldOff,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { ConfirmDeleteDialog } from "../components/ConfirmDeleteDialog";
import { MaterialDetailDrawer } from "../components/MaterialDetailDrawer";
import { VendorSelect } from "../components/VendorSelect";
import {
  createInventoryItemRemote,
  deleteInventoryItemRemote,
  updateInventoryItemRemote,
} from "../lib/inventoryApi";
import {
  createInventoryPurchaseRemote,
  deleteInventoryPurchaseRemote,
  updateInventoryPurchaseRemote,
} from "../lib/inventoryPurchasesApi";
import {
  canCreate,
  canDelete,
  canEdit,
  canUpload,
  canView,
} from "../permissions";
import { useStore } from "../store";
import type {
  InventoryItem,
  InventoryItemCategory,
  InventoryPurchase,
  PurchaseAttachment,
} from "../types";

const UNITS = ["pcs", "kg", "sheets", "meters", "liters", "boxes", "rolls"];

// Phase 36 — Inventory classification (§3-5). Consumables and Spare
// Parts need no extra fields; Powder Coating Powder / Pretreatment
// Chemical each get their own conditional fields below.
const CATEGORIES: { value: InventoryItemCategory; label: string }[] = [
  { value: "raw_material", label: "Raw Material" },
  { value: "consumable", label: "Consumable" },
  { value: "spare_part", label: "Spare Part" },
  { value: "powder_coating_powder", label: "Powder Coating Powder" },
  { value: "pretreatment_chemical", label: "Pretreatment Chemical" },
];
const CATEGORY_LABEL: Record<InventoryItemCategory, string> =
  Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label])) as Record<
    InventoryItemCategory,
    string
  >;

interface InventoryProps {
  /** Which tab to land on — defaults to "stock" (today's behavior) when
   * omitted, so the bare `<Inventory />` call site stays unaffected. */
  initialTab?: "stock" | "purchases";
  /** Scrolls to and highlights the matching Purchase History row on
   * mount — used by Petty Expense History's "View Inventory Record". */
  highlightPurchaseId?: string;
}

export function Inventory({
  initialTab,
  highlightPurchaseId,
}: InventoryProps = {}) {
  const { currentUser } = useAuth();
  const pCreate = canCreate(currentUser, "inventory");

  const pEdit = canEdit(currentUser, "inventory");
  const pDelete = canDelete(currentUser, "inventory");
  const {
    inventoryItems,
    inventoryPurchases,
    materialUsages,
    addInventoryItem,
    deleteInventoryItem,
    updateInventoryItem,
    addInventoryPurchase,
    updateInventoryPurchase,
    deleteInventoryPurchase,
  } = useStore();

  // Detail drawer state
  const [selectedMaterial, setSelectedMaterial] =
    useState<InventoryItem | null>(null);

  // Add material dialog
  const [addDialog, setAddDialog] = useState(false);
  const [newItem, setNewItem] = useState<{
    name: string;
    unit: string;
    category: InventoryItemCategory;
    brand: string;
    shade: string;
    ralCode: string;
    finish: string;
    powderType: string;
    pretreatmentTank: string;
  }>({
    name: "",
    unit: "pcs",
    category: "raw_material",
    brand: "",
    shade: "",
    ralCode: "",
    finish: "",
    powderType: "",
    pretreatmentTank: "",
  });
  const [categoryFilter, setCategoryFilter] = useState<
    InventoryItemCategory | "all"
  >("all");

  // Purchase dialog
  const [deletePurchaseRecordTarget, setDeletePurchaseRecordTarget] =
    useState<InventoryPurchase | null>(null);
  const [purchaseDialog, setPurchaseDialog] = useState(false);
  const [purchaseTarget, setPurchaseTarget] = useState<InventoryItem | null>(
    null,
  );
  const [purchaseForm, setPurchaseForm] = useState({
    quantityPurchased: "",
    supplierName: "",
    vendorId: "",
    purchaseDate: new Date().toISOString().split("T")[0],
    cost: "",
    unitCost: "",
    applyGST: false,
    gstPercent: "18",
  });
  const [editingPurchase, setEditingPurchase] =
    useState<InventoryPurchase | null>(null);
  const [editItemDialog, setEditItemDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<{
    id: string;
    name: string;
    unit: string;
    reorderLevel: string;
    unitCost: string;
    estimatedPrice: string;
    category: InventoryItemCategory;
    brand: string;
    shade: string;
    ralCode: string;
    finish: string;
    powderType: string;
    pretreatmentTank: string;
  } | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<
    PurchaseAttachment[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Expanded purchase rows (for attachment preview)
  const [expandedPurchaseIds, setExpandedPurchaseIds] = useState<Set<string>>(
    new Set(),
  );
  const [isAddSaving, setIsAddSaving] = useState(false);
  const [isPurchaseSaving, setIsPurchaseSaving] = useState(false);
  const [isEditSaving, setIsEditSaving] = useState(false);

  const [activeTab, setActiveTab] = useState<"stock" | "purchases">(
    initialTab ?? "stock",
  );

  // Scroll to and highlight the purchase row a caller (e.g. Petty Expense
  // History's "View Inventory Record") asked us to land on.
  useEffect(() => {
    if (!highlightPurchaseId) return;
    document
      .getElementById(`inventory-purchase-${highlightPurchaseId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightPurchaseId]);

  const togglePurchaseExpand = (id: string) => {
    setExpandedPurchaseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Phase 20 — remote-first: the write goes to Supabase before Zustand is
  // ever touched, and only ever sends the master-data field whitelist
  // (name/unit/reorderLevel/unitCost/estimatedPrice) - never
  // current_stock/quantity_reserved/last_purchase_price, which are
  // trigger-owned. Only a confirmed "success" result updates local
  // state; unauthenticated/error leave Zustand exactly as it was and
  // surface a real toast - never a fabricated success. Mirrors
  // Employees.tsx/Customers.tsx's established pattern.
  const handleAddItem = async () => {
    if (isAddSaving) return;
    if (!newItem.name.trim()) {
      toast.error("Material name is required");
      return;
    }
    setIsAddSaving(true);
    try {
      const result = await createInventoryItemRemote({
        name: newItem.name.trim(),
        unit: newItem.unit,
        reorderLevel: undefined,
        unitCost: undefined,
        estimatedPrice: undefined,
        category: newItem.category,
        brand: newItem.brand.trim() || undefined,
        shade: newItem.shade.trim() || undefined,
        ralCode: newItem.ralCode.trim() || undefined,
        finish: newItem.finish.trim() || undefined,
        powderType: newItem.powderType.trim() || undefined,
        pretreatmentTank: newItem.pretreatmentTank.trim() || undefined,
      });
      if (result.status === "unauthenticated") {
        toast.error("Sign in required to add inventory items");
        return;
      }
      if (result.status === "error" || !result.data) {
        toast.error(result.error || "Failed to add inventory item");
        return;
      }
      addInventoryItem(result.data);
      toast.success(`${result.data.name} added to inventory`);
      setNewItem({
        name: "",
        unit: "pcs",
        category: "raw_material",
        brand: "",
        shade: "",
        ralCode: "",
        finish: "",
        powderType: "",
        pretreatmentTank: "",
      });
      setAddDialog(false);
    } finally {
      setIsAddSaving(false);
    }
  };

  const openPurchaseDialog = (e: React.MouseEvent, item: InventoryItem) => {
    e.stopPropagation();
    setPurchaseTarget(item);
    setEditingPurchase(null);
    setPurchaseForm({
      quantityPurchased: "",
      supplierName: "",
      vendorId: "",
      purchaseDate: new Date().toISOString().split("T")[0],
      cost: "",
      unitCost: "",
      applyGST: false,
      gstPercent: "18",
    });
    setPendingAttachments([]);
    setPurchaseDialog(true);
  };

  const closePurchaseDialog = () => {
    setPendingAttachments([]);
    setPurchaseDialog(false);
    setPurchaseTarget(null);
    setEditingPurchase(null);
    setPurchaseForm({
      quantityPurchased: "",
      supplierName: "",
      vendorId: "",
      purchaseDate: new Date().toISOString().split("T")[0],
      cost: "",
      unitCost: "",
      applyGST: false,
      gstPercent: "18",
    });
  };

  const openEditPurchaseDialog = (
    e: React.MouseEvent,
    p: InventoryPurchase,
  ) => {
    e.stopPropagation();
    const item = inventoryItems.find((x) => x.id === p.inventoryItemId) ?? null;
    setPurchaseTarget(item);
    setEditingPurchase(p);
    setPurchaseForm({
      quantityPurchased: String(p.quantityPurchased),
      supplierName: p.supplierName,
      vendorId: p.vendorId ?? "",
      purchaseDate: p.purchaseDate,
      cost: String(p.cost),
      unitCost: String(p.unitCost ?? p.cost),
      applyGST: p.applyGST ?? false,
      gstPercent: String(p.gstPercent ?? 18),
    });
    setPendingAttachments(p.attachments ? [...p.attachments] : []);
    setPurchaseDialog(true);
  };

  const handleAttachFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const readFile = (file: File): Promise<PurchaseAttachment> =>
      new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            ref: reader.result as string,
            type: file.type === "application/pdf" ? "pdf" : "image",
            name: file.name,
          });
        };
        reader.readAsDataURL(file);
      });

    Promise.all(files.map(readFile)).then((newAttachments) => {
      setPendingAttachments((prev) => [...prev, ...newAttachments]);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (ref: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.ref !== ref));
  };

  const handleAddPurchase = async () => {
    if (isPurchaseSaving) return;
    setIsPurchaseSaving(true);
    try {
      if (!purchaseTarget) {
        setIsPurchaseSaving(false);
        return;
      }
      const qty = Number(purchaseForm.quantityPurchased);
      if (!qty || qty <= 0) {
        toast.error("Quantity must be greater than 0");
        return;
      }
      const unitCost = Number(purchaseForm.unitCost) || 0;
      if (unitCost <= 0) {
        toast.error("Unit cost must be greater than 0");
        return;
      }
      const gstPct = purchaseForm.applyGST
        ? Number(purchaseForm.gstPercent) || 0
        : 0;
      if (purchaseForm.applyGST && gstPct < 0) {
        toast.error("GST percent must be 0 or greater");
        return;
      }
      const subtotalVal = qty * unitCost;
      const gstAmt = purchaseForm.applyGST ? subtotalVal * (gstPct / 100) : 0;
      const finalTotal = subtotalVal + gstAmt;
      const purchaseFields: Omit<InventoryPurchase, "id" | "createdAt"> = {
        inventoryItemId: purchaseTarget.id,
        materialName: purchaseTarget.name,
        quantityPurchased: qty,
        supplierName: purchaseForm.supplierName,
        vendorId: purchaseForm.vendorId || undefined,
        purchaseDate: purchaseForm.purchaseDate,
        cost: unitCost,
        unitCost,
        applyGST: purchaseForm.applyGST,
        gstPercent: purchaseForm.applyGST ? gstPct : undefined,
        subtotal: subtotalVal,
        gstAmount: gstAmt,
        finalTotal,
        attachments:
          pendingAttachments.length > 0 ? [...pendingAttachments] : undefined,
      };
      if (editingPurchase) {
        const result = await updateInventoryPurchaseRemote({
          ...editingPurchase,
          ...purchaseFields,
        });
        if (result.status === "unauthenticated") {
          toast.error("Not signed in to the server - purchase was not saved");
          return;
        }
        if (result.status === "denied" || result.status === "error") {
          toast.error(result.error ?? "Could not save purchase");
          return;
        }
        if (!result.data) {
          toast.error("Could not save purchase");
          return;
        }
        updateInventoryPurchase(result.data);
        toast.success("Purchase updated");
      } else {
        const result = await createInventoryPurchaseRemote(purchaseFields);
        if (result.status === "unauthenticated") {
          toast.error("Not signed in to the server - purchase was not saved");
          return;
        }
        if (result.status === "denied" || result.status === "error") {
          toast.error(result.error ?? "Could not save purchase");
          return;
        }
        if (!result.data) {
          toast.error("Could not save purchase");
          return;
        }
        addInventoryPurchase(result.data);
        toast.success(
          `Stock updated: +${qty} ${purchaseTarget.unit} of ${purchaseTarget.name}`,
        );
      }
      setPendingAttachments([]);
      setPurchaseDialog(false);
      setPurchaseTarget(null);
      setEditingPurchase(null);
    } finally {
      setIsPurchaseSaving(false);
    }
  };

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  if (!canView(currentUser, "inventory")) {
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
    <div className="p-6 space-y-6" data-ocid="inventory.panel">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Archive className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Inventory</h1>
            <p className="text-xs text-muted-foreground">
              Central stock management
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => setAddDialog(true)}
          data-ocid="inventory.add_button"
          className={!pCreate ? "hidden" : ""}
        >
          <Plus className="w-4 h-4 mr-1.5" /> Add Material
        </Button>
      </div>

      {/* Info notice */}
      <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 border border-border text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          Inventory stock cannot be edited manually. Stock increases via{" "}
          <strong>Purchase entries</strong> and decreases via{" "}
          <strong>Material Usage</strong> in projects. Click any row to view
          detailed history.
        </span>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "stock" | "purchases")}
      >
        <TabsList>
          <TabsTrigger value="stock">Current Stock</TabsTrigger>
          <TabsTrigger value="purchases">Purchase History</TabsTrigger>
        </TabsList>

        {/* Stock Table */}
        <TabsContent value="stock" className="mt-4">
          <div className="flex items-center gap-2 mb-3">
            <Label className="text-xs text-muted-foreground">
              Filter by category
            </Label>
            <Select
              value={categoryFilter}
              onValueChange={(v) =>
                setCategoryFilter(v as InventoryItemCategory | "all")
              }
            >
              <SelectTrigger
                className="h-8 w-56 text-xs"
                data-ocid="inventory.category_filter.select"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="table-wrapper">
            <div className="rounded-md border" data-ocid="inventory.table">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-xs font-semibold">
                      Material Name
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Category
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Unit
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Total Stock
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Reserved
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Available
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Last Purchase Price
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Last Updated
                    </TableHead>
                    <TableHead className="text-xs font-semibold w-24">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventoryItems
                    .filter(
                      (item) =>
                        categoryFilter === "all" ||
                        (item.category ?? "raw_material") === categoryFilter,
                    )
                    .map((item, i) => (
                      <TableRow
                        key={item.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors group"
                        onClick={() => setSelectedMaterial(item)}
                        data-ocid={`inventory.item.${i + 1}`}
                      >
                        <TableCell className="font-medium text-sm">
                          <span className="flex items-center gap-1.5">
                            {item.name}
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="text-xs font-normal"
                          >
                            {CATEGORY_LABEL[item.category ?? "raw_material"]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.unit}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs">
                            {item.quantityAvailable} {item.unit}
                          </span>
                        </TableCell>
                        <TableCell>
                          {(item.quantityReserved ?? 0) > 0 ? (
                            <span className="font-mono text-xs text-amber-600">
                              {item.quantityReserved} {item.unit}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const avail =
                              item.quantityAvailable -
                              (item.quantityReserved ?? 0);
                            return (
                              <Badge
                                variant={
                                  avail <= 0
                                    ? "destructive"
                                    : avail < 10
                                      ? "secondary"
                                      : "outline"
                                }
                                className="font-mono text-xs"
                              >
                                {Math.max(0, avail)} {item.unit}
                              </Badge>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {item.lastPurchasePrice &&
                          item.lastPurchasePrice > 0 ? (
                            `₹${item.lastPurchasePrice.toLocaleString("en-IN")}`
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(item.lastUpdated)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {pCreate && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={(e) => openPurchaseDialog(e, item)}
                                data-ocid="inventory.purchase_button"
                              >
                                <ShoppingCart className="w-3 h-3 mr-1" />{" "}
                                Purchase
                              </Button>
                            )}
                            {pEdit && (
                              <button
                                type="button"
                                className="p-1 rounded hover:bg-muted transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingItem({
                                    id: item.id,
                                    name: item.name,
                                    unit: item.unit,
                                    reorderLevel:
                                      item.reorderLevel != null
                                        ? String(item.reorderLevel)
                                        : "",
                                    unitCost:
                                      item.unitCost != null
                                        ? String(item.unitCost)
                                        : "",
                                    estimatedPrice:
                                      item.estimatedPrice != null
                                        ? String(item.estimatedPrice)
                                        : "",
                                    category: item.category ?? "raw_material",
                                    brand: item.brand ?? "",
                                    shade: item.shade ?? "",
                                    ralCode: item.ralCode ?? "",
                                    finish: item.finish ?? "",
                                    powderType: item.powderType ?? "",
                                    pretreatmentTank:
                                      item.pretreatmentTank ?? "",
                                  });
                                  setEditItemDialog(true);
                                }}
                                title="Edit material"
                                data-ocid={`inventory.item.edit_button.${i + 1}`}
                              >
                                <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                              </button>
                            )}
                            {pDelete && (
                              <button
                                type="button"
                                className="p-1 rounded hover:bg-muted transition-colors"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const hasPurchases = (
                                    inventoryPurchases || []
                                  ).some((p) => p.inventoryItemId === item.id);
                                  const hasUsage = (materialUsages || []).some(
                                    (u) => u.inventoryItemId === item.id,
                                  );
                                  if (hasPurchases || hasUsage) {
                                    toast.error(
                                      "Cannot delete material with existing records",
                                    );
                                    return;
                                  }
                                  const result =
                                    await deleteInventoryItemRemote(item.id);
                                  if (result.status === "unauthenticated") {
                                    toast.error(
                                      "Sign in required to delete inventory items",
                                    );
                                    return;
                                  }
                                  if (
                                    result.status === "error" ||
                                    result.status === "denied"
                                  ) {
                                    toast.error(
                                      result.error ||
                                        "Failed to delete inventory item",
                                    );
                                    return;
                                  }
                                  deleteInventoryItem(item.id);
                                  toast.success("Material deleted");
                                }}
                                title="Delete material"
                                data-ocid={`inventory.item.delete_button.${i + 1}`}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  {inventoryItems.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center py-8 text-sm text-muted-foreground"
                        data-ocid="inventory.empty_state"
                      >
                        No inventory items yet. Add materials to get started.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* Purchase History */}
        <TabsContent value="purchases" className="mt-4">
          <div className="table-wrapper">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-xs font-semibold w-8" />
                    <TableHead className="text-xs font-semibold">
                      Date
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Material
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Qty Purchased
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Supplier
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Cost (₹)
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Attachments
                    </TableHead>
                    <TableHead className="text-xs font-semibold w-20">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventoryPurchases
                    .slice()
                    .sort((a, b) => b.createdAt - a.createdAt)
                    .map((p, i) => {
                      const isExpanded = expandedPurchaseIds.has(p.id);
                      const attachments = p.attachments ?? [];
                      const isHighlighted = highlightPurchaseId === p.id;
                      return (
                        <>
                          <TableRow
                            key={p.id}
                            id={`inventory-purchase-${p.id}`}
                            className={
                              isHighlighted
                                ? "bg-primary/10 ring-2 ring-inset ring-primary/50 transition-colors"
                                : "hover:bg-muted/30 transition-colors"
                            }
                            data-ocid={`inventory.purchases.item.${i + 1}`}
                          >
                            <TableCell className="w-8">
                              {attachments.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => togglePurchaseExpand(p.id)}
                                  className="p-1 rounded hover:bg-muted transition-colors"
                                  data-ocid={`inventory.purchases.expand.${i + 1}`}
                                  aria-label="Toggle attachments"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                                  )}
                                </button>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              {p.purchaseDate}
                            </TableCell>
                            <TableCell className="font-medium text-sm">
                              {p.materialName}
                            </TableCell>
                            <TableCell className="text-sm">
                              {p.quantityPurchased}{" "}
                              {inventoryItems.find(
                                (x) => x.id === p.inventoryItemId,
                              )?.unit ?? ""}
                            </TableCell>
                            <TableCell className="text-sm">
                              {p.supplierName || "—"}
                            </TableCell>
                            <TableCell className="text-sm font-medium">
                              {p.cost > 0
                                ? `₹${p.cost.toLocaleString("en-IN")}`
                                : "—"}
                            </TableCell>
                            <TableCell>
                              {attachments.length > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => togglePurchaseExpand(p.id)}
                                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                  data-ocid={`inventory.purchases.attachments.${i + 1}`}
                                >
                                  <Paperclip className="w-3.5 h-3.5" />
                                  <span>{attachments.length}</span>
                                </button>
                              ) : (
                                <span className="text-xs text-muted-foreground/50">
                                  —
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {pEdit && (
                                  <button
                                    type="button"
                                    className="p-1 rounded hover:bg-muted transition-colors"
                                    onClick={(e) =>
                                      openEditPurchaseDialog(e, p)
                                    }
                                    title="Edit purchase"
                                    data-ocid={`inventory.purchases.edit_button.${i + 1}`}
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                                  </button>
                                )}
                                {pDelete && (
                                  <button
                                    type="button"
                                    className="p-1 rounded hover:bg-muted transition-colors"
                                    onClick={() =>
                                      setDeletePurchaseRecordTarget(p)
                                    }
                                    title="Delete purchase"
                                    data-ocid={`inventory.purchases.delete_button.${i + 1}`}
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                                  </button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                          {isExpanded && attachments.length > 0 && (
                            <TableRow
                              key={`${p.id}-expand`}
                              className="bg-muted/20"
                            >
                              <TableCell colSpan={8} className="py-3 px-6">
                                <div className="flex flex-wrap gap-3">
                                  {attachments.map((att) =>
                                    att.type === "image" ? (
                                      <img
                                        key={att.ref}
                                        src={att.ref}
                                        alt={att.name}
                                        className="max-h-20 rounded border cursor-pointer object-cover"
                                        onClick={() => window.open(att.ref)}
                                        onKeyDown={(e) =>
                                          e.key === "Enter" &&
                                          window.open(att.ref)
                                        }
                                        title={att.name}
                                      />
                                    ) : (
                                      <a
                                        key={att.ref}
                                        href={att.ref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-blue-600 underline flex items-center gap-1"
                                      >
                                        <FileText className="w-3 h-3" />
                                        {att.name}
                                      </a>
                                    ),
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  {inventoryPurchases.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center py-8 text-sm text-muted-foreground"
                        data-ocid="inventory.purchases.empty_state"
                      >
                        No purchase records yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Item Dialog */}
      <Dialog
        open={editItemDialog}
        onOpenChange={(v) => {
          if (!v) {
            setEditItemDialog(false);
            setEditingItem(null);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Material</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (isEditSaving) return;
              if (!editingItem || !editingItem.name.trim()) {
                toast.error("Name is required");
                return;
              }
              setIsEditSaving(true);
              try {
                const result = await updateInventoryItemRemote(editingItem.id, {
                  name: editingItem.name.trim(),
                  unit: editingItem.unit,
                  reorderLevel: editingItem.reorderLevel
                    ? Number(editingItem.reorderLevel)
                    : undefined,
                  unitCost: editingItem.unitCost
                    ? Number(editingItem.unitCost)
                    : undefined,
                  estimatedPrice: editingItem.estimatedPrice
                    ? Number(editingItem.estimatedPrice)
                    : undefined,
                  category: editingItem.category,
                  brand: editingItem.brand.trim() || undefined,
                  shade: editingItem.shade.trim() || undefined,
                  ralCode: editingItem.ralCode.trim() || undefined,
                  finish: editingItem.finish.trim() || undefined,
                  powderType: editingItem.powderType.trim() || undefined,
                  pretreatmentTank:
                    editingItem.pretreatmentTank.trim() || undefined,
                });
                if (result.status === "unauthenticated") {
                  toast.error("Sign in required to update inventory items");
                  return;
                }
                if (result.status === "error" || result.status === "denied") {
                  toast.error(
                    result.error || "Failed to update inventory item",
                  );
                  return;
                }
                if (!result.data) return;
                updateInventoryItem(result.data);
                toast.success("Material updated");
                setEditItemDialog(false);
                setEditingItem(null);
              } finally {
                setIsEditSaving(false);
              }
            }}
          >
            {editingItem && (
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Material Name</Label>
                  <Input
                    value={editingItem.name}
                    onChange={(e) =>
                      setEditingItem((p) =>
                        p ? { ...p, name: e.target.value } : p,
                      )
                    }
                    data-ocid="inventory.edit.name.input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Unit</Label>
                  <Select
                    value={editingItem.unit}
                    onValueChange={(v) =>
                      setEditingItem((p) => (p ? { ...p, unit: v } : p))
                    }
                  >
                    <SelectTrigger data-ocid="inventory.edit.unit.select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Category</Label>
                  <Select
                    value={editingItem.category}
                    onValueChange={(v) =>
                      setEditingItem((p) =>
                        p ? { ...p, category: v as InventoryItemCategory } : p,
                      )
                    }
                  >
                    <SelectTrigger data-ocid="inventory.edit.category.select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {editingItem.category === "powder_coating_powder" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Brand</Label>
                      <Input
                        value={editingItem.brand}
                        onChange={(e) =>
                          setEditingItem((p) =>
                            p ? { ...p, brand: e.target.value } : p,
                          )
                        }
                        data-ocid="inventory.edit.brand.input"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Shade</Label>
                      <Input
                        value={editingItem.shade}
                        onChange={(e) =>
                          setEditingItem((p) =>
                            p ? { ...p, shade: e.target.value } : p,
                          )
                        }
                        data-ocid="inventory.edit.shade.input"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">RAL Code</Label>
                      <Input
                        value={editingItem.ralCode}
                        onChange={(e) =>
                          setEditingItem((p) =>
                            p ? { ...p, ralCode: e.target.value } : p,
                          )
                        }
                        data-ocid="inventory.edit.ral_code.input"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Finish</Label>
                      <Input
                        value={editingItem.finish}
                        onChange={(e) =>
                          setEditingItem((p) =>
                            p ? { ...p, finish: e.target.value } : p,
                          )
                        }
                        data-ocid="inventory.edit.finish.input"
                      />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label className="text-xs">Powder Type</Label>
                      <Input
                        value={editingItem.powderType}
                        onChange={(e) =>
                          setEditingItem((p) =>
                            p ? { ...p, powderType: e.target.value } : p,
                          )
                        }
                        data-ocid="inventory.edit.powder_type.input"
                      />
                    </div>
                  </div>
                )}
                {editingItem.category === "pretreatment_chemical" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Pretreatment Tank</Label>
                    <Input
                      placeholder="e.g. Degreasing Tank 1"
                      value={editingItem.pretreatmentTank}
                      onChange={(e) =>
                        setEditingItem((p) =>
                          p ? { ...p, pretreatmentTank: e.target.value } : p,
                        )
                      }
                      data-ocid="inventory.edit.pretreatment_tank.input"
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs">Reorder Level</Label>
                  <Input
                    type="number"
                    value={editingItem.reorderLevel}
                    onChange={(e) =>
                      setEditingItem((p) =>
                        p ? { ...p, reorderLevel: e.target.value } : p,
                      )
                    }
                    data-ocid="inventory.edit.reorder_level.input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Unit Cost (₹)</Label>
                  <Input
                    type="number"
                    value={editingItem.unitCost}
                    onChange={(e) =>
                      setEditingItem((p) =>
                        p ? { ...p, unitCost: e.target.value } : p,
                      )
                    }
                    data-ocid="inventory.edit.unit_cost.input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Estimated Price (₹)</Label>
                  <Input
                    type="number"
                    value={editingItem.estimatedPrice}
                    onChange={(e) =>
                      setEditingItem((p) =>
                        p ? { ...p, estimatedPrice: e.target.value } : p,
                      )
                    }
                    data-ocid="inventory.edit.estimated_price.input"
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditItemDialog(false);
                  setEditingItem(null);
                }}
                data-ocid="inventory.edit.cancel_button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isEditSaving}
                data-ocid="inventory.edit.save_button"
              >
                {isEditSaving ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Material Detail Drawer */}
      <MaterialDetailDrawer
        item={selectedMaterial}
        onClose={() => setSelectedMaterial(null)}
      />

      {/* Add Material Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Material to Inventory</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAddItem();
            }}
          >
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Material Name</Label>
                <Input
                  placeholder="e.g. MS Sheet 3mm"
                  value={newItem.name}
                  onChange={(e) =>
                    setNewItem((p) => ({ ...p, name: e.target.value }))
                  }
                  data-ocid="inventory.add.input"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Select
                  value={newItem.unit}
                  onValueChange={(v) => setNewItem((p) => ({ ...p, unit: v }))}
                >
                  <SelectTrigger data-ocid="inventory.add.select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={newItem.category}
                  onValueChange={(v) =>
                    setNewItem((p) => ({
                      ...p,
                      category: v as InventoryItemCategory,
                    }))
                  }
                >
                  <SelectTrigger data-ocid="inventory.add.category.select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {newItem.category === "powder_coating_powder" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Brand</Label>
                    <Input
                      value={newItem.brand}
                      onChange={(e) =>
                        setNewItem((p) => ({ ...p, brand: e.target.value }))
                      }
                      data-ocid="inventory.add.brand.input"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Shade</Label>
                    <Input
                      value={newItem.shade}
                      onChange={(e) =>
                        setNewItem((p) => ({ ...p, shade: e.target.value }))
                      }
                      data-ocid="inventory.add.shade.input"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">RAL Code</Label>
                    <Input
                      value={newItem.ralCode}
                      onChange={(e) =>
                        setNewItem((p) => ({ ...p, ralCode: e.target.value }))
                      }
                      data-ocid="inventory.add.ral_code.input"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Finish</Label>
                    <Input
                      value={newItem.finish}
                      onChange={(e) =>
                        setNewItem((p) => ({ ...p, finish: e.target.value }))
                      }
                      data-ocid="inventory.add.finish.input"
                    />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-xs">Powder Type</Label>
                    <Input
                      value={newItem.powderType}
                      onChange={(e) =>
                        setNewItem((p) => ({
                          ...p,
                          powderType: e.target.value,
                        }))
                      }
                      data-ocid="inventory.add.powder_type.input"
                    />
                  </div>
                </div>
              )}
              {newItem.category === "pretreatment_chemical" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Pretreatment Tank</Label>
                  <Input
                    placeholder="e.g. Degreasing Tank 1"
                    value={newItem.pretreatmentTank}
                    onChange={(e) =>
                      setNewItem((p) => ({
                        ...p,
                        pretreatmentTank: e.target.value,
                      }))
                    }
                    data-ocid="inventory.add.pretreatment_tank.input"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddDialog(false)}
                data-ocid="inventory.add.cancel_button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isAddSaving}
                data-ocid="inventory.add.submit_button"
              >
                {isAddSaving ? "Saving..." : "Add Material"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Purchase Dialog */}
      <Dialog
        open={purchaseDialog}
        onOpenChange={(open) => {
          if (!open) closePurchaseDialog();
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editingPurchase ? "Edit Purchase" : "Record Purchase"}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAddPurchase();
            }}
          >
            {purchaseTarget && (
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-sm">
                  <Archive className="w-4 h-4 text-primary" />
                  <span className="font-medium">{purchaseTarget.name}</span>
                  <span className="ml-auto text-muted-foreground text-xs">
                    Current: {purchaseTarget.quantityAvailable}{" "}
                    {purchaseTarget.unit}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Qty Purchased *</Label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="0"
                      value={purchaseForm.quantityPurchased}
                      onChange={(e) =>
                        setPurchaseForm((p) => ({
                          ...p,
                          quantityPurchased: e.target.value,
                        }))
                      }
                      data-ocid="inventory.purchase.qty.input"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Unit Cost (₹) *</Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={purchaseForm.unitCost}
                      onChange={(e) =>
                        setPurchaseForm((p) => ({
                          ...p,
                          unitCost: e.target.value,
                        }))
                      }
                      data-ocid="inventory.purchase.input"
                    />
                  </div>
                </div>
                {/* GST Section */}
                <div className="space-y-2 p-2 rounded-md bg-muted/30 border border-border">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="applyGST"
                      checked={purchaseForm.applyGST}
                      onCheckedChange={(v) =>
                        setPurchaseForm((p) => ({ ...p, applyGST: !!v }))
                      }
                      data-ocid="inventory.purchase.gst.checkbox"
                    />
                    <Label
                      htmlFor="applyGST"
                      className="text-xs cursor-pointer"
                    >
                      Apply GST
                    </Label>
                    {purchaseForm.applyGST && (
                      <div className="ml-auto flex items-center gap-1.5">
                        <Input
                          type="number"
                          min="0"
                          className="w-20 h-7 text-xs"
                          value={purchaseForm.gstPercent}
                          onChange={(e) =>
                            setPurchaseForm((p) => ({
                              ...p,
                              gstPercent: e.target.value,
                            }))
                          }
                          data-ocid="inventory.purchase.gst.input"
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                    )}
                  </div>
                  {/* Calculated totals */}
                  {(() => {
                    const qty = Number(purchaseForm.quantityPurchased) || 0;
                    const uc = Number(purchaseForm.unitCost) || 0;
                    const sub = qty * uc;
                    const gstPct = purchaseForm.applyGST
                      ? Number(purchaseForm.gstPercent) || 0
                      : 0;
                    const gst = sub * (gstPct / 100);
                    const total = sub + gst;
                    return (
                      <div className="space-y-1 text-xs pt-1 border-t border-border mt-1">
                        <div className="flex justify-between text-muted-foreground">
                          <span>Subtotal</span>
                          <span>
                            ₹
                            {sub.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                        {purchaseForm.applyGST && (
                          <div className="flex justify-between text-muted-foreground">
                            <span>GST ({gstPct}%)</span>
                            <span>
                              ₹
                              {gst.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                              })}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between font-semibold text-foreground">
                          <span>Final Total</span>
                          <span>
                            ₹
                            {total.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Supplier / Vendor</Label>
                  <VendorSelect
                    value={purchaseForm.vendorId || undefined}
                    onChange={(id, name) =>
                      setPurchaseForm((p) => ({
                        ...p,
                        vendorId: id,
                        supplierName: name,
                      }))
                    }
                    placeholder="Select vendor"
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
                  />
                </div>

                {/* Attachments section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5" />
                      Attach Invoices
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => fileInputRef.current?.click()}
                      data-ocid="inventory.purchase.upload_button"
                    >
                      <Plus className="w-3 h-3 mr-1" /> Add Files
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      multiple
                      className="hidden"
                      onChange={handleAttachFiles}
                    />
                  </div>

                  {pendingAttachments.length > 0 && (
                    <div className="space-y-1.5">
                      {pendingAttachments.map((att) => (
                        <div
                          key={att.ref}
                          className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border border-border"
                        >
                          {att.type === "image" ? (
                            <img
                              src={att.ref}
                              alt={att.name}
                              className="h-8 w-8 rounded object-cover shrink-0 border"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded bg-blue-100 dark:bg-blue-950 flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4 text-blue-600" />
                            </div>
                          )}
                          <span className="text-xs flex-1 truncate">
                            {att.name}
                          </span>
                          {att.type === "pdf" && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 shrink-0"
                            >
                              PDF
                            </Badge>
                          )}
                          <button
                            type="button"
                            onClick={() => removeAttachment(att.ref)}
                            className="p-1 rounded hover:bg-muted transition-colors shrink-0"
                            data-ocid="inventory.purchase.attachment.delete_button"
                          >
                            <X className="w-3 h-3 text-muted-foreground" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {pendingAttachments.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      PDF, JPG or PNG — supports multiple files
                    </p>
                  )}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closePurchaseDialog}
                data-ocid="inventory.purchase.cancel_button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPurchaseSaving}
                data-ocid="inventory.purchase.submit_button"
              >
                {isPurchaseSaving
                  ? "Saving..."
                  : editingPurchase
                    ? "Update Purchase"
                    : "Save Purchase"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deletePurchaseRecordTarget}
        onOpenChange={(o) => !o && setDeletePurchaseRecordTarget(null)}
        title="Delete purchase record?"
        description="This will recalculate stock for the affected material."
        onConfirm={async () => {
          const p = deletePurchaseRecordTarget;
          if (!p) return;
          const result = await deleteInventoryPurchaseRemote(
            p.id,
            p.inventoryItemId,
          );
          if (result.status === "unauthenticated") {
            toast.error(
              "Not signed in to the server - purchase was not deleted",
            );
            setDeletePurchaseRecordTarget(null);
            return;
          }
          if (result.status === "denied" || result.status === "error") {
            toast.error(result.error ?? "Could not delete purchase");
            setDeletePurchaseRecordTarget(null);
            return;
          }
          deleteInventoryPurchase(p.id);
          toast.success("Purchase deleted");
          setDeletePurchaseRecordTarget(null);
        }}
      />
    </div>
  );
}
