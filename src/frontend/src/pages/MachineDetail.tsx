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
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileText,
  Hammer,
  Image,
  Info,
  Package,
  Plus,
  Trash2,
  TrendingUp,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { ConfirmDeleteDialog } from "../components/ConfirmDeleteDialog";
import { VendorSelect } from "../components/VendorSelect";
import { WorkDrawingPreviewDialog } from "../components/WorkDrawingPreviewDialog";
import { getChildDrawings } from "../drawingEditor/api/drawings";
import {
  type LibraryCategory as DrawingLibraryCategory,
  type OwnerType as DrawingOwnerType,
  DrawingsListPanel,
  type ProjectOption,
} from "../drawingEditor/components/DrawingsListPanel";
import { loadPdf } from "../drawingEditor/lib/pdfRenderer";
import { printLatestView } from "../drawingEditor/lib/workOrderPreview";
import { useDrawingEditorStore } from "../drawingEditor/store/useDrawingEditorStore";
import type { DrawingDocument, DrawingLink } from "../drawingEditor/types";
import {
  addMachineDieRemote,
  addMachineSparePartRemote,
  removeMachineDieRemote,
  removeMachineSparePartRemote,
} from "../lib/machineCompatibilityApi";
import { addServiceRateRemote } from "../lib/machineRevenueApi";
import { updateMachineRemote } from "../lib/machinesApi";
import { getCustomerVisibleName } from "../lib/utils";
import {
  canCreate,
  canDelete,
  canEdit,
  canView,
  hasPermission,
} from "../permissions";
import { useStore } from "../store";
import type {
  BillableService,
  MachineCondition,
  MachineDocument,
  MachineUsageLog,
  ServicePart,
  ServiceRecord,
  ServiceType,
} from "../types";

const SERVICE_TYPES: ServiceType[] = [
  "Preventive",
  "Corrective",
  "Breakdown",
  "Calibration",
  "AMC",
  "Inspection",
  "Other",
];
const CONDITIONS: MachineCondition[] = [
  "Excellent",
  "Good",
  "Fair",
  "Poor",
  "Critical",
];

// Instrument's severity set has 3 tones (success/warning/destructive) for
// this 5-point real condition scale — the two best ratings share success,
// the two worst share destructive, Fair takes warning. Labels themselves
// are unchanged; only the color mapping moved off literal Tailwind hues.
const CONDITION_COLOR: Record<MachineCondition, string> = {
  Excellent: "bg-success/10 text-success",
  Good: "bg-success/10 text-success",
  Fair: "bg-warning/15 text-warning",
  Poor: "bg-destructive/10 text-destructive",
  Critical: "bg-destructive/10 text-destructive",
};

const SERVICE_TYPE_COLOR: Record<ServiceType, string> = {
  Preventive: "bg-success/10 text-success",
  Corrective: "bg-warning/15 text-warning",
  Breakdown: "bg-destructive/10 text-destructive",
  Calibration: "bg-info/10 text-info",
  AMC: "bg-info/10 text-info",
  Inspection: "bg-info/10 text-info",
  Other: "bg-muted text-muted-foreground",
};

interface Props {
  machineId: string;
  onBack: () => void;
  onOpenDrawingEditor?: (context: {
    machineId: string;
    drawingId?: string;
  }) => void;
  /** Which tab to land on — defaults to "overview" (today's behavior)
   * when omitted. */
  initialTab?: string;
  /** Scrolls to and highlights the matching Service History record on
   * mount — used by Petty Expense History's "View Machine History". */
  highlightServiceId?: string;
}

export function MachineDetail({
  machineId,
  onBack,
  onOpenDrawingEditor,
  initialTab,
  highlightServiceId,
}: Props) {
  const { currentUser } = useAuth();
  const pEdit = canEdit(currentUser, "machinery");
  const pSvcCreate = canCreate(currentUser, "machinery");
  const pDelete = canDelete(currentUser, "machinery");

  const {
    machines,
    serviceRecords,
    serviceParts,
    machineDocuments,
    machineUsageLogs,
    projects,
    vendors,
    customers,
    updateMachine,
    addServiceRecord,
    updateServiceRecord,
    deleteServiceRecord,
    addServicePart,
    deleteServicePart,
    addMachineDocument,
    deleteMachineDocument,
    addMachineUsageLog,
    deleteMachineUsageLog,
    reportBreakdown,
    resolveBreakdown,
    generateServiceNumber,
    addAuditLog,
    settings,
    inventoryItems,
    dies,
    machineSpareParts,
    machineDies,
    addMachineSparePartLocal,
    removeMachineSparePartLocal,
    addMachineDieLocal,
    removeMachineDieLocal,
    billableServices,
    machineServiceRates,
    addMachineServiceRateLocal,
  } = useStore();

  const machine = machines.find((m) => m.id === machineId);

  const dView = canView(currentUser, "drawing_editor");
  const dEdit = canEdit(currentUser, "drawing_editor");
  const dDelete = canDelete(currentUser, "drawing_editor");
  // drawings_insert RLS requires drawing_editor.create specifically, not
  // .edit — see DrawingsListPanel.tsx's canCreate prop.
  const dCreate = canCreate(currentUser, "drawing_editor");
  const revView = canView(currentUser, "machine_revenue");
  const revManageRates = hasPermission(
    currentUser,
    "machine_revenue.manage_rates",
  );
  const {
    drawings: allDrawings,
    loaded: drawingsLoaded,
    loadDrawings,
    links: drawingLinks,
    linksLoaded,
    loadLinks,
    addLink,
    removeLink,
    uploadDrawing: uploadDrawingDoc,
    deleteDrawing: deleteDrawingDoc,
    updateDrawing: updateDrawingDoc,
    duplicateDrawing: duplicateDrawingDoc,
  } = useDrawingEditorStore();

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount
  useEffect(() => {
    if (!drawingsLoaded) loadDrawings();
    if (!linksLoaded) loadLinks();
  }, [drawingsLoaded, linksLoaded]);

  const machineDrawings = (allDrawings || []).filter((d) => {
    const ownerType = d.ownerType ?? (d.projectId ? "project" : undefined);
    const ownerId = d.ownerId ?? d.projectId;
    if (ownerType === "machine" && ownerId === machineId) return true;
    return (drawingLinks || []).some(
      (l) =>
        l.linkedType === "machine" &&
        l.linkedId === machineId &&
        l.drawingId === d.id,
    );
  });
  const drawingProjectOptions: ProjectOption[] = (projects || []).map((p) => ({
    id: p.id,
    label: `${p.projectNo} — ${getCustomerVisibleName(p)}`,
  }));
  const drawingMachineOptions: ProjectOption[] = (machines || []).map((m) => ({
    id: m.id,
    label: `${m.machineCode} — ${m.name}`,
  }));
  const drawingVendorOptions: ProjectOption[] = (vendors || []).map((v) => ({
    id: v.id,
    label: v.name,
  }));
  const drawingCustomerOptions: ProjectOption[] = (customers || []).map(
    (c) => ({
      id: c.id,
      label: c.name,
    }),
  );

  const drawingUserId = currentUser?.id ?? "";
  const drawingUserName = currentUser?.username ?? "unknown";
  const [previewWorkDrawing, setPreviewWorkDrawing] =
    useState<DrawingDocument | null>(null);

  const handleDrawingUpload = async (
    file: File,
    ownerType: DrawingOwnerType,
    ownerId: string | undefined,
    category: DrawingLibraryCategory | undefined,
  ) => {
    const pdf = await loadPdf(file);
    const drawing = await uploadDrawingDoc({
      fileName: file.name,
      pdfBlob: file,
      numPages: pdf.numPages,
      uploadedBy: drawingUserId,
      uploadedByName: drawingUserName,
      ownerType,
      ownerId,
      category,
    });
    addAuditLog({
      module: "drawing_editor",
      action: "create",
      entityId: drawing.id,
      entityLabel: drawing.fileName,
      changedBy: drawingUserName,
    });
    toast.success(`${drawing.fileName} uploaded`);
  };

  const [deleteDrawingTarget, setDeleteDrawingTarget] = useState<
    (typeof allDrawings)[number] | null
  >(null);
  const [deleteServiceRecordTarget, setDeleteServiceRecordTarget] = useState<
    string | null
  >(null);

  // Billable Services (Phase 40) — Change Rate dialog. Services and
  // usage themselves are managed on the Machine Revenue page; this tab
  // is a read-mostly view scoped to this one machine, plus the same
  // insert-only rate-history write the main page uses.
  const [rateTarget, setRateTarget] = useState<BillableService | null>(null);
  const [newRate, setNewRate] = useState("");
  const [isSavingRate, setIsSavingRate] = useState(false);
  const myBillableServices = useMemo(
    () =>
      (billableServices || []).filter(
        (s) => s.machineId === machineId && s.isActive !== false,
      ),
    [billableServices, machineId],
  );
  const currentServiceRate = (serviceId: string): number => {
    const rates = (machineServiceRates || [])
      .filter((r) => r.billableServiceId === serviceId)
      .sort((a, b) => b.effectiveFrom - a.effectiveFrom);
    return rates[0]?.rate ?? 0;
  };
  async function handleSaveRate() {
    if (!rateTarget || isSavingRate) return;
    const rateNum = Number(newRate);
    if (!newRate.trim() || Number.isNaN(rateNum) || rateNum < 0) {
      toast.error("Enter a valid rate");
      return;
    }
    setIsSavingRate(true);
    try {
      const result = await addServiceRateRemote(rateTarget.id, rateNum);
      if (result.status === "unauthenticated") {
        toast.error("Not signed in to Supabase - rate was not saved.");
        return;
      }
      if (
        result.status === "error" ||
        result.status === "denied" ||
        !result.data
      ) {
        toast.error(`Could not save rate: ${result.error ?? "unknown error"}`);
        return;
      }
      addMachineServiceRateLocal(result.data);
      toast.success(
        `New rate set for "${rateTarget.name}" — past revenue is unaffected`,
      );
      setRateTarget(null);
    } finally {
      setIsSavingRate(false);
    }
  }

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
      changedBy: drawingUserName,
    });
    toast.success("Drawing deleted");
    setDeleteDrawingTarget(null);
  };

  const handleDrawingRename = async (
    drawing: (typeof allDrawings)[number],
    newFileName: string,
  ) => {
    await updateDrawingDoc(drawing.id, { fileName: newFileName });
    addAuditLog({
      module: "drawing_editor",
      action: "update",
      entityId: drawing.id,
      entityLabel: `${drawing.fileName} renamed to ${newFileName}`,
      changedBy: drawingUserName,
    });
    toast.success("Drawing renamed");
  };

  const handleDrawingChangeOwner = async (
    drawing: (typeof allDrawings)[number],
    ownerType: DrawingOwnerType,
    ownerId: string | undefined,
    category: DrawingLibraryCategory | undefined,
  ) => {
    await updateDrawingDoc(drawing.id, { ownerType, ownerId, category });
    addAuditLog({
      module: "drawing_editor",
      action: "update",
      entityId: drawing.id,
      entityLabel: `${drawing.fileName} owner changed`,
      changedBy: drawingUserName,
    });
    toast.success("Drawing owner updated");
  };

  const handleDrawingDuplicate = async (
    drawing: (typeof allDrawings)[number],
  ) => {
    const copy = await duplicateDrawingDoc(drawing.id, {
      duplicatedBy: drawingUserId,
      duplicatedByName: drawingUserName,
    });
    addAuditLog({
      module: "drawing_editor",
      action: "create",
      entityId: copy.id,
      entityLabel: `${copy.fileName} (duplicate of ${drawing.fileName})`,
      changedBy: drawingUserName,
    });
    toast.success("Drawing duplicated");
    return copy;
  };

  const handleDrawingAddLink = async (
    drawing: (typeof allDrawings)[number],
    linkedType: DrawingLink["linkedType"],
    linkedId: string,
  ) => {
    await addLink(drawing.id, linkedType, linkedId);
    toast.success("Link added");
  };

  const handleDrawingRemoveLink = async (linkId: string) => {
    await removeLink(linkId);
    toast.success("Link removed");
  };

  /** Prints exactly what Preview would show for a drawing — composed
   * fresh from its latest saved state, no export dialog. */
  const handlePrintDrawing = async (drawing: DrawingDocument) => {
    const printed = await printLatestView(drawing, {
      companyName: settings?.companyName || "Your Company",
      companyLogoDataUrl: settings?.companyLogo || undefined,
    });
    if (!printed) toast.error(`"${drawing.fileName}" hasn't been saved yet.`);
  };

  const myServiceRecords = useMemo(
    () =>
      (serviceRecords || [])
        .filter((r) => r.machineId === machineId)
        .sort(
          (a, b) =>
            new Date(b.serviceDate).getTime() -
            new Date(a.serviceDate).getTime(),
        ),
    [serviceRecords, machineId],
  );

  const myParts = useMemo(
    () => (serviceParts || []).filter((p) => p.machineId === machineId),
    [serviceParts, machineId],
  );

  const myDocs = useMemo(
    () => (machineDocuments || []).filter((d) => d.machineId === machineId),
    [machineDocuments, machineId],
  );

  const myUsageLogs = useMemo(
    () =>
      (machineUsageLogs || [])
        .filter((l) => l.machineId === machineId)
        .sort(
          (a, b) =>
            new Date(b.logDate).getTime() - new Date(a.logDate).getTime(),
        ),
    [machineUsageLogs, machineId],
  );

  // Phase 38 — Compatible Spare Parts / Compatible Tooling.
  const compatibleSparePartIds = useMemo(
    () =>
      new Set(
        (machineSpareParts || [])
          .filter((x) => x.machineId === machineId)
          .map((x) => x.inventoryItemId),
      ),
    [machineSpareParts, machineId],
  );
  const myCompatibleSpareParts = useMemo(
    () =>
      (inventoryItems || []).filter((i) => compatibleSparePartIds.has(i.id)),
    [inventoryItems, compatibleSparePartIds],
  );
  const availableSpareParts = useMemo(
    () =>
      (inventoryItems || []).filter(
        (i) => i.category === "spare_part" && !compatibleSparePartIds.has(i.id),
      ),
    [inventoryItems, compatibleSparePartIds],
  );

  const compatibleDieIds = useMemo(
    () =>
      new Set(
        (machineDies || [])
          .filter((x) => x.machineId === machineId)
          .map((x) => x.dieId),
      ),
    [machineDies, machineId],
  );
  const myCompatibleDies = useMemo(
    () => (dies || []).filter((d) => compatibleDieIds.has(d.id)),
    [dies, compatibleDieIds],
  );
  const availableDies = useMemo(
    () => (dies || []).filter((d) => !compatibleDieIds.has(d.id)),
    [dies, compatibleDieIds],
  );

  // Aggregated cost totals
  const totalServiceCost = useMemo(
    () =>
      myServiceRecords
        .filter((r) => r.status === "Completed")
        .reduce(
          (sum, r) => sum + (r.serviceCost || 0) + (r.travelCost || 0),
          0,
        ),
    [myServiceRecords],
  );

  const totalPartsCost = useMemo(
    () => myParts.reduce((sum, p) => sum + (p.totalCost || 0), 0),
    [myParts],
  );

  const totalDowntime = useMemo(
    () => myServiceRecords.reduce((sum, r) => sum + (r.downtimeHours || 0), 0),
    [myServiceRecords],
  );

  const [activeTab, setActiveTab] = useState(initialTab ?? "overview");

  // Scroll to and highlight the service record a caller (e.g. Petty
  // Expense History's "View Machine History") asked us to land on.
  useEffect(() => {
    if (!highlightServiceId) return;
    document
      .getElementById(`machine-service-${highlightServiceId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightServiceId]);

  // Service Record Form
  const [showSvcForm, setShowSvcForm] = useState(false);
  const [editingSvc, setEditingSvc] = useState<ServiceRecord | null>(null);
  const [svcForm, setSvcForm] = useState<Partial<ServiceRecord>>({});
  const [svcParts, setSvcParts] = useState<
    Omit<ServicePart, "id" | "serviceRecordId" | "machineId">[]
  >([]);

  // Usage Log Form
  const [showUsageForm, setShowUsageForm] = useState(false);
  const [usageForm, setUsageForm] = useState<Partial<MachineUsageLog>>({});

  // Breakdown Form
  const [showBreakdownForm, setShowBreakdownForm] = useState(false);
  const [breakdownCause, setBreakdownCause] = useState("");

  // Doc Upload
  const docInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Parts form for a specific service
  const [showPartsForm, setShowPartsForm] = useState<string | null>(null); // serviceRecordId
  const [partForm, setPartForm] = useState<Partial<ServicePart>>({});

  if (!machine) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-4 flex-col">
        <p className="text-muted-foreground">Machine not found.</p>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
      </div>
    );
  }

  function openNewSvc() {
    setSvcForm({
      serviceDate: new Date().toISOString().split("T")[0],
      machineCondition: "Good",
      performedBy: "Internal",
      status: "Completed",
    });
    setSvcParts([]);
    setEditingSvc(null);
    setShowSvcForm(true);
  }

  function openEditSvc(r: ServiceRecord) {
    setSvcForm({ ...r });
    setSvcParts([]);
    setEditingSvc(r);
    setShowSvcForm(true);
  }

  async function saveSvcRecord() {
    if (!svcForm.serviceDate) {
      toast.error("Service date required");
      return;
    }
    if (!svcForm.serviceType) {
      toast.error("Service type required");
      return;
    }
    if (!svcForm.machineCondition) {
      toast.error("Machine condition required");
      return;
    }

    if (editingSvc) {
      const ok = await updateServiceRecord({
        ...editingSvc,
        ...svcForm,
      } as ServiceRecord);
      if (!ok) {
        toast.error(
          "Could not save service record — machine sync to Supabase failed.",
        );
        return;
      }
      toast.success("Service record updated");
    } else {
      const svcNo = generateServiceNumber(machineId);
      const newRecord: ServiceRecord = {
        id: crypto.randomUUID(),
        machineId,
        serviceNumber: svcNo,
        serviceDate: svcForm.serviceDate!,
        serviceType: svcForm.serviceType!,
        performedBy: svcForm.performedBy || "Internal",
        vendorId: svcForm.vendorId,
        vendorName: svcForm.vendorName,
        technicianName: svcForm.technicianName,
        technicianContact: svcForm.technicianContact,
        serviceCost: Number(svcForm.serviceCost) || 0,
        travelCost: Number(svcForm.travelCost) || 0,
        downtimeHours: Number(svcForm.downtimeHours) || 0,
        breakdownCause: svcForm.breakdownCause,
        resolutionDetails: svcForm.resolutionDetails,
        machineCondition: svcForm.machineCondition!,
        nextServiceDue: svcForm.nextServiceDue,
        runningHoursAtService: svcForm.runningHoursAtService
          ? Number(svcForm.runningHoursAtService)
          : undefined,
        notes: svcForm.notes,
        status: svcForm.status || "Completed",
        createdBy: currentUser?.username || "admin",
        createdAt: Date.now(),
      };
      const ok = await addServiceRecord(newRecord);
      if (!ok) {
        toast.error(
          "Could not log service record — machine sync to Supabase failed.",
        );
        return;
      }

      // Add parts if any
      svcParts.forEach((p) => {
        addServicePart({
          ...p,
          id: crypto.randomUUID(),
          serviceRecordId: newRecord.id,
          machineId,
        });
      });

      toast.success(`Service record ${svcNo} logged`);
    }
    setShowSvcForm(false);
  }

  async function saveUsageLog() {
    if (!machine) return;
    if (!usageForm.logDate) {
      toast.error("Date required");
      return;
    }
    if (!usageForm.hoursUsed || usageForm.hoursUsed <= 0) {
      toast.error("Hours must be > 0");
      return;
    }

    const log: MachineUsageLog = {
      id: crypto.randomUUID(),
      machineId,
      projectId: usageForm.projectId,
      projectName: usageForm.projectId
        ? (projects || []).find((p) => p.id === usageForm.projectId)
            ?.projectName
        : usageForm.projectName,
      logDate: usageForm.logDate!,
      hoursUsed: Number(usageForm.hoursUsed),
      operatorName: usageForm.operatorName,
      notes: usageForm.notes,
      loggedBy: currentUser?.username || "admin",
      createdAt: Date.now(),
    };
    const ok = await addMachineUsageLog(log);
    if (!ok) {
      toast.error("Could not log usage — machine sync to Supabase failed.");
      return;
    }
    toast.success(`${log.hoursUsed}h logged for ${machine.name}`);
    setShowUsageForm(false);
    setUsageForm({});
  }

  async function handleBreakdown() {
    if (!machine) return;
    if (!breakdownCause.trim()) {
      toast.error("Describe the breakdown cause");
      return;
    }
    const ok = await reportBreakdown(
      machineId,
      breakdownCause,
      currentUser?.username || "admin",
    );
    if (!ok) {
      toast.error(
        "Could not report breakdown — machine sync to Supabase failed.",
      );
      return;
    }
    toast.error(`⚠ Breakdown reported for ${machine.name}`);
    setShowBreakdownForm(false);
    setBreakdownCause("");
  }

  // Phase 38 — Compatible Spare Parts / Compatible Tooling. Remote-first,
  // same discipline as the rest of this file: the local pair is only
  // added/removed after the remote call confirms success.
  async function handleAddCompatibleSparePart(inventoryItemId: string) {
    const result = await addMachineSparePartRemote(machineId, inventoryItemId);
    if (result.status === "unauthenticated") {
      toast.error("Not signed in to Supabase - spare part was not linked.");
      return;
    }
    if (result.status === "error" || result.status === "denied") {
      toast.error(
        `Could not link spare part: ${result.error ?? "unknown error"}`,
      );
      return;
    }
    addMachineSparePartLocal(machineId, inventoryItemId);
    toast.success("Spare part linked");
  }

  async function handleRemoveCompatibleSparePart(inventoryItemId: string) {
    const result = await removeMachineSparePartRemote(
      machineId,
      inventoryItemId,
    );
    if (result.status === "unauthenticated") {
      toast.error("Not signed in to Supabase - spare part was not unlinked.");
      return;
    }
    if (result.status === "error" || result.status === "denied") {
      toast.error(
        `Could not unlink spare part: ${result.error ?? "unknown error"}`,
      );
      return;
    }
    removeMachineSparePartLocal(machineId, inventoryItemId);
    toast.success("Spare part unlinked");
  }

  async function handleAddCompatibleDie(dieId: string) {
    const result = await addMachineDieRemote(machineId, dieId);
    if (result.status === "unauthenticated") {
      toast.error("Not signed in to Supabase - die was not linked.");
      return;
    }
    if (result.status === "error" || result.status === "denied") {
      toast.error(`Could not link die: ${result.error ?? "unknown error"}`);
      return;
    }
    addMachineDieLocal(machineId, dieId);
    toast.success("Die linked");
  }

  async function handleRemoveCompatibleDie(dieId: string) {
    const result = await removeMachineDieRemote(machineId, dieId);
    if (result.status === "unauthenticated") {
      toast.error("Not signed in to Supabase - die was not unlinked.");
      return;
    }
    if (result.status === "error" || result.status === "denied") {
      toast.error(`Could not unlink die: ${result.error ?? "unknown error"}`);
      return;
    }
    removeMachineDieLocal(machineId, dieId);
    toast.success("Die unlinked");
  }

  async function handleDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const doc: MachineDocument = {
        id: crypto.randomUUID(),
        machineId,
        fileName: file.name,
        fileType: "Other",
        fileData: ev.target?.result as string,
        fileMimeType: file.type,
        uploadedAt: Date.now(),
      };
      addMachineDocument(doc);
      toast.success(`${file.name} uploaded`);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!machine) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      // Compress: draw to canvas then export as JPEG
      const img = new window.Image();
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        const MAX = 800;
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL("image/jpeg", 0.75);
        // Phase 35 — remote-first, same discipline as Machinery.tsx.
        const result = await updateMachineRemote({
          ...machine,
          primaryImageData: compressed,
          updatedAt: Date.now(),
        });
        if (result.status === "unauthenticated") {
          toast.error("Not signed in to Supabase - photo was not saved.");
          return;
        }
        if (
          result.status === "error" ||
          result.status === "denied" ||
          !result.data
        ) {
          toast.error(
            `Could not save photo: ${result.error ?? "unknown error"}`,
          );
          return;
        }
        updateMachine(result.data);
        toast.success("Photo updated");
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function downloadDoc(doc: MachineDocument) {
    const a = document.createElement("a");
    a.href = doc.fileData;
    a.download = doc.fileName;
    a.click();
  }

  function addPartToSvcForm() {
    if (!partForm.partName) {
      toast.error("Part name required");
      return;
    }
    setSvcParts((prev) => [
      ...prev,
      {
        partName: partForm.partName!,
        partNumber: partForm.partNumber,
        quantity: Number(partForm.quantity) || 1,
        unit: partForm.unit || "pcs",
        unitCost: Number(partForm.unitCost) || 0,
        totalCost:
          (Number(partForm.quantity) || 1) * (Number(partForm.unitCost) || 0),
        vendorName: partForm.vendorName,
        notes: partForm.notes,
      },
    ]);
    setPartForm({});
  }

  const amcDaysLeft = machine.amcEndDate
    ? Math.ceil(
        (new Date(machine.amcEndDate).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      )
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="mt-0.5 shrink-0"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {machine.machineCode}
            </span>
            <Badge
              variant="outline"
              className={
                machine.currentStatus === "Operational"
                  ? "bg-success/10 text-success border-success/30"
                  : machine.currentStatus === "Breakdown"
                    ? "bg-destructive/10 text-destructive border-destructive/30"
                    : machine.currentStatus === "Under Maintenance"
                      ? "bg-warning/15 text-warning border-warning/30"
                      : "bg-muted text-muted-foreground border-border"
              }
            >
              {machine.currentStatus}
            </Badge>
          </div>
          <h1 className="text-xl font-bold mt-1">{machine.name}</h1>
          <p className="text-sm text-muted-foreground">
            {machine.type}
            {machine.brand ? ` · ${machine.brand}` : ""}
            {machine.model ? ` ${machine.model}` : ""}
          </p>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          {pSvcCreate && machine.currentStatus !== "Breakdown" && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => setShowBreakdownForm(true)}
            >
              <XCircle className="w-3.5 h-3.5" /> Report Breakdown
            </Button>
          )}
          {pSvcCreate && machine.currentStatus === "Breakdown" && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-success/40 text-success hover:bg-success/10"
              onClick={async () => {
                const openSvc = (serviceRecords || []).find(
                  (r) =>
                    r.machineId === machineId &&
                    r.status === "In Progress" &&
                    r.serviceType === "Breakdown",
                );
                if (openSvc) {
                  const ok = await resolveBreakdown(
                    machineId,
                    openSvc.id,
                    "Good",
                  );
                  if (!ok) {
                    toast.error(
                      "Could not resolve breakdown — machine sync to Supabase failed.",
                    );
                    return;
                  }
                  toast.success("Breakdown resolved — machine Operational");
                }
              }}
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Mark Resolved
            </Button>
          )}
          {pSvcCreate && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={openNewSvc}
            >
              <Wrench className="w-3.5 h-3.5" /> Log Service
            </Button>
          )}
          {pSvcCreate && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setShowUsageForm(true)}
            >
              <Clock className="w-3.5 h-3.5" /> Log Usage
            </Button>
          )}
        </div>
      </div>

      {/* Machine photo + key stats row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Photo — a real <label> wrapping the file input, not a div role
            simulating a button: native label/input pairing gives click AND
            keyboard (Enter/Space via the input's own focus) activation for
            free, which the manual onClick+onKeyDown it replaces had to
            hand-roll (and which can't correctly contain the input as a
            <button> would, since interactive controls can't nest). */}
        <label
          className="relative rounded-xl border overflow-hidden bg-muted/30 flex items-center justify-center cursor-pointer group"
          style={{ minHeight: 200 }}
          title="Click to upload machine photo"
        >
          {machine.primaryImageData ? (
            <img
              src={machine.primaryImageData}
              alt={machine.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground p-8">
              <Image className="w-10 h-10 opacity-40" />
              <p className="text-xs">Click to upload photo</p>
            </div>
          )}
          {pEdit && (
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <p className="text-white text-xs font-medium">Change Photo</p>
            </div>
          )}
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoUpload}
          />
        </label>

        {/* Key metrics */}
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            {
              label: "Running Hours",
              value: `${machine.totalRunningHours.toLocaleString("en-IN")} hrs`,
              icon: Clock,
            },
            {
              label: "Service Records",
              value: myServiceRecords.length,
              icon: Wrench,
            },
            {
              label: "Total Downtime",
              value: `${totalDowntime} hrs`,
              icon: AlertTriangle,
            },
            {
              label: "Total Service Cost",
              value: `₹${totalServiceCost.toLocaleString("en-IN")}`,
              icon: TrendingUp,
            },
            {
              label: "Parts Cost",
              value: `₹${totalPartsCost.toLocaleString("en-IN")}`,
              icon: Package,
            },
            {
              label: "Purchase Cost",
              value: machine.purchaseCost
                ? `₹${machine.purchaseCost.toLocaleString("en-IN")}`
                : "—",
              icon: Info,
            },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="rounded-lg border bg-card p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <Icon className="w-3.5 h-3.5" />
                  <span className="text-xs">{stat.label}</span>
                </div>
                <p className="text-lg font-bold leading-tight">{stat.value}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* AMC / warranty alerts */}
      {amcDaysLeft !== null && amcDaysLeft <= 30 && (
        <div
          className={`flex items-center gap-3 p-3 rounded-lg border ${amcDaysLeft < 0 ? "bg-destructive/10 border-destructive/30 text-destructive" : "bg-warning/15 border-warning/30 text-warning"}`}
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <p className="text-sm font-medium">
            {amcDaysLeft < 0
              ? `AMC expired ${Math.abs(amcDaysLeft)} days ago (${machine.amcEndDate})`
              : `AMC expires in ${amcDaysLeft} days — renew with ${machine.amcVendorName || "vendor"}`}
          </p>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="service">
            Service History
            {myServiceRecords.length > 0 && (
              <span className="ml-1.5 bg-primary/10 text-primary text-[10px] font-bold px-1.5 rounded-full">
                {myServiceRecords.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="parts">Parts Replaced</TabsTrigger>
          <TabsTrigger value="usage">Usage Log</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger
            value="compatibility"
            data-ocid="machine-detail.compatibility.tab"
          >
            Compatibility
          </TabsTrigger>
          {revView && (
            <TabsTrigger
              value="billable-services"
              data-ocid="machine-detail.billable_services.tab"
            >
              Billable Services
            </TabsTrigger>
          )}
          {dView && (
            <TabsTrigger
              value="drawings"
              data-ocid="machine-detail.drawings.tab"
            >
              Drawings ({machineDrawings.length})
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── OVERVIEW TAB ── */}
        <TabsContent value="overview" className="space-y-4 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Machine details */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Info className="w-4 h-4 text-primary" />
                Machine Details
              </h3>
              {[
                { label: "Serial Number", value: machine.serialNumber },
                { label: "Asset ID", value: machine.assetId },
                { label: "Location", value: machine.location },
                { label: "Department", value: machine.department },
                { label: "Purchase Date", value: machine.purchaseDate },
                { label: "Purchase Vendor", value: machine.purchaseVendorName },
                {
                  label: "Hourly Rate",
                  value: machine.hourlyRate
                    ? `₹${machine.hourlyRate}/hr`
                    : undefined,
                },
                {
                  label: "Service Interval",
                  value: machine.serviceIntervalDays
                    ? `${machine.serviceIntervalDays} days`
                    : undefined,
                },
                { label: "Next Service Due", value: machine.nextServiceDue },
                { label: "Last Service", value: machine.lastServiceDate },
                { label: "Notes", value: machine.notes },
              ]
                .filter((x) => x.value)
                .map(({ label, value }) => (
                  <div key={label} className="flex gap-3 text-sm">
                    <span className="text-muted-foreground w-36 shrink-0">
                      {label}
                    </span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
            </div>

            {/* AMC + Warranty */}
            <div className="space-y-3">
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Warranty
                </h3>
                {[
                  { label: "Expiry", value: machine.warrantyExpiry },
                  { label: "Vendor", value: machine.warrantyVendor },
                  { label: "Notes", value: machine.warrantyNotes },
                ]
                  .filter((x) => x.value)
                  .map(({ label, value }) => (
                    <div key={label} className="flex gap-3 text-sm">
                      <span className="text-muted-foreground w-20 shrink-0">
                        {label}
                      </span>
                      <span className="font-medium">{value}</span>
                    </div>
                  ))}
                {!machine.warrantyExpiry && !machine.warrantyVendor && (
                  <p className="text-xs text-muted-foreground">
                    No warranty details recorded.
                  </p>
                )}
              </div>
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Hammer className="w-4 h-4 text-primary" />
                  AMC Contract
                </h3>
                {[
                  { label: "Vendor", value: machine.amcVendorName },
                  {
                    label: "Period",
                    value:
                      machine.amcStartDate && machine.amcEndDate
                        ? `${machine.amcStartDate} → ${machine.amcEndDate}`
                        : undefined,
                  },
                  {
                    label: "Cost/Year",
                    value: machine.amcCost
                      ? `₹${machine.amcCost.toLocaleString("en-IN")}`
                      : undefined,
                  },
                  { label: "Coverage", value: machine.amcCoverage },
                ]
                  .filter((x) => x.value)
                  .map(({ label, value }) => (
                    <div key={label} className="flex gap-3 text-sm">
                      <span className="text-muted-foreground w-24 shrink-0">
                        {label}
                      </span>
                      <span className="font-medium">{value}</span>
                    </div>
                  ))}
                {!machine.amcVendorName && !machine.amcEndDate && (
                  <p className="text-xs text-muted-foreground">
                    No AMC contract recorded.
                  </p>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── SERVICE HISTORY TAB ── */}
        <TabsContent value="service" className="pt-4 space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              {myServiceRecords.length} service record
              {myServiceRecords.length !== 1 ? "s" : ""}
            </p>
            {pSvcCreate && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={openNewSvc}
              >
                <Plus className="w-3.5 h-3.5" /> Add Service Record
              </Button>
            )}
          </div>

          {myServiceRecords.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm border rounded-lg">
              No service records yet.
            </div>
          ) : (
            <div className="space-y-3">
              {myServiceRecords.map((r) => {
                const partsForThis = myParts.filter(
                  (p) => p.serviceRecordId === r.id,
                );
                const isHighlighted = highlightServiceId === r.id;
                return (
                  <div
                    key={r.id}
                    id={`machine-service-${r.id}`}
                    className={
                      isHighlighted
                        ? "rounded-lg border bg-primary/10 ring-2 ring-inset ring-primary/50 p-4 space-y-3 transition-colors"
                        : "rounded-lg border bg-card p-4 space-y-3"
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                          {r.serviceNumber}
                        </span>
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${SERVICE_TYPE_COLOR[r.serviceType]}`}
                        >
                          {r.serviceType}
                        </span>
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${CONDITION_COLOR[r.machineCondition]}`}
                        >
                          {r.machineCondition}
                        </span>
                        <Badge
                          variant={
                            r.status === "Completed"
                              ? "default"
                              : r.status === "In Progress"
                                ? "secondary"
                                : "outline"
                          }
                          className="text-xs"
                        >
                          {r.status}
                        </Badge>
                      </div>
                      <div className="flex gap-1">
                        {pEdit && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => openEditSvc(r)}
                          >
                            Edit
                          </Button>
                        )}
                        {pDelete && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => setDeleteServiceRecordTarget(r.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Date</p>
                        <p className="font-medium">{r.serviceDate}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Technician
                        </p>
                        <p className="font-medium">
                          {r.technicianName || r.vendorName || r.performedBy}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Cost</p>
                        <p className="font-medium">
                          ₹
                          {(
                            (r.serviceCost || 0) + (r.travelCost || 0)
                          ).toLocaleString("en-IN")}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Downtime
                        </p>
                        <p className="font-medium">
                          {r.downtimeHours || 0} hrs
                        </p>
                      </div>
                    </div>

                    {r.breakdownCause && (
                      <div className="text-sm bg-destructive/10 border border-destructive/20 rounded p-2">
                        <p className="text-xs text-destructive font-medium mb-0.5">
                          Breakdown Cause
                        </p>
                        <p>{r.breakdownCause}</p>
                      </div>
                    )}
                    {r.resolutionDetails && (
                      <div className="text-sm bg-success/10 border border-success/20 rounded p-2">
                        <p className="text-xs text-success font-medium mb-0.5">
                          Resolution
                        </p>
                        <p>{r.resolutionDetails}</p>
                      </div>
                    )}
                    {r.notes && (
                      <p className="text-xs text-muted-foreground">{r.notes}</p>
                    )}

                    {/* Parts for this service */}
                    {partsForThis.length > 0 && (
                      <div className="border-t pt-3">
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          Parts Replaced ({partsForThis.length})
                        </p>
                        <div className="space-y-1">
                          {partsForThis.map((p) => (
                            <div
                              key={p.id}
                              className="flex items-center justify-between text-xs"
                            >
                              <span>
                                {p.partName}
                                {p.partNumber ? ` (${p.partNumber})` : ""} ·{" "}
                                {p.quantity} {p.unit}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  ₹{p.totalCost.toLocaleString("en-IN")}
                                </span>
                                {pDelete && (
                                  <button
                                    type="button"
                                    onClick={() => deleteServicePart(p.id)}
                                    className="text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Add part to this service */}
                    {pSvcCreate && r.status !== "Cancelled" && (
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => setShowPartsForm(r.id)}
                      >
                        + Add part replacement
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── PARTS REPLACED TAB ── */}
        <TabsContent value="parts" className="pt-4">
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part Name</TableHead>
                  <TableHead>Part No.</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Service</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myParts.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground py-8"
                    >
                      No parts replacement records.
                    </TableCell>
                  </TableRow>
                ) : (
                  myParts.map((p) => {
                    const svc = myServiceRecords.find(
                      (r) => r.id === p.serviceRecordId,
                    );
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">
                          {p.partName}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {p.partNumber || "—"}
                        </TableCell>
                        <TableCell>
                          {p.quantity} {p.unit}
                        </TableCell>
                        <TableCell>{p.vendorName || "—"}</TableCell>
                        <TableCell>
                          ₹{p.totalCost.toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {svc?.serviceNumber || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            {myParts.length > 0 && (
              <div className="px-4 py-2 border-t bg-muted/20 flex justify-end">
                <span className="text-sm font-medium">
                  Total Parts Cost: ₹{totalPartsCost.toLocaleString("en-IN")}
                </span>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── USAGE LOG TAB ── */}
        <TabsContent value="usage" className="pt-4 space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Total: {machine.totalRunningHours.toLocaleString("en-IN")} hrs
            </p>
            {pSvcCreate && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => {
                  setUsageForm({
                    logDate: new Date().toISOString().split("T")[0],
                  });
                  setShowUsageForm(true);
                }}
              >
                <Plus className="w-3.5 h-3.5" /> Log Usage
              </Button>
            )}
          </div>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Operator</TableHead>
                  <TableHead>Notes</TableHead>
                  {pDelete && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {myUsageLogs.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground py-8"
                    >
                      No usage logs yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  myUsageLogs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{l.logDate}</TableCell>
                      <TableCell className="font-medium">
                        {l.hoursUsed} hrs
                      </TableCell>
                      <TableCell>
                        {l.projectName || l.projectId || "—"}
                      </TableCell>
                      <TableCell>{l.operatorName || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {l.notes || "—"}
                      </TableCell>
                      {pDelete && (
                        <TableCell>
                          <button
                            type="button"
                            onClick={async () => {
                              const ok = await deleteMachineUsageLog(l.id);
                              if (!ok) {
                                toast.error(
                                  "Could not remove log — machine sync to Supabase failed.",
                                );
                                return;
                              }
                              toast.success("Log removed");
                            }}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── DOCUMENTS TAB ── */}
        <TabsContent value="documents" className="pt-4 space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              {myDocs.length} document{myDocs.length !== 1 ? "s" : ""}
            </p>
            {pSvcCreate && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => docInputRef.current?.click()}
              >
                <Plus className="w-3.5 h-3.5" /> Upload Document
              </Button>
            )}
            <input
              ref={docInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              className="hidden"
              onChange={handleDocUpload}
            />
          </div>

          {myDocs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm border rounded-lg border-dashed">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>
                No documents uploaded. Upload purchase invoice, warranty,
                manuals, etc.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {myDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3"
                >
                  <FileText className="w-8 h-8 text-muted-foreground/50 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {doc.fileName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {doc.fileType} ·{" "}
                      {new Date(doc.uploadedAt).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => downloadDoc(doc)}
                    >
                      Download
                    </Button>
                    {pDelete && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-destructive hover:text-destructive"
                        onClick={() => {
                          deleteMachineDocument(doc.id);
                          toast.success("Document removed");
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── COMPATIBILITY TAB (Phase 38) ── */}
        <TabsContent value="compatibility" className="pt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Compatible Spare Parts */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <h3 className="font-semibold text-sm">Compatible Spare Parts</h3>
              {pEdit && availableSpareParts.length > 0 && (
                <Select
                  value=""
                  onValueChange={(v) => handleAddCompatibleSparePart(v)}
                >
                  <SelectTrigger data-ocid="machine-detail.spare_part.add.select">
                    <SelectValue placeholder="+ Link a spare part..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {availableSpareParts.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {myCompatibleSpareParts.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No spare parts linked yet.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {myCompatibleSpareParts.map((i) => (
                    <div
                      key={i.id}
                      className="flex items-center justify-between text-sm bg-muted/30 rounded px-3 py-1.5"
                    >
                      <span>{i.name}</span>
                      {pEdit && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCompatibleSparePart(i.id)}
                          className="text-muted-foreground hover:text-destructive"
                          data-ocid="machine-detail.spare_part.remove_button"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Compatible Tooling (Dies) */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <h3 className="font-semibold text-sm">Compatible Tooling</h3>
              {pEdit && availableDies.length > 0 && (
                <Select
                  value=""
                  onValueChange={(v) => handleAddCompatibleDie(v)}
                >
                  <SelectTrigger data-ocid="machine-detail.die.add.select">
                    <SelectValue placeholder="+ Link a die..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {availableDies.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name} ({d.dieCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {myCompatibleDies.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No tooling/dies linked yet.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {myCompatibleDies.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between text-sm bg-muted/30 rounded px-3 py-1.5"
                    >
                      <span>
                        {d.name} ({d.dieCode})
                      </span>
                      {pEdit && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCompatibleDie(d.id)}
                          className="text-muted-foreground hover:text-destructive"
                          data-ocid="machine-detail.die.remove_button"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {revView && (
          <TabsContent value="billable-services" className="pt-4 space-y-4">
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div>
                <h3 className="font-semibold text-sm">Billable Services</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Revenue services billed on this machine — distinct from the
                  machine record itself. Add or remove services and record usage
                  from the Machine Revenue page.
                </p>
              </div>
              {myBillableServices.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No billable services configured for this machine.
                </p>
              ) : (
                <div className="space-y-2">
                  {myBillableServices.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded-md border p-3"
                      data-ocid={`machine-detail.billable_service.${s.id}`}
                    >
                      <div>
                        <div className="font-medium text-sm">{s.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.chargingMethod} — current rate: ₹
                          {currentServiceRate(s.id).toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                          {s.unitLabel ? ` / ${s.unitLabel}` : ""}
                        </div>
                      </div>
                      {revManageRates && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRateTarget(s);
                            setNewRate(String(currentServiceRate(s.id) || ""));
                          }}
                          data-ocid={`machine-detail.change_rate_button.${s.id}`}
                        >
                          Change Rate
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        )}

        {dView && (
          <TabsContent value="drawings" className="pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Engineering Drawings</h2>
              {onOpenDrawingEditor && (
                <Button
                  size="sm"
                  onClick={() => onOpenDrawingEditor({ machineId })}
                  data-ocid="machine-detail.drawings.open_editor_button"
                >
                  Open Editor
                </Button>
              )}
            </div>
            <DrawingsListPanel
              drawings={machineDrawings}
              links={drawingLinks || []}
              projects={drawingProjectOptions}
              machines={drawingMachineOptions}
              vendors={drawingVendorOptions}
              customers={drawingCustomerOptions}
              canDelete={dDelete}
              canEdit={dEdit}
              canCreate={dCreate}
              focusedMachineId={machineId}
              onUpload={handleDrawingUpload}
              onOpen={(d) =>
                onOpenDrawingEditor?.({ machineId, drawingId: d.id })
              }
              onDelete={handleDrawingDelete}
              onRename={handleDrawingRename}
              onChangeOwner={handleDrawingChangeOwner}
              onDuplicate={handleDrawingDuplicate}
              onAddLink={handleDrawingAddLink}
              onRemoveLink={handleDrawingRemoveLink}
              onPreview={setPreviewWorkDrawing}
              onPrint={handlePrintDrawing}
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
        )}
      </Tabs>

      {/* ── SERVICE RECORD FORM DIALOG ── */}
      <Dialog open={showSvcForm} onOpenChange={setShowSvcForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSvc
                ? "Edit Service Record"
                : `Log Service — ${machine.name}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Service Date *</Label>
                <Input
                  type="date"
                  value={svcForm.serviceDate || ""}
                  onChange={(e) =>
                    setSvcForm({ ...svcForm, serviceDate: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Service Type *</Label>
                <Select
                  value={svcForm.serviceType || ""}
                  onValueChange={(v) =>
                    setSvcForm({ ...svcForm, serviceType: v as ServiceType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Performed By</Label>
                <Select
                  value={svcForm.performedBy || "Internal"}
                  onValueChange={(v) =>
                    setSvcForm({
                      ...svcForm,
                      performedBy: v as ServiceRecord["performedBy"],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Internal">Internal</SelectItem>
                    <SelectItem value="External Vendor">
                      External Vendor
                    </SelectItem>
                    <SelectItem value="AMC Vendor">AMC Vendor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={svcForm.status || "Completed"}
                  onValueChange={(v) =>
                    setSvcForm({
                      ...svcForm,
                      status: v as ServiceRecord["status"],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Scheduled">Scheduled</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Vendor / Technician Name</Label>
                <Input
                  value={svcForm.technicianName || svcForm.vendorName || ""}
                  onChange={(e) =>
                    setSvcForm({ ...svcForm, technicianName: e.target.value })
                  }
                  placeholder="Name"
                />
              </div>
              <div>
                <Label>Contact</Label>
                <Input
                  value={svcForm.technicianContact || ""}
                  onChange={(e) =>
                    setSvcForm({
                      ...svcForm,
                      technicianContact: e.target.value,
                    })
                  }
                  placeholder="Phone / Email"
                />
              </div>
              <div>
                <Label>Service Cost (₹)</Label>
                <Input
                  type="number"
                  value={svcForm.serviceCost || ""}
                  onChange={(e) =>
                    setSvcForm({
                      ...svcForm,
                      serviceCost: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div>
                <Label>Travel Cost (₹)</Label>
                <Input
                  type="number"
                  value={svcForm.travelCost || ""}
                  onChange={(e) =>
                    setSvcForm({
                      ...svcForm,
                      travelCost: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div>
                <Label>Downtime (hours)</Label>
                <Input
                  type="number"
                  value={svcForm.downtimeHours || ""}
                  onChange={(e) =>
                    setSvcForm({
                      ...svcForm,
                      downtimeHours: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div>
                <Label>Running Hours at Service</Label>
                <Input
                  type="number"
                  value={svcForm.runningHoursAtService || ""}
                  onChange={(e) =>
                    setSvcForm({
                      ...svcForm,
                      runningHoursAtService: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div>
                <Label>Machine Condition After *</Label>
                <Select
                  value={svcForm.machineCondition || "Good"}
                  onValueChange={(v) =>
                    setSvcForm({
                      ...svcForm,
                      machineCondition: v as MachineCondition,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
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
              <div>
                <Label>Next Service Due</Label>
                <Input
                  type="date"
                  value={svcForm.nextServiceDue || ""}
                  onChange={(e) =>
                    setSvcForm({ ...svcForm, nextServiceDue: e.target.value })
                  }
                />
              </div>
            </div>

            {(svcForm.serviceType === "Corrective" ||
              svcForm.serviceType === "Breakdown") && (
              <div>
                <Label>Breakdown Cause</Label>
                <Textarea
                  rows={2}
                  value={svcForm.breakdownCause || ""}
                  onChange={(e) =>
                    setSvcForm({ ...svcForm, breakdownCause: e.target.value })
                  }
                />
              </div>
            )}
            <div>
              <Label>Resolution / Work Done</Label>
              <Textarea
                rows={2}
                value={svcForm.resolutionDetails || ""}
                onChange={(e) =>
                  setSvcForm({ ...svcForm, resolutionDetails: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={svcForm.notes || ""}
                onChange={(e) =>
                  setSvcForm({ ...svcForm, notes: e.target.value })
                }
              />
            </div>

            {/* Parts replacement within service form */}
            {!editingSvc && (
              <div className="border-t pt-3 space-y-3">
                <p className="text-sm font-medium">Parts Replaced (optional)</p>
                {svcParts.length > 0 && (
                  <div className="space-y-1">
                    {svcParts.map((p, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-sm bg-muted/30 rounded px-3 py-1.5"
                      >
                        <span>
                          {p.partName} · {p.quantity} {p.unit} · ₹{p.totalCost}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setSvcParts((prev) =>
                              prev.filter((_, j) => j !== i),
                            )
                          }
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <Label className="text-xs">Part Name</Label>
                    <Input
                      value={partForm.partName || ""}
                      onChange={(e) =>
                        setPartForm({ ...partForm, partName: e.target.value })
                      }
                      placeholder="e.g. Nozzle"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Qty</Label>
                    <Input
                      type="number"
                      value={partForm.quantity || ""}
                      onChange={(e) =>
                        setPartForm({
                          ...partForm,
                          quantity: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Unit Cost (₹)</Label>
                    <Input
                      type="number"
                      value={partForm.unitCost || ""}
                      onChange={(e) =>
                        setPartForm({
                          ...partForm,
                          unitCost: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={addPartToSvcForm}
                    >
                      + Add
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSvcForm(false)}>
              Cancel
            </Button>
            <Button onClick={saveSvcRecord}>
              {editingSvc ? "Save Changes" : "Log Service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── USAGE LOG FORM ── */}
      <Dialog open={showUsageForm} onOpenChange={setShowUsageForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Usage — {machine.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={usageForm.logDate || ""}
                  onChange={(e) =>
                    setUsageForm({ ...usageForm, logDate: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Hours Used *</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={usageForm.hoursUsed || ""}
                  onChange={(e) =>
                    setUsageForm({
                      ...usageForm,
                      hoursUsed: Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>
            <div>
              <Label>Project (optional)</Label>
              <SearchableSelect
                value={usageForm.projectId || "__none__"}
                onChange={(v) =>
                  setUsageForm({
                    ...usageForm,
                    projectId: v === "__none__" ? "" : v,
                  })
                }
                options={[
                  { value: "__none__", label: "— No project —" },
                  ...(projects || []).map((p) => ({
                    value: p.id,
                    label: `${p.projectNo} · ${p.projectName}`,
                  })),
                ]}
                placeholder="Select project"
                searchPlaceholder="Search projects…"
                emptyText="No projects found."
                className="w-full"
              />
            </div>
            <div>
              <Label>Operator</Label>
              <Input
                value={usageForm.operatorName || ""}
                onChange={(e) =>
                  setUsageForm({ ...usageForm, operatorName: e.target.value })
                }
                placeholder="Operator name"
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={usageForm.notes || ""}
                onChange={(e) =>
                  setUsageForm({ ...usageForm, notes: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUsageForm(false)}>
              Cancel
            </Button>
            <Button onClick={saveUsageLog}>Log Hours</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── BREAKDOWN FORM ── */}
      <Dialog open={showBreakdownForm} onOpenChange={setShowBreakdownForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report Breakdown — {machine.name}</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg border border-destructive/20 text-destructive text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <p>
                This will set the machine status to <strong>Breakdown</strong>{" "}
                and create a service record automatically.
              </p>
            </div>
            <div>
              <Label>Describe the breakdown *</Label>
              <Textarea
                rows={3}
                value={breakdownCause}
                onChange={(e) => setBreakdownCause(e.target.value)}
                placeholder="What went wrong? Describe the fault clearly..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowBreakdownForm(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBreakdown}>
              Report Breakdown
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── ADD PART TO EXISTING SERVICE ── */}
      <Dialog
        open={!!showPartsForm}
        onOpenChange={() => setShowPartsForm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Part Replacement</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Part Name *</Label>
                <Input
                  value={partForm.partName || ""}
                  onChange={(e) =>
                    setPartForm({ ...partForm, partName: e.target.value })
                  }
                  placeholder="e.g. Focal Lens"
                />
              </div>
              <div>
                <Label>Part Number</Label>
                <Input
                  value={partForm.partNumber || ""}
                  onChange={(e) =>
                    setPartForm({ ...partForm, partNumber: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Unit</Label>
                <Input
                  value={partForm.unit || "pcs"}
                  onChange={(e) =>
                    setPartForm({ ...partForm, unit: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Quantity</Label>
                <Input
                  type="number"
                  value={partForm.quantity || 1}
                  onChange={(e) =>
                    setPartForm({
                      ...partForm,
                      quantity: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div>
                <Label>Unit Cost (₹)</Label>
                <Input
                  type="number"
                  value={partForm.unitCost || ""}
                  onChange={(e) =>
                    setPartForm({
                      ...partForm,
                      unitCost: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="col-span-2">
                <Label>Vendor</Label>
                <Input
                  value={partForm.vendorName || ""}
                  onChange={(e) =>
                    setPartForm({ ...partForm, vendorName: e.target.value })
                  }
                  placeholder="Supplier name"
                />
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea
                  rows={2}
                  value={partForm.notes || ""}
                  onChange={(e) =>
                    setPartForm({ ...partForm, notes: e.target.value })
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPartsForm(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!partForm.partName) {
                  toast.error("Part name required");
                  return;
                }
                const qty = Number(partForm.quantity) || 1;
                const cost = Number(partForm.unitCost) || 0;
                addServicePart({
                  id: crypto.randomUUID(),
                  serviceRecordId: showPartsForm!,
                  machineId,
                  partName: partForm.partName!,
                  partNumber: partForm.partNumber,
                  quantity: qty,
                  unit: partForm.unit || "pcs",
                  unitCost: cost,
                  totalCost: qty * cost,
                  vendorName: partForm.vendorName,
                  notes: partForm.notes,
                });
                toast.success("Part added");
                setPartForm({});
                setShowPartsForm(null);
              }}
            >
              Add Part
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Billable Service — Change Rate Dialog (Phase 40) */}
      <Dialog
        open={!!rateTarget}
        onOpenChange={(o) => !o && setRateTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Rate — {rateTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              Current rate: ₹
              {rateTarget
                ? currentServiceRate(rateTarget.id).toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : "0.00"}
              . Setting a new rate does not change any past usage revenue — it
              only applies going forward.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">New Rate (₹) *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                data-ocid="machine-detail.rate_dialog.rate.input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRateTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isSavingRate}
              onClick={handleSaveRate}
              data-ocid="machine-detail.rate_dialog.save_button"
            >
              {isSavingRate ? "Saving..." : "Set Rate"}
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
        open={!!deleteServiceRecordTarget}
        onOpenChange={(o) => !o && setDeleteServiceRecordTarget(null)}
        title="Delete service record?"
        description="This service record will be permanently deleted."
        onConfirm={() => {
          if (deleteServiceRecordTarget) {
            deleteServiceRecord(deleteServiceRecordTarget);
            toast.success("Deleted");
          }
          setDeleteServiceRecordTarget(null);
        }}
      />
    </div>
  );
}
