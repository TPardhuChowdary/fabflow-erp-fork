import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle2, ClipboardList, Clock, PackageCheck } from "lucide-react";
import { ShieldOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { canCreate, canDelete, canEdit, canView } from "../permissions";
import { useStore } from "../store";
import type { BomRequisitionStatus } from "../types";

type FilterTab = "All" | BomRequisitionStatus;

const STATUS_CONFIG: Record<
  BomRequisitionStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  Pending: {
    label: "Pending",
    className: "bg-amber-100 text-amber-800 border-amber-200",
    icon: <Clock className="h-3 w-3" />,
  },
  "Ready to Complete": {
    label: "Ready to Complete",
    className: "bg-blue-100 text-blue-800 border-blue-200",
    icon: <PackageCheck className="h-3 w-3" />,
  },
  Completed: {
    label: "Completed",
    className: "bg-green-100 text-green-800 border-green-200",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
};

export function MaterialRequisitions() {
  const { currentUser } = useAuth();
  const pView = canView(currentUser, "material_requisitions");
  const pCreate = canCreate(currentUser, "material_requisitions");
  const pEdit = canEdit(currentUser, "material_requisitions");
  const pDelete = canDelete(currentUser, "material_requisitions");
  const { bomRequisitions, updateBomRequisition, projects } = useStore();
  const [activeTab, setActiveTab] = useState<FilterTab>("All");

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

  function handleMarkCompleted(id: string) {
    if (!pEdit) {
      toast.error("Access restricted: edit permission required");
      return;
    }
    updateBomRequisition(id, { status: "Completed", updatedAt: Date.now() });
    toast.success("Requisition marked as completed");
  }

  function getProjectLabel(projectId: string) {
    const project = projects.find((p) => p.id === projectId);
    return project?.projectNo ?? projectId;
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
                            ? "text-red-500/70 text-sm"
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
                        {pEdit && req.status === "Ready to Complete" && (
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
                        {req.status === "Pending" && (
                          <span className="text-xs text-muted-foreground italic">
                            Waiting for purchase
                          </span>
                        )}
                        {req.status === "Completed" && (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
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
    </div>
  );
}
