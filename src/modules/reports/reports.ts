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

import { flowMetrics } from "@/modules/booking/journey";
import { prisma } from "@/lib/db";
import type { BookingStatus } from "@prisma/client";
import { listBookings } from "@/modules/booking/bookings";
import { bookingStats } from "@/modules/booking/stats";
import { utcToCenterLocal } from "@/modules/booking/availability";
import { listClients } from "@/modules/crm/clients";
import { channelPerformance } from "@/modules/crm/marketing";
import { testClientIds } from "@/modules/crm/testCustomers";
import { staffPerformanceReport, retentionReport } from "./teamReports";

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

// Columns that reveal a colleague's pay. Stripped unless the viewer has HR.
const PAY_COLUMNS = new Set(["commissionSAR"]);

function withoutPay(result: ReportResult<Record<string, unknown>>): ReportResult<Record<string, unknown>> {
  if (!result.columns.some((c) => PAY_COLUMNS.has(c.key))) return result;
  return {
    columns: result.columns.filter((c) => !PAY_COLUMNS.has(c.key)),
    rows: result.rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !PAY_COLUMNS.has(k)))),
  };
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
  const excluded = await testClientIds();
  const bookings = (await listBookings({ from: filter.from, to: filter.to, status: filter.status })).filter(
    (b) => !excluded.has(b.clientProfileId),
  );
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
  const [clients, excluded] = await Promise.all([listClients(), testClientIds()]);
  const rows: ClientsReportRow[] = clients
    .filter((c) => {
      if (excluded.has(c.clientProfileId)) return false;
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

// ---- Visit flow report (docs/PRD-visit-journey.md) --------------------------

export interface FlowReportRow {
  specialist: string;
  visits: number;
  avgWaitMin: string;
  avgOverrunMin: string;
}

export const FLOW_REPORT_COLUMNS: ReportColumn[] = [
  { key: "specialist", label: "Specialist" },
  { key: "visits", label: "Visits" },
  { key: "avgWaitMin", label: "Average wait (min)" },
  { key: "avgOverrunMin", label: "Average overrun (min)" },
];

const minText = (n: number | null) => (n === null ? "" : String(n));

/** Wait and overrun per specialist for arrivals in [from, to), with an "Everyone" total row first. */
export async function flowReport(filter: { from: Date; to: Date }): Promise<ReportResult<FlowReportRow>> {
  const m = await flowMetrics(filter.from, filter.to);
  if (m.visits === 0) return { columns: FLOW_REPORT_COLUMNS, rows: [] };
  const rows: FlowReportRow[] = [
    { specialist: "Everyone", visits: m.visits, avgWaitMin: minText(m.avgWaitMin), avgOverrunMin: minText(m.avgOverrunMin) },
    ...m.byStaff.map((s) => ({ specialist: s.name, visits: s.visits, avgWaitMin: minText(s.avgWaitMin), avgOverrunMin: minText(s.avgOverrunMin) })),
  ];
  return { columns: FLOW_REPORT_COLUMNS, rows };
}

// ---- Discounts report (docs/PRD-commission-discounts-roles.md §3.2) -------

export interface DiscountReportRow {
  date: string;
  customer: string;
  item: string;
  givenBy: string;
  amountSAR: string;
  percent: string;
  reason: string;
  status: string;
  decidedBy: string;
  invoice: string;
}

export const DISCOUNT_REPORT_COLUMNS: ReportColumn[] = [
  { key: "date", label: "Date" },
  { key: "customer", label: "Customer" },
  { key: "item", label: "Service" },
  { key: "givenBy", label: "Given by" },
  { key: "amountSAR", label: "Amount (SAR)" },
  { key: "percent", label: "%" },
  { key: "reason", label: "Reason" },
  { key: "status", label: "Status" },
  { key: "decidedBy", label: "Approved by" },
  { key: "invoice", label: "Invoice" },
];

/**
 * Every discount in [from, to): specialist discounts (with who asked, who
 * approved and why) and front-desk discounts on issued invoices.
 */
export async function discountsReport(filter: { from: Date; to: Date }): Promise<ReportResult<DiscountReportRow>> {
  const day = (d: Date) => utcToCenterLocal(d).dateISO;
  const [specialist, invoices] = await Promise.all([
    prisma.appointmentDiscount.findMany({
      where: { createdAt: { gte: filter.from, lt: filter.to } },
      orderBy: { createdAt: "asc" },
      include: { appointment: { select: { service: { select: { nameEn: true } }, booking: { select: { client: { select: { fullName: true } } } } } } },
    }),
    prisma.invoice.findMany({
      where: { kind: "INVOICE", status: { notIn: ["DRAFT", "VOID"] }, issuedAt: { gte: filter.from, lt: filter.to } },
      select: { number: true, issuedAt: true, customerName: true, discountMinor: true, createdById: true, lines: { where: { discountMinor: { gt: 0 } }, select: { description: true, discountMinor: true } } },
    }),
  ]);
  const people = [...new Set([...specialist.flatMap((d) => [d.requestedById, d.decidedById]), ...invoices.map((i) => i.createdById)].filter((x): x is string => !!x))];
  const names = new Map((await prisma.staffProfile.findMany({ where: { userId: { in: people } }, select: { userId: true, fullName: true } })).map((p) => [p.userId, p.fullName]));
  const numberById = new Map((await prisma.invoice.findMany({ where: { id: { in: specialist.map((d) => d.invoiceId).filter((x): x is string => !!x) } }, select: { id: true, number: true } })).map((i) => [i.id, i.number]));
  const specialistInvoices = new Set(numberById.values());
  const rows: DiscountReportRow[] = specialist.map((d) => ({
    date: day(d.createdAt),
    customer: d.appointment.booking.client.fullName,
    item: d.appointment.service.nameEn,
    givenBy: names.get(d.requestedById) ?? "",
    amountSAR: toSarString(d.amountMinor),
    percent: (d.pctBp / 100).toFixed(1),
    reason: d.reason,
    status: d.status === "APPLIED" ? (d.decidedById && d.decidedById !== d.requestedById ? "Approved" : "Applied") : d.status === "PENDING" ? "Waiting for approval" : "Declined",
    decidedBy: d.decidedById && d.decidedById !== d.requestedById ? names.get(d.decidedById) ?? "" : "",
    invoice: d.invoiceId ? numberById.get(d.invoiceId) ?? "" : "",
  }));
  for (const inv of invoices) {
    if (specialistInvoices.has(inv.number)) continue; // already listed through the specialist's discount
    const parts = [...inv.lines.map((l) => ({ item: l.description, minor: l.discountMinor })), ...(inv.discountMinor > 0 ? [{ item: "Whole invoice", minor: inv.discountMinor }] : [])];
    for (const p of parts) {
      rows.push({
        date: day(inv.issuedAt!), customer: inv.customerName, item: p.item, givenBy: (inv.createdById && names.get(inv.createdById)) || "Front desk",
        amountSAR: toSarString(p.minor), percent: "", reason: "", status: "Front desk", decidedBy: "", invoice: inv.number,
      });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return { columns: DISCOUNT_REPORT_COLUMNS, rows };
}

// ---- Shared entry point (admin page + CSV export route) --------------------

export const REPORT_TYPES = ["bookings", "revenue", "clients", "marketing", "staff", "retention", "flow", "discounts"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export interface RunReportParams {
  type: ReportType;
  from: Date;
  to: Date;
  status?: BookingStatus;
  /** Team pay figures (commission) — only for HR/owner. Hidden unless true. */
  showPay?: boolean;
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
export async function runReport(params: RunReportParams): Promise<ReportResult<Record<string, unknown>>> {
  const result = await runReportUnfiltered(params);
  return params.showPay ? result : withoutPay(result);
}

async function runReportUnfiltered({ type, from, to, status }: RunReportParams): Promise<ReportResult<Record<string, unknown>>> {
  switch (type) {
    case "bookings":
      return asRecordResult(await bookingsReport({ from, to, status }));
    case "revenue":
      return asRecordResult(await revenueReport({ from, to }));
    case "clients":
      return asRecordResult(await clientsReport({ from, to }));
    case "marketing":
      return asRecordResult(await marketingReport({ from, to }));
    case "staff":
      return asRecordResult(await staffPerformanceReport({ from, to }));
    case "retention":
      return asRecordResult(await retentionReport({ from, to }));
    case "flow":
      return asRecordResult(await flowReport({ from, to }));
    case "discounts":
      return asRecordResult(await discountsReport({ from, to }));
  }
}
