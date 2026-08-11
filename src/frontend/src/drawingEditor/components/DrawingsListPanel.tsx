import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowUpDown, Plus, Search, X } from "lucide-react";
import { Fragment, useMemo, useRef, useState } from "react";
import { buildDrawingForest } from "../lib/drawingTree";
import type { DrawingDocument, DrawingLink } from "../types";
import { DrawingTreeRow } from "./DrawingTreeNode";

const ALL = "__all__";
const UNASSIGNED = "__unassigned__";

export type OwnerType = "project" | "machine" | "library";
export type LibraryCategory = NonNullable<DrawingDocument["category"]>;

export const LIBRARY_CATEGORIES: LibraryCategory[] = [
  "CNC Program",
  "Die Drawing",
  "Tooling",
  "Machine Setup",
  "Standard Drawing",
  "Template",
  "Other",
];

type SortKey = "uploaded" | "name" | "modified";

export interface ProjectOption {
  id: string;
  label: string;
}

/** Resolves a drawing's owner, falling back to the legacy projectId-only
 * shape for records created before ownerType/ownerId existed. */
function effectiveOwner(d: DrawingDocument): { type?: OwnerType; id?: string } {
  if (d.ownerType) return { type: d.ownerType, id: d.ownerId };
  if (d.projectId) return { type: "project", id: d.projectId };
  return {};
}

function ownerLabel(
  d: DrawingDocument,
  projects: ProjectOption[],
  machines: ProjectOption[],
): string {
  const owner = effectiveOwner(d);
  if (owner.type === "project") {
    return projects.find((p) => p.id === owner.id)?.label ?? "Unknown Project";
  }
  if (owner.type === "machine") {
    return machines.find((m) => m.id === owner.id)?.label ?? "Unknown Machine";
  }
  if (owner.type === "library") return `Repository — ${d.category ?? "Other"}`;
  return "Unassigned";
}

interface Props {
  drawings: DrawingDocument[];
  links: DrawingLink[];
  projects: ProjectOption[];
  machines: ProjectOption[];
  vendors?: ProjectOption[];
  customers?: ProjectOption[];
  canDelete: boolean;
  canEdit: boolean;
  onUpload: (
    file: File,
    ownerType: OwnerType,
    ownerId: string | undefined,
    category: LibraryCategory | undefined,
  ) => Promise<void>;
  onOpen: (drawing: DrawingDocument) => void;
  /** Label for the primary onOpen button — defaults to "Open". Repository
   * passes "Edit", matching its own action naming (creates/reuses the
   * hidden Working Drawing). Same action either way. */
  openLabel?: string;
  onDelete: (drawing: DrawingDocument) => void;
  onRename: (drawing: DrawingDocument, newFileName: string) => Promise<void>;
  onChangeOwner: (
    drawing: DrawingDocument,
    ownerType: OwnerType,
    ownerId: string | undefined,
    category: LibraryCategory | undefined,
  ) => Promise<void>;
  onDuplicate: (drawing: DrawingDocument) => Promise<DrawingDocument>;
  onAddLink: (
    drawing: DrawingDocument,
    linkedType: DrawingLink["linkedType"],
    linkedId: string,
  ) => Promise<void>;
  onRemoveLink: (linkId: string) => Promise<void>;
  /** Read-only preview/print actions per row. Shown only when provided.
   * onPreview previews the latest saved engineering state (or, for a
   * Repository row, its hidden Working Drawing); onPreviewOriginal (when
   * provided — Repository only) previews the untouched original upload. */
  onPreview?: (drawing: DrawingDocument) => void;
  onPreviewOriginal?: (drawing: DrawingDocument) => void;
  onPrint?: (drawing: DrawingDocument) => void;
  /** Tooltip for the onPreview button — defaults to "Preview". Repository
   * passes "Preview Engineering Drawing" to distinguish it from the
   * adjacent "Preview Original" button. */
  previewLabel?: string;
  /** Hard-scopes the list to one project or machine with no filter UI at
   * all — used when embedded in that entity's own Drawings tab. Leave both
   * unset for the full, filterable global editor list. */
  focusedProjectId?: string;
  focusedMachineId?: string;
  /** Seeds the filter when not focused (e.g. the remembered last owner). */
  initialOwnerType?: OwnerType;
  initialOwnerId?: string;
  /** Fires whenever the user changes the owner-type/entity filter while
   * not focused, so the caller can persist it as "last used owner". */
  onOwnerFilterChange?: (ownerType: string, ownerId: string) => void;
}

export function DrawingsListPanel({
  drawings,
  links,
  projects,
  machines,
  vendors = [],
  customers = [],
  canDelete,
  canEdit,
  onUpload,
  onOpen,
  openLabel = "Open",
  onDelete,
  onRename,
  onChangeOwner,
  onDuplicate,
  onAddLink,
  onRemoveLink,
  onPreview,
  onPreviewOriginal,
  onPrint,
  previewLabel = "Preview",
  focusedProjectId,
  focusedMachineId,
  initialOwnerType,
  initialOwnerId,
  onOwnerFilterChange,
}: Props) {
  const focused = focusedProjectId
    ? { type: "project" as const, id: focusedProjectId }
    : focusedMachineId
      ? { type: "machine" as const, id: focusedMachineId }
      : null;

  const [ownerTypeFilter, setOwnerTypeFilter] = useState<string>(
    initialOwnerType ?? ALL,
  );
  const [ownerEntityFilter, setOwnerEntityFilter] = useState<string>(
    initialOwnerId ?? ALL,
  );
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("uploaded");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadOwnerType, setUploadOwnerType] = useState<string>("");
  const [uploadOwnerId, setUploadOwnerId] = useState("");
  const [uploadCategory, setUploadCategory] = useState<string>("");
  const [renameTarget, setRenameTarget] = useState<DrawingDocument | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState("");
  const [ownerTarget, setOwnerTarget] = useState<DrawingDocument | null>(null);
  const [ownerDialogType, setOwnerDialogType] = useState<string>("");
  const [ownerDialogId, setOwnerDialogId] = useState("");
  const [ownerDialogCategory, setOwnerDialogCategory] = useState<string>("");
  const [linkTarget, setLinkTarget] = useState<DrawingDocument | null>(null);
  const [linkType, setLinkType] =
    useState<DrawingLink["linkedType"]>("project");
  const [linkEntityId, setLinkEntityId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const linkedDrawingIds = (type: OwnerType, id: string) =>
    new Set(
      links
        .filter((l) => l.linkedType === type && l.linkedId === id)
        .map((l) => l.drawingId),
    );

  const matchesOwner = (d: DrawingDocument, type: OwnerType, id: string) => {
    const owner = effectiveOwner(d);
    if (owner.type === type && owner.id === id) return true;
    return linkedDrawingIds(type, id).has(d.id);
  };

  // Hidden Working Drawings (Repository "Edit") are never their own row —
  // they exist purely as the thing the Editor operates on. Computed from
  // the full, unfiltered `drawings` prop so it stays accurate regardless
  // of the active owner/search filter.
  const workingDrawingOriginalIds = useMemo(
    () =>
      new Set(
        drawings
          .filter((d) => d.originalDrawingId)
          .map((d) => d.originalDrawingId as string),
      ),
    [drawings],
  );

  const visible = useMemo(() => {
    let list = drawings.filter((d) => !d.originalDrawingId);

    if (focused) {
      list = list.filter((d) => matchesOwner(d, focused.type, focused.id));
    } else if (ownerTypeFilter === UNASSIGNED) {
      list = list.filter((d) => !effectiveOwner(d).type);
    } else if (ownerTypeFilter === "project" || ownerTypeFilter === "machine") {
      list =
        ownerEntityFilter !== ALL
          ? list.filter((d) =>
              matchesOwner(d, ownerTypeFilter, ownerEntityFilter),
            )
          : list.filter((d) => effectiveOwner(d).type === ownerTypeFilter);
    } else if (ownerTypeFilter === "library") {
      list = list.filter((d) => {
        if (effectiveOwner(d).type !== "library") return false;
        return ownerEntityFilter === ALL || d.category === ownerEntityFilter;
      });
    }
    // ownerTypeFilter === ALL (or unset): show everything

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((d) =>
        [
          d.fileName,
          d.notes,
          d.category,
          ownerLabel(d, projects, machines),
          ...(d.tags ?? []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    const sorted = [...list];
    if (sortKey === "name")
      sorted.sort((a, b) => a.fileName.localeCompare(b.fileName));
    else if (sortKey === "modified")
      sorted.sort((a, b) => b.updatedAt - a.updatedAt);
    else sorted.sort((a, b) => b.uploadedAt - a.uploadedAt);
    return sorted;
  }, [
    drawings,
    links,
    focused,
    ownerTypeFilter,
    ownerEntityFilter,
    search,
    sortKey,
    projects,
    machines,
  ]);

  // Both focused (Project/Machine tab) and unfocused (Global Repository)
  // usages render a Master → Work Drawing tree; unfocused additionally
  // groups roots by owner since it spans many unrelated owners at once.
  const forest = useMemo(() => buildDrawingForest(visible), [visible]);
  const groupedForest = useMemo(() => {
    if (focused) return null;
    const groups = new Map<string, typeof forest>();
    for (const node of forest) {
      const label = ownerLabel(node.drawing, projects, machines);
      const bucket = groups.get(label);
      if (bucket) bucket.push(node);
      else groups.set(label, [node]);
    }
    return [...groups.entries()];
  }, [focused, forest, projects, machines]);

  const handleOwnerTypeFilterChange = (value: string) => {
    setOwnerTypeFilter(value);
    setOwnerEntityFilter(ALL);
    onOwnerFilterChange?.(value, "");
  };
  const handleOwnerEntityFilterChange = (value: string) => {
    setOwnerEntityFilter(value);
    onOwnerFilterChange?.(ownerTypeFilter, value);
  };

  // The owner a new upload should be tagged with, if the current
  // focus/filter already fully resolves to one — otherwise the Upload
  // dialog asks explicitly.
  const resolvedUploadOwner = (): {
    type: OwnerType;
    id?: string;
    category?: LibraryCategory;
  } | null => {
    if (focused) return { type: focused.type, id: focused.id };
    if (ownerTypeFilter === "project" && ownerEntityFilter !== ALL)
      return { type: "project", id: ownerEntityFilter };
    if (ownerTypeFilter === "machine" && ownerEntityFilter !== ALL)
      return { type: "machine", id: ownerEntityFilter };
    if (ownerTypeFilter === "library" && ownerEntityFilter !== ALL)
      return {
        type: "library",
        category: ownerEntityFilter as LibraryCategory,
      };
    return null;
  };

  const handleFileChosen = (file: File) => {
    const resolved = resolvedUploadOwner();
    if (resolved) {
      onUpload(file, resolved.type, resolved.id, resolved.category);
      return;
    }
    setPendingFile(file);
    setUploadOwnerType("");
    setUploadOwnerId("");
    setUploadCategory("");
  };

  const confirmUpload = async () => {
    if (!pendingFile || !uploadOwnerType) return;
    if (uploadOwnerType === "library") {
      if (!uploadCategory) return;
      await onUpload(
        pendingFile,
        "library",
        undefined,
        uploadCategory as LibraryCategory,
      );
    } else {
      if (!uploadOwnerId) return;
      await onUpload(
        pendingFile,
        uploadOwnerType as OwnerType,
        uploadOwnerId,
        undefined,
      );
    }
    setPendingFile(null);
  };

  const openRename = (d: DrawingDocument) => {
    setRenameTarget(d);
    setRenameValue(d.fileName);
  };
  const confirmRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    await onRename(renameTarget, renameValue.trim());
    setRenameTarget(null);
  };

  const openOwnerDialog = (d: DrawingDocument) => {
    const owner = effectiveOwner(d);
    setOwnerTarget(d);
    setOwnerDialogType(owner.type ?? "");
    setOwnerDialogId(owner.type !== "library" ? (owner.id ?? "") : "");
    setOwnerDialogCategory(owner.type === "library" ? (d.category ?? "") : "");
  };
  const confirmOwnerChange = async () => {
    if (!ownerTarget || !ownerDialogType) return;
    if (ownerDialogType === "library") {
      if (!ownerDialogCategory) return;
      await onChangeOwner(
        ownerTarget,
        "library",
        undefined,
        ownerDialogCategory as LibraryCategory,
      );
    } else {
      if (!ownerDialogId) return;
      await onChangeOwner(
        ownerTarget,
        ownerDialogType as OwnerType,
        ownerDialogId,
        undefined,
      );
    }
    setOwnerTarget(null);
  };

  const handleDuplicate = async (d: DrawingDocument) => {
    const copy = await onDuplicate(d);
    openRename(copy);
  };

  const openLinkDialog = (d: DrawingDocument) => {
    setLinkTarget(d);
    setLinkType("project");
    setLinkEntityId("");
  };
  const currentLinksFor = (drawingId: string) =>
    links.filter((l) => l.drawingId === drawingId);
  const linkEntityOptions = (
    type: DrawingLink["linkedType"],
  ): ProjectOption[] => {
    if (type === "project") return projects;
    if (type === "machine") return machines;
    if (type === "vendor") return vendors;
    return customers;
  };
  const linkEntityLabel = (l: DrawingLink) =>
    linkEntityOptions(l.linkedType).find((o) => o.id === l.linkedId)?.label ??
    l.linkedId;

  const confirmAddLink = async () => {
    if (!linkTarget || !linkEntityId) return;
    await onAddLink(linkTarget, linkType, linkEntityId);
    setLinkEntityId("");
  };

  return (
    <div className="space-y-4" data-ocid="drawing_editor.drawings_list">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search drawings…"
            className="pl-8 h-8 text-sm"
            data-ocid="drawing_editor.list.search_input"
          />
        </div>

        {!focused && (
          <>
            <Select
              value={ownerTypeFilter}
              onValueChange={handleOwnerTypeFilterChange}
            >
              <SelectTrigger
                className="h-8 text-sm w-[160px] overflow-hidden"
                data-ocid="drawing_editor.list.owner_type_filter"
              >
                <SelectValue className="truncate" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All Owner Types</SelectItem>
                <SelectItem value="project">Project</SelectItem>
                <SelectItem value="machine">Machine</SelectItem>
                <SelectItem value="library">Repository</SelectItem>
                <SelectItem value={UNASSIGNED}>No Owner</SelectItem>
              </SelectContent>
            </Select>

            {(ownerTypeFilter === "project" ||
              ownerTypeFilter === "machine" ||
              ownerTypeFilter === "library") && (
              <Select
                value={ownerEntityFilter}
                onValueChange={handleOwnerEntityFilterChange}
              >
                <SelectTrigger
                  className="h-8 text-sm w-[200px] overflow-hidden"
                  data-ocid="drawing_editor.list.owner_entity_filter"
                >
                  <SelectValue className="truncate" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>
                    {ownerTypeFilter === "library" ? "All Categories" : "All"}
                  </SelectItem>
                  {ownerTypeFilter === "project" &&
                    projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  {ownerTypeFilter === "machine" &&
                    machines.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  {ownerTypeFilter === "library" &&
                    LIBRARY_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </>
        )}

        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger
            className="h-8 text-sm w-[150px]"
            data-ocid="drawing_editor.list.sort_select"
          >
            <ArrowUpDown className="w-3.5 h-3.5 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="uploaded">Upload date</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="modified">Last modified</SelectItem>
          </SelectContent>
        </Select>

        <Button
          type="button"
          size="sm"
          className="h-8 text-xs gap-1"
          onClick={() => fileInputRef.current?.click()}
          data-ocid="drawing_editor.list.upload_button"
        >
          <Plus className="w-3.5 h-3.5" /> Upload Drawing
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) handleFileChosen(file);
          }}
          data-ocid="drawing_editor.list.upload_input"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="text-xs font-semibold">File</TableHead>
              <TableHead className="text-xs font-semibold">Pages</TableHead>
              <TableHead className="text-xs font-semibold">
                Uploaded By
              </TableHead>
              <TableHead className="text-xs font-semibold">Uploaded</TableHead>
              <TableHead className="w-56" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {focused
              ? forest.map((node) => (
                  <DrawingTreeRow
                    key={node.drawing.id}
                    node={node}
                    depth={0}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    onOpen={onOpen}
                    openLabel={openLabel}
                    onRename={openRename}
                    onLink={openLinkDialog}
                    onDuplicate={handleDuplicate}
                    onChangeOwner={openOwnerDialog}
                    onDelete={onDelete}
                    onPreview={onPreview}
                    onPreviewOriginal={onPreviewOriginal}
                    onPrint={onPrint}
                    previewLabel={previewLabel}
                    showOriginalBadges={!focused}
                    workingDrawingOriginalIds={workingDrawingOriginalIds}
                  />
                ))
              : groupedForest?.map(([label, roots]) => (
                  <Fragment key={label}>
                    <TableRow className="bg-muted/30">
                      <TableCell
                        colSpan={5}
                        className="text-xs font-semibold py-1.5"
                      >
                        {label}
                      </TableCell>
                    </TableRow>
                    {roots.map((node) => (
                      <DrawingTreeRow
                        key={node.drawing.id}
                        node={node}
                        depth={0}
                        canEdit={canEdit}
                        canDelete={canDelete}
                        onOpen={onOpen}
                        openLabel={openLabel}
                        onRename={openRename}
                        onLink={openLinkDialog}
                        onDuplicate={handleDuplicate}
                        onChangeOwner={openOwnerDialog}
                        onDelete={onDelete}
                        onPreview={onPreview}
                        onPreviewOriginal={onPreviewOriginal}
                        onPrint={onPrint}
                        previewLabel={previewLabel}
                        showOriginalBadges={!focused}
                        workingDrawingOriginalIds={workingDrawingOriginalIds}
                      />
                    ))}
                  </Fragment>
                ))}
            {(focused
              ? forest.length === 0
              : (groupedForest?.length ?? 0) === 0) && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-10 text-sm text-muted-foreground"
                  data-ocid="drawing_editor.list.empty_state"
                >
                  {drawings.length === 0
                    ? "No drawings yet — upload a PDF to get started."
                    : "No drawings match your search/filter."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Upload — requires an owner when not already scoped to one */}
      <Dialog
        open={!!pendingFile}
        onOpenChange={(o) => !o && setPendingFile(null)}
      >
        <DialogContent data-ocid="drawing_editor.upload_dialog">
          <DialogHeader>
            <DialogTitle>Upload Drawing</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">{pendingFile?.name}</p>
            <div className="space-y-1">
              <Label className="text-xs">
                Owner Type <span className="text-destructive">*</span>
              </Label>
              <Select
                value={uploadOwnerType}
                onValueChange={(v) => {
                  setUploadOwnerType(v);
                  setUploadOwnerId("");
                  setUploadCategory("");
                }}
              >
                <SelectTrigger
                  className="h-8 text-sm"
                  data-ocid="drawing_editor.upload_dialog.owner_type_select"
                >
                  <SelectValue placeholder="Select owner type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="machine">Machine</SelectItem>
                  <SelectItem value="library">Repository</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(uploadOwnerType === "project" ||
              uploadOwnerType === "machine") && (
              <div className="space-y-1">
                <Label className="text-xs">
                  {uploadOwnerType === "project" ? "Project" : "Machine"}{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Select value={uploadOwnerId} onValueChange={setUploadOwnerId}>
                  <SelectTrigger
                    className="h-8 text-sm"
                    data-ocid="drawing_editor.upload_dialog.owner_id_select"
                  >
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {(uploadOwnerType === "project" ? projects : machines).map(
                      (o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
            {uploadOwnerType === "library" && (
              <div className="space-y-1">
                <Label className="text-xs">
                  Category <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={uploadCategory}
                  onValueChange={setUploadCategory}
                >
                  <SelectTrigger
                    className="h-8 text-sm"
                    data-ocid="drawing_editor.upload_dialog.category_select"
                  >
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {LIBRARY_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPendingFile(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={
                !uploadOwnerType ||
                (uploadOwnerType === "library"
                  ? !uploadCategory
                  : !uploadOwnerId)
              }
              onClick={confirmUpload}
              data-ocid="drawing_editor.upload_dialog.submit_button"
            >
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename */}
      <Dialog
        open={!!renameTarget}
        onOpenChange={(o) => !o && setRenameTarget(null)}
      >
        <DialogContent data-ocid="drawing_editor.rename_dialog">
          <DialogHeader>
            <DialogTitle>Rename Drawing</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 py-2">
            <Label className="text-xs">File name</Label>
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="h-8 text-sm"
              data-ocid="drawing_editor.rename_dialog.input"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRenameTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!renameValue.trim()}
              onClick={confirmRename}
              data-ocid="drawing_editor.rename_dialog.submit_button"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Owner */}
      <Dialog
        open={!!ownerTarget}
        onOpenChange={(o) => !o && setOwnerTarget(null)}
      >
        <DialogContent data-ocid="drawing_editor.owner_dialog">
          <DialogHeader>
            <DialogTitle>Change Owner…</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Owner Type</Label>
              <Select
                value={ownerDialogType}
                onValueChange={(v) => {
                  setOwnerDialogType(v);
                  setOwnerDialogId("");
                  setOwnerDialogCategory("");
                }}
              >
                <SelectTrigger
                  className="h-8 text-sm"
                  data-ocid="drawing_editor.owner_dialog.owner_type_select"
                >
                  <SelectValue placeholder="Select owner type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="machine">Machine</SelectItem>
                  <SelectItem value="library">Repository</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(ownerDialogType === "project" ||
              ownerDialogType === "machine") && (
              <div className="space-y-1">
                <Label className="text-xs">
                  {ownerDialogType === "project" ? "Project" : "Machine"}
                </Label>
                <Select value={ownerDialogId} onValueChange={setOwnerDialogId}>
                  <SelectTrigger
                    className="h-8 text-sm"
                    data-ocid="drawing_editor.owner_dialog.owner_id_select"
                  >
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {(ownerDialogType === "project" ? projects : machines).map(
                      (o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
            {ownerDialogType === "library" && (
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Select
                  value={ownerDialogCategory}
                  onValueChange={setOwnerDialogCategory}
                >
                  <SelectTrigger
                    className="h-8 text-sm"
                    data-ocid="drawing_editor.owner_dialog.category_select"
                  >
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {LIBRARY_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOwnerTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={
                !ownerDialogType ||
                (ownerDialogType === "library"
                  ? !ownerDialogCategory
                  : !ownerDialogId)
              }
              onClick={confirmOwnerChange}
              data-ocid="drawing_editor.owner_dialog.submit_button"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link to… (optional many-to-many references) */}
      <Dialog
        open={!!linkTarget}
        onOpenChange={(o) => !o && setLinkTarget(null)}
      >
        <DialogContent data-ocid="drawing_editor.link_dialog">
          <DialogHeader>
            <DialogTitle>Link "{linkTarget?.fileName}" to…</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {linkTarget && currentLinksFor(linkTarget.id).length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Current links</Label>
                <div className="space-y-1">
                  {currentLinksFor(linkTarget.id).map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center justify-between text-xs rounded border px-2 py-1"
                    >
                      <span>
                        {l.linkedType[0].toUpperCase() + l.linkedType.slice(1)}:{" "}
                        {linkEntityLabel(l)}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-5 w-5 p-0"
                        onClick={() => onRemoveLink(l.id)}
                        data-ocid={`drawing_editor.link_dialog.remove.${l.id}`}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-end gap-2">
              <div className="space-y-1 flex-1">
                <Label className="text-xs">Type</Label>
                <Select
                  value={linkType}
                  onValueChange={(v) => {
                    setLinkType(v as DrawingLink["linkedType"]);
                    setLinkEntityId("");
                  }}
                >
                  <SelectTrigger
                    className="h-8 text-sm"
                    data-ocid="drawing_editor.link_dialog.type_select"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="project">Project</SelectItem>
                    <SelectItem value="machine">Machine</SelectItem>
                    <SelectItem value="vendor">Vendor</SelectItem>
                    <SelectItem value="customer">Customer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 flex-1">
                <Label className="text-xs">Entity</Label>
                <Select value={linkEntityId} onValueChange={setLinkEntityId}>
                  <SelectTrigger
                    className="h-8 text-sm"
                    data-ocid="drawing_editor.link_dialog.entity_select"
                  >
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {linkEntityOptions(linkType).map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                size="sm"
                className="h-8"
                disabled={!linkEntityId}
                onClick={confirmAddLink}
                data-ocid="drawing_editor.link_dialog.add_button"
              >
                Add
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" size="sm" onClick={() => setLinkTarget(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const DRAWING_OWNER_FILTER_ALL = ALL;
export const DRAWING_OWNER_FILTER_UNASSIGNED = UNASSIGNED;
