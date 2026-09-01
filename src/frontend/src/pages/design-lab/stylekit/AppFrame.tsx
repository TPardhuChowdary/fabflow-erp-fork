// Style Lab — shared sidebar/topbar chrome + module switcher. IA is held
// constant across styles here (see modules.tsx header) — chrome renders
// through each style's own primitives so the sidebar itself carries the
// technique (glass sidebar is blurred, neumorphic sidebar is extruded, etc).
import {
  Bell,
  Bot,
  Boxes,
  ClipboardCheck,
  Factory,
  FileText,
  LayoutDashboard,
  Menu,
  TrendingUp,
  X,
} from "lucide-react";
import { useState } from "react";
import { cardStyle } from "./primitives";
import type { StyleDef } from "./styles";

export type ModuleKey =
  | "dashboard"
  | "projects"
  | "production"
  | "inventory"
  | "qms"
  | "reports"
  | "ai";

const MODULES: {
  key: ModuleKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "projects", label: "Projects", icon: FileText },
  { key: "production", label: "Production", icon: Factory },
  { key: "inventory", label: "Inventory", icon: Boxes },
  { key: "qms", label: "QMS", icon: ClipboardCheck },
  { key: "reports", label: "Reports", icon: TrendingUp },
  { key: "ai", label: "AI Agent", icon: Bot },
];

export function AppFrame({
  t,
  active,
  setActive,
  mobile,
  children,
}: {
  t: StyleDef;
  active: ModuleKey;
  setActive: (k: ModuleKey) => void;
  mobile?: boolean;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const NavList = ({ onItemClick }: { onItemClick?: () => void }) => (
    <>
      {MODULES.map((m) => {
        const isActive = active === m.key;
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => {
              setActive(m.key);
              onItemClick?.();
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 text-sm mb-0.5"
            style={{
              borderRadius:
                t.technique === "brutalist"
                  ? 0
                  : t.radius === "0px"
                    ? "6px"
                    : t.radius,
              background: isActive ? `${t.accent}20` : "transparent",
              color: isActive ? t.accent : t.textMuted,
              fontWeight: isActive ? 700 : 500,
              textTransform: t.technique === "brutalist" ? "uppercase" : "none",
            }}
          >
            <m.icon className="w-4 h-4 shrink-0" />
            {m.label}
          </button>
        );
      })}
    </>
  );

  if (mobile) {
    return (
      <div className="flex flex-col h-full" style={{ background: t.pageBg }}>
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ ...cardStyle(t), borderRadius: 0 }}
        >
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" style={{ color: t.text }} />
          </button>
          <span
            className="font-bold text-sm"
            style={{ color: t.text, fontFamily: t.fontDisplay }}
          >
            FabFlow
          </span>
          <Bell className="w-4 h-4 ml-auto" style={{ color: t.textMuted }} />
        </div>
        {drawerOpen && (
          <div
            className="fixed inset-0 z-50 flex"
            style={{ background: "rgba(0,0,0,0.4)" }}
            onClick={() => setDrawerOpen(false)}
            onKeyDown={(e) => e.key === "Escape" && setDrawerOpen(false)}
            aria-hidden="true"
          >
            <div
              className="w-56 h-full p-3"
              style={{ background: t.surface }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-sm" style={{ color: t.text }}>
                  Menu
                </span>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close"
                >
                  <X className="w-4 h-4" style={{ color: t.textMuted }} />
                </button>
              </div>
              <NavList onItemClick={() => setDrawerOpen(false)} />
            </div>
          </div>
        )}
        <div className="flex-1 overflow-auto p-4">{children}</div>
      </div>
    );
  }

  return (
    <div className="flex h-full" style={{ background: t.pageBg }}>
      <div className="w-52 shrink-0 p-3" style={cardStyle(t)}>
        <div className="flex items-center gap-2 px-1 py-2 mb-3">
          <div
            className="w-7 h-7 flex items-center justify-center shrink-0"
            style={{
              borderRadius: t.radius === "0px" ? "4px" : t.radius,
              background: t.accent,
              color: t.accentText,
            }}
          >
            <Factory className="w-4 h-4" />
          </div>
          <span
            className="text-sm font-bold"
            style={{ color: t.text, fontFamily: t.fontDisplay }}
          >
            FabFlow
          </span>
        </div>
        <NavList />
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <div
          className="flex items-center gap-3 px-5 py-3"
          style={{ borderBottom: `1px solid ${t.border}` }}
        >
          <h1
            className="text-sm font-bold capitalize"
            style={{ color: t.text, fontFamily: t.fontDisplay }}
          >
            {active}
          </h1>
          <Bell className="w-4 h-4 ml-auto" style={{ color: t.textMuted }} />
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: t.accent2, color: "#fff" }}
          >
            A
          </div>
        </div>
        <div className="flex-1 overflow-auto p-5">{children}</div>
      </div>
    </div>
  );
}
