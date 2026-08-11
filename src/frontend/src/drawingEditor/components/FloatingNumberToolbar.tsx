import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { Bold, X } from "lucide-react";

const COLORS = ["#ff0000", "#0066ff", "#00aa00", "#ff9900", "#000000"];

interface Props {
  position: { left: number; top: number } | null;
  fontSize: number;
  color: string;
  bold: boolean;
  onFontSizeChange: (n: number) => void;
  onColorChange: (c: string) => void;
  onToggleBold: () => void;
  onClose: () => void;
}

/** §6 (NUMBER EDIT mode): appears when a detected dimension number is
 * selected while geometry is locked, letting a shop-floor worker fix a
 * single wrong number without risking anything else. */
export function FloatingNumberToolbar({
  position,
  fontSize,
  color,
  bold,
  onFontSizeChange,
  onColorChange,
  onToggleBold,
  onClose,
}: Props) {
  if (!position) return null;

  return (
    <div
      className="fixed z-50 bg-background/95 backdrop-blur border border-primary rounded-md shadow-lg px-3 py-2"
      style={{ left: position.left, top: position.top }}
      data-ocid="drawing_editor.float_toolbar"
    >
      <div className="flex items-center gap-2.5">
        <span className="text-[10px] text-muted-foreground tracking-wide">
          SIZE
        </span>
        <Slider
          value={[fontSize]}
          min={8}
          max={80}
          className="w-28"
          onValueChange={(v) => onFontSizeChange(v[0])}
          data-ocid="drawing_editor.float.size"
        />
        <span className="text-[11px] font-semibold text-primary min-w-[24px]">
          {fontSize}
        </span>
        <div className="w-px h-6 bg-border mx-1" />
        <div className="flex gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={cn(
                "w-[22px] h-[22px] rounded-sm border-2",
                color.toLowerCase() === c
                  ? "border-white ring-1 ring-primary"
                  : "border-transparent",
              )}
              style={{ backgroundColor: c }}
              onClick={() => onColorChange(c)}
              data-ocid={`drawing_editor.float.color.${c}`}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
        <div className="w-px h-6 bg-border mx-1" />
        <Button
          type="button"
          size="sm"
          variant={bold ? "default" : "outline"}
          className="h-7 w-7 p-0"
          onClick={onToggleBold}
          data-ocid="drawing_editor.float.bold"
        >
          <Bold className="w-3.5 h-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={onClose}
          data-ocid="drawing_editor.float.close"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
