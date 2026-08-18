import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "../../components/ConfirmDeleteDialog";
import type { QmsTemplate, QualityCharacteristic } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: QmsTemplate[];
  characteristics: QualityCharacteristic[];
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRemoveCharacteristic: (
    templateId: string,
    characteristicId: string,
  ) => Promise<void>;
}

export function TemplateManagerDialog({
  open,
  onOpenChange,
  templates,
  characteristics,
  onRename,
  onDelete,
  onRemoveCharacteristic,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<QmsTemplate | null>(null);

  const nameOf = (id: string) =>
    characteristics.find((c) => c.id === id)?.name ??
    "(deleted characteristic)";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg max-h-[80vh] overflow-y-auto"
        data-ocid="qms.templates.dialog"
      >
        <DialogHeader>
          <DialogTitle>Manage Templates</DialogTitle>
        </DialogHeader>

        {templates.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No templates yet. Select characteristics in the library and use "Add
            to Template" to create one.
          </p>
        )}

        <div className="space-y-2">
          {templates.map((t) => (
            <div
              key={t.id}
              className="rounded-md border p-2.5"
              data-ocid={`qms.templates.item.${t.id}`}
            >
              <div className="flex items-center gap-2">
                <Input
                  value={renameDrafts[t.id] ?? t.name}
                  onChange={(e) =>
                    setRenameDrafts((d) => ({ ...d, [t.id]: e.target.value }))
                  }
                  onBlur={async () => {
                    const draft = renameDrafts[t.id];
                    if (draft?.trim() && draft !== t.name) {
                      await onRename(t.id, draft.trim());
                      toast.success("Template renamed");
                    }
                  }}
                  className="h-7 text-xs font-medium flex-1"
                  data-ocid={`qms.templates.rename.${t.id}`}
                />
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {t.characteristicIds.length} items
                </Badge>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs px-2"
                  onClick={() =>
                    setExpandedId(expandedId === t.id ? null : t.id)
                  }
                  data-ocid={`qms.templates.expand.${t.id}`}
                >
                  {expandedId === t.id ? "Hide" : "View"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-destructive"
                  onClick={() => setDeleteTarget(t)}
                  data-ocid={`qms.templates.delete.${t.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>

              {expandedId === t.id && (
                <ScrollArea className="mt-2 max-h-40">
                  <div className="space-y-1">
                    {t.characteristicIds.length === 0 && (
                      <p className="text-xs text-muted-foreground py-2">
                        No characteristics in this template.
                      </p>
                    )}
                    {t.characteristicIds.map((cid) => (
                      <div
                        key={cid}
                        className="flex items-center justify-between text-xs py-1 px-1.5 rounded hover:bg-muted/50"
                      >
                        <span className="truncate">{nameOf(cid)}</span>
                        <button
                          type="button"
                          onClick={() => onRemoveCharacteristic(t.id, cid)}
                          className="text-muted-foreground hover:text-destructive shrink-0 ml-2"
                          data-ocid={`qms.templates.remove_item.${t.id}.${cid}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          ))}
        </div>
      </DialogContent>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete template?"
        description={`Template "${deleteTarget?.name}" will be permanently deleted.`}
        onConfirm={async () => {
          if (deleteTarget) {
            await onDelete(deleteTarget.id);
            toast.success("Template deleted");
          }
          setDeleteTarget(null);
        }}
      />
    </Dialog>
  );
}
