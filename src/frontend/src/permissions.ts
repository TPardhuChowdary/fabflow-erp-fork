// ── Permission System ────────────────────────────────────────────

export const MODULE_PERMISSIONS: Record<
  string,
  { label: string; category: string; actions: string[] }
> = {
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
  ]),
  production: buildPerms([
    "projects.view",
    "production.*",
    "material_requisitions.view",
    "material_requisitions.create",
    "inventory.view",
    "employees.view",
  ]),
  quality: buildPerms([
    "projects.view",
    "production.view",
    "quality_inspection.*",
    "delivery_challans.view",
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
    "customers.view",
    "projects.view",
    "employees.view",
  ]),
  employee: buildPerms(["employees.view", "petty_expenses.create"]),
  // Legacy role mappings
  Admin: buildPerms(["*"]),
  Accountant: buildPerms([
    "invoices.*",
    "payments.*",
    "payables.*",
    "customers.view",
    "projects.view",
    "employees.view",
    "settings.view",
  ]),
  Designer: buildPerms(["projects.view", "projects.edit", "production.view"]),
  Worker: buildPerms(["projects.view", "production.view"]),
};

export function hasPermission(
  user: { role?: string; permissions?: Record<string, boolean> } | null,
  key: string,
): boolean {
  if (!user) return false;
  if (user.role === "admin" || user.role === "Admin") return true;
  if (user.permissions && key in user.permissions) return user.permissions[key];
  const defaults = ROLE_DEFAULTS[user.role || ""] || {};
  return defaults[key] ?? false;
}

export function canView(
  user: { role?: string; permissions?: Record<string, boolean> } | null,
  moduleKey: string,
): boolean {
  return hasPermission(user, `${moduleKey}.view`);
}

export function migrateUserPermissions(user: {
  role?: string;
  permissions?: Record<string, boolean>;
}): Record<string, boolean> {
  const defaults = ROLE_DEFAULTS[user.role || ""] || ROLE_DEFAULTS.employee;
  if (!user.permissions || Object.keys(user.permissions).length === 0)
    return { ...defaults };
  // If user has permissions but some default keys are missing, merge in the missing ones
  const missingKeys = Object.keys(defaults).filter(
    (k) => !(k in user.permissions!),
  );
  if (missingKeys.length > 0) {
    // Existing user overrides preserved; missing keys filled from role defaults
    return { ...defaults, ...user.permissions };
  }
  return user.permissions;
}

export function getDefaultPermissions(role: string): Record<string, boolean> {
  return { ...(ROLE_DEFAULTS[role] || ROLE_DEFAULTS.employee) };
}

export function getModulesByCategory(): Record<
  string,
  Array<{ key: string; label: string; actions: string[] }>
> {
  const groups: Record<
    string,
    Array<{ key: string; label: string; actions: string[] }>
  > = {};
  for (const [key, cfg] of Object.entries(MODULE_PERMISSIONS)) {
    if (!groups[cfg.category]) groups[cfg.category] = [];
    groups[cfg.category].push({ key, label: cfg.label, actions: cfg.actions });
  }
  return groups;
}

export function canCreate(
  user: { role?: string; permissions?: Record<string, boolean> } | null,
  moduleKey: string,
): boolean {
  return hasPermission(user, `${moduleKey}.create`);
}

export function canEdit(
  user: { role?: string; permissions?: Record<string, boolean> } | null,
  moduleKey: string,
): boolean {
  return hasPermission(user, `${moduleKey}.edit`);
}

export function canDelete(
  user: { role?: string; permissions?: Record<string, boolean> } | null,
  moduleKey: string,
): boolean {
  return hasPermission(user, `${moduleKey}.delete`);
}

export function canUpload(
  user: { role?: string; permissions?: Record<string, boolean> } | null,
  moduleKey: string,
): boolean {
  if (!user) return false;
  if (user.role === "admin" || user.role === "Admin") return true;
  const uploadKey = `${moduleKey}.upload`;
  const createKey = `${moduleKey}.create`;
  // Check user-level permissions for upload key first
  if (user.permissions && uploadKey in user.permissions) {
    return user.permissions[uploadKey];
  }
  // Check role defaults for upload key
  const defaults = ROLE_DEFAULTS[user.role || ""] || {};
  if (uploadKey in defaults) {
    return defaults[uploadKey];
  }
  // Backward compatibility: fallback to create permission
  return hasPermission(user, createKey);
}

export function canPrint(
  user: { role?: string; permissions?: Record<string, boolean> } | null,
  moduleKey: string,
): boolean {
  return hasPermission(user, `${moduleKey}.print`);
}

export function canDownload(
  user: { role?: string; permissions?: Record<string, boolean> } | null,
  moduleKey: string,
): boolean {
  return hasPermission(user, `${moduleKey}.download`);
}

export function canShare(
  user: { role?: string; permissions?: Record<string, boolean> } | null,
  moduleKey: string,
): boolean {
  return hasPermission(user, `${moduleKey}.share`);
}
