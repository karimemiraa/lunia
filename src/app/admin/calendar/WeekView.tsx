import Link from "next/link";
import type { DayAppointmentRow } from "@/modules/booking/bookings";
import { STATUS_PILL } from "./DayGrid";

interface WeekViewProps {
  /** 7 center-local days (Sunday first) → that day's rows. */
  days: Record<string, DayAppointmentRow[]>;
  todayISO: string;
  /** Staff on approved leave per day (names). */
  leaveByDay: Record<string, string[]>;
  /** WAITING waitlist entries per day. */
  waitingByDay: Record<string, number>;
  dayHref: (dateISO: string) => string;
}

const CENTER_TZ = "Asia/Riyadh";
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, hour: "numeric", minute: "2-digit" });
const headFmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", day: "numeric" });

const STATUS_ACCENT: Record<string, string> = {
  REQUESTED: "border-s-[var(--color-ink)]/40",
  CONFIRMED: "border-s-[var(--color-teal)]",
  CHECKED_IN: "border-s-[var(--color-gold)]",
  COMPLETED: "border-s-[var(--color-canopy)]",
  CANCELLED: "border-s-red-400",
  NO_SHOW: "border-s-red-400",
};

// Seven compact columns; each card is one line (time · customer · pill) and
// opens the day view. Leave and waitlist context sit in the column header.
export function WeekView({ days, todayISO, leaveByDay, waitingByDay, dayHref }: WeekViewProps) {
  const dates = Object.keys(days);
  return (
    <div className="overflow-x-auto lunia-card p-2 sm:p-3" data-testid="week-view">
      <div className="grid min-w-[52rem] grid-cols-7 gap-1.5">
        {dates.map((d) => {
          const rows = days[d] ?? [];
          const isToday = d === todayISO;
          const off = leaveByDay[d] ?? [];
          const waiting = waitingByDay[d] ?? 0;
          return (
            <div key={d} className={`flex min-h-[18rem] flex-col gap-1 rounded-[var(--radius-sm)] border p-1.5 ${isToday ? "border-[var(--color-teal)] bg-[var(--color-teal)]/[0.05]" : "border-[var(--line)] bg-[var(--surface)]"}`} data-date={d}>
              <Link href={dayHref(d)} className="flex items-center justify-between gap-1 rounded-[var(--radius-sm)] px-1.5 py-1 text-xs font-semibold text-[var(--color-ink)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)]">
                <span className={isToday ? "rounded-full bg-[var(--color-ink)] px-2 py-0.5 text-[var(--color-cream)]" : ""}>{headFmt.format(new Date(`${d}T00:00:00Z`))}</span>
                <span className="text-[0.65rem] font-medium text-[var(--color-ink)]/45">{rows.length}</span>
              </Link>
              {(off.length > 0 || waiting > 0) && (
                <div className="flex flex-wrap gap-1 px-1">
                  {off.length > 0 && (
                    <span className="rounded-full bg-[var(--color-ink)]/[0.07] px-1.5 py-0.5 text-[0.6rem] text-[var(--color-ink)]/60" title={off.join(", ")}>
                      {off.length === 1 ? `${off[0]} off` : `${off.length} off`}
                    </span>
                  )}
                  {waiting > 0 && (
                    <Link href="/admin/waitlist?status=WAITING" className="rounded-full bg-[var(--color-gold)]/25 px-1.5 py-0.5 text-[0.6rem] font-medium text-[#7c6a2f] hover:underline">
                      {waiting} waiting
                    </Link>
                  )}
                </div>
              )}
              <ul className="flex flex-col gap-1">
                {rows.map((r) => (
                  <li key={r.appointmentId}>
                    <Link
                      href={dayHref(d)}
                      className={`flex items-center justify-between gap-1 rounded-[var(--radius-sm)] border border-[var(--line)] border-s-2 bg-[var(--surface)] px-1.5 py-1 text-[0.68rem] leading-tight transition-colors duration-150 ease-out hover:bg-[var(--surface-2)] ${STATUS_ACCENT[r.status] ?? ""} ${r.status === "CANCELLED" || r.status === "NO_SHOW" ? "opacity-60" : ""}`}
                      title={`${timeFmt.format(r.startAt)} ${r.clientName} · ${r.serviceName} · ${r.staffName}`}
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-semibold tabular-nums text-[var(--color-ink)]">{timeFmt.format(r.startAt)}</span>{" "}
                        <span className="text-[var(--color-ink)]/80">{r.clientName}</span>
                      </span>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${(STATUS_PILL[r.status] ?? "").split(" ")[0]}`} aria-label={r.status.replace("_", " ")} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
