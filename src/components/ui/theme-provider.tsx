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
    setThemeState(next);
  }, []);

  // On mount, sync from html class (set server-side) → state
  React.useEffect(() => {
    const htmlClass = document.documentElement.classList.contains("dark")
      ? "dark"
      : "light";
    setThemeState(htmlClass);
  }, []);

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
