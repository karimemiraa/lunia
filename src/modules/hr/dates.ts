// Calendar helpers for HR. Everything works on center-local (Asia/Riyadh)
// "YYYY-MM-DD" strings, computed with UTC math so the host timezone never
// matters. Date-only fields on EmployeeRecord (hire date, expiries) are stored
// as UTC midnight of that calendar date.

import { utcToCenterLocal } from "@/modules/booking/availability";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_MS = 86_400_000;

export function isDateISO(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isMonthISO(value: string): boolean {
  return MONTH_RE.test(value);
}

/** Today's center-local date. */
export function todayISO(now: Date = new Date()): string {
  return utcToCenterLocal(now).dateISO;
}

/** "YYYY-MM" of a center-local date. */
export function monthOf(dateISO: string): string {
  return dateISO.slice(0, 7);
}

function toUtcDay(dateISO: string): number {
  return Date.parse(`${dateISO}T00:00:00.000Z`);
}

export function addDays(dateISO: string, days: number): string {
  return new Date(toUtcDay(dateISO) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function diffDays(aISO: string, bISO: string): number {
  return Math.round((toUtcDay(bISO) - toUtcDay(aISO)) / DAY_MS);
}

/** Inclusive calendar-day count of [start, end]. */
export function daysInclusive(startISO: string, endISO: string): number {
  return diffDays(startISO, endISO) + 1;
}

/** Days of [start,end] that fall inside [rangeStart,rangeEnd] (all inclusive). */
export function overlapDays(startISO: string, endISO: string, rangeStartISO: string, rangeEndISO: string): number {
  const s = startISO > rangeStartISO ? startISO : rangeStartISO;
  const e = endISO < rangeEndISO ? endISO : rangeEndISO;
  return s > e ? 0 : daysInclusive(s, e);
}

/** First and last center-local day of a "YYYY-MM" month. */
export function monthBounds(month: string): { firstISO: string; lastISO: string; days: number } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const firstISO = `${month}-01`;
  const last = new Date(Date.UTC(y, m, 0));
  const lastISO = last.toISOString().slice(0, 10);
  return { firstISO, lastISO, days: last.getUTCDate() };
}

/** Date-only DB value -> "YYYY-MM-DD" (null-safe). */
export function dateToISO(date: Date | null | undefined): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

/** "YYYY-MM-DD" -> Date-only DB value (UTC midnight). */
export function isoToDate(dateISO: string): Date {
  return new Date(`${dateISO}T00:00:00.000Z`);
}

/** Sunday of the week containing dateISO (the center's week starts Sunday). */
export function weekStart(dateISO: string): string {
  const weekday = new Date(toUtcDay(dateISO)).getUTCDay();
  return addDays(dateISO, -weekday);
}

/** Adds whole years to a date, keeping month/day (Feb 29 rolls to Mar 1). */
export function addYears(dateISO: string, years: number): string {
  const [y, m, d] = dateISO.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y + years, m - 1, d)).toISOString().slice(0, 10);
}
