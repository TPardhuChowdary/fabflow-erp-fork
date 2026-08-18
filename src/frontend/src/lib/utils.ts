import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Returns the customer-visible project name.
 * ALWAYS use this for invoices, quotations, DCs, PDFs, exports — never show internal ORD-xxx codes.
 * Falls back to projectName for backward compatibility with existing data.
 */
export function getCustomerVisibleName(project: {
  projectName: string;
  customerVisibleName?: string;
}): string {
  return project.customerVisibleName || project.projectName;
}

/**
 * Returns a search-friendly string covering all project name variants.
 * Use for filtering/searching — includes internal codes.
 */
export function getProjectSearchText(project: {
  projectName: string;
  customerVisibleName?: string;
  internalOrderCode?: string;
  projectNo?: string;
}): string {
  return [
    project.projectName,
    project.customerVisibleName,
    project.internalOrderCode,
    project.projectNo,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Given projects newly checked off in "+ Add Projects" and a document's
 * current line items, returns which of those projects should actually
 * become new line items — filtering out any project already represented
 * by an existing line item, so re-selecting an already-added project is
 * a no-op rather than a duplicate.
 *
 * Dedup is id-based when possible (an existing line item's `projectId`
 * matches the project's `id` — robust even if the project is later
 * renamed or the line item's description is hand-edited), falling back
 * to an exact description-string match against the project's
 * customer-visible name for legacy line items created before line items
 * carried a `projectId` at all (preserves the app's original,
 * string-only dedup behavior for that pre-existing data).
 *
 * Shared by both Quotation (`LineItem`) and Invoice (`InvLineItem`) —
 * both shapes satisfy the generic constraint below despite differing in
 * their price-field name (`unitPrice` vs `rate`), so each page maps the
 * returned `Project[]` into its own line-item shape.
 */
export function projectsNeedingNewLineItems<
  P extends { id: string; projectName: string; customerVisibleName?: string },
  T extends { desc: string; projectId?: string },
>(selectedProjects: P[], existingItems: T[]): P[] {
  const existingProjectIds = new Set(
    existingItems
      .map((li) => li.projectId)
      .filter((id): id is string => Boolean(id)),
  );
  const existingDescs = new Set(existingItems.map((li) => li.desc.trim()));
  const seen = new Set<string>();
  const result: P[] = [];
  for (const proj of selectedProjects) {
    if (seen.has(proj.id) || existingProjectIds.has(proj.id)) continue;
    const name = getCustomerVisibleName(proj);
    if (existingDescs.has(name)) continue;
    seen.add(proj.id);
    result.push(proj);
  }
  return result;
}
