// Phase 43 — "Linked Drawing(s)" picker for Dies' mandatory Drawing
// Repository linkage. Built on the existing useDrawingEditorStore
// (drawings/links/addLink/removeLink) rather than a new data layer — the
// Drawing Repository stays the sole source of truth, this component only
// ever reads its already-loaded drawing list and writes to its existing
// drawing_links table via addLink/removeLink. "Die Drawing"/"Tooling"
// category rows are sorted first since those are what a die will
// realistically be linked to, but every drawing is selectable.
//
// Deliberately controlled, not self-persisting: the caller passes the
// currently-linked drawing ids and onAdd/onRemove callbacks. This lets
// Dies.tsx use the exact same component for both Edit (where linking is
// immediate — the die already exists) and Create (where linking must
// stay purely local/pending until the die itself is saved and gets an
// id — see Dies.tsx's handleSave).

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDrawingEditorStore } from "@/drawingEditor/store/useDrawingEditorStore";
import { FileText, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

const PRIORITY_CATEGORIES = new Set(["Die Drawing", "Tooling"]);

interface Props {
  linkedDrawingIds: string[];
  onAdd: (drawingId: string) => void;
  onRemove: (drawingId: string) => void;
  disabled?: boolean;
  "data-ocid"?: string;
}

export function DrawingLinkPicker({
  linkedDrawingIds,
  onAdd,
  onRemove,
  disabled,
  "data-ocid": dataOcid,
}: Props) {
  const { drawings, loaded, loadDrawings } = useDrawingEditorStore();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount
  useEffect(() => {
    if (!loaded) loadDrawings();
  }, [loaded]);

  const linkedSet = new Set(linkedDrawingIds);
  const available = (drawings || []).filter((d) => !linkedSet.has(d.id));

  const trimmedSearch = search.trim().toLowerCase();
  const filtered = (
    trimmedSearch
      ? available.filter((d) =>
          `${d.fileName} ${d.category ?? ""}`
            .toLowerCase()
            .includes(trimmedSearch),
        )
      : available
  ).sort((a, b) => {
    const aPriority = PRIORITY_CATEGORIES.has(a.category ?? "") ? 0 : 1;
    const bPriority = PRIORITY_CATEGORIES.has(b.category ?? "") ? 0 : 1;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return a.fileName.localeCompare(b.fileName);
  });

  const linkedDrawings = linkedDrawingIds
    .map((id) => (drawings || []).find((d) => d.id === id))
    .filter((d): d is NonNullable<typeof d> => !!d);

  return (
    <div className="space-y-2" data-ocid={dataOcid}>
      {linkedDrawings.length > 0 && (
        <div className="space-y-1">
          {linkedDrawings.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs"
              data-ocid={`${dataOcid}.linked_row`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{d.fileName}</span>
                {d.category && (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {d.category}
                  </Badge>
                )}
              </div>
              {!disabled && (
                <button
                  type="button"
                  className="shrink-0 p-0.5 rounded hover:bg-muted"
                  onClick={() => onRemove(d.id)}
                  title="Remove link"
                  data-ocid={`${dataOcid}.remove_button`}
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!disabled && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              data-ocid={`${dataOcid}.add_button`}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Link Drawing
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search drawings…"
                className="h-8 text-xs"
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                {filtered.length === 0 && (
                  <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                    No matching drawings in the Repository.
                  </CommandEmpty>
                )}
                <CommandGroup>
                  {filtered.map((d) => (
                    <CommandItem
                      key={d.id}
                      value={d.id}
                      onSelect={() => {
                        onAdd(d.id);
                        setOpen(false);
                        setSearch("");
                      }}
                      className="text-xs gap-2"
                    >
                      <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{d.fileName}</span>
                      {d.category && (
                        <Badge
                          variant="secondary"
                          className="shrink-0 text-[10px]"
                        >
                          {d.category}
                        </Badge>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
