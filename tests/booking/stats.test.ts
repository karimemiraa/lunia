import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { centerLocalToUtc, weekdayForDateISO } from "@/modules/booking/availability";
import { createBooking } from "@/modules/booking/bookings";
import { bookingStats, upcomingAppointmentsCount } from "@/modules/booking/stats";

// All dates here are Sundays in 2027 (weekday 0 -> seeded staff schedules +
// business hours are open) chosen far from any date used by other booking
// test suites, so this suite never collides with a concurrently-run file's
// data (vitest runs booking test files serially: fileParallelism:false).
const D_PRE_RANGE = "2027-02-21"; // Sunday, before `from` -- client C's real first booking
const D1 = "2027-03-07"; // in range
const D2 = "2027-03-14"; // in range
const D3 = "2027-03-21"; // in range
const D4 = "2027-03-28"; // in range
const D_POST_RANGE = "2027-04-04"; // Sunday, after `to` -- excluded entirely

const RANGE_FROM = centerLocalToUtc("2027-03-01", 0);
const RANGE_TO = centerLocalToUtc("2027-03-29", 0); // exclusive upper bound

const PHONE_PREFIX = `+9665STATS${Date.now()}`;
let phoneCounter = 0;
function freshPhone(): string {
  phoneCounter += 1;
  return `${PHONE_PREFIX}${phoneCounter}`;
}

async function getDiagnosticService() {
  return prisma.service.findUniqueOrThrow({ where: { slug: "diagnostic-skin-analysis" } });
}

async function getLedService() {
  return prisma.service.findUniqueOrThrow({ where: { slug: "led-light-therapy" } });
}

/** Books `serviceId` for `phone` at 10:00 center-local on `dateISO`, then
 * overrides the booking's createdAt/status/sourceChannel to fixed test
 * values (createBooking always stamps createdAt=now()/status=CONFIRMED, so
 * this is the only way to get deterministic, spread-out fixture data). */
async function makeBooking(params: {
  serviceId: string;
  phone: string;
  name: string;
  dateISO: string;
  status: "CONFIRMED" | "COMPLETED" | "CANCELLED";
  sourceChannel?: string;
}) {
  const startAt = centerLocalToUtc(params.dateISO, 600); // 10:00 center-local
  const booking = await createBooking({
    serviceId: params.serviceId,
    startAt,
    client: { name: params.name, phone: params.phone },
    channel: "ONLINE",
    sourceChannel: params.sourceChannel,
  });
  const createdAt = centerLocalToUtc(params.dateISO, 720); // noon center-local, unambiguous day bucket
  await prisma.booking.update({
    where: { id: booking.id },
    data: { createdAt, status: params.status },
  });
  return booking.id;
}

describe("bookingStats", () => {
  let diagnosticId: string;
  let ledId: string;
  let bookingA1: string;
  let bookingA2: string;
  let bookingB1: string;
  let bookingCPre: string;
  let bookingCInRange: string;
  let bookingD: string;

  beforeAll(async () => {
    const [diagnostic, led] = await Promise.all([getDiagnosticService(), getLedService()]);
    diagnosticId = diagnostic.id;
    ledId = led.id;

    const phoneA = freshPhone();
    const phoneB = freshPhone();
    const phoneC = freshPhone();
    const phoneD = freshPhone();

    // Client A: first-ever booking in range (new), second in range (returning).
    bookingA1 = await makeBooking({
      serviceId: diagnosticId,
      phone: phoneA,
      name: "Client A",
      dateISO: D1,
      status: "COMPLETED",
      sourceChannel: "instagram",
    });
    bookingA2 = await makeBooking({
      serviceId: ledId,
      phone: phoneA,
      name: "Client A",
      dateISO: D3,
      status: "CONFIRMED",
      // no sourceChannel -> should bucket as "direct"
    });

    // Client B: single in-range booking (new).
    bookingB1 = await makeBooking({
      serviceId: diagnosticId,
      phone: phoneB,
      name: "Client B",
      dateISO: D2,
      status: "COMPLETED",
      sourceChannel: "google",
    });

    // Client C: real first booking BEFORE the range, then an in-range
    // booking that must be classified "returning" (not new) even though
    // it's the only one of theirs inside [from,to).
    bookingCPre = await makeBooking({
      serviceId: diagnosticId,
      phone: phoneC,
      name: "Client C",
      dateISO: D_PRE_RANGE,
      status: "COMPLETED",
    });
    bookingCInRange = await makeBooking({
      serviceId: ledId,
      phone: phoneC,
      name: "Client C",
      dateISO: D4,
      status: "CANCELLED",
      sourceChannel: "instagram",
    });

    // Client D: booking entirely after the range -- must not appear at all.
    bookingD = await makeBooking({
      serviceId: diagnosticId,
      phone: phoneD,
      name: "Client D",
      dateISO: D_POST_RANGE,
      status: "COMPLETED",
    });
  });

  afterAll(async () => {
    const bookingIds = [bookingA1, bookingA2, bookingB1, bookingCPre, bookingCInRange, bookingD];
    await prisma.scheduledMessage.deleteMany({ where: { bookingId: { in: bookingIds } } });
    // Deleting the User cascades ClientProfile -> Booking -> Appointment/CheckIn.
    await prisma.user.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
  });

  it("computes totals, status breakdown, and realized (COMPLETED-only) revenue over [from,to)", async () => {
    const stats = await bookingStats({ from: RANGE_FROM, to: RANGE_TO });

    // Only A1, B1, A2, C-in-range fall in range; C-pre and D are excluded.
    expect(stats.totalBookings).toBe(4);
    expect(stats.byStatus).toEqual({ COMPLETED: 2, CONFIRMED: 1, CANCELLED: 1 });

    // Realized revenue = COMPLETED only: A1 (diagnostic) + B1 (diagnostic).
    const diagnosticPrice = (await getDiagnosticService()).priceMinor;
    expect(stats.revenueMinor).toBe(diagnosticPrice * 2);
  });

  it("classifies new vs returning by each client's earliest booking ever, not just in-range history", async () => {
    const stats = await bookingStats({ from: RANGE_FROM, to: RANGE_TO });

    // New: A1 (client A's first ever) + B1 (client B's first ever) = 2.
    // Returning: A2 (client A already booked A1) + C-in-range (client C's
    // real first booking was before the range) = 2.
    expect(stats.newClients).toBe(2);
    expect(stats.returningBookings).toBe(2);
    expect(stats.newClients + stats.returningBookings).toBe(stats.totalBookings);
  });

  it("buckets bookings and revenue by center-local day", async () => {
    const stats = await bookingStats({ from: RANGE_FROM, to: RANGE_TO });
    const byDate = Object.fromEntries(stats.byDay.map((d) => [d.date, d]));

    const diagnosticPrice = (await getDiagnosticService()).priceMinor;

    expect(byDate[D1]).toEqual({ date: D1, bookings: 1, revenueMinor: diagnosticPrice });
    expect(byDate[D2]).toEqual({ date: D2, bookings: 1, revenueMinor: diagnosticPrice });
    expect(byDate[D3]).toEqual({ date: D3, bookings: 1, revenueMinor: 0 });
    expect(byDate[D4]).toEqual({ date: D4, bookings: 1, revenueMinor: 0 });
    expect(byDate[D_PRE_RANGE]).toBeUndefined();
    expect(byDate[D_POST_RANGE]).toBeUndefined();
  });

  it("breaks bookings and realized revenue down by service", async () => {
    const stats = await bookingStats({ from: RANGE_FROM, to: RANGE_TO });
    const byService = Object.fromEntries(stats.byService.map((s) => [s.serviceId, s]));

    const diagnosticPrice = (await getDiagnosticService()).priceMinor;

    expect(byService[diagnosticId]).toEqual({
      serviceId: diagnosticId,
      name: "Diagnostic Skin Analysis",
      bookings: 2, // A1, B1
      revenueMinor: diagnosticPrice * 2,
    });
    expect(byService[ledId]).toEqual({
      serviceId: ledId,
      name: "LED Light Therapy",
      bookings: 2, // A2, C-in-range
      revenueMinor: 0, // neither COMPLETED
    });
  });

  it("groups bookings by source channel, bucketing a missing sourceChannel as 'direct'", async () => {
    const stats = await bookingStats({ from: RANGE_FROM, to: RANGE_TO });
    const bySource = Object.fromEntries(stats.bySource.map((s) => [s.source, s.bookings]));

    expect(bySource.instagram).toBe(2); // A1, C-in-range
    expect(bySource.google).toBe(1); // B1
    expect(bySource.direct).toBe(1); // A2 (no sourceChannel)
  });

  it("returns an empty-but-well-formed result for a range with no bookings", async () => {
    const stats = await bookingStats({
      from: centerLocalToUtc("2020-01-01", 0),
      to: centerLocalToUtc("2020-01-02", 0),
    });
    expect(stats).toEqual({
      totalBookings: 0,
      byStatus: {},
      revenueMinor: 0,
      newClients: 0,
      returningBookings: 0,
      byDay: [],
      byService: [],
      bySource: [],
    });
  });
});

// Sundays far in 2032 -- year unused by any other suite -- so this block
// never collides with concurrently-run fixture data.
function nextWeekday(fromISO: string, targetWeekday: number): string {
  let cursor = fromISO;
  for (let i = 0; i < 30; i++) {
    if (weekdayForDateISO(cursor) === targetWeekday) return cursor;
    const next = new Date(`${cursor}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next.toISOString().slice(0, 10);
  }
  throw new Error(`No weekday ${targetWeekday} found near ${fromISO}`);
}

describe("upcomingAppointmentsCount", () => {
  const FUTURE_SUNDAY = nextWeekday("2032-01-01", 0); // relative to CUTOFF, this is "the future"
  const PAST_SUNDAY = nextWeekday("2031-11-01", 0); // relative to CUTOFF, this is "the past"
  const CUTOFF = centerLocalToUtc(nextWeekday("2031-12-01", 0), 0);

  const PHONE_PREFIX = `+9665UPCOMING${Date.now()}`;
  let phoneCounter = 0;
  function freshPhone(): string {
    phoneCounter += 1;
    return `${PHONE_PREFIX}${phoneCounter}`;
  }

  let confirmedFutureId: string;
  let cancelledFutureId: string;
  let confirmedPastId: string; // appointment moved into the past after creation

  beforeAll(async () => {
    const diagnostic = await prisma.service.findUniqueOrThrow({ where: { slug: "diagnostic-skin-analysis" } });

    const confirmedFuture = await createBooking({
      serviceId: diagnostic.id,
      startAt: centerLocalToUtc(FUTURE_SUNDAY, 600),
      client: { name: "Upcoming Confirmed", phone: freshPhone() },
      channel: "ONLINE",
    });
    confirmedFutureId = confirmedFuture.id;

    const cancelledFuture = await createBooking({
      serviceId: diagnostic.id,
      startAt: centerLocalToUtc(FUTURE_SUNDAY, 660),
      client: { name: "Upcoming Cancelled", phone: freshPhone() },
      channel: "ONLINE",
    });
    cancelledFutureId = cancelledFuture.id;
    await prisma.booking.update({ where: { id: cancelledFutureId }, data: { status: "CANCELLED" } });

    // Book a valid future slot, then relocate the appointment itself into the
    // past (createBooking refuses past-time bookings directly).
    const confirmedPast = await createBooking({
      serviceId: diagnostic.id,
      startAt: centerLocalToUtc(FUTURE_SUNDAY, 720),
      client: { name: "Formerly Upcoming", phone: freshPhone() },
      channel: "ONLINE",
    });
    confirmedPastId = confirmedPast.id;
    const pastStart = centerLocalToUtc(PAST_SUNDAY, 600);
    const pastEnd = centerLocalToUtc(PAST_SUNDAY, 660);
    await prisma.appointment.updateMany({
      where: { bookingId: confirmedPastId },
      data: { startAt: pastStart, endAt: pastEnd },
    });
  });

  afterAll(async () => {
    const bookingIds = [confirmedFutureId, cancelledFutureId, confirmedPastId];
    await prisma.scheduledMessage.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.user.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
  });

  it("counts only CONFIRMED/CHECKED_IN appointments at or after the cutoff", async () => {
    const count = await upcomingAppointmentsCount(CUTOFF);
    expect(count).toBeGreaterThanOrEqual(1);

    // Confirm the specific fixtures behave as expected relative to CUTOFF by
    // checking a narrower window that only this suite's data can populate.
    const inWindow = await prisma.appointment.count({
      where: {
        bookingId: { in: [confirmedFutureId, cancelledFutureId, confirmedPastId] },
        startAt: { gte: CUTOFF },
        booking: { status: { in: ["CONFIRMED", "CHECKED_IN"] } },
      },
    });
    expect(inWindow).toBe(1); // only confirmedFutureId
  });
});
