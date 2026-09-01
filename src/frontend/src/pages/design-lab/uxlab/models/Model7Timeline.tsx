// MODEL 07 — Timeline (Timeline-Native UX)
// UX idea: time is the primary axis of the whole ERP, not an
// afterthought field. Every dated real event (quotation raised, PO
// due, invoice due, delivery dispatched, inspection performed) is
// merged into one real chronological feed you scrub through — not a
// simulated illustration, an actual sort over live store dates.
import { Menu } from "lucide-react";
import { useMemo, useState } from "react";
import { StatusBadge } from "../primitives";
import { ModuleRouter, type ViewKey } from "../shared/ModuleRouter";
import { FULL_MODULE_LIST } from "../shared/fullModuleList";
import { useUxLabStore } from "../store";

interface Ev {
  date: string;
  label: string;
  kind: string;
  view: ViewKey;
  id: string;
  future: boolean;
}

export function Model7Timeline() {
  const { data } = useUxLabStore();
  const [detail, setDetail] = useState<{ v: ViewKey; id: string } | null>(null);
  const [browse, setBrowse] = useState<ViewKey | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const today = "2026-08-30";

  const events: Ev[] = useMemo(() => {
    const e: Ev[] = [];
    for (const q of data.quotations)
      e.push({
        date: q.createdAt,
        label: `${q.no} raised — ${q.item}`,
        kind: "Quotation",
        view: "quotations",
        id: "",
        future: q.createdAt > today,
      });
    for (const p of data.projects)
      e.push({
        date: p.createdAt,
        label: `${p.no} started`,
        kind: "Project",
        view: "project",
        id: p.id,
        future: p.createdAt > today,
      });
    for (const inv of data.invoices)
      e.push({
        date: inv.dueDate,
        label: `${inv.no} due — ₹${inv.amount.toLocaleString("en-IN")}`,
        kind: "Invoice",
        view: "project",
        id: inv.projectId,
        future: inv.dueDate > today,
      });
    for (const dc of data.deliveryChallans)
      e.push({
        date: dc.dispatchedAt,
        label: `${dc.no} dispatched (${dc.qty} units)`,
        kind: "Dispatch",
        view: "project",
        id: dc.projectId,
        future: dc.dispatchedAt > today,
      });
    for (const p of data.payments)
      e.push({
        date: p.date,
        label: `Payment received — ₹${p.amount.toLocaleString("en-IN")}`,
        kind: "Payment",
        view: "payments",
        id: "",
        future: p.date > today,
      });
    for (const insp of data.qmsInspections)
      e.push({
        date: insp.date,
        label: `${insp.characteristic} — ${insp.result}`,
        kind: "Inspection",
        view: "project",
        id: insp.projectId,
        future: insp.date > today,
      });
    return e.sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  return (
    <div className="flex h-full bg-gray-50 rounded-xl overflow-hidden border">
      <div
        className={`${drawerOpen ? "block" : "hidden"} md:block w-44 shrink-0 bg-white border-r p-3`}
      >
        <p className="text-[10px] font-bold text-gray-400 uppercase mb-2 px-1">
          All modules
        </p>
        {FULL_MODULE_LIST.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => {
              setBrowse(m.key);
              setDrawerOpen(false);
            }}
            className="w-full text-left px-2 py-1.5 text-xs rounded-lg hover:bg-gray-100 text-gray-600 mb-0.5"
          >
            {m.label}
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
          <span className="text-sm font-bold">FabFlow — Timeline</span>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {detail ? (
            <div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="text-xs font-semibold text-blue-600 mb-3"
              >
                ← Back to timeline
              </button>
              <ModuleRouter
                view={detail.v}
                id={detail.id}
                onNavigate={(v, id) => setDetail({ v: v as ViewKey, id })}
              />
            </div>
          ) : browse ? (
            <div>
              <button
                type="button"
                onClick={() => setBrowse(null)}
                className="text-xs font-semibold text-blue-600 mb-3"
              >
                ← Back to timeline
              </button>
              <ModuleRouter
                view={browse}
                id=""
                onNavigate={(v, id) => setDetail({ v: v as ViewKey, id })}
              />
            </div>
          ) : (
            <div className="max-w-2xl">
              {events.map((ev, i) => (
                <div key={`${ev.date}-${ev.label}-${i}`} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${ev.date === today ? "bg-blue-600" : ev.future ? "bg-gray-300" : "bg-gray-400"}`}
                    />
                    {i < events.length - 1 && (
                      <div className="w-px flex-1 bg-gray-200" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetail({ v: ev.view, id: ev.id })}
                    className="text-left pb-4 flex-1 hover:opacity-70"
                  >
                    <p className="text-[10px] font-semibold text-gray-400">
                      {ev.date}
                      {ev.date === today ? " · TODAY" : ""}
                    </p>
                    <p className="text-sm text-gray-900">{ev.label}</p>
                    <StatusBadge status={ev.kind} tone="neutral" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
