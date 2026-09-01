import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ShieldOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { checkMaterialAvailability } from "../lib/materialAvailability";
import { createVendorRemote } from "../lib/vendorsApi";
import { canCreate, canEdit, canView, hasPermission } from "../permissions";
import { ProductionGateStatusBadge } from "../qms/components/ProductionGateStatusBadge";
import { QmsGateOverrideDialog } from "../qms/components/QmsGateOverrideDialog";
import { getStageInspectionGate } from "../qms/lib/productionGate";
import { useQmsStore } from "../qms/store/useQmsStore";
import { useStore } from "../store";
import type {
  ProjectProductionStage,
  ProjectStageStatus,
  StageTransaction,
} from "../types";

const STAGE_STATUS_COLORS: Record<ProjectStageStatus, string> = {
  NotStarted: "bg-destructive/10 text-destructive",
  Sent: "bg-info/10 text-info",
  InProgress: "bg-warning/15 text-warning",
  Completed: "bg-success/10 text-success",
  Received: "bg-success/10 text-success",
};

const STAGE_STATUS_LABELS: Record<ProjectStageStatus, string> = {
  NotStarted: "Not Started",
  Sent: "Sent",
  InProgress: "In Progress",
  Completed: "Completed",
  Received: "Received",
};

// Same real per-status color intent as STAGE_STATUS_COLORS above (Not
// Started reads as destructive, Sent/In Progress as warning, Completed/
// Received as success) — these two feed inline `style` props instead of
// `className` (the surrounding card also sets inline pixel values for
// minWidth/borderRadius/boxShadow this pass isn't touching), so the
// tokens are expressed as real oklch(var(--x)) CSS functions rather than
// Tailwind utility classes, at the same 10%/30%/full-opacity levels used
// everywhere else in this pass.
const STAGE_CARD_STYLE: Record<
  ProjectStageStatus,
  { background: string; borderColor: string }
> = {
  NotStarted: {
    background: "oklch(var(--destructive) / 0.1)",
    borderColor: "oklch(var(--destructive) / 0.3)",
  },
  Sent: {
    background: "oklch(var(--warning) / 0.15)",
    borderColor: "oklch(var(--warning) / 0.3)",
  },
  InProgress: {
    background: "oklch(var(--warning) / 0.15)",
    borderColor: "oklch(var(--warning) / 0.3)",
  },
  Completed: {
    background: "oklch(var(--success) / 0.1)",
    borderColor: "oklch(var(--success) / 0.3)",
  },
  Received: {
    background: "oklch(var(--success) / 0.1)",
    borderColor: "oklch(var(--success) / 0.3)",
  },
};

const STAGE_STATUS_TEXT_COLORS: Record<ProjectStageStatus, string> = {
  NotStarted: "oklch(var(--destructive))",
  Sent: "oklch(var(--warning))",
  InProgress: "oklch(var(--warning))",
  Completed: "oklch(var(--success))",
  Received: "oklch(var(--success))",
};

// ---- SentToSelect (same logic as ProjectDetail) ----
function SentToSelect({
  vendorId,
  onChange,
}: {
  vendorId: string;
  onChange: (id: string, name: string) => void;
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

interface ProductionProps {
  /** Task #176 - "Open Inspection" action on a gate-blocked/linked stage.
   * Optional so existing callers/tests that don't pass it keep working;
   * App.tsx wires it exactly like InspectionSheetsList/InspectorDashboard
   * already do for the same "jump to this project" pattern. */
  onOpenProject?: (projectId: string) => void;
}

// ---- Main Production Dashboard ----
export function Production({ onOpenProject }: ProductionProps = {}) {
  const { currentUser } = useAuth();
  const pEdit = canEdit(currentUser, "production");
  // Phase 32 (Task #176) - supervisor/admin Production-gate override. Raw
  // hasPermission() call (not canEdit/canCreate/etc.) since inspection_
  // sheets uses its own non-standard action vocabulary, matching the
  // established convention elsewhere in this codebase.
  const canOverrideGate = hasPermission(
    currentUser,
    "inspection_sheets.override",
  );

  const {
    projects,
    projectProductions,
    updateProjectStagesV2,
    addStageTransaction,
    bomItems,
    inventoryItems,
  } = useStore();

  const {
    projectQmsInspections,
    projectQmsInspectionOverrides,
    createProjectQmsInspectionOverride,
  } = useQmsStore();

  // Which project is expanded
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(
    null,
  );
  // Which stage within the expanded project is expanded
  const [expandedStageIdx, setExpandedStageIdx] = useState<number | null>(null);

  // Send Material dialog state
  const [sendDialog, setSendDialog] = useState<{
    projectId: string;
    stageIdx: number;
  } | null>(null);
  const [sendForm, setSendForm] = useState({
    quantity: 0,
    dateTime: "",
    vendorId: "",
    vendorName: "",
  });

  // Mark Received dialog state
  const [receiveDialog, setReceiveDialog] = useState<{
    projectId: string;
    stageIdx: number;
  } | null>(null);
  const [receiveForm, setReceiveForm] = useState({ quantity: 0, dateTime: "" });

  // Production Qty dialog state
  const [qtyDialog, setQtyDialog] = useState<{
    projectId: string;
    stageIdx: number;
  } | null>(null);
  const [qtyForm, setQtyForm] = useState({
    sentQty: 0,
    receivedQty: 0,
    okQty: 0,
    rejectedQty: 0,
  });
  const [qtyError, setQtyError] = useState("");

  // Rework dialog state
  const [reworkDialog, setReworkDialog] = useState<{
    projectId: string;
    stageIdx: number;
    stage: ProjectProductionStage;
  } | null>(null);
  const [reworkTargetStage, setReworkTargetStage] = useState("");

  // Material availability override dialog
  const [materialOverrideDialog, setMaterialOverrideDialog] = useState<{
    projectId: string;
    stageIdx: number;
    newStatus: ProjectStageStatus;
    shortages: string[];
  } | null>(null);

  // Phase 32 (Task #176) - QMS inspection gate override dialog. A
  // separate condition from material availability above - both must
  // clear (or be overridden) for a stage to reach "Completed".
  const [gateOverrideDialog, setGateOverrideDialog] = useState<{
    projectId: string;
    stageIdx: number;
    stageName: string;
    gate: Extract<ReturnType<typeof getStageInspectionGate>, { linked: true }>;
  } | null>(null);

  // Build enriched project rows
  const projectRows = projects.map((project) => {
    const production = projectProductions.find(
      (pp) => pp.projectId === project.id,
    );
    const stages = production?.stages || [];
    const isLegacy =
      !project.productionVersion || project.productionVersion === "legacy";
    const activeStage = stages.find(
      (s) => s.status !== "Completed" && s.status !== "Received",
    );
    const completedCount = stages.filter(
      (s) => s.status === "Completed" || s.status === "Received",
    ).length;
    return {
      project,
      production,
      stages,
      isLegacy,
      activeStage,
      completedCount,
      totalStages: stages.length,
    };
  });

  const totalProjects = projectRows.length;
  const inProductionCount = projectRows.filter(
    (r) => r.stages.length > 0,
  ).length;

  // Production Queue — all active/in-progress stages across projects
  const productionQueue = projectRows.flatMap((r) =>
    r.stages
      .filter((s) => s.status === "InProgress" || s.status === "Sent")
      .map((s, stageIdx) => ({ project: r.project, stage: s, stageIdx })),
  );

  // ---- Material availability check ----
  // ---- Handlers ----

  const handleStatusChange = async (
    projectId: string,
    stageIdx: number,
    newStatus: ProjectStageStatus,
  ) => {
    if (!pEdit) {
      toast.error("Access restricted: edit permission required");
      return;
    }
    // Material check when starting a stage
    if (newStatus === "InProgress") {
      const { ok, shortages } = checkMaterialAvailability(
        projectId,
        bomItems,
        inventoryItems,
      );
      if (!ok) {
        const isAdmin =
          currentUser?.role === "admin" || currentUser?.role === "Admin";
        if (isAdmin) {
          setMaterialOverrideDialog({
            projectId,
            stageIdx,
            newStatus,
            shortages,
          });
          return;
        }
        toast.error(`Material not available: ${shortages[0]}`);
        return;
      }
    }
    const prod = projectProductions.find((pp) => pp.projectId === projectId);
    if (!prod) return;
    // Phase 32 (Task #176) - QMS inspection gate. An additional condition
    // to the material check above, independent of it, and only relevant
    // for the "Completed" transition (rule §4 - the gate is about
    // proceeding, not starting). Follows the inspection's server-derived
    // status only (rule §6) - never recalculated here.
    if (newStatus === "Completed") {
      const stage = prod.stages?.[stageIdx];
      const gate = getStageInspectionGate(
        stage?.stageId,
        projectQmsInspections.filter((i) => i.projectId === projectId),
        projectQmsInspectionOverrides,
      );
      if (gate.linked && !gate.canProceed) {
        if (canOverrideGate) {
          setGateOverrideDialog({
            projectId,
            stageIdx,
            stageName: stage?.stageName ?? "",
            gate,
          });
        } else {
          toast.error(
            `Cannot complete "${stage?.stageName}": ${gate.blockReason}`,
          );
        }
        return;
      }
    }
    const updated = (prod.stages || []).map((s, i) =>
      i === stageIdx ? { ...s, status: newStatus } : s,
    );
    const ok = await updateProjectStagesV2(projectId, updated);
    if (!ok) toast.error("Could not save stage status - please try again");
  };

  const handleCompleteStage = async (projectId: string, stageIdx: number) => {
    if (!pEdit) {
      toast.error("Access restricted: edit permission required");
      return;
    }
    const prod = projectProductions.find((pp) => pp.projectId === projectId);
    if (!prod) return;
    const stage = prod.stages?.[stageIdx];
    // Material check
    if (stage?.status === "NotStarted" || stage?.status === undefined) {
      const { ok, shortages } = checkMaterialAvailability(
        projectId,
        bomItems,
        inventoryItems,
      );
      if (!ok) {
        const isAdmin =
          currentUser?.role === "admin" || currentUser?.role === "Admin";
        if (isAdmin) {
          setMaterialOverrideDialog({
            projectId,
            stageIdx,
            newStatus: "Completed",
            shortages,
          });
          return;
        }
        toast.error(`Material not available: ${shortages[0]}`);
        return;
      }
    }
    // Phase 32 (Task #176) - QMS inspection gate, independent of the
    // material check above (rule: "the QMS gate should be an additional
    // condition").
    const gate = getStageInspectionGate(
      stage?.stageId,
      projectQmsInspections.filter((i) => i.projectId === projectId),
      projectQmsInspectionOverrides,
    );
    if (gate.linked && !gate.canProceed) {
      if (canOverrideGate) {
        setGateOverrideDialog({
          projectId,
          stageIdx,
          stageName: stage?.stageName ?? "",
          gate,
        });
      } else {
        toast.error(
          `Cannot complete "${stage?.stageName}": ${gate.blockReason}`,
        );
      }
      return;
    }
    const updated = (prod.stages || []).map((s, i) =>
      i === stageIdx ? { ...s, status: "Completed" as ProjectStageStatus } : s,
    );
    const ok = await updateProjectStagesV2(projectId, updated);
    if (ok) {
      toast.success("Stage marked complete");
    } else {
      toast.error("Could not save stage completion - please try again");
    }
  };

  // Fires on blur, not on every keystroke (see the Textarea's onBlur call
  // site below) - now that this goes through the remote-first
  // updateProjectStagesV2, awaiting a network round-trip on every
  // character would make the field lag/drop keystrokes.
  const handleNotesChange = async (
    projectId: string,
    stageIdx: number,
    notes: string,
  ) => {
    if (!pEdit) {
      toast.error("Access restricted: edit permission required");
      return;
    }
    const prod = projectProductions.find((pp) => pp.projectId === projectId);
    if (!prod) return;
    if (prod.stages?.[stageIdx]?.notes === notes) return; // no-op blur, unchanged
    const updated = (prod.stages || []).map((s, i) =>
      i === stageIdx ? { ...s, notes } : s,
    );
    const ok = await updateProjectStagesV2(projectId, updated);
    if (!ok) toast.error("Could not save notes - please try again");
  };

  const handleSendMaterial = async () => {
    if (!pEdit) {
      toast.error("Access restricted: edit permission required");
      return;
    }
    if (!sendDialog) return;
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
      sendDialog.projectId,
      sendDialog.stageIdx,
      tx,
    );
    if (!ok) {
      toast.error("Could not record material sent - please try again");
      return;
    }
    setSendDialog(null);
    setSendForm({ quantity: 0, dateTime: "", vendorId: "", vendorName: "" });
    toast.success("Material sent recorded");
  };

  const handleReceiveMaterial = async () => {
    if (!pEdit) {
      toast.error("Access restricted: edit permission required");
      return;
    }
    if (!receiveDialog) return;
    if (receiveForm.quantity <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    const prod = projectProductions.find(
      (pp) => pp.projectId === receiveDialog.projectId,
    );
    const stage = prod?.stages?.[receiveDialog.stageIdx];
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
      receiveDialog.projectId,
      receiveDialog.stageIdx,
      tx,
    );
    if (!ok) {
      toast.error("Could not record material received - please try again");
      return;
    }
    setReceiveDialog(null);
    setReceiveForm({ quantity: 0, dateTime: "" });
    toast.success("Material received recorded");
  };

  const handleSaveQty = async () => {
    if (!pEdit) {
      toast.error("Access restricted: edit permission required");
      return;
    }
    if (!qtyDialog) return;
    const { okQty, rejectedQty, receivedQty } = qtyForm;
    if (okQty + rejectedQty !== receivedQty) {
      setQtyError(
        `OK Qty (${okQty}) + Rejected Qty (${rejectedQty}) must equal Received Qty (${receivedQty})`,
      );
      return;
    }
    setQtyError("");
    const prod = projectProductions.find(
      (pp) => pp.projectId === qtyDialog.projectId,
    );
    if (!prod) return;
    const updated = (prod.stages || []).map((s, i) =>
      i === qtyDialog.stageIdx
        ? {
            ...s,
            sentQty: qtyForm.sentQty,
            receivedQty: qtyForm.receivedQty,
            okQty: qtyForm.okQty,
            rejectedQty: qtyForm.rejectedQty,
          }
        : s,
    );
    const ok = await updateProjectStagesV2(qtyDialog.projectId, updated);
    if (!ok) {
      toast.error("Could not save production quantities - please try again");
      return;
    }
    setQtyDialog(null);
    toast.success("Production quantities saved");
  };

  const handleSendToRework = async () => {
    if (!pEdit) {
      toast.error("Access restricted: edit permission required");
      return;
    }
    if (!reworkDialog || !reworkTargetStage) {
      toast.error("Select a target stage");
      return;
    }
    const { projectId, stage } = reworkDialog;
    const prod = projectProductions.find((pp) => pp.projectId === projectId);
    if (!prod) return;
    const newReworkStage: ProjectProductionStage = {
      stageName: `Rework: ${reworkTargetStage}`,
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
      requiresMaterialTracking: false,
      transactions: [],
      isRework: true,
      // A real UUID, not a timestamp string - this becomes the
      // production_stage_transactions/inspection-gate-referenced stageId,
      // which must cast to Postgres uuid.
      stageId: crypto.randomUUID(),
      referenceId: stage.stageId,
      reworkStage: reworkTargetStage,
      sentQty: 0,
      receivedQty: 0,
      okQty: 0,
      rejectedQty: 0,
      assignedTo: "",
      vendor: "",
    };
    const updated = [...(prod.stages || []), newReworkStage];
    const ok = await updateProjectStagesV2(projectId, updated);
    if (!ok) {
      toast.error("Could not create rework stage - please try again");
      return;
    }
    setReworkDialog(null);
    setReworkTargetStage("");
    toast.success(`Rework stage created: Rework: ${reworkTargetStage}`);
  };

  if (!canView(currentUser, "production")) {
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
    <div className="space-y-4" data-ocid="production.page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Production Tracking</h1>
          <p className="text-sm text-muted-foreground">
            {inProductionCount} of {totalProjects} project
            {totalProjects !== 1 ? "s" : ""} in production
          </p>
        </div>
      </div>

      {/* Active Production Queue */}
      {productionQueue.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Active Queue
            </span>
            <span className="ml-auto text-xs bg-warning/15 text-warning px-2 py-0.5 rounded-full font-medium">
              {productionQueue.length} stage
              {productionQueue.length > 1 ? "s" : ""} active
            </span>
          </div>
          <div className="divide-y">
            {productionQueue.map(({ project, stage }) => (
              <div
                key={`${project.id}-${stage.stageName}`}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-mono text-muted-foreground">
                    {project.projectNo}
                  </span>
                  <span className="mx-2 text-muted-foreground">·</span>
                  <span className="text-sm font-medium">{stage.stageName}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {stage.requiresMaterialTracking && (
                    <span className="text-[10px] bg-info/10 text-info border border-info/30 rounded px-1.5 py-0.5">
                      Material
                    </span>
                  )}
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STAGE_STATUS_COLORS[stage.status]}`}
                  >
                    {STAGE_STATUS_LABELS[stage.status]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {projectRows.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">No projects yet</p>
        </div>
      )}

      {/* Project Cards */}
      <div className="space-y-3">
        {projectRows.map(
          ({
            project,
            stages,
            isLegacy,
            activeStage,
            completedCount,
            totalStages,
          }) => {
            const isExpanded = expandedProjectId === project.id;

            return (
              <Card key={project.id} className="overflow-hidden">
                {/* Project Header Row */}
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                  onClick={() => {
                    setExpandedProjectId(isExpanded ? null : project.id);
                    setExpandedStageIdx(null);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-sm">
                      {project.projectName}
                    </span>
                    {isLegacy && (
                      <span className="text-[10px] bg-warning/15 text-warning border border-warning/30 rounded px-1.5 py-0.5">
                        Legacy
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {activeStage ? (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${STAGE_STATUS_COLORS[activeStage.status]}`}
                      >
                        {activeStage.stageName}:{" "}
                        {STAGE_STATUS_LABELS[activeStage.status]}
                      </span>
                    ) : totalStages > 0 ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-success/10 text-success">
                        All Complete
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No stages
                      </span>
                    )}
                    {totalStages > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-success rounded-full"
                            style={{
                              width: `${Math.round((completedCount / totalStages) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {completedCount}/{totalStages}
                        </span>
                      </div>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {/* Expanded Stage List */}
                {isExpanded && (
                  <CardContent className="px-4 pb-4 pt-0 border-t">
                    {isLegacy ? (
                      <div className="mt-3">
                        <div className="rounded-md bg-warning/15 px-3 py-2 text-xs text-warning border border-warning/30">
                          This project uses the legacy production system.
                          Production data is view-only.
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "16px",
                            overflowX: "auto",
                            padding: "12px 0",
                          }}
                          className="pointer-events-none opacity-80"
                        >
                          {stages.map((stage, idx) => {
                            const prevStage = idx > 0 ? stages[idx - 1] : null;
                            const isLocked =
                              prevStage !== null &&
                              prevStage.status !== "Completed" &&
                              prevStage.status !== "Received";
                            return (
                              <div
                                key={`${stage.stageName}-${idx}`}
                                style={{
                                  minWidth: "200px",
                                  flexShrink: 0,
                                  background:
                                    STAGE_CARD_STYLE[stage.status].background,
                                  borderColor:
                                    STAGE_CARD_STYLE[stage.status].borderColor,
                                  borderWidth: "1px",
                                  borderStyle: "solid",
                                  borderRadius: "12px",
                                  padding: "12px 16px",
                                  boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
                                }}
                                className={`flex items-center justify-between ${isLocked ? "opacity-50" : ""}`}
                              >
                                <div className="flex items-center gap-3">
                                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-bold">
                                    {idx + 1}
                                  </span>
                                  <span className="text-sm font-semibold">
                                    {stage.stageName}
                                  </span>
                                </div>
                                <span
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: 500,
                                    color:
                                      STAGE_STATUS_TEXT_COLORS[stage.status],
                                    marginRight: "4px",
                                  }}
                                >
                                  {STAGE_STATUS_LABELS[stage.status]}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : stages.length === 0 ? (
                      <div className="mt-3 text-center text-sm text-muted-foreground py-4">
                        No stages defined for this project.
                      </div>
                    ) : (
                      <div
                        className="mt-3"
                        style={{
                          display: "flex",
                          gap: "16px",
                          overflowX: "auto",
                          padding: "12px 0",
                        }}
                      >
                        {stages.map((stage, idx) => {
                          const prevStage = idx > 0 ? stages[idx - 1] : null;
                          const isLocked =
                            prevStage !== null &&
                            prevStage.status !== "Completed";
                          const isStageExpanded = expandedStageIdx === idx;
                          const isActive =
                            !isLocked && stage.status !== "Completed";
                          const txs = stage.transactions || [];
                          const totalSent = txs
                            .filter((t) => t.type === "send")
                            .reduce((a, t) => a + t.quantity, 0);
                          const totalReceived = txs
                            .filter((t) => t.type === "receive")
                            .reduce((a, t) => a + t.quantity, 0);
                          const pending = totalSent - totalReceived;
                          const hasRejected = (stage.rejectedQty ?? 0) > 0;

                          const cardStyle = STAGE_CARD_STYLE[stage.status];
                          return (
                            <div
                              style={{
                                minWidth: "220px",
                                flexShrink: 0,
                                background: stage.isRework
                                  ? "#fffbeb"
                                  : cardStyle.background,
                                borderColor: stage.isRework
                                  ? "#fcd34d"
                                  : cardStyle.borderColor,
                                borderWidth: "1px",
                                borderStyle: "solid",
                                borderRadius: "12px",
                                boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
                              }}
                              key={`${stage.stageName}-${idx}`}
                              className={`${isLocked ? "opacity-60" : ""}`}
                            >
                              {/* Stage Header */}
                              <div className="flex items-center justify-between px-4 py-3">
                                <button
                                  type="button"
                                  className="flex items-center gap-3 flex-1 text-left"
                                  onClick={() =>
                                    !isLocked &&
                                    setExpandedStageIdx(
                                      isStageExpanded ? null : idx,
                                    )
                                  }
                                  disabled={isLocked}
                                >
                                  <span
                                    className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                                      stage.isRework
                                        ? "bg-warning text-warning-foreground"
                                        : isActive
                                          ? "bg-info text-info-foreground"
                                          : "bg-muted text-muted-foreground"
                                    }`}
                                  >
                                    {idx + 1}
                                  </span>
                                  <div>
                                    <span className="text-sm font-semibold">
                                      {stage.stageName}
                                    </span>
                                    {stage.requiresMaterialTracking && (
                                      <span className="ml-2 text-[10px] bg-warning/15 text-warning rounded px-1 py-0.5">
                                        Material
                                      </span>
                                    )}
                                    {stage.isRework && (
                                      <span className="ml-2 text-[10px] bg-warning/15 text-warning border border-warning/30 rounded px-1 py-0.5">
                                        Rework
                                      </span>
                                    )}
                                    {isLocked && (
                                      <span className="ml-2 text-xs text-muted-foreground">
                                        (locked)
                                      </span>
                                    )}
                                  </div>
                                </button>
                                <div className="flex items-center gap-2">
                                  {hasRejected && (
                                    <span className="text-[10px] bg-destructive/10 text-destructive border border-destructive/30 rounded px-1.5 py-0.5 font-medium">
                                      {stage.rejectedQty} rejected
                                    </span>
                                  )}
                                  <span
                                    style={{
                                      fontSize: "11px",
                                      fontWeight: 500,
                                      color:
                                        STAGE_STATUS_TEXT_COLORS[stage.status],
                                    }}
                                  >
                                    {STAGE_STATUS_LABELS[stage.status]}
                                  </span>
                                  <button
                                    type="button"
                                    className="p-1 rounded hover:bg-muted disabled:opacity-40"
                                    onClick={() =>
                                      !isLocked &&
                                      setExpandedStageIdx(
                                        isStageExpanded ? null : idx,
                                      )
                                    }
                                    disabled={isLocked}
                                  >
                                    {isStageExpanded ? (
                                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                    )}
                                  </button>
                                </div>
                              </div>

                              {/* Stage Body */}
                              {isStageExpanded && (
                                <div className="border-t px-4 py-4 space-y-4">
                                  {/* Phase 32 (Task #176) - QMS gate status.
                                   * Read-only here (linking itself is done
                                   * from ProjectDetail's Production tab) -
                                   * renders nothing when this stage has no
                                   * linked inspection, per the "don't
                                   * clutter unlinked stages" rule. */}
                                  {(() => {
                                    const gate = getStageInspectionGate(
                                      stage.stageId,
                                      projectQmsInspections.filter(
                                        (i) => i.projectId === project.id,
                                      ),
                                      projectQmsInspectionOverrides,
                                    );
                                    if (!gate.linked) return null;
                                    return (
                                      <div className="border rounded-md px-3 py-2 bg-muted/20 flex items-center justify-between gap-2 flex-wrap">
                                        <ProductionGateStatusBadge
                                          gate={gate}
                                        />
                                        {onOpenProject && (
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-6 px-2 text-[11px] shrink-0"
                                            onClick={() =>
                                              onOpenProject(project.id)
                                            }
                                            data-ocid={`production.open_inspection.${stage.stageId}`}
                                          >
                                            Open Inspection →
                                          </Button>
                                        )}
                                      </div>
                                    );
                                  })()}
                                  {stage.requiresMaterialTracking ? (
                                    <div className="space-y-3">
                                      {/* Totals */}
                                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                        <div className="bg-info/10 border border-info/30 rounded-md p-2 text-center">
                                          <div className="text-xs text-info font-medium">
                                            Total Sent
                                          </div>
                                          <div className="text-lg font-bold text-info">
                                            {totalSent}
                                          </div>
                                        </div>
                                        <div className="bg-success/10 border border-success/30 rounded-md p-2 text-center">
                                          <div className="text-xs text-success font-medium">
                                            Total Received
                                          </div>
                                          <div className="text-lg font-bold text-success">
                                            {totalReceived}
                                          </div>
                                        </div>
                                        <div
                                          className={`border rounded-md p-2 text-center ${
                                            pending > 0
                                              ? "bg-warning/15 border-warning/30"
                                              : "bg-muted border-border"
                                          }`}
                                        >
                                          <div
                                            className={`text-xs font-medium ${
                                              pending > 0
                                                ? "text-warning"
                                                : "text-muted-foreground"
                                            }`}
                                          >
                                            Pending
                                          </div>
                                          <div
                                            className={`text-lg font-bold ${
                                              pending > 0
                                                ? "text-warning"
                                                : "text-muted-foreground"
                                            }`}
                                          >
                                            {pending}
                                          </div>
                                        </div>
                                      </div>
                                      {/* Actions */}
                                      <div className="flex flex-wrap gap-2">
                                        {pEdit && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                              setSendDialog({
                                                projectId: project.id,
                                                stageIdx: idx,
                                              });
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
                                        )}
                                        {pEdit && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={totalSent <= 0}
                                            onClick={() => {
                                              setReceiveDialog({
                                                projectId: project.id,
                                                stageIdx: idx,
                                              });
                                              setReceiveForm({
                                                quantity: 0,
                                                dateTime: "",
                                              });
                                            }}
                                          >
                                            Mark Received
                                          </Button>
                                        )}
                                        {totalReceived >= totalSent &&
                                          totalSent > 0 &&
                                          stage.status !== "Completed" && (
                                            <Button
                                              size="sm"
                                              onClick={() =>
                                                handleCompleteStage(
                                                  project.id,
                                                  idx,
                                                )
                                              }
                                            >
                                              Mark Complete
                                            </Button>
                                          )}
                                        {/* Production Qty button */}
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="text-info border-info/30 hover:bg-info/10"
                                          onClick={() => {
                                            setQtyDialog({
                                              projectId: project.id,
                                              stageIdx: idx,
                                            });
                                            setQtyForm({
                                              sentQty: stage.sentQty ?? 0,
                                              receivedQty:
                                                stage.receivedQty ?? 0,
                                              okQty: stage.okQty ?? 0,
                                              rejectedQty:
                                                stage.rejectedQty ?? 0,
                                            });
                                            setQtyError("");
                                          }}
                                          data-ocid={`production.qty_button.${idx + 1}`}
                                        >
                                          Production Qty
                                        </Button>
                                        {/* Send to Rework */}
                                        {hasRejected && (
                                          <Button
                                            size="sm"
                                            className="bg-warning hover:bg-warning/90 text-warning-foreground"
                                            onClick={() => {
                                              setReworkDialog({
                                                projectId: project.id,
                                                stageIdx: idx,
                                                stage,
                                              });
                                              setReworkTargetStage("");
                                            }}
                                            data-ocid={`production.rework_button.${idx + 1}`}
                                          >
                                            Send to Rework
                                          </Button>
                                        )}
                                      </div>
                                      {/* Production Qty Summary */}
                                      {(stage.sentQty !== undefined ||
                                        stage.receivedQty !== undefined) && (
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-muted/30 rounded-md p-2">
                                          <div className="text-center">
                                            <div className="text-[10px] text-muted-foreground">
                                              Sent Qty
                                            </div>
                                            <div className="text-sm font-bold">
                                              {stage.sentQty ?? 0}
                                            </div>
                                          </div>
                                          <div className="text-center">
                                            <div className="text-[10px] text-muted-foreground">
                                              Received Qty
                                            </div>
                                            <div className="text-sm font-bold">
                                              {stage.receivedQty ?? 0}
                                            </div>
                                          </div>
                                          <div className="text-center">
                                            <div className="text-[10px] text-success">
                                              OK Qty
                                            </div>
                                            <div className="text-sm font-bold text-success">
                                              {stage.okQty ?? 0}
                                            </div>
                                          </div>
                                          <div className="text-center">
                                            <div className="text-[10px] text-destructive">
                                              Rejected Qty
                                            </div>
                                            <div className="text-sm font-bold text-destructive">
                                              {stage.rejectedQty ?? 0}
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                      {/* Transaction History */}
                                      {txs.length > 0 && (
                                        <div className="space-y-1">
                                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                            Transaction History
                                          </p>
                                          <div className="table-wrapper">
                                            <div className="border rounded-md overflow-hidden">
                                              <table
                                                className="w-full text-xs"
                                                style={{ minWidth: "300px" }}
                                              >
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
                                                    <tr
                                                      key={tx.id}
                                                      className="border-t"
                                                    >
                                                      <td className="px-2 py-1">
                                                        <span
                                                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                                            tx.type === "send"
                                                              ? "bg-info/10 text-info"
                                                              : "bg-success/10 text-success"
                                                          }`}
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
                                                            ).toLocaleString(
                                                              "en-IN",
                                                            )
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
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    /* Non-material stage */
                                    <div className="space-y-3">
                                      <div className="space-y-1">
                                        <Label className="text-xs">
                                          Status
                                        </Label>
                                        <Select
                                          value={stage.status}
                                          onValueChange={(v) =>
                                            handleStatusChange(
                                              project.id,
                                              idx,
                                              v as ProjectStageStatus,
                                            )
                                          }
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
                                      <div className="flex flex-wrap gap-2">
                                        {stage.status !== "Completed" && (
                                          <Button
                                            size="sm"
                                            onClick={() =>
                                              handleCompleteStage(
                                                project.id,
                                                idx,
                                              )
                                            }
                                          >
                                            Mark as Complete
                                          </Button>
                                        )}
                                        {/* Production Qty */}
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="text-info border-info/30 hover:bg-info/10"
                                          onClick={() => {
                                            setQtyDialog({
                                              projectId: project.id,
                                              stageIdx: idx,
                                            });
                                            setQtyForm({
                                              sentQty: stage.sentQty ?? 0,
                                              receivedQty:
                                                stage.receivedQty ?? 0,
                                              okQty: stage.okQty ?? 0,
                                              rejectedQty:
                                                stage.rejectedQty ?? 0,
                                            });
                                            setQtyError("");
                                          }}
                                          data-ocid={`production.qty_button.${idx + 1}`}
                                        >
                                          Production Qty
                                        </Button>
                                        {/* Send to Rework */}
                                        {hasRejected && (
                                          <Button
                                            size="sm"
                                            className="bg-warning hover:bg-warning/90 text-warning-foreground"
                                            onClick={() => {
                                              setReworkDialog({
                                                projectId: project.id,
                                                stageIdx: idx,
                                                stage,
                                              });
                                              setReworkTargetStage("");
                                            }}
                                            data-ocid={`production.rework_button.${idx + 1}`}
                                          >
                                            Send to Rework
                                          </Button>
                                        )}
                                      </div>
                                      {/* Production Qty Summary */}
                                      {(stage.sentQty !== undefined ||
                                        stage.receivedQty !== undefined) && (
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-muted/30 rounded-md p-2">
                                          <div className="text-center">
                                            <div className="text-[10px] text-muted-foreground">
                                              Sent Qty
                                            </div>
                                            <div className="text-sm font-bold">
                                              {stage.sentQty ?? 0}
                                            </div>
                                          </div>
                                          <div className="text-center">
                                            <div className="text-[10px] text-muted-foreground">
                                              Received Qty
                                            </div>
                                            <div className="text-sm font-bold">
                                              {stage.receivedQty ?? 0}
                                            </div>
                                          </div>
                                          <div className="text-center">
                                            <div className="text-[10px] text-success">
                                              OK Qty
                                            </div>
                                            <div className="text-sm font-bold text-success">
                                              {stage.okQty ?? 0}
                                            </div>
                                          </div>
                                          <div className="text-center">
                                            <div className="text-[10px] text-destructive">
                                              Rejected Qty
                                            </div>
                                            <div className="text-sm font-bold text-destructive">
                                              {stage.rejectedQty ?? 0}
                                            </div>
                                          </div>
                                        </div>
                                      )}
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
                                      onBlur={(e) =>
                                        handleNotesChange(
                                          project.id,
                                          idx,
                                          e.target.value,
                                        )
                                      }
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          },
        )}
      </div>

      {/* Send Material Dialog */}
      <Dialog
        open={!!sendDialog}
        onOpenChange={(open) => !open && setSendDialog(null)}
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
                  setSendForm((f) => ({ ...f, quantity: +e.target.value }))
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
                  setSendForm((f) => ({ ...f, dateTime: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sent To</Label>
              <SentToSelect
                vendorId={sendForm.vendorId}
                onChange={(id, name) =>
                  setSendForm((f) => ({ ...f, vendorId: id, vendorName: name }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSendDialog(null)}
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
        open={!!receiveDialog}
        onOpenChange={(open) => !open && setReceiveDialog(null)}
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
                  setReceiveForm((f) => ({ ...f, quantity: +e.target.value }))
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
                  setReceiveForm((f) => ({ ...f, dateTime: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReceiveDialog(null)}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleReceiveMaterial}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Production Qty Dialog */}
      <Dialog
        open={!!qtyDialog}
        onOpenChange={(open) => {
          if (!open) {
            setQtyDialog(null);
            setQtyError("");
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Production Quantities</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Validation: OK Qty + Rejected Qty must equal Received Qty
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Sent Quantity</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  min={0}
                  value={qtyForm.sentQty}
                  onChange={(e) =>
                    setQtyForm((f) => ({
                      ...f,
                      sentQty: Number(e.target.value),
                    }))
                  }
                  data-ocid="production.qty.sent_input"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Received Quantity</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  min={0}
                  value={qtyForm.receivedQty}
                  onChange={(e) =>
                    setQtyForm((f) => ({
                      ...f,
                      receivedQty: Number(e.target.value),
                    }))
                  }
                  data-ocid="production.qty.received_input"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-success">OK Quantity</Label>
                <Input
                  type="number"
                  className="h-8 text-xs border-success/40"
                  min={0}
                  value={qtyForm.okQty}
                  onChange={(e) =>
                    setQtyForm((f) => ({ ...f, okQty: Number(e.target.value) }))
                  }
                  data-ocid="production.qty.ok_input"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-destructive">
                  Rejected Quantity
                </Label>
                <Input
                  type="number"
                  className="h-8 text-xs border-destructive/40"
                  min={0}
                  value={qtyForm.rejectedQty}
                  onChange={(e) =>
                    setQtyForm((f) => ({
                      ...f,
                      rejectedQty: Number(e.target.value),
                    }))
                  }
                  data-ocid="production.qty.rejected_input"
                />
              </div>
            </div>
            {qtyError && (
              <p
                className="text-xs text-destructive"
                data-ocid="production.qty.error_state"
              >
                {qtyError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQtyDialog(null);
                setQtyError("");
              }}
              data-ocid="production.qty.cancel_button"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveQty}
              data-ocid="production.qty.save_button"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send to Rework Dialog */}
      <Dialog
        open={!!reworkDialog}
        onOpenChange={(open) => !open && setReworkDialog(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-warning">↺</span> Send to Rework
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-md bg-warning/15 border border-warning/30 px-3 py-2 space-y-1">
              <p className="text-xs text-warning">
                <span className="font-semibold">Original Stage:</span>{" "}
                {reworkDialog?.stage.stageName}
              </p>
              <p className="text-xs text-warning">
                <span className="font-semibold">Rejected Qty:</span>{" "}
                {reworkDialog?.stage.rejectedQty ?? 0}
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Target Stage for Rework *</Label>
              <Select
                value={reworkTargetStage}
                onValueChange={setReworkTargetStage}
              >
                <SelectTrigger
                  className="h-8 text-xs"
                  data-ocid="production.rework.target_stage.select"
                >
                  <SelectValue placeholder="Select target stage..." />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const prod = reworkDialog
                      ? projectProductions.find(
                          (pp) => pp.projectId === reworkDialog.projectId,
                        )
                      : null;
                    return (prod?.stages || [])
                      .filter((_, i) => i !== reworkDialog?.stageIdx)
                      .map((s) => (
                        <SelectItem
                          key={s.stageName}
                          value={s.stageName}
                          className="text-xs"
                        >
                          {s.stageName}
                        </SelectItem>
                      ));
                  })()}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReworkDialog(null)}
              data-ocid="production.rework.cancel_button"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-warning hover:bg-warning/90"
              onClick={handleSendToRework}
              data-ocid="production.rework.confirm_button"
            >
              Create Rework Stage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Material Override Dialog (Admin only) */}
      <Dialog
        open={!!materialOverrideDialog}
        onOpenChange={(open) => !open && setMaterialOverrideDialog(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-warning">
              ⚠ Material Shortage
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              The following materials are insufficient:
            </p>
            <ul className="space-y-1">
              {(materialOverrideDialog?.shortages || []).map((s) => (
                <li
                  key={s}
                  className="text-xs text-destructive flex items-start gap-1"
                >
                  <span className="mt-0.5">•</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-warning bg-warning/15 border border-warning/30 rounded p-2">
              Admin override: Proceeding will start this stage despite the
              shortage.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMaterialOverrideDialog(null)}
              data-ocid="production.material_override.cancel_button"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={async () => {
                if (!materialOverrideDialog) return;
                const prod = projectProductions.find(
                  (pp) => pp.projectId === materialOverrideDialog.projectId,
                );
                if (!prod) return;
                const updated = (prod.stages || []).map((s, i) =>
                  i === materialOverrideDialog.stageIdx
                    ? { ...s, status: materialOverrideDialog.newStatus }
                    : s,
                );
                const ok = await updateProjectStagesV2(
                  materialOverrideDialog.projectId,
                  updated,
                );
                if (!ok) {
                  toast.error("Could not save override - please try again");
                  return;
                }
                setMaterialOverrideDialog(null);
                toast.success("Stage started (admin override)");
              }}
              data-ocid="production.material_override.confirm_button"
            >
              Proceed Anyway
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
              projectQmsInspectionId: gateOverrideDialog.gate.inspection.id,
              requiredProductionStageId:
                gateOverrideDialog.gate.inspection.requiredProductionStageId ??
                "",
              reason,
              byUserId: currentUser?.id ?? "",
              byUserName: currentUser?.username ?? "unknown",
            });
            if (result.status !== "success") {
              toast.error(result.error || "Could not record override");
              return false;
            }
            const prod = projectProductions.find(
              (pp) => pp.projectId === gateOverrideDialog.projectId,
            );
            if (!prod) return false;
            const updated = (prod.stages || []).map((s, i) =>
              i === gateOverrideDialog.stageIdx
                ? { ...s, status: "Completed" as ProjectStageStatus }
                : s,
            );
            const ok = await updateProjectStagesV2(
              gateOverrideDialog.projectId,
              updated,
            );
            if (!ok) {
              toast.error("Could not save stage completion - please try again");
              return false;
            }
            toast.success(
              "Stage marked complete (supervisor override recorded)",
            );
            return true;
          }}
        />
      )}
    </div>
  );
}
