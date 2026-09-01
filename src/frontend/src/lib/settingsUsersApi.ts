// Priority 1 — Settings -> Users write/read persistence layer. Sibling to
// lib/employeesApi.ts; follows the same WriteResult<T> contract (never
// fabricates success, RLS is the only authorization boundary, callers
// only update UI state on a "success" result).
//
// Unlike the old local `authUsers` store, there is no per-user
// full-permission-snapshot concept in the DB - only role_permissions
// (the role's defaults) plus optional user_permission_overrides rows.
// getRoleDefaultPermissions() below is the live, DB-authoritative
// baseline the Permission Matrix in Settings.tsx diffs against; the
// static ROLE_DEFAULTS in permissions.ts is a frontend-only fallback
// used before any real Supabase session exists and is NOT trusted here.

import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";

export type WriteStatus = "success" | "denied" | "error" | "unauthenticated";

export interface WriteResult<T> {
  status: WriteStatus;
  data?: T;
  error?: string;
}

export interface OrgUserRow {
  id: string;
  username: string;
  role: string;
  isAdmin: boolean;
  isActive: boolean;
  mustChangePassword: boolean;
  employeeId?: string;
}

function unauth<T>(): WriteResult<T> {
  return { status: "unauthenticated", error: "Not signed in." };
}

export async function listOrgUsers(): Promise<WriteResult<OrgUserRow[]>> {
  if (!isSupabaseConfigured) return unauth();
  const supabase = getSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return unauth();

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, username, employee_id, is_active, must_change_password");
  if (profilesError) {
    return { status: "error", error: profilesError.message };
  }

  const { data: roleRows, error: roleError } = await supabase
    .from("user_roles")
    .select("user_id, roles(name, is_admin)");
  if (roleError) {
    return { status: "error", error: roleError.message };
  }

  const rolesByUser = new Map<string, { name: string; is_admin: boolean }[]>();
  for (const r of roleRows || []) {
    const role = r.roles as unknown as {
      name: string;
      is_admin: boolean;
    } | null;
    if (!role) continue;
    const list = rolesByUser.get(r.user_id) || [];
    list.push(role);
    rolesByUser.set(r.user_id, list);
  }

  const users: OrgUserRow[] = (profiles || []).map((p) => {
    const roles = rolesByUser.get(p.id) || [];
    const isAdmin = roles.some((r) => r.is_admin);
    return {
      id: p.id,
      username: p.username,
      role: isAdmin ? "admin" : roles[0]?.name || "employee",
      isAdmin,
      isActive: p.is_active,
      mustChangePassword: p.must_change_password,
      employeeId: p.employee_id || undefined,
    };
  });

  return { status: "success", data: users };
}

export interface SecurityAuditLogEntry {
  id: string;
  eventType: string;
  actorUserId: string | null;
  actorUsername?: string;
  targetUserId: string | null;
  targetUsername?: string;
  metadata: Record<string, unknown>;
  createdAt: number;
}

// Read path for security_audit_log (phase1_auth_permissions_rls_v5_FINAL.sql
// §9) — written to via the log_security_event() RPC (password-change events,
// agent/audit.ts's Agent-action trail). SELECT-only from here; there is no
// insert/update/delete RLS policy on this table for clients, matching its
// append-only, tamper-evident intent. Most recent first, capped at `limit`
// (a simple recency window, not full pagination - this is a small,
// occasional-use admin view, not a high-volume log browser).
export async function listSecurityAuditLog(
  limit = 200,
): Promise<WriteResult<SecurityAuditLogEntry[]>> {
  if (!isSupabaseConfigured) return unauth();
  const supabase = getSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return unauth();

  const { data, error } = await supabase
    .from("security_audit_log")
    .select(
      "id, event_type, actor_user_id, target_user_id, metadata, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (error.code === "42501" || /permission denied/i.test(error.message)) {
      return { status: "denied", error: error.message };
    }
    return { status: "error", error: error.message };
  }

  const rows = (data || []) as {
    id: string;
    event_type: string;
    actor_user_id: string | null;
    target_user_id: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }[];

  // Resolve actor/target ids to usernames for display - same
  // fetch-profiles-separately-and-map pattern listOrgUsers above already
  // uses, not a new join style.
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.actor_user_id) ids.add(r.actor_user_id);
    if (r.target_user_id) ids.add(r.target_user_id);
  }
  const usernames = new Map<string, string>();
  if (ids.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username")
      .in("id", Array.from(ids));
    for (const p of profiles || []) usernames.set(p.id, p.username);
  }

  const entries: SecurityAuditLogEntry[] = rows.map((r) => ({
    id: r.id,
    eventType: r.event_type,
    actorUserId: r.actor_user_id,
    actorUsername: r.actor_user_id ? usernames.get(r.actor_user_id) : undefined,
    targetUserId: r.target_user_id,
    targetUsername: r.target_user_id
      ? usernames.get(r.target_user_id)
      : undefined,
    metadata: r.metadata || {},
    createdAt: new Date(r.created_at).getTime(),
  }));

  return { status: "success", data: entries };
}

/**
 * The single, privileged, real-account-provisioning path — the ONLY place
 * in the frontend that creates a real Supabase Auth user. Called both by
 * Settings -> Users (no employeeId) and by Employees -> New Employee
 * (employeeId set, so the new profile is linked back to the employee row
 * via profiles.employee_id). There must never be a second, local-only
 * account-creation path — see AuthContext.tsx/Employees.tsx.
 */
export async function createOrgUser(
  username: string,
  password: string,
  role: string,
  employeeId?: string,
): Promise<
  WriteResult<{ id: string; username: string; employeeLinkError?: string }>
> {
  if (!isSupabaseConfigured) return unauth();
  const supabase = getSupabase();
  const { data, error } = await supabase.functions.invoke<{
    id: string;
    username: string;
    employeeLinkError?: string;
    error?: string;
  }>("admin-create-user", {
    body: { username, password, role, employeeId },
  });

  if (error) {
    // FunctionsHttpError carries the real status/body; surface it as the
    // error string PostgREST-style callers already expect.
    const context = (
      error as { context?: { json?: () => Promise<{ error?: string }> } }
    ).context;
    if (context?.json) {
      try {
        const body = await context.json();
        return { status: "error", error: body.error || error.message };
      } catch {
        // fall through to generic message below
      }
    }
    return { status: "error", error: error.message };
  }
  if (!data || data.error) {
    return {
      status: "error",
      error: data?.error || "Unknown error creating user.",
    };
  }
  return {
    status: "success",
    data: {
      id: data.id,
      username: data.username,
      employeeLinkError: data.employeeLinkError,
    },
  };
}

export async function setUserRole(
  userId: string,
  roleName: string,
): Promise<WriteResult<void>> {
  if (!isSupabaseConfigured) return unauth();
  const supabase = getSupabase();

  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("id")
    .eq("name", roleName)
    .maybeSingle();
  if (roleError) return { status: "error", error: roleError.message };
  if (!role) return { status: "error", error: `Unknown role: ${roleName}` };

  const { error: deleteError } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", userId);
  if (deleteError) return { status: "error", error: deleteError.message };

  const { data: inserted, error: insertError } = await supabase
    .from("user_roles")
    .insert({ user_id: userId, role_id: role.id })
    .select();
  if (insertError) return { status: "error", error: insertError.message };
  if (!inserted || inserted.length === 0) {
    return { status: "denied", error: "Role change was blocked by policy." };
  }
  return { status: "success" };
}

// Deliberately no deleteOrgUser()/permanent-delete function exists in this
// file, and none should be added for the normal "remove a user" flow.
// auth.users rows accumulate security_audit_log references the moment a
// user ever logs in (log_auth_login() writes target_user_id/actor_user_id
// on every login - phase1_auth_permissions_rls_v5_FINAL.sql) via a plain
// `references auth.users(id)` FK with no ON DELETE clause (i.e. NO ACTION).
// That FK is intentional - it's what makes the audit trail permanent - so
// a real supabase.auth.admin.deleteUser() call on any user who has ever
// signed in fails with 23503 by design. Do not "fix" that by adding
// ON DELETE CASCADE/SET NULL to security_audit_log, by deleting audit
// rows first, or by calling admin.deleteUser() at all from this app.
// setUserActive() below (profiles.is_active) is the only supported way to
// remove a user's access - reversible, preserves every FK, and is what
// has_permission() already checks on every single RLS-gated call.
export async function setUserActive(
  userId: string,
  isActive: boolean,
): Promise<WriteResult<void>> {
  if (!isSupabaseConfigured) return unauth();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .update({ is_active: isActive })
    .eq("id", userId)
    .select();
  if (error) return { status: "error", error: error.message };
  if (!data || data.length === 0) {
    return { status: "denied", error: "Update was blocked by policy." };
  }
  return { status: "success" };
}

export interface PermissionDef {
  id: string;
  module: string;
  action: string;
}

let permissionsCache: PermissionDef[] | null = null;

export async function listAllPermissions(): Promise<
  WriteResult<PermissionDef[]>
> {
  if (!isSupabaseConfigured) return unauth();
  if (permissionsCache) return { status: "success", data: permissionsCache };
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("permissions")
    .select("id, module, action");
  if (error) return { status: "error", error: error.message };
  permissionsCache = data || [];
  return { status: "success", data: permissionsCache };
}

/** Live, DB-authoritative role_permissions for one role, flattened to the
 * same "module.action" -> boolean shape the frontend Permission Matrix
 * already renders. This - not the static ROLE_DEFAULTS in permissions.ts
 * - is the baseline Settings.tsx diffs a user's overrides against. */
export async function getRoleDefaultPermissions(
  roleName: string,
): Promise<WriteResult<Record<string, boolean>>> {
  if (!isSupabaseConfigured) return unauth();
  const supabase = getSupabase();

  const permsResult = await listAllPermissions();
  if (permsResult.status !== "success" || !permsResult.data) {
    return { status: permsResult.status, error: permsResult.error };
  }

  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("id, is_admin")
    .eq("name", roleName)
    .maybeSingle();
  if (roleError) return { status: "error", error: roleError.message };

  const result: Record<string, boolean> = {};
  if (role?.is_admin) {
    for (const p of permsResult.data) result[`${p.module}.${p.action}`] = true;
    return { status: "success", data: result };
  }

  for (const p of permsResult.data) result[`${p.module}.${p.action}`] = false;
  if (!role) return { status: "success", data: result };

  const { data: rolePerms, error: rolePermsError } = await supabase
    .from("role_permissions")
    .select("permission_id")
    .eq("role_id", role.id);
  if (rolePermsError) return { status: "error", error: rolePermsError.message };

  const grantedIds = new Set((rolePerms || []).map((rp) => rp.permission_id));
  for (const p of permsResult.data) {
    if (grantedIds.has(p.id)) result[`${p.module}.${p.action}`] = true;
  }
  return { status: "success", data: result };
}

export async function listUserOverrides(
  userId: string,
): Promise<WriteResult<Record<string, boolean>>> {
  if (!isSupabaseConfigured) return unauth();
  const supabase = getSupabase();

  const permsResult = await listAllPermissions();
  if (permsResult.status !== "success" || !permsResult.data) {
    return { status: permsResult.status, error: permsResult.error };
  }
  const permById = new Map(permsResult.data.map((p) => [p.id, p]));

  const { data, error } = await supabase
    .from("user_permission_overrides")
    .select("permission_id, allowed")
    .eq("user_id", userId);
  if (error) return { status: "error", error: error.message };

  const result: Record<string, boolean> = {};
  for (const row of data || []) {
    const p = permById.get(row.permission_id);
    if (p) result[`${p.module}.${p.action}`] = row.allowed;
  }
  return { status: "success", data: result };
}

/** Writes exactly the delta between `defaults` and `desired` as
 * user_permission_overrides rows (upsert where different, delete where
 * it now matches the role default again). Never writes a row that
 * duplicates the role default - keeps user_permission_overrides holding
 * only genuine exceptions, matching what has_permission() expects. */
export async function saveUserOverrides(
  userId: string,
  defaults: Record<string, boolean>,
  desired: Record<string, boolean>,
): Promise<WriteResult<void>> {
  if (!isSupabaseConfigured) return unauth();
  const supabase = getSupabase();

  const permsResult = await listAllPermissions();
  if (permsResult.status !== "success" || !permsResult.data) {
    return { status: permsResult.status, error: permsResult.error };
  }
  const permByKey = new Map(
    permsResult.data.map((p) => [`${p.module}.${p.action}`, p.id]),
  );

  const toUpsert: {
    user_id: string;
    permission_id: string;
    allowed: boolean;
  }[] = [];
  const toDeleteIds: string[] = [];

  for (const key of Object.keys(desired)) {
    const permissionId = permByKey.get(key);
    if (!permissionId) continue;
    const wantsOverride = desired[key] !== (defaults[key] ?? false);
    if (wantsOverride) {
      toUpsert.push({
        user_id: userId,
        permission_id: permissionId,
        allowed: desired[key],
      });
    } else {
      toDeleteIds.push(permissionId);
    }
  }

  if (toUpsert.length > 0) {
    const { error } = await supabase
      .from("user_permission_overrides")
      .upsert(toUpsert, { onConflict: "user_id,permission_id" });
    if (error) return { status: "error", error: error.message };
  }
  if (toDeleteIds.length > 0) {
    const { error } = await supabase
      .from("user_permission_overrides")
      .delete()
      .eq("user_id", userId)
      .in("permission_id", toDeleteIds);
    if (error) return { status: "error", error: error.message };
  }
  return { status: "success" };
}
