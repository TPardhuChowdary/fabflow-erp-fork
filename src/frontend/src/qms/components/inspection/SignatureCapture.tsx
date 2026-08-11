// Generic digital-signature capture. Mirrors the proven canvas/pointer-event
// drawing mechanics already used by ../../../components/SignaturePad.tsx —
// that component's prop contract (employeeName/amount) is specific to the
// salary-advance feature, so this is a small, generically-scoped sibling
// rather than a forced reuse.
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEffect, useRef, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (signatureDataUrl: string) => void;
  title: string;
  subtitle?: string;
}

export function SignatureCapture({
  open,
  onClose,
  onSave,
  title,
  subtitle,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const isDrawingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setIsEmpty(true);

    const init = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const getPos = (e: PointerEvent) => {
        const r = canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };

      const onPointerDown = (e: PointerEvent) => {
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        const { x, y } = getPos(e);
        isDrawingRef.current = true;
        setIsEmpty(false);
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(x, y);
      };

      const onPointerMove = (e: PointerEvent) => {
        e.preventDefault();
        if (!isDrawingRef.current) return;
        const { x, y } = getPos(e);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
      };

      const onPointerUp = (e: PointerEvent) => {
        e.preventDefault();
        isDrawingRef.current = false;
      };

      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointerleave", onPointerUp);

      return () => {
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("pointerleave", onPointerUp);
      };
    };

    let cleanup: (() => void) | undefined;
    const rafId = requestAnimationFrame(() => {
      cleanup = init();
    });
    return () => {
      cancelAnimationFrame(rafId);
      cleanup?.();
    };
  }, [open]);

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas || isEmpty) return;
    onSave(canvas.toDataURL("image/png"));
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-ocid="qms.signature.dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {subtitle && (
          <p className="text-xs text-muted-foreground -mt-2">{subtitle}</p>
        )}
        <canvas
          ref={canvasRef}
          className="w-full h-40 rounded border bg-white touch-none"
          data-ocid="qms.signature.canvas"
        />
        <DialogFooter className="justify-between sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            data-ocid="qms.signature.clear"
          >
            Clear
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isEmpty}
              onClick={handleSave}
              data-ocid="qms.signature.save"
            >
              Save Signature
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
