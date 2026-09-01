// ERP Design Exploration — SET A dashboard bodies (practical directions).
// Each is a genuinely distinct information architecture, not a reskin —
// see concepts.ts's `dashboardModel` field for the reasoning behind each.
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CreditCard,
  FileText,
  Package,
  Receipt,
  Star,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { Concept } from "../concepts";
import { attentionItems, machines, projects } from "../data";
import { Btn, Chip, Panel } from "../pieces";

type P = { concept: Concept };

// a1 — Calm Precision: KPI row + a quiet "what changed" strip.
export function KpiFocusDashboard({ concept }: P) {
  const t = concept.theme;
  const kpis = [
    { label: "Total Projects", value: "11", icon: FileText },
    { label: "Active Quotations", value: "6", icon: Package },
    { label: "Pending Invoices", value: "4", icon: Receipt },
    { label: "Total Received", value: "₹5,00,000", icon: CreditCard },
  ];
  return (
    <div className="space-y-4">
      <Panel t={t} title="Since yesterday">
        <div
          className="flex flex-wrap gap-4 text-xs"
          style={{ color: t.textMuted }}
        >
          <span>2 projects moved forward a stage</span>
          <span>·</span>
          <span>1 invoice paid (₹93,200)</span>
          <span>·</span>
          <span>1 new quotation sent</span>
        </div>
      </Panel>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Panel key={k.label} t={t}>
            <p
              className="text-[10px] font-semibold"
              style={{ color: t.textMuted }}
            >
              {k.label.toUpperCase()}
            </p>
            <div className="flex items-center justify-between mt-1">
              <p
                style={{
                  fontFamily: t.fontDisplay,
                  fontWeight: t.fontWeightDisplay,
                  fontSize: "22px",
                  color: t.text,
                }}
              >
                {k.value}
              </p>
              <k.icon className="w-4 h-4" style={{ color: t.accent }} />
            </div>
          </Panel>
        ))}
      </div>
      <Panel t={t} title="Recent Projects">
        <ProjectRows concept={concept} rows={projects.slice(0, 4)} />
      </Panel>
    </div>
  );
}

// a2 — Dense Operations: many small multiples, numbers-first.
export function DenseGridDashboard({ concept }: P) {
  const t = concept.theme;
  const cells = [
    { label: "Projects", value: "11", trend: "+2", up: true },
    { label: "Quotations", value: "6", trend: "+1", up: true },
    { label: "POs Open", value: "4", trend: "0", up: true },
    { label: "Invoices Due", value: "4", trend: "-1", up: false },
    { label: "Machines Down", value: "1", trend: "+1", up: false },
    { label: "Low Stock", value: "1", trend: "0", up: true },
    { label: "QMS Flags", value: "2", trend: "+1", up: false },
    { label: "Utilization", value: "76%", trend: "+3%", up: true },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
        {cells.map((c) => (
          <div
            key={c.label}
            className="p-2.5"
            style={{
              background: t.surface,
              border: `${t.borderWidth} solid ${t.border}`,
              borderRadius: t.radiusSm,
            }}
          >
            <p
              className="text-[9px] font-semibold uppercase"
              style={{ color: t.textMuted }}
            >
              {c.label}
            </p>
            <p
              className="font-mono font-bold"
              style={{ fontSize: "16px", color: t.text }}
            >
              {c.value}
            </p>
            <p
              className="text-[10px] flex items-center gap-0.5"
              style={{ color: c.up ? t.success : t.danger }}
            >
              {c.up ? (
                <TrendingUp className="w-2.5 h-2.5" />
              ) : (
                <TrendingDown className="w-2.5 h-2.5" />
              )}{" "}
              {c.trend}
            </p>
          </div>
        ))}
      </div>
      <Panel t={t} title="Projects — dense grid">
        <ProjectRows concept={concept} rows={projects} dense />
      </Panel>
    </div>
  );
}

// a3 — Command Center: live feed + exceptions.
export function CommandCenterDashboard({ concept }: P) {
  const t = concept.theme;
  const feed = [
    {
      t: "2 min ago",
      text: "PO-2026-040 confirmed by Precision Fasteners Ltd.",
    },
    { t: "18 min ago", text: "PROJ-2026-010 moved to Laser Cutting" },
    {
      t: "1 hr ago",
      text: "INV-2026-089 paid by Norwood Industrial (₹93,200)",
    },
    { t: "2 hr ago", text: "WLD-06 went offline" },
  ];
  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      <div className="space-y-3">
        <Panel t={t} title="Exceptions">
          <div className="space-y-2">
            {attentionItems.slice(0, 3).map((a) => (
              <div key={a.title} className="flex items-start gap-2 text-xs">
                <AlertTriangle
                  className="w-3.5 h-3.5 shrink-0 mt-0.5"
                  style={{ color: t.danger }}
                />
                <div>
                  <p style={{ color: t.text, fontWeight: 600 }}>{a.title}</p>
                  <p style={{ color: t.textMuted }}>{a.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel t={t} title="Projects in flight">
          <ProjectRows concept={concept} rows={projects.slice(0, 4)} />
        </Panel>
      </div>
      <Panel t={t} title="Live feed">
        <div className="space-y-2.5">
          {feed.map((f) => (
            <div key={f.text} className="text-xs">
              <p style={{ color: t.textMuted, fontSize: "10px" }}>{f.t}</p>
              <p style={{ color: t.text }}>{f.text}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// a4 — Editorial Enterprise: a narrated briefing.
export function EditorialTimelineDashboard({ concept }: P) {
  const t = concept.theme;
  return (
    <div className="space-y-5">
      <div>
        <h2
          style={{
            fontFamily: t.fontDisplay,
            fontWeight: t.fontWeightDisplay,
            fontSize: "26px",
            color: t.text,
            lineHeight: 1.2,
          }}
        >
          Six projects in production. One is blocked.
        </h2>
        <p className="text-sm mt-1" style={{ color: t.textMuted }}>
          PROJ-2026-009 has been waiting on a powder-coat delivery for 3 days
          past its need date. Everything else is tracking on schedule, and
          ₹93,200 was collected from Norwood Industrial yesterday.
        </p>
      </div>
      <Panel t={t} title="The story so far">
        <div className="space-y-3 text-sm" style={{ color: t.text }}>
          <p>
            <strong>This morning</strong> — Laser cutting began on the Delta
            Sheet Systems batch of 500 cabinets.
          </p>
          <p>
            <strong>Yesterday</strong> — Norwood Industrial settled INV-2026-089
            in full.
          </p>
          <p>
            <strong>3 days ago</strong> — PROJ-2026-009 stalled after its
            powder-coat PO slipped to a 9-day lead time.
          </p>
        </div>
      </Panel>
      <Panel t={t} title="In production">
        <ProjectRows
          concept={concept}
          rows={projects.filter((p) => p.status === "In Production")}
        />
      </Panel>
    </div>
  );
}

// a5 — AI-Native Operations: AI ranking IS the dashboard.
export function AiPriorityDashboard({ concept }: P) {
  const t = concept.theme;
  return (
    <div className="space-y-4">
      <Panel
        t={t}
        title="AI priority — ranked for you"
        action={
          <span
            className="flex items-center gap-1 text-[10px]"
            style={{ color: t.accent }}
          >
            <Bot className="w-3 h-3" /> live
          </span>
        }
      >
        <div className="space-y-2">
          {attentionItems.map((a, i) => (
            <div
              key={a.title}
              className="flex items-start gap-3 p-2.5"
              style={{
                borderRadius: t.radiusSm,
                background: i === 0 ? `${t.accent}12` : "transparent",
              }}
            >
              <span
                className="text-xs font-bold w-4 shrink-0"
                style={{ color: t.textMuted }}
              >
                {i + 1}
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold" style={{ color: t.text }}>
                  {a.title}
                </p>
                <p className="text-xs" style={{ color: t.textMuted }}>
                  {a.detail} — shown first because it{" "}
                  {a.severity === "critical"
                    ? "blocks other work"
                    : "affects this week's plan"}
                  .
                </p>
              </div>
              <Chip t={t} tone={a.severity}>
                {a.severity}
              </Chip>
            </div>
          ))}
        </div>
      </Panel>
      <div className="grid grid-cols-4 gap-3">
        {[
          ["Projects", "11"],
          ["Quotations", "6"],
          ["Invoices Due", "4"],
          ["Received", "₹5,00,000"],
        ].map(([l, v]) => (
          <Panel key={l} t={t}>
            <p className="text-[10px]" style={{ color: t.textMuted }}>
              {l}
            </p>
            <p
              style={{
                fontFamily: t.fontDisplay,
                fontWeight: 700,
                fontSize: "18px",
                color: t.text,
              }}
            >
              {v}
            </p>
          </Panel>
        ))}
      </div>
    </div>
  );
}

// a6 — Premium Industrial: machine grid IS the front page.
export function ManufacturingMonitorDashboard({ concept }: P) {
  const t = concept.theme;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {machines.map((m) => (
          <div
            key={m.id}
            className="p-4 flex flex-col items-center text-center"
            style={{
              borderRadius: t.radius,
              border: `${t.borderWidth} solid ${m.status === "Down" ? t.danger : t.border}`,
              background: t.surface,
            }}
          >
            <p className="text-[10px] font-bold" style={{ color: t.textMuted }}>
              {m.id}
            </p>
            <p
              className="text-lg font-black mt-1"
              style={{
                color:
                  m.status === "Running"
                    ? t.success
                    : m.status === "Down"
                      ? t.danger
                      : t.warning,
                fontFamily: t.fontDisplay,
              }}
            >
              {m.status.toUpperCase()}
            </p>
            <p className="text-xs mt-1" style={{ color: t.textMuted }}>
              {m.utilization}% util
            </p>
          </div>
        ))}
      </div>
      <Panel t={t} title="Active jobs">
        <ProjectRows
          concept={concept}
          rows={projects.filter((p) => p.status === "In Production")}
        />
      </Panel>
    </div>
  );
}

// a7 — Adaptive Modular: personal work queue as the front page.
export function WorkQueueDashboard({ concept }: P) {
  const t = concept.theme;
  const queue = [
    {
      text: "Approve PO-2026-041 (₹1,84,200 — SteelSource India)",
      module: "Purchase Orders",
    },
    {
      text: "Review NCR-118 (powder coat thickness, PROJ-2026-013)",
      module: "QMS",
    },
    { text: "Follow up: INV-2026-091 is 5 days overdue", module: "Invoices" },
  ];
  return (
    <div className="space-y-4">
      <Panel
        t={t}
        title="Your queue today"
        action={
          <span className="text-[10px]" style={{ color: t.textMuted }}>
            ordered by your usage patterns
          </span>
        }
      >
        <div className="space-y-2">
          {queue.map((q) => (
            <div
              key={q.text}
              className="flex items-center justify-between gap-3 p-2.5"
              style={{
                borderRadius: t.radiusSm,
                border: `${t.borderWidth} solid ${t.border}`,
              }}
            >
              <div>
                <p className="text-sm" style={{ color: t.text }}>
                  {q.text}
                </p>
                <p className="text-[10px]" style={{ color: t.textMuted }}>
                  {q.module}
                </p>
              </div>
              <Btn t={t} small variant="outline">
                Open <ArrowUpRight className="w-3 h-3 ml-1 inline" />
              </Btn>
            </div>
          ))}
        </div>
      </Panel>
      <Panel
        t={t}
        title="Pinned — Production"
        action={<Star className="w-3.5 h-3.5" style={{ color: t.accent }} />}
      >
        <ProjectRows concept={concept} rows={projects.slice(0, 3)} />
      </Panel>
    </div>
  );
}

export function ProjectRows({
  concept,
  rows,
  dense,
}: {
  concept: Concept;
  rows: readonly (typeof projects)[number][];
  dense?: boolean;
}) {
  const t = concept.theme;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr style={{ color: t.textMuted }}>
            {["Project", "Customer", "Stage", "Status", ""].map((h) => (
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
                className={
                  dense
                    ? "py-1 pr-3 font-mono font-semibold"
                    : "py-2 pr-3 font-mono font-semibold"
                }
                style={{ color: t.text }}
              >
                {r.no}
              </td>
              <td className="py-1 pr-3" style={{ color: t.text }}>
                {r.customer}
              </td>
              <td className="py-1 pr-3" style={{ color: t.textMuted }}>
                {r.stage}
              </td>
              <td className="py-1 pr-3">
                <Chip t={t} tone={r.health}>
                  {r.status}
                </Chip>
              </td>
              <td className="py-1">
                <button
                  type="button"
                  className="text-xs font-semibold"
                  style={{ color: t.accent }}
                >
                  View →
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
