// ERP Design Exploration — SET B dashboard bodies (radical redesigns).
// Each rethinks the ERP's fundamental home-screen structure — see
// concepts.ts's `dashboardModel`/`differentiator` fields for the reasoning.
import {
  CheckCircle2,
  ChevronRight,
  Factory,
  MapPin,
  MessageSquare,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useState } from "react";
import type { Concept } from "../concepts";
import { attentionItems, machines, projects } from "../data";
import { AiAskPanel, Btn, Chip, Panel } from "../pieces";
import { ProjectRows } from "./setA";

type P = { concept: Concept };

// b1 — Spatial Data Workspace: pannable canvas of workstream tiles.
export function SpatialCanvasDashboard({ concept }: P) {
  const t = concept.theme;
  const tiles = [
    {
      name: "Sales",
      size: 1,
      detail: "6 quotations, 11 projects",
      urgent: false,
    },
    {
      name: "Production",
      size: 1.3,
      detail: "1 blocked, 1 machine down",
      urgent: true,
    },
    {
      name: "Finance",
      size: 1,
      detail: "₹5,79,700 outstanding",
      urgent: false,
    },
    { name: "Quality", size: 0.9, detail: "2 open NCRs", urgent: true },
    { name: "Procurement", size: 1, detail: "4 open POs", urgent: false },
  ];
  return (
    <div
      className="grid grid-cols-2 md:grid-cols-3 gap-4"
      style={{ minHeight: "420px" }}
    >
      {tiles.map((tile) => (
        <div
          key={tile.name}
          className="flex flex-col justify-between p-5 cursor-pointer transition-transform hover:scale-[1.02]"
          style={{
            borderRadius: t.radius,
            background: t.surface,
            border: `${t.borderWidth} solid ${tile.urgent ? t.warning : t.border}`,
            boxShadow: t.shadow,
            gridColumn: tile.size > 1.1 ? "span 2" : "span 1",
            minHeight: `${100 * tile.size}px`,
          }}
        >
          <div>
            <p
              className="text-sm font-bold"
              style={{ color: t.text, fontFamily: t.fontDisplay }}
            >
              {tile.name}
            </p>
            <p className="text-xs mt-1" style={{ color: t.textMuted }}>
              {tile.detail}
            </p>
          </div>
          {tile.urgent && (
            <Chip t={t} tone="high">
              needs attention
            </Chip>
          )}
        </div>
      ))}
    </div>
  );
}

// b2 — Exception-First: literally nothing but exceptions.
export function ExceptionOnlyDashboard({ concept }: P) {
  const t = concept.theme;
  const [showAll, setShowAll] = useState(false);
  if (!showAll) {
    return (
      <div className="space-y-3">
        {attentionItems.map((a) => (
          <div
            key={a.title}
            className="flex items-center justify-between gap-3 p-3"
            style={{
              borderRadius: t.radius,
              border: `${t.borderWidth} solid ${t.border}`,
              background: t.surface,
            }}
          >
            <div className="flex items-center gap-3">
              <Chip t={t} tone={a.severity}>
                {a.severity}
              </Chip>
              <div>
                <p className="text-sm font-semibold" style={{ color: t.text }}>
                  {a.title}
                </p>
                <p className="text-xs" style={{ color: t.textMuted }}>
                  {a.detail}
                </p>
              </div>
            </div>
            <Btn t={t} small variant="outline">
              Resolve
            </Btn>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-xs font-semibold underline"
          style={{ color: t.textMuted }}
        >
          Show everything (not just exceptions) →
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setShowAll(false)}
        className="text-xs font-semibold underline"
        style={{ color: t.accent }}
      >
        ← Back to exceptions only
      </button>
      <Panel t={t} title="All projects">
        <ProjectRows concept={concept} rows={projects} />
      </Panel>
    </div>
  );
}

// b3 — Conversational Command: chat thread IS the home screen.
export function ConversationalDashboard({ concept }: P) {
  const t = concept.theme;
  return (
    <div className="grid lg:grid-cols-[1fr_260px] gap-4">
      <Panel t={t}>
        <div className="flex items-start gap-3 mb-3">
          <MessageSquare
            className="w-4 h-4 mt-0.5"
            style={{ color: t.accent }}
          />
          <p className="text-sm" style={{ color: t.text }}>
            Good morning — 3 things need you today: PROJ-2026-009 is blocked on
            a delayed powder-coat PO, WLD-06 is down, and INV-2026-091 is 5 days
            overdue. Want me to draft a follow-up email to Meridian Fab Co.?
          </p>
        </div>
        <div className="pl-7">
          <ProjectRows concept={concept} rows={projects.slice(0, 3)} />
        </div>
      </Panel>
      <AiAskPanel t={t} dockedRight />
    </div>
  );
}

// b4 — Context Threads: activity feed per project/customer.
export function ContextThreadsDashboard({ concept }: P) {
  const t = concept.theme;
  const threads = [
    {
      name: "PROJ-2026-013 · Meridian Fab Co.",
      last: "Moved to Powder Coating — 12 min ago",
      urgent: false,
    },
    {
      name: "PROJ-2026-009 · Coastline Fixtures",
      last: "Blocked: PO-2026-039 delayed 9 days",
      urgent: true,
    },
    {
      name: "Delta Sheet Systems",
      last: "INV-2026-090 sent, due in 12 days",
      urgent: false,
    },
  ];
  return (
    <div className="space-y-2">
      {threads.map((th) => (
        <div
          key={th.name}
          className="flex items-center justify-between p-3"
          style={{
            borderRadius: t.radius,
            border: `${t.borderWidth} solid ${th.urgent ? t.danger : t.border}`,
            background: t.surface,
          }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: t.text }}>
              {th.name}
            </p>
            <p className="text-xs" style={{ color: t.textMuted }}>
              {th.last}
            </p>
          </div>
          <ChevronRight className="w-4 h-4" style={{ color: t.textMuted }} />
        </div>
      ))}
    </div>
  );
}

// b5 — Timeline-Native: master timeline with past/now/future.
export function TimelineMasterDashboard({ concept }: P) {
  const t = concept.theme;
  const events = [
    { when: "Mon", label: "PO-2026-039 due (powder coat)", past: true },
    { when: "Today", label: "Laser cutting starts — Delta batch", now: true },
    { when: "Wed", label: "PROJ-2026-012 due" },
    { when: "Fri", label: "INV-2026-090 due (₹4,45,500)" },
    { when: "Next Mon", label: "PROJ-2026-013 dispatch target" },
  ];
  return (
    <Panel t={t} title="Master timeline">
      <div className="flex gap-0 overflow-x-auto pb-2">
        {events.map((e, i) => (
          <div
            key={e.label}
            className="flex flex-col items-center min-w-[130px] relative"
          >
            <div className="w-full flex items-center">
              <div
                className="flex-1 h-px"
                style={{ background: i === 0 ? "transparent" : t.border }}
              />
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{
                  background: e.now
                    ? t.accent
                    : e.past
                      ? t.textMuted
                      : t.border,
                }}
              />
              <div className="flex-1 h-px" style={{ background: t.border }} />
            </div>
            <p
              className="text-[10px] font-bold mt-2"
              style={{ color: e.now ? t.accent : t.textMuted }}
            >
              {e.when}
            </p>
            <p className="text-xs text-center mt-0.5" style={{ color: t.text }}>
              {e.label}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// b6 — Approval & Action Queue: one decision at a time.
export function ApprovalQueueDashboard({ concept }: P) {
  const t = concept.theme;
  const [idx, setIdx] = useState(0);
  const queue = [
    {
      title: "Approve PO-2026-041",
      detail:
        "SteelSource India — ₹1,84,200 for cold-rolled steel sheet, blocking PROJ-2026-010",
      reason: "matches historical vendor and quantity pattern",
    },
    {
      title: "Confirm QC — NCR-118",
      detail: "Powder coat thickness flagged on PROJ-2026-013, batch 4",
      reason: "3 of 4 units within tolerance on re-check",
    },
    {
      title: "Release payment — INV-2026-089",
      detail: "Norwood Industrial, ₹93,200, already received",
      reason: "payment matched against bank statement",
    },
  ];
  if (idx >= queue.length) {
    return (
      <Panel t={t}>
        <div className="flex flex-col items-center py-10 text-center gap-2">
          <CheckCircle2 className="w-8 h-8" style={{ color: t.success }} />
          <p className="text-sm font-semibold" style={{ color: t.text }}>
            Queue clear
          </p>
          <p className="text-xs" style={{ color: t.textMuted }}>
            All decisions handled for today.
          </p>
        </div>
      </Panel>
    );
  }
  const item = queue[idx];
  return (
    <div className="max-w-md mx-auto">
      <p className="text-xs text-center mb-2" style={{ color: t.textMuted }}>
        {idx + 1} of {queue.length}
      </p>
      <Panel t={t}>
        <p className="text-sm font-bold" style={{ color: t.text }}>
          {item.title}
        </p>
        <p className="text-xs mt-1" style={{ color: t.textMuted }}>
          {item.detail}
        </p>
        <p className="text-[11px] mt-2 italic" style={{ color: t.accent }}>
          AI recommends approve — {item.reason}
        </p>
        <div className="flex gap-2 mt-4">
          <Btn t={t} variant="outline" onClick={() => setIdx(idx + 1)}>
            <ThumbsDown className="w-3.5 h-3.5 mr-1 inline" /> Reject
          </Btn>
          <Btn t={t} onClick={() => setIdx(idx + 1)}>
            <ThumbsUp className="w-3.5 h-3.5 mr-1 inline" /> Approve
          </Btn>
        </div>
      </Panel>
    </div>
  );
}

// b7 — Living Factory Twin: spatial floor-plan of machines/stages.
export function FactoryTwinDashboard({ concept }: P) {
  const t = concept.theme;
  const [selected, setSelected] = useState<(typeof machines)[number] | null>(
    null,
  );
  const positions = [
    { m: machines[0], x: "10%", y: "20%" },
    { m: machines[1], x: "35%", y: "55%" },
    { m: machines[2], x: "62%", y: "18%" },
    { m: machines[3], x: "78%", y: "60%" },
    { m: machines[4], x: "48%", y: "80%" },
  ];
  return (
    <div className="grid lg:grid-cols-[1fr_260px] gap-4">
      <Panel
        t={t}
        title="Factory floor"
        action={<MapPin className="w-3.5 h-3.5" style={{ color: t.accent }} />}
      >
        <div
          className="relative"
          style={{
            height: "320px",
            background: t.surfaceAlt,
            borderRadius: t.radiusSm,
          }}
        >
          {positions.map(({ m, x, y }) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelected(m)}
              className="absolute flex flex-col items-center gap-1 -translate-x-1/2 -translate-y-1/2"
              style={{ left: x, top: y }}
            >
              <div
                className="w-10 h-10 flex items-center justify-center"
                style={{
                  borderRadius: t.radiusSm,
                  background:
                    m.status === "Down"
                      ? t.danger
                      : m.status === "Running"
                        ? t.success
                        : t.warning,
                  color: "#fff",
                }}
              >
                <Factory className="w-4 h-4" />
              </div>
              <span
                className="text-[10px] font-bold px-1"
                style={{
                  color: t.text,
                  background: t.surface,
                  borderRadius: 4,
                }}
              >
                {m.id}
              </span>
            </button>
          ))}
        </div>
      </Panel>
      <Panel t={t} title={selected ? selected.name : "Select a station"}>
        {selected ? (
          <div className="space-y-1.5 text-xs" style={{ color: t.text }}>
            <p>
              Status:{" "}
              <Chip
                t={t}
                tone={selected.status === "Down" ? "critical" : "on-track"}
              >
                {selected.status}
              </Chip>
            </p>
            <p style={{ color: t.textMuted }}>
              Utilization: {selected.utilization}%
            </p>
            <p style={{ color: t.textMuted }}>
              Current job: {selected.job ?? "none"}
            </p>
            <p style={{ color: t.textMuted }}>
              Next service in {selected.nextService} days
            </p>
          </div>
        ) : (
          <p className="text-xs" style={{ color: t.textMuted }}>
            Click a machine on the floor plan to see its live status.
          </p>
        )}
      </Panel>
    </div>
  );
}
