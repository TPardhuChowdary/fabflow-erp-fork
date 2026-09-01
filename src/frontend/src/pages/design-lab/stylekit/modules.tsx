// Style Lab — shared module content (Dashboard, Projects, Production,
// Inventory, QMS, Reports, AI, Detail, Create/Edit). IA is deliberately
// held constant across all 10 styles here — this lab is a pure visual-
// language survey (per the request), so the same modules + the same
// realistic manufacturing data render through each style's primitives.
// Bento Grid is the one style whose defining signature IS layout, so its
// Dashboard branches into an actual variable-tile grid below.
import {
  AlertTriangle,
  Bot,
  Factory,
  FileText,
  Package,
  Receipt,
  Send,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  attentionItems,
  invoices,
  machines,
  projects,
  qmsAlerts,
} from "../v2/data";
import { Badge, Btn, Card, inputStyle } from "./primitives";
import type { StyleDef } from "./styles";

type M = { t: StyleDef };

export function DashboardModule({ t }: M) {
  if (t.technique === "bento") return <BentoDashboard t={t} />;
  const kpis = [
    { label: "Total Projects", value: "11", icon: FileText },
    { label: "Active Quotations", value: "6", icon: Package },
    { label: "Pending Invoices", value: "4", icon: Receipt },
    { label: "Total Received", value: "₹5,00,000", icon: Wallet },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card t={t} key={k.label} className="p-4">
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
          </Card>
        ))}
      </div>
      <Card t={t} className="p-4">
        <h3 className="text-xs font-bold mb-2" style={{ color: t.text }}>
          Needs attention
        </h3>
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
      </Card>
    </div>
  );
}

function BentoDashboard({ t }: M) {
  const tiles = [
    {
      span: "col-span-2 row-span-2",
      title: "Total Projects",
      value: "11",
      bg: t.accent,
    },
    { span: "col-span-1", title: "Quotations", value: "6", bg: t.accent2 },
    { span: "col-span-1", title: "Invoices Due", value: "4", bg: t.accent3 },
    {
      span: "col-span-2",
      title: "Received",
      value: "₹5,00,000",
      bg: t.success,
    },
    {
      span: "col-span-1 row-span-2",
      title: "Machines Down",
      value: "1",
      bg: t.danger,
    },
    {
      span: "col-span-3",
      title: "Recent Projects",
      value: null,
      bg: t.surface,
    },
  ];
  return (
    <div className="grid grid-cols-4 gap-3 auto-rows-[80px]">
      {tiles.map((tile) => (
        <div
          key={tile.title}
          className={`${tile.span} p-4 flex flex-col justify-between overflow-hidden`}
          style={{
            borderRadius: t.radius,
            background: tile.value ? tile.bg : t.surface,
            color: tile.value ? "#fff" : t.text,
            border: tile.value ? "none" : `1px solid ${t.border}`,
          }}
        >
          <p className="text-[10px] font-bold uppercase opacity-90">
            {tile.title}
          </p>
          {tile.value ? (
            <p
              style={{
                fontFamily: t.fontDisplay,
                fontWeight: t.fontWeightDisplay,
                fontSize: "26px",
              }}
            >
              {tile.value}
            </p>
          ) : (
            <div className="space-y-1 mt-1">
              {projects.slice(0, 3).map((p) => (
                <p
                  key={p.no}
                  className="text-xs"
                  style={{ color: t.textMuted }}
                >
                  {p.no} — {p.customer}
                </p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ProjectsModule({
  t,
  onSelect,
}: M & { onSelect: (p: (typeof projects)[number]) => void }) {
  return (
    <Card t={t} className="p-4 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr style={{ color: t.textMuted }}>
            {["Project", "Customer", "Qty", "Status", ""].map((h) => (
              <th key={h} className="text-left font-semibold pb-2 pr-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.no} style={{ borderTop: `1px solid ${t.border}` }}>
              <td
                className="py-2 pr-3 font-mono font-semibold"
                style={{ color: t.text }}
              >
                {p.no}
              </td>
              <td className="py-2 pr-3" style={{ color: t.text }}>
                {p.customer}
              </td>
              <td className="py-2 pr-3" style={{ color: t.text }}>
                {p.qty}
              </td>
              <td className="py-2 pr-3">
                <Badge
                  t={t}
                  tone={
                    p.health === "blocked"
                      ? "danger"
                      : p.health === "at-risk" || p.health === "watch"
                        ? "warning"
                        : "success"
                  }
                >
                  {p.status}
                </Badge>
              </td>
              <td className="py-2">
                <button
                  type="button"
                  className="text-xs font-semibold"
                  style={{ color: t.accent }}
                  onClick={() => onSelect(p)}
                >
                  View →
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function DetailDrawer({
  t,
  project,
  onClose,
}: M & { project: (typeof projects)[number]; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      aria-hidden="true"
    >
      <div
        className="h-full w-full max-w-md p-5 overflow-auto"
        style={{ background: t.surface, color: t.text }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2
            style={{
              fontFamily: t.fontDisplay,
              fontWeight: t.fontWeightDisplay,
              fontSize: "18px",
            }}
          >
            {project.no}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" style={{ color: t.textMuted }} />
          </button>
        </div>
        <p className="text-sm font-semibold">{project.name}</p>
        <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>
          {project.customer}
        </p>
        <div className="flex gap-2 mt-3">
          <Badge t={t} tone="success">
            {project.status}
          </Badge>
        </div>
        <div
          className="mt-4 space-y-1.5 text-xs"
          style={{ color: t.textMuted }}
        >
          <p>Quantity: {project.qty} units</p>
          <p>Value: ₹{project.value.toLocaleString("en-IN")}</p>
          <p>Stage: {project.stage}</p>
        </div>
      </div>
    </div>
  );
}

export function CreateEditForm({ t, onClose }: M & { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      aria-hidden="true"
    >
      <Card t={t} className="w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h2
            style={{
              fontFamily: t.fontDisplay,
              fontWeight: t.fontWeightDisplay,
              fontSize: "16px",
              color: t.text,
            }}
          >
            New Project
          </h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" style={{ color: t.textMuted }} />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label
              htmlFor="sk-cust"
              className="text-[11px] font-semibold"
              style={{ color: t.textMuted }}
            >
              Customer
            </label>
            <select
              id="sk-cust"
              className="w-full mt-1 text-sm px-2.5 py-2 outline-none"
              style={inputStyle(t)}
            >
              <option>Meridian Fab Co.</option>
              <option>Norwood Industrial</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="sk-name"
              className="text-[11px] font-semibold"
              style={{ color: t.textMuted }}
            >
              Project Name
            </label>
            <input
              id="sk-name"
              className="w-full mt-1 text-sm px-2.5 py-2 outline-none"
              style={inputStyle(t)}
              placeholder="e.g. Bracket assembly run"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Btn t={t} onClick={onClose}>
              Cancel
            </Btn>
            <Btn t={t} onClick={onClose}>
              Create
            </Btn>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function ProductionModule({ t }: M) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {machines.map((m) => (
        <Card
          t={t}
          key={m.id}
          className="p-3 flex flex-col items-center text-center gap-1"
        >
          <Factory
            className="w-4 h-4"
            style={{ color: m.status === "Down" ? t.danger : t.success }}
          />
          <p className="text-[10px] font-bold" style={{ color: t.textMuted }}>
            {m.id}
          </p>
          <p
            className="text-xs font-bold"
            style={{ color: m.status === "Down" ? t.danger : t.text }}
          >
            {m.status}
          </p>
          <p className="text-[10px]" style={{ color: t.textMuted }}>
            {m.utilization}% util
          </p>
        </Card>
      ))}
    </div>
  );
}

export function InventoryModule({ t }: M) {
  const items = [
    {
      sku: "MAT-CRS-2MM",
      name: "Cold-rolled steel sheet 2mm",
      qty: 340,
      low: true,
    },
    {
      sku: "MAT-AL-EXT",
      name: "Aluminum extrusion profile",
      qty: 1250,
      low: false,
    },
    { sku: "MAT-PWD-7016", name: "Powder coat RAL 7016", qty: 18, low: true },
  ];
  return (
    <Card t={t} className="p-4 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr style={{ color: t.textMuted }}>
            <th className="text-left pb-2">SKU</th>
            <th className="text-left pb-2">Name</th>
            <th className="text-left pb-2">Qty</th>
            <th className="text-left pb-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.sku} style={{ borderTop: `1px solid ${t.border}` }}>
              <td className="py-2 font-mono" style={{ color: t.text }}>
                {i.sku}
              </td>
              <td className="py-2" style={{ color: t.text }}>
                {i.name}
              </td>
              <td className="py-2" style={{ color: t.text }}>
                {i.qty}
              </td>
              <td className="py-2">
                <Badge t={t} tone={i.low ? "warning" : "success"}>
                  {i.low ? "Low stock" : "OK"}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function QmsModule({ t }: M) {
  return (
    <div className="space-y-2">
      {qmsAlerts.map((q) => (
        <Card
          t={t}
          key={q.id}
          className="p-3 flex items-center justify-between"
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: t.text }}>
              {q.id} — {q.project}
            </p>
            <p className="text-xs" style={{ color: t.textMuted }}>
              {q.issue}
            </p>
          </div>
          <Badge t={t} tone={q.severity === "high" ? "danger" : "warning"}>
            {q.severity}
          </Badge>
        </Card>
      ))}
    </div>
  );
}

export function ReportsModule({ t }: M) {
  const bars = [
    { label: "Quotations", v: 6, color: t.accent2 },
    { label: "Projects", v: 11, color: t.accent },
    {
      label: "Invoiced",
      v: (invoices as readonly unknown[]).length,
      color: t.success,
    },
  ];
  return (
    <Card t={t} className="p-4">
      <h3
        className="text-xs font-bold mb-3 flex items-center gap-1.5"
        style={{ color: t.text }}
      >
        <TrendingUp className="w-3.5 h-3.5" /> Order pipeline
      </h3>
      <div className="flex items-end gap-4">
        {bars.map((b) => (
          <div key={b.label} className="flex-1 text-center">
            <div className="text-lg font-bold" style={{ color: t.text }}>
              {b.v}
            </div>
            <div
              className="h-2 rounded-full mb-1"
              style={{ background: b.color, opacity: 0.85 }}
            />
            <div className="text-[10px]" style={{ color: t.textMuted }}>
              {b.label}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function AiModule({ t }: M) {
  const [messages, setMessages] = useState<
    { role: "user" | "ai"; text: string }[]
  >([
    {
      role: "ai",
      text: 'Ask me anything about your operations — try "What needs my attention today?"',
    },
  ]);
  const [input, setInput] = useState("");
  const ask = () => {
    if (!input.trim()) return;
    setMessages((m) => [
      ...m,
      { role: "user", text: input },
      {
        role: "ai",
        text: "PROJ-2026-009 is blocked on a delayed powder-coat PO, and WLD-06 is down.",
      },
    ]);
    setInput("");
  };
  return (
    <Card t={t} className="p-4 flex flex-col" style={{ height: "280px" }}>
      <div className="flex items-center gap-2 mb-3">
        <Bot className="w-4 h-4" style={{ color: t.accent }} />
        <span className="text-xs font-bold" style={{ color: t.text }}>
          Operations AI
        </span>
      </div>
      <div className="flex-1 overflow-auto space-y-2 text-xs mb-2">
        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className="px-2.5 py-1.5 rounded-lg"
            style={{
              background: m.role === "user" ? `${t.accent}18` : t.surfaceAlt,
              color: t.text,
              marginLeft: m.role === "user" ? "20%" : 0,
            }}
          >
            {m.text}
          </div>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="Ask a question…"
          className="flex-1 text-xs px-2 py-1.5 outline-none"
          style={inputStyle(t)}
        />
        <button
          type="button"
          onClick={ask}
          aria-label="Send"
          style={{ color: t.accent }}
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </Card>
  );
}
