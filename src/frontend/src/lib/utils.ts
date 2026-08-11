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
export function getCustomerVisibleName(project: { projectName: string; customerVisibleName?: string }): string {
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
