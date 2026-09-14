// Client roster and detail views for the CRM admin: search/filter listing,
// a single-client detail page (profile + tier + LTV + booking history +
// visit notes), and tier assignment. All read paths here batch their
// lookups (client ids -> one bookings query, one membership/tier join)
// rather than querying per row, following the same pattern as
// booking/bookings.ts's listDayAppointments and booking/stats.ts.

import { prisma } from "@/lib/db";
import type { Prisma, ClientProfile, MembershipTier, BookingStatus } from "@prisma/client";
import { listVisitNotes, type VisitNoteWithAuthor } from "@/modules/crm/visitNotes";

export interface ListClientsFilter {
  search?: string;
  tierKey?: string;
  source?: string;
}

// Lifecycle status derived from visit history:
// - "new":    has never completed a visit yet
// - "active": completed a visit within the last ACTIVE_WINDOW_DAYS
// - "lapsed": completed a visit, but not within that window
export type ClientLifecycle = "new" | "active" | "lapsed";

// A client is "active" if their most recent completed visit is within this
// many days; older than that and they are "lapsed" (a re-engagement target).
export const ACTIVE_WINDOW_DAYS = 90;

export interface ClientListRow {
  clientProfileId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  tierName?: string;
  source?: string;
  ltvMinor: number;
  lastVisitAt?: Date;
  nextAppointmentAt?: Date;
  bookingCount: number;
  status: ClientLifecycle;
  createdAt: Date;
}

/**
 * Lists clients matching the given filters. `search` matches (case
 * insensitively) against either the client's fullName or their linked
 * User.phone. Booking counts and "last visit" (the most recent appointment
 * start time among COMPLETED bookings) are computed from a single batched
 * Booking query, not one query per client.
 */
export async function listClients(filter: ListClientsFilter = {}): Promise<ClientListRow[]> {
  const where: Prisma.ClientProfileWhereInput = {};
  if (filter.search) {
    where.OR = [
      { fullName: { contains: filter.search, mode: "insensitive" } },
      { user: { phone: { contains: filter.search, mode: "insensitive" } } },
    ];
  }
  if (filter.source) {
    where.sourceChannel = filter.source;
  }
  if (filter.tierKey) {
    where.membership = { tier: { key: filter.tierKey } };
  }

  const profiles = await prisma.clientProfile.findMany({
    where,
    include: { user: true, membership: { include: { tier: true } } },
    orderBy: { fullName: "asc" },
  });
  if (profiles.length === 0) return [];

  const clientProfileIds = profiles.map((p) => p.id);
  const bookings = await prisma.booking.findMany({
    where: { clientProfileId: { in: clientProfileIds } },
    include: { appointments: true },
  });

  const now = new Date();
  const activeCutoff = new Date(now.getTime() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const bookingCountByClient = new Map<string, number>();
  const lastVisitByClient = new Map<string, Date>();
  const nextApptByClient = new Map<string, Date>();
  for (const booking of bookings) {
    bookingCountByClient.set(booking.clientProfileId, (bookingCountByClient.get(booking.clientProfileId) ?? 0) + 1);
    for (const appointment of booking.appointments) {
      if (booking.status === "COMPLETED") {
        const current = lastVisitByClient.get(booking.clientProfileId);
        if (!current || appointment.startAt > current) {
          lastVisitByClient.set(booking.clientProfileId, appointment.startAt);
        }
      }
      // Upcoming appointment: earliest future start among live (non-terminal) bookings.
      if (
        (booking.status === "REQUESTED" || booking.status === "CONFIRMED" || booking.status === "CHECKED_IN") &&
        appointment.startAt > now
      ) {
        const current = nextApptByClient.get(booking.clientProfileId);
        if (!current || appointment.startAt < current) {
          nextApptByClient.set(booking.clientProfileId, appointment.startAt);
        }
      }
    }
  }

  return profiles.map((profile) => {
    const lastVisitAt = lastVisitByClient.get(profile.id);
    const status: ClientLifecycle = !lastVisitAt ? "new" : lastVisitAt >= activeCutoff ? "active" : "lapsed";
    return {
      clientProfileId: profile.id,
      fullName: profile.fullName,
      phone: profile.user.phone,
      email: profile.user.email,
      tierName: profile.membership?.tier.name,
      source: profile.sourceChannel ?? undefined,
      ltvMinor: profile.ltvCacheMinor,
      lastVisitAt,
      nextAppointmentAt: nextApptByClient.get(profile.id),
      bookingCount: bookingCountByClient.get(profile.id) ?? 0,
      status,
      createdAt: profile.createdAt,
    };
  });
}

export interface ClientDetailBooking {
  id: string;
  serviceName: string;
  startAt: Date;
  status: BookingStatus;
}

export interface ClientDetail {
  profile: ClientProfile;
  phone: string | null;
  email: string | null;
  tier?: MembershipTier;
  source?: string;
  ltvMinor: number;
  bookings: ClientDetailBooking[];
  visitNotes: VisitNoteWithAuthor[];
}

/** Profile + phone + current tier + booking history (newest first) + visit notes (newest first) for one client, or null if it doesn't exist. */
export async function getClientDetail(clientProfileId: string): Promise<ClientDetail | null> {
  const profile = await prisma.clientProfile.findUnique({
    where: { id: clientProfileId },
    include: { user: true, membership: { include: { tier: true } } },
  });
  if (!profile) return null;

  const [bookings, visitNotes] = await Promise.all([
    prisma.booking.findMany({
      where: { clientProfileId },
      include: { appointments: true },
      orderBy: { createdAt: "desc" },
    }),
    listVisitNotes(clientProfileId),
  ]);

  const serviceIds = [...new Set(bookings.flatMap((b) => b.appointments.map((a) => a.serviceId)))];
  const services = serviceIds.length > 0 ? await prisma.service.findMany({ where: { id: { in: serviceIds } } }) : [];
  const serviceNameById = new Map(services.map((s) => [s.id, s.nameEn]));

  const bookingRows: ClientDetailBooking[] = bookings.map((booking) => {
    const appointment = booking.appointments[0];
    return {
      id: booking.id,
      serviceName: appointment ? (serviceNameById.get(appointment.serviceId) ?? "Unknown service") : "Unknown service",
      startAt: appointment?.startAt ?? booking.createdAt,
      status: booking.status,
    };
  });

  return {
    profile,
    phone: profile.user.phone,
    email: profile.user.email,
    tier: profile.membership?.tier,
    source: profile.sourceChannel ?? undefined,
    ltvMinor: profile.ltvCacheMinor,
    bookings: bookingRows,
    visitNotes,
  };
}

/**
 * Sets (tierId non-null) or removes (tierId null) a client's
 * ClientMembership. Removing membership reverts the client to the base
 * "guest" tier (priority 0), matching accessRules.ts's clientMeetsTier
 * treatment of a client with no membership row.
 */
export async function updateClientTier(clientProfileId: string, tierId: string | null): Promise<void> {
  const profile = await prisma.clientProfile.findUnique({ where: { id: clientProfileId } });
  if (!profile) {
    throw new Error(`Client "${clientProfileId}" not found`);
  }

  if (tierId === null) {
    await prisma.clientMembership.deleteMany({ where: { clientId: clientProfileId } });
    return;
  }

  const tier = await prisma.membershipTier.findUnique({ where: { id: tierId } });
  if (!tier) {
    throw new Error(`Membership tier "${tierId}" not found`);
  }

  await prisma.clientMembership.upsert({
    where: { clientId: clientProfileId },
    update: { tierId },
    create: { clientId: clientProfileId, tierId },
  });
}
