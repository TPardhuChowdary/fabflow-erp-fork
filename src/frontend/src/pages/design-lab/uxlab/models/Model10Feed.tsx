// MODEL 10 — Activity Feed (Activity-Driven UX)
// UX idea: different from Model 02's exception-only queue — this shows
// EVERYTHING happening across the business, good and bad, as one
// reverse-chronological feed (Zeigarnik/Peak-End: unresolved items stay
// visually "open" in the feed until acted on, resolved ones settle into
// quiet history — nothing is filtered away, just visually de-emphasized).
import { AlertTriangle, CheckCircle2, Menu, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { StatusBadge, useConfirm, useToast } from "../primitives";
import { ModuleRouter, type ViewKey } from "../shared/ModuleRouter";
import { FULL_MODULE_LIST } from "../shared/fullModuleList";
import { useUxLabStore } from "../store";

interface FeedItem {
  id: string;
  when: string;
  text: string;
  open: boolean;
  view: ViewKey;
  targetId: string;
  resolve?: () => void;
}

export function Model10Feed() {
  const { data, attentionItems, resolveQms, approvePO } = useUxLabStore();
  const confirm = useConfirm();
  const toast = useToast();
  const [detail, setDetail] = useState<{ v: ViewKey; id: string } | null>(null);
  const [browse, setBrowse] = useState<ViewKey | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const feed: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = [];
    for (const p of data.payments)
      items.push({
        id: `pay-${p.id}`,
        when: p.date,
        text: `Payment of ₹${p.amount.toLocaleString("en-IN")} received`,
        open: false,
        view: "payments",
        targetId: "",
      });
    for (const dc of data.deliveryChallans)
      items.push({
        id: `dc-${dc.id}`,
        when: dc.dispatchedAt,
        text: `${dc.no} dispatched — ${dc.qty} units`,
        open: false,
        view: "project",
        targetId: dc.projectId,
      });
    for (const po of data.purchaseOrders)
      if (po.status === "Confirmed")
        items.push({
          id: `po-${po.id}`,
          when: "2026-08-20",
          text: `${po.no} confirmed by vendor`,
          open: false,
          view: "po",
          targetId: po.id,
        });
    for (const a of attentionItems) {
      const q = data.qmsIssues.find((x) => `qms-${x.id}` === a.id);
      const po = data.purchaseOrders.find((x) => `po-${x.id}` === a.id);
      items.push({
        id: a.id,
        when: "2026-08-29",
        text: a.title,
        open: true,
        view: a.navigateTo.view as ViewKey,
        targetId: a.navigateTo.id,
        resolve: q
          ? () => resolveQms(q.id)
          : po
            ? () => approvePO(po.id)
            : undefined,
      });
    }
    return items.sort((x, y) =>
      x.open === y.open ? y.when.localeCompare(x.when) : x.open ? -1 : 1,
    );
  }, [data, attentionItems, resolveQms, approvePO]);

  const handleResolve = async (item: FeedItem) => {
    if (!item.resolve) return;
    const ok = await confirm("Handle this?", item.text);
    if (!ok) return;
    item.resolve();
    toast("Marked handled");
  };

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
          <TrendingUp className="w-4 h-4 text-gray-500" />{" "}
          <span className="text-sm font-bold">FabFlow — Activity</span>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {detail ? (
            <div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="text-xs font-semibold text-blue-600 mb-3"
              >
                ← Back to feed
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
                ← Back to feed
              </button>
              <ModuleRouter
                view={browse}
                id=""
                onNavigate={(v, id) => setDetail({ v: v as ViewKey, id })}
              />
            </div>
          ) : (
            <div className="max-w-xl space-y-2">
              {feed.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${item.open ? "bg-white" : "bg-gray-50 opacity-70"}`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      item.targetId &&
                      setDetail({ v: item.view, id: item.targetId })
                    }
                    className="text-left flex items-start gap-2 flex-1"
                  >
                    {item.open ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                    )}
                    <div>
                      <p className="text-sm text-gray-900">{item.text}</p>
                      <p className="text-[10px] text-gray-400">{item.when}</p>
                    </div>
                  </button>
                  {item.open && item.resolve && (
                    <button
                      type="button"
                      onClick={() => handleResolve(item)}
                      className="text-xs font-semibold text-emerald-600 shrink-0"
                    >
                      Handle
                    </button>
                  )}
                  {item.open && !item.resolve && (
                    <StatusBadge status="open" tone="warning" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
