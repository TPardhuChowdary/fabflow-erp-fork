// ERP Design Exploration — shared themed primitives.
// One small, reused component foundation (per instruction #22: "reuse a
// strong component foundation, avoid rebuilding the same infrastructure")
// that every concept's shell/dashboard/table/detail draws from. Entirely
// self-contained: inline styles keyed off ConceptTheme, no dependency on
// the real app's shared component library or global tokens.
import { Bot, Search, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ConceptTheme } from "./concepts";

export function useThemeHelpers(t: ConceptTheme) {
  const card: React.CSSProperties = {
    background: t.surface,
    border: `${t.borderWidth} solid ${t.border}`,
    borderRadius: t.radius,
    boxShadow: t.shadow,
  };
  const sm: React.CSSProperties = { borderRadius: t.radiusSm };
  const pill: React.CSSProperties = { borderRadius: t.radiusPill };
  const toneColor = (tone: string) =>
    tone === "critical" || tone === "blocked"
      ? t.danger
      : tone === "high" || tone === "at-risk"
        ? t.warning
        : tone === "medium" || tone === "watch"
          ? t.accent2
          : t.success;
  return { card, sm, pill, toneColor };
}

export function Btn({
  t,
  children,
  variant = "primary",
  onClick,
  small,
}: {
  t: ConceptTheme;
  children: React.ReactNode;
  variant?: "primary" | "outline" | "ghost";
  onClick?: () => void;
  small?: boolean;
}) {
  const { sm } = useThemeHelpers(t);
  const base: React.CSSProperties = {
    ...sm,
    fontFamily: t.fontBody,
    fontWeight: 600,
    fontSize: small ? "12px" : "13px",
    padding: small ? "5px 10px" : "7px 14px",
    cursor: "pointer",
    transition: "opacity .15s ease",
    textTransform: t.uppercaseLabels ? "uppercase" : "none",
    letterSpacing: t.uppercaseLabels ? "0.04em" : "0",
  };
  if (variant === "primary")
    Object.assign(base, {
      background: t.accent,
      color: t.accentText,
      border: `${t.borderWidth} solid ${t.accent}`,
    });
  else if (variant === "outline")
    Object.assign(base, {
      background: "transparent",
      color: t.text,
      border: `${t.borderWidth} solid ${t.border}`,
    });
  else
    Object.assign(base, {
      background: "transparent",
      color: t.textMuted,
      border: `${t.borderWidth} solid transparent`,
    });
  return (
    <button
      type="button"
      className="active:scale-[0.97]"
      style={base}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.opacity = "0.85";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = "1";
      }}
    >
      {children}
    </button>
  );
}

export function Chip({
  t,
  tone,
  children,
}: { t: ConceptTheme; tone: string; children: React.ReactNode }) {
  const { pill, toneColor } = useThemeHelpers(t);
  const c = toneColor(tone);
  return (
    <span
      className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 whitespace-nowrap"
      style={{
        ...pill,
        background: t.hardEdges ? "transparent" : `${c}22`,
        color: c,
        border: t.hardEdges ? `${t.borderWidth} solid ${c}` : "none",
        textTransform: t.uppercaseLabels ? "uppercase" : "none",
      }}
    >
      {t.hardEdges ? `[${children}]` : children}
    </span>
  );
}

export function Panel({
  t,
  title,
  action,
  children,
}: {
  t: ConceptTheme;
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { card } = useThemeHelpers(t);
  return (
    <div style={card} className="overflow-hidden flex flex-col">
      {title && (
        <div
          className="flex items-center justify-between px-4 py-2.5"
          style={{ borderBottom: `${t.borderWidth} solid ${t.border}` }}
        >
          <h3
            className="text-xs font-bold"
            style={{
              color: t.text,
              textTransform: t.uppercaseLabels ? "uppercase" : "none",
              letterSpacing: t.uppercaseLabels ? "0.05em" : "0",
            }}
          >
            {title}
          </h3>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function CommandPalette({
  t,
  open,
  onClose,
}: { t: ConceptTheme; open: boolean; onClose: () => void }) {
  const { card, sm } = useThemeHelpers(t);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  if (!open) return null;
  const suggestions = [
    "Show projects at risk this month",
    "Create quotation for Ashfield Metalworks",
    "Why is PROJ-2026-009 delayed?",
    "Which POs are blocking production?",
  ].filter((s) => s.toLowerCase().includes(q.toLowerCase()));
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      aria-hidden="true"
    >
      <div
        style={{
          ...card,
          background: t.surface,
          width: "100%",
          maxWidth: "480px",
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderBottom: `${t.borderWidth} solid ${t.border}` }}
        >
          <Search className="w-4 h-4 shrink-0" style={{ color: t.textMuted }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search or ask anything…"
            className="flex-1 text-sm outline-none bg-transparent"
            style={{ color: t.text, fontFamily: t.fontBody }}
          />
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="w-3.5 h-3.5" style={{ color: t.textMuted }} />
          </button>
        </div>
        <div className="p-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="w-full text-left px-3 py-2 text-sm transition-colors"
              style={{ ...sm, color: t.text }}
              onClick={onClose}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = t.surfaceAlt;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {s}
            </button>
          ))}
          {suggestions.length === 0 && (
            <p className="text-xs px-3 py-2" style={{ color: t.textMuted }}>
              No matches — press Enter to ask the AI directly.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// AI answers are canned/demonstrative (this sandbox has no live LLM or
// business data connection) — the point is to evaluate the INTERACTION
// PATTERN, not to prove real reasoning. Disclosed here and in the report.
const AI_RESPONSES: Record<string, string> = {
  "what needs my attention today?":
    "3 items: PROJ-2026-009 is blocked on a delayed powder-coat PO, WLD-06 is down with 2 jobs queued behind it, and INV-2026-091 (₹2,06,000) is 5 days overdue.",
  "why is project x delayed?":
    "PROJ-2026-009 is delayed because PO-2026-039 (powder coat, RAL 7016) is 9 days out from Coatline Chemicals — 3 days past the project's material-need date. Nothing else on this project is blocking.",
  "which purchase orders are blocking production?":
    "PO-2026-039 (powder coat) is blocking PROJ-2026-013's finishing stage. PO-2026-041 (steel sheet) is pending approval and will block PROJ-2026-010 if not approved within 2 days.",
  "what inventory will run out next week?":
    "Powder coat RAL 7016 (18kg left, falling trend) will likely hit zero before Friday at current consumption. Cold-rolled steel sheet is also trending down toward its reorder point.",
};

export function AiAskPanel({
  t,
  dockedRight,
}: { t: ConceptTheme; dockedRight?: boolean }) {
  const { card, sm } = useThemeHelpers(t);
  const [messages, setMessages] = useState<
    { role: "user" | "ai"; text: string }[]
  >([
    {
      role: "ai",
      text: 'Ask me anything about your operations — try "What needs my attention today?"',
    },
  ]);
  const [input, setInput] = useState("");
  const ask = (text: string) => {
    if (!text.trim()) return;
    const answer =
      AI_RESPONSES[text.trim().toLowerCase()] ??
      "I don't have a canned answer for that in this demo — in the real product this would query live project, PO, and inventory data.";
    setMessages((m) => [
      ...m,
      { role: "user", text },
      { role: "ai", text: answer },
    ]);
    setInput("");
  };
  return (
    <div
      style={{ ...card, width: dockedRight ? "280px" : "100%" }}
      className="flex flex-col h-full"
    >
      <div
        className="flex items-center gap-2 px-3 py-2.5"
        style={{ borderBottom: `${t.borderWidth} solid ${t.border}` }}
      >
        <Bot className="w-4 h-4" style={{ color: t.accent }} />
        <span className="text-xs font-bold" style={{ color: t.text }}>
          Operations AI
        </span>
      </div>
      <div
        className="flex-1 overflow-auto p-3 space-y-2 text-xs"
        style={{ minHeight: "160px", maxHeight: "260px" }}
      >
        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}-${m.text.slice(0, 12)}`}
            className="px-2.5 py-1.5"
            style={{
              ...sm,
              background: m.role === "user" ? `${t.accent}18` : t.surfaceAlt,
              color: t.text,
              marginLeft: m.role === "user" ? "20%" : 0,
              marginRight: m.role === "ai" ? "10%" : 0,
            }}
          >
            {m.text}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 px-3 pb-2">
        {["What needs my attention today?", "Why is Project X delayed?"].map(
          (q) => (
            <button
              key={q}
              type="button"
              className="text-[10px] px-2 py-1"
              style={{
                ...sm,
                border: `${t.borderWidth} solid ${t.border}`,
                color: t.textMuted,
              }}
              onClick={() => ask(q)}
            >
              {q}
            </button>
          ),
        )}
      </div>
      <div
        className="flex items-center gap-1.5 p-2"
        style={{ borderTop: `${t.borderWidth} solid ${t.border}` }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask(input)}
          placeholder="Ask a question…"
          className="flex-1 text-xs px-2 py-1.5 outline-none"
          style={{
            ...sm,
            border: `${t.borderWidth} solid ${t.border}`,
            background: t.surface,
            color: t.text,
          }}
        />
        <button
          type="button"
          onClick={() => ask(input)}
          aria-label="Send"
          style={{ color: t.accent }}
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
