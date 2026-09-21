// Searchable Job Card picker (see chat, "correct the Continuation Job
// Card workflow") — same shape as EmployeeSelect.tsx. Used for the
// Continuation "Previous Job Card" field: a continuation Job Card
// points BACKWARD to a real, existing Job Card, selected here rather
// than typed as free text. Searches the already-hydrated jobCards store
// (itself loaded from Supabase — no separate fetch needed) by Job Card
// No., Project, Project Code, Operation, and Employee.

import { SearchableSelect } from "@/components/ui/searchable-select";
import { useStore } from "@/store";

interface Props {
  value: string;
  onChange: (id: string) => void;
  /** Excluded from the results — a Job Card can never be its own
   * previous Job Card. */
  excludeId?: string;
  placeholder?: string;
  className?: string;
  "data-ocid"?: string;
}

export function JobCardSelect({
  value,
  onChange,
  excludeId,
  placeholder = "Search Job Card...",
  className,
  ...rest
}: Props) {
  const { jobCards, projects } = useStore();

  const options = jobCards
    .filter((jc) => jc.id !== excludeId)
    .map((jc) => {
      const project = projects.find((p) => p.id === jc.projectId);
      const projectName = project?.projectName || "—";
      return {
        value: jc.id,
        label: `${jc.jobNo} — ${projectName} — ${jc.operationType}`,
        searchText: `${project?.projectNo ?? ""} ${jc.employeeName ?? ""}`,
      };
    });

  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder="Search by Job No, project, operation, employee…"
      emptyText="No Job Cards found."
      className={className}
      {...rest}
    />
  );
}
