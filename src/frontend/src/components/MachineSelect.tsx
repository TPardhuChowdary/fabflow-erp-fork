// Phase 43 (master scope §36-38) — searchable Machine picker, same
// shape as ProjectSelect.tsx.

import { SearchableSelect } from "@/components/ui/searchable-select";
import { useStore } from "@/store";

interface Props {
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
  "data-ocid"?: string;
}

export function MachineSelect({
  value,
  onChange,
  placeholder = "Select machine",
  className,
  ...rest
}: Props) {
  const { machines } = useStore();

  const options = (machines || []).map((m) => ({
    value: m.id,
    label: m.name,
    searchText: `${m.machineCode ?? ""} ${m.type ?? ""}`,
  }));

  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder="Search by name, code, or type…"
      emptyText="No machines found."
      className={className}
      {...rest}
    />
  );
}
