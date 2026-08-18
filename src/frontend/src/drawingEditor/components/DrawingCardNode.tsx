import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  FileOutput,
  FileSearch,
  FileText,
  FolderInput,
  Layers,
  Link2,
  Pencil,
  Printer,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import type { DrawingTreeNode as TreeNode } from "../lib/drawingTree";
import type { DrawingDocument } from "../types";

interface Props {
  node: TreeNode;
  depth: number;
  canEdit: boolean;
  canDelete: boolean;
  onOpen: (d: DrawingDocument) => void;
  onRename: (d: DrawingDocument) => void;
  onLink: (d: DrawingDocument) => void;
  onDuplicate: (d: DrawingDocument) => void;
  onChangeOwner: (d: DrawingDocument) => void;
  onDelete: (d: DrawingDocument) => void;
  onPreview?: (d: DrawingDocument) => void;
  onPreviewOriginal?: (d: DrawingDocument) => void;
  onPrint?: (d: DrawingDocument) => void;
  previewLabel?: string;
  openLabel?: string;
  showOriginalBadges?: boolean;
  workingDrawingOriginalIds?: Set<string>;
}

/** Mobile-card counterpart to DrawingTreeNode's DrawingTreeRow — same tree
 * data, same handler props (nothing new: every action here calls the exact
 * function DrawingsListPanel already passes to the desktop tree), just laid
 * out as a stacked card instead of a <TableRow>. Kept as its own file
 * rather than a `card` variant bolted onto DrawingTreeNode.tsx so the
 * existing tree row — reused by the Machine tab, View Lineage dialog, and
 * Design Files hierarchy — stays completely untouched (responsive audit
 * Fix 1: "Drawing / Preview Safety" list). Only wired in from
 * DrawingsListPanel's new `sm:hidden` block. */
export function DrawingCardNode({
  node,
  depth,
  canEdit,
  canDelete,
  onOpen,
  onRename,
  onLink,
  onDuplicate,
  onChangeOwner,
  onDelete,
  onPreview,
  onPreviewOriginal,
  onPrint,
  previewLabel = "Preview",
  openLabel = "Open",
  showOriginalBadges = false,
  workingDrawingOriginalIds,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const { drawing, children } = node;
  const hasChildren = children.length > 0;

  return (
    <>
      <div
        className="rounded-md border p-3 space-y-2"
        style={{ marginLeft: depth * 16 }}
        data-ocid={`drawing_editor.card_row.${drawing.id}`}
      >
        <div className="flex items-start gap-1.5">
          {hasChildren ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-5 w-5 p-0 shrink-0 mt-0.5"
              onClick={() => setExpanded((e) => !e)}
              data-ocid={`drawing_editor.card_toggle.${drawing.id}`}
            >
              {expanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </Button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          {drawing.sourceDesignFileId ? (
            <Layers className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
          ) : drawing.parentDrawingId ? (
            <FileOutput className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
          ) : (
            <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
          )}
          <div className="min-w-0 flex-1">
            <div
              className="text-sm font-medium truncate"
              title={drawing.fileName}
            >
              {drawing.fileName}
            </div>
            <div className="flex items-center gap-1 flex-wrap mt-1">
              {drawing.sourceDesignFileId && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1 py-0 border-blue-400 text-blue-600"
                >
                  Master
                </Badge>
              )}
              {drawing.parentDrawingId && (
                <Badge variant="outline" className="text-[10px] px-1 py-0">
                  Production
                </Badge>
              )}
              {showOriginalBadges &&
                !drawing.sourceDesignFileId &&
                !drawing.parentDrawingId &&
                !drawing.originalDrawingId && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1 py-0 border-emerald-400 text-emerald-600"
                  >
                    Original
                  </Badge>
                )}
              {showOriginalBadges &&
                workingDrawingOriginalIds?.has(drawing.id) && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1 py-0 border-amber-400 text-amber-600"
                  >
                    Edited
                  </Badge>
                )}
              {!expanded && hasChildren && (
                <Badge variant="outline" className="text-[10px] px-1 py-0">
                  {children.length}{" "}
                  {children.length === 1 ? "child" : "children"}
                </Badge>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {new Date(drawing.uploadedAt).toLocaleString()}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-wrap pt-1 border-t">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs px-2.5"
            onClick={() => onOpen(drawing)}
            data-ocid={`drawing_editor.card_open.${drawing.id}`}
          >
            {openLabel}
          </Button>
          {onPreviewOriginal && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              title="Preview Original"
              onClick={() => onPreviewOriginal(drawing)}
              data-ocid={`drawing_editor.card_preview_original.${drawing.id}`}
            >
              <FileSearch className="w-3.5 h-3.5" />
            </Button>
          )}
          {onPreview && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              title={previewLabel}
              onClick={() => onPreview(drawing)}
              data-ocid={`drawing_editor.card_preview.${drawing.id}`}
            >
              <Eye className="w-3.5 h-3.5" />
            </Button>
          )}
          {onPrint && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              title="Print"
              onClick={() => onPrint(drawing)}
              data-ocid={`drawing_editor.card_print.${drawing.id}`}
            >
              <Printer className="w-3.5 h-3.5" />
            </Button>
          )}
          {canEdit && (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                title="Rename"
                onClick={() => onRename(drawing)}
                data-ocid={`drawing_editor.card_rename.${drawing.id}`}
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                title="Link to…"
                onClick={() => onLink(drawing)}
                data-ocid={`drawing_editor.card_link.${drawing.id}`}
              >
                <Link2 className="w-3.5 h-3.5" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                title="Duplicate"
                onClick={() => onDuplicate(drawing)}
                data-ocid={`drawing_editor.card_duplicate.${drawing.id}`}
              >
                <Copy className="w-3.5 h-3.5" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                title="Change Owner…"
                onClick={() => onChangeOwner(drawing)}
                data-ocid={`drawing_editor.card_change_owner.${drawing.id}`}
              >
                <FolderInput className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
          {canDelete && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-destructive"
              title="Delete"
              onClick={() => onDelete(drawing)}
              data-ocid={`drawing_editor.card_delete.${drawing.id}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
      {expanded && hasChildren && (
        <div className="space-y-2 mt-2">
          {children.map((child) => (
            <DrawingCardNode
              key={child.drawing.id}
              node={child}
              depth={depth + 1}
              canEdit={canEdit}
              canDelete={canDelete}
              onOpen={onOpen}
              onRename={onRename}
              onLink={onLink}
              onDuplicate={onDuplicate}
              onChangeOwner={onChangeOwner}
              onDelete={onDelete}
              onPreview={onPreview}
              onPreviewOriginal={onPreviewOriginal}
              onPrint={onPrint}
              previewLabel={previewLabel}
              openLabel={openLabel}
              showOriginalBadges={showOriginalBadges}
              workingDrawingOriginalIds={workingDrawingOriginalIds}
            />
          ))}
        </div>
      )}
    </>
  );
}
