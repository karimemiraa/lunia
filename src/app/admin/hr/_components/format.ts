// Display helpers shared by the HR admin screens. Payroll needs halala
// precision, so money shows two decimals (unlike the rounded site prices).

const CENTER_TZ = "Asia/Riyadh";

const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function sar(minor: number): string {
  return `SAR ${money.format(minor / 100)}`;
}

/** Halalas -> plain riyal string for an input's defaultValue ("" for zero). */
export function minorToInput(minor: number): string {
  return minor ? (minor / 100).toFixed(2).replace(/\.00$/, "") : "";
}

export function hoursLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: CENTER_TZ, hour: "2-digit", minute: "2-digit" });
export function timeLabel(d: Date | null | undefined): string {
  return d ? timeFmt.format(d) : "—";
}

/** "HH:MM" in center time, for a time input's defaultValue. */
export function timeInput(d: Date | null | undefined): string {
  return d ? timeFmt.format(d) : "";
}

const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
export function dayLabel(dateISO: string): string {
  return dayFmt.format(new Date(`${dateISO}T00:00:00.000Z`));
}

const longDayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
export function dateLabel(dateISO: string | null | undefined): string {
  return dateISO ? longDayFmt.format(new Date(`${dateISO}T00:00:00.000Z`)) : "—";
}

const monthFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });
export function monthLabel(month: string): string {
  return monthFmt.format(new Date(`${month}-01T00:00:00.000Z`));
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
