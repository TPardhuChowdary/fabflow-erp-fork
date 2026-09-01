// ERP Design Exploration — assembles one concept's shell + dashboard +
// a functional projects table + record detail drawer + command palette
// + AI panel into one interactive preview. Fully isolated: no imports
// from the real app's shared components/tokens, no live business data.
import { X } from "lucide-react";
import { useState } from "react";
import type { Concept } from "./concepts";
import { dashboardRegistry } from "./dashboards";
import { projects } from "./data";
import {
  AiAskPanel,
  Btn,
  Chip,
  CommandPalette,
  Panel,
  useThemeHelpers,
} from "./pieces";
import { ConceptShell } from "./shells";

export function ExplorationRuntime({ concept }: { concept: Concept }) {
  const t = concept.theme;
  const { card } = useThemeHelpers(t);
  const [activeNav, setActiveNav] = useState("dashboard");
  const [commandOpen, setCommandOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<
    (typeof projects)[number] | null
  >(null);

  const DashboardBody = dashboardRegistry[concept.dashboard];

  return (
    <div
      className="overflow-hidden"
      style={{
        fontFamily: t.fontBody,
        color: t.text,
        border: `${t.borderWidth} solid ${t.border}`,
        borderRadius: t.radius,
        minHeight: "620px",
      }}
    >
      <ConceptShell
        concept={concept}
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        onOpenCommand={() => setCommandOpen(true)}
      >
        {activeNav === "dashboard" && (
          <div>
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div>
                <h1
                  style={{
                    fontFamily: t.fontDisplay,
                    fontWeight: t.fontWeightDisplay,
                    fontSize: "20px",
                    color: t.text,
                  }}
                >
                  {concept.dashboard === "editorial-timeline"
                    ? ""
                    : "Operations"}
                </h1>
              </div>
              <div className="flex gap-2">
                <Btn t={t} onClick={() => setActiveNav("projects")}>
                  + New Project
                </Btn>
                <Btn
                  t={t}
                  variant="outline"
                  onClick={() => setCommandOpen(true)}
                >
                  Ask AI
                </Btn>
              </div>
            </div>
            <DashboardBody concept={concept} />
          </div>
        )}

        {activeNav === "projects" && (
          <Panel t={t} title={`Projects (${projects.length})`}>
            <ProjectRowsClickable
              concept={concept}
              onSelect={setSelectedProject}
            />
          </Panel>
        )}

        {activeNav !== "dashboard" && activeNav !== "projects" && (
          <Panel
            t={t}
            title={activeNav.charAt(0).toUpperCase() + activeNav.slice(1)}
          >
            <p className="text-xs" style={{ color: t.textMuted }}>
              This module isn't built out in the exploration sandbox — Dashboard
              and Projects demonstrate each concept's full interaction model;
              the same nav/dashboard/table/detail patterns apply consistently
              across every other module.
            </p>
          </Panel>
        )}
      </ConceptShell>

      <CommandPalette
        t={t}
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
      />

      {selectedProject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-end"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={() => setSelectedProject(null)}
          onKeyDown={(e) => e.key === "Escape" && setSelectedProject(null)}
          aria-hidden="true"
        >
          <div
            className="h-full w-full max-w-md p-5 overflow-auto"
            style={{ ...card, borderRadius: 0, background: t.surface }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2
                style={{
                  fontFamily: t.fontDisplay,
                  fontWeight: t.fontWeightDisplay,
                  fontSize: "18px",
                }}
              >
                {selectedProject.no}
              </h2>
              <button
                type="button"
                onClick={() => setSelectedProject(null)}
                aria-label="Close"
              >
                <X className="w-4 h-4" style={{ color: t.textMuted }} />
              </button>
            </div>
            <p className="text-sm font-semibold" style={{ color: t.text }}>
              {selectedProject.name}
            </p>
            <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>
              {selectedProject.customer}
            </p>
            <div className="flex gap-2 mt-3">
              <Chip t={t} tone={selectedProject.health}>
                {selectedProject.status}
              </Chip>
              <Chip t={t} tone="watch">
                {selectedProject.stage}
              </Chip>
            </div>
            <div
              className="mt-4 space-y-1.5 text-xs"
              style={{ color: t.textMuted }}
            >
              <p>Quantity: {selectedProject.qty} units</p>
              <p>Value: ₹{selectedProject.value.toLocaleString("en-IN")}</p>
              <p>
                {selectedProject.dueIn < 0
                  ? `${Math.abs(selectedProject.dueIn)} days overdue`
                  : `Due in ${selectedProject.dueIn} days`}
              </p>
            </div>
            <div className="mt-5">
              <AiAskPanel t={t} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectRowsClickable({
  concept,
  onSelect,
}: { concept: Concept; onSelect: (p: (typeof projects)[number]) => void }) {
  const t = concept.theme;
  const [sortDesc, setSortDesc] = useState(true);
  const rows = [...projects].sort((a, b) =>
    sortDesc ? b.value - a.value : a.value - b.value,
  );
  return (
    <div>
      <div className="flex justify-end mb-2">
        <button
          type="button"
          className="text-[11px] font-semibold"
          style={{ color: t.accent }}
          onClick={() => setSortDesc((v) => !v)}
        >
          Sort by value {sortDesc ? "↓" : "↑"}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: t.textMuted }}>
              {["Project", "Customer", "Value", "Status", ""].map((h) => (
                <th key={h} className="text-left font-semibold pb-1.5 pr-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.no}
                style={{ borderTop: `${t.borderWidth} solid ${t.border}` }}
              >
                <td
                  className="py-2 pr-3 font-mono font-semibold"
                  style={{ color: t.text }}
                >
                  {r.no}
                </td>
                <td className="py-2 pr-3" style={{ color: t.text }}>
                  {r.customer}
                </td>
                <td className="py-2 pr-3" style={{ color: t.text }}>
                  ₹{r.value.toLocaleString("en-IN")}
                </td>
                <td className="py-2 pr-3">
                  <Chip t={t} tone={r.health}>
                    {r.status}
                  </Chip>
                </td>
                <td className="py-2">
                  <button
                    type="button"
                    className="text-xs font-semibold"
                    style={{ color: t.accent }}
                    onClick={() => onSelect(r)}
                  >
                    View →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
