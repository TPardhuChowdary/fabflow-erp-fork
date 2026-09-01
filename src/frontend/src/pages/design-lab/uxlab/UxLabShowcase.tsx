// UX Redesign Lab — gallery + switcher for all 10 working UX prototypes
// (5 upgraded originals + 5 new). Isolated: its own store/primitives, no
// dependency on the real app or on any prior Design Lab round.
import { ArrowLeft, Layers } from "lucide-react";
import { useState } from "react";
import { Model1Pipeline } from "./models/Model1Pipeline";
import { Model2Attention } from "./models/Model2Attention";
import { Model3Workspace } from "./models/Model3Workspace";
import { Model4Command } from "./models/Model4Command";
import { Model5Traditional } from "./models/Model5Traditional";
import { Model6Graph } from "./models/Model6Graph";
import { Model7Timeline } from "./models/Model7Timeline";
import { Model8RoleBased } from "./models/Model8RoleBased";
import { Model9Briefing } from "./models/Model9Briefing";
import { Model10Feed } from "./models/Model10Feed";
import { ConfirmProvider, ToastProvider } from "./primitives";
import { UxLoginScreen } from "./shared/LoginScreen";
import { UxLabStoreProvider } from "./store";

interface ModelDef {
  id: string;
  number: number;
  name: string;
  philosophy: string;
  nav: string;
  dashboard: string;
  workflow: string;
  ai: string;
  strengths: string[];
  tradeoffs: string[];
  Component: React.ComponentType;
}

const models: ModelDef[] = [
  {
    id: "m1",
    number: 1,
    name: "Order Pipeline",
    philosophy:
      "The business process itself is the navigation — Quotation → Production → Quality → Invoice — not module names.",
    nav: "Horizontal pipeline stepper; a thin secondary menu holds non-pipeline modules.",
    dashboard:
      "The pipeline IS the dashboard — stage counts and blocked orders are visible at all times, no separate summary screen.",
    workflow:
      "Select a stage → see every order there → open one → act → it moves forward in the pipeline for real.",
    ai: "None — this model is deliberately process-driven, not AI-mediated.",
    strengths: [
      "Matches how manufacturing actually flows (Peak-End: the process has a clear beginning/middle/end)",
      "Very learnable — one mental model for the whole ERP",
      "Blocked orders are impossible to miss",
    ],
    tradeoffs: [
      "Non-pipeline modules (Employees, Settings) feel like second-class citizens",
      "Less good for someone who just wants to look up one customer",
    ],
    Component: Model1Pipeline,
  },
  {
    id: "m2",
    number: 2,
    name: "Attention Queue",
    philosophy:
      "Home shows only what genuinely needs a decision — computed live from real state, not a static list.",
    nav: "Two modes: Attention (default) and Browse (full module list) — kept deliberately separate.",
    dashboard:
      "Is the queue itself. An empty queue is a real, celebrated 'all clear' state, not just an empty list.",
    workflow:
      "Resolve the cause via the real shared workspace screens → the item verifiably disappears from the queue.",
    ai: "None — the 'intelligence' is real computed exception logic (overdue dates, blocked stages, low stock), not a chat layer.",
    strengths: [
      "Directly optimizes for the scarcest resource: attention (Miller's Law — don't overload working memory with what's fine)",
      "Extremely fast to scan for an overloaded manager",
      "Von Restorff effect: red/amber items stand out because nothing else competes for attention",
    ],
    tradeoffs: [
      "Poor fit for exploratory/browsing work",
      "Needs well-tuned thresholds or it either misses real problems or cries wolf",
    ],
    Component: Model2Attention,
  },
  {
    id: "m3",
    number: 3,
    name: "Workspace",
    philosophy:
      "You open a Project or Customer WORKSPACE, not a module — everything related is already cross-linked there.",
    nav: "A workspace list (projects/customers) plus a 'recent' rail for cheap context-switching.",
    dashboard:
      "No separate dashboard — the workspace itself, opened fresh, is the entry point.",
    workflow:
      "Open PROJ-2026-013 → its quotation, production stages, QMS, invoice, and related PO are all already there via real foreign-key lookups.",
    ai: "None — cross-linking is done with real relational lookups, which is the more honest fix for the 'modules don't connect' problem than an AI layer would be.",
    strengths: [
      "Directly fixes this session's own audited weakness: modules never linked to each other",
      "Matches how people actually think about a job ('everything about PROJ-2026-013'), not the database schema",
      "Recent rail respects recognition-over-recall",
    ],
    tradeoffs: [
      "Cross-cutting reports (e.g. 'all overdue invoices company-wide') need the separate Browse list, not a workspace",
      "A new user has to learn 'workspace' as a concept",
    ],
    Component: Model3Workspace,
  },
  {
    id: "m4",
    number: 4,
    name: "Command",
    philosophy:
      "A persistent command bar is the primary way to move and act — and it genuinely executes, unlike this session's earlier command palette.",
    nav: "No sidebar at all. Everything is typed: module names, order/PO/invoice references, or plain requests.",
    dashboard:
      "A running log of what you asked and what happened — the log itself is the activity record.",
    workflow:
      'Type "approve PO-2026-041" → real confirm dialog → real state mutation → toast → the PO is genuinely approved everywhere it\'s referenced.',
    ai: "The one model where 'AI' is a real (if simple) intent parser — matches references, actions, and module names against live data, not scripted replies.",
    strengths: [
      "Fastest path for a trained user who knows what they want (Hick's Law: fewer decisions than hunting a menu)",
      "Naturally auditable — the conversation IS the log",
      "Proves the difference between a real command system and a decorative one",
    ],
    tradeoffs: [
      "Zero discoverability for a first-time user — nothing to browse",
      "The parser only understands a fixed vocabulary; anything else needs the fallback message",
    ],
    Component: Model4Command,
  },
  {
    id: "m5",
    number: 5,
    name: "Simplified Traditional",
    philosophy:
      "No reinvention — a classic sidebar ERP, but every fundamental (search, sort, validation, cross-links) genuinely works.",
    nav: "Familiar left sidebar covering every real FabFlow module.",
    dashboard:
      "Compact KPI row + active-projects list — recognizable, not novel.",
    workflow:
      "Click a project → real workspace with real actions, same depth as every other model, inside the most familiar shell.",
    ai: "None — deliberately excluded, to isolate 'does a boringly conventional ERP work well if you just do the basics right' as its own answer.",
    strengths: [
      "Jakob's Law: near-zero learning cost — matches every other business tool",
      "Lowest-risk direction to actually ship",
      "Proves the audited gaps (no real search/validation/cross-links) were fixable without any structural reinvention",
    ],
    tradeoffs: [
      "Least distinctive — doesn't rethink anything structurally",
      "Doesn't solve the 'what needs my attention' problem as directly as Model 2",
    ],
    Component: Model5Traditional,
  },
  {
    id: "m6",
    number: 6,
    name: "Relationship Graph",
    philosophy:
      "Records are literal connected nodes — Customer → Quotation → Project → PO/Invoice — not rows in separate tables.",
    nav: "A 4-column node graph replaces the sidebar entirely; a thin drawer covers modules that aren't naturally graph-shaped.",
    dashboard:
      "The graph itself, drawn from real foreign keys (SVG lines between actually-related records) — no separate summary.",
    workflow:
      "Click a node → its real record opens; the graph stays as the 'you are here' map underneath.",
    ai: "None — the relationships are real data lookups, not an AI narrative.",
    strengths: [
      "Directly visualizes proximity/common-region (Gestalt) between related records",
      "Makes it obvious at a glance which projects have no PO yet, or which quotations never converted",
      "Genuinely novel for an ERP without sacrificing real data grounding",
    ],
    tradeoffs: [
      "Doesn't scale visually much past a few dozen records without clustering",
      "Unfamiliar — needs the most onboarding of any of the 10",
    ],
    Component: Model6Graph,
  },
  {
    id: "m7",
    number: 7,
    name: "Timeline",
    philosophy:
      "Time is the primary axis of the whole ERP — every dated event across every module is one real merged, sorted feed.",
    nav: "No sidebar-as-primary-nav — a vertical scrubbable timeline is the main surface; a drawer covers non-time-shaped modules.",
    dashboard:
      "'Today' is a marked point on the timeline; recent past and near future are visible in the same scroll.",
    workflow:
      "Scroll to an event → click it → its real record opens, in place.",
    ai: "None — this is real sorted date data (quotation dates, invoice due dates, dispatch dates, inspection dates), not a generated narrative.",
    strengths: [
      "Answers 'when' — the most common ERP question — by default (matches real-world mental models)",
      "Naturally shows the recent past and near future in one continuous view",
      "Serial-position-friendly: today's marker anchors the whole view",
    ],
    tradeoffs: [
      "Records with no meaningful date (e.g. a Tool's condition) don't fit this model at all",
      "Dense periods can get visually crowded without date-range filtering (not built here)",
    ],
    Component: Model7Timeline,
  },
  {
    id: "m8",
    number: 8,
    name: "Role-Based Workspace",
    philosophy:
      "FabFlow isn't one job — a production supervisor, a QC inspector, and an accountant need genuinely different homes, not the same shell with permission flags.",
    nav: "After login, pick a role; your priority modules move to the top and your dashboard is scoped to your area — same real data underneath.",
    dashboard:
      "Role-scoped: only attention items relevant to your department, plus quick-open tiles for your top 2 priority modules.",
    workflow:
      "Everything else remains reachable under 'Everything else' — nothing is hidden, just reordered by relevance.",
    ai: "None — role relevance is a simple real filter over the same attentionItems every model uses.",
    strengths: [
      "Directly reduces Hick's-Law decision cost for someone who only cares about their own area",
      "Matches real organizational structure instead of a generic one-size-fits-all IA",
      "Nothing is actually hidden or removed — full access stays one click away",
    ],
    tradeoffs: [
      "Requires an extra step (role selection) before you're productive",
      "A person with a hybrid job (wears two hats) has to switch roles to see both",
    ],
    Component: Model8RoleBased,
  },
  {
    id: "m9",
    number: 9,
    name: "AI Briefing",
    philosophy:
      "Different from Model 04's reactive command bar — the AI speaks FIRST, unprompted, with a real generated narrative instead of waiting to be asked.",
    nav: "Minimal — the briefing paragraph IS the home screen; a drawer covers full module browsing.",
    dashboard:
      "A short narrative, generated from live computed numbers (not a scripted string), with every referenced record as a clickable inline link.",
    workflow:
      "Read the briefing → click any bolded/underlined reference → its real record opens.",
    ai: "The narrative sentence structure is template-driven but every number and reference inside it is pulled live from the real store — verified by triggering a real action elsewhere and watching the briefing's wording change on next view.",
    strengths: [
      "Peak-End rule: the most important information is the very first thing you see, unprompted",
      "Removes the 'what should I ask' burden Model 04 still has",
      "Reads naturally, like a human handover note",
    ],
    tradeoffs: [
      "A generated paragraph is slower to scan than a table once you have many items",
      "Less precise/controllable than Model 04's direct command execution",
    ],
    Component: Model9Briefing,
  },
  {
    id: "m10",
    number: 10,
    name: "Activity Feed",
    philosophy:
      "Different from Model 02's exceptions-only queue — this shows EVERYTHING (successes included) as one reverse-chronological feed; unresolved items stay visually open until handled.",
    nav: "The feed is the whole home surface; a drawer covers full module browsing.",
    dashboard:
      "Is the feed — open items (amber, actionable) mixed with settled history (quiet, gray) in real chronological order.",
    workflow:
      "Click 'Handle' on an open item → real confirm → real resolve/approve action → it visually settles into history in place.",
    ai: "None — feed composition is a real merge-and-sort over live store events, not generated text.",
    strengths: [
      "Zeigarnik effect: open items stay visibly 'unfinished' until genuinely resolved, not just filtered out of view",
      "Gives full context (the good AND the bad) that Model 02 deliberately omits",
      "Familiar social/notification-feed mental model (Jakob's Law) applied to ERP work",
    ],
    tradeoffs: [
      "Noisier than Model 02 for someone who only wants exceptions",
      "Long-running businesses would need pagination/date-range limits not built into this prototype",
    ],
    Component: Model10Feed,
  },
];

export function UxLabShowcase() {
  const [selected, setSelected] = useState<ModelDef | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  if (selected) {
    return (
      <div className="space-y-4" data-ocid="uxlab.preview">
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setLoggedIn(false);
          }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to the 10 models
        </button>
        <div>
          <h1 className="text-xl font-bold">
            Model {String(selected.number).padStart(2, "0")} — {selected.name}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
            {selected.philosophy}
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-3 text-xs">
          <Meta label="Navigation" value={selected.nav} />
          <Meta label="Dashboard" value={selected.dashboard} />
          <Meta label="Workflow" value={selected.workflow} />
          <Meta label="AI approach" value={selected.ai} />
        </div>
        <div className="overflow-x-auto rounded-xl">
          <div className="min-w-[760px]" style={{ height: "680px" }}>
            <ToastProvider>
              <ConfirmProvider>
                <UxLabStoreProvider>
                  {loggedIn ? (
                    <selected.Component />
                  ) : (
                    <UxLoginScreen
                      modelName={selected.name}
                      onSuccess={() => setLoggedIn(true)}
                    />
                  )}
                </UxLabStoreProvider>
              </ConfirmProvider>
            </ToastProvider>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
              Strengths
            </h3>
            <ul className="space-y-1.5">
              {selected.strengths.map((s) => (
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
              Trade-offs
            </h3>
            <ul className="space-y-1.5">
              {selected.tradeoffs.map((s) => (
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
        </div>
        <p className="text-[11px] text-muted-foreground/70 italic">
          Log in with password "demo". Every action is real for this session's
          state: approving a PO, resolving an NCR, advancing a production stage,
          recording a payment, and accepting a quotation (which creates a real
          new project) all genuinely mutate the shared store and are reflected
          everywhere that data is referenced.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-ocid="uxlab.gallery">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Layers className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">
            UX Redesign Lab — 10 Working Models
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl mt-1">
            Ten genuinely different ways to organize and use the complete
            FabFlow ERP — not ten color themes. Every model shares the same
            real, mutable mock dataset covering every real FabFlow module, and
            the same real actions (approve, resolve, advance, pay, accept) —
            what differs is how you navigate to them and what happens first.
          </p>
        </div>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {models.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setSelected(m)}
            className="text-left rounded-xl border bg-card hover:shadow-md transition-shadow p-4"
            data-ocid={`uxlab.model.${m.id}`}
          >
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Model {String(m.number).padStart(2, "0")}
            </span>
            <h3 className="text-sm font-bold mt-1">{m.name}</h3>
            <p className="text-xs text-muted-foreground mt-1">{m.philosophy}</p>
            <span className="text-[10px] text-primary mt-2 inline-block">
              Open working prototype →
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="font-bold text-muted-foreground uppercase text-[10px] mb-1">
        {label}
      </p>
      <p className="text-muted-foreground">{value}</p>
    </div>
  );
}
