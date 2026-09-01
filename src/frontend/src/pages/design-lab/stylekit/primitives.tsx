// Style Lab — shared primitives whose rendering genuinely branches per
// movement (not just color swaps). This file is where each style's
// defining technique actually lives: skeuomorphic emboss, neumorphic
// dual-shadow extrusion, glass blur, clay puff, brutalist raw rules,
// liquid-glass sheen, spatial elevation, etc.
import type * as React from "react";
import type { StyleDef } from "./styles";

export function cardStyle(t: StyleDef): React.CSSProperties {
  const base: React.CSSProperties = {
    borderRadius: t.radius,
    position: "relative",
  };
  switch (t.technique) {
    case "skeuomorphic":
      return {
        ...base,
        background: `linear-gradient(180deg, ${t.surface}, ${t.surfaceAlt})`,
        border: `1px solid ${t.border}`,
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.6) inset, 0 -1px 0 rgba(0,0,0,0.08) inset, 0 6px 14px rgba(60,45,20,0.18)",
      };
    case "neumorphic":
      return {
        ...base,
        background: t.surface,
        boxShadow:
          "8px 8px 16px rgba(163,177,198,0.55), -8px -8px 16px rgba(255,255,255,0.85)",
      };
    case "glass":
      return {
        ...base,
        background: t.surface,
        border: `1px solid ${t.border}`,
        backdropFilter: "blur(18px) saturate(160%)",
        WebkitBackdropFilter: "blur(18px) saturate(160%)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
      };
    case "clay":
      return {
        ...base,
        background: t.surface,
        boxShadow:
          "10px 10px 24px rgba(154,107,255,0.18), -8px -8px 20px rgba(255,255,255,0.9), inset 0 1px 0 rgba(255,255,255,0.6)",
      };
    case "minimal":
      return {
        ...base,
        background: t.surface,
        border: `1px solid ${t.border}`,
      };
    case "maximal":
      return {
        ...base,
        background: t.surface,
        border: `2.5px solid ${t.border}`,
        boxShadow: `6px 6px 0 ${t.accent}`,
      };
    case "brutalist":
      return {
        ...base,
        background: t.surface,
        border: `2px solid ${t.border}`,
      };
    case "liquid-glass":
      return {
        ...base,
        background: `linear-gradient(160deg, rgba(255,255,255,0.18), ${t.surface} 60%)`,
        border: `1px solid ${t.border}`,
        backdropFilter: "blur(28px) saturate(180%)",
        WebkitBackdropFilter: "blur(28px) saturate(180%)",
        boxShadow:
          "0 20px 50px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.25)",
      };
    case "bento":
      return {
        ...base,
        background: t.surface,
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
      };
    case "spatial":
      return {
        ...base,
        background: t.surface,
        border: `1px solid ${t.border}`,
        boxShadow: "0 24px 48px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)",
      };
    default:
      return base;
  }
}

export function buttonStyle(
  t: StyleDef,
  pressed?: boolean,
): React.CSSProperties {
  const base: React.CSSProperties = {
    borderRadius:
      t.technique === "brutalist"
        ? "0px"
        : t.radius === "0px"
          ? "6px"
          : t.radius,
    fontWeight: 600,
    cursor: "pointer",
    transition: "transform .12s ease, box-shadow .12s ease",
  };
  switch (t.technique) {
    case "skeuomorphic":
      return {
        ...base,
        background: `linear-gradient(180deg, ${t.accent}, ${shade(t.accent, -18)})`,
        color: t.accentText,
        border: `1px solid ${shade(t.accent, -30)}`,
        boxShadow: pressed
          ? "inset 0 2px 4px rgba(0,0,0,0.4)"
          : "0 1px 0 rgba(255,255,255,0.4) inset, 0 3px 6px rgba(0,0,0,0.3)",
      };
    case "neumorphic":
      return {
        ...base,
        background: t.surface,
        color: t.accent,
        boxShadow: pressed
          ? "inset 4px 4px 8px rgba(163,177,198,0.6), inset -4px -4px 8px rgba(255,255,255,0.8)"
          : "5px 5px 10px rgba(163,177,198,0.5), -5px -5px 10px rgba(255,255,255,0.8)",
      };
    case "glass":
      return {
        ...base,
        background: "rgba(255,255,255,0.9)",
        color: t.accentText,
        border: "1px solid rgba(255,255,255,0.5)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
      };
    case "clay":
      return {
        ...base,
        background: t.accent,
        color: t.accentText,
        boxShadow: pressed
          ? "inset 4px 4px 10px rgba(0,0,0,0.2)"
          : "6px 6px 14px rgba(154,107,255,0.35), -4px -4px 10px rgba(255,255,255,0.6)",
      };
    case "minimal":
      return {
        ...base,
        background: t.accent,
        color: t.accentText,
        border: "none",
      };
    case "maximal":
      return {
        ...base,
        background: t.accent,
        color: t.accentText,
        border: `2.5px solid ${t.border}`,
        boxShadow: `4px 4px 0 ${t.border}`,
      };
    case "brutalist":
      return {
        ...base,
        background: t.accent,
        color: t.accentText,
        border: `2px solid ${t.border}`,
      };
    case "liquid-glass":
      return {
        ...base,
        background: `linear-gradient(135deg, ${t.accent}, ${shade(t.accent, 12)})`,
        color: t.accentText,
        border: "1px solid rgba(255,255,255,0.4)",
        boxShadow:
          "0 8px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.5)",
      };
    case "bento":
      return {
        ...base,
        background: t.accent,
        color: t.accentText,
        border: "none",
      };
    case "spatial":
      return {
        ...base,
        background: t.accent,
        color: t.accentText,
        border: "none",
        boxShadow: "0 8px 20px rgba(122,138,255,0.4)",
      };
    default:
      return base;
  }
}

export function inputStyle(t: StyleDef): React.CSSProperties {
  switch (t.technique) {
    case "neumorphic":
      return {
        borderRadius: t.radius,
        border: "none",
        background: t.surface,
        boxShadow:
          "inset 4px 4px 8px rgba(163,177,198,0.5), inset -4px -4px 8px rgba(255,255,255,0.8)",
        color: t.text,
      };
    case "glass":
    case "liquid-glass":
      return {
        borderRadius: t.radius,
        border: `1px solid ${t.border}`,
        background: "rgba(255,255,255,0.08)",
        color: t.text,
      };
    case "brutalist":
      return {
        borderRadius: "0px",
        border: `2px solid ${t.border}`,
        background: t.surface,
        color: t.text,
      };
    case "minimal":
      return {
        borderRadius: t.radius,
        border: `1px solid ${t.border}`,
        background: t.surface,
        color: t.text,
      };
    default:
      return {
        borderRadius: t.radius,
        border: `1px solid ${t.border}`,
        background: t.surfaceAlt,
        color: t.text,
      };
  }
}

export function shade(hex: string, amt: number): string {
  if (!hex.startsWith("#") || hex.length !== 7) return hex;
  const n = (c: string) =>
    Math.max(0, Math.min(255, Number.parseInt(c, 16) + amt));
  const r = n(hex.slice(1, 3));
  const g = n(hex.slice(3, 5));
  const b = n(hex.slice(5, 7));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function Badge({
  t,
  tone,
  children,
}: {
  t: StyleDef;
  tone: "success" | "warning" | "danger";
  children: React.ReactNode;
}) {
  const c = t[tone];
  const pill = t.technique === "brutalist";
  return (
    <span
      className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 whitespace-nowrap"
      style={{
        borderRadius: pill ? 0 : 999,
        background: pill ? "transparent" : `${c}22`,
        color: c,
        border: pill ? `1.5px solid ${c}` : "none",
        textTransform: t.technique === "brutalist" ? "uppercase" : "none",
      }}
    >
      {pill ? `[${children}]` : children}
    </span>
  );
}

export function Card({
  t,
  className,
  style,
  children,
}: {
  t: StyleDef;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div className={className} style={{ ...cardStyle(t), ...style }}>
      {t.technique === "liquid-glass" && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: t.radius,
            background:
              "linear-gradient(120deg, rgba(255,255,255,0.25), transparent 40%)",
          }}
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

export function Btn({
  t,
  children,
  onClick,
  full,
  disabled,
}: {
  t: StyleDef;
  children: React.ReactNode;
  onClick?: () => void;
  full?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-sm px-4 py-2 active:scale-[0.97] ${full ? "w-full" : ""}`}
      style={{
        ...buttonStyle(t),
        opacity: disabled ? 0.6 : 1,
        fontFamily: t.fontBody,
        textTransform: t.technique === "brutalist" ? "uppercase" : "none",
      }}
    >
      {children}
    </button>
  );
}
