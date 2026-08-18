// Phase 43 (master scope §36-38) — searchable Employee picker, same
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

export function EmployeeSelect({
  value,
  onChange,
  placeholder = "Select employee",
  className,
  ...rest
}: Props) {
  const { employees } = useStore();

  const options = (employees || []).map((e) => ({
    value: e.id,
    label: e.name,
    searchText: `${e.designation ?? ""} ${e.phone ?? ""} ${e.employeeCode ?? ""}`,
  }));

  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder="Search by name, designation, or phone…"
      emptyText="No employees found."
      className={className}
      {...rest}
    />
  );
}
