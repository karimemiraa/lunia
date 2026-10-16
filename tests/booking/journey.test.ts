import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { centerLocalToUtc } from "@/modules/booking/availability";
import { checkIn, complete, startService } from "@/modules/booking/bookings";
import {
  receive, startTreatment, finishTreatment, overridePayment, reassign, availableSpecialists, markRoomReady,
  getBoard, visitTimeline, visitDurations, flowMetrics, paymentState, needsConsultation, waitingForStaff,
} from "@/modules/booking/journey";

// The in-clinic visit journey (docs/PRD-visit-journey.md), against the real DB.
// Visits are created directly in 2037 so the day board only sees this suite's rows.

const TAG = "TESTJOURNEY";
const PHONE = "+9665TESTJRNY";
let n = 0;
const uid = () => `${Date.now().toString(36)}${(n++).toString(36)}`;
const DAY = "2037-03-15"; // a Sunday
const at = (hhmm: string) => centerLocalToUtc(DAY, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));

let serviceId = "";
let paidServiceId = "";
let staffA = "";
let staffB = "";
let roomId = "";
let frontDesk = "";

async function client(name = `${TAG} Client`) {
  const u = await prisma.user.create({ data: { type: "CLIENT", phone: `${PHONE}${uid()}`, clientProfile: { create: { fullName: name } } }, include: { clientProfile: true } });
  return u.clientProfile!.id;
}

async function booking(opts: { clientProfileId?: string; start?: string; service?: string; staff?: string } = {}) {
  const startAt = at(opts.start ?? "10:00");
  return prisma.booking.create({
    data: {
      clientProfileId: opts.clientProfileId ?? (await client()),
      status: "CONFIRMED",
      appointments: { create: { serviceId: opts.service ?? serviceId, staffUserId: opts.staff ?? staffA, roomId, startAt, endAt: new Date(startAt.getTime() + 45 * 60_000) } },
    },
  });
}

async function stage(bookingId: string) {
  return (await prisma.checkIn.findUniqueOrThrow({ where: { bookingId } })).stage;
}

beforeAll(async () => {
  const slug = `testjourney-${uid()}`;
  const dept = await prisma.department.create({ data: { slug, nameEn: "T", nameAr: "ت", taglineEn: "", taglineAr: "", descEn: "", descAr: "" } });
  const svc = (data: object) => prisma.service.create({ data: { departmentId: dept.id, nameAr: "جلسة", summaryEn: "", summaryAr: "", benefitsEn: [], benefitsAr: [], priceMinor: 30_000, durationMin: 45, ...data } as never });
  serviceId = (await svc({ slug, nameEn: "Journey Facial" })).id;
  paidServiceId = (await svc({ slug: `${slug}-paid`, nameEn: "Journey Laser", payBeforeTreatment: true })).id;
  const staff = async (name: string) =>
    (await prisma.user.create({ data: { type: "STAFF", isActive: true, email: `${TAG.toLowerCase()}-${uid()}@test.local`, staffProfile: { create: { fullName: name } } } })).id;
  staffA = await staff(`${TAG} Lina`);
  staffB = await staff(`${TAG} Hana`);
  frontDesk = await staff(`${TAG} Sara`);
  roomId = (await prisma.room.create({ data: { name: `${TAG} room ${uid()}` } })).id;
});

afterAll(async () => {
  const clients = await prisma.clientProfile.findMany({ where: { user: { phone: { startsWith: PHONE } } }, select: { id: true } });
  const ids = clients.map((c) => c.id);
  await prisma.invoice.deleteMany({ where: { booking: { clientProfileId: { in: ids } } } as never }).catch(() => undefined);
  await prisma.booking.deleteMany({ where: { clientProfileId: { in: ids } } });
  await prisma.user.deleteMany({ where: { OR: [{ phone: { startsWith: PHONE } }, { email: { startsWith: TAG.toLowerCase() } }] } });
  await prisma.room.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.service.deleteMany({ where: { slug: { startsWith: "testjourney-" } } });
  await prisma.department.deleteMany({ where: { slug: { startsWith: "testjourney-" } } });
});

describe("visit journey", () => {
  it("walks a full visit and records who took over at every step", async () => {
    const regular = await client();
    // A completed earlier visit, so this is not a first visit (no consultation).
    const earlier = await booking({ clientProfileId: regular, start: "08:00" });
    await prisma.booking.update({ where: { id: earlier.id }, data: { status: "COMPLETED" } });

    const b = await booking({ clientProfileId: regular });
    await checkIn(b.id, frontDesk);
    expect(await stage(b.id)).toBe("WAITING");
    expect(await waitingForStaff(staffA)).toEqual(expect.arrayContaining([expect.objectContaining({ bookingId: b.id })]));

    expect(await receive(b.id, staffA)).toBe("TREATMENT");
    await finishTreatment(b.id, staffA);
    expect(await stage(b.id)).toBe("CHECKOUT");
    expect((await prisma.room.findUniqueOrThrow({ where: { id: roomId } })).preparingSince).not.toBeNull();

    await complete(b.id, frontDesk);
    expect(await stage(b.id)).toBe("DONE");
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("COMPLETED");

    const timeline = await visitTimeline(b.id);
    expect(timeline.map((e) => e.kind)).toEqual(["arrived", "received", "treatment_finished", "checked_out"]);
    expect(timeline[0]!.byName).toBe(`${TAG} Sara`);
    expect(timeline[1]!.byName).toBe(`${TAG} Lina`);
    await markRoomReady(roomId);
  });

  it("starts first visits and diagnostic services with a consultation", async () => {
    const b = await booking();
    expect(await needsConsultation(b.id)).toBe(true); // brand-new customer
    await checkIn(b.id, frontDesk);
    expect(await receive(b.id, staffA)).toBe("CONSULTATION");
    await startTreatment(b.id, staffA);
    expect(await stage(b.id)).toBe("TREATMENT");
    // The old calendar "Start" button is still safe to press.
    await startService(b.id, staffA);
    expect(await stage(b.id)).toBe("TREATMENT");
  });

  it("keeps pay-before customers out of the room until paid or let in", async () => {
    const b = await booking({ service: paidServiceId });
    await checkIn(b.id, frontDesk);
    expect((await paymentState(b.id)).required).toBe(true);
    await expect(receive(b.id, staffA, { consultation: false })).rejects.toThrow(/paid before treatment/);
    await overridePayment(b.id, frontDesk, "Paying after — regular customer");
    expect(await receive(b.id, staffA, { consultation: false })).toBe("TREATMENT");
    expect((await visitTimeline(b.id)).some((e) => e.kind === "payment_override" && e.note?.includes("regular"))).toBe(true);
  });

  it("refuses a double take-over and hands a waiting customer to a free colleague", async () => {
    const b = await booking({ start: "13:00" });
    await checkIn(b.id, frontDesk);
    const results = await Promise.allSettled([receive(b.id, staffA, { consultation: false }), receive(b.id, staffA, { consultation: false })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    const c = await booking({ start: "15:00" });
    await checkIn(c.id, frontDesk);
    const free = await availableSpecialists(c.id);
    expect(free.map((s) => s.id)).toContain(staffB);
    await reassign(c.id, staffB, frontDesk);
    expect((await prisma.appointment.findFirstOrThrow({ where: { bookingId: c.id } })).staffUserId).toBe(staffB);
    await expect(reassign(c.id, staffB, frontDesk)).rejects.toThrow(); // she already has it
  });

  it("puts every visit of the day in the right board column, with flags", async () => {
    const expected = await booking({ start: "17:00" });
    const board = await getBoard(at("16:00"));
    const card = board.cards.find((c) => c.bookingId === expected.id)!;
    expect(card.column).toBe("EXPECTED");
    expect(card.firstVisit).toBe(true);
    expect(card.healthProfileMissing).toBe(true);
    expect(board.rooms.find((r) => r.id === roomId)).toBeDefined();
    const mine = await getBoard(at("16:00"), { staffUserId: staffB });
    expect(mine.cards.every((c) => c.staffUserId === staffB)).toBe(true);
  });

  it("measures waiting, overrun, checkout and total time", () => {
    const t = (m: number) => new Date(Date.UTC(2037, 2, 15, 7, m));
    const d = visitDurations({ arrivedAt: t(0), receivedAt: t(12), seatedAt: t(14), treatmentEndedAt: t(64), checkedOutAt: t(72) }, 45);
    expect(d).toEqual({ waitMin: 12, treatmentMin: 50, overrunMin: 5, checkoutMin: 8, totalMin: 72 });
  });

  it("reports flow metrics for a period", async () => {
    const m = await flowMetrics(new Date(Date.now() - 3_600_000), new Date(Date.now() + 3_600_000)); // arrivals happen "now"
    expect(m.visits).toBeGreaterThanOrEqual(4);
    expect(m.byStaff.length).toBeGreaterThan(0);
    expect(m.seenOnTimePct).not.toBeNull();
  });
});
