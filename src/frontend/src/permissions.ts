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
      // Phase 32 (Task #176) - supervisor/admin Production-gate override.
      // The permission itself was already approved and seeded server-side
      // in Task #170's migration (RLS on project_qms_inspection_overrides
      // requires it); this entry only completes its frontend wiring so it
      // is checkable via hasPermission() and assignable per-user in the
      // Settings > Users permission editor, exactly like every other
      // granular permission here. No ROLE_DEFAULTS grants it by default -
      // only admin (which bypasses all checks) has it until an admin
      // explicitly assigns it to a specific user.
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
  // Priority 1 (real Supabase Auth): the DB has always seeded these exact
  // 7 actions on the `users` module (phase1_auth_permissions_rls_v5_FINAL.sql)
  // and every RLS policy on profiles/roles/user_roles/user_permission_overrides
  // already calls has_permission('users', ...) - this entry was simply
  // missing from the frontend registry, so Settings -> Users had nothing
  // to gate on and fell back to a hardcoded role === "Admin" check.
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
    "machinery.view",
    "machinery.service_create",
    "machinery.upload",
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
    // QA Manager role: only they (besides admin) may approve/close a sheet
    // or create a new revision of a locked one.
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
    "export_engine.*",
    "ledger.*",
  ]),
  employee: buildPerms([
    "employees.view",
    "petty_expenses.create",
    "expense_float.view",
  ]),
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
    "ledger.*",
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
