// MODEL 03 — Workspace (Context-First)
// UX idea: you don't "go to Production" or "go to Invoices" — you open
// a Project or Customer WORKSPACE and everything related is already
// there, cross-linked (real foreign-key lookups via the shared
// ProjectWorkspace). A persistent "recent" rail keeps context switches
// cheap — the audit's called-out weakness (no cross-module linking) is
// the thing this model exists to fix.
import { Building2, Clock, Menu } from "lucide-react";
import { useState } from "react";
import { ModuleRouter, type ViewKey } from "../shared/ModuleRouter";
import { FULL_MODULE_LIST } from "../shared/fullModuleList";
import { useUxLabStore } from "../store";

const OTHER = FULL_MODULE_LIST;

export function Model3Workspace() {
  const { data } = useUxLabStore();
  const [recent, setRecent] = useState<
    { view: ViewKey; id: string; label: string }[]
  >([]);
  const [active, setActive] = useState<{ view: ViewKey; id: string } | null>(
    null,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  const open = (view: string, id: string, label?: string) => {
    const v = view as ViewKey;
    setActive({ view: v, id });
    if (label)
      setRecent((r) =>
        [
          { view: v, id, label },
          ...r.filter((x) => !(x.view === v && x.id === id)),
        ].slice(0, 6),
      );
    setDrawerOpen(false);
  };

  return (
    <div className="flex h-full bg-gray-50 rounded-xl overflow-hidden border">
      <div
        className={`${drawerOpen ? "block" : "hidden"} md:block w-52 shrink-0 bg-white border-r p-3`}
      >
        <p className="text-[10px] font-bold text-gray-400 uppercase mb-2 px-1">
          Open a workspace
        </p>
        {data.projects.map((p) => {
          const cust = data.customers.find((c) => c.id === p.customerId);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => open("project", p.id, `${p.no}`)}
              className="w-full text-left flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg hover:bg-gray-100 text-gray-700 mb-0.5"
            >
              <Building2 className="w-3.5 h-3.5 text-gray-400" /> {p.no} —{" "}
              {cust?.name}
            </button>
          );
        })}
        <p className="text-[10px] font-bold text-gray-400 uppercase mb-2 px-1 mt-3">
          Customer workspaces
        </p>
        {data.customers.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => open("customer", c.id, c.name)}
            className="w-full text-left flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg hover:bg-gray-100 text-gray-700 mb-0.5"
          >
            <Building2 className="w-3.5 h-3.5 text-gray-400" /> {c.name}
          </button>
        ))}
        <p className="text-[10px] font-bold text-gray-400 uppercase mb-2 px-1 mt-3">
          Other
        </p>
        {OTHER.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => open(o.key, "")}
            className="w-full text-left px-2 py-1.5 text-xs rounded-lg hover:bg-gray-100 text-gray-600 mb-0.5"
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-white">
          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label="Menu"
            className="md:hidden"
          >
            <Menu className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold hidden md:inline">
            FabFlow — Workspaces
          </span>
          {recent.length > 0 && (
            <div className="flex items-center gap-1.5 ml-auto overflow-x-auto">
              <Clock className="w-3 h-3 text-gray-400 shrink-0" />
              {recent.map((r) => (
                <button
                  key={`${r.view}-${r.id}`}
                  type="button"
                  onClick={() => open(r.view, r.id, r.label)}
                  className="text-[11px] px-2 py-1 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap hover:bg-gray-200"
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-auto p-5">
          {active ? (
            <ModuleRouter
              view={active.view}
              id={active.id}
              onNavigate={(v, id) => open(v, id, id ? undefined : undefined)}
            />
          ) : (
            <div className="max-w-md mx-auto text-center py-16">
              <p className="text-sm text-gray-500">
                Select a project or customer from the left to open its full
                workspace — quotation, production, quality, invoice and payments
                all in one connected view.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
