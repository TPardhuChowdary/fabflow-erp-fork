// Phase 43 (master scope §36-38) — searchable Customer picker, same
// shape as ProjectSelect.tsx. Replaces a plain <Select> everywhere a
// customer must be chosen from the full customer list.

import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { isCustomerProfileComplete } from "@/lib/customersApi";
import { useStore } from "@/store";

interface Props {
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Master ERP Architecture — "Add Project without a complete customer
   * profile" — renders a persistent "+ Add Customer" row when supplied.
   * The caller owns what "add" means (e.g. opening
   * QuickAddCustomerDialog) and is responsible for calling onChange
   * itself once the new customer actually exists; omitted everywhere
   * else, so every other CustomerSelect usage is unaffected. */
  onAddNew?: () => void;
  "data-ocid"?: string;
}

export function CustomerSelect({
  value,
  onChange,
  placeholder = "Select customer",
  className,
  disabled,
  onAddNew,
  ...rest
}: Props) {
  const { customers } = useStore();

  const options = (customers || []).map((c) => ({
    value: c.id,
    label: c.name,
    searchText: `${c.contactPerson ?? ""} ${c.phone ?? ""} ${c.gstin ?? ""}`,
    // Carried through only for renderOption below — SearchableSelect's
    // own filtering/matching still runs on label/searchText alone.
    complete: isCustomerProfileComplete(c),
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
      onCreateNew={onAddNew}
      createNewLabel="+ Add Customer"
      renderOption={(o) => (
        <span className="flex flex-1 items-center justify-between gap-2 min-w-0">
          <span className="truncate">{o.label}</span>
          {!(o as { complete?: boolean }).complete && (
            <Badge
              variant="outline"
              className="text-[10px] shrink-0 bg-warning/10 text-warning border-warning/30"
            >
              Profile Pending
            </Badge>
          )}
        </span>
      )}
      {...rest}
    />
  );
}
