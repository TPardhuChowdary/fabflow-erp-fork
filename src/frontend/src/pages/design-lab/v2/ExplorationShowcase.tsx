// ERP Design Exploration — gallery, comparison matrix, and per-concept
// interactive preview entry point. Isolated from the real ERP; isolated
// from the existing 6-style Design Lab (v1) — that stays untouched.
import { ArrowLeft, LayoutGrid, Table2 } from "lucide-react";
import { useState } from "react";
import { LoginScreen } from "../shared/LoginScreen";
import { loginAssignments } from "../shared/loginAssignments";
import { fromConceptTheme } from "../shared/loginTheme";
import { ExplorationRuntime } from "./ExplorationRuntime";
import { type Concept, concepts } from "./concepts";

export function ExplorationShowcase() {
  const [selected, setSelected] = useState<Concept | null>(null);
  const [compare, setCompare] = useState(false);

  if (selected)
    return (
      <ConceptPreview concept={selected} onBack={() => setSelected(null)} />
    );

  const setA = concepts.filter((c) => c.set === "A");
  const setB = concepts.filter((c) => c.set === "B");

  return (
    <div className="space-y-6" data-ocid="design-lab-v2.gallery">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">ERP Design Exploration</h1>
          <p className="text-sm text-muted-foreground max-w-2xl mt-1">
            14 independent design directions — 7 practical redesigns that keep
            FabFlow's module structure recognizable, and 7 radical redesigns
            that rethink how the ERP works from zero. Nothing here is applied to
            the real app.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCompare((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border bg-card hover:bg-accent transition-colors"
        >
          {compare ? (
            <LayoutGrid className="w-3.5 h-3.5" />
          ) : (
            <Table2 className="w-3.5 h-3.5" />
          )}
          {compare ? "Card view" : "Compare all"}
        </button>
      </div>

      {compare ? (
        <ComparisonMatrix onSelect={setSelected} />
      ) : (
        <>
          <ConceptSection
            title="Practical Directions"
            subtitle="Keeps the ERP fundamentally recognizable"
            list={setA}
            onSelect={setSelected}
          />
          <ConceptSection
            title="Radical Redesign Directions"
            subtitle="Rethinks the ERP from zero"
            list={setB}
            onSelect={setSelected}
          />
        </>
      )}
    </div>
  );
}

function ConceptSection({
  title,
  subtitle,
  list,
  onSelect,
}: {
  title: string;
  subtitle: string;
  list: Concept[];
  onSelect: (c: Concept) => void;
}) {
  return (
    <div>
      <div className="mb-2">
        <h2 className="text-sm font-bold">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {list.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c)}
            className="text-left rounded-xl border bg-card hover:shadow-md transition-shadow overflow-hidden group"
            data-ocid={`design-lab-v2.concept.${c.id}`}
          >
            <div className="h-14 flex" style={{ background: c.theme.pageBg }}>
              {[
                c.theme.accent,
                c.theme.accent2,
                c.theme.accent3,
                c.theme.surface,
              ].map((clr, i) => (
                <div
                  key={`${c.id}-sw-${i}-${clr}`}
                  className="flex-1"
                  style={{ background: clr }}
                />
              ))}
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Style {String(c.number).padStart(2, "0")}
                </span>
                <span className="text-[10px] text-muted-foreground group-hover:text-primary transition-colors">
                  Enter preview →
                </span>
              </div>
              <h3 className="text-sm font-bold">{c.name}</h3>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {c.philosophy}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ComparisonMatrix({ onSelect }: { onSelect: (c: Concept) => void }) {
  const cols: { key: keyof Concept; label: string }[] = [
    { key: "targetUser", label: "Target user" },
    { key: "navModel", label: "Navigation" },
    { key: "dashboardModel", label: "Dashboard philosophy" },
    { key: "aiApproach", label: "AI approach" },
    { key: "mobileApproach", label: "Mobile approach" },
  ];
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50">
            <th className="text-left font-semibold p-3 sticky left-0 bg-muted/50">
              Concept
            </th>
            {cols.map((c) => (
              <th
                key={c.key}
                className="text-left font-semibold p-3 min-w-[200px]"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {concepts.map((c) => (
            <tr key={c.id} className="border-t">
              <td className="p-3 sticky left-0 bg-card">
                <button
                  type="button"
                  onClick={() => onSelect(c)}
                  className="text-left"
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block">
                    {c.set === "A" ? "Practical" : "Radical"} ·{" "}
                    {String(c.number).padStart(2, "0")}
                  </span>
                  <span className="font-semibold text-primary">{c.name}</span>
                </button>
              </td>
              {cols.map((col) => (
                <td
                  key={col.key}
                  className="p-3 text-muted-foreground align-top"
                >
                  {String(c[col.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConceptPreview({
  concept,
  onBack,
}: { concept: Concept; onBack: () => void }) {
  const qa: { q: string; a: string }[] = [
    { q: "What is the design philosophy?", a: concept.philosophy },
    { q: "Who is it optimized for?", a: concept.targetUser },
    { q: "What makes it different?", a: concept.differentiator },
    { q: "How does navigation work?", a: concept.navModel },
    { q: "How does the dashboard work?", a: concept.dashboardModel },
    { q: "How are data-heavy screens handled?", a: concept.dataHeavyHandling },
    { q: "How are forms handled?", a: concept.formsHandling },
    { q: "How are detail pages handled?", a: concept.detailPagesHandling },
    { q: "How does AI work?", a: concept.aiApproach },
    { q: "How does mobile work?", a: concept.mobileApproach },
    {
      q: "Why would this be better than a conventional ERP?",
      a: concept.whyBetter,
    },
    { q: "What are its weaknesses?", a: concept.weaknesses },
  ];
  const [tab, setTab] = useState<"app" | "login">("app");
  const loginAssignment = loginAssignments[concept.id];
  return (
    <div className="space-y-4" data-ocid="design-lab-v2.preview">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to exploration
        </button>
        <h1 className="text-xl font-bold">
          {concept.set === "A" ? "Practical" : "Radical"} · Style{" "}
          {String(concept.number).padStart(2, "0")} — {concept.name}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {concept.philosophy}
        </p>
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
            data-ocid={`design-lab-v2.tab.${tKey}`}
          >
            {tKey === "app" ? "App preview" : "Login screen"}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-4 items-start">
        <div className="overflow-x-auto rounded-xl">
          <div className="min-w-[760px]">
            {tab === "app" ? (
              <ExplorationRuntime concept={concept} />
            ) : (
              <div className="max-w-2xl">
                <LoginScreen
                  theme={fromConceptTheme(concept.theme)}
                  assignment={loginAssignment}
                />
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
              Strengths
            </h3>
            <ul className="space-y-1.5">
              {concept.strengths.map((s) => (
                <li
                  key={s}
                  className="text-xs text-muted-foreground flex gap-1.5"
                >
                  <span className="text-primary shrink-0">+</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
              Tradeoffs
            </h3>
            <ul className="space-y-1.5">
              {concept.tradeoffs.map((s) => (
                <li
                  key={s}
                  className="text-xs text-muted-foreground flex gap-1.5"
                >
                  <span className="shrink-0">−</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
              Best-fit modules
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {concept.bestModules.map((m) => (
                <span
                  key={m}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
          Full design answers
        </h3>
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-3">
          {qa.map((item) => (
            <div key={item.q}>
              <p className="text-xs font-semibold">{item.q}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.a}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground/70 italic">
        Try: click "Projects" in the nav for a sortable table, click any row's
        "View" for a detail drawer, open ⌘K for the command palette, and use
        "Ask AI" / the docked AI panel — responses are canned demonstrations of
        the interaction pattern (this sandbox has no live LLM connection),
        disclosed here and in the final report.
      </p>
    </div>
  );
}
