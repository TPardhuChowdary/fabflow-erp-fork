import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { INSPECTION_SHEET_STATUS_LABELS } from "../../constants";
import { INSPECTION_SHEET_STATUS_ORDER } from "../../types";
import type { InspectionSheetStatus } from "../../types";

/** Visual workflow display per §5 — every step in INSPECTION_SHEET_STATUS_ORDER,
 * with completed steps checked and the current one highlighted. Purely
 * presentational; it reads the same order/labels the rest of the module
 * already uses so it can never drift out of sync with the real state machine. */
export function InspectionStatusStepper({
  status,
}: { status: InspectionSheetStatus }) {
  const currentIndex = INSPECTION_SHEET_STATUS_ORDER.indexOf(status);
  // "Signed" is legacy-only and intentionally excluded from STATUS_ORDER
  // (see types.ts); if a sheet is somehow still sitting on it, treat it as
  // equivalent to "Completed" for stepper display purposes only.
  const effectiveIndex =
    currentIndex >= 0
      ? currentIndex
      : INSPECTION_SHEET_STATUS_ORDER.indexOf("Completed");

  return (
    <div
      className="flex flex-wrap items-center gap-1"
      data-ocid="qms.inspection.status_stepper"
    >
      {INSPECTION_SHEET_STATUS_ORDER.map((s, i) => {
        const done = i < effectiveIndex;
        const current = i === effectiveIndex;
        return (
          <div key={s} className="flex items-center gap-1">
            <div
              className={cn(
                "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] border",
                done && "bg-green-100 text-green-700 border-green-200",
                current &&
                  "bg-primary text-primary-foreground border-primary font-semibold",
                !done && !current && "bg-gray-50 text-gray-400 border-gray-200",
              )}
              data-ocid={`qms.inspection.status_step.${s}`}
            >
              {done && <Check className="w-2.5 h-2.5" />}
              {INSPECTION_SHEET_STATUS_LABELS[s]}
            </div>
            {i < INSPECTION_SHEET_STATUS_ORDER.length - 1 && (
              <div
                className={cn(
                  "w-2 h-px",
                  done ? "bg-green-300" : "bg-gray-200",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
