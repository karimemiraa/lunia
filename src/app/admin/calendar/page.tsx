import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listDayAppointments, listMonthAppointments, listStaffOptions } from "@/modules/booking/bookings";
import { getFrontDeskServices } from "@/modules/booking/serviceSettings";
import { utcToCenterLocal } from "@/modules/booking/availability";
import { CalendarFilters } from "./CalendarFilters";
import { MonthView } from "./MonthView";
import { DayView } from "./DayView";
import { WalkInForm, type FrontDeskServiceDTO } from "./WalkInForm";

interface CalendarPageProps {
  searchParams: Promise<{ date?: string; staffUserId?: string; month?: string }>;
}

const DATE_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_ISO_PATTERN = /^\d{4}-\d{2}$/;

const CENTER_TZ = "Asia/Riyadh";
const longDateFmt = new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const user = await requireAdmin(PERMISSIONS.BOOKING_VIEW);
  const canManage = user.permissions.has(PERMISSIONS.BOOKING_MANAGE);

  const params = await searchParams;
  const todayISO = utcToCenterLocal(new Date()).dateISO;
  const date = params.date && DATE_ISO_PATTERN.test(params.date) ? params.date : todayISO;
  const month = params.month && MONTH_ISO_PATTERN.test(params.month) ? params.month : date.slice(0, 7);
  const staffUserId = params.staffUserId ?? "";

  const [rows, monthDays, staffOptions, frontDeskServices] = await Promise.all([
    listDayAppointments(date, staffUserId || undefined),
    listMonthAppointments(month, staffUserId || undefined),
    listStaffOptions(),
    canManage ? getFrontDeskServices() : Promise.resolve([]),
  ]);

  const walkInServices: FrontDeskServiceDTO[] = frontDeskServices.map((service) => ({
    id: service.id,
    name: service.nameEn,
    departmentName: service.department.nameEn,
    durationMin: service.durationMin,
  }));

  return (
    <AdminShell user={user} title="Calendar" description="The month at a glance, with every booked appointment. Pick a day to see its full schedule.">
      <CalendarFilters date={date} staffUserId={staffUserId} staffOptions={staffOptions} todayISO={todayISO} />

      <MonthView monthISO={month} selectedDateISO={date} todayISO={todayISO} days={monthDays} staffUserId={staffUserId || undefined} />

      {canManage && (
        <div className="mb-8 max-w-2xl">
          <WalkInForm services={walkInServices} defaultDate={date} />
        </div>
      )}

      <h2 className="mb-3 font-[family-name:var(--font-display)] text-xl text-[var(--color-ink)]">
        Schedule for {longDateFmt.format(new Date(`${date}T12:00:00Z`))}
      </h2>
      <DayView rows={rows} date={date} canManage={canManage} />
    </AdminShell>
  );
}
