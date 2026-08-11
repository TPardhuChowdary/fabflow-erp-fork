import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  INSPECTION_SHEET_STATUS_BADGE_CLASS,
  INSPECTION_SHEET_STATUS_LABELS,
} from "../../constants";
import type { InspectionSheetStatus } from "../../types";

export function InspectionStatusBadge({
  status,
  className,
}: {
  status: InspectionSheetStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] px-1.5 py-0.5",
        INSPECTION_SHEET_STATUS_BADGE_CLASS[status],
        className,
      )}
    >
      {INSPECTION_SHEET_STATUS_LABELS[status]}
    </Badge>
  );
}
