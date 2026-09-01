#!/usr/bin/env node
// Phase — Multi-Theme Design System. Authoring-time generator, never
// imported by the app. Implements the deterministic role-assignment
// algorithm (plan §C) and the dark-mode derivation rules in code rather
// than by hand, to avoid transcription errors across ~700 values, then
// writes the final src/lib/themes/tokens.ts source file the app actually
// imports. Re-run whenever a theme's source hexes change.
//
// Usage: node scripts/generate-theme-tokens.mjs

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { hexToOklch } from "./convert-theme-hex.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "../src/lib/themes/tokens.ts");

// ── 1. Source palettes ──────────────────────────────────────────────
// Hex codes confirmed against the user's 10 reference images. Cosmic
// Latte drops the originally-listed #FFB0E7 (not present in its
// reference image). Calm Earth's 4 values are visually estimated from
// its reference image (no printed hex, unlike the other 9 images).
const THEME_DEFS = [
  {
    id: "hot-paprika",
    name: "Hot Paprika",
    description: "Warm, industrial, energetic.",
    swatches: ["#B53324", "#E5A657", "#DFBC94", "#F5E2CE"],
  },
  {
    id: "pear-tomato",
    name: "Pear & Tomato",
    description: "Fresh, warm, approachable.",
    swatches: ["#EEBF43", "#C54F2D", "#F2E7CB", "#94B38A"],
  },
  {
    id: "cosmic-latte",
    name: "Cosmic Latte",
    description: "Soft neutral background with strong contrasting accents.",
    swatches: ["#FFF8E7", "#930500", "#95BBEA"],
  },
  {
    id: "hunyadi",
    name: "Hunyadi",
    description: "Earthy, natural, slightly vintage.",
    swatches: ["#E2A442", "#E0C48C", "#F7F0EB", "#5FA39E", "#1B4436"],
  },
  {
    id: "industrial-gray",
    name: "Industrial Gray",
    description: "Industrial, practical, high-contrast.",
    swatches: ["#FDFCF3", "#2C2D27", "#646661", "#FFD63D"],
  },
  {
    id: "yale-blue",
    name: "Yale Blue",
    description: "Professional, corporate, premium.",
    swatches: ["#0F3B59", "#7D929E", "#DBD4CC", "#DBA12C", "#3E251E"],
  },
  {
    id: "midnight-violet",
    name: "Midnight Violet",
    description: "Dark, sophisticated, minimal.",
    swatches: ["#261732", "#AEA989"],
  },
  {
    id: "calm-earth",
    name: "Calm Earth",
    description: "Earthy, muted, grounded.",
    swatches: ["#A8532A", "#A6824F", "#E8DCC3", "#17301F"],
    visuallyEstimated: true,
  },
  {
    id: "navy-gold",
    name: "Navy & Gold",
    description: "Corporate, premium, understated.",
    swatches: ["#1F2A44", "#E8DCC8", "#C6A75E"],
  },
  {
    id: "sage-bloodstone",
    name: "Sage & Bloodstone",
    description: "Calm, elegant, slightly luxurious.",
    swatches: ["#FFF9EB", "#9FB2AC", "#5D0D18"],
  },
];

// ── 2. Global, theme-independent status tokens ──────────────────────
// Deliberately NOT derived from any theme's brand color, and identical
// across light/dark for consistency (a "destructive" red should mean
// the same thing whether the app is in light or dark mode). Reuses
// Default's own existing --destructive/--success/--warning values
// verbatim for continuity; --info is new, matching Default's existing
// --chart-2 blue exactly.
// successForeground is white ("1 0 0") in most icon-badge contexts, but
// measured against this specific success green (0.62 0.16 145) it only
// reaches 3.41:1 — below AA text contrast. Since --success has zero
// existing visible usage anywhere in the app today (dead token, not yet
// registered in tailwind.config.js before this work), adjusting its
// foreground changes nothing on screen for existing users; darkening it
// like warningForeground already does for its own light-background case
// clears AA cleanly. success/destructive/warning/info themselves are
// left exactly as Default's own pre-existing values (destructive/
// warning) or Default's own existing chart hue (info) — only the one
// foreground that measurably failed is adjusted.
const STATUS_TOKENS = {
  destructive: "0.58 0.24 27",
  destructiveForeground: "1 0 0",
  success: "0.62 0.16 145",
  successForeground: "0.15 0 0",
  warning: "0.78 0.15 70",
  warningForeground: "0.15 0 0",
  info: "0.55 0.15 250",
  infoForeground: "1 0 0",
};

// ── 3. Helpers ───────────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const t = (L, C, H) => `${L.toFixed(2)} ${C.toFixed(2)} ${Math.round(((H % 360) + 360) % 360)}`;
const hueDist = (h1, h2) => {
  const d = Math.abs(h1 - h2) % 360;
  return d > 180 ? 360 - d : d;
};

function annotate(hex) {
  const { L, C, H } = hexToOklch(hex);
  return { hex, L, C, H };
}

// ── 3a. WCAG contrast helpers (same math as check-theme-contrast.mjs,
//      duplicated here deliberately — this file has no import of that
//      script to keep each authoring tool independently runnable, and
//      the formulas are short/stable enough that duplication is safer
//      than a cross-script import chain for a one-off generator). Used
//      to pick the higher-contrast of a light/dark foreground candidate
//      for every DERIVED background (primary, secondary, accent,
//      sidebar-primary, in both modes) rather than assuming "light
//      L => works with dark text" — OKLCH lightness and WCAG relative
//      luminance diverge enough per-hue (blues in particular) that a
//      blind assumption produces real failures, caught by the checker. ──
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
function relativeLuminance(L, C, H) {
  const { r, g, b } = oklchToLinearRgb(L, C, H);
  const clip = (v) => Math.max(0, Math.min(1, v));
  return 0.2126 * clip(r) + 0.7152 * clip(g) + 0.0722 * clip(b);
}
function contrastLCH(a, b) {
  const lumA = relativeLuminance(a.L, a.C, a.H);
  const lumB = relativeLuminance(b.L, b.C, b.H);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Picks whichever of a near-white or near-black candidate (both tinted
 * toward bg's hue at low chroma, for cohesion) contrasts better against
 * bg. Used for every foreground paired with a derived/computed
 * background, so the choice is contrast-driven rather than an L>=0.5
 * guess that can fail for low-WCAG-luminance hues like blue. */
function pickForeground(bg) {
  const light = { L: 0.98, C: 0.01, H: bg.H };
  const dark = { L: 0.14, C: 0.01, H: bg.H };
  const lightRatio = contrastLCH(light, bg);
  const darkRatio = contrastLCH(dark, bg);
  const best = lightRatio >= darkRatio ? light : dark;
  const bestRatio = Math.max(lightRatio, darkRatio);
  // The hue-tinted candidates above are chosen for visual cohesion, but a
  // handful of mid-lightness backgrounds land close enough to the AA
  // boundary that the small tint costs just enough contrast to fail
  // (e.g. 4.33:1, 4.46:1 — need 4.5:1). AA text contrast is a hard
  // requirement, so escalate to a pure black/white candidate (max
  // possible contrast for the surface) only when the tinted pick falls
  // short, rather than accepting a near-miss.
  if (bestRatio < 4.5) {
    const pureWhite = { L: 1, C: 0, H: 0 };
    const pureBlack = { L: 0, C: 0, H: 0 };
    const rw = contrastLCH(pureWhite, bg);
    const rb = contrastLCH(pureBlack, bg);
    return rw >= rb ? pureWhite : pureBlack;
  }
  return best;
}

/** Iteratively darkens a muted-foreground candidate (starting at the
 * given L, background's hue, low chroma) until it clears 4.5:1 against
 * BOTH surfaces it's used on (background and card) — muted-foreground
 * is used on both throughout the app (e.g. CardDescription on card,
 * placeholder text on inputs sitting on background), so both must pass. */
function deriveMutedForeground(background, card, startL = 0.5) {
  let L = startL;
  const H = background.H;
  const C = 0.02;
  for (let i = 0; i < 40; i++) {
    const candidate = { L, C, H };
    if (contrastLCH(candidate, background) >= 4.5 && contrastLCH(candidate, card) >= 4.5) {
      return candidate;
    }
    L -= 0.02;
    if (L < 0.05) break;
  }
  return { L: 0.05, C, H };
}

// ── 4. Role-assignment algorithm (plan §C, refined during
//      implementation: primary is chosen from the mid-to-dark pool
//      (L<=0.65) so a theme's namesake brand color — often lower-chroma
//      than a light gold/yellow accent swatch — wins over a lighter,
//      more saturated highlight color; documented here, not ad hoc). ──
function assignRoles(swatches) {
  const pool = swatches.map(annotate);
  const byL = [...pool].sort((a, b) => b.L - a.L);
  const used = new Set();

  const background = byL[0];
  used.add(background);

  const midDarkPool = pool.filter((s) => !used.has(s) && s.L <= 0.65);
  const primaryPool = midDarkPool.length > 0 ? midDarkPool : pool.filter((s) => !used.has(s));
  const primary = [...primaryPool].sort((a, b) => b.C - a.C)[0];
  used.add(primary);

  const darkest = byL[byL.length - 1];
  let foreground = null;
  if (!used.has(darkest) && darkest.C <= 0.12) {
    foreground = darkest;
    used.add(foreground);
  }

  const remaining1 = pool.filter((s) => !used.has(s));
  let secondary = null;
  if (remaining1.length > 0) {
    secondary = [...remaining1].sort(
      (a, b) => hueDist(b.H, primary.H) - hueDist(a.H, primary.H) || b.C - a.C,
    )[0];
    used.add(secondary);
  }

  const remaining2 = pool.filter((s) => !used.has(s));
  let accent = null;
  if (remaining2.length > 0) {
    accent = [...remaining2].sort(
      (a, b) => Math.abs(a.L - background.L) - Math.abs(b.L - background.L),
    )[0];
    used.add(accent);
  }

  if (!secondary) {
    secondary = {
      L: clamp(primary.L + 0.15, 0.55, 0.85),
      C: primary.C * 0.6,
      H: (primary.H - 25 + 360) % 360,
    };
  }
  if (!accent) {
    accent = {
      L: clamp(background.L - 0.05, 0, 1),
      C: background.C + 0.02,
      H: background.H,
    };
  }
  if (!foreground) {
    foreground = { L: 0.2, C: Math.min(primary.C * 0.15, 0.02), H: primary.H };
  }

  return { background, foreground, primary, secondary, accent };
}

// ── 5. Full light-mode token set from the 5 assigned roles ──────────
function buildLight(roles) {
  const { background, foreground, primary, secondary, accent } = roles;

  const card = { L: clamp(background.L + 0.03, 0, 1), C: background.C * 0.7, H: background.H };
  const muted = { L: background.L * 0.98, C: background.C * 0.5, H: background.H };
  const mutedForeground = deriveMutedForeground(background, card);
  const border = { L: clamp(background.L - 0.08, 0, 1), C: background.C, H: background.H };

  // Foregrounds against every DERIVED/computed background are picked by
  // actual contrast measurement (pickForeground), not an L>=0.5 guess —
  // see the helper's comment for why (OKLCH lightness and WCAG relative
  // luminance diverge per-hue, especially for blues).
  const primaryForeground = pickForeground(primary);
  const secondaryForeground = pickForeground(secondary);
  const accentForeground = pickForeground(accent);

  const sidebar = { L: 0.14, C: 0.02, H: primary.H };
  const sidebarForeground = { L: 0.85, C: 0.01, H: primary.H };
  const sidebarPrimary = {
    L: clamp(primary.L + 0.15, 0.55, 0.78),
    C: primary.C * 1.1,
    H: primary.H,
  };
  const sidebarPrimaryForeground = pickForeground(sidebarPrimary);
  const sidebarAccent = { L: 0.2, C: 0.02, H: primary.H };
  const sidebarAccentForeground = { L: 0.9, C: 0.01, H: primary.H };
  const sidebarBorder = { L: 0.24, C: 0.02, H: primary.H };

  const tableHeader = { L: clamp(card.L - 0.02, 0, 1), C: card.C + 0.01, H: card.H };

  return {
    background: t(background.L, background.C, background.H),
    foreground: t(foreground.L, foreground.C, foreground.H),
    card: t(card.L, card.C, card.H),
    cardForeground: t(foreground.L, foreground.C, foreground.H),
    popover: t(card.L, card.C, card.H),
    popoverForeground: t(foreground.L, foreground.C, foreground.H),
    primary: t(primary.L, primary.C, primary.H),
    primaryForeground: t(primaryForeground.L, primaryForeground.C, primaryForeground.H),
    secondary: t(secondary.L, secondary.C, secondary.H),
    secondaryForeground: t(secondaryForeground.L, secondaryForeground.C, secondaryForeground.H),
    muted: t(muted.L, muted.C, muted.H),
    mutedForeground: t(mutedForeground.L, mutedForeground.C, mutedForeground.H),
    accent: t(accent.L, accent.C, accent.H),
    accentForeground: t(accentForeground.L, accentForeground.C, accentForeground.H),
    ...STATUS_TOKENS,
    border: t(border.L, border.C, border.H),
    input: t(border.L, border.C, border.H),
    ring: t(primary.L, primary.C, primary.H),
    chart1: t(primary.L, primary.C, primary.H),
    chart2: t(secondary.L, secondary.C, secondary.H),
    chart3: t(accent.L, accent.C, accent.H),
    chart4: STATUS_TOKENS.success,
    chart5: STATUS_TOKENS.warning,
    sidebar: t(sidebar.L, sidebar.C, sidebar.H),
    sidebarForeground: t(sidebarForeground.L, sidebarForeground.C, sidebarForeground.H),
    sidebarPrimary: t(sidebarPrimary.L, sidebarPrimary.C, sidebarPrimary.H),
    sidebarPrimaryForeground: t(
      sidebarPrimaryForeground.L,
      sidebarPrimaryForeground.C,
      sidebarPrimaryForeground.H,
    ),
    sidebarAccent: t(sidebarAccent.L, sidebarAccent.C, sidebarAccent.H),
    sidebarAccentForeground: t(
      sidebarAccentForeground.L,
      sidebarAccentForeground.C,
      sidebarAccentForeground.H,
    ),
    sidebarBorder: t(sidebarBorder.L, sidebarBorder.C, sidebarBorder.H),
    sidebarRing: t(primary.L, primary.C, primary.H),
    tableHeader: t(tableHeader.L, tableHeader.C, tableHeader.H),
    tableHeaderForeground: t(foreground.L, foreground.C, foreground.H),
  };
}

// ── 6. Dark-mode derivation from the light set + roles ───────────────
function buildDark(roles) {
  const { background, primary, secondary, accent } = roles;

  const bgDark = { L: 0.13, C: Math.min(background.C, 0.02), H: background.H };
  const fgDark = { L: 0.92, C: 0.01, H: background.H };
  const cardDark = { L: bgDark.L + 0.05, C: 0.01, H: background.H };
  const primaryDark = {
    L: clamp(primary.L + 0.1, 0.55, 0.78),
    C: primary.C * 1.05,
    H: primary.H,
  };
  const primaryForegroundDark = pickForeground(primaryDark);
  const secondaryDark = { L: 0.22, C: secondary.C * 0.5, H: secondary.H };
  const secondaryForegroundDark = pickForeground(secondaryDark);
  const mutedDark = { L: 0.22, C: 0.01, H: background.H };
  const mutedForegroundDark = deriveMutedForeground(bgDark, cardDark, 0.6);
  const accentDark = { L: 0.25, C: accent.C * 0.6, H: accent.H };
  const accentForegroundDark = pickForeground(accentDark);

  const sidebarDark = { L: 0.11, C: 0.02, H: primary.H };
  const sidebarAccentDark = { L: 0.18, C: 0.02, H: primary.H };

  const sidebarPrimaryDark = {
    L: clamp(primary.L + 0.15, 0.55, 0.78),
    C: primary.C * 1.1,
    H: primary.H,
  };
  const sidebarPrimaryForegroundDark = pickForeground(sidebarPrimaryDark);

  const tableHeaderDark = { L: cardDark.L + 0.02, C: 0.01, H: background.H };

  return {
    background: t(bgDark.L, bgDark.C, bgDark.H),
    foreground: t(fgDark.L, fgDark.C, fgDark.H),
    card: t(cardDark.L, cardDark.C, cardDark.H),
    cardForeground: t(fgDark.L, fgDark.C, fgDark.H),
    popover: t(cardDark.L, cardDark.C, cardDark.H),
    popoverForeground: t(fgDark.L, fgDark.C, fgDark.H),
    primary: t(primaryDark.L, primaryDark.C, primaryDark.H),
    primaryForeground: t(
      primaryForegroundDark.L,
      primaryForegroundDark.C,
      primaryForegroundDark.H,
    ),
    secondary: t(secondaryDark.L, secondaryDark.C, secondaryDark.H),
    secondaryForeground: t(
      secondaryForegroundDark.L,
      secondaryForegroundDark.C,
      secondaryForegroundDark.H,
    ),
    muted: t(mutedDark.L, mutedDark.C, mutedDark.H),
    mutedForeground: t(mutedForegroundDark.L, mutedForegroundDark.C, mutedForegroundDark.H),
    accent: t(accentDark.L, accentDark.C, accentDark.H),
    accentForeground: t(accentForegroundDark.L, accentForegroundDark.C, accentForegroundDark.H),
    ...STATUS_TOKENS,
    border: "1 0 0 / 10%",
    input: "1 0 0 / 12%",
    ring: t(primaryDark.L, primaryDark.C, primaryDark.H),
    chart1: t(primaryDark.L, primaryDark.C, primaryDark.H),
    chart2: t(secondaryDark.L, secondaryDark.C, secondaryDark.H),
    chart3: t(accentDark.L, accentDark.C, accentDark.H),
    chart4: STATUS_TOKENS.success,
    chart5: STATUS_TOKENS.warning,
    sidebar: t(sidebarDark.L, sidebarDark.C, sidebarDark.H),
    sidebarForeground: t(0.85, 0.01, primary.H),
    sidebarPrimary: t(sidebarPrimaryDark.L, sidebarPrimaryDark.C, sidebarPrimaryDark.H),
    sidebarPrimaryForeground: t(
      sidebarPrimaryForegroundDark.L,
      sidebarPrimaryForegroundDark.C,
      sidebarPrimaryForegroundDark.H,
    ),
    sidebarAccent: t(sidebarAccentDark.L, sidebarAccentDark.C, sidebarAccentDark.H),
    sidebarAccentForeground: t(0.9, 0.01, primary.H),
    sidebarBorder: "1 0 0 / 8%",
    sidebarRing: t(primaryDark.L, primaryDark.C, primaryDark.H),
    tableHeader: t(tableHeaderDark.L, tableHeaderDark.C, tableHeaderDark.H),
    tableHeaderForeground: t(fgDark.L, fgDark.C, fgDark.H),
  };
}

// ── 7. Default theme — transcribed verbatim from current index.css,
//      never derived. ────────────────────────────────────────────────
const DEFAULT_LIGHT = {
  background: "0.98 0 0",
  foreground: "0.14 0.01 260",
  card: "1 0 0",
  cardForeground: "0.14 0.01 260",
  popover: "1 0 0",
  popoverForeground: "0.14 0.01 260",
  primary: "0.62 0.17 46",
  primaryForeground: "1 0 0",
  secondary: "0.95 0 0",
  secondaryForeground: "0.2 0 0",
  muted: "0.96 0 0",
  mutedForeground: "0.52 0 0",
  accent: "0.95 0.02 250",
  accentForeground: "0.2 0 0",
  destructive: "0.58 0.24 27",
  destructiveForeground: "1 0 0",
  success: "0.62 0.16 145",
  successForeground: "1 0 0",
  warning: "0.78 0.15 70",
  warningForeground: "0.15 0 0",
  info: "0.55 0.15 250",
  infoForeground: "1 0 0",
  border: "0.91 0 0",
  input: "0.91 0 0",
  ring: "0.62 0.17 46",
  chart1: "0.62 0.17 46",
  chart2: "0.55 0.15 250",
  chart3: "0.62 0.16 145",
  chart4: "0.58 0.24 27",
  chart5: "0.78 0.15 70",
  sidebar: "0.13 0.01 260",
  sidebarForeground: "0.85 0 0",
  sidebarPrimary: "0.72 0.18 46",
  sidebarPrimaryForeground: "0.13 0 0",
  sidebarAccent: "0.2 0.01 260",
  sidebarAccentForeground: "0.92 0 0",
  sidebarBorder: "0.22 0.01 260",
  sidebarRing: "0.62 0.17 46",
  tableHeader: "1 0 0",
  tableHeaderForeground: "0.14 0.01 260",
};
const DEFAULT_DARK = {
  background: "0.13 0.01 260",
  foreground: "0.92 0 0",
  card: "0.18 0.01 260",
  cardForeground: "0.92 0 0",
  popover: "0.18 0.01 260",
  popoverForeground: "0.92 0 0",
  primary: "0.72 0.18 46",
  primaryForeground: "0.13 0 0",
  secondary: "0.22 0.01 260",
  secondaryForeground: "0.92 0 0",
  muted: "0.22 0.01 260",
  mutedForeground: "0.6 0 0",
  accent: "0.25 0.01 260",
  accentForeground: "0.92 0 0",
  destructive: "0.58 0.24 27",
  destructiveForeground: "1 0 0",
  success: "0.62 0.16 145",
  successForeground: "1 0 0",
  warning: "0.78 0.15 70",
  warningForeground: "0.15 0 0",
  info: "0.55 0.15 250",
  infoForeground: "1 0 0",
  border: "1 0 0 / 10%",
  input: "1 0 0 / 12%",
  ring: "0.62 0.17 46",
  chart1: "0.72 0.18 46",
  chart2: "0.55 0.15 250",
  chart3: "0.62 0.16 145",
  chart4: "0.58 0.24 27",
  chart5: "0.78 0.15 70",
  sidebar: "0.1 0.01 260",
  sidebarForeground: "0.85 0 0",
  sidebarPrimary: "0.72 0.18 46",
  sidebarPrimaryForeground: "0.1 0 0",
  sidebarAccent: "0.18 0.01 260",
  sidebarAccentForeground: "0.92 0 0",
  sidebarBorder: "1 0 0 / 8%",
  sidebarRing: "0.62 0.17 46",
  tableHeader: "0.2 0.01 260",
  tableHeaderForeground: "0.92 0 0",
};

// ── 7b. Instrument — the Phase 3 Visual System Lab recommendation
//      (design-lab/uxlab/visuallab/tokens.ts, VISUAL_SYSTEM.md). Hand-
//      mapped from its 12-token LabTheme shape into the real 38-key
//      ThemeModeTokens contract (via scripts/convert-theme-hex.mjs for
//      every hex), transcribed verbatim like Default rather than run
//      through the swatch-derivation algorithm — Instrument's light AND
//      dark palettes were already independently tuned by hand in Phase
//      3, so re-deriving them here would silently drift from the
//      approved design. Two deliberate departures from the other 11
//      presets, both straight from the approved source:
//        - The sidebar follows the active surface (light sidebar in
//          light mode) instead of staying permanently dark-navy like
//          Default/the 10 generated presets — Instrument's own tokens.ts
//          gives distinct light/dark sidebar values, unlike every other
//          preset's fixed-dark sidebar block.
//        - border/input/sidebarBorder stay Instrument's own solid
//          low-chroma color in dark mode rather than the translucent
//          white-overlay technique the other 10 dark palettes use —
//          Instrument's source hex is explicit and solid, not an
//          overlay, so it's transcribed as given.
//      "info" isn't part of Instrument's palette (only success/warning/
//      danger are) — reuses the app-wide info blue every other preset
//      already shares, for continuity rather than inventing a new hue.
const INSTRUMENT_LIGHT = {
  background: "0.96 0 91",
  foreground: "0.21 0 85",
  card: "1 0 0",
  cardForeground: "0.21 0 85",
  popover: "1 0 0",
  popoverForeground: "0.21 0 85",
  primary: "0.50 0.08 206",
  primaryForeground: "1 0 0",
  secondary: "0.94 0.01 94",
  secondaryForeground: "0.21 0 85",
  muted: "0.94 0.01 94",
  mutedForeground: "0.51 0.01 92",
  accent: "0.95 0.01 205",
  accentForeground: "0.50 0.08 206",
  destructive: "0.56 0.16 28",
  destructiveForeground: "1 0 0",
  success: "0.58 0.12 156",
  successForeground: "0.15 0 0",
  warning: "0.68 0.13 72",
  warningForeground: "0.15 0 0",
  info: "0.55 0.15 250",
  infoForeground: "1 0 0",
  border: "0.91 0.01 95",
  input: "0.91 0.01 95",
  ring: "0.50 0.08 206",
  chart1: "0.50 0.08 206",
  chart2: "0.55 0.15 250",
  chart3: "0.58 0.12 156",
  chart4: "0.56 0.16 28",
  chart5: "0.68 0.13 72",
  sidebar: "1 0 0",
  sidebarForeground: "0.51 0.01 92",
  sidebarPrimary: "0.50 0.08 206",
  sidebarPrimaryForeground: "1 0 0",
  sidebarAccent: "0.95 0.01 205",
  sidebarAccentForeground: "0.50 0.08 206",
  sidebarBorder: "0.91 0.01 95",
  sidebarRing: "0.50 0.08 206",
  tableHeader: "0.94 0.01 94",
  tableHeaderForeground: "0.21 0 85",
};
const INSTRUMENT_DARK = {
  background: "0.20 0.01 248",
  foreground: "0.94 0.01 89",
  card: "0.24 0.01 248",
  cardForeground: "0.94 0.01 89",
  popover: "0.24 0.01 248",
  popoverForeground: "0.94 0.01 89",
  primary: "0.71 0.08 204",
  primaryForeground: "0.22 0.02 205",
  secondary: "0.27 0.01 254",
  secondaryForeground: "0.94 0.01 89",
  muted: "0.27 0.01 254",
  mutedForeground: "0.68 0.01 93",
  accent: "0.27 0.02 201",
  accentForeground: "0.71 0.08 204",
  destructive: "0.69 0.14 27",
  destructiveForeground: "1 0 0",
  success: "0.75 0.14 158",
  successForeground: "0.15 0 0",
  warning: "0.75 0.14 75",
  warningForeground: "0.15 0 0",
  info: "0.55 0.15 250",
  infoForeground: "1 0 0",
  border: "0.31 0.01 248",
  input: "0.31 0.01 248",
  ring: "0.71 0.08 204",
  chart1: "0.71 0.08 204",
  chart2: "0.55 0.15 250",
  chart3: "0.75 0.14 158",
  chart4: "0.69 0.14 27",
  chart5: "0.75 0.14 75",
  sidebar: "0.24 0.01 248",
  sidebarForeground: "0.68 0.01 93",
  sidebarPrimary: "0.71 0.08 204",
  sidebarPrimaryForeground: "0.22 0.02 205",
  sidebarAccent: "0.27 0.02 201",
  sidebarAccentForeground: "0.71 0.08 204",
  sidebarBorder: "0.31 0.01 248",
  sidebarRing: "0.71 0.08 204",
  tableHeader: "0.27 0.01 254",
  tableHeaderForeground: "0.94 0.01 89",
};
const INSTRUMENT_FONTS = {
  fontSans: "'IBM Plex Sans', system-ui, sans-serif",
  fontMono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace",
};

// ── 8. Build every preset ────────────────────────────────────────────
const presets = [
  {
    id: "default",
    name: "Default",
    description: "The original FabFlow appearance.",
    sourceSwatches: [],
    visuallyEstimated: false,
    light: DEFAULT_LIGHT,
    dark: DEFAULT_DARK,
  },
  {
    id: "instrument",
    name: "Instrument",
    description:
      "Approved Phase 3 visual system — steel-teal accent, IBM Plex Sans/Mono.",
    sourceSwatches: ["#1f6f78", "#f4f3f0", "#2f8f5b", "#c98a2c", "#c1443a"],
    visuallyEstimated: false,
    light: INSTRUMENT_LIGHT,
    dark: INSTRUMENT_DARK,
    ...INSTRUMENT_FONTS,
  },
  ...THEME_DEFS.map((def) => {
    const roles = assignRoles(def.swatches);
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      sourceSwatches: def.swatches,
      visuallyEstimated: !!def.visuallyEstimated,
      light: buildLight(roles),
      dark: buildDark(roles),
      ...(def.fontSans ? { fontSans: def.fontSans, fontMono: def.fontMono } : {}),
    };
  }),
  // Style Lab comparison (see chat) — 6 real, fully-defined design
  // directions from pages/design-lab/themes.ts (labThemes), ported for
  // real Settings selection. Only their COLOR identity + font pairing is
  // portable through this preset pipeline: that file's own header
  // comment confirms these were never wired into the app's global
  // tokens, have no dark variant of their own (derived here via the same
  // deterministic algorithm as every other non-Instrument preset above -
  // not hand-guessed), and are each defined partly by a sidebar `layout`
  // shape (dark-floating/thin-rail/light-sidebar) that would require
  // rebuilding the app shell per style - out of scope (a second design
  // system, explicitly not allowed). fontSans is each style's own
  // `fontBody` (not `fontDisplay`) - e.g. Sketchbook's Comic Sans
  // headline font is deliberately NOT carried over, since that would
  // leak into dense data/body text app-wide; Raw Brutalist's JetBrains
  // Mono is its real fontBody already, so it is carried over faithfully.
  ...[
    {
      id: "style-warm-clinical",
      name: "Warm Clinical",
      description:
        "Style Lab: cream backdrop, pastel-coded categories (color only - see chat).",
      swatches: ["#faf6ec", "#171512", "#f6c453", "#f3a6c9", "#a8d5ba"],
      fontSans: "'Plus Jakarta Sans', system-ui, sans-serif",
      fontMono: "ui-monospace, SFMono-Regular, monospace",
    },
    {
      id: "style-quiet-utility",
      name: "Quiet Utility",
      description:
        "Style Lab: single accent, near-zero visual noise (color only - see chat).",
      swatches: ["#f6f4ef", "#1f8a5f", "#ffffff", "#d8d3c4", "#2b2b28"],
      fontSans: "'Inter', system-ui, sans-serif",
      fontMono: "ui-monospace, SFMono-Regular, monospace",
    },
    {
      id: "style-flat-signal",
      name: "Flat Signal",
      description:
        "Style Lab: soft pastel block-fills, confident flat color (color only - see chat).",
      swatches: ["#f4f5f7", "#4f7cff", "#ffb703", "#2ec4b6", "#ffffff"],
      fontSans: "'Inter', system-ui, sans-serif",
      fontMono: "ui-monospace, SFMono-Regular, monospace",
    },
    {
      id: "style-radical-minimal",
      name: "Radical Minimal",
      description:
        "Style Lab: stark black/white, near-zero ornamentation (color only - see chat).",
      swatches: ["#ffffff", "#0a0a0a", "#0a0a0a", "#dcdcdc", "#0a0a0a"],
      fontSans: "'Inter', system-ui, sans-serif",
      fontMono: "ui-monospace, SFMono-Regular, monospace",
    },
    {
      id: "style-raw-brutalist",
      name: "Raw Brutalist",
      description:
        "Style Lab: hard edges, monospace, zero softness (color only - see chat).",
      swatches: ["#ffffff", "#000000", "#000000", "#e0261f", "#ffffff"],
      fontSans: "'JetBrains Mono', ui-monospace, monospace",
      fontMono: "'JetBrains Mono', ui-monospace, monospace",
    },
    {
      id: "style-sketchbook",
      name: "Sketchbook",
      description:
        "Style Lab: warm hand-drawn palette (color only, headline font intentionally not carried over - see chat).",
      swatches: ["#fbf6ec", "#3a3226", "#e98a4e", "#7fb0c9", "#e4c05a"],
      fontSans: "'Inter', system-ui, sans-serif",
      fontMono: "ui-monospace, SFMono-Regular, monospace",
    },
  ].map((def) => {
    const roles = assignRoles(def.swatches);
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      sourceSwatches: def.swatches,
      visuallyEstimated: false,
      light: buildLight(roles),
      dark: buildDark(roles),
      fontSans: def.fontSans,
      fontMono: def.fontMono,
    };
  }),
];

// ── 9. Emit tokens.ts ─────────────────────────────────────────────────
const KEY_ORDER = [
  "background", "foreground",
  "card", "cardForeground", "popover", "popoverForeground",
  "primary", "primaryForeground",
  "secondary", "secondaryForeground",
  "muted", "mutedForeground",
  "accent", "accentForeground",
  "destructive", "destructiveForeground",
  "success", "successForeground",
  "warning", "warningForeground",
  "info", "infoForeground",
  "border", "input", "ring",
  "chart1", "chart2", "chart3", "chart4", "chart5",
  "sidebar", "sidebarForeground", "sidebarPrimary", "sidebarPrimaryForeground",
  "sidebarAccent", "sidebarAccentForeground", "sidebarBorder", "sidebarRing",
  "tableHeader", "tableHeaderForeground",
];

function formatTokens(tokens, indent) {
  return KEY_ORDER.map((k) => `${indent}${k}: "${tokens[k]}",`).join("\n");
}

const presetEntries = presets
  .map((p) => {
    // Biome formats array literals with a space after each comma;
    // JSON.stringify doesn't, so every preset's line failed `biome
    // check` before this fix (pre-existing, not specific to Instrument).
    const swatchesLiteral = JSON.stringify(p.sourceSwatches).replace(
      /,/g,
      ", ",
    );
    // fontSans/fontMono are optional and only set for Instrument today —
    // every other preset relies on index.css's own default font stack.
    const fontLines = p.fontSans
      ? `\n    fontSans: "${p.fontSans}",\n    fontMono: "${p.fontMono}",`
      : "";
    return `  {
    id: "${p.id}",
    name: "${p.name}",
    description: "${p.description}",
    sourceSwatches: ${swatchesLiteral},
    visuallyEstimated: ${p.visuallyEstimated},${fontLines}
    light: {
${formatTokens(p.light, "      ")}
    },
    dark: {
${formatTokens(p.dark, "      ")}
    },
  }`;
  })
  .join(",\n");

const fileContent = `// AUTO-GENERATED by scripts/generate-theme-tokens.mjs — do not hand-edit.
// Re-run that script (after updating THEME_DEFS there) to regenerate.
//
// Every value is a bare space-separated OKLCH triplet ("L C H", optionally
// "L C H / alpha%"), matching src/index.css's existing convention exactly —
// no oklch() wrapper, no commas. applyThemeTokens() below writes each key
// as a CSS custom property via el.style.setProperty, which Tailwind's
// oklch(var(--x)) wrapping (tailwind.config.js) then renders.
//
// "Default" is transcribed verbatim from the pre-existing :root/.dark
// blocks in index.css, never re-derived — guarantees zero visual drift
// for existing users. The other 10 presets are generated deterministically
// from their source hex swatches via the role-assignment algorithm and
// dark-mode derivation rules documented in generate-theme-tokens.mjs.

export interface ThemeModeTokens {
${KEY_ORDER.map((k) => `  ${k}: string;`).join("\n")}
}

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  /** Original reference hex codes, kept for traceability/regeneration. */
  sourceSwatches: string[];
  /** True only for Calm Earth — its reference image had no printed hex
   * codes (unlike the other 9), so these were visually estimated from
   * the swatch image rather than pixel-exact. */
  visuallyEstimated: boolean;
  /** Optional per-preset font override (same family in light + dark —
   * unlike ThemeModeTokens, typography doesn't change with mode). Unset
   * for every preset except Instrument, which uses these in place of
   * index.css's default Plus Jakarta Sans stack. */
  fontSans?: string;
  fontMono?: string;
  light: ThemeModeTokens;
  dark: ThemeModeTokens;
}

export const DEFAULT_THEME_ID = "default";

export const THEME_PRESETS: ThemePreset[] = [
${presetEntries},
];

const CSS_VAR_NAMES: Record<keyof ThemeModeTokens, string> = {
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  cardForeground: "--card-foreground",
  popover: "--popover",
  popoverForeground: "--popover-foreground",
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  secondary: "--secondary",
  secondaryForeground: "--secondary-foreground",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  accent: "--accent",
  accentForeground: "--accent-foreground",
  destructive: "--destructive",
  destructiveForeground: "--destructive-foreground",
  success: "--success",
  successForeground: "--success-foreground",
  warning: "--warning",
  warningForeground: "--warning-foreground",
  info: "--info",
  infoForeground: "--info-foreground",
  border: "--border",
  input: "--input",
  ring: "--ring",
  chart1: "--chart-1",
  chart2: "--chart-2",
  chart3: "--chart-3",
  chart4: "--chart-4",
  chart5: "--chart-5",
  sidebar: "--sidebar",
  sidebarForeground: "--sidebar-foreground",
  sidebarPrimary: "--sidebar-primary",
  sidebarPrimaryForeground: "--sidebar-primary-foreground",
  sidebarAccent: "--sidebar-accent",
  sidebarAccentForeground: "--sidebar-accent-foreground",
  sidebarBorder: "--sidebar-border",
  sidebarRing: "--sidebar-ring",
  tableHeader: "--table-header",
  tableHeaderForeground: "--table-header-foreground",
};

/** Writes every token in \`tokens\` as a CSS custom property on \`el\`
 * (normally document.documentElement). Pure DOM mutation, no React. */
export function applyThemeTokens(
  el: HTMLElement,
  tokens: ThemeModeTokens,
): void {
  for (const key of Object.keys(CSS_VAR_NAMES) as (keyof ThemeModeTokens)[]) {
    el.style.setProperty(CSS_VAR_NAMES[key], tokens[key]);
  }
}

export function getThemePreset(id: string): ThemePreset {
  return THEME_PRESETS.find((p) => p.id === id) ?? THEME_PRESETS[0];
}

/** Writes (or clears) the preset's font override as CSS custom
 * properties. Only Instrument sets fontSans/fontMono today; switching
 * to any other preset must remove them again rather than leaving a
 * stale inline style behind, since el.style.setProperty persists across
 * re-renders. index.css's own font-family falls back to Plus Jakarta
 * Sans / the default mono stack via var(--font-x, <fallback>) whenever
 * these are unset. */
export function applyThemeFonts(el: HTMLElement, preset: ThemePreset): void {
  if (preset.fontSans) el.style.setProperty("--font-sans", preset.fontSans);
  else el.style.removeProperty("--font-sans");
  if (preset.fontMono) el.style.setProperty("--font-mono", preset.fontMono);
  else el.style.removeProperty("--font-mono");
}
`;

writeFileSync(OUT_PATH, fileContent, "utf-8");
// Line-wrapping (e.g. long `description` strings) needs to match the
// project's own Biome print-width rules exactly, which is brittle to
// hand-replicate in the template above — running the project's real
// formatter here is both simpler and guaranteed correct.
try {
  execFileSync("npx", ["--yes", "biome", "format", "--write", OUT_PATH], {
    stdio: "inherit",
  });
} catch {
  console.warn(
    "Biome formatting failed — run `pnpm fix` manually before committing.",
  );
}
console.log(`Wrote ${presets.length} presets to ${OUT_PATH}`);
