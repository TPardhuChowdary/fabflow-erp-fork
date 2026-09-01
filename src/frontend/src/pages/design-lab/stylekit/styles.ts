// Style Lab — 10 aesthetic-movement design directions.
// Unlike the "ERP Exploration" lab (different information architecture
// per concept), this lab holds IA constant — every style renders the
// SAME modules with the SAME data — and puts the differentiation into
// each movement's genuine defining RENDERING TECHNIQUE (shadow recipe,
// blur, surface texture, corner geometry, layout grid), driven by the
// `technique` field below and consumed by primitives.tsx. That's what
// makes these "not just a color change."
export type Technique =
  | "skeuomorphic"
  | "neumorphic"
  | "glass"
  | "clay"
  | "minimal"
  | "maximal"
  | "brutalist"
  | "liquid-glass"
  | "bento"
  | "spatial";

export interface StyleDef {
  id: string;
  number: number;
  name: string;
  technique: Technique;
  philosophy: string;
  pageBg: string; // may be a gradient for glass/liquid/spatial/maximal
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentText: string;
  accent2: string;
  accent3: string;
  success: string;
  warning: string;
  danger: string;
  radius: string;
  fontDisplay: string;
  fontBody: string;
  fontWeightDisplay: number;
}

export const styles: StyleDef[] = [
  {
    id: "skeuomorphic",
    number: 1,
    name: "Skeuomorphism",
    technique: "skeuomorphic",
    philosophy:
      "Interfaces borrow from real, physical materials — brushed metal, leather, embossed panels, glossy buttons with a real light source — so controls read as tactile objects, not flat shapes.",
    pageBg: "linear-gradient(180deg,#e8e2d5,#d9d2c0)",
    surface: "#f3efe4",
    surfaceAlt: "#e6e0d0",
    border: "#c9c0a8",
    text: "#2e2a1f",
    textMuted: "#6b6350",
    accent: "#8a5a2e",
    accentText: "#fff6e8",
    accent2: "#3d6b52",
    accent3: "#7a2e2e",
    success: "#3d7a4a",
    warning: "#b8862f",
    danger: "#a4382f",
    radius: "10px",
    fontDisplay: "'Georgia', serif",
    fontBody: "'Inter', system-ui, sans-serif",
    fontWeightDisplay: 700,
  },
  {
    id: "neumorphic",
    number: 2,
    name: "Neomorphism",
    technique: "neumorphic",
    philosophy:
      "Every surface is the same base color as the background — depth comes purely from a soft dual light/shadow pair, as if elements are extruded from or pressed into one continuous material.",
    pageBg: "#e6e9ee",
    surface: "#e6e9ee",
    surfaceAlt: "#dde1e8",
    border: "transparent",
    text: "#3a4150",
    textMuted: "#7a8290",
    accent: "#5b6cff",
    accentText: "#ffffff",
    accent2: "#2fa89a",
    accent3: "#d67a3a",
    success: "#3d9a6e",
    warning: "#c98a2c",
    danger: "#c1503f",
    radius: "20px",
    fontDisplay: "'Inter', system-ui, sans-serif",
    fontBody: "'Inter', system-ui, sans-serif",
    fontWeightDisplay: 700,
  },
  {
    id: "glass",
    number: 3,
    name: "Glassmorphism",
    technique: "glass",
    philosophy:
      "Frosted, semi-transparent panels float over a vivid gradient backdrop — blur and a thin light edge do the work that borders and shadows do elsewhere.",
    pageBg: "linear-gradient(135deg,#5b6cff 0%,#a05bff 45%,#ff5ba0 100%)",
    surface: "rgba(255,255,255,0.14)",
    surfaceAlt: "rgba(255,255,255,0.08)",
    border: "rgba(255,255,255,0.35)",
    text: "#ffffff",
    textMuted: "rgba(255,255,255,0.7)",
    accent: "#ffffff",
    accentText: "#5b3fd6",
    accent2: "#5be0d0",
    accent3: "#ffd15b",
    success: "#5be08a",
    warning: "#ffd15b",
    danger: "#ff7a7a",
    radius: "18px",
    fontDisplay: "'Inter', system-ui, sans-serif",
    fontBody: "'Inter', system-ui, sans-serif",
    fontWeightDisplay: 700,
  },
  {
    id: "clay",
    number: 4,
    name: "Claymorphism",
    technique: "clay",
    philosophy:
      "Soft, puffy, playdough-like shapes — very rounded corners, pastel color, and a dual light/dark shadow that reads as squishy 3D volume rather than a flat card.",
    pageBg: "#f3ecff",
    surface: "#faf6ff",
    surfaceAlt: "#efe4ff",
    border: "transparent",
    text: "#3a2e57",
    textMuted: "#8577a3",
    accent: "#9a6bff",
    accentText: "#ffffff",
    accent2: "#5bc9c2",
    accent3: "#ff9a6b",
    success: "#5bc98a",
    warning: "#f0b45b",
    danger: "#ff7a8a",
    radius: "28px",
    fontDisplay: "'Inter', system-ui, sans-serif",
    fontBody: "'Inter', system-ui, sans-serif",
    fontWeightDisplay: 800,
  },
  {
    id: "minimal",
    number: 5,
    name: "Minimalism",
    technique: "minimal",
    philosophy:
      "Restraint as the whole point — near-white surfaces, hairline borders, no shadow, one quiet accent, and generous whitespace so content itself carries all the hierarchy.",
    pageBg: "#fbfbfa",
    surface: "#ffffff",
    surfaceAlt: "#f4f4f2",
    border: "#e6e5e0",
    text: "#171715",
    textMuted: "#87857c",
    accent: "#171715",
    accentText: "#ffffff",
    accent2: "#87857c",
    accent3: "#c9c7bc",
    success: "#3d7a4a",
    warning: "#b8862f",
    danger: "#a4382f",
    radius: "6px",
    fontDisplay: "'Inter', system-ui, sans-serif",
    fontBody: "'Inter', system-ui, sans-serif",
    fontWeightDisplay: 600,
  },
  {
    id: "maximal",
    number: 6,
    name: "Maximalism",
    technique: "maximal",
    philosophy:
      "More is the point — saturated multi-color palette, layered pattern, bold mixed type scale, and dense, energetic composition, while every control stays fully legible and operable.",
    pageBg:
      "linear-gradient(120deg,#ff5b8a 0%,#ffb85b 35%,#5bd6ff 70%,#9a5bff 100%)",
    surface: "#fffdf7",
    surfaceAlt: "#fff0d6",
    border: "#1a1a1a",
    text: "#1a1a1a",
    textMuted: "#5a5548",
    accent: "#ff2d6b",
    accentText: "#ffffff",
    accent2: "#2dd6ff",
    accent3: "#ffb800",
    success: "#1fb865",
    warning: "#ffb800",
    danger: "#ff2d2d",
    radius: "14px",
    fontDisplay: "'Georgia', serif",
    fontBody: "'Inter', system-ui, sans-serif",
    fontWeightDisplay: 900,
  },
  {
    id: "brutalist",
    number: 7,
    name: "Brutalism",
    technique: "brutalist",
    philosophy:
      "Raw and unstyled on purpose — pure black/white, thick solid borders instead of shadow, zero corner radius, monospace type, nothing decorative.",
    pageBg: "#ffffff",
    surface: "#ffffff",
    surfaceAlt: "#f0f0f0",
    border: "#000000",
    text: "#000000",
    textMuted: "#555555",
    accent: "#000000",
    accentText: "#ffffff",
    accent2: "#000000",
    accent3: "#e0261f",
    success: "#000000",
    warning: "#000000",
    danger: "#e0261f",
    radius: "0px",
    fontDisplay: "'JetBrains Mono', ui-monospace, monospace",
    fontBody: "'JetBrains Mono', ui-monospace, monospace",
    fontWeightDisplay: 800,
  },
  {
    id: "liquid-glass",
    number: 8,
    name: "Liquid Glass",
    technique: "liquid-glass",
    philosophy:
      "A more dynamic, refractive evolution of glass — continuous superellipse-like rounding, a specular sheen that suggests bending light, and adaptive translucency rather than a flat frosted panel.",
    pageBg: "radial-gradient(circle at 20% 20%,#2a3a6b,#0d1230 60%)",
    surface: "rgba(255,255,255,0.10)",
    surfaceAlt: "rgba(255,255,255,0.06)",
    border: "rgba(255,255,255,0.28)",
    text: "#f2f4ff",
    textMuted: "rgba(242,244,255,0.65)",
    accent: "#7ad6ff",
    accentText: "#0d1230",
    accent2: "#c07aff",
    accent3: "#ffd77a",
    success: "#7affb0",
    warning: "#ffd77a",
    danger: "#ff8a8a",
    radius: "26px",
    fontDisplay: "'Inter', system-ui, sans-serif",
    fontBody: "'Inter', system-ui, sans-serif",
    fontWeightDisplay: 700,
  },
  {
    id: "bento",
    number: 9,
    name: "Bento Grid",
    technique: "bento",
    philosophy:
      "The grid IS the identity — modules are tiled as variable-sized rounded blocks (like a bento box), each block self-contained and color-coded, favoring an at-a-glance showcase layout over linear lists.",
    pageBg: "#f5f5f2",
    surface: "#ffffff",
    surfaceAlt: "#ececE6",
    border: "#e5e4dd",
    text: "#1c1c1a",
    textMuted: "#7c7b72",
    accent: "#ff5b3c",
    accentText: "#ffffff",
    accent2: "#3c7aff",
    accent3: "#2ec48f",
    success: "#2ec48f",
    warning: "#f0a83c",
    danger: "#ff5b5b",
    radius: "22px",
    fontDisplay: "'Inter', system-ui, sans-serif",
    fontBody: "'Inter', system-ui, sans-serif",
    fontWeightDisplay: 800,
  },
  {
    id: "spatial",
    number: 10,
    name: "Spatial UI",
    technique: "spatial",
    philosophy:
      "Content lives on layered depth planes rather than a flat page — cards sit at different simulated z-heights against a dark immersive backdrop, with ambient ombre shadow implying real elevation.",
    pageBg: "radial-gradient(ellipse at top,#1c2033,#0a0b14 70%)",
    surface: "#181c2c",
    surfaceAlt: "#20253a",
    border: "#2c324a",
    text: "#eef0fa",
    textMuted: "#9298b5",
    accent: "#7a8aff",
    accentText: "#0a0b14",
    accent2: "#5be0c9",
    accent3: "#ff8a7a",
    success: "#5be0a0",
    warning: "#e0c05b",
    danger: "#ff7a7a",
    radius: "16px",
    fontDisplay: "'Inter', system-ui, sans-serif",
    fontBody: "'Inter', system-ui, sans-serif",
    fontWeightDisplay: 700,
  },
];

export function styleById(id: string) {
  return styles.find((s) => s.id === id);
}
