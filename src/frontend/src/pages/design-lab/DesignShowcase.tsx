// Design Lab — gallery + interactive preview entry point.
//
// This page is entirely isolated from the real ERP: it uses none of the
// app's shared components, none of its global CSS tokens, and no live
// business data. It exists purely to present 6 independent design
// directions for review. See themes.ts for the source/principle notes.
import { ArrowLeft, Palette } from "lucide-react";
import { useState } from "react";
import { ShowcaseTemplate } from "./ShowcaseTemplate";
import { LoginScreen } from "./shared/LoginScreen";
import { loginAssignments } from "./shared/loginAssignments";
import { fromLabTheme } from "./shared/loginTheme";
import { type LabTheme, labThemes } from "./themes";

export function DesignShowcase() {
  const [selected, setSelected] = useState<LabTheme | null>(null);

  if (selected) {
    return <StylePreview theme={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="space-y-6" data-ocid="design-lab.gallery">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Palette className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Design Lab — UI Showcase</h1>
          <p className="text-sm text-muted-foreground max-w-2xl mt-1">
            Six independent design directions, each translated from a reference
            image into a small interactive ERP demo. Nothing here affects the
            real application — pick a style below to step inside it, then use
            "Back to gallery" to compare another.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {labThemes.map((theme, i) => (
          <button
            key={theme.id}
            type="button"
            onClick={() => setSelected(theme)}
            className="text-left rounded-xl border bg-card hover:shadow-md transition-shadow overflow-hidden group"
            data-ocid={`design-lab.style.${i + 1}`}
          >
            <div
              className="h-20 flex"
              style={{ background: theme.tokens.pageBg }}
            >
              {theme.swatch.map((c, idx) => (
                <div
                  key={`${theme.id}-${idx}`}
                  className="flex-1"
                  style={{ background: c }}
                />
              ))}
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Style {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[10px] text-muted-foreground group-hover:text-primary transition-colors">
                  Enter preview →
                </span>
              </div>
              <h3 className="text-sm font-bold">{theme.name}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {theme.tagline}
              </p>
              <p className="text-[10px] text-muted-foreground/70 mt-2 italic">
                {theme.sourceLabel}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StylePreview({
  theme,
  onBack,
}: { theme: LabTheme; onBack: () => void }) {
  const idx = labThemes.findIndex((s) => s.id === theme.id);
  const [tab, setTab] = useState<"app" | "login">("app");
  const loginAssignment = loginAssignments[theme.id];
  return (
    <div className="space-y-4" data-ocid="design-lab.preview">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mb-2"
            data-ocid="design-lab.back_to_gallery"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to gallery
          </button>
          <h1 className="text-xl font-bold">
            Style {String(idx + 1).padStart(2, "0")} — {theme.name}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {theme.sourceLabel}
          </p>
        </div>
        <div className="flex gap-1.5">
          {theme.swatch.map((c, i) => (
            <div
              key={`${theme.id}-swatch-${i}-${c}`}
              className="w-6 h-6 rounded-full border border-border"
              style={{ background: c }}
              title={c}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-1 border-b">
        {(["app", "login"] as const).map((tKey) => (
          <button
            key={tKey}
            type="button"
            onClick={() => setTab(tKey)}
            className="px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors"
            style={{
              borderColor: tab === tKey ? "hsl(var(--primary))" : "transparent",
              color:
                tab === tKey
                  ? "hsl(var(--foreground))"
                  : "hsl(var(--muted-foreground))",
            }}
            data-ocid={`design-lab.tab.${tKey}`}
          >
            {tKey === "app" ? "App preview" : "Login screen"}
          </button>
        ))}
      </div>

      {tab === "app" ? (
        <div className="grid lg:grid-cols-[1fr_260px] gap-4 items-start">
          {/* The mini-ERP demo represents a desktop layout on purpose (that's
              the point of the sidebar/KPI-grid structure) — on a narrow
              viewport it scrolls horizontally within this frame rather than
              squishing illegibly or forcing the whole page to scroll
              sideways, matching the real app's own table-wrapper convention
              (see index.css's "ONLY tables may scroll horizontally" rule). */}
          <div className="overflow-x-auto rounded-xl">
            <div className="min-w-[720px]">
              <ShowcaseTemplate theme={theme} />
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
              Design principles
            </h3>
            <ul className="space-y-2">
              {theme.principles.map((p) => (
                <li
                  key={p}
                  className="text-xs text-muted-foreground leading-relaxed flex gap-1.5"
                >
                  <span className="text-primary shrink-0">—</span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl">
          <div className="min-w-[500px] max-w-2xl">
            <LoginScreen
              theme={fromLabTheme(theme.tokens)}
              assignment={loginAssignment}
            />
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground/70 italic">
        {tab === "app"
          ? 'Try: switch the "Show" selector inside the table for empty/loading/error states, open "+ New Project" for the dialog, click a row\'s "View" link or the bell icon for a toast, and resize your browser to see the responsive behavior.'
          : 'Try: submit with any password to see the error state, or password "demo" to see it succeed (loading state included either way) — this is a demonstration of the login interaction, not real authentication.'}
      </p>
    </div>
  );
}
