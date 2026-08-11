// Priority 1 — Real Supabase Multi-User Authentication.
//
// Replaces the old 100% local, localStorage-based pseudo-auth (no
// Supabase involvement, unsalted SHA-256 comparisons) with real
// supabase.auth.signInWithPassword / onAuthStateChange / signOut, session
// persistence + token refresh (both supabase-js defaults, already active
// via the single client in lib/supabaseClient.ts), and RBAC resolved live
// from profiles/user_roles/roles/role_permissions/user_permission_overrides
// via lib/supabaseAuth.ts's fetchMyRbacProfile(). The resulting
// currentUser is still an AuthUser-shaped object with {role, permissions}
// so every existing hasPermission(currentUser, "module.action") call site
// across the app keeps working unmodified.
//
// Users sign in with a bare username; usernameToEmail() derives the
// synthetic email Supabase Auth actually authenticates against.

import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { fetchMyRbacProfile, usernameToEmail } from "./lib/supabaseAuth";
import { getSupabase, isSupabaseConfigured } from "./lib/supabaseClient";
import type { AuthUser } from "./types";

interface LoginResult {
  ok: boolean;
  error?: string;
}

interface AuthContextValue {
  currentUser: AuthUser | null;
  login: (username: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  isInitializing: boolean;
  /** True whenever the signed-in user must set a new password before
   * using the rest of the app (set true by admin-create-user on account
   * creation; cleared by completePasswordChange below). */
  mustChangePassword: boolean;
  completePasswordChange: (newPassword: string) => Promise<LoginResult>;
  /** Set when a session was ended for a reason the user didn't initiate
   * (e.g. their account was deactivated, or Supabase isn't configured at
   * all) - LoginPage surfaces this once, then it's cleared. */
  authNotice: string | null;
  clearAuthNotice: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  currentUser: null,
  login: async () => ({ ok: false, error: "Not initialized." }),
  logout: async () => {},
  isInitializing: true,
  mustChangePassword: false,
  completePasswordChange: async () => ({
    ok: false,
    error: "Not initialized.",
  }),
  authNotice: null,
  clearAuthNotice: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const buildAuthUser = async (userId: string): Promise<AuthUser | null> => {
    const profile = await fetchMyRbacProfile(userId);
    if (!profile) return null;
    return {
      id: profile.id,
      username: profile.username,
      role: profile.role as AuthUser["role"],
      employeeId: profile.employeeId,
      permissions: profile.permissions,
      mustChangePassword: profile.mustChangePassword,
      isActive: profile.isActive,
    };
  };

  // Session restore + live auth-state subscription. Runs once on mount.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthNotice(
        "Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.",
      );
      setIsInitializing(false);
      return;
    }

    const supabase = getSupabase();
    let cancelled = false;

    const resolveSession = async (userId: string | null) => {
      if (!userId) {
        if (!cancelled) setCurrentUser(null);
        return;
      }
      try {
        const user = await buildAuthUser(userId);
        if (cancelled) return;
        if (!user) {
          setCurrentUser(null);
          return;
        }
        if (!user.isActive) {
          setAuthNotice(
            "Your account has been deactivated. Contact your administrator.",
          );
          await supabase.auth.signOut();
          setCurrentUser(null);
          return;
        }
        setCurrentUser(user);
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to resolve session/RBAC profile:", err);
          setCurrentUser(null);
        }
      }
    };

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await resolveSession(session?.user.id ?? null);
      if (!cancelled) setIsInitializing(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setCurrentUser(null);
        return;
      }
      resolveSession(session?.user.id ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (
    username: string,
    password: string,
  ): Promise<LoginResult> => {
    if (!isSupabaseConfigured) {
      return { ok: false, error: "Supabase is not configured." };
    }
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    if (error || !data.user) {
      return { ok: false, error: "Invalid username or password." };
    }

    const user = await buildAuthUser(data.user.id);
    if (!user) {
      await supabase.auth.signOut();
      return {
        ok: false,
        error: "Could not load your account. Contact your administrator.",
      };
    }
    if (!user.isActive) {
      await supabase.auth.signOut();
      return {
        ok: false,
        error: "Your account has been deactivated. Contact your administrator.",
      };
    }

    setCurrentUser(user);
    return { ok: true };
  };

  const logout = async () => {
    if (isSupabaseConfigured) {
      await getSupabase().auth.signOut();
    }
    setCurrentUser(null);
  };

  const completePasswordChange = async (
    newPassword: string,
  ): Promise<LoginResult> => {
    if (!isSupabaseConfigured || !currentUser) {
      return { ok: false, error: "Not signed in." };
    }
    const supabase = getSupabase();
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (updateError) {
      return { ok: false, error: updateError.message };
    }
    const { error: rpcError } = await supabase.rpc(
      "clear_own_must_change_password",
    );
    if (rpcError) {
      return {
        ok: false,
        error: `Password changed, but could not clear the forced-change flag: ${rpcError.message}`,
      };
    }
    const refreshed = await buildAuthUser(currentUser.id);
    if (refreshed) setCurrentUser(refreshed);
    return { ok: true };
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        login,
        logout,
        isInitializing,
        mustChangePassword: Boolean(currentUser?.mustChangePassword),
        completePasswordChange,
        authNotice,
        clearAuthNotice: () => setAuthNotice(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
