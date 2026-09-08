// The booking service: slot lookup, booking creation (with client
// auto-provisioning, tier gating, and double-booking protection), and the
// booking lifecycle (confirm / check-in / complete / cancel / no-show /
// reschedule).

import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Booking, BookingStatus, Prisma } from "@prisma/client";
import {
  computeSlots,
  centerLocalToUtc,
  utcToCenterLocal,
  weekdayForDateISO,
  type ComputedSlot,
  type DayHoursInput,
} from "./availability";
import { getSetting } from "@/modules/cms/settings";
import { getMinTierForService, clientMeetsTier } from "./accessRules";
import { scheduleMessage } from "./outbox";

export type Slot = ComputedSlot;

export type BookingWithAppointments = Prisma.BookingGetPayload<{ include: { appointments: true } }>;

// Cancelling or no-showing a booking does not delete its Appointment row
// (it's kept for history/reporting), so every availability query must
// explicitly exclude appointments whose booking ended up in one of these
// statuses -- otherwise a cancelled slot would stay blocked forever.
const INACTIVE_BOOKING_STATUSES: BookingStatus[] = ["CANCELLED", "NO_SHOW"];
const ACTIVE_APPOINTMENT_FILTER: Prisma.AppointmentWhereInput = {
  booking: { status: { notIn: INACTIVE_BOOKING_STATUSES } },
};

// weekdayForDateISO returns 0 = Sunday .. 6 = Saturday; the "hours" setting
// is keyed by mon..sun day names. This maps one to the other.
const WEEKDAY_TO_HOURS_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

async function getBusinessHoursForDate(dateISO: string): Promise<DayHoursInput> {
  const hours = await getSetting("hours");
  if (!hours) {
    throw new Error("Business hours are not configured");
  }
  const weekday = weekdayForDateISO(dateISO);
  return hours[WEEKDAY_TO_HOURS_KEY[weekday]!];
}

// Loads live schedules/rooms/appointments for `dateISO` and computes
// bookable slots for `serviceId` via the pure availability engine.
export async function getServiceSlots(
  serviceId: string,
  dateISO: string,
  excludeAppointmentId?: string,
): Promise<Slot[]> {
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) {
    throw new Error(`Service "${serviceId}" not found`);
  }

  const businessHours = await getBusinessHoursForDate(dateISO);

  const [staffSchedules, rooms] = await Promise.all([
    prisma.staffSchedule.findMany({ where: { isActive: true } }),
    prisma.room.findMany({ where: { isActive: true } }),
  ]);

  // Appointments that overlap the center-local day at all (not merely ones
  // that start within it), so an appointment straddling local midnight is
  // still accounted for. When recomputing slots for a reschedule,
  // excludeAppointmentId leaves the appointment being moved out of its own
  // conflict check, so moving it to a time that overlaps its current slot
  // isn't wrongly treated as unavailable.
  const dayStart = centerLocalToUtc(dateISO, 0);
  const dayEnd = centerLocalToUtc(dateISO, 1440);
  const excludeClause = excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {};
  const existingAppointments = await prisma.appointment.findMany({
    where: { startAt: { lt: dayEnd }, endAt: { gt: dayStart }, ...excludeClause, ...ACTIVE_APPOINTMENT_FILTER },
    select: { staffUserId: true, roomId: true, startAt: true, endAt: true },
  });

  return computeSlots({
    date: dateISO,
    durationMin: service.durationMin,
    staffSchedules,
    rooms,
    existingAppointments,
    businessHours,
  });
}

const clientInputSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional(),
});
export type BookingClientInput = z.infer<typeof clientInputSchema>;

const bookingChannelSchema = z.enum(["ONLINE", "FRONT_DESK", "WALK_IN"]);

const createBookingSchema = z.object({
  serviceId: z.string().min(1),
  startAt: z.union([z.date(), z.string().min(1)]),
  staffUserId: z.string().min(1).optional(),
  roomId: z.string().min(1).optional(),
  client: clientInputSchema,
  channel: bookingChannelSchema,
  sourceChannel: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
  createdById: z.string().min(1).optional(),
  locale: z.string().min(1).default("ar"),
});
export type CreateBookingInput = z.input<typeof createBookingSchema>;

function coerceDate(value: Date | string, label: string): Date {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${label}: "${String(value)}"`);
  }
  return date;
}

// Finds the ClientProfile for this phone number (via the linked User),
// creating a CLIENT User + ClientProfile if none exists. sourceChannel is
// only recorded the first time a profile is created for a phone -- it is
// never overwritten on a later booking with the same phone.
async function findOrCreateClientProfile(
  client: BookingClientInput,
  sourceChannel: string | undefined,
): Promise<string> {
  const existingUser = await prisma.user.findUnique({
    where: { phone: client.phone },
    include: { clientProfile: true },
  });

  if (existingUser) {
    if (existingUser.clientProfile) return existingUser.clientProfile.id;
    const profile = await prisma.clientProfile.create({
      data: { userId: existingUser.id, fullName: client.name, sourceChannel: sourceChannel ?? null },
    });
    return profile.id;
  }

  const created = await prisma.user.create({
    data: {
      type: "CLIENT",
      phone: client.phone,
      email: client.email,
      clientProfile: { create: { fullName: client.name, sourceChannel: sourceChannel ?? null } },
    },
    include: { clientProfile: true },
  });
  return created.clientProfile!.id;
}

// Resolves a concrete (staffUserId, roomId) pair for booking `serviceId` at
// `startAt`, either by trusting the caller-provided values or by
// recomputing today's slots and matching one starting at exactly `startAt`.
// Throws if no free slot matches.
async function resolveStaffAndRoom(
  serviceId: string,
  startAt: Date,
  staffUserId: string | undefined,
  roomId: string | undefined,
  excludeAppointmentId?: string,
): Promise<{ staffUserId: string; roomId: string }> {
  if (staffUserId && roomId) return { staffUserId, roomId };

  const dateISO = utcToCenterLocal(startAt).dateISO;
  const slots = await getServiceSlots(serviceId, dateISO, excludeAppointmentId);
  const match = slots.find(
    (s) =>
      s.startAt.getTime() === startAt.getTime() &&
      (!staffUserId || s.staffUserId === staffUserId) &&
      (!roomId || s.roomId === roomId),
  );
  if (!match) {
    throw new Error("That time is no longer available");
  }
  return { staffUserId: match.staffUserId, roomId: match.roomId };
}

// Re-checks (inside the transaction) that neither the chosen staff member
// nor the chosen room has an overlapping appointment in [startAt, endAt),
// respecting room capacity. Throws "That time was just taken" on conflict.
async function assertSlotStillFree(
  tx: Prisma.TransactionClient,
  params: { staffUserId: string; roomId: string; startAt: Date; endAt: Date; excludeAppointmentId?: string },
): Promise<void> {
  const { staffUserId, roomId, startAt, endAt, excludeAppointmentId } = params;
  const overlapWindow = { startAt: { lt: endAt }, endAt: { gt: startAt } };
  const excludeClause = excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {};

  const staffConflict = await tx.appointment.findFirst({
    where: { staffUserId, ...overlapWindow, ...excludeClause, ...ACTIVE_APPOINTMENT_FILTER },
  });
  if (staffConflict) {
    throw new Error("That time was just taken");
  }

  const room = await tx.room.findUnique({ where: { id: roomId } });
  if (!room) {
    throw new Error(`Room "${roomId}" not found`);
  }
  const roomOverlapCount = await tx.appointment.count({
    where: { roomId, ...overlapWindow, ...excludeClause, ...ACTIVE_APPOINTMENT_FILTER },
  });
  if (roomOverlapCount >= room.capacity) {
    throw new Error("That time was just taken");
  }
}

// Creates a booking end-to-end:
//  1. Validates the service (published; ONLINE additionally requires
//     onlineBookable and not inCenterOnly).
//  2. Finds or creates the client (by phone).
//  3. Enforces any ServiceAccessRule tier gate.
//  4. Resolves a concrete (staff, room) pair.
//  5. Re-checks availability and creates the Booking + Appointment inside a
//     transaction.
//  6. Schedules the CONFIRMATION / REMINDER_24H / POST_VISIT messages.
export async function createBooking(input: CreateBookingInput): Promise<BookingWithAppointments> {
  const data = createBookingSchema.parse(input);
  const startAt = coerceDate(data.startAt, "startAt");

  const service = await prisma.service.findUnique({ where: { id: data.serviceId } });
  if (!service) {
    throw new Error(`Service "${data.serviceId}" not found`);
  }
  if (!service.isPublished) {
    throw new Error("This service is not currently available for booking");
  }
  if (data.channel === "ONLINE" && (!service.onlineBookable || service.inCenterOnly)) {
    throw new Error("This service is not available for online booking");
  }

  const endAt = new Date(startAt.getTime() + service.durationMin * 60_000);

  const clientProfileId = await findOrCreateClientProfile(data.client, data.sourceChannel);

  const requirement = await getMinTierForService(service.id);
  if (requirement) {
    const meetsTier = await clientMeetsTier(clientProfileId, requirement.minPriority);
    if (!meetsTier) {
      throw new Error(`This service is available to ${requirement.tierName} members`);
    }
  }

  const resolved = await resolveStaffAndRoom(service.id, startAt, data.staffUserId, data.roomId);

  const booking = await prisma.$transaction(async (tx) => {
    await assertSlotStillFree(tx, { ...resolved, startAt, endAt });

    return tx.booking.create({
      data: {
        clientProfileId,
        status: "CONFIRMED",
        channel: data.channel,
        sourceChannel: data.sourceChannel ?? null,
        notes: data.notes ?? null,
        createdById: data.createdById ?? null,
        appointments: {
          create: {
            serviceId: service.id,
            staffUserId: resolved.staffUserId,
            roomId: resolved.roomId,
            startAt,
            endAt,
            priceMinorSnapshot: service.priceMinor,
          },
        },
      },
      include: { appointments: true },
    });
  });

  const now = new Date();
  await Promise.all([
    scheduleMessage({
      bookingId: booking.id,
      kind: "CONFIRMATION",
      toPhone: data.client.phone,
      locale: data.locale,
      sendAt: now,
      payload: { bookingId: booking.id, serviceId: service.id },
    }),
    scheduleMessage({
      bookingId: booking.id,
      kind: "REMINDER_24H",
      toPhone: data.client.phone,
      locale: data.locale,
      sendAt: new Date(startAt.getTime() - 24 * 60 * 60 * 1000),
      payload: { bookingId: booking.id, serviceId: service.id },
    }),
    scheduleMessage({
      bookingId: booking.id,
      kind: "POST_VISIT",
      toPhone: data.client.phone,
      locale: data.locale,
      sendAt: new Date(endAt.getTime() + 2 * 60 * 60 * 1000),
      payload: { bookingId: booking.id, serviceId: service.id },
    }),
  ]);

  return booking;
}

export interface ListBookingsFilter {
  date?: string;
  from?: Date;
  to?: Date;
  staffUserId?: string;
  status?: BookingStatus;
  clientProfileId?: string;
}

export async function listBookings(filter: ListBookingsFilter = {}): Promise<BookingWithAppointments[]> {
  const appointmentWhere: Prisma.AppointmentWhereInput = {};
  if (filter.staffUserId) appointmentWhere.staffUserId = filter.staffUserId;
  if (filter.date) {
    appointmentWhere.startAt = { gte: centerLocalToUtc(filter.date, 0), lt: centerLocalToUtc(filter.date, 1440) };
  } else if (filter.from || filter.to) {
    appointmentWhere.startAt = {
      ...(filter.from ? { gte: filter.from } : {}),
      ...(filter.to ? { lt: filter.to } : {}),
    };
  }

  const bookingWhere: Prisma.BookingWhereInput = {};
  if (filter.status) bookingWhere.status = filter.status;
  if (filter.clientProfileId) bookingWhere.clientProfileId = filter.clientProfileId;
  if (Object.keys(appointmentWhere).length > 0) {
    bookingWhere.appointments = { some: appointmentWhere };
  }

  return prisma.booking.findMany({
    where: bookingWhere,
    include: { appointments: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getBooking(id: string): Promise<BookingWithAppointments | null> {
  return prisma.booking.findUnique({ where: { id }, include: { appointments: true } });
}

async function getBookingOrThrow(bookingId: string): Promise<BookingWithAppointments> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { appointments: true } });
  if (!booking) {
    throw new Error(`Booking "${bookingId}" not found`);
  }
  return booking;
}

function assertTransition(current: BookingStatus, allowed: BookingStatus[], action: string): void {
  if (!allowed.includes(current)) {
    throw new Error(`Cannot ${action} a booking with status "${current}"`);
  }
}

export async function confirmBooking(bookingId: string): Promise<Booking> {
  const booking = await getBookingOrThrow(bookingId);
  assertTransition(booking.status, ["REQUESTED"], "confirm");
  return prisma.booking.update({ where: { id: bookingId }, data: { status: "CONFIRMED" } });
}

export async function checkIn(bookingId: string): Promise<Booking> {
  const booking = await getBookingOrThrow(bookingId);
  assertTransition(booking.status, ["REQUESTED", "CONFIRMED"], "check in");

  const [updated] = await prisma.$transaction([
    prisma.booking.update({ where: { id: bookingId }, data: { status: "CHECKED_IN" } }),
    prisma.checkIn.create({ data: { bookingId } }),
  ]);
  return updated;
}

export async function complete(bookingId: string): Promise<Booking> {
  const booking = await getBookingOrThrow(bookingId);
  assertTransition(booking.status, ["CHECKED_IN", "CONFIRMED"], "complete");
  return prisma.booking.update({ where: { id: bookingId }, data: { status: "COMPLETED" } });
}

export async function cancel(bookingId: string): Promise<Booking> {
  const booking = await getBookingOrThrow(bookingId);
  if (booking.status === "COMPLETED") {
    throw new Error("Cannot cancel a completed booking");
  }
  return prisma.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED" } });
}

export async function markNoShow(bookingId: string): Promise<Booking> {
  const booking = await getBookingOrThrow(bookingId);
  assertTransition(booking.status, ["CONFIRMED", "CHECKED_IN"], "mark no-show for");
  return prisma.booking.update({ where: { id: bookingId }, data: { status: "NO_SHOW" } });
}

// Moves a booking's (single) appointment to a new time/staff/room,
// re-checking availability for the new slot inside a transaction. Refuses
// to reschedule a booking that has already reached a terminal state.
export async function reschedule(
  bookingId: string,
  newStartAt: Date | string,
  staffUserId?: string,
  roomId?: string,
): Promise<BookingWithAppointments> {
  const startAt = coerceDate(newStartAt, "newStartAt");

  const booking = await getBookingOrThrow(bookingId);
  if (booking.status === "COMPLETED" || booking.status === "CANCELLED" || booking.status === "NO_SHOW") {
    throw new Error(`Cannot reschedule a booking with status "${booking.status}"`);
  }
  const appointment = booking.appointments[0];
  if (!appointment) {
    throw new Error(`Booking "${bookingId}" has no appointment`);
  }

  const service = await prisma.service.findUniqueOrThrow({ where: { id: appointment.serviceId } });
  const endAt = new Date(startAt.getTime() + service.durationMin * 60_000);
  const resolved = await resolveStaffAndRoom(service.id, startAt, staffUserId, roomId, appointment.id);

  await prisma.$transaction(async (tx) => {
    await assertSlotStillFree(tx, { ...resolved, startAt, endAt, excludeAppointmentId: appointment.id });
    await tx.appointment.update({
      where: { id: appointment.id },
      data: { startAt, endAt, staffUserId: resolved.staffUserId, roomId: resolved.roomId },
    });
  });

  return getBookingOrThrow(bookingId);
}
