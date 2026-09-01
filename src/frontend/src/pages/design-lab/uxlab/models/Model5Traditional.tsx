// MODEL 05 — Simplified Traditional
// UX idea: no reinvention — a classic sidebar + table ERP shape, the
// most familiar mental model (Jakob's Law: users spend most of their
// time on other products, so a recognizable structure has near-zero
// learning cost). The redesign effort goes entirely into making the
// fundamentals actually work: every list is genuinely searchable and
// sortable, every record links to its real related records, forms
// validate for real. Minimal chrome, minimal cleverness, maximum
// reliability.
import { LayoutDashboard, Menu } from "lucide-react";
import { useState } from "react";
import { ModuleRouter, type ViewKey } from "../shared/ModuleRouter";
import { FULL_MODULE_LIST } from "../shared/fullModuleList";
import { useUxLabStore } from "../store";

const NAV: { key: ViewKey | "dashboard"; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  ...FULL_MODULE_LIST,
];

export function Model5Traditional() {
  const { data, attentionItems } = useUxLabStore();
  const [active, setActive] = useState<{
    v: ViewKey | "dashboard";
    id: string;
  }>({ v: "dashboard", id: "" });
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navigate = (v: string, id: string) =>
    setActive({ v: v as ViewKey, id });

  return (
    <div className="flex h-full bg-gray-50 rounded-xl overflow-hidden border">
      <div
        className={`${drawerOpen ? "block" : "hidden"} md:block w-48 shrink-0 bg-white border-r p-3`}
      >
        <p className="text-sm font-bold px-2 mb-2">FabFlow</p>
        {NAV.map((n) => (
          <button
            key={n.key}
            type="button"
            onClick={() => {
              setActive({ v: n.key, id: "" });
              setDrawerOpen(false);
            }}
            className={`w-full text-left px-2 py-1.5 text-xs rounded-lg mb-0.5 ${active.v === n.key ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}
          >
            {n.label}
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
          <span className="text-sm font-bold capitalize">{active.v}</span>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {active.v === "dashboard" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="Projects" value={data.projects.length} />
                <Kpi label="Quotations" value={data.quotations.length} />
                <Kpi
                  label="Open NCRs"
                  value={
                    data.qmsIssues.filter((q) => q.status === "Open").length
                  }
                />
                <Kpi
                  label="Needs attention"
                  value={attentionItems.length}
                  tone={attentionItems.length > 0 ? "warning" : "success"}
                />
              </div>
              <div className="rounded-xl border bg-white p-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-1.5">
                  <LayoutDashboard className="w-3.5 h-3.5" /> Active projects
                </h3>
                <div className="space-y-1.5">
                  {data.projects.map((p) => {
                    const cust = data.customers.find(
                      (c) => c.id === p.customerId,
                    );
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => navigate("project", p.id)}
                        className="w-full text-left flex justify-between text-xs py-1.5 border-b last:border-0"
                      >
                        <span className="font-mono font-semibold">{p.no}</span>
                        <span className="text-gray-500">{cust?.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <ModuleRouter
              view={active.v as ViewKey}
              id={active.id}
              onNavigate={navigate}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: { label: string; value: number; tone?: "warning" | "success" }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-[10px] font-semibold text-gray-500 uppercase">
        {label}
      </p>
      <p
        className={`text-2xl font-bold mt-1 ${tone === "warning" ? "text-amber-600" : tone === "success" ? "text-emerald-600" : "text-gray-900"}`}
      >
        {value}
      </p>
    </div>
  );
}
