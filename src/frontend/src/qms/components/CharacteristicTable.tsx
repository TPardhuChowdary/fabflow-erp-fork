import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Pencil, Star } from "lucide-react";
import {
  CRITICALITY_BADGE_CLASS,
  CRITICALITY_LABELS,
  INSPECTION_METHOD_TYPE_LABELS,
} from "../constants";
import type {
  InspectionMethod,
  ManufacturingProcess,
  Operation,
  QualityCharacteristic,
} from "../types";

interface Props {
  characteristics: QualityCharacteristic[];
  processes: ManufacturingProcess[];
  operations: Operation[];
  inspectionMethods: InspectionMethod[];
  selectedIds: Set<string>;
  favoriteIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onEdit: (characteristic: QualityCharacteristic) => void;
  canEdit: boolean;
}

export function CharacteristicTable({
  characteristics,
  processes,
  operations,
  inspectionMethods,
  selectedIds,
  favoriteIds,
  onToggleSelect,
  onToggleFavorite,
  onEdit,
  canEdit,
}: Props) {
  const processName = (id: string) =>
    processes.find((p) => p.id === id)?.name ?? "—";
  const operationName = (id: string) =>
    operations.find((o) => o.id === id)?.name ?? "—";
  const methodLabel = (id: string) => {
    const m = inspectionMethods.find((x) => x.id === id);
    return m ? INSPECTION_METHOD_TYPE_LABELS[m.type] : "—";
  };

  return (
    <div className="rounded-md border" data-ocid="qms.characteristics.table">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="w-8" />
            <TableHead className="w-8" />
            <TableHead className="text-xs font-semibold">Name</TableHead>
            <TableHead className="text-xs font-semibold">Process</TableHead>
            <TableHead className="text-xs font-semibold">Operation</TableHead>
            <TableHead className="text-xs font-semibold">Category</TableHead>
            <TableHead className="text-xs font-semibold">Criticality</TableHead>
            <TableHead className="text-xs font-semibold">Method</TableHead>
            <TableHead className="text-xs font-semibold">Status</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {characteristics.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={10}
                className="text-center text-muted-foreground py-8"
                data-ocid="qms.characteristics.empty_state"
              >
                No characteristics match the current filters
              </TableCell>
            </TableRow>
          )}
          {characteristics.map((c, i) => (
            <TableRow key={c.id} data-ocid={`qms.characteristics.row.${i + 1}`}>
              <TableCell>
                <Checkbox
                  checked={selectedIds.has(c.id)}
                  onCheckedChange={() => onToggleSelect(c.id)}
                  data-ocid={`qms.characteristics.select.${i + 1}`}
                />
              </TableCell>
              <TableCell>
                <button
                  type="button"
                  onClick={() => onToggleFavorite(c.id)}
                  className="text-muted-foreground hover:text-amber-500 transition-colors"
                  data-ocid={`qms.characteristics.favorite.${i + 1}`}
                >
                  <Star
                    className={cn(
                      "w-3.5 h-3.5",
                      favoriteIds.has(c.id) && "fill-amber-400 text-amber-500",
                    )}
                  />
                </button>
              </TableCell>
              <TableCell className="max-w-[240px]">
                <div className="text-sm font-medium truncate">{c.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {c.description}
                </div>
              </TableCell>
              <TableCell className="text-xs">
                {processName(c.processId)}
              </TableCell>
              <TableCell className="text-xs">
                {operationName(c.operationId)}
              </TableCell>
              <TableCell className="text-xs">{c.category}</TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] px-1.5 py-0.5",
                    CRITICALITY_BADGE_CLASS[c.criticality],
                  )}
                >
                  {CRITICALITY_LABELS[c.criticality]}
                </Badge>
              </TableCell>
              <TableCell className="text-xs">
                {methodLabel(c.inspectionMethodId)}
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] px-1.5 py-0.5",
                    c.status === "Active"
                      ? "bg-green-100 text-green-700 border-green-200"
                      : "bg-gray-100 text-gray-600 border-gray-200",
                  )}
                >
                  {c.status}
                </Badge>
              </TableCell>
              <TableCell>
                {canEdit && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() => onEdit(c)}
                    data-ocid={`qms.characteristics.edit.${i + 1}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
