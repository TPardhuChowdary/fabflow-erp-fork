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
import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { cn, getCustomerVisibleName, getProjectSearchText } from "../lib/utils";
import { useStore } from "../store";

interface Props {
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
}

export function ProjectSelect({
  value,
  onChange,
  placeholder = "Select project",
  className,
}: Props) {
  const { projects } = useStore();
  const [open, setOpen] = useState(false);
  const selected = projects.find((p) => p.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-8 text-sm justify-between font-normal", className)}
        >
          <span className="truncate">
            {selected ? (
              <>
                {getCustomerVisibleName(selected)}
                {selected.internalOrderCode && (
                  <span className="ml-1.5 text-xs text-muted-foreground font-mono">
                    · {selected.internalOrderCode}
                  </span>
                )}
              </>
            ) : (
              placeholder
            )}
          </span>
          <ChevronsUpDown className="w-3.5 h-3.5 ml-2 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command
          filter={(id, search) => {
            const p = projects.find((x) => x.id === id);
            if (!p) return 0;
            const text = getProjectSearchText(p);
            return text.includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput
            placeholder="Search by name, code, or ORD-..."
            className="h-8 text-xs"
          />
          <CommandList>
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
              No projects found.
            </CommandEmpty>
            <CommandGroup>
              {(projects || []).map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.id}
                  onSelect={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check
                    className={cn(
                      "w-3.5 h-3.5 mr-2 shrink-0",
                      value === p.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="font-mono text-muted-foreground mr-2 shrink-0">
                    {p.projectNo}
                  </span>
                  <span className="flex-1 truncate">
                    {getCustomerVisibleName(p)}
                  </span>
                  {p.internalOrderCode && (
                    <span className="ml-1.5 font-mono text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded shrink-0">
                      {p.internalOrderCode}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
