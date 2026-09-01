import { Button } from "@/components/ui/button";

interface Props {
  onDeleteBlue: () => void;
  onDeleteRed: () => void;
  onKeepBlack: () => void;
  onInvertSelection: () => void;
  onRestoreHidden: () => void;
  objectCount: number;
}

export function VectorModePanel({
  onDeleteBlue,
  onDeleteRed,
  onKeepBlack,
  onInvertSelection,
  onRestoreHidden,
  objectCount,
}: Props) {
  return (
    <div
      className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2"
      data-ocid="drawing_editor.vector_panel"
    >
      <div className="text-[10px] font-bold tracking-wide text-primary">
        📐 VECTOR MODE ACTIVE
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        {objectCount} objects loaded. Start with "Delete All Blue" to wipe
        dimensions in one tap, then click any leftover object to delete it
        individually.
      </p>
      <Button
        type="button"
        size="sm"
        className="w-full h-8 text-[10px] bg-info hover:bg-info/90 text-info-foreground"
        onClick={onDeleteBlue}
        data-ocid="drawing_editor.vector.delete_blue"
      >
        🟦 DELETE ALL BLUE
      </Button>
      <Button
        type="button"
        size="sm"
        className="w-full h-8 text-[10px] bg-destructive hover:bg-destructive/90 text-destructive-foreground"
        onClick={onDeleteRed}
        data-ocid="drawing_editor.vector.delete_red"
      >
        🟥 DELETE ALL RED
      </Button>
      <Button
        type="button"
        size="sm"
        className="w-full h-8 text-[10px] bg-neutral-800 hover:bg-neutral-900 text-white"
        onClick={onKeepBlack}
        data-ocid="drawing_editor.vector.keep_black"
      >
        ⚫ KEEP ONLY BLACK
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full h-7 text-[10px]"
        onClick={onInvertSelection}
        data-ocid="drawing_editor.vector.invert_selection"
      >
        ↔ INVERT SELECTION
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full h-7 text-[10px]"
        onClick={onRestoreHidden}
        data-ocid="drawing_editor.vector.restore"
      >
        RESTORE HIDDEN
      </Button>
    </div>
  );
}
