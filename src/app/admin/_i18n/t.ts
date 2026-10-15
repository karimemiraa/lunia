// Staff-console translation. Source strings are the English UI text itself, so
// call sites stay readable: t("Save changes"), t("{count} unpaid", { count }).
// Arabic lives in ./ar/<section>.ts (one file per admin section, merged in
// ./ar/index.ts) and follows docs/arabic-glossary.md. Anything without an
// Arabic entry falls back to English, and e2e/admin-arabic.spec.ts flags it.
//
// Plain data + pure functions: safe for server and client components.

import AR from "./ar";

export type StaffLocale = "en" | "ar";
export type TVars = Record<string, string | number | null | undefined>;
export type T = (text: string, vars?: TVars) => string;

function interpolate(text: string, vars?: TVars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
}

/** One string in the staff locale; unknown strings fall back to English. */
export function translate(text: string, locale: StaffLocale, vars?: TVars): string {
  return interpolate(locale === "ar" ? (AR[text] ?? text) : text, vars);
}

/** A bound translator for one locale. */
export function makeT(locale: StaffLocale): T {
  return (text, vars) => translate(text, locale, vars);
}

/**
 * A word whose Arabic depends on where it sits (e.g. "Open" the button vs
 * "Open" as an opening time): looks up "<text> (<context>)" first, then the
 * plain text. English always shows the plain text.
 */
export function translateIn(text: string, context: string, locale: StaffLocale, vars?: TVars): string {
  const key = `${text} (${context})`;
  return locale === "ar" && Object.prototype.hasOwnProperty.call(AR, key) ? translate(key, locale, vars) : translate(text, locale, vars);
}

/** Whether an Arabic entry exists (for tests and tooling). */
export function hasArabic(text: string): boolean {
  return Object.prototype.hasOwnProperty.call(AR, text);
}

/**
 * Intl locale for dates and numbers on staff screens. Arabic uses the
 * Gregorian calendar with Western digits (glossary §5); English keeps the
 * day-month-year order staff already know.
 */
export function intlLocale(locale: StaffLocale, english: string = "en-GB"): string {
  return locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : english;
}
