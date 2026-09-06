// Phase 7 (Group 2) — the one reusable usage-history UI for Machine/Die/
// Tool, on top of asset_usage_events (Phase 51). Used from each entity's
// own detail page with a different assetType/assetId, never duplicated
// per domain — same "one component, many owners" shape as
// AssetPhotoGallery.
//
// Deliberately does NOT touch tool_assignment_history — Tools keep their
// own existing Issue/Reassign/Return dialog exactly as it is; this is a
// separate, additive log, not a replacement.

import { EmployeeSelect } from "@/components/EmployeeSelect";
import { ProjectSelect } from "@/components/ProjectSelect";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createAssetUsageEvent } from "@/lib/assetUsageEventsApi";
import { useStore } from "@/store";
import type { AssetUsageEventType, MachineCondition } from "@/types";
import { Clock, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

interface AssetUsageSectionProps {
  assetType: "machine" | "die" | "tool";
  assetId: string;
  canEdit: boolean;
  "data-ocid"?: string;
}

const EVENT_TYPES: AssetUsageEventType[] = [
  "issued",
  "returned",
  "used",
  "maintenance",
  "inspection",
  "other",
];

const CONDITIONS: MachineCondition[] = [
  "Excellent",
  "Good",
  "Fair",
  "Poor",
  "Critical",
];

const EVENT_BADGE: Record<AssetUsageEventType, string> = {
  issued: "bg-info/10 text-info border-info/30",
  returned: "bg-success/10 text-success border-success/30",
  used: "bg-primary/10 text-primary border-primary/30",
  maintenance: "bg-warning/15 text-warning border-warning/30",
  inspection: "bg-secondary text-secondary-foreground border-border",
  other: "bg-muted text-muted-foreground border-border",
};

export function AssetUsageSection({
  assetType,
  assetId,
  canEdit,
  "data-ocid": dataOcid,
}: AssetUsageSectionProps) {
  const {
    assetUsageEvents,
    addAssetUsageEventLocal,
    jobCards,
    employees,
    projects,
  } = useStore();
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    eventType: "used" as AssetUsageEventType,
    employeeId: "",
    projectId: "",
    jobCardId: "",
    quantity: "",
    conditionBefore: "",
    conditionAfter: "",
    notes: "",
  });

  const events = useMemo(
    () =>
      (assetUsageEvents || []).filter(
        (e) => e.assetType === assetType && e.assetId === assetId,
      ),
    [assetUsageEvents, assetType, assetId],
  );

  const jobCardOptions = useMemo(
    () =>
      (jobCards || []).filter(
        (jc) => !form.projectId || jc.projectId === form.projectId,
      ),
    [jobCards, form.projectId],
  );

  function resetForm() {
    setForm({
      eventType: "used",
      employeeId: "",
      projectId: "",
      jobCardId: "",
      quantity: "",
      conditionBefore: "",
      conditionAfter: "",
      notes: "",
    });
  }

  async function handleSave() {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const employeeName = form.employeeId
        ? (employees || []).find((e) => e.id === form.employeeId)?.name
        : undefined;
      const result = await createAssetUsageEvent({
        assetType,
        assetId,
        eventType: form.eventType,
        employeeId: form.employeeId || undefined,
        employeeName,
        projectId: form.projectId || undefined,
        jobCardId: form.jobCardId || undefined,
        quantity: form.quantity ? Number(form.quantity) : undefined,
        conditionBefore: form.conditionBefore || undefined,
        conditionAfter: form.conditionAfter || undefined,
        notes: form.notes || undefined,
      });
      if (result.status === "unauthenticated") {
        toast.error("Not signed in to Supabase - usage was not logged.");
        return;
      }
      if (
        result.status === "error" ||
        result.status === "denied" ||
        !result.data
      ) {
        toast.error(`Could not log usage: ${result.error ?? "unknown error"}`);
        return;
      }
      addAssetUsageEventLocal(result.data);
      toast.success("Usage logged");
      resetForm();
      setOpen(false);
    } finally {
      setIsSaving(false);
    }
  }

  const projectLabel = (id?: string) => {
    const p = (projects || []).find((x) => x.id === id);
    return p ? `${p.projectNo} — ${p.projectName}` : undefined;
  };
  const jobCardLabel = (id?: string) => {
    const jc = (jobCards || []).find((x) => x.id === id);
    return jc ? jc.jobNo : undefined;
  };

  return (
    <div
      className="rounded-lg border bg-card p-4 space-y-3"
      data-ocid={dataOcid}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" /> Usage History
        </h3>
        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen(true)}
            data-ocid={dataOcid ? `${dataOcid}.log_button` : undefined}
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Log Usage
          </Button>
        )}
      </div>

      {events.length === 0 ? (
        <p className="text-xs text-muted-foreground">No usage recorded yet.</p>
      ) : (
        <div className="space-y-1.5">
          {events.map((e) => (
            <div
              key={e.id}
              className="flex items-start justify-between gap-3 text-sm bg-muted/30 rounded px-3 py-2"
            >
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="outline"
                    className={`text-xs ${EVENT_BADGE[e.eventType]}`}
                  >
                    {e.eventType}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(e.eventAt).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {[
                    e.employeeName,
                    projectLabel(e.projectId),
                    jobCardLabel(e.jobCardId),
                    e.quantity !== undefined ? `Qty ${e.quantity}` : undefined,
                    e.conditionBefore || e.conditionAfter
                      ? `Condition: ${e.conditionBefore ?? "—"} → ${e.conditionAfter ?? "—"}`
                      : undefined,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
                {e.notes && <p className="text-xs">{e.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Log Usage</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Event Type</Label>
              <Select
                value={form.eventType}
                onValueChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    eventType: v as AssetUsageEventType,
                  }))
                }
              >
                <SelectTrigger data-ocid="asset-usage.form.event_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Employee</Label>
              <EmployeeSelect
                value={form.employeeId}
                onChange={(v) => setForm((p) => ({ ...p, employeeId: v }))}
                data-ocid="asset-usage.form.employee"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Project</Label>
              <ProjectSelect
                value={form.projectId}
                onChange={(v) =>
                  setForm((p) => ({ ...p, projectId: v, jobCardId: "" }))
                }
              />
            </div>
            {form.projectId && jobCardOptions.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Job Card</Label>
                <Select
                  value={form.jobCardId || "none"}
                  onValueChange={(v) =>
                    setForm((p) => ({ ...p, jobCardId: v === "none" ? "" : v }))
                  }
                >
                  <SelectTrigger data-ocid="asset-usage.form.job_card">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {jobCardOptions.map((jc) => (
                      <SelectItem key={jc.id} value={jc.id}>
                        {jc.jobNo} — {jc.jobDescription}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Quantity</Label>
              <Input
                type="number"
                value={form.quantity}
                onChange={(e) =>
                  setForm((p) => ({ ...p, quantity: e.target.value }))
                }
                placeholder="Optional"
                data-ocid="asset-usage.form.quantity"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Condition Before</Label>
                <Select
                  value={form.conditionBefore || "none"}
                  onValueChange={(v) =>
                    setForm((p) => ({
                      ...p,
                      conditionBefore: v === "none" ? "" : v,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {CONDITIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Condition After</Label>
                <Select
                  value={form.conditionAfter || "none"}
                  onValueChange={(v) =>
                    setForm((p) => ({
                      ...p,
                      conditionAfter: v === "none" ? "" : v,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {CONDITIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) =>
                  setForm((p) => ({ ...p, notes: e.target.value }))
                }
                rows={2}
                data-ocid="asset-usage.form.notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              data-ocid="asset-usage.form.save"
            >
              {isSaving ? "Saving…" : "Log Usage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
