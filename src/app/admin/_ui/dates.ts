// Dates for staff screens: always Riyadh time, one short format, plus a
// relative form for "when did this happen" columns.
export const CENTER_TZ = "Asia/Riyadh";

type DateLike = Date | string | number | null | undefined;

const dateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: CENTER_TZ, day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: CENTER_TZ, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: CENTER_TZ, hour: "2-digit", minute: "2-digit" });
const shortFmt = new Intl.DateTimeFormat("en-GB", { timeZone: CENTER_TZ, day: "numeric", month: "short" });

function toDate(d: DateLike): Date | null {
  if (d === null || d === undefined || d === "") return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "12 Mar 2026" */
export function formatDate(d: DateLike): string {
  const date = toDate(d);
  return date ? dateFmt.format(date) : "—";
}

/** "12 Mar 2026, 14:30" */
export function formatDateTime(d: DateLike): string {
  const date = toDate(d);
  return date ? dateTimeFmt.format(date).replace(",", ",") : "—";
}

/** "14:30" */
export function formatTime(d: DateLike): string {
  const date = toDate(d);
  return date ? timeFmt.format(date) : "—";
}

/** "12 Mar" */
export function formatShortDate(d: DateLike): string {
  const date = toDate(d);
  return date ? shortFmt.format(date) : "—";
}

/**
 * "just now", "5 min ago", "3 h ago", "yesterday", "in 2 days", else the
 * short date. Deterministic given `now`, so it is safe in server components
 * when the caller passes the request time.
 */
export function formatRelative(d: DateLike, now: Date = new Date()): string {
  const date = toDate(d);
  if (!date) return "—";
  const diffMs = date.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const past = diffMs < 0;
  const min = Math.round(abs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return past ? `${min} min ago` : `in ${min} min`;
  const hours = Math.round(abs / 3_600_000);
  if (hours < 24) return past ? `${hours} h ago` : `in ${hours} h`;
  const days = Math.round(abs / 86_400_000);
  if (days === 1) return past ? "yesterday" : "tomorrow";
  if (days < 7) return past ? `${days} days ago` : `in ${days} days`;
  return formatShortDate(date);
}

/** "YYYY-MM-DD" in Riyadh time, for date inputs and query strings. */
export function toISODate(d: DateLike = new Date()): string {
  const date = toDate(d) ?? new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: CENTER_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
