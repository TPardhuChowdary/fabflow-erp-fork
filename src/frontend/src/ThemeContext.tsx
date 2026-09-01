// Phase — Multi-Theme Design System. Mirrors AuthContext.tsx's convention
// (createContext with a safe default, a Provider component, a paired
// useTheme() hook). Owns exactly two pieces of state: which of the 12
// ThemePreset palettes is active (11 original + "Instrument", the
// approved Phase 3 Visual System Lab recommendation — see
// scripts/generate-theme-tokens.mjs), and which of light/dark/system
// mode is active. Persisted to a single standalone localStorage key
// ("fabflow-theme") — deliberately NOT folded into the existing Zustand
// `fabflow-erp-store` persist(), since this is a UI-only client
// preference, not application/business data (see plan §A).
//
// Applied via useLayoutEffect (not useEffect) so the correct theme is on
// the DOM before the browser paints - this is a client-only Vite SPA with
// no SSR/hydration step to worry about, so there's no flash-of-default-
// theme between mount and the first effect run.

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_THEME_ID,
  THEME_PRESETS,
  type ThemePreset,
  applyThemeFonts,
  applyThemeTokens,
  getThemePreset,
} from "./lib/themes/tokens";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "fabflow-theme";

interface StoredThemePreference {
  themeId: string;
  mode: ThemeMode;
}

const DEFAULT_PREFERENCE: StoredThemePreference = {
  themeId: DEFAULT_THEME_ID,
  mode: "light",
};

function readStoredPreference(): StoredThemePreference {
  if (typeof window === "undefined") return DEFAULT_PREFERENCE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCE;
    const parsed = JSON.parse(raw) as Partial<StoredThemePreference>;
    const themeId =
      typeof parsed.themeId === "string" &&
      THEME_PRESETS.some((p) => p.id === parsed.themeId)
        ? parsed.themeId
        : DEFAULT_PREFERENCE.themeId;
    const mode: ThemeMode =
      parsed.mode === "light" ||
      parsed.mode === "dark" ||
      parsed.mode === "system"
        ? parsed.mode
        : DEFAULT_PREFERENCE.mode;
    return { themeId, mode };
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

function writeStoredPreference(pref: StoredThemePreference) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
  } catch {
    // localStorage unavailable (private browsing, quota) - the
    // in-memory state still works for the current session.
  }
}

function resolveMode(mode: ThemeMode): "light" | "dark" {
  if (mode !== "system") return mode;
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

interface ThemeContextValue {
  themeId: string;
  setThemeId: (id: string) => void;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** The concrete light/dark this session is actually rendering right
   * now - "system" resolves to whichever the OS currently reports. */
  resolvedMode: "light" | "dark";
  activePreset: ThemePreset;
  themes: ThemePreset[];
}

const ThemeContext = createContext<ThemeContextValue>({
  themeId: DEFAULT_PREFERENCE.themeId,
  setThemeId: () => {},
  mode: DEFAULT_PREFERENCE.mode,
  setMode: () => {},
  resolvedMode: "light",
  activePreset: getThemePreset(DEFAULT_THEME_ID),
  themes: THEME_PRESETS,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [{ themeId, mode }, setPreference] =
    useState<StoredThemePreference>(readStoredPreference);
  const [resolvedMode, setResolvedMode] = useState<"light" | "dark">(() =>
    resolveMode(mode),
  );

  const activePreset = useMemo(() => getThemePreset(themeId), [themeId]);

  // Apply the active theme's tokens + the dark/light class to <html>
  // before paint, whenever the preset, mode, or the OS-reported scheme
  // (while in "system" mode) changes.
  useLayoutEffect(() => {
    const resolved = resolveMode(mode);
    setResolvedMode(resolved);

    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    applyThemeTokens(root, activePreset[resolved]);
    applyThemeFonts(root, activePreset);
  }, [activePreset, mode]);

  // Only actively listen for OS scheme changes while in "system" mode -
  // an explicit light/dark choice must never be silently overridden by
  // the OS switching later.
  useLayoutEffect(() => {
    if (
      mode !== "system" ||
      typeof window === "undefined" ||
      !window.matchMedia
    )
      return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const resolved = resolveMode("system");
      setResolvedMode(resolved);
      const root = document.documentElement;
      root.classList.toggle("dark", resolved === "dark");
      applyThemeTokens(root, activePreset[resolved]);
      applyThemeFonts(root, activePreset);
    };
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, [mode, activePreset]);

  const setThemeId = useCallback((id: string) => {
    setPreference((prev) => {
      const next = { ...prev, themeId: getThemePreset(id).id };
      writeStoredPreference(next);
      return next;
    });
  }, []);

  const setMode = useCallback((nextMode: ThemeMode) => {
    setPreference((prev) => {
      const next = { ...prev, mode: nextMode };
      writeStoredPreference(next);
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeId,
      setThemeId,
      mode,
      setMode,
      resolvedMode,
      activePreset,
      themes: THEME_PRESETS,
    }),
    [themeId, setThemeId, mode, setMode, resolvedMode, activePreset],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
