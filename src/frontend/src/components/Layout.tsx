// Phase 2 — Application Shell (FINAL_UX_IMPLEMENTATION_BLUEPRINT.md §5, §6,
// §7, §9, §11.A-B, §12). Real icon-rail collapse/expand + Role Layer group
// ordering + Command Palette, built on top of the existing grouped/
// collapsible sidebar (navGroups.ts, permissions.ts's canView — both
// unchanged). Every real module, route, and permission check that existed
// before this phase still exists, unchanged — only the shell around them
// changed shape.
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Building2 as CustomerIcon,
  Factory,
  FolderKanban,
  LogOut,
  Menu,
  Search,
  Settings,
  Store,
  UserCircle2,
  Wrench,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import {
  type WorkspaceRecordType,
  useRecentWorkspaces,
} from "../RecentWorkspacesContext";
import { canView } from "../permissions";
import type { Page } from "../types";
import { CommandPalette } from "./CommandPalette";
import {
  type NavGroup,
  type NavItem,
  getRoleOrderedGroups,
  navGroups,
} from "./navGroups";

const SIDEBAR_STORAGE_KEY = "fabflow-sidebar-open";

const WORKSPACE_ICON: Record<WorkspaceRecordType, typeof FolderKanban> = {
  project: FolderKanban,
  customer: CustomerIcon,
  vendor: Store,
  employee: UserCircle2,
  machine: Wrench,
};

// Role identity badges — deliberately NOT the success/warning/destructive
// severity set (a role isn't "bad" or "good"), and not literal Tailwind
// hues either. Uses the app's real chart-1..5 tokens, the one token
// category actually meant for "several categorical values need visually
// distinct treatment" — matches Employees.tsx's own STATUS_BADGE map
// below for the 4 legacy roles both files share.
const ROLE_BADGE: Record<string, string> = {
  Admin: "bg-chart-4/15 text-chart-4",
  admin: "bg-chart-4/15 text-chart-4",
  Accountant: "bg-chart-2/15 text-chart-2",
  Designer: "bg-chart-5/15 text-chart-5",
  Worker: "bg-chart-3/15 text-chart-3",
  sales: "bg-chart-1/15 text-chart-1",
  procurement: "bg-chart-4/15 text-chart-4",
  production: "bg-chart-3/15 text-chart-3",
  quality: "bg-chart-2/15 text-chart-2",
  dispatch: "bg-chart-5/15 text-chart-5",
  employee: "bg-muted text-muted-foreground",
};

interface Props {
  currentPage: Page;
  onNavigate: (p: Page) => void;
  /** Optional — see App.tsx. Lets the Command Palette and the sidebar
   * Workspaces section jump straight to a specific real record's detail
   * page (project/customer/vendor/employee/machine), the same way every
   * existing "onView*" callback in App.tsx already does for the
   * sidebar/other real navigation triggers. Falls back to a same-page
   * no-op if not provided (defensive only — App.tsx always provides it). */
  onNavigateToRecord?: (type: WorkspaceRecordType, id: string) => void;
  /** Workspaces feature (see chat) — `${type}-${id}` of whatever record
   * is currently open, so the matching Workspaces list entry (if any) can
   * be highlighted as active. Undefined on any page that isn't a
   * record's own detail view. */
  activeWorkspaceKey?: string;
  children: ReactNode;
}

export function Layout({
  currentPage,
  onNavigate,
  onNavigateToRecord,
  activeWorkspaceKey,
  children,
}: Props) {
  const { currentUser, logout } = useAuth();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Desktop rail: collapsed = 56px icon-only, expanded = 224px icon+label
  // (Instrument's "collapsed-by-default icon rail" — blueprint §4/§5/§11.A).
  // Persisted the same way ThemeContext persists the theme preference: a
  // standalone localStorage key, not folded into the Zustand store, since
  // this is a UI-only client preference.
  const [desktopOpen, setDesktopOpen] = useState<boolean>(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
      return stored === null ? false : stored === "true";
    } catch {
      return false;
    }
  });
  // Mobile + tablet (< 1024px): sheet drawer open state — same drawer
  // serves both; see the responsive audit's Fix 2 (tablet previously had
  // its own permanent icon-rail tier here, removed in favor of reusing
  // this existing pattern rather than inventing a second one).
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  // Workspaces feature (see chat) — the SAME shared context App.tsx's
  // navigateToRecord writes to and CommandPalette's "Recent Workspaces"
  // group reads. No local recent-nav state left in this component at
  // all any more - this is the single source of truth, just read here.
  const { recent } = useRecentWorkspaces();

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(desktopOpen));
    } catch {
      // localStorage unavailable (private browsing, quota) — in-memory
      // state still works for the current session.
    }
  }, [desktopOpen]);

  // Global ⌘K/Ctrl+K — the persistent, keyboard-reachable-from-anywhere
  // trigger the blueprint's Command Palette spec (§9) requires. Layout is
  // the one component mounted on every authenticated screen, so this is
  // the correct single place to own the listener.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const toggleGroup = (label: string) =>
    setCollapsed((c) => ({ ...c, [label]: !c[label] }));

  const isActive = (page: Page) =>
    currentPage === page ||
    (page === "projects" && currentPage === "project-detail") ||
    (page === "employees" && currentPage === "employee-detail") ||
    (page === "machinery" && currentPage === "machine-detail");

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

  // Role Layer (blueprint §7): reorders which groups appear first for the
  // signed-in role's real primary module set. Presentation only — every
  // group/item below is still rendered and still gated by the exact same
  // canView() check as before; nothing here can grant or remove access.
  const orderedGroups = getRoleOrderedGroups(currentUser?.role, navGroups);
  const visibleGroups = orderedGroups.filter(isGroupVisible);

  // Flattened for the collapsed 56px icon-rail state, where group headers
  // don't render — every real, permission-visible item, in the same
  // role-ordered sequence, each still individually reachable.
  const flatItems = visibleGroups.flatMap((group) =>
    group.items.filter(isItemVisible).map((item) => ({ item, group })),
  );

  const navigateToRecord = (type: WorkspaceRecordType, id: string) => {
    onNavigateToRecord?.(type, id);
  };

  const openCommandPalette = () => setCommandOpen(true);

  // Workspaces feature (see chat) — the visible, permanently-present
  // section this whole pass is about. Always rendered (even with zero
  // history — requirement #1: "visible... even when there are no
  // recently opened records"), shows a real entity icon + primary
  // identifier + secondary disambiguator per entry, highlights whichever
  // one matches activeWorkspaceKey, and a "Browse" row that opens the
  // same Command Palette rather than duplicating a second browse-UI.
  const WorkspacesSection = ({ onItemClick }: { onItemClick?: () => void }) => (
    <div className="px-2 pt-2 pb-1" data-ocid="sidebar.workspaces">
      <div className="flex items-center gap-1.5 px-2 pt-1 pb-1.5 text-[10px] uppercase tracking-widest font-semibold text-[oklch(var(--sidebar-foreground)/0.45)]">
        <Clock className="w-3 h-3" aria-hidden="true" />
        Workspaces
      </div>
      {recent.length === 0 ? (
        <p className="px-2 pb-1.5 text-xs text-[oklch(var(--sidebar-foreground)/0.4)] leading-snug">
          Recently opened projects, customers, vendors, and employees will
          appear here.
        </p>
      ) : (
        <div className="space-y-0.5 mb-1">
          {recent.map((entry) => {
            const Icon = WORKSPACE_ICON[entry.type];
            const active = activeWorkspaceKey === entry.key;
            return (
              <button
                key={entry.key}
                type="button"
                data-ocid="sidebar.workspaces.item"
                aria-current={active ? "page" : undefined}
                title={`${entry.label} — ${entry.secondary}`}
                onClick={() => {
                  navigateToRecord(entry.type, entry.id);
                  onItemClick?.();
                }}
                className={cn(
                  "flex items-center gap-2.5 w-full px-2 py-1.5 rounded text-sm transition-colors text-left",
                  active
                    ? "bg-[oklch(var(--sidebar-accent))] text-[oklch(var(--sidebar-primary))] font-semibold"
                    : "text-[oklch(var(--sidebar-foreground)/0.75)] hover:bg-[oklch(var(--sidebar-accent))] hover:text-[oklch(var(--sidebar-foreground))]",
                )}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block truncate leading-tight">
                    {entry.label}
                  </span>
                  <span className="block truncate text-[11px] text-[oklch(var(--sidebar-foreground)/0.45)] leading-tight">
                    {entry.secondary}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          openCommandPalette();
          onItemClick?.();
        }}
        data-ocid="sidebar.workspaces.browse"
        className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded text-xs text-[oklch(var(--sidebar-foreground)/0.5)] hover:bg-[oklch(var(--sidebar-accent))] hover:text-[oklch(var(--sidebar-foreground))] transition-colors"
      >
        <Search className="w-3.5 h-3.5 shrink-0" />
        <span>Open another workspace…</span>
      </button>
      <div className="mt-1 border-t border-[oklch(var(--sidebar-border))]" />
    </div>
  );

  // Shared search-trigger affordance — a real, always-visible, click-or-
  // keyboard-reachable entry point (never hover-only), satisfying both the
  // Command Palette's discoverability requirement (§9) and the shell's
  // accessibility rule against relying solely on hover (§13).
  const SearchTrigger = ({ expanded }: { expanded: boolean }) => (
    <button
      type="button"
      onClick={openCommandPalette}
      data-ocid="sidebar.search.trigger"
      aria-label="Open command palette (Ctrl+K)"
      className={cn(
        "flex items-center gap-2.5 w-full rounded text-sm text-[oklch(var(--sidebar-foreground)/0.6)] border border-[oklch(var(--sidebar-border))] hover:bg-[oklch(var(--sidebar-accent))] hover:text-[oklch(var(--sidebar-foreground))] transition-colors",
        expanded ? "px-2.5 py-1.5 justify-between" : "justify-center p-2",
      )}
    >
      <span className="flex items-center gap-2.5">
        <Search className="w-3.5 h-3.5 shrink-0" />
        {expanded && <span>Search…</span>}
      </span>
      {expanded && (
        <kbd className="text-[10px] font-mono bg-[oklch(var(--sidebar-accent))] px-1.5 py-0.5 rounded">
          ⌘K
        </kbd>
      )}
    </button>
  );

  // Full expanded nav — group headers, per-group collapse, full labels.
  // Structurally the same nav that existed before this phase; only the
  // group ORDER now comes from the Role Layer instead of a fixed sequence.
  const ExpandedNavContent = ({
    onItemClick,
  }: { onItemClick?: () => void }) => (
    <>
      <div className="px-2 pt-2">
        <SearchTrigger expanded />
      </div>
      <WorkspacesSection onItemClick={onItemClick} />
      <nav
        aria-label="Primary navigation"
        className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5"
      >
        {visibleGroups.map((group) => (
          <div key={group.label || "__root__"}>
            {group.label && (
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                aria-expanded={!collapsed[group.label]}
                className="flex items-center justify-between w-full px-2 py-1.5 mt-2 text-[10px] uppercase tracking-widest font-semibold text-[oklch(var(--sidebar-foreground)/0.45)] hover:text-[oklch(var(--sidebar-foreground)/0.7)] transition-colors"
              >
                <span>{group.label}</span>
                {collapsed[group.label] ? (
                  <ChevronRight className="w-3 h-3" aria-hidden="true" />
                ) : (
                  <ChevronDown className="w-3 h-3" aria-hidden="true" />
                )}
              </button>
            )}
            {!collapsed[group.label] &&
              group.items.filter(isItemVisible).map((item) => (
                <button
                  type="button"
                  key={`${group.label}-${item.page}`}
                  data-ocid={`nav.${item.page}.link`}
                  aria-current={isActive(item.page) ? "page" : undefined}
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
            aria-current={currentPage === "settings" ? "page" : undefined}
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

  // Collapsed 56px icon rail — flat item list (no group headers, which
  // don't fit and don't add anything at icon-only width), a thin divider
  // between different groups' icons for a residual grouping cue. Clicking
  // an icon both navigates AND expands the rail in one action (component
  // B's spec) — the collapsed rail is a quick-glance/quick-jump state, not
  // a permanently narrow one.
  const CollapsedRailContent = () => (
    <nav
      aria-label="Primary navigation (collapsed)"
      className="flex-1 overflow-y-auto py-2 px-1.5 flex flex-col items-center gap-0.5"
    >
      <div className="w-full pb-1">
        <SearchTrigger expanded={false} />
      </div>
      {flatItems.map(({ item, group }, i) => {
        const prevGroup = i > 0 ? flatItems[i - 1].group : null;
        const showDivider = prevGroup && prevGroup.label !== group.label;
        return (
          <div key={`${group.label}-${item.page}`} className="w-full">
            {showDivider && (
              <div className="my-1 mx-1.5 border-t border-[oklch(var(--sidebar-border))]" />
            )}
            <button
              type="button"
              data-ocid={`nav.${item.page}.link.collapsed`}
              aria-label={item.label}
              aria-current={isActive(item.page) ? "page" : undefined}
              title={item.label}
              onClick={() => {
                onNavigate(item.page);
                setDesktopOpen(true);
              }}
              className={cn(
                "flex items-center justify-center w-full p-2 rounded transition-colors",
                isActive(item.page)
                  ? "bg-[oklch(var(--sidebar-accent))] text-[oklch(var(--sidebar-primary))]"
                  : "text-[oklch(var(--sidebar-foreground)/0.75)] hover:bg-[oklch(var(--sidebar-accent))] hover:text-[oklch(var(--sidebar-foreground))]",
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
            </button>
          </div>
        );
      })}
      {settingsVisible && (
        <>
          <div className="my-1 mx-1.5 w-full border-t border-[oklch(var(--sidebar-border))]" />
          <button
            type="button"
            data-ocid="nav.settings.link.collapsed"
            aria-label="Settings"
            aria-current={currentPage === "settings" ? "page" : undefined}
            title="Settings"
            onClick={() => {
              onNavigate("settings");
              setDesktopOpen(true);
            }}
            className={cn(
              "flex items-center justify-center w-full p-2 rounded transition-colors",
              currentPage === "settings"
                ? "bg-[oklch(var(--sidebar-accent))] text-[oklch(var(--sidebar-primary))]"
                : "text-[oklch(var(--sidebar-foreground)/0.75)] hover:bg-[oklch(var(--sidebar-accent))] hover:text-[oklch(var(--sidebar-foreground))]",
            )}
          >
            <Settings className="w-4 h-4 shrink-0" />
          </button>
        </>
      )}
    </nav>
  );

  // Sidebar logo header
  const SidebarLogo = ({ expanded }: { expanded: boolean }) => (
    <div
      className={cn(
        "flex items-center gap-2 py-4 border-b border-[oklch(var(--sidebar-border))] shrink-0",
        expanded ? "px-4" : "px-1.5 justify-center",
      )}
    >
      <div className="flex items-center justify-center w-7 h-7 rounded bg-[oklch(var(--sidebar-primary))] text-[oklch(var(--sidebar-primary-foreground))] shrink-0">
        <Factory className="w-4 h-4" />
      </div>
      {expanded && (
        <div>
          <div className="text-sm font-bold leading-none text-[oklch(var(--sidebar-foreground))]">
            FabFlow
          </div>
          <div className="text-[10px] text-[oklch(var(--sidebar-foreground)/0.5)] uppercase tracking-widest">
            ERP
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Skip-to-content link (blueprint §11.A) — visually hidden until
          keyboard-focused, first focusable element on every authenticated
          screen. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:rounded focus:bg-primary focus:text-primary-foreground focus:text-sm focus:font-semibold"
      >
        Skip to content
      </a>

      {/* ═══════════════════════════════════════════════
          DESKTOP SIDEBAR / RAIL (>= 1024px)
      ═══════════════════════════════════════════════ */}
      <aside
        data-ocid="sidebar.panel"
        className={cn(
          "hidden lg:flex flex-col bg-[oklch(var(--sidebar))] text-[oklch(var(--sidebar-foreground))] transition-all duration-200 shrink-0",
          desktopOpen ? "w-56" : "w-14",
        )}
      >
        <SidebarLogo expanded={desktopOpen} />
        {desktopOpen ? <ExpandedNavContent /> : <CollapsedRailContent />}
      </aside>

      {/* ═══════════════════════════════════════════════
          MOBILE + TABLET SHEET DRAWER (< 1024px) — always the full
          expanded content; a 56px rail makes no sense as a drawer.
      ═══════════════════════════════════════════════ */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="p-0 w-64 bg-[oklch(var(--sidebar))] text-[oklch(var(--sidebar-foreground))] flex flex-col"
          data-ocid="sidebar.mobile.panel"
        >
          {/* Visually hidden — was previously missing entirely (a
              pre-existing gap, not introduced this phase), fixed here
              since it's a one-line addition in a file already being
              touched: Radix requires every Dialog/Sheet to have an
              accessible title for screen readers even when, as here, the
              logo above already conveys it visually. */}
          <SheetTitle className="sr-only">Navigation menu</SheetTitle>
          <SidebarLogo expanded />
          <ExpandedNavContent onItemClick={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* ═══════════════════════════════════════════════
          MAIN CONTENT AREA
      ═══════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile + tablet top header bar (< 1024px) — same hamburger
            header now serves both, per Fix 2 */}
        <div className="flex lg:hidden items-center gap-3 px-4 py-2.5 border-b border-border bg-card shrink-0">
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
          <button
            type="button"
            onClick={openCommandPalette}
            className="p-1.5 rounded hover:bg-muted transition-colors"
            aria-label="Open command palette"
            data-ocid="sidebar.mobile.search"
          >
            <Search className="w-4 h-4" />
          </button>
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

        {/* Desktop top header bar (>= 1024px) */}
        <header className="hidden lg:flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card shrink-0">
          {/* Desktop: collapse/expand toggle */}
          <button
            type="button"
            onClick={() => setDesktopOpen((v) => !v)}
            className="flex p-1 rounded hover:bg-muted transition-colors"
            aria-label={desktopOpen ? "Collapse sidebar" : "Expand sidebar"}
            data-ocid="sidebar.desktop.toggle"
          >
            {desktopOpen ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>

          <div className="flex-1" />

          {currentUser && (
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                  ROLE_BADGE[currentUser.role] ||
                    "bg-muted text-muted-foreground",
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

        <main
          id="main-content"
          className="flex-1 overflow-y-auto p-4 md:p-6"
          tabIndex={-1}
        >
          {children}
        </main>

        <footer className="px-6 py-2 border-t border-border bg-card text-xs text-muted-foreground flex items-center justify-center">
          <span>
            &copy; {new Date().getFullYear()} FabFlow ERP. All rights reserved.
          </span>
        </footer>
      </div>

      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onNavigate={onNavigate}
        onNavigateToRecord={navigateToRecord}
      />
    </div>
  );
}
