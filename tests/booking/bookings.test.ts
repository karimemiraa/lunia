import { describe, it, expect, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { centerLocalToUtc, utcToCenterLocal } from "@/modules/booking/availability";
import { requestOtp, verifyOtp } from "@/modules/iam/clientAuth";
import {
  getServiceSlots,
  createBooking,
  listBookings,
  getBooking,
  confirmBooking,
  checkIn,
  complete,
  cancel,
  markNoShow,
  reschedule,
} from "@/modules/booking/bookings";

// All test bookings use a Sunday (weekday 0 -> seeded staff schedules and
// business hours are both open Sun-Thu) far from any date used by other
// test files, so this suite never collides with concurrently-run files.
const DATE = "2026-09-27";

// Every phone created by this suite carries this prefix so cleanup can find
// (and remove) everything it created, regardless of which test created it or
// whether an assertion failed partway through.
const PHONE_PREFIX = `+9665TEST${Date.now()}`;
let phoneCounter = 0;
function freshPhone(): string {
  phoneCounter += 1;
  return `${PHONE_PREFIX}${phoneCounter}`;
}

afterAll(async () => {
  const users = await prisma.user.findMany({
    where: { phone: { startsWith: PHONE_PREFIX } },
    include: { clientProfile: true },
  });
  const clientProfileIds = users.map((u) => u.clientProfile?.id).filter((id): id is string => !!id);
  if (clientProfileIds.length > 0) {
    const bookings = await prisma.booking.findMany({ where: { clientProfileId: { in: clientProfileIds } } });
    const bookingIds = bookings.map((b) => b.id);
    if (bookingIds.length > 0) {
      await prisma.scheduledMessage.deleteMany({ where: { bookingId: { in: bookingIds } } });
    }
  }
  // Deleting the User cascades ClientProfile -> Booking -> Appointment/CheckIn.
  await prisma.user.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
});

async function getUnGatedService() {
  return prisma.service.findUniqueOrThrow({ where: { slug: "diagnostic-skin-analysis" } });
}

async function getGatedService() {
  return prisma.service.findUniqueOrThrow({ where: { slug: "signature-facials-hydrafacial" } });
}

async function getOwner() {
  return prisma.user.findUniqueOrThrow({ where: { email: "owner@lunia.local" } });
}

async function getSpecialist() {
  return prisma.user.findUniqueOrThrow({ where: { email: "specialist@lunia.local" } });
}

async function getRooms() {
  const rooms = await prisma.room.findMany({ where: { isActive: true }, orderBy: { order: "asc" } });
  return rooms;
}

// Finds a genuinely free (per getServiceSlots -- which already excludes
// whatever's already booked) slot whose "hours from now" falls in
// [minHoursAhead, maxHoursAhead], scanning forward a few center-local days.
// Used instead of a hardcoded staff+time offset because this suite runs
// against a persistent dev database that can already carry a dense set of
// appointments for the seeded staff near the real current time (e.g. from
// earlier e2e runs) -- a fixed "now + Nh" for a fixed staff member is not
// reliably free.
async function findFreeSlotWithinHours(serviceId: string, minHoursAhead: number, maxHoursAhead: number) {
  const now = Date.now();
  for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
    const dateISO = utcToCenterLocal(new Date(now + dayOffset * 86_400_000)).dateISO;
    const slots = await getServiceSlots(serviceId, dateISO);
    for (const slot of slots) {
      const hoursAhead = (slot.startAt.getTime() - now) / (60 * 60 * 1000);
      if (hoursAhead >= minHoursAhead && hoursAhead <= maxHoursAhead) {
        return slot;
      }
    }
  }
  throw new Error(`No free slot found between ${minHoursAhead}h and ${maxHoursAhead}h ahead`);
}

describe("createBooking", () => {
  it("auto-creates a CLIENT user + ClientProfile and an Appointment, and schedules 3 ScheduledMessage rows", async () => {
    const service = await getUnGatedService();
    const phone = freshPhone();
    const startAt = centerLocalToUtc(DATE, 600); // 10:00 center-local

    const booking = await createBooking({
      serviceId: service.id,
      startAt,
      client: { name: "Fresh Client", phone },
      channel: "ONLINE",
      sourceChannel: "website",
    });

    expect(booking.status).toBe("CONFIRMED");
    expect(booking.channel).toBe("ONLINE");
    expect(booking.appointments.length).toBe(1);
    const appt = booking.appointments[0]!;
    expect(appt.serviceId).toBe(service.id);
    expect(appt.startAt.getTime()).toBe(startAt.getTime());
    expect(appt.endAt.getTime()).toBe(startAt.getTime() + service.durationMin * 60_000);
    expect(appt.priceMinorSnapshot).toBe(service.priceMinor);

    const user = await prisma.user.findUniqueOrThrow({ where: { phone }, include: { clientProfile: true } });
    expect(user.type).toBe("CLIENT");
    expect(user.clientProfile).not.toBeNull();
    expect(user.clientProfile!.fullName).toBe("Fresh Client");
    expect(user.clientProfile!.sourceChannel).toBe("website");
    expect(booking.clientProfileId).toBe(user.clientProfile!.id);

    const messages = await prisma.scheduledMessage.findMany({ where: { bookingId: booking.id } });
    expect(messages.length).toBe(3);
    const kinds = messages.map((m) => m.kind).sort();
    expect(kinds).toEqual(["CONFIRMATION", "POST_VISIT", "REMINDER_24H"]);
    for (const m of messages) {
      expect(m.toPhone).toBe(phone);
      expect(m.status).toBe("PENDING");
    }
    const reminder = messages.find((m) => m.kind === "REMINDER_24H")!;
    expect(reminder.sendAt.getTime()).toBe(startAt.getTime() - 24 * 60 * 60 * 1000);
    const postVisit = messages.find((m) => m.kind === "POST_VISIT")!;
    expect(postVisit.sendAt.getTime()).toBe(appt.endAt.getTime() + 2 * 60 * 60 * 1000);
  });

  it("reuses the same client (User + ClientProfile) on a second booking with the same phone", async () => {
    const service = await getUnGatedService();
    const phone = freshPhone();
    const firstStart = centerLocalToUtc(DATE, 630);
    const secondStart = centerLocalToUtc(DATE, 720);

    const first = await createBooking({
      serviceId: service.id,
      startAt: firstStart,
      client: { name: "Repeat Client", phone },
      channel: "ONLINE",
    });
    const second = await createBooking({
      serviceId: service.id,
      startAt: secondStart,
      client: { name: "Repeat Client", phone },
      channel: "ONLINE",
    });

    expect(second.clientProfileId).toBe(first.clientProfileId);
    const users = await prisma.user.findMany({ where: { phone } });
    expect(users.length).toBe(1);
    const profiles = await prisma.clientProfile.findMany({ where: { userId: users[0]!.id } });
    expect(profiles.length).toBe(1);
  });

  it("rejects double-booking the same staff + room + time", async () => {
    const service = await getUnGatedService();
    const owner = await getOwner();
    const rooms = await getRooms();
    const room = rooms[0]!;
    const startAt = centerLocalToUtc(DATE, 660);

    await createBooking({
      serviceId: service.id,
      startAt,
      staffUserId: owner.id,
      roomId: room.id,
      client: { name: "First Taker", phone: freshPhone() },
      channel: "FRONT_DESK",
    });

    await expect(
      createBooking({
        serviceId: service.id,
        startAt,
        staffUserId: owner.id,
        roomId: room.id,
        client: { name: "Second Taker", phone: freshPhone() },
        channel: "FRONT_DESK",
      }),
    ).rejects.toThrow(/no longer available|just taken/i);
  });

  it("rejects a guest (no membership) online client from booking a tier-gated service, with a clear error", async () => {
    const gated = await getGatedService();
    const startAt = centerLocalToUtc(DATE, 690);

    await expect(
      createBooking({
        serviceId: gated.id,
        startAt,
        client: { name: "Guest Client", phone: freshPhone() },
        channel: "ONLINE",
      }),
    ).rejects.toThrow(/vip/i);
  });
});

describe("attribution end-to-end (public flow order: verifyOtp then createBooking)", () => {
  // The real /book wizard (book/actions.ts verifyAndBook) calls verifyOtp
  // BEFORE createBooking -- so for a brand-new phone number, verifyOtp's own
  // find-or-create is what actually inserts the ClientProfile row, and
  // createBooking's find-or-create just finds it already there. This test
  // reproduces that exact order (unlike the "createBooking" suite above,
  // which calls createBooking directly against a fresh phone and so never
  // exercises verifyOtp's find-or-create at all) to guard against the
  // ClientProfile ending up with a null sourceChannel despite an attribution
  // value being available at verification time.
  it("stores sourceChannel on both the booking and, for a brand-new client, the ClientProfile", async () => {
    const service = await getUnGatedService();
    // normalizePhone (clientAuth.ts) requires digits-only (+ optional leading
    // "+"), unlike the other tests in this file which never round-trip
    // through clientAuth -- so this can't reuse freshPhone()'s "TEST" suffix.
    const phone = `+9665${Date.now()}${phoneCounter}`;
    // 16:00 center-local -- clear of every other slot this file's preceding
    // "createBooking" tests already booked on DATE (600/630/660/690/720).
    const startAt = centerLocalToUtc(DATE, 960);

    const { devCode } = await requestOtp(phone);
    const verified = await verifyOtp(phone, devCode as string, { sourceChannel: "instagram" });
    expect(verified).not.toBeNull();

    const booking = await createBooking({
      serviceId: service.id,
      startAt,
      client: { name: "Instagram Client", phone },
      channel: "ONLINE",
      sourceChannel: "instagram",
    });

    expect(booking.sourceChannel).toBe("instagram");

    const profile = await prisma.clientProfile.findUniqueOrThrow({
      where: { userId: (verified as { userId: string }).userId },
    });
    expect(profile.sourceChannel).toBe("instagram");

    // Cleanup: this phone is digits-only (clientAuth's normalizePhone
    // requirement) so it doesn't share PHONE_PREFIX with the rest of this
    // file's fixtures and isn't swept by the top-level afterAll.
    await prisma.user.delete({ where: { id: (verified as { userId: string }).userId } });
  });
});

describe("getServiceSlots", () => {
  it("returns slots for a normal weekday, and excludes a time once both staff members are fully booked at it", async () => {
    const service = await getUnGatedService();
    const owner = await getOwner();
    const specialist = await getSpecialist();
    const rooms = await getRooms();
    const blockedStart = centerLocalToUtc(DATE, 900); // 15:00 center-local

    const before = await getServiceSlots(service.id, DATE);
    expect(before.length).toBeGreaterThan(0);
    expect(before.some((s) => s.startAt.getTime() === blockedStart.getTime())).toBe(true);

    // Exhaust both staff members at this exact start time so no (staff, room)
    // assignment remains possible, regardless of room capacity.
    await createBooking({
      serviceId: service.id,
      startAt: blockedStart,
      staffUserId: owner.id,
      roomId: rooms[0]!.id,
      client: { name: "Blocker One", phone: freshPhone() },
      channel: "FRONT_DESK",
    });
    await createBooking({
      serviceId: service.id,
      startAt: blockedStart,
      staffUserId: specialist.id,
      roomId: rooms[1]!.id,
      client: { name: "Blocker Two", phone: freshPhone() },
      channel: "FRONT_DESK",
    });

    const after = await getServiceSlots(service.id, DATE);
    expect(after.some((s) => s.startAt.getTime() === blockedStart.getTime())).toBe(false);
    // Other times on the same day remain bookable.
    expect(after.length).toBeGreaterThan(0);
  });
});

describe("lifecycle", () => {
  async function makeBooking(startMin: number) {
    const service = await getUnGatedService();
    return createBooking({
      serviceId: service.id,
      startAt: centerLocalToUtc(DATE, startMin),
      client: { name: "Lifecycle Client", phone: freshPhone() },
      channel: "ONLINE",
    });
  }

  it("checkIn then complete works", async () => {
    const booking = await makeBooking(1020); // 17:00 Riyadh, well past the exhausted 15:00 slot above
    const checkedIn = await checkIn(booking.id);
    expect(checkedIn.status).toBe("CHECKED_IN");
    const ci = await prisma.checkIn.findUnique({ where: { bookingId: booking.id } });
    expect(ci).not.toBeNull();

    const completed = await complete(booking.id);
    expect(completed.status).toBe("COMPLETED");
  });

  it("cancel on a confirmed booking works", async () => {
    const booking = await makeBooking(630 + 15 * 21);
    const cancelled = await cancel(booking.id);
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("throws on an invalid transition: completing an already-cancelled booking", async () => {
    const booking = await makeBooking(630 + 15 * 22);
    await cancel(booking.id);
    await expect(complete(booking.id)).rejects.toThrow();
  });

  it("markNoShow works from CONFIRMED", async () => {
    const booking = await makeBooking(630 + 15 * 23);
    const noShow = await markNoShow(booking.id);
    expect(noShow.status).toBe("NO_SHOW");
  });

  it("confirmBooking rejects a booking that is not REQUESTED (createBooking starts it as CONFIRMED)", async () => {
    const service = await getUnGatedService();
    const specialist = await getSpecialist();
    const rooms = await getRooms();
    // Explicit staff+room (specialist + the high-capacity Recovery Lounge) at
    // the very last valid start of the staff window, so this can't collide
    // with the auto-resolved or owner-explicit bookings other tests make.
    const booking = await createBooking({
      serviceId: service.id,
      startAt: centerLocalToUtc(DATE, 1155),
      staffUserId: specialist.id,
      roomId: rooms[2]!.id,
      client: { name: "Confirm Guard Client", phone: freshPhone() },
      channel: "ONLINE",
    });
    expect(booking.status).toBe("CONFIRMED");
    await expect(confirmBooking(booking.id)).rejects.toThrow(/confirm/i);
  });

  it("reschedule frees the old slot and takes the new one", async () => {
    const service = await getUnGatedService();
    const owner = await getOwner();
    const rooms = await getRooms();
    // Gap between old and new start must be >= the service duration (45 min)
    // so the moved appointment's window no longer overlaps the freed slot.
    const oldStart = centerLocalToUtc(DATE, 1080);
    const newStart = centerLocalToUtc(DATE, 1140);

    const booking = await createBooking({
      serviceId: service.id,
      startAt: oldStart,
      staffUserId: owner.id,
      roomId: rooms[0]!.id,
      client: { name: "Reschedule Client", phone: freshPhone() },
      channel: "FRONT_DESK",
    });

    const rescheduled = await reschedule(booking.id, newStart, owner.id, rooms[0]!.id);
    const appt = rescheduled.appointments[0]!;
    expect(appt.startAt.getTime()).toBe(newStart.getTime());

    // The old slot is free again: booking another client into it at the same
    // staff+room should now succeed.
    const another = await createBooking({
      serviceId: service.id,
      startAt: oldStart,
      staffUserId: owner.id,
      roomId: rooms[0]!.id,
      client: { name: "Takes Old Slot", phone: freshPhone() },
      channel: "FRONT_DESK",
    });
    expect(another.appointments[0]!.startAt.getTime()).toBe(oldStart.getTime());

    // And the new slot is now genuinely taken.
    await expect(
      createBooking({
        serviceId: service.id,
        startAt: newStart,
        staffUserId: owner.id,
        roomId: rooms[0]!.id,
        client: { name: "Blocked From New Slot", phone: freshPhone() },
        channel: "FRONT_DESK",
      }),
    ).rejects.toThrow();
  });

  // A dedicated Sunday, decoupled from every other booking made in this
  // file (and from LIST_DATE below), so the self-conflict check below can't
  // be affected by another test's appointment occupying an overlapping
  // window for the same staff member.
  const SELF_CONFLICT_DATE = "2026-10-04";

  it("reschedule to a time overlapping the booking's own current slot succeeds (no self-conflict)", async () => {
    const service = await getUnGatedService();
    const owner = await getOwner();
    const specialist = await getSpecialist();
    const rooms = await getRooms();
    // Shift by less than the service duration (45 min) so the new window
    // overlaps the appointment's own current window. Without an explicit
    // staffUserId/roomId, reschedule must recompute availability itself --
    // and must not treat the booking's own (not-yet-moved) appointment as a
    // conflict against itself.
    const oldStart = centerLocalToUtc(SELF_CONFLICT_DATE, 750);
    const newStart = centerLocalToUtc(SELF_CONFLICT_DATE, 765); // 15 min later, overlaps [750, 795)

    const booking = await createBooking({
      serviceId: service.id,
      startAt: oldStart,
      staffUserId: owner.id,
      roomId: rooms[0]!.id,
      client: { name: "Self Overlap Client", phone: freshPhone() },
      channel: "FRONT_DESK",
    });

    // Occupy the *other* staff member over the new window too, so owner is
    // the only staff member who could possibly serve the new time -- ruling
    // out reschedule silently succeeding by picking a different staff/room
    // combo instead of exercising the actual self-conflict path.
    await createBooking({
      serviceId: service.id,
      startAt: centerLocalToUtc(SELF_CONFLICT_DATE, 765),
      staffUserId: specialist.id,
      roomId: rooms[1]!.id,
      client: { name: "Occupies Specialist", phone: freshPhone() },
      channel: "FRONT_DESK",
    });

    const rescheduled = await reschedule(booking.id, newStart);
    const appt = rescheduled.appointments[0]!;
    expect(appt.startAt.getTime()).toBe(newStart.getTime());
    expect(appt.endAt.getTime()).toBe(newStart.getTime() + service.durationMin * 60_000);
  });
});

describe("createBooking concurrency (C1)", () => {
  // A dedicated Sunday+time, untouched by every other describe block in
  // this file. Deliberately kept close to "today" (rather than far in the
  // future, like most of this file's other fixed dates) -- e2e/
  // admin-calendar.spec.ts books a walk-in appointment on a genuinely
  // far-future date (today + 60 days or more, see FAR_FUTURE_DAYS_OUT
  // there), and a fixed date picked too far out here could eventually land
  // on the exact same day as that floating target and collide with it.
  const CONCURRENCY_DATE = "2026-09-13";

  it("under two concurrent createBooking calls for the same staff+room+time, exactly one succeeds and exactly one Appointment is created", async () => {
    const service = await getUnGatedService();
    const owner = await getOwner();
    const rooms = await getRooms();
    const room = rooms[0]!;
    const startAt = centerLocalToUtc(CONCURRENCY_DATE, 600);

    const attempt = () =>
      createBooking({
        serviceId: service.id,
        startAt,
        staffUserId: owner.id,
        roomId: room.id,
        client: { name: "Concurrent Client", phone: freshPhone() },
        channel: "FRONT_DESK",
      });

    const results = await Promise.allSettled([attempt(), attempt()]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const appointments = await prisma.appointment.findMany({
      where: { staffUserId: owner.id, startAt },
    });
    expect(appointments.length).toBe(1);
  });
});

describe("past-time guards (I1)", () => {
  it("getServiceSlots excludes already-past times for today but leaves future days unaffected", async () => {
    const service = await getUnGatedService();
    // Fix "now" to 14:00 center-local on a known open (Sunday) date, so
    // slots earlier that same day (staff window opens 10:00) are provably
    // in the past and slots later that day, and on the following (also
    // open) day, are provably still in the future -- independent of
    // whatever real-world weekday the test suite happens to run on.
    const fixedDateISO = "2026-11-01"; // Sunday -- open
    const nextDateISO = "2026-11-02"; // Monday -- also open
    const fixedNow = centerLocalToUtc(fixedDateISO, 14 * 60); // 14:00 center-local

    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    try {
      const todaySlots = await getServiceSlots(service.id, fixedDateISO);
      expect(todaySlots.length).toBeGreaterThan(0);
      for (const slot of todaySlots) {
        expect(slot.startAt.getTime()).toBeGreaterThan(fixedNow.getTime());
      }
      const pastSlot = centerLocalToUtc(fixedDateISO, 600); // 10:00, before fixedNow
      expect(todaySlots.some((s) => s.startAt.getTime() === pastSlot.getTime())).toBe(false);

      // A future day is untouched by the past-time filter: its own
      // (still-future) morning slot remains bookable.
      const nextDaySlots = await getServiceSlots(service.id, nextDateISO);
      const morningSlotNextDay = centerLocalToUtc(nextDateISO, 600);
      expect(nextDaySlots.some((s) => s.startAt.getTime() === morningSlotNextDay.getTime())).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("createBooking rejects a startAt in the past", async () => {
    const service = await getUnGatedService();
    const pastStart = new Date(Date.now() - 60 * 60 * 1000);

    await expect(
      createBooking({
        serviceId: service.id,
        startAt: pastStart,
        client: { name: "Past Client", phone: freshPhone() },
        channel: "ONLINE",
      }),
    ).rejects.toThrow(/past/i);
  });

  it("reschedule rejects a newStartAt in the past", async () => {
    const service = await getUnGatedService();
    const booking = await createBooking({
      serviceId: service.id,
      startAt: centerLocalToUtc(DATE, 630 + 15 * 24),
      client: { name: "Reschedule Past Guard Client", phone: freshPhone() },
      channel: "ONLINE",
    });

    await expect(reschedule(booking.id, new Date(Date.now() - 60 * 60 * 1000))).rejects.toThrow(/past/i);
  });
});

describe("REMINDER_24H scheduling (I3)", () => {
  it("omits REMINDER_24H for a booking made within 24h of its appointment, but still schedules CONFIRMATION + POST_VISIT", async () => {
    const service = await getUnGatedService();
    // A genuinely free slot 1-20h out: comfortably short notice (sendAt =
    // startAt-24h is already in the past) while leaving margin against the
    // test's own execution time.
    const slot = await findFreeSlotWithinHours(service.id, 1, 20);

    const booking = await createBooking({
      serviceId: service.id,
      startAt: slot.startAt,
      staffUserId: slot.staffUserId,
      roomId: slot.roomId,
      client: { name: "Short Notice Client", phone: freshPhone() },
      channel: "FRONT_DESK",
    });

    const messages = await prisma.scheduledMessage.findMany({ where: { bookingId: booking.id } });
    const kinds = messages.map((m) => m.kind).sort();
    expect(kinds).toEqual(["CONFIRMATION", "POST_VISIT"]);
  });

  it("schedules all three messages, including REMINDER_24H, for a booking more than 24h out", async () => {
    const service = await getUnGatedService();
    // A genuinely free slot 30h+ out: comfortably past the 24h cutoff.
    const slot = await findFreeSlotWithinHours(service.id, 30, 300);

    const booking = await createBooking({
      serviceId: service.id,
      startAt: slot.startAt,
      staffUserId: slot.staffUserId,
      roomId: slot.roomId,
      client: { name: "Plenty Of Notice Client", phone: freshPhone() },
      channel: "FRONT_DESK",
    });

    const messages = await prisma.scheduledMessage.findMany({ where: { bookingId: booking.id } });
    const kinds = messages.map((m) => m.kind).sort();
    expect(kinds).toEqual(["CONFIRMATION", "POST_VISIT", "REMINDER_24H"]);
  });
});

describe("listBookings / getBooking", () => {
  // A separate Sunday, entirely decoupled from the other describe blocks'
  // bookings, so this test's date-scoped list assertion can't be affected
  // by (or accidentally affect) their appointments.
  const LIST_DATE = "2026-09-20";

  it("lists bookings filtered by date and finds one by id", async () => {
    const service = await getUnGatedService();
    const phone = freshPhone();
    const startAt = centerLocalToUtc(LIST_DATE, 600);
    const created = await createBooking({
      serviceId: service.id,
      startAt,
      client: { name: "List Client", phone },
      channel: "ONLINE",
    });

    const fetched = await getBooking(created.id);
    expect(fetched?.id).toBe(created.id);

    const listed = await listBookings({ date: LIST_DATE });
    expect(listed.some((b) => b.id === created.id)).toBe(true);
  });
});
