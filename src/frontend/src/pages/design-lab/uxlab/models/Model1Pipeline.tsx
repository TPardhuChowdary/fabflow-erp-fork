// MODEL 01 — Order Pipeline (Workflow-First)
// UX idea: the business process itself (Quote → Order → Production →
// Quality → Dispatch → Invoice → Payment) is the primary navigation —
// not module names. Selecting a pipeline stage shows every record
// currently at that stage across all customers; the dashboard IS the
// pipeline, not a separate summary of it.
import { AlertTriangle, ChevronRight, Menu } from "lucide-react";
import { useState } from "react";
import { StatusBadge } from "../primitives";
import { ModuleRouter, type ViewKey } from "../shared/ModuleRouter";
import { FULL_MODULE_LIST } from "../shared/fullModuleList";
import { useUxLabStore } from "../store";

const PIPELINE = [
  { key: "quotations" as const, label: "Quotation" },
  { key: "production" as const, label: "Production" },
  { key: "qms" as const, label: "Quality" },
  { key: "invoices" as const, label: "Invoice" },
];
const SECONDARY = FULL_MODULE_LIST;

export function Model1Pipeline() {
  const { data } = useUxLabStore();
  const [stage, setStage] = useState<
    (typeof PIPELINE)[number]["key"] | "detail"
  >("production");
  const [detail, setDetail] = useState<{ view: ViewKey; id: string } | null>(
    null,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navigate = (view: string, id: string) => {
    setDetail({ view: view as ViewKey, id });
    setStage("detail");
  };

  const stageCounts = (k: string) => {
    if (k === "quotations")
      return data.quotations.filter(
        (q) => q.status !== "Accepted" && q.status !== "Rejected",
      ).length;
    if (k === "production") return data.projects.length;
    if (k === "qms")
      return data.qmsIssues.filter((q) => q.status === "Open").length;
    if (k === "invoices")
      return data.invoices.filter((i) => i.amount > i.paidAmount).length;
    return 0;
  };

  return (
    <div className="flex h-full bg-gray-50 rounded-xl overflow-hidden border">
      <div
        className={`${drawerOpen ? "block" : "hidden"} md:block w-44 shrink-0 bg-white border-r p-3`}
      >
        <p className="text-[10px] font-bold text-gray-400 uppercase mb-2 px-1">
          Modules
        </p>
        {SECONDARY.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => {
              navigate(s.key, "");
              setDrawerOpen(false);
            }}
            className="w-full text-left px-2 py-1.5 text-xs rounded-lg hover:bg-gray-100 text-gray-600 mb-0.5"
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-white md:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label="Menu"
          >
            <Menu className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold">FabFlow — Pipeline</span>
        </div>
        {/* pipeline stepper */}
        <div className="flex items-center gap-1 px-4 py-3 bg-white border-b overflow-x-auto">
          {PIPELINE.map((p, i) => (
            <div key={p.key} className="flex items-center">
              <button
                type="button"
                onClick={() => {
                  setStage(p.key);
                  setDetail(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${stage === p.key ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}
              >
                {p.label}{" "}
                <span className="opacity-70">({stageCounts(p.key)})</span>
              </button>
              {i < PIPELINE.length - 1 && (
                <ChevronRight className="w-3.5 h-3.5 text-gray-300 mx-1" />
              )}
            </div>
          ))}
        </div>
        <div className="flex-1 overflow-auto p-5">
          {stage === "detail" && detail ? (
            <ModuleRouter
              view={detail.view}
              id={detail.id}
              onNavigate={navigate}
            />
          ) : stage === "production" ? (
            <div className="space-y-2">
              <h2 className="text-sm font-bold mb-2">
                Production — all active orders
              </h2>
              {data.projects.map((p) => {
                const stages = data.stages.filter((s) => s.projectId === p.id);
                const blocked = stages.find((s) => s.status === "Blocked");
                const cust = data.customers.find((c) => c.id === p.customerId);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => navigate("project", p.id)}
                    className="w-full text-left flex items-center justify-between p-3 rounded-lg border bg-white hover:shadow-sm"
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {p.no} — {cust?.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {stages.filter((s) => s.status === "Complete").length}/
                        {stages.length} stages complete
                      </p>
                    </div>
                    {blocked ? (
                      <span className="flex items-center gap-1 text-xs text-red-600 font-semibold">
                        <AlertTriangle className="w-3.5 h-3.5" /> Blocked
                      </span>
                    ) : (
                      <StatusBadge status="On track" tone="success" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : stage !== "detail" ? (
            <ModuleRouter view={stage} id="" onNavigate={navigate} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
