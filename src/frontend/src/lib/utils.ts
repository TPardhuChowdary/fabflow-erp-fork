import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Normalizes a business/entity name for consistent storage and display:
 * trims surrounding whitespace and uppercases. Applied once, at the API
 * write boundary (see customersApi.ts, vendorsApi.ts, projectsApi.ts,
 * inventoryApi.ts's toXFields() functions — the single place every
 * create AND update already funnels through), so "metal rods" /
 * "Metal Rods" / "METAL RODS" always end up stored as the same value
 * instead of drifting per how each user happened to type it. Existing
 * case-insensitive duplicate checks elsewhere in the app (store.ts,
 * VendorSelect.tsx, MaterialDetailDrawer.tsx) are unaffected — they
 * lowercase both sides before comparing, which still works the same way
 * against normalized values.
 *
 * Deliberately narrow in scope: only for company/customer/vendor/project/
 * product-item names. Never apply this to email addresses, personal
 * (employee) names, free-text fields (notes/descriptions/remarks/work
 * descriptions), URLs, or file names — excluded on purpose, not by
 * oversight.
 */
export function normalizeBusinessName(name: string): string {
  return name.trim().toUpperCase();
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

/**
 * Phase 1 attachment-bug fix — the one place that converts a stored
 * base64 data-URI attachment into an openable blob: URL. Extracted from
 * CompanyPOs.tsx's pre-existing `openFile`, which already did this
 * correctly; Inventory.tsx/MaterialDetailDrawer.tsx were instead
 * navigating straight to the raw data: URI (`window.open(att.ref)` /
 * `href={att.ref}`), which silently fails or hangs in several browsers
 * once a scanned invoice/PDF pushes the data URI past a few MB. Never
 * duplicate this conversion at a new call site again — import it.
 *
 * Returns false (and lets the caller show its own toast) if `dataUri`
 * isn't a well-formed data: URI — never throws.
 */
export function openAttachmentPreview(dataUri: string): boolean {
  try {
    const [header, base64] = dataUri.split(",");
    const mimeMatch = header.match(/^data:([^;]+);base64$/);
    if (!mimeMatch || !base64) return false;
    const byteString = atob(base64);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      bytes[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeMatch[1] });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    // Deliberately not revoked immediately — the new tab needs the blob
    // to still resolve after this function returns. Left to the
    // browser's own tab-lifetime GC, same tradeoff CompanyPOs.tsx's
    // original version already made.
    return true;
  } catch {
    return false;
  }
}

/**
 * Triggers a browser download of a stored base64 data-URI attachment
 * under its original filename. A plain `<a download>` click handles a
 * data: URI fine at any size (unlike navigating/`window.open` to one) —
 * no blob conversion needed here, just centralized so every attachment
 * download call site matches.
 */
export function downloadAttachment(dataUri: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUri;
  a.download = filename;
  a.click();
}

/**
 * Phase 2 automatic file naming — FabFlow's one filename generator for
 * business documents that already have a standardized, auto-generated
 * identity (Quotation.qtNo, Invoice.invNo, DeliveryChallan.dcNo,
 * CompanyPO.cpoNumber, ...). The user never types this filename; every
 * document-download call site builds it from the record's own already-
 * unique number instead of inlining `${prefix}_${record.no}.pdf` itself
 * (5 call sites did exactly that, each slightly differently, before this
 * existed — see Quotations/Invoices/DeliveryChallans/CompanyPOs.tsx).
 *
 * `documentNumber` is expected to already be a real, unique business
 * number (e.g. "QT-2026-011") — it IS the filename base, no extra
 * "Quotation_" prefix needed, since the number is already self-
 * describing. Falls back to `fallbackId` only for the (should-not-
 * happen-in-practice) case a record's number is somehow missing, so a
 * download never crashes for want of a name.
 *
 * `revision`, when given and greater than 1, appends `-REV{n}` — the
 * base (first) revision of any document keeps its plain filename
 * unchanged, exactly matching today's behavior; only an actual amendment
 * gets the marker, where it adds real information.
 */
export function generateDocumentFilename(
  documentNumber: string | undefined,
  fallbackId: string,
  opts?: { revision?: number; extension?: string },
): string {
  const base = sanitizeFilenameSegment(documentNumber || fallbackId);
  const revisionSuffix =
    opts?.revision && opts.revision > 1 ? `-REV${opts.revision}` : "";
  const ext = opts?.extension ?? "pdf";
  return `${base}${revisionSuffix}.${ext}`;
}

/** Strips characters illegal/problematic in a filename on Windows,
 * macOS, and Linux alike. FabFlow's own generated business numbers never
 * contain these, but this is the one place that guarantees it rather
 * than trusting every future caller to. */
function sanitizeFilenameSegment(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "-").trim();
}
