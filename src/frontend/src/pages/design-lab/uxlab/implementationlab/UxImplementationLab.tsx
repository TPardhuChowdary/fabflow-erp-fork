// UX Implementation Lab — Phase 4 of the FabFlow redesign.
//
// Not a new design decision. Combines the approved UX architecture
// (../decisionlab/) with the approved visual system (../visuallab/
// "Instrument") on real, functional, store-wired screens — the
// representative-screen deliverable FINAL_UX_IMPLEMENTATION_BLUEPRINT.md
// §15 specifies. Production is untouched; nothing here is applied until
// the user says "APPROVED — BEGIN PRODUCTION IMPLEMENTATION."
//
// Reuses decisionlab's real screens (FinalDashboard, FinalProjectWorkspace,
// ReusedFrame-wrapped modules) wrapped in the Instrument skin
// (instrument-skin.css — a semantic Tailwind-class remap, not a
// rebuild) rather than duplicating them a third time. Two screens are
// genuinely new this pass: Projects list (didn't exist as a dedicated
// screen before) and Petty Expenses with a REAL Settle-Float flow
// (Phase 2 only specified this, this pass builds it).
import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import "./instrument-skin.css";
import { FinalDashboard } from "../decisionlab/screens/FinalDashboard";
import { FinalProjectWorkspace } from "../decisionlab/screens/FinalProjectWorkspace";
import { MobileDemo } from "../decisionlab/screens/MobileDemo";
import { ReusedFrame } from "../decisionlab/screens/ReusedFrame";
import { ConfirmProvider, ToastProvider } from "../primitives";
import { ModuleRouter, type ViewKey } from "../shared/ModuleRouter";
import { ROLES } from "../shared/roleAccess";
import { UxLabStoreProvider } from "../store";
import { PettyExpensesScreen } from "./screens/PettyExpensesScreen";
import { ProjectsListScreen } from "./screens/ProjectsListScreen";

const DEMO_PROJECT_ID = "proj-1";

const SCREEN_KEYS = [
  "dashboard",
  "projects",
  "workspace",
  "quotations",
  "inventory",
  "production",
  "qms",
  "petty-expenses",
  "finance",
  "settings",
  "agent",
  "dense-table",
  "complex-dialog",
  "mobile",
] as const;
type ScreenKey = (typeof SCREEN_KEYS)[number];

const SCREEN_LABEL: Record<ScreenKey, string> = {
  dashboard: "1. Dashboard",
  projects: "2. Projects list",
  workspace: "3. Project Workspace",
  quotations: "4. Quotations",
  inventory: "5. Inventory",
  production: "6. Production",
  qms: "7. QMS",
  "petty-expenses": "8. Petty Expenses",
  finance: "9. Finance",
  settings: "10. Settings",
  agent: "11. AI Agent",
  "dense-table": "13. Dense table",
  "complex-dialog": "12. Complex dialog",
  mobile: "14. Mobile",
};

function ImplementationScreens() {
  const [screen, setScreen] = useState<ScreenKey>("dashboard");
  const [projectId, setProjectId] = useState(DEMO_PROJECT_ID);
  const noop = (_v: string, _id: string) => {};
  const navigate = (v: ViewKey | string, id: string) => {
    if (v === "project" && id) setProjectId(id);
  };

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
            navigate={navigate as (v: ViewKey, id: string) => void}
          />
        )}
        {screen === "projects" && (
          <ProjectsListScreen
            onOpen={(id) => {
              setProjectId(id);
              setScreen("workspace");
            }}
          />
        )}
        {screen === "workspace" && (
          <FinalProjectWorkspace projectId={projectId} onNavigate={navigate} />
        )}
        {screen === "quotations" && (
          <ReusedFrame
            decision="HYBRID"
            reason='Real-time GST math kept exactly; dialog given real room for 6+ line items — click "+ New Quotation" to see it.'
          >
            <ModuleRouter view="quotations" id="" onNavigate={noop} />
          </ReusedFrame>
        )}
        {screen === "inventory" && (
          <ReusedFrame
            decision="HYBRID"
            reason="Reserved/Available split restored this project — Total/Reserved/Available columns are real, not illustrative."
          >
            <ModuleRouter view="inventory" id="" onNavigate={noop} />
          </ReusedFrame>
        )}
        {screen === "production" && (
          <ReusedFrame
            decision="HYBRID"
            reason="Sequential-lock UI kept exactly. QMS-gate check and rework flow are real production capabilities not yet built anywhere (Blueprint §16/§20)."
          >
            <ModuleRouter view="production" id="" onNavigate={noop} />
          </ReusedFrame>
        )}
        {screen === "qms" && (
          <ReusedFrame
            decision="HYBRID"
            reason="The real 11-status legal-transition table kept exactly. Insert-only audit trail not yet built anywhere (Blueprint §16/§20)."
          >
            <ModuleRouter view="qms" id="" onNavigate={noop} />
          </ReusedFrame>
        )}
        {screen === "petty-expenses" && <PettyExpensesScreen />}
        {screen === "finance" && (
          <ReusedFrame
            decision="KEEP"
            reason="Same tax model, same actions as production — no real UX delta found."
          >
            <ModuleRouter view="invoices" id="" onNavigate={noop} />
          </ReusedFrame>
        )}
        {screen === "settings" && (
          <ReusedFrame
            decision="KEEP"
            reason="Already matches production's layout and real permission-matrix editor."
          >
            <ModuleRouter view="settings" id="" onNavigate={noop} />
          </ReusedFrame>
        )}
        {screen === "agent" && (
          <ReusedFrame
            decision="KEEP"
            reason="DO NOT REDESIGN — Classic-mode-only is an infrastructure limit, not a design decision — see Blueprint §17."
          >
            <ModuleRouter view="ai-agent" id="" onNavigate={noop} />
          </ReusedFrame>
        )}
        {screen === "dense-table" && (
          <ReusedFrame
            decision="HYBRID"
            reason="Component I reference implementation — Inventory's real field set at real density."
          >
            <ModuleRouter view="inventory" id="" onNavigate={noop} />
          </ReusedFrame>
        )}
        {screen === "complex-dialog" && (
          <ReusedFrame
            decision="HYBRID"
            reason="One shared confirm-dialog primitive, production's real copy — open a Project QMS inspection and record a result to see it."
          >
            <ModuleRouter view="qms" id="" onNavigate={noop} />
          </ReusedFrame>
        )}
        {screen === "mobile" && <MobileDemo projectId={projectId} />}
      </div>
    </div>
  );
}

export function UxImplementationLab() {
  const [dark, setDark] = useState(false);

  return (
    <ToastProvider>
      <ConfirmProvider>
        <UxLabStoreProvider>
          <div
            className="instrument-skin space-y-4 p-4 rounded-2xl"
            data-mode={dark ? "dark" : "light"}
            data-ocid="uxlab.implementationlab"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-xl font-bold">UX Implementation Lab</h1>
                <p className="text-sm text-gray-500 mt-1 max-w-2xl">
                  Real production functionality + approved UX architecture +
                  Instrument visual system, on real screens. Design validation,
                  not production implementation — see
                  FINAL_UX_IMPLEMENTATION_BLUEPRINT.md.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDark((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border bg-white"
              >
                {dark ? (
                  <Sun className="w-3.5 h-3.5" />
                ) : (
                  <Moon className="w-3.5 h-3.5" />
                )}
                {dark ? "Light mode" : "Dark mode"}
              </button>
            </div>
            <ImplementationScreens />
          </div>
        </UxLabStoreProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
