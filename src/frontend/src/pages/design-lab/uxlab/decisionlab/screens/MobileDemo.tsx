// UX Consolidation / Decision Lab — mobile behavior demo.
//
// Blueprint §4.4: neither production nor the prototype has solved this
// (production has one narrow mobile card layout, Projects list only;
// the prototype has had zero responsive testing this whole session).
// This makes the target pattern concrete on one real screen — the
// Project Workspace, chosen because "check on an order" is exactly the
// kind of task done from a phone on a shop floor — using real store
// data inside a fixed-width device frame, not a claim that responsive
// behavior is now implemented app-wide.
import { AlertTriangle, Home, LayoutGrid, Menu, User } from "lucide-react";
import { StatusBadge } from "../../primitives";
import { useUxLabStore } from "../../store";

export function MobileDemo({ projectId }: { projectId: string }) {
  const { projectContext, data } = useUxLabStore();
  const { project, customer, stages, inspections } = projectContext(projectId);
  if (!project)
    return <p className="text-sm text-gray-500">Project not found.</p>;

  const dispatchedQty = data.deliveryChallans.reduce(
    (sum, dc) =>
      sum +
      (dc.projectEntries.find((e) => e.projectId === projectId)?.dispatchQty ??
        0),
    0,
  );

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-xs text-gray-500 max-w-md text-center">
        375px device frame around the real Project Workspace data — sidebar
        collapses to a bottom tab bar, KPIs stack to one column, section
        jump-links become a horizontal scroll strip, per Blueprint §4.4.
      </p>
      <div className="w-[375px] h-[680px] rounded-[28px] border-4 border-gray-800 overflow-hidden shadow-xl flex flex-col bg-gray-50">
        {/* Top bar — hamburger replaces the full sidebar below ~768px */}
        <div className="flex items-center justify-between px-3 py-2.5 bg-white border-b shrink-0">
          <Menu className="w-4 h-4 text-gray-700" />
          <span className="text-xs font-bold">{project.no}</span>
          <User className="w-4 h-4 text-gray-400" />
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <div>
            <h1 className="text-sm font-bold text-gray-900">{project.name}</h1>
            <p className="text-[11px] text-gray-500">
              {customer?.name} · {project.qty} units
            </p>
          </div>

          {/* KPIs stack single-column on mobile instead of a 3-up grid */}
          <div className="space-y-1.5">
            <div className="rounded-lg bg-white border p-2 flex items-center justify-between">
              <span className="text-[10px] text-gray-500 uppercase">
                Total Qty
              </span>
              <span className="text-sm font-bold">{project.qty}</span>
            </div>
            <div className="rounded-lg bg-white border p-2 flex items-center justify-between">
              <span className="text-[10px] text-gray-500 uppercase">
                Dispatched
              </span>
              <span className="text-sm font-bold">{dispatchedQty}</span>
            </div>
            <div className="rounded-lg bg-white border p-2 flex items-center justify-between">
              <span className="text-[10px] text-gray-500 uppercase">
                Remaining
              </span>
              <span className="text-sm font-bold text-emerald-600">
                {project.qty - dispatchedQty}
              </span>
            </div>
          </div>

          {/* Section anchors as a horizontal scroll strip, not a wrapped row */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-3 px-3">
            {["Planning", "Materials", "Execution", "Closure"].map((s) => (
              <span
                key={s}
                className="shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full border bg-white text-gray-600 whitespace-nowrap"
              >
                {s}
              </span>
            ))}
          </div>

          <div className="rounded-lg bg-white border p-2.5">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase mb-1.5">
              Production
            </h3>
            <div className="space-y-1">
              {stages.slice(0, 3).map((s, i) => (
                <div
                  key={`${s.stageName}-${i}`}
                  className="flex items-center justify-between text-[11px]"
                >
                  <span>
                    {i + 1}. {s.stageName}
                  </span>
                  <StatusBadge
                    status={s.status}
                    tone={
                      s.status === "Completed"
                        ? "success"
                        : s.status === "InProgress"
                          ? "warning"
                          : "neutral"
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          {inspections.length > 0 && (
            <div className="rounded-lg bg-white border p-2.5">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase mb-1.5 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Quality
              </h3>
              {inspections.slice(0, 2).map((q) => (
                <div
                  key={q.id}
                  className="flex items-center justify-between text-[11px]"
                >
                  <span>{q.processName}</span>
                  <StatusBadge
                    status={q.status}
                    tone={
                      q.status === "Passed"
                        ? "success"
                        : q.status === "Failed"
                          ? "danger"
                          : "warning"
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom tab bar — replaces the sidebar entirely below ~768px */}
        <div className="flex items-center justify-around border-t bg-white py-2 shrink-0">
          <div className="flex flex-col items-center gap-0.5 text-blue-600">
            <Home className="w-4 h-4" />
            <span className="text-[9px] font-semibold">Home</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 text-gray-400">
            <LayoutGrid className="w-4 h-4" />
            <span className="text-[9px]">Projects</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 text-gray-400">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-[9px]">Alerts</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 text-gray-400">
            <Menu className="w-4 h-4" />
            <span className="text-[9px]">More</span>
          </div>
        </div>
      </div>
    </div>
  );
}
