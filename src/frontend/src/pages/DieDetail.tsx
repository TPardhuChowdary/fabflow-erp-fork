// Phase 4 (Group 2) — Die detail workspace, built on the same pattern
// MachineDetail.tsx already established: a real detail page (not a
// bigger dialog), basic-info editing stays in Dies.tsx's Add/Edit dialog
// (MachineDetail.tsx has no inline edit of its own either — same
// precedent), this page is read + relationship management (Photos,
// Compatibility, Drawings, Usage).
//
// Reuses, never duplicates: machine_dies + addMachineDieRemote/
// removeMachineDieRemote (already proven live from the Machine side and
// from Dies.tsx's own dialog), drawing_links + DrawingLinkPicker (already
// proven live, Phase 43), asset_photos + AssetPhotoGallery (Phase 51),
// asset_usage_events (Phase 51, first real UI consumer).

import { AssetPhotoGallery } from "@/components/AssetPhotoGallery";
import { AssetUsageSection } from "@/components/AssetUsageSection";
import { ConnectedRecordLink } from "@/components/ConnectedRecordLink";
import { DrawingLinkPicker } from "@/components/DrawingLinkPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDrawingEditorStore } from "@/drawingEditor/store/useDrawingEditorStore";
import {
  addMachineDieRemote,
  removeMachineDieRemote,
} from "@/lib/machineCompatibilityApi";
import { canEdit, canView } from "@/permissions";
import { useStore } from "@/store";
import type { DieStatus } from "@/types";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Cog,
  FileText,
  Info,
  Link2,
  ShieldOff,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../AuthContext";

interface DieDetailProps {
  dieId: string | null;
  onBack: () => void;
  onOpenDrawing?: (drawingId: string) => void;
  // Phase 14 (Group 2) — Connected Records: makes the Purchase Vendor
  // field a real clickable link via the app's one navigation chokepoint.
  onViewVendor?: (vendorId: string) => void;
}

const STATUS_COLOR: Record<DieStatus, string> = {
  Draft: "bg-secondary text-secondary-foreground border-border",
  Available: "bg-success/10 text-success border-success/30",
  "In Use": "bg-info/10 text-info border-info/30",
  "Under Maintenance": "bg-warning/15 text-warning border-warning/30",
  Retired: "bg-muted text-muted-foreground border-border",
};

export function DieDetail({
  dieId,
  onBack,
  onOpenDrawing,
  onViewVendor,
}: DieDetailProps) {
  const { currentUser } = useAuth();
  const pView = canView(currentUser, "tooling_dies");
  const pEdit = canEdit(currentUser, "tooling_dies");

  const {
    dies,
    machines,
    machineDies,
    vendors,
    projects,
    addMachineDieLocal,
    removeMachineDieLocal,
  } = useStore();

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

  const [isCompatSaving, setIsCompatSaving] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount
  useEffect(() => {
    if (!drawingsLoaded) loadDrawings();
    if (!linksLoaded) loadLinks();
  }, [drawingsLoaded, linksLoaded]);

  const die = useMemo(
    () => (dies || []).find((d) => d.id === dieId),
    [dies, dieId],
  );

  const vendorName = (id?: string) =>
    id ? (vendors || []).find((v) => v.id === id)?.name : undefined;
  const projectLabel = (id?: string) => {
    const p = (projects || []).find((x) => x.id === id);
    return p ? `${p.projectNo} — ${p.projectName}` : undefined;
  };

  const compatibleMachineIds = useMemo(
    () =>
      (machineDies || [])
        .filter((md) => md.dieId === dieId)
        .map((md) => md.machineId),
    [machineDies, dieId],
  );
  const compatibleMachines = (machines || []).filter((m) =>
    compatibleMachineIds.includes(m.id),
  );
  const availableMachines = (machines || []).filter(
    (m) => !compatibleMachineIds.includes(m.id),
  );

  async function handleAddCompatibleMachine(machineId: string) {
    if (!dieId) return;
    setIsCompatSaving(true);
    try {
      const result = await addMachineDieRemote(machineId, dieId);
      if (result.status === "unauthenticated") {
        toast.error("Not signed in to Supabase - machine was not linked.");
        return;
      }
      if (result.status === "error" || result.status === "denied") {
        toast.error(
          `Could not link machine: ${result.error ?? "unknown error"}`,
        );
        return;
      }
      addMachineDieLocal(machineId, dieId);
      toast.success("Machine linked");
    } finally {
      setIsCompatSaving(false);
    }
  }

  async function handleRemoveCompatibleMachine(machineId: string) {
    if (!dieId) return;
    setIsCompatSaving(true);
    try {
      const result = await removeMachineDieRemote(machineId, dieId);
      if (result.status === "unauthenticated") {
        toast.error("Not signed in to Supabase - machine was not unlinked.");
        return;
      }
      if (result.status === "error" || result.status === "denied") {
        toast.error(
          `Could not unlink machine: ${result.error ?? "unknown error"}`,
        );
        return;
      }
      removeMachineDieLocal(machineId, dieId);
      toast.success("Machine unlinked");
    } finally {
      setIsCompatSaving(false);
    }
  }

  const linkedDrawingIds = (drawingLinks || [])
    .filter((l) => l.linkedType === "die" && l.linkedId === dieId)
    .map((l) => l.drawingId);
  const linkedDrawings = (allDrawings || []).filter((d) =>
    linkedDrawingIds.includes(d.id),
  );

  function handleAddDrawingLink(drawingId: string) {
    if (!dieId) return;
    addDrawingLink(drawingId, "die", dieId);
  }
  function handleRemoveDrawingLink(drawingId: string) {
    const link = (drawingLinks || []).find(
      (l) =>
        l.linkedType === "die" &&
        l.linkedId === dieId &&
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

  if (!die) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <p className="text-sm text-muted-foreground">Die not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-ocid="die-detail.panel">
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
              {die.dieCode}
            </span>
            <Badge variant="outline" className={STATUS_COLOR[die.status]}>
              {die.status}
            </Badge>
          </div>
          <h1 className="text-xl font-semibold tracking-tight mt-1">
            {die.name}
          </h1>
          <p className="text-xs text-muted-foreground">
            {[die.type, die.purpose].filter(Boolean).join(" · ") ||
              "Die / Tooling"}
          </p>
        </div>
      </div>

      {/* Photo + Basic Info row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <AssetPhotoGallery
          ownerType="die"
          ownerId={die.id}
          canEdit={pEdit}
          legacyPhotoDataUrl={die.photoData || undefined}
          heroMode
          heroAlt={die.name}
          heroClassName="relative rounded-xl border overflow-hidden bg-muted/30 flex items-center justify-center lg:col-span-1"
          data-ocid="die-detail.photo"
        />

        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Info className="w-4 h-4 text-primary" /> Basic Information
            </h3>
            {[
              { label: "Location", value: die.location },
              { label: "Condition", value: die.condition },
              { label: "Date Created", value: die.dateCreated },
              {
                label: "Original Project",
                value: projectLabel(die.originalProjectId),
              },
            ]
              .filter((f) => f.value)
              .map((f) => (
                <div key={f.label} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{f.label}</span>
                  <span className="font-medium text-right">{f.value}</span>
                </div>
              ))}
            {die.notes && (
              <p className="text-xs text-muted-foreground border-t pt-2 mt-2">
                {die.notes}
              </p>
            )}
          </div>

          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" /> Purchase Information
            </h3>
            {[
              { label: "Purchase Date", value: die.purchaseDate },
              {
                label: "Purchase Cost",
                value: die.purchaseCost
                  ? `₹${die.purchaseCost.toLocaleString("en-IN")}`
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
            {(die.purchaseVendorName || vendorName(die.purchaseVendorId)) && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Vendor</span>
                <ConnectedRecordLink
                  label={
                    die.purchaseVendorName ||
                    (vendorName(die.purchaseVendorId) as string)
                  }
                  onClick={
                    die.purchaseVendorId && onViewVendor
                      ? () => onViewVendor(die.purchaseVendorId as string)
                      : undefined
                  }
                  data-ocid="die-detail.purchase.vendor_link"
                />
              </div>
            )}
            {!die.purchaseDate &&
              !die.purchaseCost &&
              !die.purchaseVendorName && (
                <p className="text-xs text-muted-foreground">
                  No purchase details recorded.
                </p>
              )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="compatibility">
        <TabsList>
          <TabsTrigger
            value="compatibility"
            data-ocid="die-detail.compatibility.tab"
          >
            <Wrench className="w-3.5 h-3.5 mr-1.5" /> Compatibility (
            {compatibleMachines.length})
          </TabsTrigger>
          <TabsTrigger value="drawings" data-ocid="die-detail.drawings.tab">
            <FileText className="w-3.5 h-3.5 mr-1.5" /> Drawings (
            {linkedDrawings.length})
          </TabsTrigger>
          <TabsTrigger value="activity" data-ocid="die-detail.activity.tab">
            <Clock className="w-3.5 h-3.5 mr-1.5" /> Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compatibility" className="pt-4">
          <div className="rounded-lg border bg-card p-4 space-y-3 max-w-lg">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Link2 className="w-4 h-4 text-primary" /> Compatible Machines
            </h3>
            <p className="text-xs text-muted-foreground">
              This die can be compatible with any number of machines — link
              every machine it actually fits.
            </p>
            {pEdit && availableMachines.length > 0 && (
              <Select
                value=""
                onValueChange={(v) => handleAddCompatibleMachine(v)}
                disabled={isCompatSaving}
              >
                <SelectTrigger data-ocid="die-detail.compatibility.add_select">
                  <SelectValue placeholder="+ Link a machine..." />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {availableMachines.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} ({m.machineCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {compatibleMachines.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No compatible machines linked yet.
              </p>
            ) : (
              <div className="space-y-1.5">
                {compatibleMachines.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between text-sm bg-muted/30 rounded px-3 py-1.5"
                  >
                    <span>
                      {m.name} ({m.machineCode})
                    </span>
                    {pEdit && (
                      <button
                        type="button"
                        disabled={isCompatSaving}
                        onClick={() => handleRemoveCompatibleMachine(m.id)}
                        className="text-muted-foreground hover:text-destructive"
                        data-ocid="die-detail.compatibility.remove_button"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="drawings" className="pt-4 space-y-4">
          <div className="rounded-lg border bg-card p-4 space-y-3 max-w-lg">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Linked Drawings
            </h3>
            {pEdit && (
              <DrawingLinkPicker
                linkedDrawingIds={linkedDrawingIds}
                onAdd={handleAddDrawingLink}
                onRemove={handleRemoveDrawingLink}
                data-ocid="die-detail.drawings.picker"
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
                    data-ocid="die-detail.drawings.open_button"
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
            assetType="die"
            assetId={die.id}
            canEdit={pEdit}
            data-ocid="die-detail.activity"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
