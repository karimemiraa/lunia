import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { centerLocalToUtc, utcToCenterLocal, weekdayForDateISO } from "@/modules/booking/availability";
import { createBooking, getServiceSlots, getBooking } from "@/modules/booking/bookings";
import { previewSeries, createSeries, cancelSeriesFrom, seriesPositions } from "@/modules/booking/series";

// Recurring series against the real availability engine. Dates are a random
// Sunday 2–3 years out so no other suite or e2e run touches them.

const PHONE_PREFIX = "+9665TESTSERIES";
let n = 0;
const phone = () => `${PHONE_PREFIX}${Date.now().toString().slice(-6)}${(n += 1)}`;

function sundayAt(daysOut: number): string {
  let t = Date.now() + daysOut * 86_400_000;
  for (;;) {
    const iso = utcToCenterLocal(new Date(t)).dateISO;
    if (weekdayForDateISO(iso) === 0) return iso;
    t += 86_400_000;
  }
}
const addDays = (iso: string, d: number) => utcToCenterLocal(new Date(centerLocalToUtc(iso, 720).getTime() + d * 86_400_000)).dateISO;
const BASE = sundayAt(800 + Math.floor(Math.random() * 300));

let serviceId = "";

async function sweep() {
  const users = await prisma.user.findMany({ where: { phone: { startsWith: PHONE_PREFIX } }, include: { clientProfile: true } });
  const ids = users.map((u) => u.clientProfile?.id).filter((x): x is string => !!x);
  const bookings = await prisma.booking.findMany({ where: { clientProfileId: { in: ids } }, select: { id: true } });
  await prisma.scheduledMessage.deleteMany({ where: { bookingId: { in: bookings.map((b) => b.id) } } });
  await prisma.bookingSeries.deleteMany({ where: { clientProfileId: { in: ids } } });
  await prisma.user.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
}

beforeAll(async () => {
  await sweep();
  serviceId = (await prisma.service.findUniqueOrThrow({ where: { slug: "diagnostic-skin-analysis" } })).id;
});
afterAll(sweep);

describe("recurring series", () => {
  it("books every free date, skips a full one, and sends one confirmation", async () => {
    const first = centerLocalToUtc(BASE, 11 * 60);
    // Fill the 3rd date's 11:00 completely (every free specialist/room).
    const blockedISO = addDays(BASE, 14);
    const blockedAt = centerLocalToUtc(blockedISO, 11 * 60);
    for (;;) {
      const free = (await getServiceSlots(serviceId, blockedISO)).filter((s) => s.startAt.getTime() === blockedAt.getTime());
      if (free.length === 0) break;
      await createBooking({ serviceId, startAt: blockedAt, staffUserId: free[0]!.staffUserId, roomId: free[0]!.roomId, client: { name: "Blocker", phone: phone() }, channel: "FRONT_DESK" });
    }

    const preview = await previewSeries({ serviceId, firstStartAt: first, intervalWeeks: 1, count: 4 });
    expect(preview.map((o) => [o.dateISO, o.available])).toEqual([
      [BASE, true],
      [addDays(BASE, 7), true],
      [blockedISO, false],
      [addDays(BASE, 21), true],
    ]);

    const result = await createSeries({ serviceId, firstStartAt: first, intervalWeeks: 1, count: 4, client: { name: "Series Client", phone: phone() } });
    expect(result.booked).toHaveLength(3);
    expect(result.skipped.map((s) => utcToCenterLocal(s.startAt).dateISO)).toEqual([blockedISO]);

    // Same customer, same 11:00 wall-clock time, linked to the series.
    const bookings = await Promise.all(result.booked.map((b) => getBooking(b.bookingId)));
    expect(new Set(bookings.map((b) => b!.clientProfileId)).size).toBe(1);
    expect(bookings.every((b) => utcToCenterLocal(b!.appointments[0]!.startAt).minutes === 660)).toBe(true);
    expect((await prisma.booking.findMany({ where: { seriesId: result.seriesId } })).length).toBe(3);

    // One confirmation for the series; every visit keeps its reminder.
    const msgs = await prisma.scheduledMessage.findMany({ where: { bookingId: { in: result.booked.map((b) => b.bookingId) } } });
    expect(msgs.filter((m) => m.kind === "CONFIRMATION" && m.status === "PENDING")).toHaveLength(1);
    expect(msgs.filter((m) => m.kind === "REMINDER_24H" && m.status === "PENDING")).toHaveLength(3);

    const pos = await seriesPositions([result.seriesId]);
    expect(pos.get(result.booked[1]!.bookingId)).toEqual({ position: 2, total: 3 });
  });

  it("cancels this and following, keeping earlier visits", async () => {
    const first = centerLocalToUtc(addDays(BASE, 70), 13 * 60);
    const result = await createSeries({ serviceId, firstStartAt: first, intervalWeeks: 2, count: 4, client: { name: "Series Cancel", phone: phone() } });
    expect(result.booked).toHaveLength(4);
    const cancelled = await cancelSeriesFrom(result.booked[1]!.bookingId);
    expect(cancelled).toBe(3);
    const statuses = await Promise.all(result.booked.map(async (b) => (await getBooking(b.bookingId))!.status));
    expect(statuses).toEqual(["CONFIRMED", "CANCELLED", "CANCELLED", "CANCELLED"]);
    // Cancelled visits don't send reminders.
    const reminders = await prisma.scheduledMessage.count({ where: { bookingId: { in: result.booked.slice(1).map((b) => b.bookingId) }, kind: "REMINDER_24H", status: "PENDING" } });
    expect(reminders).toBe(0);
  });

  it("validates the pattern", async () => {
    await expect(previewSeries({ serviceId, firstStartAt: new Date(), intervalWeeks: 0, count: 4 })).rejects.toThrow();
    await expect(previewSeries({ serviceId, firstStartAt: new Date(), intervalWeeks: 1, count: 60 })).rejects.toThrow();
  });
});
