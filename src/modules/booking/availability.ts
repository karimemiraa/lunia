// Pure availability/slot engine for the booking module. No DB access, no I/O,
// no reliance on the host machine's local timezone — every date/time
// computation here is either explicit UTC-epoch math or explicit center-local
// (Asia/Riyadh) wall-clock math.
//
// The center (Asia/Riyadh) uses a fixed UTC+3 offset year-round (no DST), so
// "center-local time" <-> UTC conversion is a constant-offset shift, not a
// real timezone lookup. We still keep the conversion in named helpers so the
// booking service (Task 3) and these functions stay correct and consistent
// even though the offset is trivial.

/** Asia/Riyadh is fixed at UTC+3 year-round (no DST). */
export const CENTER_TZ_OFFSET_MIN = 180;

/**
 * Converts a center-local calendar date + minutes-from-midnight wall time
 * into the corresponding UTC instant.
 *
 * A center-local wall time T on date D corresponds to UTC = D T minus 180
 * minutes. `minutes` may be < 0 or >= 1440 (e.g. 1440 for "end of day"); the
 * underlying Date.UTC normalizes across day boundaries, which is exactly
 * what we want.
 */
export function centerLocalToUtc(dateISO: string, minutes: number): Date {
  const [year, month, day] = parseDateISO(dateISO);
  return new Date(Date.UTC(year, month - 1, day, 0, minutes - CENTER_TZ_OFFSET_MIN, 0, 0));
}

/**
 * Inverse of centerLocalToUtc: given a UTC instant, returns the center-local
 * calendar date (as "YYYY-MM-DD") and minutes-from-midnight wall time.
 */
export function utcToCenterLocal(date: Date): { dateISO: string; minutes: number } {
  // Shifting the UTC instant forward by the center offset and reading its
  // UTC calendar fields yields exactly the center-local wall clock, since
  // center-local = UTC+3.
  const shifted = new Date(date.getTime() + CENTER_TZ_OFFSET_MIN * 60_000);
  const dateISO = shifted.toISOString().slice(0, 10);
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  return { dateISO, minutes };
}

/**
 * Returns the weekday of a center-local calendar date, 0 = Sunday .. 6 =
 * Saturday, matching StaffSchedule.weekday. This is pure calendar math (the
 * weekday of a date doesn't depend on time-of-day or timezone), computed via
 * Date.UTC/getUTCDay so it never depends on the host machine's local
 * timezone.
 */
export function weekdayForDateISO(dateISO: string): number {
  const [year, month, day] = parseDateISO(dateISO);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Half-open interval overlap test: [aStart,aEnd) overlaps [bStart,bEnd). */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

function parseDateISO(dateISO: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO);
  if (!match) {
    throw new Error(`Invalid date "${dateISO}": expected "YYYY-MM-DD"`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function timeStringToMinutes(hhmm: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) {
    throw new Error(`Invalid time "${hhmm}": expected "HH:MM"`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export interface StaffScheduleInput {
  staffUserId: string;
  weekday: number;
  startMin: number;
  endMin: number;
  isActive: boolean;
}

export interface RoomInput {
  id: string;
  capacity: number;
  isActive: boolean;
}

export interface ExistingAppointmentInput {
  staffUserId: string;
  roomId: string;
  startAt: Date;
  endAt: Date;
}

export interface DayHoursInput {
  open: string;
  close: string;
  closed: boolean;
}

export interface ComputeSlotsInput {
  /** "YYYY-MM-DD", interpreted center-local. */
  date: string;
  durationMin: number;
  staffSchedules: StaffScheduleInput[];
  rooms: RoomInput[];
  existingAppointments: ExistingAppointmentInput[];
  businessHours: DayHoursInput;
  /** Step between candidate start times, in minutes. Defaults to 15. */
  slotStepMin?: number;
}

export interface ComputedSlot {
  startAt: Date;
  endAt: Date;
  staffUserId: string;
  roomId: string;
}

/**
 * Computes bookable slots for a single day, purely from in-memory inputs.
 *
 * Algorithm:
 * 1. Closed day -> no slots.
 * 2. Determine the center-local weekday of `date`.
 * 3. For each active staff schedule matching that weekday, the staff's
 *    bookable window is the intersection of business hours and their
 *    schedule window (in minutes-from-midnight).
 * 4. Step candidate start times by `slotStepMin` across the union of all
 *    staff windows. A candidate is bookable if some (staff, room) pair has
 *    the staff's window fitting [start, start+duration], the staff free of
 *    overlapping appointments, and a room whose concurrent overlapping
 *    appointment count is below its capacity.
 * 5. Return one slot per distinct bookable start time, each assigned a
 *    concrete free (staffUserId, roomId) pair.
 */
export function computeSlots(input: ComputeSlotsInput): ComputedSlot[] {
  if (input.businessHours.closed) return [];

  const weekday = weekdayForDateISO(input.date);
  const bizOpenMin = timeStringToMinutes(input.businessHours.open);
  const bizCloseMin = timeStringToMinutes(input.businessHours.close);
  const stepMin = input.slotStepMin ?? 15;
  const durationMin = input.durationMin;

  const activeRooms = input.rooms.filter((r) => r.isActive);
  if (activeRooms.length === 0) return [];

  const daySchedules = input.staffSchedules.filter((s) => s.isActive && s.weekday === weekday);
  if (daySchedules.length === 0) return [];

  // Bookable window per staff schedule: intersection with business hours.
  const staffWindows = daySchedules.map((sched) => ({
    sched,
    winStart: Math.max(bizOpenMin, sched.startMin),
    winEnd: Math.min(bizCloseMin, sched.endMin),
  }));

  // Union of candidate start times across all staff windows, stepped from
  // each window's own start so no reachable start is skipped.
  const candidateStarts = new Set<number>();
  for (const { winStart, winEnd } of staffWindows) {
    for (let t = winStart; t + durationMin <= winEnd; t += stepMin) {
      candidateStarts.add(t);
    }
  }

  const sortedStarts = [...candidateStarts].sort((a, b) => a - b);

  const results: ComputedSlot[] = [];
  for (const startMin of sortedStarts) {
    const endMin = startMin + durationMin;
    const startAt = centerLocalToUtc(input.date, startMin);
    const endAt = centerLocalToUtc(input.date, endMin);

    const assignment = findFreeStaffAndRoom({
      startMin,
      endMin,
      startAt,
      endAt,
      staffWindows,
      rooms: activeRooms,
      existingAppointments: input.existingAppointments,
    });

    if (assignment) {
      results.push({ startAt, endAt, staffUserId: assignment.staffUserId, roomId: assignment.roomId });
    }
  }

  return results;
}

function findFreeStaffAndRoom(params: {
  startMin: number;
  endMin: number;
  startAt: Date;
  endAt: Date;
  staffWindows: { sched: StaffScheduleInput; winStart: number; winEnd: number }[];
  rooms: RoomInput[];
  existingAppointments: ExistingAppointmentInput[];
}): { staffUserId: string; roomId: string } | null {
  const { startMin, endMin, startAt, endAt, staffWindows, rooms, existingAppointments } = params;

  for (const { sched, winStart, winEnd } of staffWindows) {
    if (startMin < winStart || endMin > winEnd) continue;

    const staffBusy = existingAppointments.some(
      (a) => a.staffUserId === sched.staffUserId && overlaps(a.startAt, a.endAt, startAt, endAt),
    );
    if (staffBusy) continue;

    for (const room of rooms) {
      const overlapCount = existingAppointments.filter(
        (a) => a.roomId === room.id && overlaps(a.startAt, a.endAt, startAt, endAt),
      ).length;
      if (overlapCount < room.capacity) {
        return { staffUserId: sched.staffUserId, roomId: room.id };
      }
    }
  }

  return null;
}
