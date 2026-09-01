// Visual System Lab — the recommended "Instrument" system.
//
// See VISUAL_SYSTEM.md for the full reasoning. Kept in the exact same
// `LabTheme` shape as the 6 existing Design Lab directions (../../
// themes.ts) so both render through the identical preview mechanism —
// this is an evolution of Style 02 (Quiet Utility), not a from-scratch
// 7th direction, and the shared type keeps that comparison honest.
//
// Two independent palettes, not a mechanical light/dark inversion —
// dark surfaces step UP in lightness from the page background rather
// than down, matching how real dark-mode-first tools are built (see
// VISUAL_SYSTEM.md §2's research). Category tints exist only for
// module-identity badges/tags, never as primary surface fills — kept
// deliberately separate from success/warning/danger, which stay a
// fully independent, higher-saturation set.
import type { LabTheme } from "../../themes";

export const CATEGORY_TINTS = {
  light: {
    sales: { bg: "#eaf1f6", text: "#2c5f7a" },
    procurement: { bg: "#f2ece0", text: "#7a5a2c" },
    production: { bg: "#eef2e6", text: "#4d6b2c" },
    finance: { bg: "#f0eaf4", text: "#6b4d8a" },
    quality: { bg: "#f6ecec", text: "#8a4d4d" },
  },
  dark: {
    sales: { bg: "#1a2b33", text: "#7fb8d6" },
    procurement: { bg: "#332a1a", text: "#d6b57f" },
    production: { bg: "#232f1a", text: "#a8cc7f" },
    finance: { bg: "#2a1f33", text: "#c0a0e0" },
    quality: { bg: "#331f1f", text: "#e0a0a0" },
  },
} as const;

export const INSTRUMENT_LIGHT: LabTheme = {
  id: "instrument-light",
  name: "Instrument (Light)",
  sourceLabel: "Phase 3 recommendation — evolution of Style 02, Quiet Utility",
  tagline:
    "A precision instrument panel: restrained, warm-neutral, one deliberate accent.",
  layout: "thin-rail",
  principles: [
    "Collapsed-by-default icon rail — the approved Navigation decision, taken further given how many modules this app has.",
    "One accent (deep steel-teal) used sparingly: active states, primary buttons, links — never a wash across a whole surface.",
    "Elevated warm-neutral background instead of stark white — reduces fatigue across an 8-hour session (2026 research finding).",
    "Category color-coding exists only on badges/tags identifying module ownership — never competes with severity color.",
    "Real typographic hierarchy (IBM Plex Sans, variable) does the work decoration would otherwise have to.",
    "Tabular figures (IBM Plex Mono) for every quantity, currency amount, and code — columns actually align.",
  ],
  swatch: ["#f4f3f0", "#1f6f78", "#ffffff", "#2f8f5b", "#c1443a"],
  tokens: {
    pageBg: "#f4f3f0",
    surface: "#ffffff",
    surfaceAlt: "#eeece5",
    border: "#e2e0d8",
    borderWidth: "1px",
    text: "#1a1917",
    textMuted: "#69665d",
    accent: "#1f6f78",
    accentText: "#ffffff",
    accent2: "#2c5f7a",
    accent3: "#4d6b2c",
    accent4: "#7a5a2c",
    success: "#2f8f5b",
    warning: "#c98a2c",
    danger: "#c1443a",
    radius: "10px",
    radiusSm: "6px",
    radiusPill: "999px",
    shadow: "0 1px 2px rgba(26,25,23,0.05), 0 2px 8px rgba(26,25,23,0.04)",
    fontDisplay: "'IBM Plex Sans', system-ui, sans-serif",
    fontBody: "'IBM Plex Sans', system-ui, sans-serif",
    fontWeightDisplay: 600,
    letterSpacing: "-0.005em",
    sidebarBg: "#ffffff",
    sidebarText: "#69665d",
    sidebarActive: "#e7f0f1",
    sidebarActiveText: "#1f6f78",
    uppercaseLabels: false,
  },
};

export const INSTRUMENT_DARK: LabTheme = {
  id: "instrument-dark",
  name: "Instrument (Dark)",
  sourceLabel:
    "Phase 3 recommendation — dark-first, not an inversion of the light palette",
  tagline:
    "Same instrument, tuned for a dark shop floor or a long night shift.",
  layout: "thin-rail",
  principles: [
    "Surfaces step UP in lightness from the page background (page < surface < surfaceAlt) — not a flipped light palette.",
    "The same single steel-teal accent, re-tuned lighter so it holds contrast on a dark ground without glowing.",
    "Severity colors (success/warning/danger) re-tuned for dark-surface contrast independently, not just brightened.",
    "Everything else — spacing, radius, type, the rail-first nav — identical to the light palette. One system, two grounds.",
  ],
  swatch: ["#14171a", "#5fb0b8", "#1b1f23", "#4ec98a", "#e8756a"],
  tokens: {
    pageBg: "#14171a",
    surface: "#1b1f23",
    surfaceAlt: "#22262b",
    border: "#2c3136",
    borderWidth: "1px",
    text: "#eceae5",
    textMuted: "#9b988e",
    accent: "#5fb0b8",
    accentText: "#0d1f21",
    accent2: "#7fb8d6",
    accent3: "#a8cc7f",
    accent4: "#d6b57f",
    success: "#4ec98a",
    warning: "#e0a13c",
    danger: "#e8756a",
    radius: "10px",
    radiusSm: "6px",
    radiusPill: "999px",
    shadow: "0 1px 2px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.3)",
    fontDisplay: "'IBM Plex Sans', system-ui, sans-serif",
    fontBody: "'IBM Plex Sans', system-ui, sans-serif",
    fontWeightDisplay: 600,
    letterSpacing: "-0.005em",
    sidebarBg: "#1b1f23",
    sidebarText: "#9b988e",
    sidebarActive: "#1a2b2c",
    sidebarActiveText: "#5fb0b8",
    uppercaseLabels: false,
  },
};

export const INSTRUMENT_THEMES: LabTheme[] = [
  INSTRUMENT_LIGHT,
  INSTRUMENT_DARK,
];
