"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  applyThemeToDocument,
  getSystemPrefersDark,
  parseThemePreference,
  readStoredThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  writeStoredThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: "system",
  resolvedTheme: "light",
  setPreference: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(false);

  useEffect(() => {
    const stored = readStoredThemePreference();
    const sysDark = getSystemPrefersDark();
    setPreferenceState(stored);
    setSystemPrefersDark(sysDark);
    applyThemeToDocument(stored, resolveTheme(stored, sysDark));

    if (typeof window.matchMedia === "function") {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const onMediaChange = (e: MediaQueryListEvent) => {
        setSystemPrefersDark(e.matches);
      };
      if (typeof media.addEventListener === "function") {
        media.addEventListener("change", onMediaChange);
      } else if (typeof media.addListener === "function") {
        media.addListener(onMediaChange);
      }

      const onStorage = (e: StorageEvent) => {
        if (e.key === THEME_STORAGE_KEY) {
          setPreferenceState(parseThemePreference(e.newValue));
        }
      };
      window.addEventListener("storage", onStorage);

      return () => {
        if (typeof media.removeEventListener === "function") {
          media.removeEventListener("change", onMediaChange);
        } else if (typeof media.removeListener === "function") {
          media.removeListener(onMediaChange);
        }
        window.removeEventListener("storage", onStorage);
      };
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) {
        setPreferenceState(parseThemePreference(e.newValue));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const resolvedTheme = useMemo(
    () => resolveTheme(preference, systemPrefersDark),
    [preference, systemPrefersDark]
  );

  useEffect(() => {
    applyThemeToDocument(preference, resolvedTheme);
  }, [preference, resolvedTheme]);

  const setPreference = useCallback((next: ThemePreference) => {
    const parsed = parseThemePreference(next);
    const sysDark = getSystemPrefersDark();
    const resolved = resolveTheme(parsed, sysDark);
    setPreferenceState(parsed);
    setSystemPrefersDark(sysDark);
    writeStoredThemePreference(parsed);
    applyThemeToDocument(parsed, resolved);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme, setPreference]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
