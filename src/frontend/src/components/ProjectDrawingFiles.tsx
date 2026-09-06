// Project → Design Files, backed by the central Drawing Repository (see
// chat) — replaces the old "retired, go use Drawing Repository" notice
// with a real in-project workflow. Deliberately reuses the Repository's
// own data model rather than inventing a second one:
//
//   - "Owned" drawings: drawings.project_id = this project (set by
//     uploadDrawing() at upload time — exactly what a normal Repository
//     upload already does, just with projectId pre-filled).
//   - "Linked" drawings: a drawing_links row (linked_type: "project",
//     linked_id: this project) — the Repository's own existing
//     many-to-many mechanism, used everywhere else for Die/Tool/Vendor
//     links. Never a second copy of the file.
//
// This project's Design Files list is the union of both — never a
// separate storage location, per the architecture requirement.
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { UploadDrawingInput } from "@/drawingEditor/api/drawings";
import { getDrawingPdfBlob } from "@/drawingEditor/api/drawings";
import { loadPdf } from "@/drawingEditor/lib/pdfRenderer";
import type { DrawingDocument, DrawingLink } from "@/drawingEditor/types";
import {
  Eye,
  FilePlus2,
  FolderSearch,
  Link2,
  Loader2,
  Plus,
  Trash2,
  Unlink,
  UploadCloud,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

interface ProjectDrawingFilesProps {
  projectId: string;
  drawings: DrawingDocument[];
  links: DrawingLink[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  userId: string;
  userName: string;
  onUpload: (input: UploadDrawingInput) => Promise<DrawingDocument>;
  onAddLink: (
    drawingId: string,
    linkedType: DrawingLink["linkedType"],
    linkedId: string,
  ) => Promise<void>;
  onRemoveLink: (linkId: string) => Promise<void>;
  onUpdateDrawing: (
    id: string,
    patch: Partial<Pick<DrawingDocument, "ownerType" | "ownerId">>,
  ) => Promise<DrawingDocument>;
  onDeleteDrawing: (id: string) => Promise<string[]>;
  onAudit: (entry: {
    module: string;
    action: "create" | "update" | "delete" | "status_change";
    entityId: string;
    entityLabel: string;
    changedBy: string;
  }) => void;
}

type DialogMode = "choice" | "upload" | "existing";

export function ProjectDrawingFiles({
  projectId,
  drawings,
  links,
  canCreate,
  canEdit,
  canDelete,
  userId,
  userName,
  onUpload,
  onAddLink,
  onRemoveLink,
  onUpdateDrawing,
  onDeleteDrawing,
  onAudit,
}: ProjectDrawingFilesProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DialogMode>("choice");
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [linking, setLinking] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DrawingDocument | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Owned (uploaded directly into this project) + linked (an existing
  // Repository drawing pointed at this project) — the union IS the
  // project's Design Files, never a separate list.
  const projectLinks = useMemo(
    () =>
      links.filter(
        (l) => l.linkedType === "project" && l.linkedId === projectId,
      ),
    [links, projectId],
  );
  const linkedDrawingIds = useMemo(
    () => new Set(projectLinks.map((l) => l.drawingId)),
    [projectLinks],
  );
  const rows = useMemo(() => {
    const owned = drawings
      .filter((d) => d.projectId === projectId && d.ownerType !== "library")
      .map((d) => ({ drawing: d, link: null as DrawingLink | null }));
    const linked = projectLinks
      .map((l) => ({
        drawing: drawings.find((d) => d.id === l.drawingId),
        link: l,
      }))
      .filter(
        (r): r is { drawing: DrawingDocument; link: DrawingLink } =>
          !!r.drawing,
      );
    return [...owned, ...linked].sort(
      (a, b) => b.drawing.uploadedAt - a.drawing.uploadedAt,
    );
  }, [drawings, projectLinks, projectId]);

  const alreadyAssociatedIds = useMemo(() => {
    const ids = new Set(linkedDrawingIds);
    for (const d of drawings) {
      if (d.projectId === projectId && d.ownerType !== "library") {
        ids.add(d.id);
      }
    }
    return ids;
  }, [drawings, linkedDrawingIds, projectId]);

  const availableToLink = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drawings
      .filter((d) => !alreadyAssociatedIds.has(d.id))
      .filter((d) => !q || d.fileName.toLowerCase().includes(q))
      .slice(0, 200);
  }, [drawings, alreadyAssociatedIds, search]);

  const resetDialog = () => {
    setMode("choice");
    setSearch("");
    setSelectedIds(new Set());
  };

  const closeDialog = () => {
    setOpen(false);
    resetDialog();
  };

  const handleFilesChosen = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    let succeeded = 0;
    let failed = 0;
    for (const file of Array.from(fileList)) {
      try {
        const pdf = await loadPdf(file);
        const drawing = await onUpload({
          fileName: file.name,
          pdfBlob: file,
          numPages: pdf.numPages,
          uploadedBy: userId,
          uploadedByName: userName,
          projectId,
        });
        onAudit({
          module: "drawing_editor",
          action: "create",
          entityId: drawing.id,
          entityLabel: drawing.fileName,
          changedBy: userName,
        });
        succeeded++;
      } catch (err) {
        failed++;
        toast.error(
          `${file.name}: ${err instanceof Error ? err.message : "upload failed"}`,
        );
      }
    }
    setUploading(false);
    if (succeeded > 0) {
      toast.success(
        succeeded === 1
          ? "Drawing uploaded and added to this project"
          : `${succeeded} drawings uploaded and added to this project`,
      );
    }
    if (failed === 0) closeDialog();
  };

  const handleLinkSelected = async () => {
    if (selectedIds.size === 0) return;
    setLinking(true);
    let succeeded = 0;
    for (const id of selectedIds) {
      try {
        await onAddLink(id, "project", projectId);
        const d = drawings.find((dd) => dd.id === id);
        if (d) {
          onAudit({
            module: "drawing_editor",
            action: "update",
            entityId: d.id,
            entityLabel: d.fileName,
            changedBy: userName,
          });
        }
        succeeded++;
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not link drawing",
        );
      }
    }
    setLinking(false);
    if (succeeded > 0) {
      toast.success(
        succeeded === 1
          ? "Existing drawing added to this project"
          : `${succeeded} existing drawings added to this project`,
      );
      closeDialog();
    }
  };

  const handlePreview = async (drawing: DrawingDocument) => {
    try {
      const blob = await getDrawingPdfBlob(drawing.id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not open drawing",
      );
    }
  };

  /** Unlinking is never destructive: a linked row just removes the
   * drawing_links row; an owned drawing is re-owned to the Repository's
   * unassigned/library shelf. Neither ever touches the drawings row's
   * existence or its Storage object — that is exactly what "Delete from
   * Repository" (below, separately) is for. */
  const handleUnlink = async (row: {
    drawing: DrawingDocument;
    link: DrawingLink | null;
  }) => {
    try {
      if (row.link) {
        await onRemoveLink(row.link.id);
      } else {
        await onUpdateDrawing(row.drawing.id, {
          ownerType: "library",
          ownerId: undefined,
        });
      }
      onAudit({
        module: "drawing_editor",
        action: "update",
        entityId: row.drawing.id,
        entityLabel: row.drawing.fileName,
        changedBy: userName,
      });
      toast.success(`Removed "${row.drawing.fileName}" from this project`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not unlink drawing",
      );
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const d = deleteTarget;
    try {
      await onDeleteDrawing(d.id);
      onAudit({
        module: "drawing_editor",
        action: "delete",
        entityId: d.id,
        entityLabel: d.fileName,
        changedBy: userName,
      });
      toast.success(`"${d.fileName}" deleted from the Drawing Repository`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not delete drawing",
      );
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div
      className="space-y-3"
      data-ocid="project-detail.design.repository_section"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground max-w-prose">
          Drawings are stored centrally in the Drawing Repository. Add new
          drawings here or link existing drawings from the repository.
        </p>
        {canCreate && (
          <Button
            size="sm"
            onClick={() => setOpen(true)}
            data-ocid="project-detail.design.add_files_button"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Files
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
          No drawings linked to this project yet.
        </div>
      ) : (
        <div className="table-wrapper">
          <div
            className="rounded-md border"
            data-ocid="project-detail.design.repository_table"
          >
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs font-semibold">
                    File Name
                  </TableHead>
                  <TableHead className="text-xs font-semibold">
                    Uploaded
                  </TableHead>
                  <TableHead className="text-xs font-semibold w-28">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow
                    key={row.drawing.id}
                    data-ocid={`project-detail.design.repository_item.${i + 1}`}
                  >
                    <TableCell className="text-sm font-medium">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{row.drawing.fileName}</span>
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1 py-0"
                        >
                          Repository
                        </Badge>
                        {row.link && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1 py-0 border-info/40 text-info"
                          >
                            Linked
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(row.drawing.uploadedAt).toLocaleDateString(
                        "en-IN",
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          title="Preview"
                          onClick={() => handlePreview(row.drawing)}
                          data-ocid={`project-detail.design.repository_preview.${i + 1}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2"
                            title="Unlink from this project (keeps the drawing in the Repository)"
                            onClick={() => void handleUnlink(row)}
                            data-ocid={`project-detail.design.repository_unlink.${i + 1}`}
                          >
                            <Unlink className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-destructive hover:text-destructive"
                            title="Delete from Drawing Repository (removes it everywhere)"
                            onClick={() => setDeleteTarget(row.drawing)}
                            data-ocid={`project-detail.design.repository_delete.${i + 1}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(o) => (o ? setOpen(true) : closeDialog())}
      >
        <DialogContent
          className="max-h-[85vh] overflow-y-auto"
          data-ocid="project-detail.design.add_files_dialog"
        >
          {mode === "choice" && (
            <>
              <DialogHeader>
                <DialogTitle>Add Design Files</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
                <button
                  type="button"
                  className="flex flex-col items-center gap-2 rounded-lg border p-5 text-center hover:border-primary hover:bg-primary/5 transition-colors"
                  onClick={() => setMode("upload")}
                  data-ocid="project-detail.design.choice_upload"
                >
                  <UploadCloud className="w-6 h-6 text-primary" />
                  <span className="text-sm font-semibold">
                    Upload New Files
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Add brand-new drawings to the Repository and this project.
                  </span>
                </button>
                <button
                  type="button"
                  className="flex flex-col items-center gap-2 rounded-lg border p-5 text-center hover:border-primary hover:bg-primary/5 transition-colors"
                  onClick={() => setMode("existing")}
                  data-ocid="project-detail.design.choice_existing"
                >
                  <FolderSearch className="w-6 h-6 text-primary" />
                  <span className="text-sm font-semibold">
                    Add Existing Drawings
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Link a drawing already in the Repository — no duplicate
                    file.
                  </span>
                </button>
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={closeDialog}>
                  Cancel
                </Button>
              </DialogFooter>
            </>
          )}

          {mode === "upload" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FilePlus2 className="w-4 h-4" />
                  Upload New Files
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <p className="text-xs text-muted-foreground">
                  PDF files only, same as the Drawing Repository. Each file
                  becomes a new Repository record, linked to this project
                  automatically.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => void handleFilesChosen(e.target.files)}
                  data-ocid="project-detail.design.upload_input"
                />
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  data-ocid="project-detail.design.upload_pick_button"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-4 h-4 mr-2" />
                      Choose PDF file(s)
                    </>
                  )}
                </Button>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMode("choice")}
                  disabled={uploading}
                >
                  Back
                </Button>
              </DialogFooter>
            </>
          )}

          {mode === "existing" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Link2 className="w-4 h-4" />
                  Add Existing Drawings
                </DialogTitle>
              </DialogHeader>
              <div className="min-w-0 space-y-3 py-2">
                <Input
                  placeholder="Search drawings by file name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-ocid="project-detail.design.existing_search"
                />
                <p className="text-[11px] text-muted-foreground">
                  Drawings already linked to this project are not shown here.
                </p>
                <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
                  {availableToLink.length === 0 ? (
                    <p className="p-4 text-xs text-muted-foreground text-center">
                      No matching drawings found.
                    </p>
                  ) : (
                    availableToLink.map((d) => (
                      <label
                        key={d.id}
                        className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40"
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(d.id)}
                          onChange={(e) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(d.id);
                              else next.delete(d.id);
                              return next;
                            });
                          }}
                          data-ocid={`project-detail.design.existing_checkbox.${d.id}`}
                        />
                        <span className="min-w-0 truncate">{d.fileName}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMode("choice")}
                  disabled={linking}
                >
                  Back
                </Button>
                <Button
                  size="sm"
                  disabled={selectedIds.size === 0 || linking}
                  onClick={() => void handleLinkSelected()}
                  data-ocid="project-detail.design.existing_link_button"
                >
                  {linking
                    ? "Linking..."
                    : `Add ${selectedIds.size || ""} Drawing${selectedIds.size === 1 ? "" : "s"}`.trim()}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete from Drawing Repository?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This permanently deletes "{deleteTarget?.fileName}" from the central
            Drawing Repository — not just from this project. If it's linked to
            other projects, it will disappear from those too. This cannot be
            undone.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void handleConfirmDelete()}
              data-ocid="project-detail.design.confirm_delete_button"
            >
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
