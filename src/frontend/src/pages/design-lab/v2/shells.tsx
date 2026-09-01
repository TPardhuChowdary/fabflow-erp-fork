// ERP Design Exploration — 5 reusable navigation shells.
// Each concept in concepts.ts picks one; shells are shared where that
// reuse is itself honest (e.g. several practical directions genuinely
// use a plain sidebar) — the differentiation between those concepts
// lives in their dashboard body, density, and theme, not in faking a
// different nav shell for its own sake.
import {
  Bell,
  Boxes,
  Command,
  Factory,
  FileText,
  LayoutDashboard,
  Search,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import type { Concept } from "./concepts";
import { useThemeHelpers } from "./pieces";

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "projects", label: "Projects", icon: FileText },
  { key: "customers", label: "Customers", icon: Users },
  { key: "inventory", label: "Inventory", icon: Boxes },
  { key: "production", label: "Production", icon: Factory },
  { key: "payments", label: "Payments", icon: Wallet },
  { key: "settings", label: "Settings", icon: Settings },
];

interface ShellProps {
  concept: Concept;
  activeNav: string;
  setActiveNav: (k: string) => void;
  onOpenCommand: () => void;
  children: React.ReactNode;
}

export function ConceptShell({
  concept,
  activeNav,
  setActiveNav,
  onOpenCommand,
  children,
}: ShellProps) {
  const t = concept.theme;
  const { sm } = useThemeHelpers(t);
  const [railExpanded, setRailExpanded] = useState(false);

  const TopBar = ({ showLogo }: { showLogo?: boolean }) => (
    <div
      className="flex items-center gap-3 px-5 py-3 shrink-0"
      style={{
        borderBottom: `${t.borderWidth} solid ${t.border}`,
        background: t.surface,
      }}
    >
      {showLogo && (
        <span
          className="text-sm font-bold mr-2"
          style={{ color: t.text, fontFamily: t.fontDisplay }}
        >
          FabFlow
        </span>
      )}
      <button
        type="button"
        onClick={onOpenCommand}
        className="flex items-center gap-2 px-3 py-1.5 flex-1 max-w-xs text-left"
        style={{
          ...sm,
          background: t.surfaceAlt,
          border: `${t.borderWidth} solid ${t.border}`,
        }}
      >
        <Search className="w-3.5 h-3.5" style={{ color: t.textMuted }} />
        <span className="text-xs" style={{ color: t.textMuted }}>
          {concept.nav === "topbar-command"
            ? "Ask or search anything…  ⌘K"
            : "Search…  ⌘K"}
        </span>
      </button>
      <div className="ml-auto flex items-center gap-3">
        <Bell className="w-4 h-4" style={{ color: t.textMuted }} />
        <div
          className="w-7 h-7 flex items-center justify-center text-xs font-bold"
          style={{
            borderRadius: t.radiusPill,
            background: t.accent2,
            color: "#fff",
          }}
        >
          A
        </div>
      </div>
    </div>
  );

  if (concept.nav === "canvas" || concept.nav === "minimal-drawer") {
    // Home screen IS the navigation for these — a slim top bar is the
    // only permanent chrome, so the dashboard body gets full control.
    return (
      <div className="flex flex-col h-full" style={{ background: t.pageBg }}>
        <TopBar showLogo />
        <div className="flex-1 overflow-auto p-5">{children}</div>
      </div>
    );
  }

  if (concept.nav === "topbar-command") {
    return (
      <div className="flex flex-col h-full" style={{ background: t.pageBg }}>
        <div
          className="flex items-center gap-3 px-5 py-3 shrink-0"
          style={{
            borderBottom: `${t.borderWidth} solid ${t.border}`,
            background: t.surface,
          }}
        >
          <span
            className="text-sm font-bold flex items-center gap-1.5"
            style={{ color: t.text, fontFamily: t.fontDisplay }}
          >
            <Factory className="w-4 h-4" style={{ color: t.accent }} /> FabFlow
          </span>
          <button
            type="button"
            onClick={onOpenCommand}
            className="flex items-center gap-2 px-3 py-1.5 flex-1 max-w-md text-left"
            style={{
              ...sm,
              background: t.surfaceAlt,
              border: `${t.borderWidth} solid ${t.border}`,
            }}
          >
            <Command className="w-3.5 h-3.5" style={{ color: t.textMuted }} />
            <span className="text-xs" style={{ color: t.textMuted }}>
              Type a command or ask a question…
            </span>
            <span
              className="ml-auto text-[10px]"
              style={{ color: t.textMuted }}
            >
              ⌘K
            </span>
          </button>
          <div className="ml-auto flex gap-1">
            {NAV_ITEMS.slice(0, 5).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveNav(item.key)}
                className="px-2.5 py-1.5 text-xs font-medium"
                style={{
                  ...sm,
                  background:
                    activeNav === item.key ? t.surfaceAlt : "transparent",
                  color: activeNav === item.key ? t.text : t.textMuted,
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-auto p-5">{children}</div>
      </div>
    );
  }

  if (concept.nav === "rail") {
    return (
      <div className="flex h-full">
        <div className="flex shrink-0">
          <div
            className="flex flex-col items-center gap-1 py-4 w-14 shrink-0"
            style={{
              background: t.surface,
              borderRight: `${t.borderWidth} solid ${t.border}`,
            }}
          >
            <button
              type="button"
              onClick={() => setRailExpanded((v) => !v)}
              className="w-9 h-9 flex items-center justify-center mb-2"
              style={{ ...sm, background: t.accent, color: t.accentText }}
              aria-label="Expand"
            >
              <LayoutDashboard className="w-4 h-4" />
            </button>
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveNav(item.key)}
                className="w-9 h-9 flex items-center justify-center"
                style={{
                  ...sm,
                  background:
                    activeNav === item.key ? t.surfaceAlt : "transparent",
                  color: activeNav === item.key ? t.accent : t.textMuted,
                }}
                title={item.label}
              >
                <item.icon className="w-4 h-4" />
              </button>
            ))}
          </div>
          {railExpanded && (
            <div
              className="w-40 shrink-0 py-4 px-2"
              style={{
                background: t.surface,
                borderRight: `${t.borderWidth} solid ${t.border}`,
              }}
            >
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveNav(item.key)}
                  className="w-full text-left px-2.5 py-1.5 text-sm mb-0.5"
                  style={{
                    ...sm,
                    background:
                      activeNav === item.key ? t.surfaceAlt : "transparent",
                    color: t.text,
                    fontWeight: activeNav === item.key ? 600 : 500,
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div
          className="flex-1 flex flex-col min-w-0"
          style={{ background: t.pageBg }}
        >
          <TopBar />
          <div className="flex-1 overflow-auto p-5">{children}</div>
        </div>
      </div>
    );
  }

  // default: sidebar
  return (
    <div className="flex h-full">
      <div
        className="w-52 shrink-0 flex flex-col p-3"
        style={{
          background: t.surface,
          borderRight: `${t.borderWidth} solid ${t.border}`,
        }}
      >
        <div className="flex items-center gap-2 px-1 py-2 mb-3">
          <div
            className="w-7 h-7 flex items-center justify-center shrink-0"
            style={{ ...sm, background: t.accent, color: t.accentText }}
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
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setActiveNav(item.key)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 text-sm mb-0.5"
            style={{
              ...sm,
              background:
                activeNav === item.key ? `${t.accent}18` : "transparent",
              color: activeNav === item.key ? t.accent : t.textMuted,
              fontWeight: activeNav === item.key ? 600 : 500,
              textTransform: t.uppercaseLabels ? "uppercase" : "none",
            }}
          >
            <item.icon className="w-4 h-4 shrink-0" />
            {item.label}
          </button>
        ))}
      </div>
      <div
        className="flex-1 flex flex-col min-w-0"
        style={{ background: t.pageBg }}
      >
        <TopBar />
        <div className="flex-1 overflow-auto p-5">{children}</div>
      </div>
    </div>
  );
}
