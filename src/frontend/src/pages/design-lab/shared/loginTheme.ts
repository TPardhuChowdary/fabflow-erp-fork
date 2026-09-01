// Design Lab — normalizes v1's LabTheme and v2's ConceptTheme into one
// common shape a single LoginScreen component can render. Read-only
// adapter: never mutates the source theme objects from either lab.
import type { LabTheme } from "../themes";
import type { ConceptTheme } from "../v2/concepts";

export interface LoginTheme {
  pageBg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  borderWidth: string;
  text: string;
  textMuted: string;
  accent: string;
  accentText: string;
  accent2: string;
  success: string;
  warning: string;
  danger: string;
  radius: string;
  radiusSm: string;
  radiusPill: string;
  shadow: string;
  fontDisplay: string;
  fontBody: string;
  fontWeightDisplay: number;
  hardEdges: boolean;
  uppercaseLabels: boolean;
}

export function fromLabTheme(t: LabTheme["tokens"]): LoginTheme {
  return {
    pageBg: t.pageBg,
    surface: t.surface,
    surfaceAlt: t.surfaceAlt,
    border: t.border,
    borderWidth: t.borderWidth,
    text: t.text,
    textMuted: t.textMuted,
    accent: t.accent,
    accentText: t.accentText,
    accent2: t.accent2,
    success: t.success,
    warning: t.warning,
    danger: t.danger,
    radius: t.radius,
    radiusSm: t.radiusSm,
    radiusPill: t.radiusPill,
    shadow: t.shadow,
    fontDisplay: t.fontDisplay,
    fontBody: t.fontBody,
    fontWeightDisplay: t.fontWeightDisplay,
    hardEdges: t.radius === "0px",
    uppercaseLabels: t.uppercaseLabels,
  };
}

export function fromConceptTheme(t: ConceptTheme): LoginTheme {
  return {
    pageBg: t.pageBg,
    surface: t.surface,
    surfaceAlt: t.surfaceAlt,
    border: t.border,
    borderWidth: t.borderWidth,
    text: t.text,
    textMuted: t.textMuted,
    accent: t.accent,
    accentText: t.accentText,
    accent2: t.accent2,
    success: t.success,
    warning: t.warning,
    danger: t.danger,
    radius: t.radius,
    radiusSm: t.radiusSm,
    radiusPill: t.radiusPill,
    shadow: t.shadow,
    fontDisplay: t.fontDisplay,
    fontBody: t.fontBody,
    fontWeightDisplay: t.fontWeightDisplay,
    hardEdges: t.hardEdges,
    uppercaseLabels: t.uppercaseLabels,
  };
}

export type LoginArchetype =
  | "split-panel"
  | "centered-card-light"
  | "centered-card-dark"
  | "command-terminal"
  | "hero-narrative"
  | "conversational"
  | "factory-floor"
  | "minimal-huge-type"
  | "sketchy-playful";

export interface LoginAssignment {
  archetype: LoginArchetype;
  headline: string;
  subhead: string;
}
