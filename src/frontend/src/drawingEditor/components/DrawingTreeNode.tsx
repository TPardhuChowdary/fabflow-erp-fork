import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
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
  /** Marks one row as "you are here" — used only by the View Lineage dialog. */
  highlightId?: string;
  onOpen: (d: DrawingDocument) => void;
  onRename?: (d: DrawingDocument) => void;
  onLink?: (d: DrawingDocument) => void;
  onDuplicate?: (d: DrawingDocument) => void;
  onChangeOwner?: (d: DrawingDocument) => void;
  onDelete: (d: DrawingDocument) => void;
  /** Read-only preview action (never opens the editor). Shown only when
   * provided. For a Repository row this is "Preview Engineering Drawing";
   * see previewLabel. */
  onPreview?: (d: DrawingDocument) => void;
  /** Read-only preview of the untouched original upload — Repository only,
   * shown only when provided. */
  onPreviewOriginal?: (d: DrawingDocument) => void;
  /** Prints the same rendering onPreview would show, without opening a dialog first. */
  onPrint?: (d: DrawingDocument) => void;
  /** Tooltip for the onPreview button — defaults to "Preview". */
  previewLabel?: string;
  /** Each defaults to true, preserving today's behavior for the Global
   * Repository's View Lineage dialog and Machine's Drawings tab. The
   * Design Files hierarchy view sets all four false — those
   * administrative actions aren't part of the simplified day-to-day flow. */
  showRename?: boolean;
  showLink?: boolean;
  showDuplicate?: boolean;
  showChangeOwner?: boolean;
  /** Label for the primary onOpen button — defaults to "Open" (used by the
   * Global Repository / Machine tab); the Design Files hierarchy passes
   * "Edit" to match its own action naming. Same action either way. */
  openLabel?: string;
  /** Renders 3 cells (File / Uploaded / Actions) instead of the default 5
   * (File / Pages / Uploaded By / Uploaded / Actions) — used by the Design
   * Files hierarchy, whose table doesn't have Pages/Uploaded By columns. */
  compact?: boolean;
  /** Shows "Original"/"Edited" badges — Repository only (the only place a
   * drawing can be a Repository Original at all). Default false. */
  showOriginalBadges?: boolean;
  /** Every drawing id that currently has a hidden Working Drawing —
   * drives the "Edited" badge. Ignored unless showOriginalBadges is true. */
  workingDrawingOriginalIds?: Set<string>;
}

/** One row (plus its recursively-rendered children) inside a Master →
 * Work Drawing tree. Renders bare <TableRow> fragments so it slots
 * directly into an existing <TableBody>/column layout — see
 * DrawingsListPanel's focused-mode branch, the View Lineage dialog, and
 * the Design Files hierarchy view, which all reuse this same component
 * rather than each building their own tree renderer. */
export function DrawingTreeRow({
  node,
  depth,
  canEdit,
  canDelete,
  highlightId,
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
  showRename = true,
  showLink = true,
  showDuplicate = true,
  showChangeOwner = true,
  openLabel = "Open",
  compact = false,
  showOriginalBadges = false,
  workingDrawingOriginalIds,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const { drawing, children } = node;
  const hasChildren = children.length > 0;
  const isHighlighted = highlightId === drawing.id;

  return (
    <>
      <TableRow
        className={cn(isHighlighted && "bg-amber-50 dark:bg-amber-950/30")}
        data-ocid={`drawing_editor.tree_row.${drawing.id}`}
      >
        <TableCell className="text-xs font-medium">
          <div
            className="flex items-center gap-1"
            style={{ paddingLeft: depth * 20 }}
          >
            {hasChildren ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-5 w-5 p-0 shrink-0"
                onClick={() => setExpanded((e) => !e)}
                data-ocid={`drawing_editor.tree_toggle.${drawing.id}`}
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
              <Layers className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            ) : drawing.parentDrawingId ? (
              <FileOutput className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            ) : (
              <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            )}
            <span className="truncate">{drawing.fileName}</span>
            {isHighlighted && (
              <Badge className="text-[10px] px-1 py-0">You are here</Badge>
            )}
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
                {children.length} {children.length === 1 ? "child" : "children"}
              </Badge>
            )}
          </div>
        </TableCell>
        {!compact && (
          <>
            <TableCell className="text-xs">{drawing.numPages}</TableCell>
            <TableCell className="text-xs">{drawing.uploadedByName}</TableCell>
          </>
        )}
        <TableCell className="text-xs">
          {new Date(drawing.uploadedAt).toLocaleString()}
        </TableCell>
        <TableCell className="text-right space-x-1 whitespace-nowrap">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs px-2"
            onClick={() => onOpen(drawing)}
            data-ocid={`drawing_editor.tree_open.${drawing.id}`}
          >
            {openLabel}
          </Button>
          {onPreviewOriginal && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              title="Preview Original"
              onClick={() => onPreviewOriginal(drawing)}
              data-ocid={`drawing_editor.tree_preview_original.${drawing.id}`}
            >
              <FileSearch className="w-3.5 h-3.5" />
            </Button>
          )}
          {onPreview && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              title={previewLabel}
              onClick={() => onPreview(drawing)}
              data-ocid={`drawing_editor.tree_preview.${drawing.id}`}
            >
              <Eye className="w-3.5 h-3.5" />
            </Button>
          )}
          {onPrint && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              title="Print"
              onClick={() => onPrint(drawing)}
              data-ocid={`drawing_editor.tree_print.${drawing.id}`}
            >
              <Printer className="w-3.5 h-3.5" />
            </Button>
          )}
          {canEdit && (
            <>
              {showRename && onRename && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  title="Rename"
                  onClick={() => onRename(drawing)}
                  data-ocid={`drawing_editor.tree_rename.${drawing.id}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              )}
              {showLink && onLink && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  title="Link to…"
                  onClick={() => onLink(drawing)}
                  data-ocid={`drawing_editor.tree_link.${drawing.id}`}
                >
                  <Link2 className="w-3.5 h-3.5" />
                </Button>
              )}
              {showDuplicate && onDuplicate && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  title="Duplicate"
                  onClick={() => onDuplicate(drawing)}
                  data-ocid={`drawing_editor.tree_duplicate.${drawing.id}`}
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              )}
              {showChangeOwner && onChangeOwner && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  title="Change Owner…"
                  onClick={() => onChangeOwner(drawing)}
                  data-ocid={`drawing_editor.tree_change_owner.${drawing.id}`}
                >
                  <FolderInput className="w-3.5 h-3.5" />
                </Button>
              )}
            </>
          )}
          {canDelete && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-destructive"
              onClick={() => onDelete(drawing)}
              data-ocid={`drawing_editor.tree_delete.${drawing.id}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </TableCell>
      </TableRow>
      {expanded &&
        children.map((child) => (
          <DrawingTreeRow
            key={child.drawing.id}
            node={child}
            depth={depth + 1}
            canEdit={canEdit}
            canDelete={canDelete}
            highlightId={highlightId}
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
            showRename={showRename}
            showLink={showLink}
            showDuplicate={showDuplicate}
            showChangeOwner={showChangeOwner}
            openLabel={openLabel}
            compact={compact}
            showOriginalBadges={showOriginalBadges}
            workingDrawingOriginalIds={workingDrawingOriginalIds}
          />
        ))}
    </>
  );
}
