import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Banknote,
  CheckCircle2,
  ExternalLink,
  History,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import React, { useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import {
  createExpenseFloatRemote,
  createPettyExpenseRemote,
  createPettyExpensesBatchRemote,
  deleteExpenseFloatRemote,
  deletePettyExpenseRemote,
  settleExpenseFloatRemote,
  updateExpenseFloatRemote,
  updatePettyExpenseRemote,
} from "../lib/expenseFloatsApi";
import { createInventoryPurchaseRemote } from "../lib/inventoryPurchasesApi";
import { createVendorRemote } from "../lib/vendorsApi";
import { canView, hasPermission } from "../permissions";
import { resolveFloatLink, useStore } from "../store";
import type {
  CourierServiceProvider,
  ExpenseFloat,
  PettyExpense,
  PettyExpenseMode,
  PettyExpenseType,
  PurchasedItemAttachment,
  ServiceType,
  VehicleExpenseType,
  Vendor,
} from "../types";

const EXPENSE_TYPES: PettyExpenseType[] = [
  "Material",
  "Tools",
  "Labour",
  "Maintenance",
  "Food",
  "Transport",
  "Misc",
  "Inventory Purchase",
  "Machine Service",
  "Vehicle Expense",
  "Employee Personal Expense",
  "Courier / Delivery",
];

const EXPENSE_MODES: PettyExpenseMode[] = [
  "Company Expense",
  "Personal Expense",
];

const SERVICE_TYPES: ServiceType[] = [
  "Preventive",
  "Corrective",
  "Breakdown",
  "Calibration",
  "AMC",
  "Inspection",
  "Other",
];

const VEHICLE_EXPENSE_TYPES: VehicleExpenseType[] = [
  "Fuel",
  "Service",
  "Repairs",
  "Insurance",
  "Registration",
  "Tyres",
];

const COURIER_PROVIDERS: CourierServiceProvider[] = [
  "Rapido",
  "Porter",
  "Courier",
  "Delivery",
];

/** Declares, per category, which Purchased Item fields to show and whether
 * this is a whole-item Amount (quantity forced to 1) rather than a real
 * Quantity × Unit Price line — so the Settle dialog's item form is
 * data-driven instead of a long if/else chain. */
interface CategoryFieldConfig {
  showQtyPrice: boolean;
  /** Whether the free-text Item Name field applies to this category.
   * False only for Inventory Purchase, where the selected Inventory Item
   * is itself the name — typing it again would just be duplicate entry. */
  showItemName?: boolean;
  showInventoryItem?: boolean;
  showMachine?: boolean;
  showVehicleType?: boolean;
  showCourierFields?: boolean;
}
const CATEGORY_FIELDS: Record<PettyExpenseType, CategoryFieldConfig> = {
  Material: { showQtyPrice: true, showItemName: true },
  Tools: { showQtyPrice: true, showItemName: true },
  Labour: { showQtyPrice: true, showItemName: true },
  Maintenance: { showQtyPrice: true, showItemName: true },
  Food: { showQtyPrice: true, showItemName: true },
  Transport: { showQtyPrice: true, showItemName: true },
  Misc: { showQtyPrice: true, showItemName: true },
  "Inventory Purchase": {
    showQtyPrice: true,
    showItemName: false,
    showInventoryItem: true,
  },
  "Machine Service": { showQtyPrice: false, showMachine: true },
  "Vehicle Expense": { showQtyPrice: false, showVehicleType: true },
  "Employee Personal Expense": { showQtyPrice: false },
  "Courier / Delivery": { showQtyPrice: false, showCourierFields: true },
};

const fmt = (n: number) =>
  `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

const RELATED_MODULES = [
  "Petty Expense",
  "Inventory",
  "Machinery",
  "Employee / Payroll",
] as const;
type RelatedModule = (typeof RELATED_MODULES)[number];

/** Maps a category to the module that owns its operational record. Vehicle
 * Expense stays "Petty Expense" until a Vehicle Management module exists —
 * there's nowhere else for it to live yet. */
function getRelatedModule(expenseType: PettyExpenseType): RelatedModule {
  switch (expenseType) {
    case "Inventory Purchase":
      return "Inventory";
    case "Machine Service":
      return "Machinery";
    case "Employee Personal Expense":
      return "Employee / Payroll";
    default:
      return "Petty Expense";
  }
}

const HISTORY_STATUSES = [
  "Recorded",
  "Added to Stock",
  "Not Added to Stock",
  "Recovered",
  "Outstanding",
] as const;
type HistoryStatus = (typeof HISTORY_STATUSES)[number];

/** Derives a lightweight lifecycle status per row — purely a read of
 * fields already on the record, never a stored/mutable value. */
function getHistoryStatus(expense: PettyExpense): {
  label: HistoryStatus;
  tone: "default" | "success" | "warning";
} {
  if (expense.expenseType === "Inventory Purchase") {
    return expense.addedToInventory
      ? { label: "Added to Stock", tone: "success" }
      : { label: "Not Added to Stock", tone: "warning" };
  }
  if (expense.expenseType === "Employee Personal Expense") {
    return expense.recoveredInSalaryPaymentId
      ? { label: "Recovered", tone: "success" }
      : { label: "Outstanding", tone: "warning" };
  }
  return { label: "Recorded", tone: "default" };
}

/** Vendor picker for the Settle dialog's Purchased Item form — reuses the
 * Vendors module as the single source of truth instead of a free-text
 * field, with an inline "+ Add New Vendor" escape hatch (mirrors the same
 * pattern already used in ProjectDetail.tsx's SentToSelect). */
function VendorSelect({
  vendors,
  addVendor,
  vendorId,
  vendorName,
  onChange,
}: {
  vendors: Vendor[];
  addVendor: (v: Vendor) => void;
  vendorId: string;
  vendorName: string;
  onChange: (id: string, name: string) => void;
}) {
  const { currentUser } = useAuth();
  // Phase 21A — this file already has a local `canCreate` bound to
  // petty_expenses.create (see PettyExpensesInner below); this is a
  // separate, differently-named check for the vendors.create permission
  // that actually gates this quick-add.
  const canCreateVendor = hasPermission(currentUser, "vendors.create");

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [isSavingVendor, setIsSavingVendor] = useState(false);

  const handleSelect = (val: string) => {
    if (val === "__add_new__") {
      if (!canCreateVendor) return;
      setNewVendorName("");
      setAddModalOpen(true);
      return;
    }
    if (val === "__none__") {
      onChange("", "");
      return;
    }
    const v = vendors.find((x) => x.id === val);
    if (v) onChange(v.id, v.name);
  };

  const handleAddVendor = async () => {
    // Phase 21A — defensive re-check, mirrors the trigger-hiding gate
    // below.
    if (!canCreateVendor) {
      toast.error("You do not have permission to add vendors");
      return;
    }
    if (!newVendorName.trim()) return;
    const existing = vendors.find(
      (v) => v.name.trim().toLowerCase() === newVendorName.trim().toLowerCase(),
    );
    if (existing) {
      onChange(existing.id, existing.name);
      setAddModalOpen(false);
      setNewVendorName("");
      return;
    }
    if (isSavingVendor) return;
    setIsSavingVendor(true);
    try {
      // Phase 21A — remote-first, same contract as Vendors.tsx.
      const result = await createVendorRemote({
        name: newVendorName.trim(),
        phone: "",
        address: "",
      });
      if (result.status === "unauthenticated") {
        toast.error("Not signed in to the server - vendor was not saved");
        return;
      }
      if (result.status === "denied" || result.status === "error") {
        toast.error(result.error ?? "Could not save vendor");
        return;
      }
      if (!result.data) {
        toast.error("Could not save vendor");
        return;
      }
      addVendor(result.data);
      onChange(result.data.id, result.data.name);
      setAddModalOpen(false);
      setNewVendorName("");
    } finally {
      setIsSavingVendor(false);
    }
  };

  return (
    <>
      <Select value={vendorId || "__none__"} onValueChange={handleSelect}>
        <SelectTrigger
          className="col-span-2 w-full"
          data-ocid="petty-expenses.settle.vendor_select"
        >
          <SelectValue placeholder="Vendor (optional)">
            {vendorId ? (
              vendorName
            ) : (
              <span className="text-muted-foreground">Vendor (optional)</span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">— No vendor —</SelectItem>
          {vendors.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {v.name}
            </SelectItem>
          ))}
          {canCreateVendor && (
            <div className="border-t border-border mt-1 pt-1">
              <SelectItem
                value="__add_new__"
                className="text-primary font-medium"
              >
                + Add New Vendor
              </SelectItem>
            </div>
          )}
        </SelectContent>
      </Select>

      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Vendor</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label className="text-xs">Vendor Name *</Label>
            <Input
              value={newVendorName}
              onChange={(e) => setNewVendorName(e.target.value)}
              placeholder="Vendor name"
              data-ocid="petty-expenses.settle.new_vendor_name"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAddModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleAddVendor}
              disabled={isSavingVendor}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

class PettyExpenseErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center">
          <h2 className="text-lg font-semibold mb-2">
            Petty Expenses failed to load
          </h2>
          <p className="text-muted-foreground mb-4">
            There was a rendering error. Please refresh.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="px-4 py-2 bg-primary text-primary-foreground rounded"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function PettyExpensesInner({
  onViewInventoryPurchase,
  onViewMachineService,
  onViewEmployeeRecord,
}: PettyExpensesProps) {
  const {
    pettyExpenses,
    addPettyExpense,
    addPettyExpensesBatch,
    updatePettyExpense,
    deletePettyExpense,
    employees,
    projects,
    expenseFloats,
    addExpenseFloat,
    updateExpenseFloat,
    deleteExpenseFloat,
    floatCounter,
    inventoryItems,
    addInventoryPurchase,
    inventoryPurchases,
    machines,
    addServiceRecord,
    serviceRecords,
    vendors,
    addVendor,
  } = useStore();
  const { currentUser } = useAuth();

  const canCreate = hasPermission(currentUser, "petty_expenses.create");
  const canEdit = hasPermission(currentUser, "petty_expenses.edit");
  const canDelete = hasPermission(currentUser, "petty_expenses.delete");
  const canIssueFloat = hasPermission(currentUser, "expense_float.create");
  const canSettleFloat = hasPermission(currentUser, "expense_float.settle");
  const canDeleteFloat = hasPermission(currentUser, "expense_float.delete");

  // Fix 1: emptyForm with safe defaults (amount=0, not "")
  const emptyForm = () => ({
    date: new Date().toISOString().split("T")[0],
    employeeId: "",
    amount: 0 as string | number,
    expenseType: "Misc" as PettyExpenseType,
    expenseMode: "Company Expense" as PettyExpenseMode,
    projectId: "",
    floatId: "",
    notes: "",
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PettyExpense | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Expense Float state
  const emptyFloatForm = () => ({
    employeeId: "",
    issuedDate: new Date().toISOString().split("T")[0],
    issuedAmount: 0 as number,
    purpose: "",
    notes: "",
    projectId: "",
  });
  const [floatDialogOpen, setFloatDialogOpen] = useState(false);
  const [floatForm, setFloatForm] = useState(emptyFloatForm());
  const [editingFloat, setEditingFloat] = useState<ExpenseFloat | null>(null);
  const [isSavingFloat, setIsSavingFloat] = useState(false);
  const [settleDialogOpen, setSettleDialogOpen] = useState(false);
  const [settleTargetId, setSettleTargetId] = useState<string>("");
  const [settleForm, setSettleForm] = useState({
    returnedAmount: 0,
    notes: "",
  });

  // Itemized "Purchased Items" for the Settle dialog — nothing here is
  // persisted until "Finish Settlement"; removing an item or hitting
  // Cancel is a free no-op.
  interface SettleItemDraft {
    tempId: string;
    itemName: string;
    expenseType: PettyExpenseType;
    quantity: number;
    unitPrice: number;
    vendor: string;
    vendorId: string;
    billNumber: string;
    notes: string;
    attachments: PurchasedItemAttachment[];
    projectId: string;
    inventoryItemId: string;
    addedToInventory: boolean;
    machineId: string;
    serviceType: ServiceType;
    vehicleExpenseType: VehicleExpenseType;
    serviceProviderType: CourierServiceProvider;
    pickupLocation: string;
    dropLocation: string;
  }
  const emptyItemForm = (defaultProjectId = "") => ({
    itemName: "",
    expenseType: "Misc" as PettyExpenseType,
    quantity: 1 as number,
    unitPrice: 0 as number,
    vendor: "",
    vendorId: "",
    billNumber: "",
    notes: "",
    projectId: defaultProjectId,
    inventoryItemId: "",
    addedToInventory: true,
    machineId: "",
    serviceType: "Other" as ServiceType,
    vehicleExpenseType: "Fuel" as VehicleExpenseType,
    serviceProviderType: "Rapido" as CourierServiceProvider,
    pickupLocation: "",
    dropLocation: "",
  });
  const [settleItems, setSettleItems] = useState<SettleItemDraft[]>([]);
  const [itemForm, setItemForm] = useState(emptyItemForm());
  const [itemAttachments, setItemAttachments] = useState<
    PurchasedItemAttachment[]
  >([]);
  const itemFileInputRef = useRef<HTMLInputElement>(null);
  const [previewAttachments, setPreviewAttachments] = useState<
    PurchasedItemAttachment[] | null
  >(null);
  const [previewIndex, setPreviewIndex] = useState(0);

  // Fix 7: Reset form BEFORE opening modal
  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setErrors({});
    setDialogOpen(true);
  };

  const openEdit = (e: PettyExpense) => {
    setEditing(e);
    setForm({
      date: e.date,
      employeeId: e.employeeId,
      amount: e.amount,
      expenseType: e.expenseType,
      expenseMode: e.expenseMode,
      projectId: e.projectId || "",
      floatId: e.floatId || "",
      notes: e.notes || "",
    });
    setErrors({});
    setDialogOpen(true);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.employeeId) errs.employeeId = "Employee is required";
    if (!form.amount || Number(form.amount) <= 0)
      errs.amount = "Amount must be greater than 0";
    if (!form.expenseMode) errs.expenseMode = "Expense mode is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    if (isSaving) return;
    setIsSaving(true);
    try {
      // Same validation the old local action applied before persisting:
      // a floatId only sticks if that float still belongs to this
      // employee and isn't already Fully Settled. No DB-enforced
      // equivalent exists for this rule, so it's applied here, before
      // the remote write, exactly as before.
      const floatId = resolveFloatLink(
        form.floatId || undefined,
        form.employeeId,
        expenseFloats || [],
      );
      const expenseMode = floatId ? "Company Expense" : form.expenseMode;

      if (editing) {
        const result = await updatePettyExpenseRemote({
          id: editing.id,
          date: form.date,
          employeeId: form.employeeId,
          amount: Number(form.amount),
          expenseType: form.expenseType,
          expenseMode,
          projectId: form.projectId || undefined,
          floatId,
          notes: form.notes || undefined,
        });
        if (result.status === "unauthenticated") {
          toast.error("Not signed in to the server - expense was not saved");
          return;
        }
        if (result.status === "denied" || result.status === "error") {
          toast.error(result.error ?? "Could not save expense");
          return;
        }
        if (!result.data) {
          toast.error("Could not save expense");
          return;
        }
        updatePettyExpense(result.data);
        toast.success("Expense updated");
      } else {
        const result = await createPettyExpenseRemote({
          date: form.date,
          employeeId: form.employeeId,
          amount: Number(form.amount),
          expenseType: form.expenseType,
          expenseMode,
          projectId: form.projectId || undefined,
          floatId,
          notes: form.notes || undefined,
        });
        if (result.status === "unauthenticated") {
          toast.error("Not signed in to the server - expense was not created");
          return;
        }
        if (result.status === "denied" || result.status === "error") {
          toast.error(result.error ?? "Could not create expense");
          return;
        }
        if (!result.data) {
          toast.error("Could not create expense");
          return;
        }
        addPettyExpense(result.data);
        toast.success("Expense added");
      }
      setDialogOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const result = await deletePettyExpenseRemote(id);
    if (result.status === "unauthenticated") {
      toast.error("Not signed in to the server - expense was not deleted");
      return;
    }
    if (result.status === "denied" || result.status === "error") {
      toast.error(result.error ?? "Could not delete expense");
      return;
    }
    deletePettyExpense(id);
    toast.success("Expense deleted");
  };

  const openAttachmentPreview = (attachments: PurchasedItemAttachment[]) => {
    setPreviewIndex(0);
    setPreviewAttachments(attachments);
  };

  // Summary calculations
  const totalCompany = (pettyExpenses || [])
    .filter((e) => e.expenseMode === "Company Expense")
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const totalPersonal = (pettyExpenses || [])
    .filter((e) => e.expenseMode === "Personal Expense")
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  // Employee balance calculations — a live read of Expense Floats + linked
  // Expense Records, not the legacy AdvanceRecord/Salary-Advance data.
  const employeeBalances = (employees || [])
    .map((emp) => {
      const empExpenses = (pettyExpenses || []).filter(
        (e) => e.employeeId === emp.id,
      );
      const cashHeld = (expenseFloats || [])
        .filter((f) => f.employeeId === emp.id && f.status !== "Fully Settled")
        .reduce((s, f) => s + f.balanceAmount, 0);
      const companySpent = empExpenses
        .filter((e) => e.expenseMode === "Company Expense")
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const personalDue = empExpenses
        .filter((e) => e.expenseMode === "Personal Expense")
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);
      return {
        employee: emp,
        cashHeld,
        companySpent,
        personalDue,
      };
    })
    .filter(
      (eb) => eb.cashHeld > 0 || eb.companySpent > 0 || eb.personalDue > 0,
    );

  const getEmployeeName = (id: string) =>
    (employees || []).find((e) => e.id === id)?.name ?? "Unknown";

  const getProjectName = (id?: string) =>
    id ? ((projects || []).find((p) => p.id === id)?.projectName ?? id) : "";

  // Float handlers
  const openIssueFloat = () => {
    setEditingFloat(null);
    setFloatForm(emptyFloatForm());
    setFloatDialogOpen(true);
  };

  const openEditFloat = (f: ExpenseFloat) => {
    setEditingFloat(f);
    setFloatForm({
      employeeId: f.employeeId,
      issuedDate: f.issuedDate,
      issuedAmount: f.issuedAmount,
      purpose: f.purpose || "",
      notes: f.notes || "",
      projectId: f.projectId || "",
    });
    setFloatDialogOpen(true);
  };

  const handleSaveFloat = async () => {
    if (!floatForm.employeeId) {
      toast.error("Select employee");
      return;
    }
    if (!floatForm.issuedAmount || Number(floatForm.issuedAmount) <= 0) {
      toast.error("Enter issued amount");
      return;
    }
    if (isSavingFloat) return;
    setIsSavingFloat(true);
    try {
      if (editingFloat) {
        const result = await updateExpenseFloatRemote({
          id: editingFloat.id,
          employeeId: floatForm.employeeId,
          issuedDate: floatForm.issuedDate,
          issuedAmount: Number(floatForm.issuedAmount),
          purpose: floatForm.purpose || undefined,
          notes: floatForm.notes || undefined,
          projectId: floatForm.projectId || undefined,
        });
        if (result.status === "unauthenticated") {
          toast.error("Not signed in to the server - float was not saved");
          return;
        }
        if (result.status === "denied" || result.status === "error") {
          toast.error(result.error ?? "Could not save float");
          return;
        }
        if (!result.data) {
          toast.error("Could not save float");
          return;
        }
        updateExpenseFloat({
          ...result.data,
          issuedBy: editingFloat.issuedBy,
        });
        toast.success("Float updated");
      } else {
        // First-guess number from the local counter, purely for UX -
        // createExpenseFloatRemote's bounded retry recomputes from live
        // server state on any real collision.
        const num = (floatCounter || 0) + 1;
        const floatNo = `FLT-${new Date().getFullYear()}-${String(num).padStart(3, "0")}`;
        const result = await createExpenseFloatRemote({
          floatNo,
          employeeId: floatForm.employeeId,
          issuedDate: floatForm.issuedDate,
          issuedAmount: Number(floatForm.issuedAmount),
          purpose: floatForm.purpose || undefined,
          notes: floatForm.notes || undefined,
          projectId: floatForm.projectId || undefined,
        });
        if (result.status === "unauthenticated") {
          toast.error("Not signed in to the server - float was not created");
          return;
        }
        if (result.status === "denied" || result.status === "error") {
          toast.error(result.error ?? "Could not create float");
          return;
        }
        if (!result.data) {
          toast.error("Could not create float");
          return;
        }
        addExpenseFloat({
          ...result.data,
          issuedBy: currentUser?.username ?? "system",
        });
        toast.success("Expense float issued");
      }
      setFloatDialogOpen(false);
    } finally {
      setIsSavingFloat(false);
    }
  };

  const openSettle = (id: string) => {
    const f = (expenseFloats || []).find((x) => x.id === id);
    setSettleTargetId(id);
    setSettleForm({ returnedAmount: 0, notes: "" });
    setSettleItems([]);
    setItemForm(emptyItemForm(f?.projectId || ""));
    setItemAttachments([]);
    setSettleDialogOpen(true);
  };

  const handleAddItem = () => {
    const fields = CATEGORY_FIELDS[itemForm.expenseType];
    if (fields.showItemName !== false && !itemForm.itemName.trim()) {
      toast.error("Enter an item name");
      return;
    }
    if (fields.showQtyPrice && (!itemForm.quantity || itemForm.quantity <= 0)) {
      toast.error("Quantity must be greater than 0");
      return;
    }
    if (!itemForm.unitPrice || itemForm.unitPrice <= 0) {
      toast.error(
        fields.showQtyPrice
          ? "Unit price must be greater than 0"
          : "Amount must be greater than 0",
      );
      return;
    }
    if (fields.showInventoryItem && !itemForm.inventoryItemId) {
      toast.error("Select an Inventory Item");
      return;
    }
    if (fields.showMachine && !itemForm.machineId) {
      toast.error("Select a Machine");
      return;
    }
    setSettleItems((items) => [
      ...items,
      {
        tempId: `item-${Date.now()}`,
        ...itemForm,
        quantity: fields.showQtyPrice ? itemForm.quantity : 1,
        attachments: itemAttachments,
      },
    ]);
    setItemForm(emptyItemForm(itemForm.projectId));
    setItemAttachments([]);
  };

  const handleRemoveItem = (tempId: string) => {
    setSettleItems((items) => items.filter((i) => i.tempId !== tempId));
  };

  const handleItemFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setItemAttachments((atts) => [
        ...atts,
        {
          id: crypto.randomUUID(),
          fileName: file.name,
          fileMimeType: file.type,
          fileData: ev.target?.result as string,
          uploadedAt: Date.now(),
        },
      ]);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveItemAttachment = (id: string) => {
    setItemAttachments((atts) => atts.filter((a) => a.id !== id));
  };

  const settleTotalSpent = settleItems.reduce(
    (s, i) => s + i.quantity * i.unitPrice,
    0,
  );

  const [isSettling, setIsSettling] = useState(false);

  const handleFinishSettlement = async () => {
    if (isSettling) return;
    const f = (expenseFloats || []).find((x) => x.id === settleTargetId);
    if (!f) return;
    const remaining = Math.max(0, f.balanceAmount - settleTotalSpent);
    const returned = Number(settleForm.returnedAmount) || 0;
    if (returned > remaining) {
      toast.error(
        `Returned amount cannot exceed remaining balance (${fmt(remaining)})`,
      );
      return;
    }
    if (settleItems.length === 0 && returned <= 0) {
      toast.error("Add at least one purchased item or a returned amount");
      return;
    }
    const today = new Date().toISOString().split("T")[0];
    setIsSettling(true);
    try {
      if (settleItems.length > 0) {
        const writables = settleItems.map((item) => ({
          date: today,
          employeeId: f.employeeId,
          amount: item.quantity * item.unitPrice,
          expenseType: item.expenseType,
          expenseMode: "Company Expense" as const,
          projectId: item.projectId || f.projectId,
          floatId: f.id,
          notes: item.notes || undefined,
          itemName: item.itemName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          vendor: item.vendor || undefined,
          vendorId: item.vendorId || undefined,
          billNumber: item.billNumber || undefined,
          attachments: item.attachments.length ? item.attachments : undefined,
          inventoryItemId:
            item.expenseType === "Inventory Purchase"
              ? item.inventoryItemId
              : undefined,
          addedToInventory:
            item.expenseType === "Inventory Purchase"
              ? item.addedToInventory
              : undefined,
          machineId:
            item.expenseType === "Machine Service" ? item.machineId : undefined,
          serviceType:
            item.expenseType === "Machine Service"
              ? item.serviceType
              : undefined,
          vehicleExpenseType:
            item.expenseType === "Vehicle Expense"
              ? item.vehicleExpenseType
              : undefined,
          serviceProviderType:
            item.expenseType === "Courier / Delivery"
              ? item.serviceProviderType
              : undefined,
          pickupLocation:
            item.expenseType === "Courier / Delivery"
              ? item.pickupLocation || undefined
              : undefined,
          dropLocation:
            item.expenseType === "Courier / Delivery"
              ? item.dropLocation || undefined
              : undefined,
        }));
        const batchResult = await createPettyExpensesBatchRemote(writables);
        if (batchResult.status === "unauthenticated") {
          toast.error(
            "Not signed in to the server - settlement items were not saved",
          );
          return;
        }
        if (
          batchResult.status === "denied" ||
          batchResult.status === "error" ||
          !batchResult.data
        ) {
          toast.error(batchResult.error ?? "Could not save settlement items");
          return;
        }
        const records = batchResult.data;
        addPettyExpensesBatch(records);

        // Fan out to each category's own owning module, reusing its existing
        // store action — Petty Expense never becomes a second source of
        // truth for stock or service history, it just triggers the update.
        for (let i = 0; i < settleItems.length; i++) {
          const item = settleItems[i];
          const record = records[i];
          if (
            item.expenseType === "Inventory Purchase" &&
            item.addedToInventory &&
            item.inventoryItemId
          ) {
            const result = await createInventoryPurchaseRemote({
              inventoryItemId: item.inventoryItemId,
              materialName: item.itemName,
              quantityPurchased: item.quantity,
              supplierName: item.vendor || "—",
              vendorId: item.vendorId || undefined,
              purchaseDate: today,
              cost: record.amount,
              unitCost: item.unitPrice,
            });
            if (result.status === "unauthenticated") {
              toast.error(
                "Not signed in to the server - inventory purchase was not saved",
              );
            } else if (
              result.status === "denied" ||
              result.status === "error" ||
              !result.data
            ) {
              toast.error(result.error ?? "Could not save inventory purchase");
            } else {
              addInventoryPurchase(result.data);
            }
          } else if (item.expenseType === "Machine Service" && item.machineId) {
            addServiceRecord({
              id: `svc-${record.id}`,
              machineId: item.machineId,
              serviceNumber: `PE-${record.id}`,
              serviceDate: today,
              serviceType: item.serviceType,
              performedBy: item.vendor ? "External Vendor" : "Internal",
              vendorId: item.vendorId || undefined,
              vendorName: item.vendor || undefined,
              serviceCost: record.amount,
              travelCost: 0,
              downtimeHours: 0,
              machineCondition: "Good",
              status: "Completed",
              notes:
                item.notes ||
                `Recorded via Petty Expense float settlement (${f.floatNo}).`,
              createdBy: currentUser?.username ?? "system",
              createdAt: Date.now(),
            });
          }
        }
      }
      if (returned > 0) {
        const newReturnedAmount = f.returnedAmount + returned;
        const settleResult = await settleExpenseFloatRemote(
          settleTargetId,
          newReturnedAmount,
          settleForm.notes,
        );
        if (settleResult.status === "unauthenticated") {
          toast.error(
            "Not signed in to the server - returned amount was not recorded",
          );
          return;
        }
        if (
          settleResult.status === "denied" ||
          settleResult.status === "error"
        ) {
          toast.error(settleResult.error ?? "Could not record returned amount");
          return;
        }
        if (settleResult.data) {
          updateExpenseFloat({ ...settleResult.data, issuedBy: f.issuedBy });
        }
      }
      toast.success("Float settled");
      setSettleDialogOpen(false);
    } finally {
      setIsSettling(false);
    }
  };

  const openFloats = (expenseFloats || []).filter(
    (f) => f.status !== "Fully Settled",
  );
  const totalOpenFloat = openFloats.reduce((s, f) => s + f.balanceAmount, 0);

  // ── History tab ──────────────────────────────────────────────────────
  const [historyDateFrom, setHistoryDateFrom] = useState("");
  const [historyDateTo, setHistoryDateTo] = useState("");
  const [historyEmployeeId, setHistoryEmployeeId] = useState("");
  const [historyCategory, setHistoryCategory] = useState("");
  const [historyVendor, setHistoryVendor] = useState("");
  const [historyProject, setHistoryProject] = useState("");
  const [historyModule, setHistoryModule] = useState("");
  const [historyStatus, setHistoryStatus] = useState("");
  const [historyDetailExpense, setHistoryDetailExpense] =
    useState<PettyExpense | null>(null);

  const canViewMachinery = canView(currentUser, "machinery");
  const canViewEmployees = canView(currentUser, "employees");

  const handleClearHistoryFilters = () => {
    setHistoryDateFrom("");
    setHistoryDateTo("");
    setHistoryEmployeeId("");
    setHistoryCategory("");
    setHistoryVendor("");
    setHistoryProject("");
    setHistoryModule("");
    setHistoryStatus("");
  };

  const historyFilteredExpenses = (pettyExpenses || [])
    .filter((e) => (historyDateFrom ? e.date >= historyDateFrom : true))
    .filter((e) => (historyDateTo ? e.date <= historyDateTo : true))
    .filter((e) =>
      historyEmployeeId ? e.employeeId === historyEmployeeId : true,
    )
    .filter((e) => (historyCategory ? e.expenseType === historyCategory : true))
    .filter((e) => (historyVendor ? e.vendor === historyVendor : true))
    .filter((e) => (historyProject ? e.projectId === historyProject : true))
    .filter((e) =>
      historyModule ? getRelatedModule(e.expenseType) === historyModule : true,
    )
    .filter((e) =>
      historyStatus ? getHistoryStatus(e).label === historyStatus : true,
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    );

  /** Resolves "View Details" per category: categories with a real linked
   * record in the owning module navigate straight there; everything else
   * (including a link that didn't resolve — e.g. "Add to Inventory" was
   * left unchecked, or the record predates Float Settlement) falls back
   * to a plain read-only details dialog. Petty Expense never opens a
   * substitute for the owning module's own detail screen — it only
   * decides whether one exists to jump to. Returns null when there's
   * nothing to navigate to, so callers can both label and route the
   * action off the same check instead of the label promising a jump the
   * click won't make. */
  const resolveHistoryLink = (expense: PettyExpense): (() => void) | null => {
    if (expense.expenseType === "Inventory Purchase") {
      const purchaseId = `invp-${expense.id}`;
      const exists = (inventoryPurchases || []).some(
        (p) => p.id === purchaseId,
      );
      if (exists && onViewInventoryPurchase) {
        return () => onViewInventoryPurchase(purchaseId);
      }
    } else if (expense.expenseType === "Machine Service" && expense.machineId) {
      const serviceId = `svc-${expense.id}`;
      const exists = (serviceRecords || []).some((r) => r.id === serviceId);
      if (exists && canViewMachinery && onViewMachineService) {
        const machineId = expense.machineId;
        return () => onViewMachineService(machineId, serviceId);
      }
    } else if (expense.expenseType === "Employee Personal Expense") {
      if (canViewEmployees && onViewEmployeeRecord) {
        const employeeId = expense.employeeId;
        return () => onViewEmployeeRecord(employeeId);
      }
    }
    return null;
  };

  const handleViewDetails = (expense: PettyExpense) => {
    const link = resolveHistoryLink(expense);
    if (link) {
      link();
      return;
    }
    setHistoryDetailExpense(expense);
  };

  const historyToneClass: Record<string, string> = {
    default: "bg-muted text-muted-foreground hover:bg-muted",
    success: "bg-green-100 text-green-700 hover:bg-green-100",
    warning: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  };

  const historyTabContent = (
    <div className="space-y-4">
      {/* Filters */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              value={historyDateFrom}
              onChange={(e) => setHistoryDateFrom(e.target.value)}
              className="h-8 text-sm"
              data-ocid="petty-expenses.history.filter.date_from.input"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              value={historyDateTo}
              onChange={(e) => setHistoryDateTo(e.target.value)}
              className="h-8 text-sm"
              data-ocid="petty-expenses.history.filter.date_to.input"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Employee</Label>
            <Select
              value={historyEmployeeId || "__all__"}
              onValueChange={(v) =>
                setHistoryEmployeeId(v === "__all__" ? "" : v)
              }
            >
              <SelectTrigger
                className="h-8 text-sm"
                data-ocid="petty-expenses.history.filter.employee.select"
              >
                <SelectValue placeholder="All Employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__" className="text-sm">
                  All Employees
                </SelectItem>
                {(employees || []).map((emp) => (
                  <SelectItem key={emp.id} value={emp.id} className="text-sm">
                    {emp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Category</Label>
            <Select
              value={historyCategory || "__all__"}
              onValueChange={(v) =>
                setHistoryCategory(v === "__all__" ? "" : v)
              }
            >
              <SelectTrigger
                className="h-8 text-sm"
                data-ocid="petty-expenses.history.filter.category.select"
              >
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__" className="text-sm">
                  All Categories
                </SelectItem>
                {EXPENSE_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="text-sm">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Vendor</Label>
            <Select
              value={historyVendor || "__all__"}
              onValueChange={(v) => setHistoryVendor(v === "__all__" ? "" : v)}
            >
              <SelectTrigger
                className="h-8 text-sm"
                data-ocid="petty-expenses.history.filter.vendor.select"
              >
                <SelectValue placeholder="All Vendors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__" className="text-sm">
                  All Vendors
                </SelectItem>
                {(vendors || []).map((v) => (
                  <SelectItem key={v.id} value={v.name} className="text-sm">
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Project</Label>
            <Select
              value={historyProject || "__all__"}
              onValueChange={(v) => setHistoryProject(v === "__all__" ? "" : v)}
            >
              <SelectTrigger
                className="h-8 text-sm"
                data-ocid="petty-expenses.history.filter.project.select"
              >
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__" className="text-sm">
                  All Projects
                </SelectItem>
                {(projects || []).map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-sm">
                    {p.projectName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Related Module</Label>
            <Select
              value={historyModule || "__all__"}
              onValueChange={(v) => setHistoryModule(v === "__all__" ? "" : v)}
            >
              <SelectTrigger
                className="h-8 text-sm"
                data-ocid="petty-expenses.history.filter.module.select"
              >
                <SelectValue placeholder="All Modules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__" className="text-sm">
                  All Modules
                </SelectItem>
                {RELATED_MODULES.map((m) => (
                  <SelectItem key={m} value={m} className="text-sm">
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select
              value={historyStatus || "__all__"}
              onValueChange={(v) => setHistoryStatus(v === "__all__" ? "" : v)}
            >
              <SelectTrigger
                className="h-8 text-sm"
                data-ocid="petty-expenses.history.filter.status.select"
              >
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__" className="text-sm">
                  All Statuses
                </SelectItem>
                {HISTORY_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="text-sm">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClearHistoryFilters}
            data-ocid="petty-expenses.history.clear_filters_button"
          >
            Clear Filters
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="table-wrapper">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Related Module</TableHead>
                  <TableHead className="text-right">View Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyFilteredExpenses.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center text-muted-foreground py-8"
                    >
                      No petty expense transactions match these filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  historyFilteredExpenses.map((expense, idx) => {
                    const status = getHistoryStatus(expense);
                    const module = getRelatedModule(expense.expenseType);
                    const hasLink = resolveHistoryLink(expense) !== null;
                    return (
                      <TableRow
                        key={expense.id}
                        data-ocid={`petty-expenses.history.row.${idx + 1}`}
                      >
                        <TableCell className="text-sm">
                          {expense.date}
                        </TableCell>
                        <TableCell className="font-medium">
                          {getEmployeeName(expense.employeeId)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{expense.expenseType}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {expense.vendor || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {getProjectName(expense.projectId) || "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {fmt(expense.amount)}
                        </TableCell>
                        <TableCell>
                          <Badge className={historyToneClass[status.tone]}>
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{module}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={() => handleViewDetails(expense)}
                            data-ocid={`petty-expenses.history.view_details.${idx + 1}`}
                          >
                            {!hasLink ? (
                              "View Details"
                            ) : (
                              <>
                                <ExternalLink className="w-3 h-3" />
                                {module === "Inventory" &&
                                  "View Inventory Record"}
                                {module === "Machinery" &&
                                  "View Machine History"}
                                {module === "Employee / Payroll" &&
                                  "View Employee Balance"}
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Petty Expenses</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track employee petty cash and expense reimbursements
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canIssueFloat && (
            <Button
              variant="outline"
              onClick={openIssueFloat}
              data-ocid="petty-expenses.header_issue_float_button"
            >
              <Plus className="w-4 h-4 mr-1.5" /> Issue Float
            </Button>
          )}
          {canCreate && (
            <Button
              onClick={openAdd}
              data-ocid="petty-expenses.open_modal_button"
            >
              <Plus className="w-4 h-4 mr-1.5" /> Add Expense
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger
            value="dashboard"
            data-ocid="petty-expenses.tab.dashboard"
          >
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="records" data-ocid="petty-expenses.tab.records">
            Expense Records
          </TabsTrigger>
          <TabsTrigger value="floats" data-ocid="petty-expenses.tab.floats">
            Expense Floats
          </TabsTrigger>
          <TabsTrigger value="balance" data-ocid="petty-expenses.tab.balance">
            Employee Balance
          </TabsTrigger>
          <TabsTrigger value="history" data-ocid="petty-expenses.tab.history">
            <History className="w-3.5 h-3.5" /> History
          </TabsTrigger>
        </TabsList>

        {/* Dashboard */}
        <TabsContent value="dashboard" className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Total Expenses
                </p>
                <p className="text-2xl font-bold mt-1">
                  {fmt(totalCompany + totalPersonal)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {(pettyExpenses || []).length} records
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Company Expenses
                </p>
                <p className="text-2xl font-bold mt-1 text-blue-600">
                  {fmt(totalCompany)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Affects project cost
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Personal Expenses
                </p>
                <p className="text-2xl font-bold mt-1 text-orange-600">
                  {fmt(totalPersonal)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Employee personal due
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Open Floats
                </p>
                <p className="text-2xl font-bold mt-1 text-amber-600">
                  {fmt(totalOpenFloat)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {openFloats.length} unsettled float
                  {openFloats.length !== 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Expense Records */}
        <TabsContent value="records" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Expense Records</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {/* Desktop Table */}
              <div className="hidden md:block table-wrapper">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Float #</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(pettyExpenses || []).length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={9}
                          className="text-center text-muted-foreground py-10"
                          data-ocid="petty-expenses.empty_state"
                        >
                          No expenses recorded yet. Click &quot;Add
                          Expense&quot; to get started.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (pettyExpenses || []).map((expense, idx) => (
                        <TableRow
                          key={expense.id}
                          data-ocid={`petty-expenses.item.${idx + 1}`}
                        >
                          <TableCell className="text-sm">
                            {expense.date}
                          </TableCell>
                          <TableCell className="font-medium">
                            {getEmployeeName(expense.employeeId)}
                          </TableCell>
                          <TableCell className="font-semibold">
                            {fmt(expense.amount)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {expense.expenseType}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                expense.expenseMode === "Company Expense"
                                  ? "bg-blue-100 text-blue-700 hover:bg-blue-100"
                                  : "bg-orange-100 text-orange-700 hover:bg-orange-100"
                              }
                            >
                              {expense.expenseMode}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {(expenseFloats || []).find(
                              (f) => f.id === expense.floatId,
                            )?.floatNo ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {getProjectName(expense.projectId)}
                          </TableCell>
                          <TableCell
                            className="text-sm text-muted-foreground max-w-[180px] truncate"
                            title={expense.notes}
                          >
                            {expense.notes || "-"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-3">
                              {!!expense.attachments?.length && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openAttachmentPreview(expense.attachments!)
                                  }
                                  className="text-muted-foreground hover:text-foreground"
                                  title={`${expense.attachments.length} attachment(s)`}
                                  data-ocid={`petty-expenses.attachments_button.${idx + 1}`}
                                >
                                  <Paperclip className="w-4 h-4" />
                                </button>
                              )}
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => openEdit(expense)}
                                  className="text-muted-foreground hover:text-foreground"
                                  data-ocid={`petty-expenses.edit_button.${idx + 1}`}
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => handleDelete(expense.id)}
                                  className="text-destructive hover:text-destructive/80"
                                  data-ocid={`petty-expenses.delete_button.${idx + 1}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden p-4 space-y-3">
                {(pettyExpenses || []).length === 0 ? (
                  <p
                    className="text-center text-muted-foreground py-6 text-sm"
                    data-ocid="petty-expenses.empty_state"
                  >
                    No expenses recorded yet.
                  </p>
                ) : (
                  (pettyExpenses || []).map((expense, idx) => (
                    <div
                      key={expense.id}
                      className="border rounded-lg p-4 space-y-2"
                      data-ocid={`petty-expenses.item.${idx + 1}`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold">
                            {getEmployeeName(expense.employeeId)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {expense.date}
                          </p>
                        </div>
                        <p className="text-lg font-bold">
                          {fmt(expense.amount)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-xs">
                          {expense.expenseType}
                        </Badge>
                        <Badge
                          className={
                            expense.expenseMode === "Company Expense"
                              ? "bg-blue-100 text-blue-700 hover:bg-blue-100 text-xs"
                              : "bg-orange-100 text-orange-700 hover:bg-orange-100 text-xs"
                          }
                        >
                          {expense.expenseMode}
                        </Badge>
                        {expense.floatId && (
                          <Badge
                            variant="outline"
                            className="text-xs font-mono"
                          >
                            {(expenseFloats || []).find(
                              (f) => f.id === expense.floatId,
                            )?.floatNo ?? "—"}
                          </Badge>
                        )}
                      </div>
                      {(expense.projectId || expense.notes) && (
                        <p className="text-xs text-muted-foreground">
                          {getProjectName(expense.projectId)}
                          {expense.notes && ` — ${expense.notes}`}
                        </p>
                      )}
                      <div className="flex gap-3 pt-1">
                        {!!expense.attachments?.length && (
                          <button
                            type="button"
                            onClick={() =>
                              openAttachmentPreview(expense.attachments!)
                            }
                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                            data-ocid={`petty-expenses.attachments_button.${idx + 1}`}
                          >
                            <Paperclip className="w-3 h-3" />{" "}
                            {expense.attachments.length}
                          </button>
                        )}
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => openEdit(expense)}
                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                            data-ocid={`petty-expenses.edit_button.${idx + 1}`}
                          >
                            <Pencil className="w-3 h-3" /> Edit
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(expense.id)}
                            className="text-xs text-destructive flex items-center gap-1"
                            data-ocid={`petty-expenses.delete_button.${idx + 1}`}
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Employee Balance */}
        <TabsContent value="balance" className="pt-4">
          {employeeBalances.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Employee Balance Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="table-wrapper">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead className="text-right">
                          Cash Currently Held
                        </TableHead>
                        <TableHead className="text-right">
                          Company Spent
                        </TableHead>
                        <TableHead className="text-right">
                          Personal Due
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employeeBalances.map((eb, idx) => (
                        <TableRow
                          key={eb.employee.id}
                          data-ocid={`petty-expenses.row.${idx + 1}`}
                        >
                          <TableCell className="font-medium">
                            {eb.employee.name}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-amber-600">
                            {eb.cashHeld > 0 ? fmt(eb.cashHeld) : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            {fmt(eb.companySpent)}
                          </TableCell>
                          <TableCell className="text-right text-orange-600">
                            {eb.personalDue > 0 ? fmt(eb.personalDue) : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No employee balances to show yet.
            </p>
          )}
        </TabsContent>

        {/* Expense Floats */}
        <TabsContent value="floats" className="pt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-amber-600" />
                  Expense Floats
                </CardTitle>
                {canIssueFloat && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={openIssueFloat}
                    className="gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> Issue Float
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Float #</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead className="text-right">Issued</TableHead>
                    <TableHead className="text-right">Spent</TableHead>
                    <TableHead className="text-right">Returned</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(expenseFloats || []).length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={10}
                        className="text-center text-muted-foreground py-8"
                      >
                        No expense floats issued yet. Click &quot;Issue
                        Float&quot; to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (expenseFloats || []).map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="font-mono text-xs">
                          {f.floatNo}
                        </TableCell>
                        <TableCell className="font-medium">
                          {getEmployeeName(f.employeeId)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {f.issuedDate}
                        </TableCell>
                        <TableCell
                          className="text-sm text-muted-foreground max-w-[140px] truncate"
                          title={f.purpose}
                        >
                          {f.purpose || "-"}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {fmt(f.issuedAmount)}
                        </TableCell>
                        <TableCell className="text-right text-red-600">
                          {fmt(f.spentAmount)}
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          {fmt(f.returnedAmount)}
                        </TableCell>
                        <TableCell className="text-right font-bold text-amber-600">
                          {fmt(f.balanceAmount)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              f.status === "Fully Settled"
                                ? "bg-green-100 text-green-700 hover:bg-green-100"
                                : f.status === "Partially Settled"
                                  ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                                  : "bg-blue-100 text-blue-700 hover:bg-blue-100"
                            }
                          >
                            {f.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            {canSettleFloat && f.status !== "Fully Settled" && (
                              <button
                                type="button"
                                onClick={() => openSettle(f.id)}
                                className="text-amber-600 hover:text-amber-700"
                                title="Settle Float"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                            )}
                            {canIssueFloat && f.status === "Open" && (
                              <button
                                type="button"
                                onClick={() => openEditFloat(f)}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                            {canDeleteFloat && (
                              <button
                                type="button"
                                onClick={async () => {
                                  const result = await deleteExpenseFloatRemote(
                                    f.id,
                                  );
                                  if (result.status === "unauthenticated") {
                                    toast.error(
                                      "Not signed in to the server - float was not deleted",
                                    );
                                    return;
                                  }
                                  if (
                                    result.status === "denied" ||
                                    result.status === "error"
                                  ) {
                                    toast.error(
                                      result.error ?? "Could not delete float",
                                    );
                                    return;
                                  }
                                  deleteExpenseFloat(f.id);
                                  toast.success("Float deleted");
                                }}
                                className="text-destructive hover:text-destructive/80"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="pt-4">
          {historyTabContent}
        </TabsContent>
      </Tabs>

      {/* Issue / Edit Float Dialog */}
      <Dialog open={floatDialogOpen} onOpenChange={setFloatDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingFloat ? "Edit Expense Float" : "Issue Expense Float"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Employee *</Label>
              <Select
                value={floatForm.employeeId}
                onValueChange={(v) =>
                  setFloatForm((f) => ({ ...f, employeeId: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {(employees || []).map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Issue Date *</Label>
                <Input
                  type="date"
                  value={floatForm.issuedDate}
                  onChange={(e) =>
                    setFloatForm((f) => ({ ...f, issuedDate: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Issued Amount (₹) *</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="0"
                  value={floatForm.issuedAmount || ""}
                  onChange={(e) =>
                    setFloatForm((f) => ({
                      ...f,
                      issuedAmount: Number(e.target.value),
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Purpose</Label>
              <Input
                placeholder="e.g. Site transport, material pickup"
                value={floatForm.purpose}
                onChange={(e) =>
                  setFloatForm((f) => ({ ...f, purpose: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Project (optional)</Label>
              <Select
                value={floatForm.projectId || "__none__"}
                onValueChange={(v) =>
                  setFloatForm((f) => ({
                    ...f,
                    projectId: v === "__none__" ? "" : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {(projects || []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.projectName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={floatForm.notes}
                onChange={(e) =>
                  setFloatForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFloatDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveFloat}>
              {editingFloat ? "Update" : "Issue Float"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settle Float Dialog */}
      <Dialog open={settleDialogOpen} onOpenChange={setSettleDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Settle Expense Float</DialogTitle>
          </DialogHeader>
          {(() => {
            const f = (expenseFloats || []).find(
              (x) => x.id === settleTargetId,
            );
            if (!f) return null;
            const remainingFloat = Math.max(
              0,
              f.balanceAmount - settleTotalSpent,
            );
            return (
              <div className="space-y-4 py-2">
                <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Employee:</span>
                    <span className="font-medium">
                      {getEmployeeName(f.employeeId)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Issued:</span>
                    <span>{fmt(f.issuedAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Already spent:
                    </span>
                    <span className="text-red-600">{fmt(f.spentAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Already returned:
                    </span>
                    <span className="text-green-600">
                      {fmt(f.returnedAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                    <span>Balance:</span>
                    <span className="text-amber-600">
                      {fmt(f.balanceAmount)}
                    </span>
                  </div>
                </div>

                {/* Purchased Items */}
                <div className="space-y-2">
                  <Label>Purchased Items</Label>
                  {settleItems.length > 0 && (
                    <div className="space-y-1.5">
                      {settleItems.map((item) => {
                        const itemFields = CATEGORY_FIELDS[item.expenseType];
                        const detailBits = [
                          itemFields.showQtyPrice
                            ? `Qty ${item.quantity} × ${fmt(item.unitPrice)}`
                            : fmt(item.unitPrice),
                          item.vendor || "",
                          itemFields.showMachine
                            ? (machines || []).find(
                                (m) => m.id === item.machineId,
                              )?.name || ""
                            : "",
                          itemFields.showInventoryItem && item.addedToInventory
                            ? "added to inventory"
                            : "",
                          item.attachments.length > 0
                            ? `${item.attachments.length} attachment${item.attachments.length === 1 ? "" : "s"}`
                            : "",
                        ].filter(Boolean);
                        return (
                          <div
                            key={item.tempId}
                            className="flex items-center justify-between gap-2 rounded border p-2 text-sm"
                          >
                            <div className="min-w-0">
                              <p className="font-medium truncate">
                                {item.itemName}{" "}
                                <span className="text-muted-foreground font-normal">
                                  ({item.expenseType})
                                </span>
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {detailBits.join(" — ")}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-semibold">
                                {fmt(item.quantity * item.unitPrice)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(item.tempId)}
                                className="text-destructive hover:text-destructive/80"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
                    <div className="grid grid-cols-2 gap-2">
                      {CATEGORY_FIELDS[itemForm.expenseType].showItemName !==
                        false && (
                        <Input
                          placeholder="Item name"
                          value={itemForm.itemName}
                          onChange={(e) =>
                            setItemForm((s) => ({
                              ...s,
                              itemName: e.target.value,
                            }))
                          }
                          className="col-span-2"
                        />
                      )}
                      <Select
                        value={itemForm.expenseType}
                        onValueChange={(v) =>
                          setItemForm((s) => ({
                            ...emptyItemForm(s.projectId),
                            itemName: s.itemName,
                            vendor: s.vendor,
                            vendorId: s.vendorId,
                            billNumber: s.billNumber,
                            notes: s.notes,
                            expenseType: v as PettyExpenseType,
                          }))
                        }
                      >
                        <SelectTrigger data-ocid="petty-expenses.settle.category_select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EXPENSE_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={itemForm.projectId || "__none__"}
                        onValueChange={(v) =>
                          setItemForm((s) => ({
                            ...s,
                            projectId: v === "__none__" ? "" : v,
                          }))
                        }
                      >
                        <SelectTrigger className="col-span-2">
                          <SelectValue placeholder="Project (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">
                            No project — not costed to a job
                          </SelectItem>
                          {(projects || []).map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.projectName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <VendorSelect
                        vendors={vendors || []}
                        addVendor={addVendor}
                        vendorId={itemForm.vendorId}
                        vendorName={itemForm.vendor}
                        onChange={(id, name) =>
                          setItemForm((s) => ({
                            ...s,
                            vendorId: id,
                            vendor: name,
                          }))
                        }
                      />

                      {CATEGORY_FIELDS[itemForm.expenseType].showQtyPrice ? (
                        <>
                          <Input
                            type="number"
                            min={0}
                            placeholder="Quantity"
                            value={itemForm.quantity || ""}
                            onChange={(e) =>
                              setItemForm((s) => ({
                                ...s,
                                quantity: Number(e.target.value),
                              }))
                            }
                          />
                          <Input
                            type="number"
                            min={0}
                            placeholder="Unit Price (₹)"
                            value={itemForm.unitPrice || ""}
                            onChange={(e) =>
                              setItemForm((s) => ({
                                ...s,
                                unitPrice: Number(e.target.value),
                              }))
                            }
                          />
                        </>
                      ) : (
                        <Input
                          type="number"
                          min={0}
                          placeholder="Amount (₹)"
                          value={itemForm.unitPrice || ""}
                          onChange={(e) =>
                            setItemForm((s) => ({
                              ...s,
                              unitPrice: Number(e.target.value),
                            }))
                          }
                          className="col-span-2"
                        />
                      )}

                      {CATEGORY_FIELDS[itemForm.expenseType]
                        .showInventoryItem && (
                        <>
                          <Select
                            value={itemForm.inventoryItemId || "__none__"}
                            onValueChange={(v) => {
                              const selected =
                                v === "__none__"
                                  ? undefined
                                  : (inventoryItems || []).find(
                                      (it) => it.id === v,
                                    );
                              setItemForm((s) => ({
                                ...s,
                                inventoryItemId: selected ? v : "",
                                itemName: selected ? selected.name : "",
                              }));
                            }}
                          >
                            <SelectTrigger className="col-span-2 w-full">
                              <SelectValue placeholder="Inventory Item *" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__" disabled>
                                Select an item
                              </SelectItem>
                              {(inventoryItems || []).map((it) => (
                                <SelectItem key={it.id} value={it.id}>
                                  {it.name} ({it.quantityAvailable} {it.unit}
                                  {" avail."})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <label
                            htmlFor="pe-settle-add-to-inventory"
                            className="col-span-2 flex items-center gap-2 text-sm"
                          >
                            <Checkbox
                              id="pe-settle-add-to-inventory"
                              checked={itemForm.addedToInventory}
                              onCheckedChange={(v) =>
                                setItemForm((s) => ({
                                  ...s,
                                  addedToInventory: v === true,
                                }))
                              }
                            />
                            Add to Inventory (increases stock)
                          </label>
                        </>
                      )}

                      {CATEGORY_FIELDS[itemForm.expenseType].showMachine && (
                        <>
                          <Select
                            value={itemForm.machineId || "__none__"}
                            onValueChange={(v) =>
                              setItemForm((s) => ({
                                ...s,
                                machineId: v === "__none__" ? "" : v,
                              }))
                            }
                          >
                            <SelectTrigger className="col-span-2 w-full">
                              <SelectValue placeholder="Machine *" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__" disabled>
                                Select a machine
                              </SelectItem>
                              {(machines || []).map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                  {m.name} ({m.machineCode})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={itemForm.serviceType}
                            onValueChange={(v) =>
                              setItemForm((s) => ({
                                ...s,
                                serviceType: v as ServiceType,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SERVICE_TYPES.map((t) => (
                                <SelectItem key={t} value={t}>
                                  {t}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </>
                      )}

                      {CATEGORY_FIELDS[itemForm.expenseType]
                        .showVehicleType && (
                        <Select
                          value={itemForm.vehicleExpenseType}
                          onValueChange={(v) =>
                            setItemForm((s) => ({
                              ...s,
                              vehicleExpenseType: v as VehicleExpenseType,
                            }))
                          }
                        >
                          <SelectTrigger className="col-span-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {VEHICLE_EXPENSE_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {CATEGORY_FIELDS[itemForm.expenseType]
                        .showCourierFields && (
                        <>
                          <Select
                            value={itemForm.serviceProviderType}
                            onValueChange={(v) =>
                              setItemForm((s) => ({
                                ...s,
                                serviceProviderType:
                                  v as CourierServiceProvider,
                              }))
                            }
                          >
                            <SelectTrigger className="col-span-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {COURIER_PROVIDERS.map((t) => (
                                <SelectItem key={t} value={t}>
                                  {t}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            placeholder="Pickup (optional)"
                            value={itemForm.pickupLocation}
                            onChange={(e) =>
                              setItemForm((s) => ({
                                ...s,
                                pickupLocation: e.target.value,
                              }))
                            }
                          />
                          <Input
                            placeholder="Drop (optional)"
                            value={itemForm.dropLocation}
                            onChange={(e) =>
                              setItemForm((s) => ({
                                ...s,
                                dropLocation: e.target.value,
                              }))
                            }
                          />
                        </>
                      )}

                      <Input
                        placeholder="Bill number (optional)"
                        value={itemForm.billNumber}
                        onChange={(e) =>
                          setItemForm((s) => ({
                            ...s,
                            billNumber: e.target.value,
                          }))
                        }
                        className="col-span-2"
                      />
                      <Input
                        placeholder="Notes (optional)"
                        value={itemForm.notes}
                        onChange={(e) =>
                          setItemForm((s) => ({
                            ...s,
                            notes: e.target.value,
                          }))
                        }
                        className="col-span-2"
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        Total: {fmt(itemForm.quantity * itemForm.unitPrice)}
                      </span>
                    </div>
                    {itemAttachments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {itemAttachments.map((a) => (
                          <span
                            key={a.id}
                            className="inline-flex items-center gap-1 rounded bg-background border px-1.5 py-0.5 text-xs"
                          >
                            <Paperclip className="w-3 h-3" />
                            <span className="max-w-[100px] truncate">
                              {a.fileName}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveItemAttachment(a.id)}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <input
                      ref={itemFileInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="hidden"
                      onChange={handleItemFileSelected}
                    />
                    <div className="flex justify-between gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => itemFileInputRef.current?.click()}
                      >
                        <Paperclip className="w-3.5 h-3.5 mr-1" /> Attach
                      </Button>
                      <Button type="button" size="sm" onClick={handleAddItem}>
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add Item
                      </Button>
                    </div>
                  </div>

                  <div className="flex justify-between text-sm font-medium pt-1">
                    <span>Total Spent</span>
                    <span>{fmt(settleTotalSpent)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold">
                    <span>Remaining Float</span>
                    <span className="text-amber-600">
                      {fmt(remainingFloat)}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Returned Amount (₹)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={settleForm.returnedAmount || ""}
                    onChange={(e) =>
                      setSettleForm((s) => ({
                        ...s,
                        returnedAmount: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea
                    rows={2}
                    value={settleForm.notes}
                    onChange={(e) =>
                      setSettleForm((s) => ({ ...s, notes: e.target.value }))
                    }
                  />
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSettleDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleFinishSettlement}
              disabled={isSettling}
            >
              Finish Settlement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Expense Details Dialog — the History tab's fallback for
          Petty-Expense-owned categories, or any row whose deterministic
          link into Inventory/Machinery didn't resolve to a real record. */}
      <Dialog
        open={!!historyDetailExpense}
        onOpenChange={(open) => !open && setHistoryDetailExpense(null)}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Expense Details</DialogTitle>
          </DialogHeader>
          {historyDetailExpense && (
            <div className="space-y-2 text-sm py-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span>{historyDetailExpense.date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Employee</span>
                <span>{getEmployeeName(historyDetailExpense.employeeId)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Category</span>
                <span>{historyDetailExpense.expenseType}</span>
              </div>
              {historyDetailExpense.itemName && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Item</span>
                  <span>{historyDetailExpense.itemName}</span>
                </div>
              )}
              {historyDetailExpense.vendor && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vendor</span>
                  <span>{historyDetailExpense.vendor}</span>
                </div>
              )}
              {historyDetailExpense.quantity !== undefined &&
                historyDetailExpense.unitPrice !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Qty × Price</span>
                    <span>
                      {historyDetailExpense.quantity} ×{" "}
                      {fmt(historyDetailExpense.unitPrice)}
                    </span>
                  </div>
                )}
              {historyDetailExpense.billNumber && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bill Number</span>
                  <span>{historyDetailExpense.billNumber}</span>
                </div>
              )}
              {getProjectName(historyDetailExpense.projectId) && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Project</span>
                  <span>{getProjectName(historyDetailExpense.projectId)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t pt-2 mt-2">
                <span>Amount</span>
                <span>{fmt(historyDetailExpense.amount)}</span>
              </div>
              {historyDetailExpense.notes && (
                <div className="pt-2 border-t mt-2">
                  <span className="text-muted-foreground">Notes</span>
                  <p className="mt-0.5">{historyDetailExpense.notes}</p>
                </div>
              )}
              {historyDetailExpense.attachments &&
                historyDetailExpense.attachments.length > 0 && (
                  <div className="pt-2 border-t mt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() =>
                        openAttachmentPreview(historyDetailExpense.attachments!)
                      }
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      {historyDetailExpense.attachments.length} attachment
                      {historyDetailExpense.attachments.length === 1 ? "" : "s"}
                    </Button>
                  </div>
                )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Attachment Preview Dialog */}
      <Dialog
        open={!!previewAttachments}
        onOpenChange={(open) => !open && setPreviewAttachments(null)}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Attachment
              {previewAttachments && previewAttachments.length > 1
                ? ` (${previewIndex + 1} / ${previewAttachments.length})`
                : ""}
            </DialogTitle>
          </DialogHeader>
          {previewAttachments && (
            <div className="space-y-3">
              {(() => {
                const att = previewAttachments[previewIndex];
                if (!att) return null;
                return att.fileMimeType.startsWith("image/") ? (
                  <img
                    src={att.fileData}
                    alt={att.fileName}
                    className="w-full rounded border object-contain max-h-[60vh]"
                  />
                ) : att.fileMimeType === "application/pdf" ? (
                  <iframe
                    src={att.fileData}
                    title={att.fileName}
                    className="w-full h-[60vh] rounded border"
                  />
                ) : (
                  <div className="text-center py-10 text-sm text-muted-foreground border rounded-lg border-dashed">
                    Preview isn't available for this file type.
                  </div>
                );
              })()}
              <p className="text-xs text-muted-foreground truncate">
                {previewAttachments[previewIndex]?.fileName}
              </p>
              {previewAttachments.length > 1 && (
                <div className="flex justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={previewIndex <= 0}
                    onClick={() => setPreviewIndex((i) => i - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={previewIndex >= previewAttachments.length - 1}
                    onClick={() => setPreviewIndex((i) => i + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" data-ocid="petty-expenses.dialog">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Expense" : "Add Petty Expense"}
            </DialogTitle>
          </DialogHeader>
          {/* Fix 2: Guard — render nothing if form is not ready */}
          {!form ? null : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                console.log("FORM SUBMITTED");
                handleSave();
              }}
            >
              <div className="space-y-4 py-2">
                <div className="form-grid">
                  <div className="space-y-1.5">
                    <Label htmlFor="pe-date">Date</Label>
                    <Input
                      id="pe-date"
                      type="date"
                      value={form?.date || ""}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, date: e.target.value }))
                      }
                      data-ocid="petty-expenses.input"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pe-amount">
                      Amount (₹) <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="pe-amount"
                      type="number"
                      min={0.01}
                      step={0.01}
                      placeholder="0.00"
                      value={form?.amount ?? 0}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          amount: e.target.value as unknown as number,
                        }))
                      }
                      data-ocid="petty-expenses.input"
                    />
                    {errors.amount && (
                      <p
                        className="text-xs text-destructive"
                        data-ocid="petty-expenses.error_state"
                      >
                        {errors.amount}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>
                    Employee <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={form.employeeId || ""}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, employeeId: v, floatId: "" }))
                    }
                  >
                    <SelectTrigger data-ocid="petty-expenses.select">
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {(employees || []).map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.employeeId && (
                    <p
                      className="text-xs text-destructive"
                      data-ocid="petty-expenses.error_state"
                    >
                      {errors.employeeId}
                    </p>
                  )}
                </div>

                {form.employeeId && (
                  <div className="space-y-1.5">
                    <Label>Link to Expense Float (optional)</Label>
                    <Select
                      value={form.floatId || "__none__"}
                      onValueChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          floatId: v === "__none__" ? "" : v,
                          expenseMode:
                            v === "__none__"
                              ? f.expenseMode
                              : "Company Expense",
                        }))
                      }
                    >
                      <SelectTrigger data-ocid="petty-expenses.float_link.select">
                        <SelectValue placeholder="None — standalone expense" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">
                          None — standalone expense
                        </SelectItem>
                        {(expenseFloats || [])
                          .filter(
                            (f) =>
                              f.employeeId === form.employeeId &&
                              f.status !== "Fully Settled",
                          )
                          .map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.floatNo} — Balance {fmt(f.balanceAmount)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="form-grid">
                  <div className="space-y-1.5">
                    <Label>Expense Type</Label>
                    {/* Fix 4: safe value binding */}
                    <Select
                      value={form.expenseType || "Misc"}
                      onValueChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          expenseType: v as PettyExpenseType,
                        }))
                      }
                    >
                      <SelectTrigger data-ocid="petty-expenses.select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EXPENSE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>
                      Expense Mode <span className="text-destructive">*</span>
                    </Label>
                    {/* Fix 4: safe value binding */}
                    <Select
                      value={form.expenseMode || "Company Expense"}
                      disabled={!!form.floatId}
                      onValueChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          expenseMode: v as PettyExpenseMode,
                        }))
                      }
                    >
                      <SelectTrigger data-ocid="petty-expenses.select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EXPENSE_MODES.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form.floatId && (
                      <p className="text-xs text-muted-foreground">
                        Locked to Company Expense — funded by an Expense Float.
                      </p>
                    )}
                    {errors.expenseMode && (
                      <p
                        className="text-xs text-destructive"
                        data-ocid="petty-expenses.error_state"
                      >
                        {errors.expenseMode}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Project (optional)</Label>
                  {/* Fix 3: sentinel value __none__ instead of empty string */}
                  <Select
                    value={form.projectId || "__none__"}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        projectId: v === "__none__" ? "" : v,
                      }))
                    }
                  >
                    <SelectTrigger data-ocid="petty-expenses.select">
                      <SelectValue placeholder="Select project (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {(projects || []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.projectName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pe-notes">Notes (optional)</Label>
                  <Textarea
                    id="pe-notes"
                    placeholder="Brief description of the expense..."
                    rows={2}
                    value={form?.notes || ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, notes: e.target.value }))
                    }
                    data-ocid="petty-expenses.textarea"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDialogOpen(false)}
                  data-ocid="petty-expenses.cancel_button"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving}
                  data-ocid="petty-expenses.submit_button"
                >
                  {editing ? "Update" : "Add Expense"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface PettyExpensesProps {
  /** Navigate to Inventory's Purchase History tab, scrolled to and
   * highlighting the given purchase. Only called when that purchase
   * actually exists (Petty Expense never dead-ends into a missing
   * record). */
  onViewInventoryPurchase?: (purchaseId: string) => void;
  /** Navigate to the given machine's Service History tab, scrolled to and
   * highlighting the given service record. */
  onViewMachineService?: (machineId: string, serviceRecordId: string) => void;
  /** Navigate to the given employee's Salary & Advances tab. */
  onViewEmployeeRecord?: (employeeId: string) => void;
}

export default function PettyExpenses({
  onViewInventoryPurchase,
  onViewMachineService,
  onViewEmployeeRecord,
}: PettyExpensesProps = {}) {
  const { currentUser } = useAuth();
  const pView = canView(currentUser, "petty_expenses");
  if (!pView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10">
          <span className="text-2xl">🔒</span>
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
    <PettyExpenseErrorBoundary>
      <PettyExpensesInner
        onViewInventoryPurchase={onViewInventoryPurchase}
        onViewMachineService={onViewMachineService}
        onViewEmployeeRecord={onViewEmployeeRecord}
      />
    </PettyExpenseErrorBoundary>
  );
}
