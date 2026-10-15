import type { DayAppointmentRow } from "@/modules/booking/bookings";
import { DayAppointmentItem } from "./DayAppointmentItem";
import { getStaffDisplay } from "../_i18n/display";
import { intlLocale, makeT } from "../_i18n/t";

interface DayScheduleProps {
  rows: DayAppointmentRow[];
  date: string;
  canManage: boolean;
  canBill?: boolean;
  canClinical?: boolean;
}

const CENTER_TZ = "Asia/Riyadh";

// Compact, expandable list of a day's appointments for the day popup. Each row
// is one line (time + who + status) and opens to show details + actions.
export async function DaySchedule({ rows, date, canManage, canBill = false, canClinical = false }: DayScheduleProps) {
  const { locale } = await getStaffDisplay();
  const t = makeT(locale);
  const timeFmt = new Intl.DateTimeFormat(intlLocale(locale, "en-US"), { timeZone: CENTER_TZ, hour: "numeric", minute: "2-digit" });
  const formatTime = (d: Date) => timeFmt.format(d);
  if (rows.length === 0) {
    return (
      <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] px-4 py-6 text-center text-sm text-[var(--color-ink)]/55">
        {t("No appointments for this day.")}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.appointmentId}>
          <DayAppointmentItem
            bookingId={row.bookingId}
            seriesId={row.seriesId}
            appointmentId={row.appointmentId}
            serviceId={row.serviceId}
            status={row.status}
            timeLabel={formatTime(row.startAt)}
            fullTimeLabel={t("{start} to {end}", { start: formatTime(row.startAt), end: formatTime(row.endAt) })}
            clientName={row.clientName}
            clientPhone={row.clientPhone}
            serviceName={row.serviceName}
            staffName={row.staffName}
            roomName={row.roomName}
            centerNote={row.centerNote}
            customerNote={row.customerNote}
            defaultDate={date}
            canManage={canManage}
            canBill={canBill}
            canClinical={canClinical}
            clientProfileId={row.clientProfileId}
            started={Boolean(row.startedAt)}
            invoice={row.invoice}
            treatmentRecordId={row.treatmentRecordId}
          />
        </li>
      ))}
    </ul>
  );
}
