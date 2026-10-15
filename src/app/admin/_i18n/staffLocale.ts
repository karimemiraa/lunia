// Staff-console display preferences: language (English default, opt-in Arabic
// + RTL) and colour theme. Both live in cookies so the server renders the
// right <html lang/dir/data-theme> on the first byte (no flash, no mismatch).
// Plain data + pure helpers: safe to import from server and client components.

export type StaffLocale = "en" | "ar";
export type StaffTheme = "system" | "light" | "dark";

export const STAFF_LOCALE_COOKIE = "lunia_staff_locale";
export const STAFF_THEME_COOKIE = "lunia_staff_theme";

export function parseStaffLocale(value: string | undefined | null): StaffLocale {
  return value === "ar" ? "ar" : "en";
}

export function parseStaffTheme(value: string | undefined | null): StaffTheme {
  return value === "light" || value === "dark" ? value : "system";
}

// Arabic for every staff screen lives in ./ar/<section>.ts, keyed by the
// English text (see ./t.ts). Strings without an entry fall back to English.
import { translate } from "./t";

/** Translate a chrome string for the staff locale; unknown strings fall back to English. */
export function st(text: string, locale: StaffLocale): string {
  return translate(text, locale);
}
