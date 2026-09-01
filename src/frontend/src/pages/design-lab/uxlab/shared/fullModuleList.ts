// UX Redesign Lab — the complete real-module nav list, shared by every
// model's "browse everything" menu so upgrading module coverage means
// editing one file, not five. See data.ts's header for the ground truth.
import type { ViewKey } from "./ModuleRouter";

export const FULL_MODULE_LIST: { key: ViewKey; label: string }[] = [
  { key: "quotations", label: "Quotations" },
  { key: "projects", label: "Projects" },
  { key: "purchase-orders", label: "Purchase Orders" },
  { key: "customers", label: "Customers" },
  { key: "vendors", label: "Vendors" },
  { key: "production", label: "Production" },
  { key: "material-requisitions", label: "Material Requisitions" },
  { key: "inventory", label: "Inventory" },
  { key: "machinery", label: "Machinery" },
  { key: "tools", label: "Tools" },
  { key: "dies", label: "Tooling / Dies" },
  { key: "qms", label: "QMS" },
  { key: "invoices", label: "Invoices" },
  { key: "payments", label: "Payments" },
  { key: "payables", label: "Payables" },
  { key: "delivery-challans", label: "Delivery Challans" },
  { key: "company-po", label: "Company PO" },
  { key: "petty-expenses", label: "Petty Expenses" },
  { key: "employees", label: "Employees" },
  { key: "drawings", label: "Drawings" },
  { key: "ledger", label: "Ledger" },
  { key: "machine-revenue", label: "Machine Revenue" },
  { key: "scrap", label: "Scrap" },
  { key: "export-engine", label: "Export Engine" },
  { key: "reports", label: "Reports" },
  { key: "settings", label: "Settings" },
];
