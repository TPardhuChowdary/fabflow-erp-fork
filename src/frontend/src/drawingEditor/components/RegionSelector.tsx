import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { DetectedView } from "../types";

export type SelectionMode = "crop" | "auto";

interface Props {
  mode: SelectionMode;
  onModeChange: (mode: SelectionMode) => void;
  detectedViews: DetectedView[];
  onDetectedViewSelect: (view: DetectedView) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onResetCrop: () => void;
  onConfirm: () => void;
  canConfirm: boolean;
}

/** Right-panel controls for §2/§4 of the workflow: Crop Region vs. Auto-Pick,
 * page zoom, and Confirm Selection. The actual drag-to-crop interaction
 * happens on the overlay canvas rendered by DrawingEditorPage. */
export function RegionSelector({
  mode,
  onModeChange,
  detectedViews,
  onDetectedViewSelect,
  zoom,
  onZoomChange,
  onResetCrop,
  onConfirm,
  canConfirm,
}: Props) {
  return (
    <div className="space-y-3" data-ocid="drawing_editor.region_selector">
      <div className="flex bg-muted rounded-md border p-0.5">
        <button
          type="button"
          onClick={() => onModeChange("crop")}
          className={cn(
            "flex-1 py-1.5 text-[10px] font-bold tracking-wide rounded",
            mode === "crop"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground",
          )}
          data-ocid="drawing_editor.selection_mode.crop"
        >
          CROP REGION
        </button>
        <button
          type="button"
          onClick={() => onModeChange("auto")}
          className={cn(
            "flex-1 py-1.5 text-[10px] font-bold tracking-wide rounded",
            mode === "auto"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground",
          )}
          data-ocid="drawing_editor.selection_mode.auto"
        >
          AUTO-PICK
        </button>
      </div>

      {mode === "crop" ? (
        <>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Drag a rectangle on the drawing around the view your worker needs
            (top view, left view, isometric, etc.). The selection becomes the
            focused output page.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full h-8 text-[10px]"
            onClick={onResetCrop}
            data-ocid="drawing_editor.reset_crop"
          >
            RESET SELECTION
          </Button>
        </>
      ) : (
        <>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Detected views on this page. Click one to use it.
          </p>
          <div className="space-y-1.5">
            {detectedViews.length === 0 && (
              <p className="text-[10px] text-muted-foreground py-2">
                No views auto-detected on this page. Use CROP REGION mode.
              </p>
            )}
            {detectedViews.map((v) => (
              <button
                key={v.label}
                type="button"
                onClick={() => onDetectedViewSelect(v)}
                className="w-full flex items-center justify-between rounded-md border px-2.5 py-2 text-[10px] font-semibold hover:border-primary hover:bg-muted/50"
                data-ocid={`drawing_editor.detected_view.${v.label}`}
              >
                <span>▢ {v.label}</span>
                <span className="text-muted-foreground">
                  {Math.round(v.w)}×{Math.round(v.h)}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="space-y-1.5 pt-2 border-t">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Page Zoom ({zoom}%)
        </Label>
        <Slider
          value={[zoom]}
          min={50}
          max={200}
          onValueChange={(v) => onZoomChange(v[0])}
          data-ocid="drawing_editor.page_zoom"
        />
      </div>

      <Button
        type="button"
        size="sm"
        className="w-full h-9 text-xs"
        disabled={!canConfirm}
        onClick={onConfirm}
        data-ocid="drawing_editor.confirm_selection"
      >
        Confirm Selection →
      </Button>
    </div>
  );
}
