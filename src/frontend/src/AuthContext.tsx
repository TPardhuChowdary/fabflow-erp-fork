import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { hashPassword, verifyPassword } from "./authUtils";
import { migrateUserPermissions } from "./permissions";
import { useStore } from "./store";
import type { AuthUser } from "./types";

interface AuthContextValue {
  currentUser: AuthUser | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isInitializing: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  currentUser: null,
  login: async () => false,
  logout: () => {},
  isInitializing: true,
});

const SESSION_KEY = "fabflow-session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const { authUsers, addAuthUser, updateAuthUser } = useStore();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Seed default users if none exist
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    const seedUsers = async () => {
      if (authUsers.length === 0) {
        const adminHash = await hashPassword("admin123");
        const designerHash = await hashPassword("designer123");
        const workerHash = await hashPassword("worker123");
        const accountantHash = await hashPassword("acc123");

        addAuthUser({
          id: "user-admin",
          username: "admin",
          passwordHash: adminHash,
          role: "Admin",
          permissions: {},
        });
        addAuthUser({
          id: "user-designer1",
          username: "designer1",
          passwordHash: designerHash,
          role: "Designer",
          employeeId: "emp1",
          permissions: {},
        });
        addAuthUser({
          id: "user-worker1",
          username: "worker1",
          passwordHash: workerHash,
          role: "Worker",
          employeeId: "emp2",
          permissions: {},
        });
        addAuthUser({
          id: "user-accountant1",
          username: "accountant1",
          passwordHash: accountantHash,
          role: "Accountant",
          employeeId: "emp3",
          permissions: {},
        });
      }

      // Restore session
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        try {
          const { userId } = JSON.parse(raw) as { userId: string };
          const freshUsers = useStore.getState().authUsers;
          const user = freshUsers.find((u) => u.id === userId);
          if (user) {
            // Migrate permissions if empty
            const migratedPerms = migrateUserPermissions(user);
            const needsMigration =
              !user.permissions || Object.keys(user.permissions).length === 0;
            if (needsMigration) {
              const updated = { ...user, permissions: migratedPerms };
              updateAuthUser(updated);
              setCurrentUser(updated);
            } else {
              setCurrentUser(user);
            }
          }
        } catch {
          localStorage.removeItem(SESSION_KEY);
        }
      }

      setIsInitializing(false);
    };

    seedUsers();
  }, []);

  // Keep currentUser in sync with store (e.g. after password reset)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    if (currentUser) {
      const updated = authUsers.find((u) => u.id === currentUser.id);
      if (updated) setCurrentUser(updated);
    }
  }, [authUsers]);

  const login = async (
    username: string,
    password: string,
  ): Promise<boolean> => {
    const users = useStore.getState().authUsers;
    const user = users.find(
      (u) => u.username.toLowerCase() === username.toLowerCase(),
    );
    if (!user) return false;
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return false;

    // Migrate permissions on login if empty
    const migratedPerms = migrateUserPermissions(user);
    const needsMigration =
      !user.permissions || Object.keys(user.permissions).length === 0;
    let finalUser = user;
    if (needsMigration) {
      finalUser = { ...user, permissions: migratedPerms };
      updateAuthUser(finalUser);
    }

    setCurrentUser(finalUser);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: finalUser.id }));
    return true;
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem(SESSION_KEY);
  };

  return (
    <AuthContext.Provider
      value={{ currentUser, login, logout, isInitializing }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
