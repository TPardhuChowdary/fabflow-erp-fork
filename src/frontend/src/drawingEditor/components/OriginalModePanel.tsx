export function OriginalModePanel() {
  return (
    <div
      className="rounded-md border p-3 bg-muted/40"
      data-ocid="drawing_editor.original_panel"
    >
      <div className="text-[10px] font-bold tracking-wide text-muted-foreground mb-1.5">
        📄 ORIGINAL VIEW — NO CONVERSION
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        The drawing is untouched — exactly as in the uploaded PDF. No
        delete/erase tools are available here. Use Text, Arrow, Circle,
        Rectangle, or Highlight below to add notes on top.
      </p>
    </div>
  );
}
