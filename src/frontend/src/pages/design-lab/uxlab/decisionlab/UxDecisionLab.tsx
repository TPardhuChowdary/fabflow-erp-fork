// UX Consolidation / Decision Lab.
//
// A UX ARCHITECTURE DECISION phase, not implementation — production is
// untouched, nothing here is applied to it. This is a new, clearly
// separated surface inside the existing Design Lab (additive route,
// same pattern as the 5 Design Lab entries already in App.tsx/
// Layout.tsx), extending the existing 31-module Final UX Prototype's
// own real store/screens rather than duplicating them.
//
// See UX_CONSOLIDATION.md for the full written analysis this renders —
// that file is the source of truth; this component is a presentation
// layer over content.ts's structured transcription of it.
import {
  BarChart3,
  ClipboardCheck,
  FileText,
  GitCompare,
  Layers,
  Map as MapIcon,
  Smartphone,
} from "lucide-react";
import { useState } from "react";
import { ConfirmProvider, ToastProvider } from "../primitives";
import { ModuleRouter, type ViewKey } from "../shared/ModuleRouter";
import { ROLES } from "../shared/roleAccess";
import { UxLabStoreProvider } from "../store";
import {
  BEFORE_AFTER,
  BLUEPRINT,
  CROSS_CUTTING,
  type Decision,
  MATRIX,
} from "./content";
import { FinalDashboard } from "./screens/FinalDashboard";
import { FinalProjectWorkspace } from "./screens/FinalProjectWorkspace";
import { MobileDemo } from "./screens/MobileDemo";
import { ReusedFrame } from "./screens/ReusedFrame";

const TABS = [
  { id: "verdict", label: "Executive Verdict", icon: GitCompare },
  { id: "matrix", label: "Decision Matrix", icon: ClipboardCheck },
  { id: "cross-cutting", label: "Cross-Cutting", icon: Layers },
  { id: "blueprint", label: "Final Blueprint", icon: MapIcon },
  { id: "screens", label: "Representative Screens", icon: BarChart3 },
  { id: "before-after", label: "Before / After", icon: FileText },
] as const;
type TabId = (typeof TABS)[number]["id"];

const DECISION_STYLE: Record<Decision, string> = {
  KEEP: "bg-gray-100 text-gray-700",
  ADOPT: "bg-emerald-100 text-emerald-700",
  HYBRID: "bg-amber-100 text-amber-700",
  REJECT: "bg-red-100 text-red-700",
};

function DecisionPill({ d }: { d: Decision }) {
  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${DECISION_STYLE[d]}`}
    >
      {d}
    </span>
  );
}

const DEMO_PROJECT_ID = "proj-1"; // Bracket Assembly — Line 3 Retrofit; real seeded data with production/QMS/invoice/drawings all populated.

const SCREEN_KEYS = [
  "dashboard",
  "project-workspace",
  "production",
  "qms",
  "inventory",
  "finance",
  "settings",
  "agent",
  "dense-table",
  "complex-form",
  "complex-dialog",
  "mobile",
] as const;
type ScreenKey = (typeof SCREEN_KEYS)[number];

const SCREEN_LABEL: Record<ScreenKey, string> = {
  dashboard: "Dashboard",
  "project-workspace": "Project Workspace",
  production: "Production",
  qms: "QMS",
  inventory: "Inventory",
  finance: "Finance (Invoices)",
  settings: "Settings",
  agent: "AI Agent",
  "dense-table": "Dense table",
  "complex-form": "Complex form",
  "complex-dialog": "Complex dialog",
  mobile: "Mobile behavior",
};

function ScreensTab() {
  const [screen, setScreen] = useState<ScreenKey>("dashboard");
  const noopNavigate = (_v: string, _id: string) => {};

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 flex-wrap">
        {SCREEN_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setScreen(k)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${screen === k ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600"}`}
          >
            {SCREEN_LABEL[k]}
          </button>
        ))}
      </div>

      <div className="rounded-xl border bg-gray-50 p-4">
        {screen === "dashboard" && (
          <FinalDashboard
            role={ROLES[0]}
            navigate={noopNavigate as (v: ViewKey, id: string) => void}
          />
        )}
        {screen === "project-workspace" && (
          <FinalProjectWorkspace
            projectId={DEMO_PROJECT_ID}
            onNavigate={noopNavigate}
          />
        )}
        {screen === "production" && (
          <ReusedFrame
            decision="HYBRID"
            reason="Sequential-lock UI is already correct and reused as-is. Production's real QMS-gate check and rework flow are not yet reproduced here — see Decision Matrix row 20."
          >
            <ModuleRouter view="production" id="" onNavigate={noopNavigate} />
          </ReusedFrame>
        )}
        {screen === "qms" && (
          <ReusedFrame
            decision="HYBRID"
            reason="The real 11-status legal-transition table is already correct and reused as-is. Production's insert-only attempts audit trail is not yet reproduced here — see Decision Matrix row 22-26."
          >
            <ModuleRouter view="qms" id="" onNavigate={noopNavigate} />
          </ReusedFrame>
        )}
        {screen === "inventory" && (
          <ReusedFrame
            decision="HYBRID"
            reason="Reserved/Available split restored during this pass (was the specific named gap in Decision Matrix row 9) — Total/Reserved/Available columns below are real, not illustrative."
          >
            <ModuleRouter view="inventory" id="" onNavigate={noopNavigate} />
          </ReusedFrame>
        )}
        {screen === "finance" && (
          <ReusedFrame
            decision="KEEP"
            reason="Same tax model, same actions as production — no real UX delta found. Reused as-is; see Decision Matrix row 6."
          >
            <ModuleRouter view="invoices" id="" onNavigate={noopNavigate} />
          </ReusedFrame>
        )}
        {screen === "settings" && (
          <ReusedFrame
            decision="KEEP"
            reason="Already matches production's flat single-scroll layout and real permission-matrix editor — no divergence to adjudicate. See Decision Matrix row 29."
          >
            <ModuleRouter view="settings" id="" onNavigate={noopNavigate} />
          </ReusedFrame>
        )}
        {screen === "agent" && (
          <ReusedFrame
            decision="KEEP"
            reason="Not a UX call — Classic-mode-only is an infrastructure limit (no LLM key holder), not a design decision. See Decision Matrix row 30."
          >
            <ModuleRouter view="ai-agent" id="" onNavigate={noopNavigate} />
          </ReusedFrame>
        )}
        {screen === "dense-table" && (
          <ReusedFrame
            decision="HYBRID"
            reason="Cross-Cutting 'Tables' decision: Reserved/Available split restored (row 9); the row-action pattern here still uses explicit text buttons rather than the target overflow-menu treatment specified for tables with 4+ actions."
          >
            <ModuleRouter view="inventory" id="" onNavigate={noopNavigate} />
          </ReusedFrame>
        )}
        {screen === "complex-form" && (
          <ReusedFrame
            decision="HYBRID"
            reason={
              'Cross-Cutting "Forms" decision: real-time GST math and validation are already correct — click "+ New Quotation" to see the dialog. Production\'s equivalent modal is visibly cramped past ~4 line items; this one is not.'
            }
          >
            <ModuleRouter view="quotations" id="" onNavigate={noopNavigate} />
          </ReusedFrame>
        )}
        {screen === "complex-dialog" && (
          <ReusedFrame
            decision="HYBRID"
            reason={
              'Cross-Cutting "Dialogs" decision: one shared confirm-dialog primitive, production\'s real copy — open a Project QMS inspection and record a characteristic result to see it in action.'
            }
          >
            <ModuleRouter view="qms" id="" onNavigate={noopNavigate} />
          </ReusedFrame>
        )}
        {screen === "mobile" && <MobileDemo projectId={DEMO_PROJECT_ID} />}
      </div>
    </div>
  );
}

export function UxDecisionLab() {
  const [tab, setTab] = useState<TabId>("verdict");

  return (
    <ToastProvider>
      <ConfirmProvider>
        <UxLabStoreProvider>
          <div className="space-y-4" data-ocid="uxlab.decisionlab">
            <div>
              <h1 className="text-xl font-bold">
                UX Consolidation / Decision Lab
              </h1>
              <p className="text-sm text-gray-500 mt-1 max-w-3xl">
                A UX architecture decision phase — production stays completely
                untouched. Every meaningful production/prototype difference
                classified KEEP / ADOPT / HYBRID / REJECT, judged against real
                usability criteria, not visual novelty. Nothing here is applied
                to production until explicitly approved.
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
              <div className="max-w-3xl space-y-4 text-sm leading-relaxed text-gray-800">
                <p>
                  <strong>
                    Neither app wins outright, and they're not competing on the
                    same axis.
                  </strong>{" "}
                  Production is a mature, complete, single-window CRUD system —
                  every module a full-page list-then-detail flow, real
                  validation, real consequences. The prototype is a UX
                  architecture testbed: the same fields and actions, wrapped in
                  cross-cutting layers (Role, Attention, Relationship, Command)
                  production has none of. The real difference, and the real
                  value, is in what sits <em>around</em> the screens, not the
                  screens themselves.
                </p>
                <div className="rounded-xl border bg-white p-4">
                  <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">
                    What production does better
                  </h3>
                  <ul className="list-disc list-inside space-y-1 text-xs text-gray-700">
                    <li>
                      <strong>Real document output</strong> — every
                      Print/Download/Share in the prototype is a toast;
                      production actually renders files.
                    </li>
                    <li>
                      <strong>
                        Data-integrity guardrails baked into the UI
                      </strong>{" "}
                      — Inventory's real Reserved/Available split and inline
                      rules, the real Production Summary yield breakdown.
                    </li>
                    <li>
                      <strong>Depth where depth is earned</strong> —
                      EmployeeDetail's payroll, the Drawing Editor's canvas
                      engine, QMS's audit trail.
                    </li>
                  </ul>
                </div>
                <div className="rounded-xl border bg-white p-4">
                  <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">
                    What the prototype does better
                  </h3>
                  <ul className="list-disc list-inside space-y-1 text-xs text-gray-700">
                    <li>
                      <strong>
                        It has an attention system; production has a banner.
                      </strong>{" "}
                      Confirmed live: production's dashboard reads "All clear"
                      as a static line.
                    </li>
                    <li>
                      <strong>
                        It has a command surface; production has none.
                      </strong>{" "}
                      ⌘K does nothing in production — confirmed live this pass.
                    </li>
                    <li>
                      <strong>
                        It stops making users guess what an icon does.
                      </strong>{" "}
                      Production's row actions run up to 7 unlabeled icons wide
                      — confirmed live on Quotations.
                    </li>
                    <li>
                      <strong>Cross-module context in one place</strong> — the
                      Project Workspace is the clearest case; see Final
                      Blueprint §4.1.
                    </li>
                  </ul>
                </div>
                <p>
                  <strong>What must be preserved, full stop:</strong> every
                  field, validation rule, status transition, and calculation
                  currently in production — including the ones the prototype
                  hasn't touched yet. None of these get silently dropped because
                  the prototype doesn't have them; the Final Blueprint tab says
                  explicitly how each survives.
                </p>
                <p>
                  <strong>What should change:</strong> the shell. Grouped,
                  role-aware navigation instead of one long always-expanded
                  list. A real attention system instead of a static banner. A
                  command palette. Explicit-but-space-conscious row actions. And
                  — the centerpiece — a Project Workspace that keeps every one
                  of production's 12 tabs' worth of real capability but stops
                  making "check on an order" cost five separate page loads.
                </p>
              </div>
            )}

            {tab === "matrix" && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 max-w-3xl">
                  15 of 31 rows land on KEEP or effective-tie — the prototype
                  mostly reproduces production's interaction pattern faithfully
                  rather than reinventing it, correct for CRUD screens nobody
                  asked to have redesigned. 9 rows are real HYBRID cases where
                  each side is missing something the other has. Zero rows are a
                  clean REJECT of a prototype idea on its own screen — REJECT
                  judgments in this audit are all at the cross-cutting layer,
                  not the module layer.
                </p>
                <div className="rounded-xl border bg-white overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500 border-b bg-gray-50">
                        <th className="text-left p-2.5">#</th>
                        <th className="text-left p-2.5">Module</th>
                        <th className="text-left p-2.5">Category</th>
                        <th className="text-left p-2.5">Winner</th>
                        <th className="text-left p-2.5">Decision</th>
                        <th className="text-left p-2.5">Reason</th>
                        <th className="text-left p-2.5">Must preserve</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MATRIX.map((row) => (
                        <tr
                          key={row.n}
                          className="border-b last:border-0 align-top"
                        >
                          <td className="p-2.5 font-mono text-gray-400">
                            {row.n}
                          </td>
                          <td className="p-2.5 font-semibold whitespace-nowrap">
                            {row.module}
                          </td>
                          <td className="p-2.5 text-gray-500 whitespace-nowrap">
                            {row.category}
                          </td>
                          <td className="p-2.5 text-gray-500">{row.winner}</td>
                          <td className="p-2.5">
                            <DecisionPill d={row.decision} />
                          </td>
                          <td className="p-2.5 text-gray-700 min-w-[240px]">
                            {row.reason}
                          </td>
                          <td className="p-2.5 text-gray-500 min-w-[200px]">
                            {row.preserve}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {tab === "cross-cutting" && (
              <div className="grid md:grid-cols-2 gap-4">
                {CROSS_CUTTING.map((c) => (
                  <div key={c.area} className="rounded-xl border bg-white p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold">{c.area}</h3>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${c.decision === "REJECT" ? DECISION_STYLE.REJECT : c.decision === "ADOPT" ? DECISION_STYLE.ADOPT : c.decision === "KEEP" ? DECISION_STYLE.KEEP : DECISION_STYLE.HYBRID}`}
                      >
                        {c.decision}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-gray-800 mb-1.5">
                      {c.summary}
                    </p>
                    <p className="text-xs text-gray-500">{c.detail}</p>
                  </div>
                ))}
              </div>
            )}

            {tab === "blueprint" && (
              <div className="max-w-3xl space-y-5">
                <p className="text-sm text-gray-800">
                  FINAL UX = production's proven functionality and workflows +
                  the prototype's genuinely earned improvements + hybrid
                  solutions where neither alone is sufficient.
                </p>
                {BLUEPRINT.map((s) => (
                  <div key={s.id} className="rounded-xl border bg-white p-4">
                    <h3 className="text-sm font-bold mb-2">
                      §{s.id} {s.title}
                    </h3>
                    <div className="space-y-2">
                      {s.body.map((p) => (
                        <p
                          key={p.slice(0, 40)}
                          className="text-xs text-gray-700 leading-relaxed"
                        >
                          {p}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "screens" && <ScreensTab />}

            {tab === "before-after" && (
              <div className="space-y-4 max-w-3xl">
                {BEFORE_AFTER.map((w) => (
                  <div
                    key={w.workflow}
                    className="rounded-xl border bg-white p-4"
                  >
                    <h3 className="text-sm font-bold mb-3">{w.workflow}</h3>
                    <div className="space-y-2 text-xs">
                      <div className="flex gap-2">
                        <span className="shrink-0 w-24 font-bold text-gray-400 uppercase text-[10px] pt-0.5">
                          Production
                        </span>
                        <p className="text-gray-700">{w.before}</p>
                      </div>
                      <div className="flex gap-2">
                        <span className="shrink-0 w-24 font-bold text-amber-500 uppercase text-[10px] pt-0.5">
                          Prototype
                        </span>
                        <p className="text-gray-700">{w.prototype}</p>
                      </div>
                      <div className="flex gap-2">
                        <span className="shrink-0 w-24 font-bold text-emerald-600 uppercase text-[10px] pt-0.5">
                          Final
                        </span>
                        <p className="text-gray-900 font-medium">{w.final}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 flex items-center gap-1.5 text-[11px] text-gray-400">
              <Smartphone className="w-3 h-3" />
              Full written analysis: decisionlab/UX_CONSOLIDATION.md
            </div>
          </div>
        </UxLabStoreProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
