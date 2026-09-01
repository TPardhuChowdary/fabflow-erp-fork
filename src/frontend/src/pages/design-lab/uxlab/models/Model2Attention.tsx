// MODEL 02 — Attention Queue (Exception-First)
// UX idea: the home screen shows ONLY what genuinely needs a human
// decision right now — computed live from real store state (blocked
// stages, overdue invoices, down machines, low stock, open high-
// severity NCRs, POs pending approval). Resolving the underlying cause
// via the shared workspace screens makes an item disappear from this
// list automatically — it's a real reactive queue, not a static list.
import { AlertTriangle, CheckCircle2, Menu } from "lucide-react";
import { useState } from "react";
import { ModuleRouter, type ViewKey } from "../shared/ModuleRouter";
import { FULL_MODULE_LIST } from "../shared/fullModuleList";
import { useUxLabStore } from "../store";

const BROWSE = FULL_MODULE_LIST;

export function Model2Attention() {
  const { attentionItems } = useUxLabStore();
  const [mode, setMode] = useState<"queue" | "browse" | "detail">("queue");
  const [detail, setDetail] = useState<{ view: ViewKey; id: string } | null>(
    null,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navigate = (view: string, id: string) => {
    setDetail({ view: view as ViewKey, id });
    setMode("detail");
  };

  return (
    <div className="flex h-full bg-gray-50 rounded-xl overflow-hidden border">
      <div
        className={`${drawerOpen ? "block" : "hidden"} md:block w-44 shrink-0 bg-white border-r p-3`}
      >
        <button
          type="button"
          onClick={() => {
            setMode("queue");
            setDrawerOpen(false);
          }}
          className={`w-full text-left px-2 py-1.5 text-xs rounded-lg mb-2 font-semibold ${mode === "queue" ? "bg-red-50 text-red-700" : "text-gray-600 hover:bg-gray-100"}`}
        >
          Attention ({attentionItems.length})
        </button>
        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1 px-1 mt-2">
          Browse everything
        </p>
        {BROWSE.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => {
              navigate(b.key, "");
              setDrawerOpen(false);
            }}
            className="w-full text-left px-2 py-1.5 text-xs rounded-lg hover:bg-gray-100 text-gray-600 mb-0.5"
          >
            {b.label}
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
          <span className="text-sm font-bold">FabFlow — Attention</span>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {mode === "detail" && detail ? (
            <ModuleRouter
              view={detail.view}
              id={detail.id}
              onNavigate={navigate}
            />
          ) : mode === "queue" ? (
            attentionItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                <p className="text-base font-bold text-gray-900">
                  Nothing needs you right now
                </p>
                <p className="text-xs text-gray-500">
                  Every blocked stage, overdue invoice, down machine, low-stock
                  item, and open NCR has been handled.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-w-xl">
                <h2 className="text-sm font-bold mb-2">
                  What needs your attention — {attentionItems.length}
                </h2>
                {attentionItems.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => navigate(a.navigateTo.view, a.navigateTo.id)}
                    className="w-full text-left flex items-start gap-3 p-3 rounded-lg border bg-white hover:shadow-sm"
                  >
                    <AlertTriangle
                      className={`w-4 h-4 shrink-0 mt-0.5 ${a.severity === "critical" ? "text-red-500" : "text-amber-500"}`}
                    />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">
                        {a.title}
                      </p>
                      <p className="text-xs text-gray-500">{a.detail}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5 uppercase font-semibold">
                        {a.module} · click to resolve →
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
