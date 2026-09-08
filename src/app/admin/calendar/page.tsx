import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listDayAppointments, listStaffOptions } from "@/modules/booking/bookings";
import { getFrontDeskServices } from "@/modules/booking/serviceSettings";
import { utcToCenterLocal } from "@/modules/booking/availability";
import { CalendarFilters } from "./CalendarFilters";
import { DayView } from "./DayView";
import { WalkInForm, type FrontDeskServiceDTO } from "./WalkInForm";

interface CalendarPageProps {
  searchParams: Promise<{ date?: string; staffUserId?: string }>;
}

const DATE_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const user = await requireAdmin(PERMISSIONS.BOOKING_VIEW);
  const canManage = user.permissions.has(PERMISSIONS.BOOKING_MANAGE);

  const params = await searchParams;
  const todayISO = utcToCenterLocal(new Date()).dateISO;
  const date = params.date && DATE_ISO_PATTERN.test(params.date) ? params.date : todayISO;
  const staffUserId = params.staffUserId ?? "";

  const [rows, staffOptions, frontDeskServices] = await Promise.all([
    listDayAppointments(date, staffUserId || undefined),
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
    <AdminShell user={user} title="Calendar" description="Today's in-center schedule, check-ins, and walk-in bookings.">
      <CalendarFilters date={date} staffUserId={staffUserId} staffOptions={staffOptions} todayISO={todayISO} />

      {canManage && (
        <div className="mb-8 max-w-2xl">
          <WalkInForm services={walkInServices} defaultDate={date} />
        </div>
      )}

      <DayView rows={rows} date={date} canManage={canManage} />
    </AdminShell>
  );
}
