// The booking service: slot lookup, booking creation (with client
// auto-provisioning, tier gating, and double-booking protection), and the
// booking lifecycle (confirm / check-in / complete / cancel / no-show /
// reschedule).

import { z } from "zod";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { Booking, BookingStatus } from "@prisma/client";
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
import { refreshClientLtv } from "@/modules/crm/ltv";
import { earnForBooking, applyAutoTier, redeemPoints as redeemLoyaltyPoints } from "@/modules/crm/loyalty";
import { localized } from "@/modules/catalog/localize";

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

  const slots = computeSlots({
    date: dateISO,
    durationMin: service.durationMin,
    staffSchedules,
    rooms,
    existingAppointments,
    businessHours,
  });

  // The availability engine (availability.ts) is pure and knows nothing
  // about "now" -- it happily returns a slot for 09:00 today even at
  // 14:00. Drop any slot that has already started/passed here, at the
  // DB-facing layer, so a client can never be offered (or book) a past
  // time. Future days are entirely unaffected since every slot on them is
  // already in the future.
  const now = new Date();
  return slots.filter((slot) => slot.startAt.getTime() > now.getTime());
}

// A client is identified by a phone number OR an email address (or both) --
// the public wizard's OTP identify step accepts either (see book/actions.ts,
// which already resolved+verified whichever one the client entered before
// calling createBooking). Front-desk/walk-in booking still typically
// supplies a phone. At least one of the two is required so
// findOrCreateClientProfile always has something to look the client up by.
const clientInputSchema = z
  .object({
    name: z.string().min(1),
    phone: z.string().min(1).optional(),
    email: z.string().email().optional(),
  })
  .refine((v) => Boolean(v.phone || v.email), { message: "client requires a phone or an email" });
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
  // Optional: redeem this many loyalty points as a discount on the booking
  // being created. Capped internally (by redeemPoints in
  // src/modules/crm/loyalty.ts) at the client's balance and at the
  // booking's own price -- never causes createBooking itself to fail.
  // Omitted/undefined/0 is a no-op, so existing callers stay unaffected.
  redeemPoints: z.number().int().nonnegative().optional(),
});
export type CreateBookingInput = z.input<typeof createBookingSchema>;

/** Asia/Riyadh is fixed at UTC+3 year-round (no DST) — see availability.ts. */
const CENTER_TZ = "Asia/Riyadh";

// Normalizes an arbitrary locale string (createBookingSchema.locale accepts
// any non-empty string) down to "en"/"ar" for localized()/Intl locale
// selection -- same "starts with ar" rule renderMessageBody (outbox.ts)
// uses, so a locale like "ar-SA" resolves the same way everywhere.
function toLocale(locale: string): "en" | "ar" {
  return locale.toLowerCase().startsWith("ar") ? "ar" : "en";
}

// Formats a UTC instant as a readable center-local (Asia/Riyadh) date+time
// string, in the booking's locale -- used for the {{dateTime}} placeholder
// in outbound CONFIRMATION/REMINDER_24H/POST_VISIT message templates.
function formatCenterLocalDateTime(date: Date, locale: string): string {
  const intlLocale = toLocale(locale) === "ar" ? "ar-SA" : "en-US";
  return new Intl.DateTimeFormat(intlLocale, { timeZone: CENTER_TZ, dateStyle: "medium", timeStyle: "short" }).format(
    date,
  );
}

function coerceDate(value: Date | string, label: string): Date {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${label}: "${String(value)}"`);
  }
  return date;
}

// Finds the ClientProfile for this client (via the linked User), creating a
// CLIENT User + ClientProfile if none exists. Looks up by phone when one was
// given (matching the public wizard's OTP-verified identifier -- whichever
// one that was, findOrCreateClientUser in clientAuth.ts already
// found-or-created the exact same User by that same field, so this lookup
// lands on it rather than creating a duplicate), otherwise by email.
// sourceChannel is only recorded the first time a profile is created for a
// client -- it is never overwritten on a later booking for the same client.
async function findOrCreateClientProfile(
  client: BookingClientInput,
  sourceChannel: string | undefined,
): Promise<string> {
  const where = client.phone ? { phone: client.phone } : { email: client.email! };
  const existingUser = await prisma.user.findUnique({
    where,
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
      phone: client.phone ?? null,
      email: client.email ?? null,
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

// Postgres' codes for "could not serialize access due to concurrent update"
// (40001) and "deadlock detected" (40P01) -- both transient, safe-to-retry
// conditions under SERIALIZABLE isolation. Prisma 7's driver-adapter
// architecture wraps these as a `DriverAdapterError` (name
// "DriverAdapterError", message "TransactionWriteConflict") with the actual
// Postgres SQLSTATE nested under `err.cause.originalCode` -- NOT as the
// `PrismaClientKnownRequestError` code "P2034" the classic Prisma engine
// used to surface (also checked below, for older/other Prisma error
// surfaces). `err.cause` is a plain object here, not a typed Prisma export,
// so it's read structurally rather than via `instanceof`.
const SERIALIZATION_FAILURE_CODE = "P2034";
const POSTGRES_SERIALIZATION_FAILURE = "40001";
const POSTGRES_DEADLOCK_DETECTED = "40P01";
const MAX_SERIALIZABLE_ATTEMPTS = 5;

function isSerializationFailure(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === SERIALIZATION_FAILURE_CODE) {
    return true;
  }
  if (!(err instanceof Error)) return false;
  if (err.message.includes("could not serialize") || err.message.includes("deadlock detected")) {
    return true;
  }
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const c = cause as Record<string, unknown>;
    if (c.originalCode === POSTGRES_SERIALIZATION_FAILURE || c.originalCode === POSTGRES_DEADLOCK_DETECTED) {
      return true;
    }
    if (c.kind === "TransactionWriteConflict") return true;
    if (
      typeof c.originalMessage === "string" &&
      (c.originalMessage.includes("could not serialize") || c.originalMessage.includes("deadlock detected"))
    ) {
      return true;
    }
  }
  return false;
}

// Runs `fn` inside a SERIALIZABLE transaction, retrying it (up to
// MAX_SERIALIZABLE_ATTEMPTS times) whenever Postgres aborts it with a
// serialization failure. Under READ COMMITTED (Prisma/Postgres' default),
// two concurrent create/reschedule transactions can each pass
// assertSlotStillFree's re-check before either commits, double-booking the
// slot. SERIALIZABLE makes Postgres detect that race and abort one side
// instead -- this helper turns that abort into a transparent retry rather
// than a surprise error, so the caller only ever sees either a clean
// success or (if every retry also loses the race, or the abort keeps
// recurring) the underlying error re-thrown after the last attempt.
//
// A *logical* conflict -- assertSlotStillFree seeing an already-committed
// overlapping appointment and throwing "That time was just taken" -- is a
// plain Error, not a serialization failure, and is never retried: it
// propagates immediately so the caller gets the real conflict message.
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSerializableTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (err) {
      if (!isSerializationFailure(err)) {
        throw err;
      }
      lastError = err;
      // A short, jittered backoff before retrying: under heavy concurrent
      // load (many simultaneous SERIALIZABLE transactions touching the
      // Booking/Appointment tables), Postgres can abort several attempts
      // in a row even between transactions that aren't really contending
      // for the same slot. Backing off briefly -- instead of retrying in a
      // tight loop -- gives the colliding transaction(s) a chance to
      // commit/abort and reduces the odds of every attempt losing the race.
      if (attempt < MAX_SERIALIZABLE_ATTEMPTS) {
        const backoffMs = 10 * 2 ** (attempt - 1) + Math.floor(Math.random() * 10);
        await sleep(backoffMs);
      }
    }
  }
  throw lastError;
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
  if (startAt.getTime() <= Date.now()) {
    throw new Error("That time is in the past");
  }

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

  const booking = await runSerializableTransaction(async (tx) => {
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

  // Optional points redemption: applies its own SERIALIZABLE cap (balance +
  // booking price), so this can be called unconditionally whenever the
  // caller asked for a positive amount without re-deriving those limits here.
  if (data.redeemPoints && data.redeemPoints > 0) {
    await redeemLoyaltyPoints(clientProfileId, data.redeemPoints, booking.id);
  }

  const now = new Date();
  const reminderSendAt = new Date(startAt.getTime() - 24 * 60 * 60 * 1000);
  const messagePayload = {
    bookingId: booking.id,
    serviceId: service.id,
    serviceName: localized(toLocale(data.locale), service.nameEn, service.nameAr),
    dateTime: formatCenterLocalDateTime(startAt, data.locale),
  };
  const messagesToSchedule = [
    scheduleMessage({
      bookingId: booking.id,
      kind: "CONFIRMATION",
      toPhone: data.client.phone,
      toEmail: data.client.email,
      clientProfileId,
      locale: data.locale,
      sendAt: now,
      payload: messagePayload,
    }),
    scheduleMessage({
      bookingId: booking.id,
      kind: "POST_VISIT",
      toPhone: data.client.phone,
      toEmail: data.client.email,
      clientProfileId,
      locale: data.locale,
      sendAt: new Date(endAt.getTime() + 2 * 60 * 60 * 1000),
      payload: messagePayload,
    }),
  ];
  // Only schedule the 24h-ahead reminder when it would actually land in the
  // future: a booking made within 24h of its own appointment (e.g. a
  // walk-in booked 2h out) would otherwise get a REMINDER_24H whose sendAt
  // is already in the past, which processDueMessages would fire off
  // immediately/late and confuse the client.
  if (reminderSendAt.getTime() > now.getTime()) {
    messagesToSchedule.push(
      scheduleMessage({
        bookingId: booking.id,
        kind: "REMINDER_24H",
        toPhone: data.client.phone,
        toEmail: data.client.email,
        clientProfileId,
        locale: data.locale,
        sendAt: reminderSendAt,
        payload: messagePayload,
      }),
    );
  }
  await Promise.all(messagesToSchedule);

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

// --- Calendar/front-desk read helpers -------------------------------------
// Denormalized rows for the staff calendar day view (Task 8): one row per
// appointment, joined against the service/staff/room/client tables the UI
// needs to render without a client-side waterfall. Kept here (rather than a
// separate module) since it's just a read-side projection over data this
// module already owns (Booking/Appointment) plus a few IDs to resolve.

export interface DayAppointmentRow {
  bookingId: string;
  appointmentId: string;
  status: BookingStatus;
  channel: Booking["channel"];
  startAt: Date;
  endAt: Date;
  serviceId: string;
  serviceName: string;
  staffUserId: string;
  staffName: string;
  roomId: string;
  roomName: string;
  clientProfileId: string;
  clientName: string;
  clientPhone: string | null;
}

/**
 * Lists every appointment landing on `dateISO` (center-local), optionally
 * narrowed to one staff member, sorted by start time. Cancelled/no-show
 * bookings are included (front desk still needs to see them on the day),
 * unlike the availability engine's ACTIVE_APPOINTMENT_FILTER.
 */
export async function listDayAppointments(dateISO: string, staffUserId?: string): Promise<DayAppointmentRow[]> {
  const bookings = await listBookings({ date: dateISO, staffUserId });

  const dayStart = centerLocalToUtc(dateISO, 0);
  const dayEnd = centerLocalToUtc(dateISO, 1440);
  const entries = bookings.flatMap((booking) =>
    booking.appointments
      .filter((appointment) => {
        if (appointment.startAt < dayStart || appointment.startAt >= dayEnd) return false;
        if (staffUserId && appointment.staffUserId !== staffUserId) return false;
        return true;
      })
      .map((appointment) => ({ booking, appointment })),
  );
  if (entries.length === 0) return [];

  const serviceIds = [...new Set(entries.map((e) => e.appointment.serviceId))];
  const staffUserIds = [...new Set(entries.map((e) => e.appointment.staffUserId))];
  const roomIds = [...new Set(entries.map((e) => e.appointment.roomId))];
  const clientProfileIds = [...new Set(entries.map((e) => e.booking.clientProfileId))];

  const [services, staff, rooms, clients] = await Promise.all([
    prisma.service.findMany({ where: { id: { in: serviceIds } } }),
    prisma.user.findMany({ where: { id: { in: staffUserIds } }, include: { staffProfile: true } }),
    prisma.room.findMany({ where: { id: { in: roomIds } } }),
    prisma.clientProfile.findMany({ where: { id: { in: clientProfileIds } }, include: { user: true } }),
  ]);
  const serviceById = new Map(services.map((s) => [s.id, s]));
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const clientById = new Map(clients.map((c) => [c.id, c]));

  const rows: DayAppointmentRow[] = entries.map(({ booking, appointment }) => {
    const client = clientById.get(booking.clientProfileId);
    const staffUser = staffById.get(appointment.staffUserId);
    return {
      bookingId: booking.id,
      appointmentId: appointment.id,
      status: booking.status,
      channel: booking.channel,
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      serviceId: appointment.serviceId,
      serviceName: serviceById.get(appointment.serviceId)?.nameEn ?? "Unknown service",
      staffUserId: appointment.staffUserId,
      staffName: staffUser?.staffProfile?.fullName ?? "Unknown staff",
      roomId: appointment.roomId,
      roomName: roomById.get(appointment.roomId)?.name ?? "Unknown room",
      clientProfileId: booking.clientProfileId,
      clientName: client?.fullName ?? "Unknown client",
      clientPhone: client?.user.phone ?? null,
    };
  });

  rows.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return rows;
}

export interface StaffOption {
  id: string;
  name: string;
}

/** Active staff members (STAFF users with a StaffProfile), for calendar/front-desk staff pickers. */
export async function listStaffOptions(): Promise<StaffOption[]> {
  const staff = await prisma.user.findMany({
    where: { type: "STAFF", isActive: true, staffProfile: { isNot: null } },
    include: { staffProfile: true },
  });
  return staff
    .map((s) => ({ id: s.id, name: s.staffProfile!.fullName }))
    .sort((a, b) => a.name.localeCompare(b.name));
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
  const updated = await prisma.booking.update({ where: { id: bookingId }, data: { status: "COMPLETED" } });

  // Best-effort: refresh the client's cached LTV now that a new COMPLETED
  // booking may have changed it. This must never fail (or block) the
  // completion itself -- a stale LTV cache is recoverable, but failing to
  // record a booking as completed is not.
  try {
    await refreshClientLtv(updated.clientProfileId);
  } catch (err) {
    console.error(`Failed to refresh LTV for client "${updated.clientProfileId}" after completing booking "${bookingId}"`, err);
  }

  // Best-effort, same as the LTV refresh above: award loyalty points for
  // this booking and re-evaluate the client's auto-tier. Neither step may
  // ever throw/block completion -- a missed points award is recoverable
  // (staff can adjustPoints manually), but failing to record the booking as
  // completed is not.
  try {
    await earnForBooking(bookingId);
    await applyAutoTier(updated.clientProfileId);
  } catch (err) {
    console.error(`Failed to award loyalty points/apply auto-tier for client "${updated.clientProfileId}" after completing booking "${bookingId}"`, err);
  }

  return updated;
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
  if (startAt.getTime() <= Date.now()) {
    throw new Error("That time is in the past");
  }

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

  await runSerializableTransaction(async (tx) => {
    await assertSlotStillFree(tx, { ...resolved, startAt, endAt, excludeAppointmentId: appointment.id });
    await tx.appointment.update({
      where: { id: appointment.id },
      data: { startAt, endAt, staffUserId: resolved.staffUserId, roomId: resolved.roomId },
    });
  });

  return getBookingOrThrow(bookingId);
}
