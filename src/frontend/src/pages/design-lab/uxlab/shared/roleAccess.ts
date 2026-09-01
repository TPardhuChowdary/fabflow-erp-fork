// Final Unified Prototype — Role Layer.
//
// Grounded in the real ROLE_DEFAULTS in src/frontend/permissions.ts,
// which grants each real FabFlow role a genuinely different set of
// module.action permissions server-side. This is a best-effort mapping
// from those real permission-module keys onto this lab's ViewKeys —
// disclosed here rather than invented silently:
//   - quality_inspection, quality_characteristics and inspection_sheets
//     (three separate real modules) all collapse onto this lab's single
//     "qms" view, since the lab models QMS as one screen, not four.
//   - "scrap" and "reports" have no entry in the real permission catalog
//     (MODULE_PERMISSIONS) at all; they're treated here as Production/
//     System-visible defaults rather than omitted.
//
// A role changes ordering and dashboard emphasis (primary vs secondary),
// and hides sidebar groups the role has zero access to at all — matching
// the real Layout.tsx's own isGroupVisible() gating — but never invents
// access a role doesn't really have.
import {
  Boxes,
  Factory,
  type LucideIcon,
  PackageCheck,
  ShieldCheck,
  ShoppingCart,
  Truck,
  UsersRound,
  Wallet,
} from "lucide-react";
import type { ViewKey } from "./ModuleRouter";
import type { NavGroup } from "./functionalGroups";

export interface RoleDef {
  id: string;
  label: string;
  icon: LucideIcon;
  // real full/near-full access — promoted to the top of the sidebar and
  // used to build the dashboard's "your work" shortcuts
  primary: ViewKey[];
  // real view-only slices — still visible, not promoted
  secondary: ViewKey[];
}

export const ROLES: RoleDef[] = [
  {
    id: "admin",
    label: "Admin",
    icon: ShieldCheck,
    primary: [],
    secondary: [],
  },
  {
    id: "sales",
    label: "Sales",
    icon: Boxes,
    primary: ["customers", "projects", "quotations", "company-po"],
    secondary: ["employees"],
  },
  {
    id: "procurement",
    label: "Procurement",
    icon: ShoppingCart,
    primary: [
      "vendors",
      "purchase-orders",
      "material-requisitions",
      "inventory",
    ],
    secondary: ["tools", "dies"],
  },
  {
    id: "production",
    label: "Production Supervisor",
    icon: Factory,
    primary: [
      "production",
      "material-requisitions",
      "machinery",
      "tools",
      "dies",
      "machine-revenue",
      "drawings",
    ],
    secondary: ["projects", "inventory", "qms", "employees"],
  },
  {
    id: "quality",
    label: "QC Inspector",
    icon: PackageCheck,
    primary: ["qms"],
    secondary: ["projects", "production", "delivery-challans"],
  },
  {
    id: "dispatch",
    label: "Dispatch",
    icon: Truck,
    primary: ["delivery-challans"],
    secondary: ["projects", "employees"],
  },
  {
    id: "accounts",
    label: "Accounts",
    icon: Wallet,
    primary: ["invoices", "payments", "payables", "petty-expenses", "ledger"],
    secondary: [
      "customers",
      "projects",
      "employees",
      "machinery",
      "machine-revenue",
      "export-engine",
    ],
  },
  {
    id: "employee",
    label: "Employee (self-service)",
    icon: UsersRound,
    primary: ["petty-expenses"],
    secondary: ["employees"],
  },
];

// Admin sees every group; every other role sees a group only if it
// contains at least one primary or secondary item they have real
// access to — mirroring the real sidebar's isGroupVisible() gating.
// "system" (Reports/Settings/Export) stays visible to everyone, same as
// the real app's top-level Settings/Reports reachability.
export function visibleGroupIds(
  role: RoleDef,
  groups: NavGroup[],
): Set<string> {
  if (role.id === "admin") return new Set(groups.map((g) => g.id));
  const allowed = new Set<ViewKey>([...role.primary, ...role.secondary]);
  const ids = new Set<string>();
  for (const g of groups) {
    if (g.items.some((i) => allowed.has(i.key))) ids.add(g.id);
  }
  ids.add("system");
  return ids;
}

// Within a visible group, show only items the role has real primary/
// secondary access to (admin sees every item) — matching the real
// Layout.tsx's own item-level canView(currentUser, item.moduleKey) gate,
// not just a whole-group toggle — and sort primary items first.
export function orderedItems(role: RoleDef, group: NavGroup) {
  const rank = (key: ViewKey) =>
    role.primary.includes(key) ? 0 : role.secondary.includes(key) ? 1 : 2;
  const items =
    role.id === "admin" || group.id === "system"
      ? group.items
      : group.items.filter((i) => rank(i.key) < 2);
  return [...items].sort((a, b) => rank(a.key) - rank(b.key));
}
