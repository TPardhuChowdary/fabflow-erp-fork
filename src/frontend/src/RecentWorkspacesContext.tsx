// Workspaces feature (see chat) — the SINGLE shared source of truth for
// "recently opened ERP records," replacing the two separate mechanisms
// that existed before this pass (Layout.tsx's own local `recent` state,
// fed only by CommandPalette's internal push calls). Every real
// navigation path now funnels through App.tsx's navigateToRecord (see
// that file), which calls pushRecent() here — Command Palette selections,
// Dashboard's "Recent Projects" clicks, Projects/CustomerHistory row
// clicks, AI Agent ERP-reference clicks, and any future caller all go
// through the same one function, so the Command Palette's "Recent" group
// and the visible sidebar Workspaces section can never drift apart —
// both simply read this same context.
//
// Persisted to a single standalone localStorage key ("fabflow-recent-
// workspaces") — mirrors ThemeContext.tsx's own established pattern
// exactly, and for the same reason: this is a UI/session convenience,
// not application/business data, so it deliberately stays OUT of the
// Zustand `fabflow-erp-store` persist() blob rather than growing that
// already-large store for an unrelated concern.
//
// pushRecent() resolves the record's real display name from the live
// store at call time (useStore.getState() - a plain function, not a
// hook, so this works from a non-component callback) and silently does
// nothing if the id doesn't resolve to a real record - it never fabricates
// a placeholder entry for a record that doesn't (or doesn't yet, before
// hydration finishes) exist.
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useStore } from "./store";

export type WorkspaceRecordType =
  | "project"
  | "customer"
  | "employee"
  | "machine"
  | "vendor";

export interface RecentWorkspaceEntry {
  key: string;
  type: WorkspaceRecordType;
  id: string;
  /** Primary identifier - e.g. a project number, a person's/company's name. */
  label: string;
  /** Secondary text to disambiguate - e.g. the project's customer name. */
  secondary: string;
  timestamp: number;
}

const STORAGE_KEY = "fabflow-recent-workspaces";
const MAX_ENTRIES = 8;

function readStored(): RecentWorkspaceEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is RecentWorkspaceEntry =>
        e &&
        typeof e.key === "string" &&
        typeof e.type === "string" &&
        typeof e.id === "string" &&
        typeof e.label === "string",
    );
  } catch {
    return [];
  }
}

function writeStored(entries: RecentWorkspaceEntry[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage unavailable (private browsing, quota) - in-memory
    // state for this session still works.
  }
}

function resolveDisplay(
  type: WorkspaceRecordType,
  id: string,
): { label: string; secondary: string } | null {
  const s = useStore.getState();
  switch (type) {
    case "project": {
      const p = s.projects.find((x) => x.id === id);
      if (!p) return null;
      const cust = s.customers.find((c) => c.id === p.customerId);
      return { label: p.projectNo, secondary: cust?.name ?? p.projectName };
    }
    case "customer": {
      const c = s.customers.find((x) => x.id === id);
      if (!c) return null;
      return { label: c.name, secondary: "Customer" };
    }
    case "employee": {
      const e = s.employees.find((x) => x.id === id);
      if (!e) return null;
      return { label: e.name, secondary: e.designation || "Employee" };
    }
    case "machine": {
      const m = s.machines.find((x) => x.id === id);
      if (!m) return null;
      return { label: m.name, secondary: m.machineCode || "Machine" };
    }
    case "vendor": {
      const v = s.vendors.find((x) => x.id === id);
      if (!v) return null;
      return { label: v.name, secondary: "Vendor" };
    }
  }
}

interface RecentWorkspacesContextValue {
  recent: RecentWorkspaceEntry[];
  pushRecent: (type: WorkspaceRecordType, id: string) => void;
}

const RecentWorkspacesContext = createContext<RecentWorkspacesContextValue>({
  recent: [],
  pushRecent: () => {},
});

export function RecentWorkspacesProvider({
  children,
}: { children: ReactNode }) {
  const [recent, setRecent] = useState<RecentWorkspaceEntry[]>(readStored);

  const pushRecent = useCallback((type: WorkspaceRecordType, id: string) => {
    const display = resolveDisplay(type, id);
    if (!display) return; // real record not found - never fabricate an entry
    const key = `${type}-${id}`;
    setRecent((prev) => {
      const next = [
        { key, type, id, ...display, timestamp: Date.now() },
        ...prev.filter((e) => e.key !== key),
      ].slice(0, MAX_ENTRIES);
      writeStored(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ recent, pushRecent }), [recent, pushRecent]);

  return (
    <RecentWorkspacesContext.Provider value={value}>
      {children}
    </RecentWorkspacesContext.Provider>
  );
}

export function useRecentWorkspaces(): RecentWorkspacesContextValue {
  return useContext(RecentWorkspacesContext);
}
