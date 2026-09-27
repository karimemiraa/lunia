// Opening-hours math in center time (Asia/Riyadh, UTC+3 all year, no DST):
// whether we're open right now, when we next open, and when a requested
// call-back should be due. Pure functions over the "hours" SiteSetting.

import type { HoursSettings } from "@/modules/cms/settings";
import { centerLocalToUtc, utcToCenterLocal } from "@/modules/booking/availability";
import type { CallbackWindow } from "./types";

export const WEEK_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type DayKey = (typeof WEEK_KEYS)[number];

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dayKeyOf(dateISO: string): DayKey {
  return WEEK_KEYS[new Date(`${dateISO}T00:00:00Z`).getUTCDay()]!;
}

export interface OpenState {
  open: boolean;
  /** When open: today's closing time ("22:00"). */
  closesAt?: string;
  /** When closed: the next opening (center-local date + time). */
  nextOpen?: { dateISO: string; time: string; dayKey: DayKey; daysAhead: number };
}

export function openState(hours: HoursSettings, now: Date): OpenState {
  const local = utcToCenterLocal(now);
  const today = hours[dayKeyOf(local.dateISO)];
  if (today && !today.closed && local.minutes >= toMinutes(today.open) && local.minutes < toMinutes(today.close)) {
    return { open: true, closesAt: today.close };
  }
  for (let ahead = 0; ahead <= 7; ahead++) {
    const dateISO = addDaysISO(local.dateISO, ahead);
    const day = hours[dayKeyOf(dateISO)];
    if (!day || day.closed) continue;
    if (ahead === 0 && local.minutes >= toMinutes(day.open)) continue;
    return { open: false, nextOpen: { dateISO, time: day.open, dayKey: dayKeyOf(dateISO), daysAhead: ahead } };
  }
  return { open: false };
}

/** Center-local dates of the next `count` open days, starting today. */
export function openDays(hours: HoursSettings | null, now: Date, count: number): string[] {
  const local = utcToCenterLocal(now);
  const out: string[] = [];
  for (let ahead = 0; out.length < count && ahead < count * 2 + 7; ahead++) {
    const dateISO = addDaysISO(local.dateISO, ahead);
    const day = hours?.[dayKeyOf(dateISO)];
    if (hours && (!day || day.closed)) continue;
    if (ahead === 0 && day && local.minutes >= toMinutes(day.close) - 30) continue;
    out.push(dateISO);
  }
  return out;
}

// Call-back windows in center-local minutes (clipped to opening hours).
const WINDOWS: Record<Exclude<CallbackWindow, "asap">, [number, number]> = {
  morning: [10 * 60, 12 * 60],
  afternoon: [12 * 60, 17 * 60],
  evening: [17 * 60, 22 * 60],
};

/**
 * When a call-back requested for `window` should be made: the next moment
 * inside both that window and opening hours ("asap" = now if open, else the
 * next opening).
 */
export function callbackDueAt(hours: HoursSettings | null, window: CallbackWindow, now: Date): Date {
  if (!hours) return now;
  const local = utcToCenterLocal(now);
  for (let ahead = 0; ahead <= 8; ahead++) {
    const dateISO = addDaysISO(local.dateISO, ahead);
    const day = hours[dayKeyOf(dateISO)];
    if (!day || day.closed) continue;
    const open = toMinutes(day.open);
    const close = toMinutes(day.close);
    const [ws, we] = window === "asap" ? [open, close] : WINDOWS[window];
    const start = Math.max(ws, open);
    const end = Math.min(we, close);
    if (start >= end) continue;
    const earliest = ahead === 0 ? Math.max(start, local.minutes) : start;
    if (earliest >= end) continue;
    return ahead === 0 && earliest === local.minutes ? now : centerLocalToUtc(dateISO, earliest);
  }
  return now;
}

/** Next call attempt after a "no answer": two hours later, inside hours. */
export function nextAttemptAt(hours: HoursSettings | null, now: Date, attempts: number): Date {
  const later = new Date(now.getTime() + (attempts >= 3 ? 24 : 2) * 3_600_000);
  return callbackDueAt(hours, "asap", later);
}
