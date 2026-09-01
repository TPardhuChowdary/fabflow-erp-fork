// MODEL 09 — AI Briefing (Proactive AI-First UX)
// UX idea: different from Model 04's reactive command bar — here the AI
// speaks FIRST, unprompted, generating a real narrative from live store
// state (not a canned string), with the specific numbers and record
// references woven into the prose as clickable inline links you drill
// through. You never have to ask "what needs attention" — it's already
// been told to you, Peak-End-style, as the very first thing you see.
import { Bot, Menu } from "lucide-react";
import { useMemo, useState } from "react";
import { ModuleRouter, type ViewKey } from "../shared/ModuleRouter";
import { FULL_MODULE_LIST } from "../shared/fullModuleList";
import { useUxLabStore } from "../store";

export function Model9Briefing() {
  const { data, attentionItems } = useUxLabStore();
  const [detail, setDetail] = useState<{ v: ViewKey; id: string } | null>(null);
  const [browse, setBrowse] = useState<ViewKey | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const critical = attentionItems.filter((a) => a.severity === "critical");
  const warnings = attentionItems.filter((a) => a.severity === "warning");
  const totalValue = useMemo(
    () => data.projects.reduce((s, p) => s + p.value, 0),
    [data],
  );
  const received = useMemo(
    () => data.payments.reduce((s, p) => s + p.amount, 0),
    [data],
  );

  const Link = ({
    item,
    children,
  }: { item: (typeof attentionItems)[number]; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={() =>
        setDetail({
          v: item.navigateTo.view as ViewKey,
          id: item.navigateTo.id,
        })
      }
      className="font-semibold text-blue-600 underline decoration-blue-300 underline-offset-2"
    >
      {children}
    </button>
  );

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
        <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-gray-900 text-white">
          <button
            type="button"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label="Menu"
            className="md:hidden"
          >
            <Menu className="w-4 h-4" />
          </button>
          <Bot className="w-4 h-4" />{" "}
          <span className="text-sm font-bold">FabFlow Briefing</span>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {detail ? (
            <div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="text-xs font-semibold text-blue-600 mb-3"
              >
                ← Back to briefing
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
                ← Back to briefing
              </button>
              <ModuleRouter
                view={browse}
                id=""
                onNavigate={(v, id) => setDetail({ v: v as ViewKey, id })}
              />
            </div>
          ) : (
            <div className="max-w-xl bg-white rounded-xl border p-6 space-y-3">
              <p className="text-sm leading-relaxed text-gray-800">
                Good morning. You have{" "}
                <strong>{data.projects.length} active projects</strong> worth ₹
                {totalValue.toLocaleString("en-IN")}, and ₹
                {received.toLocaleString("en-IN")} has come in so far.
                {critical.length > 0 ? (
                  <>
                    {" "}
                    {critical.length === 1
                      ? "There's one urgent thing"
                      : `There are ${critical.length} urgent things`}
                    :{" "}
                    {critical.map((c, i) => (
                      <span key={c.id}>
                        {i > 0 && (i === critical.length - 1 ? ", and " : ", ")}
                        <Link item={c}>{c.title.toLowerCase()}</Link>
                      </span>
                    ))}
                    .
                  </>
                ) : (
                  " Nothing urgent right now."
                )}
              </p>
              {warnings.length > 0 && (
                <p className="text-sm leading-relaxed text-gray-800">
                  Also worth knowing:{" "}
                  {warnings.map((w, i) => (
                    <span key={w.id}>
                      {i > 0 && (i === warnings.length - 1 ? ", and " : ", ")}
                      <Link item={w}>{w.title.toLowerCase()}</Link>
                    </span>
                  ))}
                  .
                </p>
              )}
              <p className="text-xs text-gray-400 pt-2 border-t">
                Every number above is computed live from the same store every
                other model reads — nothing here is a scripted string.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
