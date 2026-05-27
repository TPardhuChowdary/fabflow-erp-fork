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
import { canEdit, canView } from "../permissions";
import { useStore } from "../store";
import type {
  ProjectProductionStage,
  ProjectStageStatus,
  StageTransaction,
} from "../types";

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

const STAGE_CARD_STYLE: Record<
  ProjectStageStatus,
  { background: string; borderColor: string }
> = {
  NotStarted: { background: "#fdecea", borderColor: "#f5c6c4" },
  Sent: { background: "#fff7e6", borderColor: "#ffd591" },
  InProgress: { background: "#fff7e6", borderColor: "#ffd591" },
  Completed: { background: "#e6f7ec", borderColor: "#b7e4c7" },
  Received: { background: "#e6f7ec", borderColor: "#b7e4c7" },
};

const STAGE_STATUS_TEXT_COLORS: Record<ProjectStageStatus, string> = {
  NotStarted: "#a12622",
  Sent: "#a15c00",
  InProgress: "#a15c00",
  Completed: "#1f7a3e",
  Received: "#1f7a3e",
};

// ---- SentToSelect (same logic as ProjectDetail) ----
function SentToSelect({
  vendorId,
  vendorName,
  onChange,
}: {
  vendorId: string;
  vendorName: string;
  onChange: (id: string, name: string) => void;
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
        <SelectTrigger className="h-8 text-xs">
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

// ---- Main Production Dashboard ----
export function Production() {
  const { currentUser } = useAuth();
  const pEdit = canEdit(currentUser, "production");

  const {
    projects,
    projectProductions,
    updateProjectStagesV2,
    addStageTransaction,
    bomItems,
    inventoryItems,
  } = useStore();

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

  // ---- Material availability check ----
  const checkMaterialAvailability = (
    projectId: string,
  ): { ok: boolean; shortages: string[] } => {
    const projBomItems = (bomItems || []).filter(
      (b) => b.projectId === projectId,
    );
    const shortages: string[] = [];
    for (const bom of projBomItems) {
      const inv = (inventoryItems || []).find(
        (i) =>
          i.id === bom.inventoryItemId ||
          i.name.trim().toLowerCase() === bom.materialName.trim().toLowerCase(),
      );
      const available = inv?.quantityAvailable ?? 0;
      if (available < bom.requiredQuantity) {
        shortages.push(
          `${bom.materialName} requires ${bom.requiredQuantity} but only ${available} available`,
        );
      }
    }
    return { ok: shortages.length === 0, shortages };
  };

  // ---- Handlers ----

  const handleStatusChange = (
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
      const { ok, shortages } = checkMaterialAvailability(projectId);
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
    const updated = (prod.stages || []).map((s, i) =>
      i === stageIdx ? { ...s, status: newStatus } : s,
    );
    updateProjectStagesV2(projectId, updated);
  };

  const handleCompleteStage = (projectId: string, stageIdx: number) => {
    if (!pEdit) {
      toast.error("Access restricted: edit permission required");
      return;
    }
    const prod = projectProductions.find((pp) => pp.projectId === projectId);
    if (!prod) return;
    const stage = prod.stages?.[stageIdx];
    // Material check
    if (stage?.status === "NotStarted" || stage?.status === undefined) {
      const { ok, shortages } = checkMaterialAvailability(projectId);
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
    const updated = (prod.stages || []).map((s, i) =>
      i === stageIdx ? { ...s, status: "Completed" as ProjectStageStatus } : s,
    );
    updateProjectStagesV2(projectId, updated);
    toast.success("Stage marked complete");
  };

  const handleNotesChange = (
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
    const updated = (prod.stages || []).map((s, i) =>
      i === stageIdx ? { ...s, notes } : s,
    );
    updateProjectStagesV2(projectId, updated);
  };

  const handleSendMaterial = () => {
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
    addStageTransaction(sendDialog.projectId, sendDialog.stageIdx, tx);
    setSendDialog(null);
    setSendForm({ quantity: 0, dateTime: "", vendorId: "", vendorName: "" });
    toast.success("Material sent recorded");
  };

  const handleReceiveMaterial = () => {
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
    addStageTransaction(receiveDialog.projectId, receiveDialog.stageIdx, tx);
    setReceiveDialog(null);
    setReceiveForm({ quantity: 0, dateTime: "" });
    toast.success("Material received recorded");
  };

  const handleSaveQty = () => {
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
    updateProjectStagesV2(qtyDialog.projectId, updated);
    setQtyDialog(null);
    toast.success("Production quantities saved");
  };

  const handleSendToRework = () => {
    if (!pEdit) {
      toast.error("Access restricted: edit permission required");
      return;
    }
    if (!reworkDialog || !reworkTargetStage) {
      toast.error("Select a target stage");
      return;
    }
    const { projectId, stage, stageIdx } = reworkDialog;
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
      stageId: `rework-${Date.now()}`,
      referenceId: stage.stageId || `stage-${stageIdx}`,
      reworkStage: reworkTargetStage,
      sentQty: 0,
      receivedQty: 0,
      okQty: 0,
      rejectedQty: 0,
      assignedTo: "",
      vendor: "",
    };
    const updated = [...(prod.stages || []), newReworkStage];
    updateProjectStagesV2(projectId, updated);
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
                      <span className="text-[10px] bg-yellow-100 text-yellow-700 border border-yellow-200 rounded px-1.5 py-0.5">
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
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
                        All Complete
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No stages
                      </span>
                    )}
                    {totalStages > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full"
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
                        <div className="rounded-md bg-yellow-50 px-3 py-2 text-xs text-yellow-800 border border-yellow-200">
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
                                        ? "bg-amber-500 text-white"
                                        : isActive
                                          ? "bg-blue-500 text-white"
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
                                      <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 rounded px-1 py-0.5">
                                        Material
                                      </span>
                                    )}
                                    {stage.isRework && (
                                      <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 border border-amber-200 rounded px-1 py-0.5">
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
                                    <span className="text-[10px] bg-red-100 text-red-700 border border-red-200 rounded px-1.5 py-0.5 font-medium">
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
                                  {stage.requiresMaterialTracking ? (
                                    <div className="space-y-3">
                                      {/* Totals */}
                                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
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
                                          className={`border rounded-md p-2 text-center ${
                                            pending > 0
                                              ? "bg-orange-50 border-orange-200"
                                              : "bg-gray-50 border-gray-200"
                                          }`}
                                        >
                                          <div
                                            className={`text-xs font-medium ${
                                              pending > 0
                                                ? "text-orange-600"
                                                : "text-gray-500"
                                            }`}
                                          >
                                            Pending
                                          </div>
                                          <div
                                            className={`text-lg font-bold ${
                                              pending > 0
                                                ? "text-orange-700"
                                                : "text-gray-600"
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
                                          className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
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
                                            className="bg-amber-500 hover:bg-amber-600 text-white"
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
                                            <div className="text-[10px] text-green-600">
                                              OK Qty
                                            </div>
                                            <div className="text-sm font-bold text-green-700">
                                              {stage.okQty ?? 0}
                                            </div>
                                          </div>
                                          <div className="text-center">
                                            <div className="text-[10px] text-red-500">
                                              Rejected Qty
                                            </div>
                                            <div className="text-sm font-bold text-red-600">
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
                                                              ? "bg-blue-100 text-blue-700"
                                                              : "bg-green-100 text-green-700"
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
                                          className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
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
                                            className="bg-amber-500 hover:bg-amber-600 text-white"
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
                                            <div className="text-[10px] text-green-600">
                                              OK Qty
                                            </div>
                                            <div className="text-sm font-bold text-green-700">
                                              {stage.okQty ?? 0}
                                            </div>
                                          </div>
                                          <div className="text-center">
                                            <div className="text-[10px] text-red-500">
                                              Rejected Qty
                                            </div>
                                            <div className="text-sm font-bold text-red-600">
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
                                      rows={2}
                                      className="text-xs"
                                      placeholder="Notes for this stage..."
                                      value={stage.notes}
                                      onChange={(e) =>
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
                vendorName={sendForm.vendorName}
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
                <Label className="text-xs text-green-700">OK Quantity</Label>
                <Input
                  type="number"
                  className="h-8 text-xs border-green-300"
                  min={0}
                  value={qtyForm.okQty}
                  onChange={(e) =>
                    setQtyForm((f) => ({ ...f, okQty: Number(e.target.value) }))
                  }
                  data-ocid="production.qty.ok_input"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-red-600">
                  Rejected Quantity
                </Label>
                <Input
                  type="number"
                  className="h-8 text-xs border-red-300"
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
              <span className="text-amber-600">↺</span> Send to Rework
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 space-y-1">
              <p className="text-xs text-amber-700">
                <span className="font-semibold">Original Stage:</span>{" "}
                {reworkDialog?.stage.stageName}
              </p>
              <p className="text-xs text-amber-700">
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
              className="bg-amber-500 hover:bg-amber-600"
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
            <DialogTitle className="text-amber-600">
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
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
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
              onClick={() => {
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
                updateProjectStagesV2(
                  materialOverrideDialog.projectId,
                  updated,
                );
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
    </div>
  );
}
