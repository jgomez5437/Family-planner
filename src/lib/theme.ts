export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "fp_theme_preference";

export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: "#FFF9F0",
  dark: "#171411",
};

export function parseThemePreference(raw: unknown): ThemePreference {
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean
): ResolvedTheme {
  if (preference === "dark") return "dark";
  if (preference === "light") return "light";
  return systemPrefersDark ? "dark" : "light";
}

export function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function readStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function writeStoredThemePreference(preference: ThemePreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* ignore storage write failures */
  }
}

export function applyThemeToDocument(
  preference: ThemePreference,
  resolved: ResolvedTheme
): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  root.setAttribute("data-theme-pref", preference);
  root.style.colorScheme = resolved;

  const color = THEME_COLORS[resolved];
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  if (metas.length > 0) {
    metas.forEach((meta) => {
      meta.setAttribute("content", color);
    });
  } else if (document.head) {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("content", color);
    document.head.appendChild(meta);
  }
}

/**
 * Synchronous pre-hydration script injected in <head> so reloads apply the
 * saved or system theme before first paint (zero flash).
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var raw=window.localStorage.getItem(k);var pref=(raw==="light"||raw==="dark"||raw==="system")?raw:"system";var sys=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;var res=pref==="system"?(sys?"dark":"light"):pref;var r=document.documentElement;r.setAttribute("data-theme",res);r.setAttribute("data-theme-pref",pref);r.style.colorScheme=res;var c=res==="dark"?${JSON.stringify(THEME_COLORS.dark)}:${JSON.stringify(THEME_COLORS.light)};var ms=document.querySelectorAll('meta[name="theme-color"]');if(ms.length){for(var i=0;i<ms.length;i++){ms[i].setAttribute("content",c);}}}catch(e){}})();`;
