import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { centerLocalToUtc } from "@/modules/booking/availability";
import {
  lateness,
  summarizeDay,
  clockIn,
  clockOut,
  getMyAttendance,
  saveManualAttendance,
  type AttendanceRow,
} from "@/modules/hr/attendance";
import { cleanupHrTestData, createStaff } from "./helpers";

// 2031-03-09 is a Sunday (weekday 0).
const DAY = "2031-03-09";
const schedule = [{ weekday: 0, startMin: 600, endMin: 1200, isActive: true }];

const row = (inMin: number, outMin: number | null, dateISO = DAY): AttendanceRow => ({
  id: `r${inMin}`,
  userId: "u",
  dateISO,
  clockInAt: centerLocalToUtc(dateISO, inMin),
  clockOutAt: outMin === null ? null : centerLocalToUtc(dateISO, outMin),
  source: "SELF",
  note: null,
  editedById: null,
});

describe("lateness", () => {
  it("allows a 10-minute grace period after the scheduled start", () => {
    expect(lateness(centerLocalToUtc(DAY, 600), schedule[0])).toEqual({ late: false, lateByMin: 0 });
    expect(lateness(centerLocalToUtc(DAY, 610), schedule[0])).toEqual({ late: false, lateByMin: 0 });
    expect(lateness(centerLocalToUtc(DAY, 611), schedule[0])).toEqual({ late: true, lateByMin: 11 });
    expect(lateness(centerLocalToUtc(DAY, 645), schedule[0])).toEqual({ late: true, lateByMin: 45 });
  });

  it("is never late on an unscheduled or inactive day", () => {
    expect(lateness(centerLocalToUtc(DAY, 700), null).late).toBe(false);
    expect(lateness(centerLocalToUtc(DAY, 700), { startMin: 600, isActive: false }).late).toBe(false);
  });
});

describe("summarizeDay", () => {
  it("sums closed sessions and judges lateness on the first clock-in", () => {
    const s = summarizeDay(DAY, [row(840, 1200), row(620, 780)], schedule, "2031-03-10");
    expect(s.workedMin).toBe(160 + 360);
    expect(s.late).toBe(true);
    expect(s.lateByMin).toBe(20);
    expect(s.missingOut).toBe(false);
  });

  it("flags a past day with an open session as a missing clock-out", () => {
    const s = summarizeDay(DAY, [row(600, null)], schedule, "2031-03-10");
    expect(s.missingOut).toBe(true);
    expect(s.workedMin).toBe(0);
  });

  it("treats today's open session as on shift, not missing", () => {
    const s = summarizeDay(DAY, [row(600, null)], schedule, DAY);
    expect(s.missingOut).toBe(false);
    expect(s.openSince).not.toBeNull();
  });
});

describe("clock in / out", () => {
  let userId: string;
  let hrId: string;
  beforeAll(async () => {
    await cleanupHrTestData();
    userId = await createStaff("clock");
    hrId = await createStaff("hr");
  });
  afterAll(async () => {
    await cleanupHrTestData();
  });

  it("opens and closes a session and refuses double clock-ins", async () => {
    // A fixed morning so the +60 min clock-out can never cross midnight.
    const t0 = centerLocalToUtc("2031-03-12", 600);
    expect((await clockOut(userId, t0)).ok).toBe(false);
    expect((await clockIn(userId, t0)).ok).toBe(true);
    expect((await clockIn(userId, t0)).ok).toBe(false);
    const status = await getMyAttendance(userId, new Date(t0.getTime() + 30 * 60_000));
    expect(status.clockedIn).toBe(true);
    expect(status.runningMin).toBe(30);
    expect((await clockOut(userId, new Date(t0.getTime() + 60 * 60_000))).ok).toBe(true);
    const rec = await prisma.attendanceRecord.findFirstOrThrow({ where: { userId } });
    expect(rec.source).toBe("SELF");
    expect(rec.clockOutAt).not.toBeNull();
  });

  it("records manual corrections with editor and note, and validates times", async () => {
    const bad = await saveManualAttendance({ userId, dateISO: DAY, clockIn: "12:00", clockOut: "11:00", note: "fix" }, hrId);
    expect(bad.ok).toBe(false);
    const noNote = await saveManualAttendance({ userId, dateISO: DAY, clockIn: "10:00", note: "" }, hrId);
    expect(noNote.ok).toBe(false);
    const ok = await saveManualAttendance(
      { userId, dateISO: DAY, clockIn: "10:05", clockOut: "18:00", note: "Forgot to clock in" },
      hrId,
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      const rec = await prisma.attendanceRecord.findUniqueOrThrow({ where: { id: ok.id } });
      expect(rec.source).toBe("MANUAL");
      expect(rec.editedById).toBe(hrId);
      expect(rec.clockInAt.toISOString()).toBe(centerLocalToUtc(DAY, 605).toISOString());
    }
  });
});
