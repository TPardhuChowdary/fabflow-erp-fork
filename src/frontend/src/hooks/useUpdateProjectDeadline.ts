// Shared "Update Deadline" persistence — used by both the Projects list
// and Production pages so the save-and-log behavior exists exactly once,
// rather than each page re-implementing the same re-attach/activity-log
// pattern slightly differently. Reuses the existing project-update path
// (updateProjectRemote, same one every other project field edit already
// goes through) and the existing activity-log RPC (addProjectActivity) —
// no new storage, no new permission, no silently-changed deadline: the
// new date always comes from the caller's own explicit user choice.
import { toast } from "sonner";
import { useAuth } from "../AuthContext";
import { updateProjectRemote } from "../lib/projectsApi";
import { canEdit } from "../permissions";
import { useStore } from "../store";
import type { Project } from "../types";

export function useUpdateProjectDeadline() {
  const { currentUser } = useAuth();
  const { updateProject, addProjectActivity } = useStore();
  const canEditProjects = canEdit(currentUser, "projects");

  const updateDeadline = async (project: Project, newDeadline: string) => {
    if (!canEditProjects) {
      toast.error("Access restricted: edit permission required");
      return;
    }
    const oldDeadline = project.customerCommittedDeliveryDate;
    const result = await updateProjectRemote({
      ...project,
      customerCommittedDeliveryDate: newDeadline,
    });
    if (result.status === "unauthenticated") {
      toast.error("Not signed in to the server - deadline was not saved");
      return;
    }
    if (result.status === "denied" || result.status === "error") {
      toast.error(result.error ?? "Could not update deadline");
      return;
    }
    if (!result.data) {
      toast.error("Could not update deadline");
      return;
    }
    // Same re-attach as Projects.tsx's handleEditSave / ProjectDetail.tsx's
    // handleSaveProjectDates - updateProjectRemote's returned row never
    // carries these local-only fields.
    updateProject({
      ...result.data,
      assignedEmployeeIds: project.assignedEmployeeIds,
      pos: project.pos,
      poNumber: project.poNumber,
      poDate: project.poDate,
      poFiles: project.poFiles,
    });
    void addProjectActivity(
      project.id,
      "deadline_updated",
      `Customer deadline updated from ${oldDeadline || "not set"} to ${newDeadline}`,
      currentUser?.username ?? "unknown",
    );
    toast.success("Deadline updated");
  };

  return { updateDeadline, canEditProjects };
}
