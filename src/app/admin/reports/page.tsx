import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { ReportTable } from "./ReportTable";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { centerLocalToUtc } from "@/modules/booking/availability";
import { runReport, REPORT_TYPES, type ReportType } from "@/modules/reports/reports";
import { resolveReportDateRange } from "@/modules/reports/dateRange";
import type { BookingStatus } from "@prisma/client";

interface ReportsPageProps {
  searchParams: Promise<{ type?: string; from?: string; to?: string; status?: string }>;
}

const REPORT_LABELS: Record<ReportType, string> = {
  bookings: "Bookings",
  revenue: "Revenue",
  clients: "Customers",
  marketing: "Marketing",
  channels: "Channels",
};

const BOOKING_STATUSES: BookingStatus[] = ["REQUESTED", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED", "NO_SHOW"];

function isReportType(value: string | undefined): value is ReportType {
  return !!value && (REPORT_TYPES as readonly string[]).includes(value);
}

function isBookingStatus(value: string): value is BookingStatus {
  return (BOOKING_STATUSES as readonly string[]).includes(value);
}

const inputClass =
  "w-full rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const user = await requireAdmin(PERMISSIONS.ANALYTICS_VIEW);
  const params = await searchParams;

  const type: ReportType = isReportType(params.type) ? params.type : "bookings";
  // `from`/`to` are user-suppliable query params (a bookmarked or crafted
  // link) and are NOT validated before this point -- resolveReportDateRange
  // is what keeps a malformed value like `?from=not-a-date` from reaching
  // centerLocalToUtc (which throws on anything but "YYYY-MM-DD") and 500ing
  // the page; it falls back to the current month-to-date range instead.
  const { fromISO, toISO } = resolveReportDateRange(params.from, params.to);
  const statusParam = params.status?.trim() ?? "";
  const status = type === "bookings" && isBookingStatus(statusParam) ? statusParam : undefined;

  // Both ends are inclusive from the picker's point of view: `to` names the
  // last day to include, so the exclusive upper bound passed to the report
  // functions is the start of the day AFTER `toISO` (same convention as the
  // Business/Marketing dashboards' "month to date" ranges).
  const from = centerLocalToUtc(fromISO, 0);
  const to = centerLocalToUtc(toISO, 1440);

  const { columns, rows } = await runReport({ type, from, to, status });

  const exportParams = new URLSearchParams({ type, from: fromISO, to: toISO });
  if (status) exportParams.set("status", status);

  return (
    <AdminShell
      user={user}
      title="Report Center"
      description="Pick a report and a date range, review it below, then export the same data as CSV."
      actions={
        <a
          href={`/admin/reports/export?${exportParams.toString()}`}
          data-testid="export-csv-link"
          className="lunia-btn lunia-btn-primary"
        >
          Export CSV
        </a>
      }
    >
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3" data-testid="reports-filter-form">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">Report</span>
          <select name="type" defaultValue={type} className={inputClass}>
            {REPORT_TYPES.map((reportType) => (
              <option key={reportType} value={reportType}>
                {REPORT_LABELS[reportType]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">From</span>
          <input type="date" name="from" defaultValue={fromISO} className={inputClass} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">To</span>
          <input type="date" name="to" defaultValue={toISO} className={inputClass} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">Status (bookings only)</span>
          <select name="status" defaultValue={status ?? ""} className={inputClass}>
            <option value="">All statuses</option>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" className="lunia-btn lunia-btn-primary">
          Run report
        </button>
      </form>

      <p className="mb-2 text-sm text-[var(--color-ink)]/60" data-testid="reports-row-count">
        {rows.length} row{rows.length === 1 ? "" : "s"} for {fromISO} to {toISO}
      </p>

      <ReportTable columns={columns} rows={rows} />
    </AdminShell>
  );
}
