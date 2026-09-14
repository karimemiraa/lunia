import type { DayAppointmentRow } from "@/modules/booking/bookings";
import { AppointmentActions } from "./AppointmentActions";

interface DayViewProps {
  rows: DayAppointmentRow[];
  date: string;
  canManage: boolean;
}

/** Asia/Riyadh is fixed at UTC+3 year-round (no DST) — see availability.ts. */
const CENTER_TZ = "Asia/Riyadh";

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, hour: "numeric", minute: "2-digit" }).format(date);
}

const STATUS_STYLES: Record<string, string> = {
  REQUESTED: "bg-[var(--color-ink)]/10 text-[var(--color-ink)]/70",
  CONFIRMED: "bg-[var(--color-teal)]/20 text-[var(--color-ink)]",
  CHECKED_IN: "bg-[var(--color-gold)]/25 text-[var(--color-ink)]",
  COMPLETED: "bg-[var(--color-canopy)]/25 text-[var(--color-ink)]",
  CANCELLED: "bg-red-100 text-red-700",
  NO_SHOW: "bg-red-100 text-red-700",
};

// Read-only day table: one row per appointment, already sorted by start
// time (listDayAppointments). Actions live in the client component
// AppointmentActions so this component itself needs no interactivity.
export function DayView({ rows, date, canManage }: DayViewProps) {
  if (rows.length === 0) {
    return (
      <p className="rounded border border-dashed border-[var(--color-ink)]/20 px-4 py-8 text-center text-sm text-[var(--color-ink)]/60">
        No appointments for this day.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto lunia-card">
      <table className="w-full text-left text-sm">
        <thead className="bg-[var(--color-cream)]/60">
          <tr>
            <th className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">Time</th>
            <th className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">Client</th>
            <th className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">Service</th>
            <th className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">Staff</th>
            <th className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">Room</th>
            <th className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">Status</th>
            {canManage && <th className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.appointmentId}
              className="border-t border-[var(--color-ink)]/10 align-top"
              data-testid="appointment-row"
              data-booking-id={row.bookingId}
              data-booking-status={row.status}
            >
              <td className="whitespace-nowrap px-4 py-3 font-medium text-[var(--color-ink)]">
                {formatTime(row.startAt)}&ndash;{formatTime(row.endAt)}
              </td>
              <td className="px-4 py-3 text-[var(--color-ink)]">
                <div className="flex flex-col">
                  <span>{row.clientName}</span>
                  {row.clientPhone && <span className="text-xs text-[var(--color-ink)]/60">{row.clientPhone}</span>}
                </div>
              </td>
              <td className="px-4 py-3 text-[var(--color-ink)]">{row.serviceName}</td>
              <td className="px-4 py-3 text-[var(--color-ink)]">{row.staffName}</td>
              <td className="px-4 py-3 text-[var(--color-ink)]">{row.roomName}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${
                    STATUS_STYLES[row.status] ?? "bg-[var(--color-ink)]/10 text-[var(--color-ink)]/70"
                  }`}
                >
                  {row.status.replace("_", " ")}
                </span>
              </td>
              {canManage && (
                <td className="px-4 py-3">
                  <AppointmentActions
                    bookingId={row.bookingId}
                    appointmentId={row.appointmentId}
                    serviceId={row.serviceId}
                    status={row.status}
                    defaultDate={date}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
