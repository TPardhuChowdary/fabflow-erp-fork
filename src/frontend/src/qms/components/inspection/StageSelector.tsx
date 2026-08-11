import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClipboardCheck } from "lucide-react";
import { useState } from "react";
import { INSPECTION_MODE_LABELS } from "../../constants";
import type {
  InspectionMode,
  InspectionStageDefinition,
  QmsTemplate,
  QualityCharacteristic,
} from "../../types";

const NO_TEMPLATE = "__none__";

interface Props {
  stages: InspectionStageDefinition[];
  templates: QmsTemplate[];
  characteristics: QualityCharacteristic[];
  onGenerate: (input: {
    stageIds: string[];
    mode: InspectionMode;
    drawingReference?: string;
    drawingRevision?: string;
  }) => void;
  generating: boolean;
}

export function StageSelector({
  stages,
  templates,
  characteristics,
  onGenerate,
  generating,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<InspectionMode>("Hybrid");
  const [templateId, setTemplateId] = useState(NO_TEMPLATE);
  const [drawingReference, setDrawingReference] = useState("");
  const [drawingRevision, setDrawingRevision] = useState("");

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    if (id === NO_TEMPLATE) return;
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    const processIds = new Set(
      template.characteristicIds
        .map((cid) => characteristics.find((c) => c.id === cid)?.processId)
        .filter((x): x is string => !!x),
    );
    const impliedStageIds = stages
      .filter((s) => s.processId && processIds.has(s.processId))
      .map((s) => s.id);
    setSelected(new Set(impliedStageIds));
  };

  return (
    <div className="space-y-4" data-ocid="qms.inspection.stage_selector">
      <div>
        <h3 className="text-sm font-semibold">Generate Inspection Sheet</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Select the inspection stages required for this project. Every stage
          automatically loads its checklist from the Quality Characteristic
          Library — nothing is typed twice.
        </p>
      </div>

      {templates.length > 0 && (
        <div className="space-y-1.5 max-w-xs">
          <Label className="text-xs">Start from a template (optional)</Label>
          <Select value={templateId} onValueChange={applyTemplate}>
            <SelectTrigger
              className="h-8 text-xs"
              data-ocid="qms.inspection.template_select"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_TEMPLATE} className="text-xs">
                No template
              </SelectItem>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id} className="text-xs">
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {stages.map((stage) => (
          <div
            key={stage.id}
            // biome-ignore lint/a11y/useSemanticElements: can't be a <button> — it wraps a Checkbox (itself a <button role="checkbox">), and <button> can't legally contain another <button>
            role="button"
            tabIndex={0}
            className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-sm cursor-pointer hover:bg-muted/40 text-left"
            onClick={() => toggle(stage.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggle(stage.id);
              }
            }}
            aria-pressed={selected.has(stage.id)}
            data-ocid={`qms.inspection.stage_checkbox.${stage.id}`}
          >
            <Checkbox
              checked={selected.has(stage.id)}
              className="pointer-events-none"
            />
            {stage.name}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
        <div className="space-y-1.5">
          <Label className="text-xs">Inspection Mode</Label>
          <Select
            value={mode}
            onValueChange={(v) => setMode(v as InspectionMode)}
          >
            <SelectTrigger
              className="h-8 text-xs"
              data-ocid="qms.inspection.mode_select"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["Hybrid", "Digital", "Paper"] as InspectionMode[]).map((m) => (
                <SelectItem key={m} value={m} className="text-xs">
                  {INSPECTION_MODE_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Drawing Reference</Label>
          <Input
            value={drawingReference}
            onChange={(e) => setDrawingReference(e.target.value)}
            className="h-8 text-xs"
            data-ocid="qms.inspection.drawing_reference"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Drawing Revision</Label>
          <Input
            value={drawingRevision}
            onChange={(e) => setDrawingRevision(e.target.value)}
            className="h-8 text-xs"
            data-ocid="qms.inspection.drawing_revision"
          />
        </div>
      </div>

      <Button
        type="button"
        size="sm"
        className="h-8 text-xs gap-1.5"
        disabled={selected.size === 0 || generating}
        onClick={() =>
          onGenerate({
            stageIds: stages
              .filter((s) => selected.has(s.id))
              .sort((a, b) => a.sequence - b.sequence)
              .map((s) => s.id),
            mode,
            drawingReference: drawingReference.trim() || undefined,
            drawingRevision: drawingRevision.trim() || undefined,
          })
        }
        data-ocid="qms.inspection.generate_button"
      >
        <ClipboardCheck className="w-3.5 h-3.5" />
        {generating ? "Generating..." : "Generate Inspection Sheet"}
      </Button>
    </div>
  );
}
