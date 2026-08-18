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
import { SearchableSelect } from "@/components/ui/searchable-select";
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
import { printDocument } from "@/lib/documentUtils";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  FileText,
  Paperclip,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { ConfirmDeleteDialog } from "../components/ConfirmDeleteDialog";
import { DesignFilePreviewDialog } from "../components/DesignFilePreviewDialog";
import { ProductionStageInspectionControl } from "../components/ProductionStageInspectionControl";
import { ProjectItemsTab } from "../components/ProjectItemsTab";
import { VendorSelect } from "../components/VendorSelect";
import { WorkDrawingPreviewDialog } from "../components/WorkDrawingPreviewDialog";
import { getChildDrawings } from "../drawingEditor/api/drawings";
import { DrawingTreeRow } from "../drawingEditor/components/DrawingTreeNode";
import { buildDrawingSubtree } from "../drawingEditor/lib/drawingTree";
import { loadPdf } from "../drawingEditor/lib/pdfRenderer";
import { composeLatestView } from "../drawingEditor/lib/workOrderPreview";
import { useDrawingEditorStore } from "../drawingEditor/store/useDrawingEditorStore";
import type { DrawingDocument } from "../drawingEditor/types";
import {
  createBomItemRemote,
  deleteBomItemRemote,
  updateBomItemRemote,
} from "../lib/bomItemsApi";
import { hydrateBomRequisitions } from "../lib/hydration";
import { createInventoryItemRemote } from "../lib/inventoryApi";
import {
  createInventoryUsageRemote,
  deleteInventoryUsageRemote,
  restoreInventoryStockRemote,
  updateInventoryUsageRemote,
} from "../lib/inventoryUsagesApi";
import {
  createOutsourcedWorkRemote,
  deleteOutsourcedWorkRemote,
  updateOutsourcedWorkRemote,
} from "../lib/outsourcedWorksApi";
import {
  addProjectDieRemote,
  removeProjectDieRemote,
} from "../lib/projectDiesApi";
import {
  addProjectEmployeeRemote,
  removeProjectEmployeeRemote,
} from "../lib/projectEmployeesApi";
import {
  addProjectMachineRemote,
  removeProjectMachineRemote,
} from "../lib/projectMachineryApi";
import { updateProjectPurchaseOrderStatusRemote } from "../lib/purchaseOrdersApi";
import { getCustomerVisibleName } from "../lib/utils";
import { createVendorRemote } from "../lib/vendorsApi";
import {
  canCreate,
  canDelete,
  canEdit,
  canView,
  hasPermission,
} from "../permissions";
import { QmsGateOverrideDialog } from "../qms/components/QmsGateOverrideDialog";
import { getStageInspectionGate } from "../qms/lib/productionGate";
import { ProjectInspectionTab } from "../qms/pages/ProjectInspectionTab";
import { ProjectQmsInspectionsTab } from "../qms/pages/ProjectQmsInspectionsTab";
import { useQmsStore } from "../qms/store/useQmsStore";
import { useStore } from "../store";
import type {
  BomItem,
  DesignFile,
  InternalCosting,
  InventoryItem,
  ManualAdjustment,
  MaterialPurchase,
  MaterialUsage,
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
  onGenerateReport?: (projectId: string, projectName: string) => void;
  onOpenDrawingEditor?: (context: {
    projectId: string;
    drawingId?: string;
  }) => void;
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
  const { currentUser } = useAuth();
  // Phase 21A — this component has no prior useAuth() call; the "sent to"
  // vendor picker's quick-add gets its own vendors.create check here.
  const pCreateVendor = canCreate(currentUser, "vendors");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [isSavingVendor, setIsSavingVendor] = useState(false);

  const handleSelect = (val: string) => {
    if (val === "__add_new__") {
      if (!pCreateVendor) return;
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

  const handleAddVendor = async () => {
    // Phase 21A — defensive re-check, mirrors the trigger-hiding gate
    // below.
    if (!pCreateVendor) {
      toast.error("You do not have permission to add vendors");
      return;
    }
    if (!newVendorName.trim()) return;
    const exists = vendors.find(
      (v) => v.name.trim().toLowerCase() === newVendorName.trim().toLowerCase(),
    );
    if (exists) {
      onChange(exists.id, exists.name);
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

  const displayValue = vendorId === "inhouse" ? "inhouse" : vendorId || "";

  return (
    <>
      <SearchableSelect
        value={displayValue}
        onChange={handleSelect}
        options={[
          { value: "inhouse", label: "🏭 In-house" },
          ...vendors.map((v) => ({
            value: v.id,
            label: v.name,
            searchText: `${v.phone ?? ""} ${v.gstNumber ?? ""}`,
          })),
          ...(pCreateVendor
            ? [{ value: "__add_new__", label: "+ Add New Vendor" }]
            : []),
        ]}
        placeholder="Select..."
        searchPlaceholder="Search vendors…"
        emptyText="No vendors found."
        className="h-8 text-xs"
        data-ocid={`project-detail.production.sent_to.${stageIdx + 1}`}
        renderOption={(o) =>
          o.value === "__add_new__" ? (
            <span className="text-primary font-medium">{o.label}</span>
          ) : (
            <span className="flex-1 truncate">{o.label}</span>
          )
        }
      />

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
            <Button
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

export function ProjectDetail({
  projectId,
  onBack,
  onGenerateReport,
  onOpenDrawingEditor,
}: Props) {
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
    updateProjectPO,
    employees,
    machines,
    dies,
    billableServices,
    machineServiceUsage,
    inventoryItems,
    materialUsages,
    addMaterialUsage,
    deleteMaterialUsage,
    updateMaterialUsage,
    bomItems,
    addBomItem,
    updateBomItem,
    deleteBomItem,
    setBomRequisitionsFromServer,
    setBomRequisitionsHydrationStatus,
    projectItems,
    addProjectItem,
    updateProjectItem,
    deleteProjectItem,
    masterPOs,
    deliveryChallans,
    addInventoryItem,
    invoices,
    pettyExpenses,
    vendors,
    addProjectActivity,
    repeatProject,
    addProductionMovement,
    productionMovements,
    addAuditLog,
    settings,
  } = useStore();

  const { currentUser } = useAuth();
  const pView = canView(currentUser, "projects");
  const pEdit = canEdit(currentUser, "projects");
  const pCreate = canCreate(currentUser, "projects");
  const pDelete = canDelete(currentUser, "projects");
  const pAddOutsourced = pCreate;
  // Phase 20 — the "Add New Material" quick-add below writes a real
  // inventory_items row via the same RLS as Inventory.tsx, so it needs
  // its own inventory.create check, not the projects-module one above.
  const pCreateInventory = canCreate(currentUser, "inventory");

  const dView = canView(currentUser, "drawing_editor");
  const dEdit = canEdit(currentUser, "drawing_editor");
  const dDelete = canDelete(currentUser, "drawing_editor");
  const revView = canView(currentUser, "machine_revenue");
  // Machine/Service Revenue (Phase 40) — readonly, grouped and labeled
  // by billable *service* name only, never by machine asset name (§17,
  // §25). Reads machine_service_usage directly; never derived from or
  // written by Assigned Machinery (§11, §22 — assignment != revenue).
  const projectServiceRevenue = useMemo(() => {
    const rows = (machineServiceUsage || []).filter(
      (u) => u.projectId === projectId,
    );
    const byService = new Map<
      string,
      {
        serviceName: string;
        unit?: string;
        totalQty: number;
        totalRevenue: number;
      }
    >();
    for (const u of rows) {
      const svc = (billableServices || []).find(
        (s) => s.id === u.billableServiceId,
      );
      const key = u.billableServiceId;
      const existing = byService.get(key) ?? {
        serviceName: svc?.name ?? "Unknown Service",
        unit: svc?.unitLabel,
        totalQty: 0,
        totalRevenue: 0,
      };
      existing.totalQty += u.quantity;
      existing.totalRevenue += u.revenueAmount;
      byService.set(key, existing);
    }
    return Array.from(byService.values());
  }, [machineServiceUsage, billableServices, projectId]);
  const projectServiceRevenueTotal = projectServiceRevenue.reduce(
    (sum, r) => sum + r.totalRevenue,
    0,
  );
  const {
    drawings: allDrawings,
    loaded: drawingsLoaded,
    loadDrawings,
    deleteDrawing: deleteDrawingDoc,
    findOrCreateMasterDrawing,
  } = useDrawingEditorStore();

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount
  useEffect(() => {
    if (!drawingsLoaded) loadDrawings();
  }, [drawingsLoaded]);

  // Feeds the dispatch-readiness badge and Production Summary panel below —
  // replaces the legacy standalone Quality Inspection module's per-project
  // Approved/Rejected Qty, now sourced from QMS instead.
  const { inspectionSheets, stageCompletions, loadInspectionSheets } =
    useQmsStore();
  // Phase 32 (Task #174) - the QMS Library (InspectionStageDefinition) and
  // this project's Phase 32 inspection instances, for the Production
  // Stage "Inspection Required" linking control below. inspectionStages
  // is the same Library list StageSelector.tsx already uses;
  // projectQmsInspections is Supabase-hydrated app-wide (Task #172), no
  // manual load needed here.
  const {
    inspectionStages,
    inspectionStagesLoaded,
    loadInspectionStages,
    projectQmsInspections,
    projectQmsInspectionOverrides,
    createProjectQmsInspectionOverride,
  } = useQmsStore();
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount
  useEffect(() => {
    loadInspectionSheets();
    useQmsStore.getState().loadStageCompletions();
    if (!inspectionStagesLoaded) loadInspectionStages();
  }, []);
  const canManageInspectionLink =
    hasPermission(currentUser, "inspection_sheets.generate") ||
    hasPermission(currentUser, "inspection_sheets.complete");
  // Phase 32 (Task #176) - supervisor/admin Production-gate override.
  // Raw hasPermission() call, matching the inspection_sheets module's
  // established non-standard action vocabulary convention (see
  // canManageInspectionLink above) - admin always passes regardless of
  // this key's presence in any per-user permission map.
  const canOverrideGate = hasPermission(
    currentUser,
    "inspection_sheets.override",
  );
  const projectQmsInspectionsForThisProject = projectQmsInspections.filter(
    (i) => i.projectId === projectId,
  );
  const projectQmsInspectionOverridesForThisProject =
    projectQmsInspectionOverrides.filter((o) =>
      projectQmsInspectionsForThisProject.some(
        (i) => i.id === o.projectQmsInspectionId,
      ),
    );

  /** Sums accepted/rejected piece counts across every stage of this
   * project's current inspection sheet (highest revision — same selection
   * rule ProjectInspectionTab uses). Returns zeros if no sheet exists yet. */
  const getQualityQtyTotals = (projId: string) => {
    const projectSheets = inspectionSheets.filter(
      (s) => s.projectId === projId,
    );
    const sheet =
      projectSheets.length > 0
        ? projectSheets.reduce((latest, s) =>
            s.revision > latest.revision ? s : latest,
          )
        : undefined;
    const completions = sheet
      ? stageCompletions.filter((c) => c.sheetId === sheet.id)
      : [];
    return {
      acceptedQtyTotal: completions.reduce(
        (sum, c) => sum + (c.acceptedQty || 0),
        0,
      ),
      rejectedQtyTotal: completions.reduce(
        (sum, c) => sum + (c.rejectedQty || 0),
        0,
      ),
    };
  };

  const userId = currentUser?.id ?? "";
  const userName = currentUser?.username ?? "unknown";

  const [deleteDrawingTarget, setDeleteDrawingTarget] = useState<
    (typeof allDrawings)[number] | null
  >(null);
  const [deleteOutsourcedTarget, setDeleteOutsourcedTarget] = useState<
    string | null
  >(null);
  const [deletePurchaseTarget, setDeletePurchaseTarget] = useState<
    string | null
  >(null);

  const handleDrawingDelete = async (drawing: (typeof allDrawings)[number]) => {
    const children = await getChildDrawings(drawing.id);
    if (children.length > 0) {
      toast.error(
        `Can't delete "${drawing.fileName}" — ${children.length} Production Drawing${children.length === 1 ? "" : "s"} still linked to it. Delete those first.`,
      );
      return;
    }
    setDeleteDrawingTarget(drawing);
  };

  const handleConfirmDrawingDelete = async () => {
    const drawing = deleteDrawingTarget;
    if (!drawing) return;
    await deleteDrawingDoc(drawing.id);
    addAuditLog({
      module: "drawing_editor",
      action: "delete",
      entityId: drawing.id,
      entityLabel: drawing.fileName,
      changedBy: userName,
    });
    toast.success("Drawing deleted");
    setDeleteDrawingTarget(null);
  };

  // Legacy role aliases (kept for backward compat) - now derived from permissions
  const isRestrictedRole = !pEdit;
  const isAdmin = pEdit;
  const project = projects.find((p) => p.id === projectId);
  const customer = customers.find((c) => c.id === project?.customerId);

  const projDesignFiles = designFiles.filter((f) => f.projectId === projectId);
  const [previewFile, setPreviewFile] = useState<DesignFile | null>(null);
  const [previewWorkDrawing, setPreviewWorkDrawing] =
    useState<DrawingDocument | null>(null);
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

  // Phase 32 (Task #176) - controlled so the "Open Inspection" gate action
  // can switch straight to the QMS tab; every other tab keeps its previous
  // uncontrolled default ("overview" on first load).
  const [activeTab, setActiveTab] = useState("overview");

  // Phase 32 (Task #176) - supervisor/admin override dialog for a blocked
  // Production Stage gate. Set only when a gate-blocked "Mark Complete"
  // attempt is made by a user holding inspection_sheets.override.
  const [gateOverrideDialog, setGateOverrideDialog] = useState<{
    idx: number;
    stageName: string;
    stageId: string;
    gate: Extract<ReturnType<typeof getStageInspectionGate>, { linked: true }>;
  } | null>(null);

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

  // Phase 20 — this quick-add writes a real inventory_items row through
  // the same remote-first API/RLS boundary as Inventory.tsx's own Add
  // Material flow, gated by inventory.create (checked here defensively
  // even though the trigger button below is already hidden for
  // unauthorized users - same defense-in-depth pattern as Employees.tsx).
  const handleAddNewMaterial = async () => {
    if (!pCreateInventory) {
      toast.error("Access restricted: inventory create permission required");
      return;
    }
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
    const result = await createInventoryItemRemote({
      name: newMatForm.name.trim(),
      unit: newMatForm.unit,
      reorderLevel: undefined,
      unitCost: undefined,
      estimatedPrice: estPrice || undefined,
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
    setBomForm((f) => ({ ...f, inventoryItemId: result.data!.id }));
    setNewMatDialog(false);
    setNewMatForm({ name: "", unit: "pcs", estimatedPrice: "" });
    toast.success(`${result.data.name} added to material list`);
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

  // After any project_bom_items write, trg_project_bom_items_recompute
  // upserts/deletes the matching bom_requisitions row server-side (see
  // lib/bomItemsApi.ts) - re-hydrate bom_requisitions on demand to see
  // the result, never compute it locally anymore.
  const refreshBomRequisitions = async () => {
    const result = await hydrateBomRequisitions();
    if (result.status === "success" && result.data) {
      setBomRequisitionsFromServer(result.data);
    } else {
      setBomRequisitionsHydrationStatus(result.status, result.error);
    }
  };

  const handleSaveBom = async () => {
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
      const existing = bomItems.find((b) => b.id === editingBomId);
      if (!existing) return;
      const result = await updateBomItemRemote({
        ...existing,
        inventoryItemId: bomForm.inventoryItemId,
        materialName: invItem.name,
        requiredQuantity: qty,
        estimatedPrice: estimatedPrice,
      });
      if (result.status === "unauthenticated") {
        toast.error("Not signed in to the server - BOM item was not saved");
        return;
      }
      if (result.status === "denied" || result.status === "error") {
        toast.error(result.error ?? "Could not save BOM item");
        return;
      }
      if (!result.data) {
        toast.error("Could not save BOM item");
        return;
      }
      updateBomItem(editingBomId, result.data);
      toast.success("BOM item updated");
      await refreshBomRequisitions();
    } else {
      const result = await createBomItemRemote({
        projectId: projectId!,
        inventoryItemId: bomForm.inventoryItemId,
        materialName: invItem.name,
        requiredQuantity: qty,
        estimatedPrice: estimatedPrice,
      });
      if (result.status === "unauthenticated") {
        toast.error("Not signed in to the server - BOM item was not saved");
        return;
      }
      if (result.status === "denied" || result.status === "error") {
        toast.error(result.error ?? "Could not save BOM item");
        return;
      }
      if (!result.data) {
        toast.error("Could not save BOM item");
        return;
      }
      addBomItem(result.data);
      toast.success("BOM item added");
      await refreshBomRequisitions();
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

  const handleAddUsage = async () => {
    if (!usageForm.inventoryItemId) {
      toast.error("Please select a material");
      return;
    }
    const qty = Number(usageForm.quantityUsed);
    if (!qty || qty <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    // Fast-path client guard - the DB's trg_negative_stock is the real,
    // authoritative gate (see lib/inventoryUsagesApi.ts); this just
    // avoids an obviously-doomed round trip.
    if (selectedUsageItem && qty > selectedUsageItem.quantityAvailable) {
      toast.error(
        `Insufficient stock. Available: ${selectedUsageItem.quantityAvailable} ${selectedUsageItem.unit}`,
      );
      return;
    }
    const result = await createInventoryUsageRemote({
      projectId,
      inventoryItemId: usageForm.inventoryItemId,
      materialName: selectedUsageItem?.name ?? "",
      quantityUsed: qty,
      usedDate: usageForm.usedDate,
      notes: usageForm.notes,
    });
    if (result.status === "unauthenticated") {
      toast.error("Not signed in to the server - usage was not saved");
      return;
    }
    if (result.status === "denied" || result.status === "error") {
      toast.error(result.error ?? "Insufficient stock. Cannot save usage.");
      return;
    }
    if (!result.data) {
      toast.error("Could not save usage");
      return;
    }
    addMaterialUsage(result.data);
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

  const [adjForm, setAdjForm] = useState<{
    name: string;
    amount: string;
    type: "Add Cost" | "Reduce Cost";
  }>({ name: "", amount: "", type: "Add Cost" });
  const [showAdjForm, setShowAdjForm] = useState(false);

  // Repeat Order state
  const [repeatDialog, setRepeatDialog] = useState(false);
  const [repeatForm, setRepeatForm] = useState({
    newName: "",
    copyDesignFiles: true,
    copyBOM: true,
    copyCosting: true,
    copyStages: true,
    copyQC: true,
    copyNotes: true,
  });
  // WIP Move Qty state
  const [moveQtyDialog, setMoveQtyDialog] = useState(false);
  const [moveForm, setMoveForm] = useState({
    fromStage: "",
    toStage: "",
    qty: 0,
    notes: "",
  });

  const openRepeatOrder = () => {
    if (!project) return;
    const rootId =
      project.parentProjectId || project.sourceProjectId || project.id;
    const existingRepeats = (projects || []).filter(
      (p) => p.parentProjectId === rootId || p.sourceProjectId === rootId,
    ).length;
    const nextSeq = existingRepeats + 1;
    const baseName = getCustomerVisibleName(project);
    const internalCode = `ORD-${String(nextSeq).padStart(3, "0")}`;
    setRepeatForm({
      newName: `${baseName} - ${internalCode}`,
      copyDesignFiles: true,
      copyBOM: true,
      copyCosting: true,
      copyStages: true,
      copyQC: true,
      copyNotes: true,
    });
    setRepeatDialog(true);
  };

  const handleCreateRepeatOrder = async () => {
    if (!project) return;
    if (!repeatForm.newName.trim()) {
      toast.error("Project name is required");
      return;
    }
    const newId = await repeatProject(project.id, repeatForm);
    if (newId) {
      toast.success(`Repeat order "${repeatForm.newName}" created`);
      setRepeatDialog(false);
    } else {
      toast.error("Failed to create repeat order");
    }
  };

  // Phase 27 Batch 2 — the standalone "Add PO" flow was retired: DB
  // project_purchase_orders.master_po_id is NOT NULL by design (see
  // database/phase-03/phase3_quotations_company_pos_FINAL.sql), so every
  // project PO must now originate from a Quotation's "Record PO" flow,
  // which always creates a real master_pos row first. Explicit user
  // decision (Phase 27 Batch 2) - not a silent removal.
  const handleUpdatePOStatus = async (
    po: ProjectPO,
    newStatus: ProjectPOStatus,
  ) => {
    if (!project) return;
    const result = await updateProjectPurchaseOrderStatusRemote(
      po.id,
      newStatus,
    );
    if (result.status === "unauthenticated") {
      toast.error("Not signed in to the server - status was not updated");
      return;
    }
    if (result.status === "denied" || result.status === "error") {
      toast.error(result.error ?? "Could not update PO status");
      return;
    }
    if (!result.data) {
      toast.error("Could not update PO status");
      return;
    }
    updateProjectPO(project.id, result.data.po);
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

  /** "Edit" on a Design File — the original upload is never touched.
   * Resolves the file's existing Master Drawing (if this is a repeat
   * click) or promotes it into a new one, then opens the Engineering
   * Drawing Editor in Context Mode already pointed at it.
   *
   * Phase 34 (Universal Edit) — PDF, DXF, and PNG/JPG/JPEG all route
   * through this exact same Master Drawing + Drawing Editor pipeline;
   * `sourceKind` only changes how the editor's loading step interprets
   * the blob (see drawingEditor/pages/DrawingEditorPage.tsx's
   * openDrawing/loadPage). Every other format (DOCX, XLSX/XLS, CSV, TXT,
   * and anything else) has no editing surface at all — per the approved
   * scope, Edit simply opens the same existing Preview those types
   * already use, with a toast explaining why, rather than doing nothing. */
  const handleEditDesignFile = async (f: DesignFile) => {
    const lowerName = f.fileName.toLowerCase();
    const isPdf =
      f.fileType === "application/pdf" || lowerName.endsWith(".pdf");
    const isDxf = lowerName.endsWith(".dxf");
    const isImage =
      f.fileType.startsWith("image/") ||
      lowerName.endsWith(".png") ||
      lowerName.endsWith(".jpg") ||
      lowerName.endsWith(".jpeg");

    if (!isPdf && !isDxf && !isImage) {
      toast.error(
        "Editing isn't available for this file type — opening Preview instead.",
      );
      setPreviewFile(f);
      return;
    }

    try {
      const blob = await (await fetch(f.fileData)).blob();
      let numPages = 1;
      if (isPdf) {
        const pdf = await loadPdf(blob);
        numPages = pdf.numPages;
      }
      const master = await findOrCreateMasterDrawing({
        sourceDesignFileId: f.id,
        fileName: f.fileName,
        pdfBlob: blob,
        numPages,
        uploadedBy: userId,
        uploadedByName: userName,
        ownerType: "project",
        ownerId: projectId,
        sourceKind: isPdf ? "pdf" : isDxf ? "dxf" : "image",
      });
      onOpenDrawingEditor?.({ projectId, drawingId: master.id });
    } catch {
      toast.error("Could not open this file in the Drawing Editor.");
    }
  };

  /** Prints exactly what Preview would show for a Work Drawing — composed
   * fresh from its latest saved state, no export dialog. */
  const handlePrintWorkDrawing = async (drawing: DrawingDocument) => {
    const canvas = await composeLatestView(drawing, {
      companyName: settings?.companyName || "Your Company",
      companyLogoDataUrl: settings?.companyLogo || undefined,
    });
    if (!canvas) {
      toast.error(`"${drawing.fileName}" hasn't been saved yet.`);
      return;
    }
    const containerId = `work-drawing-print-${Date.now()}`;
    const container = document.createElement("div");
    container.id = containerId;
    container.style.cssText = "position:fixed;left:-9999px;top:-9999px;";
    const img = document.createElement("img");
    img.src = canvas.toDataURL("image/png");
    img.style.cssText = "display:block;width:100%;";
    container.appendChild(img);
    document.body.appendChild(container);
    await printDocument(containerId);
    container.remove();
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

  const handleAddOutsourced = async () => {
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
      const result = await updateOutsourcedWorkRemote({
        id: outEditId,
        projectId: project.id,
        ...outForm,
      });
      if (result.status === "unauthenticated") {
        toast.error(
          "Not signed in to the server - outsourced work was not saved",
        );
        return;
      }
      if (result.status === "denied" || result.status === "error") {
        toast.error(result.error ?? "Could not save outsourced work");
        return;
      }
      if (!result.data) {
        toast.error("Could not save outsourced work");
        return;
      }
      updateOutsourcedWork(result.data);
      toast.success("Outsourced work updated");
      resetForm();
    } else {
      if (!pAddOutsourced) {
        alert("Access restricted");
        return;
      }
      const result = await createOutsourcedWorkRemote({
        projectId: project.id,
        ...outForm,
      });
      if (result.status === "unauthenticated") {
        toast.error(
          "Not signed in to the server - outsourced work was not saved",
        );
        return;
      }
      if (result.status === "denied" || result.status === "error") {
        toast.error(result.error ?? "Could not save outsourced work");
        return;
      }
      if (!result.data) {
        toast.error("Could not save outsourced work");
        return;
      }
      addOutsourcedWork(result.data);
      toast.success("Outsourced work recorded");
      resetForm();
    }
  };

  const handleDeleteOutsourced = (id: string) => {
    if (!pDelete) {
      alert("Access restricted");
      return;
    }
    setDeleteOutsourcedTarget(id);
  };

  const handleConfirmDeleteOutsourced = async () => {
    const id = deleteOutsourcedTarget;
    if (!id) return;
    const result = await deleteOutsourcedWorkRemote(id);
    if (result.status === "unauthenticated") {
      toast.error(
        "Not signed in to the server - outsourced work was not deleted",
      );
      setDeleteOutsourcedTarget(null);
      return;
    }
    if (result.status === "denied" || result.status === "error") {
      toast.error(result.error ?? "Could not delete outsourced work");
      setDeleteOutsourcedTarget(null);
      return;
    }
    deleteOutsourcedWork(id);
    toast.success("Outsourced work deleted");
    setDeleteOutsourcedTarget(null);
  };

  const _handleSaveProduction = async () => {
    const prod: ProjectProduction = {
      id: existingProduction?.id ?? `pp-${Date.now()}`,
      projectId,
      stages,
    };
    const ok = await upsertProjectProduction(prod);
    if (ok) {
      toast.success("Production status saved");
    } else {
      toast.error("Could not save production status - please try again");
    }
  };

  const handleSendMaterial = async () => {
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
    const ok = await addStageTransaction(
      projectId,
      sendMaterialDialog.stageIdx,
      tx,
    );
    if (!ok) {
      toast.error("Could not record material sent - please try again");
      return;
    }
    setSendMaterialDialog(null);
    setSendForm({ quantity: 0, dateTime: "", vendorId: "", vendorName: "" });
    toast.success("Material sent recorded");
  };

  const handleReceiveMaterial = async () => {
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
    const ok = await addStageTransaction(
      projectId,
      receiveMaterialDialog.stageIdx,
      tx,
    );
    if (!ok) {
      toast.error("Could not record material received - please try again");
      return;
    }
    setReceiveMaterialDialog(null);
    setReceiveForm({ quantity: 0, dateTime: "" });
    toast.success("Material received recorded");
  };

  const handleAddStage = async () => {
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
      // Phase 32 (Task #173) - stable identity, generated once here, never
      // touched by reorder/edit/remove.
      stageId: crypto.randomUUID(),
    };
    const ok = await updateProjectStagesV2(projectId, [...v2Stages, newStage]);
    if (!ok) {
      toast.error("Could not add stage - please try again");
      return;
    }
    setAddStageDialog(false);
    setNewStageName("");
    setNewStageRequiresMaterial(false);
    toast.success("Stage added");
  };

  const handleRemoveStage = async (idx: number) => {
    const removedStage = v2Stages[idx];
    const updated = v2Stages.filter((_, i) => i !== idx);
    const ok = await updateProjectStagesV2(projectId, updated);
    if (!ok) {
      toast.error("Could not remove stage - please try again");
      return;
    }
    toast.success("Stage removed");

    // Phase 32 (Task #174) - approved rule: deleting a Production Stage
    // must not delete its linked QMS inspection or history, only the
    // stage-relationship. Clear the link (never the inspection itself)
    // if this stage had one - the inspection remains in the project's
    // QMS data, now independent, exactly as if it had never been linked.
    if (removedStage.stageId) {
      const linked = projectQmsInspectionsForThisProject.find(
        (i) => i.requiredProductionStageId === removedStage.stageId,
      );
      if (linked) {
        useQmsStore.getState().updateProjectQmsInspection(linked.id, {
          requiredProductionStageId: null,
        });
      }
    }
  };

  const handleMoveStage = async (idx: number, dir: "up" | "down") => {
    const updated = [...v2Stages];
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= updated.length) return;
    [updated[idx], updated[target]] = [updated[target], updated[idx]];
    const ok = await updateProjectStagesV2(projectId, updated);
    if (!ok) toast.error("Could not reorder stages - please try again");
  };

  const handleCompleteStage = async (idx: number) => {
    const stage = v2Stages[idx];
    // Phase 32 (Task #176) - QMS inspection gate: an additional condition
    // alongside whatever validation already applies to this stage. Follows
    // the inspection's server-derived status only (rule §6) - never
    // recalculated here.
    const gate = getStageInspectionGate(
      stage?.stageId,
      projectQmsInspectionsForThisProject,
      projectQmsInspectionOverridesForThisProject,
    );
    if (gate.linked && !gate.canProceed) {
      if (canOverrideGate) {
        setGateOverrideDialog({
          idx,
          stageName: stage.stageName,
          stageId: stage.stageId as string,
          gate,
        });
      } else {
        toast.error(
          `Cannot complete "${stage.stageName}": ${gate.blockReason}`,
        );
      }
      return;
    }
    const updated = v2Stages.map((s, i) =>
      i === idx ? { ...s, status: "Completed" as ProjectStageStatus } : s,
    );
    const ok = await updateProjectStagesV2(projectId, updated);
    if (ok) {
      toast.success("Stage marked complete");
    } else {
      toast.error("Could not save stage completion - please try again");
    }
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
            <h1 className="text-xl font-bold">
              {getCustomerVisibleName(project)}
            </h1>
            {project.internalOrderCode && (
              <span className="text-xs font-mono text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">
                {project.internalOrderCode}
              </span>
            )}
            {(() => {
              const prodRecord = projectProductions.find(
                (pp) => pp.projectId === project.id,
              );
              const pStages = prodRecord?.stages || [];
              const { acceptedQtyTotal, rejectedQtyTotal } =
                getQualityQtyTotals(project.id);
              const hasRework = pStages.some(
                (s) => s.isRework && s.status !== "Completed",
              );
              const allProduced =
                pStages.filter((s) => !s.isRework).length > 0 &&
                pStages
                  .filter((s) => !s.isRework)
                  .every((s) => s.status === "Completed");
              const hasRejected =
                rejectedQtyTotal > 0 && acceptedQtyTotal === 0;
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
        {pCreate && (
          <button
            type="button"
            onClick={openRepeatOrder}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card hover:bg-muted text-sm font-medium transition-colors"
            title="Create repeat order from this project"
          >
            <Plus className="w-4 h-4" />
            Repeat Order
          </button>
        )}
        {onGenerateReport && (
          <button
            type="button"
            onClick={() => onGenerateReport(project.id, project.projectName)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card hover:bg-muted text-sm font-medium transition-colors"
            title="Generate project report / dossier"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14,2 14,8 20,8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10,9 9,9 8,9" />
            </svg>
            Generate Report
          </button>
        )}
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        data-ocid="project-detail.panel"
      >
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
              <TabsTrigger
                value="inspection"
                data-ocid="project-detail.inspection.tab"
              >
                Inspection
              </TabsTrigger>
              <TabsTrigger value="qms" data-ocid="project-detail.qms.tab">
                QMS
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
              <TabsTrigger
                value="timeline"
                data-ocid="project-detail.timeline.tab"
              >
                Timeline
              </TabsTrigger>
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
              {project.projectType === "REPEAT_ORDER" && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Repeat Order
                  </p>
                  <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium">
                      <span className="font-mono">
                        {project.internalOrderCode}
                      </span>
                      <span>·</span>
                      <span>
                        Internal tracking code — not shown to customer
                      </span>
                    </span>
                    {project.originalProjectName && (
                      <span className="text-xs text-muted-foreground">
                        Customer sees:{" "}
                        <strong>{project.originalProjectName}</strong>
                      </span>
                    )}
                  </div>
                </div>
              )}
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
                const { acceptedQtyTotal: approvedQtyTotal, rejectedQtyTotal } =
                  getQualityQtyTotals(project.id);
                const producedQty = pStages
                  .filter((s) => s.status === "Completed" && !s.isRework)
                  .reduce((sum, s) => sum + (s.receivedQty || 0), 0);
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
                  <p className="text-[11px] text-muted-foreground">
                    Recorded from the Quotations module
                  </p>
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
                            onClick={async () => {
                              // Diff-based single-pair write, never a
                              // wholesale replace of the join table (see
                              // lib/projectEmployeesApi.ts).
                              const result = isAssigned
                                ? await removeProjectEmployeeRemote(
                                    project.id,
                                    emp.id,
                                  )
                                : await addProjectEmployeeRemote(
                                    project.id,
                                    emp.id,
                                  );
                              if (result.status === "unauthenticated") {
                                toast.error(
                                  "Not signed in to the server - assignment was not saved",
                                );
                                return;
                              }
                              if (
                                result.status === "denied" ||
                                result.status === "error"
                              ) {
                                toast.error(
                                  result.error ??
                                    "Could not save employee assignment",
                                );
                                return;
                              }
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
              {isAdmin && (
                <div className="sm:col-span-2 pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
                    Assigned Machinery
                  </p>
                  <p className="text-[11px] text-muted-foreground mb-2">
                    Planning only — assigning a machine here does not create
                    usage or revenue.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {machines.map((m) => {
                      const isAssigned =
                        project.assignedMachineIds?.includes(m.id) ?? false;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={async () => {
                            // Diff-based single-pair write, never a
                            // wholesale replace of the join table (see
                            // lib/projectMachineryApi.ts).
                            const result = isAssigned
                              ? await removeProjectMachineRemote(
                                  project.id,
                                  m.id,
                                )
                              : await addProjectMachineRemote(project.id, m.id);
                            if (result.status === "unauthenticated") {
                              toast.error(
                                "Not signed in to the server - assignment was not saved",
                              );
                              return;
                            }
                            if (
                              result.status === "denied" ||
                              result.status === "error"
                            ) {
                              toast.error(
                                result.error ??
                                  "Could not save machine assignment",
                              );
                              return;
                            }
                            const current = project.assignedMachineIds ?? [];
                            const updated = isAssigned
                              ? current.filter((id) => id !== m.id)
                              : [...current, m.id];
                            updateProject({
                              ...project,
                              assignedMachineIds: updated,
                            });
                          }}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                            isAssigned
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background text-muted-foreground border-border hover:border-primary hover:text-primary"
                          }`}
                          data-ocid="project-detail.assign-machine.toggle"
                        >
                          {m.name} ({m.machineCode})
                        </button>
                      );
                    })}
                    {machines.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No machines registered
                      </p>
                    )}
                  </div>
                </div>
              )}
              {isAdmin && (
                <div className="sm:col-span-2 pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
                    Assigned Dies/Tooling
                  </p>
                  <p className="text-[11px] text-muted-foreground mb-2">
                    Dies are reusable — assigning here is a planning reference
                    only, not ownership.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {dies.map((d) => {
                      const isAssigned =
                        project.assignedDieIds?.includes(d.id) ?? false;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={async () => {
                            // Diff-based single-pair write, never a
                            // wholesale replace of the join table (see
                            // lib/projectDiesApi.ts).
                            const result = isAssigned
                              ? await removeProjectDieRemote(project.id, d.id)
                              : await addProjectDieRemote(project.id, d.id);
                            if (result.status === "unauthenticated") {
                              toast.error(
                                "Not signed in to the server - assignment was not saved",
                              );
                              return;
                            }
                            if (
                              result.status === "denied" ||
                              result.status === "error"
                            ) {
                              toast.error(
                                result.error ?? "Could not save die assignment",
                              );
                              return;
                            }
                            const current = project.assignedDieIds ?? [];
                            const updated = isAssigned
                              ? current.filter((id) => id !== d.id)
                              : [...current, d.id];
                            updateProject({
                              ...project,
                              assignedDieIds: updated,
                            });
                          }}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                            isAssigned
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background text-muted-foreground border-border hover:border-primary hover:text-primary"
                          }`}
                          data-ocid="project-detail.assign-die.toggle"
                        >
                          {d.name} ({d.dieCode})
                        </button>
                      );
                    })}
                    {dies.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No dies registered
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {revView && projectServiceRevenue.length > 0 && (
            <Card data-ocid="project-detail.service_revenue.card">
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                  Machine / Service Revenue
                </p>
                <p className="text-[11px] text-muted-foreground mb-3">
                  Revenue only — separate from Profit &amp; Costing. Labeled by
                  billable service, never by machine asset.
                </p>
                <div className="space-y-2">
                  {projectServiceRevenue.map((r) => (
                    <div
                      key={r.serviceName}
                      className="flex items-center justify-between text-sm border-b border-border/60 pb-1.5 last:border-0"
                    >
                      <span>
                        {r.serviceName} — {r.totalQty} {r.unit || ""}
                      </span>
                      <span className="font-medium text-green-700">
                        ₹
                        {r.totalRevenue.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-sm font-semibold pt-1">
                    <span>Total</span>
                    <span className="text-green-700">
                      ₹
                      {projectServiceRevenueTotal.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
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
                      Uploaded
                    </TableHead>
                    <TableHead className="text-xs font-semibold w-24">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projDesignFiles.map((f, i) => {
                    // Read-only lookup — never findOrCreateMasterDrawing,
                    // which would create a hidden Working Drawing just from
                    // rendering this list. Only Edit (below) may create one.
                    const master = allDrawings.find(
                      (d) => d.sourceDesignFileId === f.id,
                    );
                    const workDrawings = master
                      ? buildDrawingSubtree(master, allDrawings).children
                      : [];
                    return (
                      <Fragment key={f.id}>
                        <TableRow
                          data-ocid={`project-detail.design.item.${i + 1}`}
                        >
                          <TableCell className="text-sm font-medium">
                            <div className="flex items-center gap-1.5">
                              <span>{f.fileName}</span>
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1 py-0"
                              >
                                Original
                              </Badge>
                              {master && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1 py-0 border-blue-400 text-blue-600"
                                >
                                  Edited
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(f.uploadedAt).toLocaleDateString("en-IN")}
                          </TableCell>
                          <TableCell className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2"
                              onClick={() =>
                                master
                                  ? setPreviewWorkDrawing(master)
                                  : setPreviewFile(f)
                              }
                              title={
                                master
                                  ? "Preview — latest saved edited version"
                                  : "Preview Original"
                              }
                              data-ocid={`project-detail.design.preview_button.${i + 1}`}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            {master && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2"
                                onClick={() => setPreviewFile(f)}
                                title="Preview Original — untouched uploaded file"
                                data-ocid={`project-detail.design.preview_original_button.${i + 1}`}
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {dEdit && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2"
                                onClick={() => handleEditDesignFile(f)}
                                title="Edit"
                                data-ocid={`project-detail.design.edit_button.${i + 1}`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2"
                              onClick={() => handleDownloadFile(f)}
                              title="Download Original"
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
                        {dView &&
                          workDrawings.map((child) => (
                            <DrawingTreeRow
                              key={child.drawing.id}
                              node={child}
                              depth={1}
                              canEdit={dEdit}
                              canDelete={dDelete}
                              onOpen={(d) =>
                                onOpenDrawingEditor?.({
                                  projectId,
                                  drawingId: d.id,
                                })
                              }
                              onDelete={handleDrawingDelete}
                              onPreview={setPreviewWorkDrawing}
                              onPrint={handlePrintWorkDrawing}
                              showRename={false}
                              showLink={false}
                              showDuplicate={false}
                              openLabel="Edit"
                              compact
                            />
                          ))}
                      </Fragment>
                    );
                  })}
                  {projDesignFiles.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={3}
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
          <DesignFilePreviewDialog
            file={previewFile}
            open={!!previewFile}
            onOpenChange={(o) => !o && setPreviewFile(null)}
            onDownload={handleDownloadFile}
          />
          <WorkDrawingPreviewDialog
            drawing={previewWorkDrawing}
            open={!!previewWorkDrawing}
            onOpenChange={(o) => !o && setPreviewWorkDrawing(null)}
            company={{
              companyName: settings?.companyName || "Your Company",
              companyLogoDataUrl: settings?.companyLogo || undefined,
            }}
          />
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
                    ["machineCost", "Machine / Equipment Cost"],
                    ["outsourceCost", "Outsourced Work Cost"],
                    ["consumablesCost", "Consumables Cost"],
                    ["electricityCost", "Electricity Cost"],
                    ["scrapLossCost", "Scrap / Material Loss"],
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
                                onClick={() => setDeletePurchaseTarget(m.id)}
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
                    <VendorSelect
                      value={outForm.vendorId || ""}
                      onChange={(id) => handleVendorSelect(id)}
                      placeholder="Select Vendor"
                      className="w-full"
                      data-ocid="project-detail.outsourced.input"
                    />
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
                            {stage.stageId &&
                              projectQmsInspectionsForThisProject.some(
                                (i) =>
                                  i.requiredProductionStageId === stage.stageId,
                              ) && (
                                <span
                                  className="ml-2 text-[10px] bg-blue-100 text-blue-700 rounded px-1 py-0.5"
                                  data-ocid={`project-detail.production.inspection_badge.${stage.stageId}`}
                                >
                                  Inspection Required
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
                          {/* Phase 32 (Task #174) - QMS inspection link.
                           * Optional, independent of material tracking.
                           * Task #176 added the actual gate enforcement
                           * (handleCompleteStage above) and the read-only
                           * gate status this control now displays. */}
                          {stage.stageId && (
                            <div className="border rounded-md px-3 py-2 bg-muted/20">
                              <ProductionStageInspectionControl
                                projectId={projectId}
                                stageId={stage.stageId}
                                stageName={stage.stageName}
                                libraryInspections={inspectionStages}
                                projectInspections={
                                  projectQmsInspectionsForThisProject
                                }
                                projectOverrides={
                                  projectQmsInspectionOverridesForThisProject
                                }
                                onOpenInspection={() => setActiveTab("qms")}
                                currentUserId={userId}
                                currentUserName={userName}
                                canManage={canManageInspectionLink}
                              />
                            </div>
                          )}
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
                                  onValueChange={async (v) => {
                                    // Phase 32 (Task #176) - "Completed" is
                                    // the one transition the QMS gate can
                                    // block, so route it through the same
                                    // gated handler the "Mark as Complete"
                                    // button already uses below, instead of
                                    // writing the status directly here.
                                    if (v === "Completed") {
                                      handleCompleteStage(idx);
                                      return;
                                    }
                                    const updated = v2Stages.map((s, i) =>
                                      i === idx
                                        ? {
                                            ...s,
                                            status: v as ProjectStageStatus,
                                          }
                                        : s,
                                    );
                                    const ok = await updateProjectStagesV2(
                                      projectId,
                                      updated,
                                    );
                                    if (!ok) {
                                      toast.error(
                                        "Could not save stage status - please try again",
                                      );
                                    }
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

                              {/* Quantity Tracking */}
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                    Quantity Tracking
                                  </p>
                                  {project?.totalQty && (
                                    <span className="text-xs text-muted-foreground">
                                      Ordered:{" "}
                                      <strong>{project.totalQty}</strong>
                                    </span>
                                  )}
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                  {[
                                    {
                                      label: "Input Qty",
                                      field: "sentQty" as const,
                                      color:
                                        "bg-blue-50 border-blue-200 text-blue-700",
                                    },
                                    {
                                      label: "Completed",
                                      field: "okQty" as const,
                                      color:
                                        "bg-green-50 border-green-200 text-green-700",
                                    },
                                    {
                                      label: "Rejected",
                                      field: "rejectedQty" as const,
                                      color:
                                        "bg-red-50 border-red-200 text-red-700",
                                    },
                                    {
                                      label: "Rework",
                                      field: "reworkQty" as const,
                                      color:
                                        "bg-orange-50 border-orange-200 text-orange-700",
                                    },
                                  ].map(({ label, field, color }) => (
                                    <div
                                      key={field}
                                      className={`rounded-md border p-2 ${color}`}
                                    >
                                      <p className="text-[10px] font-medium mb-1">
                                        {label}
                                      </p>
                                      <input
                                        key={`${stage.stageId ?? idx}-${field}`}
                                        type="number"
                                        min={0}
                                        className="w-full bg-transparent text-sm font-bold border-none outline-none p-0"
                                        defaultValue={stage[field] ?? 0}
                                        // Fires on blur, not on every
                                        // keystroke - now that this goes
                                        // through the remote-first
                                        // updateProjectStagesV2, awaiting a
                                        // network round-trip per digit
                                        // typed would make the field
                                        // lag/drop keystrokes (same fix as
                                        // the Notes textarea above).
                                        onBlur={async (e) => {
                                          const nextValue = Math.max(
                                            0,
                                            Number(e.target.value),
                                          );
                                          if ((stage[field] ?? 0) === nextValue)
                                            return;
                                          const updated = v2Stages.map(
                                            (s, i) =>
                                              i === idx
                                                ? { ...s, [field]: nextValue }
                                                : s,
                                          );
                                          const ok =
                                            await updateProjectStagesV2(
                                              projectId,
                                              updated,
                                            );
                                          if (!ok) {
                                            toast.error(
                                              `Could not save ${label} - please try again`,
                                            );
                                          }
                                        }}
                                      />
                                    </div>
                                  ))}
                                </div>
                                {/* Balance — auto-calculated */}
                                {(() => {
                                  const input = stage.sentQty ?? 0;
                                  const completed = stage.okQty ?? 0;
                                  const rejected = stage.rejectedQty ?? 0;
                                  const rework = stage.reworkQty ?? 0;
                                  const balance = Math.max(
                                    0,
                                    input - completed - rejected - rework,
                                  );
                                  const stageMoves = (
                                    productionMovements || []
                                  ).filter(
                                    (m) =>
                                      m.projectId === projectId &&
                                      (m.fromStage === stage.stageName ||
                                        m.toStage === stage.stageName),
                                  );
                                  return (
                                    <>
                                      {input > 0 && (
                                        <div
                                          className={`mt-2 flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium ${balance > 0 ? "bg-amber-50 border border-amber-200 text-amber-700" : "bg-green-50 border border-green-200 text-green-700"}`}
                                        >
                                          <span>
                                            Balance: <strong>{balance}</strong>
                                          </span>
                                          {balance === 0 && completed > 0 && (
                                            <span>· Stage fully accounted</span>
                                          )}
                                        </div>
                                      )}
                                      {stageMoves.length > 0 && (
                                        <div className="mt-1.5 text-[11px] text-muted-foreground">
                                          {stageMoves.map((m) => (
                                            <span
                                              key={m.id}
                                              className="inline-flex items-center gap-1 mr-2"
                                            >
                                              {m.fromStage === stage.stageName
                                                ? `→ ${m.toStage}: ${m.qty}`
                                                : `← ${m.fromStage}: ${m.qty}`}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>

                              <div className="flex items-center gap-2 flex-wrap">
                                {stage.status !== "Completed" && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleCompleteStage(idx)}
                                  >
                                    Mark as Complete
                                  </Button>
                                )}
                                {pEdit && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setMoveForm({
                                        fromStage: stage.stageName,
                                        toStage: "",
                                        qty: 0,
                                        notes: "",
                                      });
                                      setMoveQtyDialog(true);
                                    }}
                                  >
                                    Move Qty →
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                          {/* Notes */}
                          <div className="space-y-1">
                            <Label className="text-xs">Notes</Label>
                            <Textarea
                              key={stage.stageId ?? idx}
                              rows={2}
                              className="text-xs"
                              placeholder="Notes for this stage..."
                              defaultValue={stage.notes}
                              // Fires on blur, not on every keystroke - see
                              // the matching fix earlier in this file.
                              onBlur={async (e) => {
                                if (stage.notes === e.target.value) return;
                                const updated = v2Stages.map((s, i) =>
                                  i === idx
                                    ? { ...s, notes: e.target.value }
                                    : s,
                                );
                                const ok = await updateProjectStagesV2(
                                  projectId,
                                  updated,
                                );
                                if (!ok) {
                                  toast.error(
                                    "Could not save notes - please try again",
                                  );
                                }
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

              {/* Phase 32 (Task #176) - Supervisor/admin QMS gate override */}
              {gateOverrideDialog && (
                <QmsGateOverrideDialog
                  open={!!gateOverrideDialog}
                  onOpenChange={(open) => !open && setGateOverrideDialog(null)}
                  stageName={gateOverrideDialog.stageName}
                  inspectionName={
                    gateOverrideDialog.gate.inspection.libraryInspectionName
                  }
                  blockReason={gateOverrideDialog.gate.blockReason ?? ""}
                  onConfirm={async (reason) => {
                    const result = await createProjectQmsInspectionOverride({
                      projectQmsInspectionId:
                        gateOverrideDialog.gate.inspection.id,
                      requiredProductionStageId: gateOverrideDialog.stageId,
                      reason,
                      byUserId: userId,
                      byUserName: userName,
                    });
                    if (result.status !== "success") {
                      toast.error(result.error || "Could not record override");
                      return false;
                    }
                    const idx = gateOverrideDialog.idx;
                    const updated = v2Stages.map((s, i) =>
                      i === idx
                        ? { ...s, status: "Completed" as ProjectStageStatus }
                        : s,
                    );
                    const ok = await updateProjectStagesV2(projectId, updated);
                    if (!ok) {
                      toast.error(
                        "Could not save stage completion - please try again",
                      );
                      return false;
                    }
                    toast.success(
                      "Stage marked complete (supervisor override recorded)",
                    );
                    return true;
                  }}
                />
              )}

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

        {/* Tab — Inspection (QMS Phase 2) */}
        <TabsContent value="inspection" className="mt-4">
          <ProjectInspectionTab projectId={projectId} />
        </TabsContent>

        {/* Tab — QMS (Phase 32, Task #175) */}
        <TabsContent value="qms" className="mt-4">
          <ProjectQmsInspectionsTab projectId={projectId} />
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
                              onClick={async () => {
                                if (!pDelete) {
                                  alert("Access restricted");
                                  return;
                                }
                                const result = await deleteInventoryUsageRemote(
                                  u.id,
                                );
                                if (result.status === "unauthenticated") {
                                  toast.error(
                                    "Not signed in to the server - usage was not deleted",
                                  );
                                  return;
                                }
                                if (
                                  result.status === "denied" ||
                                  result.status === "error"
                                ) {
                                  toast.error(
                                    result.error ?? "Could not delete usage",
                                  );
                                  return;
                                }
                                // Disclosed mechanical gap (see
                                // lib/inventoryUsagesApi.ts): no DB
                                // trigger restores stock on delete -
                                // explicitly compensate to preserve
                                // existing behavior.
                                const restoreResult =
                                  await restoreInventoryStockRemote(
                                    u.inventoryItemId,
                                    u.quantityUsed,
                                  );
                                if (restoreResult.status !== "success") {
                                  toast.error(
                                    "Usage deleted, but stock restore failed - please verify inventory manually",
                                  );
                                }
                                deleteMaterialUsage(
                                  u.id,
                                  u.inventoryItemId,
                                  u.quantityUsed,
                                );
                                toast.success("Usage deleted");
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
                  onClick={async () => {
                    if (!editUsageId || !editUsageForm) return;
                    const existing = materialUsages.find(
                      (x) => x.id === editUsageId,
                    );
                    if (!existing) return;
                    const result = await updateInventoryUsageRemote({
                      ...existing,
                      quantityUsed: Number(editUsageForm.quantityUsed),
                      usedDate: editUsageForm.usedDate,
                      notes: editUsageForm.notes,
                    });
                    if (result.status === "unauthenticated") {
                      toast.error(
                        "Not signed in to the server - usage was not saved",
                      );
                      return;
                    }
                    if (
                      result.status === "denied" ||
                      result.status === "error"
                    ) {
                      toast.error(result.error ?? "Could not save usage");
                      return;
                    }
                    if (!result.data) {
                      toast.error("Could not save usage");
                      return;
                    }
                    // Same pre-existing behavior as before this
                    // migration: updateMaterialUsage does NOT adjust
                    // stock, matching the DB's own lack of a
                    // recompute-on-update trigger.
                    updateMaterialUsage(result.data);
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
                                onClick={async () => {
                                  if (!pDelete) {
                                    alert("Access restricted");
                                    return;
                                  }
                                  const result = await deleteBomItemRemote(
                                    b.id,
                                  );
                                  if (result.status === "unauthenticated") {
                                    toast.error(
                                      "Not signed in to the server - BOM item was not deleted",
                                    );
                                    return;
                                  }
                                  if (
                                    result.status === "denied" ||
                                    result.status === "error"
                                  ) {
                                    toast.error(
                                      result.error ??
                                        "Could not delete BOM item",
                                    );
                                    return;
                                  }
                                  deleteBomItem(b.id);
                                  toast.success("BOM item removed");
                                  await refreshBomRequisitions();
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
                {pCreateInventory && (
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
                )}
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

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="mt-4">
          {(() => {
            const activities = [...(project.activityLog || [])].sort(
              (a, b) => b.timestamp - a.timestamp,
            );
            const ACTIVITY_ICONS: Record<string, string> = {
              project_created: "🗂",
              quotation_created: "📋",
              quotation_approved: "✅",
              po_received: "📦",
              production_started: "⚙️",
              production_stage_update: "🔄",
              material_purchased: "🛒",
              material_requisition: "📝",
              qc_passed: "✔️",
              qc_failed: "❌",
              dispatch: "🚛",
              invoice_generated: "🧾",
              payment_received: "💰",
              machine_breakdown: "⚠️",
              report_exported: "📊",
              note: "💬",
            };
            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">Project Timeline</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {activities.length} event
                      {activities.length !== 1 ? "s" : ""} recorded
                    </p>
                  </div>
                  {pEdit && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const note = window.prompt(
                          "Add a note to this project's timeline:",
                        );
                        if (note?.trim()) {
                          addProjectActivity(
                            projectId,
                            "note",
                            note.trim(),
                            currentUser?.username ?? "unknown",
                          );
                        }
                      }}
                    >
                      + Add Note
                    </Button>
                  )}
                </div>
                {activities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg bg-muted/20">
                    <span className="text-3xl mb-3">📋</span>
                    <p className="text-sm font-medium text-muted-foreground">
                      No activity recorded yet.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Activity is logged automatically as the project
                      progresses.
                    </p>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                    <div className="space-y-0">
                      {activities.map((act) => (
                        <div key={act.id} className="relative flex gap-4 pb-4">
                          <div className="relative z-10 flex items-center justify-center w-8 h-8 rounded-full bg-card border-2 border-border text-sm shrink-0">
                            {ACTIVITY_ICONS[act.type] ?? "•"}
                          </div>
                          <div className="flex-1 min-w-0 bg-card border rounded-lg px-3 py-2.5">
                            <p className="text-xs font-medium">
                              {act.description}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[11px] text-muted-foreground">
                                {new Date(act.timestamp).toLocaleDateString(
                                  "en-IN",
                                  {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
                              </span>
                              {act.performedBy && (
                                <span className="text-[11px] text-muted-foreground">
                                  · {act.performedBy}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {/* Project creation as last item */}
                      <div className="relative flex gap-4 pb-4">
                        <div className="relative z-10 flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 border-2 border-blue-300 text-sm shrink-0">
                          🗂
                        </div>
                        <div className="flex-1 min-w-0 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
                          <p className="text-xs font-medium text-blue-700">
                            Project created — {project.projectNo}
                          </p>
                          <p className="text-[11px] text-blue-500 mt-1">
                            {new Date(project.createdAt).toLocaleDateString(
                              "en-IN",
                              {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              },
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </TabsContent>
      </Tabs>

      {/* Repeat Order Dialog */}
      <Dialog open={repeatDialog} onOpenChange={setRepeatDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Repeat Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="text-xs text-muted-foreground">Source Project</p>
              <p className="font-semibold">{project?.projectName}</p>
              <p className="text-xs text-muted-foreground font-mono">
                {project?.projectNo}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Internal Name (for ERP tracking)</Label>
              <Input
                value={repeatForm.newName}
                onChange={(e) =>
                  setRepeatForm((f) => ({ ...f, newName: e.target.value }))
                }
                placeholder="e.g. MS Enclosure Set - ORD-002"
              />
              <p className="text-[11px] text-muted-foreground">
                This is the internal tracking name. Customers will see{" "}
                <strong>
                  {project ? getCustomerVisibleName(project) : ""}
                </strong>{" "}
                on all documents.
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Copy from source
              </p>
              {(
                [
                  ["copyDesignFiles", "Design Files"],
                  ["copyBOM", "BOM (Bill of Materials)"],
                  ["copyCosting", "Internal Costing Structure"],
                  ["copyStages", "Production Stages (progress reset)"],
                  ["copyQC", "QC Structure"],
                  ["copyNotes", "Notes"],
                ] as [keyof typeof repeatForm, string][]
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-2 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={repeatForm[key] as boolean}
                    onChange={(e) =>
                      setRepeatForm((f) => ({ ...f, [key]: e.target.checked }))
                    }
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-0.5">
              <p className="font-semibold">
                The following will always be reset:
              </p>
              <p>
                Production progress, QC results, invoices, payments, dispatch,
                usage logs
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRepeatDialog(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleCreateRepeatOrder}>
              Create Repeat Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WIP Move Qty Dialog */}
      <Dialog open={moveQtyDialog} onOpenChange={setMoveQtyDialog}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Move Quantity Between Stages</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>From Stage</Label>
                <Select
                  value={moveForm.fromStage}
                  onValueChange={(v) =>
                    setMoveForm((f) => ({ ...f, fromStage: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(existingProduction?.stages || []).map((s) => (
                      <SelectItem key={s.stageName} value={s.stageName}>
                        {s.stageName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>To Stage</Label>
                <Select
                  value={moveForm.toStage}
                  onValueChange={(v) =>
                    setMoveForm((f) => ({ ...f, toStage: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(existingProduction?.stages || [])
                      .filter((s) => s.stageName !== moveForm.fromStage)
                      .map((s) => (
                        <SelectItem key={s.stageName} value={s.stageName}>
                          {s.stageName}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Quantity *</Label>
              <Input
                type="number"
                min={1}
                value={moveForm.qty || ""}
                onChange={(e) =>
                  setMoveForm((f) => ({ ...f, qty: Number(e.target.value) }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={moveForm.notes}
                onChange={(e) =>
                  setMoveForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setMoveQtyDialog(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!moveForm.fromStage || !moveForm.toStage) {
                  toast.error("Select both stages");
                  return;
                }
                if (moveForm.qty <= 0) {
                  toast.error("Enter valid quantity");
                  return;
                }
                if (!project) return;
                addProductionMovement({
                  id: crypto.randomUUID(),
                  projectId: project.id,
                  fromStage: moveForm.fromStage,
                  toStage: moveForm.toStage,
                  qty: moveForm.qty,
                  movementDate: new Date().toISOString().split("T")[0],
                  notes: moveForm.notes || undefined,
                  createdBy: currentUser?.username ?? "system",
                  createdAt: Date.now(),
                });
                toast.success(
                  `Moved ${moveForm.qty} units from ${moveForm.fromStage} → ${moveForm.toStage}`,
                );
                setMoveQtyDialog(false);
              }}
            >
              Move Qty
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteDrawingTarget}
        onOpenChange={(o) => !o && setDeleteDrawingTarget(null)}
        title="Delete drawing?"
        description={`"${deleteDrawingTarget?.fileName}" and all its saved views will be permanently deleted.`}
        onConfirm={handleConfirmDrawingDelete}
      />
      <ConfirmDeleteDialog
        open={!!deleteOutsourcedTarget}
        onOpenChange={(o) => !o && setDeleteOutsourcedTarget(null)}
        title="Delete outsourced work entry?"
        description="This outsourced work record will be permanently deleted."
        onConfirm={handleConfirmDeleteOutsourced}
      />
      <ConfirmDeleteDialog
        open={!!deletePurchaseTarget}
        onOpenChange={(o) => !o && setDeletePurchaseTarget(null)}
        title="Delete purchase record?"
        description="This material purchase record will be permanently deleted."
        onConfirm={() => {
          if (deletePurchaseTarget)
            deleteMaterialPurchase(deletePurchaseTarget);
          setDeletePurchaseTarget(null);
        }}
      />
    </div>
  );
}
