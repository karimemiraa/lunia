import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { getSchedulesForStaff, setSchedulesForStaff } from "@/modules/booking/staffSchedules";

async function getSpecialist() {
  return prisma.user.findUniqueOrThrow({ where: { email: "specialist@lunia.local" } });
}

// Restores the specialist's schedule to the seeded Sun-Thu 10:00-20:00
// baseline after each test, so this suite doesn't leak state into other
// suites that depend on it (e.g. tests/booking/bookings.test.ts,
// tests/booking/availability.test.ts).
afterEach(async () => {
  const specialist = await getSpecialist();
  await setSchedulesForStaff(
    specialist.id,
    [0, 1, 2, 3, 4].map((weekday) => ({ weekday, startMin: 600, endMin: 1200, isActive: true })),
  );
});

describe("getSchedulesForStaff", () => {
  it("returns exactly 7 entries, Sun..Sat, filling gaps with an inactive placeholder", async () => {
    const specialist = await getSpecialist();
    const schedule = await getSchedulesForStaff(specialist.id);
    expect(schedule).toHaveLength(7);
    expect(schedule.map((entry) => entry.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(schedule[0]?.isActive).toBe(true); // Sunday, seeded
    expect(schedule[5]?.isActive).toBe(false); // Friday, not seeded
  });
});

describe("setSchedulesForStaff", () => {
  it("replaces the full week and getSchedulesForStaff reflects it", async () => {
    const specialist = await getSpecialist();
    const entries = Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      startMin: weekday === 1 ? 540 : 0,
      endMin: weekday === 1 ? 1020 : 0,
      isActive: weekday === 1,
    }));
    await setSchedulesForStaff(specialist.id, entries);

    const schedule = await getSchedulesForStaff(specialist.id);
    expect(schedule[1]).toEqual({ weekday: 1, startMin: 540, endMin: 1020, isActive: true });
    expect(schedule[0]?.isActive).toBe(false);
  });

  it("rejects an active day with start >= end", async () => {
    const specialist = await getSpecialist();
    const entries = Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      startMin: 600,
      endMin: 600,
      isActive: weekday === 0,
    }));
    await expect(setSchedulesForStaff(specialist.id, entries)).rejects.toThrow();
  });

  it("rejects an unknown staff user id", async () => {
    const entries = Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMin: 0, endMin: 0, isActive: false }));
    await expect(setSchedulesForStaff("does-not-exist", entries)).rejects.toThrow(/not found/);
  });
});
