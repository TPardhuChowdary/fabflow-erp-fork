// Visual System Lab — Phase 3 of the FabFlow redesign.
//
// Determines the visual system for the Final UX Blueprint approved in
// Phase 2 (../decisionlab/UX_CONSOLIDATION.md). Production is untouched;
// nothing here is applied until explicitly approved. See
// VISUAL_SYSTEM.md for the full written analysis this renders.
//
// Reuses the existing Design Lab's own real preview harness
// (../../ShowcaseTemplate.tsx) for the head-to-head comparison across
// all 6 original directions plus the two new "Instrument" palettes —
// same renderer, only the theme differs, which is a fairer comparison
// than building a second bespoke one. InstrumentExtras.tsx adds the
// specific Blueprint content (Attention Layer, real Inventory table,
// Command Palette) that harness doesn't cover.
import {
  BarChart3,
  ClipboardCheck,
  GitCompare,
  Layers,
  Palette,
} from "lucide-react";
import { useState } from "react";
import { ShowcaseTemplate } from "../../ShowcaseTemplate";
import { type LabTheme, labThemes } from "../../themes";
import { InstrumentExtras } from "./InstrumentExtras";
import { INSTRUMENT_DARK, INSTRUMENT_LIGHT } from "./tokens";

const ALL_THEMES: LabTheme[] = [
  ...labThemes,
  INSTRUMENT_LIGHT,
  INSTRUMENT_DARK,
];

const TABS = [
  { id: "verdict", label: "The Verdict", icon: GitCompare },
  { id: "tokens", label: "Token System", icon: Layers },
  { id: "applied", label: "Applied Screens", icon: BarChart3 },
] as const;
type TabId = (typeof TABS)[number]["id"];

const VERDICT_ROWS: Array<{
  style: string;
  idea: string;
  verdict: "base" | "borrow" | "reject";
  note: string;
}> = [
  {
    style: "01 — Warm Clinical",
    idea: "Cream backdrop, pastel category coding, bold display type",
    verdict: "borrow",
    note: "Category color-coding worth keeping, scoped to badges only.",
  },
  {
    style: "02 — Quiet Utility",
    idea: "Thin icon rail, single accent, near-zero noise",
    verdict: "base",
    note: "Strongest single-direction fit — Instrument is an evolution of this, not a 7th direction.",
  },
  {
    style: "03 — Flat Signal",
    idea: "Flat pastel block fills, moderate radius",
    verdict: "borrow",
    note: "Flat-fill confidence for status chips only — full-surface use fights the Attention Layer's severity color.",
  },
  {
    style: "04 — Radical Minimal",
    idea: "No sidebar, huge type, near-monochrome",
    verdict: "reject",
    note: "Incompatible with the approved grouped-sidebar Navigation decision. Typographic discipline kept independently.",
  },
  {
    style: "05 — Raw Brutalist",
    idea: "Zero radius, monospace body copy, thick borders",
    verdict: "reject",
    note: "Monospace body text and heavy borders are a real readability/density cost, not a style preference.",
  },
  {
    style: "06 — Sketchbook",
    idea: "Hand-drawn warmth, playful accents",
    verdict: "reject",
    note: "The style's own principles admit it's at odds with dense daily data entry — correctly self-scoped, not adopted.",
  },
];

const VERDICT_STYLE: Record<string, string> = {
  base: "bg-emerald-100 text-emerald-700",
  borrow: "bg-amber-100 text-amber-700",
  reject: "bg-gray-100 text-gray-500",
};

function TokenSwatchCard({ theme }: { theme: LabTheme }) {
  const t = theme.tokens;
  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      <div className="h-16 flex">
        {theme.swatch.map((c, i) => (
          <div
            key={`${theme.id}-sw-${i}`}
            className="flex-1"
            style={{ background: c }}
          />
        ))}
      </div>
      <div className="p-4">
        <h3 className="text-sm font-bold">{theme.name}</h3>
        <p className="text-xs text-gray-500 mt-1">{theme.tagline}</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-[11px] text-gray-500">
          <span>Accent</span>
          <span className="font-mono" style={{ color: t.accent }}>
            {t.accent}
          </span>
          <span>Radius</span>
          <span className="font-mono">{t.radius}</span>
          <span>Type</span>
          <span className="font-mono truncate">
            {t.fontDisplay.split(",")[0].replace(/'/g, "")}
          </span>
        </div>
      </div>
    </div>
  );
}

export function VisualSystemLab() {
  const [tab, setTab] = useState<TabId>("verdict");
  const [preview, setPreview] = useState<LabTheme | null>(null);

  if (preview) {
    return (
      <div className="space-y-3" data-ocid="uxlab.visuallab.preview">
        <button
          type="button"
          onClick={() => setPreview(null)}
          className="text-xs font-semibold text-gray-500 hover:text-gray-900"
        >
          ← Back to Visual System Lab
        </button>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold">{preview.name}</h2>
          <span className="text-xs text-gray-400">{preview.sourceLabel}</span>
        </div>
        <ShowcaseTemplate theme={preview} />
        {(preview.id === "instrument-light" ||
          preview.id === "instrument-dark") && (
          <>
            <p className="text-xs font-semibold text-gray-500 pt-2">
              Blueprint-specific content (Attention Layer, real Inventory table,
              Command Palette) — not part of the shared harness above:
            </p>
            <InstrumentExtras theme={preview} />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-ocid="uxlab.visuallab">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Palette className="w-5 h-5" /> Visual System Lab
        </h1>
        <p className="text-sm text-gray-500 mt-1 max-w-3xl">
          Determining the visual system for the Final UX Blueprint (approved in
          the UX Consolidation Lab) — the six existing Design Lab directions
          plus current 2026 design research, resolved into one recommendation.
          Production stays completely untouched.
        </p>
      </div>

      <div className="flex gap-1.5 border-b overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 whitespace-nowrap border-b-2 ${tab === t.id ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500"}`}
            >
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "verdict" && (
        <div className="max-w-3xl space-y-4">
          <div className="rounded-xl border bg-white p-4">
            <p className="text-sm text-gray-800 leading-relaxed">
              One direction (<strong>Quiet Utility</strong>) is a strong base:
              its collapsed-by-default rail nav, single accent, and quiet type
              match an app used 8 hours a day better than any other style in the
              set. Three directions each contribute one real idea worth keeping.
              Two are correctly rejected — not because they're unfamiliar, but
              because their own core commitments (monospace body copy;
              deliberately reduced density) work against a tool that runs a
              fabrication shop.
            </p>
          </div>
          <div className="rounded-xl border bg-white overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b bg-gray-50">
                  <th className="text-left p-2.5">Style</th>
                  <th className="text-left p-2.5">Core idea</th>
                  <th className="text-left p-2.5">Verdict</th>
                  <th className="text-left p-2.5">Note</th>
                </tr>
              </thead>
              <tbody>
                {VERDICT_ROWS.map((r) => (
                  <tr
                    key={r.style}
                    className="border-b last:border-0 align-top"
                  >
                    <td className="p-2.5 font-semibold whitespace-nowrap">
                      {r.style}
                    </td>
                    <td className="p-2.5 text-gray-600">{r.idea}</td>
                    <td className="p-2.5">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${VERDICT_STYLE[r.verdict]}`}
                      >
                        {r.verdict}
                      </span>
                    </td>
                    <td className="p-2.5 text-gray-500 min-w-[240px]">
                      {r.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1.5">
              <ClipboardCheck className="w-3.5 h-3.5" /> What August 2026
              research added
            </h3>
            <ul className="list-disc list-inside space-y-1.5 text-xs text-gray-700">
              <li>
                <strong>Dark-mode-first</strong> is now the enterprise default
                for all-day tools — none of the 6 directions defined a dark
                variant at all; Instrument closes that gap with two
                independently-tuned palettes, not an inversion.
              </li>
              <li>
                <strong>Elevated, soothing neutrals</strong> are replacing stark
                white/black to reduce visual fatigue — argues against Radical
                Minimal's pure black/white, validates a warmer-but-restrained
                base.
              </li>
              <li>
                <strong>Progressive disclosure</strong> is the load-bearing
                pattern for real density — validates the Blueprint's own Tables
                decision (overflow menu over icon soup or unlimited buttons).
              </li>
              <li>
                <strong>Variable fonts</strong> are now universal — IBM Plex
                Sans/Mono, both genuinely variable, chosen for their
                engineering/technical design heritage rather than as a default
                reach.
              </li>
            </ul>
          </div>
        </div>
      )}

      {tab === "tokens" && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500 max-w-2xl">
            All 8 systems in the same token shape, for direct comparison — the 6
            originals unmodified, plus the two Instrument palettes this phase
            adds. Click any card to step inside a live, interactive preview.
          </p>
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            {ALL_THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => setPreview(theme)}
                className="text-left"
              >
                <TokenSwatchCard theme={theme} />
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === "applied" && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500 max-w-2xl">
            The recommendation, applied to real Blueprint content — pick a
            system to see the exact same screens re-skinned live.
          </p>
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
            {ALL_THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => setPreview(theme)}
                className="text-xs font-semibold px-3 py-3 rounded-xl border text-left hover:border-gray-400"
                style={{
                  background: theme.tokens.pageBg,
                  color: theme.tokens.text,
                }}
              >
                {theme.name}
                <span className="block text-[10px] font-normal mt-0.5 opacity-70">
                  View applied screens →
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
