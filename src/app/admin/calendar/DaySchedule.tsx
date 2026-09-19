import type { DayAppointmentRow } from "@/modules/booking/bookings";
import { DayAppointmentItem } from "./DayAppointmentItem";

interface DayScheduleProps {
  rows: DayAppointmentRow[];
  date: string;
  canManage: boolean;
}

const CENTER_TZ = "Asia/Riyadh";
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, hour: "numeric", minute: "2-digit" });
const formatTime = (d: Date) => timeFmt.format(d);

// Compact, expandable list of a day's appointments for the day popup. Each row
// is one line (time + who + status) and opens to show details + actions.
export function DaySchedule({ rows, date, canManage }: DayScheduleProps) {
  if (rows.length === 0) {
    return (
      <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] px-4 py-6 text-center text-sm text-[var(--color-ink)]/55">
        No appointments for this day.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.appointmentId}>
          <DayAppointmentItem
            bookingId={row.bookingId}
            appointmentId={row.appointmentId}
            serviceId={row.serviceId}
            status={row.status}
            timeLabel={formatTime(row.startAt)}
            fullTimeLabel={`${formatTime(row.startAt)} to ${formatTime(row.endAt)}`}
            clientName={row.clientName}
            clientPhone={row.clientPhone}
            serviceName={row.serviceName}
            staffName={row.staffName}
            roomName={row.roomName}
            centerNote={row.centerNote}
            customerNote={row.customerNote}
            defaultDate={date}
            canManage={canManage}
          />
        </li>
      ))}
    </ul>
  );
}
