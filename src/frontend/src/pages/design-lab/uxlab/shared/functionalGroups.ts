// Final Unified Prototype — the real FabFlow functional taxonomy.
// This mirrors components/Layout.tsx's actual sidebar groups (Sales,
// Procurement, Production, Logistics, Quality Management (QMS), Finance,
// Accounts, HR) rather than the flat FULL_MODULE_LIST the 10 earlier lab
// models used — grouping by function is what the real production sidebar
// already does, and Hick's Law rewards it (8 groups to scan, not 27
// flat items). "System" is an added ninth group for Reports/Settings/
// Export Engine, which the real app reaches via top-level nav rather
// than a named sidebar group of their own.
import type { ViewKey } from "./ModuleRouter";

export interface NavItem {
  key: ViewKey;
  label: string;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export const FUNCTIONAL_GROUPS: NavGroup[] = [
  {
    id: "sales",
    label: "Sales",
    items: [
      { key: "customers", label: "Customers" },
      { key: "projects", label: "Projects" },
      { key: "quotations", label: "Quotations" },
      { key: "company-po", label: "Customer Purchase Orders" },
    ],
  },
  {
    id: "procurement",
    label: "Procurement",
    items: [
      { key: "vendors", label: "Vendors" },
      { key: "purchase-orders", label: "Company PO" },
    ],
  },
  {
    id: "production",
    label: "Production",
    items: [
      { key: "production", label: "Production" },
      { key: "material-requisitions", label: "Material Requisitions" },
      { key: "inventory", label: "Inventory" },
      { key: "machinery", label: "Machinery" },
      { key: "tools", label: "Tools" },
      { key: "dies", label: "Tooling / Dies" },
      { key: "machine-revenue", label: "Machine Revenue" },
      { key: "scrap", label: "Scrap" },
      { key: "drawings", label: "Drawing Repository" },
    ],
  },
  {
    id: "logistics",
    label: "Logistics",
    items: [{ key: "delivery-challans", label: "Delivery Challans" }],
  },
  {
    id: "qms",
    label: "Quality Management (QMS)",
    items: [{ key: "qms", label: "QMS" }],
  },
  {
    id: "finance",
    label: "Finance",
    items: [
      { key: "invoices", label: "Invoices" },
      { key: "payments", label: "Payments" },
      { key: "payables", label: "Payables" },
      { key: "petty-expenses", label: "Petty Expenses" },
    ],
  },
  {
    id: "accounts",
    label: "Accounts",
    items: [{ key: "ledger", label: "Ledger" }],
  },
  {
    id: "hr",
    label: "HR",
    items: [{ key: "employees", label: "Employees" }],
  },
  {
    id: "system",
    label: "System",
    items: [
      { key: "reports", label: "Reports" },
      { key: "export-engine", label: "Export Engine" },
      { key: "ai-agent", label: "AI Agent" },
      { key: "settings", label: "Settings" },
    ],
  },
];
