import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  ImagePlus,
  PenLine,
  Upload,
  UserCog,
  XCircle,
} from "lucide-react";
import { useRef } from "react";
import { useStore } from "../../../store";
import { CRITICALITY_BADGE_CLASS, CRITICALITY_LABELS } from "../../constants";
import type {
  InspectionDocument,
  InspectionMode,
  InspectionStageCompletion,
  InspectionStageDefinition,
  InspectionStageEntry,
  QualityCharacteristic,
} from "../../types";
import { StagePhotoGallery } from "./StagePhotoGallery";

const UNASSIGNED = "__unassigned__";

interface Props {
  stage: InspectionStageDefinition;
  characteristics: QualityCharacteristic[];
  entries: InspectionStageEntry[];
  completion: InspectionStageCompletion | undefined;
  documents: InspectionDocument[];
  sheetMode: InspectionMode;
  canEdit: boolean;
  canAssign: boolean;
  currentUserId: string;
  onEntryChange: (
    characteristicId: string,
    updates: {
      result?: "Pass" | "Fail" | "NA";
      measuredValue?: string;
      remarks?: string;
    },
  ) => void;
  onStageModeChange: (mode: "Paper" | "Digital") => void;
  onOpenSignature: () => void;
  onUpload: (file: File) => void;
  onAssign: (assigneeId: string, assigneeName: string) => void;
  onQtyChange: (
    acceptedQty: number | undefined,
    rejectedQty: number | undefined,
  ) => void;
}

export function StageChecklistSection({
  stage,
  characteristics,
  entries,
  completion,
  documents,
  sheetMode,
  canEdit,
  canAssign,
  currentUserId,
  onEntryChange,
  onStageModeChange,
  onOpenSignature,
  onUpload,
  onAssign,
  onQtyChange,
}: Props) {
  const { employees } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const stageMode = completion?.mode ?? "Digital";
  const entryFor = (characteristicId: string) =>
    entries.find((e) => e.characteristicId === characteristicId);

  // §17: when a stage has an assignee, only that person (or someone with
  // broader canEdit not gated by assignment, e.g. an admin acting via
  // canAssign) may act on it. Unassigned stages fall back to the existing
  // role-based `canEdit` behavior — assignment is optional, not mandatory.
  const isAssignedToSomeoneElse =
    !!completion?.assignedTo && completion.assignedTo !== currentUserId;
  const canActOnStage = canEdit && (!isAssignedToSomeoneElse || canAssign);

  const photos = documents.filter((d) => d.fileType.startsWith("image/"));
  const otherDocs = documents.filter((d) => !d.fileType.startsWith("image/"));

  return (
    <Card data-ocid={`qms.inspection.stage_section.${stage.id}`}>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-semibold">{stage.name}</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {canAssign ? (
            <Select
              value={completion?.assignedTo ?? UNASSIGNED}
              onValueChange={(v) => {
                if (v === UNASSIGNED) return;
                const emp = employees.find((e) => e.id === v);
                if (emp) onAssign(emp.id, emp.name);
              }}
            >
              <SelectTrigger
                className="h-7 text-xs w-36"
                data-ocid={`qms.inspection.assign_select.${stage.id}`}
              >
                <UserCog className="w-3 h-3 mr-1 shrink-0" />
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED} className="text-xs" disabled>
                  Unassigned
                </SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id} className="text-xs">
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            completion?.assignedToName && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <UserCog className="w-3 h-3" />
                {completion.assignedToName}
              </Badge>
            )
          )}
          {sheetMode === "Hybrid" && canEdit && (
            <Select
              value={stageMode}
              onValueChange={(v) => onStageModeChange(v as "Paper" | "Digital")}
            >
              <SelectTrigger
                className="h-7 text-xs w-32"
                data-ocid={`qms.inspection.stage_mode.${stage.id}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Digital" className="text-xs">
                  Digital
                </SelectItem>
                <SelectItem value="Paper" className="text-xs">
                  Paper
                </SelectItem>
              </SelectContent>
            </Select>
          )}
          {sheetMode !== "Hybrid" && (
            <Badge variant="outline" className="text-[10px]">
              {sheetMode}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isAssignedToSomeoneElse && (
          <p className="text-xs text-warning bg-warning/15 border border-warning/30 rounded-md px-2.5 py-1.5">
            This stage is assigned to {completion?.assignedToName} — only they
            (or an administrator) can complete it.
          </p>
        )}

        <div className="flex items-center gap-3 rounded-md border p-2.5">
          <span className="text-xs text-muted-foreground shrink-0">
            Pieces at this stage
          </span>
          <div className="flex items-center gap-1.5">
            <label
              htmlFor={`qty-accepted-${stage.id}`}
              className="text-xs text-muted-foreground"
            >
              Accepted
            </label>
            <Input
              id={`qty-accepted-${stage.id}`}
              type="number"
              min={0}
              value={completion?.acceptedQty ?? ""}
              disabled={!canActOnStage}
              onChange={(e) =>
                onQtyChange(
                  e.target.value === "" ? undefined : Number(e.target.value),
                  completion?.rejectedQty,
                )
              }
              className="h-6 text-xs w-20"
              data-ocid={`qms.inspection.accepted_qty.${stage.id}`}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label
              htmlFor={`qty-rejected-${stage.id}`}
              className="text-xs text-muted-foreground"
            >
              Rejected
            </label>
            <Input
              id={`qty-rejected-${stage.id}`}
              type="number"
              min={0}
              value={completion?.rejectedQty ?? ""}
              disabled={!canActOnStage}
              onChange={(e) =>
                onQtyChange(
                  completion?.acceptedQty,
                  e.target.value === "" ? undefined : Number(e.target.value),
                )
              }
              className="h-6 text-xs w-20"
              data-ocid={`qms.inspection.rejected_qty.${stage.id}`}
            />
          </div>
        </div>

        {characteristics.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">
            No active characteristics are tagged to this stage's process yet in
            the Characteristic Library.
          </p>
        )}

        {characteristics.map((c) => {
          const entry = entryFor(c.id);
          const needsValue = c.toleranceNominal !== undefined || !!c.unit;
          return (
            <div
              key={c.id}
              className="rounded-md border p-2.5 space-y-2"
              data-ocid={`qms.inspection.checklist_item.${c.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.acceptanceCriteria || c.description}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] shrink-0",
                    CRITICALITY_BADGE_CLASS[c.criticality],
                  )}
                >
                  {CRITICALITY_LABELS[c.criticality]}
                </Badge>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(["Pass", "Fail", "NA"] as const).map((r) => (
                  <Button
                    key={r}
                    type="button"
                    size="sm"
                    variant={entry?.result === r ? "default" : "outline"}
                    disabled={!canActOnStage}
                    className={cn(
                      "h-6 text-[10px] px-2",
                      entry?.result === r &&
                        r === "Pass" &&
                        "bg-success hover:bg-success",
                      entry?.result === r &&
                        r === "Fail" &&
                        "bg-destructive hover:bg-destructive",
                    )}
                    onClick={() => onEntryChange(c.id, { result: r })}
                    data-ocid={`qms.inspection.result.${c.id}.${r}`}
                  >
                    {r === "Pass" && <CheckCircle2 className="w-3 h-3 mr-1" />}
                    {r === "Fail" && <XCircle className="w-3 h-3 mr-1" />}
                    {r}
                  </Button>
                ))}
                {needsValue && (
                  <Input
                    placeholder={`Measured value${c.unit ? ` (${c.unit})` : ""}`}
                    value={entry?.measuredValue ?? ""}
                    disabled={!canActOnStage}
                    onChange={(e) =>
                      onEntryChange(c.id, { measuredValue: e.target.value })
                    }
                    className="h-6 text-xs w-40"
                    data-ocid={`qms.inspection.measured_value.${c.id}`}
                  />
                )}
              </div>

              <Textarea
                placeholder="Remarks..."
                value={entry?.remarks ?? ""}
                disabled={!canActOnStage}
                onChange={(e) =>
                  onEntryChange(c.id, { remarks: e.target.value })
                }
                className="h-12 text-xs"
                data-ocid={`qms.inspection.remarks.${c.id}`}
              />
            </div>
          );
        })}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t text-xs">
          <div className="text-muted-foreground">
            {completion?.inspectorName ? (
              <span>
                Inspector:{" "}
                <span className="font-medium text-foreground">
                  {completion.inspectorName}
                </span>
                {completion.signedAt &&
                  ` · Signed ${new Date(completion.signedAt).toLocaleString()}`}
                {completion.completedAt &&
                  !completion.signedAt &&
                  ` · Document received ${new Date(completion.completedAt).toLocaleString()}`}
              </span>
            ) : (
              "Not yet completed"
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {canActOnStage && (
              <>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    for (const file of Array.from(e.target.files ?? []))
                      onUpload(file);
                    e.target.value = "";
                  }}
                  data-ocid={`qms.inspection.stage_photo_input.${stage.id}`}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => photoInputRef.current?.click()}
                  data-ocid={`qms.inspection.stage_photo_button.${stage.id}`}
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  Add Photo
                </Button>
              </>
            )}

            {canActOnStage && stageMode === "Digital" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                onClick={onOpenSignature}
                data-ocid={`qms.inspection.sign_button.${stage.id}`}
              >
                <PenLine className="w-3.5 h-3.5" />
                Sign Stage
              </Button>
            )}

            {canActOnStage && stageMode === "Paper" && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUpload(file);
                    e.target.value = "";
                  }}
                  data-ocid={`qms.inspection.stage_upload_input.${stage.id}`}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => fileInputRef.current?.click()}
                  data-ocid={`qms.inspection.stage_upload_button.${stage.id}`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload Signed Page
                </Button>
              </>
            )}
          </div>
        </div>

        {photos.length > 0 && <StagePhotoGallery photos={photos} />}

        {otherDocs.length > 0 && (
          <div className="text-xs text-muted-foreground">
            {otherDocs.length} document(s) attached to this stage.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
