import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { centerLocalToUtc } from "@/modules/booking/availability";
import { staffPerformanceReport, retentionReport } from "@/modules/reports/teamReports";

// Exact figures for the staff-performance and retention reports, using a
// dedicated staff member and dates in 2036 that nothing else writes to.

const TAG = "TESTTEAMRPT";
let n = 0;
const uid = () => `${Date.now().toString(36)}${(n++).toString(36)}`;
let staffId = "";
let roomId = "";
let serviceId = "";

async function client(name: string) {
  const u = await prisma.user.create({ data: { type: "CLIENT", phone: `+9665${TAG}${uid()}`, clientProfile: { create: { fullName: `${TAG} ${name}` } } }, include: { clientProfile: true } });
  return u.clientProfile!.id;
}
async function visit(clientProfileId: string, dateISO: string, minute: number, status: "COMPLETED" | "CANCELLED" | "NO_SHOW" | "CONFIRMED", priceMinor = 50_000, durationMin = 60) {
  const startAt = centerLocalToUtc(dateISO, minute);
  const booking = await prisma.booking.create({
    data: {
      clientProfileId,
      status,
      appointments: { create: { serviceId, staffUserId: staffId, roomId, startAt, endAt: new Date(startAt.getTime() + durationMin * 60_000), priceMinorSnapshot: priceMinor } },
    },
  });
  // Completed visits are paid at the desk (commission is on what was collected).
  if (status === "COMPLETED") {
    await prisma.invoice.create({
      data: {
        number: `${TAG}-${uid()}`, status: "PAID", bookingId: booking.id, customerName: TAG, issuedAt: startAt,
        lines: { create: { kind: "SERVICE", serviceId, description: "Visit", qty: 1, unitPriceMinor: priceMinor, vatRateBp: 1500, staffUserId: staffId } },
        payments: { create: { method: "CASH", amountMinor: Math.round(priceMinor * 1.15), receivedAt: startAt } },
      },
    });
  }
  return booking;
}

beforeAll(async () => {
  const slug = `testteamrpt-${uid()}`;
  const dept = await prisma.department.create({ data: { slug, nameEn: "T", nameAr: "ت", taglineEn: "", taglineAr: "", descEn: "", descAr: "" } });
  serviceId = (await prisma.service.create({ data: { slug, departmentId: dept.id, nameEn: "Facial", nameAr: "فيشل", summaryEn: "", summaryAr: "", benefitsEn: [], benefitsAr: [], priceMinor: 50_000 } })).id;
  roomId = (await prisma.room.create({ data: { name: `${TAG} room ${uid()}` } })).id;
  const staff = await prisma.user.create({
    data: {
      type: "STAFF",
      email: `${TAG.toLowerCase()}-${uid()}@test.local`,
      staffProfile: { create: { fullName: `${TAG} Therapist` } },
      employeeRecord: { create: { commissionBp: 1000 } }, // 10%
      // Works Sunday 10:00–18:00 (8h) and Monday 10:00–14:00 (4h).
      staffSchedules: { create: [{ weekday: 0, startMin: 600, endMin: 1080 }, { weekday: 1, startMin: 600, endMin: 840 }] },
    },
  });
  staffId = staff.id;
});

afterAll(async () => {
  await prisma.invoice.deleteMany({ where: { number: { startsWith: TAG } } });
  const clients = await prisma.clientProfile.findMany({ where: { fullName: { startsWith: TAG } }, select: { id: true } });
  await prisma.booking.deleteMany({ where: { clientProfileId: { in: clients.map((c) => c.id) } } });
  await prisma.leaveRequest.deleteMany({ where: { userId: staffId } });
  await prisma.user.deleteMany({ where: { OR: [{ phone: { startsWith: `+9665${TAG}` } }, { id: staffId }] } });
  await prisma.room.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.service.deleteMany({ where: { slug: { startsWith: "testteamrpt-" } } });
  await prisma.department.deleteMany({ where: { slug: { startsWith: "testteamrpt-" } } });
});

describe("staff performance report", () => {
  it("counts visits, revenue, no-show rate, utilisation (minus leave) and commission", async () => {
    // Week of Sun 2036-03-02 .. Sat 2036-03-08.
    const a = await client("A");
    await visit(a, "2036-03-02", 600, "COMPLETED", 50_000); // 1h
    await visit(a, "2036-03-02", 720, "COMPLETED", 30_000, 30); // 0.5h
    await visit(a, "2036-03-02", 840, "NO_SHOW");
    await visit(a, "2036-03-02", 900, "CANCELLED");
    await visit(a, "2036-03-03", 600, "CONFIRMED", 20_000, 120); // 2h booked, not yet done
    // Approved leave on Monday 2036-03-03 → that day's 4h aren't scheduled.
    await prisma.leaveRequest.create({ data: { userId: staffId, type: "ANNUAL", startDateISO: "2036-03-03", endDateISO: "2036-03-03", days: 1, status: "APPROVED" } });

    const { rows } = await staffPerformanceReport({ from: centerLocalToUtc("2036-03-01", 0), to: centerLocalToUtc("2036-03-08", 0) });
    const row = rows.find((r) => r.staff === `${TAG} Therapist`)!;
    expect(row).toMatchObject({
      appointments: 5,
      completed: 2,
      cancelled: 1,
      noShows: 1,
      noShowRate: "33.3%", // 1 of 3 that were due
      revenueSAR: "800.00",
      avgTicketSAR: "400.00",
      bookedHours: "3.5", // 1 + 0.5 + 2 (cancelled / no-show excluded)
      scheduledHours: "8.0", // Sunday only; Monday was leave
      utilisation: "43.8%",
      commissionSAR: "80.00", // 10% of 800 collected, excl. VAT
    });
  });
});

describe("retention report", () => {
  it("splits first-visit vs returning customers and measures rebooking per month", async () => {
    const loyal = await client("Loyal");
    await visit(loyal, "2036-05-05", 600, "COMPLETED"); // first ever
    await visit(loyal, "2036-06-09", 600, "COMPLETED"); // came back in June
    const once = await client("Once");
    await visit(once, "2036-05-12", 600, "COMPLETED"); // never returns
    const cancelledNext = await client("CancelledNext");
    await visit(cancelledNext, "2036-05-19", 600, "COMPLETED");
    await visit(cancelledNext, "2036-07-07", 600, "CANCELLED"); // a cancelled booking isn't a rebook

    const { rows } = await retentionReport({ from: centerLocalToUtc("2036-05-01", 0), to: centerLocalToUtc("2036-07-01", 0) });
    expect(rows).toEqual([
      { month: "2036-05", customersSeen: 3, newCustomers: 3, returningCustomers: 0, bookedAgain: 1, rebookRate: "33.3%" },
      { month: "2036-06", customersSeen: 1, newCustomers: 0, returningCustomers: 1, bookedAgain: 0, rebookRate: "0%" },
    ]);
  });
});
