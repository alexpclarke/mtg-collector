// Carbon Design System theme management.
// Applies and syncs theme classes to the document based on system preference.

import { CARBON_THEME_CLASSES, SYSTEM_LIGHT_THEME, SYSTEM_DARK_THEME } from "./constants.ts";

// Carbon Design System theme management.
// Applies and syncs theme classes to the document based on system preference.

// Applies a Carbon theme class to <html> and <body>, removing any previously
// applied theme class first. Falls back to SYSTEM_LIGHT_THEME for unrecognised
// values so the UI is never left in a broken state.
export function applyCarbonTheme(themeClass) {
  const nextTheme = CARBON_THEME_CLASSES.includes(themeClass) ? themeClass : SYSTEM_LIGHT_THEME;
  const targets = [document.documentElement, document.body].filter(Boolean);
  for (const target of targets) {
    target.classList.remove(...CARBON_THEME_CLASSES);
    target.classList.add(nextTheme);
  }
}

// Returns the Carbon theme class that matches the OS-level color scheme
// preference (dark or light). Defaults to light when matchMedia is unavailable.
export function currentSystemTheme() {
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? SYSTEM_DARK_THEME : SYSTEM_LIGHT_THEME;
}

// Immediately applies the system theme on load and registers a listener so
// the theme updates live if the user switches OS dark/light mode while the
// page is open. Handles both the modern addEventListener API and the legacy
// addListener API for older browsers.
// This function is called as a module side effect when theme.ts is imported.
export function initializeSystemThemeSync() {
  const mediaQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const syncTheme = () => applyCarbonTheme(currentSystemTheme());
  syncTheme();

  if (!mediaQuery) return;
  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", syncTheme);
    return;
  }
  if (typeof mediaQuery.addListener === "function") {
    mediaQuery.addListener(syncTheme);
  }
}

initializeSystemThemeSync();
