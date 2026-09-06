// Phase 4 (Group 2) — Tool detail workspace, same pattern as
// DieDetail.tsx/MachineDetail.tsx: a real detail page, basic-info
// editing stays in Tools.tsx's Add/Edit dialog. Deliberately does NOT
// duplicate Tools.tsx's existing Issue/Reassign/Return history dialog
// (tool_assignment_history, Phase 43 - explicitly kept operational,
// unchanged, per the Group 2 architecture) - that stays reachable from
// the Tools list exactly as it already is; this page adds what Tools
// never had at all: Photos and Drawing links.

import { AssetPhotoGallery } from "@/components/AssetPhotoGallery";
import { AssetUsageSection } from "@/components/AssetUsageSection";
import { ConnectedRecordLink } from "@/components/ConnectedRecordLink";
import { DrawingLinkPicker } from "@/components/DrawingLinkPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDrawingEditorStore } from "@/drawingEditor/store/useDrawingEditorStore";
import { canEdit, canView } from "@/permissions";
import { useStore } from "@/store";
import type { ToolStatus } from "@/types";
import { ArrowLeft, Clock, Cog, FileText, Info, ShieldOff } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useAuth } from "../AuthContext";

interface ToolDetailProps {
  toolId: string | null;
  onBack: () => void;
  onOpenDrawing?: (drawingId: string) => void;
  // Phase 14 (Group 2) — Connected Records: makes the Purchase Vendor
  // field a real clickable link via the app's one navigation chokepoint.
  onViewVendor?: (vendorId: string) => void;
}

const STATUS_COLOR: Record<ToolStatus, string> = {
  Available: "bg-success/10 text-success border-success/30",
  "In Use": "bg-info/10 text-info border-info/30",
  "Under Repair": "bg-warning/15 text-warning border-warning/30",
  Lost: "bg-destructive/10 text-destructive border-destructive/30",
  Retired: "bg-muted text-muted-foreground border-border",
};

export function ToolDetail({
  toolId,
  onBack,
  onOpenDrawing,
  onViewVendor,
}: ToolDetailProps) {
  const { currentUser } = useAuth();
  const pView = canView(currentUser, "tools");
  const pEdit = canEdit(currentUser, "tools");

  const { tools, vendors } = useStore();
  const {
    drawings: allDrawings,
    loaded: drawingsLoaded,
    loadDrawings,
    links: drawingLinks,
    linksLoaded,
    loadLinks,
    addLink: addDrawingLink,
    removeLink: removeDrawingLink,
  } = useDrawingEditorStore();

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount
  useEffect(() => {
    if (!drawingsLoaded) loadDrawings();
    if (!linksLoaded) loadLinks();
  }, [drawingsLoaded, linksLoaded]);

  const tool = useMemo(
    () => (tools || []).find((t) => t.id === toolId),
    [tools, toolId],
  );

  const vendorName = (id?: string) =>
    id ? (vendors || []).find((v) => v.id === id)?.name : undefined;

  const linkedDrawingIds = (drawingLinks || [])
    .filter((l) => l.linkedType === "tool" && l.linkedId === toolId)
    .map((l) => l.drawingId);
  const linkedDrawings = (allDrawings || []).filter((d) =>
    linkedDrawingIds.includes(d.id),
  );

  function handleAddDrawingLink(drawingId: string) {
    if (!toolId) return;
    addDrawingLink(drawingId, "tool", toolId);
  }
  function handleRemoveDrawingLink(drawingId: string) {
    const link = (drawingLinks || []).find(
      (l) =>
        l.linkedType === "tool" &&
        l.linkedId === toolId &&
        l.drawingId === drawingId,
    );
    if (link) removeDrawingLink(link.id);
  }

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

  if (!tool) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <p className="text-sm text-muted-foreground">Tool not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-ocid="tool-detail.panel">
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
              {tool.toolCode}
            </span>
            <Badge variant="outline" className={STATUS_COLOR[tool.status]}>
              {tool.status}
            </Badge>
          </div>
          <h1 className="text-xl font-semibold tracking-tight mt-1">
            {tool.name}
          </h1>
          <p className="text-xs text-muted-foreground">
            {tool.category || "Tool"} · Qty {tool.quantity}
          </p>
        </div>
      </div>

      {/* Photo + Basic Info row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <AssetPhotoGallery
          ownerType="tool"
          ownerId={tool.id}
          canEdit={pEdit}
          legacyPhotoDataUrl={tool.photoData || undefined}
          heroMode
          heroAlt={tool.name}
          heroClassName="relative rounded-xl border overflow-hidden bg-muted/30 flex items-center justify-center lg:col-span-1"
          data-ocid="tool-detail.photo"
        />

        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Info className="w-4 h-4 text-primary" /> Basic Information
            </h3>
            {[
              { label: "Location", value: tool.location },
              { label: "Condition", value: tool.condition },
              { label: "Assigned To", value: tool.assignedEmployeeName },
            ]
              .filter((f) => f.value)
              .map((f) => (
                <div key={f.label} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{f.label}</span>
                  <span className="font-medium text-right">{f.value}</span>
                </div>
              ))}
            {tool.notes && (
              <p className="text-xs text-muted-foreground border-t pt-2 mt-2">
                {tool.notes}
              </p>
            )}
          </div>

          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Cog className="w-4 h-4 text-primary" /> Purchase Information
            </h3>
            {[
              { label: "Purchase Date", value: tool.purchaseDate },
              {
                label: "Replacement Value",
                value: tool.replacementValue
                  ? `₹${tool.replacementValue.toLocaleString("en-IN")}`
                  : undefined,
              },
            ]
              .filter((f) => f.value)
              .map((f) => (
                <div key={f.label} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{f.label}</span>
                  <span className="font-medium text-right">{f.value}</span>
                </div>
              ))}
            {/* Phase 14 (Group 2) — Connected Records: the vendor is a
                real FK (purchaseVendorId), pulled out of the generic
                label/value list above so it can be a clickable link. */}
            {(tool.purchaseVendorName || vendorName(tool.purchaseVendorId)) && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Vendor</span>
                <ConnectedRecordLink
                  label={
                    tool.purchaseVendorName ||
                    (vendorName(tool.purchaseVendorId) as string)
                  }
                  onClick={
                    tool.purchaseVendorId && onViewVendor
                      ? () => onViewVendor(tool.purchaseVendorId as string)
                      : undefined
                  }
                  data-ocid="tool-detail.purchase.vendor_link"
                />
              </div>
            )}
            {!tool.purchaseDate &&
              !tool.replacementValue &&
              !tool.purchaseVendorName && (
                <p className="text-xs text-muted-foreground">
                  No purchase details recorded.
                </p>
              )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="drawings">
        <TabsList>
          <TabsTrigger value="drawings" data-ocid="tool-detail.drawings.tab">
            <FileText className="w-3.5 h-3.5 mr-1.5" /> Drawings (
            {linkedDrawings.length})
          </TabsTrigger>
          <TabsTrigger value="activity" data-ocid="tool-detail.activity.tab">
            <Clock className="w-3.5 h-3.5 mr-1.5" /> Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="drawings" className="pt-4">
          <div className="rounded-lg border bg-card p-4 space-y-3 max-w-lg">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Linked Drawings
            </h3>
            {pEdit && (
              <DrawingLinkPicker
                linkedDrawingIds={linkedDrawingIds}
                onAdd={handleAddDrawingLink}
                onRemove={handleRemoveDrawingLink}
                data-ocid="tool-detail.drawings.picker"
              />
            )}
            {linkedDrawings.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No drawings linked yet.
              </p>
            ) : (
              <div className="space-y-1.5">
                {linkedDrawings.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => onOpenDrawing?.(d.id)}
                    className="w-full flex items-center gap-2 text-sm bg-muted/30 hover:bg-muted rounded px-3 py-1.5 text-left"
                    data-ocid="tool-detail.drawings.open_button"
                  >
                    <Cog className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{d.fileName}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="activity" className="pt-4">
          <AssetUsageSection
            assetType="tool"
            assetId={tool.id}
            canEdit={pEdit}
            data-ocid="tool-detail.activity"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
