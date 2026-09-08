// Client lifetime-value (LTV) computation and caching. LTV is the sum of
// Appointment.priceMinorSnapshot across every COMPLETED booking for a
// client -- a booking that's merely CONFIRMED/CHECKED_IN hasn't happened
// (and may still be rescheduled/cancelled), and CANCELLED/NO_SHOW bookings
// never contribute revenue. This mirrors the "realized revenue" definition
// already used by src/modules/booking/stats.ts.
//
// ClientProfile.ltvCacheMinor is a denormalized cache of computeClientLtvMinor,
// kept fresh by calling refreshClientLtv whenever a booking completes (wired
// into bookings.ts's `complete()`), so list views can read it directly
// without recomputing an aggregate per row.

import { prisma } from "@/lib/db";

/** Recomputes a client's LTV from scratch: sum of priceMinorSnapshot across their COMPLETED bookings' appointments. */
export async function computeClientLtvMinor(clientProfileId: string): Promise<number> {
  const result = await prisma.appointment.aggregate({
    _sum: { priceMinorSnapshot: true },
    where: { booking: { clientProfileId, status: "COMPLETED" } },
  });
  return result._sum.priceMinorSnapshot ?? 0;
}

/** Recomputes and persists a client's LTV cache, returning the freshly computed value. */
export async function refreshClientLtv(clientProfileId: string): Promise<number> {
  const ltvMinor = await computeClientLtvMinor(clientProfileId);
  await prisma.clientProfile.update({ where: { id: clientProfileId }, data: { ltvCacheMinor: ltvMinor } });
  return ltvMinor;
}

export interface TopClientLtv {
  clientProfileId: string;
  fullName: string;
  ltvMinor: number;
}

/** Top clients by cached LTV, highest first. Reads the cache (not a live recompute). */
export async function topClientsByLtv(limit = 10): Promise<TopClientLtv[]> {
  const profiles = await prisma.clientProfile.findMany({
    orderBy: { ltvCacheMinor: "desc" },
    take: limit,
  });
  return profiles.map((p) => ({ clientProfileId: p.id, fullName: p.fullName, ltvMinor: p.ltvCacheMinor }));
}
