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
export async function bookingStats({ from, to }: BookingStatsInput): Promise<BookingStats> {
  const bookings = await prisma.booking.findMany({
    where: { createdAt: { gte: from, lt: to } },
    include: { appointments: true },
  });

  const byStatus: Record<string, number> = {};
  for (const booking of bookings) {
    byStatus[booking.status] = (byStatus[booking.status] ?? 0) + 1;
  }

  const { newClients, returningBookings } = await classifyNewVsReturning(bookings);

  return {
    totalBookings: bookings.length,
    byStatus,
    revenueMinor: bookings.reduce((sum, b) => sum + bookingRevenue(b), 0),
    newClients,
    returningBookings,
    byDay: buildByDay(bookings),
    byService: await buildByService(bookings),
    bySource: buildBySource(bookings),
  };
}

function isRealized(status: BookingStatus): boolean {
  return REALIZED_REVENUE_STATUSES.includes(status);
}

function bookingRevenue(booking: BookingForStats): number {
  if (!isRealized(booking.status)) return 0;
  return booking.appointments.reduce((sum, a) => sum + a.priceMinorSnapshot, 0);
}

/**
 * For every distinct client represented in `bookings`, looks up that
 * client's ENTIRE booking history (any date) to find their true earliest
 * booking, then classifies each in-range booking as "new" (it IS that
 * earliest booking) or "returning" (it isn't).
 */
async function classifyNewVsReturning(
  bookings: BookingForStats[],
): Promise<{ newClients: number; returningBookings: number }> {
  if (bookings.length === 0) return { newClients: 0, returningBookings: 0 };

  const clientProfileIds = [...new Set(bookings.map((b) => b.clientProfileId))];
  const history = await prisma.booking.findMany({
    where: { clientProfileId: { in: clientProfileIds } },
    select: { id: true, clientProfileId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const firstBookingIdByClient = new Map<string, string>();
  for (const row of history) {
    if (!firstBookingIdByClient.has(row.clientProfileId)) {
      firstBookingIdByClient.set(row.clientProfileId, row.id);
    }
  }

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

async function buildByService(bookings: BookingForStats[]): Promise<ServiceStat[]> {
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
  if (serviceIds.length === 0) return [];

  const services = await prisma.service.findMany({ where: { id: { in: serviceIds } } });
  const nameById = new Map(services.map((s) => [s.id, s.nameEn]));

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
