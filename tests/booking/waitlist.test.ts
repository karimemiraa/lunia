import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { utcToCenterLocal, weekdayForDateISO } from "@/modules/booking/availability";
import { getServiceSlots, createBooking, cancel } from "@/modules/booking/bookings";
import { joinWaitlist, notifyWaitlistForSlot } from "@/modules/booking/waitlist";

// Same randomized-far-future-date strategy as tests/booking/bookings.test.ts
// (see the comment there): this suite also books real slots against the
// shared seeded service/staff/rooms in a persistent dev database, so it
// needs dates that won't collide across runs or with other suites.
const RUN_BASE_DAYS_OUT = 120 + Math.floor(Math.random() * 280);

function openDateAt(daysOut: number): string {
  let t = Date.now() + daysOut * 86_400_000;
  for (;;) {
    const dateISO = utcToCenterLocal(new Date(t)).dateISO;
    if (weekdayForDateISO(dateISO) <= 4) return dateISO;
    t += 86_400_000;
  }
}

// Offsets are spaced 10 apart (not 1) so that after openDateAt's forward
// snap-to-next-open-weekday (at most +2 days, since Fri/Sat are closed), two
// different offsets can never collapse onto the same calendar date -- a gap
// of just 1 (e.g. +15 and +16) can both land on the same weekend and snap
// forward to the same following Sunday, silently merging two tests' data.
const JOIN_DATE = openDateAt(RUN_BASE_DAYS_OUT);
const NOTIFY_DATE = openDateAt(RUN_BASE_DAYS_OUT + 10);
const BOUNDED_DATE = openDateAt(RUN_BASE_DAYS_OUT + 20);
const ISOLATION_DATE = openDateAt(RUN_BASE_DAYS_OUT + 30);
const OTHER_DATE = openDateAt(RUN_BASE_DAYS_OUT + 40);
const CANCEL_HOOK_DATE = openDateAt(RUN_BASE_DAYS_OUT + 50);
const NO_WAITER_DATE = openDateAt(RUN_BASE_DAYS_OUT + 60);

const PHONE_PREFIX = `+9665TESTWAITLIST`;
let phoneCounter = 0;
function freshPhone(): string {
  phoneCounter += 1;
  return `${PHONE_PREFIX}${phoneCounter}`;
}

// Cleans up everything this suite creates: standalone WaitlistEntry rows
// (walk-up, no ClientProfile) by their phone prefix, any ScheduledMessage
// rows addressed to those phones (waitlist-notify messages carry no
// bookingId), and -- for the cancel() hook test, which books a real
// appointment -- the phone-prefixed User/ClientProfile/Booking/Appointment
// tree plus its booking-linked ScheduledMessage rows (bookingId is a soft
// reference, not cascaded), mirroring bookings.test.ts's sweep.
async function sweep() {
  const users = await prisma.user.findMany({ where: { phone: { startsWith: PHONE_PREFIX } }, include: { clientProfile: true } });
  const clientProfileIds = users.map((u) => u.clientProfile?.id).filter((id): id is string => !!id);
  if (clientProfileIds.length > 0) {
    const bookings = await prisma.booking.findMany({ where: { clientProfileId: { in: clientProfileIds } } });
    const bookingIds = bookings.map((b) => b.id);
    if (bookingIds.length > 0) {
      await prisma.scheduledMessage.deleteMany({ where: { bookingId: { in: bookingIds } } });
    }
  }
  await prisma.scheduledMessage.deleteMany({ where: { toPhone: { startsWith: PHONE_PREFIX } } });
  await prisma.waitlistEntry.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
  await prisma.user.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
}

beforeAll(async () => {
  await sweep();
});

afterAll(async () => {
  await sweep();
});

async function getUnGatedService() {
  return prisma.service.findUniqueOrThrow({ where: { slug: "diagnostic-skin-analysis" } });
}

describe("joinWaitlist", () => {
  it("creates a WAITING entry given a walk-up phone contact", async () => {
    const service = await getUnGatedService();
    const phone = freshPhone();

    const entry = await joinWaitlist({
      serviceId: service.id,
      desiredDateISO: JOIN_DATE,
      phone,
      name: "Waiting Client",
    });

    expect(entry.status).toBe("WAITING");
    expect(entry.serviceId).toBe(service.id);
    expect(entry.desiredDateISO).toBe(JOIN_DATE);
    expect(entry.phone).toBe(phone);
    expect(entry.clientProfileId).toBeNull();
    expect(entry.notifiedAt).toBeNull();
  });

  it("accepts an email-only contact", async () => {
    const service = await getUnGatedService();
    const entry = await joinWaitlist({
      serviceId: service.id,
      desiredDateISO: JOIN_DATE,
      email: `waitlist-${Date.now()}@example.com`,
      name: "Email Client",
    });
    expect(entry.status).toBe("WAITING");
  });

  it("rejects an entry with neither a clientProfileId nor a phone/email contact", async () => {
    const service = await getUnGatedService();
    await expect(
      joinWaitlist({ serviceId: service.id, desiredDateISO: JOIN_DATE, name: "No Contact" }),
    ).rejects.toThrow();
  });

  it("throws for an unknown service", async () => {
    await expect(
      joinWaitlist({ serviceId: "does-not-exist", desiredDateISO: JOIN_DATE, phone: freshPhone() }),
    ).rejects.toThrow(/not found/);
  });
});

describe("notifyWaitlistForSlot", () => {
  it("schedules a WAITLIST_OPEN message for a matching WAITING entry and flips it to NOTIFIED", async () => {
    const service = await getUnGatedService();
    const phone = freshPhone();
    const entry = await joinWaitlist({ serviceId: service.id, desiredDateISO: NOTIFY_DATE, phone, locale: "en" });

    const notifiedCount = await notifyWaitlistForSlot(service.id, NOTIFY_DATE);
    expect(notifiedCount).toBe(1);

    const updated = await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(updated.status).toBe("NOTIFIED");
    expect(updated.notifiedAt).not.toBeNull();

    const messages = await prisma.scheduledMessage.findMany({ where: { kind: "WAITLIST_OPEN", toPhone: phone } });
    expect(messages.length).toBe(1);
    expect(messages[0]!.status).toBe("PENDING");
    expect(messages[0]!.locale).toBe("en");
    expect(messages[0]!.sendAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("notifies at most the bounded limit, oldest entries first, leaving the rest WAITING", async () => {
    const service = await getUnGatedService();
    const phones = [freshPhone(), freshPhone(), freshPhone(), freshPhone()];
    for (const phone of phones) {
      await joinWaitlist({ serviceId: service.id, desiredDateISO: BOUNDED_DATE, phone });
    }

    const notifiedCount = await notifyWaitlistForSlot(service.id, BOUNDED_DATE, { limit: 3 });
    expect(notifiedCount).toBe(3);

    const waitingLeft = await prisma.waitlistEntry.count({
      where: { serviceId: service.id, desiredDateISO: BOUNDED_DATE, status: "WAITING" },
    });
    expect(waitingLeft).toBe(1);

    const notified = await prisma.waitlistEntry.count({
      where: { serviceId: service.id, desiredDateISO: BOUNDED_DATE, status: "NOTIFIED" },
    });
    expect(notified).toBe(3);
  });

  it("does not notify entries for a different date, and returns 0 when none are waiting", async () => {
    const service = await getUnGatedService();
    const phone = freshPhone();
    await joinWaitlist({ serviceId: service.id, desiredDateISO: OTHER_DATE, phone });

    const notifiedCount = await notifyWaitlistForSlot(service.id, ISOLATION_DATE);
    expect(notifiedCount).toBe(0);

    const untouched = await prisma.waitlistEntry.findFirstOrThrow({ where: { phone, serviceId: service.id } });
    expect(untouched.status).toBe("WAITING");
  });
});

describe("cancel() waitlist hook", () => {
  it("frees a slot and schedules a WAITLIST_OPEN message for a client waiting on that service+day", async () => {
    const service = await getUnGatedService();
    const slots = await getServiceSlots(service.id, CANCEL_HOOK_DATE);
    expect(slots.length).toBeGreaterThan(0);
    const slot = slots[0]!;

    const waitingPhone = freshPhone();
    await joinWaitlist({ serviceId: service.id, desiredDateISO: CANCEL_HOOK_DATE, phone: waitingPhone });

    const booking = await createBooking({
      serviceId: service.id,
      startAt: slot.startAt,
      staffUserId: slot.staffUserId,
      roomId: slot.roomId,
      client: { name: "Cancel Hook Client", phone: freshPhone() },
      channel: "FRONT_DESK",
    });

    await cancel(booking.id);

    const entry = await prisma.waitlistEntry.findFirstOrThrow({
      where: { phone: waitingPhone, serviceId: service.id, desiredDateISO: CANCEL_HOOK_DATE },
    });
    expect(entry.status).toBe("NOTIFIED");
    expect(entry.notifiedAt).not.toBeNull();

    const messages = await prisma.scheduledMessage.findMany({ where: { kind: "WAITLIST_OPEN", toPhone: waitingPhone } });
    expect(messages.length).toBe(1);
    expect(messages[0]!.status).toBe("PENDING");
  });

  it("never throws when there is no one waiting (best-effort, cancel still succeeds)", async () => {
    const service = await getUnGatedService();
    const slots = await getServiceSlots(service.id, NO_WAITER_DATE);
    expect(slots.length).toBeGreaterThan(0);
    const slot = slots[0]!;

    const booking = await createBooking({
      serviceId: service.id,
      startAt: slot.startAt,
      staffUserId: slot.staffUserId,
      roomId: slot.roomId,
      client: { name: "No Waiter Client", phone: freshPhone() },
      channel: "FRONT_DESK",
    });

    const cancelled = await cancel(booking.id);
    expect(cancelled.status).toBe("CANCELLED");
  });
});
