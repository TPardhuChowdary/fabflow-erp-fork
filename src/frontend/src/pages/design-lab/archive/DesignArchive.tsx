// Design Archive — consolidates every design concept generated across
// all previous Design Lab rounds into one browsable gallery.
//
// This file creates NOTHING new design-wise: it imports and directly
// renders each round's own already-existing, already-exported
// components (ShowcaseTemplate, ExplorationRuntime, AppFrame+modules,
// both LoginScreen variants) exactly as they render inside their own
// original showcase pages. Not one line of any prior round's files is
// touched — see the three "round" source files linked in comments below.
//
// Inventory (verified against the actual files present on disk, not
// from memory) — three rounds exist:
//   Round 1 — "UI Showcase" (../themes.ts, ../ShowcaseTemplate.tsx):
//     6 reference-image-derived styles, later extended with a Login
//     screen per style (../shared/*).
//   Round 2 — "ERP Exploration" (../v2/concepts.ts, ../v2/ExplorationRuntime.tsx):
//     14 concepts (7 practical + 7 radical IA directions), also extended
//     with the same Login system.
//   Round 3 — "Style Lab" (../stylekit/*): 10 aesthetic-movement
//     concepts (Skeuomorphism → Spatial UI), each with its own Login,
//     Dashboard, Projects, Production, Inventory, QMS, Reports, and AI
//     screens plus a desktop/mobile toggle.
//
// One earlier design attempt is NOT included here because it no longer
// exists on disk: an initial inline Dashboard.tsx re-skin (warm token
// palette + pill badges + a greeting header) was built, then fully
// reverted via `git checkout` when the brief changed to "don't touch
// the production ERP" — its diff is gone, so it cannot be gathered
// without reinventing it, which the brief explicitly forbids. Disclosed
// here rather than silently omitted.
import { ArrowLeft, Layers } from "lucide-react";
import { useState } from "react";
import { ShowcaseTemplate } from "../ShowcaseTemplate";
import { LoginScreen as SharedLogin } from "../shared/LoginScreen";
import { loginAssignments } from "../shared/loginAssignments";
import { fromConceptTheme, fromLabTheme } from "../shared/loginTheme";
import { AppFrame, type ModuleKey } from "../stylekit/AppFrame";
import { LoginScreen as StyleKitLogin } from "../stylekit/LoginScreen";
import {
  AiModule,
  CreateEditForm,
  DashboardModule,
  DetailDrawer,
  InventoryModule,
  ProductionModule,
  ProjectsModule,
  QmsModule,
  ReportsModule,
} from "../stylekit/modules";
import { type StyleDef, styles as styleLabStyles } from "../stylekit/styles";
import { type LabTheme, labThemes } from "../themes";
import { ExplorationRuntime } from "../v2/ExplorationRuntime";
import { type Concept, concepts } from "../v2/concepts";
import type { projects as sampleProjects } from "../v2/data";

type ArchiveItem =
  | {
      round: 1;
      kind: "v1";
      id: string;
      name: string;
      blurb: string;
      data: LabTheme;
    }
  | {
      round: 2;
      kind: "v2";
      id: string;
      name: string;
      blurb: string;
      data: Concept;
    }
  | {
      round: 3;
      kind: "stylekit";
      id: string;
      name: string;
      blurb: string;
      data: StyleDef;
    };

const rounds: {
  round: number;
  label: string;
  description: string;
  items: ArchiveItem[];
}[] = [
  {
    round: 1,
    label: "Round 1 — UI Showcase",
    description:
      "6 styles derived from reference images you provided (Intelly dashboard, ReSync sidebar, and 4 style-survey stills).",
    items: labThemes.map((t) => ({
      round: 1,
      kind: "v1",
      id: t.id,
      name: t.name,
      blurb: t.tagline,
      data: t,
    })),
  },
  {
    round: 2,
    label: "Round 2 — ERP Exploration",
    description:
      "14 concepts: 7 practical redesigns (keep FabFlow recognizable) + 7 radical redesigns (rethink the ERP from zero).",
    items: concepts.map((c) => ({
      round: 2,
      kind: "v2",
      id: c.id,
      name: c.name,
      blurb: c.philosophy,
      data: c,
    })),
  },
  {
    round: 3,
    label: "Round 3 — Style Lab",
    description:
      "10 aesthetic-movement concepts (Skeuomorphism, Neomorphism, Glassmorphism, Claymorphism, Minimalism, Maximalism, Brutalism, Liquid Glass, Bento Grid, Spatial UI).",
    items: styleLabStyles.map((s) => ({
      round: 3,
      kind: "stylekit",
      id: s.id,
      name: s.name,
      blurb: s.philosophy,
      data: s,
    })),
  },
];

const allItems = rounds.flatMap((r) => r.items);

export function DesignArchive() {
  const [selected, setSelected] = useState<ArchiveItem | null>(null);
  const [compareWith, setCompareWith] = useState<ArchiveItem | null>(null);
  const [compareMode, setCompareMode] = useState(false);

  if (compareMode) {
    return (
      <CompareView
        onExit={() => setCompareMode(false)}
        left={selected}
        right={compareWith}
        setLeft={setSelected}
        setRight={setCompareWith}
      />
    );
  }

  if (selected) {
    return (
      <ArchivePreview
        item={selected}
        onBack={() => setSelected(null)}
        onCompare={() => setCompareMode(true)}
      />
    );
  }

  return (
    <div className="space-y-8" data-ocid="design-archive.gallery">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Layers className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Design Archive</h1>
          <p className="text-sm text-muted-foreground max-w-2xl mt-1">
            Every design concept generated across all previous Design Lab
            rounds, in one place — {allItems.length} total (
            {rounds.map((r) => r.items.length).join(" + ")}). Nothing here was
            redesigned or recreated; each item renders the exact same component
            its original round uses.
          </p>
        </div>
      </div>

      {rounds.map((r) => (
        <div key={r.round}>
          <div className="mb-2">
            <h2 className="text-sm font-bold">{r.label}</h2>
            <p className="text-xs text-muted-foreground">{r.description}</p>
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {r.items.map((item) => (
              <button
                key={`${item.round}-${item.id}`}
                type="button"
                onClick={() => setSelected(item)}
                className="text-left rounded-xl border bg-card hover:shadow-md transition-shadow overflow-hidden group"
                data-ocid={`design-archive.item.${item.round}.${item.id}`}
              >
                <Swatch item={item} />
                <div className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Round {item.round}
                    </span>
                    <span className="text-[10px] text-muted-foreground group-hover:text-primary transition-colors">
                      Preview →
                    </span>
                  </div>
                  <h3 className="text-sm font-bold">{item.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {item.blurb}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4">
        <h3 className="text-xs font-bold text-amber-800 dark:text-amber-300 mb-1">
          Not recoverable
        </h3>
        <p className="text-xs text-amber-700 dark:text-amber-400">
          One earlier design attempt — an inline redesign of the real
          Dashboard.tsx (warm token palette, pill badges, a greeting header) —
          is not in this archive. It was reverted with <code>git checkout</code>{" "}
          once the brief changed to keep the production ERP untouched, and its
          diff no longer exists on disk. It is not recreated here, per your
          instruction not to invent missing designs.
        </p>
      </div>
    </div>
  );
}

function Swatch({ item }: { item: ArchiveItem }) {
  if (item.kind === "v1") {
    const t = item.data;
    return (
      <div className="h-16 flex" style={{ background: t.tokens.pageBg }}>
        {t.swatch.map((c, i) => (
          <div
            key={`${item.id}-${i}-${c}`}
            className="flex-1"
            style={{ background: c }}
          />
        ))}
      </div>
    );
  }
  if (item.kind === "v2") {
    const t = item.data.theme;
    return (
      <div className="h-16 flex" style={{ background: t.pageBg }}>
        {[t.accent, t.accent2, t.accent3, t.surface].map((c, i) => (
          <div
            key={`${item.id}-${i}-${c}`}
            className="flex-1"
            style={{ background: c }}
          />
        ))}
      </div>
    );
  }
  const t = item.data;
  return (
    <div
      className="h-16 flex items-center justify-center"
      style={{ background: t.pageBg }}
    >
      <div
        className="w-14 h-8"
        style={{
          borderRadius: t.radius === "0px" ? 0 : 6,
          background: t.surface,
          opacity: 0.9,
        }}
      />
    </div>
  );
}

function ArchivePreview({
  item,
  onBack,
  onCompare,
}: { item: ArchiveItem; onBack: () => void; onCompare: () => void }) {
  return (
    <div className="space-y-4" data-ocid="design-archive.preview">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to archive
          </button>
          <h1 className="text-xl font-bold">
            Round {item.round} — {item.name}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
            {item.blurb}
          </p>
        </div>
        <button
          type="button"
          onClick={onCompare}
          className="text-xs font-semibold px-3 py-2 rounded-lg border bg-card hover:bg-accent transition-colors"
        >
          Compare side-by-side →
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl">
        <div className="min-w-[720px]">
          <ItemRenderer item={item} />
        </div>
      </div>
    </div>
  );
}

function ItemRenderer({ item }: { item: ArchiveItem }) {
  const [tab, setTab] = useState<"app" | "login">("app");

  if (item.kind === "v1") {
    const t = item.data;
    return (
      <div className="space-y-2">
        <TabBar tab={tab} setTab={setTab} />
        {tab === "app" ? (
          <ShowcaseTemplate theme={t} />
        ) : (
          <SharedLogin
            theme={fromLabTheme(t.tokens)}
            assignment={loginAssignments[t.id]}
          />
        )}
      </div>
    );
  }
  if (item.kind === "v2") {
    const c = item.data;
    return (
      <div className="space-y-2">
        <TabBar tab={tab} setTab={setTab} />
        {tab === "app" ? (
          <ExplorationRuntime concept={c} />
        ) : (
          <SharedLogin
            theme={fromConceptTheme(c.theme)}
            assignment={loginAssignments[c.id]}
          />
        )}
      </div>
    );
  }
  return <StyleKitPreview style={item.data} />;
}

function TabBar({
  tab,
  setTab,
}: { tab: "app" | "login"; setTab: (t: "app" | "login") => void }) {
  return (
    <div className="flex gap-1 border-b">
      {(["app", "login"] as const).map((tk) => (
        <button
          key={tk}
          type="button"
          onClick={() => setTab(tk)}
          className="px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px transition-colors"
          style={{
            borderColor: tab === tk ? "hsl(var(--primary))" : "transparent",
            color:
              tab === tk
                ? "hsl(var(--foreground))"
                : "hsl(var(--muted-foreground))",
          }}
        >
          {tk === "app" ? "App preview" : "Login screen"}
        </button>
      ))}
    </div>
  );
}

function StyleKitPreview({ style }: { style: StyleDef }) {
  const [tab, setTab] = useState<ModuleKey | "login">("dashboard");
  const [selectedProject, setSelectedProject] = useState<
    (typeof sampleProjects)[number] | null
  >(null);
  const [formOpen, setFormOpen] = useState(false);
  const tabs: (ModuleKey | "login")[] = [
    "dashboard",
    "projects",
    "production",
    "inventory",
    "qms",
    "reports",
    "ai",
    "login",
  ];
  return (
    <div className="space-y-2">
      <div className="flex gap-1 border-b flex-wrap">
        {tabs.map((tk) => (
          <button
            key={tk}
            type="button"
            onClick={() => setTab(tk)}
            className="px-3 py-1.5 text-xs font-semibold capitalize border-b-2 -mb-px transition-colors"
            style={{
              borderColor: tab === tk ? "hsl(var(--primary))" : "transparent",
              color:
                tab === tk
                  ? "hsl(var(--foreground))"
                  : "hsl(var(--muted-foreground))",
            }}
          >
            {tk}
          </button>
        ))}
      </div>
      {tab === "login" ? (
        <StyleKitLogin t={style} />
      ) : (
        <AppFrame
          t={style}
          active={tab as ModuleKey}
          setActive={(k) => setTab(k)}
        >
          {tab === "dashboard" && <DashboardModule t={style} />}
          {tab === "projects" && (
            <div>
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="text-xs font-semibold mb-2"
                style={{ color: style.accent }}
              >
                + New Project
              </button>
              <ProjectsModule t={style} onSelect={setSelectedProject} />
            </div>
          )}
          {tab === "production" && <ProductionModule t={style} />}
          {tab === "inventory" && <InventoryModule t={style} />}
          {tab === "qms" && <QmsModule t={style} />}
          {tab === "reports" && <ReportsModule t={style} />}
          {tab === "ai" && <AiModule t={style} />}
        </AppFrame>
      )}
      {selectedProject && (
        <DetailDrawer
          t={style}
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
        />
      )}
      {formOpen && (
        <CreateEditForm t={style} onClose={() => setFormOpen(false)} />
      )}
    </div>
  );
}

function CompareView({
  left,
  right,
  setLeft,
  setRight,
  onExit,
}: {
  left: ArchiveItem | null;
  right: ArchiveItem | null;
  setLeft: (i: ArchiveItem | null) => void;
  setRight: (i: ArchiveItem | null) => void;
  onExit: () => void;
}) {
  return (
    <div className="space-y-4" data-ocid="design-archive.compare">
      <button
        type="button"
        onClick={onExit}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>
      <div className="grid md:grid-cols-2 gap-4">
        {[
          { item: left, set: setLeft },
          { item: right, set: setRight },
        ].map((slot, i) => (
          <div key={i === 0 ? "left" : "right"} className="space-y-2">
            <select
              className="w-full text-xs px-2.5 py-2 rounded-lg border bg-card"
              value={slot.item ? `${slot.item.round}-${slot.item.id}` : ""}
              onChange={(e) => {
                const found = allItems.find(
                  (it) => `${it.round}-${it.id}` === e.target.value,
                );
                slot.set(found ?? null);
              }}
            >
              <option value="">Choose a design…</option>
              {rounds.map((r) => (
                <optgroup key={r.round} label={r.label}>
                  {r.items.map((it) => (
                    <option
                      key={`${it.round}-${it.id}`}
                      value={`${it.round}-${it.id}`}
                    >
                      {it.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {slot.item ? (
              <div className="overflow-x-auto rounded-xl border">
                <div className="min-w-[500px]">
                  <ItemRenderer item={slot.item} />
                </div>
              </div>
            ) : (
              <div className="rounded-xl border bg-muted/30 p-10 text-center text-xs text-muted-foreground">
                Select a design to compare
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
