// UX Consolidation / Decision Lab — Final Dashboard.
//
// Demonstrates Blueprint §4.3 (see ../content.ts / ../UX_CONSOLIDATION.md).
// Reuses FinalPrototype.tsx's already-correct Attention Layer and Role
// Layer computations (real store.attentionItems, real role filtering) —
// this screen's only real change is the bottom zone: a bounded,
// recency-sorted Recent Projects panel and the Recent Quotations panel
// production has and the prototype's DashboardHome currently lacks
// (confirmed by reading that file directly during this pass, not
// assumed).
import { AlertTriangle, Bot, CheckCircle2 } from "lucide-react";
import { useMemo } from "react";
import { StatusBadge } from "../../primitives";
import type { ViewKey } from "../../shared/ModuleRouter";
import type { RoleDef } from "../../shared/roleAccess";
import { useUxLabStore } from "../../store";

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

const RECENT_LIMIT = 5;

export function FinalDashboard({
  role,
  navigate,
}: {
  role: RoleDef;
  navigate: (v: ViewKey, id: string) => void;
}) {
  const { data, attentionItems } = useUxLabStore();

  const totalValue = useMemo(
    () => data.projects.reduce((s, p) => s + p.value, 0),
    [data],
  );
  const received = useMemo(
    () => data.payments.reduce((s, p) => s + p.amount, 0),
    [data],
  );
  const roleAttention = useMemo(
    () =>
      role.id === "admin"
        ? attentionItems
        : attentionItems.filter((a) =>
            [...role.primary, ...role.secondary].some((k) =>
              a.module.toLowerCase().includes(k.replace("-", " ")),
            ),
          ),
    [attentionItems, role],
  );
  const critical = roleAttention.filter((a) => a.severity === "critical");

  // Fix from Blueprint §4.3: bounded to RECENT_LIMIT, actually sorted by
  // createdAt descending — the prototype's existing "Active projects"
  // list does neither today.
  const recentProjects = useMemo(
    () =>
      [...data.projects]
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, RECENT_LIMIT),
    [data.projects],
  );
  const recentQuotations = useMemo(
    () =>
      [...data.quotations]
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, RECENT_LIMIT),
    [data.quotations],
  );

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="rounded-xl border bg-white p-4 flex items-start gap-3">
        <Bot className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-sm leading-relaxed text-gray-800">
          Good morning, {role.label}. There
          {data.projects.length === 1 ? " is " : " are "}
          <strong>{data.projects.length} active project(s)</strong> worth ₹
          {totalValue.toLocaleString("en-IN")}, and ₹
          {received.toLocaleString("en-IN")} received so far.{" "}
          {critical.length > 0
            ? `${critical.length} item(s) in your area need urgent attention.`
            : "Nothing urgent in your area right now."}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Projects" value={data.projects.length} />
        <Kpi label="Quotations" value={data.quotations.length} />
        <Kpi
          label="Open NCRs"
          value={data.qmsIssues.filter((q) => q.status === "Open").length}
        />
        <Kpi
          label="Needs attention"
          value={roleAttention.length}
          tone={roleAttention.length > 0 ? "warning" : "success"}
        />
      </div>

      <div className="rounded-xl border bg-white p-4">
        <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> Needs your attention
        </h3>
        {roleAttention.length === 0 ? (
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> All clear
            in your area.
          </p>
        ) : (
          <div className="space-y-1.5">
            {roleAttention.slice(0, 6).map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() =>
                  navigate(a.navigateTo.view as ViewKey, a.navigateTo.id)
                }
                className="w-full text-left flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50 border-b last:border-0"
              >
                <AlertTriangle
                  className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${a.severity === "critical" ? "text-red-500" : "text-amber-500"}`}
                />
                <div>
                  <p className="text-xs font-semibold text-gray-900">
                    {a.title}
                  </p>
                  <p className="text-[11px] text-gray-500">{a.detail}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Blueprint §4.3 fix: bounded + recency-sorted, plus the missing
          Recent Quotations equivalent — production has both, the
          prototype's existing dashboard had neither done right. */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-gray-500 uppercase">
              Recent Projects
            </h3>
            <button
              type="button"
              onClick={() => navigate("projects", "")}
              className="text-[11px] font-semibold text-blue-600"
            >
              View all →
            </button>
          </div>
          <div className="space-y-1.5">
            {recentProjects.map((p) => {
              const cust = data.customers.find((c) => c.id === p.customerId);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => navigate("project", p.id)}
                  className="w-full text-left flex justify-between items-center text-xs py-1.5 border-b last:border-0"
                >
                  <span>
                    <span className="font-mono font-semibold">{p.no}</span>
                    <span className="text-gray-500 ml-2">{cust?.name}</span>
                  </span>
                  <StatusBadge status="Active" tone="success" />
                </button>
              );
            })}
          </div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-gray-500 uppercase">
              Recent Quotations
            </h3>
            <button
              type="button"
              onClick={() => navigate("quotations", "")}
              className="text-[11px] font-semibold text-blue-600"
            >
              View all →
            </button>
          </div>
          <div className="space-y-1.5">
            {recentQuotations.map((q) => {
              const cust = data.customers.find((c) => c.id === q.customerId);
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => navigate("quotations", "")}
                  className="w-full text-left flex justify-between items-center text-xs py-1.5 border-b last:border-0"
                >
                  <span>
                    <span className="font-mono font-semibold">{q.no}</span>
                    <span className="text-gray-500 ml-2">{cust?.name}</span>
                  </span>
                  <StatusBadge
                    status={q.status}
                    tone={
                      q.status === "Accepted"
                        ? "success"
                        : q.status === "Rejected"
                          ? "danger"
                          : "neutral"
                    }
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
