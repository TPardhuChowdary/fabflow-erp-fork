// Phase 2 — Application Shell. Extracted verbatim from Layout.tsx (the
// array itself is byte-for-byte the same real module inventory that was
// already live in production — no group, item, page, or moduleKey was
// added, removed, or renamed by this extraction) so the sidebar and the
// Command Palette share one single source of truth for "what real routes
// exist" rather than two lists that can silently drift apart.
import {
  Archive,
  Banknote,
  BookOpen,
  Bot,
  Building2,
  ClipboardCheck,
  ClipboardList,
  Cog,
  CreditCard,
  DollarSign,
  Factory,
  FileText,
  FolderKanban,
  Hammer,
  LayoutDashboard,
  LibraryBig,
  ListChecks,
  Package,
  PencilRuler,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Truck,
  UserCheck,
  UserCircle2,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import type { Page } from "../types";

export interface NavItem {
  label: string;
  page: Page;
  icon: React.ComponentType<{ className?: string }>;
  moduleKey: string;
}

export interface NavGroup {
  label: string;
  moduleKeys: string[];
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
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
      {
        label: "AI Agent",
        page: "agent",
        icon: Bot,
        // No dedicated permission module — visible to any authenticated
        // user, since every action it can take is individually permission-
        // checked at execution time (agent/actions.ts's runAction).
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
    moduleKeys: [
      "production",
      "job_cards",
      "material_requisitions",
      "inventory",
      "machinery",
      "tools",
      "tooling_dies",
      "machine_revenue",
      "scrap",
      "drawing_editor",
    ],
    items: [
      {
        label: "Production",
        page: "production",
        icon: Factory,
        moduleKey: "production",
      },
      {
        label: "Job Cards",
        page: "job-cards",
        icon: ListChecks,
        moduleKey: "job_cards",
      },
      {
        label: "Material Requisitions",
        page: "material-requisitions",
        icon: Cog,
        moduleKey: "material_requisitions",
      },
      {
        label: "Inventory",
        page: "inventory",
        icon: Archive,
        moduleKey: "inventory",
      },
      {
        label: "Machinery",
        page: "machinery",
        icon: Wrench,
        moduleKey: "machinery",
      },
      {
        label: "Tools",
        page: "tools",
        icon: Hammer,
        moduleKey: "tools",
      },
      {
        label: "Tooling / Dies",
        page: "dies",
        icon: Cog,
        moduleKey: "tooling_dies",
      },
      {
        label: "Machine Revenue",
        page: "machine-revenue",
        icon: Banknote,
        moduleKey: "machine_revenue",
      },
      {
        label: "Scrap",
        page: "scrap",
        icon: Package,
        moduleKey: "inventory",
      },
      {
        label: "Drawing Repository",
        page: "drawing-editor",
        icon: PencilRuler,
        moduleKey: "drawing_editor",
      },
    ],
  },
  {
    label: "Logistics",
    moduleKeys: ["delivery_challans"],
    items: [
      {
        label: "Delivery Challans",
        page: "delivery-challans",
        icon: Truck,
        moduleKey: "delivery_challans",
      },
    ],
  },
  {
    label: "Quality Management (QMS)",
    moduleKeys: ["quality_characteristics", "inspection_sheets"],
    items: [
      {
        label: "QMS Dashboard",
        page: "qms-dashboard",
        icon: ShieldCheck,
        moduleKey: "quality_characteristics",
      },
      {
        label: "Characteristic Library",
        page: "qms-characteristics",
        icon: LibraryBig,
        moduleKey: "quality_characteristics",
      },
      {
        label: "Inspection Sheets",
        page: "qms-inspection-sheets",
        icon: ClipboardCheck,
        moduleKey: "inspection_sheets",
      },
      {
        label: "My Assigned Inspections",
        page: "qms-my-inspections",
        icon: UserCheck,
        moduleKey: "inspection_sheets",
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
    label: "Accounts",
    moduleKeys: ["ledger"],
    items: [
      {
        label: "Ledger",
        page: "ledger",
        icon: BookOpen,
        moduleKey: "ledger",
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
  {
    // Isolated design-presentation tool, deliberately kept in its own
    // group so it reads as a separate lab, not a real ERP module. Not
    // wired to a data-bearing module — visible to any signed-in user,
    // same policy as AI Agent above.
    label: "Design Lab",
    moduleKeys: [],
    items: [
      {
        label: "UI Showcase",
        page: "design-lab",
        icon: PencilRuler,
        moduleKey: "__always__",
      },
      {
        label: "ERP Exploration",
        page: "design-lab-v2",
        icon: PencilRuler,
        moduleKey: "__always__",
      },
      {
        label: "Style Lab",
        page: "style-lab",
        icon: PencilRuler,
        moduleKey: "__always__",
      },
      {
        label: "Design Archive",
        page: "design-archive",
        icon: PencilRuler,
        moduleKey: "__always__",
      },
      {
        label: "UX Redesign Lab",
        page: "ux-lab",
        icon: PencilRuler,
        moduleKey: "__always__",
      },
      {
        label: "Final UX Prototype",
        page: "ux-final",
        icon: PencilRuler,
        moduleKey: "__always__",
      },
      {
        label: "UX Consolidation Lab",
        page: "ux-decision-lab",
        icon: PencilRuler,
        moduleKey: "__always__",
      },
      {
        label: "Visual System Lab",
        page: "ux-visual-lab",
        icon: PencilRuler,
        moduleKey: "__always__",
      },
      {
        label: "UX Implementation Lab",
        page: "ux-implementation-lab",
        icon: PencilRuler,
        moduleKey: "__always__",
      },
    ],
  },
];

// Command Palette's "Go to" list — same real inventory, minus the Design
// Lab group (an internal dev tool, not a real ERP destination for daily
// use; excluded from the palette only, still fully reachable from the
// sidebar exactly as before).
export const NAV_GROUPS_FOR_COMMAND_PALETTE = navGroups.filter(
  (g) => g.label !== "Design Lab",
);

// Role Layer's group-reordering function now lives in roleLayer.ts —
// moved there in Phase 7 since the blueprint frames Role Layer as one
// cross-cutting function applied to both the sidebar and Dashboard KPIs
// (§11 component C), not something specific to nav data. Re-exported here
// so Layout.tsx's existing import site doesn't need to change.
export { getRoleOrderedGroups } from "./roleLayer";
