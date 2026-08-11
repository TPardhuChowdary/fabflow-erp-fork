import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TitleBlockFields } from "../types";

const OPERATIONS = [
  "BENDING",
  "CUTTING",
  "LASER CUTTING",
  "WELDING",
  "DRILLING",
  "POWDER COATING",
  "ASSEMBLY",
  "QC INSPECTION",
];

interface Props {
  value: TitleBlockFields;
  onChange: (value: TitleBlockFields) => void;
}

export function TitleBlockForm({ value, onChange }: Props) {
  const set = <K extends keyof TitleBlockFields>(
    key: K,
    v: TitleBlockFields[K],
  ) => onChange({ ...value, [key]: v });

  const field = (
    key: keyof TitleBlockFields,
    label: string,
    placeholder?: string,
  ) => (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <Input
        value={value[key]}
        placeholder={placeholder}
        onChange={(e) => set(key, e.target.value)}
        className="h-8 text-xs"
        data-ocid={`drawing_editor.tb.${key}`}
      />
    </div>
  );

  return (
    <div className="space-y-2" data-ocid="drawing_editor.title_block_form">
      {field("partNo", "Part Number", "MEBOXAL00405")}
      {field("partName", "Part Name", "FNMUX INPUT CONNECTOR HOUSING")}
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Operation
        </Label>
        <Select
          value={value.operation}
          onValueChange={(v) => set("operation", v)}
        >
          <SelectTrigger
            className="h-8 text-xs"
            data-ocid="drawing_editor.tb.operation"
          >
            <SelectValue placeholder="— select —" />
          </SelectTrigger>
          <SelectContent>
            {OPERATIONS.map((op) => (
              <SelectItem key={op} value={op} className="text-xs">
                {op}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {field("quantity", "Quantity", "1")}
      {field("material", "Material", "ALUMINIUM 21 SWG")}
      {field("gauge", "Gauge / Thickness", "21 SWG")}
      {field("finish", "Finish", "POWDER COATING")}
      {field("tolerance", "Tolerance", "± 0.5 (ISO 2768)")}
      {field("revision", "Revision", "R0")}
      {field("jobCard", "Job Card #", "JC-2026-001")}
      {field("operator", "Operator / Worker")}
      {field("machine", "Machine", "PRESS BRAKE 1")}
      {field("date", "Drawing Date", "DD/MM/YYYY")}
    </div>
  );
}
