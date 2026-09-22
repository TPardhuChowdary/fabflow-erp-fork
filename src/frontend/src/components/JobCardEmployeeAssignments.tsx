// Multiple Job Card Employees — Option A: simple roster (see chat,
// "Employee Architecture Review" — approved). This remains ONE Job
// Card; job_cards.employee_id and the Job Card's own timer
// (active_seconds/current_run_started_at/status) are untouched and stay
// the sole authoritative elapsed-time source. If labour-minutes are
// shown they are derived here (elapsed x assignee count), never stored,
// and always labeled "Employee-Minutes" — never hours.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmployeeSelect } from "@/components/EmployeeSelect";
import { X } from "lucide-react";
import {
  addJobCardEmployeeAssignmentRemote,
  fetchJobCardEmployeeAssignments,
  removeJobCardEmployeeAssignmentRemote,
  type JobCardEmployeeAssignment,
} from "@/lib/jobCardEmployeeAssignmentsApi";
import { useStore } from "@/store";

interface Props {
  jobCardId: string;
  activeSeconds: number;
  canEdit: boolean;
}

export function JobCardEmployeeAssignments({
  jobCardId,
  activeSeconds,
  canEdit,
}: Props) {
  const { employees } = useStore();
  const [assignments, setAssignments] = useState<
    JobCardEmployeeAssignment[] | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [addingEmployeeId, setAddingEmployeeId] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const result = await fetchJobCardEmployeeAssignments(jobCardId);
    setLoading(false);
    if (result.status === "success" && result.data) {
      setAssignments(result.data);
    } else if (result.status !== "unauthenticated") {
      toast.error(result.error ?? "Could not load employee assignments");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobCardId]);

  const handleAdd = async () => {
    if (!addingEmployeeId) {
      toast.error("Select an employee");
      return;
    }
    if (assignments?.some((a) => a.employeeId === addingEmployeeId)) {
      toast.error("This employee is already assigned to this Job Card");
      return;
    }
    const employee = employees.find((e) => e.id === addingEmployeeId);
    if (!employee) return;
    setSaving(true);
    const result = await addJobCardEmployeeAssignmentRemote(
      jobCardId,
      addingEmployeeId,
      employee.name,
    );
    setSaving(false);
    if (result.status !== "success" || !result.data) {
      toast.error(result.error ?? "Could not add employee");
      return;
    }
    setAssignments((prev) => [...(prev ?? []), result.data!]);
    setAddingEmployeeId("");
    toast.success(`${employee.name} added to this Job Card`);
  };

  const handleRemove = async (assignment: JobCardEmployeeAssignment) => {
    setRemovingId(assignment.id);
    const result = await removeJobCardEmployeeAssignmentRemote(
      assignment.id,
    );
    setRemovingId(null);
    if (result.status !== "success") {
      toast.error(result.error ?? "Could not remove employee");
      return;
    }
    setAssignments((prev) =>
      (prev ?? []).filter((a) => a.id !== assignment.id),
    );
    toast.success(`${assignment.employeeName} removed`);
  };

  const elapsedMinutes = Math.round(activeSeconds / 60);
  const count = assignments?.length ?? 0;
  const employeeMinutes = elapsedMinutes * count;

  return (
    <div
      className="rounded-md border p-2.5 space-y-2"
      data-ocid={`jobcards.view.employees.${jobCardId}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Employees
        </p>
        {count > 0 && (
          <p className="text-[10px] text-muted-foreground">
            Job Duration: {elapsedMinutes} min · Employees: {count} · Labour:{" "}
            {employeeMinutes} Employee-Minutes
          </p>
        )}
      </div>

      {loading && (
        <p className="text-xs text-muted-foreground">Loading…</p>
      )}

      {!loading && (
        <div className="flex flex-wrap gap-1.5">
          {(assignments ?? []).map((a) => (
            <Badge
              key={a.id}
              variant="outline"
              className="text-xs gap-1 pr-1"
              data-ocid={`jobcards.view.employees.${jobCardId}.assignment.${a.id}`}
            >
              {a.employeeName}
              {canEdit && (
                <button
                  type="button"
                  className="rounded-full hover:bg-destructive/10 p-0.5 disabled:opacity-40"
                  disabled={removingId === a.id}
                  onClick={() => handleRemove(a)}
                  data-ocid={`jobcards.view.employees.${jobCardId}.assignment.${a.id}.remove`}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </Badge>
          ))}
          {!loading && count === 0 && (
            <p className="text-xs text-muted-foreground">
              No additional employees assigned yet.
            </p>
          )}
        </div>
      )}

      {canEdit && (
        <div className="flex items-center gap-2">
          <EmployeeSelect
            value={addingEmployeeId}
            onChange={setAddingEmployeeId}
            placeholder="Add employee"
            className="h-8 text-xs flex-1"
            data-ocid={`jobcards.view.employees.${jobCardId}.select`}
          />
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={saving || !addingEmployeeId}
            onClick={handleAdd}
            data-ocid={`jobcards.view.employees.${jobCardId}.add`}
          >
            + Add
          </Button>
        </div>
      )}
    </div>
  );
}
