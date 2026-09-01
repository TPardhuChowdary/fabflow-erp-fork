// Visual System Lab — supplementary panels covering the specific
// Blueprint content ../ShowcaseTemplate.tsx doesn't (it already covers
// KPIs/project table/dialog/tabs/load-states well, and is reused as-is
// for the head-to-head comparison — no need to rebuild that). This adds
// exactly the three surfaces VISUAL_SYSTEM.md §5 promises and
// ShowcaseTemplate.tsx doesn't have: the Attention Layer exception
// list, the real Inventory Reserved/Available table, and a Command
// Palette overlay — driven by the same `theme.tokens` pattern, fully
// self-contained, no store/business logic, real Blueprint content.
import { AlertTriangle, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { LabTheme } from "../../themes";

const ATTENTION_ITEMS = [
  {
    title: "PROJ-2026-013 is blocked at Powder Coating",
    detail: "Waiting on powder coat material (PO-2026-039)",
    severity: "critical" as const,
  },
  {
    title: "Robotic Weld Cell 06 is down",
    detail: "Offline — check Machinery for queued jobs behind it",
    severity: "critical" as const,
  },
  {
    title: "INV-2026-091 is 5 days overdue",
    detail: "₹2,43,079 outstanding",
    severity: "warning" as const,
  },
  {
    title: "Cold-rolled steel sheet 2mm is below reorder level",
    detail: "220 sheets available, reorder at 400",
    severity: "warning" as const,
  },
];

const INVENTORY_ROWS = [
  {
    name: "Powder coat RAL 7016",
    category: "Powder Coating Powder",
    unit: "kg",
    total: 18,
    reserved: 8,
    reorderAt: 40,
  },
  {
    name: "Cold-rolled steel sheet 2mm",
    category: "Raw Material",
    unit: "sheets",
    total: 340,
    reserved: 120,
    reorderAt: 400,
  },
  {
    name: "Aluminum extrusion profile",
    category: "Raw Material",
    unit: "m",
    total: 1250,
    reserved: 300,
    reorderAt: 500,
  },
];

const COMMAND_SUGGESTIONS = [
  "open PROJ-2026-013",
  "what needs attention",
  "approve PO-2026-041",
  "show invoices",
];

export function InstrumentExtras({ theme }: { theme: LabTheme }) {
  const t = theme.tokens;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteInputRef = useRef<HTMLInputElement>(null);
  // Programmatic focus-on-open, not a static autoFocus attribute — a
  // command palette needs to accept typing the instant it opens (that's
  // the whole point of the surface), but a static autoFocus disorients
  // screen-reader users navigating the page normally. This only moves
  // focus in direct response to the same user action that opened the
  // dialog, which is the accessible way to do it.
  useEffect(() => {
    if (paletteOpen) paletteInputRef.current?.focus();
  }, [paletteOpen]);

  const card: React.CSSProperties = {
    background: t.surface,
    border: `${t.borderWidth} solid ${t.border}`,
    borderRadius: t.radius,
    boxShadow: t.shadow,
  };
  const smRadius: React.CSSProperties = { borderRadius: t.radiusSm };
  const labelClass = t.uppercaseLabels ? "uppercase tracking-widest" : "";
  const severityColor = (s: "critical" | "warning") =>
    s === "critical" ? t.danger : t.warning;

  return (
    <div
      className="space-y-4"
      style={{ fontFamily: t.fontBody, color: t.text }}
    >
      <div className="grid md:grid-cols-2 gap-4">
        {/* Attention Layer — the exception list, real severity color kept
            fully separate from the accent, per the Blueprint's own
            Tables/Attention reasoning. */}
        <div className="p-4" style={card}>
          <h3
            className={`text-[11px] font-bold mb-3 flex items-center gap-1.5 ${labelClass}`}
            style={{ color: t.textMuted }}
          >
            <AlertTriangle className="w-3.5 h-3.5" /> Needs your attention
          </h3>
          <div className="space-y-1">
            {ATTENTION_ITEMS.map((a) => (
              <div
                key={a.title}
                className="flex items-start gap-2 p-2"
                style={{ ...smRadius }}
              >
                <AlertTriangle
                  className="w-3.5 h-3.5 shrink-0 mt-0.5"
                  style={{ color: severityColor(a.severity) }}
                />
                <div>
                  <p className="text-xs font-semibold">{a.title}</p>
                  <p className="text-[11px]" style={{ color: t.textMuted }}>
                    {a.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Command Palette trigger + overlay — deliberately near-zero
            animation regardless of theme (see VISUAL_SYSTEM.md §5): a
            keyboard-driven surface used hundreds of times a day should
            never wait on a transition. */}
        <div className="p-4 flex flex-col" style={card}>
          <h3
            className={`text-[11px] font-bold mb-3 ${labelClass}`}
            style={{ color: t.textMuted }}
          >
            Command Palette
          </h3>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-2 px-3 py-2 text-left"
            style={{
              ...smRadius,
              background: t.surfaceAlt,
              border: `${t.borderWidth} solid ${t.border}`,
              color: t.textMuted,
            }}
          >
            <Search className="w-3.5 h-3.5" />
            <span className="text-xs flex-1">Try "what needs attention"…</span>
            <span
              className="text-[10px] font-mono px-1.5 py-0.5"
              style={{ ...smRadius, background: t.surface, color: t.textMuted }}
            >
              ⌘K
            </span>
          </button>
          <p className="text-[11px] mt-2" style={{ color: t.textMuted }}>
            Zero equivalent in production — confirmed live in Phase 2.
          </p>
        </div>
      </div>

      {/* Dense table — the real Inventory field set, Reserved/Available
          split restored in Phase 2, shown here at its real column
          count to test the theme against genuine density. */}
      <div style={card} className="overflow-hidden">
        <div className="px-4 pt-3 pb-2">
          <h3
            className={`text-[11px] font-bold ${labelClass}`}
            style={{ color: t.textMuted }}
          >
            Inventory
          </h3>
        </div>
        <div className="overflow-x-auto px-4 pb-4">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: t.textMuted }}>
                {[
                  "Material",
                  "Category",
                  "Unit",
                  "Total",
                  "Reserved",
                  "Available",
                  "Reorder At",
                ].map((h) => (
                  <th
                    key={h}
                    className={`text-left font-semibold pb-2 pr-4 ${labelClass}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody
              style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
            >
              {INVENTORY_ROWS.map((r) => {
                const available = r.total - r.reserved;
                const low = available <= r.reorderAt;
                return (
                  <tr
                    key={r.name}
                    style={{ borderTop: `${t.borderWidth} solid ${t.border}` }}
                  >
                    <td
                      className="py-2.5 pr-4"
                      style={{ fontFamily: t.fontBody, fontWeight: 600 }}
                    >
                      {r.name}
                    </td>
                    <td
                      className="py-2.5 pr-4"
                      style={{ fontFamily: t.fontBody, color: t.textMuted }}
                    >
                      {r.category}
                    </td>
                    <td
                      className="py-2.5 pr-4"
                      style={{ fontFamily: t.fontBody, color: t.textMuted }}
                    >
                      {r.unit}
                    </td>
                    <td className="py-2.5 pr-4">{r.total}</td>
                    <td className="py-2.5 pr-4" style={{ color: t.textMuted }}>
                      {r.reserved}
                    </td>
                    <td
                      className="py-2.5 pr-4 font-semibold"
                      style={{ color: low ? t.warning : t.text }}
                    >
                      {available}
                      {low && (
                        <span
                          className="ml-1"
                          style={{ fontFamily: t.fontBody, fontWeight: 600 }}
                        >
                          low
                        </span>
                      )}
                    </td>
                    <td className="py-2.5" style={{ color: t.textMuted }}>
                      {r.reorderAt}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {paletteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-32 p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setPaletteOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setPaletteOpen(false)}
          aria-hidden="true"
        >
          <div
            className="w-full max-w-md"
            style={{ ...card, background: t.surface }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center gap-2 px-3 py-2.5"
              style={{ borderBottom: `${t.borderWidth} solid ${t.border}` }}
            >
              <Search className="w-3.5 h-3.5" style={{ color: t.textMuted }} />
              <input
                ref={paletteInputRef}
                className="flex-1 text-sm outline-none bg-transparent"
                style={{ color: t.text }}
                placeholder="Type a command…"
              />
            </div>
            <div className="p-1.5">
              {COMMAND_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPaletteOpen(false)}
                  className="w-full text-left px-2.5 py-2 text-xs"
                  style={{ ...smRadius, color: t.textMuted }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
