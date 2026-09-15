// Read-only report-row builders for the admin Report Center (Task 9). Each
// report function returns a plain array of typed rows plus the column list
// (key + label) needed to render/export them -- the admin page and the CSV
// export route both consume this exact shape, so there is only ever one
// definition of what a given report contains.
//
// Every report is built by reusing the existing stats/CRM/marketing/booking
// modules rather than recomputing aggregates from scratch here -- see those
// modules' own headers for the authoritative definitions (realized revenue
// = COMPLETED bookings only, LTV, CAC/acquisition attribution, etc). This
// module only reshapes their output into report rows/columns.
//
// Money: every `*SAR` field below is a STRING in SAR major units with
// exactly two decimal places (e.g. "123.45"), converted from the underlying
// minor (halala) integer via minor/100 -- strings avoid floating-point
// artifacts (e.g. 123.45000000000001) leaking into a CSV a client might open
// in a spreadsheet. A null/undefined minor amount (e.g. a marketing channel
// with spend but zero acquisitions has no CAC -- see crm/marketing.ts)
// becomes "" rather than "0.00", so it is never misread as a real zero cost.
//
// Dates: every `date` column is a center-local (Asia/Riyadh) "YYYY-MM-DD"
// string, matching the rest of the Stage-5 dashboards.

import { prisma } from "@/lib/db";
import type { BookingStatus } from "@prisma/client";
import { listBookings } from "@/modules/booking/bookings";
import { bookingStats } from "@/modules/booking/stats";
import { utcToCenterLocal } from "@/modules/booking/availability";
import { listClients } from "@/modules/crm/clients";
import { channelPerformance } from "@/modules/crm/marketing";

export interface ReportColumn {
  key: string;
  label: string;
}

function toSarString(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return "";
  return (minor / 100).toFixed(2);
}

// ---- Bookings report ------------------------------------------------------

export interface BookingsReportRow {
  date: string;
  client: string;
  service: string;
  staff: string;
  status: BookingStatus;
  priceSAR: string;
}

export const BOOKINGS_REPORT_COLUMNS: ReportColumn[] = [
  { key: "date", label: "Date" },
  { key: "client", label: "Customer" },
  { key: "service", label: "Service" },
  { key: "staff", label: "Staff" },
  { key: "status", label: "Status" },
  { key: "priceSAR", label: "Price (SAR)" },
];

export interface BookingsReportFilter {
  from: Date;
  to: Date;
  status?: BookingStatus;
}

export interface ReportResult<T> {
  columns: ReportColumn[];
  rows: T[];
}

/**
 * One row per appointment whose startAt falls in [from, to), optionally
 * narrowed to a single booking status. Reuses booking/bookings.ts's
 * listBookings (which already filters bookings by appointment startAt), so
 * this report and the calendar/front-desk views share one definition of
 * "which bookings fall in this range". A booking with more than one
 * appointment yields one row per appointment.
 */
export async function bookingsReport(filter: BookingsReportFilter): Promise<ReportResult<BookingsReportRow>> {
  const bookings = await listBookings({ from: filter.from, to: filter.to, status: filter.status });
  if (bookings.length === 0) return { columns: BOOKINGS_REPORT_COLUMNS, rows: [] };

  const serviceIds = [...new Set(bookings.flatMap((b) => b.appointments.map((a) => a.serviceId)))];
  const staffUserIds = [...new Set(bookings.flatMap((b) => b.appointments.map((a) => a.staffUserId)))];
  const clientProfileIds = [...new Set(bookings.map((b) => b.clientProfileId))];

  const [services, staff, clients] = await Promise.all([
    prisma.service.findMany({ where: { id: { in: serviceIds } } }),
    prisma.user.findMany({ where: { id: { in: staffUserIds } }, include: { staffProfile: true } }),
    prisma.clientProfile.findMany({ where: { id: { in: clientProfileIds } } }),
  ]);
  const serviceNameById = new Map(services.map((s) => [s.id, s.nameEn]));
  const staffNameById = new Map(staff.map((s) => [s.id, s.staffProfile?.fullName ?? "Unknown staff"]));
  const clientNameById = new Map(clients.map((c) => [c.id, c.fullName]));

  const rows: BookingsReportRow[] = bookings
    .flatMap((booking) =>
      booking.appointments.map((appointment) => ({
        date: utcToCenterLocal(appointment.startAt).dateISO,
        client: clientNameById.get(booking.clientProfileId) ?? "Unknown customer",
        service: serviceNameById.get(appointment.serviceId) ?? "Unknown service",
        staff: staffNameById.get(appointment.staffUserId) ?? "Unknown staff",
        status: booking.status,
        priceSAR: toSarString(appointment.priceMinorSnapshot),
      })),
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  return { columns: BOOKINGS_REPORT_COLUMNS, rows };
}

// ---- Revenue report --------------------------------------------------------

export interface RevenueReportRow {
  date: string;
  bookings: number;
  revenueSAR: string;
}

export const REVENUE_REPORT_COLUMNS: ReportColumn[] = [
  { key: "date", label: "Date" },
  { key: "bookings", label: "Bookings" },
  { key: "revenueSAR", label: "Revenue (SAR)" },
];

export interface RevenueReportFilter {
  from: Date;
  to: Date;
}

/**
 * Daily bookings/revenue for [from, to), reusing booking/stats.ts's
 * bookingStats -- so "date" here is the booking's CREATION date (not its
 * visit date) and "revenue" is realized (COMPLETED-only) revenue, exactly
 * matching the Business Dashboard's definitions. Days with zero bookings are
 * omitted (bookingStats only returns days that had at least one booking).
 */
export async function revenueReport(filter: RevenueReportFilter): Promise<ReportResult<RevenueReportRow>> {
  const stats = await bookingStats(filter);
  const rows: RevenueReportRow[] = stats.byDay.map((day) => ({
    date: day.date,
    bookings: day.bookings,
    revenueSAR: toSarString(day.revenueMinor),
  }));
  return { columns: REVENUE_REPORT_COLUMNS, rows };
}

// ---- Clients report ---------------------------------------------------------

export interface ClientsReportRow {
  name: string;
  phone: string;
  tier: string;
  source: string;
  ltvSAR: string;
  bookings: number;
}

export const CLIENTS_REPORT_COLUMNS: ReportColumn[] = [
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone" },
  { key: "tier", label: "Tier" },
  { key: "source", label: "Source" },
  { key: "ltvSAR", label: "Lifetime Value (SAR)" },
  { key: "bookings", label: "Bookings" },
];

export interface ClientsReportFilter {
  from: Date;
  to?: Date;
}

/**
 * One row per client whose most recent COMPLETED visit (`lastVisitAt`, as
 * computed by crm/clients.ts's listClients) falls in [from, to). `to` is
 * optional -- when omitted the range is open-ended above `from`. A client
 * with no COMPLETED visit at all never appears, since they have no date to
 * attribute them to this range. `ltvSAR`/`bookings` are the client's full
 * lifetime totals (not scoped to the range), matching crm/ltv.ts and
 * crm/clients.ts.
 */
export async function clientsReport(filter: ClientsReportFilter): Promise<ReportResult<ClientsReportRow>> {
  const clients = await listClients();
  const rows: ClientsReportRow[] = clients
    .filter((c) => {
      if (!c.lastVisitAt) return false;
      if (c.lastVisitAt < filter.from) return false;
      if (filter.to && c.lastVisitAt >= filter.to) return false;
      return true;
    })
    .map((c) => ({
      name: c.fullName,
      phone: c.phone ?? "",
      tier: c.tierName ?? "",
      source: c.source ?? "",
      ltvSAR: toSarString(c.ltvMinor),
      bookings: c.bookingCount,
    }));
  return { columns: CLIENTS_REPORT_COLUMNS, rows };
}

// ---- Marketing report --------------------------------------------------------

export interface MarketingReportRow {
  channel: string;
  acquisitions: number;
  spendSAR: string;
  cacSAR: string;
  revenueSAR: string;
}

export const MARKETING_REPORT_COLUMNS: ReportColumn[] = [
  { key: "channel", label: "Channel" },
  { key: "acquisitions", label: "Acquisitions" },
  { key: "spendSAR", label: "Spend (SAR)" },
  { key: "cacSAR", label: "CAC (SAR)" },
  { key: "revenueSAR", label: "Revenue (SAR)" },
];

export interface MarketingReportFilter {
  from: Date;
  to: Date;
}

/** Per-channel spend/CAC/revenue for [from, to) -- a thin reshape of crm/marketing.ts's channelPerformance. */
export async function marketingReport(filter: MarketingReportFilter): Promise<ReportResult<MarketingReportRow>> {
  const performance = await channelPerformance(filter);
  const rows: MarketingReportRow[] = performance.map((p) => ({
    channel: p.channel,
    acquisitions: p.acquisitions,
    spendSAR: toSarString(p.spendMinor),
    cacSAR: toSarString(p.cacMinor),
    revenueSAR: toSarString(p.revenueMinor),
  }));
  return { columns: MARKETING_REPORT_COLUMNS, rows };
}

// ---- Shared entry point (admin page + CSV export route) --------------------

export const REPORT_TYPES = ["bookings", "revenue", "clients", "marketing"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export interface RunReportParams {
  type: ReportType;
  from: Date;
  to: Date;
  status?: BookingStatus;
}

// Each report row type has only ever-present, plain (string/number/enum)
// properties, so it's always a safe structural match for
// Record<string, unknown> -- this cast just spells that out for TS, which
// doesn't treat "no index signature" as automatically compatible.
function asRecordResult<T extends object>(result: ReportResult<T>): ReportResult<Record<string, unknown>> {
  return result as unknown as ReportResult<Record<string, unknown>>;
}

/**
 * Single dispatch point used by both `/admin/reports` (the table) and
 * `/admin/reports/export` (the CSV) so they can never drift into rendering
 * different data for "the same" report. Returns rows as plain
 * `Record<string, unknown>` so callers don't need a type switch per report.
 */
export async function runReport({ type, from, to, status }: RunReportParams): Promise<ReportResult<Record<string, unknown>>> {
  switch (type) {
    case "bookings":
      return asRecordResult(await bookingsReport({ from, to, status }));
    case "revenue":
      return asRecordResult(await revenueReport({ from, to }));
    case "clients":
      return asRecordResult(await clientsReport({ from, to }));
    case "marketing":
      return asRecordResult(await marketingReport({ from, to }));
  }
}
