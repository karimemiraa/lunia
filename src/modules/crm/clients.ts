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
  tag?: string;
  stage?: string;
  ownerId?: string;
  direction?: string;
}

/** Distinct client tags across the roster (for the roster filter + segments). */
export async function listClientTags(): Promise<string[]> {
  const rows = await prisma.clientProfile.findMany({ select: { tags: true } });
  const set = new Set<string>();
  for (const row of rows) for (const tag of row.tags) set.add(tag);
  return [...set].sort((a, b) => a.localeCompare(b));
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
  // Sales pipeline
  stage: import("@prisma/client").LeadStage;
  direction: import("@prisma/client").LeadDirection | null;
  ownerId: string | null;
  ownerName?: string;
  nextFollowUpAt?: Date;
}

/** Staff (id + name) for the owner filter/assignment dropdowns. */
export async function listStaffOwners(): Promise<{ id: string; name: string }[]> {
  const staff = await prisma.user.findMany({ where: { type: "STAFF" }, include: { staffProfile: true }, orderBy: { createdAt: "asc" } });
  return staff.map((s) => ({ id: s.id, name: s.staffProfile?.fullName ?? s.email ?? "Staff" }));
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
  if (filter.tag) {
    where.tags = { has: filter.tag };
  }
  if (filter.stage) {
    where.stage = filter.stage as Prisma.ClientProfileWhereInput["stage"];
  }
  if (filter.ownerId) {
    where.ownerId = filter.ownerId === "unassigned" ? null : filter.ownerId;
  }
  if (filter.direction) {
    where.direction = filter.direction as Prisma.ClientProfileWhereInput["direction"];
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

  // Resolve owner names in one batched lookup.
  const ownerIds = [...new Set(profiles.map((p) => p.ownerId).filter((id): id is string => !!id))];
  const owners = ownerIds.length > 0 ? await prisma.staffProfile.findMany({ where: { userId: { in: ownerIds } }, select: { userId: true, fullName: true } }) : [];
  const ownerNameById = new Map(owners.map((o) => [o.userId, o.fullName]));

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
      stage: profile.stage,
      direction: profile.direction,
      ownerId: profile.ownerId,
      ownerName: profile.ownerId ? ownerNameById.get(profile.ownerId) : undefined,
      nextFollowUpAt: profile.nextFollowUpAt ?? undefined,
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

export interface UpdateCustomerInput {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Updates a customer's editable details: display name + source (on the
 * ClientProfile) and phone/email (on the linked User). Enforces the User
 * phone/email uniqueness so an edit can't collide with another account.
 */
export async function updateCustomer(clientProfileId: string, input: UpdateCustomerInput): Promise<void> {
  const profile = await prisma.clientProfile.findUnique({ where: { id: clientProfileId }, include: { user: true } });
  if (!profile) throw new Error("Customer not found");

  const fullName = input.fullName.trim();
  if (!fullName) throw new Error("A name is required");

  const phone = input.phone?.trim() || null;
  const email = input.email?.trim().toLowerCase() || null;
  if (email && !EMAIL_RE.test(email)) throw new Error("Please enter a valid email address");

  if (phone) {
    const other = await prisma.user.findUnique({ where: { phone } });
    if (other && other.id !== profile.userId) throw new Error("That phone number is already used by another customer");
  }
  if (email) {
    const other = await prisma.user.findUnique({ where: { email } });
    if (other && other.id !== profile.userId) throw new Error("That email is already used by another customer");
  }

  // Source is set automatically at acquisition and is not edited here.
  await prisma.$transaction([
    prisma.clientProfile.update({ where: { id: clientProfileId }, data: { fullName } }),
    prisma.user.update({ where: { id: profile.userId }, data: { phone, email } }),
  ]);
}

/**
 * Permanently deletes a customer and everything attached to them (profile,
 * bookings, notes, loyalty, credits) by removing the underlying User, which
 * cascades. Irreversible — the caller must confirm + hold CLIENT_MANAGE.
 */
export async function deleteCustomer(clientProfileId: string): Promise<void> {
  const profile = await prisma.clientProfile.findUnique({ where: { id: clientProfileId } });
  if (!profile) throw new Error("Customer not found");
  await prisma.user.delete({ where: { id: profile.userId } });
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
