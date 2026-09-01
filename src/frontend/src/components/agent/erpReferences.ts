// AI Agent redesign (see chat) — "ERP-aware responses" (requirement #6).
//
// Purely client-side, purely additive: scans an already-generated agent
// message for substrings that match a REAL record already loaded in the
// store (by its real document number, or by an exact real name), and
// turns only those matches into a clickable reference. Never invents an
// entity, a route, or a relationship — a mention that doesn't match a
// real record stays plain text, exactly as it renders today.
//
// Two kinds of destination, both reusing navigation that already exists
// elsewhere in the app rather than inventing new routes:
//   - "record": Project/Customer/Employee already have a real per-ID
//     detail route (App.tsx's navigateToRecord, the same function the
//     Command Palette uses).
//   - "page": Invoice/Vendor/Inventory Item/Job Card have no per-record
//     deep link anywhere in the app today (confirmed: Invoices.tsx,
//     Vendors.tsx, Inventory.tsx, JobCards.tsx are all list+dialog
//     screens with no id-driven route) — so the reference honestly
//     navigates to that module's list page, the same "View Invoices"
//     pattern ProjectDetail.tsx's own Invoices card already uses, not a
//     fabricated per-record link.
import type { Page } from "@/types";

export type ErpReferenceAction =
  | {
      kind: "record";
      recordType: "project" | "customer" | "employee";
      id: string;
    }
  | { kind: "page"; page: Page };

export interface ErpReferenceMatch {
  start: number;
  end: number;
  label: string;
  actionLabel: string;
  action: ErpReferenceAction;
}

export interface ErpReferenceStore {
  projects: Array<{ id: string; projectNo: string }>;
  customers: Array<{ id: string; name: string }>;
  employees: Array<{ id: string; name: string; employeeCode?: string }>;
  vendors: Array<{ name: string }>;
  invoices: Array<{ invNo: string }>;
  jobCards: Array<{ jobNo: string }>;
  inventoryItems: Array<{ name: string }>;
}

const CODE_PATTERNS: Array<{
  regex: RegExp;
  resolve: (
    code: string,
    store: ErpReferenceStore,
  ) => { action: ErpReferenceAction; actionLabel: string } | null;
}> = [
  {
    regex: /\bPROJ-\d{4}-\d+\b/g,
    resolve: (code, store) => {
      const p = store.projects.find((x) => x.projectNo === code);
      return p
        ? {
            action: { kind: "record", recordType: "project", id: p.id },
            actionLabel: "View Project",
          }
        : null;
    },
  },
  {
    regex: /\bINV-\d{4}-\d+\b/g,
    resolve: (code, store) => {
      const inv = store.invoices.find((x) => x.invNo === code);
      return inv
        ? {
            action: { kind: "page", page: "invoices" },
            actionLabel: "View Invoice",
          }
        : null;
    },
  },
  {
    regex: /\bJC-\d{4}-\d+\b/g,
    resolve: (code, store) => {
      const jc = store.jobCards.find((x) => x.jobNo === code);
      return jc
        ? {
            action: { kind: "page", page: "job-cards" },
            actionLabel: "View Job Card",
          }
        : null;
    },
  },
  {
    regex: /\bEMP-\d{4}-\d+\b/g,
    resolve: (code, store) => {
      const e = store.employees.find((x) => x.employeeCode === code);
      return e
        ? {
            action: { kind: "record", recordType: "employee", id: e.id },
            actionLabel: "View Employee",
          }
        : null;
    },
  },
];

/** Finds every non-overlapping match of a real ERP identifier/name in
 * `text`. Code-pattern matches (PROJ-/INV-/JC-/EMP- followed by real
 * digits) always win over name matches at the same position. Name
 * matches (customer/vendor/employee/inventory item) require the real
 * name to appear as a whole word/phrase (case-insensitive) — longest
 * names checked first so "Test Customer Pvt Ltd" wins over "Test
 * Customer" when both would otherwise match. Real names shorter than 4
 * characters are skipped (too many false-positive collisions with
 * ordinary words to be a safe reference). */
export function findErpReferences(
  text: string,
  store: ErpReferenceStore,
): ErpReferenceMatch[] {
  const matches: ErpReferenceMatch[] = [];
  const taken: Array<[number, number]> = [];
  const overlaps = (start: number, end: number) =>
    taken.some(([s, e]) => start < e && end > s);

  for (const { regex, resolve } of CODE_PATTERNS) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null = regex.exec(text);
    while (m !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (!overlaps(start, end)) {
        const resolved = resolve(m[0], store);
        if (resolved) {
          matches.push({
            start,
            end,
            label: m[0],
            actionLabel: resolved.actionLabel,
            action: resolved.action,
          });
          taken.push([start, end]);
        }
      }
      m = regex.exec(text);
    }
  }

  type NameCandidate = {
    name: string;
    action: ErpReferenceAction;
    actionLabel: string;
  };
  const nameCandidates: NameCandidate[] = [
    ...store.customers.map((c) => ({
      name: c.name,
      action: { kind: "record", recordType: "customer", id: c.id } as const,
      actionLabel: "View Customer",
    })),
    ...store.employees.map((e) => ({
      name: e.name,
      action: { kind: "record", recordType: "employee", id: e.id } as const,
      actionLabel: "View Employee",
    })),
    ...store.vendors.map((v) => ({
      name: v.name,
      action: { kind: "page", page: "vendors" } as const,
      actionLabel: "View Vendor",
    })),
    ...store.inventoryItems.map((i) => ({
      name: i.name,
      action: { kind: "page", page: "inventory" } as const,
      actionLabel: "View Item",
    })),
  ]
    .filter((c) => c.name && c.name.trim().length >= 4)
    .sort((a, b) => b.name.length - a.name.length);

  for (const candidate of nameCandidates) {
    const escaped = candidate.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    let m: RegExpExecArray | null = regex.exec(text);
    while (m !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (!overlaps(start, end)) {
        matches.push({
          start,
          end,
          label: m[0],
          actionLabel: candidate.actionLabel,
          action: candidate.action,
        });
        taken.push([start, end]);
      }
      m = regex.exec(text);
    }
  }

  return matches.sort((a, b) => a.start - b.start);
}
