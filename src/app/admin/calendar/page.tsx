import Link from "next/link";
import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listDayAppointments, listMonthAppointments, listStaffOptions } from "@/modules/booking/bookings";
import { getFrontDeskServices } from "@/modules/booking/serviceSettings";
import { utcToCenterLocal } from "@/modules/booking/availability";
import { MonthView } from "./MonthView";
import { DaySchedule } from "./DaySchedule";
import { DayModal } from "./DayModal";
import { WalkInForm, type FrontDeskServiceDTO } from "./WalkInForm";

interface CalendarPageProps {
  searchParams: Promise<{ day?: string; staffUserId?: string; month?: string; name?: string; phone?: string; add?: string }>;
}

const DATE_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_ISO_PATTERN = /^\d{4}-\d{2}$/;

const CENTER_TZ = "Asia/Riyadh";
const longDateFmt = new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });

function qs(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const user = await requireAdmin(PERMISSIONS.BOOKING_VIEW);
  const canManage = user.permissions.has(PERMISSIONS.BOOKING_MANAGE);

  const params = await searchParams;
  const todayISO = utcToCenterLocal(new Date()).dateISO;
  // A prefilled "new booking" deep-link (name/phone from a customer page) opens
  // today's modal even without an explicit day param.
  const prefillName = (params.name ?? "").slice(0, 120);
  const prefillPhone = (params.phone ?? "").slice(0, 40);
  const hasPrefill = Boolean(prefillName || prefillPhone);
  const dayOpen = params.day && DATE_ISO_PATTERN.test(params.day) ? params.day : hasPrefill ? todayISO : null;
  // The "Add a booking" section starts open when arriving to book (toolbar
  // button or a prefilled deep-link); when just viewing a day, it's collapsed.
  const addOpen = hasPrefill || params.add === "1";
  const month = params.month && MONTH_ISO_PATTERN.test(params.month) ? params.month : (dayOpen ?? todayISO).slice(0, 7);
  const staffUserId = params.staffUserId ?? "";

  const [monthDays, staffOptions, frontDeskServices, rows] = await Promise.all([
    listMonthAppointments(month, staffUserId || undefined),
    listStaffOptions(),
    canManage ? getFrontDeskServices() : Promise.resolve([]),
    dayOpen ? listDayAppointments(dayOpen, staffUserId || undefined) : Promise.resolve([]),
  ]);

  const walkInServices: FrontDeskServiceDTO[] = frontDeskServices.map((service) => ({
    id: service.id,
    name: service.nameEn,
    departmentName: service.department.nameEn,
    durationMin: service.durationMin,
  }));

  const closeHref = qs({ month, staffUserId: staffUserId || undefined });

  return (
    <AdminShell user={user} title="Calendar" description="The month at a glance, with every booked appointment. Pick a day to view or add bookings.">
      {/* Toolbar: staff filter + walk-in booking */}
      <form method="get" className="mb-5 flex flex-wrap items-center gap-3">
        <input type="hidden" name="month" value={month} />
        <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]/70">
          <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/50">Staff</span>
          <select name="staffUserId" defaultValue={staffUserId} className="lunia-input w-auto">
            <option value="">All staff</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="lunia-btn lunia-btn-ghost lunia-btn-sm">
          Filter
        </button>
        {canManage && (
          <Link href={qs({ month, day: todayISO, add: "1", staffUserId: staffUserId || undefined })} className="lunia-btn lunia-btn-forest lunia-btn-sm ms-auto">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
              <path strokeLinecap="round" d="M12 5v14M5 12h14" />
            </svg>
            Book walk-in
          </Link>
        )}
      </form>

      <MonthView monthISO={month} selectedDateISO={dayOpen ?? ""} todayISO={todayISO} days={monthDays} staffUserId={staffUserId || undefined} />

      {dayOpen && (
        <DayModal closeHref={closeHref} title={`Schedule for ${longDateFmt.format(new Date(`${dayOpen}T12:00:00Z`))}`}>
          <div className="flex flex-col gap-5">
            <DaySchedule rows={rows} date={dayOpen} canManage={canManage} />
            {canManage && (
              <details open={addOpen} className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-2)]/40">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-[var(--color-forest)]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                    <path strokeLinecap="round" d="M12 5v14M5 12h14" />
                  </svg>
                  Add a booking
                </summary>
                <div className="border-t border-[var(--line)] p-4">
                  <WalkInForm services={walkInServices} defaultDate={dayOpen} defaultName={prefillName} defaultPhone={prefillPhone} />
                </div>
              </details>
            )}
          </div>
        </DayModal>
      )}
    </AdminShell>
  );
}
