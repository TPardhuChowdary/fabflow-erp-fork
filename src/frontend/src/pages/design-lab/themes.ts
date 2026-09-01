// Design Lab — isolated theme definitions.
//
// Each theme is one independent design direction extracted from a
// reference image, translated for an ERP. These are NOT wired into the
// app's global tokens (src/index.css) — ShowcaseTemplate.tsx consumes
// them entirely through inline styles scoped to its own wrapper, so
// nothing here can leak into or affect the real ERP.
//
// Note on source grouping: the "Intelly" reference set (dashboard, patient
// detail, style-guide page) is three screens of ONE product/one design
// language, not three competing directions — they're merged into a single
// Style 01. The four short-form video stills (Flat Design / Minimalism /
// Brutalist / Hand-drawn) are each independently labeled by their own
// source and are kept as four separate styles. Total: 6 directions.

export type LayoutShape =
  | "dark-floating"
  | "thin-rail"
  | "light-sidebar"
  | "topbar-only";

export interface LabTheme {
  id: string;
  name: string;
  sourceLabel: string;
  tagline: string;
  layout: LayoutShape;
  principles: string[];
  swatch: string[]; // small palette preview, most-to-least prominent
  tokens: {
    pageBg: string;
    surface: string; // card/table background
    surfaceAlt: string; // secondary surface (table header, hover rows)
    border: string;
    borderWidth: string;
    text: string;
    textMuted: string;
    accent: string;
    accentText: string; // text color that sits on top of `accent`
    accent2: string; // secondary categorical accent
    accent3: string;
    accent4: string;
    success: string;
    warning: string;
    danger: string;
    radius: string; // cards
    radiusSm: string; // badges/inputs
    radiusPill: string; // fully round or theme equivalent
    shadow: string;
    fontDisplay: string;
    fontBody: string;
    fontWeightDisplay: number;
    letterSpacing: string;
    sidebarBg: string;
    sidebarText: string;
    sidebarActive: string;
    sidebarActiveText: string;
    uppercaseLabels: boolean;
  };
}

export const labThemes: LabTheme[] = [
  {
    id: "style-01",
    name: "Warm Clinical",
    sourceLabel: "Reference: Intelly dashboard / patient detail / style guide",
    tagline: "Cream backdrop, black floating sidebar, pastel-coded categories.",
    layout: "dark-floating",
    principles: [
      "Warm cream backdrop instead of sterile white/gray — crisp white cards float on top for contrast.",
      "Dark, rounded, inset sidebar (not edge-to-edge) reads as its own object, not a bar.",
      "Category color-coding via soft pastel fills, not just text — each data type gets a consistent hue.",
      "Bold, friendly display type for greetings/headlines; data stays small and precise.",
      "Status/tag pills are fully rounded and low-saturation (tinted, not solid).",
      "Near-zero drop shadow — hierarchy comes from fill color and spacing, not elevation.",
    ],
    swatch: ["#faf6ec", "#171512", "#f6c453", "#f3a6c9", "#a8d5ba"],
    tokens: {
      pageBg: "#faf6ec",
      surface: "#ffffff",
      surfaceAlt: "#f3efe2",
      border: "#e9e2cf",
      borderWidth: "1px",
      text: "#1c1a16",
      textMuted: "#8a8474",
      accent: "#e8622c",
      accentText: "#ffffff",
      accent2: "#f6c453",
      accent3: "#f3a6c9",
      accent4: "#9bc9e0",
      success: "#5a9c6f",
      warning: "#e0a63a",
      danger: "#d1594a",
      radius: "20px",
      radiusSm: "10px",
      radiusPill: "999px",
      shadow: "none",
      fontDisplay: "'Plus Jakarta Sans', system-ui, sans-serif",
      fontBody: "'Plus Jakarta Sans', system-ui, sans-serif",
      fontWeightDisplay: 800,
      letterSpacing: "-0.01em",
      sidebarBg: "#171512",
      sidebarText: "rgba(255,255,255,0.65)",
      sidebarActive: "#e8622c",
      sidebarActiveText: "#171512",
      uppercaseLabels: false,
    },
  },
  {
    id: "style-02",
    name: "Quiet Utility",
    sourceLabel: "Reference: ReSync file-manager sidebar",
    tagline: "Thin icon rail, single accent, near-zero visual noise.",
    layout: "thin-rail",
    principles: [
      "Navigation collapses to a 56px icon-only rail by default — labels appear only in an expandable panel.",
      "One accent color, used sparingly (active states, progress rings) — everything else is neutral.",
      "Very light, slightly warm neutral background; thin 1px borders instead of fills to separate regions.",
      "Circular progress/ring motifs for utilization data instead of bar charts.",
      "Quiet typography — no oversized display type; hierarchy comes from weight, not size jumps.",
      "Generous internal padding inside a narrow, restrained overall footprint.",
    ],
    swatch: ["#f6f4ef", "#1f8a5f", "#ffffff", "#d8d3c4", "#2b2b28"],
    tokens: {
      pageBg: "#f6f4ef",
      surface: "#ffffff",
      surfaceAlt: "#f0ede4",
      border: "#e2ddd0",
      borderWidth: "1px",
      text: "#26241f",
      textMuted: "#8f897a",
      accent: "#1f8a5f",
      accentText: "#ffffff",
      accent2: "#1f8a5f",
      accent3: "#5fa98a",
      accent4: "#8fc1aa",
      success: "#1f8a5f",
      warning: "#c98a2c",
      danger: "#b3503f",
      radius: "16px",
      radiusSm: "8px",
      radiusPill: "999px",
      shadow: "0 1px 2px rgba(30,25,15,0.04)",
      fontDisplay: "'Inter', system-ui, sans-serif",
      fontBody: "'Inter', system-ui, sans-serif",
      fontWeightDisplay: 600,
      letterSpacing: "0",
      sidebarBg: "#ffffff",
      sidebarText: "#7c7666",
      sidebarActive: "#e7f3ec",
      sidebarActiveText: "#1f8a5f",
      uppercaseLabels: false,
    },
  },
  {
    id: "style-03",
    name: "Flat Signal",
    sourceLabel: 'Reference: "Flat Design" style survey still',
    tagline: "Soft pastel block-fills, no shadows, confident flat color.",
    layout: "light-sidebar",
    principles: [
      "Every surface is a flat, single-tone fill — no gradients, no drop shadow, ever.",
      "Pastel block colors carry meaning (module/category), not just decoration.",
      "Medium radius (12px) applied uniformly to every container — cards, inputs, buttons alike.",
      "White cards sit on a light neutral canvas; color is reserved for status and category chips.",
      "Icons sit in solid-color circular chips, matched to the category palette.",
      "Comfortable, unhurried spacing — density stays moderate, never cramped.",
    ],
    swatch: ["#f4f5f7", "#4f7cff", "#ffb703", "#2ec4b6", "#ffffff"],
    tokens: {
      pageBg: "#f4f5f7",
      surface: "#ffffff",
      surfaceAlt: "#eef1f6",
      border: "#e3e7ee",
      borderWidth: "1px",
      text: "#1c2333",
      textMuted: "#7c8598",
      accent: "#4f7cff",
      accentText: "#ffffff",
      accent2: "#ffb703",
      accent3: "#2ec4b6",
      accent4: "#ff6b81",
      success: "#2ec4b6",
      warning: "#ffb703",
      danger: "#ff6b81",
      radius: "12px",
      radiusSm: "8px",
      radiusPill: "999px",
      shadow: "none",
      fontDisplay: "'Inter', system-ui, sans-serif",
      fontBody: "'Inter', system-ui, sans-serif",
      fontWeightDisplay: 700,
      letterSpacing: "0",
      sidebarBg: "#ffffff",
      sidebarText: "#7c8598",
      sidebarActive: "#eaf0ff",
      sidebarActiveText: "#4f7cff",
      uppercaseLabels: false,
    },
  },
  {
    id: "style-04",
    name: "Radical Minimal",
    sourceLabel: 'Reference: "Minimalism" style survey still',
    tagline:
      "No sidebar. Huge type carries the hierarchy; chrome nearly disappears.",
    layout: "topbar-only",
    principles: [
      "Chrome recedes almost entirely — a thin top bar replaces a sidebar, maximizing content width.",
      "Display type is oversized and does the hierarchy work that boxes/color normally do.",
      "Near-monochrome: black, white, and a single grayscale ramp; color is reserved for one signal (the accent).",
      "Borders are hairline or absent; separation comes from whitespace, not lines.",
      "Every element must earn its presence — no decorative icons, no filler copy.",
      "Data tables trade density for legibility: fewer, wider columns, more line height.",
    ],
    swatch: ["#ffffff", "#0a0a0a", "#0a0a0a", "#dcdcdc", "#0a0a0a"],
    tokens: {
      pageBg: "#ffffff",
      surface: "#ffffff",
      surfaceAlt: "#f7f7f7",
      border: "#e6e6e6",
      borderWidth: "1px",
      text: "#0a0a0a",
      textMuted: "#8a8a8a",
      accent: "#0a0a0a",
      accentText: "#ffffff",
      accent2: "#0a0a0a",
      accent3: "#8a8a8a",
      accent4: "#c8c8c8",
      success: "#1a7a4a",
      warning: "#8a6a1a",
      danger: "#a01a1a",
      radius: "2px",
      radiusSm: "2px",
      radiusPill: "2px",
      shadow: "none",
      fontDisplay: "'Inter', system-ui, sans-serif",
      fontBody: "'Inter', system-ui, sans-serif",
      fontWeightDisplay: 800,
      letterSpacing: "-0.03em",
      sidebarBg: "#ffffff",
      sidebarText: "#0a0a0a",
      sidebarActive: "#0a0a0a",
      sidebarActiveText: "#ffffff",
      uppercaseLabels: false,
    },
  },
  {
    id: "style-05",
    name: "Raw Brutalist",
    sourceLabel: 'Reference: "Brutalist" style survey still',
    tagline: "Hard edges, thick black rules, monospace, zero softness.",
    layout: "light-sidebar",
    principles: [
      "Zero corner radius anywhere — every container is a hard rectangle.",
      "Thick (2px) solid black borders replace shadows entirely for separation.",
      "Monospace type throughout, including body copy — reinforces a raw, unstyled feel.",
      "Stark black/white base with a single warning-red used sparingly for real alerts only.",
      "Buttons are solid black blocks with white text, or hollow with a black rule — no gradients, no rounding.",
      "Status is shown as bracketed text tags ([ACTIVE]) rather than soft color chips.",
    ],
    swatch: ["#ffffff", "#000000", "#000000", "#e0261f", "#ffffff"],
    tokens: {
      pageBg: "#ffffff",
      surface: "#ffffff",
      surfaceAlt: "#f0f0f0",
      border: "#000000",
      borderWidth: "2px",
      text: "#000000",
      textMuted: "#555555",
      accent: "#000000",
      accentText: "#ffffff",
      accent2: "#000000",
      accent3: "#555555",
      accent4: "#e0261f",
      success: "#000000",
      warning: "#000000",
      danger: "#e0261f",
      radius: "0px",
      radiusSm: "0px",
      radiusPill: "0px",
      shadow: "none",
      fontDisplay: "'JetBrains Mono', ui-monospace, monospace",
      fontBody: "'JetBrains Mono', ui-monospace, monospace",
      fontWeightDisplay: 800,
      letterSpacing: "-0.01em",
      sidebarBg: "#000000",
      sidebarText: "#ffffff",
      sidebarActive: "#ffffff",
      sidebarActiveText: "#000000",
      uppercaseLabels: true,
    },
  },
  {
    id: "style-06",
    name: "Sketchbook",
    sourceLabel: 'Reference: "Hand-drawn" style survey still',
    tagline:
      "Casual, hand-crafted feel translated to a restrained, still-usable ERP surface.",
    layout: "light-sidebar",
    principles: [
      "Warm paper-toned background and rounded, slightly irregular container edges suggest a drawn/crafted feel.",
      "A rounded, friendly display face for headings paired with a plain, highly-legible body face for data.",
      "Color arrives as playful accent splashes (dots, small shapes) rather than full-surface fills, so tables stay scannable.",
      "Dashed/doodled rule-lines substitute for hard borders in low-emphasis places.",
      "Icon language is soft and rounded rather than sharp geometric line icons.",
      "Personality is deliberately dialed back from the source reference: this is the direction most at odds with dense daily data entry, so playfulness is applied only to accents/illustration, never to data legibility.",
    ],
    swatch: ["#fbf6ec", "#3a3226", "#e98a4e", "#7fb0c9", "#e4c05a"],
    tokens: {
      pageBg: "#fbf6ec",
      surface: "#fffdf7",
      surfaceAlt: "#f3ebd9",
      border: "#c9bfa5",
      borderWidth: "1.5px",
      text: "#3a3226",
      textMuted: "#8c7f66",
      accent: "#e98a4e",
      accentText: "#3a3226",
      accent2: "#7fb0c9",
      accent3: "#e4c05a",
      accent4: "#9fbf8f",
      success: "#7a9e6b",
      warning: "#e4c05a",
      danger: "#d16a52",
      radius: "18px",
      radiusSm: "10px",
      radiusPill: "999px",
      shadow: "none",
      fontDisplay: "'Comic Sans MS', 'Segoe Print', cursive",
      fontBody: "'Inter', system-ui, sans-serif",
      fontWeightDisplay: 700,
      letterSpacing: "0",
      sidebarBg: "#fffdf7",
      sidebarText: "#8c7f66",
      sidebarActive: "#fdeee0",
      sidebarActiveText: "#e98a4e",
      uppercaseLabels: false,
    },
  },
];
