import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface Props {
  onAutoStrip: () => void;
  onNukeStrip: () => void;
  onRestoreAll: () => void;
  onCalibrate: () => void;
  calibrating: boolean;
  calibrationStatus?: string;
}

export function PixelModePanel({
  onAutoStrip,
  onNukeStrip,
  onRestoreAll,
  onCalibrate,
  calibrating,
  calibrationStatus,
}: Props) {
  return (
    <div className="space-y-2" data-ocid="drawing_editor.pixel_panel">
      <Button
        type="button"
        size="sm"
        className="w-full h-8 text-[10px] bg-amber-500 hover:bg-amber-600 text-black"
        onClick={onAutoStrip}
        data-ocid="drawing_editor.pixel.auto_strip"
      >
        ⚡ AUTO-STRIP DIMENSIONS
      </Button>
      <Button
        type="button"
        size="sm"
        className="w-full h-8 text-[10px] bg-[#ff3366] hover:bg-[#e02d5a] text-white"
        onClick={onNukeStrip}
        data-ocid="drawing_editor.pixel.nuke_strip"
      >
        ☠️ NUKE STRIP (keep only thick outline)
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full h-7 text-[10px]"
        onClick={onRestoreAll}
        data-ocid="drawing_editor.pixel.restore_all"
      >
        RESTORE ALL STRIPPED
      </Button>
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        AUTO-STRIP = smart removal of dimension text + blue/red lines. NUKE =
        aggressive, keeps only the part outline. Use NUKE first, then trace what
        you need on top.
      </p>

      <div className="rounded-md border p-2.5 space-y-1.5">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          📐 Calibrate (for snap dim lines)
        </Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full h-7 text-[10px]"
          onClick={onCalibrate}
          data-ocid="drawing_editor.pixel.calibrate"
        >
          {calibrating ? "CANCEL CALIBRATION" : "SET 1mm SCALE →"}
        </Button>
        {calibrationStatus && (
          <div className="text-[10px] text-green-600">{calibrationStatus}</div>
        )}
      </div>
    </div>
  );
}
