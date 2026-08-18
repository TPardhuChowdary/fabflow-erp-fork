// Phase 43 — checkbox multi-select popover (Invoice "+ Add Projects").
//
// Same Popover+Command foundation as searchable-select.tsx, but for
// picking N options at once instead of one. Modeled on the QMS
// Set<string> + Checkbox pattern already used for bulk-select
// (qms/pages/QualityCharacteristicLibrary.tsx +
// qms/components/CharacteristicTable.tsx) rather than overloading
// SearchableSelect's single-value contract, so its ~17 existing
// single-select callers are completely unaffected.
//
// Stateless from the caller's point of view: each open starts with an
// empty staged selection; confirming calls onConfirm(values) once and
// closes. The caller decides how to use the returned ids (e.g. Invoice
// fans them out into one line item per project, skipping any already
// present) - this component only ever reports "here are the ids the
// user checked," nothing more.

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { cn } from "@/lib/utils";
import { useState } from "react";

export interface MultiSelectOption {
  value: string;
  label: string;
  searchText?: string;
  /** Renders a small badge next to the label (e.g. "This Customer"). */
  badge?: string;
}

interface MultiSelectPopoverProps {
  options: MultiSelectOption[];
  onConfirm: (values: string[]) => void;
  triggerLabel?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  confirmLabel?: (count: number) => string;
  className?: string;
  disabled?: boolean;
  "data-ocid"?: string;
}

export function MultiSelectPopover({
  options,
  onConfirm,
  triggerLabel = "+ Add Items",
  searchPlaceholder = "Search…",
  emptyText = "No results found.",
  confirmLabel,
  className,
  disabled,
  ...rest
}: MultiSelectPopoverProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const trimmedSearch = search.trim().toLowerCase();
  const filtered = trimmedSearch
    ? options.filter((o) =>
        `${o.label} ${o.searchText ?? ""}`
          .toLowerCase()
          .includes(trimmedSearch),
      )
    : options;

  const toggle = (value: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });

  const reset = () => {
    setSearch("");
    setSelected(new Set());
  };

  const handleConfirm = () => {
    if (selected.size === 0) return;
    onConfirm(Array.from(selected));
    setOpen(false);
    reset();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn("h-7 text-xs", className)}
          {...rest}
        >
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            className="h-8 text-xs"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {filtered.length === 0 && (
              <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                {emptyText}
              </CommandEmpty>
            )}
            <CommandGroup>
              {filtered.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.value}
                  onSelect={() => toggle(o.value)}
                  className="text-xs gap-2"
                >
                  <Checkbox
                    checked={selected.has(o.value)}
                    onCheckedChange={() => toggle(o.value)}
                    className="shrink-0"
                  />
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.badge && (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {o.badge}
                    </Badge>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="flex items-center justify-between gap-2 border-t p-2">
          <span className="text-xs text-muted-foreground">
            {selected.size} selected
          </span>
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs"
            disabled={selected.size === 0}
            onClick={handleConfirm}
            data-ocid="multi_select_popover.confirm.button"
          >
            {confirmLabel
              ? confirmLabel(selected.size)
              : `Add ${selected.size} Selected`}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
