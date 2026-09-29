import Link from "next/link";
import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listDayAppointments, listMonthAppointments, listWeekAppointments, listStaffOptions, shiftDateISO, weekDaysFor } from "@/modules/booking/bookings";
import { getFrontDeskServices } from "@/modules/booking/serviceSettings";
import { listRooms } from "@/modules/booking/rooms";
import { countWaitingByDay } from "@/modules/booking/waitlist";
import { utcToCenterLocal, centerLocalToUtc, weekdayForDateISO } from "@/modules/booking/availability";
import { staffOnApprovedLeave } from "@/modules/hr/leave";
import { getSetting } from "@/modules/cms/settings";
import { MonthView } from "./MonthView";
import { DaySchedule } from "./DaySchedule";
import { DayModal } from "./DayModal";
import { DayGrid, type GridColumn } from "./DayGrid";
import { WeekView } from "./WeekView";
import { WalkInForm, type FrontDeskServiceDTO } from "./WalkInForm";

interface CalendarPageProps {
  searchParams: Promise<{ view?: string; day?: string; staffUserId?: string; month?: string; name?: string; phone?: string; add?: string; cols?: string; at?: string }>;
}

const DATE_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_ISO_PATTERN = /^\d{4}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const VIEWS = ["month", "week", "day"] as const;
type View = (typeof VIEWS)[number];

const CENTER_TZ = "Asia/Riyadh";
const longDateFmt = new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortFmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", day: "numeric", month: "short" });
const HOURS_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function qs(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const user = await requireAdmin(PERMISSIONS.BOOKING_VIEW);
  const canManage = user.permissions.has(PERMISSIONS.BOOKING_MANAGE);
  const canBill = user.permissions.has(PERMISSIONS.BILLING_MANAGE);
  const canClinical = user.permissions.has(PERMISSIONS.CLINICAL_MANAGE);

  const params = await searchParams;
  const todayISO = utcToCenterLocal(new Date()).dateISO;
  // A prefilled "new booking" deep-link (name/phone from a customer page) opens
  // today's modal even without an explicit day param.
  const prefillName = (params.name ?? "").slice(0, 120);
  const prefillPhone = (params.phone ?? "").slice(0, 40);
  const hasPrefill = Boolean(prefillName || prefillPhone);
  const view: View = (VIEWS as readonly string[]).includes(params.view ?? "") ? (params.view as View) : "month";
  const dayParam = params.day && DATE_ISO_PATTERN.test(params.day) ? params.day : null;
  const dayOpen = dayParam ?? (hasPrefill ? todayISO : null);
  const focusDay = dayOpen ?? todayISO;
  const addOpen = hasPrefill || params.add === "1";
  const month = params.month && MONTH_ISO_PATTERN.test(params.month) ? params.month : focusDay.slice(0, 7);
  const staffUserId = params.staffUserId ?? "";
  const cols: "staff" | "room" = params.cols === "room" ? "room" : "staff";
  const at = params.at && TIME_PATTERN.test(params.at) ? params.at : "";
  const preferredStartAt = at ? centerLocalToUtc(focusDay, toMin(at)).toISOString() : undefined;

  const weekDays = view === "week" ? weekDaysFor(focusDay) : [];

  const [monthDays, staffOptions, frontDeskServices, dayRows, weekRows, rooms, hours, leaveToday, leaveWeek, waitingWeek] = await Promise.all([
    view === "month" ? listMonthAppointments(month, staffUserId || undefined) : Promise.resolve({}),
    listStaffOptions(),
    canManage ? getFrontDeskServices() : Promise.resolve([]),
    dayOpen || view === "day" ? listDayAppointments(focusDay, staffUserId || undefined) : Promise.resolve([]),
    view === "week" ? listWeekAppointments(focusDay, staffUserId || undefined) : Promise.resolve({}),
    view === "day" && cols === "room" ? listRooms() : Promise.resolve([]),
    getSetting("hours").catch(() => null),
    view === "day" ? staffOnApprovedLeave(focusDay) : Promise.resolve(new Set<string>()),
    view === "week" ? Promise.all(weekDays.map((d) => staffOnApprovedLeave(d))) : Promise.resolve([]),
    view === "week" ? countWaitingByDay(weekDays) : Promise.resolve({}),
  ]);

  const walkInServices: FrontDeskServiceDTO[] = frontDeskServices.map((service) => ({
    id: service.id,
    name: service.nameEn,
    departmentName: service.department.nameEn,
    durationMin: service.durationMin,
  }));
  const staffName = new Map(staffOptions.map((s) => [s.id, s.name]));

  const dayHours = hours ? hours[HOURS_KEYS[weekdayForDateISO(focusDay)]!] : null;
  const gridHours = dayHours && !dayHours.closed ? { openMin: toMin(dayHours.open), closeMin: toMin(dayHours.close) } : null;

  const gridColumns: GridColumn[] =
    cols === "room"
      ? rooms.map((r) => ({ id: r.id, name: r.name }))
      : staffOptions.filter((s) => !staffUserId || s.id === staffUserId).map((s) => ({ id: s.id, name: s.name, onLeave: leaveToday.has(s.id) }));

  const leaveByDay: Record<string, string[]> = Object.fromEntries(weekDays.map((d, i) => [d, [...(leaveWeek[i] ?? [])].map((id) => staffName.get(id) ?? "Staff")]));

  const base = { view: view === "month" ? undefined : view, staffUserId: staffUserId || undefined, cols: cols === "room" ? "room" : undefined };
  const closeHref = qs({ ...base, month });
  const viewHref = (v: View) => qs({ view: v === "month" ? undefined : v, day: v === "month" ? undefined : focusDay, month: v === "month" ? month : undefined, staffUserId: staffUserId || undefined });
  const staffHref = (id: string) => qs({ ...base, staffUserId: id || undefined, day: view === "month" ? dayParam ?? undefined : focusDay, month: view === "month" ? month : undefined });
  const dayHref = (d: string) => qs({ view: "day", day: d, staffUserId: staffUserId || undefined, cols: base.cols });
  const gapHref = (columnId: string, hhmm: string) => qs({ view: "day", day: focusDay, staffUserId: cols === "staff" ? columnId : staffUserId || undefined, cols: base.cols, add: "1", at: hhmm });

  const prevHref = view === "week" ? qs({ ...base, day: shiftDateISO(focusDay, -7) }) : qs({ ...base, day: shiftDateISO(focusDay, -1) });
  const nextHref = view === "week" ? qs({ ...base, day: shiftDateISO(focusDay, 7) }) : qs({ ...base, day: shiftDateISO(focusDay, 1) });
  const titleFor = view === "day" ? longDateFmt.format(new Date(`${focusDay}T12:00:00Z`)) : view === "week" ? `${shortFmt.format(new Date(`${weekDays[0]}T00:00:00Z`))} – ${shortFmt.format(new Date(`${weekDays[6]}T00:00:00Z`))}` : "";

  const chip = (active: boolean) =>
    `inline-flex min-h-9 items-center rounded-full px-3 py-1 text-sm transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] ${
      active ? "bg-[var(--color-ink)] text-[var(--color-cream)]" : "border border-[var(--line-strong)] text-[var(--color-ink)]/75 hover:bg-[var(--surface-2)]"
    }`;

  const walkIn = canManage && (
    <details open={addOpen} className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-2)]/40" data-testid="walk-in-details">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-[var(--color-teal-ink)]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
          <path strokeLinecap="round" d="M12 5v14M5 12h14" />
        </svg>
        Add a booking{at && ` at ${at}`}
        {at && staffUserId && staffName.get(staffUserId) && ` with ${staffName.get(staffUserId)}`}
      </summary>
      <div className="border-t border-[var(--line)] p-4">
        <WalkInForm services={walkInServices} defaultDate={focusDay} defaultName={prefillName} defaultPhone={prefillPhone} preferredStartAt={preferredStartAt} preferredStaffUserId={staffUserId || undefined} />
      </div>
    </details>
  );

  return (
    <AdminShell user={user} title="Calendar" description="Month at a glance, a week to plan, and a day to run. Every appointment links to its next step.">
      {/* Toolbar: view switch, staff chips, walk-in */}
      <div className="mb-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border border-[var(--line-strong)] p-0.5" role="group" aria-label="Calendar view">
            {VIEWS.map((v) => (
              <Link key={v} href={viewHref(v)} aria-current={view === v ? "page" : undefined} className={`inline-flex min-h-8 items-center rounded-full px-3 text-sm capitalize transition-colors duration-200 ease-out ${view === v ? "bg-[var(--color-ink)] text-[var(--color-cream)]" : "text-[var(--color-ink)]/70 hover:bg-[var(--surface-2)]"}`}>
                {v}
              </Link>
            ))}
          </div>
          {view !== "month" && (
            <div className="flex items-center gap-1">
              <Link href={prevHref} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-9" aria-label={view === "week" ? "Previous week" : "Previous day"}>
                ‹
              </Link>
              <Link href={qs({ ...base, day: todayISO })} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-9">
                Today
              </Link>
              <Link href={nextHref} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-9" aria-label={view === "week" ? "Next week" : "Next day"}>
                ›
              </Link>
              <h2 className="ms-2 font-[family-name:var(--font-display)] text-lg text-[var(--color-ink)]">{titleFor}</h2>
            </div>
          )}
          {view === "day" && (
            <div className="flex items-center gap-1 rounded-full border border-[var(--line-strong)] p-0.5" role="group" aria-label="Columns">
              {(["staff", "room"] as const).map((c) => (
                <Link key={c} href={qs({ ...base, day: focusDay, cols: c === "room" ? "room" : undefined })} aria-current={cols === c ? "page" : undefined} className={`inline-flex min-h-8 items-center rounded-full px-3 text-xs capitalize ${cols === c ? "bg-[var(--color-ink)] text-[var(--color-cream)]" : "text-[var(--color-ink)]/70 hover:bg-[var(--surface-2)]"}`}>
                  By {c}
                </Link>
              ))}
            </div>
          )}
          {canManage && (
            <Link href={qs({ ...base, month: view === "month" ? month : undefined, day: focusDay, add: "1" })} className="lunia-btn lunia-btn-forest lunia-btn-sm ms-auto min-h-9">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                <path strokeLinecap="round" d="M12 5v14M5 12h14" />
              </svg>
              Book walk-in
            </Link>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by staff" data-testid="staff-chips">
          <Link href={staffHref("")} aria-current={!staffUserId ? "page" : undefined} className={chip(!staffUserId)}>
            All staff
          </Link>
          {staffOptions.map((s) => (
            <Link key={s.id} href={staffHref(s.id)} aria-current={staffUserId === s.id ? "page" : undefined} className={chip(staffUserId === s.id)}>
              {s.name}
              {view === "day" && leaveToday.has(s.id) && <span className="ms-1.5 text-[0.62rem] uppercase opacity-70">off</span>}
            </Link>
          ))}
        </div>
      </div>

      {view === "month" && <MonthView monthISO={month} selectedDateISO={dayOpen ?? ""} todayISO={todayISO} days={monthDays} staffUserId={staffUserId || undefined} />}

      {view === "week" && <WeekView days={weekRows} todayISO={todayISO} leaveByDay={leaveByDay} waitingByDay={waitingWeek} dayHref={dayHref} />}

      {view === "day" && (
        <div className="flex flex-col gap-5">
          {dayHours?.closed && <p className="rounded-[var(--radius-sm)] bg-[var(--color-ink)]/[0.05] px-4 py-2 text-sm text-[var(--color-ink)]/65">The center is closed on this day; existing appointments are still shown.</p>}
          <DayGrid rows={dayRows} date={focusDay} todayISO={todayISO} columns={gridColumns} mode={cols} hours={gridHours} canManage={canManage} canBill={canBill} canClinical={canClinical} gapHref={gapHref} />
          {walkIn}
        </div>
      )}

      {view === "month" && dayOpen && (
        <DayModal closeHref={closeHref} title={`Schedule for ${longDateFmt.format(new Date(`${dayOpen}T12:00:00Z`))}`}>
          <div className="flex flex-col gap-5">
            <div className="flex justify-end">
              <Link href={dayHref(dayOpen)} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-9">
                Open day view
              </Link>
            </div>
            <DaySchedule rows={dayRows} date={dayOpen} canManage={canManage} canBill={canBill} canClinical={canClinical} />
            {walkIn}
          </div>
        </DayModal>
      )}
    </AdminShell>
  );
}
