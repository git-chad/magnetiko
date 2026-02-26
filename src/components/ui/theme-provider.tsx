"use client";

import * as React from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

const COOKIE_NAME = "magnetiko-theme";
const LOCAL_STORAGE_THEME_KEY = "magnetiko-theme";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function ThemeProvider({
  children,
  defaultTheme = "light",
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
}) {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme);

  const applyTheme = React.useCallback((next: Theme) => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(next);
    document.cookie = `${COOKIE_NAME}=${next}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
    try {
      localStorage.setItem(LOCAL_STORAGE_THEME_KEY, next);
    } catch {
      // localStorage may be unavailable in restricted contexts.
    }
    setThemeState(next);
  }, []);

  // On mount, prefer persisted localStorage theme, fallback to server html class.
  React.useEffect(() => {
    let persisted: Theme | null = null;
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_THEME_KEY);
      if (saved === "dark" || saved === "light") persisted = saved;
    } catch {
      // localStorage may be unavailable in restricted contexts.
    }
    const htmlClass = document.documentElement.classList.contains("dark")
      ? "dark"
      : "light";
    applyTheme(persisted ?? htmlClass);
  }, [applyTheme]);

  const setTheme = React.useCallback(
    (next: Theme) => applyTheme(next),
    [applyTheme],
  );

  const toggle = React.useCallback(
    () => applyTheme(theme === "dark" ? "light" : "dark"),
    [theme, applyTheme],
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

export { ThemeProvider, useTheme, COOKIE_NAME };
export type { Theme };
