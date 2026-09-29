// "Today" command-center data for the staff dashboard. Read-only assembly
// over the booking, HR, billing and notification modules -- each block is
// gated on the viewer's permissions and omitted (null) when they can't see
// it, so the page never renders a number the sidebar would hide.

import { prisma } from "@/lib/db";
import { PERMISSIONS, type PermissionKey } from "@/modules/iam/permissions";
import { centerLocalToUtc, utcToCenterLocal, weekdayForDateISO } from "@/modules/booking/availability";
import { listDayAppointments, listMonthAppointments, type DayAppointmentRow } from "@/modules/booking/bookings";
import { getSetting } from "@/modules/cms/settings";
import { NOT_TEST_CLIENT } from "@/modules/crm/testCustomers";
import { NOTIFICATION_TYPE_HREF, NOTIFICATION_TYPE_LABELS, type NotificationFeed, type NotificationType } from "@/modules/notifications/feed";

const DAY_MS = 86_400_000;
const HOURS_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export interface ClockedInStaff {
  userId: string;
  name: string;
  since: Date;
}

export interface NowStrip {
  clockedIn: ClockedInStaff[];
  roomsInUse: number;
  roomsTotal: number;
  /** Appointments happening right now (checked in or confirmed). */
  inProgress: number;
}

export interface AttentionCard {
  type: NotificationType;
  label: string;
  count: number;
  href: string;
  tone: "danger" | "warning" | "info";
}

export interface TodayKpis {
  /** Payments received today (BILLING/ANALYTICS). */
  revenueTodayMinor: number | null;
  appointmentsToday: number | null;
  newCustomersToday: number | null;
  /** Booked room-minutes over open room-minutes, 0-100 (null when closed). */
  occupancyPct: number | null;
}

export interface WeekDay {
  dateISO: string;
  weekday: string;
  dayOfMonth: number;
  count: number;
  isToday: boolean;
  closed: boolean;
}

export interface SparkPoint {
  dateISO: string;
  label: string;
  appointments: number;
}

export interface TodayDashboard {
  todayISO: string;
  now: NowStrip;
  arrivals: DayAppointmentRow[] | null;
  attention: AttentionCard[];
  kpis: TodayKpis;
  week: WeekDay[] | null;
  spark: SparkPoint[] | null;
}

const ATTENTION_TONE: Partial<Record<NotificationType, AttentionCard["tone"]>> = {
  callback: "warning",
  invoice: "danger",
  stock: "warning",
  leave: "info",
  inquiry: "info",
  whatsapp: "info",
  document: "danger",
};

/** Attention cards from the notification feed's true per-type counts. */
export function attentionCards(feed: NotificationFeed): AttentionCard[] {
  const order: NotificationType[] = ["callback", "invoice", "stock", "leave", "inquiry", "whatsapp", "document"];
  return order
    .map((type) => ({ type, count: feed.counts[type] ?? 0 }))
    .filter((c) => c.count > 0)
    .map(({ type, count }) => ({
      type,
      count,
      label: NOTIFICATION_TYPE_LABELS[type],
      href: NOTIFICATION_TYPE_HREF[type],
      tone: ATTENTION_TONE[type] ?? "info",
    }));
}

/** Rooms occupied right now + staff currently clocked in. */
export async function nowStrip(now: Date, todayISO: string, canSeeBookings: boolean): Promise<NowStrip> {
  const [clockedIn, roomsTotal, live] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { dateISO: todayISO, clockOutAt: null },
      include: { user: { select: { email: true, staffProfile: { select: { fullName: true } } } } },
      orderBy: { clockInAt: "asc" },
    }),
    prisma.room.count({ where: { isActive: true } }),
    canSeeBookings
      ? prisma.appointment.findMany({
          where: { startAt: { lte: now }, endAt: { gt: now }, booking: { status: { in: ["CONFIRMED", "CHECKED_IN"] } } },
          select: { roomId: true },
        })
      : Promise.resolve([]),
  ]);
  return {
    clockedIn: clockedIn.map((r) => ({ userId: r.userId, name: r.user.staffProfile?.fullName || r.user.email || "Staff", since: r.clockInAt })),
    roomsTotal,
    roomsInUse: new Set(live.map((a) => a.roomId)).size,
    inProgress: live.length,
  };
}

function parseHm(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Booked minutes over (active rooms x open minutes) for the day; null when closed/unknown. */
export function occupancyPercent(rows: DayAppointmentRow[], roomsTotal: number, openMin: number | null): number | null {
  if (!openMin || openMin <= 0 || roomsTotal <= 0) return null;
  const booked = rows
    .filter((r) => r.status !== "CANCELLED" && r.status !== "NO_SHOW")
    .reduce((sum, r) => sum + Math.max(0, (r.endAt.getTime() - r.startAt.getTime()) / 60_000), 0);
  return Math.min(100, Math.round((booked / (roomsTotal * openMin)) * 100));
}

async function openMinutesFor(dateISO: string): Promise<number | null> {
  const hours = await getSetting("hours").catch(() => null);
  if (!hours) return null;
  const day = hours[HOURS_KEY[weekdayForDateISO(dateISO)]!];
  if (!day || day.closed) return null;
  return parseHm(day.close) - parseHm(day.open);
}

function addDaysISO(dateISO: string, days: number): string {
  return utcToCenterLocal(new Date(centerLocalToUtc(dateISO, 720).getTime() + days * DAY_MS)).dateISO;
}

const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", weekday: "short" });

/** Sunday-to-Saturday strip around today with appointment counts per day. */
export async function weekStrip(todayISO: string): Promise<WeekDay[]> {
  const sundayISO = addDaysISO(todayISO, -weekdayForDateISO(todayISO));
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(sundayISO, i));
  const months = [...new Set(days.map((d) => d.slice(0, 7)))];
  const [hours, ...cells] = await Promise.all([getSetting("hours").catch(() => null), ...months.map((m) => listMonthAppointments(m))]);
  const merged = Object.assign({}, ...cells) as Record<string, { count: number }>;
  return days.map((dateISO) => {
    const key = HOURS_KEY[weekdayForDateISO(dateISO)]!;
    return {
      dateISO,
      weekday: weekdayFmt.format(centerLocalToUtc(dateISO, 720)),
      dayOfMonth: Number(dateISO.slice(8, 10)),
      count: merged[dateISO]?.count ?? 0,
      isToday: dateISO === todayISO,
      closed: hours ? Boolean(hours[key]?.closed) : false,
    };
  });
}

/** Appointments per day for the last 7 days (today included), excluding cancellations. */
export async function sparkline(todayISO: string): Promise<SparkPoint[]> {
  const startISO = addDaysISO(todayISO, -6);
  const from = centerLocalToUtc(startISO, 0);
  const to = centerLocalToUtc(todayISO, 1440);
  const rows = await prisma.appointment.findMany({
    where: { startAt: { gte: from, lt: to }, booking: { status: { notIn: ["CANCELLED", "NO_SHOW"] }, client: NOT_TEST_CLIENT } },
    select: { startAt: true },
  });
  const counts = new Map<string, number>();
  for (const r of rows) {
    const d = utcToCenterLocal(r.startAt).dateISO;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return Array.from({ length: 7 }, (_, i) => {
    const dateISO = addDaysISO(startISO, i);
    return { dateISO, label: weekdayFmt.format(centerLocalToUtc(dateISO, 720)), appointments: counts.get(dateISO) ?? 0 };
  });
}

export async function revenueCollectedToday(todayISO: string): Promise<number> {
  const agg = await prisma.payment.aggregate({
    _sum: { amountMinor: true },
    where: { status: "COMPLETED", receivedAt: { gte: centerLocalToUtc(todayISO, 0), lt: centerLocalToUtc(todayISO, 1440) } },
  });
  return agg._sum.amountMinor ?? 0;
}

export async function newCustomersToday(todayISO: string): Promise<number> {
  return prisma.clientProfile.count({
    where: { createdAt: { gte: centerLocalToUtc(todayISO, 0), lt: centerLocalToUtc(todayISO, 1440) }, ...NOT_TEST_CLIENT },
  });
}

export interface TodayViewer {
  permissions: Set<PermissionKey>;
}

export async function getTodayDashboard(viewer: TodayViewer, feed: NotificationFeed, now: Date = new Date()): Promise<TodayDashboard> {
  const p = viewer.permissions;
  const todayISO = utcToCenterLocal(now).dateISO;
  const canBookings = p.has(PERMISSIONS.BOOKING_VIEW);
  const canMoney = p.has(PERMISSIONS.BILLING_MANAGE) || p.has(PERMISSIONS.ACCOUNTING_MANAGE) || p.has(PERMISSIONS.ANALYTICS_VIEW);
  const canCustomers = p.has(PERMISSIONS.CLIENT_VIEW) || p.has(PERMISSIONS.ANALYTICS_VIEW);

  const [arrivals, now_, week, spark, revenue, newCustomers, openMin] = await Promise.all([
    canBookings ? listDayAppointments(todayISO) : Promise.resolve(null),
    nowStrip(now, todayISO, canBookings),
    canBookings ? weekStrip(todayISO) : Promise.resolve(null),
    canBookings ? sparkline(todayISO) : Promise.resolve(null),
    canMoney ? revenueCollectedToday(todayISO) : Promise.resolve(null),
    canCustomers ? newCustomersToday(todayISO) : Promise.resolve(null),
    canBookings ? openMinutesFor(todayISO) : Promise.resolve(null),
  ]);

  const liveArrivals = arrivals?.filter((a) => a.status !== "CANCELLED" && a.status !== "NO_SHOW") ?? null;

  return {
    todayISO,
    now: now_,
    arrivals,
    attention: attentionCards(feed),
    kpis: {
      revenueTodayMinor: revenue,
      appointmentsToday: liveArrivals ? liveArrivals.length : null,
      newCustomersToday: newCustomers,
      occupancyPct: arrivals ? occupancyPercent(arrivals, now_.roomsTotal, openMin) : null,
    },
    week,
    spark,
  };
}
