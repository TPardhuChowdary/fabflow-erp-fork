import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  Circle,
  Highlighter,
  Minus,
  MousePointer2,
  MoveUpRight,
  Redo2,
  Sparkles,
  Square,
  Trash2,
  Type,
} from "lucide-react";
import {
  ANNOTATION_COLORS,
  type AnnotationTool,
  type EditorMode,
  ORIGINAL_MODE_ALLOWED_TOOLS,
} from "../types";

const TOOLS: Array<{
  tool: AnnotationTool;
  label: string;
  icon: typeof MousePointer2;
}> = [
  { tool: "select", label: "Select", icon: MousePointer2 },
  { tool: "magic", label: "Magic Erase", icon: Sparkles },
  { tool: "lasso", label: "Lasso Erase", icon: Circle },
  { tool: "brush", label: "Brush Erase", icon: Circle },
  { tool: "whiteout", label: "Hide Box", icon: Square },
  { tool: "text", label: "Text", icon: Type },
  { tool: "highlight", label: "Highlight", icon: Highlighter },
  { tool: "arrow", label: "Arrow", icon: MoveUpRight },
  { tool: "dimline", label: "Dim Line", icon: Minus },
  { tool: "circle", label: "Circle", icon: Circle },
  { tool: "rect", label: "Box", icon: Square },
];

interface Props {
  editorMode: EditorMode;
  tool: AnnotationTool;
  onToolChange: (tool: AnnotationTool) => void;
  color: string;
  onColorChange: (color: string) => void;
  strokeWidth: number;
  onStrokeWidthChange: (n: number) => void;
  brushSize: number;
  onBrushSizeChange: (n: number) => void;
  textValue: string;
  onTextValueChange: (v: string) => void;
  onUndo: () => void;
  onClear: () => void;
}

export function AnnotationToolPanel({
  editorMode,
  tool,
  onToolChange,
  color,
  onColorChange,
  strokeWidth,
  onStrokeWidthChange,
  brushSize,
  onBrushSizeChange,
  textValue,
  onTextValueChange,
  onUndo,
  onClear,
}: Props) {
  const visibleTools =
    editorMode === "original"
      ? TOOLS.filter((t) => ORIGINAL_MODE_ALLOWED_TOOLS.includes(t.tool))
      : TOOLS;

  return (
    <div className="space-y-3" data-ocid="drawing_editor.annotation_tools">
      <div className="grid grid-cols-2 gap-1.5">
        {visibleTools.map(({ tool: t, label, icon: Icon }) => (
          <Button
            key={t}
            type="button"
            size="sm"
            variant={tool === t ? "default" : "outline"}
            className="h-8 text-[10px] justify-start gap-1.5 px-2"
            onClick={() => onToolChange(t)}
            data-ocid={`drawing_editor.tool.${t}`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            {label.toUpperCase()}
          </Button>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Color
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {ANNOTATION_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onColorChange(c)}
              className={cn(
                "w-6 h-6 rounded border-2",
                color === c ? "border-primary" : "border-transparent",
              )}
              style={{
                backgroundColor: c,
                borderColor: color === c ? undefined : "var(--border)",
              }}
              data-ocid={`drawing_editor.color.${c}`}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Stroke / Text Size ({strokeWidth})
        </Label>
        <Slider
          value={[strokeWidth]}
          min={1}
          max={40}
          onValueChange={(v) => onStrokeWidthChange(v[0])}
          data-ocid="drawing_editor.stroke_size"
        />
      </div>

      {(tool === "brush" || editorMode === "pixel") && (
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Brush Erase Size ({brushSize})
          </Label>
          <Slider
            value={[brushSize]}
            min={5}
            max={120}
            onValueChange={(v) => onBrushSizeChange(v[0])}
            data-ocid="drawing_editor.brush_size"
          />
        </div>
      )}

      {tool === "text" && (
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Text to Add
          </Label>
          <Input
            value={textValue}
            onChange={(e) => onTextValueChange(e.target.value)}
            placeholder="e.g. BEND 90° HERE"
            className="h-8 text-xs"
            data-ocid="drawing_editor.text_input"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5 pt-2 border-t">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1.5"
          onClick={onUndo}
          data-ocid="drawing_editor.undo"
        >
          <Redo2 className="w-3.5 h-3.5 -scale-x-100" />
          Undo Last
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10"
          onClick={onClear}
          data-ocid="drawing_editor.clear_all"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Clear All Annotations
        </Button>
      </div>
    </div>
  );
}
