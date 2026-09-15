import Link from "next/link";
import type { MonthDayCell } from "@/modules/booking/bookings";

interface MonthViewProps {
  /** Selected month, "YYYY-MM". */
  monthISO: string;
  /** Currently selected day, "YYYY-MM-DD" (highlighted, drives the day view below). */
  selectedDateISO: string;
  /** Today in center-local time, "YYYY-MM-DD". */
  todayISO: string;
  /** Appointment summary per day, keyed by "YYYY-MM-DD". */
  days: Record<string, MonthDayCell>;
  /** Preserve the staff filter across day/month navigation. */
  staffUserId?: string;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Small color accent per booking status (left border of each chip).
const STATUS_ACCENT: Record<string, string> = {
  REQUESTED: "border-s-[var(--color-ink)]/40",
  CONFIRMED: "border-s-[var(--color-teal)]",
  CHECKED_IN: "border-s-[var(--color-gold)]",
  COMPLETED: "border-s-[var(--color-canopy)]",
  CANCELLED: "border-s-red-400",
  NO_SHOW: "border-s-red-400",
};

function shiftMonth(monthISO: string, delta: number): string {
  const [y, m] = monthISO.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function hrefFor(params: { month?: string; day?: string; staffUserId?: string }): string {
  const sp = new URLSearchParams();
  if (params.month) sp.set("month", params.month);
  if (params.day) sp.set("day", params.day);
  if (params.staffUserId) sp.set("staffUserId", params.staffUserId);
  return `?${sp.toString()}`;
}

export function MonthView({ monthISO, selectedDateISO, todayISO, days, staffUserId }: MonthViewProps) {
  const [year, month] = monthISO.split("-").map(Number);
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year!, month! - 1, 1)),
  );

  const daysInMonth = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year!, month! - 1, 1)).getUTCDay(); // 0 = Sun

  // Leading blanks so day 1 lands under its weekday, then the month's days.
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${monthISO}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="lunia-card mb-8 p-4 sm:p-5">
      {/* Month header + navigation */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--color-ink)]">{monthLabel}</h2>
        <div className="flex items-center gap-1.5">
          <Link
            href={hrefFor({ month: shiftMonth(monthISO, -1), staffUserId })}
            className="lunia-btn lunia-btn-ghost lunia-btn-sm"
            aria-label="Previous month"
          >
            ‹
          </Link>
          <Link
            href={hrefFor({ month: todayISO.slice(0, 7), day: todayISO, staffUserId })}
            className="lunia-btn lunia-btn-ghost lunia-btn-sm"
          >
            Today
          </Link>
          <Link
            href={hrefFor({ month: shiftMonth(monthISO, 1), staffUserId })}
            className="lunia-btn lunia-btn-ghost lunia-btn-sm"
            aria-label="Next month"
          >
            ›
          </Link>
        </div>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-1 pb-1 text-center text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink)]/45">
            {w}
          </div>
        ))}

        {cells.map((dateISO, i) => {
          if (!dateISO) return <div key={`blank-${i}`} className="min-h-[84px] rounded-[var(--radius-sm)] bg-[var(--surface-2)]/40" />;
          const cell = days[dateISO];
          const dayNum = Number(dateISO.slice(8));
          const isToday = dateISO === todayISO;
          const isSelected = dateISO === selectedDateISO;
          return (
            <Link
              key={dateISO}
              href={hrefFor({ month: monthISO, day: dateISO, staffUserId })}
              data-testid="calendar-day"
              data-date={dateISO}
              className={`flex min-h-[84px] flex-col gap-1 rounded-[var(--radius-sm)] border p-1.5 text-start transition-colors hover:bg-[var(--color-teal)]/[0.06] ${
                isSelected
                  ? "border-[var(--color-teal)] bg-[var(--color-teal)]/[0.08] ring-1 ring-[var(--color-teal)]"
                  : "border-[var(--line)] bg-[var(--surface)]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                    isToday ? "bg-[var(--color-ink)] text-[var(--color-cream)]" : "text-[var(--color-ink)]/70"
                  }`}
                >
                  {dayNum}
                </span>
                {cell && cell.count > 0 && (
                  <span className="text-[0.62rem] font-medium text-[var(--color-ink)]/45">{cell.count}</span>
                )}
              </div>
              <div className="flex flex-col gap-0.5">
                {cell?.items.map((item, idx) => (
                  <span
                    key={idx}
                    className={`truncate border-s-2 ps-1 text-[0.62rem] leading-tight text-[var(--color-ink)]/75 ${
                      STATUS_ACCENT[item.status] ?? "border-s-[var(--color-ink)]/30"
                    }`}
                    title={`${item.time} ${item.clientName}`}
                  >
                    {item.time} {item.clientName}
                  </span>
                ))}
                {cell && cell.count > cell.items.length && (
                  <span className="ps-1 text-[0.6rem] text-[var(--color-ink)]/45">+{cell.count - cell.items.length} more</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
