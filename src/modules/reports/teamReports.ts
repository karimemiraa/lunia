// Staff performance and customer retention reports for the Report Center.
// Same conventions as reports.ts: money as "123.45" SAR strings, dates in
// Riyadh time, test customers excluded. Revenue = price snapshot of
// COMPLETED appointments (the same definition payroll uses for commission).

import { commissionLines, summarize } from "@/modules/hr/commission";
import { prisma } from "@/lib/db";
import { centerLocalToUtc, utcToCenterLocal, weekdayForDateISO } from "@/modules/booking/availability";
import { NOT_TEST_CLIENT } from "@/modules/crm/testCustomers";
import type { ReportColumn, ReportResult } from "./reports";

const sar = (minor: number) => (minor / 100).toFixed(2);
const pct = (num: number, den: number) => (den > 0 ? `${Math.round((num / den) * 1000) / 10}%` : "");

function datesInRange(from: Date, to: Date): string[] {
  const out: string[] = [];
  let iso = utcToCenterLocal(from).dateISO;
  const lastExclusive = utcToCenterLocal(to).dateISO;
  while (iso < lastExclusive) {
    out.push(iso);
    iso = utcToCenterLocal(new Date(centerLocalToUtc(iso, 720).getTime() + 86_400_000)).dateISO;
  }
  return out;
}

// ---- Staff performance --------------------------------------------------------

export interface StaffReportRow {
  staff: string;
  appointments: number;
  completed: number;
  cancelled: number;
  noShows: number;
  noShowRate: string;
  revenueSAR: string;
  avgTicketSAR: string;
  bookedHours: string;
  scheduledHours: string;
  utilisation: string;
  commissionSAR: string;
}

export const STAFF_REPORT_COLUMNS: ReportColumn[] = [
  { key: "staff", label: "Staff" },
  { key: "appointments", label: "Appointments" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "noShows", label: "No-shows" },
  { key: "noShowRate", label: "No-show rate" },
  { key: "revenueSAR", label: "Revenue (SAR)" },
  { key: "avgTicketSAR", label: "Avg. visit (SAR)" },
  { key: "bookedHours", label: "Booked hours" },
  { key: "scheduledHours", label: "Scheduled hours" },
  { key: "utilisation", label: "Utilisation" },
  { key: "commissionSAR", label: "Commission est. (SAR)" },
];

/**
 * One row per staff member with appointments (or a schedule) in [from, to).
 * Utilisation = booked minutes (appointments not cancelled / no-show) ÷
 * scheduled minutes (weekly schedule, minus approved leave days).
 */
export async function staffPerformanceReport(filter: { from: Date; to: Date }): Promise<ReportResult<StaffReportRow>> {
  const dates = datesInRange(filter.from, filter.to);
  const firstISO = dates[0] ?? utcToCenterLocal(filter.from).dateISO;
  const lastISO = dates[dates.length - 1] ?? firstISO;

  const [appointments, schedules, leave] = await Promise.all([
    prisma.appointment.findMany({
      where: { startAt: { gte: filter.from, lt: filter.to }, booking: { client: NOT_TEST_CLIENT } },
      select: { staffUserId: true, startAt: true, endAt: true, priceMinorSnapshot: true, booking: { select: { status: true } } },
    }),
    prisma.staffSchedule.findMany({ where: { isActive: true }, select: { staffUserId: true, weekday: true, startMin: true, endMin: true } }),
    prisma.leaveRequest.findMany({
      where: { status: "APPROVED", startDateISO: { lte: lastISO }, endDateISO: { gte: firstISO } },
      select: { userId: true, startDateISO: true, endDateISO: true },
    }),
  ]);

  // Scheduled minutes per staff over the range.
  const scheduled = new Map<string, number>();
  const byStaffWeekday = new Map<string, number>();
  for (const s of schedules) byStaffWeekday.set(`${s.staffUserId}:${s.weekday}`, (byStaffWeekday.get(`${s.staffUserId}:${s.weekday}`) ?? 0) + Math.max(0, s.endMin - s.startMin));
  const staffWithSchedule = [...new Set(schedules.map((s) => s.staffUserId))];
  for (const iso of dates) {
    const weekday = weekdayForDateISO(iso);
    for (const staffId of staffWithSchedule) {
      const onLeave = leave.some((l) => l.userId === staffId && l.startDateISO <= iso && l.endDateISO >= iso);
      if (onLeave) continue;
      scheduled.set(staffId, (scheduled.get(staffId) ?? 0) + (byStaffWeekday.get(`${staffId}:${weekday}`) ?? 0));
    }
  }

  interface Acc { appointments: number; completed: number; cancelled: number; noShows: number; revenue: number; bookedMin: number }
  const acc = new Map<string, Acc>();
  for (const a of appointments) {
    const row = acc.get(a.staffUserId) ?? { appointments: 0, completed: 0, cancelled: 0, noShows: 0, revenue: 0, bookedMin: 0 };
    row.appointments += 1;
    const status = a.booking.status;
    if (status === "COMPLETED") {
      row.completed += 1;
      row.revenue += a.priceMinorSnapshot;
    }
    if (status === "CANCELLED") row.cancelled += 1;
    if (status === "NO_SHOW") row.noShows += 1;
    if (status !== "CANCELLED" && status !== "NO_SHOW") row.bookedMin += (a.endAt.getTime() - a.startAt.getTime()) / 60_000;
    acc.set(a.staffUserId, row);
  }

  const staffIds = [...new Set([...acc.keys(), ...[...scheduled.entries()].filter(([, m]) => m > 0).map(([id]) => id)])];
  const users = await prisma.user.findMany({
    where: { id: { in: staffIds } },
    select: { id: true, email: true, staffProfile: { select: { fullName: true } } },
  });
  // Same commission as payroll: collected, after discounts, excl. VAT (hr/commission.ts).
  const commission = summarize(await commissionLines(filter.from, filter.to));
  const userById = new Map(users.map((u) => [u.id, u]));

  const rows: StaffReportRow[] = staffIds.map((id) => {
    const a = acc.get(id) ?? { appointments: 0, completed: 0, cancelled: 0, noShows: 0, revenue: 0, bookedMin: 0 };
    const sched = scheduled.get(id) ?? 0;
    const u = userById.get(id);
    return {
      staff: u?.staffProfile?.fullName || u?.email || "Unknown staff",
      appointments: a.appointments,
      completed: a.completed,
      cancelled: a.cancelled,
      noShows: a.noShows,
      noShowRate: pct(a.noShows, a.completed + a.noShows),
      revenueSAR: sar(a.revenue),
      avgTicketSAR: a.completed ? sar(Math.round(a.revenue / a.completed)) : "",
      bookedHours: (a.bookedMin / 60).toFixed(1),
      scheduledHours: (sched / 60).toFixed(1),
      utilisation: pct(a.bookedMin, sched),
      commissionSAR: sar(commission.get(id)?.commissionMinor ?? 0),
    };
  });
  rows.sort((x, y) => Number(y.revenueSAR) - Number(x.revenueSAR) || x.staff.localeCompare(y.staff));
  return { columns: STAFF_REPORT_COLUMNS, rows };
}

// ---- Retention ------------------------------------------------------------------

export interface RetentionReportRow {
  month: string;
  customersSeen: number;
  newCustomers: number;
  returningCustomers: number;
  bookedAgain: number;
  rebookRate: string;
}

export const RETENTION_REPORT_COLUMNS: ReportColumn[] = [
  { key: "month", label: "Month" },
  { key: "customersSeen", label: "Customers seen" },
  { key: "newCustomers", label: "First visit" },
  { key: "returningCustomers", label: "Returning" },
  { key: "bookedAgain", label: "Booked again" },
  { key: "rebookRate", label: "Rebook rate" },
];

/**
 * Per month (Riyadh) of completed visits in [from, to): distinct customers
 * seen, how many were on their first-ever completed visit, and how many have
 * a later (not cancelled) appointment — the rebook rate front desks are
 * judged on. Recent months naturally show lower rebook rates.
 */
export async function retentionReport(filter: { from: Date; to: Date }): Promise<ReportResult<RetentionReportRow>> {
  const visits = await prisma.appointment.findMany({
    where: { startAt: { gte: filter.from, lt: filter.to }, booking: { status: "COMPLETED", client: NOT_TEST_CLIENT } },
    select: { startAt: true, booking: { select: { clientProfileId: true } } },
  });
  if (visits.length === 0) return { columns: RETENTION_REPORT_COLUMNS, rows: [] };
  const clientIds = [...new Set(visits.map((v) => v.booking.clientProfileId))];

  const [firstVisits, later] = await Promise.all([
    prisma.appointment.groupBy({
      by: ["bookingId"],
      where: { booking: { status: "COMPLETED", clientProfileId: { in: clientIds } } },
      _min: { startAt: true },
    }),
    prisma.appointment.findMany({
      where: { booking: { clientProfileId: { in: clientIds }, status: { notIn: ["CANCELLED"] } } },
      select: { startAt: true, booking: { select: { clientProfileId: true } } },
    }),
  ]);
  // First-ever completed visit per customer (groupBy is per booking → reduce per client).
  const bookingClient = new Map<string, string>();
  const bookings = await prisma.booking.findMany({ where: { id: { in: firstVisits.map((f) => f.bookingId) } }, select: { id: true, clientProfileId: true } });
  for (const b of bookings) bookingClient.set(b.id, b.clientProfileId);
  const firstEver = new Map<string, number>();
  for (const f of firstVisits) {
    const client = bookingClient.get(f.bookingId);
    const t = f._min.startAt?.getTime();
    if (!client || t === undefined) continue;
    firstEver.set(client, Math.min(firstEver.get(client) ?? Infinity, t));
  }
  const allStarts = new Map<string, number[]>();
  for (const l of later) {
    const list = allStarts.get(l.booking.clientProfileId) ?? [];
    list.push(l.startAt.getTime());
    allStarts.set(l.booking.clientProfileId, list);
  }

  // Last visit per (month, customer).
  const lastInMonth = new Map<string, Map<string, number>>();
  for (const v of visits) {
    const month = utcToCenterLocal(v.startAt).dateISO.slice(0, 7);
    const m = lastInMonth.get(month) ?? new Map<string, number>();
    m.set(v.booking.clientProfileId, Math.max(m.get(v.booking.clientProfileId) ?? 0, v.startAt.getTime()));
    lastInMonth.set(month, m);
  }

  const rows: RetentionReportRow[] = [...lastInMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, customers]) => {
      let fresh = 0;
      let again = 0;
      for (const [client, last] of customers) {
        const first = firstEver.get(client);
        if (first !== undefined && utcToCenterLocal(new Date(first)).dateISO.slice(0, 7) === month) fresh += 1;
        if ((allStarts.get(client) ?? []).some((t) => t > last)) again += 1;
      }
      return {
        month,
        customersSeen: customers.size,
        newCustomers: fresh,
        returningCustomers: customers.size - fresh,
        bookedAgain: again,
        rebookRate: pct(again, customers.size),
      };
    });
  return { columns: RETENTION_REPORT_COLUMNS, rows };
}
