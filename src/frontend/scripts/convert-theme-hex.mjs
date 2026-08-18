#!/usr/bin/env node
// Phase — Multi-Theme Design System. Authoring-time only tool, never
// imported by the app (see src/lib/themes/tokens.ts, which stores the
// already-converted OKLCH triplets as plain string literals). No new npm
// dependency is used — this is a self-contained implementation of the
// public-domain sRGB -> linear RGB -> OKLab -> OKLCH conversion
// (Björn Ottosson's reference formulas: https://bottosson.github.io/posts/oklab/).
//
// Usage: node scripts/convert-theme-hex.mjs "#B53324" "#E5A657" ...
// Prints, for each hex, the bare "L C H" triplet in the exact format
// already used throughout src/index.css (L and C to 2 decimals, H to the
// nearest integer degree, no oklch() wrapper, no commas) so the output
// can be pasted directly into a ThemeModeTokens object.

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const bigint = Number.parseInt(clean, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function cbrt(x) {
  return Math.sign(x) * Math.abs(x) ** (1 / 3);
}

// Linear sRGB -> OKLab, via Ottosson's direct LMS matrices (equivalent to
// going through CIE XYZ D65 but avoids an extra matrix multiply).
function linearRgbToOklab(r, g, b) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = cbrt(l);
  const m_ = cbrt(m);
  const s_ = cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

export function hexToOklch(hex) {
  const { r, g, b } = hexToRgb(hex);
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const { L, a, b: bLab } = linearRgbToOklab(lr, lg, lb);
  const C = Math.sqrt(a * a + bLab * bLab);
  let H = (Math.atan2(bLab, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}

export function oklchToTriplet({ L, C, H }) {
  return `${L.toFixed(2)} ${C.toFixed(2)} ${Math.round(H)}`;
}

// CLI entry point — only runs when invoked directly, not when imported.
if (import.meta.url === `file://${process.argv[1]}`) {
  const hexes = process.argv.slice(2);
  if (hexes.length === 0) {
    console.log('Usage: node scripts/convert-theme-hex.mjs "#RRGGBB" ...');
    process.exit(1);
  }
  for (const hex of hexes) {
    const oklch = hexToOklch(hex);
    console.log(`${hex}  ->  ${oklchToTriplet(oklch)}`);
  }
}
