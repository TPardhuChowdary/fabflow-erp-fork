import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import type { EditorMode } from "../types";

interface Props {
  open: boolean;
  vectorRecommended: boolean;
  onChoose: (mode: EditorMode, remember: boolean) => void;
  onCancel: () => void;
}

const CARDS: Array<{
  mode: EditorMode;
  icon: string;
  title: string;
  bullets: string[];
}> = [
  {
    mode: "vector",
    icon: "📐",
    title: "Vector Editing",
    bullets: [
      "Convert drawing into editable vector objects",
      "Delete dimensions individually",
      "Edit text, lines, circles, arrows",
      "Best for CAD-generated PDFs",
    ],
  },
  {
    mode: "pixel",
    icon: "🖼",
    title: "Pixel Editing",
    bullets: [
      "Treat the selected region as an image",
      "Use Auto Strip, Magic Erase, Brush, Lasso",
      "Good if you prefer image-based cleanup",
    ],
  },
  {
    mode: "original",
    icon: "📄",
    title: "Original View",
    bullets: [
      "Keep the drawing exactly as in the PDF",
      "Only add Text, Arrow, Circle, Rectangle, Highlight",
      "The original drawing stays untouched",
    ],
  },
];

/** §5/§6 of the Engineering Drawing Editor spec: shown after "Confirm
 * Selection", never auto-entered. */
export function ModeSelectionModal({
  open,
  vectorRecommended,
  onChoose,
  onCancel,
}: Props) {
  const [remember, setRemember] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent
        className="max-w-3xl"
        data-ocid="drawing_editor.mode_modal"
      >
        <DialogHeader>
          <DialogTitle>Choose Editing Mode</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">
          We detected this drawing supports{" "}
          {vectorRecommended ? "Vector" : "Pixel"} editing. How would you like
          to continue?
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
          {CARDS.map((c) => {
            const recommended =
              (c.mode === "vector" && vectorRecommended) ||
              (c.mode === "pixel" && !vectorRecommended);
            return (
              <div
                key={c.mode}
                className="border rounded-md p-4 flex flex-col hover:border-primary hover:bg-muted/40 transition-colors"
                data-ocid={`drawing_editor.mode_card.${c.mode}`}
              >
                <div className="text-sm font-bold mb-1">
                  {c.icon} {c.title}
                </div>
                {recommended && (
                  <Badge
                    variant="outline"
                    className="w-fit text-[10px] mb-2 bg-green-100 text-green-700 border-green-200"
                  >
                    RECOMMENDED
                  </Badge>
                )}
                <ul className="text-xs text-muted-foreground list-disc ml-4 space-y-1 flex-1 mb-3">
                  {c.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <Button
                  type="button"
                  size="sm"
                  variant={recommended ? "default" : "outline"}
                  onClick={() => onChoose(c.mode, remember)}
                  data-ocid={`drawing_editor.mode_choose.${c.mode}`}
                >
                  Continue with {c.title.split(" ")[0]}
                </Button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-3 border-t mt-2">
          <Label className="flex items-center gap-2 text-xs font-normal cursor-pointer">
            <Checkbox
              checked={remember}
              onCheckedChange={(v) => setRemember(v === true)}
              data-ocid="drawing_editor.remember_choice"
            />
            Remember my choice for future drawings.
          </Label>
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            ← Back
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
