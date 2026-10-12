// Reporting periods for the assistant's numbers, in the center's time zone
// (Asia/Riyadh) — "today" means the clinic's day, not the server's.

import { centerLocalToUtc, utcToCenterLocal, weekdayForDateISO } from "@/modules/booking/availability";

export const PERIODS = ["today", "yesterday", "this_week", "last_7_days", "this_month", "last_month", "last_30_days", "this_year"] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This week",
  last_7_days: "Last 7 days",
  this_month: "This month",
  last_month: "Last month",
  last_30_days: "Last 30 days",
  this_year: "This year",
};

const DAY_MS = 86_400_000;

function addDaysISO(dateISO: string, days: number): string {
  return utcToCenterLocal(new Date(centerLocalToUtc(dateISO, 720).getTime() + days * DAY_MS)).dateISO;
}

/** [from, to) instants for a period ending "now" in Riyadh time. */
export function periodRange(period: Period, now: Date = new Date()): { from: Date; to: Date; label: string } {
  const todayISO = utcToCenterLocal(now).dateISO;
  const tomorrow = centerLocalToUtc(addDaysISO(todayISO, 1), 0);
  const start = (iso: string) => centerLocalToUtc(iso, 0);
  const label = PERIOD_LABELS[period];
  switch (period) {
    case "today":
      return { from: start(todayISO), to: tomorrow, label };
    case "yesterday":
      return { from: start(addDaysISO(todayISO, -1)), to: start(todayISO), label };
    case "this_week": // Sunday-start, like the calendar and dashboard
      return { from: start(addDaysISO(todayISO, -weekdayForDateISO(todayISO))), to: tomorrow, label };
    case "last_7_days":
      return { from: start(addDaysISO(todayISO, -6)), to: tomorrow, label };
    case "this_month":
      return { from: start(`${todayISO.slice(0, 7)}-01`), to: tomorrow, label };
    case "last_month": {
      const firstThis = `${todayISO.slice(0, 7)}-01`;
      const prev = addDaysISO(firstThis, -1);
      return { from: start(`${prev.slice(0, 7)}-01`), to: start(firstThis), label };
    }
    case "last_30_days":
      return { from: start(addDaysISO(todayISO, -29)), to: tomorrow, label };
    case "this_year":
      return { from: start(`${todayISO.slice(0, 4)}-01-01`), to: tomorrow, label };
  }
}

export function formatSar(minor: number): string {
  return `${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} SAR`;
}
