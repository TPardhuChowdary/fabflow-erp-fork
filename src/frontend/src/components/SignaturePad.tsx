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
  onSave: (signatureData: string) => void;
  employeeName: string;
  amount: number;
  date: string;
}

export function SignaturePad({
  open,
  onClose,
  onSave,
  employeeName,
  amount,
  date,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const isDrawingRef = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: canvas setup only needs to run when open changes
  useEffect(() => {
    if (!open) return;

    // Use a small delay to ensure the dialog has fully rendered and the canvas
    // has non-zero layout dimensions before we read offsetWidth/offsetHeight.
    const init = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Fix canvas internal size to match actual rendered size.
      // This is critical — if width/height don't match offsetWidth/offsetHeight,
      // the coordinate system is wrong and strokes may be invisible or misplaced.
      const displayWidth = canvas.offsetWidth;
      const displayHeight = canvas.offsetHeight;
      if (displayWidth > 0 && displayHeight > 0) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        console.error("SignaturePad: could not get 2d context");
        return;
      }

      // Set styles AFTER resizing — resizing the canvas resets all context state.
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Prevent scroll/zoom interference on touch and stylus.
      canvas.style.touchAction = "none";

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setIsEmpty(true);
      isDrawingRef.current = false;

      const getPos = (e: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
          x: (e.clientX - rect.left) * scaleX,
          y: (e.clientY - rect.top) * scaleY,
        };
      };

      const onPointerDown = (e: PointerEvent) => {
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        const { x, y } = getPos(e);
        isDrawingRef.current = true;
        setIsEmpty(false);
        // Re-apply styles in case the context was reset
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = e.pressure > 0 ? Math.max(1.5, e.pressure * 4) : 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(x, y);
      };

      const onPointerMove = (e: PointerEvent) => {
        e.preventDefault();
        if (!isDrawingRef.current) return;
        const { x, y } = getPos(e);
        // Adjust line width for pen/stylus pressure; fall back to 2 for mouse.
        ctx.lineWidth = e.pressure > 0 ? Math.max(1.5, e.pressure * 4) : 2;
        ctx.lineTo(x, y);
        ctx.stroke();
        // Start a new sub-path from the current point so the next move continues smoothly.
        ctx.beginPath();
        ctx.moveTo(x, y);
      };

      const onPointerUp = (e: PointerEvent) => {
        e.preventDefault();
        isDrawingRef.current = false;
      };

      const onPointerLeave = (e: PointerEvent) => {
        e.preventDefault();
        isDrawingRef.current = false;
      };

      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointerleave", onPointerLeave);

      return () => {
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("pointerleave", onPointerLeave);
      };
    };

    // rAF ensures layout is complete before we measure offsetWidth/offsetHeight.
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
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas || isEmpty) return;
    const data = canvas.toDataURL("image/png");
    onSave(data);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-ocid="signature.dialog">
        <DialogHeader>
          <DialogTitle>Employee Signature</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-sm text-muted-foreground space-y-1">
            <p>
              <span className="font-medium text-foreground">Employee:</span>{" "}
              {employeeName}
            </p>
            <p>
              <span className="font-medium text-foreground">Amount:</span> ₹
              {amount.toLocaleString("en-IN")}
            </p>
            <p>
              <span className="font-medium text-foreground">Date:</span> {date}
            </p>
          </div>

          <div className="rounded-lg border border-border overflow-hidden bg-white">
            {/* No fixed width/height here — canvas.width/height are set in the effect
                after layout so the internal pixel grid matches the rendered size exactly. */}
            <canvas
              ref={canvasRef}
              className="w-full cursor-crosshair block"
              style={{
                height: "180px",
                touchAction: "none",
                pointerEvents: "auto",
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Sign above using mouse, touch, stylus, or trackpad
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleClear}
            data-ocid="signature.cancel_button"
          >
            Clear
          </Button>
          <Button
            onClick={handleSave}
            disabled={isEmpty}
            data-ocid="signature.confirm_button"
          >
            Save Signature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
