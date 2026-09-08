import { describe, it, expect } from "vitest";
import {
  CENTER_TZ_OFFSET_MIN,
  centerLocalToUtc,
  utcToCenterLocal,
  weekdayForDateISO,
  overlaps,
  computeSlots,
} from "@/modules/booking/availability";

describe("CENTER_TZ_OFFSET_MIN", () => {
  it("is fixed at UTC+3 (Asia/Riyadh, no DST)", () => {
    expect(CENTER_TZ_OFFSET_MIN).toBe(180);
  });
});

describe("centerLocalToUtc", () => {
  it("converts a center-local wall time to the correct UTC instant", () => {
    // 10:00 Riyadh (UTC+3) on 2026-09-08 = 07:00 UTC same day.
    const utc = centerLocalToUtc("2026-09-08", 600);
    expect(utc.toISOString()).toBe("2026-09-08T07:00:00.000Z");
  });

  it("rolls back to the previous UTC day for early-morning center-local times", () => {
    // 01:00 Riyadh on 2026-09-08 = 22:00 UTC on 2026-09-07 (previous day).
    const utc = centerLocalToUtc("2026-09-08", 60);
    expect(utc.toISOString()).toBe("2026-09-07T22:00:00.000Z");
  });

  it("handles midnight and end-of-day minutes", () => {
    expect(centerLocalToUtc("2026-09-08", 0).toISOString()).toBe("2026-09-07T21:00:00.000Z");
    expect(centerLocalToUtc("2026-09-08", 1440).toISOString()).toBe("2026-09-08T21:00:00.000Z");
  });
});

describe("utcToCenterLocal", () => {
  it("is the exact inverse of centerLocalToUtc for in-range minutes (0-1439)", () => {
    const cases: Array<[string, number]> = [
      ["2026-09-08", 0],
      ["2026-09-08", 60],
      ["2026-09-08", 600],
      ["2026-09-08", 1199],
      ["2026-01-01", 30],
      ["2026-12-31", 1400],
    ];
    for (const [dateISO, minutes] of cases) {
      const utc = centerLocalToUtc(dateISO, minutes);
      const back = utcToCenterLocal(utc);
      expect(back).toEqual({ dateISO, minutes });
    }
  });

  it("normalizes minute 1440 (end of day) to minute 0 of the next day, same instant", () => {
    // 1440 minutes past midnight on D is the same UTC instant as 0 minutes
    // past midnight on D+1 -- both correctly represent center-local midnight.
    const endOfDay = centerLocalToUtc("2026-09-08", 1440);
    const startOfNextDay = centerLocalToUtc("2026-09-09", 0);
    expect(endOfDay.getTime()).toBe(startOfNextDay.getTime());
    expect(utcToCenterLocal(endOfDay)).toEqual({ dateISO: "2026-09-09", minutes: 0 });
  });
});

describe("weekdayForDateISO", () => {
  it("maps a known Sunday to 0", () => {
    expect(weekdayForDateISO("2026-09-06")).toBe(0);
  });

  it("maps a known Tuesday to 2", () => {
    expect(weekdayForDateISO("2026-09-08")).toBe(2);
  });

  it("maps a known Saturday to 6", () => {
    expect(weekdayForDateISO("2026-09-12")).toBe(6);
  });

  it("does not depend on host machine local timezone (pure UTC calendar math)", () => {
    // Regardless of process TZ, the weekday of a plain calendar date is fixed.
    expect(weekdayForDateISO("2026-01-01")).toBe(4); // Thursday
  });
});

describe("overlaps", () => {
  it("detects overlapping half-open intervals", () => {
    const a = (h: number, m = 0) => new Date(Date.UTC(2026, 0, 1, h, m));
    expect(overlaps(a(10), a(11), a(10, 30), a(11, 30))).toBe(true);
    expect(overlaps(a(10), a(11), a(11), a(12))).toBe(false); // touching, half-open
    expect(overlaps(a(10), a(11), a(9), a(10))).toBe(false); // touching, half-open
    expect(overlaps(a(10), a(12), a(10, 30), a(11))).toBe(true); // fully contained
    expect(overlaps(a(10), a(11), a(11, 30), a(12))).toBe(false); // disjoint
  });
});

describe("computeSlots", () => {
  const DATE = "2026-09-08"; // Tuesday -> weekday 2
  const WEEKDAY = 2;

  const staffA = { staffUserId: "staffA", weekday: WEEKDAY, startMin: 600, endMin: 1200, isActive: true }; // 10:00-20:00
  const roomBase = { id: "room1", capacity: 1, isActive: true };
  const openHours = { open: "10:00", close: "22:00", closed: false };

  it("returns the right number of slots for one staff + one room, no existing appointments", () => {
    const slots = computeSlots({
      date: DATE,
      durationMin: 60,
      staffSchedules: [staffA],
      rooms: [roomBase],
      existingAppointments: [],
      businessHours: openHours,
      slotStepMin: 60,
    });

    // Staff window 10:00-20:00 intersected with business hours 10:00-22:00 = 10:00-20:00.
    // 60-min slots stepped by 60 starting at 10:00, last start at 19:00 (19:00+60=20:00).
    expect(slots.length).toBe(10);
    expect(slots[0]!.startAt.toISOString()).toBe("2026-09-08T07:00:00.000Z"); // 10:00 Riyadh
    expect(slots[0]!.endAt.toISOString()).toBe("2026-09-08T08:00:00.000Z");
    expect(slots[9]!.startAt.toISOString()).toBe("2026-09-08T16:00:00.000Z"); // 19:00 Riyadh
    expect(slots[9]!.endAt.toISOString()).toBe("2026-09-08T17:00:00.000Z");
    for (const s of slots) {
      expect(s.staffUserId).toBe("staffA");
      expect(s.roomId).toBe("room1");
    }
  });

  it("removes the slot overlapping an existing appointment for that staff+room", () => {
    // 12:00-13:00 Riyadh = 09:00-10:00 UTC.
    const existing = [
      { staffUserId: "staffA", roomId: "room1", startAt: new Date("2026-09-08T09:00:00.000Z"), endAt: new Date("2026-09-08T10:00:00.000Z") },
    ];
    const slots = computeSlots({
      date: DATE,
      durationMin: 60,
      staffSchedules: [staffA],
      rooms: [roomBase],
      existingAppointments: existing,
      businessHours: openHours,
      slotStepMin: 60,
    });

    expect(slots.length).toBe(9);
    const startsIso = slots.map((s) => s.startAt.toISOString());
    expect(startsIso).not.toContain("2026-09-08T09:00:00.000Z");
  });

  it("returns [] when the business hours mark the day closed", () => {
    const slots = computeSlots({
      date: DATE,
      durationMin: 60,
      staffSchedules: [staffA],
      rooms: [roomBase],
      existingAppointments: [],
      businessHours: { open: "10:00", close: "22:00", closed: true },
      slotStepMin: 60,
    });
    expect(slots).toEqual([]);
  });

  it("returns [] when there are no matching staff schedules for that weekday", () => {
    const slots = computeSlots({
      date: DATE,
      durationMin: 60,
      staffSchedules: [{ ...staffA, weekday: 5 }], // Friday, not this Tuesday
      rooms: [roomBase],
      existingAppointments: [],
      businessHours: openHours,
      slotStepMin: 60,
    });
    expect(slots).toEqual([]);
  });

  it("returns [] when the matching staff schedule is inactive", () => {
    const slots = computeSlots({
      date: DATE,
      durationMin: 60,
      staffSchedules: [{ ...staffA, isActive: false }],
      rooms: [roomBase],
      existingAppointments: [],
      businessHours: openHours,
      slotStepMin: 60,
    });
    expect(slots).toEqual([]);
  });

  it("excludes candidate start times where the duration would run past the window close", () => {
    // Narrow window: 10:00-12:30 (600-750), duration 90, step 30.
    // Valid starts: 600 (10:00->11:30), 630 (10:30->12:00), 660 (11:00->12:30).
    // 690 (11:30->13:00) would run past 750, so must be excluded.
    const slots = computeSlots({
      date: DATE,
      durationMin: 90,
      staffSchedules: [{ staffUserId: "staffA", weekday: WEEKDAY, startMin: 0, endMin: 1440, isActive: true }],
      rooms: [roomBase],
      existingAppointments: [],
      businessHours: { open: "10:00", close: "12:30", closed: false },
      slotStepMin: 30,
    });

    expect(slots.length).toBe(3);
    const startMinutesLocal = slots.map((s) => utcToCenterLocal(s.startAt).minutes);
    expect(startMinutesLocal.sort((a, b) => a - b)).toEqual([600, 630, 660]);
    expect(startMinutesLocal).not.toContain(690);
  });

  it("keeps a start time available via a second staff member (and second room) when only one staff is booked", () => {
    const staffB = { staffUserId: "staffB", weekday: WEEKDAY, startMin: 600, endMin: 1200, isActive: true };
    const room2 = { id: "room2", capacity: 1, isActive: true };
    const existing = [
      { staffUserId: "staffA", roomId: "room1", startAt: new Date("2026-09-08T09:00:00.000Z"), endAt: new Date("2026-09-08T10:00:00.000Z") },
    ];

    const slots = computeSlots({
      date: DATE,
      durationMin: 60,
      staffSchedules: [staffA, staffB],
      rooms: [roomBase, room2],
      existingAppointments: existing,
      businessHours: openHours,
      slotStepMin: 60,
    });

    const noonSlot = slots.find((s) => s.startAt.toISOString() === "2026-09-08T09:00:00.000Z");
    expect(noonSlot).toBeDefined();
    expect(noonSlot!.staffUserId).toBe("staffB");
    expect(noonSlot!.roomId).toBe("room2");
  });

  it("blocks a start time when the only room is at capacity, even though a staff member is free", () => {
    const staffB = { staffUserId: "staffB", weekday: WEEKDAY, startMin: 600, endMin: 1200, isActive: true };
    const existing = [
      { staffUserId: "staffA", roomId: "room1", startAt: new Date("2026-09-08T09:00:00.000Z"), endAt: new Date("2026-09-08T10:00:00.000Z") },
    ];

    const slots = computeSlots({
      date: DATE,
      durationMin: 60,
      staffSchedules: [staffA, staffB],
      rooms: [{ id: "room1", capacity: 1, isActive: true }],
      existingAppointments: existing,
      businessHours: openHours,
      slotStepMin: 60,
    });

    const noonSlot = slots.find((s) => s.startAt.toISOString() === "2026-09-08T09:00:00.000Z");
    expect(noonSlot).toBeUndefined();
  });

  it("allows a concurrent booking in the same room when capacity is 2", () => {
    const staffB = { staffUserId: "staffB", weekday: WEEKDAY, startMin: 600, endMin: 1200, isActive: true };
    const existing = [
      { staffUserId: "staffA", roomId: "room1", startAt: new Date("2026-09-08T09:00:00.000Z"), endAt: new Date("2026-09-08T10:00:00.000Z") },
    ];

    const slots = computeSlots({
      date: DATE,
      durationMin: 60,
      staffSchedules: [staffA, staffB],
      rooms: [{ id: "room1", capacity: 2, isActive: true }],
      existingAppointments: existing,
      businessHours: openHours,
      slotStepMin: 60,
    });

    const noonSlot = slots.find((s) => s.startAt.toISOString() === "2026-09-08T09:00:00.000Z");
    expect(noonSlot).toBeDefined();
    expect(noonSlot!.staffUserId).toBe("staffB");
    expect(noonSlot!.roomId).toBe("room1");
  });

  it("skips inactive rooms entirely", () => {
    const slots = computeSlots({
      date: DATE,
      durationMin: 60,
      staffSchedules: [staffA],
      rooms: [{ id: "room1", capacity: 5, isActive: false }],
      existingAppointments: [],
      businessHours: openHours,
      slotStepMin: 60,
    });
    expect(slots).toEqual([]);
  });

  it("defaults slotStepMin to 15 when omitted", () => {
    const slots = computeSlots({
      date: DATE,
      durationMin: 60,
      staffSchedules: [{ staffUserId: "staffA", weekday: WEEKDAY, startMin: 600, endMin: 690, isActive: true }], // 10:00-11:30
      rooms: [roomBase],
      existingAppointments: [],
      businessHours: openHours,
      // no slotStepMin
    });
    // window 600-690, duration 60 -> valid starts 600, 615 (615+60=675<=690), 630 (630+60=690<=690)
    expect(slots.length).toBe(3);
  });
});
