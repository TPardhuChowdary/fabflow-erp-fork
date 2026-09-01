import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
// Phase 2 — Application Shell (FINAL_UX_IMPLEMENTATION_BLUEPRINT.md §9).
//
// Production had zero command/search surface before this — confirmed live,
// ⌘K did nothing. This is pure addition: it never removes or replaces any
// existing navigation path (the sidebar is untouched), it only adds a
// second, faster way to reach the same real routes/records.
//
// Built on the project's own existing shadcn/cmdk primitive
// (components/ui/command.tsx, already installed as a dependency before this
// phase) rather than a new library — that primitive already wraps Radix
// Dialog, so focus-trap, Escape-to-close, and focus-return-on-close are
// inherited for free and don't need to be hand-built here.
//
// Scope trim, reported honestly rather than silently: this is a NAVIGATION
// surface only ("open X" / "show X"). The blueprint's "approve X" example
// would mean invoking a real store mutation from a keyboard palette, which
// is a materially larger and riskier addition than a shell phase should
// take on; deferred to a later phase rather than half-built here.
//
// Workspaces feature (see chat) — "Recent" here now reads/writes the same
// shared RecentWorkspacesContext the visible sidebar Workspaces section
// uses (App.tsx's navigateToRecord is the one place that calls
// pushRecent), rather than owning a separate local list — selecting a
// record here and clicking it in the sidebar list produce the exact same
// entry. Plain module "Go to" jumps are deliberately NOT pushed to Recent
// any more — Workspaces is specifically about real ERP entities
// (projects/customers/vendors/employees/machines), not arbitrary page
// visits, so this narrows what used to be a broader "recent nav" concept
// to match.
import {
  Building2,
  Clock,
  FolderKanban,
  Store,
  Users,
  Wrench,
} from "lucide-react";
import { useMemo } from "react";
import { useAuth } from "../AuthContext";
import {
  type WorkspaceRecordType,
  useRecentWorkspaces,
} from "../RecentWorkspacesContext";
import { canView } from "../permissions";
import { useStore } from "../store";
import type { Page } from "../types";
import { NAV_GROUPS_FOR_COMMAND_PALETTE } from "./navGroups";

export type RecordType = WorkspaceRecordType;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (page: Page) => void;
  onNavigateToRecord: (type: RecordType, id: string) => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
  onNavigateToRecord,
}: Props) {
  const { currentUser } = useAuth();
  const { projects, customers, employees, machines, vendors } = useStore();
  const { recent, pushRecent } = useRecentWorkspaces();

  // Same real permission filter Layout.tsx's sidebar already uses — the
  // palette can never surface a destination the signed-in user can't
  // actually reach. Design Lab entries are deliberately excluded: they're
  // an internal dev tool, not a real ERP destination for daily use.
  const navItems = useMemo(
    () =>
      NAV_GROUPS_FOR_COMMAND_PALETTE.flatMap((group) =>
        group.items
          .filter(
            (item) =>
              item.moduleKey === "__always__" ||
              canView(currentUser, item.moduleKey),
          )
          .map((item) => ({ ...item, group: group.label || "General" })),
      ),
    [currentUser],
  );

  const runNavigate = (page: Page) => {
    onNavigate(page);
    onOpenChange(false);
  };

  const runNavigateToRecord = (type: RecordType, id: string) => {
    onNavigateToRecord(type, id);
    onOpenChange(false);
    pushRecent(type, id);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command Palette"
      description="Jump to any module or record"
    >
      <CommandInput placeholder="Search modules, projects, customers…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {recent.length > 0 && (
          <>
            <CommandGroup heading="Recent Workspaces">
              {recent.map((r) => (
                <CommandItem
                  key={`recent-${r.key}`}
                  value={`${r.label} ${r.secondary} recent`}
                  onSelect={() => runNavigateToRecord(r.type, r.id)}
                >
                  <Clock className="text-muted-foreground" />
                  <span>{r.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground truncate max-w-40">
                    {r.secondary}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Go to">
          {navItems.map((item) => (
            <CommandItem
              key={`${item.group}-${item.page}`}
              value={`${item.label} ${item.group}`}
              onSelect={() => runNavigate(item.page)}
            >
              <item.icon className="text-muted-foreground" />
              <span>{item.label}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {item.group}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        {projects.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Projects">
              {projects.slice(0, 50).map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.projectNo} ${p.projectName ?? ""}`}
                  onSelect={() => runNavigateToRecord("project", p.id)}
                >
                  <FolderKanban className="text-muted-foreground" />
                  <span className="font-mono">{p.projectNo}</span>
                  <span className="ml-auto text-xs text-muted-foreground truncate max-w-40">
                    {customers.find((c) => c.id === p.customerId)?.name}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {customers.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Customers">
              {customers.slice(0, 50).map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.name}
                  onSelect={() => runNavigateToRecord("customer", c.id)}
                >
                  <Users className="text-muted-foreground" />
                  <span>{c.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {vendors.length > 0 && canView(currentUser, "vendors") && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Vendors">
              {vendors.slice(0, 50).map((v) => (
                <CommandItem
                  key={v.id}
                  value={v.name}
                  onSelect={() => runNavigateToRecord("vendor", v.id)}
                >
                  <Store className="text-muted-foreground" />
                  <span>{v.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {machines.length > 0 && canView(currentUser, "machinery") && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Machinery">
              {machines.slice(0, 50).map((m) => (
                <CommandItem
                  key={m.id}
                  value={`${m.machineCode} ${m.name}`}
                  onSelect={() => runNavigateToRecord("machine", m.id)}
                >
                  <Wrench className="text-muted-foreground" />
                  <span>{m.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground font-mono">
                    {m.machineCode}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {employees.length > 0 && canView(currentUser, "employees") && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Employees">
              {employees.slice(0, 50).map((e) => (
                <CommandItem
                  key={e.id}
                  value={e.name}
                  onSelect={() => runNavigateToRecord("employee", e.id)}
                >
                  <Building2 className="text-muted-foreground" />
                  <span>{e.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
