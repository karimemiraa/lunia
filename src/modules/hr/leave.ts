// Leave requests and balances. Staff request leave for themselves (any
// logged-in staff); hr:manage approves or rejects. Days are inclusive
// calendar days. A person can never hold two PENDING/APPROVED requests whose
// dates overlap.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { LEAVE_TYPES, MAX_LEAVE_REQUEST_DAYS, type LeaveType } from "./constants";
import { addDays, dateToISO, daysInclusive, isDateISO, monthBounds, overlapDays, todayISO } from "./dates";
import { leaveEntitlement, type LeaveEntitlement } from "./employees";

const OPEN_STATUSES = ["PENDING", "APPROVED"];

export interface LeaveBalance extends LeaveEntitlement {
  /** Approved ANNUAL days whose leave starts in the current service year. */
  usedDays: number;
  pendingDays: number;
  /** Accrued so far minus used (can go negative when leave was taken early). */
  balanceDays: number;
  /** Full-year entitlement not yet used or requested. */
  remainingYearDays: number;
}

export async function getLeaveBalance(userId: string, asOfISO: string = todayISO()): Promise<LeaveBalance> {
  const record = await prisma.employeeRecord.findUnique({
    where: { userId },
    select: { hireDate: true, annualLeaveDays: true },
  });
  const ent = leaveEntitlement(dateToISO(record?.hireDate), asOfISO, record?.annualLeaveDays);
  const rows = await prisma.leaveRequest.findMany({
    where: {
      userId,
      type: "ANNUAL",
      status: { in: OPEN_STATUSES },
      startDateISO: { gte: ent.serviceYearStartISO, lt: ent.serviceYearEndISO },
    },
    select: { status: true, days: true },
  });
  const usedDays = rows.filter((r) => r.status === "APPROVED").reduce((s, r) => s + r.days, 0);
  const pendingDays = rows.filter((r) => r.status === "PENDING").reduce((s, r) => s + r.days, 0);
  return {
    ...ent,
    usedDays,
    pendingDays,
    balanceDays: Math.round((ent.accruedDays - usedDays) * 10) / 10,
    remainingYearDays: ent.annualDays - usedDays - pendingDays,
  };
}

export const leaveRequestSchema = z
  .object({
    type: z.enum(LEAVE_TYPES),
    startDateISO: z.string().refine(isDateISO, "Choose a valid start date"),
    endDateISO: z.string().refine(isDateISO, "Choose a valid end date"),
    reason: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((v) => (v ? v : null)),
  })
  .refine((v) => v.startDateISO <= v.endDateISO, { message: "The end date must be on or after the start date" })
  .refine((v) => daysInclusive(v.startDateISO, v.endDateISO) <= MAX_LEAVE_REQUEST_DAYS, {
    message: `A single request can cover at most ${MAX_LEAVE_REQUEST_DAYS} days`,
  });

export type LeaveRequestInput = z.input<typeof leaveRequestSchema>;
export type LeaveResult = { ok: true; id: string } | { ok: false; error: string };

/** An open (pending/approved) request of this user overlapping the range, if any. */
export async function findOverlappingLeave(userId: string, startDateISO: string, endDateISO: string, excludeId?: string) {
  return prisma.leaveRequest.findFirst({
    where: {
      userId,
      status: { in: OPEN_STATUSES },
      startDateISO: { lte: endDateISO },
      endDateISO: { gte: startDateISO },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
}

export async function requestLeave(userId: string, input: LeaveRequestInput): Promise<LeaveResult> {
  const parsed = leaveRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const { type, startDateISO, endDateISO, reason } = parsed.data;
  const days = daysInclusive(startDateISO, endDateISO);

  const clash = await findOverlappingLeave(userId, startDateISO, endDateISO);
  if (clash) {
    return {
      ok: false,
      error: `This overlaps your ${clash.status.toLowerCase()} leave from ${clash.startDateISO} to ${clash.endDateISO}.`,
    };
  }

  if (type === "ANNUAL") {
    const balance = await getLeaveBalance(userId, startDateISO);
    if (days > balance.remainingYearDays) {
      return {
        ok: false,
        error: `Only ${Math.max(balance.remainingYearDays, 0)} annual leave day(s) remain for this service year.`,
      };
    }
  }

  const row = await prisma.leaveRequest.create({
    data: { userId, type, startDateISO, endDateISO, days, reason },
  });
  return { ok: true, id: row.id };
}

// LeaveRequest has no column for the manager's note, so it is appended to
// the reason under this marker (the requester sees it on their own page).
const NOTE_MARKER = "\n\nHR note: ";

export function splitReason(reason: string | null): { reason: string | null; hrNote: string | null } {
  if (!reason) return { reason: null, hrNote: null };
  const at = reason.indexOf(NOTE_MARKER);
  if (at === -1) return { reason, hrNote: null };
  return { reason: reason.slice(0, at) || null, hrNote: reason.slice(at + NOTE_MARKER.length) || null };
}

export async function decideLeave(
  id: string,
  decision: "APPROVED" | "REJECTED",
  deciderId: string,
  note?: string,
): Promise<LeaveResult> {
  const row = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "Leave request not found." };
  if (row.status !== "PENDING") return { ok: false, error: `This request is already ${row.status.toLowerCase()}.` };
  if (decision === "APPROVED") {
    // Belt and braces: never approve on top of another approved absence.
    const clash = await prisma.leaveRequest.findFirst({
      where: {
        userId: row.userId,
        status: "APPROVED",
        startDateISO: { lte: row.endDateISO },
        endDateISO: { gte: row.startDateISO },
      },
    });
    if (clash) return { ok: false, error: "This overlaps leave that is already approved." };
  }
  const cleanNote = note?.trim().slice(0, 300);
  // Guarded update so two managers deciding at once can't both win.
  const updated = await prisma.leaveRequest.updateMany({
    where: { id, status: "PENDING" },
    data: {
      status: decision,
      decidedById: deciderId,
      decidedAt: new Date(),
      ...(cleanNote ? { reason: `${row.reason ?? ""}${NOTE_MARKER}${cleanNote}` } : {}),
    },
  });
  if (updated.count === 0) return { ok: false, error: "This request was already decided." };
  return { ok: true, id };
}

/** Staff can withdraw their own request while it is still pending. */
export async function cancelOwnLeave(id: string, userId: string): Promise<LeaveResult> {
  const updated = await prisma.leaveRequest.updateMany({
    where: { id, userId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  if (updated.count === 0) return { ok: false, error: "Only your own pending requests can be cancelled." };
  return { ok: true, id };
}

export async function listLeaveRequests(where: { userId?: string; status?: string[] } = {}) {
  return prisma.leaveRequest.findMany({
    where: {
      ...(where.userId ? { userId: where.userId } : {}),
      ...(where.status ? { status: { in: where.status } } : {}),
    },
    include: { user: { select: { email: true, staffProfile: { select: { fullName: true } } } } },
    orderBy: [{ startDateISO: "desc" }],
    take: 300,
  });
}

/** Staff user ids on APPROVED leave on this center-local date. */
export async function staffOnApprovedLeave(dateISO: string): Promise<Set<string>> {
  const rows = await prisma.leaveRequest.findMany({
    where: { status: "APPROVED", startDateISO: { lte: dateISO }, endDateISO: { gte: dateISO } },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}

/** Approved leave days of `type` falling inside a "YYYY-MM" month. */
export async function approvedLeaveDaysInMonth(userId: string, month: string, type: LeaveType): Promise<number> {
  const { firstISO, lastISO } = monthBounds(month);
  const rows = await prisma.leaveRequest.findMany({
    where: { userId, type, status: "APPROVED", startDateISO: { lte: lastISO }, endDateISO: { gte: firstISO } },
    select: { startDateISO: true, endDateISO: true },
  });
  return rows.reduce((sum, r) => sum + overlapDays(r.startDateISO, r.endDateISO, firstISO, lastISO), 0);
}

export interface AbsenceDay {
  dateISO: string;
  people: { userId: string; name: string; type: string; status: string }[];
}

/**
 * Who is off on each day of the next `days` days (approved, plus pending so
 * managers can see what they are about to approve). Days nobody is off are
 * omitted.
 */
export async function upcomingAbsences(fromISO: string, days: number): Promise<AbsenceDay[]> {
  const toISO = addDays(fromISO, days - 1);
  const rows = await prisma.leaveRequest.findMany({
    where: { status: { in: OPEN_STATUSES }, startDateISO: { lte: toISO }, endDateISO: { gte: fromISO } },
    include: { user: { select: { email: true, staffProfile: { select: { fullName: true } } } } },
    orderBy: { startDateISO: "asc" },
  });
  const out: AbsenceDay[] = [];
  for (let i = 0; i < days; i += 1) {
    const dateISO = addDays(fromISO, i);
    const people = rows
      .filter((r) => r.startDateISO <= dateISO && r.endDateISO >= dateISO)
      .map((r) => ({
        userId: r.userId,
        name: r.user.staffProfile?.fullName || r.user.email || "Staff",
        type: r.type,
        status: r.status,
      }));
    if (people.length) out.push({ dateISO, people });
  }
  return out;
}
