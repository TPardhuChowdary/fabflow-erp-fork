import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CheckSquare, FolderPlus, Square, Star, X } from "lucide-react";
import { useState } from "react";
import type { QmsTemplate } from "../types";

interface Props {
  selectedCount: number;
  totalVisible: number;
  allVisibleSelected: boolean;
  onSelectAllVisible: () => void;
  onClearSelection: () => void;
  onSetStatus: (status: "Active" | "Obsolete") => void;
  onAddFavorites: () => void;
  templates: QmsTemplate[];
  onAddToTemplate: (templateId: string) => void;
  onCreateTemplateWithSelection: (name: string) => void;
}

export function BulkSelectToolbar({
  selectedCount,
  totalVisible,
  allVisibleSelected,
  onSelectAllVisible,
  onClearSelection,
  onSetStatus,
  onAddFavorites,
  templates,
  onAddToTemplate,
  onCreateTemplateWithSelection,
}: Props) {
  const [templatePopoverOpen, setTemplatePopoverOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");

  if (selectedCount === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-xs gap-1.5 px-2"
          onClick={onSelectAllVisible}
          disabled={totalVisible === 0}
          data-ocid="qms.bulk.select_all"
        >
          <Square className="w-3.5 h-3.5" />
          Select All ({totalVisible})
        </Button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2"
      data-ocid="qms.bulk.toolbar"
    >
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 text-xs gap-1.5 px-2"
        onClick={onSelectAllVisible}
        data-ocid="qms.bulk.select_all"
      >
        <CheckSquare className="w-3.5 h-3.5" />
        {allVisibleSelected
          ? "All Visible Selected"
          : `Select All (${totalVisible})`}
      </Button>

      <span className="text-xs font-medium">{selectedCount} selected</span>

      <div className="h-4 w-px bg-border" />

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        onClick={() => onSetStatus("Active")}
        data-ocid="qms.bulk.set_active"
      >
        Set Active
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        onClick={() => onSetStatus("Obsolete")}
        data-ocid="qms.bulk.set_obsolete"
      >
        Set Obsolete
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 text-xs gap-1.5"
        onClick={onAddFavorites}
        data-ocid="qms.bulk.add_favorites"
      >
        <Star className="w-3.5 h-3.5" />
        Add to Favorites
      </Button>

      <Popover open={templatePopoverOpen} onOpenChange={setTemplatePopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            data-ocid="qms.bulk.add_to_template"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            Add to Template
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandList>
              <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
                No templates yet.
              </CommandEmpty>
              <CommandGroup heading="Existing templates">
                {templates.map((t) => (
                  <CommandItem
                    key={t.id}
                    value={t.name}
                    onSelect={() => {
                      onAddToTemplate(t.id);
                      setTemplatePopoverOpen(false);
                    }}
                    className="text-xs"
                  >
                    {t.name}
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {t.characteristicIds.length} items
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            <div className="flex items-center gap-1 border-t p-2">
              <Input
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="New template name..."
                className="h-7 text-xs"
                data-ocid="qms.bulk.new_template_name"
              />
              <Button
                type="button"
                size="sm"
                className="h-7 text-xs shrink-0"
                disabled={!newTemplateName.trim()}
                onClick={() => {
                  onCreateTemplateWithSelection(newTemplateName.trim());
                  setNewTemplateName("");
                  setTemplatePopoverOpen(false);
                }}
                data-ocid="qms.bulk.create_template"
              >
                Create
              </Button>
            </div>
          </Command>
        </PopoverContent>
      </Popover>

      <div className="flex-1" />

      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 text-xs gap-1.5 px-2"
        onClick={onClearSelection}
        data-ocid="qms.bulk.clear_selection"
      >
        <X className="w-3.5 h-3.5" />
        Clear
      </Button>
    </div>
  );
}
