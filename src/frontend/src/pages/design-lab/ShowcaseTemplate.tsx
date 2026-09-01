// Design Lab — shared interactive "mini ERP" demo screen.
//
// Fully self-contained: no imports from the real app's shared component
// library, no global CSS tokens, no store/business data. Every visual
// value comes from the `theme` prop via inline styles scoped to this
// component's own wrapper, so nothing here can leak into or be affected
// by the production ERP.
import {
  AlertTriangle,
  Bell,
  Bot,
  Boxes,
  Factory,
  FileText,
  LayoutDashboard,
  Package,
  Search,
  Settings,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useState } from "react";
import type { LabTheme } from "./themes";

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "projects", label: "Projects", icon: FileText },
  { key: "customers", label: "Customers", icon: Users },
  { key: "inventory", label: "Inventory", icon: Boxes },
  { key: "production", label: "Production", icon: Factory },
  { key: "payments", label: "Payments", icon: Wallet },
  { key: "settings", label: "Settings", icon: Settings },
];

const ROWS = [
  {
    no: "PROJ-2026-013",
    customer: "Meridian Fab Co.",
    qty: 240,
    status: "Active",
    statusTone: "success",
  },
  {
    no: "PROJ-2026-012",
    customer: "Norwood Industrial",
    qty: 60,
    status: "Active",
    statusTone: "success",
  },
  {
    no: "PROJ-2026-011",
    customer: "Ashfield Metalworks",
    qty: 12,
    status: "Pending",
    statusTone: "warning",
  },
  {
    no: "PROJ-2026-010",
    customer: "Delta Sheet Systems",
    qty: 500,
    status: "Active",
    statusTone: "success",
  },
  {
    no: "PROJ-2026-009",
    customer: "Coastline Fixtures",
    qty: 8,
    status: "Blocked",
    statusTone: "danger",
  },
] as const;

type ViewState = "data" | "loading" | "empty" | "error";

export function ShowcaseTemplate({ theme }: { theme: LabTheme }) {
  const t = theme.tokens;
  const [activeNav, setActiveNav] = useState("dashboard");
  const [activeTab, setActiveTab] = useState("overview");
  const [viewState, setViewState] = useState<ViewState>("data");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [railExpanded, setRailExpanded] = useState(false);

  const fireToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(
      () => setToast((cur) => (cur === msg ? null : cur)),
      2600,
    );
  };

  const card: React.CSSProperties = {
    background: t.surface,
    border: `${t.borderWidth} solid ${t.border}`,
    borderRadius: t.radius,
    boxShadow: t.shadow,
  };
  const pill: React.CSSProperties = {
    borderRadius: t.radiusPill,
  };
  const smRadius: React.CSSProperties = { borderRadius: t.radiusSm };

  const toneColor = (tone: string) =>
    tone === "success" ? t.success : tone === "warning" ? t.warning : t.danger;

  const labelClass = t.uppercaseLabels ? "uppercase tracking-widest" : "";

  const Sidebar = () => {
    if (theme.layout === "topbar-only") return null;

    if (theme.layout === "thin-rail") {
      return (
        <div className="flex shrink-0">
          <div
            className="flex flex-col items-center gap-1 py-4 w-14 shrink-0"
            style={{
              background: t.sidebarBg,
              borderRight: `${t.borderWidth} solid ${t.border}`,
            }}
          >
            <button
              type="button"
              onClick={() => setRailExpanded((v) => !v)}
              className="w-9 h-9 flex items-center justify-center mb-2"
              style={{ ...smRadius, background: t.accent, color: t.accentText }}
              aria-label="Expand navigation"
            >
              <LayoutDashboard className="w-4 h-4" />
            </button>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeNav === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveNav(item.key)}
                  className="w-9 h-9 flex items-center justify-center transition-colors"
                  style={{
                    ...smRadius,
                    background: active ? t.sidebarActive : "transparent",
                    color: active ? t.sidebarActiveText : t.sidebarText,
                  }}
                  aria-label={item.label}
                  title={item.label}
                >
                  <Icon className="w-4 h-4" />
                </button>
              );
            })}
          </div>
          {railExpanded && (
            <div
              className="w-44 shrink-0 py-4 px-2"
              style={{
                background: t.surface,
                borderRight: `${t.borderWidth} solid ${t.border}`,
              }}
            >
              <p
                className="text-[11px] font-semibold px-2 mb-2"
                style={{ color: t.textMuted }}
              >
                FabFlow ERP
              </p>
              {NAV_ITEMS.map((item) => {
                const active = activeNav === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActiveNav(item.key)}
                    className="w-full text-left px-2.5 py-1.5 text-sm mb-0.5 transition-colors"
                    style={{
                      ...smRadius,
                      background: active ? t.sidebarActive : "transparent",
                      color: active ? t.sidebarActiveText : t.sidebarText,
                      fontWeight: active ? 600 : 500,
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // dark-floating / light-sidebar share structure, differ by skin
    const floating = theme.layout === "dark-floating";
    return (
      <div
        className={
          floating
            ? "w-56 shrink-0 m-3 flex flex-col p-3"
            : "w-52 shrink-0 flex flex-col p-3"
        }
        style={{
          background: t.sidebarBg,
          borderRadius: floating ? t.radius : "0",
          borderRight: floating ? "none" : `${t.borderWidth} solid ${t.border}`,
        }}
      >
        <div className="flex items-center gap-2 px-1 py-2 mb-3">
          <div
            className="w-7 h-7 flex items-center justify-center shrink-0"
            style={{ ...smRadius, background: t.accent, color: t.accentText }}
          >
            <Factory className="w-4 h-4" />
          </div>
          <span
            className="text-sm font-bold"
            style={{
              color: floating ? "#fff" : t.text,
              fontFamily: t.fontDisplay,
            }}
          >
            FabFlow
          </span>
        </div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeNav === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveNav(item.key)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-sm mb-0.5 transition-colors ${labelClass}`}
              style={{
                ...smRadius,
                background: active ? t.sidebarActive : "transparent",
                color: active ? t.sidebarActiveText : t.sidebarText,
                fontWeight: active ? 600 : 500,
              }}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </div>
    );
  };

  const TopBar = () => (
    <div
      className="flex items-center gap-3 px-5 py-3 shrink-0"
      style={{
        borderBottom: `${t.borderWidth} solid ${t.border}`,
        background: t.surface,
      }}
    >
      {theme.layout === "topbar-only" && (
        <span
          className="text-sm font-bold mr-2"
          style={{
            color: t.text,
            fontFamily: t.fontDisplay,
            letterSpacing: t.letterSpacing,
          }}
        >
          FabFlow
        </span>
      )}
      <div
        className="flex items-center gap-2 px-3 py-1.5 flex-1 max-w-xs"
        style={{
          ...smRadius,
          background: t.surfaceAlt,
          border: `${t.borderWidth} solid ${t.border}`,
        }}
      >
        <Search className="w-3.5 h-3.5" style={{ color: t.textMuted }} />
        <span className="text-xs" style={{ color: t.textMuted }}>
          Search projects, customers…
        </span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          onClick={() => fireToast("3 new notifications")}
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" style={{ color: t.textMuted }} />
        </button>
        <div
          className="w-7 h-7 flex items-center justify-center text-xs font-bold"
          style={{ ...pill, background: t.accent2, color: t.text }}
        >
          A
        </div>
      </div>
    </div>
  );

  const Button = ({
    children,
    variant = "primary",
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    variant?: "primary" | "outline" | "ghost";
    onClick?: () => void;
    disabled?: boolean;
  }) => {
    const base: React.CSSProperties = {
      ...smRadius,
      fontFamily: t.fontBody,
      fontWeight: 600,
      fontSize: "13px",
      padding: "7px 14px",
      transition: "opacity .15s ease, transform .1s ease",
      opacity: disabled ? 0.45 : 1,
      cursor: disabled ? "not-allowed" : "pointer",
    };
    if (variant === "primary") {
      Object.assign(base, {
        background: t.accent,
        color: t.accentText,
        border: `${t.borderWidth} solid ${t.accent}`,
      });
    } else if (variant === "outline") {
      Object.assign(base, {
        background: "transparent",
        color: t.text,
        border: `${t.borderWidth} solid ${t.border}`,
      });
    } else {
      Object.assign(base, {
        background: "transparent",
        color: t.textMuted,
        border: `${t.borderWidth} solid transparent`,
      });
    }
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={`active:scale-[0.97] ${labelClass}`}
        style={base}
        onMouseEnter={(e) => {
          if (!disabled) e.currentTarget.style.opacity = "0.85";
        }}
        onMouseLeave={(e) => {
          if (!disabled) e.currentTarget.style.opacity = "1";
        }}
      >
        {children}
      </button>
    );
  };

  const Badge = ({
    tone,
    children,
  }: { tone: string; children: React.ReactNode }) => (
    <span
      className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 ${labelClass}`}
      style={{
        ...pill,
        background:
          theme.id === "style-05" ? "transparent" : `${toneColor(tone)}22`,
        color: toneColor(tone),
        border:
          theme.id === "style-05" ? `${t.borderWidth} solid ${t.text}` : "none",
      }}
    >
      {theme.id === "style-05" ? `[${children}]` : children}
    </span>
  );

  const kpis = [
    { label: "Total Projects", value: "11", icon: FileText, tone: t.accent },
    { label: "Active Quotations", value: "6", icon: Package, tone: t.accent2 },
    {
      label: "Pending Invoices",
      value: "4",
      icon: TrendingUp,
      tone: t.accent3,
    },
    { label: "Total Received", value: "₹500", icon: Wallet, tone: t.success },
  ];

  return (
    <div
      className="flex rounded-xl overflow-hidden"
      style={{
        fontFamily: t.fontBody,
        color: t.text,
        border: `${t.borderWidth} solid ${t.border}`,
        minHeight: "640px",
      }}
    >
      <Sidebar />
      <div
        className="flex-1 flex flex-col min-w-0"
        style={{ background: t.pageBg }}
      >
        <TopBar />

        <div className="flex-1 overflow-auto p-5 flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1
                style={{
                  fontFamily: t.fontDisplay,
                  fontWeight: t.fontWeightDisplay,
                  letterSpacing: t.letterSpacing,
                  fontSize: theme.layout === "topbar-only" ? "34px" : "22px",
                  color: t.text,
                }}
              >
                Operations Dashboard
              </h1>
              <p className="text-xs mt-0.5" style={{ color: t.textMuted }}>
                Saturday, 29 August 2026
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => setDialogOpen(true)}>
                + New Project
              </Button>
              <Button
                variant="outline"
                onClick={() => fireToast("Opening quotations…")}
              >
                Quotations
              </Button>
              <Button variant="ghost" disabled>
                Archived
              </Button>
            </div>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {kpis.map((k) => (
              <div key={k.label} className="p-4" style={card}>
                <div className="flex items-center justify-between">
                  <div>
                    <p
                      className={`text-[10px] font-semibold ${labelClass}`}
                      style={{ color: t.textMuted }}
                    >
                      {k.label}
                    </p>
                    <p
                      className="mt-1"
                      style={{
                        fontFamily: t.fontDisplay,
                        fontWeight: t.fontWeightDisplay,
                        fontSize: "24px",
                      }}
                    >
                      {k.value}
                    </p>
                  </div>
                  <div
                    className="w-9 h-9 flex items-center justify-center shrink-0"
                    style={{
                      ...smRadius,
                      background: `${k.tone}22`,
                      color: k.tone,
                    }}
                  >
                    <k.icon className="w-4 h-4" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Tabs + filter row */}
          <div style={card} className="flex-1 flex flex-col overflow-hidden">
            <div
              className="flex items-center justify-between px-4 pt-3 flex-wrap gap-2"
              style={{ borderBottom: `${t.borderWidth} solid ${t.border}` }}
            >
              <div className="flex gap-1">
                {["overview", "materials", "documents"].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-2 text-xs font-semibold capitalize border-b-2 -mb-px transition-colors ${labelClass}`}
                    style={{
                      borderColor: activeTab === tab ? t.accent : "transparent",
                      color: activeTab === tab ? t.text : t.textMuted,
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 pb-2">
                <select
                  className="text-xs px-2 py-1.5 outline-none"
                  style={{
                    ...smRadius,
                    border: `${t.borderWidth} solid ${t.border}`,
                    background: t.surface,
                    color: t.text,
                  }}
                  onChange={(e) => setViewState(e.target.value as ViewState)}
                  value={viewState}
                >
                  <option value="data">Show: Data</option>
                  <option value="loading">Show: Loading</option>
                  <option value="empty">Show: Empty</option>
                  <option value="error">Show: Error</option>
                </select>
              </div>
            </div>

            <div className="p-4 flex-1 overflow-auto">
              {viewState === "loading" && (
                <div className="space-y-2">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-10 w-full animate-pulse"
                      style={{ ...smRadius, background: t.surfaceAlt }}
                    />
                  ))}
                </div>
              )}

              {viewState === "empty" && (
                <div className="flex flex-col items-center justify-center py-14 text-center gap-2">
                  <Boxes className="w-8 h-8" style={{ color: t.textMuted }} />
                  <p className="text-sm font-semibold">No projects yet</p>
                  <p
                    className="text-xs max-w-xs"
                    style={{ color: t.textMuted }}
                  >
                    Create your first project to see it listed here.
                  </p>
                  <div className="mt-2">
                    <Button
                      variant="primary"
                      onClick={() => setDialogOpen(true)}
                    >
                      + New Project
                    </Button>
                  </div>
                </div>
              )}

              {viewState === "error" && (
                <div className="flex flex-col items-center justify-center py-14 text-center gap-2">
                  <AlertTriangle
                    className="w-8 h-8"
                    style={{ color: t.danger }}
                  />
                  <p
                    className="text-sm font-semibold"
                    style={{ color: t.danger }}
                  >
                    Couldn't load projects
                  </p>
                  <p
                    className="text-xs max-w-xs"
                    style={{ color: t.textMuted }}
                  >
                    A network error occurred while fetching this list.
                  </p>
                  <div className="mt-2">
                    <Button
                      variant="outline"
                      onClick={() => setViewState("data")}
                    >
                      Retry
                    </Button>
                  </div>
                </div>
              )}

              {viewState === "data" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ color: t.textMuted }}>
                        {["Project No.", "Customer", "Qty", "Status", ""].map(
                          (h) => (
                            <th
                              key={h}
                              className={`text-left font-semibold pb-2 pr-4 ${labelClass}`}
                            >
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {ROWS.map((r) => (
                        <tr
                          key={r.no}
                          style={{
                            borderTop: `${t.borderWidth} solid ${t.border}`,
                          }}
                          className="transition-colors"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = t.surfaceAlt;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                          }}
                        >
                          <td className="py-2.5 pr-4 font-mono font-semibold">
                            {r.no}
                          </td>
                          <td className="py-2.5 pr-4">{r.customer}</td>
                          <td className="py-2.5 pr-4">{r.qty}</td>
                          <td className="py-2.5 pr-4">
                            <Badge tone={r.statusTone}>{r.status}</Badge>
                          </td>
                          <td className="py-2.5">
                            <button
                              type="button"
                              className="text-xs font-semibold"
                              style={{ color: t.accent }}
                              onClick={() => fireToast(`Opening ${r.no}`)}
                            >
                              View →
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Dialog / modal */}
      {dialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setDialogOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setDialogOpen(false);
          }}
          aria-hidden="true"
        >
          <div
            className="w-full max-w-sm p-5"
            style={{ ...card, background: t.surface }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2
                style={{
                  fontFamily: t.fontDisplay,
                  fontWeight: t.fontWeightDisplay,
                  fontSize: "16px",
                }}
              >
                New Project
              </h2>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                aria-label="Close"
              >
                <X className="w-4 h-4" style={{ color: t.textMuted }} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="lab-new-project-customer"
                  className={`text-[11px] font-semibold ${labelClass}`}
                  style={{ color: t.textMuted }}
                >
                  Customer
                </label>
                <select
                  id="lab-new-project-customer"
                  className="w-full mt-1 text-sm px-2.5 py-2 outline-none"
                  style={{
                    ...smRadius,
                    border: `${t.borderWidth} solid ${t.border}`,
                    background: t.surface,
                  }}
                >
                  <option>Meridian Fab Co.</option>
                  <option>Norwood Industrial</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="lab-new-project-name"
                  className={`text-[11px] font-semibold ${labelClass}`}
                  style={{ color: t.textMuted }}
                >
                  Project Name
                </label>
                <input
                  id="lab-new-project-name"
                  className="w-full mt-1 text-sm px-2.5 py-2 outline-none"
                  style={{
                    ...smRadius,
                    border: `${t.borderWidth} solid ${t.border}`,
                    background: t.surface,
                  }}
                  placeholder="e.g. Bracket assembly run"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    setDialogOpen(false);
                    fireToast("Project created");
                  }}
                >
                  Create
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-5 right-5 z-50 px-4 py-2.5 text-xs font-semibold flex items-center gap-2"
          style={{
            ...card,
            background: t.surface,
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
          }}
        >
          <Bot className="w-3.5 h-3.5" style={{ color: t.accent }} />
          {toast}
        </div>
      )}
    </div>
  );
}
