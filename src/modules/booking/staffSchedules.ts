// Write-side helpers for a staff member's weekly StaffSchedule, used by the
// admin schedule editor (src/app/admin/booking/schedules/*). The
// availability engine (src/modules/booking/availability.ts) reads
// StaffSchedule rows directly via prisma; this module only owns the admin
// mutation path (replace-the-whole-week semantics).

import { z } from "zod";
import { prisma } from "@/lib/db";

// weekday: 0 = Sunday .. 6 = Saturday, matching StaffSchedule.weekday.
// startMin/endMin are minutes from midnight, center-local time.
export interface StaffScheduleEntryInput {
  weekday: number;
  startMin: number;
  endMin: number;
  isActive: boolean;
}

const entrySchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startMin: z.number().int().min(0).max(1440),
    endMin: z.number().int().min(0).max(1440),
    isActive: z.boolean(),
  })
  .refine((entry) => !entry.isActive || entry.startMin < entry.endMin, {
    message: "Start time must be before end time for an active day",
  });

// Returns the given staff member's schedule as exactly 7 entries, ordered
// Sun(0)..Sat(6), synthesizing an inactive 10:00-20:00 placeholder for any
// weekday with no StaffSchedule row on file yet (so the admin editor always
// has something sensible to show before the first save).
export async function getSchedulesForStaff(staffUserId: string): Promise<StaffScheduleEntryInput[]> {
  const rows = await prisma.staffSchedule.findMany({ where: { staffUserId } });
  const byWeekday = new Map(rows.map((row) => [row.weekday, row]));

  return Array.from({ length: 7 }, (_, weekday) => {
    const row = byWeekday.get(weekday);
    return row
      ? { weekday, startMin: row.startMin, endMin: row.endMin, isActive: row.isActive }
      : { weekday, startMin: 600, endMin: 1200, isActive: false };
  });
}

// Replaces the full set of StaffSchedule rows for `staffUserId` with
// `entries` inside a transaction, so a save is all-or-nothing. Validates
// every entry (weekday 0-6, both minutes within 0..1440, start < end for
// active days, no duplicate weekdays) before touching the database.
//
// Only entries with isActive: true are persisted as rows — this matches the
// existing "no row for a weekday means closed" convention (see seed.ts and
// the availability engine's `s.isActive && s.weekday === weekday` filter,
// which treats a missing row and an isActive: false row identically). The
// admin editor always submits all 7 weekdays (so an admin can toggle a day
// off without losing its times mid-session), but an inactive day simply
// isn't written to the database.
export async function setSchedulesForStaff(
  staffUserId: string,
  entries: StaffScheduleEntryInput[],
): Promise<void> {
  const validated = entries.map((entry) => entrySchema.parse(entry));

  const weekdays = validated.map((entry) => entry.weekday);
  if (new Set(weekdays).size !== weekdays.length) {
    throw new Error("Duplicate weekday in schedule input");
  }

  const staff = await prisma.user.findUnique({ where: { id: staffUserId } });
  if (!staff || staff.type !== "STAFF") {
    throw new Error(`Staff user "${staffUserId}" not found`);
  }

  const activeEntries = validated.filter((entry) => entry.isActive);

  await prisma.$transaction([
    prisma.staffSchedule.deleteMany({ where: { staffUserId } }),
    ...(activeEntries.length > 0
      ? [
          prisma.staffSchedule.createMany({
            data: activeEntries.map((entry) => ({
              staffUserId,
              weekday: entry.weekday,
              startMin: entry.startMin,
              endMin: entry.endMin,
              isActive: true,
            })),
          }),
        ]
      : []),
  ]);
}
