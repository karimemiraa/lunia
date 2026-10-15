// Dates for staff screens: always Riyadh time, one short format, plus a
// relative form for "when did this happen" columns.
import { intlLocale, translate, type StaffLocale } from "../_i18n/t";

export const CENTER_TZ = "Asia/Riyadh";

type DateLike = Date | string | number | null | undefined;

// Every formatter takes the staff locale (default English). Arabic uses the
// Gregorian calendar with Western digits — see intlLocale in ../_i18n/t.ts.
type Locale = StaffLocale;
const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(locale: Locale, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = locale + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) cache.set(key, (f = new Intl.DateTimeFormat(intlLocale(locale), { timeZone: CENTER_TZ, ...opts })));
  return f;
}
const DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
const DATE_TIME: Intl.DateTimeFormatOptions = { ...DATE, hour: "2-digit", minute: "2-digit" };
const TIME: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
const SHORT: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };

function toDate(d: DateLike): Date | null {
  if (d === null || d === undefined || d === "") return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "12 Mar 2026" */
export function formatDate(d: DateLike, locale: Locale = "en"): string {
  const date = toDate(d);
  return date ? fmt(locale, DATE).format(date) : "—";
}

/** "12 Mar 2026, 14:30" */
export function formatDateTime(d: DateLike, locale: Locale = "en"): string {
  const date = toDate(d);
  return date ? fmt(locale, DATE_TIME).format(date) : "—";
}

/** "14:30" */
export function formatTime(d: DateLike, locale: Locale = "en"): string {
  const date = toDate(d);
  return date ? fmt(locale, TIME).format(date) : "—";
}

/** "12 Mar" */
export function formatShortDate(d: DateLike, locale: Locale = "en"): string {
  const date = toDate(d);
  return date ? fmt(locale, SHORT).format(date) : "—";
}

/**
 * "just now", "5 min ago", "3 h ago", "yesterday", "in 2 days", else the
 * short date. Deterministic given `now`, so it is safe in server components
 * when the caller passes the request time.
 */
export function formatRelative(d: DateLike, now: Date = new Date(), locale: Locale = "en"): string {
  const date = toDate(d);
  if (!date) return "—";
  const t = (text: string, n?: number) => translate(text, locale, n === undefined ? undefined : { n });
  const diffMs = date.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const past = diffMs < 0;
  const min = Math.round(abs / 60_000);
  if (min < 1) return t("just now");
  if (min < 60) return past ? t("{n} min ago", min) : t("in {n} min", min);
  const hours = Math.round(abs / 3_600_000);
  if (hours < 24) return past ? t("{n} h ago", hours) : t("in {n} h", hours);
  const days = Math.round(abs / 86_400_000);
  if (days === 1) return past ? t("yesterday") : t("tomorrow");
  if (days < 7) return past ? t("{n} days ago", days) : t("in {n} days", days);
  return formatShortDate(date, locale);
}

/** "YYYY-MM-DD" in Riyadh time, for date inputs and query strings. */
export function toISODate(d: DateLike = new Date()): string {
  const date = toDate(d) ?? new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: CENTER_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
