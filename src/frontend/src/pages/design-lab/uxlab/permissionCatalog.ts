// Final Unified Prototype — real fine-grained permission catalog.
//
// Ported verbatim (module keys, labels, categories, real action lists,
// and every role's real default grant list) from the real
// src/frontend/src/permissions.ts, for Settings -> User Management's
// permission-matrix editor (see PARITY_TRACKER.md #29). This is a
// different, deeper layer than the lab's existing coarse Role Layer
// (shared/roleAccess.ts, which only gates whole sidebar items per role)
// — production has BOTH: a coarse module-visibility layer AND this
// granular module.action layer, and Settings -> Users only ever
// exercises the granular one. The two are intentionally not merged.
export interface PermissionModuleDef {
  label: string;
  category: string;
  actions: string[];
}

export const MODULE_PERMISSIONS: Record<string, PermissionModuleDef> = {
  customers: {
    label: "Customers",
    category: "Sales",
    actions: ["view", "create", "edit", "delete"],
  },
  projects: {
    label: "Projects",
    category: "Sales",
    actions: ["view", "create", "edit", "delete", "upload"],
  },
  quotations: {
    label: "Quotations",
    category: "Sales",
    actions: ["view", "create", "edit", "delete", "download", "print", "share"],
  },
  purchase_orders: {
    label: "Customer Purchase Orders",
    category: "Sales",
    actions: ["view", "create", "edit", "delete"],
  },
  vendors: {
    label: "Vendors",
    category: "Procurement",
    actions: ["view", "create", "edit", "delete"],
  },
  company_po: {
    label: "Company PO",
    category: "Procurement",
    actions: [
      "view",
      "create",
      "edit",
      "delete",
      "approve",
      "download",
      "print",
      "share",
    ],
  },
  production: {
    label: "Production",
    category: "Production",
    actions: ["view", "create", "edit", "delete"],
  },
  material_requisitions: {
    label: "Material Requisitions",
    category: "Production",
    actions: ["view", "create", "edit", "delete", "approve"],
  },
  inventory: {
    label: "Inventory",
    category: "Production",
    actions: ["view", "create", "edit", "delete", "upload"],
  },
  quality_inspection: {
    label: "Quality Inspection",
    category: "Quality & Logistics",
    actions: ["view", "create", "edit", "approve"],
  },
  delivery_challans: {
    label: "Delivery Challans",
    category: "Quality & Logistics",
    actions: ["view", "create", "edit", "delete", "download", "print", "share"],
  },
  invoices: {
    label: "Invoices",
    category: "Finance",
    actions: ["view", "create", "edit", "delete", "download", "print", "share"],
  },
  payments: {
    label: "Payments",
    category: "Finance",
    actions: ["view", "create", "edit", "delete", "upload"],
  },
  payables: {
    label: "Payables",
    category: "Finance",
    actions: ["view", "create", "edit", "delete", "upload"],
  },
  employees: {
    label: "Employees",
    category: "HR",
    actions: ["view", "create", "edit", "delete", "upload"],
  },
  petty_expenses: {
    label: "Petty Expenses",
    category: "Finance",
    actions: ["view", "create", "edit", "delete"],
  },
  settings: {
    label: "Settings",
    category: "System",
    actions: ["view", "edit"],
  },
  machinery: {
    label: "Machinery",
    category: "Production",
    actions: [
      "view",
      "create",
      "edit",
      "delete",
      "service_create",
      "service_approve",
      "upload",
    ],
  },
  tools: {
    label: "Tools",
    category: "Production",
    actions: ["view", "create", "edit", "delete", "assign"],
  },
  tooling_dies: {
    label: "Tooling / Dies",
    category: "Production",
    actions: ["view", "create", "edit", "delete"],
  },
  machine_revenue: {
    label: "Machine / Service Revenue",
    category: "Production",
    actions: ["view", "create", "edit", "delete", "manage_rates"],
  },
  export_engine: {
    label: "Export / Print Engine",
    category: "System",
    actions: ["view", "create", "download", "print"],
  },
  salary_advance: {
    label: "Salary Advances",
    category: "HR",
    actions: ["view", "create", "edit", "delete", "recover"],
  },
  expense_float: {
    label: "Expense Float",
    category: "Finance",
    actions: ["view", "create", "edit", "delete", "settle"],
  },
  quality_characteristics: {
    label: "Quality Characteristic Library (QMS)",
    category: "Quality Management (QMS)",
    actions: ["view", "create", "edit", "delete"],
  },
  inspection_sheets: {
    label: "Inspection Sheets (QMS)",
    category: "Quality Management (QMS)",
    actions: [
      "view",
      "generate",
      "complete",
      "upload",
      "print",
      "review",
      "approve",
      "assign",
      "override",
    ],
  },
  drawing_editor: {
    label: "Engineering Drawing Editor",
    category: "Production",
    actions: ["view", "create", "edit", "export", "delete"],
  },
  ledger: {
    label: "Ledger",
    category: "Finance",
    actions: ["view", "export", "print", "manage"],
  },
  users: {
    label: "User Management",
    category: "System",
    actions: [
      "view",
      "create",
      "edit",
      "delete",
      "activate",
      "deactivate",
      "assign_roles",
    ],
  },
  audit_log: {
    label: "Security Audit Log",
    category: "System",
    actions: ["view"],
  },
};

function buildPerms(allowed: string[]): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const [mod, cfg] of Object.entries(MODULE_PERMISSIONS)) {
    for (const action of cfg.actions) {
      const key = `${mod}.${action}`;
      result[key] =
        allowed.includes(key) ||
        allowed.includes(`${mod}.*`) ||
        allowed.includes("*");
    }
  }
  return result;
}

export const ROLE_DEFAULTS: Record<string, Record<string, boolean>> = {
  admin: buildPerms(["*"]),
  sales: buildPerms([
    "customers.*",
    "projects.view",
    "projects.create",
    "projects.edit",
    "quotations.*",
    "purchase_orders.*",
    "employees.view",
  ]),
  procurement: buildPerms([
    "vendors.*",
    "company_po.*",
    "material_requisitions.*",
    "inventory.*",
    "tools.view",
  ]),
  production: buildPerms([
    "projects.view",
    "production.*",
    "material_requisitions.view",
    "material_requisitions.create",
    "inventory.view",
    "employees.view",
    "machinery.view",
    "machinery.service_create",
    "machinery.upload",
    "tools.view",
    "tools.create",
    "tools.edit",
    "tools.assign",
    "tooling_dies.view",
    "tooling_dies.create",
    "tooling_dies.edit",
    "machine_revenue.view",
    "machine_revenue.create",
    "machine_revenue.edit",
    "inspection_sheets.view",
    "inspection_sheets.complete",
    "inspection_sheets.upload",
    "inspection_sheets.print",
    "drawing_editor.view",
    "drawing_editor.create",
    "drawing_editor.edit",
    "drawing_editor.export",
  ]),
  quality: buildPerms([
    "projects.view",
    "production.view",
    "quality_inspection.*",
    "delivery_challans.view",
    "quality_characteristics.*",
    "inspection_sheets.view",
    "inspection_sheets.generate",
    "inspection_sheets.complete",
    "inspection_sheets.upload",
    "inspection_sheets.print",
    "inspection_sheets.review",
    "inspection_sheets.approve",
  ]),
  dispatch: buildPerms([
    "projects.view",
    "delivery_challans.*",
    "employees.view",
  ]),
  accounts: buildPerms([
    "invoices.*",
    "payments.*",
    "payables.*",
    "petty_expenses.*",
    "expense_float.*",
    "salary_advance.view",
    "salary_advance.recover",
    "customers.view",
    "projects.view",
    "employees.view",
    "machinery.view",
    "machine_revenue.view",
    "export_engine.*",
    "ledger.*",
  ]),
  employee: buildPerms([
    "employees.view",
    "petty_expenses.create",
    "expense_float.view",
  ]),
};

export function getDefaultPermissions(role: string): Record<string, boolean> {
  return { ...(ROLE_DEFAULTS[role] || ROLE_DEFAULTS.employee) };
}

export function getModulesByCategory(): Record<
  string,
  Array<{ key: string } & PermissionModuleDef>
> {
  const groups: Record<
    string,
    Array<{ key: string } & PermissionModuleDef>
  > = {};
  for (const [key, cfg] of Object.entries(MODULE_PERMISSIONS)) {
    if (!groups[cfg.category]) groups[cfg.category] = [];
    groups[cfg.category].push({ key, ...cfg });
  }
  return groups;
}

// Real hasPermission()/canView() semantics: admin bypasses all checks;
// an explicit per-user override wins; otherwise fall back to the role's
// real default grant.
export function hasPermission(
  user: { role: string; overrides: Record<string, boolean> } | null,
  key: string,
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (key in user.overrides) return user.overrides[key];
  return ROLE_DEFAULTS[user.role]?.[key] ?? false;
}
