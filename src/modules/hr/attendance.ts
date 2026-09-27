// Time & attendance. Staff clock in/out themselves (source SELF); hr:manage
// can add or correct records (source MANUAL, editedById + note). Every
// record is keyed by its center-local (Asia/Riyadh) date. Lateness compares
// the day's first clock-in with the person's StaffSchedule start for that
// weekday, with a LATE_GRACE_MIN grace period.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { centerLocalToUtc, utcToCenterLocal, weekdayForDateISO } from "@/modules/booking/availability";
import { LATE_GRACE_MIN } from "./constants";
import { addDays, isDateISO, monthBounds, todayISO } from "./dates";

export interface ScheduleSlot {
  weekday: number;
  startMin: number;
  endMin: number;
  isActive: boolean;
}

export interface AttendanceRow {
  id: string;
  userId: string;
  dateISO: string;
  clockInAt: Date;
  clockOutAt: Date | null;
  source: string;
  note: string | null;
  editedById: string | null;
}

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------

/** Late = first clock-in more than `graceMin` after the scheduled start. */
export function lateness(
  clockInAt: Date,
  schedule: Pick<ScheduleSlot, "startMin" | "isActive"> | undefined | null,
  graceMin: number = LATE_GRACE_MIN,
): { late: boolean; lateByMin: number } {
  if (!schedule || !schedule.isActive) return { late: false, lateByMin: 0 };
  const { minutes } = utcToCenterLocal(clockInAt);
  const lateByMin = minutes - schedule.startMin;
  return lateByMin > graceMin ? { late: true, lateByMin } : { late: false, lateByMin: 0 };
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000));
}

export interface DaySummary {
  dateISO: string;
  records: AttendanceRow[];
  scheduled: boolean;
  firstIn: Date | null;
  lastOut: Date | null;
  /** Minutes of closed sessions. */
  workedMin: number;
  /** Clock-in time of a session still open today. */
  openSince: Date | null;
  late: boolean;
  lateByMin: number;
  /** A session from a past day that was never clocked out. */
  missingOut: boolean;
}

export function summarizeDay(
  dateISO: string,
  records: AttendanceRow[],
  schedules: ScheduleSlot[],
  today: string = todayISO(),
): DaySummary {
  const sorted = [...records].sort((a, b) => a.clockInAt.getTime() - b.clockInAt.getTime());
  const schedule = schedules.find((s) => s.isActive && s.weekday === weekdayForDateISO(dateISO));
  const first = sorted[0];
  const closed = sorted.filter((r) => r.clockOutAt);
  const open = sorted.filter((r) => !r.clockOutAt);
  const { late, lateByMin } = first ? lateness(first.clockInAt, schedule) : { late: false, lateByMin: 0 };
  const lastOut = closed.reduce<Date | null>((m, r) => (!m || r.clockOutAt! > m ? r.clockOutAt! : m), null);
  return {
    dateISO,
    records: sorted,
    scheduled: !!schedule,
    firstIn: first?.clockInAt ?? null,
    lastOut,
    workedMin: closed.reduce((s, r) => s + minutesBetween(r.clockInAt, r.clockOutAt!), 0),
    openSince: dateISO === today ? (open[0]?.clockInAt ?? null) : null,
    late,
    lateByMin,
    missingOut: dateISO < today && open.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Self-service clock
// ---------------------------------------------------------------------------

export type ClockResult = { ok: true } | { ok: false; error: string };

export async function clockIn(userId: string, now: Date = new Date()): Promise<ClockResult> {
  const dateISO = todayISO(now);
  const open = await prisma.attendanceRecord.findFirst({ where: { userId, dateISO, clockOutAt: null } });
  if (open) return { ok: false, error: "You are already clocked in." };
  await prisma.attendanceRecord.create({ data: { userId, dateISO, clockInAt: now, source: "SELF" } });
  return { ok: true };
}

// Only closes a session opened today: a forgotten clock-out from a previous
// day stays open (flagged as missing) for HR to correct, rather than being
// closed now as a 20-hour shift.
export async function clockOut(userId: string, now: Date = new Date()): Promise<ClockResult> {
  const dateISO = todayISO(now);
  const open = await prisma.attendanceRecord.findFirst({
    where: { userId, dateISO, clockOutAt: null },
    orderBy: { clockInAt: "desc" },
  });
  if (!open) return { ok: false, error: "You are not clocked in today." };
  await prisma.attendanceRecord.update({ where: { id: open.id }, data: { clockOutAt: now } });
  return { ok: true };
}

async function schedulesFor(userIds: string[]): Promise<Map<string, ScheduleSlot[]>> {
  const rows = await prisma.staffSchedule.findMany({ where: { staffUserId: { in: userIds } } });
  const map = new Map<string, ScheduleSlot[]>();
  for (const r of rows) map.set(r.staffUserId, [...(map.get(r.staffUserId) ?? []), r]);
  return map;
}

/** Today + this month for one person (the self-service page). */
export async function getMyAttendance(userId: string, now: Date = new Date()) {
  const today = todayISO(now);
  const { firstISO, lastISO } = monthBounds(today.slice(0, 7));
  const [records, schedules] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { userId, dateISO: { gte: firstISO, lte: lastISO } } }),
    schedulesFor([userId]),
  ]);
  const mySchedule = schedules.get(userId) ?? [];
  const byDay = groupBy(records, (r) => r.dateISO);
  const days = [...byDay.entries()].map(([d, rs]) => summarizeDay(d, rs, mySchedule, today));
  const todaySummary = summarizeDay(today, byDay.get(today) ?? [], mySchedule, today);
  const monthWorkedMin = days.reduce((s, d) => s + d.workedMin, 0);
  const runningMin = todaySummary.openSince ? minutesBetween(todaySummary.openSince, now) : 0;
  const pastOpen = await prisma.attendanceRecord.count({ where: { userId, clockOutAt: null, dateISO: { lt: today } } });
  return {
    today: todaySummary,
    clockedIn: !!todaySummary.openSince,
    runningMin,
    monthWorkedMin: monthWorkedMin + runningMin,
    daysWorked: days.filter((d) => d.records.length > 0).length,
    lateDays: days.filter((d) => d.late).length,
    missingOutCount: pastOpen,
  };
}

// ---------------------------------------------------------------------------
// Admin views
// ---------------------------------------------------------------------------

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
  return map;
}

export interface StaffLite {
  userId: string;
  name: string;
}

async function activeStaff(): Promise<StaffLite[]> {
  const users = await prisma.user.findMany({
    where: { type: "STAFF", isActive: true },
    select: { id: true, email: true, staffProfile: { select: { fullName: true } } },
  });
  return users
    .map((u) => ({ userId: u.id, name: u.staffProfile?.fullName || u.email || "Staff" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface AttendanceGrid {
  dates: string[];
  staff: (StaffLite & { days: DaySummary[]; workedMin: number })[];
}

/** Per-employee day summaries for [fromISO, fromISO + days). */
export async function getAttendanceGrid(fromISO: string, days: number): Promise<AttendanceGrid> {
  const dates = Array.from({ length: days }, (_, i) => addDays(fromISO, i));
  const staff = await activeStaff();
  const ids = staff.map((s) => s.userId);
  const [records, schedules] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { userId: { in: ids }, dateISO: { gte: dates[0]!, lte: dates[dates.length - 1]! } },
    }),
    schedulesFor(ids),
  ]);
  const byKey = groupBy(records, (r) => `${r.userId}|${r.dateISO}`);
  const today = todayISO();
  return {
    dates,
    staff: staff.map((s) => {
      const summaries = dates.map((d) => summarizeDay(d, byKey.get(`${s.userId}|${d}`) ?? [], schedules.get(s.userId) ?? [], today));
      return { ...s, days: summaries, workedMin: summaries.reduce((t, d) => t + d.workedMin, 0) };
    }),
  };
}

export interface MonthlyAttendanceSummary extends StaffLite {
  daysWorked: number;
  workedMin: number;
  lateCount: number;
  missingOutCount: number;
  scheduledDays: number;
}

export async function getMonthlySummary(month: string): Promise<MonthlyAttendanceSummary[]> {
  const { firstISO, days } = monthBounds(month);
  const grid = await getAttendanceGrid(firstISO, days);
  return grid.staff.map((s) => ({
    userId: s.userId,
    name: s.name,
    daysWorked: s.days.filter((d) => d.records.length > 0).length,
    workedMin: s.workedMin,
    lateCount: s.days.filter((d) => d.late).length,
    missingOutCount: s.days.filter((d) => d.missingOut).length,
    scheduledDays: s.days.filter((d) => d.scheduled).length,
  }));
}

/** Flat rows for the CSV export of a month. */
export async function attendanceCsvRows(month: string): Promise<Record<string, unknown>[]> {
  const { firstISO, days } = monthBounds(month);
  const grid = await getAttendanceGrid(firstISO, days);
  const fmt = (d: Date | null) => {
    if (!d) return "";
    const m = utcToCenterLocal(d).minutes;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  };
  const rows: Record<string, unknown>[] = [];
  for (const s of grid.staff) {
    for (const day of s.days) {
      for (const r of day.records) {
        rows.push({
          employee: s.name,
          date: day.dateISO,
          clockIn: fmt(r.clockInAt),
          clockOut: fmt(r.clockOutAt),
          hours: r.clockOutAt ? (minutesBetween(r.clockInAt, r.clockOutAt) / 60).toFixed(2) : "",
          late: r === day.records[0] && day.late ? `${day.lateByMin} min` : "",
          missingOut: !r.clockOutAt && day.dateISO < todayISO() ? "yes" : "",
          source: r.source,
          note: r.note ?? "",
        });
      }
    }
  }
  return rows;
}

export const ATTENDANCE_CSV_COLUMNS = [
  { key: "employee", label: "Employee" },
  { key: "date", label: "Date" },
  { key: "clockIn", label: "Clock in" },
  { key: "clockOut", label: "Clock out" },
  { key: "hours", label: "Hours" },
  { key: "late", label: "Late" },
  { key: "missingOut", label: "Missing clock-out" },
  { key: "source", label: "Source" },
  { key: "note", label: "Note" },
];

// ---------------------------------------------------------------------------
// Manual corrections (hr:manage)
// ---------------------------------------------------------------------------

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export const manualAttendanceSchema = z
  .object({
    id: z.string().optional().transform((v) => v || undefined),
    userId: z.string().min(1, "Choose an employee"),
    dateISO: z.string().refine(isDateISO, "Choose a valid date"),
    clockIn: z.string().regex(HHMM, "Clock-in time is required (HH:MM)"),
    clockOut: z
      .string()
      .optional()
      .transform((v) => v || undefined)
      .refine((v) => !v || HHMM.test(v), "Clock-out must be HH:MM"),
    note: z.string().trim().min(3, "Add a short note explaining the correction").max(300),
  })
  .refine((v) => !v.clockOut || toMin(v.clockOut) > toMin(v.clockIn), {
    message: "Clock-out must be after clock-in",
  });

export type ManualAttendanceInput = z.input<typeof manualAttendanceSchema>;

export async function saveManualAttendance(
  input: ManualAttendanceInput,
  editorId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = manualAttendanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const v = parsed.data;
  const data = {
    userId: v.userId,
    dateISO: v.dateISO,
    clockInAt: centerLocalToUtc(v.dateISO, toMin(v.clockIn)),
    clockOutAt: v.clockOut ? centerLocalToUtc(v.dateISO, toMin(v.clockOut)) : null,
    source: "MANUAL",
    note: v.note,
    editedById: editorId,
  };
  if (v.id) {
    const existing = await prisma.attendanceRecord.findUnique({ where: { id: v.id } });
    if (!existing) return { ok: false, error: "Record not found." };
    await prisma.attendanceRecord.update({ where: { id: v.id }, data });
    return { ok: true, id: v.id };
  }
  const staff = await prisma.user.findFirst({ where: { id: v.userId, type: "STAFF" }, select: { id: true } });
  if (!staff) return { ok: false, error: "Employee not found." };
  const row = await prisma.attendanceRecord.create({ data });
  return { ok: true, id: row.id };
}

export async function deleteAttendance(id: string): Promise<boolean> {
  const res = await prisma.attendanceRecord.deleteMany({ where: { id } });
  return res.count > 0;
}
