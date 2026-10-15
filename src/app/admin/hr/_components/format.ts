// Display helpers shared by the HR admin screens. Payroll needs halala
// precision, so money shows two decimals (unlike the rounded site prices).
// Every helper takes the staff locale (default English); Arabic keeps the
// Gregorian calendar and Western digits (see intlLocale in _i18n/t).
import { intlLocale, translate, type StaffLocale, type T } from "../../_i18n/t";

const CENTER_TZ = "Asia/Riyadh";

const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function sar(minor: number, locale: StaffLocale = "en"): string {
  const amount = money.format(minor / 100);
  return locale === "ar" ? `${amount} ${translate("SAR", locale)}` : `SAR ${amount}`;
}

/** Halalas -> plain riyal string for an input's defaultValue ("" for zero). */
export function minorToInput(minor: number): string {
  return minor ? (minor / 100).toFixed(2).replace(/\.00$/, "") : "";
}

export function hoursLabel(minutes: number, locale: StaffLocale = "en"): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (locale === "ar") return m ? translate("{h}h {m}m", locale, { h, m }) : translate("{h}h", locale, { h });
  return m ? `${h}h ${m}m` : `${h}h`;
}

const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(locale: StaffLocale, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = locale + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) cache.set(key, (f = new Intl.DateTimeFormat(intlLocale(locale), opts)));
  return f;
}

const TIME: Intl.DateTimeFormatOptions = { timeZone: CENTER_TZ, hour: "2-digit", minute: "2-digit" };
export function timeLabel(d: Date | null | undefined, locale: StaffLocale = "en"): string {
  return d ? fmt(locale, TIME).format(d) : "—";
}

/** "HH:MM" in center time, for a time input's defaultValue (always en-GB, 24h). */
export function timeInput(d: Date | null | undefined): string {
  return d ? fmt("en", TIME).format(d) : "";
}

const DAY: Intl.DateTimeFormatOptions = { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" };
export function dayLabel(dateISO: string, locale: StaffLocale = "en"): string {
  return fmt(locale, DAY).format(new Date(`${dateISO}T00:00:00.000Z`));
}

const LONG_DAY: Intl.DateTimeFormatOptions = { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" };
export function dateLabel(dateISO: string | null | undefined, locale: StaffLocale = "en"): string {
  return dateISO ? fmt(locale, LONG_DAY).format(new Date(`${dateISO}T00:00:00.000Z`)) : "—";
}

const MONTH: Intl.DateTimeFormatOptions = { timeZone: "UTC", month: "long", year: "numeric" };
export function monthLabel(month: string, locale: StaffLocale = "en"): string {
  return fmt(locale, MONTH).format(new Date(`${month}-01T00:00:00.000Z`));
}

/** Medium date + short time in center time (approval / payment stamps). */
const STAMP: Intl.DateTimeFormatOptions = { timeZone: CENTER_TZ, dateStyle: "medium", timeStyle: "short" };
export function stampLabel(d: Date, locale: StaffLocale = "en"): string {
  return fmt(locale, STAMP).format(d);
}

/** Display label for a payroll / leave status enum (DRAFT -> "draft"). */
export function statusLabel(status: string, locale: StaffLocale = "en"): string {
  return translate(status.toLowerCase(), locale);
}

/**
 * An English label whose Arabic depends on context ("In" on a clock record is
 * not "In" on a stock movement): looks up a context key, and shows the plain
 * English label when that key has no translation (i.e. in English).
 */
export function tCtx(t: T, english: string, contextKey: string): string {
  const v = t(contextKey);
  return v === contextKey ? english : v;
}

export const badge = {
  neutral: "bg-[var(--color-ink)]/8 text-[var(--color-ink)]/70",
  good: "bg-[var(--color-teal)]/25 text-[var(--color-ink)]",
  warn: "bg-[var(--color-gold)]/30 text-[var(--color-ink)]",
  bad: "bg-red-100 text-red-800",
};

export const badgeBase = "inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide";

export function payrollStatusBadge(status: string): string {
  return status === "DRAFT" ? badge.warn : status === "APPROVED" ? badge.good : badge.neutral;
}
