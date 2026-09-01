// Style Lab — gallery + per-style preview: switch between all 10
// aesthetic-movement directions, each rendering the same modules
// (Dashboard/Projects/Production/Inventory/QMS/Reports/AI/Login) through
// that movement's own technique. Isolated: no real app dependencies.
import { ArrowLeft, Monitor, Smartphone } from "lucide-react";
import { useState } from "react";
import type { projects } from "../v2/data";
import { AppFrame, type ModuleKey } from "./AppFrame";
import { LoginScreen } from "./LoginScreen";
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
} from "./modules";
import { type StyleDef, styles } from "./styles";

export function StyleShowcase() {
  const [selected, setSelected] = useState<StyleDef | null>(null);
  if (selected)
    return <StylePreview style={selected} onBack={() => setSelected(null)} />;

  return (
    <div className="space-y-6" data-ocid="style-lab.gallery">
      <div>
        <h1 className="text-xl font-bold">Style Lab — 10 Design Movements</h1>
        <p className="text-sm text-muted-foreground max-w-2xl mt-1">
          Ten distinct visual languages applied to the same FabFlow modules and
          real manufacturing data — pick one to step inside it. No ranking, no
          recommendation — these are laid out for you to compare and decide.
        </p>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {styles.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSelected(s)}
            className="text-left rounded-xl border bg-card hover:shadow-md transition-shadow overflow-hidden group"
            data-ocid={`style-lab.style.${s.id}`}
          >
            <div
              className="h-20 flex items-center justify-center"
              style={{ background: s.pageBg }}
            >
              <div
                className="w-16 h-10"
                style={{
                  borderRadius: s.radius === "0px" ? 0 : 8,
                  background: s.surface,
                  opacity: 0.9,
                }}
              />
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Style {String(s.number).padStart(2, "0")}
                </span>
                <span className="text-[10px] text-muted-foreground group-hover:text-primary transition-colors">
                  Enter preview →
                </span>
              </div>
              <h3 className="text-sm font-bold">{s.name}</h3>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {s.philosophy}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

const TABS: { key: ModuleKey | "login"; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "projects", label: "Projects" },
  { key: "production", label: "Production" },
  { key: "inventory", label: "Inventory" },
  { key: "qms", label: "QMS" },
  { key: "reports", label: "Reports" },
  { key: "ai", label: "AI" },
  { key: "login", label: "Login" },
];

function StylePreview({
  style,
  onBack,
}: { style: StyleDef; onBack: () => void }) {
  const [tab, setTab] = useState<ModuleKey | "login">("dashboard");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [selectedProject, setSelectedProject] = useState<
    (typeof projects)[number] | null
  >(null);
  const [formOpen, setFormOpen] = useState(false);

  const body =
    tab === "login" ? (
      <LoginScreen t={style} />
    ) : (
      <AppFrame
        t={style}
        active={tab as ModuleKey}
        setActive={(k) => setTab(k)}
        mobile={device === "mobile"}
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
    );

  return (
    <div className="space-y-4" data-ocid="style-lab.preview">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to gallery
          </button>
          <h1 className="text-xl font-bold">
            Style {String(style.number).padStart(2, "0")} — {style.name}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
            {style.philosophy}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border p-0.5">
          <button
            type="button"
            onClick={() => setDevice("desktop")}
            className={`p-1.5 rounded-md ${device === "desktop" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
            aria-label="Desktop view"
          >
            <Monitor className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setDevice("mobile")}
            className={`p-1.5 rounded-md ${device === "mobile" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
            aria-label="Mobile view"
          >
            <Smartphone className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex gap-1 border-b flex-wrap">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            className="px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors"
            style={{
              borderColor:
                tab === tb.key ? "hsl(var(--primary))" : "transparent",
              color:
                tab === tb.key
                  ? "hsl(var(--foreground))"
                  : "hsl(var(--muted-foreground))",
            }}
            data-ocid={`style-lab.tab.${tb.key}`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl">
        <div
          style={{
            width: device === "mobile" ? "375px" : "100%",
            minWidth: device === "mobile" ? "375px" : "760px",
            minHeight: "600px",
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid #d8d8d8",
          }}
        >
          {body}
        </div>
      </div>

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

      <p className="text-[11px] text-muted-foreground/70 italic">
        Try: switch tabs to see every module, toggle Desktop/Mobile, click "+
        New Project" for the create form, click a row's "View" for the detail
        drawer, and submit the login form (password "demo" succeeds, anything
        else shows the error state).
      </p>
    </div>
  );
}
