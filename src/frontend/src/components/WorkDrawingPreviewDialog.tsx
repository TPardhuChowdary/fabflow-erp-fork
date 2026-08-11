import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { printDocument } from "@/lib/documentUtils";
import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import type { ExportCompanyInfo } from "../drawingEditor/lib/exportComposer";
import { composeLatestView } from "../drawingEditor/lib/workOrderPreview";
import type { DrawingDocument } from "../drawingEditor/types";

interface Props {
  drawing: DrawingDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: ExportCompanyInfo;
}

/** Read-only Work Order preview for a Work Drawing — the exact final
 * production layout, composed on demand from its latest saved state.
 * Never opens the editor, never writes anything. */
export function WorkDrawingPreviewDialog({
  drawing,
  open,
  onOpenChange,
  company,
}: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notSaved, setNotSaved] = useState(false);
  const [printing, setPrinting] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run only on drawing identity/open change, not on every company/drawing object identity change
  useEffect(() => {
    setImageUrl(null);
    setNotSaved(false);
    if (!drawing || !open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const canvas = await composeLatestView(drawing, company);
      if (cancelled) return;
      if (!canvas) {
        setNotSaved(true);
      } else {
        setImageUrl(canvas.toDataURL("image/png"));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [drawing?.id, open]);

  const handlePrint = async () => {
    if (!imageUrl) return;
    setPrinting(true);
    try {
      const containerId = `work-drawing-print-${Date.now()}`;
      const container = document.createElement("div");
      container.id = containerId;
      container.style.cssText = "position:fixed;left:-9999px;top:-9999px;";
      const img = document.createElement("img");
      img.src = imageUrl;
      img.style.cssText = "display:block;width:100%;";
      container.appendChild(img);
      document.body.appendChild(container);
      await printDocument(containerId);
      container.remove();
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">
            {drawing?.fileName}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <p className="text-sm text-muted-foreground py-10 text-center">
            Composing preview…
          </p>
        )}
        {!loading && notSaved && (
          <p className="text-sm text-muted-foreground py-10 text-center">
            This Work Drawing hasn't been saved yet.
          </p>
        )}
        {!loading && imageUrl && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                disabled={printing}
                onClick={handlePrint}
              >
                <Printer className="w-3.5 h-3.5" /> Print
              </Button>
            </div>
            <div className="border rounded-md overflow-auto max-h-[70vh] bg-muted/30 flex items-center justify-center">
              <img
                src={imageUrl}
                alt={`${drawing?.fileName} — Work Order preview`}
                className="max-w-full"
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
