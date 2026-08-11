import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { CreateCharacteristicInput } from "../api";
import {
  CATEGORY_SUGGESTIONS,
  CRITICALITY_LABELS,
  INSPECTION_METHOD_TYPE_LABELS,
} from "../constants";
import type {
  InspectionMethod,
  ManufacturingProcess,
  Operation,
  QmsCriticality,
  QualityCharacteristic,
} from "../types";
import { QMS_CRITICALITY_LEVELS } from "../types";

const GENERIC_CUSTOMER = "__generic__";

interface FormState {
  name: string;
  description: string;
  category: string;
  processId: string;
  operationId: string;
  criticality: QmsCriticality;
  inspectionMethodId: string;
  acceptanceCriteria: string;
  toleranceNominal: string;
  tolerancePlus: string;
  toleranceMinus: string;
  unit: string;
  measuringInstrument: string;
  standardReference: string;
  drawingReference: string;
  evidenceRequired: boolean;
  photoRequired: boolean;
  customerScope: string;
  tags: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  category: "",
  processId: "",
  operationId: "",
  criticality: "FunctionalCritical",
  inspectionMethodId: "",
  acceptanceCriteria: "",
  toleranceNominal: "",
  tolerancePlus: "",
  toleranceMinus: "",
  unit: "",
  measuringInstrument: "",
  standardReference: "",
  drawingReference: "",
  evidenceRequired: false,
  photoRequired: false,
  customerScope: GENERIC_CUSTOMER,
  tags: "",
};

function toForm(c: QualityCharacteristic): FormState {
  return {
    name: c.name,
    description: c.description,
    category: c.category,
    processId: c.processId,
    operationId: c.operationId,
    criticality: c.criticality,
    inspectionMethodId: c.inspectionMethodId,
    acceptanceCriteria: c.acceptanceCriteria,
    toleranceNominal: c.toleranceNominal?.toString() ?? "",
    tolerancePlus: c.tolerancePlus?.toString() ?? "",
    toleranceMinus: c.toleranceMinus?.toString() ?? "",
    unit: c.unit ?? "",
    measuringInstrument: c.measuringInstrument ?? "",
    standardReference: c.standardReference ?? "",
    drawingReference: c.drawingReference ?? "",
    evidenceRequired: c.evidenceRequired,
    photoRequired: c.photoRequired,
    customerScope: c.customerScope ?? GENERIC_CUSTOMER,
    tags: c.tags.join(", "),
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: QualityCharacteristic | null;
  processes: ManufacturingProcess[];
  operations: Operation[];
  inspectionMethods: InspectionMethod[];
  customers: Array<{ id: string; name: string }>;
  onCreate: (input: CreateCharacteristicInput) => Promise<unknown>;
  onUpdate: (
    id: string,
    updates: Partial<CreateCharacteristicInput>,
  ) => Promise<unknown>;
}

export function CharacteristicFormDialog({
  open,
  onOpenChange,
  editing,
  processes,
  operations,
  inspectionMethods,
  customers,
  onCreate,
  onUpdate,
}: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(editing ? toForm(editing) : EMPTY_FORM);
  }, [open, editing]);

  const visibleOperations = form.processId
    ? operations.filter((o) => o.processId === form.processId)
    : [];

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!form.processId || !form.operationId) {
      toast.error("Process and Operation are required");
      return;
    }
    if (!form.inspectionMethodId) {
      toast.error("Inspection Method is required");
      return;
    }

    const input: CreateCharacteristicInput = {
      name: form.name.trim(),
      description: form.description.trim(),
      category: form.category.trim() || "Uncategorized",
      processId: form.processId,
      operationId: form.operationId,
      criticality: form.criticality,
      inspectionMethodId: form.inspectionMethodId,
      acceptanceCriteria: form.acceptanceCriteria.trim(),
      toleranceNominal: form.toleranceNominal
        ? Number(form.toleranceNominal)
        : undefined,
      tolerancePlus: form.tolerancePlus
        ? Number(form.tolerancePlus)
        : undefined,
      toleranceMinus: form.toleranceMinus
        ? Number(form.toleranceMinus)
        : undefined,
      unit: form.unit.trim() || undefined,
      measuringInstrument: form.measuringInstrument.trim() || undefined,
      standardReference: form.standardReference.trim() || undefined,
      drawingReference: form.drawingReference.trim() || undefined,
      evidenceRequired: form.evidenceRequired,
      photoRequired: form.photoRequired,
      customerScope:
        form.customerScope === GENERIC_CUSTOMER
          ? undefined
          : form.customerScope,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };

    setSaving(true);
    try {
      if (editing) {
        await onUpdate(editing.id, input);
        toast.success("Characteristic updated");
      } else {
        await onCreate(input);
        toast.success("Characteristic created");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[85vh] overflow-y-auto"
        data-ocid="qms.characteristic_form.dialog"
      >
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit Characteristic" : "New Quality Characteristic"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs">Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="h-8 text-sm"
              data-ocid="qms.characteristic_form.name"
            />
          </div>

          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              className="text-sm h-16"
              data-ocid="qms.characteristic_form.description"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Process *</Label>
            <Select
              value={form.processId}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, processId: v, operationId: "" }))
              }
            >
              <SelectTrigger
                className="h-8 text-sm"
                data-ocid="qms.characteristic_form.process"
              >
                <SelectValue placeholder="Select process" />
              </SelectTrigger>
              <SelectContent>
                {processes.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Operation *</Label>
            <Select
              value={form.operationId}
              onValueChange={(v) => setForm((f) => ({ ...f, operationId: v }))}
              disabled={!form.processId}
            >
              <SelectTrigger
                className="h-8 text-sm"
                data-ocid="qms.characteristic_form.operation"
              >
                <SelectValue placeholder="Select operation" />
              </SelectTrigger>
              <SelectContent>
                {visibleOperations.map((o) => (
                  <SelectItem key={o.id} value={o.id} className="text-xs">
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Category</Label>
            <Input
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({ ...f, category: e.target.value }))
              }
              placeholder="e.g. Dimensional"
              list="qms-category-suggestions"
              className="h-8 text-sm"
              data-ocid="qms.characteristic_form.category"
            />
            <datalist id="qms-category-suggestions">
              {CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Criticality *</Label>
            <Select
              value={form.criticality}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, criticality: v as QmsCriticality }))
              }
            >
              <SelectTrigger
                className="h-8 text-sm"
                data-ocid="qms.characteristic_form.criticality"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QMS_CRITICALITY_LEVELS.map((c) => (
                  <SelectItem key={c} value={c} className="text-xs">
                    {CRITICALITY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Inspection Method *</Label>
            <Select
              value={form.inspectionMethodId}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, inspectionMethodId: v }))
              }
            >
              <SelectTrigger
                className="h-8 text-sm"
                data-ocid="qms.characteristic_form.method"
              >
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                {inspectionMethods.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">
                    {INSPECTION_METHOD_TYPE_LABELS[m.type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs">Acceptance Criteria</Label>
            <Textarea
              value={form.acceptanceCriteria}
              onChange={(e) =>
                setForm((f) => ({ ...f, acceptanceCriteria: e.target.value }))
              }
              className="text-sm h-14"
              data-ocid="qms.characteristic_form.acceptance_criteria"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Tolerance Nominal</Label>
            <Input
              type="number"
              value={form.toleranceNominal}
              onChange={(e) =>
                setForm((f) => ({ ...f, toleranceNominal: e.target.value }))
              }
              className="h-8 text-sm"
              data-ocid="qms.characteristic_form.tolerance_nominal"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Unit</Label>
            <Input
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              placeholder="mm, deg, µm..."
              className="h-8 text-sm"
              data-ocid="qms.characteristic_form.unit"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tolerance +</Label>
            <Input
              type="number"
              value={form.tolerancePlus}
              onChange={(e) =>
                setForm((f) => ({ ...f, tolerancePlus: e.target.value }))
              }
              className="h-8 text-sm"
              data-ocid="qms.characteristic_form.tolerance_plus"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tolerance -</Label>
            <Input
              type="number"
              value={form.toleranceMinus}
              onChange={(e) =>
                setForm((f) => ({ ...f, toleranceMinus: e.target.value }))
              }
              className="h-8 text-sm"
              data-ocid="qms.characteristic_form.tolerance_minus"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Measuring Instrument</Label>
            <Input
              value={form.measuringInstrument}
              onChange={(e) =>
                setForm((f) => ({ ...f, measuringInstrument: e.target.value }))
              }
              className="h-8 text-sm"
              data-ocid="qms.characteristic_form.instrument"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Standard Reference</Label>
            <Input
              value={form.standardReference}
              onChange={(e) =>
                setForm((f) => ({ ...f, standardReference: e.target.value }))
              }
              placeholder="e.g. AWS D1.1"
              className="h-8 text-sm"
              data-ocid="qms.characteristic_form.standard"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Drawing Reference</Label>
            <Input
              value={form.drawingReference}
              onChange={(e) =>
                setForm((f) => ({ ...f, drawingReference: e.target.value }))
              }
              className="h-8 text-sm"
              data-ocid="qms.characteristic_form.drawing_ref"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Customer Scope</Label>
            <Select
              value={form.customerScope}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, customerScope: v }))
              }
            >
              <SelectTrigger
                className="h-8 text-sm"
                data-ocid="qms.characteristic_form.customer_scope"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={GENERIC_CUSTOMER} className="text-xs">
                  Generic (all customers)
                </SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs">Tags (comma separated)</Label>
            <Input
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="welding, structural, safety"
              className="h-8 text-sm"
              data-ocid="qms.characteristic_form.tags"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              checked={form.evidenceRequired}
              onCheckedChange={(v) =>
                setForm((f) => ({ ...f, evidenceRequired: !!v }))
              }
              data-ocid="qms.characteristic_form.evidence_required"
            />
            <Label className="text-xs font-normal">Evidence required</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={form.photoRequired}
              onCheckedChange={(v) =>
                setForm((f) => ({ ...f, photoRequired: !!v }))
              }
              data-ocid="qms.characteristic_form.photo_required"
            />
            <Label className="text-xs font-normal">Photo required</Label>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-ocid="qms.characteristic_form.cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving}
            data-ocid="qms.characteristic_form.save"
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
