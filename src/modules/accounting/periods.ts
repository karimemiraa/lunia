// Center-local (Asia/Riyadh) date-range, month and quarter helpers for the
// accounting reports, plus money formatting. Pure: no DB access. Built on
// availability.ts's fixed UTC+3 conversion so every report buckets an
// invoice/expense into the same day, month and quarter the front desk sees.

import { centerLocalToUtc, utcToCenterLocal } from "@/modules/booking/availability";
import { resolveReportDateRange } from "@/modules/reports/dateRange";

export interface AccountingRange {
  fromISO: string;
  toISO: string;
  /** Inclusive UTC lower bound (start of `fromISO`, center-local). */
  from: Date;
  /** Exclusive UTC upper bound (start of the day AFTER `toISO`). */
  to: Date;
}

/**
 * Resolves raw `from`/`to` query params (validated, month-to-date default,
 * see reports/dateRange.ts) into a UTC half-open range. A reversed range is
 * swapped rather than rejected so a mistyped picker never 500s a report.
 */
export function resolveAccountingRange(fromParam?: string | null, toParam?: string | null, now: Date = new Date()): AccountingRange {
  let { fromISO, toISO } = resolveReportDateRange(fromParam, toParam, now);
  if (fromISO > toISO) [fromISO, toISO] = [toISO, fromISO];
  return { fromISO, toISO, from: centerLocalToUtc(fromISO, 0), to: centerLocalToUtc(toISO, 1440) };
}

export function rangeFromISO(fromISO: string, toISO: string): AccountingRange {
  return { fromISO, toISO, from: centerLocalToUtc(fromISO, 0), to: centerLocalToUtc(toISO, 1440) };
}

/** Center-local "YYYY-MM" for a UTC instant. */
export function monthKeyOf(date: Date): string {
  return utcToCenterLocal(date).dateISO.slice(0, 7);
}

/** Center-local "YYYY-MM-DD" for a UTC instant. */
export function dateISOOf(date: Date): string {
  return utcToCenterLocal(date).dateISO;
}

/** "2026-07" -> "2026-Q3". */
export function quarterKeyOfMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
}

export type VatPeriod = "month" | "quarter";

export function periodKeyOf(date: Date, period: VatPeriod): string {
  const month = monthKeyOf(date);
  return period === "quarter" ? quarterKeyOfMonth(month) : month;
}

/** Every "YYYY-MM" touched by [fromISO, toISO], in order. */
export function monthsInRange(fromISO: string, toISO: string): string[] {
  const months: string[] = [];
  let [year, month] = fromISO.slice(0, 7).split("-").map(Number);
  const end = toISO.slice(0, 7);
  for (let guard = 0; guard < 600; guard += 1) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    months.push(key);
    if (key >= end) break;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

export function periodsInRange(fromISO: string, toISO: string, period: VatPeriod): string[] {
  const months = monthsInRange(fromISO, toISO);
  if (period === "month") return months;
  return [...new Set(months.map(quarterKeyOfMonth))];
}

/** "YYYY-MM-DD" shifted by `months` (clamped to the 1st), used for trend windows. */
export function addMonthsToMonthKey(monthKey: string, months: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const index = year * 12 + (month - 1) + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Last calendar day of a "YYYY-MM" as "YYYY-MM-DD". */
export function lastDayOfMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${monthKey}-${String(day).padStart(2, "0")}`;
}

/** Whole center-local days between two instants (b - a), never negative. */
export function daysBetween(a: Date, b: Date): number {
  const dayA = Date.parse(`${dateISOOf(a)}T00:00:00Z`);
  const dayB = Date.parse(`${dateISOOf(b)}T00:00:00Z`);
  return Math.max(0, Math.round((dayB - dayA) / 86_400_000));
}

// ---- Money -----------------------------------------------------------------

/** Halalas -> "1,234.50 SAR" for admin screens (2 decimals: this is accounting). */
export function formatMinor(minor: number): string {
  const major = minor / 100;
  return `${major.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR`;
}

/** Halalas -> "1234.50" for CSV (a string, so no float artifacts reach Excel). */
export function minorToSarString(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return "";
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Parses a staff-typed SAR amount ("1,234.5", "250", "99.99") into halalas.
 * Returns null for anything that isn't a plain non-negative decimal with at
 * most two fraction digits -- never guesses.
 */
export function parseSarToMinor(input: string): number | null {
  const cleaned = input.replace(/[,\s]/g, "").replace(/SAR$/i, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

export const VAT_RATE_BP = 1500;

/** 15% VAT on a net amount, rounded half-up to the halala. */
export function vatOn(netMinor: number, rateBp: number = VAT_RATE_BP): number {
  return Math.round((netMinor * rateBp) / 10_000);
}
