"use client";

import { useEffect } from "react";
import type { StaffTheme } from "../_i18n/staffLocale";

/** The pre-paint script for "match device": applies dark before first paint (no flash). */
export const SYSTEM_THEME_SCRIPT = `try{if(matchMedia("(prefers-color-scheme: dark)").matches)document.documentElement.setAttribute("data-theme","midnight")}catch(e){}`;

/**
 * Keeps "match device" live after hydration: follows OS light/dark changes and
 * re-applies the device theme when switching back to "system" from the menu
 * (the server-rendered attribute only covers explicit light/dark).
 */
export function ThemeSync({ theme }: { theme: StaffTheme }) {
  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      if (media.matches) document.documentElement.setAttribute("data-theme", "midnight");
      else document.documentElement.removeAttribute("data-theme");
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  return null;
}
