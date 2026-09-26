// Family-aware inventory item picker — shared by both the Input Item and
// Output Item pickers in ProductionMaterialTransactions.tsx (Phase 3 of
// the Material Family work). Layers an optional Family filter + spec
// preview on top of the existing SearchableSelect; the value/onChange
// contract is unchanged (still a plain inventory_item.id) — this never
// touches the transaction API, schema, or stock behavior.
//
// Family filtering is convenience only, never mandatory: items with no
// materialFamilyId (e.g. MS SHEETS) are always selectable, and the
// currently selected item is always kept in the option list even if the
// active filter would otherwise exclude it (so the picker never appears
// to silently clear a selection when the filter changes).

import { useState } from "react";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { InventoryItem, MaterialFamily } from "@/types";

interface Props {
  value: string;
  onChange: (itemId: string) => void;
  items: InventoryItem[];
  families: MaterialFamily[];
  placeholder?: string;
  className?: string;
  "data-ocid"?: string;
}

export function InventoryItemPicker({
  value,
  onChange,
  items,
  families,
  placeholder,
  className,
  ...rest
}: Props) {
  const [familyFilter, setFamilyFilter] = useState<"all" | "none" | string>("all");

  const familyName = (id?: string) =>
    (id && families.find((f) => f.id === id)?.name) || null;

  const filteredItems = items.filter((item) => {
    if (item.id === value) return true;
    if (familyFilter === "all") return true;
    if (familyFilter === "none") return !item.materialFamilyId;
    return item.materialFamilyId === familyFilter;
  });

  const options: SearchableSelectOption[] = filteredItems.map((i) => ({
    value: i.id,
    label: i.name,
    searchText: i.name,
  }));

  const renderOption = (o: SearchableSelectOption) => {
    const item = items.find((i) => i.id === o.value);
    if (!item) return <span className="flex-1 truncate">{o.label}</span>;
    const family = familyName(item.materialFamilyId);
    const specs = item.specifications ? Object.entries(item.specifications) : [];
    const detail = [family, ...specs.map(([k, v]) => `${k}: ${v}`)]
      .filter(Boolean)
      .join(" · ");
    return (
      <div className="flex-1 min-w-0">
        <p className="truncate">{item.name}</p>
        <p className="truncate text-[10px] text-muted-foreground">
          {detail && `${detail} · `}Stock: {item.quantityAvailable} {item.unit}
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-1">
      <Select
        value={familyFilter}
        onValueChange={(v) => setFamilyFilter(v)}
      >
        <SelectTrigger className="h-6 text-[10px]">
          <SelectValue placeholder="Filter by family" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="text-xs">
            All Families
          </SelectItem>
          <SelectItem value="none" className="text-xs">
            No Family
          </SelectItem>
          {families.map((f) => (
            <SelectItem key={f.id} value={f.id} className="text-xs">
              {f.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <SearchableSelect
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
        className={className}
        renderOption={renderOption}
        {...rest}
      />
    </div>
  );
}
