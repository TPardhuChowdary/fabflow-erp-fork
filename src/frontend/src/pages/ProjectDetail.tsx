import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Paperclip,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { ProjectItemsTab } from "../components/ProjectItemsTab";
import { VendorSelect } from "../components/VendorSelect";
import { canCreate, canDelete, canEdit, canView } from "../permissions";
import { useStore } from "../store";
import type {
  BomItem,
  DesignFile,
  InternalCosting,
  InventoryItem,
  ManualAdjustment,
  MaterialPurchase,
  MaterialUsage,
  OutsourcedWork,
  ProjectDelivery,
  ProjectItem,
  ProjectItemStatus,
  ProjectPO,
  ProjectPOStatus,
  ProjectProduction,
  ProjectProductionStage,
  ProjectStageStatus,
  PurchaseAttachment,
  StageTransaction,
} from "../types";

interface Props {
  projectId: string;
  onBack: () => void;
}

const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

const STAGE_STATUS_COLORS: Record<ProjectStageStatus, string> = {
  NotStarted: "bg-gray-100 text-gray-500",
  Sent: "bg-blue-100 text-blue-700",
  InProgress: "bg-amber-100 text-amber-700",
  Completed: "bg-green-100 text-green-700",
  Received: "bg-emerald-100 text-emerald-700",
};

const STAGE_STATUS_LABELS: Record<ProjectStageStatus, string> = {
  NotStarted: "Not Started",
  Sent: "Sent",
  InProgress: "In Progress",
  Completed: "Completed",
  Received: "Received",
};

const makeStage = (stageName: string): ProjectProductionStage => ({
  stageName,
  status: "NotStarted",
  notes: "",
  quantitySent: 0,
  sentDateTime: "",
  sentToVendorId: "",
  sentToVendorName: "",
  receivedQuantity: 0,
  receivedDateTime: "",
  startTime: "",
  endTime: "",
});

const DEFAULT_STAGES: ProjectProductionStage[] = [
  makeStage("Cutting (CNC / Laser)"),
  makeStage("Bending"),
  makeStage("Welding"),
  makeStage("Finishing"),
  makeStage("Powder Coating"),
  makeStage("Assembly"),
];

function SentToSelect({
  vendorId,
  vendorName,
  onChange,
  stageIdx,
}: {
  vendorId: string;
  vendorName: string;
  onChange: (id: string, name: string) => void;
  stageIdx: number;
}) {
  const { vendors, addVendor } = useStore();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");

  const handleSelect = (val: string) => {
    if (val === "__add_new__") {
      setAddModalOpen(true);
      return;
    }
    if (val === "inhouse") {
      onChange("inhouse", "In-house");
      return;
    }
    const v = vendors.find((x) => x.id === val);
    if (v) onChange(v.id, v.name);
  };

  const handleAddVendor = () => {
    if (!newVendorName.trim()) return;
    const exists = vendors.find(
      (v) => v.name.trim().toLowerCase() === newVendorName.trim().toLowerCase(),
    );
    if (exists) {
      onChange(exists.id, exists.name);
    } else {
      const newV = {
        id: crypto.randomUUID(),
        name: newVendorName.trim(),
        phone: "",
        address: "",
        createdAt: Date.now(),
      };
      addVendor(newV);
      onChange(newV.id, newV.name);
    }
    setAddModalOpen(false);
    setNewVendorName("");
  };

  const displayValue = vendorId === "inhouse" ? "inhouse" : vendorId || "";

  return (
    <>
      <Select value={displayValue} onValueChange={handleSelect}>
        <SelectTrigger
          className="h-8 text-xs"
          data-ocid={`project-detail.production.sent_to.${stageIdx + 1}`}
        >
          <SelectValue placeholder="Select...">
            {vendorId === "inhouse" ? (
              "In-house"
            ) : vendorName ? (
              vendorName
            ) : (
              <span className="text-muted-foreground">Select...</span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="inhouse" className="text-xs font-medium">
            🏭 In-house
          </SelectItem>
          {vendors.map((v) => (
            <SelectItem key={v.id} value={v.id} className="text-xs">
              {v.name}
            </SelectItem>
          ))}
          <div className="border-t border-border mt-1 pt-1">
            <SelectItem
              value="__add_new__"
              className="text-xs text-primary font-medium"
            >
              + Add New Vendor
            </SelectItem>
          </div>
        </SelectContent>
      </Select>

      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Vendor</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs">Vendor Name *</Label>
            <Input
              value={newVendorName}
              onChange={(e) => setNewVendorName(e.target.value)}
              placeholder="Vendor name"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddModalOpen(false)}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleAddVendor}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ProjectDetail({ projectId, onBack }: Props) {
  const {
    projects,
    customers,
    designFiles,
    internalCostings,
    materialPurchases,
    outsourcedWorks,
    projectProductions,
    projectDeliveries,
    addDesignFile,
    deleteDesignFile,
    upsertInternalCosting,
    addMaterialPurchase,
    updateMaterialPurchase,
    deleteMaterialPurchase,
    addOutsourcedWork,
    updateOutsourcedWork,
    deleteOutsourcedWork,
    upsertProjectProduction,
    addStageTransaction,
    updateProjectStagesV2,
    upsertProjectDelivery,
    updateProject,
    addProjectPO,
    updateProjectPO,
    employees,
    inventoryItems,
    materialUsages,
    addMaterialUsage,
    deleteMaterialUsage,
    updateMaterialUsage,
    bomItems,
    addBomItem,
    updateBomItem,
    deleteBomItem,
    projectItems,
    addProjectItem,
    updateProjectItem,
    deleteProjectItem,
    masterPOs,
    deliveryChallans,
    addInventoryItem,
    invoices,
    qualityInspections,
    pettyExpenses,
    vendors,
  } = useStore();

  const { currentUser } = useAuth();
  const pView = canView(currentUser, "projects");
  const pEdit = canEdit(currentUser, "projects");
  const pCreate = canCreate(currentUser, "projects");
  const pDelete = canDelete(currentUser, "projects");
  const pAddOutsourced = pCreate;
  // Legacy role aliases (kept for backward compat) - now derived from permissions
  const isRestrictedRole = !pEdit;
  const isAdmin = pEdit;
  const project = projects.find((p) => p.id === projectId);
  const customer = customers.find((c) => c.id === project?.customerId);

  const projDesignFiles = designFiles.filter((f) => f.projectId === projectId);
  const existingCosting = internalCostings.find(
    (c) => c.projectId === projectId,
  );
  const projMaterials = materialPurchases.filter(
    (m) => m.projectId === projectId,
  );
  const projOutsourced = outsourcedWorks.filter(
    (o) => o.projectId === projectId,
  );
  const projUsages = materialUsages.filter((u) => u.projectId === projectId);
  const projBomItems = bomItems.filter((b) => b.projectId === projectId);
  const existingProduction = projectProductions.find(
    (p) => p.projectId === projectId,
  );
  const existingDelivery = projectDeliveries.find(
    (d) => d.projectId === projectId,
  );

  // Internal costing state
  const [costing, setCosting] = useState<
    Omit<InternalCosting, "id" | "projectId">
  >({
    rawMaterialCost: existingCosting?.rawMaterialCost ?? 0,
    cncCost: existingCosting?.cncCost ?? 0,
    hardwareCost: existingCosting?.hardwareCost ?? 0,
    powderCoatingCost: existingCosting?.powderCoatingCost ?? 0,
    assemblyCost: existingCosting?.assemblyCost ?? 0,
    packingCost: existingCosting?.packingCost ?? 0,
    labourCost: existingCosting?.labourCost ?? 0,
    transportCost: existingCosting?.transportCost ?? 0,
    extraCosts: existingCosting?.extraCosts ?? [],
  });

  useEffect(() => {
    if (existingCosting) {
      setCosting({
        rawMaterialCost: existingCosting.rawMaterialCost,
        cncCost: existingCosting.cncCost,
        hardwareCost: existingCosting.hardwareCost,
        powderCoatingCost: existingCosting.powderCoatingCost,
        assemblyCost: existingCosting.assemblyCost,
        packingCost: existingCosting.packingCost,
        labourCost: existingCosting.labourCost ?? 0,
        transportCost: existingCosting.transportCost ?? 0,
        extraCosts: existingCosting.extraCosts ?? [],
      });
    }
  }, [existingCosting]);

  // Production state
  const [newCustomCost, setNewCustomCost] = useState<{
    name: string;
    amount: string;
    category: "Material" | "Process" | "Misc";
  }>({ name: "", amount: "", category: "Misc" });
  const [showAddCustomCost, setShowAddCustomCost] = useState(false);

  const [stages, setStages] = useState<ProjectProductionStage[]>(
    existingProduction?.stages ?? DEFAULT_STAGES,
  );

  useEffect(() => {
    setStages(existingProduction?.stages ?? DEFAULT_STAGES);
  }, [existingProduction]);

  const [expandedStage, setExpandedStage] = useState<number | null>(0);

  // V2 production state
  const isV2 = project?.productionVersion === "v2";
  const v2Stages = existingProduction?.stages ?? [];
  const [sendMaterialDialog, setSendMaterialDialog] = useState<{
    stageIdx: number;
  } | null>(null);
  const [receiveMaterialDialog, setReceiveMaterialDialog] = useState<{
    stageIdx: number;
  } | null>(null);
  const [addStageDialog, setAddStageDialog] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [newStageRequiresMaterial, setNewStageRequiresMaterial] =
    useState(false);
  const [sendForm, setSendForm] = useState({
    quantity: 0,
    dateTime: "",
    vendorId: "",
    vendorName: "",
  });
  const [receiveForm, setReceiveForm] = useState({ quantity: 0, dateTime: "" });

  // Delivery state
  const [delivery, setDelivery] = useState({
    deliveryDate: existingDelivery?.deliveryDate ?? "",
    deliveryDestination: existingDelivery?.deliveryDestination ?? "",
    vehicleNumber: existingDelivery?.vehicleNumber ?? "",
    deliveryChallan: existingDelivery?.deliveryChallan ?? "",
  });

  useEffect(() => {
    if (existingDelivery) {
      setDelivery({
        deliveryDate: existingDelivery.deliveryDate,
        deliveryDestination: existingDelivery.deliveryDestination,
        vehicleNumber: existingDelivery.vehicleNumber,
        deliveryChallan: existingDelivery.deliveryChallan,
      });
    }
  }, [existingDelivery]);

  // BOM dialog state
  const [bomDialog, setBomDialog] = useState(false);
  const [editingBomId, setEditingBomId] = useState<string | null>(null);
  const [bomForm, setBomForm] = useState({
    inventoryItemId: "",
    requiredQuantity: "",
  });
  const [newMatDialog, setNewMatDialog] = useState(false);
  const [newMatForm, setNewMatForm] = useState({
    name: "",
    unit: "pcs",
    estimatedPrice: "",
  });

  const selectedBomItem = inventoryItems.find(
    (x) => x.id === bomForm.inventoryItemId,
  );

  const handleAddNewMaterial = () => {
    if (!newMatForm.name.trim()) {
      toast.error("Material name is required");
      return;
    }
    const existing = inventoryItems.find(
      (x) =>
        x.name.trim().toLowerCase() === newMatForm.name.trim().toLowerCase(),
    );
    if (existing) {
      setBomForm((f) => ({ ...f, inventoryItemId: existing.id }));
      setNewMatDialog(false);
      setNewMatForm({ name: "", unit: "pcs", estimatedPrice: "" });
      toast.info("Material already exists — selected in dropdown");
      return;
    }
    const estPrice = Number(newMatForm.estimatedPrice || 0);
    const newItem: InventoryItem = {
      id: `inv-${Date.now()}`,
      name: newMatForm.name.trim(),
      unit: newMatForm.unit,
      quantityAvailable: 0,
      lastUpdated: Date.now(),
      estimatedPrice: estPrice,
    };
    addInventoryItem(newItem);
    setBomForm((f) => ({ ...f, inventoryItemId: newItem.id }));
    setNewMatDialog(false);
    setNewMatForm({ name: "", unit: "pcs", estimatedPrice: "" });
    toast.success(`${newItem.name} added to material list`);
  };

  const openAddBom = () => {
    setEditingBomId(null);
    setBomForm({ inventoryItemId: "", requiredQuantity: "" });
    setBomDialog(true);
  };

  const openEditBom = (item: BomItem) => {
    if (!pEdit) {
      toast.error("No permission to edit BOM");
      return;
    }
    setEditingBomId(item.id);
    setBomForm({
      inventoryItemId: item.inventoryItemId,
      requiredQuantity: String(item.requiredQuantity),
    });
    setBomDialog(true);
  };

  const handleSaveBom = () => {
    if (!pEdit) {
      toast.error("No permission to edit BOM");
      return;
    }
    if (!bomForm.inventoryItemId) {
      toast.error("Please select a material");
      return;
    }
    const qty = Number(bomForm.requiredQuantity);
    if (!qty || qty <= 0) {
      toast.error("Enter a valid required quantity");
      return;
    }
    const invItem = inventoryItems.find(
      (x) => x.id === bomForm.inventoryItemId,
    );
    if (!invItem) return;
    const estimatedPrice = Number(
      invItem?.unitCost ?? invItem?.estimatedPrice ?? 0,
    );
    if (editingBomId) {
      updateBomItem(editingBomId, {
        inventoryItemId: bomForm.inventoryItemId,
        materialName: invItem.name,
        requiredQuantity: qty,
        estimatedPrice: estimatedPrice,
      });
      toast.success("BOM item updated");
    } else {
      addBomItem({
        id: crypto.randomUUID(),
        projectId: projectId!,
        inventoryItemId: bomForm.inventoryItemId,
        materialName: invItem.name,
        requiredQuantity: qty,
        estimatedPrice: estimatedPrice,
        createdAt: Date.now(),
      });
      toast.success("BOM item added");
    }
    setBomDialog(false);
  };

  // Material Usage dialog
  const [usageDialog, setUsageDialog] = useState(false);
  const [usageForm, setUsageForm] = useState({
    inventoryItemId: "",
    quantityUsed: "",
    usedDate: new Date().toISOString().split("T")[0],
    notes: "",
  });
  const selectedUsageItem: InventoryItem | undefined = inventoryItems.find(
    (x) => x.id === usageForm.inventoryItemId,
  );

  const handleAddUsage = () => {
    if (!usageForm.inventoryItemId) {
      toast.error("Please select a material");
      return;
    }
    const qty = Number(usageForm.quantityUsed);
    if (!qty || qty <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    if (selectedUsageItem && qty > selectedUsageItem.quantityAvailable) {
      toast.error(
        `Insufficient stock. Available: ${selectedUsageItem.quantityAvailable} ${selectedUsageItem.unit}`,
      );
      return;
    }
    const usage: MaterialUsage = {
      id: `mu-${Date.now()}`,
      projectId,
      inventoryItemId: usageForm.inventoryItemId,
      materialName: selectedUsageItem?.name ?? "",
      quantityUsed: qty,
      usedDate: usageForm.usedDate,
      notes: usageForm.notes,
      createdAt: Date.now(),
    };
    const ok = addMaterialUsage(usage);
    if (!ok) {
      toast.error("Insufficient stock. Cannot save usage.");
      return;
    }
    toast.success("Material usage recorded");
    setUsageForm({
      inventoryItemId: "",
      quantityUsed: "",
      usedDate: new Date().toISOString().split("T")[0],
      notes: "",
    });
    setUsageDialog(false);
  };

  // Material purchase dialog
  const [matDialog, setMatDialog] = useState(false);
  const [matForm, setMatForm] = useState({
    materialType: "",
    thickness: "",
    quantity: 0,
    unit: "units",
    supplierName: "",
    vendorId: "",
    purchaseDate: "",
  });
  const matFileInputRef = useRef<HTMLInputElement>(null);
  const [matPendingAttachments, setMatPendingAttachments] = useState<
    PurchaseAttachment[]
  >([]);

  // Outsourced work dialog
  const [outDialog, setOutDialog] = useState(false);
  const [outEditId, setOutEditId] = useState<string | null>(null);
  const [editPurchaseId, setEditPurchaseId] = useState<string | null>(null);
  const [editPurchaseForm, setEditPurchaseForm] = useState<{
    materialType: string;
    thickness: string;
    quantity: number;
    unit: string;
    vendorId: string;
    supplierName: string;
    purchaseDate: string;
  } | null>(null);
  const [editUsageId, setEditUsageId] = useState<string | null>(null);
  const [editUsageForm, setEditUsageForm] = useState<{
    quantityUsed: string;
    usedDate: string;
    notes: string;
  } | null>(null);
  const [outForm, setOutForm] = useState({
    vendorId: "",
    vendorName: "",
    materialSent: "",
    quantitySent: 0,
    dateSent: "",
    dateReceived: "",
    processCost: 0,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Multi-PO state
  const [poDialog, setPoDialog] = useState(false);
  const poFileRef = useRef<HTMLInputElement>(null);
  const emptyPoForm = () => ({
    poNumber: "",
    poDate: "",
    quantity: 0,
    status: "Open" as ProjectPOStatus,
    file: undefined as PurchaseAttachment | undefined,
  });
  const [poAddForm, setPoAddForm] = useState(emptyPoForm());
  const [adjForm, setAdjForm] = useState<{
    name: string;
    amount: string;
    type: "Add Cost" | "Reduce Cost";
  }>({ name: "", amount: "", type: "Add Cost" });
  const [showAdjForm, setShowAdjForm] = useState(false);

  const handleAddPO = () => {
    if (!project) return;
    if (!poAddForm.poNumber.trim()) {
      toast.error("PO Number is required");
      return;
    }
    addProjectPO(project.id, { id: crypto.randomUUID(), ...poAddForm });
    setPoAddForm(emptyPoForm());
    setPoDialog(false);
    toast.success("PO added");
  };

  const handlePoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPoAddForm((f) => ({
        ...f,
        file: {
          ref: reader.result as string,
          type: file.type === "application/pdf" ? "pdf" : "image",
          name: file.name,
        },
      }));
    };
    reader.readAsDataURL(file);
    if (poFileRef.current) poFileRef.current.value = "";
  };

  const handleUpdatePOStatus = (po: ProjectPO, newStatus: ProjectPOStatus) => {
    if (!project) return;
    updateProjectPO(project.id, { ...po, status: newStatus });
  };

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
        <Button variant="outline" size="sm" onClick={onBack}>
          Go Back
        </Button>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p>Project not found.</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={onBack}>
          Back
        </Button>
      </div>
    );
  }

  const extraCostsTotal = (costing.extraCosts || []).reduce(
    (s, c) => s + (Number(c.amount) || 0),
    0,
  );
  const totalCosting =
    (costing.rawMaterialCost || 0) +
    (costing.cncCost || 0) +
    (costing.hardwareCost || 0) +
    (costing.powderCoatingCost || 0) +
    (costing.assemblyCost || 0) +
    (costing.packingCost || 0) +
    (costing.labourCost || 0) +
    (costing.transportCost || 0) +
    extraCostsTotal;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const fileData = (ev.target?.result as string) ?? "";
      const designFile: DesignFile = {
        id: `df-${Date.now()}`,
        projectId,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileData,
        uploadedAt: Date.now(),
      };
      addDesignFile(designFile);
      toast.success(`${file.name} uploaded`);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleDownloadFile = (f: DesignFile) => {
    const a = document.createElement("a");
    a.href = f.fileData;
    a.download = f.fileName;
    a.click();
  };

  const handleSaveCosting = () => {
    upsertInternalCosting({
      id: existingCosting?.id ?? `ic-${Date.now()}`,
      projectId,
      ...costing,
      labourCost: costing.labourCost ?? 0,
      transportCost: costing.transportCost ?? 0,
      extraCosts: costing.extraCosts ?? [],
    });
    toast.success("Costing saved");
  };

  const handleAddCustomCost = () => {
    const amt = Number(newCustomCost.amount);
    if (!newCustomCost.name.trim() || amt <= 0) return;
    const entry = {
      id: `cc-${Date.now()}`,
      name: newCustomCost.name.trim(),
      amount: amt,
      category: newCustomCost.category,
    };
    setCosting((c) => ({ ...c, extraCosts: [...(c.extraCosts || []), entry] }));
    setNewCustomCost({ name: "", amount: "", category: "Misc" });
    setShowAddCustomCost(false);
  };

  const handleDeleteCustomCost = (id: string) => {
    setCosting((c) => ({
      ...c,
      extraCosts: (c.extraCosts || []).filter((x) => x.id !== id),
    }));
  };

  const handleAddMaterial = () => {
    if (!matForm.materialType.trim()) {
      toast.error("Material type is required");
      return;
    }
    const mat: MaterialPurchase = {
      id: `mp-${Date.now()}`,
      projectId,
      ...matForm,
      attachments:
        matPendingAttachments.length > 0
          ? [...matPendingAttachments]
          : undefined,
    };
    addMaterialPurchase(mat);
    toast.success(
      "Material purchase recorded — inventory updated automatically",
    );
    setMatDialog(false);
    setMatPendingAttachments([]);
    setMatForm({
      materialType: "",
      thickness: "",
      quantity: 0,
      unit: "units",
      supplierName: "",
      vendorId: "",
      purchaseDate: "",
    });
  };

  const handleMatAttachFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      setMatPendingAttachments((prev) => [...prev, ...newAttachments]);
    });
    if (matFileInputRef.current) matFileInputRef.current.value = "";
  };

  const removeMatAttachment = (ref: string) => {
    setMatPendingAttachments((prev) => prev.filter((a) => a.ref !== ref));
  };

  const handleVendorSelect = (vendorId: string) => {
    const vendor = vendors.find((v) => v.id === vendorId);
    if (!vendor) return;
    setOutForm((prev) => ({
      ...prev,
      vendorId: vendor.id,
      vendorName: vendor.name,
    }));
  };

  const handleAddOutsourced = () => {
    if (!outForm.vendorId) {
      toast.error("Please select a vendor");
      return;
    }
    const resetForm = () => {
      setOutDialog(false);
      setOutEditId(null);
      setOutForm({
        vendorId: "",
        vendorName: "",
        materialSent: "",
        quantitySent: 0,
        dateSent: "",
        dateReceived: "",
        processCost: 0,
      });
    };
    if (outEditId) {
      if (!pEdit) {
        alert("Access restricted");
        return;
      }
      updateOutsourcedWork({
        id: outEditId,
        projectId: project.id,
        ...outForm,
      });
      toast.success("Outsourced work updated");
      resetForm();
    } else {
      if (!pAddOutsourced) {
        alert("Access restricted");
        return;
      }
      const o: OutsourcedWork = {
        id: crypto.randomUUID(),
        projectId: project.id,
        ...outForm,
      };
      addOutsourcedWork(o);
      toast.success("Outsourced work recorded");
      resetForm();
    }
  };

  const handleDeleteOutsourced = (id: string) => {
    if (!pDelete) {
      alert("Access restricted");
      return;
    }
    if (!confirm("Delete this outsourced work entry?")) return;
    deleteOutsourcedWork(id);
    toast.success("Outsourced work deleted");
  };

  const _handleSaveProduction = () => {
    const prod: ProjectProduction = {
      id: existingProduction?.id ?? `pp-${Date.now()}`,
      projectId,
      stages,
    };
    upsertProjectProduction(prod);
    toast.success("Production status saved");
  };

  const handleSendMaterial = () => {
    if (!sendMaterialDialog) return;
    if (sendForm.quantity <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    const tx: StageTransaction = {
      id: `tx-${Date.now()}`,
      type: "send",
      quantity: sendForm.quantity,
      dateTime: sendForm.dateTime || new Date().toISOString(),
      sentToVendorId: sendForm.vendorId,
      sentToVendorName: sendForm.vendorName,
    };
    addStageTransaction(projectId, sendMaterialDialog.stageIdx, tx);
    setSendMaterialDialog(null);
    setSendForm({ quantity: 0, dateTime: "", vendorId: "", vendorName: "" });
    toast.success("Material sent recorded");
  };

  const handleReceiveMaterial = () => {
    if (!receiveMaterialDialog) return;
    if (receiveForm.quantity <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    const stage = v2Stages[receiveMaterialDialog.stageIdx];
    const totalSent = (stage?.transactions || [])
      .filter((t) => t.type === "send")
      .reduce((a, t) => a + t.quantity, 0);
    const totalReceived = (stage?.transactions || [])
      .filter((t) => t.type === "receive")
      .reduce((a, t) => a + t.quantity, 0);
    if (totalReceived + receiveForm.quantity > totalSent) {
      toast.error("Cannot receive more than sent");
      return;
    }
    const tx: StageTransaction = {
      id: `tx-${Date.now()}`,
      type: "receive",
      quantity: receiveForm.quantity,
      dateTime: receiveForm.dateTime || new Date().toISOString(),
    };
    addStageTransaction(projectId, receiveMaterialDialog.stageIdx, tx);
    setReceiveMaterialDialog(null);
    setReceiveForm({ quantity: 0, dateTime: "" });
    toast.success("Material received recorded");
  };

  const handleAddStage = () => {
    if (!newStageName.trim()) {
      toast.error("Enter a stage name");
      return;
    }
    const newStage: ProjectProductionStage = {
      stageName: newStageName.trim(),
      status: "NotStarted",
      notes: "",
      quantitySent: 0,
      sentDateTime: "",
      sentToVendorId: "",
      sentToVendorName: "",
      receivedQuantity: 0,
      receivedDateTime: "",
      startTime: "",
      endTime: "",
      requiresMaterialTracking: newStageRequiresMaterial,
      transactions: [],
    };
    updateProjectStagesV2(projectId, [...v2Stages, newStage]);
    setAddStageDialog(false);
    setNewStageName("");
    setNewStageRequiresMaterial(false);
    toast.success("Stage added");
  };

  const handleRemoveStage = (idx: number) => {
    const updated = v2Stages.filter((_, i) => i !== idx);
    updateProjectStagesV2(projectId, updated);
    toast.success("Stage removed");
  };

  const handleMoveStage = (idx: number, dir: "up" | "down") => {
    const updated = [...v2Stages];
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= updated.length) return;
    [updated[idx], updated[target]] = [updated[target], updated[idx]];
    updateProjectStagesV2(projectId, updated);
  };

  const handleCompleteStage = (idx: number) => {
    const updated = v2Stages.map((s, i) =>
      i === idx ? { ...s, status: "Completed" as ProjectStageStatus } : s,
    );
    updateProjectStagesV2(projectId, updated);
    toast.success("Stage marked complete");
  };

  const handleSaveDelivery = () => {
    const d: ProjectDelivery = {
      id: existingDelivery?.id ?? `pd-${Date.now()}`,
      projectId,
      ...delivery,
    };
    upsertProjectDelivery(d);
    toast.success("Delivery details saved");
  };

  const _updateStage = (
    idx: number,
    field: keyof ProjectProductionStage,
    value: string | number,
  ) => {
    setStages((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)),
    );
  };

  return (
    <div className="space-y-5" data-ocid="project-detail.page">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="mt-0.5"
          data-ocid="project-detail.back.button"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">
              {project.projectNo}
            </span>
            <Badge variant="outline" className="text-xs">
              {customer?.name ?? "Unknown"}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <h1 className="text-xl font-bold">{project.projectName}</h1>
            {(() => {
              const prodRecord = projectProductions.find(
                (pp) => pp.projectId === project.id,
              );
              const pStages = prodRecord?.stages || [];
              const projQIs = (qualityInspections || []).filter(
                (q) => q.projectId === project.id,
              );
              const hasRework = pStages.some(
                (s) => s.isRework && s.status !== "Completed",
              );
              const allProduced =
                pStages.filter((s) => !s.isRework).length > 0 &&
                pStages
                  .filter((s) => !s.isRework)
                  .every((s) => s.status === "Completed");
              const hasRejected = projQIs.some(
                (q) => (q.rejectedQty || 0) > 0 && (q.approvedQty || 0) === 0,
              );
              const dispQty = (deliveryChallans || []).reduce(
                (sum, dc) =>
                  sum +
                  ((dc.projectEntries || []).find(
                    (e) => e.projectId === project.id,
                  )?.dispatchQty || 0),
                0,
              );
              const isReadyForDispatch =
                allProduced &&
                !hasRework &&
                !hasRejected &&
                dispQty < (project.totalQty || 0);
              let statusLabel = "Material Waiting";
              let statusClass = "bg-gray-100 text-gray-600 border-gray-200";
              if (isReadyForDispatch) {
                statusLabel = "Ready for Dispatch";
                statusClass = "bg-green-100 text-green-700 border-green-200";
              } else if (hasRejected) {
                statusLabel = "Quality Pending";
                statusClass = "bg-yellow-100 text-yellow-700 border-yellow-200";
              } else if (hasRework) {
                statusLabel = "Rework";
                statusClass = "bg-amber-100 text-amber-700 border-amber-200";
              } else if (pStages.some((s) => s.status === "InProgress")) {
                statusLabel = "In Production";
                statusClass = "bg-blue-100 text-blue-700 border-blue-200";
              }
              return (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusClass}`}
                >
                  {statusLabel}
                </span>
              );
            })()}
          </div>
          {project.workDescription && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {project.workDescription}
            </p>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview" data-ocid="project-detail.panel">
        <div className="space-y-1">
          {/* Planning group */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-1 mr-1 select-none">
              Planning
            </span>
            <TabsList className="h-auto gap-1 flex-wrap bg-transparent p-0">
              <TabsTrigger
                value="overview"
                data-ocid="project-detail.overview.tab"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger value="design" data-ocid="project-detail.design.tab">
                Design Files
              </TabsTrigger>
              <TabsTrigger value="bom" data-ocid="project-detail.bom.tab">
                BOM
              </TabsTrigger>
              <TabsTrigger value="items" data-ocid="project-detail.items.tab">
                Items
              </TabsTrigger>
              {!isRestrictedRole && (
                <TabsTrigger
                  value="costing"
                  data-ocid="project-detail.costing.tab"
                >
                  Internal Costing
                </TabsTrigger>
              )}
            </TabsList>
          </div>
          {/* Materials group */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-1 mr-1 select-none">
              Materials
            </span>
            <TabsList className="h-auto gap-1 flex-wrap bg-transparent p-0">
              <TabsTrigger
                value="materials"
                data-ocid="project-detail.materials.tab"
              >
                Materials
              </TabsTrigger>
              <TabsTrigger
                value="material-usage"
                data-ocid="project-detail.material-usage.tab"
              >
                Material Usage
              </TabsTrigger>
            </TabsList>
          </div>
          {/* Execution group */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-1 mr-1 select-none">
              Execution
            </span>
            <TabsList className="h-auto gap-1 flex-wrap bg-transparent p-0">
              <TabsTrigger
                value="production"
                data-ocid="project-detail.production.tab"
              >
                Production
              </TabsTrigger>
              <TabsTrigger
                value="outsourced"
                data-ocid="project-detail.outsourced.tab"
              >
                Outsourced
              </TabsTrigger>
            </TabsList>
          </div>
          {/* Closure group */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-1 mr-1 select-none">
              Closure
            </span>
            <TabsList className="h-auto gap-1 flex-wrap bg-transparent p-0">
              <TabsTrigger
                value="delivery"
                data-ocid="project-detail.delivery.tab"
              >
                Delivery
              </TabsTrigger>
              {!isRestrictedRole && (
                <TabsTrigger
                  value="profit"
                  data-ocid="project-detail.profit.tab"
                >
                  Profit &amp; Costing
                </TabsTrigger>
              )}
            </TabsList>
          </div>
        </div>

        {/* Tab 1 — Overview */}
        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Project Overview</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Project No
                </p>
                <p className="font-mono font-semibold mt-0.5">
                  {project.projectNo}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Customer
                </p>
                <p className="font-medium mt-0.5">{customer?.name ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Project Name
                </p>
                <p className="font-medium mt-0.5">{project.projectName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Created Date
                </p>
                <p className="mt-0.5">
                  {new Date(project.createdAt).toLocaleDateString("en-IN")}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Work Description
                </p>
                <p className="mt-0.5">{project.workDescription || "—"}</p>
              </div>
              <div className="sm:col-span-2">
                {(() => {
                  if (project.totalQty == null) {
                    return (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-yellow-50 border border-yellow-200 text-yellow-700 text-xs font-medium">
                        ⚠ Quantity not set
                      </div>
                    );
                  }
                  const dispatchedQty = (deliveryChallans || []).reduce(
                    (sum, dc) =>
                      sum +
                      ((dc.projectEntries || []).find(
                        (e) => e.projectId === project.id,
                      )?.dispatchQty || 0),
                    0,
                  );
                  const remainingQty = project.totalQty - dispatchedQty;
                  return (
                    <div className="flex gap-3 flex-wrap">
                      <div className="flex-1 min-w-[80px] rounded-md bg-muted/50 border border-border p-2 text-center">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          Total Qty
                        </p>
                        <p className="text-base font-bold mt-0.5">
                          {project.totalQty}
                        </p>
                      </div>
                      <div className="flex-1 min-w-[80px] rounded-md bg-muted/50 border border-border p-2 text-center">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          Dispatched
                        </p>
                        <p className="text-base font-bold mt-0.5">
                          {dispatchedQty}
                        </p>
                      </div>
                      <div className="flex-1 min-w-[80px] rounded-md bg-muted/50 border border-border p-2 text-center">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          Remaining
                        </p>
                        <p
                          className={`text-base font-bold mt-0.5 ${remainingQty <= 0 ? "text-destructive" : "text-green-600"}`}
                        >
                          {remainingQty}
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>
              {/* Production Summary */}
              {(() => {
                const prodRecord = projectProductions.find(
                  (pp) => pp.projectId === project.id,
                );
                const pStages = prodRecord?.stages || [];
                const projQIs = (qualityInspections || []).filter(
                  (q) => q.projectId === project.id,
                );
                const producedQty = pStages
                  .filter((s) => s.status === "Completed" && !s.isRework)
                  .reduce((sum, s) => sum + (s.receivedQty || 0), 0);
                const approvedQtyTotal = projQIs.reduce(
                  (sum, q) => sum + (q.approvedQty || 0),
                  0,
                );
                const rejectedQtyTotal = projQIs.reduce(
                  (sum, q) => sum + (q.rejectedQty || 0),
                  0,
                );
                const reworkCount = pStages.filter((s) => s.isRework).length;
                const dispatchedQtySummary = (deliveryChallans || []).reduce(
                  (sum, dc) =>
                    sum +
                    ((dc.projectEntries || []).find(
                      (e) => e.projectId === project.id,
                    )?.dispatchQty || 0),
                  0,
                );
                return (
                  <div className="sm:col-span-2 pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2">
                      Production Summary
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <div className="flex-1 min-w-[70px] rounded-md bg-blue-50 border border-blue-200 p-2 text-center">
                        <p className="text-[10px] text-blue-600 uppercase tracking-wide">
                          Produced
                        </p>
                        <p className="text-base font-bold text-blue-700 mt-0.5">
                          {producedQty}
                        </p>
                      </div>
                      <div className="flex-1 min-w-[70px] rounded-md bg-green-50 border border-green-200 p-2 text-center">
                        <p className="text-[10px] text-green-600 uppercase tracking-wide">
                          Approved
                        </p>
                        <p className="text-base font-bold text-green-700 mt-0.5">
                          {approvedQtyTotal}
                        </p>
                      </div>
                      <div className="flex-1 min-w-[70px] rounded-md bg-red-50 border border-red-200 p-2 text-center">
                        <p className="text-[10px] text-red-500 uppercase tracking-wide">
                          Rejected
                        </p>
                        <p className="text-base font-bold text-red-600 mt-0.5">
                          {rejectedQtyTotal}
                        </p>
                      </div>
                      <div className="flex-1 min-w-[70px] rounded-md bg-amber-50 border border-amber-200 p-2 text-center">
                        <p className="text-[10px] text-amber-600 uppercase tracking-wide">
                          Rework
                        </p>
                        <p className="text-base font-bold text-amber-700 mt-0.5">
                          {reworkCount}
                        </p>
                      </div>
                      <div className="flex-1 min-w-[70px] rounded-md bg-muted/50 border border-border p-2 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                          Dispatched
                        </p>
                        <p className="text-base font-bold mt-0.5">
                          {dispatchedQtySummary}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}
              {customer && (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Contact Person
                    </p>
                    <p className="mt-0.5">{customer.contactPerson || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Phone
                    </p>
                    <p className="mt-0.5">{customer.phone || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Address
                    </p>
                    <p className="mt-0.5">{customer.address || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      GSTIN
                    </p>
                    <p className="font-mono mt-0.5">{customer.gstin || "—"}</p>
                  </div>
                </>
              )}
              <div className="sm:col-span-2 pt-2 border-t border-border space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">
                    Purchase Orders
                  </p>
                  {!isRestrictedRole && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => setPoDialog(true)}
                      data-ocid="project-detail.po.open_modal_button"
                    >
                      <Plus className="w-3 h-3 mr-1" /> Add PO
                    </Button>
                  )}
                </div>

                {(project.pos || []).length === 0 ? (
                  <p
                    className="text-[11px] text-muted-foreground"
                    data-ocid="project-detail.po.empty_state"
                  >
                    No purchase orders added yet
                  </p>
                ) : (
                  <div className="table-wrapper">
                    <table
                      className="w-full text-xs border-collapse"
                      style={{ minWidth: "400px" }}
                    >
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">
                            PO Number
                          </th>
                          <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">
                            Date
                          </th>
                          <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">
                            Qty
                          </th>
                          <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">
                            Status
                          </th>
                          <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">
                            File
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(project.pos || []).map((po, idx) => (
                          <tr
                            key={po.id}
                            className="border-b border-border/50 hover:bg-muted/20"
                            data-ocid={`project-detail.po.item.${idx + 1}`}
                          >
                            <td className="py-1.5 px-2 font-medium">
                              {po.poNumber}
                            </td>
                            <td className="py-1.5 px-2 text-muted-foreground">
                              {po.poDate || "—"}
                            </td>
                            <td className="py-1.5 px-2 text-right">
                              {po.quantity}
                            </td>
                            <td className="py-1.5 px-2">
                              {!isRestrictedRole ? (
                                <Select
                                  value={po.status}
                                  onValueChange={(v) =>
                                    handleUpdatePOStatus(
                                      po,
                                      v as ProjectPOStatus,
                                    )
                                  }
                                >
                                  <SelectTrigger className="h-6 text-xs w-28 border-0 bg-transparent p-0 shadow-none focus:ring-0">
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                        po.status === "Open"
                                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                          : po.status === "In Progress"
                                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                            : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                      }`}
                                    >
                                      {po.status}
                                    </span>
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem
                                      value="Open"
                                      className="text-xs"
                                    >
                                      Open
                                    </SelectItem>
                                    <SelectItem
                                      value="In Progress"
                                      className="text-xs"
                                    >
                                      In Progress
                                    </SelectItem>
                                    <SelectItem
                                      value="Completed"
                                      className="text-xs"
                                    >
                                      Completed
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                    po.status === "Open"
                                      ? "bg-blue-100 text-blue-700"
                                      : po.status === "In Progress"
                                        ? "bg-amber-100 text-amber-700"
                                        : "bg-green-100 text-green-700"
                                  }`}
                                >
                                  {po.status}
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 px-2">
                              {(() => {
                                const masterPO = po.sharedPoId
                                  ? (masterPOs || []).find(
                                      (m) => m.sharedPoId === po.sharedPoId,
                                    )
                                  : null;
                                const files = masterPO?.files || [];
                                if (files.length === 0)
                                  return (
                                    <span className="text-muted-foreground">
                                      —
                                    </span>
                                  );
                                return (
                                  <div className="flex flex-col gap-1">
                                    {files.map((f, fi) => {
                                      const isImage =
                                        f.type === "image" ||
                                        /\.(png|jpg|jpeg|gif|webp)$/i.test(
                                          f.name || "",
                                        );
                                      const handleView = () => {
                                        if (!f?.ref) {
                                          alert("File not available");
                                          return;
                                        }
                                        const byteString = atob(
                                          f.ref.split(",")[1],
                                        );
                                        const mimeType =
                                          f.type === "pdf"
                                            ? "application/pdf"
                                            : "image/jpeg";
                                        const ab = new ArrayBuffer(
                                          byteString.length,
                                        );
                                        const ia = new Uint8Array(ab);
                                        for (
                                          let i = 0;
                                          i < byteString.length;
                                          i++
                                        )
                                          ia[i] = byteString.charCodeAt(i);
                                        const blob = new Blob([ab], {
                                          type: mimeType,
                                        });
                                        const url = URL.createObjectURL(blob);
                                        window.open(url, "_blank");
                                      };
                                      const handleDownload = () => {
                                        const a = document.createElement("a");
                                        a.href = f.ref;
                                        a.download =
                                          f.name || `po-file-${fi + 1}`;
                                        a.click();
                                      };
                                      return (
                                        <div
                                          key={`${fi}-${f.name || fi}`}
                                          className="flex items-center gap-1"
                                        >
                                          {isImage ? (
                                            <img
                                              src={f.ref}
                                              alt={f.name}
                                              className="max-h-6 rounded border cursor-pointer object-cover"
                                              onClick={handleView}
                                              onKeyDown={handleView}
                                            />
                                          ) : (
                                            <FileText className="w-3 h-3 text-blue-600" />
                                          )}
                                          <button
                                            type="button"
                                            onClick={handleView}
                                            className="text-blue-600 underline text-[10px] hover:text-blue-800"
                                          >
                                            View
                                          </button>
                                          <button
                                            type="button"
                                            onClick={handleDownload}
                                            className="text-green-600 underline text-[10px] hover:text-green-800"
                                          >
                                            Download
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Add PO Dialog */}
                <Dialog open={poDialog} onOpenChange={setPoDialog}>
                  <DialogContent data-ocid="project-detail.po.dialog">
                    <DialogHeader>
                      <DialogTitle>Add Purchase Order</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 mt-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">PO Number *</Label>
                          <Input
                            className="h-8 text-sm"
                            placeholder="e.g. TSP/PO/2026/1234"
                            value={poAddForm.poNumber}
                            onChange={(e) =>
                              setPoAddForm((f) => ({
                                ...f,
                                poNumber: e.target.value,
                              }))
                            }
                            data-ocid="project-detail.po.input"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">PO Date</Label>
                          <Input
                            type="date"
                            className="h-8 text-sm"
                            value={poAddForm.poDate}
                            onChange={(e) =>
                              setPoAddForm((f) => ({
                                ...f,
                                poDate: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Quantity</Label>
                          <Input
                            type="number"
                            className="h-8 text-sm"
                            min={0}
                            value={poAddForm.quantity}
                            onChange={(e) =>
                              setPoAddForm((f) => ({
                                ...f,
                                quantity: Number(e.target.value),
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Status</Label>
                          <Select
                            value={poAddForm.status}
                            onValueChange={(v) =>
                              setPoAddForm((f) => ({
                                ...f,
                                status: v as ProjectPOStatus,
                              }))
                            }
                          >
                            <SelectTrigger
                              className="h-8 text-sm"
                              data-ocid="project-detail.po.select"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Open">Open</SelectItem>
                              <SelectItem value="In Progress">
                                In Progress
                              </SelectItem>
                              <SelectItem value="Completed">
                                Completed
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">
                          Upload PO File (optional)
                        </Label>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => poFileRef.current?.click()}
                            data-ocid="project-detail.po.upload_button"
                          >
                            <Paperclip className="w-3 h-3 mr-1" /> Choose File
                          </Button>
                          {poAddForm.file && (
                            <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                              {poAddForm.file.name}
                            </span>
                          )}
                          <input
                            ref={poFileRef}
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            className="hidden"
                            onChange={handlePoFileUpload}
                          />
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPoDialog(false);
                          setPoAddForm(emptyPoForm());
                        }}
                        data-ocid="project-detail.po.cancel_button"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleAddPO}
                        data-ocid="project-detail.po.submit_button"
                      >
                        Add PO
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              {isAdmin && (
                <div className="sm:col-span-2 pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
                    Assigned Employees
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {employees
                      .filter(
                        (e) => e.role === "Designer" || e.role === "Worker",
                      )
                      .map((emp) => {
                        const isAssigned =
                          project.assignedEmployeeIds?.includes(emp.id) ??
                          false;
                        return (
                          <button
                            key={emp.id}
                            type="button"
                            onClick={() => {
                              const current = project.assignedEmployeeIds ?? [];
                              const updated = isAssigned
                                ? current.filter((id) => id !== emp.id)
                                : [...current, emp.id];
                              updateProject({
                                ...project,
                                assignedEmployeeIds: updated,
                              });
                            }}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                              isAssigned
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background text-muted-foreground border-border hover:border-primary hover:text-primary"
                            }`}
                            data-ocid="project-detail.assign.toggle"
                          >
                            {emp.name} ({emp.role})
                          </button>
                        );
                      })}
                    {employees.filter(
                      (e) => e.role === "Designer" || e.role === "Worker",
                    ).length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No designers or workers available
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2 — Design Files */}
        <TabsContent value="design" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Design & Drawing Files</h2>
            {pCreate && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  data-ocid="project-detail.upload_button"
                >
                  <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload File
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="*/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </>
            )}
          </div>
          <div className="table-wrapper">
            <div
              className="rounded-md border"
              data-ocid="project-detail.design.table"
            >
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-xs font-semibold">
                      File Name
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Type
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Uploaded
                    </TableHead>
                    <TableHead className="text-xs font-semibold w-24">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projDesignFiles.map((f, i) => (
                    <TableRow
                      key={f.id}
                      data-ocid={`project-detail.design.item.${i + 1}`}
                    >
                      <TableCell className="text-sm font-medium">
                        {f.fileName}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {f.fileType}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(f.uploadedAt).toLocaleDateString("en-IN")}
                      </TableCell>
                      <TableCell className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          onClick={() => handleDownloadFile(f)}
                          data-ocid={`project-detail.design.secondary_button.${i + 1}`}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                        {pDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-destructive hover:text-destructive"
                            onClick={() => {
                              if (!pDelete) {
                                alert("Access restricted");
                                return;
                              }
                              deleteDesignFile(f.id);
                              toast.success("File removed");
                            }}
                            data-ocid={`project-detail.design.delete_button.${i + 1}`}
                          >
                            ×
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {projDesignFiles.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center py-8 text-sm text-muted-foreground"
                        data-ocid="project-detail.design.empty_state"
                      >
                        No design files uploaded yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* Tab 3 — Internal Costing */}
        <TabsContent value="costing" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Internal Costing Sheet
                <Badge variant="outline" className="text-xs font-normal ml-1">
                  Internal Use Only — Not visible to customer
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(
                  [
                    ["rawMaterialCost", "Raw Material Cost"],
                    ["cncCost", "CNC / Laser Cutting Cost"],
                    ["hardwareCost", "Hardware Cost"],
                    ["powderCoatingCost", "Powder Coating Cost"],
                    ["assemblyCost", "Assembly Cost"],
                    ["packingCost", "Packing Cost"],
                    ["labourCost", "Labour Cost"],
                    ["transportCost", "Transport Cost"],
                  ] as [keyof typeof costing, string][]
                ).map(([field, label]) => (
                  <div key={field} className="space-y-1.5">
                    <Label htmlFor={`costing-${field}`}>{label} (₹)</Label>
                    <Input
                      id={`costing-${field}`}
                      type="number"
                      min={0}
                      value={(costing[field] as number) ?? 0}
                      onChange={(e) =>
                        setCosting((c) => ({
                          ...c,
                          [field]: Number(e.target.value),
                        }))
                      }
                      data-ocid="project-detail.costing.input"
                    />
                  </div>
                ))}
              </div>
              {/* Custom Costs Section */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">
                    Extra Costs
                  </span>
                  {!showAddCustomCost && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowAddCustomCost(true)}
                      data-ocid="project-detail.costing.open_modal_button"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add Custom Cost
                    </Button>
                  )}
                </div>
                {(costing.extraCosts || []).length > 0 && (
                  <div className="table-wrapper">
                    <div className="rounded-md border overflow-hidden">
                      <table
                        className="w-full text-sm"
                        style={{ minWidth: "400px" }}
                      >
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                              #
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                              Cost Name
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                              Category
                            </th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                              Amount
                            </th>
                            <th className="px-3 py-2 text-center font-medium text-muted-foreground">
                              Del
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(costing.extraCosts || []).map((entry, idx) => (
                            <tr
                              key={entry.id}
                              className="border-t"
                              data-ocid={`project-detail.costing.item.${idx + 1}`}
                            >
                              <td className="px-3 py-2 text-muted-foreground">
                                {idx + 1}
                              </td>
                              <td className="px-3 py-2">{entry.name}</td>
                              <td className="px-3 py-2">
                                <span className="text-xs px-2 py-0.5 rounded-full bg-muted">
                                  {entry.category}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right font-medium">
                                {fmt(entry.amount)}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDeleteCustomCost(entry.id)
                                  }
                                  className="text-destructive hover:text-destructive/80"
                                  data-ocid={`project-detail.costing.delete_button.${idx + 1}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {showAddCustomCost && (
                  <div className="flex flex-col sm:flex-row gap-2 p-3 rounded-md border bg-muted/30">
                    <Input
                      placeholder="Cost Name"
                      value={newCustomCost.name}
                      onChange={(e) =>
                        setNewCustomCost((c) => ({
                          ...c,
                          name: e.target.value,
                        }))
                      }
                      className="flex-1"
                      data-ocid="project-detail.costing.input"
                    />
                    <select
                      value={newCustomCost.category}
                      onChange={(e) =>
                        setNewCustomCost((c) => ({
                          ...c,
                          category: e.target.value as
                            | "Material"
                            | "Process"
                            | "Misc",
                        }))
                      }
                      className="border border-input rounded-md px-3 py-2 text-sm bg-background"
                    >
                      <option>Material</option>
                      <option>Process</option>
                      <option>Misc</option>
                    </select>
                    <Input
                      type="number"
                      placeholder="Amount"
                      min={0}
                      value={newCustomCost.amount}
                      onChange={(e) =>
                        setNewCustomCost((c) => ({
                          ...c,
                          amount: e.target.value,
                        }))
                      }
                      className="w-28"
                      data-ocid="project-detail.costing.input"
                    />
                    <Button
                      size="sm"
                      onClick={handleAddCustomCost}
                      data-ocid="project-detail.costing.save_button"
                    >
                      Add
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowAddCustomCost(false)}
                      data-ocid="project-detail.costing.cancel_button"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between pt-3 border-t">
                <div>
                  <span className="text-sm text-muted-foreground">
                    Total Internal Cost:{" "}
                  </span>
                  <span className="text-lg font-bold">{fmt(totalCosting)}</span>
                </div>
                <Button
                  onClick={handleSaveCosting}
                  data-ocid="project-detail.costing.save_button"
                >
                  <Save className="w-4 h-4 mr-1.5" /> Save Costing
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4 — Material Purchases */}
        <TabsContent value="materials" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Raw Material Purchases</h2>
            {pCreate && (
              <Button
                size="sm"
                onClick={() => setMatDialog(true)}
                data-ocid="project-detail.materials.open_modal_button"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Purchase
              </Button>
            )}
          </div>
          <div className="table-wrapper">
            <div
              className="rounded-md border"
              data-ocid="project-detail.materials.table"
            >
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-xs font-semibold">
                      Material
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Thickness
                    </TableHead>
                    <TableHead className="text-xs font-semibold">Qty</TableHead>
                    <TableHead className="text-xs font-semibold">
                      Supplier
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Date
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Attachments
                    </TableHead>
                    {(pEdit || pDelete) && (
                      <TableHead className="text-xs font-semibold w-20">
                        Actions
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projMaterials.map((m, i) => (
                    <TableRow
                      key={m.id}
                      data-ocid={`project-detail.materials.item.${i + 1}`}
                    >
                      <TableCell className="text-sm font-medium">
                        {m.materialType}
                      </TableCell>
                      <TableCell className="text-xs">{m.thickness}</TableCell>
                      <TableCell className="text-sm">{m.quantity}</TableCell>
                      <TableCell className="text-sm">
                        {m.supplierName}
                      </TableCell>
                      <TableCell className="text-xs">
                        {m.purchaseDate}
                      </TableCell>
                      <TableCell className="text-xs">
                        {(m.attachments ?? []).length > 0 ? (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Paperclip className="w-3 h-3" />
                            {(m.attachments ?? []).length}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      {(pEdit || pDelete) && (
                        <TableCell>
                          <div className="flex gap-1">
                            {pEdit && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => {
                                  setEditPurchaseId(m.id);
                                  setEditPurchaseForm({
                                    materialType: m.materialType,
                                    thickness: m.thickness,
                                    quantity: m.quantity,
                                    unit: m.unit || "",
                                    vendorId: m.vendorId || "",
                                    supplierName: m.supplierName,
                                    purchaseDate: m.purchaseDate,
                                  });
                                }}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {pDelete && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (confirm("Delete this purchase record?")) {
                                    deleteMaterialPurchase(m.id);
                                  }
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {projMaterials.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={pEdit || pDelete ? 7 : 6}
                        className="text-center py-8 text-sm text-muted-foreground"
                        data-ocid="project-detail.materials.empty_state"
                      >
                        No material purchases recorded
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Add Material Dialog */}
          <Dialog open={matDialog} onOpenChange={setMatDialog}>
            <DialogContent data-ocid="project-detail.materials.dialog">
              <DialogHeader>
                <DialogTitle>Add Material Purchase</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Material Type *</Label>
                    <Input
                      placeholder="e.g. MS Sheet"
                      value={matForm.materialType}
                      onChange={(e) =>
                        setMatForm((f) => ({
                          ...f,
                          materialType: e.target.value,
                        }))
                      }
                      data-ocid="project-detail.materials.input"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Thickness</Label>
                    <Input
                      placeholder="e.g. 2mm"
                      value={matForm.thickness}
                      onChange={(e) =>
                        setMatForm((f) => ({ ...f, thickness: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      min={0}
                      value={matForm.quantity}
                      onChange={(e) =>
                        setMatForm((f) => ({
                          ...f,
                          quantity: Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Unit</Label>
                    <Input
                      placeholder="e.g. kg, sheets, pcs"
                      value={matForm.unit}
                      onChange={(e) =>
                        setMatForm((f) => ({
                          ...f,
                          unit: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Supplier / Vendor</Label>
                    <VendorSelect
                      value={matForm.vendorId || undefined}
                      onChange={(id, name) =>
                        setMatForm((f) => ({
                          ...f,
                          vendorId: id,
                          supplierName: name,
                        }))
                      }
                      placeholder="Select vendor"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Purchase Date</Label>
                    <Input
                      type="date"
                      value={matForm.purchaseDate}
                      onChange={(e) =>
                        setMatForm((f) => ({
                          ...f,
                          purchaseDate: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                {/* Attachments */}
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
                      onClick={() => matFileInputRef.current?.click()}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Add Files
                    </Button>
                    <input
                      ref={matFileInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      multiple
                      className="hidden"
                      onChange={handleMatAttachFiles}
                    />
                  </div>
                  {matPendingAttachments.length > 0 && (
                    <div className="space-y-1.5">
                      {matPendingAttachments.map((att) => (
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
                            onClick={() => removeMatAttachment(att.ref)}
                            className="p-1 rounded hover:bg-muted transition-colors shrink-0"
                          >
                            <X className="w-3 h-3 text-muted-foreground" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {matPendingAttachments.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      PDF, JPG or PNG — supports multiple files
                    </p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setMatDialog(false)}
                  data-ocid="project-detail.materials.cancel_button"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddMaterial}
                  data-ocid="project-detail.materials.submit_button"
                >
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit Material Purchase Dialog */}
          <Dialog
            open={!!editPurchaseId}
            onOpenChange={(o) => {
              if (!o) {
                setEditPurchaseId(null);
                setEditPurchaseForm(null);
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Material Purchase</DialogTitle>
              </DialogHeader>
              {editPurchaseForm && (
                <div className="space-y-3 py-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Material Type *</Label>
                      <Input
                        value={editPurchaseForm.materialType}
                        onChange={(e) =>
                          setEditPurchaseForm((f) =>
                            f ? { ...f, materialType: e.target.value } : f,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Thickness</Label>
                      <Input
                        value={editPurchaseForm.thickness}
                        onChange={(e) =>
                          setEditPurchaseForm((f) =>
                            f ? { ...f, thickness: e.target.value } : f,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Quantity</Label>
                      <Input
                        type="number"
                        min={0}
                        value={editPurchaseForm.quantity}
                        onChange={(e) =>
                          setEditPurchaseForm((f) =>
                            f ? { ...f, quantity: Number(e.target.value) } : f,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Unit</Label>
                      <Input
                        value={editPurchaseForm.unit}
                        onChange={(e) =>
                          setEditPurchaseForm((f) =>
                            f ? { ...f, unit: e.target.value } : f,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Purchase Date</Label>
                      <Input
                        type="date"
                        value={editPurchaseForm.purchaseDate}
                        onChange={(e) =>
                          setEditPurchaseForm((f) =>
                            f ? { ...f, purchaseDate: e.target.value } : f,
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditPurchaseId(null);
                    setEditPurchaseForm(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (!editPurchaseId || !editPurchaseForm) return;
                    const existing = materialPurchases.find(
                      (x) => x.id === editPurchaseId,
                    );
                    if (!existing) return;
                    updateMaterialPurchase({
                      ...existing,
                      ...editPurchaseForm,
                    });
                    setEditPurchaseId(null);
                    setEditPurchaseForm(null);
                    toast.success("Purchase updated");
                  }}
                >
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Tab 5 — Outsourced Work */}
        <TabsContent value="outsourced" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Outsourced Work</h2>
            {pAddOutsourced && (
              <Button
                size="sm"
                onClick={() => setOutDialog(true)}
                data-ocid="project-detail.outsourced.open_modal_button"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Outsourced
              </Button>
            )}
          </div>
          <div className="table-wrapper">
            <div
              className="rounded-md border"
              data-ocid="project-detail.outsourced.table"
            >
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-xs font-semibold">
                      Vendor
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Material Sent
                    </TableHead>
                    <TableHead className="text-xs font-semibold">Qty</TableHead>
                    <TableHead className="text-xs font-semibold">
                      Date Sent
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Date Received
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Cost
                    </TableHead>
                    {(pEdit || pDelete) && (
                      <TableHead className="text-xs font-semibold">
                        Actions
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projOutsourced.map((o, i) => (
                    <TableRow
                      key={o.id}
                      data-ocid={`project-detail.outsourced.item.${i + 1}`}
                    >
                      <TableCell className="text-sm font-medium">
                        {o.vendorName}
                      </TableCell>
                      <TableCell className="text-sm">
                        {o.materialSent}
                      </TableCell>
                      <TableCell className="text-sm">
                        {o.quantitySent}
                      </TableCell>
                      <TableCell className="text-xs">{o.dateSent}</TableCell>
                      <TableCell className="text-xs">
                        {o.dateReceived || "—"}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {fmt(o.processCost)}
                      </TableCell>
                      {(pEdit || pDelete) && (
                        <TableCell>
                          <div className="flex gap-1">
                            {pEdit && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                data-ocid={`project-detail.outsourced.edit_button.${i + 1}`}
                                onClick={() => {
                                  if (!canEdit(currentUser, "projects")) {
                                    alert("Access restricted");
                                    return;
                                  }
                                  setOutEditId(o.id);
                                  setOutForm({
                                    vendorId: o.vendorId || "",
                                    vendorName: o.vendorName,
                                    materialSent: o.materialSent || "",
                                    quantitySent: o.quantitySent || 0,
                                    dateSent: o.dateSent || "",
                                    dateReceived: o.dateReceived || "",
                                    processCost: o.processCost || 0,
                                  });
                                  setOutDialog(true);
                                }}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {pDelete && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                data-ocid={`project-detail.outsourced.delete_button.${i + 1}`}
                                onClick={() => handleDeleteOutsourced(o.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {projOutsourced.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={pEdit || pDelete ? 7 : 6}
                        className="text-center py-8 text-sm text-muted-foreground"
                        data-ocid="project-detail.outsourced.empty_state"
                      >
                        No outsourced work recorded
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Add Outsourced Dialog */}
          <Dialog
            open={outDialog}
            onOpenChange={(open) => {
              if (!open) {
                setOutDialog(false);
                setOutEditId(null);
                setOutForm({
                  vendorId: "",
                  vendorName: "",
                  materialSent: "",
                  quantitySent: 0,
                  dateSent: "",
                  dateReceived: "",
                  processCost: 0,
                });
              }
            }}
          >
            <DialogContent data-ocid="project-detail.outsourced.dialog">
              <DialogHeader>
                <DialogTitle>
                  {outEditId ? "Edit Outsourced Work" : "Add Outsourced Work"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Vendor Name *</Label>
                    <select
                      value={outForm.vendorId || ""}
                      onChange={(e) => handleVendorSelect(e.target.value)}
                      data-ocid="project-detail.outsourced.input"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Select Vendor</option>
                      {vendors.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Material Sent</Label>
                    <Input
                      placeholder="e.g. MS Sheet 2mm"
                      value={outForm.materialSent}
                      onChange={(e) =>
                        setOutForm((f) => ({
                          ...f,
                          materialSent: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Quantity Sent</Label>
                    <Input
                      type="number"
                      min={0}
                      value={outForm.quantitySent}
                      onChange={(e) =>
                        setOutForm((f) => ({
                          ...f,
                          quantitySent: Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Process Cost (₹)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={outForm.processCost}
                      onChange={(e) =>
                        setOutForm((f) => ({
                          ...f,
                          processCost: Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Date Sent</Label>
                    <Input
                      type="date"
                      value={outForm.dateSent}
                      onChange={(e) =>
                        setOutForm((f) => ({ ...f, dateSent: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Date Received</Label>
                    <Input
                      type="date"
                      value={outForm.dateReceived}
                      onChange={(e) =>
                        setOutForm((f) => ({
                          ...f,
                          dateReceived: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setOutDialog(false)}
                  data-ocid="project-detail.outsourced.cancel_button"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddOutsourced}
                  data-ocid="project-detail.outsourced.submit_button"
                >
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Tab 6 — Production Tracking */}
        <TabsContent value="production" className="mt-4 space-y-3">
          {isV2 ? (
            /* V2 Production UI */
            <div className="space-y-3">
              {(() => {
                if (project.totalQty == null) {
                  return (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-yellow-50 border border-yellow-200 text-yellow-700 text-xs font-medium">
                      ⚠ Quantity not set — please update project settings
                    </div>
                  );
                }
                const dispatchedQty = (deliveryChallans || []).reduce(
                  (sum, dc) =>
                    sum +
                    ((dc.projectEntries || []).find(
                      (e) => e.projectId === project.id,
                    )?.dispatchQty || 0),
                  0,
                );
                const progress = Math.round(
                  (dispatchedQty / project.totalQty) * 100,
                );
                return (
                  <div className="flex items-center gap-4 px-3 py-2 rounded-md bg-muted/50 border border-border text-sm">
                    <span>
                      Target: <strong>{project.totalQty} units</strong>
                    </span>
                    <span>
                      Dispatched: <strong>{dispatchedQty}</strong>
                    </span>
                    <span>
                      Progress: <strong>{progress}%</strong>
                    </span>
                  </div>
                );
              })()}
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">
                  Production Stage Tracking
                </h2>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAddStageDialog(true)}
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Stage
                </Button>
              </div>

              {v2Stages.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No stages defined. Click "Add Stage" to begin.
                </div>
              )}

              <div className="space-y-2">
                {v2Stages.map((stage, idx) => {
                  const prevStage = idx > 0 ? v2Stages[idx - 1] : null;
                  const isLocked =
                    prevStage !== null && prevStage.status !== "Completed";
                  const isExpanded = expandedStage === idx;
                  const txs = stage.transactions || [];
                  const totalSent = txs
                    .filter((t) => t.type === "send")
                    .reduce((a, t) => a + t.quantity, 0);
                  const totalReceived = txs
                    .filter((t) => t.type === "receive")
                    .reduce((a, t) => a + t.quantity, 0);
                  const pending = totalSent - totalReceived;
                  const isActive = !isLocked && stage.status !== "Completed";

                  return (
                    <div
                      key={`${stage.stageName}-${idx}`}
                      className={`rounded-lg border ${isLocked ? "opacity-60" : ""} ${isActive ? "border-blue-300 shadow-sm" : ""}`}
                    >
                      {/* Stage Header */}
                      <div className="flex items-center justify-between px-4 py-3">
                        <button
                          type="button"
                          className="flex items-center gap-3 flex-1 text-left"
                          onClick={() =>
                            !isLocked &&
                            setExpandedStage(isExpanded ? null : idx)
                          }
                          disabled={isLocked}
                        >
                          <span
                            className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${isActive ? "bg-blue-500 text-white" : "bg-muted text-muted-foreground"}`}
                          >
                            {idx + 1}
                          </span>
                          <div>
                            <span className="text-sm font-semibold">
                              {stage.stageName}
                            </span>
                            {stage.requiresMaterialTracking && (
                              <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 rounded px-1 py-0.5">
                                Material
                              </span>
                            )}
                            {isLocked && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                (locked)
                              </span>
                            )}
                          </div>
                        </button>
                        <div className="flex items-center gap-1">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium mr-2 ${STAGE_STATUS_COLORS[stage.status]}`}
                          >
                            {STAGE_STATUS_LABELS[stage.status]}
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => handleMoveStage(idx, "up")}
                            disabled={idx === 0}
                          >
                            <ChevronUp className="w-3 h-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => handleMoveStage(idx, "down")}
                            disabled={idx === v2Stages.length - 1}
                          >
                            <ChevronDown className="w-3 h-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-red-500 hover:text-red-700"
                            onClick={() => handleRemoveStage(idx)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() =>
                              !isLocked &&
                              setExpandedStage(isExpanded ? null : idx)
                            }
                            disabled={isLocked}
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* Stage Body */}
                      {isExpanded && (
                        <div className="border-t px-4 py-4 space-y-4">
                          {stage.requiresMaterialTracking ? (
                            <div className="space-y-3">
                              {/* Totals */}
                              <div className="grid grid-cols-3 gap-3">
                                <div className="bg-blue-50 border border-blue-200 rounded-md p-2 text-center">
                                  <div className="text-xs text-blue-600 font-medium">
                                    Total Sent
                                  </div>
                                  <div className="text-lg font-bold text-blue-700">
                                    {totalSent}
                                  </div>
                                </div>
                                <div className="bg-green-50 border border-green-200 rounded-md p-2 text-center">
                                  <div className="text-xs text-green-600 font-medium">
                                    Total Received
                                  </div>
                                  <div className="text-lg font-bold text-green-700">
                                    {totalReceived}
                                  </div>
                                </div>
                                <div
                                  className={`border rounded-md p-2 text-center ${pending > 0 ? "bg-orange-50 border-orange-200" : "bg-gray-50 border-gray-200"}`}
                                >
                                  <div
                                    className={`text-xs font-medium ${pending > 0 ? "text-orange-600" : "text-gray-500"}`}
                                  >
                                    Pending
                                  </div>
                                  <div
                                    className={`text-lg font-bold ${pending > 0 ? "text-orange-700" : "text-gray-600"}`}
                                  >
                                    {pending}
                                  </div>
                                </div>
                              </div>
                              {/* Actions */}
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSendMaterialDialog({ stageIdx: idx });
                                    setSendForm({
                                      quantity: 0,
                                      dateTime: "",
                                      vendorId: "",
                                      vendorName: "",
                                    });
                                  }}
                                >
                                  Send Material
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setReceiveMaterialDialog({ stageIdx: idx });
                                    setReceiveForm({
                                      quantity: 0,
                                      dateTime: "",
                                    });
                                  }}
                                  disabled={totalSent <= 0}
                                >
                                  Mark Received
                                </Button>
                                {totalReceived >= totalSent &&
                                  totalSent > 0 &&
                                  stage.status !== "Completed" && (
                                    <Button
                                      size="sm"
                                      onClick={() => handleCompleteStage(idx)}
                                    >
                                      Mark Complete
                                    </Button>
                                  )}
                              </div>
                              {/* Transaction History */}
                              {txs.length > 0 && (
                                <div className="space-y-1">
                                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                    Transaction History
                                  </p>
                                  <div className="border rounded-md overflow-hidden">
                                    <table className="w-full text-xs">
                                      <thead className="bg-muted">
                                        <tr>
                                          <th className="text-left px-2 py-1 font-medium">
                                            Type
                                          </th>
                                          <th className="text-left px-2 py-1 font-medium">
                                            Qty
                                          </th>
                                          <th className="text-left px-2 py-1 font-medium">
                                            Date & Time
                                          </th>
                                          <th className="text-left px-2 py-1 font-medium">
                                            Sent To
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {txs.map((tx) => (
                                          <tr key={tx.id} className="border-t">
                                            <td className="px-2 py-1">
                                              <span
                                                className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${tx.type === "send" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}
                                              >
                                                {tx.type === "send"
                                                  ? "Sent"
                                                  : "Received"}
                                              </span>
                                            </td>
                                            <td className="px-2 py-1">
                                              {tx.quantity}
                                            </td>
                                            <td className="px-2 py-1">
                                              {tx.dateTime
                                                ? new Date(
                                                    tx.dateTime,
                                                  ).toLocaleString("en-IN")
                                                : "—"}
                                            </td>
                                            <td className="px-2 py-1">
                                              {tx.sentToVendorName ||
                                                (tx.type === "receive"
                                                  ? "—"
                                                  : "In-house")}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            /* Non-material stage */
                            <div className="space-y-3">
                              <div className="space-y-1">
                                <Label className="text-xs">Status</Label>
                                <Select
                                  value={stage.status}
                                  onValueChange={(v) => {
                                    const updated = v2Stages.map((s, i) =>
                                      i === idx
                                        ? {
                                            ...s,
                                            status: v as ProjectStageStatus,
                                          }
                                        : s,
                                    );
                                    updateProjectStagesV2(projectId, updated);
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-xs w-40">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(
                                      [
                                        "NotStarted",
                                        "InProgress",
                                        "Completed",
                                      ] as ProjectStageStatus[]
                                    ).map((s) => (
                                      <SelectItem
                                        key={s}
                                        value={s}
                                        className="text-xs"
                                      >
                                        {STAGE_STATUS_LABELS[s]}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              {stage.status !== "Completed" && (
                                <Button
                                  size="sm"
                                  onClick={() => handleCompleteStage(idx)}
                                >
                                  Mark as Complete
                                </Button>
                              )}
                            </div>
                          )}
                          {/* Notes */}
                          <div className="space-y-1">
                            <Label className="text-xs">Notes</Label>
                            <Textarea
                              rows={2}
                              className="text-xs"
                              placeholder="Notes for this stage..."
                              value={stage.notes}
                              onChange={(e) => {
                                const updated = v2Stages.map((s, i) =>
                                  i === idx
                                    ? { ...s, notes: e.target.value }
                                    : s,
                                );
                                updateProjectStagesV2(projectId, updated);
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add Stage Dialog */}
              <Dialog open={addStageDialog} onOpenChange={setAddStageDialog}>
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle>Add Stage</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Stage Name</Label>
                      <Input
                        className="h-8 text-xs"
                        placeholder="e.g. Drilling"
                        value={newStageName}
                        onChange={(e) => setNewStageName(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="req-material"
                        checked={newStageRequiresMaterial}
                        onChange={(e) =>
                          setNewStageRequiresMaterial(e.target.checked)
                        }
                        className="w-4 h-4"
                      />
                      <Label
                        htmlFor="req-material"
                        className="text-xs cursor-pointer"
                      >
                        Requires Material Tracking
                      </Label>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAddStageDialog(false)}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleAddStage}>
                      Add
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Send Material Dialog */}
              <Dialog
                open={!!sendMaterialDialog}
                onOpenChange={(open) => !open && setSendMaterialDialog(null)}
              >
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle>Send Material</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Quantity</Label>
                      <Input
                        type="number"
                        className="h-8 text-xs"
                        min={1}
                        placeholder="0"
                        value={sendForm.quantity || ""}
                        onChange={(e) =>
                          setSendForm((f) => ({
                            ...f,
                            quantity: +e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Date & Time</Label>
                      <Input
                        type="datetime-local"
                        className="h-8 text-xs"
                        value={sendForm.dateTime}
                        onChange={(e) =>
                          setSendForm((f) => ({
                            ...f,
                            dateTime: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Sent To</Label>
                      <SentToSelect
                        vendorId={sendForm.vendorId}
                        vendorName={sendForm.vendorName}
                        onChange={(id, name) =>
                          setSendForm((f) => ({
                            ...f,
                            vendorId: id,
                            vendorName: name,
                          }))
                        }
                        stageIdx={sendMaterialDialog?.stageIdx ?? 0}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSendMaterialDialog(null)}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSendMaterial}>
                      Save
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Mark Received Dialog */}
              <Dialog
                open={!!receiveMaterialDialog}
                onOpenChange={(open) => !open && setReceiveMaterialDialog(null)}
              >
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle>Mark as Received</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Received Quantity</Label>
                      <Input
                        type="number"
                        className="h-8 text-xs"
                        min={1}
                        placeholder="0"
                        value={receiveForm.quantity || ""}
                        onChange={(e) =>
                          setReceiveForm((f) => ({
                            ...f,
                            quantity: +e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Date & Time</Label>
                      <Input
                        type="datetime-local"
                        className="h-8 text-xs"
                        value={receiveForm.dateTime}
                        onChange={(e) =>
                          setReceiveForm((f) => ({
                            ...f,
                            dateTime: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setReceiveMaterialDialog(null)}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleReceiveMaterial}>
                      Save
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          ) : (
            /* Legacy Production UI — Read-only */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">
                  Production Stage Tracking
                </h2>
                <span className="text-xs bg-yellow-100 text-yellow-700 border border-yellow-200 rounded px-2 py-0.5">
                  Legacy — Read Only
                </span>
              </div>
              <div className="rounded-md border bg-yellow-50 px-4 py-2 text-xs text-yellow-800 mb-2">
                This project uses the legacy production system. Production data
                is view-only.
              </div>
              <div className="space-y-2 pointer-events-none opacity-80">
                {stages.map((stage, idx) => {
                  const prevStage = idx > 0 ? stages[idx - 1] : null;
                  const isLocked =
                    prevStage !== null &&
                    prevStage.status !== "Completed" &&
                    prevStage.status !== "Received";
                  const isExpanded = expandedStage === idx;
                  return (
                    <div
                      key={stage.stageName}
                      className={`rounded-lg border ${isLocked ? "opacity-50" : ""}`}
                    >
                      <button
                        type="button"
                        className="w-full flex items-center justify-between px-4 py-3 text-left"
                        onClick={() =>
                          setExpandedStage(isExpanded ? null : idx)
                        }
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-bold">
                            {idx + 1}
                          </span>
                          <span className="text-sm font-semibold">
                            {stage.stageName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${STAGE_STATUS_COLORS[stage.status]}`}
                          >
                            {STAGE_STATUS_LABELS[stage.status]}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="border-t px-4 py-3 space-y-2 text-xs text-muted-foreground">
                          {stage.quantitySent > 0 && (
                            <div>Qty Sent: {stage.quantitySent}</div>
                          )}
                          {stage.receivedQuantity > 0 && (
                            <div>Qty Received: {stage.receivedQuantity}</div>
                          )}
                          {stage.sentDateTime && (
                            <div>
                              Sent:{" "}
                              {new Date(stage.sentDateTime).toLocaleString(
                                "en-IN",
                              )}
                            </div>
                          )}
                          {stage.receivedDateTime && (
                            <div>
                              Received:{" "}
                              {new Date(stage.receivedDateTime).toLocaleString(
                                "en-IN",
                              )}
                            </div>
                          )}
                          {stage.sentToVendorName && (
                            <div>Sent To: {stage.sentToVendorName}</div>
                          )}
                          {stage.notes && <div>Notes: {stage.notes}</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Tab 7 — Delivery Details */}
        <TabsContent value="delivery" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Delivery Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="del-date">Delivery Date</Label>
                  <Input
                    id="del-date"
                    type="date"
                    value={delivery.deliveryDate}
                    onChange={(e) =>
                      setDelivery((d) => ({
                        ...d,
                        deliveryDate: e.target.value,
                      }))
                    }
                    data-ocid="project-detail.delivery.input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="del-vehicle">Vehicle Number</Label>
                  <Input
                    id="del-vehicle"
                    placeholder="e.g. MH12-AB-1234"
                    value={delivery.vehicleNumber}
                    onChange={(e) =>
                      setDelivery((d) => ({
                        ...d,
                        vehicleNumber: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="del-dest">Delivery Destination</Label>
                  <Input
                    id="del-dest"
                    placeholder="Delivery address or location"
                    value={delivery.deliveryDestination}
                    onChange={(e) =>
                      setDelivery((d) => ({
                        ...d,
                        deliveryDestination: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="del-challan">Delivery Challan No</Label>
                  <Input
                    id="del-challan"
                    placeholder="e.g. DC-2026-001"
                    value={delivery.deliveryChallan}
                    onChange={(e) =>
                      setDelivery((d) => ({
                        ...d,
                        deliveryChallan: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="pt-2">
                {isAdmin && (
                  <Button
                    onClick={handleSaveDelivery}
                    data-ocid="project-detail.delivery.save_button"
                  >
                    <Save className="w-4 h-4 mr-1.5" /> Save Delivery
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 8 — Material Usage */}
        <TabsContent value="material-usage" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Material Usage</h2>
            {pCreate && (
              <Button
                size="sm"
                onClick={() => setUsageDialog(true)}
                data-ocid="project-detail.material-usage.open_modal_button"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Usage
              </Button>
            )}
          </div>

          <div className="table-wrapper">
            <div
              className="rounded-md border"
              data-ocid="project-detail.material-usage.table"
            >
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-xs font-semibold">
                      Material
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Qty Used
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Unit
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Date
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Notes
                    </TableHead>
                    <TableHead className="text-xs font-semibold w-16">
                      Del
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projUsages.map((u, i) => {
                    const invItem = inventoryItems.find(
                      (x) => x.id === u.inventoryItemId,
                    );
                    return (
                      <TableRow
                        key={u.id}
                        data-ocid={`project-detail.material-usage.item.${i + 1}`}
                      >
                        <TableCell className="font-medium text-sm">
                          {u.materialName}
                        </TableCell>
                        <TableCell className="text-sm font-mono">
                          {u.quantityUsed}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {invItem?.unit ?? ""}
                        </TableCell>
                        <TableCell className="text-xs">{u.usedDate}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {u.notes || "—"}
                        </TableCell>
                        <TableCell>
                          {pEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                setEditUsageId(u.id);
                                setEditUsageForm({
                                  quantityUsed: String(u.quantityUsed),
                                  usedDate: u.usedDate,
                                  notes: u.notes || "",
                                });
                              }}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {pDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => {
                                if (!pDelete) {
                                  alert("Access restricted");
                                  return;
                                }
                                deleteMaterialUsage(
                                  u.id,
                                  u.inventoryItemId,
                                  u.quantityUsed,
                                );
                              }}
                              data-ocid={`project-detail.material-usage.delete_button.${i + 1}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {projUsages.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center py-8 text-sm text-muted-foreground"
                        data-ocid="project-detail.material-usage.empty_state"
                      >
                        No material usage recorded for this project.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Add Usage Dialog */}
          <Dialog open={usageDialog} onOpenChange={setUsageDialog}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Record Material Usage</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Select Material *</Label>
                  <Select
                    value={usageForm.inventoryItemId}
                    onValueChange={(v) =>
                      setUsageForm((f) => ({
                        ...f,
                        inventoryItemId: v,
                        quantityUsed: "",
                      }))
                    }
                  >
                    <SelectTrigger data-ocid="project-detail.material-usage.select">
                      <SelectValue placeholder="Choose material..." />
                    </SelectTrigger>
                    <SelectContent>
                      {inventoryItems.map((item) => (
                        <SelectItem
                          key={item.id}
                          value={item.id}
                          disabled={item.quantityAvailable === 0}
                        >
                          <span
                            className={
                              item.quantityAvailable === 0 ? "opacity-40" : ""
                            }
                          >
                            {item.name} – Stock: {item.quantityAvailable}{" "}
                            {item.unit}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedUsageItem && (
                    <p className="text-xs text-muted-foreground">
                      Available:{" "}
                      <span className="font-medium text-foreground">
                        {selectedUsageItem.quantityAvailable}{" "}
                        {selectedUsageItem.unit}
                      </span>
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Quantity Used *</Label>
                  <Input
                    type="number"
                    min="1"
                    max={selectedUsageItem?.quantityAvailable ?? undefined}
                    placeholder="0"
                    value={usageForm.quantityUsed}
                    onChange={(e) =>
                      setUsageForm((f) => ({
                        ...f,
                        quantityUsed: e.target.value,
                      }))
                    }
                    data-ocid="project-detail.material-usage.input"
                  />
                  {selectedUsageItem &&
                    Number(usageForm.quantityUsed) >
                      selectedUsageItem.quantityAvailable && (
                      <p
                        className="text-xs text-destructive"
                        data-ocid="project-detail.material-usage.error_state"
                      >
                        Exceeds available stock (
                        {selectedUsageItem.quantityAvailable}{" "}
                        {selectedUsageItem.unit})
                      </p>
                    )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Date Used</Label>
                  <Input
                    type="date"
                    value={usageForm.usedDate}
                    onChange={(e) =>
                      setUsageForm((f) => ({ ...f, usedDate: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Notes</Label>
                  <Textarea
                    rows={2}
                    className="text-xs"
                    placeholder="Optional notes..."
                    value={usageForm.notes}
                    onChange={(e) =>
                      setUsageForm((f) => ({ ...f, notes: e.target.value }))
                    }
                    data-ocid="project-detail.material-usage.textarea"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setUsageDialog(false)}
                  data-ocid="project-detail.material-usage.cancel_button"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddUsage}
                  disabled={
                    !!selectedUsageItem &&
                    Number(usageForm.quantityUsed) >
                      selectedUsageItem.quantityAvailable
                  }
                  data-ocid="project-detail.material-usage.submit_button"
                >
                  Save Usage
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit Usage Dialog */}
          <Dialog
            open={!!editUsageId}
            onOpenChange={(o) => {
              if (!o) {
                setEditUsageId(null);
                setEditUsageForm(null);
              }
            }}
          >
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Edit Material Usage</DialogTitle>
              </DialogHeader>
              {editUsageForm && (
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Quantity Used *</Label>
                    <Input
                      type="number"
                      min="1"
                      value={editUsageForm.quantityUsed}
                      onChange={(e) =>
                        setEditUsageForm((f) =>
                          f ? { ...f, quantityUsed: e.target.value } : f,
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Date Used</Label>
                    <Input
                      type="date"
                      value={editUsageForm.usedDate}
                      onChange={(e) =>
                        setEditUsageForm((f) =>
                          f ? { ...f, usedDate: e.target.value } : f,
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Notes</Label>
                    <Textarea
                      rows={2}
                      className="text-xs"
                      value={editUsageForm.notes}
                      onChange={(e) =>
                        setEditUsageForm((f) =>
                          f ? { ...f, notes: e.target.value } : f,
                        )
                      }
                    />
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditUsageId(null);
                    setEditUsageForm(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (!editUsageId || !editUsageForm) return;
                    const existing = materialUsages.find(
                      (x) => x.id === editUsageId,
                    );
                    if (!existing) return;
                    updateMaterialUsage({
                      ...existing,
                      quantityUsed: Number(editUsageForm.quantityUsed),
                      usedDate: editUsageForm.usedDate,
                      notes: editUsageForm.notes,
                    });
                    setEditUsageId(null);
                    setEditUsageForm(null);
                    toast.success("Usage updated");
                  }}
                >
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Tab 9 — Bill of Materials */}
        <TabsContent value="bom" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Bill of Materials</h2>
            {pCreate && (
              <Button
                size="sm"
                onClick={openAddBom}
                data-ocid="project-detail.bom.open_modal_button"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Item
              </Button>
            )}
          </div>

          <div className="table-wrapper">
            <div
              className="rounded-md border"
              data-ocid="project-detail.bom.table"
            >
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-xs font-semibold">
                      Material
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Required Qty
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Available Stock
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Shortage
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Est. Price
                    </TableHead>
                    <TableHead className="text-xs font-semibold">
                      Est. Cost
                    </TableHead>
                    <TableHead className="text-xs font-semibold w-20">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projBomItems.map((b, i) => {
                    const inv = inventoryItems.find(
                      (x) => x.id === b.inventoryItemId,
                    );
                    const estimatedPrice = Number(b.estimatedPrice || 0);
                    const requiredQty = Number(b.requiredQuantity || 0);
                    const availableQty = Number(inv?.quantityAvailable || 0);
                    console.log({ estimatedPrice, requiredQty, availableQty });
                    const shortage = Math.max(0, requiredQty - availableQty);
                    const totalEstimatedCost = shortage * estimatedPrice;
                    return (
                      <TableRow
                        key={b.id}
                        data-ocid={`project-detail.bom.item.${i + 1}`}
                      >
                        <TableCell className="font-medium text-sm">
                          {b.materialName}
                        </TableCell>
                        <TableCell className="text-sm font-mono">
                          {requiredQty} {inv?.unit ?? ""}
                        </TableCell>
                        <TableCell className="text-sm font-mono">
                          {availableQty} {inv?.unit ?? ""}
                        </TableCell>
                        <TableCell className="text-sm font-mono">
                          {shortage > 0 ? (
                            <span className="text-destructive font-semibold">
                              {shortage} {inv?.unit ?? ""}
                            </span>
                          ) : (
                            <span className="text-green-600 dark:text-green-400 font-semibold">
                              0
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-mono">
                          ₹{estimatedPrice.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-sm font-mono">
                          {totalEstimatedCost > 0 ? (
                            <span className="text-amber-600 dark:text-amber-400 font-semibold">
                              ₹{totalEstimatedCost.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {pEdit && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => openEditBom(b)}
                                data-ocid={`project-detail.bom.edit_button.${i + 1}`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {pDelete && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (!pDelete) {
                                    alert("Access restricted");
                                    return;
                                  }
                                  deleteBomItem(b.id);
                                  toast.success("BOM item removed");
                                }}
                                data-ocid={`project-detail.bom.delete_button.${i + 1}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {projBomItems.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-8 text-sm text-muted-foreground"
                        data-ocid="project-detail.bom.empty_state"
                      >
                        No BOM items added yet. Click 'Add Item' to plan
                        materials.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Add/Edit BOM Dialog */}
          <Dialog open={bomDialog} onOpenChange={setBomDialog}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>
                  {editingBomId ? "Edit BOM Item" : "Add BOM Item"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Select Material *</Label>
                  <Select
                    value={bomForm.inventoryItemId}
                    onValueChange={(v) =>
                      setBomForm((f) => ({
                        ...f,
                        inventoryItemId: v,
                        requiredQuantity: "",
                      }))
                    }
                  >
                    <SelectTrigger data-ocid="project-detail.bom.select">
                      <SelectValue placeholder="Choose material..." />
                    </SelectTrigger>
                    <SelectContent>
                      {inventoryItems.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name} (Stock: {item.quantityAvailable}{" "}
                          {item.unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedBomItem && (
                    <p className="text-xs text-muted-foreground">
                      Available:{" "}
                      <span className="font-medium text-foreground">
                        {selectedBomItem.quantityAvailable}{" "}
                        {selectedBomItem.unit}
                      </span>
                    </p>
                  )}
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-primary"
                    onClick={() => setNewMatDialog(true)}
                    data-ocid="project-detail.bom.add_new_material_button"
                  >
                    <Plus className="w-3 h-3 mr-1" /> Add New Material
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Required Quantity *</Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="0"
                    value={bomForm.requiredQuantity}
                    onChange={(e) =>
                      setBomForm((f) => ({
                        ...f,
                        requiredQuantity: e.target.value,
                      }))
                    }
                    data-ocid="project-detail.bom.input"
                  />
                  {selectedBomItem && Number(bomForm.requiredQuantity) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Shortage:{" "}
                      <span
                        className={
                          Number(bomForm.requiredQuantity) >
                          selectedBomItem.quantityAvailable
                            ? "text-destructive font-semibold"
                            : "text-green-600 dark:text-green-400 font-semibold"
                        }
                      >
                        {Math.max(
                          0,
                          Number(bomForm.requiredQuantity) -
                            selectedBomItem.quantityAvailable,
                        )}{" "}
                        {selectedBomItem.unit}
                      </span>
                    </p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBomDialog(false)}
                  data-ocid="project-detail.bom.cancel_button"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveBom}
                  data-ocid="project-detail.bom.submit_button"
                >
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Add New Material Sub-Modal */}
          <Dialog open={newMatDialog} onOpenChange={setNewMatDialog}>
            <DialogContent className="max-w-xs">
              <DialogHeader>
                <DialogTitle>Add New Material</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Material Name *</Label>
                  <Input
                    placeholder="e.g. MS Sheet 3mm"
                    value={newMatForm.name}
                    onChange={(e) =>
                      setNewMatForm((f) => ({ ...f, name: e.target.value }))
                    }
                    data-ocid="project-detail.bom.new_material_name_input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Unit</Label>
                  <Select
                    value={newMatForm.unit}
                    onValueChange={(v) =>
                      setNewMatForm((f) => ({ ...f, unit: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        "pcs",
                        "kg",
                        "sheets",
                        "meters",
                        "liters",
                        "boxes",
                        "rolls",
                      ].map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Estimated Price (optional)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={newMatForm.estimatedPrice}
                    onChange={(e) =>
                      setNewMatForm((f) => ({
                        ...f,
                        estimatedPrice: e.target.value,
                      }))
                    }
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Material will be added to the material list with 0 stock and
                  auto-selected.
                </p>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setNewMatDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddNewMaterial}
                  data-ocid="project-detail.bom.new_material_save_button"
                >
                  Add Material
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Tab 10 — Items */}
        <TabsContent
          value="items"
          className="mt-4 space-y-4"
          data-ocid="project-detail.items.panel"
        >
          <ProjectItemsTab
            projectId={projectId}
            projectItems={projectItems}
            addProjectItem={addProjectItem}
            updateProjectItem={updateProjectItem}
            deleteProjectItem={deleteProjectItem}
            canAdd={pCreate}
            canEditItem={pEdit}
            canDelete={pDelete}
          />
        </TabsContent>

        {/* Profit & Costing Tab */}
        <TabsContent
          value="profit"
          className="mt-4 space-y-4"
          data-ocid="project-detail.profit.panel"
        >
          {(() => {
            const projectCosting = internalCostings.find(
              (c) => c.projectId === projectId,
            );
            const projectInvoices = (invoices || []).filter(
              (inv) =>
                inv.projectId === projectId && inv.invoiceType !== "proforma",
            );
            const totalRevenue = projectInvoices.reduce(
              (sum, inv) => sum + (inv.totalAmount || 0),
              0,
            );
            const projectMaterialUsages = (materialUsages || []).filter(
              (u) => u.projectId === projectId,
            );
            const materialCost = projectMaterialUsages.reduce((sum, usage) => {
              const item = (inventoryItems || []).find(
                (i) =>
                  i.id === usage.inventoryItemId ||
                  i.name.trim().toLowerCase() ===
                    (usage.materialName || "").trim().toLowerCase(),
              );
              const price = item?.lastPurchasePrice ?? 0;
              return sum + (usage.quantityUsed || 0) * price;
            }, 0);
            const labourCost = projectCosting?.labourCost ?? 0;
            const outsourceCost = projOutsourced.reduce(
              (sum, o) => sum + (o.processCost || 0),
              0,
            );
            const transportCost = projectCosting?.transportCost ?? 0;
            const customCostExtra = (projectCosting?.extraCosts || []).reduce(
              (s, c) => s + (Number(c.amount) || 0),
              0,
            );
            const pettyExpenseCost = (pettyExpenses || [])
              .filter(
                (e) =>
                  e.projectId === projectId &&
                  e.expenseMode === "Company Expense",
              )
              .reduce((s, e) => s + (Number(e.amount) || 0), 0);
            const autoCost =
              materialCost +
              labourCost +
              outsourceCost +
              transportCost +
              customCostExtra +
              pettyExpenseCost;
            const manualAdjustments = projectCosting?.manualAdjustments || [];
            const addCostTotal = manualAdjustments
              .filter((a) => a.type === "Add Cost")
              .reduce((s, a) => s + (Number(a.amount) || 0), 0);
            const reduceCostTotal = manualAdjustments
              .filter((a) => a.type === "Reduce Cost")
              .reduce((s, a) => s + (Number(a.amount) || 0), 0);
            const adjustedCost = autoCost + addCostTotal - reduceCostTotal;
            const profit = totalRevenue - adjustedCost;
            const profitPct =
              totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
            const isProfit = profit >= 0;
            const hasAdjustments = addCostTotal > 0 || reduceCostTotal > 0;
            console.log("Material Usage:", projectMaterialUsages);
            console.log("Inventory:", inventoryItems);
            console.log("Cost Calculation:", {
              materialCost,
              labourCost,
              outsourceCost,
              transportCost,
              customCostExtra,
              pettyExpenseCost,
              autoCost,
              adjustedCost,
              totalRevenue,
              profit,
            });

            return (
              <div className="space-y-4">
                {/* Revenue Card */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">
                      Total Revenue
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p
                      className="text-3xl font-bold text-blue-600"
                      data-ocid="project-detail.profit.revenue"
                    >
                      {fmt(totalRevenue)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      From {projectInvoices.length} tax invoice
                      {projectInvoices.length !== 1 ? "s" : ""}
                    </p>
                  </CardContent>
                </Card>

                {/* Cost Breakdown */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Cost Breakdown
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          Material Cost
                        </p>
                        <p className="text-xl font-bold mt-1">
                          {fmt(materialCost)}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Based on material usage × last purchase price
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          Labour Cost
                        </p>
                        <p className="text-xl font-bold mt-1">
                          {fmt(labourCost)}
                        </p>
                        {labourCost === 0 && (
                          <p className="text-[10px] text-amber-600 mt-0.5">
                            Enter in Internal Costing tab
                          </p>
                        )}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          Outsource Cost
                        </p>
                        <p className="text-xl font-bold mt-1">
                          {fmt(outsourceCost)}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          From {projOutsourced.length} outsourced work entries
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          Transport Cost
                        </p>
                        <p className="text-xl font-bold mt-1">
                          {fmt(transportCost)}
                        </p>
                        {transportCost === 0 && (
                          <p className="text-[10px] text-amber-600 mt-0.5">
                            Enter in Internal Costing tab
                          </p>
                        )}
                      </CardContent>
                    </Card>
                    {customCostExtra > 0 && (
                      <Card>
                        <CardContent className="pt-4">
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">
                            Custom Costs
                          </p>
                          <p className="text-xl font-bold mt-1">
                            {fmt(customCostExtra)}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            From {(projectCosting?.extraCosts || []).length}{" "}
                            custom entries
                          </p>
                        </CardContent>
                      </Card>
                    )}
                    {pettyExpenseCost > 0 && (
                      <Card>
                        <CardContent className="pt-4">
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">
                            Petty Expenses
                          </p>
                          <p className="text-xl font-bold mt-1">
                            {fmt(pettyExpenseCost)}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Company expenses for this project
                          </p>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>

                {/* Manual Adjustments Section */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Manual Adjustments
                      </CardTitle>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAdjForm((f) => !f)}
                        data-ocid="project-detail.profit.open_modal_button"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add Adjustment
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {showAdjForm && (
                      <div className="flex flex-wrap gap-2 p-3 bg-muted/30 rounded-md items-end">
                        <div className="flex-1 min-w-[140px] space-y-1">
                          <Label className="text-xs">Name</Label>
                          <Input
                            placeholder="Adjustment name"
                            value={adjForm.name}
                            onChange={(e) =>
                              setAdjForm((f) => ({
                                ...f,
                                name: e.target.value,
                              }))
                            }
                            className="h-8"
                            data-ocid="project-detail.profit.input"
                          />
                        </div>
                        <div className="w-28 space-y-1">
                          <Label className="text-xs">Amount (₹)</Label>
                          <Input
                            type="number"
                            min={0}
                            placeholder="0"
                            value={adjForm.amount}
                            onChange={(e) =>
                              setAdjForm((f) => ({
                                ...f,
                                amount: e.target.value,
                              }))
                            }
                            className="h-8"
                          />
                        </div>
                        <div className="w-36 space-y-1">
                          <Label className="text-xs">Type</Label>
                          <Select
                            value={adjForm.type}
                            onValueChange={(v) =>
                              setAdjForm((f) => ({
                                ...f,
                                type: v as "Add Cost" | "Reduce Cost",
                              }))
                            }
                          >
                            <SelectTrigger
                              className="h-8"
                              data-ocid="project-detail.profit.select"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Add Cost">Add Cost</SelectItem>
                              <SelectItem value="Reduce Cost">
                                Reduce Cost
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          size="sm"
                          className="h-8"
                          data-ocid="project-detail.profit.submit_button"
                          onClick={() => {
                            if (
                              !adjForm.name.trim() ||
                              !adjForm.amount ||
                              Number(adjForm.amount) <= 0
                            ) {
                              toast.error(
                                "Name and a positive amount are required.",
                              );
                              return;
                            }
                            const newAdj: ManualAdjustment = {
                              id: crypto.randomUUID(),
                              name: adjForm.name.trim(),
                              amount: Number(adjForm.amount),
                              type: adjForm.type,
                            };
                            const existing = internalCostings.find(
                              (c) => c.projectId === projectId,
                            );
                            const updated = {
                              ...(existing ?? {
                                id: `ic-${Date.now()}`,
                                projectId,
                                rawMaterialCost: 0,
                                cncCost: 0,
                                hardwareCost: 0,
                                powderCoatingCost: 0,
                                assemblyCost: 0,
                                packingCost: 0,
                              }),
                              manualAdjustments: [
                                ...(existing?.manualAdjustments || []),
                                newAdj,
                              ],
                            };
                            upsertInternalCosting(updated);
                            setAdjForm({
                              name: "",
                              amount: "",
                              type: "Add Cost",
                            });
                            setShowAdjForm(false);
                            toast.success("Adjustment added.");
                          }}
                        >
                          Save
                        </Button>
                      </div>
                    )}
                    {manualAdjustments.length === 0 ? (
                      <p
                        className="text-xs text-muted-foreground text-center py-2"
                        data-ocid="project-detail.profit.empty_state"
                      >
                        No adjustments yet.
                      </p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-muted-foreground border-b">
                            <th className="text-left pb-1">Name</th>
                            <th className="text-right pb-1">Amount</th>
                            <th className="text-center pb-1">Type</th>
                            <th className="w-8 pb-1" />
                          </tr>
                        </thead>
                        <tbody>
                          {manualAdjustments.map((adj, adjIdx) => (
                            <tr
                              key={adj.id}
                              className="border-b border-border/50 last:border-0"
                              data-ocid={`project-detail.profit.item.${adjIdx + 1}`}
                            >
                              <td className="py-1.5">{adj.name}</td>
                              <td className="py-1.5 text-right font-medium">
                                {fmt(adj.amount)}
                              </td>
                              <td className="py-1.5 text-center">
                                <span
                                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${adj.type === "Add Cost" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}
                                >
                                  {adj.type}
                                </span>
                              </td>
                              <td className="py-1.5 text-right">
                                <button
                                  type="button"
                                  data-ocid={`project-detail.profit.delete_button.${adjIdx + 1}`}
                                  onClick={() => {
                                    const existing = internalCostings.find(
                                      (c) => c.projectId === projectId,
                                    );
                                    if (!existing) return;
                                    upsertInternalCosting({
                                      ...existing,
                                      manualAdjustments: (
                                        existing.manualAdjustments || []
                                      ).filter((a) => a.id !== adj.id),
                                    });
                                    toast.success("Adjustment removed.");
                                  }}
                                  className="text-destructive hover:text-destructive/80"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {manualAdjustments.length > 0 && (
                      <div className="flex justify-between text-xs pt-1 border-t">
                        <span className="text-green-700">
                          Reduce Cost: -{fmt(reduceCostTotal)}
                        </span>
                        <span className="text-red-700">
                          Add Cost: +{fmt(addCostTotal)}
                        </span>
                        <span className="font-semibold">
                          Net: {addCostTotal >= reduceCostTotal ? "+" : ""}
                          {fmt(addCostTotal - reduceCostTotal)}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Summary */}
                <Card className="border-2">
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-center justify-between py-2 border-b border-border">
                      <span className="text-sm text-muted-foreground">
                        Auto Cost
                      </span>
                      <span className="text-lg font-bold">{fmt(autoCost)}</span>
                    </div>
                    {hasAdjustments && (
                      <>
                        <div className="flex items-center justify-between py-1 text-sm">
                          <span className="text-muted-foreground">
                            + Adjustments (Add)
                          </span>
                          <span className="text-red-600">
                            +{fmt(addCostTotal)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between py-1 text-sm border-b">
                          <span className="text-muted-foreground">
                            - Adjustments (Reduce)
                          </span>
                          <span className="text-green-600">
                            -{fmt(reduceCostTotal)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between py-1 text-sm border-b">
                          <span className="font-medium">Adjusted Cost</span>
                          <span
                            className="font-bold"
                            data-ocid="project-detail.profit.total_cost"
                          >
                            {fmt(adjustedCost)}
                          </span>
                        </div>
                      </>
                    )}
                    {!hasAdjustments && (
                      <div className="flex items-center justify-between py-2 border-b border-border">
                        <span className="text-sm text-muted-foreground">
                          Total Cost
                        </span>
                        <span
                          className="text-lg font-bold"
                          data-ocid="project-detail.profit.total_cost"
                        >
                          {fmt(adjustedCost)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm font-semibold">
                        {isProfit ? "Profit" : "Loss"}
                      </span>
                      <span
                        className={`text-2xl font-bold ${isProfit ? "text-green-600" : "text-destructive"}`}
                        data-ocid="project-detail.profit.profit_value"
                      >
                        {isProfit ? "+" : "-"}
                        {fmt(Math.abs(profit))}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2 bg-muted/30 rounded-md px-3">
                      <span className="text-sm text-muted-foreground">
                        Profit %
                      </span>
                      <span
                        className={`text-xl font-bold ${isProfit ? "text-green-600" : "text-destructive"}`}
                        data-ocid="project-detail.profit.profit_pct"
                      >
                        {totalRevenue > 0 ? `${profitPct.toFixed(1)}%` : "N/A"}
                      </span>
                    </div>
                    {totalRevenue === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-1">
                        No invoices raised yet — revenue will appear once tax
                        invoices are created.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
