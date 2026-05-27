import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  Archive,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  DollarSign,
  Factory,
  FileText,
  FlaskConical,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  Settings,
  Settings2,
  ShoppingCart,
  Truck,
  UserCircle2,
  Users,
  Wallet,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useAuth } from "../AuthContext";
import { canView } from "../permissions";
import type { Page } from "../types";

interface NavItem {
  label: string;
  page: Page;
  icon: React.ComponentType<{ className?: string }>;
  moduleKey: string;
}

interface NavGroup {
  label: string;
  moduleKeys: string[];
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "",
    moduleKeys: [],
    items: [
      {
        label: "Dashboard",
        page: "dashboard",
        icon: LayoutDashboard,
        moduleKey: "__always__",
      },
    ],
  },
  {
    label: "Sales",
    moduleKeys: ["customers", "projects", "quotations", "purchase_orders"],
    items: [
      {
        label: "Customers",
        page: "customers",
        icon: Users,
        moduleKey: "customers",
      },
      {
        label: "Projects",
        page: "projects",
        icon: FolderKanban,
        moduleKey: "projects",
      },
      {
        label: "Quotations",
        page: "quotations",
        icon: ClipboardList,
        moduleKey: "quotations",
      },
      {
        label: "Customer Purchase Orders",
        page: "purchase-orders",
        icon: ShoppingCart,
        moduleKey: "purchase_orders",
      },
    ],
  },
  {
    label: "Procurement",
    moduleKeys: ["vendors", "company_po"],
    items: [
      {
        label: "Vendors",
        page: "vendors",
        icon: Building2,
        moduleKey: "vendors",
      },
      {
        label: "Company PO",
        page: "company-po",
        icon: FileText,
        moduleKey: "company_po",
      },
    ],
  },
  {
    label: "Production",
    moduleKeys: ["production", "material_requisitions", "inventory"],
    items: [
      {
        label: "Production",
        page: "production",
        icon: Factory,
        moduleKey: "production",
      },
      {
        label: "Material Requisitions",
        page: "material-requisitions",
        icon: Settings2,
        moduleKey: "material_requisitions",
      },
      {
        label: "Inventory",
        page: "inventory",
        icon: Archive,
        moduleKey: "inventory",
      },
    ],
  },
  {
    label: "Quality & Logistics",
    moduleKeys: ["quality_inspection", "delivery_challans"],
    items: [
      {
        label: "Quality Inspection",
        page: "quality",
        icon: FlaskConical,
        moduleKey: "quality_inspection",
      },
      {
        label: "Delivery Challans",
        page: "delivery-challans",
        icon: Truck,
        moduleKey: "delivery_challans",
      },
    ],
  },
  {
    label: "Finance",
    moduleKeys: ["invoices", "payments", "payables", "petty_expenses"],
    items: [
      {
        label: "Invoices",
        page: "invoices",
        icon: Receipt,
        moduleKey: "invoices",
      },
      {
        label: "Payments",
        page: "payments",
        icon: CreditCard,
        moduleKey: "payments",
      },
      {
        label: "Payables",
        page: "payables",
        icon: Wallet,
        moduleKey: "payables",
      },
      {
        label: "Petty Expenses",
        page: "petty-expenses",
        icon: DollarSign,
        moduleKey: "petty_expenses",
      },
    ],
  },
  {
    label: "HR",
    moduleKeys: ["employees"],
    items: [
      {
        label: "Employees",
        page: "employees",
        icon: UserCircle2,
        moduleKey: "employees",
      },
    ],
  },
];

const ROLE_BADGE: Record<string, string> = {
  Admin: "bg-red-100 text-red-700",
  admin: "bg-red-100 text-red-700",
  Accountant: "bg-blue-100 text-blue-700",
  accounts: "bg-blue-100 text-blue-700",
  Designer: "bg-purple-100 text-purple-700",
  Worker: "bg-green-100 text-green-700",
  sales: "bg-emerald-100 text-emerald-700",
  procurement: "bg-orange-100 text-orange-700",
  production: "bg-yellow-100 text-yellow-700",
  quality: "bg-cyan-100 text-cyan-700",
  dispatch: "bg-indigo-100 text-indigo-700",
  employee: "bg-gray-100 text-gray-700",
};

interface Props {
  currentPage: Page;
  onNavigate: (p: Page) => void;
  children: ReactNode;
}

export function Layout({ currentPage, onNavigate, children }: Props) {
  const { currentUser, logout } = useAuth();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Desktop: sidebar open/close toggle
  const [desktopOpen, setDesktopOpen] = useState(true);
  // Tablet: icon-rail expanded state
  const [tabletExpanded, setTabletExpanded] = useState(false);
  // Mobile: sheet drawer open state
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleGroup = (label: string) =>
    setCollapsed((c) => ({ ...c, [label]: !c[label] }));

  const isActive = (page: Page) =>
    currentPage === page ||
    (page === "projects" && currentPage === "project-detail") ||
    (page === "employees" && currentPage === "employee-detail");

  const isItemVisible = (item: NavItem) => {
    if (item.moduleKey === "__always__") return true;
    return canView(currentUser, item.moduleKey);
  };

  const isGroupVisible = (group: NavGroup) => {
    if (!group.label) return true;
    return group.items.some((item) => isItemVisible(item));
  };

  const settingsVisible =
    canView(currentUser, "settings") ||
    currentUser?.role === "Admin" ||
    currentUser?.role === "admin";

  // Shared full nav content — used in desktop sidebar and mobile drawer
  const FullNavContent = ({ onItemClick }: { onItemClick?: () => void }) => (
    <>
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {navGroups.filter(isGroupVisible).map((group) => (
          <div key={group.label || "__root__"}>
            {group.label && (
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                className="flex items-center justify-between w-full px-2 py-1.5 mt-2 text-[10px] uppercase tracking-widest font-semibold text-[oklch(var(--sidebar-foreground)/0.45)] hover:text-[oklch(var(--sidebar-foreground)/0.7)] transition-colors"
              >
                <span>{group.label}</span>
                {collapsed[group.label] ? (
                  <ChevronRight className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
            )}
            {!collapsed[group.label] &&
              group.items.filter(isItemVisible).map((item) => (
                <button
                  type="button"
                  key={`${group.label}-${item.page}`}
                  data-ocid={`nav.${item.page}.link`}
                  onClick={() => {
                    onNavigate(item.page);
                    onItemClick?.();
                  }}
                  className={cn(
                    "flex items-center gap-2.5 w-full px-2 py-1.5 rounded text-sm transition-colors",
                    isActive(item.page)
                      ? "bg-[oklch(var(--sidebar-accent))] text-[oklch(var(--sidebar-primary))] font-semibold"
                      : "text-[oklch(var(--sidebar-foreground)/0.75)] hover:bg-[oklch(var(--sidebar-accent))] hover:text-[oklch(var(--sidebar-foreground))]",
                  )}
                >
                  <item.icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
          </div>
        ))}
      </nav>

      {settingsVisible && (
        <div className="px-2 pb-2 border-t border-[oklch(var(--sidebar-border))] pt-2">
          <button
            type="button"
            data-ocid="nav.settings.link"
            onClick={() => {
              onNavigate("settings");
              onItemClick?.();
            }}
            className={cn(
              "flex items-center gap-2.5 w-full px-2 py-1.5 rounded text-sm transition-colors",
              currentPage === "settings"
                ? "bg-[oklch(var(--sidebar-accent))] text-[oklch(var(--sidebar-primary))] font-semibold"
                : "text-[oklch(var(--sidebar-foreground)/0.75)] hover:bg-[oklch(var(--sidebar-accent))] hover:text-[oklch(var(--sidebar-foreground))]",
            )}
          >
            <Settings className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Settings</span>
          </button>
        </div>
      )}

      <div className="px-3 py-2 border-t border-[oklch(var(--sidebar-border))]">
        <div className="text-[10px] text-[oklch(var(--sidebar-foreground)/0.35)]">
          v1.0 &bull; FabFlow ERP
        </div>
      </div>
    </>
  );

  // Sidebar logo header
  const SidebarLogo = () => (
    <div className="flex items-center gap-2 px-4 py-4 border-b border-[oklch(var(--sidebar-border))] shrink-0">
      <div className="flex items-center justify-center w-7 h-7 rounded bg-[oklch(var(--sidebar-primary))] text-[oklch(var(--sidebar-primary-foreground))] shrink-0">
        <Factory className="w-4 h-4" />
      </div>
      <div>
        <div className="text-sm font-bold leading-none text-[oklch(var(--sidebar-foreground))]">
          FabFlow
        </div>
        <div className="text-[10px] text-[oklch(var(--sidebar-foreground)/0.5)] uppercase tracking-widest">
          ERP
        </div>
      </div>
    </div>
  );

  // All visible nav items flattened — for tablet icon rail
  const allVisibleItems = navGroups
    .filter(isGroupVisible)
    .flatMap((g) => g.items.filter(isItemVisible));

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ═══════════════════════════════════════════════
          DESKTOP SIDEBAR (>= 1024px)
      ═══════════════════════════════════════════════ */}
      <aside
        data-ocid="sidebar.panel"
        className={cn(
          "hidden lg:flex flex-col bg-[oklch(var(--sidebar))] text-[oklch(var(--sidebar-foreground))] transition-all duration-200 shrink-0",
          desktopOpen ? "w-56" : "w-0 overflow-hidden",
        )}
      >
        <SidebarLogo />
        <FullNavContent />
      </aside>

      {/* ═══════════════════════════════════════════════
          TABLET ICON RAIL (768px – 1024px)
      ═══════════════════════════════════════════════ */}
      <aside
        className={cn(
          "hidden md:flex lg:hidden flex-col bg-[oklch(var(--sidebar))] text-[oklch(var(--sidebar-foreground))] transition-all duration-200 shrink-0 relative z-20",
          tabletExpanded ? "w-56" : "w-16",
        )}
      >
        {tabletExpanded ? (
          // Expanded full sidebar on tablet
          <>
            <div className="flex items-center justify-between px-3 py-3 border-b border-[oklch(var(--sidebar-border))] shrink-0">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-7 h-7 rounded bg-[oklch(var(--sidebar-primary))] text-[oklch(var(--sidebar-primary-foreground))]">
                  <Factory className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-bold leading-none text-[oklch(var(--sidebar-foreground))]">
                    FabFlow
                  </div>
                  <div className="text-[10px] text-[oklch(var(--sidebar-foreground)/0.5)] uppercase tracking-widest">
                    ERP
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTabletExpanded(false)}
                className="p-1 rounded hover:bg-[oklch(var(--sidebar-accent))] transition-colors shrink-0"
                title="Collapse sidebar"
              >
                <ChevronLeft className="w-4 h-4 text-[oklch(var(--sidebar-foreground)/0.6)]" />
              </button>
            </div>
            <FullNavContent onItemClick={() => setTabletExpanded(false)} />
          </>
        ) : (
          // Icon-only rail
          <>
            <div className="flex items-center justify-center h-14 border-b border-[oklch(var(--sidebar-border))] shrink-0">
              <button
                type="button"
                onClick={() => setTabletExpanded(true)}
                className="flex items-center justify-center w-8 h-8 rounded bg-[oklch(var(--sidebar-primary))] text-[oklch(var(--sidebar-primary-foreground))] hover:opacity-90 transition-opacity"
                title="Expand sidebar"
                data-ocid="sidebar.tablet.toggle"
              >
                <Factory className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-2 flex flex-col items-center gap-0.5">
              {allVisibleItems.map((item) => (
                <button
                  type="button"
                  key={item.page}
                  data-ocid={`nav.${item.page}.link`}
                  onClick={() => onNavigate(item.page)}
                  title={item.label}
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded transition-colors",
                    isActive(item.page)
                      ? "bg-[oklch(var(--sidebar-accent))] text-[oklch(var(--sidebar-primary))]"
                      : "text-[oklch(var(--sidebar-foreground)/0.65)] hover:bg-[oklch(var(--sidebar-accent))] hover:text-[oklch(var(--sidebar-foreground))]",
                  )}
                >
                  <item.icon className="w-[18px] h-[18px]" />
                </button>
              ))}
              {settingsVisible && (
                <button
                  type="button"
                  data-ocid="nav.settings.link"
                  onClick={() => onNavigate("settings")}
                  title="Settings"
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded transition-colors mt-auto mb-1",
                    currentPage === "settings"
                      ? "bg-[oklch(var(--sidebar-accent))] text-[oklch(var(--sidebar-primary))]"
                      : "text-[oklch(var(--sidebar-foreground)/0.65)] hover:bg-[oklch(var(--sidebar-accent))] hover:text-[oklch(var(--sidebar-foreground))]",
                  )}
                >
                  <Settings className="w-[18px] h-[18px]" />
                </button>
              )}
            </nav>
          </>
        )}
      </aside>

      {/* Tablet overlay backdrop — closes expanded sidebar on outside click */}
      {tabletExpanded && (
        <div
          className="hidden md:block lg:hidden fixed inset-0 z-10"
          onClick={() => setTabletExpanded(false)}
          onKeyDown={() => setTabletExpanded(false)}
          aria-hidden="true"
          role="presentation"
        />
      )}

      {/* ═══════════════════════════════════════════════
          MOBILE SHEET DRAWER (< 768px)
      ═══════════════════════════════════════════════ */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="p-0 w-64 bg-[oklch(var(--sidebar))] text-[oklch(var(--sidebar-foreground))] flex flex-col"
          data-ocid="sidebar.mobile.panel"
        >
          <SidebarLogo />
          <FullNavContent onItemClick={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* ═══════════════════════════════════════════════
          MAIN CONTENT AREA
      ═══════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile top header bar (< 768px) */}
        <div className="flex md:hidden items-center gap-3 px-4 py-2.5 border-b border-border bg-card shrink-0">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded hover:bg-muted transition-colors"
            data-ocid="sidebar.mobile.hamburger"
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded bg-[oklch(var(--sidebar-primary))] text-[oklch(var(--sidebar-primary-foreground))]">
              <Factory className="w-3.5 h-3.5" />
            </div>
            <span className="text-sm font-bold">FabFlow ERP</span>
          </div>
          <div className="flex-1" />
          {currentUser && (
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="h-8 px-2 gap-1 text-xs"
            >
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        {/* Desktop / Tablet top header bar (>= 768px) */}
        <header className="hidden md:flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card shrink-0">
          {/* Desktop: collapse/expand toggle */}
          <button
            type="button"
            onClick={() => setDesktopOpen((v) => !v)}
            className="hidden lg:flex p-1 rounded hover:bg-muted transition-colors"
          >
            {desktopOpen ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>

          {/* Tablet: expand icon-rail toggle */}
          <button
            type="button"
            onClick={() => setTabletExpanded((v) => !v)}
            className="flex md:flex lg:hidden p-1 rounded hover:bg-muted transition-colors"
            data-ocid="sidebar.tablet.expand"
          >
            {tabletExpanded ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>

          <div className="flex-1" />

          {currentUser && (
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                  ROLE_BADGE[currentUser.role] || "bg-gray-100 text-gray-700",
                )}
              >
                {currentUser.role}
              </span>
              <span className="text-sm font-medium hidden sm:inline">
                {currentUser.username}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="h-7 px-2 gap-1 text-xs"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </div>
          )}
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>

        <footer className="px-6 py-2 border-t border-border bg-card text-xs text-muted-foreground flex items-center justify-center">
          <span>
            &copy; {new Date().getFullYear()}. Built with{" "}
            <span className="text-red-500">&hearts;</span> using{" "}
            <a
              href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground transition-colors"
            >
              caffeine.ai
            </a>
          </span>
        </footer>
      </div>
    </div>
  );
}
