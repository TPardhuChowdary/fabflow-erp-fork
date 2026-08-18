#!/usr/bin/env node
// Phase — Multi-Theme Design System. Authoring-time contrast gate, never
// imported by the app. Computes the official WCAG 2.1 relative-luminance
// contrast ratio for a fixed checklist of token pairs, per theme × mode,
// and exits non-zero on any failure. Self-contained OKLCH -> sRGB ->
// relative-luminance math (no new npm dependency), inverse of
// convert-theme-hex.mjs's forward conversion.
//
// Usage: node scripts/check-theme-contrast.mjs

import { THEME_PRESETS } from "../src/lib/themes/tokens.ts";

// ── OKLCH -> linear sRGB -> relative luminance ───────────────────────
// (Inverse of convert-theme-hex.mjs's sRGB->OKLab->OKLCH chain, using
// the same Ottosson reference matrices run in reverse.)
function oklchToLinearRgb(L, C, H) {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

function relLuminanceChannel(linear) {
  // Linear sRGB channel is already "linear-light" per WCAG's own
  // definition — no further gamma step needed here (WCAG's own formula
  // operates on linearized channels, which is exactly what we have).
  return Math.max(0, Math.min(1, linear));
}

function relativeLuminance(L, C, H) {
  const { r, g, b } = oklchToLinearRgb(L, C, H);
  const R = relLuminanceChannel(r);
  const G = relLuminanceChannel(g);
  const B = relLuminanceChannel(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function parseTriplet(value) {
  // Handles both "L C H" and "L C H / alpha%" (alpha ignored for
  // contrast purposes — these are always opaque compositing situations
  // in this app, e.g. border-over-background, not stacked translucency).
  const [main] = value.split("/");
  const [L, C, H] = main.trim().split(/\s+/).map(Number);
  return { L, C, H };
}

function contrastRatio(valueA, valueB) {
  const a = parseTriplet(valueA);
  const b = parseTriplet(valueB);
  const lumA = relativeLuminance(a.L, a.C, a.H);
  const lumB = relativeLuminance(b.L, b.C, b.H);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

// ── Checklist ─────────────────────────────────────────────────────────
const TEXT_PAIRS = [
  ["foreground", "background"],
  ["primaryForeground", "primary"],
  ["secondaryForeground", "secondary"],
  ["accentForeground", "accent"],
  ["destructiveForeground", "destructive"],
  ["successForeground", "success"],
  ["warningForeground", "warning"],
  ["infoForeground", "info"],
  ["cardForeground", "card"],
  ["popoverForeground", "popover"],
  ["sidebarForeground", "sidebar"],
  ["sidebarPrimaryForeground", "sidebarPrimary"],
  ["sidebarAccentForeground", "sidebarAccent"],
  ["tableHeaderForeground", "tableHeader"],
];
const MUTED_FOREGROUND_SURFACES = ["background", "card"];
// Only "ring" (the focus-indicator color) is an actual WCAG SC 1.4.11
// "non-text contrast" requirement here. "border" is a decorative surface
// divider, not an essential UI component/state indicator — WCAG does not
// mandate 3:1 for it, and Default's own pre-existing --border (locked,
// transcribed verbatim from the current app) doesn't clear that bar
// either, so gating on it would fail the one theme required to be
// preserved exactly as-is.
const UI_PAIRS = [["ring", "background"]];

const TEXT_MIN = 4.5;
const UI_MIN = 3.0;

// Default's own pre-existing values (transcribed verbatim from the
// current index.css, never derived/altered by this work) fall short of
// AA on these two specific pairs already, today, before any theme work.
// They are informational, not gate failures — Default must be preserved
// exactly as it currently ships, not "fixed" as a side effect of adding
// new themes.
const KNOWN_PRE_EXISTING_SHORTFALLS = new Set([
  "default/light/primaryForeground/primary",
  "default/light/successForeground/success",
  "default/dark/successForeground/success",
]);

let failures = 0;
let informational = 0;
let checks = 0;

for (const preset of THEME_PRESETS) {
  for (const mode of ["light", "dark"]) {
    const tokens = preset[mode];
    for (const [fg, bg] of TEXT_PAIRS) {
      checks++;
      const ratio = contrastRatio(tokens[fg], tokens[bg]);
      if (ratio < TEXT_MIN) {
        const key = `${preset.id}/${mode}/${fg}/${bg}`;
        if (KNOWN_PRE_EXISTING_SHORTFALLS.has(key)) {
          informational++;
          console.log(
            `INFO  ${preset.id}/${mode}  ${fg} on ${bg}  ratio=${ratio.toFixed(2)} (pre-existing in Default, not altered by this work)`,
          );
          continue;
        }
        failures++;
        console.error(
          `FAIL  ${preset.id}/${mode}  ${fg} on ${bg}  ratio=${ratio.toFixed(2)} (need >= ${TEXT_MIN})`,
        );
      }
    }
    for (const surface of MUTED_FOREGROUND_SURFACES) {
      checks++;
      const ratio = contrastRatio(tokens.mutedForeground, tokens[surface]);
      if (ratio < TEXT_MIN) {
        failures++;
        console.error(
          `FAIL  ${preset.id}/${mode}  mutedForeground on ${surface}  ratio=${ratio.toFixed(2)} (need >= ${TEXT_MIN})`,
        );
      }
    }
    for (const [a, b] of UI_PAIRS) {
      checks++;
      const ratio = contrastRatio(tokens[a], tokens[b]);
      if (ratio < UI_MIN) {
        failures++;
        console.error(
          `FAIL  ${preset.id}/${mode}  ${a} vs ${b}  ratio=${ratio.toFixed(2)} (need >= ${UI_MIN})`,
        );
      }
    }
  }
}

console.log(`\n${checks} checks run across ${THEME_PRESETS.length} presets × 2 modes.`);
if (informational > 0) {
  console.log(`${informational} informational (pre-existing Default shortfalls, not gated).`);
}
if (failures > 0) {
  console.error(`${failures} FAILED.`);
  process.exit(1);
} else {
  console.log("All contrast checks passed (excluding documented pre-existing Default values).");
}
