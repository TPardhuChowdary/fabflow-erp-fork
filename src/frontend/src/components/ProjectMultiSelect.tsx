// Unify Project Selection in Quotations & Invoices — shared "+ Add
// Projects" control. Sibling to ProjectSelect.tsx (the single-select
// combobox), but for picking multiple projects at once via the generic
// MultiSelectPopover.
//
// Ranking logic below (rankedProjectOptions) is moved verbatim from its
// original home inline in Invoices.tsx: projects belonging to the
// currently-selected customer are ranked first (badged "This
// Customer"), the rest follow. Re-derived on every render, so changing
// the customer automatically re-ranks the next time the popover opens —
// no extra state/effect needed. Deliberately does NOT filter
// already-added projects out of the list (matches the original Invoice
// behavior) — re-selecting one is simply a no-op on confirm, handled by
// the caller via lib/utils.ts's projectsNeedingNewLineItems.

import { MultiSelectPopover } from "@/components/ui/multi-select-popover";
import { getCustomerVisibleName } from "@/lib/utils";
import { useStore } from "@/store";
import type { Project } from "@/types";

function rankedProjectOptions(projects: Project[], customerId: string) {
  const own = customerId
    ? projects.filter((p) => p.customerId === customerId)
    : [];
  const rest = customerId
    ? projects.filter((p) => p.customerId !== customerId)
    : projects;
  return [
    ...own.map((p) => ({
      value: p.id,
      label: getCustomerVisibleName(p),
      searchText: p.projectNo,
      badge: "This Customer",
    })),
    ...rest.map((p) => ({
      value: p.id,
      label: getCustomerVisibleName(p),
      searchText: p.projectNo,
    })),
  ];
}

interface ProjectMultiSelectProps {
  customerId: string;
  /** Called once with the resolved Project objects the user checked and
   * confirmed. The caller decides how to turn these into line items,
   * since Quotation's and Invoice's line-item shapes differ. */
  onAdd: (projects: Project[]) => void;
  className?: string;
  disabled?: boolean;
  "data-ocid"?: string;
}

export function ProjectMultiSelect({
  customerId,
  onAdd,
  className,
  disabled,
  "data-ocid": dataOcid,
}: ProjectMultiSelectProps) {
  const { projects } = useStore();

  return (
    <MultiSelectPopover
      triggerLabel="+ Add Projects"
      searchPlaceholder="Search projects…"
      emptyText="No projects found."
      className={className}
      disabled={disabled}
      data-ocid={dataOcid}
      options={rankedProjectOptions(projects || [], customerId)}
      onConfirm={(ids) => {
        const selected = ids
          .map((id) => (projects || []).find((p) => p.id === id))
          .filter((p): p is Project => Boolean(p));
        if (selected.length === 0) return;
        onAdd(selected);
      }}
    />
  );
}
