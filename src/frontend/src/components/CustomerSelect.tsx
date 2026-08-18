// Phase 43 (master scope §36-38) — searchable Customer picker, same
// shape as ProjectSelect.tsx. Replaces a plain <Select> everywhere a
// customer must be chosen from the full customer list.

import { SearchableSelect } from "@/components/ui/searchable-select";
import { useStore } from "@/store";

interface Props {
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "data-ocid"?: string;
}

export function CustomerSelect({
  value,
  onChange,
  placeholder = "Select customer",
  className,
  disabled,
  ...rest
}: Props) {
  const { customers } = useStore();

  const options = (customers || []).map((c) => ({
    value: c.id,
    label: c.name,
    searchText: `${c.contactPerson ?? ""} ${c.phone ?? ""} ${c.gstin ?? ""}`,
  }));

  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder="Search by name, contact, phone, or GSTIN…"
      emptyText="No customers found."
      className={className}
      disabled={disabled}
      {...rest}
    />
  );
}
