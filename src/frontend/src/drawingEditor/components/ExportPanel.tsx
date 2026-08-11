import { Button } from "@/components/ui/button";
import { Loader2, Save } from "lucide-react";
import { useState } from "react";

interface Props {
  onSave: () => Promise<void>;
  /** Defaults true — hides the Save button when false. */
  canSave?: boolean;
}

export function ExportPanel({ onSave, canSave = true }: Props) {
  const [saving, setSaving] = useState(false);

  if (!canSave) return null;

  const run = async () => {
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="space-y-2 pt-2 border-t"
      data-ocid="drawing_editor.export_panel"
    >
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="w-full h-9 text-xs gap-1.5"
        disabled={saving}
        onClick={run}
        data-ocid="drawing_editor.save_progress"
      >
        {saving ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Save className="w-3.5 h-3.5" />
        )}
        Save
      </Button>
    </div>
  );
}
