// Phase 43 (master scope §36-38) — generalized searchable combobox.
//
// Same Popover+Command foundation as components/ProjectSelect.tsx (the
// one proven searchable-picker pattern already in the app), factored
// out into a reusable component so every large-entity picker (Projects,
// Vendors, Customers, Employees, Machines, ...) can share it instead of
// a plain <Select> that renders every option unfiltered.
//
// Two modes:
//   - id-based (default): value/onChange carry an option's `value`
//     (e.g. an entity id). Selecting an option is the only way to
//     change the value - matches every existing plain-Select picker's
//     semantics exactly, just with search added.
//   - creatable: value/onChange carry the raw text itself (e.g.
//     Quotation Description). `options` are suggestions only - typing
//     anything and confirming keeps it as free text verbatim, never
//     forced onto one of the suggested options. This is the fix for
//     §32/§33 - Quotation Description was previously a forced project
//     picker; here the project-name list is offered as suggestions
//     while arbitrary text stays fully valid.
//
// Popover content renders in a portal (Radix) with collision-aware
// positioning already built in, so it stays viewport-safe near screen/
// dialog edges without any extra work here. CommandList already caps
// itself at max-h-[300px] with its own scroll (components/ui/command.tsx),
// so large lists never overflow the page.

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
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

export interface SearchableSelectOption {
  value: string;
  label: string;
  /** Extra text to match against search, in addition to label (e.g. a
   * code, a customer name, an internal order code). */
  searchText?: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  contentClassName?: string;
  /** Free-text mode: the typed search text itself is a valid, savable
   * value - options are suggestions only, never a closed catalog. */
  creatable?: boolean;
  /** Label shown on the "use my own text" row when creatable and the
   * typed text has no exact match among options. %s is replaced with
   * the typed text. */
  createLabel?: (text: string) => string;
  disabled?: boolean;
  renderOption?: (option: SearchableSelectOption) => React.ReactNode;
  "data-ocid"?: string;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No results found.",
  className,
  contentClassName,
  creatable = false,
  createLabel,
  disabled,
  renderOption,
  ...rest
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = options.find((o) => o.value === value);
  const displayLabel = selected
    ? selected.label
    : creatable && value
      ? value
      : "";

  const trimmedSearch = search.trim();
  const filtered = trimmedSearch
    ? options.filter((o) =>
        `${o.label} ${o.searchText ?? ""}`
          .toLowerCase()
          .includes(trimmedSearch.toLowerCase()),
      )
    : options;
  const hasExactMatch = options.some(
    (o) => o.label.toLowerCase() === trimmedSearch.toLowerCase(),
  );
  const showCreateRow = creatable && trimmedSearch.length > 0 && !hasExactMatch;

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("h-8 text-sm justify-between font-normal", className)}
          {...rest}
        >
          <span className="truncate">{displayLabel || placeholder}</span>
          <ChevronsUpDown className="w-3.5 h-3.5 ml-2 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-80 p-0", contentClassName)}
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            className="h-8 text-xs"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {filtered.length === 0 && !showCreateRow && (
              <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                {emptyText}
              </CommandEmpty>
            )}
            <CommandGroup>
              {filtered.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.value}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check
                    className={cn(
                      "w-3.5 h-3.5 mr-2 shrink-0",
                      value === o.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {renderOption ? (
                    renderOption(o)
                  ) : (
                    <span className="flex-1 truncate">{o.label}</span>
                  )}
                </CommandItem>
              ))}
              {showCreateRow && (
                <CommandItem
                  value={`__create__:${trimmedSearch}`}
                  onSelect={() => {
                    onChange(trimmedSearch);
                    setOpen(false);
                  }}
                  className="text-xs italic text-muted-foreground"
                >
                  {createLabel
                    ? createLabel(trimmedSearch)
                    : `Use "${trimmedSearch}"`}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
