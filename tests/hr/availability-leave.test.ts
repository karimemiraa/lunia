import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { utcToCenterLocal, weekdayForDateISO } from "@/modules/booking/availability";
import { getServiceSlots } from "@/modules/booking/bookings";
import { staffOnApprovedLeave } from "@/modules/hr/leave";

// Staff on approved leave must not be offered for booking. We put every
// scheduled staff member on leave on one far-future open day and expect no
// slots, then confirm the same day has slots without the leave.
function openDateAt(daysOut: number): string {
  let t = Date.now() + daysOut * 86_400_000;
  for (;;) {
    const dateISO = utcToCenterLocal(new Date(t)).dateISO;
    if (weekdayForDateISO(dateISO) <= 4) return dateISO;
    t += 86_400_000;
  }
}

const DATE = openDateAt(600 + Math.floor(Math.random() * 200));
const createdIds: string[] = [];

afterAll(async () => {
  await prisma.leaveRequest.deleteMany({ where: { id: { in: createdIds } } });
});

describe("availability excludes staff on approved leave", () => {
  it("offers no slots when every scheduled staff member is on leave", async () => {
    const service = await prisma.service.findFirstOrThrow({ where: { onlineBookable: true, durationMin: { lte: 120 } } });
    const before = await getServiceSlots(service.id, DATE);
    expect(before.length).toBeGreaterThan(0);

    const staffIds = [...new Set((await prisma.staffSchedule.findMany({ where: { isActive: true } })).map((s) => s.staffUserId))];
    for (const userId of staffIds) {
      const row = await prisma.leaveRequest.create({
        data: { userId, type: "ANNUAL", startDateISO: DATE, endDateISO: DATE, days: 1, status: "APPROVED" },
      });
      createdIds.push(row.id);
    }
    expect((await staffOnApprovedLeave(DATE)).size).toBeGreaterThanOrEqual(staffIds.length);
    expect(await getServiceSlots(service.id, DATE)).toEqual([]);
  });

  it("ignores pending leave", async () => {
    await prisma.leaveRequest.updateMany({ where: { id: { in: createdIds } }, data: { status: "PENDING" } });
    const service = await prisma.service.findFirstOrThrow({ where: { onlineBookable: true, durationMin: { lte: 120 } } });
    expect((await getServiceSlots(service.id, DATE)).length).toBeGreaterThan(0);
  });
});
