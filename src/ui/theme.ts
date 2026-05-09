// Carbon Design System theme management.
// Applies and syncs theme classes to the document based on system preference.

import { CARBON_THEME_CLASSES, SYSTEM_LIGHT_THEME, SYSTEM_DARK_THEME } from "./constants.ts";

export function applyCarbonTheme(themeClass) {
  const nextTheme = CARBON_THEME_CLASSES.includes(themeClass) ? themeClass : SYSTEM_LIGHT_THEME;
  const targets = [document.documentElement, document.body].filter(Boolean);
  for (const target of targets) {
    target.classList.remove(...CARBON_THEME_CLASSES);
    target.classList.add(nextTheme);
  }
}

export function currentSystemTheme() {
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? SYSTEM_DARK_THEME : SYSTEM_LIGHT_THEME;
}

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
