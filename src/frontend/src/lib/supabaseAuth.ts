// Priority 1 — Real Supabase Multi-User Authentication.
//
// Sibling to lib/supabaseClient.ts (the raw client) — this module is
// where AuthContext.tsx gets (a) the synthetic-email helper needed
// because users sign in with a bare username but Supabase Auth requires
// an email, and (b) the RBAC profile fetch that turns
// profiles/user_roles/roles/role_permissions/user_permission_overrides
// into the exact `{role, permissions}` shape permissions.ts's
// hasPermission() has always expected, so none of the ~30 existing
// hasPermission(currentUser, "module.action") call sites across the app
// need to change.
//
// Kept in sync with the matching lowercasing logic in
// supabase/functions/admin-create-user/index.ts — do not let these two
// drift apart, or a user created with one casing of their username won't
// be able to sign in with a different casing of the same username.

import { getSupabase } from "@/lib/supabaseClient";

export const SYNTHETIC_EMAIL_DOMAIN = "users.fabflow.local";

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

export interface RbacProfile {
  id: string;
  username: string;
  employeeId?: string;
  isActive: boolean;
  mustChangePassword: boolean;
  /** Primary role name. "admin" whenever any assigned role has is_admin
   * true, exactly mirroring has_permission()'s own admin bypass - so
   * hasPermission()'s `user.role === "admin"` shortcut in permissions.ts
   * stays correct without duplicating that logic here. */
  role: string;
  /** "module.action" -> boolean, computed the same way has_permission()
   * computes it server-side: role_permissions as the default, with any
   * matching user_permission_overrides row taking precedence. Admins get
   * every known permission key set true, matching has_permission()'s
   * is_admin bypass (which ignores role_permissions/overrides entirely). */
  permissions: Record<string, boolean>;
}

/**
 * Fetches everything needed to build an RbacProfile for the given
 * Supabase Auth user id. Returns null (not a thrown error) if the
 * profiles row doesn't exist yet - e.g. a real auth.users row that
 * predates the handle_new_auth_user() trigger, or a race immediately
 * after admin.createUser() before the trigger has committed. Callers
 * should treat null as "cannot resolve this session's identity yet" and
 * either retry once or treat it as a failed sign-in - never as "no
 * permissions" (which would be a misleading state to render).
 */
export async function fetchMyRbacProfile(
  userId: string,
): Promise<RbacProfile | null> {
  const supabase = getSupabase();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, username, employee_id, is_active, must_change_password")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!profile) return null;

  const { data: roleRows, error: roleError } = await supabase
    .from("user_roles")
    .select("role_id, roles(name, is_admin)")
    .eq("user_id", userId);
  if (roleError) throw new Error(roleError.message);

  // Untyped Supabase client infers a to-one FK relation as an array;
  // normalize to a flat list of {name, is_admin} regardless of whether
  // it came back as an array or a single object.
  const roles = (roleRows || []).flatMap((r) => {
    const rel = r.roles as unknown;
    if (!rel) return [];
    return Array.isArray(rel) ? rel : [rel];
  }) as { name: string; is_admin: boolean }[];
  const isAdmin = roles.some((r) => r.is_admin);
  const primaryRole = isAdmin ? "admin" : roles[0]?.name || "employee";

  const { data: allPerms, error: permsError } = await supabase
    .from("permissions")
    .select("id, module, action");
  if (permsError) throw new Error(permsError.message);

  const permissions: Record<string, boolean> = {};

  if (isAdmin) {
    for (const p of allPerms || []) {
      permissions[`${p.module}.${p.action}`] = true;
    }
  } else {
    const roleIds = (roleRows || []).map((r) => r.role_id);
    const { data: rolePerms, error: rolePermsError } = roleIds.length
      ? await supabase
          .from("role_permissions")
          .select("permission_id")
          .in("role_id", roleIds)
      : { data: [], error: null };
    if (rolePermsError) throw new Error(rolePermsError.message);

    const { data: overrides, error: overridesError } = await supabase
      .from("user_permission_overrides")
      .select("permission_id, allowed")
      .eq("user_id", userId);
    if (overridesError) throw new Error(overridesError.message);

    const defaultGrantedIds = new Set(
      (rolePerms || []).map((rp) => rp.permission_id),
    );
    const overrideById = new Map(
      (overrides || []).map((o) => [o.permission_id, o.allowed]),
    );

    for (const p of allPerms || []) {
      const key = `${p.module}.${p.action}`;
      const override = overrideById.get(p.id);
      permissions[key] =
        override !== undefined ? override : defaultGrantedIds.has(p.id);
    }
  }

  return {
    id: profile.id,
    username: profile.username,
    employeeId: profile.employee_id || undefined,
    isActive: profile.is_active,
    mustChangePassword: profile.must_change_password,
    role: primaryRole,
    permissions,
  };
}
