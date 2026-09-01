// Phase 7 — Dashboard (FINAL_UX_IMPLEMENTATION_BLUEPRINT.md §7, component
// C). Moved out of navGroups.ts: the blueprint frames Role Layer as ONE
// cross-cutting ordering/emphasis function applied to both the sidebar
// AND Dashboard KPIs ("not a separate visual component — an ordering/
// emphasis function applied to Sidebar and Dashboard KPIs", §11 component
// C) — it belongs in its own module rather than living inside a
// nav-specific file, now that a second real consumer (Dashboard) exists.
//
// Every function here is presentation-only reordering. Nothing is ever
// removed or hidden — real authorization stays exactly where it already
// was (permissions.ts's hasPermission()/canView()), untouched by this
// file. Admin (and any role with no entry below) sees the unmodified
// order everywhere, matching §7's "admin sees the unmodified full set."
import type { NavGroup } from "./navGroups";

const ROLE_GROUP_PRIORITY: Record<string, string[]> = {
  sales: ["Sales"],
  procurement: ["Procurement", "Production"],
  production: ["Production", "Quality Management (QMS)"],
  quality: ["Quality Management (QMS)", "Production"],
  dispatch: ["Logistics", "Sales"],
  accounts: ["Finance", "Accounts"],
  employee: ["HR"],
  // Legacy role names (see permissions.ts's own "Legacy role mappings").
  Accountant: ["Finance", "Accounts"],
  Designer: ["Production"],
  Worker: ["Production"],
};

/** Reorders `groups` so a role's primary groups sort first. The root group
 * (label "") and "Design Lab" are always pinned at their existing position
 * — only the real business groups between them get reordered. */
export function getRoleOrderedGroups(
  role: string | undefined,
  groups: NavGroup[],
): NavGroup[] {
  const priority = role ? ROLE_GROUP_PRIORITY[role] : undefined;
  if (!priority || priority.length === 0) return groups;

  const pinned = groups.filter((g) => !g.label || g.label === "Design Lab");
  const reorderable = groups.filter((g) => g.label && g.label !== "Design Lab");

  const promoted = priority
    .map((label) => reorderable.find((g) => g.label === label))
    .filter((g): g is NavGroup => !!g);
  const rest = reorderable.filter((g) => !priority.includes(g.label));

  const root = pinned.filter((g) => !g.label);
  const designLab = pinned.filter((g) => g.label === "Design Lab");

  return [...root, ...promoted, ...rest, ...designLab];
}

// Dashboard KPI emphasis — which of the real KPI cards is most relevant
// to a role's primary job function. Same "promote, don't remove" pattern:
// every KPI stays visible and clickable for every role, only the ORDER
// (leftmost = most prominent in the grid) changes.
const ROLE_KPI_PRIORITY: Record<string, string[]> = {
  sales: ["quotations", "projects"],
  procurement: ["projects"],
  production: ["projects"],
  quality: ["projects"],
  dispatch: ["projects"],
  accounts: ["invoices", "received"],
  Accountant: ["invoices", "received"],
  employee: [],
};

/** Generic version of the same reorder — used for Dashboard's KPI row.
 * `keyOf` extracts each item's stable role-priority key (see
 * ROLE_KPI_PRIORITY above); items with no matching key just keep their
 * original relative order at the end. */
export function getRoleOrderedKpis<T>(
  role: string | undefined,
  items: T[],
  keyOf: (item: T) => string,
): T[] {
  const priority = role ? ROLE_KPI_PRIORITY[role] : undefined;
  if (!priority || priority.length === 0) return items;

  const promoted = priority
    .map((key) => items.find((item) => keyOf(item) === key))
    .filter((item): item is T => !!item);
  const rest = items.filter((item) => !priority.includes(keyOf(item)));

  return [...promoted, ...rest];
}
