import { cn } from "@/lib/utils";
import { Hammer, Hash } from "lucide-react";

export type GlobalEditMode = "full" | "numberOnly";

interface Props {
  editMode: GlobalEditMode;
  onEditModeChange: (mode: GlobalEditMode) => void;
  pageLabel: string;
  editorModeLabel: string;
}

/** The "FULL EDIT / NUMBER EDIT" toggle from the reference blueprint's
 * header. NUMBER EDIT locks all geometry and lets a worker only
 * resize/recolor a wrongly-printed dimension number via
 * FloatingNumberToolbar. */
export function EditorHeaderBar({
  editMode,
  onEditModeChange,
  pageLabel,
  editorModeLabel,
}: Props) {
  return (
    <div
      className="flex items-center justify-between gap-3 flex-wrap"
      data-ocid="drawing_editor.header_bar"
    >
      <div className="flex bg-muted rounded-md border p-0.5">
        <button
          type="button"
          onClick={() => onEditModeChange("full")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-semibold tracking-wide",
            editMode === "full"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground",
          )}
          data-ocid="drawing_editor.edit_mode.full"
        >
          <Hammer className="w-3.5 h-3.5" />
          FULL EDIT
        </button>
        <button
          type="button"
          onClick={() => onEditModeChange("numberOnly")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-semibold tracking-wide",
            editMode === "numberOnly"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground",
          )}
          data-ocid="drawing_editor.edit_mode.number_only"
        >
          <Hash className="w-3.5 h-3.5" />
          NUMBER EDIT
        </button>
      </div>
      <div className="text-xs text-muted-foreground">
        {editorModeLabel} · Page {pageLabel}
      </div>
    </div>
  );
}
