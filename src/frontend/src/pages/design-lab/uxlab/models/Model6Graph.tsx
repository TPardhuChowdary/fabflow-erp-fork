// MODEL 06 — Relationship Graph (Relationship-Driven UX)
// UX idea: records are nodes in a real connected graph, not rows in
// separate tables. Customer → Quotation → Project → PO/Invoice are
// drawn as literal connected columns, using the SAME real foreign keys
// as every other model — but here the CONNECTION itself is the primary
// visual object, not a byproduct of clicking into a workspace.
import { Menu } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { ModuleRouter, type ViewKey } from "../shared/ModuleRouter";
import { FULL_MODULE_LIST } from "../shared/fullModuleList";
import { useUxLabStore } from "../store";

interface Node {
  id: string;
  col: number;
  label: string;
  sub: string;
  view: ViewKey;
  targetId: string;
}

export function Model6Graph() {
  const { data } = useUxLabStore();
  const [detail, setDetail] = useState<{ v: ViewKey; id: string } | null>(null);
  const [browse, setBrowse] = useState<ViewKey | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const nodes: Node[] = useMemo(() => {
    const n: Node[] = [];
    for (const c of data.customers)
      n.push({
        id: `c-${c.id}`,
        col: 0,
        label: c.name,
        sub: "Customer",
        view: "customer",
        targetId: c.id,
      });
    for (const q of data.quotations)
      n.push({
        id: `q-${q.id}`,
        col: 1,
        label: q.no,
        sub: q.item.slice(0, 22),
        view: "quotations",
        targetId: "",
      });
    for (const p of data.projects)
      n.push({
        id: `p-${p.id}`,
        col: 2,
        label: p.no,
        sub: "Project",
        view: "project",
        targetId: p.id,
      });
    for (const po of data.purchaseOrders)
      n.push({
        id: `po-${po.id}`,
        col: 3,
        label: po.no,
        sub: "Purchase Order",
        view: "po",
        targetId: po.id,
      });
    for (const inv of data.invoices)
      n.push({
        id: `i-${inv.id}`,
        col: 3,
        label: inv.no,
        sub: "Invoice",
        view: "project",
        targetId: inv.projectId,
      });
    return n;
  }, [data]);

  const edges = useMemo(() => {
    const e: { from: string; to: string }[] = [];
    for (const q of data.quotations)
      e.push({ from: `c-${q.customerId}`, to: `q-${q.id}` });
    for (const p of data.projects)
      if (p.quotationId)
        e.push({ from: `q-${p.quotationId}`, to: `p-${p.id}` });
    for (const po of data.purchaseOrders)
      if (po.projectId)
        e.push({ from: `p-${po.projectId}`, to: `po-${po.id}` });
    for (const inv of data.invoices)
      e.push({ from: `p-${inv.projectId}`, to: `i-${inv.id}` });
    return e;
  }, [data]);

  const cols = [0, 1, 2, 3];
  const colLabels = ["Customers", "Quotations", "Projects", "POs / Invoices"];

  const nodePos = (id: string) => {
    const idx = nodes
      .filter((n) => n.col === nodes.find((x) => x.id === id)?.col)
      .findIndex((n) => n.id === id);
    const node = nodes.find((n) => n.id === id);
    if (!node) return { x: 0, y: 0 };
    return { x: node.col * 190 + 90, y: idx * 64 + 40 };
  };

  const openNode = (n: Node) => setDetail({ v: n.view, id: n.targetId });

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
          <span className="text-sm font-bold">
            FabFlow — Relationship Graph
          </span>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {detail ? (
            <div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="text-xs font-semibold text-blue-600 mb-3"
              >
                ← Back to graph
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
                ← Back to graph
              </button>
              <ModuleRouter
                view={browse}
                id=""
                onNavigate={(v, id) => setDetail({ v: v as ViewKey, id })}
              />
            </div>
          ) : (
            <div
              ref={containerRef}
              className="relative"
              style={{ minWidth: "720px", minHeight: "420px" }}
            >
              <div className="flex gap-0 mb-4">
                {colLabels.map((l) => (
                  <div
                    key={l}
                    style={{ width: 190 }}
                    className="text-[10px] font-bold text-gray-400 uppercase"
                  >
                    {l}
                  </div>
                ))}
              </div>
              <svg
                className="absolute inset-0 pointer-events-none"
                style={{ top: 24 }}
                width="800"
                height="400"
                role="img"
                aria-label="Lines connecting related records across customers, quotations, projects, and purchase orders"
              >
                {edges.map((e) => {
                  const a = nodePos(e.from);
                  const b = nodePos(e.to);
                  return (
                    <line
                      key={`${e.from}-${e.to}`}
                      x1={a.x + 70}
                      y1={a.y + 16}
                      x2={b.x - 10}
                      y2={b.y + 16}
                      stroke="#cbd5e1"
                      strokeWidth={1.5}
                    />
                  );
                })}
              </svg>
              <div className="relative flex" style={{ top: 24 }}>
                {cols.map((col) => (
                  <div key={col} style={{ width: 190 }} className="space-y-2">
                    {nodes
                      .filter((n) => n.col === col)
                      .map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => openNode(n)}
                          className="w-full text-left px-2.5 py-2 rounded-lg border bg-white hover:shadow-sm hover:border-blue-400"
                          style={{ maxWidth: 170 }}
                        >
                          <p className="text-xs font-semibold text-blue-600 truncate">
                            {n.label}
                          </p>
                          <p className="text-[10px] text-gray-500 truncate">
                            {n.sub}
                          </p>
                        </button>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
