// Read-only aggregate helpers over Booking/Appointment data, built ahead of
// the Stage-5 analytics dashboards. Pure DB reads -- no UI, no mutations,
// and nothing here is exposed as a server action (dashboards wire that up).
//
// Revenue is *realized* revenue: the sum of Appointment.priceMinorSnapshot
// for bookings whose status is COMPLETED. A booking that's merely CONFIRMED
// (or REQUESTED) hasn't happened yet and may still be rescheduled or
// cancelled, so it contributes to counts (totalBookings/byStatus/byService
// booking counts) but not to money. CANCELLED/NO_SHOW bookings likewise
// contribute zero revenue.
//
// "New" vs "returning" is derived per-booking from each client's full
// booking history -- not just the history inside [from,to) -- so a booking
// is "new-client" only if it is the very first booking that client ever
// made; otherwise it's "returning", even if their only *other* booking
// falls outside the requested range.

import { prisma } from "@/lib/db";
import type { BookingStatus, Prisma } from "@prisma/client";
import { utcToCenterLocal } from "./availability";
import { NOT_TEST_CLIENT } from "@/modules/crm/testCustomers";

export interface BookingStatsInput {
  from: Date;
  to: Date;
}

export interface DayStat {
  date: string;
  bookings: number;
  revenueMinor: number;
}

export interface ServiceStat {
  serviceId: string;
  name: string;
  bookings: number;
  revenueMinor: number;
}

export interface SourceStat {
  source: string;
  bookings: number;
}

export interface BookingStats {
  totalBookings: number;
  byStatus: Record<string, number>;
  revenueMinor: number;
  newClients: number;
  returningBookings: number;
  byDay: DayStat[];
  byService: ServiceStat[];
  bySource: SourceStat[];
}

const REALIZED_REVENUE_STATUSES: BookingStatus[] = ["COMPLETED"];

type BookingForStats = Prisma.BookingGetPayload<{ include: { appointments: true } }>;

/**
 * Aggregates bookings created in `[from, to)` (booking creation date is what
 * "acquired in this range" means -- e.g. a booking made today for a visit
 * next month is attributed to today) into the counts/revenue/breakdowns the
 * Stage-5 dashboards need.
 */
export async function bookingStats(range: BookingStatsInput): Promise<BookingStats> {
  const [stats] = await bookingStatsForRanges([range]);
  return stats!;
}

/**
 * The same aggregates for several (typically overlapping) ranges from ONE
 * booking fetch over their union plus two lookups — e.g. the business
 * dashboard's today / this week / this month / last 30 days — instead of
 * re-querying the same bookings (and every client's history) per range.
 */
export async function bookingStatsForRanges(ranges: BookingStatsInput[]): Promise<BookingStats[]> {
  if (ranges.length === 0) return [];
  const from = new Date(Math.min(...ranges.map((r) => r.from.getTime())));
  const to = new Date(Math.max(...ranges.map((r) => r.to.getTime())));
  const bookings = await prisma.booking.findMany({
    where: { createdAt: { gte: from, lt: to }, client: NOT_TEST_CLIENT },
    include: { appointments: true },
  });
  const [firstBookingIdByClient, serviceNameById] = await Promise.all([firstBookingIds(bookings), serviceNames(bookings)]);

  return ranges.map((range) => {
    const inRange = bookings.filter((b) => b.createdAt >= range.from && b.createdAt < range.to);
    const byStatus: Record<string, number> = {};
    for (const booking of inRange) {
      byStatus[booking.status] = (byStatus[booking.status] ?? 0) + 1;
    }
    const { newClients, returningBookings } = classifyNewVsReturning(inRange, firstBookingIdByClient);
    return {
      totalBookings: inRange.length,
      byStatus,
      revenueMinor: inRange.reduce((sum, b) => sum + bookingRevenue(b), 0),
      newClients,
      returningBookings,
      byDay: buildByDay(inRange),
      byService: buildByService(inRange, serviceNameById),
      bySource: buildBySource(inRange),
    };
  });
}

function isRealized(status: BookingStatus): boolean {
  return REALIZED_REVENUE_STATUSES.includes(status);
}

function bookingRevenue(booking: BookingForStats): number {
  if (!isRealized(booking.status)) return 0;
  return booking.appointments.reduce((sum, a) => sum + a.priceMinorSnapshot, 0);
}

/**
 * Each client's true earliest booking (any date), one row per client — not
 * their whole history. Ties on createdAt break by id so the answer is stable.
 */
async function firstBookingIds(bookings: BookingForStats[]): Promise<Map<string, string>> {
  const clientProfileIds = [...new Set(bookings.map((b) => b.clientProfileId))];
  if (clientProfileIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ clientProfileId: string; id: string }[]>`
    SELECT DISTINCT ON ("clientProfileId") "clientProfileId", "id"
    FROM "Booking"
    WHERE "clientProfileId" = ANY(${clientProfileIds})
    ORDER BY "clientProfileId", "createdAt" ASC, "id" ASC`;
  return new Map(rows.map((r) => [r.clientProfileId, r.id]));
}

async function serviceNames(bookings: BookingForStats[]): Promise<Map<string, string>> {
  const serviceIds = [...new Set(bookings.flatMap((b) => b.appointments.map((a) => a.serviceId)))];
  if (serviceIds.length === 0) return new Map();
  const services = await prisma.service.findMany({ where: { id: { in: serviceIds } }, select: { id: true, nameEn: true } });
  return new Map(services.map((s) => [s.id, s.nameEn]));
}

/**
 * Classifies each in-range booking as "new" (it IS that client's earliest
 * booking ever) or "returning" (it isn't).
 */
function classifyNewVsReturning(
  bookings: BookingForStats[],
  firstBookingIdByClient: Map<string, string>,
): { newClients: number; returningBookings: number } {
  let newClients = 0;
  for (const booking of bookings) {
    if (firstBookingIdByClient.get(booking.clientProfileId) === booking.id) {
      newClients += 1;
    }
  }
  return { newClients, returningBookings: bookings.length - newClients };
}

function buildByDay(bookings: BookingForStats[]): DayStat[] {
  const byDate = new Map<string, DayStat>();
  for (const booking of bookings) {
    const { dateISO } = utcToCenterLocal(booking.createdAt);
    const entry = byDate.get(dateISO) ?? { date: dateISO, bookings: 0, revenueMinor: 0 };
    entry.bookings += 1;
    entry.revenueMinor += bookingRevenue(booking);
    byDate.set(dateISO, entry);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function buildByService(bookings: BookingForStats[], nameById: Map<string, string>): ServiceStat[] {
  const byService = new Map<string, { bookings: number; revenueMinor: number }>();
  for (const booking of bookings) {
    for (const appointment of booking.appointments) {
      const entry = byService.get(appointment.serviceId) ?? { bookings: 0, revenueMinor: 0 };
      entry.bookings += 1;
      entry.revenueMinor += isRealized(booking.status) ? appointment.priceMinorSnapshot : 0;
      byService.set(appointment.serviceId, entry);
    }
  }

  const serviceIds = [...byService.keys()];
  return serviceIds
    .map((serviceId) => {
      const entry = byService.get(serviceId)!;
      return {
        serviceId,
        name: nameById.get(serviceId) ?? "Unknown service",
        bookings: entry.bookings,
        revenueMinor: entry.revenueMinor,
      };
    })
    .sort((a, b) => b.revenueMinor - a.revenueMinor || b.bookings - a.bookings);
}

function buildBySource(bookings: BookingForStats[]): SourceStat[] {
  const bySource = new Map<string, number>();
  for (const booking of bookings) {
    const source = booking.sourceChannel ?? "direct";
    bySource.set(source, (bySource.get(source) ?? 0) + 1);
  }
  return [...bySource.entries()]
    .map(([source, count]) => ({ source, bookings: count }))
    .sort((a, b) => b.bookings - a.bookings);
}

/**
 * Counts appointments still ahead of `now` whose booking is still "live"
 * (CONFIRMED or CHECKED_IN -- i.e. not yet completed, and not cancelled or a
 * no-show). Used by the business dashboard's "upcoming" stat; independent of
 * any [from,to) window since it's a look-ahead, not a period aggregate.
 */
export async function upcomingAppointmentsCount(now: Date = new Date()): Promise<number> {
  return prisma.appointment.count({
    where: {
      startAt: { gte: now },
      booking: { status: { in: ["CONFIRMED", "CHECKED_IN"] }, client: NOT_TEST_CLIENT },
    },
  });
}
